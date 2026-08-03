import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireRole, comparePasswords, hashPassword, getEffectivePermissionsForUser } from "./auth";
import {
  isProtectedOwner,
  isValidPermissionKey,
  getRoleDefaultPermissions,
  computeEffectivePermissions,
  PERMISSION_MODULES,
} from "@shared/permissions";
import { seedDatabase } from "./seed";
import { db, pool } from "./db";
import { verifyFirebaseToken } from "./firebase-admin";
import { normalizePhone } from "./utils";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import {
  makeSafeFilename,
  saveObjectFile,
  streamObjectFile,
  deleteObjectFile,
} from "./objectFileStore";

// Object Storage folder names (logical prefixes within the private bucket dir).
const SURVEY_FILES_FOLDER = "survey-files";
const DELIVERY_PHOTOS_FOLDER = "delivery-photos";
const HR_DOCS_FOLDER = "hr-documents";
const FINANCE_DOCS_FOLDER = "finance-attachments";
const INVENTORY_IMAGES_FOLDER = "inventory-images";

const surveyFileStorage = multer.memoryStorage();

const ALLOWED_SURVEY_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
];
const ALLOWED_SURVEY_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".tif", ".dwg", ".dxf", ".skp"];
const surveyFileUpload = multer({
  storage: surveyFileStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = "." + (file.originalname.split(".").pop() || "").toLowerCase();
    if (ALLOWED_SURVEY_FILE_TYPES.includes(file.mimetype) || ALLOWED_SURVEY_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, image, or design files are allowed"));
    }
  },
});

const deliveryPhotoStorage = multer.memoryStorage();

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
  insertWorkScheduleSettingSchema,
  productionStages,
  type OrderStageValue,
  type PaymentSchedule,
} from "@shared/schema";
import { resolveWorkSchedule, isLateCheckIn, riskLevel, RISK_POINTS, riyadhDateKey, isRiyadhWeekend } from "@shared/attendance";
import { parseNum } from "@shared/digits";

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

