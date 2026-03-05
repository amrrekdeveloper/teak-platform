import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireRole } from "./auth";
import { seedDatabase } from "./seed";
import {
  insertCustomerSchema, insertProductSchema, insertWoodTypeSchema,
  insertDoorTypeSchema, insertQuotationSchema, insertContractSchema,
  insertPaymentSchema, insertInvoiceSchema, insertUserSchema,
  insertCompanySettingsSchema, insertWorkOrderSchema, insertProductionStageSchema,
} from "@shared/schema";

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

  app.post("/api/quote-request", async (req, res) => {
    try {
      const { fullName, phone, city, productInterest, notes } = req.body;
      if (!fullName || !phone) {
        return res.status(400).json({
          message: "الاسم ورقم الجوال مطلوبان",
          messageEn: "Name and phone are required",
        });
      }
      const customer = await storage.createCustomer({
        fullName,
        phone,
        city,
        source: "website",
        notes: `${productInterest ? `اهتمام: ${productInterest}. ` : ""}${notes || ""}`,
      });

      const salesUsers = (await storage.getUsers()).filter(u => u.role === "sales");
      for (const salesUser of salesUsers) {
        await storage.createNotification({
          userId: salesUser.id,
          titleAr: "طلب عرض سعر جديد",
          titleEn: "New Quote Request",
          messageAr: `طلب عرض سعر من ${fullName} - ${phone}`,
          messageEn: `Quote request from ${fullName} - ${phone}`,
          type: "action",
          relatedEntity: "customer",
          relatedId: customer.id,
          isRead: false,
        });
      }

      res.status(201).json({ message: "تم إرسال طلبك بنجاح", customer });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في إرسال الطلب" });
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
      const updated = await storage.updateQuotation(parseInt(req.params.id), req.body);
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

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markNotificationRead(parseInt(req.params.id));
      res.json({ success: true });
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

  return httpServer;
}
