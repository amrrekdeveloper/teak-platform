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
        status: "open",
        city: city || null,
        notes: [
          productLabel ? `المنتج: ${productLabel}` : "",
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

  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      const allUsers = await storage.getUsers();
      const currentUser = req.session.userId ? await storage.getUser(req.session.userId) : null;
      const isAdmin = ["owner", "it"].includes(currentUser?.role || "");
      const visibleUsers = isAdmin ? allUsers : allUsers.filter(u => u.active !== false);
      const safeUsers = visibleUsers.map(({ password, ...u }) => {
        if (isAdmin) return u;
        return { id: u.id, username: u.username, fullNameAr: u.fullNameAr, fullNameEn: u.fullNameEn, role: u.role, active: u.active };
      });
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
      const { profileImage, currentPassword, newPassword, fullNameAr, fullNameEn, phone, email } = req.body;
      const updateData: any = {};

      if (profileImage !== undefined) updateData.profileImage = profileImage;
      if (fullNameAr !== undefined) updateData.fullNameAr = fullNameAr;
      if (fullNameEn !== undefined) updateData.fullNameEn = fullNameEn;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) updateData.email = email;

      if (newPassword) {
        if (!currentPassword) {
          return res.status(400).json({ message: "كلمة المرور الحالية مطلوبة", messageEn: "Current password is required" });
        }
        const user = await storage.getUser(userId);
        if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });

        const { comparePasswords, hashPassword } = await import("./auth");
        const valid = await comparePasswords(currentPassword, user.password);
        if (!valid) {
          return res.status(400).json({ message: "كلمة المرور الحالية غير صحيحة", messageEn: "Current password is incorrect" });
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

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { username } = req.body;
      if (!username) return res.status(400).json({ message: "اسم المستخدم مطلوب", messageEn: "Username is required" });
      const genericResponse = { message: "إذا كان الحساب موجوداً، سيتم التواصل معك قريباً", messageEn: "If the account exists, you will be contacted soon." };
      const user = await storage.getUserByUsername(username);
      if (!user) return res.json(genericResponse);
      await storage.createPasswordResetRequest({ userId: user.id, status: "pending" });
      res.json(genericResponse);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/users/reset-requests", requireRole("owner", "it"), async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const requests = await storage.getPasswordResetRequests(status);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.patch("/api/users/reset-requests/:id/resolve", requireRole("owner", "it"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { newPassword } = req.body;
      if (!newPassword) return res.status(400).json({ message: "كلمة المرور الجديدة مطلوبة" });
      const requests = await storage.getPasswordResetRequests("pending");
      const request = requests.find(r => r.id === id);
      if (!request) return res.status(404).json({ message: "الطلب غير موجود أو تم حله مسبقاً" });
      const { hashPassword } = await import("./auth");
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(request.userId, { password: hashed });
      const updated = await storage.resolvePasswordResetRequest(id, req.session.userId!);
      if (!updated) return res.status(404).json({ message: "الطلب غير موجود" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/customers", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).session.userId!;
      const user = await storage.getUser(userId);
      const isManager = user?.role === "owner" || user?.role === "assistant" || user?.role === "it" || user?.role === "accountant" || user?.role === "customer_service";
      if (isManager) {
        res.json(await storage.getCustomers());
      } else {
        const allQuotations = await storage.getQuotations();
        const myQuotations = allQuotations.filter((q: any) => q.assignedTo === userId);
        const myCustomerIds = [...new Set(myQuotations.map((q: any) => q.customerId).filter(Boolean))];
        const allCustomers = await storage.getCustomers();
        res.json(allCustomers.filter((c: any) => myCustomerIds.includes(c.id)));
      }
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

  app.get("/api/adeko-products", requireAuth, async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const groupCode = req.query.groupCode as string | undefined;
      const list = await storage.getAdekoProducts(search, groupCode);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب المنتجات" });
    }
  });

  app.get("/api/adeko-products/groups", requireAuth, async (_req, res) => {
    try {
      const groups = await storage.getAdekoProductGroups();
      res.json(groups);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.patch("/api/adeko-products/:id", requireRole("owner", "assistant", "it"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "معرّف غير صالح" });
      const { priceBeforeVat, priceAfterVat, designW, designH, designD } = req.body as {
        priceBeforeVat?: string; priceAfterVat?: string; designW?: string; designH?: string; designD?: string;
      };
      const updateData: Record<string, string> = {};
      if (priceBeforeVat !== undefined) {
        const price = parseFloat(priceBeforeVat);
        if (isNaN(price) || price < 0) return res.status(400).json({ message: "السعر غير صالح" });
        updateData.priceBeforeVat = String(price.toFixed(2));
        updateData.priceAfterVat = String((price * 1.15).toFixed(2));
      }
      if (priceAfterVat !== undefined && priceBeforeVat === undefined) {
        const price = parseFloat(priceAfterVat);
        if (isNaN(price) || price < 0) return res.status(400).json({ message: "السعر غير صالح" });
        updateData.priceAfterVat = String(price.toFixed(2));
        updateData.priceBeforeVat = String((price / 1.15).toFixed(2));
      }
      const dimFields: Record<string, string | undefined> = { designW, designH, designD };
      for (const [key, val] of Object.entries(dimFields)) {
        if (val !== undefined) {
          const num = parseFloat(val);
          if (isNaN(num) || num < 0) return res.status(400).json({ message: `${key} غير صالح` });
          updateData[key] = String(num.toFixed(2));
        }
      }
      if (Object.keys(updateData).length === 0) return res.status(400).json({ message: "لا توجد بيانات للتحديث" });
      const updated = await storage.updateAdekoProduct(id, updateData);
      if (!updated) return res.status(404).json({ message: "المنتج غير موجود" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في تحديث المنتج" });
    }
  });

  app.get("/api/adeko-products/export", requireRole("owner", "assistant", "it"), async (req, res) => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const list = await storage.getAdekoProducts();

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Teak Manufacturing System";
      const sheet = workbook.addWorksheet("TEAK Products Pricing");

      sheet.columns = [
        { header: "Code", key: "code", width: 25 },
        { header: "Description", key: "desc", width: 35 },
        { header: "Group", key: "group", width: 25 },
        { header: "Mfg W (cm)", key: "mfgW", width: 12 },
        { header: "Mfg H (cm)", key: "mfgH", width: 12 },
        { header: "Mfg D (cm)", key: "mfgD", width: 12 },
        { header: "Design W (cm)", key: "desW", width: 14 },
        { header: "Design H (cm)", key: "desH", width: 14 },
        { header: "Design D (cm)", key: "desD", width: 14 },
        { header: "Price Before VAT (SAR)", key: "priceExcl", width: 22 },
        { header: "Price After VAT 15% (SAR)", key: "priceIncl", width: 24 },
      ];

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9E0A0A" } };
      headerRow.alignment = { horizontal: "center" };

      for (const p of list) {
        sheet.addRow({
          code: p.code,
          desc: p.descriptionEn,
          group: `${p.groupCode} - ${p.groupNameEn}`,
          mfgW: p.manufacturingW ? parseFloat(p.manufacturingW) : "",
          mfgH: p.manufacturingH ? parseFloat(p.manufacturingH) : "",
          mfgD: p.manufacturingD ? parseFloat(p.manufacturingD) : "",
          desW: p.designW ? parseFloat(p.designW) : "",
          desH: p.designH ? parseFloat(p.designH) : "",
          desD: p.designD ? parseFloat(p.designD) : "",
          priceExcl: parseFloat(p.priceBeforeVat || "0"),
          priceIncl: parseFloat(p.priceAfterVat || "0"),
        });
      }

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=teak_products_pricing.xlsx");
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Excel export error:", error);
      res.status(500).json({ message: "حدث خطأ في التصدير" });
    }
  });

  app.get("/api/quotations", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (user?.role === "owner" || user?.role === "assistant") {
        res.json(await storage.getQuotations());
      } else if (user?.role === "sales") {
        const all = await storage.getQuotations();
        const filtered = all.filter((q: any) =>
          q.assignedTo === userId ||
          ((q.status === "open" || q.status === "draft" || q.status === "requested") && !q.assignedTo)
        );
        res.json(filtered);
      } else {
        const all = await storage.getQuotations();
        const filtered = all.filter((q: any) => q.assignedTo === userId);
        res.json(filtered);
      }
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
      const currentUser = await storage.getUser(req.session.userId!);
      const isSalesRep = currentUser?.role === "sales";
      const data = { ...req.body, createdBy: req.session.userId };
      if (isSalesRep) {
        data.assignedTo = req.session.userId;
        data.assignedAt = data.assignedAt || new Date();
        data.claimedAt = data.claimedAt || new Date();
      } else {
        const assignedId = data.assignedTo ? parseInt(data.assignedTo) : null;
        const targetUser = assignedId ? await storage.getUser(assignedId) : null;
        if (!targetUser || targetUser.role !== "sales" || targetUser.active === false) {
          data.assignedTo = null;
          data.assignedAt = null;
          data.claimedAt = null;
        }
      }
      const quotation = await storage.createQuotation(data);

      const settings = await storage.getCompanySettings();
      if (settings) {
        const customer = await storage.getCustomer(quotation.customerId);
        await storage.createInvoice({
          contractId: null,
          customerId: quotation.customerId,
          paymentStage: null,
          type: "quotation",
          items: quotation.items as any,
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
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      const quotation = await storage.getQuotation(parseInt(req.params.id));
      if (!quotation) return res.status(404).json({ message: "عرض السعر غير موجود" });
      if (currentUser?.role === "sales") {
        if (quotation.assignedTo !== userId) {
          return res.status(403).json({ message: "غير مصرح", messageEn: "Not authorized to modify this quotation" });
        }
        delete req.body.assignedTo;
        delete req.body.assignedAt;
      }
      const data = { ...req.body };
      if (data.assignedTo) {
        if (quotation.assignedTo !== data.assignedTo) {
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

  app.post("/api/quotations/:id/claim", requireRole("sales"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const quotationId = parseInt(req.params.id);
      const updated = await storage.claimQuotation(quotationId, userId);
      if (!updated) {
        return res.status(409).json({ message: "تم التقاط هذا الطلب من قبل مندوب آخر أو لا يمكن التقاطه", messageEn: "Order already claimed or cannot be claimed" });
      }
      const claimingUser = await storage.getUser(userId);
      const staffUsers = (await storage.getUsers()).filter(u => ["owner", "assistant"].includes(u.role) && u.id !== userId);
      for (const staff of staffUsers) {
        await storage.createNotification({
          userId: staff.id,
          titleAr: "تم التقاط طلب",
          titleEn: "Order Claimed",
          messageAr: `قام ${claimingUser?.fullNameAr || ""} بالتقاط الطلب #${updated.quotationNumber || quotationId}`,
          messageEn: `${claimingUser?.fullNameEn || ""} claimed order #${updated.quotationNumber || quotationId}`,
          type: "info",
          relatedEntity: "quotation",
          relatedId: quotationId,
          isRead: false,
        });
      }
      res.json(updated);
    } catch (error) {
      console.error("Claim order error:", error);
      res.status(500).json({ message: "حدث خطأ في التقاط الطلب", messageEn: "Error claiming order" });
    }
  });

  app.post("/api/quotations/:id/transfer", requireRole("owner", "assistant"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const quotationId = parseInt(req.params.id);
      const { newAssigneeId } = req.body;
      if (!newAssigneeId) return res.status(400).json({ message: "يجب تحديد المندوب الجديد", messageEn: "New assignee required" });
      const quotation = await storage.getQuotation(quotationId);
      if (!quotation) return res.status(404).json({ message: "الطلب غير موجود", messageEn: "Order not found" });
      const newAssignee = await storage.getUser(Number(newAssigneeId));
      if (!newAssignee) return res.status(404).json({ message: "المستخدم غير موجود", messageEn: "User not found" });
      if (newAssignee.role !== "sales") {
        return res.status(400).json({ message: "يمكن تحويل الطلبات فقط لمناديب المبيعات", messageEn: "Orders can only be transferred to sales agents" });
      }
      if (newAssignee.active === false) {
        return res.status(400).json({ message: "لا يمكن تحويل الطلب لمستخدم غير نشط", messageEn: "Cannot transfer order to an inactive user" });
      }
      const previousAssignees = (quotation.previousAssignees as any[] || []);
      if (quotation.assignedTo) {
        const oldUser = await storage.getUser(quotation.assignedTo);
        previousAssignees.push({
          userId: quotation.assignedTo,
          name: oldUser?.fullNameAr || "",
          assignedAt: quotation.assignedAt,
          removedAt: new Date().toISOString(),
          removedBy: userId,
        });
      }
      const now = new Date();
      const updated = await storage.updateQuotation(quotationId, {
        assignedTo: Number(newAssigneeId),
        assignedAt: now,
        previousAssignees,
        status: (quotation.status === "requested" || quotation.status === "open") ? "draft" : quotation.status,
      });
      const transferringUser = await storage.getUser(userId);
      if (quotation.assignedTo && quotation.assignedTo !== Number(newAssigneeId)) {
        await storage.createNotification({
          userId: quotation.assignedTo,
          titleAr: "تم نقل طلب منك",
          titleEn: "Order Transferred From You",
          messageAr: `تم نقل الطلب #${quotation.quotationNumber || quotationId} إلى مندوب آخر بواسطة ${transferringUser?.fullNameAr || ""}`,
          messageEn: `Order #${quotation.quotationNumber || quotationId} was transferred by ${transferringUser?.fullNameEn || ""}`,
          type: "warning",
          relatedEntity: "quotation",
          relatedId: quotationId,
          isRead: false,
        });
      }
      await storage.createNotification({
        userId: Number(newAssigneeId),
        titleAr: "تم تحويل طلب إليك",
        titleEn: "Order Transferred To You",
        messageAr: `تم تحويل الطلب #${quotation.quotationNumber || quotationId} إليك بواسطة ${transferringUser?.fullNameAr || ""}`,
        messageEn: `Order #${quotation.quotationNumber || quotationId} was transferred to you by ${transferringUser?.fullNameEn || ""}`,
        type: "action",
        relatedEntity: "quotation",
        relatedId: quotationId,
        isRead: false,
      });
      res.json(updated);
    } catch (error) {
      console.error("Transfer order error:", error);
      res.status(500).json({ message: "حدث خطأ في نقل الطلب", messageEn: "Error transferring order" });
    }
  });

  app.post("/api/orders/create-direct", requireRole("owner", "assistant", "sales"), async (req, res) => {
    try {
      const { fullName, phone, productDescription, notes, city } = req.body;
      if (!fullName || !phone || !productDescription) {
        return res.status(400).json({
          message: "الاسم ورقم الجوال ووصف المنتج مطلوبة",
          messageEn: "Name, phone, and product description are required",
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

      let customer;
      const existing = await storage.getCustomerByPhone(normalizedPhone);
      if (existing) {
        customer = existing;
      } else {
        customer = await storage.createCustomer({
          fullName,
          phone: normalizedPhone,
          source: "walk_in",
          notes: notes || "",
        });
      }

      const currentUser = await storage.getUser(req.session.userId!);
      const isSalesRep = currentUser?.role === "sales";
      const items = [{ description: productDescription, quantity: 1, unitPrice: 0, amount: 0 }];
      const quotation = await storage.createQuotation({
        customerId: customer.id,
        items,
        subtotal: "0",
        vatRate: "15",
        vatAmount: "0",
        totalPrice: "0",
        finalPrice: "0",
        status: "draft",
        assignedTo: isSalesRep ? req.session.userId : null,
        assignedAt: isSalesRep ? new Date() : null,
        claimedAt: isSalesRep ? new Date() : null,
        city: city || null,
        notes: [
          `المنتج: ${productDescription}`,
          notes ? `ملاحظات: ${notes}` : "",
        ].filter(Boolean).join(" | "),
      });

      const ownerUsers = (await storage.getUsers()).filter(u => u.role === "owner");
      for (const owner of ownerUsers) {
        await storage.createNotification({
          userId: owner.id,
          titleAr: "طلب جديد من المبيعات",
          titleEn: "New Order from Sales",
          messageAr: `طلب جديد من ${fullName} - ${normalizedPhone} - ${productDescription}`,
          messageEn: `New order from ${fullName} - ${normalizedPhone} - ${productDescription}`,
          type: "action",
          relatedEntity: "customer",
          relatedId: customer.id,
          isRead: false,
        });
      }

      res.status(201).json({ message: "تم إنشاء الطلب بنجاح", messageEn: "Order created successfully", customer, quotation });
    } catch (error) {
      console.error("Create direct order error:", error);
      res.status(500).json({ message: "حدث خطأ في إنشاء الطلب", messageEn: "Error creating order" });
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

  app.post("/api/contracts", requireRole("owner", "assistant", "sales", "accountant"), async (req, res) => {
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

  app.patch("/api/payments/:id/confirm", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const paymentId = parseInt(req.params.id);
      if (isNaN(paymentId)) return res.status(400).json({ message: "معرف غير صالح" });
      const payment = await storage.getPayment(paymentId);
      if (!payment) return res.status(404).json({ message: "الدفعة غير موجودة" });
      if (payment.status === "confirmed") return res.json({ message: "الدفعة مؤكدة مسبقاً", payment });
      if (payment.status !== "pending") return res.status(400).json({ message: "لا يمكن تأكيد دفعة ليست في حالة انتظار" });

      const updated = await storage.updatePayment(paymentId, {
        status: "confirmed",
        confirmedBy: req.session.userId,
        confirmedAt: new Date(),
        rejectionReason: null,
      } as any);

      const contract = await storage.getContract(payment.contractId);
      if (contract) {
        const allPayments = await storage.getPaymentsByContract(contract.id);
        const confirmedTotal = allPayments
          .filter((p: any) => p.status === "confirmed" || (p.id === paymentId))
          .reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
        const newRemaining = parseFloat(contract.totalAmount) - confirmedTotal;
        await storage.updateContract(contract.id, {
          paidAmount: String(confirmedTotal),
          remainingAmount: String(Math.max(0, newRemaining)),
          status: newRemaining <= 0 ? "completed" : "active",
        });
      }

      const confirmedPayments = (await storage.getPaymentsByContract(payment.contractId))
        .filter((p: any) => p.status === "confirmed");
      const isFirstConfirmed = confirmedPayments.length <= 1;

      if (isFirstConfirmed && contract) {
        const existingWOs = await storage.getWorkOrders();
        const hasWO = existingWOs.some((wo: any) => wo.contractId === contract.id);

        if (!hasWO) {
          const allQuotations = await storage.getQuotations();
          const quotation = allQuotations.find((q: any) => q.id === contract.quotationId);
          const deliveryDays = quotation?.deliveryDays || 30;
          const now = new Date();
          const dueDate = new Date(now);
          dueDate.setDate(dueDate.getDate() + deliveryDays);

          const allDA = await storage.getDesignAssignments();
          const designDA = quotation ? allDA.find((da: any) => da.quotationId === quotation.id) : null;

          const workOrder = await storage.createWorkOrder({
            contractId: contract.id,
            customerId: contract.customerId,
            quotationId: quotation?.id || null,
            designFile: designDA?.sketchImage || quotation?.designFile || null,
            specifications: quotation?.items || null,
            priority: "normal",
            status: "pending",
            deliveryDays,
            productionStartDate: now,
            startDate: now.toISOString().split("T")[0],
            dueDate: dueDate.toISOString().split("T")[0],
            notes: quotation?.notes || null,
          } as any);

          const stages = ["cutting", "edging", "assembly", "finishing"] as const;
          for (const stage of stages) {
            await storage.createProductionStage({
              workOrderId: workOrder.id,
              stage,
              status: "pending",
            });
          }

          const productionUsers = await storage.getUsers();
          const productionStaff = productionUsers.filter((u: any) => ["owner", "assistant", "production"].includes(u.role));
          for (const staff of productionStaff) {
            await storage.createNotification({
              userId: staff.id,
              type: "action",
              titleAr: "أمر إنتاج جديد",
              titleEn: "New Work Order",
              messageAr: `تم إنشاء أمر إنتاج جديد للعقد ${contract.contractNumber}`,
              messageEn: `New work order created for contract ${contract.contractNumber}`,
            });
          }
        }
      }

      const customer = await storage.getCustomer(payment.customerId);
      const salesUsers = await storage.getUsers();
      const relevantStaff = salesUsers.filter((u: any) => ["owner", "assistant", "sales", "accountant"].includes(u.role));
      for (const staff of relevantStaff) {
        await storage.createNotification({
          userId: staff.id,
          type: "info",
          titleAr: "تم تأكيد دفعة",
          titleEn: "Payment Confirmed",
          messageAr: `تم تأكيد دفعة بمبلغ ${payment.amount} ريال من العميل ${customer?.fullName}`,
          messageEn: `Payment of ${payment.amount} SAR confirmed from ${customer?.fullName}`,
        });
      }

      res.json({ message: "تم تأكيد الدفعة بنجاح", messageEn: "Payment confirmed", payment: updated });
    } catch (error) { console.error("Confirm payment error:", error); res.status(500).json({ message: "حدث خطأ" }); }
  });

  app.patch("/api/payments/:id/reject", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const paymentId = parseInt(req.params.id);
      if (isNaN(paymentId)) return res.status(400).json({ message: "معرف غير صالح" });
      const { rejectionReason } = req.body;
      const payment = await storage.getPayment(paymentId);
      if (!payment) return res.status(404).json({ message: "الدفعة غير موجودة" });
      if (payment.status !== "pending") return res.status(400).json({ message: "لا يمكن رفض دفعة ليست في حالة انتظار" });

      const updated = await storage.updatePayment(paymentId, {
        status: "rejected",
        rejectionReason: rejectionReason || "لم يتم قبول الإيصال",
      } as any);

      const customer = await storage.getCustomer(payment.customerId);
      const salesUsers = await storage.getUsers();
      const relevantStaff = salesUsers.filter((u: any) => ["owner", "assistant", "sales", "accountant"].includes(u.role));
      for (const staff of relevantStaff) {
        await storage.createNotification({
          userId: staff.id,
          type: "warning",
          titleAr: "تم رفض دفعة",
          titleEn: "Payment Rejected",
          messageAr: `تم رفض دفعة بمبلغ ${payment.amount} ريال من العميل ${customer?.fullName}`,
          messageEn: `Payment of ${payment.amount} SAR rejected from ${customer?.fullName}`,
        });
      }

      res.json({ message: "تم رفض الدفعة", messageEn: "Payment rejected", payment: updated });
    } catch (error) { console.error("Reject payment error:", error); res.status(500).json({ message: "حدث خطأ" }); }
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

  app.post("/api/invoices", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const { contractId } = req.body;
      if (!contractId) return res.status(400).json({ message: "contractId مطلوب" });

      const parsedContractId = parseInt(contractId);
      if (isNaN(parsedContractId)) return res.status(400).json({ message: "contractId غير صالح" });

      const contract = await storage.getContract(parsedContractId);
      if (!contract) return res.status(404).json({ message: "العقد غير موجود" });

      const existingInvoices = await storage.getInvoices();
      const duplicateInvoice = existingInvoices.find((inv: any) => inv.contractId === parsedContractId && inv.status !== "cancelled");
      if (duplicateInvoice) return res.status(409).json({ message: "توجد فاتورة سارية لهذا العقد", invoice: duplicateInvoice });

      const customer = contract.customerId ? await storage.getCustomer(contract.customerId) : null;
      const settings = await storage.getCompanySettings();

      const quotation = contract.quotationId ? await storage.getQuotation(contract.quotationId) : null;
      const items = quotation?.items || [];

      const subtotal = parseFloat(contract.totalAmount || "0") / 1.15;
      const vatAmount = parseFloat(contract.totalAmount || "0") - subtotal;

      const invoiceData = {
        contractId: contract.id,
        quotationId: contract.quotationId || undefined,
        customerId: contract.customerId,
        type: "simplified_tax_invoice" as const,
        items: items,
        subtotal: subtotal.toFixed(2),
        vatRate: "15",
        vatAmount: vatAmount.toFixed(2),
        totalWithVat: contract.totalAmount,
        sellerName: settings?.nameAr || "مصنع تيك للمنتجات الخشبية",
        sellerVatNumber: settings?.vatNumber || "310012345600003",
        sellerAddress: settings?.address || "الرياض - المملكة العربية السعودية",
        buyerName: customer?.fullName || "",
        buyerPhone: customer?.phone || "",
        paymentMethod: "bank_transfer",
        status: "issued" as const,
        issuedAt: new Date(),
        createdBy: req.session.userId,
      };

      const invoice = await storage.createInvoice(invoiceData);

      const qrData = generateQRData({
        sellerName: invoiceData.sellerName,
        sellerVatNumber: invoiceData.sellerVatNumber,
        issuedAt: invoiceData.issuedAt,
        totalWithVat: invoiceData.totalWithVat,
        vatAmount: invoiceData.vatAmount,
      });
      const updated = await storage.updateInvoice(invoice.id, { qrCodeData: qrData });

      res.status(201).json(updated || invoice);
    } catch (error) {
      console.error("Invoice creation error:", error);
      res.status(500).json({ message: "حدث خطأ في إصدار الفاتورة" });
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
      const newOrders = quotationsList.filter(q => q.status === "requested" || q.status === "open" || (q.status === "draft" && !q.assignedTo)).length;
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

      const openPoolCount = quotationsList.filter(q => q.status === "open" && !q.assignedTo).length;
      const transferredCount = quotationsList.filter(q => Array.isArray(q.previousAssignees) && (q.previousAssignees as any[]).length > 0).length;
      const usersAll = await storage.getUsers();
      const salesUsers = usersAll.filter(u => u.role === "sales");
      const agentDistribution = salesUsers.map(su => {
        const count = quotationsList.filter(q => q.assignedTo === su.id && q.status !== "rejected" && q.status !== "expired").length;
        return { userId: su.id, nameAr: su.fullNameAr, nameEn: su.fullNameEn, orderCount: count };
      });

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
        openPoolCount,
        transferredCount,
        agentDistribution,
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
      } else if (user?.role === "owner" || user?.role === "assistant") {
        res.json(await storage.getDesignAssignments());
      } else {
        const allDA = await storage.getDesignAssignments();
        const userQuotations = (await storage.getQuotations()).filter((q: any) => q.assignedTo === userId);
        const userQuotationIds = new Set(userQuotations.map((q: any) => q.id));
        res.json(allDA.filter((da: any) => userQuotationIds.has(da.quotationId)));
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
      const updated = await storage.updateDesignAssignment(da.id, {
        status: "completed",
        customerApproval: null,
        customerApprovalNotes: null,
      } as any);
      if (da.createdBy) {
        await storage.createNotification({
          userId: da.createdBy,
          type: "success",
          titleAr: "التصميم جاهز",
          titleEn: "Design Completed",
          messageAr: "تم إكمال التصميم وجاهز لإنشاء عرض السعر",
          messageEn: "Design is completed and ready for quotation",
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

      if (quotation.status !== "sent") {
        return res.status(400).json({ message: "لا يمكن اعتماد عرض سعر لم يتم إرساله بعد", messageEn: "Cannot approve a quotation that hasn't been sent yet" });
      }

      const updatedQuotation = await storage.updateQuotation(quotation.id, { status: "approved" });

      const allDA = await storage.getDesignAssignments();
      const quotationDA = allDA.find((da: any) => da.quotationId === quotation.id);
      if (quotationDA && quotationDA.customerApproval !== "approved") {
        await storage.updateDesignAssignment(quotationDA.id, {
          customerApproval: "approved",
          customerApprovalNotes: null,
        } as any);
      }

      const contractNumber = `CNT-${Date.now().toString(36).toUpperCase()}`;
      const q = quotation as any;
      const totalAmt = q.finalPrice || q.totalPrice || q.totalWithVat || q.total || quotation.subtotal || "0";
      const contract = await storage.createContract({
        contractNumber,
        quotationId: quotation.id,
        customerId: customer.id,
        totalAmount: totalAmt,
        paidAmount: "0",
        remainingAmount: totalAmt,
        status: "active",
        notes: "تم الاعتماد عبر بوابة العميل",
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
          totalWithVat: q.finalPrice || q.totalPrice || q.totalWithVat || q.total,
          vatAmount: quotation.vatAmount || "0",
        });
        await (storage.createInvoice as any)({
          invoiceNumber,
          type: "simplified_tax_invoice",
          status: "issued",
          customerId: customer.id,
          contractId: contract.id,
          quotationId: quotation.id,
          items: Array.isArray(quotation.items) ? quotation.items : [],
          subtotal: quotation.subtotal || q.totalPrice || q.total || "0",
          vatRate: quotation.vatRate || "15",
          vatAmount: quotation.vatAmount || "0",
          totalWithVat: q.finalPrice || q.totalPrice || q.totalWithVat || q.total || "0",
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
        });
      }

      res.json({ message: "تم اعتماد عرض السعر بنجاح", messageEn: "Quotation approved successfully", contract });
    } catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error approving quotation" }); }
  });

  app.post("/api/customer-portal/upload-receipt", requirePortalAuth, async (req, res) => {
    try {
      const customer = (req as any).portalCustomer;
      const { contractId, amount, receiptImage, paymentMethod, notes } = req.body;

      if (!contractId) return res.status(400).json({ message: "يجب تحديد العقد", messageEn: "Contract ID required" });
      if (!receiptImage) return res.status(400).json({ message: "يجب إرفاق صورة الإيصال", messageEn: "Receipt image required" });
      const contract = await storage.getContract(contractId);
      if (!contract || contract.customerId !== customer.id) {
        return res.status(403).json({ message: "غير مصرح", messageEn: "Unauthorized - contract not yours" });
      }

      const payment = await storage.createPayment({
        contractId,
        customerId: customer.id,
        amount: amount || "0",
        method: paymentMethod || "bank_transfer",
        paymentStage: "deposit",
        notes: notes || "تم رفع الوصل من بوابة العميل",
        attachmentUrl: receiptImage || null,
        recordedBy: null,
        status: "pending",
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

  app.post("/api/customer-portal/approve-design/:id", requirePortalAuth, async (req, res) => {
    try {
      const customer = (req as any).portalCustomer;
      const da = await storage.getDesignAssignment(parseInt(req.params.id));
      if (!da) return res.status(404).json({ message: "التصميم غير موجود" });
      if (da.customerId !== customer.id) return res.status(403).json({ message: "غير مصرح" });
      if (da.status !== "completed") return res.status(400).json({ message: "التصميم غير مكتمل", messageEn: "Design is not completed yet" });
      if (da.customerApproval === "approved") return res.status(400).json({ message: "تم الاعتماد مسبقاً", messageEn: "Already approved" });

      const updated = await storage.updateDesignAssignment(da.id, {
        customerApproval: "approved",
        customerApprovalNotes: null,
      } as any);

      const staffUsers = (await storage.getUsers()).filter(u => ["owner", "assistant", "sales", "designer"].includes(u.role));
      for (const staff of staffUsers) {
        if (staff.id === da.assignedTo || staff.role === "owner" || staff.role === "assistant") {
          await storage.createNotification({
            userId: staff.id,
            titleAr: "العميل اعتمد التصميم ✓",
            titleEn: "Customer Approved Design ✓",
            messageAr: `العميل ${customer.fullName} اعتمد التصميم للطلب #${da.quotationId || da.id}`,
            messageEn: `Customer ${customer.fullName} approved design for order #${da.quotationId || da.id}`,
            type: "success",
            relatedEntity: "quotation",
            relatedId: da.quotationId || da.id,
            isRead: false,
          });
        }
      }

      res.json({ message: "تم اعتماد التصميم بنجاح", messageEn: "Design approved successfully", design: updated });
    } catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ" }); }
  });

  app.post("/api/customer-portal/request-revision/:id", requirePortalAuth, async (req, res) => {
    try {
      const customer = (req as any).portalCustomer;
      const { notes } = req.body;
      const da = await storage.getDesignAssignment(parseInt(req.params.id));
      if (!da) return res.status(404).json({ message: "التصميم غير موجود" });
      if (da.customerId !== customer.id) return res.status(403).json({ message: "غير مصرح" });
      if (da.status !== "completed") return res.status(400).json({ message: "التصميم غير مكتمل" });

      const updated = await storage.updateDesignAssignment(da.id, {
        customerApproval: "revision_requested",
        customerApprovalNotes: notes || "",
        status: "designing",
      } as any);

      if (da.quotationId) {
        await storage.updateQuotation(da.quotationId, { status: "draft" });
      }

      const staffUsers = (await storage.getUsers()).filter(u => u.id === da.assignedTo || u.role === "owner" || u.role === "assistant");
      for (const staff of staffUsers) {
        await storage.createNotification({
          userId: staff.id,
          titleAr: "العميل طلب تعديل التصميم",
          titleEn: "Customer Requested Design Revision",
          messageAr: `العميل ${customer.fullName} طلب تعديل التصميم: ${notes || "—"}`,
          messageEn: `Customer ${customer.fullName} requested design revision: ${notes || "—"}`,
          type: "warning",
          relatedEntity: "quotation",
          relatedId: da.quotationId || da.id,
          isRead: false,
        });
      }

      res.json({ message: "تم إرسال طلب التعديل", messageEn: "Revision request sent", design: updated });
    } catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ" }); }
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

  app.patch("/api/quotations/:id/inspection-date", requireRole("owner", "assistant", "sales"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { inspectionDate } = req.body;
      if (!inspectionDate) return res.status(400).json({ message: "التاريخ مطلوب", messageEn: "Date is required" });

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(inspectionDate)) {
        return res.status(400).json({ message: "صيغة التاريخ غير صحيحة", messageEn: "Invalid date format" });
      }
      const parsedDate = new Date(inspectionDate + "T00:00:00");
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: "تاريخ غير صالح", messageEn: "Invalid date" });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsedDate < today) {
        return res.status(400).json({ message: "لا يمكن اختيار تاريخ سابق", messageEn: "Cannot select a past date" });
      }

      const quotation = await storage.getQuotation(id);
      if (!quotation) return res.status(404).json({ message: "الطلب غير موجود" });

      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (user?.role !== "owner" && user?.role !== "assistant" && quotation.assignedTo !== userId) {
        return res.status(403).json({ message: "غير مصرح لك" });
      }

      const updated = await storage.updateQuotation(id, { inspectionDate } as any);

      const customer = await storage.getCustomer(quotation.customerId);
      const ownerUsers = (await storage.getUsers()).filter(u => u.role === "owner" || u.role === "assistant");
      for (const owner of ownerUsers) {
        if (owner.id !== userId) {
          await storage.createNotification({
            userId: owner.id,
            titleAr: "موعد معاينة جديد",
            titleEn: "New Inspection Scheduled",
            messageAr: `تم حجز موعد معاينة للعميل ${customer?.fullName || "—"} بتاريخ ${inspectionDate} بواسطة ${user?.fullNameAr || ""}`,
            messageEn: `Inspection scheduled for ${customer?.fullName || "—"} on ${inspectionDate} by ${user?.fullNameEn || ""}`,
            type: "info",
            relatedEntity: "quotation",
            relatedId: id,
            isRead: false,
          });
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Inspection date error:", error);
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ==================== APPOINTMENTS / CALENDAR ====================

  app.get("/api/appointments", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const assignedTo = req.query.assignedTo as string | undefined;

      if (user?.role === "owner" || user?.role === "assistant") {
        if (assignedTo) {
          res.json(await storage.getAppointments({ userId: parseInt(assignedTo) }));
        } else {
          res.json(await storage.getAppointments());
        }
      } else {
        res.json(await storage.getAppointments({ userId }));
      }
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/appointments/:id", requireAuth, async (req, res) => {
    try {
      const appointment = await storage.getAppointment(parseInt(req.params.id));
      if (!appointment) return res.status(404).json({ message: "الموعد غير موجود" });
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/appointments", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      const isManagerRole = currentUser?.role === "owner" || currentUser?.role === "assistant";

      const data = { ...req.body, createdBy: userId };

      if (!isManagerRole) {
        data.assignedTo = userId;
      }

      if (!data.appointmentDate || !data.startTime || !data.endTime || !data.assignedTo || !data.title) {
        return res.status(400).json({ message: "جميع الحقول مطلوبة", messageEn: "All fields are required" });
      }

      if (data.startTime >= data.endTime) {
        return res.status(400).json({ message: "وقت البداية يجب أن يكون قبل وقت النهاية", messageEn: "Start time must be before end time" });
      }

      const existing = await storage.getAppointmentsByDate(data.appointmentDate, data.assignedTo);
      const conflict = existing.find((a: any) =>
        a.status === "scheduled" &&
        ((data.startTime >= a.startTime && data.startTime < a.endTime) ||
         (data.endTime > a.startTime && data.endTime <= a.endTime) ||
         (data.startTime <= a.startTime && data.endTime >= a.endTime))
      );

      if (conflict) {
        return res.status(409).json({
          message: "يوجد تعارض مع موعد آخر",
          messageEn: "Time conflict with another appointment",
          conflictWith: conflict,
        });
      }

      const appointment = await storage.createAppointment(data);
      res.status(201).json(appointment);
    } catch (error) {
      console.error("Create appointment error:", error);
      res.status(500).json({ message: "حدث خطأ في إنشاء الموعد" });
    }
  });

  app.patch("/api/appointments/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      const appointment = await storage.getAppointment(id);
      if (!appointment) return res.status(404).json({ message: "الموعد غير موجود" });

      const isManagerRole = currentUser?.role === "owner" || currentUser?.role === "assistant";
      if (!isManagerRole && appointment.assignedTo !== userId) {
        return res.status(403).json({ message: "غير مصرح لك بتعديل هذا الموعد" });
      }

      const data = { ...req.body };
      delete data.id;
      delete data.createdAt;

      if (!isManagerRole) {
        delete data.assignedTo;
      }

      const checkDate = data.appointmentDate || appointment.appointmentDate;
      const checkStart = data.startTime || appointment.startTime;
      const checkEnd = data.endTime || appointment.endTime;
      const checkAssignedTo = data.assignedTo || appointment.assignedTo;

      if (checkStart >= checkEnd) {
        return res.status(400).json({ message: "وقت البداية يجب أن يكون قبل وقت النهاية" });
      }

      if (data.appointmentDate || data.startTime || data.endTime) {
        const existing = await storage.getAppointmentsByDate(checkDate, checkAssignedTo);
        const conflict = existing.find((a: any) =>
          a.id !== id &&
          a.status === "scheduled" &&
          ((checkStart >= a.startTime && checkStart < a.endTime) ||
           (checkEnd > a.startTime && checkEnd <= a.endTime) ||
           (checkStart <= a.startTime && checkEnd >= a.endTime))
        );
        if (conflict) {
          return res.status(409).json({ message: "يوجد تعارض مع موعد آخر", messageEn: "Time conflict" });
        }
      }

      const updated = await storage.updateAppointment(id, data);
      if (!updated) return res.status(404).json({ message: "الموعد غير موجود" });

      if (data.status === "client_refused" || (data.failReason === "client_cancelled")) {
        const appointment = updated;
        const customer = appointment.customerId ? await storage.getCustomer(appointment.customerId) : null;
        const ownerUsers = (await storage.getUsers()).filter(u => u.role === "owner" || u.role === "assistant");
        for (const owner of ownerUsers) {
          await storage.createNotification({
            userId: owner.id,
            titleAr: "العميل ألغى الموعد",
            titleEn: "Client Cancelled Appointment",
            messageAr: `العميل ${customer?.fullName || "—"} ألغى موعد الزيارة بتاريخ ${appointment.appointmentDate}`,
            messageEn: `Client ${customer?.fullName || "—"} cancelled appointment on ${appointment.appointmentDate}`,
            type: "warning",
            relatedEntity: "appointment",
            relatedId: id,
            isRead: false,
          });
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Update appointment error:", error);
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/appointments/:id/reschedule", requireAuth, async (req, res) => {
    try {
      const oldId = parseInt(req.params.id);
      const oldAppointment = await storage.getAppointment(oldId);
      if (!oldAppointment) return res.status(404).json({ message: "الموعد غير موجود" });

      const { appointmentDate, startTime, endTime, notes } = req.body;
      if (!appointmentDate || !startTime || !endTime) {
        return res.status(400).json({ message: "التاريخ والوقت مطلوبان" });
      }

      if (startTime >= endTime) {
        return res.status(400).json({ message: "وقت البداية يجب أن يكون قبل وقت النهاية" });
      }

      const existing = await storage.getAppointmentsByDate(appointmentDate, oldAppointment.assignedTo);
      const conflict = existing.find((a: any) =>
        a.status === "scheduled" &&
        ((startTime >= a.startTime && startTime < a.endTime) ||
         (endTime > a.startTime && endTime <= a.endTime) ||
         (startTime <= a.startTime && endTime >= a.endTime))
      );
      if (conflict) {
        return res.status(409).json({ message: "يوجد تعارض مع موعد آخر" });
      }

      const newAppointment = await storage.createAppointment({
        assignedTo: oldAppointment.assignedTo,
        customerId: oldAppointment.customerId,
        quotationId: oldAppointment.quotationId,
        title: oldAppointment.title,
        appointmentDate,
        startTime,
        endTime,
        status: "scheduled",
        notes: notes || oldAppointment.notes,
        createdBy: req.session.userId!,
      });

      await storage.updateAppointment(oldId, {
        status: "rescheduled",
        rescheduledTo: newAppointment.id,
      });

      res.status(201).json(newAppointment);
    } catch (error) {
      console.error("Reschedule error:", error);
      res.status(500).json({ message: "حدث خطأ في إعادة الجدولة" });
    }
  });

  // ==================== SITE SURVEYS ====================

  app.get("/api/site-surveys", requireAuth, async (_req, res) => {
    try {
      res.json(await storage.getSiteSurveys());
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/site-surveys/:id", requireAuth, async (req, res) => {
    try {
      const survey = await storage.getSiteSurvey(parseInt(req.params.id));
      if (!survey) return res.status(404).json({ message: "النموذج غير موجود" });
      res.json(survey);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/appointments/:id/expire", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      const appointment = await storage.getAppointment(id);
      if (!appointment) return res.status(404).json({ message: "الموعد غير موجود" });
      const isManagerRole = currentUser?.role === "owner" || currentUser?.role === "assistant";
      if (!isManagerRole && appointment.assignedTo !== userId) {
        return res.status(403).json({ message: "غير مصرح لك بهذا الإجراء" });
      }
      if (appointment.status !== "scheduled") {
        return res.json({ message: "already_handled", status: appointment.status });
      }
      const endDateTime = new Date(`${appointment.appointmentDate}T${appointment.endTime || appointment.startTime || "23:59"}`);
      if (endDateTime > new Date()) {
        return res.status(400).json({ message: "الموعد لم ينته بعد" });
      }
      const updated = await storage.updateAppointment(id, { status: "no_show" });
      const customer = appointment.customerId ? await storage.getCustomer(appointment.customerId) : null;
      const ownerUsers = (await storage.getUsers()).filter(u => u.role === "owner" || u.role === "assistant");
      const notifyUsers = [...ownerUsers];
      if (appointment.assignedTo) {
        const assignee = await storage.getUser(appointment.assignedTo);
        if (assignee && !notifyUsers.find(u => u.id === assignee.id)) {
          notifyUsers.push(assignee);
        }
      }
      for (const u of notifyUsers) {
        await storage.createNotification({
          userId: u.id,
          titleAr: "موعد انتهى دون زيارة",
          titleEn: "Appointment Missed",
          messageAr: `موعد ${customer?.fullName || "العميل"} بتاريخ ${appointment.appointmentDate} الساعة ${appointment.startTime} انتهى دون تسجيل زيارة — يُرجى إعادة الجدولة`,
          messageEn: `Appointment for ${customer?.fullName || "client"} on ${appointment.appointmentDate} at ${appointment.startTime} expired without a visit — please reschedule`,
          type: "warning",
          relatedEntity: "appointment",
          relatedId: id,
          isRead: false,
        });
      }
      res.json(updated);
    } catch (error) {
      console.error("Expire appointment error:", error);
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/appointments/:id/site-survey", requireAuth, async (req, res) => {
    try {
      const survey = await storage.getSiteSurveyByAppointment(parseInt(req.params.id));
      if (!survey) return res.status(404).json({ message: "لا يوجد نموذج زيارة لهذا الموعد" });
      res.json(survey);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/site-surveys", requireAuth, async (req, res) => {
    try {
      const data = { ...req.body, createdBy: req.session.userId };

      if (!data.appointmentId) {
        return res.status(400).json({ message: "معرف الموعد مطلوب" });
      }

      const appointment = await storage.getAppointment(data.appointmentId);
      if (!appointment) return res.status(404).json({ message: "الموعد غير موجود" });

      await storage.updateAppointment(data.appointmentId, { status: "attended" });

      const survey = await storage.createSiteSurvey(data);
      res.status(201).json(survey);
    } catch (error) {
      console.error("Create site survey error:", error);
      res.status(500).json({ message: "حدث خطأ في إنشاء نموذج الزيارة" });
    }
  });

  app.patch("/api/site-surveys/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateSiteSurvey(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "النموذج غير موجود" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/inspections", requireAuth, async (req, res) => {
    try {
      const quotations = await storage.getQuotations();
      const customers = await storage.getCustomers();
      const users = await storage.getUsers();

      const inspections = quotations
        .filter(q => q.inspectionDate)
        .map(q => ({
          quotationId: q.id,
          quotationNumber: q.quotationNumber,
          inspectionDate: q.inspectionDate,
          customerId: q.customerId,
          customer: customers.find(c => c.id === q.customerId),
          assignedTo: q.assignedTo,
          assignedUser: users.find(u => u.id === q.assignedTo),
          items: q.items,
          notes: q.notes,
          status: q.status,
        }))
        .sort((a, b) => new Date(a.inspectionDate!).getTime() - new Date(b.inspectionDate!).getTime());

      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (user?.role === "owner" || user?.role === "assistant") {
        res.json(inspections);
      } else {
        res.json(inspections.filter(i => i.assignedTo === userId));
      }
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TASK #3: Site Surveys
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/site-surveys", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const isManager = user?.role === "owner" || user?.role === "assistant";
      const filters: any = {};
      if (!isManager) filters.salesPersonId = userId;
      if (req.query.quotationId) filters.quotationId = parseInt(req.query.quotationId as string);
      const list = await storage.getSiteSurveys(filters);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب الزيارات" });
    }
  });

  app.get("/api/site-surveys/:id", requireAuth, async (req, res) => {
    try {
      const survey = await storage.getSiteSurvey(parseInt(req.params.id));
      if (!survey) return res.status(404).json({ message: "الزيارة غير موجودة" });
      res.json(survey);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/site-surveys/by-appointment/:appointmentId", requireAuth, async (req, res) => {
    try {
      const survey = await storage.getSiteSurveyByAppointment(parseInt(req.params.appointmentId));
      res.json(survey || null);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/site-surveys", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const survey = await storage.createSiteSurvey({ ...req.body, salesPersonId: userId });
      res.status(201).json(survey);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في إنشاء الزيارة" });
    }
  });

  app.patch("/api/site-surveys/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateSiteSurvey(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "الزيارة غير موجودة" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في تحديث الزيارة" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TASK #4: Pricing Engine + 3D Visualization + Customer Approval
  // ══════════════════════════════════════════════════════════════════════════

  app.post("/api/pricing/calculate", requireAuth, async (req, res) => {
    try {
      const { products: prods, discount = 0, discountType = "percent" } = req.body as {
        products: Array<{
          productId: number;
          quantity: number;
          options?: { drawerType?: string; hingeType?: string; liftMechanism?: string };
        }>;
        discount?: number;
        discountType?: "percent" | "fixed";
      };

      const optionPrices: Record<string, Record<string, number>> = {
        drawerType: { standard: 0, soft_close: 150, full_extension: 250, tandem: 400 },
        hingeType: { standard: 0, soft_close: 80, concealed: 120, hydraulic: 200 },
        liftMechanism: { none: 0, gas_strut: 300, aventos_hf: 600, aventos_hl: 500, servo_drive: 900 },
      };

      let subtotal = 0;
      const lineItems = [];

      for (const item of prods) {
        const adeko = await storage.getAdekoProduct(item.productId);
        if (!adeko) continue;
        const unitPrice = parseFloat(adeko.priceBeforeVat?.toString() || "0");

        let optionsCost = 0;
        const optionDetails: Record<string, { name: string; price: number }> = {};
        if (item.options) {
          for (const [optKey, optVal] of Object.entries(item.options)) {
            if (optVal && optionPrices[optKey] && optionPrices[optKey][optVal] !== undefined) {
              const price = optionPrices[optKey][optVal];
              optionsCost += price;
              optionDetails[optKey] = { name: optVal, price };
            }
          }
        }

        const lineTotal = (unitPrice + optionsCost) * item.quantity;
        subtotal += lineTotal;
        lineItems.push({
          productId: item.productId,
          code: adeko.code,
          nameAr: adeko.descriptionAr || adeko.code,
          nameEn: adeko.descriptionEn || adeko.code,
          groupNameAr: adeko.groupNameAr,
          groupNameEn: adeko.groupNameEn,
          unitPrice,
          optionsCost,
          optionDetails,
          quantity: item.quantity,
          lineTotal,
          dimensions: {
            w: parseFloat(adeko.designW?.toString() || adeko.manufacturingW?.toString() || "0"),
            h: parseFloat(adeko.designH?.toString() || adeko.manufacturingH?.toString() || "0"),
            d: parseFloat(adeko.designD?.toString() || adeko.manufacturingD?.toString() || "0"),
          },
        });
      }

      const clampedDiscount = Math.max(0, discountType === "percent" ? Math.min(discount, 100) : Math.min(discount, subtotal));
      const discountAmount = discountType === "percent" ? (subtotal * clampedDiscount) / 100 : clampedDiscount;
      const afterDiscount = Math.max(0, subtotal - discountAmount);
      const vat = afterDiscount * 0.15;
      const total = afterDiscount + vat;

      res.json({ lineItems, subtotal, discountPercent: discountType === "percent" ? discount : 0, discountAmount, afterDiscount, vat, total });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في الحساب" });
    }
  });

  app.post("/api/pricing/save-quotation", requireAuth, async (req, res) => {
    try {
      const { customerId, lineItems, discountAmount: clientDiscount = 0, notes, deliveryDays, surveyId, city } = req.body;
      if (!customerId || !lineItems || lineItems.length === 0) {
        return res.status(400).json({ message: "العميل والمنتجات مطلوبة" });
      }

      const optionPrices: Record<string, Record<string, number>> = {
        drawerType: { standard: 0, soft_close: 150, full_extension: 250, tandem: 400 },
        hingeType: { standard: 0, soft_close: 80, concealed: 120, hydraulic: 200 },
        liftMechanism: { none: 0, gas_strut: 300, aventos_hf: 600, aventos_hl: 500, servo_drive: 900 },
      };

      let serverSubtotal = 0;
      const items: Array<{
        productId: number | null; code: string; description: string;
        nameAr: string; nameEn: string; quantity: number;
        unitPrice: number; optionsCost: number;
        optionDetails: Record<string, { name: string; price: number }>;
        amount: number; dimensions: { w: number; h: number; d: number } | null;
      }> = [];

      for (const li of lineItems) {
        const quantity = Math.max(1, parseInt(li.quantity || 1));
        let unitPrice = parseFloat(li.unitPrice || 0);
        let dimensions = li.dimensions || null;
        let code = li.code || "";
        let nameAr = li.nameAr || "";
        let nameEn = li.nameEn || "";

        if (li.productId) {
          const adeko = await storage.getAdekoProduct(parseInt(li.productId));
          if (adeko) {
            const adekoPrice = parseFloat(adeko.priceBeforeVat?.toString() || "0");
            unitPrice = unitPrice > 0 ? unitPrice : adekoPrice;
            code = code || adeko.code;
            nameAr = nameAr || adeko.descriptionAr || adeko.code;
            nameEn = nameEn || adeko.descriptionEn || adeko.code;
            dimensions = dimensions || {
              w: parseFloat(adeko.designW?.toString() || adeko.manufacturingW?.toString() || "60"),
              h: parseFloat(adeko.designH?.toString() || adeko.manufacturingH?.toString() || "80"),
              d: parseFloat(adeko.designD?.toString() || adeko.manufacturingD?.toString() || "55"),
            };
          }
        }

        let optionsCost = 0;
        const optionDetails: Record<string, { name: string; price: number }> = {};
        const rawOptions = li.optionDetails || {};
        for (const [optKey, optVal] of Object.entries(rawOptions)) {
          if (!optionPrices[optKey]) continue;
          const optName = typeof optVal === "object" && optVal !== null ? (optVal as Record<string, unknown>).name as string : String(optVal);
          if (optName && optionPrices[optKey][optName] !== undefined) {
            const price = optionPrices[optKey][optName];
            optionsCost += price;
            optionDetails[optKey] = { name: optName, price };
          }
        }

        const lineTotal = (unitPrice + optionsCost) * quantity;
        serverSubtotal += lineTotal;
        items.push({
          productId: li.productId || null,
          code,
          description: nameAr || code,
          nameAr,
          nameEn,
          quantity,
          unitPrice,
          optionsCost,
          optionDetails,
          amount: lineTotal,
          dimensions,
        });
      }

      const discountVal = Math.max(0, Math.min(parseFloat(clientDiscount) || 0, serverSubtotal));
      const afterDiscount = Math.max(0, serverSubtotal - discountVal);
      const serverVat = afterDiscount * 0.15;
      const serverTotal = afterDiscount + serverVat;

      const pricingUser = await storage.getUser(req.session.userId!);
      const pricingIsSales = pricingUser?.role === "sales";
      const quotation = await storage.createQuotation({
        customerId,
        items,
        subtotal: String(serverSubtotal),
        vatRate: "15",
        vatAmount: String(serverVat),
        totalPrice: String(serverTotal),
        discount: String(discountVal),
        finalPrice: String(serverTotal),
        status: "draft",
        assignedTo: pricingIsSales ? req.session.userId : null,
        assignedAt: pricingIsSales ? new Date() : null,
        claimedAt: pricingIsSales ? new Date() : null,
        deliveryDays: deliveryDays || null,
        city: city || null,
        notes: notes || "",
        createdBy: req.session.userId,
      });

      if (surveyId) {
        await storage.updateSiteSurvey(parseInt(surveyId), { quotationId: quotation.id } as any);
      }

      res.status(201).json(quotation);
    } catch (error) {
      console.error("Save quotation error:", error);
      res.status(500).json({ message: "حدث خطأ في حفظ عرض السعر" });
    }
  });

  app.post("/api/pricing/send-to-customer/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["owner", "assistant", "sales"].includes(user.role)) {
        return res.status(403).json({ message: "غير مصرح بإرسال عروض الأسعار" });
      }

      const quotation = await storage.getQuotation(parseInt(req.params.id));
      if (!quotation) return res.status(404).json({ message: "عرض السعر غير موجود" });

      if (user.role === "sales" && quotation.assignedTo !== user.id && quotation.createdBy !== user.id) {
        return res.status(403).json({ message: "غير مصرح - عرض السعر ليس مخصصاً لك" });
      }

      const updated = await storage.updateQuotation(quotation.id, { status: "sent" });

      const customer = await storage.getCustomer(quotation.customerId);
      const staffUsers = (await storage.getUsers()).filter(u => ["owner", "assistant", "sales"].includes(u.role));
      for (const staff of staffUsers) {
        await storage.createNotification({
          userId: staff.id,
          titleAr: "تم إرسال عرض سعر للعميل",
          titleEn: "Quotation Sent to Customer",
          messageAr: `تم إرسال عرض السعر #${quotation.id} للعميل ${customer?.fullName || ""}`,
          messageEn: `Quotation #${quotation.id} sent to customer ${customer?.fullName || ""}`,
          type: "info",
          relatedEntity: "quotation",
          relatedId: quotation.id,
          isRead: false,
        });
      }

      res.json({ message: "تم إرسال عرض السعر", quotation: updated });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/pricing/options", requireAuth, async (_req, res) => {
    res.json({
      drawerType: [
        { value: "standard", labelAr: "قياسي", labelEn: "Standard", price: 0 },
        { value: "soft_close", labelAr: "إغلاق ناعم", labelEn: "Soft Close", price: 150 },
        { value: "full_extension", labelAr: "سحب كامل", labelEn: "Full Extension", price: 250 },
        { value: "tandem", labelAr: "تاندم", labelEn: "Tandem", price: 400 },
      ],
      hingeType: [
        { value: "standard", labelAr: "قياسي", labelEn: "Standard", price: 0 },
        { value: "soft_close", labelAr: "إغلاق ناعم", labelEn: "Soft Close", price: 80 },
        { value: "concealed", labelAr: "مخفي", labelEn: "Concealed", price: 120 },
        { value: "hydraulic", labelAr: "هيدروليكي", labelEn: "Hydraulic", price: 200 },
      ],
      liftMechanism: [
        { value: "none", labelAr: "بدون", labelEn: "None", price: 0 },
        { value: "gas_strut", labelAr: "مسند غاز", labelEn: "Gas Strut", price: 300 },
        { value: "aventos_hf", labelAr: "أفينتوس HF", labelEn: "Aventos HF", price: 600 },
        { value: "aventos_hl", labelAr: "أفينتوس HL", labelEn: "Aventos HL", price: 500 },
        { value: "servo_drive", labelAr: "محرك كهربائي", labelEn: "Servo Drive", price: 900 },
      ],
    });
  });

  function generateShareToken(surveyId: number): string {
    const crypto = require("crypto");
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      throw new Error("SESSION_SECRET environment variable is required for share token generation");
    }
    return crypto.createHmac("sha256", secret).update(`3d-share-${surveyId}`).digest("hex").slice(0, 16);
  }

  app.get("/api/public/3d-scene/:surveyId", async (req, res) => {
    try {
      const surveyId = parseInt(req.params.surveyId);
      const token = req.query.token as string | undefined;
      const expectedToken = generateShareToken(surveyId);

      const hasValidToken = token === expectedToken;
      const isPortalAuth = !!(req.session && (req.session as any).portalCustomerId);

      if (!hasValidToken && !isPortalAuth) {
        return res.status(403).json({ message: "رابط غير صالح" });
      }

      const survey = await storage.getSiteSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "الزيارة غير موجودة" });

      if (isPortalAuth && !hasValidToken) {
        const customer = await storage.getCustomer((req.session as any).portalCustomerId);
        if (!customer) {
          return res.status(403).json({ message: "غير مصرح" });
        }
        if (!survey.quotationId) {
          return res.status(403).json({ message: "غير مصرح" });
        }
        const quotations = await storage.getQuotationsByCustomer(customer.id);
        const qIds = quotations.map(q => q.id);
        if (!qIds.includes(survey.quotationId)) {
          return res.status(403).json({ message: "غير مصرح" });
        }
      }

      const quotation = survey.quotationId ? await storage.getQuotation(survey.quotationId) : null;

      const roomDimensions = {
        length: parseFloat(survey.roomLength?.toString() || "400"),
        width: parseFloat(survey.roomWidth?.toString() || "300"),
        height: parseFloat(survey.roomHeight?.toString() || "240"),
      };

      interface SurveyWall { id: string; name?: string; length?: string }
      interface SurveyProduct {
        adekoProductId?: number; productId?: number; code?: string;
        description?: string; room?: string; wallIndex?: number;
        quantity?: number; dimensions?: { w: number; h: number; d: number };
      }
      interface SceneProduct {
        productId: number | null; code: string; nameAr: string;
        unitPrice: number; quantity: number; wallIndex: number;
        positionInWall: number;
        dimensions: { w: number; h: number; d: number };
        optionsCost?: number; optionDetails?: Record<string, { name: string; price: number }>;
      }
      interface QuotationItem {
        productId?: number; code?: string; nameAr?: string; description?: string;
        unitPrice?: number | string; optionsCost?: number | string;
        optionDetails?: Record<string, { name: string; price: number }>;
        quantity?: number; dimensions?: { w: number; h: number; d: number };
        wallIndex?: number;
      }

      const surveyWalls: SurveyWall[] = Array.isArray(survey.walls) ? survey.walls as SurveyWall[] : [];
      const rawProducts: SurveyProduct[] = Array.isArray(survey.selectedProducts) ? survey.selectedProducts as SurveyProduct[] : [];
      let enrichedProducts: SceneProduct[] = [];

      if (rawProducts.length > 0) {
        enrichedProducts = (await Promise.all(rawProducts.map(async (sp, spIdx) => {
          const adekoId = sp.adekoProductId || sp.productId;
          let wallIdx = sp.wallIndex;
          if (wallIdx == null && sp.room && surveyWalls.length > 0) {
            wallIdx = surveyWalls.findIndex((w) => w.id === sp.room);
            if (wallIdx < 0) wallIdx = spIdx % Math.max(surveyWalls.length, 3);
          }
          if (wallIdx == null) wallIdx = spIdx % 3;

          if (adekoId) {
            const adeko = await storage.getAdekoProduct(adekoId);
            if (adeko) {
              return {
                productId: adeko.id,
                code: sp.code || adeko.code,
                nameAr: sp.description || adeko.descriptionAr || adeko.code,
                unitPrice: parseFloat(adeko.priceBeforeVat?.toString() || "0"),
                quantity: sp.quantity || 1,
                dimensions: {
                  w: parseFloat(adeko.designW?.toString() || adeko.manufacturingW?.toString() || "60"),
                  h: parseFloat(adeko.designH?.toString() || adeko.manufacturingH?.toString() || "80"),
                  d: parseFloat(adeko.designD?.toString() || adeko.manufacturingD?.toString() || "55"),
                },
                wallIndex: wallIdx,
                positionInWall: spIdx,
              } as SceneProduct;
            }
          }
          return {
            productId: sp.productId || null,
            code: sp.code || "",
            nameAr: sp.description || "",
            unitPrice: 0,
            quantity: sp.quantity || 1,
            dimensions: sp.dimensions || { w: 60, h: 80, d: 55 },
            wallIndex: wallIdx,
            positionInWall: spIdx,
          } as SceneProduct;
        }))).filter(Boolean);
      }

      if (quotation?.items && Array.isArray(quotation.items) && (quotation.items as QuotationItem[]).length > 0) {
        enrichedProducts = (quotation.items as QuotationItem[]).map((item, idx) => ({
          productId: item.productId || null,
          code: item.code || "",
          nameAr: item.nameAr || item.description || "",
          unitPrice: parseFloat(String(item.unitPrice || 0)),
          optionsCost: parseFloat(String(item.optionsCost || 0)),
          optionDetails: item.optionDetails || {},
          quantity: item.quantity || 1,
          dimensions: item.dimensions || { w: 60, h: 80, d: 55 },
          wallIndex: item.wallIndex ?? (idx % 3),
          positionInWall: idx,
        }));
      }

      res.json({
        roomDimensions,
        walls: survey.walls,
        selectedProducts: enrichedProducts,
        quotationId: survey.quotationId,
        shareToken: expectedToken,
        items: quotation?.items || [],
        subtotal: quotation?.subtotal,
        vatAmount: quotation?.vatAmount,
        totalPrice: quotation?.totalPrice,
        discount: quotation?.discount,
        finalPrice: quotation?.finalPrice,
      });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/customer-portal/update-products", requirePortalAuth, async (req, res) => {
    try {
      const customer = (req as any).portalCustomer;
      const { quotationId, products: clientProducts } = req.body;
      if (!quotationId) return res.status(400).json({ message: "معرف عرض السعر مطلوب" });

      const quotation = await storage.getQuotation(quotationId);
      if (!quotation) return res.status(404).json({ message: "عرض السعر غير موجود" });
      if (quotation.customerId !== customer.id) return res.status(403).json({ message: "غير مصرح" });
      if (quotation.status !== "sent" && quotation.status !== "draft") {
        return res.status(400).json({ message: "لا يمكن تعديل عرض سعر معتمد" });
      }

      if (!Array.isArray(clientProducts) || clientProducts.length === 0) {
        return res.status(400).json({ message: "يجب تحديد منتج واحد على الأقل" });
      }

      const optionPrices: Record<string, Record<string, number>> = {
        drawerType: { standard: 0, soft_close: 150, full_extension: 250, tandem: 400 },
        hingeType: { standard: 0, soft_close: 80, concealed: 120, hydraulic: 200 },
        liftMechanism: { none: 0, gas_strut: 300, aventos_hf: 600, aventos_hl: 500, servo_drive: 900 },
      };

      const existingItems = Array.isArray(quotation.items) ? quotation.items as Array<{
        productId?: number; code?: string; unitPrice?: number; nameAr?: string; nameEn?: string;
        optionsCost?: number; optionDetails?: Record<string, { name: string; price: number }>;
        quantity?: number; dimensions?: { w: number; h: number; d: number };
      }> : [];

      const validatedProducts: Array<{
        productId: number | null; code: string; description: string;
        nameAr: string; nameEn: string; quantity: number;
        unitPrice: number; optionsCost: number;
        optionDetails: Record<string, { name: string; price: number }>;
        amount: number; dimensions: { w: number; h: number; d: number } | null;
        wallIndex: number;
      }> = [];
      let subtotal = 0;

      for (const cp of clientProducts) {
        const productId = parseInt(cp.productId) || 0;
        const quantity = Math.max(1, parseInt(cp.quantity) || 1);

        if (productId > 0) {
          const adeko = await storage.getAdekoProduct(productId);
          if (!adeko) continue;

          const catalogPrice = parseFloat(adeko.priceBeforeVat?.toString() || "0");

          const rawOptions = cp.optionDetails || {};
          let optionsCost = 0;
          const optionDetails: Record<string, { name: string; price: number }> = {};
          for (const [optKey, optVal] of Object.entries(rawOptions)) {
            if (!optionPrices[optKey]) continue;
            const optName = typeof optVal === "object" && optVal !== null ? (optVal as Record<string, unknown>).name as string : String(optVal);
            if (optName && optionPrices[optKey][optName] !== undefined) {
              const price = optionPrices[optKey][optName];
              optionsCost += price;
              optionDetails[optKey] = { name: optName, price };
            }
          }

          const lineTotal = (catalogPrice + optionsCost) * quantity;
          subtotal += lineTotal;

          validatedProducts.push({
            productId: adeko.id,
            code: adeko.code,
            description: adeko.descriptionAr || adeko.code,
            nameAr: adeko.descriptionAr || adeko.code,
            nameEn: adeko.descriptionEn || adeko.code,
            quantity,
            unitPrice: catalogPrice,
            optionsCost,
            optionDetails,
            amount: lineTotal,
            dimensions: {
              w: parseFloat(adeko.designW?.toString() || adeko.manufacturingW?.toString() || "60"),
              h: parseFloat(adeko.designH?.toString() || adeko.manufacturingH?.toString() || "80"),
              d: parseFloat(adeko.designD?.toString() || adeko.manufacturingD?.toString() || "55"),
            },
            wallIndex: cp.wallIndex ?? validatedProducts.length % 3,
          });
        } else {
          const existingManual = existingItems.find(
            (ei: any) => !ei.productId && ei.code === cp.code
          );
          if (!existingManual) continue;

          const manualPrice = parseFloat(existingManual.unitPrice?.toString() || "0");
          const manualOptionsCost = parseFloat(existingManual.optionsCost?.toString() || "0");
          const lineTotal = (manualPrice + manualOptionsCost) * quantity;
          subtotal += lineTotal;

          validatedProducts.push({
            productId: null,
            code: existingManual.code || cp.code || "",
            description: existingManual.nameAr || cp.description || "",
            nameAr: existingManual.nameAr || cp.nameAr || "",
            nameEn: existingManual.nameEn || cp.nameEn || "",
            quantity,
            unitPrice: manualPrice,
            optionsCost: manualOptionsCost,
            optionDetails: existingManual.optionDetails || {},
            amount: lineTotal,
            dimensions: existingManual.dimensions || null,
            wallIndex: cp.wallIndex ?? validatedProducts.length % 3,
          });
        }
      }

      if (validatedProducts.length === 0) {
        return res.status(400).json({ message: "لم يتم التعرف على أي منتج صالح" });
      }

      const discountVal = Math.max(0, Math.min(parseFloat(quotation.discount || "0"), subtotal));
      const afterDiscount = Math.max(0, subtotal - discountVal);
      const vat = afterDiscount * 0.15;
      const total = afterDiscount + vat;

      const updated = await storage.updateQuotation(quotationId, {
        items: validatedProducts,
        subtotal: String(subtotal),
        discount: String(discountVal),
        vatAmount: String(vat),
        totalPrice: String(total),
        finalPrice: String(total),
      });

      const allSurveys = await storage.getSiteSurveys({});
      const linkedSurvey = allSurveys.find(s => s.quotationId === quotationId);
      if (linkedSurvey) {
        await storage.updateSiteSurvey(linkedSurvey.id, {
          selectedProducts: validatedProducts.map((p: any) => ({
            productId: p.productId,
            code: p.code,
            name: p.nameAr || p.description || p.code,
            unitPrice: p.unitPrice,
            quantity: p.quantity || 1,
            optionsCost: p.optionsCost || 0,
            optionDetails: p.optionDetails || {},
            dimensions: p.dimensions,
          })),
        } as any);
      }

      const staffUsers = (await storage.getUsers()).filter(u => ["owner", "assistant", "sales"].includes(u.role));
      for (const staff of staffUsers) {
        await storage.createNotification({
          userId: staff.id,
          titleAr: "العميل عدّل المنتجات",
          titleEn: "Customer Modified Products",
          messageAr: `العميل ${customer.fullName} عدّل منتجات عرض السعر #${quotationId}`,
          messageEn: `Customer ${customer.fullName} modified products in quotation #${quotationId}`,
          type: "info",
          relatedEntity: "quotation",
          relatedId: quotationId,
          isRead: false,
        });
      }

      res.json({ message: "تم تحديث المنتجات", quotation: updated });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/customer-portal/site-surveys", requirePortalAuth, async (req, res) => {
    try {
      const customer = (req as any).portalCustomer;
      const quotations = await storage.getQuotationsByCustomer(customer.id);
      const quotationIds = quotations.map(q => q.id);
      const allSurveys = await storage.getSiteSurveys({});
      const customerSurveys = allSurveys
        .filter(s => s.quotationId && quotationIds.includes(s.quotationId))
        .map(s => ({ ...s, shareToken: generateShareToken(s.id) }));
      res.json(customerSurveys);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TASK #5: Payment Receipts
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/payments/:id/receipt-data", requireAuth, async (req, res) => {
    try {
      const payment = await storage.getPayment(parseInt(req.params.id));
      if (!payment) return res.status(404).json({ message: "الدفعة غير موجودة" });

      const contract = payment.contractId ? await storage.getContract(payment.contractId) : null;
      const customer = contract?.customerId ? await storage.getCustomer(contract.customerId) : null;
      const settings = await storage.getCompanySettings();

      res.json({
        payment,
        contract,
        customer,
        company: settings,
        receiptNumber: `RCP-${String(payment.id).padStart(5, "0")}`,
        issuedAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب بيانات السند" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TASK #5: Financial Manager — approved orders ready for invoicing
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/finance/ready-to-invoice", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const allContracts = await storage.getContracts();
      const allQuotations = await storage.getQuotations();
      const allInvoices = await storage.getInvoices();
      const approvedQuotations = allQuotations.filter(q => q.status === "approved");

      const contractIdsWithActiveInvoice = new Set(
        allInvoices
          .filter((inv: { status: string; contractId: number | null }) => inv.contractId && inv.status !== "cancelled")
          .map((inv: { contractId: number | null }) => inv.contractId)
      );

      const result: Array<{ quotation: typeof allQuotations[0]; customer: Awaited<ReturnType<typeof storage.getCustomer>> | null; contract: null }> = [];
      for (const q of approvedQuotations) {
        const existingContract = allContracts.find(c => c.quotationId === q.id);
        if (!existingContract) {
          const customer = q.customerId ? await storage.getCustomer(q.customerId) : null;
          result.push({ quotation: q, customer, contract: null });
        }
      }

      const contractsReadyForInvoice: Array<{ contract: typeof allContracts[0]; customer: Awaited<ReturnType<typeof storage.getCustomer>> | null; payments: Awaited<ReturnType<typeof storage.getPaymentsByContract>>; hasInvoice: boolean }> = [];
      for (const c of allContracts) {
        if (c.status === "active") {
          const hasInvoice = contractIdsWithActiveInvoice.has(c.id);
          if (!hasInvoice) {
            const payments = await storage.getPaymentsByContract(c.id);
            const customer = c.customerId ? await storage.getCustomer(c.customerId) : null;
            contractsReadyForInvoice.push({ contract: c, customer, payments, hasInvoice: false });
          }
        }
      }

      res.json({ readyForContract: result, readyForPayment: contractsReadyForInvoice });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  return httpServer;
}
