import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireRole, comparePasswords, hashPassword } from "./auth";
import { seedDatabase } from "./seed";
import { db, pool } from "./db";
import { verifyFirebaseToken } from "./firebase-admin";
import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "survey-files");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DELIVERY_PHOTOS_DIR = path.join(process.cwd(), "uploads", "delivery-photos");
fs.mkdirSync(DELIVERY_PHOTOS_DIR, { recursive: true });

const surveyFileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safeBase = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safeBase}`);
  },
});

const surveyFileUpload = multer({
  storage: surveyFileStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

const deliveryPhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DELIVERY_PHOTOS_DIR),
  filename: (_req, file, cb) => {
    const safeBase = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safeBase}`);
  },
});

const ALLOWED_DELIVERY_PHOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const deliveryPhotoUpload = multer({
  storage: deliveryPhotoStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DELIVERY_PHOTO_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed"));
    }
  },
});
import {
  insertCustomerSchema, insertProductSchema, insertWoodTypeSchema,
  insertDoorTypeSchema, insertQuotationSchema, insertContractSchema,
  insertPaymentSchema, insertInvoiceSchema, insertUserSchema,
  insertCompanySettingsSchema, insertWorkOrderSchema, insertProductionStageSchema,
  insertDesignAssignmentSchema, insertWarrantySchema,
  productionStages,
  type OrderStageValue,
  type PaymentSchedule,
} from "@shared/schema";

async function setOrderStage(quotationId: number, stage: OrderStageValue) {
  try {
    await storage.updateQuotation(quotationId, { orderStage: stage });
  } catch (e) {
    console.warn(`setOrderStage(${quotationId}, ${stage}) failed:`, e);
  }
}