async function autoCreateJournalEntry(params: {
  type: "invoice_issued" | "payment_confirmed" | "po_received";
  referenceId: number;
  referenceNumber?: string | null;
  date: string;
  amount: number;
  subtotal?: number;
  vatAmount?: number;
  paymentMethod?: string | null;
  createdBy?: number | null;
}): Promise<void> {
  const { type, referenceId, referenceNumber, date, amount, subtotal, vatAmount, paymentMethod, createdBy } = params;
  const referenceTypeMap = {
    invoice_issued: "invoice",
    payment_confirmed: "payment",
    po_received: "purchase_order",
  };
  const refType = referenceTypeMap[type];
  try {
    const existing = await storage.findJournalEntryByReference(refType, referenceId);
    if (existing) {
      console.log(`Auto journal entry already exists for ${refType} #${referenceId}, skipping`);
      return;
    }
    if (type === "invoice_issued") {
      const sub = subtotal ?? amount / 1.15;
      const vat = vatAmount ?? (amount - sub);
      await storage.createJournalEntry(
        {
          date,
          description: `فاتورة مبيعات رقم ${referenceNumber || referenceId}`,
          reference: referenceNumber || String(referenceId),
          referenceType: "invoice",
          referenceId,
          status: "posted",
          createdBy: createdBy || null,
        },
        [
          { entryId: 0, accountCode: "1121", accountNameAr: "ذمم العملاء", debit: amount.toFixed(2), credit: "0" },
          { entryId: 0, accountCode: "4100", accountNameAr: "إيرادات المبيعات", debit: "0", credit: sub.toFixed(2) },
          { entryId: 0, accountCode: "2121", accountNameAr: "ضريبة المخرجات", debit: "0", credit: vat.toFixed(2) },
        ]
      );
    } else if (type === "payment_confirmed") {
      const cashCode = paymentMethod === "cash" ? "1111" : "1112";
      const cashNameAr = paymentMethod === "cash" ? "الصندوق" : "البنك";
      await storage.createJournalEntry(
        {
          date,
          description: `تحصيل دفعة - ${referenceNumber || referenceId}`,
          reference: referenceNumber || String(referenceId),
          referenceType: "payment",
          referenceId,
          status: "posted",
          createdBy: createdBy || null,
        },
        [
          { entryId: 0, accountCode: cashCode, accountNameAr: cashNameAr, debit: amount.toFixed(2), credit: "0" },
          { entryId: 0, accountCode: "1121", accountNameAr: "ذمم العملاء", debit: "0", credit: amount.toFixed(2) },
        ]
      );
    } else if (type === "po_received") {
      await storage.createJournalEntry(
        {
          date,
          description: `استلام أمر شراء رقم ${referenceNumber || referenceId}`,
          reference: referenceNumber || String(referenceId),
          referenceType: "purchase_order",
          referenceId,
          status: "posted",
          createdBy: createdBy || null,
        },
        [
          { entryId: 0, accountCode: "5100", accountNameAr: "تكلفة المواد الخام", debit: amount.toFixed(2), credit: "0" },
          { entryId: 0, accountCode: "2111", accountNameAr: "ذمم الموردين", debit: "0", credit: amount.toFixed(2) },
        ]
      );
    }
  } catch (err) {
    console.error("Auto journal entry creation failed:", err);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  // Employee OTP auth: check phone exists in users table (kept for compatibility)
  app.post("/api/employee-auth/check-phone", async (req: Request, res: Response) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ message: "رقم الجوال مطلوب", messageEn: "Phone number is required" });
      }
      const user = await storage.getUserByPhone(normalizePhone(String(phone)));
      if (!user) {
        return res.status(404).json({ message: "رقم الجوال غير مسجل في النظام", messageEn: "Phone number not registered in system" });
      }
      if (!user.active) {
        return res.status(403).json({ message: "الحساب معطل. يرجى التواصل مع المسؤول", messageEn: "Account is disabled" });
      }
      if (user.role === "customer") {
        return res.status(403).json({ message: "رقم الجوال غير مسجل كموظف", messageEn: "Phone number not registered as employee" });
      }
      return res.json({
        success: true,
        fullNameAr: user.fullNameAr,
        fullNameEn: user.fullNameEn,
        hasPinSet: !!user.employeePin,
      });
    } catch (error) {
      console.error("check-phone error:", error);
      return res.status(500).json({ message: "حدث خطأ", messageEn: "An error occurred" });
    }
  });

  // Employee PIN auth: verify phone + PIN and start session
  app.post("/api/employee-auth/verify-pin", async (req: Request, res: Response) => {
    try {
      const { phone, pin } = req.body;
      if (!phone || !pin) {
        return res.status(400).json({ message: "رقم الجوال والرمز مطلوبان", messageEn: "Phone and PIN are required" });
      }
      const user = await storage.getUserByPhone(normalizePhone(String(phone)));
      if (!user) {
        return res.status(404).json({ message: "رقم الجوال غير مسجل في النظام", messageEn: "Phone number not registered in system" });
      }
      if (!user.active) {
        return res.status(403).json({ message: "الحساب معطل. يرجى التواصل مع المسؤول", messageEn: "Account is disabled" });
      }
      if (user.role === "customer") {
        return res.status(403).json({ message: "رقم الجوال غير مسجل كموظف", messageEn: "Phone number not registered as employee" });
      }

      // Default PIN = last 4 digits of phone number
      const phone10 = normalizePhone(String(phone));
      const defaultPin = phone10.replace(/\D/g, "").slice(-4);
      const expectedPin = user.employeePin || defaultPin;

      if (String(pin).trim() !== String(expectedPin).trim()) {
        return res.status(401).json({ message: "الرمز غير صحيح", messageEn: "Incorrect PIN" });
      }

      req.session.userId = user.id;
      const { password: _, financePin: __, employeePin: ___, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error) {
      console.error("verify-pin error:", error);
      return res.status(500).json({ message: "حدث خطأ", messageEn: "An error occurred" });
    }
  });

  // Employee PIN auth: change own PIN
  app.patch("/api/employee-auth/change-pin", requireAuth, async (req: Request, res: Response) => {
    try {
      const { currentPin, newPin } = req.body;
      if (!currentPin || !newPin) {
        return res.status(400).json({ message: "الرمز الحالي والجديد مطلوبان", messageEn: "Current and new PIN are required" });
      }
      if (!/^\d{4,6}$/.test(String(newPin))) {
        return res.status(400).json({ message: "الرمز يجب أن يكون 4-6 أرقام", messageEn: "PIN must be 4-6 digits" });
      }
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "المستخدم غير موجود", messageEn: "User not found" });

      const phone10 = normalizePhone(user.phone || "");
      const defaultPin = phone10.replace(/\D/g, "").slice(-4);
      const expectedPin = user.employeePin || defaultPin;

      if (String(currentPin).trim() !== String(expectedPin).trim()) {
        return res.status(401).json({ message: "الرمز الحالي غير صحيح", messageEn: "Current PIN is incorrect" });
      }
      await storage.updateUser(req.session.userId!, { employeePin: String(newPin) });
      return res.json({ success: true });
    } catch (error) {
      console.error("change-pin error:", error);
      return res.status(500).json({ message: "حدث خطأ", messageEn: "An error occurred" });
    }
  });

  // Authenticated endpoint to serve uploaded survey design files from disk.
  // Verifies the requesting user has access to the survey that owns the file.
  app.get("/api/uploads/survey-files/:filename", requireAuth, async (req, res) => {
    try {
      const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
      const urlPath = `/uploads/survey-files/${filename}`;
      // Lookup file and verify user has survey access
      const fileRow = await pool.query(
        `SELECT sdf.id, sdf.survey_id, sdf.mime_type FROM survey_design_files sdf WHERE sdf.file_url = $1 LIMIT 1`,
        [urlPath]
      );
      if (fileRow.rows.length === 0) return res.status(404).json({ message: "الملف غير موجود" });
      const surveyId = fileRow.rows[0].survey_id;
      const { allowed } = await verifySurveyAccess(surveyId, req);
      if (!allowed) return res.status(403).json({ message: "غير مصرح" });
      const served = await streamObjectFile(SURVEY_FILES_FOLDER, filename, res, {
        contentType: fileRow.rows[0].mime_type || "application/pdf",
        disposition: `attachment; filename="${encodeURIComponent(filename)}"`,
      });
      if (!served) return res.status(404).json({ message: "الملف غير موجود على القرص" });
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ message: "حدث خطأ في جلب الملف" });
    }
  });

  // Customer-accessible endpoint: only for files attached to a quote owned by the portal customer.
  // Uses quotation.attached_design_files (source of truth) OR attach_to_quote flag as fallback.
  app.get("/api/customer/survey-files/:filename", requirePortalAuth, async (req, res) => {
    try {
      const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
      const urlPath = `/uploads/survey-files/${filename}`;
      const portalCustomer = (req as any).portalCustomer;
      // Check by source-of-truth: file ID in quotation.attached_design_files, customer owns quote
      const check = await pool.query(
        `SELECT sdf.id, sdf.mime_type FROM survey_design_files sdf
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
      const served = await streamObjectFile(SURVEY_FILES_FOLDER, filename, res, {
        contentType: check.rows[0].mime_type || "application/pdf",
        disposition: `attachment; filename="${encodeURIComponent(filename)}"`,
      });
      if (!served) return res.status(404).json({ message: "الملف غير موجود" });
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ message: "حدث خطأ في جلب الملف" });
    }
  });

  // Per-account permissions: add `archived` column + user_permissions table.
  // Runs BEFORE seedDatabase() because the seed guarantees protected owners are
  // role=owner / active / not-archived.
  try {
    await db.execute(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE TABLE IF NOT EXISTS user_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        permission_key TEXT NOT NULL,
        effect TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS user_permissions_user_key_unique ON user_permissions (user_id, permission_key);
    `);
  } catch (permsMigrationError) {
    console.warn("User permissions migration warning (non-fatal):", permsMigrationError instanceof Error ? permsMigrationError.message : String(permsMigrationError));
  }

  // Inventory transactions: supplier link + mandatory stock-out reason details.
  try {
    await db.execute(`
      ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id);
      ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
    `);
  } catch (invTxMigrationError) {
    console.warn("Inventory transactions migration warning (non-fatal):", invTxMigrationError instanceof Error ? invTxMigrationError.message : String(invTxMigrationError));
  }

  // Kitchen-tool pricing: per-grade prices on adeko products + material grade.
  try {
    await db.execute(`
      ALTER TABLE adeko_products ADD COLUMN IF NOT EXISTS price_economy NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE adeko_products ADD COLUMN IF NOT EXISTS price_standard NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE adeko_products ADD COLUMN IF NOT EXISTS price_premium NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE wood_types ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT 'standard';
      -- One-time grade distribution by price (only while every row still has the
      -- default 'standard', i.e. nobody assigned grades yet — keeps manual edits safe).
      UPDATE wood_types SET grade = CASE
        WHEN price_per_meter < 500 THEN 'economy'
        WHEN price_per_meter < 1000 THEN 'standard'
        ELSE 'premium'
      END
      WHERE NOT EXISTS (SELECT 1 FROM wood_types WHERE grade <> 'standard');
    `);
  } catch (pricingMigrationError) {
    console.warn("Kitchen pricing migration warning (non-fatal):", pricingMigrationError instanceof Error ? pricingMigrationError.message : String(pricingMigrationError));
  }

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

  // Standalone professional invoice: add standard (B2B) tax-invoice type + buyer
  // VAT number/address columns. ALTER TYPE ADD VALUE must run as its own
  // statement (cannot run inside a transaction with other DDL).
  try {
    await db.execute(`ALTER TYPE invoice_type ADD VALUE IF NOT EXISTS 'standard_tax_invoice'`);
  } catch (invoiceTypeMigrationError) {
    console.warn("Invoice type migration warning (non-fatal):", invoiceTypeMigrationError instanceof Error ? invoiceTypeMigrationError.message : String(invoiceTypeMigrationError));
  }
  try {
    await db.execute(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_vat_number TEXT;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_address TEXT;
    `);
  } catch (invoiceBuyerMigrationError) {
    console.warn("Invoice buyer columns migration warning (non-fatal):", invoiceBuyerMigrationError instanceof Error ? invoiceBuyerMigrationError.message : String(invoiceBuyerMigrationError));
  }
  // company_settings.retained_earnings_account_code — schema declares this column
  // (NOT NULL DEFAULT '3200') but older DBs predate it; add idempotently so
  // getCompanySettings() (used by the standalone invoice path) doesn't fail.
  try {
    await db.execute(`
      ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS retained_earnings_account_code TEXT NOT NULL DEFAULT '3200';
    `);
  } catch (companySettingsMigrationError) {
    console.warn("Company settings migration warning (non-fatal):", companySettingsMigrationError instanceof Error ? companySettingsMigrationError.message : String(companySettingsMigrationError));
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
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ message: "المستخدم غير موجود" });
      // Protected owner accounts cannot be demoted, disabled, or archived.
      if (isProtectedOwner(target)) {
        if (data.role !== undefined && data.role !== target.role) {
          return res.status(403).json({ message: "لا يمكن تغيير دور حساب المالك المحمي" });
        }
        if (data.active === false) {
          return res.status(403).json({ message: "لا يمكن تعطيل حساب المالك المحمي" });
        }
        if (data.archived === true) {
          return res.status(403).json({ message: "لا يمكن أرشفة حساب المالك المحمي" });
        }
      }
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

  app.delete("/api/users/:id", requireRole("owner", "it", "hr"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "معرف غير صالح" });
      const user = await storage.getUser(id);
      if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
      if (id === req.session.userId) return res.status(403).json({ message: "لا يمكن حذف حسابك الخاص" });
      if (isProtectedOwner(user)) return res.status(403).json({ message: "لا يمكن حذف حساب المالك المحمي" });
      const requestingUser = await storage.getUser(req.session.userId!);
      if (requestingUser?.role === "hr" && (user.role === "it" || user.role === "owner")) {
        return res.status(403).json({ message: "لا تملك صلاحية حذف هذا الحساب" });
      }
      await storage.deleteUser(id);
      return res.json({ message: "تم حذف الحساب بنجاح" });
    } catch {
      return res.status(500).json({ message: "حدث خطأ أثناء الحذف" });
    }
  });

  // Per-account permission editor — read current effective/exceptions/role defaults.
  app.get("/api/users/:id/permissions", requireRole("owner", "it"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "معرف غير صالح" });
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ message: "المستخدم غير موجود" });
      const protectedOwner = isProtectedOwner(target);
      const roleDefaults = getRoleDefaultPermissions(target.role);
      const exceptions = await storage.getUserPermissions(id);
      const effective = await getEffectivePermissionsForUser(target);
      res.json({
        userId: id,
        role: target.role,
        isProtected: protectedOwner,
        roleDefaults,
        exceptions: exceptions.map((e) => ({ permissionKey: e.permissionKey, effect: e.effect })),
        effective,
      });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // Per-account permission editor — set desired enabled module keys.
  // Reconciles per-account grant/revoke exceptions against the role defaults.
  app.patch("/api/users/:id/permissions", requireRole("owner", "it"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "معرف غير صالح" });
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ message: "المستخدم غير موجود" });
      if (isProtectedOwner(target)) {
        return res.status(403).json({ message: "لا يمكن تعديل صلاحيات حساب المالك المحمي" });
      }
      const enabled: string[] = Array.isArray(req.body?.enabled) ? req.body.enabled : [];
      const invalid = enabled.filter((k) => !isValidPermissionKey(k));
      if (invalid.length > 0) {
        return res.status(400).json({ message: "مفاتيح صلاحيات غير صالحة", invalid });
      }
      const enabledSet = new Set(enabled);
      const roleDefaults = new Set(getRoleDefaultPermissions(target.role));

      for (const m of PERMISSION_MODULES) {
        if (m.base) continue; // base modules are always granted, never toggled
        const roleHas = roleDefaults.has(m.key);
        const want = enabledSet.has(m.key);
        if (want === roleHas) {
          await storage.deleteUserPermission(id, m.key);
        } else if (want && !roleHas) {
          await storage.setUserPermission(id, m.key, "grant");
        } else {
          await storage.setUserPermission(id, m.key, "revoke");
        }
      }

      const exceptions = await storage.getUserPermissions(id);
      const effective = computeEffectivePermissions(
        target.role,
        exceptions.map((e) => ({ permissionKey: e.permissionKey, effect: e.effect })),
        false,
      );
      res.json({
        userId: id,
        effective,
        exceptions: exceptions.map((e) => ({ permissionKey: e.permissionKey, effect: e.effect })),
      });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في حفظ الصلاحيات" });
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
        /* For accountants who log in via finance-PIN portal and don't know their
           bcrypt password, allow their financePin (or the default "1400") as an
           alternative "current password" so they can set a real bcrypt password. */
        const effectivePin = user.financePin || "1400";
        const validViaPin = !valid && user.role === "accountant" && currentPassword === effectivePin;
        if (!valid && !validViaPin) {
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

  app.post("/api/customers", requireRole("owner", "assistant", "sales", "customer_service", "accountant"), async (req, res) => {
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

  // Public pilot product for the 3D kitchen studio (Task: realistic catalog cabinet pilot).
  // Returns ONE real base cabinet from the Adeko catalog to render parametrically in 3D.
  app.get("/api/kitchen-tool/pilot-product", async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, code, description_ar, description_en, group_code,
                design_w, design_h, design_d, price_after_vat, thumbnail
         FROM adeko_products
         WHERE code = 'A1K 60 72' AND active = TRUE
         LIMIT 1`
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "المنتج التجريبي غير موجود" });
      }
      const r = result.rows[0];
      res.json({
        id: r.id,
        code: r.code,
        descriptionAr: r.description_ar,
        descriptionEn: r.description_en,
        groupCode: r.group_code,
        designW: parseFloat(r.design_w),
        designH: parseFloat(r.design_h),
        designD: parseFloat(r.design_d),
        priceAfterVat: parseFloat(r.price_after_vat),
        thumbnail: r.thumbnail,
      });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب المنتج" });
    }
  });

  // Public full product catalog for the 3D kitchen studio — all active Adeko products.
  app.get("/api/kitchen-tool/products", async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, code, description_ar, description_en, group_code,
                design_w, design_h, design_d, price_after_vat,
                price_economy, price_standard, price_premium, thumbnail,
                manufacturing_w, manufacturing_h, manufacturing_d
         FROM adeko_products
         WHERE active = TRUE
         ORDER BY group_code, design_w, design_h`
      );
      res.json(
        result.rows.map((r) => ({
          id: r.id,
          code: r.code,
          descriptionAr: r.description_ar,
          descriptionEn: r.description_en,
          groupCode: r.group_code,
          designW: parseFloat(r.design_w),
          designH: parseFloat(r.design_h),
          designD: parseFloat(r.design_d),
          priceAfterVat: parseFloat(r.price_after_vat),
          priceEconomy: parseFloat(r.price_economy),
          priceStandard: parseFloat(r.price_standard),
          pricePremium: parseFloat(r.price_premium),
          thumbnail: r.thumbnail,
          manufacturingW: r.manufacturing_w != null ? parseFloat(r.manufacturing_w) : null,
          manufacturingH: r.manufacturing_h != null ? parseFloat(r.manufacturing_h) : null,
          manufacturingD: r.manufacturing_d != null ? parseFloat(r.manufacturing_d) : null,
        }))
      );
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب المنتجات" });
    }
  });

  // Public materials list for the 3D kitchen studio — active factory wood types.
  app.get("/api/kitchen-tool/materials", async (_req, res) => {
    try {
      const list = await storage.getWoodTypes();
      res.json(
        list
          .filter((w) => w.active)
          .map((w) => ({
            id: w.id,
            nameAr: w.nameAr,
            nameEn: w.nameEn,
            pricePerMeter: w.pricePerMeter,
            category: w.category,
            grade: w.grade ?? "standard",
          }))
      );
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب الخامات" });
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
      } else if (user?.role === "designer" || user?.role === "it") {
        const all = await storage.getQuotations();
        const filtered = all.filter((q: any) =>
          q.orderStage === "survey_done" ||
          q.assignedTo === userId
        );
        res.json(await checkAndExpire(filtered));
      } else if (user?.role === "accountant") {
        const all = await storage.getQuotations();
        const filtered = all.filter((q: any) =>
          q.orderStage === "quote_approved" ||
          q.orderStage === "in_production" ||
          q.assignedTo === userId
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
      if ((requestingUser?.role === "designer" || requestingUser?.role === "it") &&
          quotation.orderStage !== "survey_done" &&
          Number(quotation.assignedTo) !== Number(req.session.userId)) {
        return res.status(403).json({ message: "غير مصرح لك بالاطلاع على هذا الطلب", messageEn: "You are not authorized to view this order" });
      }
      if (requestingUser?.role === "accountant" &&
          !["quote_approved", "in_production", "delivered"].includes(quotation.orderStage || "") &&
          Number(quotation.assignedTo) !== Number(req.session.userId)) {
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
      const wasSent = data.status === "sent" && quotation.status !== "sent";
      delete data.id;
      delete data.createdAt;
      const updated = await storage.updateQuotation(parseInt(req.params.id), data);
      if (!updated) return res.status(404).json({ message: "عرض السعر غير موجود" });

      if (wasSent) {
        try {
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
        } catch (_) { }
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/quotations/:id/designer-notify", requireRole("designer", "it"), async (req, res) => {
    try {
      const quotationId = parseInt(req.params.id);
      const quotation = await storage.getQuotation(quotationId);
      if (!quotation) return res.status(404).json({ message: "الطلب غير موجود" });
      if (quotation.orderStage !== "survey_done") {
        return res.status(403).json({ message: "لا يمكن إرسال الإشعار إلا لطلبات في مرحلة المسح الميداني" });
      }
      const requestingDesigner = await storage.getUser(req.session.userId!);
      // Ensure the order is accessible in this designer's queue (survey_done stage is sufficient scope)
      if (!requestingDesigner || !["designer", "it"].includes(requestingDesigner.role)) {
        return res.status(403).json({ message: "غير مصرح" });
      }
      const notesText = req.body.notes || "[التصميم جاهز]: يرجى مراجعة ملفات التصميم والتواصل مع العميل";
      const updated = await storage.updateQuotation(quotationId, { notes: notesText });
      // Notify assigned sales rep (and creator if different)
      const recipientIds = new Set<number>();
      if (quotation.assignedTo) recipientIds.add(Number(quotation.assignedTo));
      if (quotation.createdBy) recipientIds.add(Number(quotation.createdBy));
      for (const recipientId of recipientIds) {
        try {
          await storage.createNotification({
            userId: recipientId,
            titleAr: "التصميم جاهز",
            titleEn: "Design Ready",
            messageAr: `تم رفع ملفات التصميم للطلب رقم ${quotationId} — يرجى المراجعة والتواصل مع العميل`,
            messageEn: `Design files uploaded for order #${quotationId} — please review and contact the client`,
            type: "action",
            relatedEntity: "quotation",
            relatedId: quotationId,
          });
        } catch (_) { /* non-fatal: notification failure should not block the response */ }
      }
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

      // Create a sales_reviewed payment for the accountant to confirm if receipt was provided
      // Sales rep uploading at showroom skips the pending stage and goes directly to sales_reviewed
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
          notes: `دفعة مسجّلة عند الاعتماد في المعرض — بانتظار اعتماد المحاسب`,
          attachmentUrl: paymentReceiptData,
          recordedBy: userId,
          status: "sales_reviewed",
          salesReviewedBy: userId,
          salesReviewedAt: new Date(),
        } as any);
        const accountantStaff = (await storage.getUsers()).filter((u: any) => ["owner", "assistant", "accountant"].includes(u.role));
        for (const staff of accountantStaff) {
          await storage.createNotification({
            userId: staff.id,
            type: "action",
            titleAr: "وصل دفع من المعرض بانتظار اعتمادك",
            titleEn: "Showroom Payment Receipt Awaiting Your Approval",
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

  app.get("/api/payments/:id", requireAuth, async (req, res) => {
    try {
      const payment = await storage.getPayment(parseInt(req.params.id));
      if (!payment) return res.status(404).json({ message: "الدفعة غير موجودة" });
      res.json(payment);
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

  app.post("/api/payments", requireRole("owner", "assistant", "accountant", "sales"), async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      const isSalesRole = currentUser?.role === "sales";
      let paymentStatus = req.body.status || "confirmed";
      if (isSalesRole && req.body.attachmentUrl) {
        paymentStatus = "sales_reviewed";
      }

      const data: any = { ...req.body, recordedBy: req.session.userId, status: paymentStatus };
      if (isSalesRole && req.body.attachmentUrl) {
        data.salesReviewedBy = req.session.userId;
        data.salesReviewedAt = new Date();
      }
      const payment = await storage.createPayment(data);

      if (payment.status === "confirmed") {
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

          const today = new Date().toISOString().split("T")[0];
          autoCreateJournalEntry({
            type: "invoice_issued",
            referenceId: invoice.id,
            referenceNumber: invoice.invoiceNumber ? String(invoice.invoiceNumber) : null,
            date: today,
            amount: parseFloat(String(invoiceData.totalWithVat)),
            subtotal: parseFloat(String(invoiceData.subtotal)),
            vatAmount: parseFloat(String(invoiceData.vatAmount)),
            createdBy: req.session.userId ?? null,
          });
          autoCreateJournalEntry({
            type: "payment_confirmed",
            referenceId: payment.id,
            referenceNumber: String(payment.id),
            date: today,
            amount: parseFloat(String(payment.amount)),
            paymentMethod: payment.method,
            createdBy: req.session.userId ?? null,
          });
        } else {
          autoCreateJournalEntry({
            type: "payment_confirmed",
            referenceId: payment.id,
            referenceNumber: String(payment.id),
            date: new Date().toISOString().split("T")[0],
            amount: parseFloat(String(payment.amount)),
            paymentMethod: payment.method,
            createdBy: req.session.userId ?? null,
          });
        }
      }

      res.status(201).json(payment);
    } catch (error) {
      console.error("Payment error:", error);
      res.status(500).json({ message: "حدث خطأ في تسجيل الدفعة" });
    }
  });

  app.patch("/api/payments/:id/sales-review", requireRole("owner", "assistant", "sales"), async (req, res) => {
    try {
      const paymentId = parseInt(req.params.id);
      if (isNaN(paymentId)) return res.status(400).json({ message: "معرف غير صالح" });
      const payment = await storage.getPayment(paymentId);
      if (!payment) return res.status(404).json({ message: "الدفعة غير موجودة" });
      if (payment.status === "sales_reviewed") return res.json({ message: "تمت المراجعة مسبقاً", payment });
      if (payment.status !== "pending") return res.status(400).json({ message: "لا يمكن مراجعة دفعة ليست في حالة انتظار" });

      const reviewerUser = await storage.getUser(req.session.userId!);
      const isOwnerOrAssistantReviewer = reviewerUser?.role === "owner" || reviewerUser?.role === "assistant";
      if (!isOwnerOrAssistantReviewer) {
        const contract = await storage.getContract(payment.contractId);
        if (contract?.quotationId) {
          const quotation = await storage.getQuotation(contract.quotationId);
          if (quotation?.assignedTo !== req.session.userId) {
            return res.status(403).json({ message: "غير مصرح لك بمراجعة هذه الدفعة — ليست من عقودك", messageEn: "Not authorized to review this payment — not your contract" });
          }
        }
      }

      const updated = await storage.updatePayment(paymentId, {
        status: "sales_reviewed",
        salesReviewedBy: req.session.userId,
        salesReviewedAt: new Date(),
      } as any);

      const customer = await storage.getCustomer(payment.customerId);
      const allUsers = await storage.getUsers();
      const accountantStaff = allUsers.filter((u: any) => ["owner", "assistant", "accountant"].includes(u.role));
      for (const staff of accountantStaff) {
        await storage.createNotification({
          userId: staff.id,
          type: "action",
          titleAr: "وصل دفع بانتظار اعتماد المحاسب",
          titleEn: "Payment Receipt Awaiting Accountant Approval",
          messageAr: `المندوب راجع وصل دفع بمبلغ ${payment.amount} ريال من العميل ${customer?.fullName} — بانتظار اعتمادك`,
          messageEn: `Sales rep reviewed payment receipt of ${payment.amount} SAR from ${customer?.fullName} — awaiting your approval`,
        });
      }

      res.json({ message: "تمت مراجعة الدفعة بنجاح", messageEn: "Payment sales-reviewed successfully", payment: updated });
    } catch (error) { console.error("Sales review payment error:", error); res.status(500).json({ message: "حدث خطأ" }); }
  });

  app.patch("/api/payments/:id/confirm", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const paymentId = parseInt(req.params.id);
      if (isNaN(paymentId)) return res.status(400).json({ message: "معرف غير صالح" });
      const payment = await storage.getPayment(paymentId);
      if (!payment) return res.status(404).json({ message: "الدفعة غير موجودة" });
      if (payment.status === "confirmed") return res.json({ message: "الدفعة مؤكدة مسبقاً", payment });

      const currentUser = await storage.getUser(req.session.userId!);
      const isOwnerOrAssistant = currentUser?.role === "owner" || currentUser?.role === "assistant";
      if (!isOwnerOrAssistant && payment.status !== "sales_reviewed") {
        return res.status(400).json({ message: "يجب أن تمر الدفعة بمراجعة المندوب أولاً قبل الاعتماد النهائي", messageEn: "Payment must be sales-reviewed before final approval" });
      }

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

          if (quotation) {
            await storage.updateQuotation(quotation.id, { orderStage: "in_production" } as any).catch(() => {});
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

      autoCreateJournalEntry({
        type: "payment_confirmed",
        referenceId: payment.id,
        referenceNumber: String(payment.id),
        date: new Date().toISOString().split("T")[0],
        amount: parseFloat(String(payment.amount)),
        paymentMethod: payment.method,
        createdBy: req.session.userId ?? null,
      });

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
      if (!["pending", "sales_reviewed"].includes(payment.status)) return res.status(400).json({ message: "لا يمكن رفض دفعة مؤكدة أو مرفوضة مسبقاً" });

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

      // ---- New standalone professional-invoice path ----
      // When no contractId is supplied, build a tax invoice directly from a
      // customer + line items (optionally pre-filled from a quotation/order).
      // Totals are computed server-side bottom-up from the items; never trust
      // client-side totals. Double-entry journal is created via the existing
      // autoCreateJournalEntry mechanism (with reference-dedup).
      if (!contractId) {
        const standaloneSchema = z.object({
          customerId: z.coerce.number().int().positive(),
          type: z.enum(["simplified_tax_invoice", "standard_tax_invoice"]).default("simplified_tax_invoice"),
          quotationId: z.coerce.number().int().positive().optional(),
          sourceType: z.enum(["none", "quotation", "order", "contract"]).optional(),
          sourceId: z.coerce.number().int().positive().optional(),
          items: z.array(z.object({
            description: z.string().trim().min(1, "وصف البند مطلوب"),
            quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
            unitPrice: z.coerce.number().nonnegative("سعر الوحدة غير صالح"),
          })).min(1, "أضف بنداً واحداً على الأقل"),
          buyerName: z.string().trim().optional(),
          buyerPhone: z.string().trim().optional(),
          buyerVatNumber: z.string().trim().optional(),
          buyerAddress: z.string().trim().optional(),
          paymentMethod: z.string().trim().optional(),
          notes: z.string().trim().optional(),
        });

        const parsed = standaloneSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "بيانات غير صالحة" });
        }
        const data = parsed.data;

        const customer = await storage.getCustomer(data.customerId);
        if (!customer) return res.status(404).json({ message: "العميل غير موجود" });

        // Resolve optional source linkage (contract / quotation / order). The
        // linked id is persisted on the invoice for traceability. This does NOT
        // trigger the legacy contract auto-issuance/dedup path (that path is
        // only reached when a top-level `contractId` is sent).
        let linkedContractId: number | null = null;
        let linkedQuotationId: number | null = null;
        if (data.sourceType === "contract" && data.sourceId) {
          const sourceContract = await storage.getContract(data.sourceId);
          if (!sourceContract) return res.status(404).json({ message: "المصدر (العقد) غير موجود" });
          linkedContractId = sourceContract.id;
        } else if ((data.sourceType === "quotation" || data.sourceType === "order") && data.sourceId) {
          const sourceQuotation = await storage.getQuotation(data.sourceId);
          if (!sourceQuotation) return res.status(404).json({ message: "المصدر (عرض السعر/الطلب) غير موجود" });
          linkedQuotationId = sourceQuotation.id;
        } else if (data.quotationId) {
          const sourceQuotation = await storage.getQuotation(data.quotationId);
          if (!sourceQuotation) return res.status(404).json({ message: "المصدر (عرض السعر/الطلب) غير موجود" });
          linkedQuotationId = sourceQuotation.id;
        }

        // Bottom-up totals: subtotal = Σ(qty × unitPrice), VAT = subtotal × 15%.
        const VAT_RATE = 0.15;
        const lineItems = data.items.map((it) => {
          const lineSubtotal = Math.round(it.quantity * it.unitPrice * 100) / 100;
          const lineVat = Math.round(lineSubtotal * VAT_RATE * 100) / 100;
          return {
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice.toFixed(2),
            amount: lineSubtotal.toFixed(2),
            vat: lineVat.toFixed(2),
            totalWithVat: (lineSubtotal + lineVat).toFixed(2),
          };
        });
        const subtotal = lineItems.reduce((s, it) => s + parseFloat(it.amount), 0);
        const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
        const totalWithVat = Math.round((subtotal + vatAmount) * 100) / 100;

        const settings = await storage.getCompanySettings();
        const isStandard = data.type === "standard_tax_invoice";

        const invoiceData = {
          contractId: linkedContractId,
          quotationId: linkedQuotationId,
          customerId: customer.id,
          paymentStage: null,
          type: data.type,
          items: lineItems as any,
          subtotal: subtotal.toFixed(2),
          vatRate: "15",
          vatAmount: vatAmount.toFixed(2),
          totalWithVat: totalWithVat.toFixed(2),
          sellerName: settings?.nameAr || "مصنع تيك للمنتجات الخشبية",
          sellerVatNumber: settings?.vatNumber || "310012345600003",
          sellerAddress: settings?.address || "الرياض - المملكة العربية السعودية",
          buyerName: (data.buyerName || customer.fullName || "").trim(),
          buyerPhone: data.buyerPhone || customer.phone || "",
          buyerVatNumber: isStandard ? (data.buyerVatNumber || null) : null,
          buyerAddress: isStandard ? (data.buyerAddress || null) : null,
          paymentMethod: data.paymentMethod || "bank_transfer",
          status: "issued" as const,
          issuedAt: new Date(),
          notes: data.notes || null,
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

        autoCreateJournalEntry({
          type: "invoice_issued",
          referenceId: invoice.id,
          referenceNumber: invoice.invoiceNumber ? String(invoice.invoiceNumber) : null,
          date: new Date().toISOString().split("T")[0],
          amount: parseFloat(invoiceData.totalWithVat),
          subtotal: parseFloat(invoiceData.subtotal),
          vatAmount: parseFloat(invoiceData.vatAmount),
          createdBy: req.session.userId ?? null,
        });

        return res.status(201).json(updated || invoice);
      }

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

      autoCreateJournalEntry({
        type: "invoice_issued",
        referenceId: invoice.id,
        referenceNumber: invoice.invoiceNumber ? String(invoice.invoiceNumber) : null,
        date: new Date().toISOString().split("T")[0],
        amount: parseFloat(invoiceData.totalWithVat),
        subtotal: parseFloat(invoiceData.subtotal),
        vatAmount: parseFloat(invoiceData.vatAmount),
        createdBy: req.session.userId ?? null,
      });

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
      const body = { ...req.body };
      // Normalize and validate the retained earnings account code
      if (body.retainedEarningsAccountCode !== undefined) {
        body.retainedEarningsAccountCode = String(body.retainedEarningsAccountCode).trim();
        if (!body.retainedEarningsAccountCode) {
          return res.status(400).json({ message: "رمز حساب الأرباح المحتجزة لا يمكن أن يكون فارغاً" });
        }
      }
      const settings = await storage.upsertCompanySettings(body);
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

  app.delete("/api/inventory/:id", requireRole("owner", "assistant", "warehouse"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "معرف غير صالح" });
      await storage.deleteInventoryItem(id);
      return res.json({ message: "تم حذف المادة بنجاح" });
    } catch {
      return res.status(500).json({ message: "حدث خطأ أثناء الحذف" });
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
      const { inventoryId, type, quantity, reason, contractId, supplierId, notes, workOrderId, purchaseOrderId } = req.body;
      if (!inventoryId || !type || !quantity) {
        return res.status(400).json({ message: "بيانات ناقصة", messageEn: "Missing required fields" });
      }
      const txQty = parseFloat(quantity);
      if (txQty <= 0) return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر", messageEn: "Quantity must be greater than zero" });

      const STOCK_OUT_REASONS = ["production_use", "contract_delivery", "supplier_return", "damaged", "sample", "adjustment", "other"];
      const STOCK_IN_REASONS = ["purchase", "customer_return", "production_return", "adjustment", "transfer", "other"];
      if (type === "stock_out" && !STOCK_OUT_REASONS.includes(reason)) {
        return res.status(400).json({ message: "يجب اختيار سبب صحيح للإخراج", messageEn: "A valid stock-out reason is required" });
      }
      if (type === "stock_in" && !STOCK_IN_REASONS.includes(reason)) {
        return res.status(400).json({ message: "يجب اختيار سبب صحيح للإدخال", messageEn: "A valid stock-in reason is required" });
      }

      // Stock-out: reason details are mandatory
      const notesText = typeof notes === "string" ? notes.trim() : "";
      if (type === "stock_out" && !notesText) {
        return res.status(400).json({ message: "تفاصيل السبب إجبارية لإخراج المخزون", messageEn: "Reason details are required for stock-out" });
      }

      // Supplier link: required for supplier returns, optional otherwise; must reference a real supplier
      let supplierIdNum: number | null = null;
      if (supplierId !== undefined && supplierId !== null && supplierId !== "") {
        supplierIdNum = parseInt(String(supplierId));
        if (isNaN(supplierIdNum)) {
          return res.status(400).json({ message: "معرف المورد غير صالح", messageEn: "Invalid supplier id" });
        }
      }
      if (type === "stock_out" && reason === "supplier_return" && !supplierIdNum) {
        return res.status(400).json({ message: "يجب اختيار المورد عند الإرجاع لمورد", messageEn: "A supplier is required for supplier returns" });
      }
      if (supplierIdNum) {
        const supplier = await storage.getSupplier(supplierIdNum);
        if (!supplier) return res.status(400).json({ message: "المورد غير موجود", messageEn: "Supplier not found" });
      }

      const item = await storage.getInventoryItem(inventoryId);
      if (!item) return res.status(404).json({ message: "المادة غير موجودة", messageEn: "Inventory item not found" });

      const currentQty = parseFloat(item.quantity?.toString() || "0");
      if (type === "stock_out" && txQty > currentQty) {
        return res.status(400).json({ message: `الكمية المتوفرة (${currentQty}) غير كافية`, messageEn: `Insufficient stock (${currentQty} available)` });
      }

      const contractIdNum = contractId ? parseInt(contractId) : null;
      const tx = await storage.createInventoryTransaction({ inventoryId, type, quantity, reason, contractId: contractIdNum, supplierId: supplierIdNum, notes: notesText || null, workOrderId, purchaseOrderId, performedBy: req.session.userId });

      let newQty = currentQty;
      if (type === "stock_in") newQty = currentQty + txQty;
      else if (type === "stock_out") newQty = currentQty - txQty;
      else newQty = txQty;
      await storage.updateInventoryItem(inventoryId, { quantity: newQty.toString() });

      // Auto-create an expense journal entry on stock-out (Dr COGS / Cr Inventory) by cost.
      // Best-effort: a journal failure must not roll back the already-committed stock movement.
      if (type === "stock_out") {
        try {
          const unitCost = parseFloat(item.costPerUnit?.toString() || "0");
          const totalCost = unitCost * txQty;
          if (totalCost > 0) {
            const matName = item.materialNameAr || item.materialNameEn || `#${inventoryId}`;
            // Supplier returns reduce supplier payables instead of expensing to COGS
            const debitLine = reason === "supplier_return"
              ? { entryId: 0, accountCode: "2111", accountNameAr: "ذمم الموردين", debit: totalCost.toFixed(2), credit: "0" }
              : { entryId: 0, accountCode: "5100", accountNameAr: "تكلفة المواد الخام", debit: totalCost.toFixed(2), credit: "0" };
            await storage.createJournalEntry(
              {
                date: new Date().toISOString().slice(0, 10),
                description: `إخراج مخزون: ${matName} (${txQty})${notesText ? ` — ${notesText}` : ""}`,
                reference: `INV-OUT-${tx.id}`,
                referenceType: "inventory_out",
                referenceId: tx.id,
                status: "posted",
                createdBy: req.session.userId,
              } as any,
              [
                debitLine,
                { entryId: 0, accountCode: "1130", accountNameAr: "المخزون", debit: "0", credit: totalCost.toFixed(2) },
              ] as any,
            );
          }
        } catch (journalError) {
          console.error("Stock-out journal entry failed (movement still recorded):", journalError);
        }
      }

      // Customer return linked to a contract: reduce the contract's remaining
      // balance by the cost value of the returned items (floored at 0).
      // Best-effort: a balance-update failure must not roll back the movement.
      if (type === "stock_in" && reason === "customer_return" && contractIdNum) {
        try {
          const contract = await storage.getContract(contractIdNum);
          // Only reduce the balance of an active contract. Ignore links to
          // completed/cancelled or non-existent contracts to avoid tampering.
          if (contract && contract.status === "active") {
            const unitCost = parseFloat(item.costPerUnit?.toString() || "0");
            const totalCost = unitCost * txQty;
            if (totalCost > 0) {
              const currentRemaining = parseFloat(contract.remainingAmount?.toString() || "0");
              const newRemaining = Math.max(0, currentRemaining - totalCost);
              await storage.updateContract(contractIdNum, { remainingAmount: newRemaining.toFixed(2) });
            }
          }
        } catch (balanceError) {
          console.error("Customer-return contract balance update failed (movement still recorded):", balanceError);
        }
      }

      res.status(201).json(tx);
    } catch (error) {
      console.error("Inventory transaction error:", error);
      res.status(500).json({ message: "حدث خطأ في تسجيل الحركة", messageEn: "Error recording transaction" });
    }
  });

  // ==================== SUPPLIERS ====================

  app.get("/api/suppliers", requireRole("owner", "assistant", "warehouse", "purchasing", "accountant"), async (_req, res) => {
    try {
      const list = await storage.getSuppliers();
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب الموردين", messageEn: "Error fetching suppliers" });
    }
  });

  // الحركات المالية للمورد (دفتر مساعد) — لأدوار المالية فقط
  app.get("/api/suppliers/:id/financials", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const supplierId = parseInt(String(req.params.id));
      if (!Number.isInteger(supplierId) || supplierId <= 0) return res.status(400).json({ message: "معرف المورد غير صحيح" });
      const { pool } = await import("./db");
      const result = await pool.query(
        `SELECT jel.id, jel.account_code, jel.account_name_ar, jel.debit, jel.credit,
                je.id AS entry_id, je.entry_number, je.date AS entry_date, je.description, je.reference_type
         FROM journal_entry_lines jel
         INNER JOIN journal_entries je ON jel.entry_id = je.id
         WHERE je.status = 'posted' AND jel.party_type = 'supplier' AND jel.party_id = $1
         ORDER BY je.date, je.id, jel.id`,
        [supplierId]
      );
      // حساب ذمم الموردين خصوم: الدائن = التزام علينا (فاتورة/استحقاق)، المدين = سداد له
      let totalDebit = 0, totalCredit = 0, running = 0;
      const movements = result.rows.map((l: any) => {
        const d = parseFloat(String(l.debit || 0));
        const c = parseFloat(String(l.credit || 0));
        totalDebit += d; totalCredit += c;
        running += c - d; // الرصيد الدائن = المتبقي للمورد
        return { ...l, runningBalance: +running.toFixed(2) };
      });
      res.json({
        totalPaid: +totalDebit.toFixed(2),      // ما صُرف له
        totalOwed: +totalCredit.toFixed(2),     // ما استحق له
        balance: +(totalCredit - totalDebit).toFixed(2), // المتبقي له (موجب = علينا له)
        movements,
      });
    } catch (e: any) { res.status(500).json({ message: e.message || "حدث خطأ" }); }
  });

  app.get("/api/suppliers/:id", requireRole("owner", "assistant", "warehouse", "purchasing", "accountant"), async (req, res) => {
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
      const supplier = await storage.createSupplier({ ...parsed, approvalStatus: "pending" });
      res.status(201).json(supplier);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "بيانات غير صالحة", messageEn: "Invalid data", errors: error.errors });
      res.status(500).json({ message: "حدث خطأ في إضافة المورد", messageEn: "Error creating supplier" });
    }
  });

  app.patch("/api/suppliers/:id", requireRole("owner", "assistant", "purchasing"), async (req, res) => {
    try {
      const { approvalStatus, ...rest } = req.body || {};
      const updated = await storage.updateSupplier(parseInt(req.params.id), rest);
      if (!updated) return res.status(404).json({ message: "المورد غير موجود", messageEn: "Supplier not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في تحديث المورد", messageEn: "Error updating supplier" });
    }
  });

  app.patch("/api/suppliers/:id/approval", requireRole("owner", "assistant"), async (req, res) => {
    try {
      const { approvalStatus } = req.body || {};
      if (!["approved", "rejected", "pending"].includes(approvalStatus)) {
        return res.status(400).json({ message: "حالة غير صالحة", messageEn: "Invalid approval status" });
      }
      const updated = await storage.updateSupplier(parseInt(req.params.id), { approvalStatus });
      if (!updated) return res.status(404).json({ message: "المورد غير موجود", messageEn: "Supplier not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في تحديث حالة المورد", messageEn: "Error updating supplier approval" });
    }
  });

  // ==================== WAREHOUSES ====================

  app.get("/api/warehouses", requireRole("owner", "assistant", "warehouse", "purchasing"), async (_req, res) => {
    try {
      const list = await storage.getWarehouses();
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب المستودعات", messageEn: "Error fetching warehouses" });
    }
  });

  app.post("/api/warehouses", requireRole("owner", "assistant"), async (req, res) => {
    try {
      const { insertWarehouseSchema } = await import("@shared/schema");
      const parsed = insertWarehouseSchema.parse(req.body);
      const warehouse = await storage.createWarehouse(parsed);
      res.status(201).json(warehouse);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "بيانات غير صالحة", messageEn: "Invalid data", errors: error.errors });
      res.status(500).json({ message: "حدث خطأ في إضافة المستودع", messageEn: "Error creating warehouse" });
    }
  });

  app.patch("/api/warehouses/:id", requireRole("owner", "assistant"), async (req, res) => {
    try {
      const updated = await storage.updateWarehouse(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "المستودع غير موجود", messageEn: "Warehouse not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في تحديث المستودع", messageEn: "Error updating warehouse" });
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

  app.get("/api/purchase-orders/:id", requireRole("owner", "assistant", "purchasing", "warehouse", "accountant"), async (req, res) => {
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
      if (req.body?.supplierId) {
        const supplier = await storage.getSupplier(parseInt(req.body.supplierId));
        if (!supplier) return res.status(404).json({ message: "المورد غير موجود", messageEn: "Supplier not found" });
        if (supplier.approvalStatus !== "approved") {
          return res.status(400).json({ message: "لا يمكن إنشاء أمر شراء لمورد غير معتمد", messageEn: "Cannot create a purchase order for an unapproved supplier" });
        }
      }
      const po = await storage.createPurchaseOrder({ ...req.body, createdBy: req.session.userId });
      res.status(201).json(po);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في إنشاء أمر الشراء", messageEn: "Error creating purchase order" });
    }
  });

  app.patch("/api/purchase-orders/:id", requireRole("owner", "assistant", "purchasing"), async (req, res) => {
    try {
      const poId = parseInt(req.params.id);
      const data = { ...req.body };
      if (data.status === "approved") data.approvedBy = req.session.userId;
      if (data.supplierId) {
        const supplier = await storage.getSupplier(parseInt(data.supplierId));
        if (!supplier) return res.status(404).json({ message: "المورد غير موجود", messageEn: "Supplier not found" });
        if (supplier.approvalStatus !== "approved") {
          return res.status(400).json({ message: "لا يمكن ربط أمر الشراء بمورد غير معتمد", messageEn: "Cannot assign an unapproved supplier to a purchase order" });
        }
      }
      const existingPO = await storage.getPurchaseOrder(poId);
      const updated = await storage.updatePurchaseOrder(poId, data);
      if (!updated) return res.status(404).json({ message: "أمر الشراء غير موجود", messageEn: "Purchase order not found" });

      if (data.status === "received" && existingPO && existingPO.status !== "received") {
        autoCreateJournalEntry({
          type: "po_received",
          referenceId: updated.id,
          referenceNumber: updated.orderNumber ? String(updated.orderNumber) : null,
          date: new Date().toISOString().split("T")[0],
          amount: parseFloat(String(updated.totalAmount)),
          createdBy: req.session.userId ?? null,
        });
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في تحديث أمر الشراء", messageEn: "Error updating purchase order" });
    }
  });

  // ==================== EMPLOYEES ====================

  app.get("/api/employees", requireRole("owner", "assistant", "hr", "it"), async (_req, res) => {
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

  app.post("/api/employees", requireRole("owner", "assistant", "hr", "it"), async (req, res) => {
    try {
      const { insertEmployeeSchema } = await import("@shared/schema");
      const parsed = insertEmployeeSchema.parse(req.body);
      if (!parsed.fullNameAr || !String(parsed.fullNameAr).trim()) {
        return res.status(400).json({ message: "اسم الموظف مطلوب", messageEn: "Employee name is required" });
      }
      const num = String(parsed.employeeNumber || "").trim();
      if (!num) return res.status(400).json({ message: "رقم الموظف مطلوب", messageEn: "Employee number is required" });
      parsed.employeeNumber = num;
      const dup = (await storage.getEmployees()).find(e => e.employeeNumber === num);
      if (dup) return res.status(409).json({ message: `رقم الموظف ${num} مستخدم لموظف آخر`, messageEn: `Employee number ${num} is already in use` });
      const emp = await storage.createEmployee(parsed);
      res.status(201).json(emp);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "بيانات غير صالحة", messageEn: "Invalid data", errors: error.errors });
      if (error?.code === "23505") return res.status(409).json({ message: "رقم الموظف مستخدم لموظف آخر", messageEn: "Employee number already in use" });
      console.error("Employee creation error:", error);
      res.status(500).json({ message: "حدث خطأ في إضافة الموظف", messageEn: "Error creating employee" });
    }
  });

  app.patch("/api/employees/:id", requireRole("owner", "assistant", "hr", "it"), async (req, res) => {
    try {
      if ("fullNameAr" in req.body && (!req.body.fullNameAr || !String(req.body.fullNameAr).trim())) {
        return res.status(400).json({ message: "اسم الموظف مطلوب", messageEn: "Employee name is required" });
      }
      if ("employeeNumber" in req.body) {
        const num = String(req.body.employeeNumber || "").trim();
        if (!num) return res.status(400).json({ message: "رقم الموظف مطلوب", messageEn: "Employee number is required" });
        req.body.employeeNumber = num;
        const empId = parseInt(String(req.params.id));
        const existing = (await storage.getEmployees()).find(e => e.employeeNumber === num && e.id !== empId);
        if (existing) return res.status(409).json({ message: `رقم الموظف ${num} مستخدم لموظف آخر`, messageEn: `Employee number ${num} is already in use` });
      }
      const updated = await storage.updateEmployee(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "الموظف غير موجود", messageEn: "Employee not found" });
      res.json(updated);
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ message: "رقم الموظف مستخدم لموظف آخر", messageEn: "Employee number already in use" });
      res.status(500).json({ message: "حدث خطأ في تحديث الموظف", messageEn: "Error updating employee" });
    }
  });

  app.delete("/api/employees/:id", requireRole("owner", "assistant", "hr", "it"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "معرف غير صالح" });
      const emp = await storage.getEmployee(id);
      if (!emp) return res.status(404).json({ message: "الموظف غير موجود" });
      await storage.deleteEmployee(id);
      return res.json({ message: "تم حذف سجل الموظف بنجاح" });
    } catch {
      return res.status(500).json({ message: "حدث خطأ أثناء الحذف" });
    }
  });

  // ==================== HR: EMPLOYEE DOCUMENTS ====================

  const hrDocUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error("Only PDF, JPEG, and PNG files are allowed"));
    },
  });

  app.post("/api/employees/:id/documents", requireRole("owner", "assistant", "hr"), hrDocUpload.single("file"), async (req: any, res) => {
    try {
      const empId = parseInt(req.params.id);
      const emp = await storage.getEmployee(empId);
      if (!emp) return res.status(404).json({ message: "الموظف غير موجود" });
      if (!req.file) return res.status(400).json({ message: "لم يتم رفع أي ملف" });

      const filename = makeSafeFilename(req.file.originalname);
      await saveObjectFile(HR_DOCS_FOLDER, filename, req.file.buffer, req.file.mimetype);

      try {
        const docs = (emp.documents as any[] || []);
        const newDoc = {
          id: Date.now(),
          name: req.body.name || req.file.originalname,
          url: `/uploads/hr-documents/${filename}`,
          mime: req.file.mimetype,
          uploadedAt: new Date().toISOString(),
        };
        docs.push(newDoc);
        const updated = await storage.updateEmployee(empId, { documents: docs } as any);
        res.json(updated);
      } catch (dbErr) {
        // Roll back the orphaned object if persisting metadata fails
        await deleteObjectFile(HR_DOCS_FOLDER, filename);
        throw dbErr;
      }
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في رفع المستند" });
    }
  });

  app.delete("/api/employees/:id/documents/:docId", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const empId = parseInt(req.params.id);
      const docId = parseInt(req.params.docId);
      const emp = await storage.getEmployee(empId);
      if (!emp) return res.status(404).json({ message: "الموظف غير موجود" });
      const allDocs = (emp.documents as any[] || []);
      const removed = allDocs.find((d: any) => d.id === docId);
      const docs = allDocs.filter((d: any) => d.id !== docId);
      const updated = await storage.updateEmployee(empId, { documents: docs } as any);
      if (removed?.url) {
        const fn = path.basename(String(removed.url));
        await deleteObjectFile(HR_DOCS_FOLDER, fn);
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في حذف المستند" });
    }
  });

  app.get("/uploads/hr-documents/:filename", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
      const served = await streamObjectFile(HR_DOCS_FOLDER, filename, res);
      if (!served) return res.status(404).json({ message: "الملف غير موجود" });
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ message: "حدث خطأ في جلب الملف" });
    }
  });

  // ==================== JOB TITLES ====================

  app.get("/api/job-titles", requireRole("owner", "assistant", "hr", "it"), async (_req, res) => {
    try { res.json(await storage.getJobTitles()); }
    catch (error) { res.status(500).json({ message: "حدث خطأ" }); }
  });

  app.post("/api/job-titles", requireRole("owner", "hr", "it"), async (req, res) => {
    try {
      const { insertJobTitleSchema } = await import("@shared/schema");
      const parsed = insertJobTitleSchema.parse(req.body);
      res.status(201).json(await storage.createJobTitle(parsed));
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.patch("/api/job-titles/:id", requireRole("owner", "hr", "it"), async (req, res) => {
    try {
      const updated = await storage.updateJobTitle(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "المسمى غير موجود" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.delete("/api/job-titles/:id", requireRole("owner", "hr", "it"), async (req, res) => {
    try {
      await storage.deleteJobTitle(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ==================== HR AUDIT LOG ====================

  app.get("/api/hr-audit-log", requireRole("owner", "it"), async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      res.json(await storage.getHrAuditLogs(employeeId));
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ==================== HR: ACCOUNT MANAGEMENT ====================

  app.post("/api/hr/reset-password", requireRole("owner", "hr", "it"), async (req: any, res) => {
    try {
      const { userId, newPassword, employeeId } = req.body;
      if (!userId || !newPassword) return res.status(400).json({ message: "بيانات ناقصة" });
      const targetUser = await storage.getUser(parseInt(userId));
      if (!targetUser) return res.status(404).json({ message: "المستخدم غير موجود" });
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(parseInt(userId), { password: hashed });
      await storage.createHrAuditLog({
        performedBy: req.user?.id || null,
        targetUserId: parseInt(userId),
        employeeId: employeeId ? parseInt(employeeId) : null,
        action: "reset_password",
        details: `تم إعادة تعيين كلمة المرور للمستخدم @${targetUser.username}`,
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في إعادة تعيين كلمة المرور" });
    }
  });

  app.post("/api/hr/toggle-account", requireRole("owner", "hr", "it"), async (req: any, res) => {
    try {
      const { userId, active, employeeId } = req.body;
      if (userId === undefined || active === undefined) return res.status(400).json({ message: "بيانات ناقصة" });
      const targetUser = await storage.getUser(parseInt(userId));
      if (!targetUser) return res.status(404).json({ message: "المستخدم غير موجود" });
      await storage.updateUser(parseInt(userId), { active: Boolean(active) });
      await storage.createHrAuditLog({
        performedBy: req.user?.id || null,
        targetUserId: parseInt(userId),
        employeeId: employeeId ? parseInt(employeeId) : null,
        action: active ? "enable_account" : "disable_account",
        details: `${active ? "تفعيل" : "تعطيل"} حساب المستخدم @${targetUser.username}`,
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ==================== EMPLOYEE ASSETS (عُهد) ====================

  app.get("/api/employees/:id/assets", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const assets = await storage.getEmployeeAssets(parseInt(req.params.id));
      res.json(assets);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في جلب العُهد", messageEn: "Error fetching assets" });
    }
  });

  app.post("/api/employees/:id/assets", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const { insertEmployeeAssetSchema } = await import("@shared/schema");
      const parsed = insertEmployeeAssetSchema.parse({ ...req.body, employeeId: parseInt(req.params.id) });
      const asset = await storage.createEmployeeAsset(parsed);
      res.status(201).json(asset);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "بيانات غير صالحة", messageEn: "Invalid data", errors: error.errors });
      res.status(500).json({ message: "حدث خطأ في إضافة العُهدة", messageEn: "Error creating asset" });
    }
  });

  app.patch("/api/employee-assets/:id", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const updated = await storage.updateEmployeeAsset(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "العُهدة غير موجودة", messageEn: "Asset not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في تحديث العُهدة", messageEn: "Error updating asset" });
    }
  });

  // ==================== PAYROLL (مسيّر الرواتب) ====================

  const computeNet = (basic: number, allowances: number, deductions: number, advance: number = 0) =>
    Math.max(0, basic + allowances - deductions - advance);

  app.get("/api/payroll", requireRole("owner", "assistant", "hr", "accountant"), async (req, res) => {
    try {
      const period = typeof req.query.period === "string" ? req.query.period : undefined;
      res.json(await storage.getPayrollRecords(period));
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching payroll" });
    }
  });

  // Generate draft payroll records for all active employees for a given period.
  app.post("/api/payroll/generate", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const period = typeof req.body.period === "string" ? req.body.period.trim() : "";
      if (!/^\d{4}-\d{2}$/.test(period)) {
        return res.status(400).json({ message: "الفترة غير صالحة (YYYY-MM)", messageEn: "Invalid period (YYYY-MM)" });
      }
      const employees = await storage.getEmployees();
      const activeEmployees = employees.filter(e => e.status === "active");
      let created = 0;
      for (const emp of activeEmployees) {
        const existing = await storage.getPayrollRecordByEmployeePeriod(emp.id, period);
        if (existing) continue;
        const basic = parseFloat(emp.monthlySalary?.toString() || "0");
        // Auto-include this employee's active advance installment as a deduction.
        let advDeduction = 0;
        const adv = await storage.getActiveAdvanceForEmployee(emp.id);
        if (adv) {
          const remaining = parseFloat(adv.remainingAmount?.toString() || "0");
          const monthly = parseFloat(adv.monthlyDeduction?.toString() || "0");
          advDeduction = Math.max(0, Math.min(monthly, remaining));
        }
        await storage.createPayrollRecord({
          employeeId: emp.id,
          period,
          basicSalary: basic.toFixed(2),
          allowances: "0",
          deductions: "0",
          advanceDeduction: advDeduction.toFixed(2),
          netSalary: computeNet(basic, 0, 0, advDeduction).toFixed(2),
          status: "draft",
          createdBy: req.session.userId,
        } as any);
        created++;
      }
      res.status(201).json({ created, total: activeEmployees.length });
    } catch (error) {
      console.error("Payroll generate error:", error);
      res.status(500).json({ message: "حدث خطأ في إنشاء المسيّر", messageEn: "Error generating payroll" });
    }
  });

  app.patch("/api/payroll/:id", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const record = await storage.getPayrollRecord(id);
      if (!record) return res.status(404).json({ message: "السجل غير موجود", messageEn: "Record not found" });
      if (record.status === "paid") {
        return res.status(400).json({ message: "لا يمكن تعديل راتب مدفوع", messageEn: "Cannot edit a paid record" });
      }

      const validNum = (v: any) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : null; };
      const updates: any = {};
      let basic = parseFloat(record.basicSalary.toString());
      let allowances = parseFloat(record.allowances.toString());
      let deductions = parseFloat(record.deductions.toString());
      if (req.body.basicSalary !== undefined) {
        const v = validNum(req.body.basicSalary);
        if (v === null) return res.status(400).json({ message: "الراتب الأساسي غير صالح", messageEn: "Invalid basic salary" });
        basic = v;
      }
      if (req.body.allowances !== undefined) {
        const v = validNum(req.body.allowances);
        if (v === null) return res.status(400).json({ message: "قيمة البدلات غير صالحة", messageEn: "Invalid allowances" });
        allowances = v;
      }
      if (req.body.deductions !== undefined) {
        const v = validNum(req.body.deductions);
        if (v === null) return res.status(400).json({ message: "قيمة الخصومات غير صالحة", messageEn: "Invalid deductions" });
        deductions = v;
      }
      if (req.body.basicSalary !== undefined) updates.basicSalary = basic.toFixed(2);
      if (req.body.allowances !== undefined) updates.allowances = allowances.toFixed(2);
      if (req.body.deductions !== undefined) updates.deductions = deductions.toFixed(2);
      if (req.body.notes !== undefined) updates.notes = req.body.notes;
      const advanceDed = parseFloat(record.advanceDeduction?.toString() || "0");
      updates.netSalary = computeNet(basic, allowances, deductions, advanceDed).toFixed(2);

      const updated = await storage.updatePayrollRecord(id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Payroll update error:", error);
      res.status(500).json({ message: "حدث خطأ في التعديل", messageEn: "Error updating record" });
    }
  });

  // Mark a payroll record as paid: sets paid date and posts a salary journal entry.
  app.post("/api/payroll/:id/pay", requireRole("owner", "assistant", "hr", "accountant"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const record = await storage.getPayrollRecord(id);
      if (!record) return res.status(404).json({ message: "السجل غير موجود", messageEn: "Record not found" });
      if (record.status === "paid") {
        return res.status(400).json({ message: "تم دفع هذا الراتب مسبقاً", messageEn: "Already paid" });
      }

      const paidDate = new Date().toISOString().slice(0, 10);
      const net = parseFloat(record.netSalary.toString());
      const advRecovered = parseFloat(record.advanceDeduction?.toString() || "0");
      // Salary expense = cash paid (net) + advance recovered (deducted from pay).
      const salaryExpense = net + advRecovered;

      // Post the salary journal entry FIRST. Ordering journal-before-paid means a
      // journal failure leaves the record in 'draft' (retryable) instead of
      // paid-without-a-ledger-entry. The reference guard makes a retry idempotent.
      //   Dr 6100 رواتب وأجور (salary expense)
      //   Cr 1140 سلف الموظفين (advance recovered, if any)
      //   Cr 1111 الصندوق (net cash paid)
      if (salaryExpense > 0) {
        const existing = await storage.findJournalEntryByReference("payroll", record.id);
        if (!existing) {
          const emp = await storage.getEmployee(record.employeeId);
          const empName = emp?.fullNameAr || emp?.fullNameEn || `#${record.employeeId}`;
          const lines: any[] = [
            { entryId: 0, accountCode: "6100", accountNameAr: "رواتب وأجور", debit: salaryExpense.toFixed(2), credit: "0" },
          ];
          if (advRecovered > 0) {
            lines.push({ entryId: 0, accountCode: "1140", accountNameAr: "سلف وعهد الموظفين", debit: "0", credit: advRecovered.toFixed(2) });
          }
          if (net > 0) {
            lines.push({ entryId: 0, accountCode: "1111", accountNameAr: "الصندوق", debit: "0", credit: net.toFixed(2) });
          }
          await storage.createJournalEntry(
            {
              date: paidDate,
              description: `صرف راتب ${empName} عن ${record.period}`,
              reference: `PAY-${record.id}`,
              referenceType: "payroll",
              referenceId: record.id,
              status: "posted",
              createdBy: req.session.userId,
            } as any,
            lines,
          );
        }
      }

      // Conditional transition draft -> paid; guards against a concurrent double-pay.
      const updated = await storage.markPayrollPaid(id, paidDate);
      if (!updated) {
        return res.status(409).json({ message: "تم دفع هذا الراتب مسبقاً", messageEn: "Already paid" });
      }

      // Recover the advance installment now that the salary is paid. Runs only after
      // the conditional pay succeeded, so it can't double-decrement on a retry.
      if (advRecovered > 0) {
        const adv = await storage.getActiveAdvanceForEmployee(record.employeeId);
        if (adv) {
          const remaining = Math.max(0, parseFloat(adv.remainingAmount?.toString() || "0") - advRecovered);
          await storage.updateEmployeeAdvance(adv.id, {
            remainingAmount: remaining.toFixed(2),
            status: remaining <= 0 ? "settled" : "approved",
          } as any);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Payroll pay error:", error);
      res.status(500).json({ message: "حدث خطأ في الصرف", messageEn: "Error processing payment" });
    }
  });

  // ==================== EMPLOYEE ADVANCES (السلف) ====================

  app.get("/api/advances", requireRole("owner", "assistant", "hr", "accountant"), async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      res.json(await storage.getEmployeeAdvances(employeeId));
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching advances" });
    }
  });

  app.post("/api/advances", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const employeeId = parseInt(req.body.employeeId);
      const amount = parseFloat(req.body.amount);
      const installments = parseInt(req.body.installments);
      if (!Number.isInteger(employeeId)) return res.status(400).json({ message: "الموظف مطلوب", messageEn: "Employee required" });
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "المبلغ غير صالح", messageEn: "Invalid amount" });
      if (!Number.isInteger(installments) || installments < 1) return res.status(400).json({ message: "عدد الأقساط غير صالح", messageEn: "Invalid installments" });

      const emp = await storage.getEmployee(employeeId);
      if (!emp) return res.status(404).json({ message: "الموظف غير موجود", messageEn: "Employee not found" });

      const monthly = Math.round((amount / installments) * 100) / 100;
      const created = await storage.createEmployeeAdvance({
        employeeId,
        amount: amount.toFixed(2),
        installments,
        monthlyDeduction: monthly.toFixed(2),
        remainingAmount: amount.toFixed(2),
        reason: typeof req.body.reason === "string" ? req.body.reason : null,
        status: "pending",
        requestDate: new Date().toISOString().slice(0, 10),
      } as any);
      res.status(201).json(created);
    } catch (error) {
      console.error("Advance create error:", error);
      res.status(500).json({ message: "حدث خطأ في إنشاء السلفة", messageEn: "Error creating advance" });
    }
  });

  // Approve an advance: disburse cash and post a journal (Dr 1140 / Cr 1111).
  app.post("/api/advances/:id/approve", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const adv = await storage.getEmployeeAdvance(id);
      if (!adv) return res.status(404).json({ message: "السلفة غير موجودة", messageEn: "Advance not found" });
      if (adv.status !== "pending") return res.status(400).json({ message: "تمت معالجة هذه السلفة مسبقاً", messageEn: "Advance already processed" });

      // Only one active (approved) advance per employee to keep payroll recovery simple.
      const existingActive = await storage.getActiveAdvanceForEmployee(adv.employeeId);
      if (existingActive) {
        return res.status(409).json({ message: "يوجد سلفة نشطة لهذا الموظف بالفعل", messageEn: "Employee already has an active advance" });
      }

      const approvedDate = new Date().toISOString().slice(0, 10);
      const amount = parseFloat(adv.amount.toString());

      // Post disbursement journal FIRST (idempotent via reference guard).
      const existingJe = await storage.findJournalEntryByReference("advance", adv.id);
      if (!existingJe && amount > 0) {
        const emp = await storage.getEmployee(adv.employeeId);
        const empName = emp?.fullNameAr || emp?.fullNameEn || `#${adv.employeeId}`;
        await storage.createJournalEntry(
          {
            date: approvedDate,
            description: `صرف سلفة للموظف ${empName}`,
            reference: `ADV-${adv.id}`,
            referenceType: "advance",
            referenceId: adv.id,
            status: "posted",
            createdBy: req.session.userId,
          } as any,
          [
            { entryId: 0, accountCode: "1140", accountNameAr: "سلف وعهد الموظفين", debit: amount.toFixed(2), credit: "0" },
            { entryId: 0, accountCode: "1111", accountNameAr: "الصندوق", debit: "0", credit: amount.toFixed(2) },
          ] as any,
        );
      }

      let updated;
      try {
        updated = await storage.updateEmployeeAdvance(id, {
          status: "approved",
          approvedBy: req.session.userId,
          approvedDate,
        } as any);
      } catch (e: any) {
        // Partial unique index race: another active advance won the approval.
        if (e?.code === "23505") {
          return res.status(409).json({ message: "يوجد سلفة نشطة لهذا الموظف بالفعل", messageEn: "Employee already has an active advance" });
        }
        throw e;
      }
      res.json(updated);
    } catch (error) {
      console.error("Advance approve error:", error);
      res.status(500).json({ message: "حدث خطأ في الاعتماد", messageEn: "Error approving advance" });
    }
  });

  app.post("/api/advances/:id/reject", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const adv = await storage.getEmployeeAdvance(id);
      if (!adv) return res.status(404).json({ message: "السلفة غير موجودة", messageEn: "Advance not found" });
      if (adv.status !== "pending") return res.status(400).json({ message: "تمت معالجة هذه السلفة مسبقاً", messageEn: "Advance already processed" });
      const updated = await storage.updateEmployeeAdvance(id, {
        status: "rejected",
        approvedBy: req.session.userId,
        approvedDate: new Date().toISOString().slice(0, 10),
        notes: typeof req.body.notes === "string" ? req.body.notes : adv.notes,
      } as any);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في الرفض", messageEn: "Error rejecting advance" });
    }
  });

  // ==================== LEAVE REQUESTS (الإجازات) ====================

  const annualEntitlement = (contractStart: string | null): number => {
    if (!contractStart) return 21;
    const years = (Date.now() - new Date(contractStart).getTime()) / (1000 * 3600 * 24 * 365.25);
    return years >= 5 ? 30 : 21;
  };

  app.get("/api/leaves", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      res.json(await storage.getLeaveRequests(employeeId));
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching leaves" });
    }
  });

  // Annual leave balance for an employee in a given year.
  app.get("/api/leaves/balance/:employeeId", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const employeeId = parseInt(req.params.employeeId);
      const year = typeof req.query.year === "string" && /^\d{4}$/.test(req.query.year) ? req.query.year : String(new Date().getFullYear());
      const emp = await storage.getEmployee(employeeId);
      if (!emp) return res.status(404).json({ message: "الموظف غير موجود", messageEn: "Employee not found" });
      const entitlement = annualEntitlement(emp.contractStart);
      const used = await storage.getApprovedAnnualLeaveDays(employeeId, year);
      res.json({ entitlement, used, remaining: Math.max(0, entitlement - used), year });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ", messageEn: "Error computing balance" });
    }
  });

  app.post("/api/leaves", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const employeeId = parseInt(req.body.employeeId);
      const leaveType = req.body.leaveType;
      const startDate = req.body.startDate;
      const endDate = req.body.endDate;
      const validTypes = ["annual", "sick", "unpaid", "emergency", "maternity", "other"];
      if (!Number.isInteger(employeeId)) return res.status(400).json({ message: "الموظف مطلوب", messageEn: "Employee required" });
      if (!validTypes.includes(leaveType)) return res.status(400).json({ message: "نوع الإجازة غير صالح", messageEn: "Invalid leave type" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")) {
        return res.status(400).json({ message: "التواريخ غير صالحة", messageEn: "Invalid dates" });
      }
      const start = new Date(startDate); const end = new Date(endDate);
      if (end < start) return res.status(400).json({ message: "تاريخ النهاية قبل البداية", messageEn: "End before start" });
      const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;

      const emp = await storage.getEmployee(employeeId);
      if (!emp) return res.status(404).json({ message: "الموظف غير موجود", messageEn: "Employee not found" });

      const created = await storage.createLeaveRequest({
        employeeId, leaveType, startDate, endDate, days,
        reason: typeof req.body.reason === "string" ? req.body.reason : null,
        status: "pending",
      } as any);
      res.status(201).json(created);
    } catch (error) {
      console.error("Leave create error:", error);
      res.status(500).json({ message: "حدث خطأ في إنشاء الطلب", messageEn: "Error creating leave" });
    }
  });

  // اعتماد بخطوتين (المرحلة 7): المدير المباشر ← HR. بدون مدير → HR/المالك مباشرة.
  // القرارات: approve / reject / clarify (طلب توضيح)
  const notifyEmployeeUser = async (employeeId: number, titleAr: string, messageAr: string, relatedId: number) => {
    try {
      const emp = await storage.getEmployee(employeeId);
      if (emp?.userId) {
        await storage.createNotification({
          userId: emp.userId,
          titleAr,
          titleEn: titleAr,
          messageAr,
          messageEn: messageAr,
          type: "info",
          relatedEntity: "leave_request",
          relatedId,
        } as any);
      }
    } catch { /* non-blocking */ }
  };

  // هل المستخدم الحالي هو المدير المباشر لهذا الموظف؟
  const isManagerOf = async (userId: number, employeeId: number): Promise<boolean> => {
    try {
      const emp = await storage.getEmployee(employeeId);
      if (!emp?.managerId) return false;
      const mgr = await storage.getEmployee(emp.managerId);
      return !!mgr?.userId && mgr.userId === userId;
    } catch {
      return false;
    }
  };

  app.post("/api/leaves/:id/decision", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const decision = req.body.decision;
      const note = typeof req.body.notes === "string" ? req.body.notes : null;
      if (!["approve", "reject", "clarify", "approved", "rejected"].includes(decision)) {
        return res.status(400).json({ message: "قرار غير صالح", messageEn: "Invalid decision" });
      }
      const normalized = decision === "approved" ? "approve" : decision === "rejected" ? "reject" : decision;
      const leave = await storage.getLeaveRequest(id);
      if (!leave) return res.status(404).json({ message: "الطلب غير موجود", messageEn: "Request not found" });
      if (leave.status === "approved" || leave.status === "rejected") {
        return res.status(400).json({ message: "تمت معالجة هذا الطلب مسبقاً", messageEn: "Already processed" });
      }

      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const isHrRole = !!user && ["owner", "assistant", "hr"].includes(user.role);
      const isMgr = await isManagerOf(userId, leave.employeeId);
      if (!isHrRole && !isMgr) {
        return res.status(403).json({ message: "غير مصرح لك بهذا القرار", messageEn: "Not authorized" });
      }

      const emp = await storage.getEmployee(leave.employeeId);
      const hasManager = !!emp?.managerId;
      const today = new Date().toISOString().slice(0, 10);

      if (normalized === "clarify") {
        if (!note) return res.status(400).json({ message: "سبب طلب التوضيح مطلوب", messageEn: "Reason required" });
        const updated = await storage.updateLeaveRequest(id, { status: "clarification_requested", notes: note } as any);
        await notifyEmployeeUser(leave.employeeId, "طلب توضيح على إجازتك", `يرجى توضيح: ${note}`, id);
        return res.json(updated);
      }

      if (normalized === "reject") {
        const updated = await storage.updateLeaveRequest(id, {
          status: "rejected",
          approvedBy: userId,
          approvedDate: today,
          notes: note ?? leave.notes,
        } as any);
        await notifyEmployeeUser(leave.employeeId, "تم رفض طلب الإجازة", note ? `السبب: ${note}` : "تم رفض طلبك", id);
        return res.json(updated);
      }

      // approve
      const atManagerStage = leave.status === "pending" || leave.status === "clarification_requested";
      if (atManagerStage && hasManager) {
        if (!isMgr && !isHrRole) return res.status(403).json({ message: "غير مصرح", messageEn: "Not authorized" });
        // موافقة المدير (أو HR نيابةً) → مرحلة HR النهائية
        if (isMgr) {
          const updated = await storage.updateLeaveRequest(id, {
            status: "manager_approved",
            managerApprovedBy: userId,
            managerApprovedDate: today,
            notes: note ?? leave.notes,
          } as any);
          await notifyEmployeeUser(leave.employeeId, "وافق مديرك على الإجازة", "بانتظار الاعتماد النهائي من الموارد البشرية", id);
          return res.json(updated);
        }
      }
      // الاعتماد النهائي: HR/المالك (أو مباشرة إن لم يوجد مدير)
      if (!isHrRole) {
        return res.status(403).json({ message: "الاعتماد النهائي من الموارد البشرية", messageEn: "Final approval is HR" });
      }
      const updated = await storage.updateLeaveRequest(id, {
        status: "approved",
        managerApprovedBy: leave.managerApprovedBy ?? userId,
        managerApprovedDate: leave.managerApprovedDate ?? today,
        approvedBy: userId,
        approvedDate: today,
        notes: note ?? leave.notes,
      } as any);
      await notifyEmployeeUser(leave.employeeId, "تم اعتماد الإجازة", `إجازتك من ${leave.startDate} إلى ${leave.endDate} معتمدة`, id);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في القرار", messageEn: "Error processing decision" });
    }
  });

  // الطلبات المعلّقة (لوحة المدير): إجازات + استئذانات بانتظار قرار المستخدم الحالي
  app.get("/api/pending-requests", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const isHrRole = !!user && ["owner", "assistant", "hr"].includes(user.role);
      const allEmployees = await storage.getEmployees();
      const myEmp = allEmployees.find(e => e.userId === userId);
      const managedIds = myEmp ? allEmployees.filter(e => e.managerId === myEmp.id).map(e => e.id) : [];

      const allLeaves = await storage.getLeaveRequests();
      const allPerms = await storage.getAttendancePermissions();

      const relevantLeave = (l: typeof allLeaves[number]) => {
        if (l.status === "pending" || l.status === "clarification_requested") {
          const emp = allEmployees.find(e => e.id === l.employeeId);
          if (emp?.managerId) return managedIds.includes(l.employeeId) || isHrRole;
          return isHrRole;
        }
        if (l.status === "manager_approved") return isHrRole;
        return false;
      };
      const relevantPerm = (p: typeof allPerms[number]) => {
        if (p.status !== "pending" && p.status !== "clarification_requested") return false;
        if (!p.employeeId) return isHrRole;
        const emp = allEmployees.find(e => e.id === p.employeeId);
        if (emp?.managerId) return managedIds.includes(p.employeeId) || isHrRole;
        return isHrRole;
      };

      const empInfo = (id: number | null) => {
        const e = id ? allEmployees.find(x => x.id === id) : undefined;
        return e ? { nameAr: e.fullNameAr, department: e.department } : null;
      };
      const historyFor = (employeeId: number | null) => {
        if (!employeeId) return { totalLeaves: 0, totalPermissions: 0, approved: 0, rejected: 0 };
        const empLeaves = allLeaves.filter(l => l.employeeId === employeeId);
        const empPerms = allPerms.filter(p => p.employeeId === employeeId);
        const approved = empLeaves.filter(l => l.status === "approved").length + empPerms.filter(p => p.status === "approved" || p.status === "auto_approved").length;
        const rejected = empLeaves.filter(l => l.status === "rejected").length + empPerms.filter(p => p.status === "rejected").length;
        return { totalLeaves: empLeaves.length, totalPermissions: empPerms.length, approved, rejected };
      };

      res.json({
        leaves: allLeaves.filter(relevantLeave).map(l => ({ ...l, employee: empInfo(l.employeeId), history: historyFor(l.employeeId) })),
        permissions: allPerms.filter(relevantPerm).map(p => ({ ...p, employee: empInfo(p.employeeId), history: historyFor(p.employeeId) })),
      });
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // تقرير شهري بعدد الطلبات لكل موظف ونسبة القبول/الرفض (إجازات + استئذانات)
  app.get("/api/requests-report", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const monthParam = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)
        ? req.query.month
        : new Date().toISOString().slice(0, 7);
      const allEmployees = await storage.getEmployees();
      const allLeaves = (await storage.getLeaveRequests()).filter(l => String(l.startDate).startsWith(monthParam));
      const allPerms = (await storage.getAttendancePermissions()).filter(p => String(p.date).startsWith(monthParam));
      const results = allEmployees
        .filter(e => e.status === "active")
        .map(e => {
          const ls = allLeaves.filter(l => l.employeeId === e.id);
          const ps = allPerms.filter(p => p.employeeId === e.id);
          const total = ls.length + ps.length;
          const approved = ls.filter(l => l.status === "approved").length + ps.filter(p => p.status === "approved" || p.status === "auto_approved").length;
          const rejected = ls.filter(l => l.status === "rejected").length + ps.filter(p => p.status === "rejected").length;
          return {
            employeeId: e.id,
            nameAr: e.fullNameAr,
            department: e.department,
            leaves: ls.length,
            permissions: ps.length,
            total,
            approved,
            rejected,
            approvalRate: total > 0 ? Math.round((approved / total) * 100) : null,
          };
        })
        .filter(r => r.total > 0)
        .sort((a, b) => b.total - a.total);
      res.json({ period: monthParam, results });
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ==================== HR ACTIONS (ملف الموظف — WF-01..WF-10) ====================

  const { HR_WORKFLOWS } = await import("@shared/hr-workflows");

  // من يستطيع تنفيذ خطوة؟ HR/المالك/المساعد دائماً؛ المدير المباشر لخطوات manager
  const canActHrStep = async (userId: number, stepRole: string, employeeId: number | null): Promise<boolean> => {
    const user = await storage.getUser(userId);
    if (!user) return false;
    const isHrRole = ["owner", "assistant", "hr"].includes(user.role);
    if (stepRole === "owner") return ["owner", "assistant"].includes(user.role);
    if (isHrRole) return true; // HR ينفذ خطوات hr/employee (تسجيل الإقرار) وmanager عند غياب المدير
    if (stepRole === "manager" && employeeId != null) return isManagerOf(userId, employeeId);
    return false;
  };

  app.get("/api/hr-actions", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      const workflow = typeof req.query.workflow === "string" ? req.query.workflow : undefined;
      const prehire = req.query.prehire === "true";
      const rows = await storage.getHrActions({ employeeId, workflow, prehire });
      res.json(rows);
    } catch {
      res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching HR actions" });
    }
  });

  app.post("/api/hr-actions", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const workflow = String(req.body.workflow || "");
      const def = HR_WORKFLOWS[workflow];
      if (!def) return res.status(400).json({ message: "مسار غير معروف", messageEn: "Unknown workflow" });
      const employeeId = req.body.employeeId != null ? parseInt(req.body.employeeId) : null;
      if (def.tab !== "prehire") {
        if (!Number.isInteger(employeeId)) return res.status(400).json({ message: "الموظف مطلوب", messageEn: "Employee required" });
        const emp = await storage.getEmployee(employeeId!);
        if (!emp) return res.status(404).json({ message: "الموظف غير موجود", messageEn: "Employee not found" });
      }
      const formData = typeof req.body.formData === "object" && req.body.formData ? req.body.formData : {};
      for (const f of def.fields) {
        if (f.required && (formData[f.key] == null || String(formData[f.key]).trim() === "")) {
          return res.status(400).json({ message: `الحقل مطلوب: ${f.labelAr}`, messageEn: `Required field: ${f.labelEn}` });
        }
      }
      const user = await storage.getUser(req.session.userId!);
      const created = await storage.createHrAction({
        employeeId: def.tab === "prehire" ? null : employeeId,
        workflow,
        tab: def.tab,
        status: "pending",
        currentStep: 0,
        formData,
        timeline: [{
          step: "created",
          action: "إنشاء الإجراء",
          byUserId: req.session.userId!,
          byName: user?.fullNameAr || user?.username || "",
          at: new Date().toISOString(),
          note: typeof req.body.note === "string" ? req.body.note : undefined,
        }],
        createdBy: req.session.userId!,
      } as any);
      res.status(201).json(created);
    } catch {
      res.status(500).json({ message: "حدث خطأ في إنشاء الإجراء", messageEn: "Error creating HR action" });
    }
  });

  // تنفيذ خطوة: complete / reject / cancel
  app.post("/api/hr-actions/:id/step", requireAuth, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const decision = String(req.body.decision || "");
      const note = typeof req.body.note === "string" && req.body.note.trim() ? req.body.note.trim() : undefined;
      if (!["complete", "reject", "cancel"].includes(decision)) {
        return res.status(400).json({ message: "قرار غير صالح", messageEn: "Invalid decision" });
      }
      const action = await storage.getHrAction(id);
      if (!action) return res.status(404).json({ message: "الإجراء غير موجود", messageEn: "Not found" });
      if (["completed", "rejected", "cancelled"].includes(action.status)) {
        return res.status(400).json({ message: "الإجراء منتهٍ ولا يمكن تعديله", messageEn: "Action already finalized" });
      }
      const def = HR_WORKFLOWS[action.workflow];
      if (!def) return res.status(400).json({ message: "مسار غير معروف", messageEn: "Unknown workflow" });
      const step = def.steps[action.currentStep];
      if (!step) return res.status(400).json({ message: "لا توجد خطوة حالية", messageEn: "No current step" });

      const userId = req.session.userId!;
      const allowed = await canActHrStep(userId, step.role, action.employeeId);
      if (!allowed) return res.status(403).json({ message: "غير مصرح لك بهذه الخطوة", messageEn: "Not authorized for this step" });
      if (decision === "reject" && !note) {
        return res.status(400).json({ message: "سبب الرفض مطلوب", messageEn: "Rejection reason required" });
      }

      const user = await storage.getUser(userId);
      const entry = {
        step: step.key,
        action: decision === "complete"
          ? (step.kind === "acknowledge" ? "إقرار/توقيع" : step.kind === "approve" ? "اعتماد" : "تنفيذ")
          : decision === "reject" ? "رفض" : "إلغاء",
        byUserId: userId,
        byName: user?.fullNameAr || user?.username || "",
        at: new Date().toISOString(),
        note,
      };
      const timeline = [...(((action.timeline as any) || []) as any[]), entry];

      // دمج تحديثات النموذج المُرسلة مع الخطوة (إن وجدت)
      const bodyFd = (req.body.formData && typeof req.body.formData === "object") ? req.body.formData : null;
      const mergedFd: any = bodyFd ? { ...((action.formData as any) || {}), ...bodyFd } : (action.formData as any) || {};

      if (decision === "reject" || decision === "cancel") {
        const updated = await storage.advanceHrAction(id, action.currentStep, {
          status: decision === "reject" ? "rejected" : "cancelled",
          timeline,
        } as any);
        if (!updated) return res.status(409).json({ message: "تم تعديل الإجراء من مستخدم آخر، حدّث الصفحة", messageEn: "Action was modified concurrently, refresh" });
        if (action.employeeId && decision === "reject") {
          await notifyEmployeeUser(action.employeeId, `تم رفض: ${def.nameAr}`, note ? `السبب: ${note}` : "تم الرفض", id);
        }
        return res.json(updated);
      }

      // complete step
      const nextStep = action.currentStep + 1;
      const isLast = nextStep >= def.steps.length;
      // عند الإكمال النهائي: التحقق من الحقول الإلزامية
      if (isLast) {
        const missing = def.fields.filter(f => f.required && !String(mergedFd[f.key] ?? "").trim());
        if (missing.length > 0) {
          return res.status(400).json({
            message: `حقول إلزامية ناقصة: ${missing.map(f => f.labelAr).join("، ")}`,
            messageEn: `Missing required fields: ${missing.map(f => f.labelEn).join(", ")}`,
            missingFields: missing.map(f => f.key),
          });
        }
      }
      const newStatus = isLast ? "completed" : "in_progress";
      const updated = await storage.advanceHrAction(id, action.currentStep, {
        currentStep: isLast ? action.currentStep : nextStep,
        status: newStatus,
        timeline,
        formData: mergedFd,
      } as any);
      if (!updated) return res.status(409).json({ message: "تم تعديل الإجراء من مستخدم آخر، حدّث الصفحة", messageEn: "Action was modified concurrently, refresh" });

      let chained: any = null;
      if (isLast) {
        if (action.employeeId) {
          await notifyEmployeeUser(action.employeeId, `اكتمل: ${def.nameAr}`, "اكتمل الإجراء بنجاح", id);
        }
        // السلاسل التلقائية
        if (action.workflow === "wf02") {
          // WF-02 ← WF-03: مباشرة عمل تلقائياً بنفس بيانات المرشح
          const existing = await storage.getHrActionByLink(action.id, "wf03");
          chained = existing || await storage.createHrAction({
            employeeId: null,
            workflow: "wf03",
            tab: "prehire",
            status: "pending",
            currentStep: 0,
            formData: { ...mergedFd, startDate: mergedFd?.startDate || "" },
            linkedActionId: action.id,
            timeline: [{ step: "created", action: "إنشاء تلقائي بعد قبول العرض الوظيفي", byUserId: userId, byName: entry.byName, at: entry.at }],
            createdBy: userId,
          } as any);
        } else if (action.workflow === "wf03" && !action.employeeId) {
          // WF-03 مكتمل ← إنشاء ملف الموظف من بيانات العرض الوظيفي
          const src = (action.linkedActionId ? await storage.getHrAction(action.linkedActionId) : null);
          const fd: any = { ...((src?.formData as any) || {}), ...mergedFd };
          const validDepts = ["sales", "design", "production", "warehouse", "finance", "hr", "it", "delivery", "installation", "quality", "management", "customer_service", "purchasing", "other"];
          const empNumber = `EMP-${Date.now().toString().slice(-6)}`;
          try {
            const newEmp = await storage.createEmployee({
              employeeNumber: empNumber,
              fullNameAr: fd.candidateName || "موظف جديد",
              nationality: fd.nationality === "saudi" ? "saudi" : "resident",
              position: fd.position || "-",
              department: validDepts.includes(fd.department) ? fd.department : "production",
              monthlySalary: String(parseFloat(fd.monthlySalary) || 0),
              contractStart: fd.startDate || new Date().toISOString().slice(0, 10),
              phone: fd.candidatePhone || null,
              status: "active",
            } as any);
            await storage.updateHrAction(id, { employeeId: newEmp.id } as any);
            if (src) await storage.updateHrAction(src.id, { employeeId: newEmp.id } as any);
            chained = { createdEmployee: newEmp };
          } catch (e) {
            console.error("wf03 employee creation failed:", e);
          }
        } else if (def.autoNext === "wf05" && (action.workflow === "wf06" || action.workflow === "wf06b")) {
          // WF-06/06B ← جدولة WF-05 عند انتهاء العقد
          const fd: any = mergedFd;
          const existing = await storage.getHrActionByLink(action.id, "wf05");
          chained = existing || await storage.createHrAction({
            employeeId: action.employeeId,
            workflow: "wf05",
            tab: "requests",
            status: "pending",
            currentStep: 0,
            formData: { reason: "other", lastWorkingDay: fd.contractEnd || "", notes: "مجدول تلقائياً بعد اعتماد عدم التجديد" },
            linkedActionId: action.id,
            timeline: [{ step: "created", action: "إنشاء تلقائي (جدولة إنهاء عند انتهاء العقد)", byUserId: userId, byName: entry.byName, at: entry.at }],
            createdBy: userId,
          } as any);
        } else if (action.workflow === "wf05") {
          // WF-05 ← WF-07 إقرار مستحقات
          const existing = await storage.getHrActionByLink(action.id, "wf07");
          chained = existing || await storage.createHrAction({
            employeeId: action.employeeId,
            workflow: "wf07",
            tab: "requests",
            status: "pending",
            currentStep: 0,
            formData: { amount: "", details: "" },
            linkedActionId: action.id,
            timeline: [{ step: "created", action: "إنشاء تلقائي بعد إنهاء الخدمات", byUserId: userId, byName: entry.byName, at: entry.at }],
            createdBy: userId,
          } as any);
        }
      }

      res.json({ ...updated, chained });
    } catch (e) {
      console.error("hr-action step error:", e);
      res.status(500).json({ message: "حدث خطأ في تنفيذ الخطوة", messageEn: "Error processing step" });
    }
  });

  // ==================== PERFORMANCE EVALUATIONS (تقييم الأداء) ====================

  const clampScore = (v: any): number => {
    const n = parseInt(v);
    if (!Number.isFinite(n)) return 3;
    return Math.min(5, Math.max(1, n));
  };

  app.get("/api/evaluations", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      res.json(await storage.getPerformanceEvaluations(employeeId));
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ", messageEn: "Error fetching evaluations" });
    }
  });

  app.post("/api/evaluations", requireRole("owner", "assistant", "hr"), async (req, res) => {
    try {
      const employeeId = parseInt(req.body.employeeId);
      const period = typeof req.body.period === "string" ? req.body.period.trim() : "";
      if (!Number.isInteger(employeeId)) return res.status(400).json({ message: "الموظف مطلوب", messageEn: "Employee required" });
      if (!period) return res.status(400).json({ message: "الفترة مطلوبة", messageEn: "Period required" });
      const emp = await storage.getEmployee(employeeId);
      if (!emp) return res.status(404).json({ message: "الموظف غير موجود", messageEn: "Employee not found" });

      const q = clampScore(req.body.scoreQuality);
      const p = clampScore(req.body.scoreProductivity);
      const a = clampScore(req.body.scoreAttendance);
      const t = clampScore(req.body.scoreTeamwork);
      const d = clampScore(req.body.scoreDiscipline);
      const overall = (q + p + a + t + d) / 5;

      const created = await storage.createPerformanceEvaluation({
        employeeId, period, evaluatorId: req.session.userId,
        scoreQuality: q, scoreProductivity: p, scoreAttendance: a, scoreTeamwork: t, scoreDiscipline: d,
        overallScore: overall.toFixed(2),
        strengths: typeof req.body.strengths === "string" ? req.body.strengths : null,
        improvements: typeof req.body.improvements === "string" ? req.body.improvements : null,
        status: req.body.status === "finalized" ? "finalized" : "draft",
      } as any);
      res.status(201).json(created);
    } catch (error) {
      console.error("Evaluation create error:", error);
      res.status(500).json({ message: "حدث خطأ في إنشاء التقييم", messageEn: "Error creating evaluation" });
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

      const existing = await storage.getDelivery(id);
      if (!existing) {
        return res.status(404).json({ message: "غير موجود", messageEn: "Not found" });
      }

      // Server-side status guard: only allow uploads for in_transit or delivered
      if (existing.status !== "in_transit" && existing.status !== "delivered") {
        return res.status(422).json({ message: "لا يمكن رفع الصور إلا في حالات 'في الطريق' أو 'تم التوصيل'", messageEn: "Photos can only be uploaded for in_transit or delivered deliveries" });
      }

      const newPhotoPaths: string[] = [];
      for (const f of files) {
        const filename = makeSafeFilename(f.originalname);
        await saveObjectFile(DELIVERY_PHOTOS_FOLDER, filename, f.buffer, f.mimetype);
        newPhotoPaths.push(`/uploads/delivery-photos/${filename}`);
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
    try {
      const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
      const photoPath = `/uploads/delivery-photos/${filename}`;
      // Verify that this photo path exists in at least one delivery record
      const allDeliveries = await storage.getDeliveries();
      const hasAccess = allDeliveries.some(d => d.deliveryPhotos && d.deliveryPhotos.includes(photoPath));
      if (!hasAccess) return res.status(403).json({ message: "غير مصرح" });
      const served = await streamObjectFile(DELIVERY_PHOTOS_FOLDER, filename, res);
      if (!served) return res.status(404).json({ message: "الملف غير موجود" });
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ message: "حدث خطأ في جلب الملف" });
    }
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

      const allUsers = await storage.getUsers();
      const allQuotations = await storage.getQuotations();
      const relatedQuotation = allQuotations.find((q: any) => q.id === contract.quotationId);
      const assignedSalesId = relatedQuotation?.assignedTo;
      const notifyUserIds = new Set<number>();
      allUsers.filter((u: any) => ["owner", "assistant"].includes(u.role)).forEach((u: any) => notifyUserIds.add(u.id));
      if (assignedSalesId) notifyUserIds.add(assignedSalesId);
      for (const uid of notifyUserIds) {
        await storage.createNotification({
          userId: uid,
          type: "action",
          titleAr: "وصل دفع جديد من العميل — بانتظار مراجعتك",
          titleEn: "New Payment Receipt from Customer — Awaiting Your Review",
          messageAr: `العميل ${customer.fullName} رفع وصل دفع بمبلغ ${amount} — يرجى مراجعته وتأكيد الاستلام`,
          messageEn: `Customer ${customer.fullName} uploaded payment receipt of ${amount} — please review and confirm`,
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
    if (user.role === "sales") {
      if (surveyRow.createdBy === user.id) return { allowed: true, survey: surveyRow };
      // Also allow if the sales rep is assigned to the linked quotation
      if (surveyRow.quotationId) {
        const quotation = await storage.getQuotation(surveyRow.quotationId);
        if (quotation && quotation.assignedTo === user.id) return { allowed: true, survey: surveyRow };
      }
    }
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
          return res.status(403).json({ message: "غير مصرح" });
        }
        const userId = (req as any).session.userId!;
        const uploadedFile = req.file;
        if (!uploadedFile) return res.status(400).json({ message: "لم يتم إرسال ملف" });
        const { fileLabel, quotationId } = req.body;
        const filename = makeSafeFilename(uploadedFile.originalname);
        await saveObjectFile(SURVEY_FILES_FOLDER, filename, uploadedFile.buffer, uploadedFile.mimetype);
        const fileUrl = `/uploads/survey-files/${filename}`;
        const label = (fileLabel && String(fileLabel).trim()) ? String(fileLabel).trim() : uploadedFile.originalname;
        try {
          const result = await pool.query(
            `INSERT INTO survey_design_files (survey_id, quotation_id, file_name, file_label, file_url, mime_type, file_size, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, survey_id, quotation_id, file_name, file_label, file_url, mime_type, file_size, attach_to_quote, uploaded_by, created_at`,
            [surveyId, quotationId || null, uploadedFile.originalname, label, fileUrl, uploadedFile.mimetype || "application/pdf", uploadedFile.size, userId]
          );
          res.status(201).json(result.rows[0]);
        } catch (dbErr) {
          // Roll back the orphaned object if the DB insert fails
          await deleteObjectFile(SURVEY_FILES_FOLDER, filename);
          throw dbErr;
        }
      } catch (error) {
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
      // Clean up object storage file
      const fileUrl: string | null = del.rows[0].file_url;
      if (fileUrl) {
        try {
          await deleteObjectFile(SURVEY_FILES_FOLDER, path.basename(fileUrl));
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
        // Stream from object storage
        const served = await streamObjectFile(SURVEY_FILES_FOLDER, path.basename(file_url), res, {
          contentType: mime_type || "application/pdf",
          disposition: `attachment; filename="${encodeURIComponent(file_name)}"`,
        });
        if (!served) return res.status(404).json({ message: "الملف غير موجود على القرص" });
        return;
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
      WHERE username IN ('k.asiri','fatima','mohammed','saddad','quality1','hanan')
        AND active = true
    `);

    // 4. Ensure fingerprint_location column exists on employees table
    await db.execute(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS fingerprint_location TEXT
    `);

    // 4b. Add attendance_enabled column to employees if missing
    await db.execute(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS attendance_enabled BOOLEAN NOT NULL DEFAULT TRUE
    `);

    // 4c. Create employee_assets table if missing
    await db.execute(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_status') THEN
          CREATE TYPE asset_status AS ENUM ('active', 'returned');
        END IF;
      END $$;
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS employee_assets (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        asset_type TEXT NOT NULL,
        description TEXT NOT NULL,
        serial_number TEXT,
        status asset_status NOT NULL DEFAULT 'active',
        assigned_at DATE NOT NULL,
        returned_at DATE,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 5. Authoritatively set fingerprint_location for all 12 known employees
    // Uses username as stable key; overwrites any incorrect existing value
    const fingerprintBackfill = [
      { username: 'siham',    location: 'مصنع' },
      { username: 'ayman',    location: 'مصنع' },
      { username: 'hamdi',    location: 'مصنع' },
      { username: 'ismail',   location: 'مصنع' },
      { username: 'sultan',   location: 'مصنع' },
      { username: 'mohannad', location: 'معرض' },
      { username: 'hadi',     location: 'معرض' },
      { username: 'mohsen',   location: 'مصنع' },
      { username: 'bassam',   location: 'مصنع' },
      { username: 'sedad',    location: 'مصنع' },
      { username: 'm.sobri',  location: 'مصنع' },
      { username: 'noura',    location: 'مصنع' },
    ];
    for (const fp of fingerprintBackfill) {
      await db.execute(`
        UPDATE employees
        SET fingerprint_location = '${fp.location}'
        WHERE user_id = (SELECT id FROM users WHERE username = '${fp.username}' LIMIT 1)
          AND fingerprint_location IS DISTINCT FROM '${fp.location}'
      `);
    }

    console.log("Employee-user reconciliation migration completed");
  } catch (empMigrationError) {
    console.warn("Employee migration (non-fatal):", empMigrationError instanceof Error ? empMigrationError.message : String(empMigrationError));
  }

  // HR Module: Add new columns to employees and create new tables
  try {
    await db.execute(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_type') THEN
          CREATE TYPE contract_type AS ENUM ('fixed', 'open', 'temporary', 'training');
        END IF;
      END $$;
    `);
    await db.execute(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_type contract_type;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS insurance_expiry DATE;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS finger_scan_location TEXT;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS email TEXT;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS full_name_ar TEXT NOT NULL DEFAULT '';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS full_name_en TEXT;
    `);
    // Backfill employee names from any linked user accounts (only where empty).
    await db.execute(`
      UPDATE employees e SET full_name_ar = u.full_name_ar
        FROM users u WHERE e.user_id = u.id AND (e.full_name_ar IS NULL OR e.full_name_ar = '');
    `);
    await db.execute(`
      UPDATE employees e SET full_name_en = u.full_name_en
        FROM users u WHERE e.user_id = u.id AND (e.full_name_en IS NULL OR e.full_name_en = '');
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS job_titles (
        id SERIAL PRIMARY KEY,
        name_ar TEXT NOT NULL,
        name_en TEXT NOT NULL,
        department TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS hr_audit_log (
        id SERIAL PRIMARY KEY,
        performed_by INTEGER REFERENCES users(id),
        target_user_id INTEGER REFERENCES users(id),
        employee_id INTEGER REFERENCES employees(id),
        action TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(`
      DO $$ BEGIN
        CREATE TYPE payroll_status AS ENUM ('draft', 'paid');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS payroll_records (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        period TEXT NOT NULL,
        basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
        allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
        deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
        net_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
        status payroll_status NOT NULL DEFAULT 'draft',
        paid_date DATE,
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS payroll_records_employee_period_unique
        ON payroll_records (employee_id, period);
    `);
    await db.execute(`
      ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS advance_deduction NUMERIC(12,2) NOT NULL DEFAULT 0;
    `);
    // Employee Advances (السلف)
    await db.execute(`
      DO $$ BEGIN
        CREATE TYPE advance_status AS ENUM ('pending', 'approved', 'rejected', 'settled');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS employee_advances (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        amount NUMERIC(12,2) NOT NULL,
        installments INTEGER NOT NULL DEFAULT 1,
        monthly_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
        remaining_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        reason TEXT,
        status advance_status NOT NULL DEFAULT 'pending',
        request_date DATE NOT NULL,
        approved_by INTEGER REFERENCES users(id),
        approved_date DATE,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    // Enforce ONE active (approved) advance per employee at the DB level (concurrency-safe).
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_advance_per_employee
      ON employee_advances(employee_id) WHERE status = 'approved';
    `);
    // Leave Requests (الإجازات)
    await db.execute(`
      DO $$ BEGIN
        CREATE TYPE leave_type AS ENUM ('annual', 'sick', 'unpaid', 'emergency', 'maternity', 'other');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await db.execute(`
      DO $$ BEGIN
        CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        leave_type leave_type NOT NULL DEFAULT 'annual',
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        days INTEGER NOT NULL DEFAULT 1,
        reason TEXT,
        status leave_status NOT NULL DEFAULT 'pending',
        approved_by INTEGER REFERENCES users(id),
        approved_date DATE,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    // Performance Evaluations (تقييم الأداء)
    await db.execute(`
      DO $$ BEGIN
        CREATE TYPE evaluation_status AS ENUM ('draft', 'finalized');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS performance_evaluations (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        period TEXT NOT NULL,
        evaluator_id INTEGER REFERENCES users(id),
        score_quality INTEGER NOT NULL DEFAULT 3,
        score_productivity INTEGER NOT NULL DEFAULT 3,
        score_attendance INTEGER NOT NULL DEFAULT 3,
        score_teamwork INTEGER NOT NULL DEFAULT 3,
        score_discipline INTEGER NOT NULL DEFAULT 3,
        overall_score NUMERIC(4,2) NOT NULL DEFAULT 3,
        strengths TEXT,
        improvements TEXT,
        status evaluation_status NOT NULL DEFAULT 'draft',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    // Attendance violations (مخالفات الحضور — محاولات مرفوضة)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS attendance_violations (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id),
        employee_phone TEXT,
        employee_name_ar TEXT,
        violation_type TEXT NOT NULL,
        attempted_type TEXT,
        details TEXT,
        occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    // Work schedule settings (إعدادات أوقات الدوام)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS work_schedule_settings (
        id SERIAL PRIMARY KEY,
        scope_type TEXT NOT NULL,
        department TEXT,
        employee_id INTEGER REFERENCES employees(id),
        work_start_time TEXT NOT NULL DEFAULT '08:00',
        grace_minutes INTEGER NOT NULL DEFAULT 15
      );
    `);
    await db.execute(`
      INSERT INTO work_schedule_settings (scope_type, work_start_time, grace_minutes)
      SELECT 'default', '08:00', 15
      WHERE NOT EXISTS (SELECT 1 FROM work_schedule_settings WHERE scope_type = 'default');
    `);
    // HR Actions (مسارات ملف الموظف WF-01..WF-10)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS hr_actions (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id),
        workflow TEXT NOT NULL,
        tab TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        current_step INTEGER NOT NULL DEFAULT 0,
        form_data JSONB DEFAULT '{}',
        timeline JSONB DEFAULT '[]',
        linked_action_id INTEGER,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    // تفرد الإجراءات المتسلسلة: منع تكرار إنشاء إجراء تابع لنفس الإجراء الأصلي
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS hr_actions_link_wf_uidx
      ON hr_actions (linked_action_id, workflow)
      WHERE linked_action_id IS NOT NULL;
    `);
    // Risk alerts (تنبيهات مؤشر الخطر) — تفرد لكل موظف/شهر/مستوى
    await db.execute(`
      CREATE TABLE IF NOT EXISTS risk_alerts (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        period TEXT NOT NULL,
        level TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS risk_alerts_emp_period_level_uq
      ON risk_alerts (employee_id, period, level);
    `);
    // Phase 7: managerId + اعتماد بخطوتين + استئذان Pending
    await db.execute(`ALTER TYPE leave_status ADD VALUE IF NOT EXISTS 'manager_approved'`);
    await db.execute(`ALTER TYPE leave_status ADD VALUE IF NOT EXISTS 'clarification_requested'`);
    await db.execute(`ALTER TYPE attendance_permission_status ADD VALUE IF NOT EXISTS 'clarification_requested'`);
    await db.execute(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES employees(id)`);
    await db.execute(`
      ALTER TABLE leave_requests
        ADD COLUMN IF NOT EXISTS manager_approved_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS manager_approved_date DATE;
    `);
    // Phase 6: التدخل الإداري + Audit Trail
    await db.execute(`
      ALTER TABLE attendance_records
        ADD COLUMN IF NOT EXISTS override_excuse TEXT,
        ADD COLUMN IF NOT EXISTS override_note TEXT,
        ADD COLUMN IF NOT EXISTS override_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS override_at TIMESTAMP;
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS attendance_audit_log (
        id SERIAL PRIMARY KEY,
        record_id INTEGER REFERENCES attendance_records(id),
        employee_id INTEGER REFERENCES employees(id),
        action TEXT NOT NULL,
        excuse_type TEXT,
        old_value JSONB DEFAULT '{}',
        new_value JSONB DEFAULT '{}',
        reason TEXT,
        edited_by INTEGER REFERENCES users(id),
        edited_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log("HR module migration completed");

    // Insurance expiry notifications: notify hr/owner users about employees expiring in <= 30 days
    try {
      const today = new Date();
      const in30 = new Date(today); in30.setDate(today.getDate() + 30);
      const todayStr = today.toISOString().split("T")[0];
      const in30Str = in30.toISOString().split("T")[0];
      const expiring = await pool.query(
        `SELECT id, employee_number, insurance_expiry FROM employees WHERE insurance_expiry IS NOT NULL AND insurance_expiry >= $1 AND insurance_expiry <= $2 AND status = 'active'`,
        [todayStr, in30Str]
      );
      if (expiring.rows.length > 0) {
        const hrUsers = (await storage.getUsers()).filter(u => ["owner", "hr"].includes(u.role) && u.active);
        for (const emp of expiring.rows) {
          const daysLeft = Math.ceil((new Date(emp.insurance_expiry).getTime() - today.getTime()) / (1000 * 3600 * 24));
          for (const u of hrUsers) {
            await storage.createNotification({
              userId: u.id,
              titleAr: "تنبيه: انتهاء التأمين الصحي",
              titleEn: "Health Insurance Expiry Alert",
              messageAr: `الموظف رقم ${emp.employee_number} - ينتهي التأمين الصحي خلال ${daysLeft} يوم`,
              messageEn: `Employee #${emp.employee_number} - health insurance expires in ${daysLeft} day(s)`,
              type: "warning",
              relatedEntity: "employee",
              relatedId: emp.id,
              isRead: false,
            } as any).catch(() => {});
          }
        }
      }
    } catch (notifError) {
      console.warn("Insurance expiry notification (non-fatal):", notifError instanceof Error ? notifError.message : String(notifError));
    }
  } catch (hrMigrationError) {
    console.warn("HR migration (non-fatal):", hrMigrationError instanceof Error ? hrMigrationError.message : String(hrMigrationError));
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

  // ─── Task #40: Marketing Map System ─────────────────────────────────────────

  // Get OSM buildings (Overpass API with 7-day cache)
  app.get("/api/map/buildings", requireAuth, async (req, res) => {
    const { bbox } = req.query;
    if (!bbox) return res.status(400).json({ message: "bbox required" });
    const parts = (bbox as string).split(",").map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return res.status(400).json({ message: "invalid bbox" });
    const [south, west, north, east] = parts;
    if ((north - south) > 0.025 || (east - west) > 0.025) return res.json([]);
    const bboxKey = `${south.toFixed(4)},${west.toFixed(4)},${north.toFixed(4)},${east.toFixed(4)}`;
    try {
      const cached = await pool.query(
        `SELECT buildings FROM osm_buildings_cache WHERE bbox = $1 AND fetched_at > NOW() - INTERVAL '7 days'`,
        [bboxKey]
      );
      if (cached.rows.length > 0) return res.json(cached.rows[0].buildings);
      const overpassQuery = `[out:json][timeout:30];(way["building"](${south},${west},${north},${east}););out geom tags;`;
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(overpassQuery)}`,
      });
      if (!response.ok) throw new Error(`Overpass error: ${response.status}`);
      const data = await response.json() as any;
      const buildings = (data.elements || [])
        .filter((e: any) => Array.isArray(e.geometry) && e.geometry.length >= 3)
        .slice(0, 300)
        .map((e: any) => {
          const geo: { lat: number; lon: number }[] = e.geometry;
          const avgLat = geo.reduce((s: number, p: { lat: number; lon: number }) => s + p.lat, 0) / geo.length;
          const avgLon = geo.reduce((s: number, p: { lat: number; lon: number }) => s + p.lon, 0) / geo.length;
          return {
            id: e.id,
            lat: avgLat,
            lon: avgLon,
            polygon: geo.map((p: { lat: number; lon: number }) => [p.lat, p.lon] as [number, number]),
            name: e.tags?.["name:ar"] || e.tags?.name || null,
            type: e.tags?.building || "yes",
          };
        });
      await pool.query(
        `INSERT INTO osm_buildings_cache (bbox, buildings) VALUES ($1, $2) ON CONFLICT (bbox) DO UPDATE SET buildings = $2, fetched_at = NOW()`,
        [bboxKey, JSON.stringify(buildings)]
      );
      res.json(buildings);
    } catch (error) {
      console.warn("Overpass API error (non-fatal):", error instanceof Error ? error.message : error);
      res.json([]);
    }
  });

  // Get visits (rep: own; manager: all or filtered by repId)
  app.get("/api/map/visits", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "غير مصرح" });
      if (["owner", "assistant", "it"].includes(user.role)) {
        const { repId } = req.query;
        let result;
        if (repId && repId !== "all") {
          result = await pool.query(
            `SELECT bv.*, COALESCE(u.full_name_ar, u.username) as rep_name, u.id as rep_user_id FROM building_visits bv
             JOIN users u ON u.id = bv.rep_id WHERE bv.rep_id = $1 ORDER BY bv.visited_at DESC`,
            [parseInt(repId as string)]
          );
        } else {
          result = await pool.query(
            `SELECT bv.*, COALESCE(u.full_name_ar, u.username) as rep_name, u.id as rep_user_id FROM building_visits bv
             JOIN users u ON u.id = bv.rep_id ORDER BY bv.visited_at DESC`
          );
        }
        return res.json(result.rows);
      } else {
        const result = await pool.query(
          `SELECT bv.*, COALESCE(u.full_name_ar, u.username) as rep_name, u.id as rep_user_id FROM building_visits bv
           JOIN users u ON u.id = bv.rep_id WHERE bv.rep_id = $1 ORDER BY bv.visited_at DESC`,
          [user.id]
        );
        return res.json(result.rows);
      }
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // Create visit
  app.post("/api/map/visits", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "غير مصرح" });
      if (!["sales", "owner", "assistant", "it"].includes(user.role)) {
        return res.status(403).json({ message: "غير مصرح" });
      }
      const { lat, lng, address, city, district, buildingStatus, notes, quotationId } = req.body;
      if (!lat || !lng || !buildingStatus) return res.status(400).json({ message: "lat, lng, buildingStatus مطلوبة" });
      const result = await pool.query(
        `INSERT INTO building_visits (rep_id, lat, lng, address, city, district, building_status, notes, quotation_id, visited_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
        [user.id, lat, lng, address || null, city || null, district || null, buildingStatus, notes || null, quotationId || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // Update visit
  app.patch("/api/map/visits/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { buildingStatus, notes, quotationId } = req.body;
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "غير مصرح" });
      const existing = await pool.query(`SELECT * FROM building_visits WHERE id = $1`, [id]);
      if (existing.rows.length === 0) return res.status(404).json({ message: "غير موجود" });
      if (!["owner", "assistant", "it"].includes(user.role) && existing.rows[0].rep_id !== user.id) {
        return res.status(403).json({ message: "غير مصرح" });
      }
      const setClauses: string[] = [];
      const params: (string | number | null)[] = [];
      if (buildingStatus) { setClauses.push(`building_status = $${params.push(buildingStatus)}`); }
      if (notes !== undefined) { setClauses.push(`notes = $${params.push(notes || null)}`); }
      if ("quotationId" in req.body) { setClauses.push(`quotation_id = $${params.push(quotationId ?? null)}`); }
      if (setClauses.length === 0) return res.json(existing.rows[0]);
      params.push(parseInt(id));
      const result = await pool.query(
        `UPDATE building_visits SET ${setClauses.join(", ")} WHERE id = $${params.length} RETURNING *`,
        params
      );
      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // Delete visit
  app.delete("/api/map/visits/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "غير مصرح" });
      const existing = await pool.query(`SELECT * FROM building_visits WHERE id = $1`, [id]);
      if (existing.rows.length === 0) return res.status(404).json({ message: "غير موجود" });
      if (!["owner", "assistant", "it"].includes(user.role) && existing.rows[0].rep_id !== user.id) {
        return res.status(403).json({ message: "غير مصرح" });
      }
      await pool.query(`DELETE FROM building_visits WHERE id = $1`, [id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // Get map stats (manager)
  app.get("/api/map/stats", requireRole("owner", "assistant", "it"), async (req, res) => {
    try {
      const [totalRes, statusRes, repRes] = await Promise.all([
        pool.query(`SELECT COUNT(*) as count FROM building_visits`),
        pool.query(`SELECT building_status, COUNT(*) as count FROM building_visits GROUP BY building_status`),
        pool.query(`
          SELECT COALESCE(u.full_name_ar, u.username) as full_name, u.id as rep_id,
            COUNT(bv.id) as visit_count,
            COUNT(CASE WHEN bv.building_status = 'interested' THEN 1 END) as interested_count,
            COUNT(CASE WHEN bv.building_status = 'follow_up' THEN 1 END) as follow_up_count,
            CASE WHEN COUNT(bv.id) > 0
              THEN ROUND(COUNT(CASE WHEN bv.building_status = 'interested' THEN 1 END)::numeric / COUNT(bv.id) * 100, 1)
              ELSE 0
            END as conversion_rate
          FROM users u
          LEFT JOIN building_visits bv ON bv.rep_id = u.id
          WHERE u.role = 'sales'
          GROUP BY u.id, u.full_name_ar, u.username
          ORDER BY conversion_rate DESC, visit_count DESC
        `),
      ]);
      res.json({
        totalVisits: parseInt(totalRes.rows[0].count),
        byStatus: statusRes.rows,
        byRep: repRes.rows,
      });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // Get zones
  app.get("/api/map/zones", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "غير مصرح" });
      let result;
      if (["owner", "assistant", "it"].includes(user.role)) {
        result = await pool.query(
          `SELECT mz.*, COALESCE(u.full_name_ar, u.username) as rep_name FROM marketing_zones mz JOIN users u ON u.id = mz.rep_id ORDER BY mz.created_at DESC`
        );
      } else {
        result = await pool.query(`SELECT * FROM marketing_zones WHERE rep_id = $1 ORDER BY created_at DESC`, [user.id]);
      }
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // Create zone
  app.post("/api/map/zones", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "غير مصرح" });
      if (!["sales", "owner", "assistant", "it"].includes(user.role)) {
        return res.status(403).json({ message: "غير مصرح" });
      }
      const { name, polygon, targetCount } = req.body;
      if (!name || !polygon) return res.status(400).json({ message: "name و polygon مطلوبان" });
      const result = await pool.query(
        `INSERT INTO marketing_zones (rep_id, name, polygon, target_count) VALUES ($1, $2, $3, $4) RETURNING *`,
        [user.id, name, JSON.stringify(polygon), targetCount || 0]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // Delete zone
  app.delete("/api/map/zones/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "غير مصرح" });
      const existing = await pool.query(`SELECT * FROM marketing_zones WHERE id = $1`, [id]);
      if (existing.rows.length === 0) return res.status(404).json({ message: "غير موجود" });
      if (!["owner", "assistant", "it"].includes(user.role) && existing.rows[0].rep_id !== user.id) {
        return res.status(403).json({ message: "غير مصرح" });
      }
      await pool.query(`DELETE FROM marketing_zones WHERE id = $1`, [id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // Manager overview: aggregate visits per location cluster with visit history
  app.get("/api/map/manager-overview", requireRole("owner", "assistant", "it"), async (req, res) => {
    const { city, dateFrom, dateTo, repId } = req.query;
    try {
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (city && city !== "all") {
        params.push(city as string);
        conditions.push(`bv.city = $${params.length}`);
      }
      if (dateFrom) {
        params.push(dateFrom as string);
        conditions.push(`bv.visited_at >= $${params.length}::date`);
      }
      if (dateTo) {
        params.push(dateTo as string);
        conditions.push(`bv.visited_at < ($${params.length}::date + interval '1 day')`);
      }
      if (repId && repId !== "all") {
        params.push(parseInt(repId as string));
        conditions.push(`bv.rep_id = $${params.length}`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // Group nearby visits (round lat/lng to 4 decimals ≈ 11m precision)
      const clusterQuery = `
        SELECT
          ROUND(bv.lat::numeric, 4) AS cluster_lat,
          ROUND(bv.lng::numeric, 4) AS cluster_lng,
          MAX(bv.address) AS address,
          MAX(bv.city) AS city,
          MAX(bv.district) AS district,
          COUNT(bv.id) AS total_visits,
          COUNT(DISTINCT bv.rep_id) AS rep_count,
          COUNT(CASE WHEN bv.building_status = 'interested' THEN 1 END) AS interested_count,
          COUNT(CASE WHEN bv.building_status = 'follow_up' THEN 1 END) AS follow_up_count,
          COUNT(CASE WHEN bv.building_status = 'not_suitable' THEN 1 END) AS not_suitable_count,
          COUNT(CASE WHEN bv.building_status = 'under_construction' THEN 1 END) AS under_construction_count,
          json_agg(json_build_object(
            'id', bv.id,
            'rep_name', COALESCE(u.full_name_ar, u.username),
            'rep_id', bv.rep_id,
            'building_status', bv.building_status,
            'notes', bv.notes,
            'visited_at', bv.visited_at
          ) ORDER BY bv.visited_at DESC) AS visit_history
        FROM building_visits bv
        JOIN users u ON u.id = bv.rep_id
        ${where}
        GROUP BY ROUND(bv.lat::numeric, 4), ROUND(bv.lng::numeric, 4)
        ORDER BY total_visits DESC
        LIMIT 500
      `;

      const citiesQuery = `SELECT DISTINCT city FROM building_visits WHERE city IS NOT NULL AND city != '' ORDER BY city`;

      const [clusterResult, citiesResult] = await Promise.all([
        pool.query(clusterQuery, params),
        pool.query(citiesQuery),
      ]);

      res.json({
        clusters: clusterResult.rows,
        cities: citiesResult.rows.map((r: { city: string }) => r.city),
      });
    } catch (error) {
      console.error("Manager overview error:", error);
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

  // ── Finance: Upcoming Payments (with days remaining) ─────────────────────

  app.get("/api/finance/upcoming-payments", requireRole("owner", "assistant", "accountant"), async (_req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const allContracts = await storage.getContracts();
      const upcoming: Array<{
        contractId: number;
        contractNumber: string;
        customerName: string;
        installmentLabel: string;
        amount: number;
        dueDate: string;
        daysRemaining: number;
        isOverdue: boolean;
      }> = [];

      for (const contract of allContracts) {
        if (contract.status !== "active") continue;
        const schedule = (contract.paymentSchedule as Array<{ label: string; amount: string; dueDate: string }>) || [];
        if (!Array.isArray(schedule)) continue;
        const customer = contract.customerId ? await storage.getCustomer(contract.customerId) : null;
        for (const item of schedule) {
          if (!item.dueDate) continue;
          // Normalize to date-only string (handles both "YYYY-MM-DD" and ISO timestamps)
          const dueDateKey = String(item.dueDate).slice(0, 10);
          const due = new Date(`${dueDateKey}T00:00:00`);
          const diffMs = due.getTime() - today.getTime();
          const daysRemaining = Math.ceil(diffMs / (1000 * 3600 * 24));
          // Show overdue (up to 7 days past) and upcoming (up to 30 days ahead)
          if (daysRemaining >= -7 && daysRemaining <= 30) {
            upcoming.push({
              contractId: contract.id,
              contractNumber: contract.contractNumber,
              customerName: customer?.fullName || "",
              installmentLabel: item.label || "",
              amount: parseFloat(item.amount || "0"),
              dueDate: dueDateKey,
              daysRemaining,
              isOverdue: daysRemaining < 0,
            });
          }
        }
      }

      upcoming.sort((a, b) => a.daysRemaining - b.daysRemaining);
      res.json(upcoming);
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ── Finance: Manual trigger for payment reminders ────────────────────────

  app.post("/api/finance/check-payment-reminders", requireRole("owner", "assistant", "accountant"), async (_req, res) => {
    try {
      const sent = await sendPaymentReminders(storage);
      res.json({ message: "تم إرسال التذكيرات", count: sent });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ── Schedule daily payment reminders (runs at startup + every 24h) ───────

  function toLocalDateKey(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  async function sendPaymentReminders(st: typeof storage): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(today);
    target.setDate(today.getDate() + 3);
    // Use local date components to avoid UTC off-by-one in non-UTC timezones (e.g. KSA = UTC+3)
    const targetKey = toLocalDateKey(target);

    const allContracts = await st.getContracts();
    const accountantUsers = (await st.getUsers()).filter(
      u => ["owner", "assistant", "accountant"].includes(u.role) && u.active
    );

    // Pre-build deduplication set: keys of already-sent reminders today
    // Key format: `${userId}|${contractId}|${dateKey}|${installmentLabel}`
    const alreadySentToday = new Set<string>();
    for (const u of accountantUsers) {
      const notifs = await st.getNotifications(u.id);
      for (const n of notifs) {
        if (
          n.createdAt >= today &&
          n.relatedEntity === "contract" &&
          n.relatedId !== null &&
          n.titleAr.startsWith("تذكير دفعة:") &&
          n.titleAr.includes(targetKey)
        ) {
          // Extract installment label from title: "تذكير دفعة: {label} ({date})"
          const labelMatch = n.titleAr.match(/^تذكير دفعة: (.+) \(\d{4}-\d{2}-\d{2}\)$/);
          const labelPart = labelMatch ? labelMatch[1] : "";
          alreadySentToday.add(`${u.id}|${n.relatedId}|${targetKey}|${labelPart}`);
        }
      }
    }

    let notifCount = 0;
    for (const contract of allContracts) {
      if (contract.status !== "active") continue;
      const schedule = (contract.paymentSchedule as Array<{ label: string; amount: string; dueDate: string }>) || [];
      if (!Array.isArray(schedule)) continue;
      const customer = contract.customerId ? await st.getCustomer(contract.customerId) : null;

      for (const item of schedule) {
        if (!item.dueDate) continue;
        // Normalize stored date to YYYY-MM-DD (handles ISO timestamps and date-only strings)
        const itemDateKey = String(item.dueDate).slice(0, 10);
        if (itemDateKey !== targetKey) continue;
        const amountFmt = parseFloat(item.amount || "0").toLocaleString("ar-SA");
        const labelAr = `تذكير دفعة: ${item.label || contract.contractNumber} (${itemDateKey})`;
        const messageAr = `موعد دفعة بقيمة ${amountFmt} ر.س للعقد ${contract.contractNumber}${customer ? ` - ${customer.fullName}` : ""} بعد 3 أيام (${itemDateKey})`;
        const messageEn = `Payment of SAR ${amountFmt} for contract ${contract.contractNumber}${customer ? ` - ${customer.fullName}` : ""} is due in 3 days (${itemDateKey})`;

        const installmentLabel = item.label || contract.contractNumber;
        for (const u of accountantUsers) {
          const dedupKey = `${u.id}|${contract.id}|${itemDateKey}|${installmentLabel}`;
          if (alreadySentToday.has(dedupKey)) continue;

          const created = await st.createNotification({
            userId: u.id,
            titleAr: labelAr,
            titleEn: `Payment Reminder: ${item.label || contract.contractNumber} (${itemDateKey})`,
            messageAr,
            messageEn,
            type: "warning",
            relatedEntity: "contract",
            relatedId: contract.id,
            isRead: false,
          }).catch(() => null);

          if (created) {
            alreadySentToday.add(dedupKey); // prevent duplicates within same run
            notifCount++;

            // Attempt WhatsApp/SMS via configured webhook (optional)
            const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
            if (webhookUrl && u.phone) {
              try {
                const whatsappRes = await fetch(webhookUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    phone: u.phone,
                    message: messageAr,
                    contractId: contract.id,
                  }),
                  signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
                });
                if (!whatsappRes.ok) {
                  console.warn(`[Payment Reminders] WhatsApp webhook returned ${whatsappRes.status} for user ${u.id} / contract ${contract.id}`);
                }
              } catch (whatsappErr) {
                console.warn("[Payment Reminders] WhatsApp webhook non-fatal:", whatsappErr instanceof Error ? whatsappErr.message : String(whatsappErr));
              }
            }
          }
        }
      }
    }
    return notifCount;
  }

  // Compute ms until next occurrence of a specific local hour (default 08:00)
  function msUntilLocalHour(targetHour: number): number {
    const now = new Date();
    const next = new Date(now);
    next.setHours(targetHour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  // Run once at startup (catches overnight deployments), then daily at 08:00 local
  (async () => {
    try {
      const count = await sendPaymentReminders(storage);
      if (count > 0) console.log(`[Payment Reminders] Sent ${count} notifications at startup`);
    } catch (err) {
      console.warn("[Payment Reminders] Startup check failed (non-fatal):", err instanceof Error ? err.message : String(err));
    }
    const scheduleDaily = () => {
      const delay = msUntilLocalHour(8); // 08:00 local time
      setTimeout(async () => {
        try {
          const count = await sendPaymentReminders(storage);
          if (count > 0) console.log(`[Payment Reminders] Daily check sent ${count} notifications`);
        } catch (err) {
          console.warn("[Payment Reminders] Daily check failed (non-fatal):", err instanceof Error ? err.message : String(err));
        }
        scheduleDaily(); // reschedule for next day
      }, delay);
    };
    scheduleDaily();
  })();

  // ============ FINANCE QUICK LOGIN ============

  function makeRateLimiter(maxAttempts: number, windowMs: number) {
    const map = new Map<string, { count: number; resetAt: number }>();
    return (ip: string): boolean => {
      const now = Date.now();
      const entry = map.get(ip) || { count: 0, resetAt: now + windowMs };
      if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
      entry.count++;
      map.set(ip, entry);
      return entry.count <= maxAttempts;
    };
  }
  const financeLookupRateLimit = makeRateLimiter(5, 60 * 1000);
  const financeLoginRateLimit = makeRateLimiter(5, 60 * 1000);

  app.post("/api/finance-auth/lookup", async (req, res) => {
    const ip = req.ip || "unknown";
    if (!financeLookupRateLimit(ip)) {
      return res.status(429).json({ message: "تجاوزت عدد المحاولات. انتظر دقيقة ثم أعد المحاولة." });
    }
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "رقم الجوال مطلوب", messageEn: "Phone number is required" });
    try {
      const normalizedPhone = normalizePhone(String(phone));
      const user = await storage.getUserByPhone(normalizedPhone);
      if (!user || user.role !== "accountant") {
        return res.status(403).json({ message: "رقم الجوال غير مسجّل كمحاسب في النظام" });
      }
      if (!user.active) return res.status(403).json({ message: "الحساب معطّل" });
      return res.json({ nameAr: user.fullNameAr });
    } catch {
      return res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/finance-auth/login", async (req, res) => {
    const ip = req.ip || "unknown";
    if (!financeLoginRateLimit(ip)) {
      return res.status(429).json({ message: "تجاوزت عدد المحاولات. انتظر دقيقة ثم أعد المحاولة." });
    }
    const { phone, pin } = req.body;
    if (!phone || !pin) return res.status(400).json({ message: "البيانات غير مكتملة" });
    try {
      const user = await storage.getUserByPhone(normalizePhone(String(phone)));
      if (!user || user.role !== "accountant" || !user.active) {
        return res.status(401).json({ message: "بيانات الدخول غير صحيحة" });
      }
      const expectedPin = user.financePin || "1400";
      if (String(pin) !== expectedPin) {
        return res.status(401).json({ message: "كلمة المرور غير صحيحة" });
      }
      req.session.userId = user.id;
      const { password: _, financePin: __, ...safeUser } = user;
      return res.json(safeUser);
    } catch {
      return res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.patch("/api/finance-auth/change-pin", requireRole("accountant"), async (req, res) => {
    const { currentPin, newPin } = req.body;
    if (!currentPin) {
      return res.status(400).json({ message: "يجب إدخال كلمة المرور الحالية" });
    }
    if (!newPin || String(newPin).length < 4) {
      return res.status(400).json({ message: "كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل" });
    }
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
      const expectedPin = user.financePin || "1400";
      if (String(currentPin) !== expectedPin) {
        return res.status(401).json({ message: "كلمة المرور الحالية غير صحيحة" });
      }
      await storage.updateUser(req.session.userId!, { financePin: String(newPin) });
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ message: "حدث خطأ أثناء تحديث كلمة المرور" });
    }
  });

  app.get("/api/finance-auth/my-pin", requireRole("accountant"), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
      return res.json({ pin: user.financePin || "1400" });
    } catch {
      return res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ============ ATTENDANCE SYSTEM ============

  // In-memory rate limiter for attendance password endpoint
  const attendanceRateLimit = new Map<string, { count: number; resetAt: number }>();
  const ATTENDANCE_MAX_ATTEMPTS = 10;
  const ATTENDANCE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

  function requireAttendanceAuth(req: Request, res: Response, next: NextFunction) {
    const session = (req as any).session;
    if (session?.attendanceAuth) return next();
    return res.status(401).json({ message: "يجب تسجيل الدخول لبوابة الدوام أولاً", messageEn: "You must sign in to the attendance portal first" });
  }

  app.post("/api/attendance/verify-password", async (req, res) => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const limiter = attendanceRateLimit.get(ip) || { count: 0, resetAt: now + ATTENDANCE_WINDOW_MS };
    if (now > limiter.resetAt) { limiter.count = 0; limiter.resetAt = now + ATTENDANCE_WINDOW_MS; }
    if (limiter.count >= ATTENDANCE_MAX_ATTEMPTS) {
      return res.status(429).json({ success: false, message: "تجاوزت عدد المحاولات المسموحة. حاول بعد 15 دقيقة.", messageEn: "Too many attempts. Try again in 15 minutes." });
    }
    limiter.count++;
    attendanceRateLimit.set(ip, limiter);

    const { password } = req.body;
    const portalPassword = process.env.ATTENDANCE_PORTAL_PASSWORD || "1400";
    if (password === portalPassword) {
      (req as any).session.attendanceAuth = true;
      limiter.count = 0;
      return res.json({ success: true });
    }
    return res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة", messageEn: "Incorrect password" });
  });

  app.get("/api/attendance/employees-list", requireAttendanceAuth, async (_req, res) => {
    try {
      const allEmployees = await storage.getEmployees();
      const allUsers = await storage.getUsers();
      const activeEmployees = allEmployees
        .filter(e => e.status === "active" && e.attendanceEnabled)
        .map(e => {
          const user = allUsers.find(u => u.id === e.userId);
          return {
            id: e.id,
            employeeNumber: e.employeeNumber,
            nameAr: e.fullNameAr?.trim() || user?.fullNameAr || e.phone || e.employeeNumber,
            phone: user?.phone || e.phone,
            locationName: e.fingerprintLocation || e.fingerScanLocation || "غير محدد",
            hasPin: !!user?.employeePin,
          };
        });
      res.json(activeEmployees);
    } catch {
      res.status(500).json({ message: "حدث خطأ", messageEn: "An error occurred" });
    }
  });

  app.get("/api/attendance/employee-lookup", requireAttendanceAuth, async (req, res) => {
    const { phone } = req.query as { phone?: string };
    if (!phone) return res.status(400).json({ message: "رقم الجوال مطلوب", messageEn: "Phone number is required" });
    try {
      const allEmployees = await storage.getEmployees();
      const allUsers = await storage.getUsers();
      const user = allUsers.find(u => u.phone === phone);
      let employee = user ? allEmployees.find(e => e.userId === user.id) : undefined;
      if (!employee) employee = allEmployees.find(e => e.phone === phone);
      if (!employee) return res.status(404).json({ message: "لم يُعثَر على موظف بهذا الرقم", messageEn: "No employee found with this number" });
      const empUser = allUsers.find(u => u.id === employee!.userId);
      const lastRecord = await storage.getLastAttendanceRecord(employee.id, phone);
      return res.json({
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        nameAr: employee.fullNameAr?.trim() || empUser?.fullNameAr || employee.phone || employee.employeeNumber,
        phone: empUser?.phone || employee.phone || phone,
        locationName: employee.fingerprintLocation || employee.fingerScanLocation || "غير محدد",
        attendanceEnabled: employee.attendanceEnabled,
        hasPin: !!empUser?.employeePin,
        lastRecord: lastRecord ? { type: lastRecord.type, checkTime: lastRecord.checkTime } : null,
      });
    } catch {
      res.status(500).json({ message: "حدث خطأ", messageEn: "An error occurred" });
    }
  });

  // In-memory rate limiter for attendance PIN verification (per IP)
  const attendancePinRateLimit = new Map<string, { count: number; resetAt: number }>();
  const ATTENDANCE_PIN_MAX_ATTEMPTS = 8;

  app.post("/api/attendance/verify-pin", requireAttendanceAuth, async (req, res) => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const limiter = attendancePinRateLimit.get(ip) || { count: 0, resetAt: now + ATTENDANCE_WINDOW_MS };
    if (now > limiter.resetAt) { limiter.count = 0; limiter.resetAt = now + ATTENDANCE_WINDOW_MS; }
    if (limiter.count >= ATTENDANCE_PIN_MAX_ATTEMPTS) {
      return res.status(429).json({ success: false, message: "تجاوزت عدد المحاولات المسموحة. حاول بعد قليل.", messageEn: "Too many attempts. Try again shortly." });
    }
    limiter.count++;
    attendancePinRateLimit.set(ip, limiter);

    const { employeeId, employeePhone, pin, type } = req.body;
    if (!pin) return res.status(400).json({ success: false, message: "الرقم السري الوظيفي مطلوب", messageEn: "Employee PIN is required" });
    try {
      const allEmployees = await storage.getEmployees();
      const allUsers = await storage.getUsers();
      let employee = employeeId ? allEmployees.find(e => e.id === Number(employeeId)) : undefined;
      if (!employee && employeePhone) {
        const user = allUsers.find(u => u.phone === employeePhone);
        employee = user ? allEmployees.find(e => e.userId === user.id) : allEmployees.find(e => e.phone === employeePhone);
      }
      if (!employee) return res.status(404).json({ success: false, message: "لم يُعثَر على الموظف", messageEn: "Employee not found" });
      const empUser = allUsers.find(u => u.id === employee!.userId);
      const storedPin = empUser?.employeePin;
      if (!storedPin) return res.json({ success: true, noPin: true });
      if (String(pin).trim() === String(storedPin).trim()) {
        limiter.count = 0;
        // Bind a short-lived (2 min) verification to the session so /record can
        // confirm the PIN was checked. Validated against employee id/phone + action.
        (req as any).session.attendancePinVerified = {
          employeeId: employee.id,
          employeePhone: employee.phone || employeePhone || null,
          type: type && ["check_in", "check_out"].includes(type) ? type : null,
          expiresAt: Date.now() + 2 * 60 * 1000,
        };
        return res.json({ success: true });
      }
      return res.status(401).json({ success: false, message: "الرقم السري الوظيفي غير صحيح", messageEn: "Incorrect employee PIN" });
    } catch {
      res.status(500).json({ success: false, message: "حدث خطأ" });
    }
  });

  app.post("/api/attendance/record", requireAttendanceAuth, async (req, res) => {
    const { employeeId, employeePhone, employeeNameAr, type, locationName: clientLocationName, latitude, longitude, deviceInfo, deviceFingerprint, notes } = req.body;
    if (!type || !["check_in", "check_out"].includes(type)) return res.status(400).json({ message: "نوع السجل غير صالح", messageEn: "Invalid record type" });

    // Server-side PIN enforcement: if the resolved employee has an employeePin,
    // the request must be backed by a recent, matching /verify-pin success
    // stored on the session. Employees without a pin are allowed through.
    try {
      const allEmployees = await storage.getEmployees();
      const allUsers = await storage.getUsers();
      let pinEmployee = employeeId ? allEmployees.find(e => e.id === Number(employeeId)) : undefined;
      if (!pinEmployee && employeePhone) {
        const u = allUsers.find(us => us.phone === employeePhone);
        pinEmployee = u ? allEmployees.find(e => e.userId === u.id) : allEmployees.find(e => e.phone === employeePhone);
      }
      if (pinEmployee) {
        const pinUser = allUsers.find(u => u.id === pinEmployee!.userId);
        if (pinUser?.employeePin) {
          const v = (req as any).session.attendancePinVerified;
          const valid = v
            && v.expiresAt > Date.now()
            && Number(v.employeeId) === Number(pinEmployee.id)
            && (!v.type || v.type === type);
          if (!valid) {
            return res.status(403).json({ message: "يجب تأكيد الرقم السري الوظيفي قبل التسجيل", messageEn: "Employee PIN must be confirmed before recording", requirePin: true });
          }
          // Consume the verification so it can't be replayed.
          (req as any).session.attendancePinVerified = undefined;
        }
      }
    } catch (e) {
      console.error("PIN enforcement error:", e);
      return res.status(500).json({ message: "حدث خطأ أثناء التحقق من الهوية", messageEn: "Error verifying identity" });
    }

    // Reject check-out without a prior check-in on the same day.
    if (type === "check_out" && (employeeId || employeePhone)) {
      try {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const todayRecords = await storage.getAttendanceRecords({
          employeeId: employeeId ? Number(employeeId) : undefined,
          employeePhone: !employeeId && employeePhone ? employeePhone : undefined,
          from: dayStart.toISOString(),
        });
        const hasCheckInToday = todayRecords.some(r => r.type === "check_in");
        if (!hasCheckInToday) {
          // سجّل المخالفة (نقص دخول) وأرسل التنبيهات — دون إنشاء سجل حضور
          try {
            const allEmps = await storage.getEmployees();
            const emp = employeeId
              ? allEmps.find(e => e.id === Number(employeeId))
              : allEmps.find(e => e.phone === employeePhone);
            await storage.createAttendanceViolation({
              employeeId: emp?.id ?? (employeeId ? Number(employeeId) : null),
              employeePhone: employeePhone || emp?.phone || null,
              employeeNameAr: employeeNameAr || emp?.fullNameAr || null,
              violationType: "missing_checkin",
              attemptedType: "check_out",
              details: "محاولة تسجيل خروج بدون سجل دخول مطابق لنفس اليوم — تم الرفض",
            });
            const empName = employeeNameAr || emp?.fullNameAr || employeePhone || "موظف";
            const allUsersN = await storage.getUsers();
            const notifyIds = new Set<number>();
            if (emp?.userId) notifyIds.add(emp.userId);
            allUsersN.filter(u => ["owner", "hr", "it"].includes(u.role) && u.active !== false).forEach(u => notifyIds.add(u.id));
            for (const uid of Array.from(notifyIds)) {
              await storage.createNotification({
                userId: uid,
                titleAr: "مخالفة حضور: نقص دخول",
                titleEn: "Attendance violation: Missing check-in",
                messageAr: `${empName}: محاولة تسجيل خروج بدون تسجيل دخول لنفس اليوم — تم رفضها وتسجيلها في المخالفات`,
                messageEn: `${empName}: check-out attempt without a matching check-in today — rejected and logged`,
                type: "warning",
                relatedEntity: "attendance_violation",
                relatedId: emp?.id ?? null,
              });
            }
          } catch (ve) {
            console.error("Violation logging error:", ve);
          }
          return res.status(400).json({ message: "تعذّر تسجيل الخروج: لم يتم رصد حركة دخول مطابقة لهذا اليوم — سجّل دخولك أولاً", messageEn: "Cannot check out: no matching check-in was found for today — check in first" });
        }
      } catch (e) {
        console.error("Check-out validation error:", e);
        return res.status(500).json({ message: "حدث خطأ أثناء التحقق من سجل الدخول", messageEn: "Error verifying check-in record" });
      }
    }

    const lat2Num = latitude !== undefined && latitude !== null ? parseFloat(latitude) : NaN;
    const lng2Num = longitude !== undefined && longitude !== null ? parseFloat(longitude) : NaN;
    const hasValidCoords = !isNaN(lat2Num) && !isNaN(lng2Num) && lat2Num >= -90 && lat2Num <= 90 && lng2Num >= -180 && lng2Num <= 180;
    try {
      const zones = await storage.getLocationZones();
      let isOutOfZone = false;
      let resolvedLocationName: string | null = clientLocationName || null;
      if (hasValidCoords && zones.length > 0) {
        const R = 6371000;
        const lat2 = lat2Num;
        const lon2 = lng2Num;
        const matchedZone = zones.filter(z => z.isActive).find(z => {
          if (!z.centerLat || !z.centerLng) return false;
          const polyCoords = Array.isArray(z.polygonCoords) ? z.polygonCoords as { lat: number; lng: number }[] : [];
          const isRect = polyCoords.length === 4 && !z.radiusMeters;
          if (isRect) {
            const north = Math.max(...polyCoords.map((p: { lat: number }) => p.lat));
            const south = Math.min(...polyCoords.map((p: { lat: number }) => p.lat));
            const east = Math.max(...polyCoords.map((p: { lng: number }) => p.lng));
            const west = Math.min(...polyCoords.map((p: { lng: number }) => p.lng));
            return lat2 >= south && lat2 <= north && lon2 >= west && lon2 <= east;
          }
          const lat1 = parseFloat(z.centerLat);
          const lon1 = parseFloat(z.centerLng);
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
          const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return dist <= (z.radiusMeters || 200);
        });
        if (matchedZone) {
          resolvedLocationName = matchedZone.nameAr;
        } else {
          isOutOfZone = true;
          resolvedLocationName = null;
        }
      }
      const record = await storage.createAttendanceRecord({
        employeeId: employeeId || null,
        employeePhone: employeePhone || null,
        employeeNameAr: employeeNameAr || null,
        type,
        locationName: resolvedLocationName,
        latitude: hasValidCoords ? String(lat2Num) : null,
        longitude: hasValidCoords ? String(lng2Num) : null,
        isOutOfZone,
        deviceInfo: deviceInfo || {},
        deviceFingerprint: deviceFingerprint || null,
        isManualEdit: false,
        editedBy: null,
        notes: notes || null,
      });
      res.json(record);
    } catch (error) {
      console.error("Attendance record error:", error);
      res.status(500).json({ message: "حدث خطأ أثناء تسجيل الحضور", messageEn: "Error recording attendance" });
    }
  });

  app.get("/api/attendance/my-records", requireAttendanceAuth, async (req, res) => {
    const { employeeId, employeePhone, from, to } = req.query as Record<string, string>;
    try {
      const records = await storage.getAttendanceRecords({
        employeeId: employeeId ? parseInt(employeeId) : undefined,
        employeePhone: employeePhone || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      res.json(records);
    } catch {
      res.status(500).json({ message: "حدث خطأ", messageEn: "An error occurred" });
    }
  });

  app.post("/api/attendance/permission", requireAttendanceAuth, async (req, res) => {
    const { employeeId, employeePhone, date, type, startTime, endTime, hoursRequested, reason } = req.body;
    if (!date || !type) return res.status(400).json({ message: "البيانات غير مكتملة", messageEn: "Incomplete data" });
    try {
      const perm = await storage.createAttendancePermission({
        employeeId: employeeId || null,
        employeePhone: employeePhone || null,
        date,
        type,
        startTime: startTime || null,
        endTime: endTime || null,
        hoursRequested: hoursRequested ? String(hoursRequested) : null,
        reason: reason || null,
        status: "pending", // المرحلة 7: لا اعتماد تلقائي — كل طلب يبدأ معلّقاً
        reviewedBy: null,
      });
      // إشعار المدير المباشر (أو HR/المالك إن لم يوجد مدير)
      try {
        if (perm.employeeId) {
          const emp = await storage.getEmployee(perm.employeeId);
          const mgr = emp?.managerId ? await storage.getEmployee(emp.managerId) : undefined;
          let targetUserIds: number[] = [];
          if (mgr?.userId) {
            targetUserIds = [mgr.userId];
          } else {
            const allUsers = await storage.getUsers();
            targetUserIds = allUsers.filter(u => u.active && ["owner", "hr"].includes(u.role)).map(u => u.id);
          }
          for (const uid of targetUserIds) {
            await storage.createNotification({
              userId: uid,
              titleAr: "طلب استئذان جديد",
              titleEn: "New permission request",
              messageAr: `${emp?.fullNameAr || "موظف"} قدّم طلب استئذان بتاريخ ${perm.date}`,
              messageEn: `Permission request for ${perm.date}`,
              type: "info",
              relatedEntity: "attendance_permission",
              relatedId: perm.id,
            } as any);
          }
        }
      } catch { /* non-blocking */ }
      res.json(perm);
    } catch {
      res.status(500).json({ message: "حدث خطأ", messageEn: "An error occurred" });
    }
  });

  // قرار الاستئذان (المرحلة 7): موافقة المدير فقط (أو HR/المالك إن لم يوجد مدير)
  app.post("/api/attendance/permission/:id/decision", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const decision = req.body.decision;
      const note = typeof req.body.notes === "string" ? req.body.notes : null;
      if (!["approve", "reject", "clarify"].includes(decision)) {
        return res.status(400).json({ message: "قرار غير صالح" });
      }
      const perms = await storage.getAttendancePermissions();
      const perm = perms.find(p => p.id === id);
      if (!perm) return res.status(404).json({ message: "الطلب غير موجود" });
      if (perm.status === "approved" || perm.status === "rejected" || perm.status === "auto_approved") {
        return res.status(400).json({ message: "تمت معالجة هذا الطلب مسبقاً" });
      }

      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const isHrRole = !!user && ["owner", "it", "hr"].includes(user.role);
      const isMgr = perm.employeeId ? await isManagerOf(userId, perm.employeeId) : false;
      if (!isHrRole && !isMgr) return res.status(403).json({ message: "غير مصرح لك بهذا القرار" });

      const newStatus = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "clarification_requested";
      if (decision === "clarify" && !note) return res.status(400).json({ message: "سبب طلب التوضيح مطلوب" });
      const updated = await storage.updateAttendancePermission(id, {
        status: newStatus,
        reviewedBy: userId,
        reason: note ? `${perm.reason || ""}${perm.reason ? " | " : ""}قرار: ${note}` : perm.reason,
      } as any);
      if (perm.employeeId) {
        const titleAr = decision === "approve" ? "تم اعتماد الاستئذان" : decision === "reject" ? "تم رفض الاستئذان" : "طلب توضيح على الاستئذان";
        await notifyEmployeeUser(perm.employeeId, titleAr, note ? `ملاحظة: ${note}` : `استئذانك بتاريخ ${perm.date}`, id);
      }
      res.json(updated);
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/attendance/violations", requireRole("owner", "it", "hr"), async (req, res) => {
    const { from, to, employeeId } = req.query as Record<string, string>;
    try {
      const violations = await storage.getAttendanceViolations({
        employeeId: employeeId ? parseInt(employeeId) : undefined,
        from: from || undefined,
        to: to || undefined,
      });
      res.json(violations);
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // مؤشر الخطر — Risk Score لكل موظف عن شهر معيّن (افتراضياً الشهر الحالي)
  app.get("/api/attendance/risk-scores", requireRole("owner", "it", "hr"), async (req, res) => {
    try {
      const monthParam = typeof req.query.month === "string" ? req.query.month : "";
      const now = new Date();
      const currentPeriod = riyadhDateKey(now).slice(0, 7);
      const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : currentPeriod;
      const [py, pm] = period.split("-").map(Number);
      // نطاق الشهر بتوقيت الرياض (UTC+3): بداية اليوم الأول حتى نهاية آخر يوم
      const startUtc = new Date(Date.UTC(py, pm - 1, 1, -3, 0, 0));
      const endOfMonthUtc = new Date(Date.UTC(py, pm, 1, -3, 0, 0) - 1);
      const endUtc = endOfMonthUtc.getTime() > now.getTime() ? now : endOfMonthUtc;

      const [records, settings, allEmployees, allUsers] = await Promise.all([
        storage.getAttendanceRecords({ from: startUtc.toISOString(), to: endUtc.toISOString() }),
        storage.getWorkScheduleSettings(),
        storage.getEmployees(),
        storage.getUsers(),
      ]);
      const activeEmps = allEmployees.filter(e => e.status === "active" && e.attendanceEnabled);

      // أيام العمل (أحد-خميس) من بداية الشهر حتى اليوم/نهاية الشهر
      const workDays: string[] = [];
      for (let t = startUtc.getTime(); t <= endUtc.getTime(); t += 24 * 60 * 60 * 1000) {
        const d = new Date(t);
        if (!isRiyadhWeekend(d)) workDays.push(riyadhDateKey(d));
      }
      // اليوم الحالي لا يُحتسب غياباً/نقصاً قبل انتهائه
      const todayKey = riyadhDateKey(now);
      const countableDays = period === currentPeriod ? workDays.filter(k => k < todayKey) : workDays;

      // فهرسة السجلات: employeeId → يوم رياض → سجلات
      const byEmpDay = new Map<number, Map<string, { type: string; checkTime: Date }[]>>();
      for (const r of records) {
        if (!r.employeeId) continue;
        const key = riyadhDateKey(new Date(r.checkTime));
        if (!byEmpDay.has(r.employeeId)) byEmpDay.set(r.employeeId, new Map());
        const dayMap = byEmpDay.get(r.employeeId)!;
        if (!dayMap.has(key)) dayMap.set(key, []);
        dayMap.get(key)!.push({ type: r.type, checkTime: new Date(r.checkTime) });
      }

      const results = [];
      for (const emp of activeEmps) {
        const user = allUsers.find(u => u.id === emp.userId);
        const schedule = resolveWorkSchedule(settings, { id: emp.id, department: emp.department });
        const dayMap = byEmpDay.get(emp.id) || new Map();
        let late = 0, absent = 0, incomplete = 0;
        for (const dayKey of countableDays) {
          const recs = dayMap.get(dayKey) || [];
          const ins = recs.filter((r: { type: string }) => r.type === "check_in");
          const outs = recs.filter((r: { type: string }) => r.type === "check_out");
          if (!ins.length && !outs.length) { absent++; continue; }
          if (!ins.length || !outs.length) { incomplete++; continue; }
          const firstIn = ins.sort((a: { checkTime: Date }, b: { checkTime: Date }) => a.checkTime.getTime() - b.checkTime.getTime())[0];
          if (isLateCheckIn(firstIn.checkTime, schedule)) late++;
        }
        // إذا كان اليوم الحالي وفيه دخول متأخر، احسب التأخيرة فوراً
        if (period === currentPeriod && !isRiyadhWeekend(now)) {
          const todayRecs = dayMap.get(todayKey) || [];
          const todayIns = todayRecs.filter((r: { type: string }) => r.type === "check_in")
            .sort((a: { checkTime: Date }, b: { checkTime: Date }) => a.checkTime.getTime() - b.checkTime.getTime());
          if (todayIns.length && isLateCheckIn(todayIns[0].checkTime, schedule)) late++;
        }
        const score = late * RISK_POINTS.late + absent * RISK_POINTS.absent + incomplete * RISK_POINTS.incomplete;
        const level = riskLevel(score);
        results.push({
          employeeId: emp.id,
          employeeNumber: emp.employeeNumber,
          nameAr: emp.fullNameAr?.trim() || user?.fullNameAr || emp.phone || emp.employeeNumber,
          department: emp.department,
          late, absent, incomplete, score, level,
        });
      }

      // تنبيه HR/المالك عند وصول موظف للبرتقالي أو الأحمر (مرة واحدة لكل موظف/شهر/مستوى)
      if (period === currentPeriod) {
        const hrUsers = allUsers.filter(u => ["owner", "hr"].includes(u.role) && u.active !== false);
        for (const r of results) {
          if (r.level === "green") continue;
          try {
            const isNew = await storage.createRiskAlertIfNew(r.employeeId, period, r.level);
            if (isNew) {
              const levelAr = r.level === "red" ? "أحمر" : "برتقالي";
              for (const u of hrUsers) {
                await storage.createNotification({
                  userId: u.id,
                  titleAr: `مؤشر خطر ${levelAr}: ${r.nameAr}`,
                  titleEn: `Risk alert (${r.level}): ${r.nameAr}`,
                  messageAr: `وصل الموظف ${r.nameAr} إلى مستوى ${levelAr} (${r.score} نقطة) هذا الشهر — تأخير: ${r.late}، غياب: ${r.absent}، نقص حركة: ${r.incomplete}`,
                  messageEn: `Employee ${r.nameAr} reached ${r.level} risk level (${r.score} points) this month`,
                  type: "attendance",
                  relatedEntity: "employee",
                  relatedId: r.employeeId,
                });
              }
            }
          } catch (e) {
            console.error("Risk alert notify error:", e);
          }
        }
      }

      results.sort((a, b) => b.score - a.score);
      res.json({ period, results });
    } catch (e) {
      console.error("Risk scores error:", e);
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // إعدادات أوقات الدوام — Work schedule settings
  app.get("/api/attendance/work-settings", requireRole("owner", "it", "hr"), async (_req, res) => {
    try {
      res.json(await storage.getWorkScheduleSettings());
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/attendance/work-settings", requireRole("owner", "it", "hr"), async (req, res) => {
    try {
      const parsed = insertWorkScheduleSettingSchema.parse(req.body);
      if (!["default", "department", "employee"].includes(parsed.scopeType)) {
        return res.status(400).json({ message: "نوع النطاق غير صالح" });
      }
      if (parsed.scopeType === "department" && !parsed.department) {
        return res.status(400).json({ message: "حدد القسم" });
      }
      if (parsed.scopeType === "employee" && !parsed.employeeId) {
        return res.status(400).json({ message: "حدد الموظف" });
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.workStartTime || "08:00")) {
        return res.status(400).json({ message: "صيغة الوقت غير صحيحة (HH:mm)" });
      }
      // منع تكرار نفس النطاق
      const existing = await storage.getWorkScheduleSettings();
      const dup = existing.find(s =>
        s.scopeType === parsed.scopeType &&
        (parsed.scopeType === "default" ||
          (parsed.scopeType === "department" && s.department === parsed.department) ||
          (parsed.scopeType === "employee" && s.employeeId === parsed.employeeId))
      );
      if (dup) return res.status(409).json({ message: "يوجد إعداد لهذا النطاق مسبقاً — عدّله بدلاً من الإضافة" });
      const setting = await storage.createWorkScheduleSetting(parsed);
      res.status(201).json(setting);
    } catch (e: any) {
      res.status(400).json({ message: e?.message || "بيانات غير صالحة" });
    }
  });

  app.patch("/api/attendance/work-settings/:id", requireRole("owner", "it", "hr"), async (req, res) => {
    try {
      const { workStartTime, graceMinutes } = req.body || {};
      const data: Record<string, unknown> = {};
      if (workStartTime !== undefined) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(workStartTime)) {
          return res.status(400).json({ message: "صيغة الوقت غير صحيحة (HH:mm)" });
        }
        data.workStartTime = workStartTime;
      }
      if (graceMinutes !== undefined) {
        const g = Number(graceMinutes);
        if (!Number.isInteger(g) || g < 0 || g > 240) {
          return res.status(400).json({ message: "مدة السماح يجب أن تكون بين 0 و 240 دقيقة" });
        }
        data.graceMinutes = g;
      }
      const updated = await storage.updateWorkScheduleSetting(parseInt(req.params.id), data);
      if (!updated) return res.status(404).json({ message: "الإعداد غير موجود" });
      res.json(updated);
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.delete("/api/attendance/work-settings/:id", requireRole("owner", "it", "hr"), async (req, res) => {
    try {
      const all = await storage.getWorkScheduleSettings();
      const target = all.find(s => s.id === parseInt(req.params.id));
      if (!target) return res.status(404).json({ message: "الإعداد غير موجود" });
      if (target.scopeType === "default") {
        return res.status(400).json({ message: "لا يمكن حذف الإعداد الافتراضي — يمكن تعديله فقط" });
      }
      await storage.deleteWorkScheduleSetting(target.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/attendance/monitor", requireRole("owner", "it"), async (req, res) => {
    const { from, to, locationName, employeeId } = req.query as Record<string, string>;
    try {
      const records = await storage.getAttendanceRecords({
        from: from || undefined,
        to: to || undefined,
        locationName: locationName || undefined,
        employeeId: employeeId ? parseInt(employeeId) : undefined,
      });
      const permissions = await storage.getAttendancePermissions();
      const allEmployees = await storage.getEmployees();
      const allUsers = await storage.getUsers();
      const employeesWithInfo = allEmployees
        .filter(e => e.status === "active" && e.attendanceEnabled)
        .map(e => {
          const user = allUsers.find(u => u.id === e.userId);
          return {
            id: e.id,
            employeeNumber: e.employeeNumber,
            nameAr: e.fullNameAr?.trim() || user?.fullNameAr || e.phone || e.employeeNumber,
            phone: user?.phone || e.phone,
            department: e.department,
            locationName: e.fingerprintLocation || e.fingerScanLocation || "غير محدد",
          };
        });
      res.json({ records, permissions, employees: employeesWithInfo });
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.patch("/api/attendance/record/:id", requireRole("owner", "it"), async (req, res) => {
    const id = parseInt(req.params.id);
    const userId = (req as any).user?.id;
    try {
      const before = await storage.getAttendanceRecord(id);
      if (!before) return res.status(404).json({ message: "السجل غير موجود" });
      const updated = await storage.updateAttendanceRecord(id, { ...req.body, isManualEdit: true, editedBy: userId });
      if (!updated) return res.status(404).json({ message: "السجل غير موجود" });
      await storage.createAttendanceAuditLog({
        recordId: id,
        employeeId: before.employeeId,
        action: "manual_edit",
        oldValue: { type: before.type, checkTime: before.checkTime, notes: before.notes },
        newValue: { type: updated.type, checkTime: updated.checkTime, notes: updated.notes },
        reason: req.body.editReason || null,
        editedBy: userId,
      });
      res.json(updated);
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // التدخل الإداري (المرحلة 6): عذر معتمد + Audit — بلا أثر مالي
  const OVERRIDE_EXCUSES = ["forgot_fingerprint", "technical_issue", "emergency_leave", "medical_excuse"] as const;
  app.post("/api/attendance/record/:id/override", requireRole("owner", "it", "hr"), async (req, res) => {
    const id = parseInt(req.params.id);
    const userId = (req as any).user?.id;
    try {
      const { excuseType, note, newCheckTime } = req.body || {};
      if (!OVERRIDE_EXCUSES.includes(excuseType)) {
        return res.status(400).json({ message: "نوع العذر غير صحيح" });
      }
      const before = await storage.getAttendanceRecord(id);
      if (!before) return res.status(404).json({ message: "السجل غير موجود" });

      const updateData: any = {
        overrideExcuse: excuseType,
        overrideNote: note || null,
        overrideBy: userId,
        overrideAt: new Date(),
        isManualEdit: true,
        editedBy: userId,
      };
      if (newCheckTime) {
        const t = new Date(newCheckTime);
        if (isNaN(t.getTime())) return res.status(400).json({ message: "وقت غير صحيح" });
        updateData.checkTime = t;
      }
      const updated = await storage.updateAttendanceRecord(id, updateData);

      await storage.createAttendanceAuditLog({
        recordId: id,
        employeeId: before.employeeId,
        action: "admin_override",
        excuseType,
        oldValue: { checkTime: before.checkTime, overrideExcuse: before.overrideExcuse },
        newValue: { checkTime: updated?.checkTime, overrideExcuse: excuseType },
        reason: note || null,
        editedBy: userId,
      });

      // إجازة طارئة / عذر طبي ← إنشاء طلب إجازة معتمد لليوم نفسه (بلا أثر مالي)
      if ((excuseType === "emergency_leave" || excuseType === "medical_excuse") && before.employeeId) {
        const dayStr = new Date(before.checkTime).toISOString().slice(0, 10);
        await storage.createLeaveRequest({
          employeeId: before.employeeId,
          leaveType: excuseType === "medical_excuse" ? "sick" : "emergency",
          startDate: dayStr,
          endDate: dayStr,
          days: 1,
          reason: note || "تدخل إداري — تصحيح سجل حضور",
          status: "approved",
          approvedBy: userId,
          approvedDate: new Date().toISOString().slice(0, 10),
        } as any);
      }

      res.json(updated);
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // سجل التدقيق + تقرير الأعذار الشهري
  app.get("/api/attendance/audit-log", requireRole("owner", "it", "hr"), async (req, res) => {
    try {
      const { recordId, month } = req.query as { recordId?: string; month?: string };
      let from: string | undefined, to: string | undefined;
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        from = `${month}-01T00:00:00`;
        const [y, m] = month.split("-").map(Number);
        to = new Date(Date.UTC(y, m, 1)).toISOString();
      }
      const logs = await storage.getAttendanceAuditLogs({
        recordId: recordId ? parseInt(recordId) : undefined,
        from,
        to,
      });
      const excuseCounts: Record<string, number> = {};
      for (const l of logs) {
        if (l.action === "admin_override" && l.excuseType) {
          excuseCounts[l.excuseType] = (excuseCounts[l.excuseType] || 0) + 1;
        }
      }
      res.json({ logs, excuseCounts });
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/attendance/zones/public", async (_req, res) => {
    try {
      const zones = await storage.getLocationZones();
      const publicZones = zones
        .filter(z => z.isActive)
        .map(z => ({
          id: z.id,
          nameAr: z.nameAr,
          type: z.type,
          centerLat: z.centerLat,
          centerLng: z.centerLng,
          radiusMeters: z.radiusMeters,
        }));
      res.json(publicZones);
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/attendance/zones", requireRole("owner", "it", "hr"), async (_req, res) => {
    try {
      const zones = await storage.getLocationZones();
      res.json(zones);
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.post("/api/attendance/zones", requireRole("owner", "it"), async (req, res) => {
    try {
      const zone = await storage.createLocationZone(req.body);
      res.json(zone);
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.patch("/api/attendance/zones/:id", requireRole("owner", "it"), async (req, res) => {
    try {
      const zone = await storage.updateLocationZone(parseInt(req.params.id), req.body);
      res.json(zone);
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.delete("/api/attendance/zones/:id", requireRole("owner", "it"), async (req, res) => {
    try {
      await storage.deleteLocationZone(parseInt(req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  app.get("/api/attendance/device-report", requireRole("owner", "it"), async (_req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const records = await storage.getAttendanceRecords({ from: today.toISOString() });
      const deviceMap = new Map<string, string[]>();
      records.forEach(r => {
        if (!r.deviceFingerprint) return;
        const existing = deviceMap.get(r.deviceFingerprint) || [];
        const name = r.employeeNameAr || r.employeePhone || String(r.employeeId);
        if (!existing.includes(name)) existing.push(name);
        deviceMap.set(r.deviceFingerprint, existing);
      });
      const sharedDevices = Array.from(deviceMap.entries())
        .filter(([, names]) => names.length > 1)
        .map(([fingerprint, employees]) => ({ fingerprint, employees }));
      res.json(sharedDevices);
    } catch {
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ACCOUNTING MODULE — شجرة الحسابات، القيود، التقارير المالية
  // ══════════════════════════════════════════════════════════════════════════

  // ── Finance schema migration: ensure fiscal_years table exists ────────────
  (async () => {
    try {
      await db.execute(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fiscal_year_status') THEN
            CREATE TYPE fiscal_year_status AS ENUM ('active', 'closed');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_type') THEN
            CREATE TYPE calendar_type AS ENUM ('gregorian', 'hijri');
          END IF;
        END $$;
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS fiscal_years (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          calendar_type calendar_type NOT NULL DEFAULT 'gregorian',
          status fiscal_year_status NOT NULL DEFAULT 'active',
          closing_entry_id INTEGER,
          notes TEXT,
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      await db.execute(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS attachment_url TEXT`);
      await db.execute(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS attachments JSONB`);
      // Allow work orders to be unlinked from contracts (finance reset deletes contracts)
      await db.execute(`ALTER TABLE work_orders ALTER COLUMN contract_id DROP NOT NULL`);
      console.log("Finance module migration completed");
    } catch (financeMigrationError) {
      console.warn("Finance migration (non-fatal):", financeMigrationError instanceof Error ? financeMigrationError.message : String(financeMigrationError));
    }
  })();

  // Idempotent inventory module migration (applies to production automatically on deploy)
  (async () => {
    try {
      await db.execute(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS color TEXT`);
      await db.execute(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS image_url TEXT`);
      await db.execute(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS warehouse_id INTEGER`);
      await db.execute(`ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS contract_id INTEGER`);
      await db.execute(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'`);
      await db.execute(`ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS party_type TEXT`);
      await db.execute(`ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS party_id INTEGER`);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS warehouses (
          id SERIAL PRIMARY KEY,
          name_ar TEXT NOT NULL,
          name_en TEXT NOT NULL,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      const whCount = await db.execute(`SELECT COUNT(*)::int AS count FROM warehouses`);
      const existing = (whCount.rows?.[0] as any)?.count ?? 0;
      if (existing === 0) {
        await db.execute(`
          INSERT INTO warehouses (name_ar, name_en) VALUES
            ('المستودع الرئيسي', 'Main Warehouse'),
            ('مستودع الخامات', 'Raw Materials Warehouse'),
            ('مستودع الإكسسوارات', 'Accessories Warehouse'),
            ('مستودع الرجيع', 'Returns Warehouse');
        `);
      }
      console.log("Inventory module migration completed");
    } catch (inventoryMigrationError) {
      console.warn("Inventory migration (non-fatal):", inventoryMigrationError instanceof Error ? inventoryMigrationError.message : String(inventoryMigrationError));
    }
  })();

  // ── Seed chart of accounts on first run ──────────────────────────────────
  storage.seedChartOfAccounts().catch(console.error);

  // ── Chart of Accounts CRUD ────────────────────────────────────────────────
  app.get("/api/accounting/accounts", requireRole("owner", "assistant", "accountant"), async (_req, res) => {
    try {
      res.json(await storage.getChartOfAccounts());
    } catch { res.status(500).json({ message: "حدث خطأ" }); }
  });

  app.post("/api/accounting/accounts", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const account = await storage.createChartOfAccount(req.body);
      res.json(account);
    } catch (e: any) {
      res.status(400).json({ message: e.message || "حدث خطأ" });
    }
  });

  app.patch("/api/accounting/accounts/:id", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const account = await storage.updateChartOfAccount(Number(req.params.id), req.body);
      res.json(account);
    } catch { res.status(500).json({ message: "حدث خطأ" }); }
  });

  app.delete("/api/accounting/accounts/:id", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      await storage.deleteChartOfAccount(Number(req.params.id));
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "حدث خطأ" }); }
  });

  // Sanitize a client-provided attachments list: only {url, name} objects whose
  // url points at the finance-attachments upload path are kept.
  const sanitizeFinanceAttachments = (raw: any): { url: string; name: string }[] | null => {
    if (!Array.isArray(raw)) return null;
    const clean = raw
      .filter((a: any) => a && typeof a.url === "string" && a.url.startsWith("/uploads/finance-attachments/") && typeof a.name === "string")
      .map((a: any) => ({ url: a.url, name: String(a.name).slice(0, 255) }))
      .slice(0, 20);
    return clean.length > 0 ? clean : null;
  };
  const sanitizeFinanceUrl = (raw: any): string | null =>
    typeof raw === "string" && raw.startsWith("/uploads/finance-attachments/") ? raw : null;

  // ── Journal Entries ────────────────────────────────────────────────────────
  app.get("/api/accounting/journal-entries", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const { from, to, typeFilter } = req.query as { from?: string; to?: string; typeFilter?: string };
      const entries = await storage.getJournalEntries(from, to, typeFilter);
      const result = await Promise.all(entries.map(async e => ({
        ...e,
        lines: await storage.getJournalEntryLines(e.id),
      })));
      res.json(result);
    } catch { res.status(500).json({ message: "حدث خطأ" }); }
  });

  app.post("/api/accounting/journal-entries", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const { lines, ...entryData } = req.body;
      if (!entryData.date) return res.status(400).json({ message: "تاريخ القيد مطلوب" });
      if (!entryData.description || !String(entryData.description).trim()) {
        return res.status(400).json({ message: "بيان القيد مطلوب" });
      }
      if (!lines || lines.length < 2) return res.status(400).json({ message: "يجب أن يحتوي القيد على سطرين على الأقل" });
      // Every line must be complete: account selected + exactly one side (debit XOR credit) > 0.
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const debit = parseNum(l.debit);
        const credit = parseNum(l.credit);
        if (!l.accountCode) return res.status(400).json({ message: `السطر ${i + 1}: يجب اختيار الحساب` });
        if (debit <= 0 && credit <= 0) return res.status(400).json({ message: `السطر ${i + 1}: يجب إدخال مبلغ مدين أو دائن` });
        if (debit > 0 && credit > 0) return res.status(400).json({ message: `السطر ${i + 1}: لا يمكن إدخال مدين ودائن في نفس السطر` });
      }
      const totalDebit = lines.reduce((s: number, l: any) => s + parseNum(l.debit), 0);
      const totalCredit = lines.reduce((s: number, l: any) => s + parseNum(l.credit), 0);
      if (totalDebit <= 0) return res.status(400).json({ message: "إجمالي القيد يجب أن يكون أكبر من صفر" });
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({ message: `القيد غير متوازن: مجموع المدين (${totalDebit.toFixed(2)}) لا يساوي مجموع الدائن (${totalCredit.toFixed(2)})` });
      }
      const attachments = sanitizeFinanceAttachments(entryData.attachments);
      const entry = await storage.createJournalEntry(
        { ...entryData, attachments, attachmentUrl: attachments?.[0]?.url ?? sanitizeFinanceUrl(entryData.attachmentUrl), createdBy: (req as any).userId },
        lines
      );
      res.json(entry);
    } catch (e: any) {
      res.status(400).json({ message: e.message || "حدث خطأ" });
    }
  });

  app.get("/api/accounting/journal-entries/:id", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const entry = await storage.getJournalEntry(Number(req.params.id));
      if (!entry) return res.status(404).json({ message: "القيد غير موجود" });
      const lines = await storage.getJournalEntryLines(entry.id);
      res.json({ ...entry, lines });
    } catch { res.status(500).json({ message: "حدث خطأ" }); }
  });

  // Update a MANUAL journal entry (auto-generated entries are immutable — reverse them instead).
  app.patch("/api/accounting/journal-entries/:id", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getJournalEntry(id);
      if (!existing) return res.status(404).json({ message: "القيد غير موجود" });
      if (existing.referenceType) return res.status(400).json({ message: "لا يمكن تعديل قيد تلقائي — استخدم القيد العكسي" });
      const { lines, ...entryData } = req.body;
      if (!entryData.date) return res.status(400).json({ message: "تاريخ القيد مطلوب" });
      if (!entryData.description || !String(entryData.description).trim()) {
        return res.status(400).json({ message: "بيان القيد مطلوب" });
      }
      if (!lines || lines.length < 2) return res.status(400).json({ message: "يجب أن يحتوي القيد على سطرين على الأقل" });
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const debit = parseNum(l.debit);
        const credit = parseNum(l.credit);
        if (!l.accountCode) return res.status(400).json({ message: `السطر ${i + 1}: يجب اختيار الحساب` });
        if (debit <= 0 && credit <= 0) return res.status(400).json({ message: `السطر ${i + 1}: يجب إدخال مبلغ مدين أو دائن` });
        if (debit > 0 && credit > 0) return res.status(400).json({ message: `السطر ${i + 1}: لا يمكن إدخال مدين ودائن في نفس السطر` });
      }
      const totalDebit = lines.reduce((s: number, l: any) => s + parseNum(l.debit), 0);
      const totalCredit = lines.reduce((s: number, l: any) => s + parseNum(l.credit), 0);
      if (totalDebit <= 0) return res.status(400).json({ message: "إجمالي القيد يجب أن يكون أكبر من صفر" });
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({ message: `القيد غير متوازن: مجموع المدين (${totalDebit.toFixed(2)}) لا يساوي مجموع الدائن (${totalCredit.toFixed(2)})` });
      }
      const updated = await storage.updateJournalEntryWithLines(
        id,
        {
          date: entryData.date,
          description: entryData.description,
          reference: entryData.reference ?? null,
          attachments: entryData.attachments !== undefined ? sanitizeFinanceAttachments(entryData.attachments) : (existing as any).attachments,
          attachmentUrl: entryData.attachments !== undefined
            ? (sanitizeFinanceAttachments(entryData.attachments)?.[0]?.url ?? null)
            : (sanitizeFinanceUrl(entryData.attachmentUrl) ?? existing.attachmentUrl),
        },
        lines,
      );
      res.json(updated);
    } catch (e: any) { res.status(400).json({ message: e.message || "حدث خطأ" }); }
  });

  // Delete a MANUAL journal entry only.
  app.delete("/api/accounting/journal-entries/:id", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getJournalEntry(id);
      if (!existing) return res.status(404).json({ message: "القيد غير موجود" });
      if (existing.referenceType) return res.status(400).json({ message: "لا يمكن حذف قيد تلقائي — استخدم القيد العكسي" });
      await storage.deleteJournalEntry(id);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ message: e.message || "حدث خطأ" }); }
  });

  // Reversing entry for an existing (typically auto-generated) entry.
  app.post("/api/accounting/journal-entries/:id/reverse", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getJournalEntry(id);
      if (!existing) return res.status(404).json({ message: "القيد غير موجود" });
      const srcLines = await storage.getJournalEntryLines(id);
      if (srcLines.length === 0) return res.status(400).json({ message: "القيد لا يحتوي على سطور" });
      const entry = await storage.createJournalEntry(
        {
          date: (req.body?.date as string) || new Date().toISOString().slice(0, 10),
          description: `عكس قيد #${existing.entryNumber}`,
          reference: existing.reference || null,
          status: "posted",
          createdBy: (req as any).userId,
        } as any,
        srcLines.map(l => ({
          accountCode: l.accountCode,
          accountNameAr: l.accountNameAr,
          debit: l.credit,
          credit: l.debit,
          notes: "",
        })) as any,
      );
      res.json(entry);
    } catch (e: any) { res.status(400).json({ message: e.message || "حدث خطأ" }); }
  });

  // ── Record an invoice (sales/purchase, credit/cash) → posts a balanced journal entry ──
  app.post("/api/accounting/record-invoice", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const { invoiceKind, terms, date, reference, counterpartyName, revenueExpenseAccountCode, paymentAccountCode } = req.body;
      const subtotal = parseNum(req.body.subtotal);
      const vatAmount = parseNum(req.body.vatAmount);

      if (invoiceKind !== "sales" && invoiceKind !== "purchase") {
        return res.status(400).json({ message: "نوع الفاتورة غير صحيح" });
      }
      if (terms !== "credit" && terms !== "cash") {
        return res.status(400).json({ message: "طريقة الدفع غير صحيحة" });
      }
      if (!date) return res.status(400).json({ message: "تاريخ الفاتورة مطلوب" });
      if (!(subtotal > 0)) return res.status(400).json({ message: "المبلغ قبل الضريبة يجب أن يكون أكبر من صفر" });
      if (vatAmount < 0) return res.status(400).json({ message: "مبلغ الضريبة غير صحيح" });
      if (!revenueExpenseAccountCode) {
        return res.status(400).json({ message: invoiceKind === "sales" ? "يجب اختيار حساب الإيراد" : "يجب اختيار حساب المصروف/المخزون" });
      }
      if (terms === "cash" && !paymentAccountCode) {
        return res.status(400).json({ message: "يجب اختيار حساب الدفع (صندوق/بنك) للفواتير النقدية" });
      }

      const total = +(subtotal + vatAmount).toFixed(2);

      // Resolve and validate account names from the chart of accounts.
      const resolveName = async (code: string): Promise<string> => {
        const acc = await storage.getChartOfAccountByCode(code);
        if (!acc) throw new Error(`الحساب ${code} غير موجود في شجرة الحسابات`);
        return acc.nameAr;
      };

      // Resolve control/VAT accounts from the live chart of accounts by role, not hardcoded
      // codes — production charts use different numbering (e.g. 11000201 ذمم العملاء).
      const invAccounts = await storage.getChartOfAccounts();
      const invParentCodes = new Set(invAccounts.map(a => a.parentCode).filter(Boolean));
      const invLeaf = (a: any) => !invParentCodes.has(a.code);
      const findByRole = (pred: (a: any) => boolean, fallbackCode: string) =>
        invAccounts.find(a => invLeaf(a) && a.isActive !== false && pred(a))?.code ||
        (invAccounts.some(a => a.code === fallbackCode) ? fallbackCode : "");
      const CUSTOMER_AR = findByRole(a => a.type === "asset" && /ذمم/.test(a.nameAr || "") && /عملاء|عميل/.test(a.nameAr || ""), "1121");
      const SUPPLIER_AP = findByRole(a => a.type === "liability" && /ذمم/.test(a.nameAr || "") && /مورد/.test(a.nameAr || ""), "2111");
      const VAT_OUTPUT = findByRole(a => /ضريبة/.test(a.nameAr || "") && /مخرجات/.test(a.nameAr || ""), "2121");
      const VAT_INPUT = findByRole(a => /ضريبة/.test(a.nameAr || "") && /مدخلات/.test(a.nameAr || ""), "2122");
      if (invoiceKind === "sales" && terms === "credit" && !CUSTOMER_AR) {
        return res.status(400).json({ message: "لم يتم العثور على حساب ذمم العملاء في شجرة الحسابات" });
      }
      if (invoiceKind === "purchase" && terms === "credit" && !SUPPLIER_AP) {
        return res.status(400).json({ message: "لم يتم العثور على حساب ذمم الموردين في شجرة الحسابات" });
      }
      if (vatAmount > 0 && ((invoiceKind === "sales" && !VAT_OUTPUT) || (invoiceKind === "purchase" && !VAT_INPUT))) {
        return res.status(400).json({ message: "لم يتم العثور على حساب ضريبة القيمة المضافة في شجرة الحسابات" });
      }
      const reAccountName = await resolveName(revenueExpenseAccountCode);
      const lines: any[] = [];

      if (invoiceKind === "sales") {
        // Debit side: cash/bank (cash sale) or customer receivable (credit sale)
        const debitCode = terms === "cash" ? paymentAccountCode : CUSTOMER_AR;
        const debitName = await resolveName(debitCode);
        lines.push({ entryId: 0, accountCode: debitCode, accountNameAr: debitName, debit: total.toFixed(2), credit: "0" });
        lines.push({ entryId: 0, accountCode: revenueExpenseAccountCode, accountNameAr: reAccountName, debit: "0", credit: subtotal.toFixed(2) });
        if (vatAmount > 0) {
          lines.push({ entryId: 0, accountCode: VAT_OUTPUT, accountNameAr: await resolveName(VAT_OUTPUT), debit: "0", credit: vatAmount.toFixed(2) });
        }
      } else {
        // Purchase: debit expense/inventory + input VAT; credit cash/bank or supplier payable
        lines.push({ entryId: 0, accountCode: revenueExpenseAccountCode, accountNameAr: reAccountName, debit: subtotal.toFixed(2), credit: "0" });
        if (vatAmount > 0) {
          lines.push({ entryId: 0, accountCode: VAT_INPUT, accountNameAr: await resolveName(VAT_INPUT), debit: vatAmount.toFixed(2), credit: "0" });
        }
        const creditCode = terms === "cash" ? paymentAccountCode : SUPPLIER_AP;
        const creditName = await resolveName(creditCode);
        lines.push({ entryId: 0, accountCode: creditCode, accountNameAr: creditName, debit: "0", credit: total.toFixed(2) });
      }

      const kindAr = invoiceKind === "sales" ? "فاتورة مبيعات" : "فاتورة مشتريات";
      const termsAr = terms === "cash" ? "نقدي" : "آجل";
      const description = `${kindAr} (${termsAr})${counterpartyName ? ` - ${counterpartyName}` : ""}${reference ? ` - ${reference}` : ""}`;

      const entry = await storage.createJournalEntry(
        {
          date,
          description,
          reference: reference || null,
          referenceType: invoiceKind === "sales" ? "sales_invoice" : "purchase_invoice",
          status: "posted",
          attachments: sanitizeFinanceAttachments(req.body.attachments),
          attachmentUrl: sanitizeFinanceAttachments(req.body.attachments)?.[0]?.url ?? sanitizeFinanceUrl(req.body.attachmentUrl),
          createdBy: (req as any).userId,
        },
        lines
      );
      res.json(entry);
    } catch (e: any) {
      res.status(400).json({ message: e.message || "حدث خطأ في تسجيل الفاتورة" });
    }
  });

  // ── Finance attachments (invoices / journal entries) ──────────────────────
  const financeDocUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff", "image/heic", "image/heif", "image/avif"];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error("يُسمح فقط بملفات PDF والصور (JPG, PNG, WebP, GIF...)"));
    },
  });

  app.post("/api/accounting/upload-attachment", requireRole("owner", "assistant", "accountant"), financeDocUpload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "لم يتم رفع أي ملف" });
      const filename = makeSafeFilename(req.file.originalname);
      await saveObjectFile(FINANCE_DOCS_FOLDER, filename, req.file.buffer, req.file.mimetype);
      res.json({ url: `/uploads/finance-attachments/${filename}`, name: req.file.originalname, mime: req.file.mimetype });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في رفع المرفق" });
    }
  });

  app.get("/uploads/finance-attachments/:filename", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
      const served = await streamObjectFile(FINANCE_DOCS_FOLDER, filename, res);
      if (!served) return res.status(404).json({ message: "الملف غير موجود" });
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ message: "حدث خطأ في جلب الملف" });
    }
  });

  // ── Inventory item images (Object Storage) ──────────────────────────────
  const inventoryImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
    },
  });

  app.post("/api/inventory/upload-image", requireRole("owner", "assistant", "warehouse"), inventoryImageUpload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "لم يتم رفع أي صورة" });
      const filename = makeSafeFilename(req.file.originalname);
      await saveObjectFile(INVENTORY_IMAGES_FOLDER, filename, req.file.buffer, req.file.mimetype);
      res.json({ url: `/uploads/inventory-images/${filename}`, name: req.file.originalname, mime: req.file.mimetype });
    } catch (error) {
      res.status(500).json({ message: "حدث خطأ في رفع الصورة" });
    }
  });

  app.get("/uploads/inventory-images/:filename", requireAuth, async (req, res) => {
    try {
      const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
      const served = await streamObjectFile(INVENTORY_IMAGES_FOLDER, filename, res);
      if (!served) return res.status(404).json({ message: "الصورة غير موجودة" });
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ message: "حدث خطأ في جلب الصورة" });
    }
  });

  // ── Vouchers: receipt (سند قبض) / payment (سند صرف) → posts a balanced entry ──
  app.post("/api/accounting/record-voucher", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const { voucherKind, date, reference, partyName, paymentAccountCode, counterAccountCode } = req.body;
      // دفتر مساعد: ربط سطر الذمم بالطرف (عميل/مورد) عند اختياره من القائمة
      const partyType = req.body.partyType === "customer" || req.body.partyType === "supplier" ? req.body.partyType : null;
      let partyId = partyType && Number.isInteger(Number(req.body.partyId)) && Number(req.body.partyId) > 0 ? Number(req.body.partyId) : null;
      if (partyId) {
        // تحقق من وجود الطرف فعلياً قبل الربط حتى لا تُخزّن روابط يتيمة
        const exists = partyType === "customer" ? await storage.getCustomer(partyId) : await storage.getSupplier(partyId);
        if (!exists) partyId = null;
      }
      const amount = parseNum(req.body.amount);

      if (voucherKind !== "receipt" && voucherKind !== "payment") {
        return res.status(400).json({ message: "نوع السند غير صحيح" });
      }
      if (!date) return res.status(400).json({ message: "تاريخ السند مطلوب" });
      if (!(amount > 0)) return res.status(400).json({ message: "المبلغ يجب أن يكون أكبر من صفر" });
      if (!paymentAccountCode) return res.status(400).json({ message: "يجب اختيار حساب الصندوق/البنك" });
      if (!counterAccountCode) return res.status(400).json({ message: "يجب اختيار الحساب المقابل" });
      if (paymentAccountCode === counterAccountCode) {
        return res.status(400).json({ message: "لا يمكن أن يكون حساب الدفع والحساب المقابل متطابقين" });
      }

      const resolveName = async (code: string): Promise<string> => {
        const acc = await storage.getChartOfAccountByCode(code);
        if (!acc) throw new Error(`الحساب ${code} غير موجود في شجرة الحسابات`);
        return acc.nameAr;
      };
      // Payment account must be a postable account inside the cash/bank branch of the tree.
      // Detected by walking ancestors (names like «النقدية والبنوك») — NOT a hardcoded code
      // prefix, because production charts use different numbering (e.g. 11000101).
      const allAccounts = await storage.getChartOfAccounts();
      const byCode = new Map(allAccounts.map(a => [a.code, a]));
      const CASH_BANK_RE = /صندوق|بنك|نقد|cash|bank/i;
      const inCashBankTree = (code: string): boolean => {
        let cur = byCode.get(code);
        let guard = 0;
        while (cur && guard++ < 12) {
          if (CASH_BANK_RE.test(cur.nameAr || "") || CASH_BANK_RE.test((cur as any).nameEn || "")) return true;
          cur = cur.parentCode ? byCode.get(cur.parentCode) : undefined;
        }
        return false;
      };
      const payAcc = byCode.get(String(paymentAccountCode));
      if (!payAcc || payAcc.type !== "asset" || !inCashBankTree(String(paymentAccountCode))) {
        return res.status(400).json({ message: "حساب الدفع يجب أن يكون حساب صندوق أو بنك" });
      }
      const payName = await resolveName(paymentAccountCode);
      const counterName = await resolveName(counterAccountCode);

      // Reject posting to header/parent (non-postable) or inactive accounts — both legs
      for (const code of [paymentAccountCode, counterAccountCode]) {
        if (allAccounts.some(a => a.parentCode === code)) {
          return res.status(400).json({ message: `لا يمكن الترحيل على الحساب ${code} لأنه حساب رئيسي تجميعي — اختر حساباً فرعياً تحته` });
        }
        const acc = allAccounts.find(a => a.code === code);
        if (acc && acc.isActive === false) {
          return res.status(400).json({ message: `الحساب ${code} غير نشط — لا يمكن الترحيل عليه` });
        }
      }

      const partyFields = partyType && partyId ? { partyType, partyId } : {};
      const lines: any[] = [];
      if (voucherKind === "receipt") {
        // Money in: debit cash/bank, credit the source account
        lines.push({ entryId: 0, accountCode: paymentAccountCode, accountNameAr: payName, debit: amount.toFixed(2), credit: "0" });
        lines.push({ entryId: 0, accountCode: counterAccountCode, accountNameAr: counterName, debit: "0", credit: amount.toFixed(2), ...partyFields });
      } else {
        // Money out: debit the destination account, credit cash/bank
        lines.push({ entryId: 0, accountCode: counterAccountCode, accountNameAr: counterName, debit: amount.toFixed(2), credit: "0", ...partyFields });
        lines.push({ entryId: 0, accountCode: paymentAccountCode, accountNameAr: payName, debit: "0", credit: amount.toFixed(2) });
      }

      const kindAr = voucherKind === "receipt" ? "سند قبض" : "سند صرف";
      const description = `${kindAr}${partyName ? ` - ${partyName}` : ""}${reference ? ` - ${reference}` : ""}`;

      const entry = await storage.createJournalEntry(
        {
          date,
          description,
          reference: reference || null,
          referenceType: voucherKind === "receipt" ? "receipt_voucher" : "payment_voucher",
          status: "posted",
          attachments: sanitizeFinanceAttachments(req.body.attachments),
          attachmentUrl: sanitizeFinanceAttachments(req.body.attachments)?.[0]?.url ?? sanitizeFinanceUrl(req.body.attachmentUrl),
          createdBy: (req as any).userId,
        },
        lines
      );
      res.json(entry);
    } catch (e: any) {
      res.status(400).json({ message: e.message || "حدث خطأ في تسجيل السند" });
    }
  });

  // ── General Ledger ─────────────────────────────────────────────────────────
  app.get("/api/accounting/ledger", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const { accountCode, from, to } = req.query as { accountCode?: string; from?: string; to?: string };
      if (!accountCode) return res.status(400).json({ message: "يجب تحديد الحساب" });
      const { pool } = await import("./db");

      // Opening balance: sum of all lines BEFORE `from` date
      let openingBalance = 0;
      if (from) {
        const obResult = await pool.query(
          `SELECT COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0) AS ob
           FROM journal_entry_lines jel
           INNER JOIN journal_entries je ON jel.entry_id = je.id
           WHERE je.status = 'posted' AND jel.account_code = $1 AND je.date < $2`,
          [accountCode, from]
        );
        openingBalance = parseFloat(obResult.rows[0]?.ob || 0);
      }

      // Period lines
      const params: any[] = [accountCode];
      let dateConds = "";
      if (from) { params.push(from); dateConds += ` AND je.date >= $${params.length}`; }
      if (to)   { params.push(to);   dateConds += ` AND je.date <= $${params.length}`; }

      const result = await pool.query(
        `SELECT jel.id, jel.debit, jel.credit, jel.notes,
                je.id AS entry_id, je.entry_number, je.date AS entry_date, je.description AS entry_description
         FROM journal_entry_lines jel
         INNER JOIN journal_entries je ON jel.entry_id = je.id
         WHERE je.status = 'posted' AND jel.account_code = $1${dateConds}
         ORDER BY je.date, je.id`,
        params
      );

      let runningBalance = openingBalance;
      const linesWithBalance = result.rows.map((l: any) => {
        runningBalance += parseFloat(String(l.debit || 0)) - parseFloat(String(l.credit || 0));
        return { ...l, runningBalance };
      });
      res.json({ openingBalance, lines: linesWithBalance });
    } catch (e: any) { res.status(500).json({ message: e.message || "حدث خطأ" }); }
  });

  // ── Trial Balance ──────────────────────────────────────────────────────────
  app.get("/api/accounting/trial-balance", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const { from, to, fiscalYearId } = req.query as { from?: string; to?: string; fiscalYearId?: string };
      const accounts = await storage.getChartOfAccounts();
      const { pool } = await import("./db");

      // Resolve fiscal year dates if provided
      let fyStartDate: string | undefined;
      let fyEndDate: string | undefined;
      if (fiscalYearId && fiscalYearId !== "custom") {
        const fy = await storage.getFiscalYear(Number(fiscalYearId));
        if (fy) { fyStartDate = fy.startDate; fyEndDate = fy.endDate; }
      }

      // Opening balance: entries with reference_type='opening_balance'
      // If fiscal year selected: opening entries whose date falls within the fiscal year (typically the start date)
      // If custom range: opening entries whose date is before or on the 'from' date
      const openingParams: any[] = [];
      let openingDateCond = "";
      if (fyStartDate && fyEndDate) {
        openingParams.push(fyStartDate, fyEndDate);
        openingDateCond = ` AND je.date >= $${openingParams.length - 1} AND je.date <= $${openingParams.length}`;
      } else if (from) {
        openingParams.push(from);
        openingDateCond = ` AND je.date <= $${openingParams.length}`;
      }

      const openingResult = await pool.query(
        `SELECT
           jel.account_code,
           COALESCE(SUM(jel.debit), 0)::numeric  AS opening_debit,
           COALESCE(SUM(jel.credit), 0)::numeric AS opening_credit
         FROM journal_entry_lines jel
         INNER JOIN journal_entries je ON jel.entry_id = je.id
         WHERE je.status = 'posted'
           AND je.reference_type = 'opening_balance'${openingDateCond}
         GROUP BY jel.account_code`,
        openingParams
      );

      // Period movements: posted entries NOT opening_balance, within the from-to date range
      const periodParams: any[] = [];
      let periodDateConds = "";
      const periodFrom = fyStartDate || from;
      const periodTo = fyEndDate || to;
      if (periodFrom) { periodParams.push(periodFrom); periodDateConds += ` AND je.date >= $${periodParams.length}`; }
      if (periodTo)   { periodParams.push(periodTo);   periodDateConds += ` AND je.date <= $${periodParams.length}`; }

      const periodResult = await pool.query(
        `SELECT
           jel.account_code,
           COALESCE(SUM(jel.debit), 0)::numeric  AS period_debit,
           COALESCE(SUM(jel.credit), 0)::numeric AS period_credit
         FROM journal_entry_lines jel
         INNER JOIN journal_entries je ON jel.entry_id = je.id
         WHERE je.status = 'posted'
           AND (je.reference_type IS NULL OR je.reference_type <> 'opening_balance')${periodDateConds}
         GROUP BY jel.account_code`,
        periodParams
      );

      const openingMap = new Map(openingResult.rows.map((r: any) => [r.account_code, r]));
      const periodMap  = new Map(periodResult.rows.map((r: any) => [r.account_code, r]));

      // Include ALL accounts (zero-activity accounts show zeros)
      const rows = accounts.map(a => {
        const ob  = openingMap.get(a.code);
        const per = periodMap.get(a.code);
        const openingDebit  = ob  ? parseFloat(ob.opening_debit)  : 0;
        const openingCredit = ob  ? parseFloat(ob.opening_credit) : 0;
        const openingBalance = openingDebit - openingCredit;
        const periodDebit   = per ? parseFloat(per.period_debit)  : 0;
        const periodCredit  = per ? parseFloat(per.period_credit) : 0;
        const closingBalance = openingBalance + periodDebit - periodCredit;
        return {
          account_code: a.code,
          account_name_ar: a.nameAr,
          type: a.type,
          opening_balance: openingBalance,
          total_debit: periodDebit,
          total_credit: periodCredit,
          balance: closingBalance,
        };
      });

      const totalDebit  = rows.reduce((s, r) => s + r.total_debit, 0);
      const totalCredit = rows.reduce((s, r) => s + r.total_credit, 0);
      const totalOpeningBalance = rows.reduce((s, r) => s + r.opening_balance, 0);
      const totalClosingBalance = rows.reduce((s, r) => s + r.balance, 0);
      res.json({
        rows,
        totalDebit,
        totalCredit,
        totalOpeningBalance,
        totalClosingBalance,
        isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
      });
    } catch (e: any) { res.status(500).json({ message: e.message || "حدث خطأ" }); }
  });

  // ── Balance Sheet ──────────────────────────────────────────────────────────
  app.get("/api/accounting/balance-sheet", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const { asOf } = req.query as { asOf?: string };
      const { pool } = await import("./db");

      const params: any[] = [];
      let dateCond = "";
      if (asOf) { params.push(asOf); dateCond = ` AND je.date <= $${params.length}`; }

      const result = await pool.query(
        `SELECT
           jel.account_code,
           jel.account_name_ar,
           (COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0))::numeric AS balance
         FROM journal_entry_lines jel
         INNER JOIN journal_entries je ON jel.entry_id = je.id
         WHERE je.status = 'posted'${dateCond}
         GROUP BY jel.account_code, jel.account_name_ar
         ORDER BY jel.account_code`,
        params
      );

      const accounts = await storage.getChartOfAccounts();
      const accountMap = new Map(accounts.map(a => [a.code, a]));
      const activityMap = new Map(result.rows.map((r: any) => [r.account_code, parseFloat(r.balance)]));

      // Sign normalisation: assets debit-nature (debit-credit=positive);
      //   liabilities/equity credit-nature (credit-debit=positive → negate stored value)
      const rows = accounts
        .filter(a => ["asset", "liability", "equity"].includes(a.type))
        .map(a => {
          const rawBalance = activityMap.get(a.code) ?? 0;
          const balance = (a.type === "liability" || a.type === "equity") ? -rawBalance : rawBalance;
          return {
            code: a.code,
            nameAr: a.nameAr,
            type: a.type,
            parentCode: a.parentCode ?? null,
            balance,
          };
        });

      // Build hierarchical groups with RECURSIVE roll-up across full account tree.
      // "sumDescendants(code)" adds the account's own balance PLUS all its descendants'.
      const rowMap = new Map(rows.map(r => [r.code, r]));

      const sumDescendants = (code: string): number => {
        const self = rowMap.get(code);
        if (!self) return 0;
        const directChildren = rows.filter(r => r.parentCode === code);
        if (directChildren.length === 0) return self.balance;
        // Include parent's own balance + all descendants (handles postings at any level)
        return self.balance + directChildren.reduce((s, c) => s + sumDescendants(c.code), 0);
      };

      const buildHierarchy = (type: string) => {
        const typeRows = rows.filter(r => r.type === type);
        // Roots: accounts whose parent is NOT in the same type (or has no parent)
        const roots = typeRows.filter(r => !r.parentCode || !typeRows.find(p => p.code === r.parentCode));
        return roots.map(root => {
          const directChildren = typeRows.filter(r => r.parentCode === root.code);
          const subTotal = sumDescendants(root.code);
          return { ...root, children: directChildren, subTotal };
        });
      };

      const sum = (arr: any[]) => arr.reduce((s, r) => s + r.subTotal, 0);
      const assetGroups = buildHierarchy("asset");
      const liabilityGroups = buildHierarchy("liability");
      const equityGroups = buildHierarchy("equity");

      res.json({
        assets: assetGroups,
        liabilities: liabilityGroups,
        equity: equityGroups,
        totalAssets: sum(assetGroups),
        totalLiabilities: sum(liabilityGroups),
        totalEquity: sum(equityGroups),
      });
    } catch (e: any) { res.status(500).json({ message: e.message || "حدث خطأ" }); }
  });

  // ── Income Statement ───────────────────────────────────────────────────────
  app.get("/api/accounting/income-statement", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const { pool } = await import("./db");

      const params: any[] = [];
      let dateConds = "";
      if (from) { params.push(from); dateConds += ` AND je.date >= $${params.length}`; }
      if (to)   { params.push(to);   dateConds += ` AND je.date <= $${params.length}`; }

      const result = await pool.query(
        `SELECT
           jel.account_code,
           jel.account_name_ar,
           (COALESCE(SUM(jel.credit), 0) - COALESCE(SUM(jel.debit), 0))::numeric AS amount
         FROM journal_entry_lines jel
         INNER JOIN journal_entries je ON jel.entry_id = je.id
         WHERE je.status = 'posted'${dateConds}
         GROUP BY jel.account_code, jel.account_name_ar
         ORDER BY jel.account_code`,
        params
      );

      const accounts = await storage.getChartOfAccounts();
      const accountMap = new Map(accounts.map(a => [a.code, a]));
      const rows = result.rows.map((r: any) => {
        const type = accountMap.get(r.account_code)?.type || "expense";
        // Revenue: credit-nature → (credit - debit) gives positive when earned
        // Cost/Expense: debit-nature → (debit - credit) gives positive when incurred
        //   raw query computes (credit - debit), so negate for cost/expense
        const rawAmount = parseFloat(r.amount);
        const amount = (type === "cost" || type === "expense") ? -rawAmount : rawAmount;
        return { code: r.account_code, nameAr: r.account_name_ar, type, amount };
      });
      const revenue = rows.filter((r: any) => r.type === "revenue");
      const cost = rows.filter((r: any) => r.type === "cost");
      const expense = rows.filter((r: any) => r.type === "expense");
      const totalRevenue = revenue.reduce((s: number, r: any) => s + r.amount, 0);
      const totalCost = cost.reduce((s: number, r: any) => s + r.amount, 0);
      const totalExpense = expense.reduce((s: number, r: any) => s + r.amount, 0);
      res.json({
        revenue, cost, expense,
        totalRevenue,
        totalCost,
        grossProfit: totalRevenue - totalCost,
        totalExpense,
        netProfit: totalRevenue - totalCost - totalExpense,
      });
    } catch (e: any) { res.status(500).json({ message: e.message || "حدث خطأ" }); }
  });

  // ── Cash Flow ──────────────────────────────────────────────────────────────
  // Inflows: confirmed customer payments; Outflows: received purchase orders
  app.get("/api/accounting/cash-flow", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const { pool } = await import("./db");

      // Parameterized inflows (confirmed customer payments)
      const inflowParams: any[] = ["confirmed"];
      let inflowConds = "p.payment_status = $1";
      if (from) { inflowParams.push(from); inflowConds += ` AND p.created_at::date >= $${inflowParams.length}`; }
      if (to)   { inflowParams.push(to);   inflowConds += ` AND p.created_at::date <= $${inflowParams.length}`; }

      const inflows = await pool.query(
        `SELECT p.id, p.amount, p.method, p.payment_stage, p.created_at,
                c.full_name AS customer_name, ct.contract_number
         FROM payments p
         LEFT JOIN customers c ON p.customer_id = c.id
         LEFT JOIN contracts ct ON p.contract_id = ct.id
         WHERE ${inflowConds}
         ORDER BY p.created_at DESC`,
        inflowParams
      );

      // Cash outflows — two sources:
      // 1) Expense GL entries (journal lines debiting expense accounts 5xxx — posted entries)
      //    These represent all recorded operational expenses in the double-entry ledger.
      // 2) Received purchase orders (supplier cash outflows not yet journalized, i.e. procurement)
      //    Note: this system has no standalone "expenses" table; purchase_orders IS the expenses
      //    ledger for supplier-related outflows (materials, services). Once journalized via
      //    journal entries they appear in source (1) above.

      const expenseGLParams: any[] = ["posted"];
      // Expense accounts: 5xxx (cost of sales) + 6xxx (operating expenses)
      let expenseGLConds = "je.status = $1 AND (ca.code LIKE '5%' OR ca.code LIKE '6%')";
      if (from) { expenseGLParams.push(from); expenseGLConds += ` AND je.date >= $${expenseGLParams.length}::date`; }
      if (to)   { expenseGLParams.push(to);   expenseGLConds += ` AND je.date <= $${expenseGLParams.length}::date`; }

      const expenseGL = await pool.query(
        `SELECT jel.id::text, jel.debit AS amount, je.date AS created_at,
                ca.name_ar AS description, je.reference
         FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.entry_id = je.id
         JOIN chart_of_accounts ca ON ca.code = jel.account_code
         WHERE ${expenseGLConds} AND jel.debit > 0
         ORDER BY je.date DESC`,
        expenseGLParams
      );

      // Supplier purchase orders (received) as operational outflow proxy
      const poParams: any[] = ["received"];
      let poConds = "po.status = $1";
      if (from) { poParams.push(from); poConds += ` AND po.created_at::date >= $${poParams.length}`; }
      if (to)   { poParams.push(to);   poConds += ` AND po.created_at::date <= $${poParams.length}`; }

      const poOutflows = await pool.query(
        `SELECT po.id::text, po.total_amount AS amount, po.created_at, s.name AS supplier_name
         FROM purchase_orders po
         LEFT JOIN suppliers s ON po.supplier_id = s.id
         WHERE ${poConds}
         ORDER BY po.created_at DESC`,
        poParams
      );

      // Merge GL expense entries + PO outflows (de-dup by preferring GL when available)
      const glTotal = expenseGL.rows.reduce((s: number, r: any) => s + parseFloat(r.amount || 0), 0);
      const poTotal = poOutflows.rows.reduce((s: number, r: any) => s + parseFloat(r.amount || 0), 0);
      // If GL expense entries exist, use them as the authoritative outflow; otherwise use PO proxy
      const outflowRows = expenseGL.rows.length > 0 ? expenseGL.rows : poOutflows.rows;
      const totalOutflows = expenseGL.rows.length > 0 ? glTotal : poTotal;

      const totalInflows = inflows.rows.reduce((s: number, r: any) => s + parseFloat(r.amount || 0), 0);
      res.json({
        inflows: inflows.rows,
        outflows: outflowRows,
        totalInflows,
        totalOutflows,
        netCashFlow: totalInflows - totalOutflows,
        outflowSource: expenseGL.rows.length > 0 ? "gl_expenses" : "purchase_orders",
      });
    } catch (e: any) { res.status(500).json({ message: e.message || "حدث خطأ" }); }
  });

  // ── VAT Report ─────────────────────────────────────────────────────────────
  app.get("/api/accounting/vat-report", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const { quarter, year } = req.query as { quarter?: string; year?: string };
      const q = parseInt(quarter || "1");
      const y = parseInt(year || new Date().getFullYear().toString());
      const monthStart = (q - 1) * 3 + 1;
      const from = `${y}-${String(monthStart).padStart(2, "0")}-01`;
      const toMonth = monthStart + 2;
      const toYear = toMonth > 12 ? y + 1 : y;
      const toMonthActual = toMonth > 12 ? toMonth - 12 : toMonth;
      const lastDay = new Date(toYear, toMonthActual, 0).getDate();
      const to = `${toYear}-${String(toMonthActual).padStart(2, "0")}-${lastDay}`;
      const { pool } = await import("./db");
      const outputVat = await pool.query(`
        SELECT
          COALESCE(SUM(subtotal::numeric), 0) AS taxable_sales,
          COALESCE(SUM(vat_amount::numeric), 0) AS output_vat,
          COUNT(*) AS invoice_count
        FROM invoices
        WHERE status IN ('issued', 'paid')
          AND issued_at::date >= $1 AND issued_at::date <= $2
      `, [from, to]);
      const inputVat = await pool.query(`
        SELECT
          COALESCE(SUM(total_amount::numeric - vat_amount::numeric), 0) AS taxable_purchases,
          COALESCE(SUM(vat_amount::numeric), 0) AS input_vat,
          COUNT(*) AS po_count
        FROM purchase_orders
        WHERE status IN ('received', 'ordered', 'partially_received')
          AND created_at::date >= $1 AND created_at::date <= $2
      `, [from, to]);
      const invoices = await pool.query(`
        SELECT i.invoice_number, i.issued_at, i.subtotal, i.vat_amount, i.total_with_vat, i.buyer_name
        FROM invoices i
        WHERE i.status IN ('issued', 'paid')
          AND i.issued_at::date >= $1 AND i.issued_at::date <= $2
        ORDER BY i.issued_at DESC
      `, [from, to]);
      const purchases = await pool.query(`
        SELECT po.order_number, po.created_at, po.total_amount, po.vat_amount, s.name AS supplier_name
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        WHERE po.status IN ('received', 'ordered', 'partially_received')
          AND po.created_at::date >= $1 AND po.created_at::date <= $2
        ORDER BY po.created_at DESC
      `, [from, to]);
      const outVatRow = outputVat.rows[0];
      const inVatRow = inputVat.rows[0];
      res.json({
        period: { quarter: q, year: y, from, to },
        output: {
          taxableSales: parseFloat(outVatRow.taxable_sales),
          outputVat: parseFloat(outVatRow.output_vat),
          invoiceCount: parseInt(outVatRow.invoice_count),
        },
        input: {
          taxablePurchases: parseFloat(inVatRow.taxable_purchases),
          inputVat: parseFloat(inVatRow.input_vat),
          poCount: parseInt(inVatRow.po_count),
        },
        netVat: parseFloat(outVatRow.output_vat) - parseFloat(inVatRow.input_vat),
        invoices: invoices.rows,
        purchases: purchases.rows,
      });
    } catch { res.status(500).json({ message: "حدث خطأ" }); }
  });

  // ── Bank Reconciliation ────────────────────────────────────────────────────
  // Book-side balance is derived from GL account 1112 (Bank - Current Account).
  // Unmatched items: bank-transfer payments pending (not yet journalized) +
  //   GL bank entries in last 30 days without a bank reference number.
  app.get("/api/accounting/bank-reconciliation", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      let { from, to } = req.query as { from?: string; to?: string };
      const { pool } = await import("./db");
      const BANK_ACCOUNT = "1112";
      // Default to last 30 days if no date range provided
      if (!from && !to) {
        const today = new Date();
        to = today.toISOString().split("T")[0];
        today.setDate(today.getDate() - 30);
        from = today.toISOString().split("T")[0];
      }

      // Opening balance: GL bank account movements BEFORE `from`
      let openingBalance = 0;
      if (from) {
        const obRes = await pool.query(
          `SELECT COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0) AS ob
           FROM journal_entry_lines jel
           INNER JOIN journal_entries je ON jel.entry_id = je.id
           WHERE je.status = 'posted' AND jel.account_code = $1 AND je.date < $2`,
          [BANK_ACCOUNT, from]
        );
        openingBalance = parseFloat(obRes.rows[0]?.ob || 0);
      }

      // GL bank account movements within the period
      const params: any[] = [BANK_ACCOUNT];
      let dateConds = "";
      if (from) { params.push(from); dateConds += ` AND je.date >= $${params.length}`; }
      if (to)   { params.push(to);   dateConds += ` AND je.date <= $${params.length}`; }

      const glLines = await pool.query(
        `SELECT jel.id, jel.debit, jel.credit, jel.notes,
                je.entry_number, je.date AS entry_date, je.description AS entry_description,
                je.reference, je.reference_type
         FROM journal_entry_lines jel
         INNER JOIN journal_entries je ON jel.entry_id = je.id
         WHERE je.status = 'posted' AND jel.account_code = $1${dateConds}
         ORDER BY je.date, je.id`,
        params
      );

      // Running balance through the period
      let runningBalance = openingBalance;
      const lines = glLines.rows.map((l: any) => {
        runningBalance += parseFloat(l.debit || 0) - parseFloat(l.credit || 0);
        return { ...l, runningBalance };
      });

      const periodDebits = lines.reduce((s: number, l: any) => s + parseFloat(l.debit || 0), 0);
      const periodCredits = lines.reduce((s: number, l: any) => s + parseFloat(l.credit || 0), 0);
      const closingBookBalance = openingBalance + periodDebits - periodCredits;

      // Unmatched items — two types:
      // 1) Bank-transfer payments with status 'pending': received by bank but not yet posted to GL
      const pendingParams: any[] = ["pending", "bank_transfer"];
      let pendingDateConds = "";
      // Last-30-days explicit window for unmatched items
      const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const last30From = from || thirtyDaysAgo.toISOString().split("T")[0];
      const last30To   = to   || new Date().toISOString().split("T")[0];
      pendingParams.push(last30From); pendingDateConds += ` AND p.created_at::date >= $${pendingParams.length}`;
      pendingParams.push(last30To);   pendingDateConds += ` AND p.created_at::date <= $${pendingParams.length}`;

      const pendingResult = await pool.query(
        `SELECT p.id, p.amount, p.method, p.bank_reference, p.created_at,
                c.full_name AS customer_name, ct.contract_number,
                'pending_payment' AS unmatched_type
         FROM payments p
         LEFT JOIN customers c ON p.customer_id = c.id
         LEFT JOIN contracts ct ON p.contract_id = ct.id
         WHERE p.payment_status = $1 AND p.method = $2${pendingDateConds}
         ORDER BY p.created_at DESC`,
        pendingParams
      );

      // 2) GL bank-account lines without a bank reference (likely to be outstanding/unreconciled)
      const unreconciledGLParams: any[] = [BANK_ACCOUNT, last30From, last30To];
      const unreconciledGL = await pool.query(
        `SELECT jel.id, jel.debit, jel.credit, jel.notes, je.date AS entry_date,
                je.entry_number, je.description AS entry_description, je.reference,
                'gl_unmatched' AS unmatched_type
         FROM journal_entry_lines jel
         INNER JOIN journal_entries je ON jel.entry_id = je.id
         WHERE je.status = 'posted'
           AND jel.account_code = $1
           AND je.date >= $2::date AND je.date <= $3::date
           AND (je.reference IS NULL OR je.reference = '')
         ORDER BY je.date DESC`,
        unreconciledGLParams
      );

      const unmatchedItems = [...pendingResult.rows, ...unreconciledGL.rows];
      const totalPending = pendingResult.rows.reduce((s: number, r: any) => s + parseFloat(r.amount || 0), 0);

      res.json({
        period: { from: from || last30From, to: to || last30To },
        openingBalance,
        glLines: lines,
        periodDebits,
        periodCredits,
        closingBookBalance,
        unmatchedItems,
        pendingPayments: pendingResult.rows,
        unreconciledGLEntries: unreconciledGL.rows,
        totalPending,
        adjustedBookBalance: closingBookBalance + totalPending,
      });
    } catch (e: any) { res.status(500).json({ message: e.message || "حدث خطأ" }); }
  });

  // ── Opening Balances ───────────────────────────────────────────────────────
  // GET: returns all lines from opening-balance entries
  app.get("/api/accounting/opening-balances", requireRole("owner", "assistant", "accountant"), async (_req, res) => {
    try {
      const { pool } = await import("./db");
      const result = await pool.query(
        `SELECT jel.account_code, jel.account_name_ar, jel.debit, jel.credit, jel.party_type, jel.party_id
         FROM journal_entry_lines jel
         INNER JOIN journal_entries je ON jel.entry_id = je.id
         WHERE je.reference_type = 'opening_balance' AND je.status = 'posted'
         ORDER BY jel.account_code, jel.party_type NULLS FIRST, jel.account_name_ar`
      );
      res.json(result.rows);
    } catch (e: any) { res.status(500).json({ message: e.message || "حدث خطأ" }); }
  });

  // POST: save opening balances (replaces existing opening-balance entry)
  app.post("/api/accounting/opening-balances", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      type ObLine = { accountCode: string; accountNameAr: string; debit: string; credit: string; partyType?: string | null; partyId?: number | null };
      const { date, lines } = req.body as { date: string; lines: ObLine[] };
      if (!date) return res.status(400).json({ message: "التاريخ مطلوب" });
      if (!lines || lines.length === 0) return res.status(400).json({ message: "يجب إدخال سطر واحد على الأقل" });
      const validLines = lines.filter(l => parseNum(l.debit) > 0 || parseNum(l.credit) > 0);
      if (validLines.length === 0) return res.status(400).json({ message: "يجب إدخال مبالغ للأرصدة الافتتاحية" });

      // دفتر مساعد: تطبيع/تحقق حقول الطرف (عميل/مورد) قبل الدمج حتى لا تُخزّن روابط يتيمة
      for (const l of validLines) {
        const pt = l.partyType === "customer" || l.partyType === "supplier" ? l.partyType : null;
        const pid = pt && Number.isInteger(Number(l.partyId)) && Number(l.partyId) > 0 ? Number(l.partyId) : null;
        if (pt && pid) {
          const exists = pt === "customer" ? await storage.getCustomer(pid) : await storage.getSupplier(pid);
          if (!exists) return res.status(400).json({ message: pt === "customer" ? "العميل المحدد غير موجود" : "المورد المحدد غير موجود" });
          l.partyType = pt; l.partyId = pid;
        } else {
          l.partyType = null; l.partyId = null;
        }
      }

      // Merge with existing opening-balance lines so each save is additive.
      // New lines override existing ones for the same account code + party, and
      // party lines replace a legacy aggregate line on the same control account
      // (and vice versa) to prevent double-counting — see shared/opening-balances.ts.
      const { mergeOpeningBalanceLines } = await import("@shared/opening-balances");
      const { pool: _pool } = await import("./db");
      const existingResult = await _pool.query(
        `SELECT jel.account_code, jel.account_name_ar, jel.debit, jel.credit, jel.party_type, jel.party_id
         FROM journal_entry_lines jel
         INNER JOIN journal_entries je ON jel.entry_id = je.id
         WHERE je.reference_type = 'opening_balance' AND je.status = 'posted'
         AND jel.account_code <> '3999'`
      );
      const existingLines: ObLine[] = existingResult.rows.map((row: any) => ({
        accountCode: row.account_code, accountNameAr: row.account_name_ar, debit: row.debit, credit: row.credit,
        partyType: row.party_type, partyId: row.party_id,
      }));
      const mergedLines = mergeOpeningBalanceLines(existingLines, validLines as any);

      // QuickBooks-style auto-balance: any difference is posted to the
      // "Opening Balance Equity" account (3999) instead of rejecting the save.
      const OB_EQUITY_CODE = "3999";
      const OB_EQUITY_NAME_AR = "الأرصدة الافتتاحية — حقوق ملكية";
      const linesToSave = mergedLines.map(l => ({ ...l }));
      const preDebit = linesToSave.reduce((s, l) => s + parseNum(l.debit), 0);
      const preCredit = linesToSave.reduce((s, l) => s + parseNum(l.credit), 0);
      const diff = +(preDebit - preCredit).toFixed(2);
      if (Math.abs(diff) > 0.009) {
        let obAccount = await storage.getChartOfAccountByCode(OB_EQUITY_CODE);
        if (!obAccount) {
          try {
            obAccount = await storage.createChartOfAccount({
              code: OB_EQUITY_CODE,
              nameAr: OB_EQUITY_NAME_AR,
              nameEn: "Opening Balance Equity",
              type: "equity",
              parentCode: "3000",
              isSystem: true,
            } as any);
          } catch (e) {
            // Concurrent request may have created it (unique code) — re-read.
            obAccount = await storage.getChartOfAccountByCode(OB_EQUITY_CODE);
            if (!obAccount) throw e;
          }
        }
        linesToSave.push({
          accountCode: OB_EQUITY_CODE,
          accountNameAr: obAccount?.nameAr || OB_EQUITY_NAME_AR,
          debit: diff < 0 ? Math.abs(diff).toFixed(2) : "0",
          credit: diff > 0 ? diff.toFixed(2) : "0",
        });
      }

      const totalDebit = linesToSave.reduce((s, l) => s + parseNum(l.debit), 0);
      const totalCredit = linesToSave.reduce((s, l) => s + parseNum(l.credit), 0);

      // Atomic: void previous opening-balance entry + create the new one in one
      // transaction so balances are never wiped without a replacement.
      const entry = await storage.replaceOpeningBalances(
        {
          date,
          description: "أرصدة افتتاحية",
          reference: "OPENING",
          referenceType: "opening_balance",
          totalDebit: totalDebit.toFixed(2),
          totalCredit: totalCredit.toFixed(2),
          status: "posted",
          createdBy: (req as any).userId,
        },
        linesToSave.map(l => ({ ...l, entryId: 0, notes: "" }))
      );
      res.json(entry);
    } catch (e: any) { res.status(400).json({ message: e.message || "حدث خطأ" }); }
  });

  // ── Fiscal Years ────────────────────────────────────────────────────────────
  app.get("/api/accounting/fiscal-years", requireRole("owner", "assistant", "accountant"), async (_req, res) => {
    try {
      res.json(await storage.getFiscalYears());
    } catch (e: any) { res.status(500).json({ message: e.message || "حدث خطأ" }); }
  });

  app.post("/api/accounting/fiscal-years", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const fy = await storage.createFiscalYear({ ...req.body, createdBy: (req as any).userId });
      res.json(fy);
    } catch (e: any) { res.status(400).json({ message: e.message || "حدث خطأ" }); }
  });

  app.patch("/api/accounting/fiscal-years/:id", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const fy = await storage.updateFiscalYear(Number(req.params.id), req.body);
      res.json(fy);
    } catch (e: any) { res.status(500).json({ message: e.message || "حدث خطأ" }); }
  });

  // Closing report: return fiscal year info + closing entry lines for PDF generation
  app.get("/api/accounting/fiscal-years/:id/closing-report", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const fyId = Number(req.params.id);
      const fy = await storage.getFiscalYear(fyId);
      if (!fy) return res.status(404).json({ message: "السنة المالية غير موجودة" });
      if (!fy.closingEntryId) return res.status(400).json({ message: "لا يوجد قيد إقفال لهذه السنة المالية" });

      const entry = await storage.getJournalEntry(fy.closingEntryId);
      if (!entry) return res.status(404).json({ message: "قيد الإقفال غير موجود" });

      const lines = await storage.getJournalEntryLines(fy.closingEntryId);

      res.json({ fiscalYear: fy, closingEntry: { ...entry, lines } });
    } catch (e: any) { res.status(500).json({ message: e.message || "حدث خطأ" }); }
  });

  // Year-end close: create closing journal entry and mark fiscal year as closed
  app.post("/api/accounting/fiscal-years/:id/close", requireRole("owner", "assistant", "accountant"), async (req, res) => {
    try {
      const fyId = Number(req.params.id);
      const fy = await storage.getFiscalYear(fyId);
      if (!fy) return res.status(404).json({ message: "السنة المالية غير موجودة" });
      if (fy.status === "closed") return res.status(400).json({ message: "السنة المالية مغلقة بالفعل" });

      const { pool } = await import("./db");

      // Read configured retained earnings account code from company settings (default: 3200)
      const companySettingsRow = await storage.getCompanySettings();
      const RETAINED_EARNINGS = (companySettingsRow?.retainedEarningsAccountCode || "3200").trim();

      // Validate that the retained earnings account exists before proceeding
      const reCheck = await pool.query(
        `SELECT id FROM chart_of_accounts WHERE code = $1 AND is_active = true`,
        [RETAINED_EARNINGS]
      );
      if (reCheck.rows.length === 0) {
        return res.status(400).json({ message: `لم يتم العثور على حساب الأرباح المحتجزة (${RETAINED_EARNINGS})` });
      }

      // Pre-flight: warn if no active revenue or expense accounts exist in the chart of accounts at all
      const acctCheck = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM chart_of_accounts WHERE type IN ('revenue', 'cost', 'expense') AND is_active = true`
      );
      if (Number(acctCheck.rows[0].cnt) === 0) {
        const updated = await storage.updateFiscalYear(fyId, { status: "closed" });
        return res.json({
          fiscalYear: updated,
          warning: "لا توجد حسابات إيرادات أو مصروفات نشطة في دليل الحسابات. تم إقفال السنة المالية دون إنشاء قيد إقفال."
        });
      }

      // Get all revenue and expense/cost account balances for the period.
      // Use a subquery to INNER JOIN lines with only posted entries in the FY date range,
      // then LEFT JOIN that result to the chart of accounts so accounts with zero balance still appear.
      const result = await pool.query(
        `SELECT
           coa.code, coa.name_ar, coa.type,
           COALESCE(SUM(filtered.debit), 0)::numeric AS total_debit,
           COALESCE(SUM(filtered.credit), 0)::numeric AS total_credit
         FROM chart_of_accounts coa
         LEFT JOIN (
           SELECT jel.account_code, jel.debit, jel.credit
           FROM journal_entry_lines jel
           INNER JOIN journal_entries je ON jel.entry_id = je.id
           WHERE je.status = 'posted'
             AND je.date >= $1 AND je.date <= $2
             AND je.reference_type != 'year_closing'
         ) filtered ON filtered.account_code = coa.code
         WHERE coa.type IN ('revenue', 'cost', 'expense') AND coa.is_active = true
         GROUP BY coa.code, coa.name_ar, coa.type`,
        [fy.startDate, fy.endDate]
      );

      const closingLines: { accountCode: string; accountNameAr: string; debit: string; credit: string; notes: string }[] = [];
      let netProfit = 0;

      for (const row of result.rows) {
        const debit = parseFloat(row.total_debit);
        const credit = parseFloat(row.total_credit);
        const balance = debit - credit;

        if (Math.abs(balance) < 0.01) continue;

        if (row.type === "revenue") {
          // Revenue accounts have credit balances; debit them to close
          closingLines.push({ accountCode: row.code, accountNameAr: row.name_ar, debit: Math.abs(balance).toFixed(2), credit: "0", notes: "إقفال" });
          netProfit += Math.abs(balance);
        } else {
          // Cost/expense accounts have debit balances; credit them to close
          closingLines.push({ accountCode: row.code, accountNameAr: row.name_ar, debit: "0", credit: Math.abs(balance).toFixed(2), notes: "إقفال" });
          netProfit -= Math.abs(balance);
        }
      }

      if (closingLines.length === 0) {
        // Nothing to close — mark as closed without an entry
        const updated = await storage.updateFiscalYear(fyId, { status: "closed" });
        return res.json({ fiscalYear: updated, message: "لا توجد إيرادات أو مصروفات للإقفال" });
      }

      // Transfer net profit/loss to the configured retained earnings account
      const [reAccount] = (await pool.query(
        `SELECT name_ar FROM chart_of_accounts WHERE code = $1`, [RETAINED_EARNINGS]
      )).rows;
      const reName = reAccount?.name_ar || "الأرباح المحتجزة";

      if (netProfit >= 0) {
        closingLines.push({ accountCode: RETAINED_EARNINGS, accountNameAr: reName, debit: "0", credit: netProfit.toFixed(2), notes: "صافي ربح السنة" });
      } else {
        closingLines.push({ accountCode: RETAINED_EARNINGS, accountNameAr: reName, debit: Math.abs(netProfit).toFixed(2), credit: "0", notes: "خسارة السنة" });
      }

      const totalD = closingLines.reduce((s, l) => s + parseFloat(l.debit), 0);
      const totalC = closingLines.reduce((s, l) => s + parseFloat(l.credit), 0);

      const closingEntry = await storage.createJournalEntry(
        {
          date: fy.endDate,
          description: `إقفال السنة المالية: ${fy.name}`,
          reference: `FY-CLOSE-${fyId}`,
          referenceType: "year_closing",
          totalDebit: totalD.toFixed(2),
          totalCredit: totalC.toFixed(2),
          status: "posted",
          createdBy: (req as any).userId,
        },
        closingLines
      );

      const updated = await storage.updateFiscalYear(fyId, { status: "closed", closingEntryId: closingEntry.id });
      res.json({ fiscalYear: updated, closingEntry, netProfit });
    } catch (e: any) { res.status(500).json({ message: e.message || "حدث خطأ" }); }
  });

  // ── Financial data reset (owner only) ──────────────────────────────────────
  // Wipes all financial transaction data (journal entries, payments, invoices,
  // payment schedules, payroll, advances) and deletes contracts entirely
  // (dependent records are unlinked via contract_id = NULL), after backing
  // everything up into finance_reset_backups. Chart of accounts kept.
  app.post("/api/admin/finance-reset", requireRole("owner"), async (req, res) => {
    const BACKUP_TABLES = [
      "journal_entry_lines",
      "journal_entries",
      "payments",
      "invoices",
      "payment_schedules",
      "payroll_records",
      "employee_advances",
      "contracts",
      "fiscal_years",
    ];
    try {
      if (String(req.body?.confirm || "").trim() !== "تصفير") {
        return res.status(400).json({ message: "يجب كتابة كلمة التأكيد «تصفير» للمتابعة", messageEn: "Confirmation word required" });
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Block concurrent financial writes so backup and delete see the same rows
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('finance_reset'))`);
        await client.query(
          `LOCK TABLE journal_entry_lines, journal_entries, payments, invoices,
             payment_schedules, payroll_records, employee_advances, contracts, fiscal_years
           IN ACCESS EXCLUSIVE MODE`
        );
        await client.query(`
          CREATE TABLE IF NOT EXISTS finance_reset_backups (
            id SERIAL PRIMARY KEY,
            batch_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            row_data JSONB NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
        `);
        const batchId = `reset-${new Date().toISOString()}`;
        const counts: Record<string, number> = {};
        for (const t of BACKUP_TABLES) {
          const r = await client.query(
            `INSERT INTO finance_reset_backups (batch_id, table_name, row_data)
             SELECT $1, '${t}', to_jsonb(t.*) FROM ${t} t`,
            [batchId]
          );
          counts[t] = r.rowCount || 0;
        }
        // Delete in FK-safe order
        await client.query(`DELETE FROM journal_entry_lines`);
        await client.query(`UPDATE fiscal_years SET closing_entry_id = NULL`);
        await client.query(`DELETE FROM journal_entries`);
        await client.query(`DELETE FROM fiscal_years`);
        // Recreate exactly one clean active fiscal year for the current year
        const yearNow = new Date().getFullYear();
        await client.query(
          `INSERT INTO fiscal_years (name, start_date, end_date, status)
           VALUES ($1, $2, $3, 'active')`,
          [`السنة المالية ${yearNow}`, `${yearNow}-01-01`, `${yearNow}-12-31`]
        );
        await client.query(`DELETE FROM payments`);
        await client.query(`DELETE FROM invoices`);
        await client.query(`DELETE FROM payment_schedules`);
        await client.query(`DELETE FROM payroll_records`);
        await client.query(`DELETE FROM employee_advances`);
        // Unlink dependent records from contracts, then delete contracts entirely
        await client.query(`UPDATE work_orders SET contract_id = NULL WHERE contract_id IS NOT NULL`);
        await client.query(`UPDATE inventory_transactions SET contract_id = NULL WHERE contract_id IS NOT NULL`);
        await client.query(`UPDATE maintenance_requests SET contract_id = NULL WHERE contract_id IS NOT NULL`);
        await client.query(`UPDATE warranties SET contract_id = NULL WHERE contract_id IS NOT NULL`);
        await client.query(`DELETE FROM contracts`);
        // Restart numbering sequences so new documents start from 1
        await client.query(`
          DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'journal_entries_entry_number_seq') THEN
              PERFORM setval('journal_entries_entry_number_seq', 1, false);
            END IF;
            IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'invoices_invoice_number_seq') THEN
              PERFORM setval('invoices_invoice_number_seq', 1, false);
            END IF;
          END $$;
        `);
        // Post-reset verification: all wiped tables must be empty, contracts reset,
        // and exactly one active fiscal year must exist
        const verify = await client.query(`
          SELECT
            (SELECT COUNT(*)::int FROM journal_entry_lines) AS jel,
            (SELECT COUNT(*)::int FROM journal_entries) AS je,
            (SELECT COUNT(*)::int FROM payments) AS pay,
            (SELECT COUNT(*)::int FROM invoices) AS inv,
            (SELECT COUNT(*)::int FROM payment_schedules) AS ps,
            (SELECT COUNT(*)::int FROM payroll_records) AS pr,
            (SELECT COUNT(*)::int FROM employee_advances) AS ea,
            (SELECT COUNT(*)::int FROM contracts) AS badContracts,
            (SELECT COUNT(*)::int FROM fiscal_years WHERE status = 'active') AS activeFy,
            (SELECT COUNT(*)::int FROM fiscal_years) AS totalFy
        `);
        const v = verify.rows[0];
        if (
          Number(v.jel) !== 0 || Number(v.je) !== 0 || Number(v.pay) !== 0 ||
          Number(v.inv) !== 0 || Number(v.ps) !== 0 || Number(v.pr) !== 0 ||
          Number(v.ea) !== 0 || Number(v.badcontracts) !== 0 ||
          Number(v.activefy) !== 1 || Number(v.totalfy) !== 1
        ) {
          throw new Error(`فشل التحقق بعد التصفير: ${JSON.stringify(v)}`);
        }
        await client.query("COMMIT");
        console.log(`Finance reset completed (${batchId}):`, counts);
        return res.json({
          success: true,
          batchId,
          backedUp: counts,
          message: "تم تصفير البيانات المالية بنجاح مع الاحتفاظ بنسخة احتياطية",
        });
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error("Finance reset failed:", e);
      return res.status(500).json({ message: e.message || "حدث خطأ أثناء التصفير" });
    }
  });

  // ── /api/finance/* aliases (backward-compatible redirects) ─────────────────
  const ACCOUNTING_ENDPOINTS = [
    "accounts", "journal-entries", "ledger", "trial-balance",
    "balance-sheet", "income-statement", "cash-flow", "vat-report", "bank-reconciliation",
  ];
  for (const ep of ACCOUNTING_ENDPOINTS) {
    app.get(`/api/finance/${ep}`, (req, res) => {
      req.url = req.url.replace(`/api/finance/${ep}`, `/api/accounting/${ep}`);
      (app as any)._router.handle(
        Object.assign(req, { url: `/api/accounting/${ep}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}` }),
        res,
        () => res.status(404).json({ message: "Not found" })
      );
    });
  }

  return httpServer;
}
