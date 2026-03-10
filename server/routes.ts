import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireRole } from "./auth";
import { seedDatabase } from "./seed";
import { db } from "./db";
import { verifyFirebaseToken } from "./firebase-admin";
import {
  insertCustomerSchema, insertProductSchema, insertWoodTypeSchema,
  insertDoorTypeSchema, insertQuotationSchema, insertContractSchema,
  insertPaymentSchema, insertInvoiceSchema, insertUserSchema,
  insertCompanySettingsSchema, insertWorkOrderSchema, insertProductionStageSchema,
  insertDesignAssignmentSchema, insertWarrantySchema,
  productionStages,
} from "@shared/schema";

async function requirePortalAuth(req: Request, res: Response, next: NextFunction) {
  const session = req.session as any;
  if (session?.portalCustomerId && session?.portalPhone) {
    const customer = await storage.getCustomerByPhone(session.portalPhone);
    if (customer) {
      (req as any).portalCustomer = customer;
      (req as any).portalPhone = session.portalPhone;
      return next();
    }
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const result = await verifyFirebaseToken(token);
    if (result?.phone) {
      let normalizedPhone = result.phone.replace(/[^\d+]/g, "");
      if (normalizedPhone.startsWith("+966")) normalizedPhone = "0" + normalizedPhone.substring(4);
      else if (normalizedPhone.startsWith("00966")) normalizedPhone = "0" + normalizedPhone.substring(5);
      else if (normalizedPhone.startsWith("966")) normalizedPhone = "0" + normalizedPhone.substring(3);
      const customer = await storage.getCustomerByPhone(normalizedPhone);
      if (customer) {
        (req as any).portalCustomer = customer;
        (req as any).portalPhone = normalizedPhone;
        return next();
      }
    }
  }

  return res.status(401).json({ message: "غير مصرح", messageEn: "Unauthorized" });
}