async function materializePaymentSchedules(quotationId: number, customerId: number, contractId: number) {
  try {
    const quotation = await storage.getQuotation(quotationId);
    const installments = (quotation as any)?.paymentInstallments;
    if (!Array.isArray(installments) || installments.length === 0) return;

    const finalPrice = parseFloat((quotation as any)?.finalPrice || (quotation as any)?.totalPrice || (quotation as any)?.subtotal || "0") || 0;
    const existing = await storage.getPaymentSchedulesByQuotation(quotationId);
    if (existing.length > 0) return;

    for (let i = 0; i < installments.length; i++) {
      const inst = installments[i];
      const pct = parseFloat(inst.percentage) || 0;
      const amount = finalPrice > 0 ? ((pct / 100) * finalPrice).toFixed(2) : "0";
      await storage.createPaymentSchedule({
        quotationId,
        customerId,
        contractId,
        installmentNumber: i + 1,
        amount,
        percentage: String(pct),
        triggerStage: inst.triggerStage || "on_approval",
        dueDate: null,
        status: inst.triggerStage === "on_approval" ? "due" : "pending",
        notes: inst.label || null,
      } as any);
    }
  } catch (e) {
    console.warn("materializePaymentSchedules failed:", e);
  }
}

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

  // Authenticated endpoint to serve uploaded survey design files from disk.
  // Verifies the requesting user has access to the survey that owns the file.
  app.get("/api/uploads/survey-files/:filename", requireAuth, async (req, res) => {
    const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
    const urlPath = `/uploads/survey-files/${filename}`;
    // Lookup file and verify user has survey access
    const fileRow = await pool.query(
      `SELECT sdf.id, sdf.survey_id FROM survey_design_files sdf WHERE sdf.file_url = $1 LIMIT 1`,
      [urlPath]
    );
    if (fileRow.rows.length === 0) return res.status(404).json({ message: "الملف غير موجود" });
    const surveyId = fileRow.rows[0].survey_id;
    const { allowed } = await verifySurveyAccess(surveyId, req);
    if (!allowed) return res.status(403).json({ message: "غير مصرح" });
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "الملف غير موجود على القرص" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    fs.createReadStream(filePath).pipe(res);
  });

  // Customer-accessible endpoint: only for files attached to a quote owned by the portal customer.
  // Uses quotation.attached_design_files (source of truth) OR attach_to_quote flag as fallback.
  app.get("/api/customer/survey-files/:filename", requirePortalAuth, async (req, res) => {
    const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
    const urlPath = `/uploads/survey-files/${filename}`;
    const portalCustomer = (req as any).portalCustomer;
    // Check by source-of-truth: file ID in quotation.attached_design_files, customer owns quote
    const check = await pool.query(
      `SELECT sdf.id FROM survey_design_files sdf
       JOIN quotations q ON q.id = sdf.quotation_id
       WHERE sdf.file_url = $1
         AND q.customer_id = $2
         AND (
           (q.attached_design_files IS NOT NULL AND q.attached_design_files != '[]'::jsonb
             AND q.attached_design_files @> to_jsonb(sdf.id))
           OR sdf.attach_to_quote = TRUE
         )
       LIMIT 1`,
      [urlPath, portalCustomer.id]
    );
    if (check.rows.length === 0) return res.status(403).json({ message: "غير مصرح" });
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "الملف غير موجود" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    fs.createReadStream(filePath).pipe(res);
  });

  await seedDatabase();

  // Ensure appointments table has all required columns (safe migration)
  try {
    await db.execute(`
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id);
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS quotation_id INTEGER REFERENCES quotations(id);
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS title TEXT;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_date DATE;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS start_time TEXT;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS end_time TEXT;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fail_reason TEXT;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fail_notes TEXT;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rescheduled_to INTEGER;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `);
  } catch (migrationError) {
    console.warn("Appointment migration warning (non-fatal):", migrationError instanceof Error ? migrationError.message : String(migrationError));
  }

  try {
    await db.execute(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'cancelled' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'quotation_status')) THEN
          ALTER TYPE quotation_status ADD VALUE 'cancelled';
        END IF;
      END $$;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
    `);
  } catch (cancellationMigrationError) {
    console.warn("Quotation cancellation migration warning (non-fatal):", cancellationMigrationError instanceof Error ? cancellationMigrationError.message : String(cancellationMigrationError));
  }

  try {
    await db.execute(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS order_stage TEXT DEFAULT 'new'`);
    // Step 1: status-based baseline for rows with null or legacy stage values
    await db.execute(`
      UPDATE quotations SET order_stage = CASE
        WHEN status = 'cancelled' THEN 'cancelled'
        WHEN status IN ('rejected', 'expired') THEN 'rejected'
        WHEN status = 'approved' THEN 'quote_approved'
        WHEN status = 'sent' THEN 'quote_sent'
        WHEN status = 'draft' THEN 'quote_draft'
        WHEN status = 'open' AND assigned_to IS NOT NULL THEN 'quote_draft'
        WHEN status = 'open' AND assigned_to IS NULL THEN 'new'
        WHEN status = 'requested' THEN 'new'
        ELSE 'new'
      END WHERE order_stage IS NULL OR order_stage IN ('appointment', 'survey', 'production')
    `);
    // Step 2: promote to appointment_scheduled if a linked appointment exists (unless further advanced)
    await db.execute(`
      UPDATE quotations SET order_stage = 'appointment_scheduled'
      WHERE order_stage NOT IN ('cancelled','rejected','quote_sent','quote_approved','in_production','delivered')
        AND EXISTS (SELECT 1 FROM appointments WHERE appointments.quotation_id = quotations.id LIMIT 1)
    `);
    // Step 3: promote to survey_done if a linked site survey exists (unless further advanced)
    await db.execute(`
      UPDATE quotations SET order_stage = 'survey_done'
      WHERE order_stage NOT IN ('cancelled','rejected','quote_sent','quote_approved','in_production','delivered')
        AND EXISTS (SELECT 1 FROM site_surveys WHERE site_surveys.quotation_id = quotations.id LIMIT 1)
    `);
    // Step 4: promote to in_production if a linked work order exists (unless delivered/cancelled)
    await db.execute(`
      UPDATE quotations SET order_stage = 'in_production'
      WHERE order_stage NOT IN ('cancelled','rejected','delivered')
        AND EXISTS (
          SELECT 1 FROM contracts c
          JOIN work_orders wo ON wo.contract_id = c.id
          WHERE c.quotation_id = quotations.id LIMIT 1
        )
    `);
    // Step 5: promote to delivered if work order status = 'delivered'
    await db.execute(`
      UPDATE quotations SET order_stage = 'delivered'
      WHERE order_stage NOT IN ('cancelled','rejected')
        AND EXISTS (
          SELECT 1 FROM contracts c
          JOIN work_orders wo ON wo.contract_id = c.id
          WHERE c.quotation_id = quotations.id AND wo.status = 'delivered' LIMIT 1
        )
    `);
  } catch (orderStageMigrationError) {
    console.warn("Order stage migration warning (non-fatal):", orderStageMigrationError instanceof Error ? orderStageMigrationError.message : String(orderStageMigrationError));
  }

  // Ensure quotations has all required columns for attach/approval workflow
  try {
    await db.execute(`
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS attached_design_files JSONB DEFAULT '[]';
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS payment_receipt_data TEXT;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS payment_receipt_name TEXT;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS approved_by INTEGER;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS attachment_data TEXT;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS attachment_name TEXT;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS attachment_mime TEXT;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS show_attachment_to_customer BOOLEAN DEFAULT FALSE;
    `);
  } catch (e) {
    console.warn("Quotations migration (non-fatal):", e instanceof Error ? e.message : e);
  }

  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS survey_design_files (
        id SERIAL PRIMARY KEY,
        survey_id INTEGER NOT NULL,
        quotation_id INTEGER,
        file_name TEXT NOT NULL,
        file_label TEXT,
        file_data TEXT,
        file_url TEXT,
        mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        file_size INTEGER DEFAULT 0,
        attach_to_quote BOOLEAN NOT NULL DEFAULT FALSE,
        uploaded_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(`ALTER TABLE survey_design_files ADD COLUMN IF NOT EXISTS file_label TEXT`);
    await db.execute(`ALTER TABLE survey_design_files ADD COLUMN IF NOT EXISTS file_url TEXT`);
    await db.execute(`ALTER TABLE survey_design_files ALTER COLUMN file_data DROP NOT NULL`);
  } catch (designFilesMigrationError) {
    console.warn("Survey design files table migration (non-fatal):", designFilesMigrationError instanceof Error ? designFilesMigrationError.message : String(designFilesMigrationError));
  }

  // Task #30: DB migrations for payment_schedules, warranty_months, payment_installments
  try {
    await db.execute(`
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS warranty_months INTEGER DEFAULT 24;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS payment_installments JSONB DEFAULT '[]';
    `);
    await db.execute(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_schedule_status') THEN
          CREATE TYPE payment_schedule_status AS ENUM ('pending','due','paid','overdue');
        END IF;
      END $$;
    `);
    await db.execute(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_schedule_trigger') THEN
          CREATE TYPE payment_schedule_trigger AS ENUM ('on_approval','on_production','on_delivery','on_installation','on_completion');
        END IF;
      END $$;
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS payment_schedules (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER NOT NULL REFERENCES quotations(id),
        contract_id INTEGER,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        installment_number INTEGER NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        percentage NUMERIC(5,2),
        trigger_stage TEXT NOT NULL,
        due_date DATE,
        status TEXT NOT NULL DEFAULT 'pending',
        paid_at TIMESTAMP,
        payment_method TEXT,
        receipt_data TEXT,
        confirmed_by INTEGER REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(`
      ALTER TABLE warranties ADD COLUMN IF NOT EXISTS duration_months INTEGER DEFAULT 24;
      ALTER TABLE warranties ADD COLUMN IF NOT EXISTS quotation_id INTEGER REFERENCES quotations(id);
    `);
  } catch (task30MigrationError) {
    console.warn("Task #30 migration warning (non-fatal):", task30MigrationError instanceof Error ? task30MigrationError.message : String(task30MigrationError));
  }

  // Task #33: DB migration for delivery_photos column
  try {
    await db.execute(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_photos TEXT[]`);
  } catch (task33MigrationError) {
    console.warn("Task #33 migration warning (non-fatal):", task33MigrationError instanceof Error ? task33MigrationError.message : String(task33MigrationError));
  }

  // Startup cleanup: delete orphaned empty draft quotations older than 1 hour.
  // Items are stored as JSONB in quotations.items (no separate quotation_items table exists).
  // Condition: status=draft, finalPrice=0, created >1h ago, items array empty.
  try {
    const cleanupResult = await pool.query(`
      DELETE FROM quotations
      WHERE status = 'draft'
        AND (final_price = '0' OR final_price = '0.00' OR final_price IS NULL)
        AND created_at < NOW() - INTERVAL '1 hour'
        AND (items IS NULL OR jsonb_array_length(items) = 0)
      RETURNING id
    `);
    if (cleanupResult.rowCount && cleanupResult.rowCount > 0) {
      console.log(`[startup] Cleaned up ${cleanupResult.rowCount} empty draft quotation(s)`);
    }
  } catch (cleanupError) {
    console.warn("Empty draft cleanup (non-fatal):", cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
  }

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
        orderStage: "new",
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
      const isAdmin = ["owner", "it", "assistant"].includes(currentUser?.role || "");
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

  app.post("/api/users", requireRole("owner", "it", "assistant"), async (req, res) => {
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

  app.patch("/api/users/:id", requireRole("owner", "it", "assistant"), async (req, res) => {
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

  app.get("/api/users/reset-requests", requireRole("owner", "it", "assistant"), async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const requests = await storage.getPasswordResetRequests(status);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.patch("/api/users/reset-requests/:id/resolve", requireRole("owner", "it", "assistant"), async (req, res) => {
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
      const isManager = user?.role === "owner" || user?.role === "assistant" || user?.role === "it" || user?.role === "accountant" || user?.role === "customer_service" || user?.role === "delivery" || user?.role === "production" || user?.role === "installation";
      if (isManager) {
        res.json(await storage.getCustomers());
      } else {
        const allQuotations = await storage.getQuotations();
        const openPoolStatuses = ["open", "draft", "requested"];
        const relevantQuotations = allQuotations.filter((q: any) =>
          q.assignedTo === userId ||
          (q.assignedTo === null && openPoolStatuses.includes(q.status))
        );
        const myCustomerIds = [...new Set(relevantQuotations.map((q: any) => q.customerId).filter(Boolean))];
        const allCustomers = await storage.getCustomers();
        res.json(allCustomers.filter((c: any) => myCustomerIds.includes(c.id)));
      }
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/customers/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).session.userId!;
      const user = await storage.getUser(userId);
      const isManager = user?.role === "owner" || user?.role === "assistant" || user?.role === "it" || user?.role === "accountant" || user?.role === "customer_service" || user?.role === "delivery" || user?.role === "production" || user?.role === "installation";
      const customer = await storage.getCustomer(parseInt(req.params.id));
      if (!customer) return res.status(404).json({ message: "العميل غير موجود" });
      if (!isManager) {
        const allQuotations = await storage.getQuotations();
        const openPoolStatuses = ["open", "draft", "requested"];
        const hasAccess = allQuotations.some((q: any) =>
          q.customerId === customer.id &&
          (q.assignedTo === userId || (q.assignedTo === null && openPoolStatuses.includes(q.status)))
        );
        if (!hasAccess) return res.status(403).json({ message: "غير مصرح لك بعرض هذا العميل" });
      }
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

  app.post("/api/adeko-products", requireRole("owner", "assistant", "it"), async (req, res) => {
    try {
      const { code, descriptionAr, descriptionEn, groupCode, groupNameAr, groupNameEn,
        manufacturingW, manufacturingH, manufacturingD, designW, designH, designD,
        priceBeforeVat, usageType } = req.body;
      if (!code || !descriptionEn || !groupCode) return res.status(400).json({ message: "الكود والوصف والمجموعة مطلوبة" });
      const price = parseFloat(priceBeforeVat || "0");
      const groupNames: Record<string, { ar: string; en: string }> = {
        TK1: { ar: "وحدات قاعدة", en: "TEAK BASE UNIT" },
        TK2: { ar: "وحدات حوض", en: "TEAK SINK UNIT" },
        TK3: { ar: "وحدات علوية", en: "TEAK WALL UNIT" },
        TK4: { ar: "وحدات طويلة", en: "TEAK TALL UNIT" },
        TK5: { ar: "وحدات ميكانيزم", en: "TEAK MECANISM UNIT" },
        TK6: { ar: "ألواح وجوانب", en: "TEAK shelf-panel-side" },
      };
      const gn = groupNames[groupCode] || { ar: groupNameAr || groupCode, en: groupNameEn || groupCode };
      const product = await storage.createAdekoProduct({
        code: code.trim().toUpperCase(),
        descriptionEn: descriptionEn.trim(),
        descriptionAr: descriptionAr?.trim() || descriptionEn.trim(),
        groupCode,
        groupNameAr: gn.ar,
        groupNameEn: gn.en,
        manufacturingW: manufacturingW ? String(parseFloat(manufacturingW).toFixed(2)) : null,
        manufacturingH: manufacturingH ? String(parseFloat(manufacturingH).toFixed(2)) : null,
        manufacturingD: manufacturingD ? String(parseFloat(manufacturingD).toFixed(2)) : null,
        designW: designW ? String(parseFloat(designW).toFixed(2)) : null,
        designH: designH ? String(parseFloat(designH).toFixed(2)) : null,
        designD: designD ? String(parseFloat(designD).toFixed(2)) : null,
        priceBeforeVat: String(price.toFixed(2)),
        priceAfterVat: String((price * 1.15).toFixed(2)),
        usageType: usageType || "kitchen",
        active: true,
      });
      res.status(201).json(product);
    } catch (error: any) {
      if (error?.code === "23505") return res.status(400).json({ message: "الكود مستخدم مسبقاً" });
      res.status(500).json({ message: "حدث خطأ في إضافة المنتج" });
    }
  });

  app.patch("/api/adeko-products/:id", requireRole("owner", "assistant", "it"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "معرّف غير صالح" });
      const { priceBeforeVat, priceAfterVat, designW, designH, designD, usageType, active } = req.body as {
        priceBeforeVat?: string; priceAfterVat?: string; designW?: string; designH?: string; designD?: string;
        usageType?: string; active?: boolean;
      };
      const updateData: Record<string, string | boolean> = {};
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
      if (usageType !== undefined && ["kitchen", "wardrobe", "both"].includes(usageType)) {
        updateData.usageType = usageType;
      }
      if (active !== undefined) updateData.active = active;
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const checkAndExpire = async (quotations: any[]) => {
        for (const q of quotations) {
          if (q.validUntil && ["draft", "sent"].includes(q.status)) {
            const validDate = new Date(q.validUntil);
            validDate.setHours(0, 0, 0, 0);
            if (validDate < today) {
              try {
                await storage.updateQuotation(q.id, { status: "expired" });
                q.status = "expired";
              } catch (err) {
                console.error(`[expire-check] Failed to expire quotation ${q.id}:`, err);
              }
            }
          }
        }
        return quotations;
      };

      if (user?.role === "owner" || user?.role === "assistant") {
        const all = await storage.getQuotations();
        res.json(await checkAndExpire(all));
      } else if (user?.role === "sales") {
        const all = await storage.getQuotations();
        const filtered = all.filter((q: any) =>
          q.assignedTo === userId ||
          ((q.status === "open" || q.status === "draft" || q.status === "requested") && !q.assignedTo)
        );
        res.json(await checkAndExpire(filtered));
      } else {
        const all = await storage.getQuotations();
        const filtered = all.filter((q: any) => q.assignedTo === userId);
        res.json(await checkAndExpire(filtered));
      }
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/quotations/:id", requireAuth, async (req, res) => {
    try {
      const quotation = await storage.getQuotation(parseInt(req.params.id));
      if (!quotation) return res.status(404).json({ message: "عرض السعر غير موجود" });
      const requestingUser = await storage.getUser(req.session.userId!);
      if (requestingUser?.role === "sales" &&
          Number(quotation.assignedTo) !== Number(req.session.userId) &&
          Number(quotation.createdBy) !== Number(req.session.userId)) {
        return res.status(403).json({ message: "غير مصرح لك بالاطلاع على هذا الطلب", messageEn: "You are not authorized to view this order" });
      }
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
      // Always derive orderStage from initial status if not explicitly provided
      if (!data.orderStage) {
        const st = data.status || "draft";
        if (st === "cancelled") data.orderStage = "cancelled";
        else if (st === "rejected" || st === "expired") data.orderStage = "rejected";
        else if (st === "approved") data.orderStage = "quote_approved";
        else if (st === "sent") data.orderStage = "quote_sent";
        else if (st === "draft" || st === "open") data.orderStage = "quote_draft";
        else data.orderStage = "new";
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
        if (Number(quotation.assignedTo) !== Number(userId) && Number(quotation.createdBy) !== Number(userId)) {
          return res.status(403).json({ message: "غير مصرح", messageEn: "Not authorized to modify this quotation" });
        }
        // Block sales from changing authorization-sensitive fields
        delete req.body.assignedTo;
        delete req.body.assignedAt;
        delete req.body.createdBy;
        delete req.body.approvedBy;
        delete req.body.approvedAt;
        delete req.body.paymentReceiptData;
        delete req.body.paymentReceiptName;
        // Block status escalation: sales may only set draft/sent, not approved/rejected
        if (req.body.status && !["draft", "sent"].includes(req.body.status)) {
          delete req.body.status;
        }
      }
      const data = { ...req.body };
      if (data.assignedTo) {
        if (quotation.assignedTo !== data.assignedTo) {
          data.assignedAt = new Date();
        }
      }
      if (data.status === "sent" && !data.orderStage) data.orderStage = "quote_sent";
      if (data.status === "approved" && !data.orderStage) data.orderStage = "quote_approved";
      if (data.status === "rejected" && !data.orderStage) data.orderStage = "rejected";
      if (data.status === "expired" && !data.orderStage) data.orderStage = "rejected";
      if (data.status === "cancelled" && !data.orderStage) data.orderStage = "cancelled";
      if ((data.status === "draft" || data.status === "open") && !data.orderStage) data.orderStage = "quote_draft";
      delete data.id;
      delete data.createdAt;
      const updated = await storage.updateQuotation(parseInt(req.params.id), data);
      if (!updated) return res.status(404).json({ message: "عرض السعر غير موجود" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/quotations/:id/approve", requireRole("owner", "assistant", "sales"), async (req, res) => {
    try {
      const quotationId = parseInt(req.params.id);
      const userId = req.session.userId!;
      const { paymentReceiptData, paymentReceiptName, paymentAmount, paymentMethod } = req.body || {};

      const quotation = await storage.getQuotation(quotationId);
      if (!quotation) return res.status(404).json({ message: "عرض السعر غير موجود" });

      const requestingUser = await storage.getUser(userId);
      const numUserId = Number(userId);
      if (requestingUser?.role === "sales") {
        if (!["draft", "sent"].includes(quotation.status) ||
            (Number(quotation.assignedTo) !== numUserId && Number(quotation.createdBy) !== numUserId)) {
          return res.status(403).json({ message: "غير مصرح: يمكن للمندوب اعتماد عروض الأسعار المسندة إليه فقط" });
        }
      }

      const updateData: any = { status: "approved", orderStage: "quote_approved", approvedBy: userId, approvedAt: new Date() };
      if (paymentReceiptData) { updateData.paymentReceiptData = paymentReceiptData; updateData.paymentReceiptName = paymentReceiptName || "receipt"; }
      const updated = await storage.updateQuotation(quotationId, updateData);
      if (!updated) return res.status(404).json({ message: "عرض السعر غير موجود" });

      const allContracts = await storage.getContracts?.() ?? [];
      const existingContract = allContracts.find((c: any) => c.quotationId === quotationId);
      let contract = existingContract;
      if (!existingContract) {
        const q = quotation as any;
        const totalAmt = q.finalPrice || q.totalPrice || q.totalWithVat || q.total || quotation.subtotal || "0";
        const customer = await storage.getCustomer(quotation.customerId);
        contract = await storage.createContract({
          contractNumber: `CNT-${Date.now().toString(36).toUpperCase()}`,
          quotationId,
          customerId: quotation.customerId,
          totalAmount: totalAmt,
          paidAmount: "0",
          remainingAmount: totalAmt,
          status: "active",
          notes: "تم الاعتماد بواسطة الإدارة",
        });
        const settings = await storage.getCompanySettings();
        const qrData = generateQRData({
          sellerName: settings?.nameAr || "تيك للتصنيع",
          sellerVatNumber: settings?.vatNumber || "310012345600003",
          issuedAt: new Date(),
          totalWithVat: q.finalPrice || q.totalPrice || q.totalWithVat || q.total,
          vatAmount: quotation.vatAmount || "0",
        });
        const subtotalVal = String(quotation.subtotal || q.totalPrice || "0");
        const vatAmountVal = String(quotation.vatAmount || "0");
        const totalWithVatVal = String(q.finalPrice || q.totalPrice || quotation.subtotal || "0");
        await storage.createInvoice({
          type: "simplified_tax_invoice",
          status: "issued",
          customerId: quotation.customerId,
          contractId: contract.id,
          quotationId,
          items: Array.isArray(quotation.items) ? quotation.items : [],
          subtotal: subtotalVal,
          vatRate: String(quotation.vatRate || "15"),
          vatAmount: vatAmountVal,
          totalWithVat: totalWithVatVal,
          sellerName: settings?.nameAr || "تيك للتصنيع",
          sellerVatNumber: settings?.vatNumber || "310012345600003",
          sellerAddress: settings?.address || "",
          buyerName: customer?.fullName || "",
          buyerPhone: customer?.phone || "",
          qrCodeData: qrData,
          issuedAt: new Date(),
        } as any);
      }

      const staffUsers = (await storage.getUsers()).filter((u: any) => ["owner", "assistant", "sales", "accountant"].includes(u.role));
      for (const staff of staffUsers) {
        await storage.createNotification({
          userId: staff.id,
          type: "success",
          titleAr: "تم اعتماد عرض سعر",
          titleEn: "Quotation Approved",
          messageAr: `تم اعتماد عرض السعر رقم ${quotation.quotationNumber || quotationId} وإنشاء العقد`,
          messageEn: `Quotation #${quotation.quotationNumber || quotationId} approved and contract created`,
        });
      }

      if (contract) {
        await materializePaymentSchedules(quotationId, quotation.customerId, contract.id);
      }

      // Create a pending payment for the accountant to confirm if receipt was provided
      if (paymentReceiptData && contract) {
        const q = quotation as any;
        const defaultAmount = q.finalPrice || q.totalPrice || quotation.subtotal || "0";
        const validMethods = ["cash", "bank_transfer", "pos", "check", "other"];
        const safeMethod = validMethods.includes(paymentMethod) ? paymentMethod : "bank_transfer";
        const payment = await storage.createPayment({
          contractId: contract.id,
          customerId: quotation.customerId,
          amount: paymentAmount && parseFloat(paymentAmount) > 0 ? paymentAmount : defaultAmount,
          method: safeMethod,
          paymentStage: "deposit",
          notes: `دفعة مسجّلة عند الاعتماد في المعرض — بانتظار تأكيد المحاسب`,
          attachmentUrl: paymentReceiptData,
          recordedBy: userId,
          status: "pending",
        });
        const accountantStaff = (await storage.getUsers()).filter((u: any) => ["owner", "assistant", "accountant"].includes(u.role));
        for (const staff of accountantStaff) {
          await storage.createNotification({
            userId: staff.id,
            type: "action",
            titleAr: "وصل دفع جديد بانتظار التأكيد",
            titleEn: "New Payment Receipt Pending Confirmation",
            messageAr: `المندوب رفع وصل دفع للعميل ${(await storage.getCustomer(quotation.customerId))?.fullName || ""} بمبلغ ${payment.amount} ر.س`,
            messageEn: `Sales rep uploaded payment receipt of ${payment.amount} SAR`,
            relatedEntity: "payment",
            relatedId: payment.id,
          });
        }
      }

      res.json({ ...updated, contract });
    } catch (error) {
      console.error("Approve quotation error:", error);
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/quotations/:id/reject", requireRole("owner", "assistant", "sales"), async (req, res) => {
    try {
      const quotationId = parseInt(req.params.id);
      const userId = req.session.userId!;

      const quotation = await storage.getQuotation(quotationId);
      if (!quotation) return res.status(404).json({ message: "عرض السعر غير موجود" });

      const requestingUser = await storage.getUser(userId);
      if (requestingUser?.role === "sales") {
        if (quotation.status !== "draft" || quotation.createdBy !== userId) {
          return res.status(403).json({ message: "غير مصرح: يمكن للمندوب رفض مسوداته فقط" });
        }
      }

      const updated = await storage.updateQuotation(quotationId, { status: "rejected", orderStage: "rejected" });
      if (!updated) return res.status(404).json({ message: "عرض السعر غير موجود" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/quotations/:id/cancel", requireRole("owner", "assistant", "sales"), async (req, res) => {
    try {
      const quotationId = parseInt(req.params.id);
      const { reason, notes } = req.body;
      if (!reason) return res.status(400).json({ message: "سبب الإلغاء مطلوب", messageEn: "Cancellation reason is required" });
      const quotation = await storage.getQuotation(quotationId);
      if (!quotation) return res.status(404).json({ message: "الطلب غير موجود", messageEn: "Order not found" });
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (user?.role === "sales" && quotation.assignedTo !== userId) {
        return res.status(403).json({ message: "غير مصرح لك بإلغاء هذا الطلب", messageEn: "You are not authorized to cancel this order" });
      }
      const fullReason = notes?.trim() ? `${reason}: ${notes.trim()}` : reason;
      const now = new Date();
      const updated = await storage.updateQuotation(quotationId, {
        status: "cancelled",
        orderStage: "cancelled",
        cancellationReason: fullReason,
        cancelledAt: now,
      });
      const cancellingUser = await storage.getUser(userId);
      const staffUsers = (await storage.getUsers()).filter(u => ["owner", "assistant"].includes(u.role) && u.id !== userId);
      for (const staff of staffUsers) {
        await storage.createNotification({
          userId: staff.id,
          titleAr: "تم إلغاء طلب",
          titleEn: "Order Cancelled",
          messageAr: `قام ${cancellingUser?.fullNameAr || ""} بإلغاء الطلب #${quotation.quotationNumber || quotationId} — السبب: ${fullReason}`,
          messageEn: `${cancellingUser?.fullNameEn || ""} cancelled order #${quotation.quotationNumber || quotationId} — Reason: ${fullReason}`,
          type: "warning",
          relatedEntity: "quotation",
          relatedId: quotationId,
          isRead: false,
        });
      }
      res.json(updated);
    } catch (error) {
      console.error("Cancel order error:", error);
      res.status(500).json({ message: "حدث خطأ في إلغاء الطلب", messageEn: "Error cancelling order" });
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
      const willTransitionToDraft = quotation.status === "requested" || quotation.status === "open";
      const updated = await storage.updateQuotation(quotationId, {
        assignedTo: Number(newAssigneeId),
        assignedAt: now,
        previousAssignees,
        status: willTransitionToDraft ? "draft" : quotation.status,
        orderStage: willTransitionToDraft ? "quote_draft" : (quotation.orderStage || "new"),
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
      const { fullName, phone, productDescription, notes, city, district, buildingStatus } = req.body;
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
          city: city || null,
          district: district || null,
          buildingStatus: buildingStatus || null,
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
        orderStage: "new",
        assignedTo: isSalesRep ? req.session.userId : null,
        assignedAt: isSalesRep ? new Date() : null,
        claimedAt: isSalesRep ? new Date() : null,
        city: city || null,
        notes: [
          `المنتج: ${productDescription}`,
          notes ? `ملاحظات: ${notes}` : "",
          district ? `الحي: ${district}` : "",
          buildingStatus === "ready" ? "حالة البناء: جاهز" : buildingStatus === "under_construction" ? "حالة البناء: قيد الإنشاء" : buildingStatus === "under_renovation" ? "حالة البناء: قيد التجديد" : "",
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

  app.post("/api/payments", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const paymentStatus = req.body.status || "confirmed";

      const data = { ...req.body, recordedBy: req.session.userId, status: paymentStatus };
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

        await storage.updatePayment(payment.id, { invoiceId: invoice.id } as any).catch(() => {});
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

  app.get("/api/work-orders", requireAuth, requireRole("owner", "assistant", "production", "designer", "sales", "delivery", "installation"), async (req, res) => {
    try {
      const allOrders = await storage.getWorkOrders();
      const status = req.query.status as string | undefined;
      const filtered = status ? allOrders.filter(wo => wo.status === status) : allOrders;
      res.json(filtered);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب أوامر العمل", messageEn: "Error fetching work orders" });
    }
  });

  app.get("/api/work-orders/:id", requireAuth, requireRole("owner", "assistant", "production", "designer", "sales", "delivery", "installation"), async (req, res) => {
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

      if (wo.contractId) {
        const contract = await storage.getContract(wo.contractId);
        if (contract?.quotationId) {
          const q = await storage.getQuotation(contract.quotationId);
          if (q && !["cancelled", "rejected", "delivered"].includes(q.orderStage || "")) {
            await setOrderStage(contract.quotationId, "in_production");
          }
        }
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
      if (req.body.status && ["completed", "delivered", "installed"].includes(req.body.status)) {
        if (existing.contractId) {
          const contract = await storage.getContract(existing.contractId);
          if (contract?.quotationId) {
            await setOrderStage(contract.quotationId, "delivered");
          }
        }
      }
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
    try {
      const delivery = await storage.createDelivery(req.body);
      // Automatically advance work order to "ready_for_delivery" stage when delivery is scheduled
      if (delivery.workOrderId) {
        const wo = await storage.getWorkOrder(delivery.workOrderId);
        if (wo && wo.status === "ready") {
          try {
            const quotation = wo.quotationId ? await storage.getQuotation(wo.quotationId) : null;
            if (quotation) {
              await setOrderStage(quotation.id, "ready_for_delivery");
            }
          } catch (stageErr) {
            console.warn("Stage transition on delivery create (non-fatal):", stageErr);
          }
        }
      }
      res.status(201).json(delivery);
    } catch (error) { console.error(error); res.status(500).json({ message: "حدث خطأ", messageEn: "Error creating delivery" }); }
  });

  app.patch("/api/deliveries/:id", requireRole("owner", "assistant", "delivery"), async (req, res) => {
    try {
      const updated = await storage.updateDelivery(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "غير موجود", messageEn: "Not found" });
      res.json(updated);
    } catch (error) { res.status(500).json({ message: "حدث خطأ", messageEn: "Error updating delivery" }); }
  });

  app.post("/api/deliveries/:id/photos", requireRole("owner", "assistant", "delivery"), deliveryPhotoUpload.array("photos", 10), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) return res.status(400).json({ message: "لا توجد صور مرفوعة", messageEn: "No photos uploaded" });
      const newFilePaths = files.map(f => path.join(DELIVERY_PHOTOS_DIR, f.filename));
      const newPhotoPaths = files.map(f => `/uploads/delivery-photos/${f.filename}`);

      const cleanupNewFiles = () => {
        for (const fp of newFilePaths) {
          try { fs.unlinkSync(fp); } catch { /* ignore */ }
        }
      };

      const existing = await storage.getDelivery(id);
      if (!existing) {
        cleanupNewFiles();
        return res.status(404).json({ message: "غير موجود", messageEn: "Not found" });
      }

      // Server-side status guard: only allow uploads for in_transit or delivered
      if (existing.status !== "in_transit" && existing.status !== "delivered") {
        cleanupNewFiles();
        return res.status(422).json({ message: "لا يمكن رفع الصور إلا في حالات 'في الطريق' أو 'تم التوصيل'", messageEn: "Photos can only be uploaded for in_transit or delivered deliveries" });
      }

      const existingPhotos: string[] = existing.deliveryPhotos || [];
      const allPhotos = [...existingPhotos, ...newPhotoPaths];
      const updated = await storage.updateDelivery(id, { deliveryPhotos: allPhotos });
      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "حدث خطأ في رفع الصور", messageEn: "Error uploading photos" });
    }
  });

  app.get("/uploads/delivery-photos/:filename", requireRole("owner", "assistant", "delivery", "production", "installation"), async (req, res) => {
    const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
    const photoPath = `/uploads/delivery-photos/${filename}`;
    // Verify that this photo path exists in at least one delivery record
    const allDeliveries = await storage.getDeliveries();
    const hasAccess = allDeliveries.some(d => d.deliveryPhotos && d.deliveryPhotos.includes(photoPath));
    if (!hasAccess) return res.status(403).json({ message: "غير مصرح" });
    const filePath = path.join(DELIVERY_PHOTOS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "الملف غير موجود" });
    res.sendFile(filePath);
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

      const contract = workOrder.contractId ? await storage.getContract(workOrder.contractId) : null;
      const quotation = contract?.quotationId ? await storage.getQuotation(contract.quotationId) : null;
      const warrantyMonths = (quotation as any)?.warrantyMonths || 24;

      const today = new Date();
      const warrantyEnd = new Date(today);
      warrantyEnd.setMonth(warrantyEnd.getMonth() + warrantyMonths);

      const existingWarranties = await storage.getWarranties();
      const alreadyExists = existingWarranties.find(w => w.workOrderId === workOrder.id);

      const warranty = alreadyExists || await storage.createWarranty({
        contractId: workOrder.contractId,
        workOrderId: workOrder.id,
        customerId: workOrder.customerId,
        quotationId: contract?.quotationId || null,
        durationMonths: warrantyMonths,
        startDate: today.toISOString().split("T")[0],
        endDate: warrantyEnd.toISOString().split("T")[0],
        terms: `ضمان ${warrantyMonths} شهراً على التركيب والتصنيع - ${warrantyMonths}-month warranty on installation and manufacturing`,
        status: "active",
      } as any);

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

      const updatedQuotation = await storage.updateQuotation(quotation.id, { status: "approved", orderStage: "quote_approved" });

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

      await materializePaymentSchedules(quotation.id, customer.id, contract.id);

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

      const validStages = ["deposit", "pre_manufacturing", "delivery", "final", "other"];
      const safeStage = validStages.includes(req.body.paymentStage) ? req.body.paymentStage : "deposit";

      const payment = await storage.createPayment({
        contractId,
        customerId: customer.id,
        amount: amount || "0",
        method: paymentMethod || "bank_transfer",
        paymentStage: safeStage,
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

      let quotationAssignedTo: number | null = null;
      if (da.quotationId) {
        const linkedQuotation = await storage.getQuotation(da.quotationId);
        if (linkedQuotation && linkedQuotation.status !== "approved") {
          await storage.updateQuotation(da.quotationId, { status: "approved", orderStage: "quote_approved" });
          quotationAssignedTo = linkedQuotation.assignedTo || null;
        }
      }

      const notifyUserIds = new Set<number>();
      const allUsers = await storage.getUsers();
      for (const u of allUsers) {
        if (u.role === "owner" || u.role === "assistant") notifyUserIds.add(u.id);
      }
      if (da.assignedTo) notifyUserIds.add(da.assignedTo);
      if (quotationAssignedTo) notifyUserIds.add(quotationAssignedTo);

      for (const userId of notifyUserIds) {
        await storage.createNotification({
          userId,
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
        await storage.updateQuotation(da.quotationId, { status: "draft", orderStage: "quote_draft" });
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
      if (appointment.quotationId) {
        const q = await storage.getQuotation(appointment.quotationId);
        if (q && !["cancelled", "rejected", "quote_approved", "quote_sent", "in_production", "delivered"].includes(q.orderStage || "")) {
          await setOrderStage(appointment.quotationId, "appointment_scheduled");
        }
      }
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
      const appointmentId = parseInt(req.params.id);
      let survey = await storage.getSiteSurveyByAppointment(appointmentId);
      if (!survey) {
        const appt = await storage.getAppointment(appointmentId);
        if (appt?.quotationId) {
          const all = await storage.getSiteSurveys({ quotationId: appt.quotationId });
          survey = all[0];
        }
      }
      res.json(survey || null);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/site-surveys", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const body = req.body;

      if (!body.appointmentId) {
        return res.status(400).json({ message: "معرف الموعد مطلوب" });
      }

      const appointment = await storage.getAppointment(body.appointmentId);
      if (!appointment) return res.status(404).json({ message: "الموعد غير موجود" });

      await storage.updateAppointment(body.appointmentId, { status: "attended" });

      const surveyData: any = {
        appointmentId: body.appointmentId,
        customerId: body.customerId || appointment.customerId || null,
        quotationId: body.quotationId || appointment.quotationId || null,
        spaces: body.spaces || null,
        walls: body.walls || null,
        selectedProducts: body.selectedProducts || null,
        notes: body.notes || null,
        photos: body.photos || null,
        createdBy: userId,
      };

      const survey = await storage.createSiteSurvey(surveyData);
      if (surveyData.quotationId) {
        const q = await storage.getQuotation(surveyData.quotationId);
        if (q && !["cancelled", "rejected", "quote_approved", "quote_sent", "in_production", "delivered"].includes(q.orderStage || "")) {
          await setOrderStage(surveyData.quotationId, "survey_done");
        }
      }
      res.status(201).json(survey);
    } catch (error) {
      console.error("Create site survey error:", error);
      res.status(500).json({ message: "حدث خطأ في إنشاء نموذج الزيارة" });
    }
  });

  app.patch("/api/site-surveys/:id", requireAuth, async (req, res) => {
    try {
      const body = req.body;
      const updateData: any = {};
      if (body.spaces !== undefined) updateData.spaces = body.spaces;
      if (body.walls !== undefined) updateData.walls = body.walls;
      if (body.selectedProducts !== undefined) updateData.selectedProducts = body.selectedProducts;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.photos !== undefined) updateData.photos = body.photos;
      if (body.customerId !== undefined) updateData.customerId = body.customerId;
      if (body.quotationId !== undefined) updateData.quotationId = body.quotationId;
      const updated = await storage.updateSiteSurvey(parseInt(req.params.id), updateData);
      if (!updated) return res.status(404).json({ message: "النموذج غير موجود" });
      res.json(updated);
    } catch (error) {
      console.error("Update site survey error:", error);
      res.status(500).json({ message: "حدث خطأ في تحديث النموذج" });
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
      const survey = await storage.createSiteSurvey({ ...req.body, createdBy: userId });
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

  async function verifySurveyAccess(surveyId: number, req: Request): Promise<{ allowed: boolean; survey?: any }> {
    const surveyRow = await storage.getSiteSurvey(surveyId);
    if (!surveyRow) return { allowed: false };
    const userId = req.session.userId;
    if (!userId) return { allowed: false };
    const user = await storage.getUser(userId);
    if (!user) return { allowed: false };
    if (user.role === "owner" || user.role === "assistant" || user.role === "it") return { allowed: true, survey: surveyRow };
    if (user.role === "designer") return { allowed: true, survey: surveyRow };
    if (user.role === "sales" && surveyRow.createdBy === user.id) return { allowed: true, survey: surveyRow };
    return { allowed: false };
  }

  app.get("/api/site-surveys/:id/design-files", requireAuth, async (req, res) => {
    try {
      const surveyId = parseInt(req.params.id);
      const { allowed } = await verifySurveyAccess(surveyId, req);
      if (!allowed) return res.status(403).json({ message: "غير مصرح" });
      const result = await pool.query(
        `SELECT id, survey_id, quotation_id, file_name, file_label, mime_type, file_size, attach_to_quote, uploaded_by, created_at, file_url
         FROM survey_design_files WHERE survey_id = $1 ORDER BY created_at DESC`,
        [surveyId]
      );
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب الملفات" });
    }
  });

  app.post("/api/site-surveys/:id/design-files", requireAuth, (req, res) => {
    const surveyId = parseInt(req.params.id);
    surveyFileUpload.single("file")(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "حجم الملف يتجاوز الحد المسموح به (10 ميغابايت)" : err.message });
      }
      if (err) {
        return res.status(400).json({ message: err.message || "خطأ في رفع الملف", messageEn: "Only PDF files are allowed" });
      }
      try {
        const { allowed } = await verifySurveyAccess(surveyId, req);
        if (!allowed) {
          if (req.file) fs.unlinkSync(req.file.path);
          return res.status(403).json({ message: "غير مصرح" });
        }
        const userId = (req as any).session.userId!;
        const uploadedFile = req.file;
        if (!uploadedFile) return res.status(400).json({ message: "لم يتم إرسال ملف" });
        const { fileLabel, quotationId } = req.body;
        const fileUrl = `/uploads/survey-files/${uploadedFile.filename}`;
        const label = (fileLabel && String(fileLabel).trim()) ? String(fileLabel).trim() : uploadedFile.originalname;
        const result = await pool.query(
          `INSERT INTO survey_design_files (survey_id, quotation_id, file_name, file_label, file_url, mime_type, file_size, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, survey_id, quotation_id, file_name, file_label, file_url, mime_type, file_size, attach_to_quote, uploaded_by, created_at`,
          [surveyId, quotationId || null, uploadedFile.originalname, label, fileUrl, "application/pdf", uploadedFile.size, userId]
        );
        res.status(201).json(result.rows[0]);
      } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        console.error("design-file upload error:", error);
        res.status(500).json({ message: "حدث خطأ في رفع الملف" });
      }
    });
  });

  app.patch("/api/site-surveys/:id/design-files/:fileId", requireAuth, async (req, res) => {
    try {
      const surveyId = parseInt(req.params.id);
      const fileId = parseInt(req.params.fileId);
      const { allowed } = await verifySurveyAccess(surveyId, req);
      if (!allowed) return res.status(403).json({ message: "غير مصرح" });
      const { attachToQuote, quotationId } = req.body;
      // If quotationId provided, link file to quotation at same time
      let updateResult;
      if (quotationId) {
        updateResult = await pool.query(
          `UPDATE survey_design_files SET attach_to_quote = $1, quotation_id = COALESCE(quotation_id, $2)
           WHERE id = $3 AND survey_id = $4
           RETURNING id, survey_id, quotation_id, file_name, file_label, file_url, mime_type, file_size, attach_to_quote, uploaded_by, created_at`,
          [attachToQuote, quotationId, fileId, surveyId]
        );
      } else {
        updateResult = await pool.query(
          `UPDATE survey_design_files SET attach_to_quote = $1 WHERE id = $2 AND survey_id = $3
           RETURNING id, survey_id, quotation_id, file_name, file_label, file_url, mime_type, file_size, attach_to_quote, uploaded_by, created_at`,
          [attachToQuote, fileId, surveyId]
        );
      }
      if (updateResult.rows.length === 0) return res.status(404).json({ message: "الملف غير موجود" });
      const updatedFile = updateResult.rows[0];
      // Always sync quotation.attachedDesignFiles when quotationId is known
      const effectiveQuotationId = quotationId || updatedFile.quotation_id;
      if (effectiveQuotationId) {
        const qid = effectiveQuotationId;
        // Use survey-wide toggle state for this quotation
        const attachedRows = await pool.query(
          `SELECT id FROM survey_design_files WHERE survey_id = $1 AND attach_to_quote = TRUE AND (quotation_id = $2 OR quotation_id IS NULL)`,
          [surveyId, qid]
        );
        const attachedIds = attachedRows.rows.map((r: any) => r.id);
        await pool.query(
          `UPDATE quotations SET attached_design_files = $1::jsonb WHERE id = $2`,
          [JSON.stringify(attachedIds), qid]
        );
      }
      res.json(updatedFile);
    } catch (error) {
      console.error("design-files patch error:", error);
      res.status(500).json({ message: "حدث خطأ في التحديث" });
    }
  });

  app.delete("/api/site-surveys/:id/design-files/:fileId", requireAuth, async (req, res) => {
    try {
      const surveyId = parseInt(req.params.id);
      const fileId = parseInt(req.params.fileId);
      const { allowed } = await verifySurveyAccess(surveyId, req);
      if (!allowed) return res.status(403).json({ message: "غير مصرح" });
      const del = await pool.query(
        `DELETE FROM survey_design_files WHERE id = $1 AND survey_id = $2 RETURNING id, file_url`,
        [fileId, surveyId]
      );
      if (del.rows.length === 0) return res.status(404).json({ message: "الملف غير موجود" });
      // Clean up filesystem file
      const fileUrl: string | null = del.rows[0].file_url;
      if (fileUrl) {
        try {
          const filePath = path.join(__dirname, "..", fileUrl);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}
      }
      res.json({ message: "تم الحذف" });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في الحذف" });
    }
  });

  app.get("/api/site-surveys/:id/design-files/:fileId/download", requireAuth, async (req, res) => {
    try {
      const surveyId = parseInt(req.params.id);
      const fileId = parseInt(req.params.fileId);
      const { allowed } = await verifySurveyAccess(surveyId, req);
      if (!allowed) return res.status(403).json({ message: "غير مصرح" });
      const result = await pool.query(
        `SELECT file_name, file_data, file_url, mime_type FROM survey_design_files WHERE id = $1 AND survey_id = $2`,
        [fileId, surveyId]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "الملف غير موجود" });
      const { file_name, file_data, file_url, mime_type } = result.rows[0];
      if (file_url) {
        // New: stream from disk
        const diskPath = path.join(UPLOADS_DIR, path.basename(file_url));
        if (!fs.existsSync(diskPath)) return res.status(404).json({ message: "الملف غير موجود على القرص" });
        res.setHeader("Content-Type", mime_type || "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file_name)}"`);
        return fs.createReadStream(diskPath).pipe(res);
      }
      // Legacy: base64 data
      res.json({ fileName: file_name, fileData: file_data, mimeType: mime_type });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
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
      const { customerId, lineItems, discountAmount: clientDiscount = 0, notes, deliveryDays, surveyId, city, validUntil } = req.body;
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
      const autoValidUntil = new Date();
      autoValidUntil.setDate(autoValidUntil.getDate() + 30);
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
        orderStage: "quote_draft",
        assignedTo: pricingIsSales ? req.session.userId : null,
        assignedAt: pricingIsSales ? new Date() : null,
        claimedAt: pricingIsSales ? new Date() : null,
        deliveryDays: deliveryDays || null,
        city: city || null,
        notes: notes || "",
        validUntil: validUntil || autoValidUntil.toISOString().split("T")[0],
        createdBy: req.session.userId,
      });

      console.log(`[save-quotation] Created quotation #${quotation.id}: items=${items.length}, subtotal=${serverSubtotal}, discount=${discountVal}, vat=${serverVat}, finalPrice=${serverTotal}`);

      if (surveyId) {
        const sid = parseInt(surveyId);
        await storage.updateSiteSurvey(sid, { quotationId: quotation.id } as any);
        // Link survey design files that are marked attach_to_quote to this quotation
        const attachedFilesResult = await pool.query(
          `UPDATE survey_design_files SET quotation_id = $1 WHERE survey_id = $2 AND attach_to_quote = TRUE RETURNING id`,
          [quotation.id, sid]
        );
        const attachedIds = attachedFilesResult.rows.map((r: any) => r.id);
        if (attachedIds.length > 0) {
          await pool.query(
            `UPDATE quotations SET attached_design_files = $1::jsonb WHERE id = $2`,
            [JSON.stringify(attachedIds), quotation.id]
          );
        }
      }

      // Persist attachment metadata if provided (for single main attachment)
      const { attachmentData, attachmentName, attachmentMime, showAttachmentToCustomer } = req.body;
      if (attachmentData) {
        await pool.query(
          `UPDATE quotations SET attachment_data = $1, attachment_name = $2, attachment_mime = $3, show_attachment_to_customer = $4 WHERE id = $5`,
          [attachmentData, attachmentName || null, attachmentMime || null, showAttachmentToCustomer || false, quotation.id]
        );
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

      const updated = await storage.updateQuotation(quotation.id, { status: "sent", orderStage: "quote_sent" });

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
      const filteredSurveys = allSurveys.filter(s => s.quotationId && quotationIds.includes(s.quotationId));
      const customerSurveys = await Promise.all(
        filteredSurveys.map(async (s) => {
          // Use quotation.attached_design_files (per-quotation source of truth) when available
          const quotation = s.quotationId ? quotations.find((q: any) => q.id === s.quotationId) : null;
          const attachedIds: number[] = Array.isArray((quotation as any)?.attachedDesignFiles) && (quotation as any).attachedDesignFiles.length > 0
            ? (quotation as any).attachedDesignFiles
            : [];
          let filesResult;
          if (attachedIds.length > 0) {
            filesResult = await pool.query(
              `SELECT id, file_name, file_label, mime_type, file_size, file_data, file_url, created_at FROM survey_design_files WHERE survey_id = $1 AND id = ANY($2::int[]) ORDER BY created_at DESC`,
              [s.id, attachedIds]
            );
          } else {
            // Fallback: use attach_to_quote flag
            filesResult = await pool.query(
              `SELECT id, file_name, file_label, mime_type, file_size, file_data, file_url, created_at FROM survey_design_files WHERE survey_id = $1 AND attach_to_quote = TRUE ORDER BY created_at DESC`,
              [s.id]
            );
          }
          return { ...s, shareToken: generateShareToken(s.id), designFiles: filesResult.rows };
        })
      );
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

  // ══════════════════════════════════════════════════════════════════════════
  // TASK #30: Lifecycle Stage Advancement
  // ══════════════════════════════════════════════════════════════════════════

  app.patch("/api/work-orders/:id/advance-stage", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const sessionUserId = (req.session as any).userId;
      const user = sessionUserId ? await storage.getUser(sessionUserId) : null;
      if (!user) return res.status(401).json({ message: "غير مصادق" });
      const wo = await storage.getWorkOrder(id);
      if (!wo) return res.status(404).json({ message: "أمر العمل غير موجود" });

      const currentStatus = wo.status;
      const stageFlow: Record<string, { next: string; allowedRoles: string[]; quotationStage: OrderStageValue; triggerStage?: string }> = {
        pending:      { next: "in_production",     allowedRoles: ["owner","assistant","production"],   quotationStage: "in_production",     triggerStage: "on_production" },
        in_production:{ next: "ready",             allowedRoles: ["owner","assistant","production"],   quotationStage: "ready_for_delivery" },
        ready:        { next: "delivered",         allowedRoles: ["owner","assistant","delivery"],     quotationStage: "delivered",          triggerStage: "on_delivery" },
        delivered:    { next: "installed",         allowedRoles: ["owner","assistant","installation"], quotationStage: "installed",          triggerStage: "on_installation" },
        installed:    { next: "completed",         allowedRoles: ["owner","assistant"],               quotationStage: "completed",          triggerStage: "on_completion" },
      };

      const transition = stageFlow[currentStatus];
      if (!transition) return res.status(400).json({ message: "لا يمكن تقديم هذا الأمر" });

      if (!transition.allowedRoles.includes(user.role)) {
        return res.status(403).json({ message: "غير مصرح بهذا الإجراء" });
      }

      const updatedWO = await storage.updateWorkOrder(id, { status: transition.next as any });

      // Update quotation order stage
      const contract = wo.contractId ? await storage.getContract(wo.contractId) : null;
      if (contract?.quotationId) {
        await setOrderStage(contract.quotationId, transition.quotationStage);
      }

      // Mark triggered payment schedules as "due"
      if (transition.triggerStage && contract?.quotationId) {
        try {
          const schedules = await storage.getPaymentSchedulesByQuotation(contract.quotationId);
          for (const s of schedules) {
            if (s.triggerStage === transition.triggerStage && s.status === "pending") {
              await storage.updatePaymentSchedule(s.id, { status: "due" });
            }
          }
        } catch (scheduleErr) {
          console.warn("Payment schedule update warning:", scheduleErr);
        }
      }

      // Auto-create warranty on "completed"
      if (transition.next === "completed" && contract) {
        try {
          const quotation = contract.quotationId ? await storage.getQuotation(contract.quotationId) : null;
          const warrantyMonths = (quotation as any)?.warrantyMonths || 24;
          const today = new Date().toISOString().split("T")[0];
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + warrantyMonths);
          const endDateStr = endDate.toISOString().split("T")[0];

          const existingWarranties = await storage.getWarranties();
          const alreadyExists = existingWarranties.find(w => w.workOrderId === id);
          if (!alreadyExists) {
            const warranty = await storage.createWarranty({
              contractId: contract.id,
              workOrderId: id,
              customerId: wo.customerId,
              quotationId: contract.quotationId || null,
              durationMonths: warrantyMonths,
              startDate: today,
              endDate: endDateStr,
              terms: `ضمان ${warrantyMonths} شهراً على التركيب والتصنيع - ${warrantyMonths}-month warranty on installation and manufacturing`,
              status: "active",
            } as any);

            const ownerUsers = (await storage.getUsers()).filter(u => ["owner", "assistant"].includes(u.role));
            for (const ou of ownerUsers) {
              await storage.createNotification({
                userId: ou.id,
                titleAr: "تم إكمال الطلب وإنشاء شهادة الضمان",
                titleEn: "Order Completed - Warranty Created",
                messageAr: `تم إكمال أمر العمل #${wo.orderNumber} وإنشاء شهادة ضمان لمدة ${warrantyMonths} شهراً`,
                messageEn: `Work order #${wo.orderNumber} completed and ${warrantyMonths}-month warranty created`,
                type: "success",
                relatedEntity: "warranty",
                relatedId: warranty.id,
                isRead: false,
              });
            }
          }
        } catch (warrantyErr) {
          console.warn("Warranty creation warning:", warrantyErr);
        }
      }

      res.json({ workOrder: updatedWO, message: "تم تحديث مرحلة الطلب" });
    } catch (error) {
      console.error("Advance stage error:", error);
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ── Payment Schedules CRUD ────────────────────────────────────────────────

  app.get("/api/payment-schedules/quotation/:quotationId", requireRole("owner", "assistant", "accountant", "sales"), async (req, res) => {
    try {
      const quotationId = parseInt(req.params.quotationId);
      const quotation = await storage.getQuotation(quotationId);
      if (!quotation) return res.status(404).json({ message: "غير موجود" });
      const schedules = await storage.getPaymentSchedulesByQuotation(quotationId);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/payment-schedules", requireRole("owner", "assistant", "sales"), async (req, res) => {
    try {
      const { quotationId, customerId, installmentNumber, amount, percentage, triggerStage, dueDate, notes } = req.body;
      if (!quotationId || !customerId || !amount || !triggerStage) {
        return res.status(400).json({ message: "بيانات ناقصة" });
      }
      const ps = await storage.createPaymentSchedule({
        quotationId, customerId, installmentNumber: installmentNumber || 1,
        amount: String(amount), percentage: percentage ? String(percentage) : null,
        triggerStage, dueDate: dueDate || null, status: "pending", notes: notes || null,
      } as any);
      res.status(201).json(ps);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.patch("/api/payment-schedules/:id", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updatePaymentSchedule(id, req.body);
      if (!updated) return res.status(404).json({ message: "غير موجود" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ── Customer portal: payment schedules ───────────────────────────────────

  app.get("/api/customer-portal/payment-schedules", requirePortalAuth, async (req, res) => {
    try {
      const customer = (req as any).portalCustomer;
      const schedules = await storage.getPaymentSchedulesByCustomer(customer.id);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ── Task #35: Daily Sales Logs ───────────────────────────────────────────
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS daily_sales_logs (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        sales_rep_id INTEGER NOT NULL REFERENCES users(id),
        calls_count INTEGER NOT NULL DEFAULT 0,
        whatsapp_count INTEGER NOT NULL DEFAULT 0,
        showroom_visits INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'daily_sales_logs'
          AND constraint_name = 'daily_sales_logs_date_rep_unique'
        ) THEN
          ALTER TABLE daily_sales_logs ADD CONSTRAINT daily_sales_logs_date_rep_unique UNIQUE (date, sales_rep_id);
        END IF;
      END $$;
    `);
  } catch (task35MigrationError) {
    console.warn("Task #35 migration warning (non-fatal):", task35MigrationError instanceof Error ? task35MigrationError.message : String(task35MigrationError));
  }

  // Fix duplicate مهند: deactivate old 'mohnad' account (id=4) in all envs including production
  try {
    await db.execute(`UPDATE users SET active = false WHERE username = 'mohnad' AND active = true`);
  } catch (mohnadFixError) {
    console.warn("mohnad deactivation (non-fatal):", mohnadFixError instanceof Error ? mohnadFixError.message : String(mohnadFixError));
  }

  // Fix siham's role: change from assistant → it (she is the IT admin with full access)
  try {
    await db.execute(`UPDATE users SET role = 'it' WHERE username = 'siham' AND role = 'assistant'`);
  } catch (sihamRoleError) {
    console.warn("siham role fix (non-fatal):", sihamRoleError instanceof Error ? sihamRoleError.message : String(sihamRoleError));
  }

  // Production employee-user data reconciliation migration
  // Runs safely every startup — all statements are idempotent
  try {
    // 1. Remap employees whose linked user accounts were renamed/recreated
    await db.execute(`
      UPDATE employees SET user_id = (SELECT id FROM users WHERE username = 'jabran' LIMIT 1)
      WHERE employee_number = 'EMP-001'
        AND EXISTS (SELECT 1 FROM users WHERE username = 'jabran')
        AND (user_id IS NULL OR user_id NOT IN (SELECT id FROM users WHERE username = 'jabran'))
    `);
    await db.execute(`
      UPDATE employees SET user_id = (SELECT id FROM users WHERE username = 'mohannad' LIMIT 1)
      WHERE employee_number = 'EMP-004'
        AND EXISTS (SELECT 1 FROM users WHERE username = 'mohannad')
        AND (user_id IS NULL OR user_id NOT IN (SELECT id FROM users WHERE username = 'mohannad'))
    `);
    await db.execute(`
      UPDATE employees SET user_id = (SELECT id FROM users WHERE username = 'm.sobri' LIMIT 1)
      WHERE employee_number = 'EMP-011'
        AND EXISTS (SELECT 1 FROM users WHERE username = 'm.sobri')
        AND (user_id IS NULL OR user_id NOT IN (SELECT id FROM users WHERE username = 'm.sobri'))
    `);
    await db.execute(`
      UPDATE employees SET user_id = (SELECT id FROM users WHERE username = 'sedad' LIMIT 1)
      WHERE employee_number = 'EMP-012'
        AND EXISTS (SELECT 1 FROM users WHERE username = 'sedad')
        AND (user_id IS NULL OR user_id NOT IN (SELECT id FROM users WHERE username = 'sedad'))
    `);

    // 2. Assign missing users to existing unnamed employee slots, or create new records
    // Strategy A: reassign existing unnamed (no user_id) EMP-013/014/015 slots to real users
    const userEmpMap = [
      { username: 'siham',    preferredEmp: 'EMP-013', fallbackEmp: 'EMP-016', position: 'مساعد المدير', dept: 'management', salary: 10000, start: '2021-01-01' },
      { username: 'sultan',   preferredEmp: 'EMP-014', fallbackEmp: 'EMP-017', position: 'محاسب',        dept: 'finance',    salary: 7000,  start: '2023-01-01' },
      { username: 'abdullah', preferredEmp: 'EMP-015', fallbackEmp: 'EMP-018', position: 'أمين مستودع', dept: 'warehouse',  salary: 6000,  start: '2022-01-01' },
    ];
    for (const me of userEmpMap) {
      // Skip if user already has an employee record
      const hasEmp = await db.execute(`
        SELECT 1 FROM employees WHERE user_id = (SELECT id FROM users WHERE username = '${me.username}' LIMIT 1) LIMIT 1
      `);
      if ((hasEmp.rows || []).length > 0) continue;
      if (!await (async () => { const r = await db.execute(`SELECT 1 FROM users WHERE username = '${me.username}' LIMIT 1`); return (r.rows||[]).length > 0; })()) continue;

      // Strategy A: Update the preferred slot if it has no user yet
      const updated = await db.execute(`
        UPDATE employees
        SET user_id = (SELECT id FROM users WHERE username = '${me.username}' LIMIT 1),
            position = '${me.position}', department = '${me.dept}',
            nationality = 'saudi', monthly_salary = ${me.salary}
        WHERE employee_number = '${me.preferredEmp}' AND user_id IS NULL
      `);
      if ((updated.rowCount || 0) > 0) continue;

      // Strategy B: Insert a new record using the fallback number
      await db.execute(`
        INSERT INTO employees (employee_number, user_id, nationality, position, department, monthly_salary, contract_start, status)
        SELECT '${me.fallbackEmp}',
               (SELECT id FROM users WHERE username = '${me.username}' LIMIT 1),
               'saudi', '${me.position}', '${me.dept}', ${me.salary}, '${me.start}', 'active'
        WHERE NOT EXISTS (SELECT 1 FROM employees WHERE employee_number = '${me.fallbackEmp}')
      `);
    }

    // 3. Deactivate obsolete accounts that no longer exist in the active seed
    await db.execute(`
      UPDATE users SET active = false
      WHERE username IN ('k.asiri','fatima','mohammed','saddad','quality1','noura','hanan')
        AND active = true
    `);

    console.log("Employee-user reconciliation migration completed");
  } catch (empMigrationError) {
    console.warn("Employee migration (non-fatal):", empMigrationError instanceof Error ? empMigrationError.message : String(empMigrationError));
  }

  app.get("/api/daily-sales-logs/today", requireRole("sales"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const today = new Date().toISOString().split("T")[0];
      const log = await storage.getDailySalesLog(today, userId);
      res.json(log || null);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/daily-sales-logs", requireRole("sales"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { date, callsCount, whatsappCount, showroomVisits, notes } = req.body;
      if (!date) return res.status(400).json({ message: "التاريخ مطلوب" });
      const log = await storage.upsertDailySalesLog({
        date,
        salesRepId: userId,
        callsCount: callsCount ?? 0,
        whatsappCount: whatsappCount ?? 0,
        showroomVisits: showroomVisits ?? 0,
        notes: notes || null,
      });
      res.json(log);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/daily-sales-logs", requireRole("owner", "assistant"), async (req, res) => {
    try {
      const { salesRepId, startDate, endDate } = req.query;
      const filters: { salesRepId?: number; startDate?: string; endDate?: string } = {};
      if (salesRepId) filters.salesRepId = parseInt(salesRepId as string);
      if (startDate) filters.startDate = startDate as string;
      if (endDate) filters.endDate = endDate as string;
      const logs = await storage.getDailySalesLogs(filters);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

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