function generateQRData(invoice: any): string {
  function tlvEncode(tag: number, value: string): Buffer {
    const valueBytes = Buffer.from(value, "utf8");
    return Buffer.concat([
      Buffer.from([tag]),
      Buffer.from([valueBytes.length]),
      valueBytes,
    ]);
  }

  const timestamp = invoice.issuedAt
    ? new Date(invoice.issuedAt).toISOString()
    : new Date().toISOString();

  const tlvBuffers = [
    tlvEncode(1, invoice.sellerName),
    tlvEncode(2, invoice.sellerVatNumber),
    tlvEncode(3, timestamp),
    tlvEncode(4, String(invoice.totalWithVat)),
    tlvEncode(5, String(invoice.vatAmount)),
  ];

  return Buffer.concat(tlvBuffers).toString("base64");
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  await seedDatabase();

  app.get("/api/products/public", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const productsList = await storage.getProducts(category);
      res.json(productsList);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب المنتجات" });
    }
  });

  app.get("/api/wood-types/public", async (_req, res) => {
    try {
      const types = await storage.getWoodTypes();
      res.json(types);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/door-types/public", async (_req, res) => {
    try {
      const types = await storage.getDoorTypes();
      res.json(types);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/quote-product-categories", async (_req, res) => {
    try {
      const categories = await storage.getQuoteProductCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post("/api/quote-product-categories", requireRole("owner", "assistant", "it"), async (req, res) => {
    try {
      const { nameAr, nameEn, active, sortOrder } = req.body;
      if (!nameAr || !nameEn) return res.status(400).json({ message: "nameAr and nameEn are required" });
      const cat = await storage.createQuoteProductCategory({ nameAr, nameEn, active: active ?? true, sortOrder: sortOrder ?? 0 });
      res.status(201).json(cat);
    } catch (error) {
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  app.patch("/api/quote-product-categories/:id", requireRole("owner", "assistant", "it"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateQuoteProductCategory(id, req.body);
      if (!updated) return res.status(404).json({ message: "Category not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  app.delete("/api/quote-product-categories/:id", requireRole("owner", "assistant", "it"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteQuoteProductCategory(id);
      if (!deleted) return res.status(404).json({ message: "Category not found" });
      res.json({ message: "Deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  app.post("/api/quote-request", async (req, res) => {
    try {
      const { fullName, phone, city, productInterest } = req.body;
      if (!fullName || !phone) {
        return res.status(400).json({
          message: "الاسم ورقم الجوال مطلوبان",
          messageEn: "Name and phone are required",
        });
      }
      const namePattern = /^[\u0600-\u06FF\u0750-\u077Fa-zA-Z\s\-']+$/;
      if (!namePattern.test(fullName)) {
        return res.status(400).json({ message: "الاسم يجب أن يحتوي على حروف فقط", messageEn: "Name must contain letters only" });
      }
      const normalizedPhone = phone.replace(/\D/g, "");
      if (!/^05\d{8}$/.test(normalizedPhone)) {
        return res.status(400).json({ message: "رقم جوال غير صحيح", messageEn: "Invalid phone number" });
      }
      let productLabel = "";
      if (productInterest) {
        const categories = await storage.getQuoteProductCategories();
        const cat = categories.find(c => c.id === parseInt(productInterest));
        productLabel = cat ? `${cat.nameAr} / ${cat.nameEn}` : productInterest;
      }
      let customer;
      const existing = await storage.getCustomerByPhone(normalizedPhone);
      if (existing) {
        customer = existing;
      } else {
        customer = await storage.createCustomer({
          fullName,
          phone: normalizedPhone,
          city,
          source: "website",
          notes: productLabel ? `اهتمام: ${productLabel}` : "",
        });
      }

      const items = productLabel ? [{ description: productLabel, quantity: 1, unitPrice: 0, amount: 0 }] : [];
      const quotation = await storage.createQuotation({
        customerId: customer.id,
        items,
        subtotal: "0",
        vatRate: "15",
        vatAmount: "0",
        totalPrice: "0",
        finalPrice: "0",
        status: "requested",
        notes: [
          productLabel ? `المنتج: ${productLabel}` : "",
          city ? `المدينة: ${city}` : "",
        ].filter(Boolean).join(" | ") || "طلب عرض سعر من الموقع",
      });

      const staffUsers = (await storage.getUsers()).filter(u => ["owner", "assistant", "sales"].includes(u.role));
      for (const staff of staffUsers) {
        await storage.createNotification({
          userId: staff.id,
          titleAr: "طلب عرض سعر جديد",
          titleEn: "New Quote Request",
          messageAr: `طلب عرض سعر من ${fullName} - ${phone}${productLabel ? ` - ${productLabel}` : ""}`,
          messageEn: `Quote request from ${fullName} - ${phone}${productLabel ? ` - ${productLabel}` : ""}`,
          type: "action",
          relatedEntity: "customer",
          relatedId: customer.id,
          isRead: false,
        });
      }

      res.status(201).json({ message: "تم إرسال طلبك بنجاح", customer, quotation });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في إرسال الطلب" });
    }
  });

  app.get("/api/track-order", async (req, res) => {
    try {
      const { contractNumber, phone } = req.query;
      if (!contractNumber || !phone) {
        return res.status(400).json({ message: "يرجى إدخال رقم العقد ورقم الجوال", messageEn: "Contract number and phone required" });
      }

      const contracts = await storage.getContracts();
      const contract = contracts.find(c => c.contractNumber === contractNumber);
      if (!contract) {
        return res.status(404).json({ message: "لم يتم العثور على العقد", messageEn: "Contract not found" });
      }

      const customer = contract.customerId ? await storage.getCustomer(contract.customerId) : null;
      const normalizePhone = (p: string) => p.replace(/[\s\-\+]/g, "").replace(/^00966/, "0").replace(/^966/, "0");
      const customerPhone = customer?.phone ? normalizePhone(customer.phone) : "";
      const inputPhone = normalizePhone(phone as string);
      if (!customer || !customerPhone || customerPhone !== inputPhone) {
        return res.status(404).json({ message: "رقم الجوال لا يتطابق مع العقد", messageEn: "Phone does not match contract" });
      }

      const workOrders = (await storage.getWorkOrders()).filter(wo => wo.contractId === contract.id);

      res.json({
        contractNumber: contract.contractNumber,
        customerName: customer.fullName,
        status: contract.status,
        workOrders: workOrders.map(wo => ({
          orderNumber: wo.orderNumber,
          status: wo.status,
          dueDate: wo.dueDate,
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ", messageEn: "Error" });
    }
  });

  app.get("/api/company-settings/public", async (_req, res) => {
    try {
      const settings = await storage.getCompanySettings();
      if (!settings) {
        return res.status(404).json({ message: "لم يتم العثور على إعدادات الشركة" });
      }
      const { id, ...publicSettings } = settings;
      res.json(publicSettings);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/invoices/:id/verify", async (req, res) => {
    try {
      const invoice = await storage.getInvoice(parseInt(req.params.id));
      if (!invoice) {
        return res.status(404).json({
          verified: false,
          message: "الفاتورة غير موجودة",
          messageEn: "Invoice not found",
        });
      }
      res.json({
        verified: true,
        invoiceNumber: invoice.invoiceNumber,
        type: invoice.type,
        sellerName: invoice.sellerName,
        sellerVatNumber: invoice.sellerVatNumber,
        buyerName: invoice.buyerName,
        subtotal: invoice.subtotal,
        vatAmount: invoice.vatAmount,
        totalWithVat: invoice.totalWithVat,
        issuedAt: invoice.issuedAt,
        status: invoice.status,
        message: "فاتورة صحيحة وصادرة من مصنع تيك للمنتجات الخشبية",
        messageEn: "Valid invoice issued by Teak Wood Products Factory",
      });
    } catch (error) {
      res.status(500).json({ verified: false, message: "حدث خطأ في التحقق" });
    }
  });

  app.get("/api/users", requireAuth, async (_req, res) => {
    try {
      const allUsers = await storage.getUsers();
      const safeUsers = allUsers.map(({ password, ...u }) => ({
        id: u.id, username: u.username, fullNameAr: u.fullNameAr,
        fullNameEn: u.fullNameEn, role: u.role, phone: u.phone,
      }));
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/users", requireRole("owner", "it"), async (req, res) => {
    try {
      const { hashPassword } = await import("./auth");
      const data = req.body;
      data.password = await hashPassword(data.password);
      const user = await storage.createUser(data);
      const { password, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(409).json({
          message: "اسم المستخدم موجود مسبقاً",
          messageEn: "Username already exists",
        });
      }
      res.status(500).json({ message: "حدث خطأ في إنشاء المستخدم" });
    }
  });

  app.patch("/api/users/:id", requireRole("owner", "it"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = req.body;
      if (data.password) {
        const { hashPassword } = await import("./auth");
        data.password = await hashPassword(data.password);
      }
      const updated = await storage.updateUser(id, data);
      if (!updated) return res.status(404).json({ message: "المستخدم غير موجود" });
      const { password, ...safeUser } = updated;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.patch("/api/users/profile/me", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { profileImage, currentPassword, newPassword } = req.body;
      const updateData: any = {};

      if (profileImage !== undefined) {
        updateData.profileImage = profileImage;
      }

      if (newPassword) {
        if (!currentPassword) {
          return res.status(400).json({ message: "كلمة المرور الحالية مطلوبة" });
        }
        const user = await storage.getUser(userId);
        if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });

        const { comparePasswords, hashPassword } = await import("./auth");
        const valid = await comparePasswords(currentPassword, user.password);
        if (!valid) {
          return res.status(400).json({ message: "كلمة المرور الحالية غير صحيحة" });
        }
        updateData.password = await hashPassword(newPassword);
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "لا توجد بيانات للتحديث" });
      }

      const updated = await storage.updateUser(userId, updateData);
      if (!updated) return res.status(404).json({ message: "المستخدم غير موجود" });
      const { password, ...safeUser } = updated;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/customers", requireAuth, async (_req, res) => {
    try {
      const list = await storage.getCustomers();
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/customers/:id", requireAuth, async (req, res) => {
    try {
      const customer = await storage.getCustomer(parseInt(req.params.id));
      if (!customer) return res.status(404).json({ message: "العميل غير موجود" });
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/customers", requireRole("owner", "assistant", "sales", "customer_service"), async (req, res) => {
    try {
      const customer = await storage.createCustomer({ ...req.body, createdBy: req.session.userId });
      res.status(201).json(customer);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في إنشاء العميل" });
    }
  });

  app.patch("/api/customers/:id", requireRole("owner", "assistant", "sales", "customer_service"), async (req, res) => {
    try {
      const updated = await storage.updateCustomer(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "العميل غير موجود" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/products", requireAuth, async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const productsList = await storage.getProducts(category);
      res.json(productsList);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/products", requireRole("owner", "it"), async (req, res) => {
    try {
      const product = await storage.createProduct(req.body);
      res.status(201).json(product);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.patch("/api/products/:id", requireRole("owner", "it"), async (req, res) => {
    try {
      const updated = await storage.updateProduct(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "المنتج غير موجود" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/wood-types", requireAuth, async (_req, res) => {
    try {
      res.json(await storage.getWoodTypes());
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/wood-types", requireRole("owner", "it"), async (req, res) => {
    try {
      res.status(201).json(await storage.createWoodType(req.body));
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/door-types", requireAuth, async (_req, res) => {
    try {
      res.json(await storage.getDoorTypes());
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/door-types", requireRole("owner", "it"), async (req, res) => {
    try {
      res.status(201).json(await storage.createDoorType(req.body));
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/quotations", requireAuth, async (_req, res) => {
    try {
      res.json(await storage.getQuotations());
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/quotations/:id", requireAuth, async (req, res) => {
    try {
      const quotation = await storage.getQuotation(parseInt(req.params.id));
      if (!quotation) return res.status(404).json({ message: "عرض السعر غير موجود" });
      res.json(quotation);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/customers/:id/quotations", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getQuotationsByCustomer(parseInt(req.params.id)));
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/quotations", requireRole("owner", "assistant", "sales"), async (req, res) => {
    try {
      const data = { ...req.body, createdBy: req.session.userId };
      const quotation = await storage.createQuotation(data);

      const settings = await storage.getCompanySettings();
      if (settings) {
        const customer = await storage.getCustomer(quotation.customerId);
        await storage.createInvoice({
          contractId: null,
          customerId: quotation.customerId,
          paymentStage: null,
          type: "quotation",
          items: quotation.items,
          subtotal: quotation.subtotal,
          vatRate: quotation.vatRate,
          vatAmount: quotation.vatAmount,
          totalWithVat: quotation.totalPrice,
          sellerName: settings.nameAr,
          sellerVatNumber: settings.vatNumber,
          sellerAddress: settings.address,
          buyerName: customer?.fullName || "",
          buyerPhone: customer?.phone,
          status: "draft",
          createdBy: req.session.userId,
        });
      }

      res.status(201).json(quotation);
    } catch (error) {
      console.error("Create quotation error:", error);
      res.status(500).json({ message: "حدث خطأ في إنشاء عرض السعر" });
    }
  });

  app.patch("/api/quotations/:id", requireRole("owner", "assistant", "sales"), async (req, res) => {
    try {
      const data = { ...req.body };
      if (data.assignedTo) {
        const existing = await storage.getQuotation(parseInt(req.params.id));
        if (existing && existing.assignedTo !== data.assignedTo) {
          data.assignedAt = new Date();
        }
      }
      delete data.id;
      delete data.createdAt;
      const updated = await storage.updateQuotation(parseInt(req.params.id), data);
      if (!updated) return res.status(404).json({ message: "عرض السعر غير موجود" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/quotations/:id/approve", requireRole("owner", "assistant"), async (req, res) => {
    try {
      const updated = await storage.updateQuotation(parseInt(req.params.id), { status: "approved" });
      if (!updated) return res.status(404).json({ message: "عرض السعر غير موجود" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/quotations/:id/reject", requireRole("owner", "assistant"), async (req, res) => {
    try {
      const updated = await storage.updateQuotation(parseInt(req.params.id), { status: "rejected" });
      if (!updated) return res.status(404).json({ message: "عرض السعر غير موجود" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/contracts", requireAuth, async (_req, res) => {
    try {
      res.json(await storage.getContracts());
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/contracts/:id", requireAuth, async (req, res) => {
    try {
      const contract = await storage.getContract(parseInt(req.params.id));
      if (!contract) return res.status(404).json({ message: "العقد غير موجود" });
      res.json(contract);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/customers/:id/contracts", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getContractsByCustomer(parseInt(req.params.id)));
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/contracts", requireRole("owner", "assistant", "sales"), async (req, res) => {
    try {
      const data = { ...req.body, createdBy: req.session.userId };
      const contract = await storage.createContract(data);
      res.status(201).json(contract);
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(409).json({ message: "رقم العقد موجود مسبقاً" });
      }
      res.status(500).json({ message: "حدث خطأ في إنشاء العقد" });
    }
  });

  app.patch("/api/contracts/:id", requireRole("owner", "assistant", "sales", "accountant"), async (req, res) => {
    try {
      const updated = await storage.updateContract(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "العقد غير موجود" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/payments", requireAuth, async (_req, res) => {
    try {
      res.json(await storage.getPayments());
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/contracts/:id/payments", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getPaymentsByContract(parseInt(req.params.id)));
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/customers/:id/payments", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getPaymentsByCustomer(parseInt(req.params.id)));
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/payments", requireRole("owner", "assistant", "sales", "accountant"), async (req, res) => {
    try {
      const data = { ...req.body, recordedBy: req.session.userId };
      const payment = await storage.createPayment(data);

      const contract = await storage.getContract(payment.contractId);
      if (contract) {
        const newPaidAmount = parseFloat(contract.paidAmount) + parseFloat(payment.amount);
        const newRemaining = parseFloat(contract.totalAmount) - newPaidAmount;
        await storage.updateContract(contract.id, {
          paidAmount: String(newPaidAmount),
          remainingAmount: String(newRemaining),
          status: newRemaining <= 0 ? "completed" : "active",
        });
      }

      const settings = await storage.getCompanySettings();
      const customer = await storage.getCustomer(payment.customerId);
      if (settings && customer) {
        const invoiceData: any = {
          contractId: payment.contractId,
          customerId: payment.customerId,
          paymentStage: payment.paymentStage,
          type: "simplified_tax_invoice",
          items: [{ description: `دفعة - ${payment.paymentStage}`, amount: payment.amount }],
          subtotal: String(parseFloat(payment.amount) / 1.15),
          vatRate: "15",
          vatAmount: String(parseFloat(payment.amount) - parseFloat(payment.amount) / 1.15),
          totalWithVat: payment.amount,
          sellerName: settings.nameAr,
          sellerVatNumber: settings.vatNumber,
          sellerAddress: settings.address,
          buyerName: customer.fullName,
          buyerPhone: customer.phone,
          paymentMethod: payment.method === "bank_transfer" ? "تحويل بنكي" : payment.method === "cash" ? "نقدي" : "بطاقة",
          status: "paid",
          issuedAt: new Date(),
          paidAt: new Date(),
          createdBy: req.session.userId,
        };

        invoiceData.qrCodeData = generateQRData(invoiceData);
        const invoice = await storage.createInvoice(invoiceData);

        await storage.createPayment({
          ...data,
          invoiceId: invoice.id,
        }).catch(() => {});
      }

      res.status(201).json(payment);
    } catch (error) {
      console.error("Payment error:", error);
      res.status(500).json({ message: "حدث خطأ في تسجيل الدفعة" });
    }
  });

  app.get("/api/invoices", requireAuth, async (_req, res) => {
    try {
      res.json(await storage.getInvoices());
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/invoices/:id", requireAuth, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(parseInt(req.params.id));
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/customers/:id/invoices", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getInvoicesByCustomer(parseInt(req.params.id)));
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/company-settings", requireAuth, async (_req, res) => {
    try {
      const settings = await storage.getCompanySettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.put("/api/company-settings", requireRole("owner", "it"), async (req, res) => {
    try {
      const settings = await storage.upsertCompanySettings(req.body);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifs = await storage.getNotifications(req.session.userId!);
      res.json(notifs);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.patch("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      const notifs = await storage.getNotifications(req.session.userId!);
      await Promise.all(notifs.filter(n => !n.isRead).map(n => storage.markNotificationRead(n.id)));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markNotificationRead(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/activity-logs", requireRole("owner", "assistant", "it"), async (_req, res) => {
    try {
      res.json(await storage.getActivityLogs(100));
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/dashboard/stats", requireAuth, async (_req, res) => {
    try {
      const [customersList, quotationsList, contractsList, paymentsList, workOrdersList, inventoryList, employeesList, deliveriesList, maintenanceList, qualityList] = await Promise.all([
        storage.getCustomers(),
        storage.getQuotations(),
        storage.getContracts(),
        storage.getPayments(),
        storage.getWorkOrders(),
        storage.getInventory(),
        storage.getEmployees(),
        storage.getDeliveries(),
        storage.getMaintenanceRequests(),
        storage.getQualityChecks(),
      ]);

      const totalRevenue = paymentsList.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const activeContracts = contractsList.filter(c => c.status === "active").length;
      const pendingQuotations = quotationsList.filter(q => q.status === "draft" || q.status === "sent").length;
      const newOrders = quotationsList.filter(q => q.status === "requested" || (q.status === "draft" && !q.assignedTo)).length;
      const inProductionOrders = workOrdersList.filter(w => w.status === "in_production").length;

      const lowStockItems = inventoryList.filter(i =>
        parseFloat(i.quantity?.toString() || "0") <= parseFloat(i.minQuantity?.toString() || "0") && parseFloat(i.minQuantity?.toString() || "0") > 0
      ).length;

      const activeEmployees = employeesList.filter(e => e.status === "active").length;
      const saudiEmployees = employeesList.filter(e => e.nationality === "saudi" && e.status === "active").length;
      const totalSalaries = employeesList.filter(e => e.status === "active").reduce((sum, e) => sum + parseFloat(e.monthlySalary?.toString() || "0"), 0);

      const pendingDeliveries = deliveriesList.filter(d => d.status === "scheduled" || d.status === "in_transit").length;
      const pendingMaintenance = maintenanceList.filter(m => m.status === "pending" || m.status === "scheduled").length;
      const qualityPassRate = qualityList.length > 0 ? Math.round((qualityList.filter(q => q.result === "pass").length / qualityList.length) * 100) : 0;

      const woByStatus = {
        pending: workOrdersList.filter(w => w.status === "pending").length,
        in_production: inProductionOrders,
        quality_check: workOrdersList.filter(w => w.status === "quality_check").length,
        ready: workOrdersList.filter(w => w.status === "ready").length,
        completed: workOrdersList.filter(w => ["completed", "delivered", "installed"].includes(w.status)).length,
      };

      const paymentsByStage = {
        deposit: paymentsList.filter(p => p.paymentStage === "deposit").reduce((s, p) => s + parseFloat(p.amount), 0),
        pre_manufacturing: paymentsList.filter(p => p.paymentStage === "pre_manufacturing").reduce((s, p) => s + parseFloat(p.amount), 0),
        delivery: paymentsList.filter(p => p.paymentStage === "delivery").reduce((s, p) => s + parseFloat(p.amount), 0),
        final: paymentsList.filter(p => p.paymentStage === "final").reduce((s, p) => s + parseFloat(p.amount), 0),
      };

      const recentPayments = paymentsList
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 5)
        .map(p => ({
          id: p.id,
          amount: p.amount,
          stage: p.paymentStage,
          method: p.method,
          date: p.createdAt,
          customerName: customersList.find(c => c.id === p.customerId)?.fullName || "",
        }));

      res.json({
        totalCustomers: customersList.length,
        totalQuotations: quotationsList.length,
        totalContracts: contractsList.length,
        activeContracts,
        pendingQuotations,
        newOrders,
        totalRevenue,
        totalPayments: paymentsList.length,
        totalWorkOrders: workOrdersList.length,
        inProductionOrders,
        lowStockItems,
        totalInventoryItems: inventoryList.length,
        activeEmployees,
        saudiEmployees,
        residentEmployees: activeEmployees - saudiEmployees,
        totalSalaries,
        pendingDeliveries,
        pendingMaintenance,
        qualityPassRate,
        totalQualityChecks: qualityList.length,
        woByStatus,
        paymentsByStage,
        recentPayments,
      });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ==================== WORK ORDERS ====================

  app.get("/api/work-orders", requireAuth, requireRole("owner", "assistant", "production", "designer", "sales"), async (req, res) => {
    try {
      const allOrders = await storage.getWorkOrders();
      const status = req.query.status as string | undefined;
      const filtered = status ? allOrders.filter(wo => wo.status === status) : allOrders;
      res.json(filtered);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب أوامر العمل", messageEn: "Error fetching work orders" });
    }
  });

  app.get("/api/work-orders/:id", requireAuth, requireRole("owner", "assistant", "production", "designer", "sales"), async (req, res) => {
    try {
      const wo = await storage.getWorkOrder(parseInt(req.params.id));
      if (!wo) return res.status(404).json({ message: "أمر العمل غير موجود", messageEn: "Work order not found" });
      res.json(wo);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/work-orders", requireAuth, requireRole("owner", "assistant", "production", "sales"), async (req, res) => {
    try {
      const data = insertWorkOrderSchema.parse({
        ...req.body,
        createdBy: req.session.userId,
      });
      const wo = await storage.createWorkOrder(data);

      const stages = ["cutting", "edging", "assembly", "finishing"] as const;
      for (const stage of stages) {
        await storage.createProductionStage({
          workOrderId: wo.id,
          stage,
          status: "pending",
        });
      }

      res.status(201).json(wo);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "بيانات غير صالحة", messageEn: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "حدث خطأ في إنشاء أمر العمل", messageEn: "Error creating work order" });
    }
  });

  app.patch("/api/work-orders/:id", requireAuth, requireRole("owner", "assistant", "production"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getWorkOrder(id);
      if (!existing) return res.status(404).json({ message: "أمر العمل غير موجود", messageEn: "Work order not found" });

      const updated = await storage.updateWorkOrder(id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في تحديث أمر العمل", messageEn: "Error updating work order" });
    }
  });

  // ==================== PRODUCTION STAGES ====================

  app.get("/api/work-orders/:id/stages", requireAuth, requireRole("owner", "assistant", "production", "designer", "quality"), async (req, res) => {
    try {
      const stages = await storage.getProductionStages(parseInt(req.params.id));
      res.json(stages);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.patch("/api/production-stages/:id", requireAuth, requireRole("owner", "assistant", "production"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData: any = { ...req.body };

      if (updateData.status === "in_progress" && !updateData.startedAt) {
        updateData.startedAt = new Date();
      }
      if (updateData.status === "completed" && !updateData.completedAt) {
        updateData.completedAt = new Date();
      }

      const updated = await storage.updateProductionStage(id, updateData);
      if (!updated) return res.status(404).json({ message: "مرحلة الإنتاج غير موجودة", messageEn: "Production stage not found" });

      if (updated.status === "completed") {
        const allStages = await storage.getProductionStages(updated.workOrderId);
        const allCompleted = allStages.every(s => s.status === "completed");
        if (allCompleted) {
          await storage.updateWorkOrder(updated.workOrderId, { status: "quality_check" });
        }
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في تحديث مرحلة الإنتاج", messageEn: "Error updating production stage" });
    }
  });

  // ==================== INVENTORY ====================

  app.get("/api/inventory", requireRole("owner", "assistant", "warehouse", "purchasing", "production"), async (_req, res) => {
    try {
      const items = await storage.getInventory();
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب المخزون", messageEn: "Error fetching inventory" });
    }
  });

  app.get("/api/inventory/:id", requireRole("owner", "assistant", "warehouse", "purchasing", "production"), async (req, res) => {
    try {
      const item = await storage.getInventoryItem(parseInt(req.params.id));
      if (!item) return res.status(404).json({ message: "المادة غير موجودة", messageEn: "Item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ", messageEn: "Error" });
    }
  });

  app.post("/api/inventory", requireRole("owner", "assistant", "warehouse"), async (req, res) => {
    try {
      const { insertInventorySchema } = await import("@shared/schema");
      const parsed = insertInventorySchema.parse(req.body);
      const item = await storage.createInventoryItem(parsed);
      res.status(201).json(item);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "بيانات غير صالحة", messageEn: "Invalid data", errors: error.errors });
      res.status(500).json({ message: "حدث خطأ في إضافة المادة", messageEn: "Error creating inventory item" });
    }
  });

  app.patch("/api/inventory/:id", requireRole("owner", "assistant", "warehouse"), async (req, res) => {
    try {
      const updated = await storage.updateInventoryItem(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "المادة غير موجودة", messageEn: "Item not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في تحديث المادة", messageEn: "Error updating inventory item" });
    }
  });

  app.get("/api/inventory-transactions", requireRole("owner", "assistant", "warehouse", "purchasing"), async (req, res) => {
    try {
      const inventoryId = req.query.inventoryId ? parseInt(req.query.inventoryId as string) : undefined;
      const transactions = await storage.getInventoryTransactions(inventoryId);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching transactions" });
    }
  });

  app.post("/api/inventory-transactions", requireRole("owner", "assistant", "warehouse"), async (req, res) => {
    try {
      const { inventoryId, type, quantity, reason, workOrderId, purchaseOrderId } = req.body;
      if (!inventoryId || !type || !quantity) {
        return res.status(400).json({ message: "بيانات ناقصة", messageEn: "Missing required fields" });
      }
      const txQty = parseFloat(quantity);
      if (txQty <= 0) return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر", messageEn: "Quantity must be greater than zero" });

      const item = await storage.getInventoryItem(inventoryId);
      if (!item) return res.status(404).json({ message: "المادة غير موجودة", messageEn: "Inventory item not found" });

      const currentQty = parseFloat(item.quantity?.toString() || "0");
      if (type === "stock_out" && txQty > currentQty) {
        return res.status(400).json({ message: `الكمية المتوفرة (${currentQty}) غير كافية`, messageEn: `Insufficient stock (${currentQty} available)` });
      }

      const tx = await storage.createInventoryTransaction({ inventoryId, type, quantity, reason, workOrderId, purchaseOrderId, performedBy: req.session.userId });

      let newQty = currentQty;
      if (type === "stock_in") newQty = currentQty + txQty;
      else if (type === "stock_out") newQty = currentQty - txQty;
      else newQty = txQty;
      await storage.updateInventoryItem(inventoryId, { quantity: newQty.toString() });

      res.status(201).json(tx);
    } catch (error) {
      console.error("Inventory transaction error:", error);
      res.status(500).json({ message: "حدث خطأ في تسجيل الحركة", messageEn: "Error recording transaction" });
    }
  });

  // ==================== SUPPLIERS ====================

  app.get("/api/suppliers", requireRole("owner", "assistant", "warehouse", "purchasing"), async (_req, res) => {
    try {
      const list = await storage.getSuppliers();
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب الموردين", messageEn: "Error fetching suppliers" });
    }
  });

  app.get("/api/suppliers/:id", requireRole("owner", "assistant", "warehouse", "purchasing"), async (req, res) => {
    try {
      const s = await storage.getSupplier(parseInt(req.params.id));
      if (!s) return res.status(404).json({ message: "المورد غير موجود", messageEn: "Supplier not found" });
      res.json(s);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ", messageEn: "Error" });
    }
  });

  app.post("/api/suppliers", requireRole("owner", "assistant", "purchasing"), async (req, res) => {
    try {
      const { insertSupplierSchema } = await import("@shared/schema");
      const parsed = insertSupplierSchema.parse(req.body);
      const supplier = await storage.createSupplier(parsed);
      res.status(201).json(supplier);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "بيانات غير صالحة", messageEn: "Invalid data", errors: error.errors });
      res.status(500).json({ message: "حدث خطأ في إضافة المورد", messageEn: "Error creating supplier" });
    }
  });

  app.patch("/api/suppliers/:id", requireRole("owner", "assistant", "purchasing"), async (req, res) => {
    try {
      const updated = await storage.updateSupplier(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "المورد غير موجود", messageEn: "Supplier not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في تحديث المورد", messageEn: "Error updating supplier" });
    }
  });

  // ==================== PURCHASE ORDERS ====================

  app.get("/api/purchase-orders", requireRole("owner", "assistant", "purchasing", "warehouse"), async (_req, res) => {
    try {
      const list = await storage.getPurchaseOrders();
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب أوامر الشراء", messageEn: "Error fetching purchase orders" });
    }
  });

  app.get("/api/purchase-orders/:id", requireRole("owner", "assistant", "purchasing", "warehouse"), async (req, res) => {
    try {
      const po = await storage.getPurchaseOrder(parseInt(req.params.id));
      if (!po) return res.status(404).json({ message: "أمر الشراء غير موجود", messageEn: "Purchase order not found" });
      res.json(po);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ", messageEn: "Error" });
    }
  });

  app.post("/api/purchase-orders", requireRole("owner", "assistant", "purchasing"), async (req, res) => {
    try {
      const po = await storage.createPurchaseOrder({ ...req.body, createdBy: req.session.userId });
      res.status(201).json(po);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في إنشاء أمر الشراء", messageEn: "Error creating purchase order" });
    }
  });

  app.patch("/api/purchase-orders/:id", requireRole("owner", "assistant", "purchasing"), async (req, res) => {
    try {
      const data = { ...req.body };
      if (data.status === "approved") data.approvedBy = req.session.userId;
      const updated = await storage.updatePurchaseOrder(parseInt(req.params.id), data);
      if (!updated) return res.status(404).json({ message: "أمر الشراء غير موجود", messageEn: "Purchase order not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في تحديث أمر الشراء", messageEn: "Error updating purchase order" });
    }
  });

  // ==================== EMPLOYEES ====================

  app.get("/api/employees", requireRole("owner", "assistant", "hr"), async (_req, res) => {
    try {
      const list = await storage.getEmployees();
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب الموظفين", messageEn: "Error fetching employees" });
    }
  });

  app.get("/api/employees/:id", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const emp = await storage.getEmployee(parseInt(req.params.id));
      if (!emp) return res.status(404).json({ message: "الموظف غير موجود", messageEn: "Employee not found" });
      res.json(emp);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ", messageEn: "Error" });
    }
  });

  app.post("/api/employees", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const { insertEmployeeSchema } = await import("@shared/schema");
      const parsed = insertEmployeeSchema.parse(req.body);
      const emp = await storage.createEmployee(parsed);
      res.status(201).json(emp);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "بيانات غير صالحة", messageEn: "Invalid data", errors: error.errors });
      console.error("Employee creation error:", error);
      res.status(500).json({ message: "حدث خطأ في إضافة الموظف", messageEn: "Error creating employee" });
    }
  });

  app.patch("/api/employees/:id", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const updated = await storage.updateEmployee(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "الموظف غير موجود", messageEn: "Employee not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في تحديث الموظف", messageEn: "Error updating employee" });
    }
  });

  // ==================== DELIVERIES ====================

  app.get("/api/deliveries", requireRole("owner", "assistant", "delivery", "production"), async (_req, res) => {
    try { res.json(await storage.getDeliveries()); }
    catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching deliveries" }); }
  });

  app.post("/api/deliveries", requireRole("owner", "assistant", "delivery", "production"), async (req, res) => {
    try { res.status(201).json(await storage.createDelivery(req.body)); }
    catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error creating delivery" }); }
  });

  app.patch("/api/deliveries/:id", requireRole("owner", "assistant", "delivery"), async (req, res) => {
    try {
      const updated = await storage.updateDelivery(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "غير موجود", messageEn: "Not found" });
      res.json(updated);
    } catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error updating delivery" }); }
  });

  // ==================== INSTALLATIONS ====================

  app.get("/api/installations", requireRole("owner", "assistant", "installation"), async (_req, res) => {
    try { res.json(await storage.getInstallations()); }
    catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching installations" }); }
  });

  app.post("/api/installations", requireRole("owner", "assistant", "installation"), async (req, res) => {
    try { res.status(201).json(await storage.createInstallation(req.body)); }
    catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error creating installation" }); }
  });

  app.patch("/api/installations/:id", requireRole("owner", "assistant", "installation"), async (req, res) => {
    try {
      const updated = await storage.updateInstallation(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "غير موجود", messageEn: "Not found" });
      res.json(updated);
    } catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error updating installation" }); }
  });

  app.post("/api/installations/:id/complete-with-warranty", requireRole("owner", "assistant", "installation"), async (req, res) => {
    try {
      const installationId = parseInt(req.params.id);
      const allInstallations = await storage.getInstallations();
      const installation = allInstallations.find(i => i.id === installationId);
      if (!installation) {
        return res.status(404).json({ message: "التركيب غير موجود", messageEn: "Installation not found" });
      }

      const updatedInstallation = await storage.updateInstallation(installationId, {
        status: "completed",
        completedDate: new Date().toISOString().split("T")[0],
      });

      const workOrder = await storage.getWorkOrder(installation.workOrderId);
      if (!workOrder) {
        return res.status(404).json({ message: "أمر العمل غير موجود", messageEn: "Work order not found" });
      }

      const today = new Date();
      const warrantyEnd = new Date(today);
      warrantyEnd.setFullYear(warrantyEnd.getFullYear() + 2);

      const warranty = await storage.createWarranty({
        contractId: workOrder.contractId,
        workOrderId: workOrder.id,
        customerId: workOrder.customerId,
        startDate: today.toISOString().split("T")[0],
        endDate: warrantyEnd.toISOString().split("T")[0],
        terms: "ضمان سنتين على التركيب والتصنيع - Two year warranty on installation and manufacturing",
        status: "active",
      });

      const customer = await storage.getCustomer(workOrder.customerId);
      const allUsers = await storage.getUsers();
      const csUsers = allUsers.filter(u => ["owner", "assistant", "customer_service"].includes(u.role));
      for (const csUser of csUsers) {
        await storage.createNotification({
          userId: csUser.id,
          type: "success",
          titleAr: "تم إكمال التركيب وإنشاء الضمان",
          titleEn: "Installation Completed & Warranty Created",
          messageAr: `تم إكمال تركيب الطلب للعميل ${customer?.fullName || ""} وتم إنشاء ضمان تلقائي`,
          messageEn: `Installation completed for customer ${customer?.fullName || ""} and warranty auto-created`,
          relatedEntity: "warranty",
          relatedId: warranty.id,
          isRead: false,
        });
      }

      const customerUsers = allUsers.filter(u => u.role === "customer" && u.phone === customer?.phone);
      for (const cu of customerUsers) {
        await storage.createNotification({
          userId: cu.id,
          type: "success",
          titleAr: "تم إكمال التركيب وتفعيل الضمان",
          titleEn: "Installation Completed & Warranty Activated",
          messageAr: "تم إكمال تركيب طلبكم بنجاح وتم تفعيل الضمان لمدة سنتين",
          messageEn: "Your installation has been completed successfully and a 2-year warranty has been activated",
          relatedEntity: "warranty",
          relatedId: warranty.id,
          isRead: false,
        });
      }

      await storage.updateWorkOrder(workOrder.id, { status: "installed" });

      res.json({
        message: "تم إكمال التركيب وإنشاء الضمان بنجاح",
        messageEn: "Installation completed and warranty created successfully",
        installation: updatedInstallation,
        warranty,
      });
    } catch (error) {
      console.error("Complete installation with warranty error:", error);
      res.status(500).json({ message: "حدث خطأ", messageEn: "Error completing installation" });
    }
  });

  // ==================== MAINTENANCE REQUESTS ====================

  app.get("/api/maintenance-requests", requireRole("owner", "assistant", "installation", "customer_service"), async (_req, res) => {
    try { res.json(await storage.getMaintenanceRequests()); }
    catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching maintenance requests" }); }
  });

  app.post("/api/maintenance-requests", requireRole("owner", "assistant", "installation", "customer_service"), async (req, res) => {
    try { res.status(201).json(await storage.createMaintenanceRequest(req.body)); }
    catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error creating maintenance request" }); }
  });

  app.patch("/api/maintenance-requests/:id", requireRole("owner", "assistant", "installation"), async (req, res) => {
    try {
      const updated = await storage.updateMaintenanceRequest(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "غير موجود", messageEn: "Not found" });
      res.json(updated);
    } catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error updating maintenance request" }); }
  });

  // ==================== QUALITY CHECKS ====================

  app.get("/api/quality-checks", requireRole("owner", "assistant", "quality", "production"), async (_req, res) => {
    try { res.json(await storage.getQualityChecks()); }
    catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching quality checks" }); }
  });

  app.post("/api/quality-checks", requireRole("owner", "assistant", "quality"), async (req, res) => {
    try {
      const data = { ...req.body, checkedBy: req.session.userId };
      res.status(201).json(await storage.createQualityCheck(data));
    } catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error creating quality check" }); }
  });

  // ==================== DESIGN ASSIGNMENTS ====================

  app.get("/api/design-assignments", requireRole("owner", "assistant", "sales", "designer"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (user?.role === "designer") {
        res.json(await storage.getDesignAssignmentsByDesigner(userId));
      } else {
        res.json(await storage.getDesignAssignments());
      }
    } catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching design assignments" }); }
  });

  app.get("/api/design-assignments/:id", requireRole("owner", "assistant", "sales", "designer"), async (req, res) => {
    try {
      const da = await storage.getDesignAssignment(parseInt(req.params.id));
      if (!da) return res.status(404).json({ message: "غير موجود", messageEn: "Not found" });
      res.json(da);
    } catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching design assignment" }); }
  });

  app.get("/api/design-assignments/customer/:customerId", requireRole("owner", "assistant", "sales", "designer"), async (req, res) => {
    try {
      res.json(await storage.getDesignAssignmentsByCustomer(parseInt(req.params.customerId)));
    } catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching design assignments" }); }
  });

  app.get("/api/design-assignments/quotation/:quotationId", requireRole("owner", "assistant", "sales", "designer"), async (req, res) => {
    try {
      const quotationId = parseInt(req.params.quotationId);
      const all = await storage.getDesignAssignments();
      const existing = all.find((da: any) => da.quotationId === quotationId);
      if (existing) return res.json(existing);
      const quotation = await storage.getQuotation(quotationId);
      if (!quotation) return res.status(404).json({ message: "عرض السعر غير موجود", messageEn: "Quotation not found" });
      const created = await storage.createDesignAssignment({
        customerId: quotation.customerId,
        quotationId: quotationId,
        assignedTo: quotation.assignedTo || req.session.userId!,
        status: "pending",
        createdBy: req.session.userId!,
        productDescription: quotation.notes || "",
      });
      res.status(201).json(created);
    } catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error" }); }
  });

  app.post("/api/design-assignments", requireRole("owner", "assistant", "sales"), async (req, res) => {
    try {
      const data = { ...req.body, createdBy: req.session.userId };
      const created = await storage.createDesignAssignment(data);
      const designer = await storage.getUser(data.assignedTo);
      if (designer) {
        await storage.createNotification({
          userId: data.assignedTo,
          type: "action",
          titleAr: "طلب تصميم جديد",
          titleEn: "New Design Assignment",
          messageAr: "تم تحويل طلب تصميم جديد إليك",
          messageEn: "A new design assignment has been assigned to you",
          link: "/designer-board",
        });
      }
      res.status(201).json(created);
    } catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error creating design assignment" }); }
  });

  app.patch("/api/design-assignments/:id", requireRole("owner", "assistant", "sales", "designer"), async (req, res) => {
    try {
      const da = await storage.getDesignAssignment(parseInt(req.params.id));
      if (!da) return res.status(404).json({ message: "غير موجود", messageEn: "Not found" });
      const user = await storage.getUser(req.session.userId!);
      if (user && !["owner", "assistant"].includes(user.role) && da.assignedTo !== req.session.userId && da.createdBy !== req.session.userId) {
        return res.status(403).json({ message: "غير مصرح", messageEn: "Not authorized" });
      }
      const updated = await storage.updateDesignAssignment(da.id, req.body);
      if (!updated) return res.status(404).json({ message: "غير موجود", messageEn: "Not found" });
      res.json(updated);
    } catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error updating design assignment" }); }
  });

  app.post("/api/design-assignments/:id/submit", requireRole("owner", "assistant", "designer"), async (req, res) => {
    try {
      const da = await storage.getDesignAssignment(parseInt(req.params.id));
      if (!da) return res.status(404).json({ message: "غير موجود", messageEn: "Not found" });
      const updated = await storage.updateDesignAssignment(da.id, { status: "completed" });
      if (da.createdBy) {
        await storage.createNotification({
          userId: da.createdBy,
          type: "success",
          titleAr: "التصميم جاهز",
          titleEn: "Design Completed",
          messageAr: "تم إكمال التصميم وجاهز لإنشاء عرض السعر",
          messageEn: "Design is completed and ready for quotation",
          link: "/quotations",
        });
      }
      res.json(updated);
    } catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error submitting design" }); }
  });

  // ==================== QUOTE REQUESTS (customers from website without quotation) ====================

  app.get("/api/quote-requests", requireRole("owner", "assistant", "sales"), async (req, res) => {
    try {
      const allCustomers = await storage.getCustomers();
      const allQuotations = await storage.getQuotations();
      const allDesignAssignments = await storage.getDesignAssignments();
      const customerIdsWithQuotation = new Set(allQuotations.map(q => q.customerId));
      const customerIdsWithDesign = new Set(allDesignAssignments.map(d => d.customerId));
      const requests = allCustomers.filter(c =>
        c.source === "website" &&
        !customerIdsWithQuotation.has(c.id) &&
        !customerIdsWithDesign.has(c.id)
      );
      res.json(requests);
    } catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching quote requests" }); }
  });

  // ==================== WARRANTIES ====================

  app.get("/api/warranties", requireRole("owner", "assistant", "sales", "installation"), async (_req, res) => {
    try { res.json(await storage.getWarranties()); }
    catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching warranties" }); }
  });

  app.get("/api/warranties/:id", requireRole("owner", "assistant", "sales", "installation"), async (req, res) => {
    try {
      const w = await storage.getWarranty(parseInt(req.params.id));
      if (!w) return res.status(404).json({ message: "غير موجود", messageEn: "Not found" });
      res.json(w);
    } catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching warranty" }); }
  });

  app.post("/api/warranties", requireRole("owner", "assistant", "installation"), async (req, res) => {
    try { res.status(201).json(await storage.createWarranty(req.body)); }
    catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error creating warranty" }); }
  });

  // ==================== CUSTOMER PORTAL ====================

  function normalizePhone(phone: string): string {
    let cleaned = phone.replace(/[^\d+]/g, "");
    if (cleaned.startsWith("+966")) cleaned = "0" + cleaned.substring(4);
    else if (cleaned.startsWith("00966")) cleaned = "0" + cleaned.substring(5);
    else if (cleaned.startsWith("966")) cleaned = "0" + cleaned.substring(3);
    else if (cleaned.startsWith("5")) cleaned = "0" + cleaned;
    return cleaned;
  }

  app.post("/api/customer-auth/verify-phone", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ message: "رقم الجوال مطلوب", messageEn: "Phone number is required" });
      const customer = await storage.getCustomerByPhone(phone);
      if (!customer) return res.status(404).json({ message: "لم يتم العثور على حساب بهذا الرقم", messageEn: "No account found with this phone number" });
      res.json({ customerId: customer.id, name: customer.fullName });
    } catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error verifying phone" }); }
  });

  app.post("/api/customer-auth/firebase-verify", async (req, res) => {
    try {
      const { idToken } = req.body;
      if (!idToken) return res.status(400).json({ message: "التوكن مطلوب", messageEn: "ID token is required" });

      const decoded = await verifyFirebaseToken(idToken);
      if (!decoded || !decoded.phone) {
        return res.status(401).json({ message: "فشل التحقق من التوكن", messageEn: "Token verification failed" });
      }

      const normalized = normalizePhone(decoded.phone);
      const customer = await storage.getCustomerByPhone(normalized);
      if (!customer) {
        return res.status(404).json({
          message: "لم يتم العثور على حساب مرتبط بهذا الرقم. تواصل مع فريق تيك لتسجيل حسابك",
          messageEn: "No account found with this phone number. Contact Teak team to register",
        });
      }

      (req.session as any).portalPhone = normalized;
      (req.session as any).portalCustomerId = customer.id;
      (req.session as any).portalCustomerName = customer.fullName;

      res.json({
        success: true,
        customerId: customer.id,
        name: customer.fullName,
      });
    } catch (error) {
      console.error("Firebase verify error:", error);
      res.status(500).json({ message: "حدث خطأ في التحقق", messageEn: "Error verifying token" });
    }
  });

  app.get("/api/customer-portal/my-data", requirePortalAuth, async (req, res) => {
    try {
      const customer = (req as any).portalCustomer;
      const [quotationsList, contractsList, paymentsList, invoicesList, designsList, warrantiesList, maintenanceList] = await Promise.all([
        storage.getQuotationsByCustomer(customer.id),
        storage.getContractsByCustomer(customer.id),
        storage.getPaymentsByCustomer(customer.id),
        storage.getInvoicesByCustomer(customer.id),
        storage.getDesignAssignmentsByCustomer(customer.id),
        storage.getWarrantiesByCustomer(customer.id),
        storage.getMaintenanceRequests(),
      ]);
      const customerMaintenance = maintenanceList.filter((m: any) => m.customerId === customer.id);
      const workOrderIds = contractsList.map(c => c.id);
      const allWorkOrders = await storage.getWorkOrders();
      const customerWorkOrders = allWorkOrders.filter((wo: any) => workOrderIds.includes(wo.contractId));
      const productionData = await Promise.all(
        customerWorkOrders.map(async (wo: any) => ({
          workOrder: wo,
          stages: await storage.getProductionStages(wo.id),
        }))
      );
      res.json({
        customer,
        quotations: quotationsList,
        contracts: contractsList,
        payments: paymentsList,
        invoices: invoicesList,
        designs: designsList,
        warranties: warrantiesList,
        maintenance: customerMaintenance,
        production: productionData,
      });
    } catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching customer data" }); }
  });

  app.post("/api/customer-portal/approve-quotation/:id", requirePortalAuth, async (req, res) => {
    try {
      const customer = (req as any).portalCustomer;
      const quotation = await storage.getQuotation(parseInt(req.params.id));
      if (!quotation) return res.status(404).json({ message: "عرض السعر غير موجود", messageEn: "Quotation not found" });
      if (quotation.customerId !== customer.id) return res.status(403).json({ message: "غير مصرح", messageEn: "Unauthorized" });

      if (quotation.status === "approved") {
        const existingContracts = await storage.getContractsByCustomer(customer.id);
        const existingContract = existingContracts.find((c: any) => c.quotationId === quotation.id);
        return res.json({ message: "عرض السعر معتمد مسبقاً", messageEn: "Quotation already approved", contract: existingContract });
      }

      const updatedQuotation = await storage.updateQuotation(quotation.id, { status: "approved" });

      const contractNumber = `CNT-${Date.now().toString(36).toUpperCase()}`;
      const contract = await storage.createContract({
        contractNumber,
        quotationId: quotation.id,
        customerId: customer.id,
        totalAmount: quotation.totalWithVat || quotation.total || "0",
        status: "active",
        terms: "تم الاعتماد عبر بوابة العميل",
      });

      const existingInvoices = await storage.getInvoicesByCustomer(customer.id);
      const quotInvoice = existingInvoices.find((inv: any) => inv.quotationId === quotation.id);
      if (quotInvoice) {
        await storage.updateInvoice(quotInvoice.id, {
          type: "simplified_tax_invoice",
          status: "issued",
          contractId: contract.id,
          issuedAt: new Date(),
        });
      } else {
        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
        const settings = await storage.getCompanySettings();
        const qrData = generateQRData({
          sellerName: settings?.nameAr || "تيك للتصنيع",
          sellerVatNumber: settings?.vatNumber || "310012345600003",
          issuedAt: new Date(),
          totalWithVat: quotation.totalWithVat || quotation.total,
          vatAmount: quotation.vatAmount || "0",
        });
        await storage.createInvoice({
          invoiceNumber,
          type: "simplified_tax_invoice",
          status: "issued",
          customerId: customer.id,
          contractId: contract.id,
          quotationId: quotation.id,
          items: Array.isArray(quotation.items) ? quotation.items : [],
          subtotal: quotation.subtotal || quotation.total || "0",
          vatRate: "15",
          vatAmount: quotation.vatAmount || "0",
          totalWithVat: quotation.totalWithVat || quotation.total || "0",
          sellerName: settings?.nameAr || "تيك للتصنيع",
          sellerVatNumber: settings?.vatNumber || "310012345600003",
          sellerAddress: settings?.address || "",
          buyerName: customer.fullName,
          buyerPhone: customer.phone,
          qrCodeData: qrData,
          issuedAt: new Date(),
        });
      }

      const salesUsers = await storage.getUsers();
      const salesStaff = salesUsers.filter((u: any) => ["owner", "assistant", "sales", "accountant"].includes(u.role));
      for (const staff of salesStaff) {
        await storage.createNotification({
          userId: staff.id,
          type: "success",
          titleAr: "عميل اعتمد عرض سعر",
          titleEn: "Customer Approved Quotation",
          messageAr: `العميل ${customer.fullName} اعتمد عرض السعر رقم ${quotation.id}`,
          messageEn: `Customer ${customer.fullName} approved quotation #${quotation.id}`,
          link: "/quotations",
        });
      }

      res.json({ message: "تم اعتماد عرض السعر بنجاح", messageEn: "Quotation approved successfully", contract });
    } catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error approving quotation" }); }
  });

  app.post("/api/customer-portal/upload-receipt", requirePortalAuth, async (req, res) => {
    try {
      const customer = (req as any).portalCustomer;
      const { contractId, amount, receiptImage, paymentMethod, notes } = req.body;

      const payment = await storage.createPayment({
        contractId: contractId || null,
        customerId: customer.id,
        amount: amount || "0",
        method: paymentMethod || "bank_transfer",
        stage: "deposit",
        notes: notes || "تم رفع الوصل من بوابة العميل",
        receiptImage: receiptImage || null,
        recordedBy: null,
      });

      const salesUsers = await storage.getUsers();
      const relevantStaff = salesUsers.filter((u: any) => ["owner", "assistant", "sales", "accountant"].includes(u.role));
      for (const staff of relevantStaff) {
        await storage.createNotification({
          userId: staff.id,
          type: "action",
          titleAr: "وصل دفع جديد من العميل",
          titleEn: "New Payment Receipt from Customer",
          messageAr: `العميل ${customer.fullName} رفع وصل دفع بمبلغ ${amount}`,
          messageEn: `Customer ${customer.fullName} uploaded payment receipt of ${amount}`,
          link: "/payments",
        });
      }

      res.json({ message: "تم رفع الوصل بنجاح", messageEn: "Receipt uploaded successfully", payment });
    } catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error uploading receipt" }); }
  });

  app.post("/api/customer-portal/maintenance-request", requirePortalAuth, async (req, res) => {
    try {
      const customer = (req as any).portalCustomer;
      const { description, images, contractId } = req.body;

      if (!contractId) {
        return res.status(400).json({ message: "يجب اختيار المنتج", messageEn: "Product/contract selection required" });
      }

      const contract = await storage.getContract(contractId);
      if (!contract || contract.customerId !== customer.id) {
        return res.status(403).json({ message: "غير مصرح", messageEn: "Unauthorized - contract not found or not yours" });
      }

      const workOrders = await storage.getWorkOrders();
      const contractWO = workOrders.find((wo: any) => wo.contractId === contract.id);
      if (!contractWO || !["delivered", "installed", "completed"].includes(contractWO.status)) {
        return res.status(400).json({ message: "لا يمكن تقديم طلب صيانة قبل استلام المنتج", messageEn: "Cannot request maintenance before product delivery" });
      }

      const maintenanceReq = await storage.createMaintenanceRequest({
        customerId: customer.id,
        contractId: contractId,
        description: description || "",
        mediaUrls: images || [],
        status: "pending",
      });

      const installStaff = await storage.getUsers();
      const relevantStaff = installStaff.filter((u: any) => ["owner", "assistant", "installation", "customer_service"].includes(u.role));
      for (const staff of relevantStaff) {
        await storage.createNotification({
          userId: staff.id,
          type: "action",
          titleAr: "طلب صيانة جديد",
          titleEn: "New Maintenance Request",
          messageAr: `العميل ${customer.fullName} قدم طلب صيانة`,
          messageEn: `Customer ${customer.fullName} submitted a maintenance request`,
          link: "/installations",
        });
      }

      res.json({ message: "تم تقديم طلب الصيانة بنجاح", messageEn: "Maintenance request submitted successfully", request: maintenanceReq });
    } catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error creating maintenance request" }); }
  });

  app.get("/api/customer-portal/invoices/:id", requirePortalAuth, async (req, res) => {
    try {
      const customer = (req as any).portalCustomer;
      const invoice = await storage.getInvoice(parseInt(req.params.id));
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة", messageEn: "Invoice not found" });
      if (invoice.customerId !== customer.id) return res.status(403).json({ message: "غير مصرح", messageEn: "Unauthorized" });
      res.json(invoice);
    } catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching invoice" }); }
  });

  // ==================== PRODUCTION-WAREHOUSE LINK ====================

  app.post("/api/production-stages/:id/upload-photo", requireRole("owner", "assistant", "production"), async (req, res) => {
    try {
      const stageId = parseInt(req.params.id);
      const { imageUrl } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ message: "رابط الصورة مطلوب", messageEn: "Image URL is required" });
      }
      const existingStage = await db.select().from(productionStages).where(eq(productionStages.id, stageId));
      if (!existingStage.length) {
        return res.status(404).json({ message: "مرحلة الإنتاج غير موجودة", messageEn: "Production stage not found" });
      }
      const stage = existingStage[0];
      const currentImages: string[] = (stage as any).progressImages || [];
      const updatedImages = [...currentImages, imageUrl];
      await db.update(productionStages).set({ progressImages: updatedImages } as any).where(eq(productionStages.id, stageId));
      const [updated] = await db.select().from(productionStages).where(eq(productionStages.id, stageId));
      res.json(updated);
    } catch (error) {
      console.error("Upload photo error:", error);
      res.status(500).json({ message: "حدث خطأ في رفع الصورة", messageEn: "Error uploading photo" });
    }
  });

  app.post("/api/work-orders/:id/create-material-request", requireRole("owner", "assistant", "production", "warehouse"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      const workOrder = await storage.getWorkOrder(workOrderId);
      if (!workOrder) {
        return res.status(404).json({ message: "أمر العمل غير موجود", messageEn: "Work order not found" });
      }
      const { items } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "يجب تحديد المواد المطلوبة", messageEn: "Materials list is required" });
      }
      const transactions = [];
      for (const item of items) {
        const { inventoryId, quantity, reason } = item;
        if (!inventoryId || !quantity) {
          return res.status(400).json({ message: "معرف المادة والكمية مطلوبان", messageEn: "Inventory ID and quantity are required" });
        }
        const inventoryItem = await storage.getInventoryItem(inventoryId);
        if (!inventoryItem) {
          return res.status(404).json({ message: `المادة رقم ${inventoryId} غير موجودة`, messageEn: `Inventory item ${inventoryId} not found` });
        }
        const tx = await storage.createInventoryTransaction({
          inventoryId,
          type: "stock_out",
          quantity: String(quantity),
          reason: reason || `طلب مواد لأمر العمل #${workOrder.orderNumber}`,
          workOrderId,
          performedBy: req.session.userId!,
        });
        const newQty = parseFloat(inventoryItem.quantity) - parseFloat(String(quantity));
        await storage.updateInventoryItem(inventoryId, { quantity: String(Math.max(0, newQty)) });
        transactions.push(tx);
      }
      res.status(201).json({ message: "تم إنشاء طلب المواد بنجاح", messageEn: "Material request created successfully", transactions });
    } catch (error) {
      console.error("Material request error:", error);
      res.status(500).json({ message: "حدث خطأ في إنشاء طلب المواد", messageEn: "Error creating material request" });
    }
  });

  return httpServer;
}
