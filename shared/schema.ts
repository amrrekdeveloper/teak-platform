import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  serial,
  boolean,
  timestamp,
  decimal,
  jsonb,
  date,
  pgEnum,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "assistant",
  "sales",
  "designer",
  "production",
  "purchasing",
  "warehouse",
  "accountant",
  "customer_service",
  "delivery",
  "installation",
  "quality",
  "hr",
  "it",
  "customer",
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default("customer"),
  fullNameAr: text("full_name_ar").notNull(),
  fullNameEn: text("full_name_en").notNull(),
  phone: text("phone"),
  email: text("email"),
  profileImage: text("profile_image"),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  financePin: text("finance_pin"),
  employeePin: text("employee_pin"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Per-account permission exceptions (grants/revokes) on top of role defaults.
export const userPermissions = pgTable(
  "user_permissions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key").notNull(),
    effect: text("effect").notNull(), // 'grant' | 'revoke'
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userKeyUnique: unique("user_permissions_user_key_unique").on(t.userId, t.permissionKey),
  }),
);

export const insertUserPermissionSchema = createInsertSchema(userPermissions).omit({
  id: true,
  createdAt: true,
});
export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;
export type UserPermission = typeof userPermissions.$inferSelect;

export const nationalityEnum = pgEnum("nationality", ["saudi", "resident"]);
export const employeeStatusEnum = pgEnum("employee_status", [
  "active",
  "inactive",
  "terminated",
]);
export const departmentEnum = pgEnum("department", [
  "sales",
  "design",
  "production",
  "warehouse",
  "finance",
  "hr",
  "it",
  "delivery",
  "installation",
  "quality",
  "management",
  "customer_service",
]);

// The catalog is populated before publishing its employee FK (see the staged-publication runbook).
export const hrDepartments = pgTable("hr_departments", {
  id: serial("id").primaryKey(),
  code: departmentEnum("code").$type<string>().notNull().unique("hr_departments_code_key"),
  nameAr: text("name_ar").notNull().unique("hr_departments_name_ar_key"),
});

export const contractTypeEnum = pgEnum("contract_type", [
  "fixed",
  "open",
  "temporary",
  "training",
]);

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  employeeNumber: text("employee_number").notNull().unique(),
  fullNameAr: text("full_name_ar").notNull().default(""),
  fullNameEn: text("full_name_en"),
  nationality: nationalityEnum("nationality").notNull(),
  position: text("position").notNull(),
  department: departmentEnum("department").$type<string>().notNull(),
  monthlySalary: decimal("monthly_salary", { precision: 10, scale: 2 }).notNull(),
  iqamaNumber: text("iqama_number"),
  dateOfBirth: date("date_of_birth"),
  iqamaExpiry: date("iqama_expiry"),
  contractStart: date("contract_start").notNull(),
  contractEnd: date("contract_end"),
  status: employeeStatusEnum("status").notNull().default("active"),
  fingerprintLocation: text("fingerprint_location"),
  contractType: contractTypeEnum("contract_type"),
  insuranceExpiry: date("insurance_expiry"),
  fingerScanLocation: text("finger_scan_location"),
  phone: text("phone"),
  email: text("email"),
  documents: jsonb("documents").$default(() => []),
  attendanceEnabled: boolean("attendance_enabled").notNull().default(true),
  attendanceZoneId: integer("attendance_zone_id"),
  attendanceScheduleId: integer("attendance_schedule_id"),
  managerId: integer("manager_id"), // المدير المباشر (اختياري) — بدونه يذهب الاعتماد لـ HR/المالك
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  departmentCatalog: foreignKey({
    name: "employee_department_catalog",
    columns: [table.department],
    foreignColumns: [hrDepartments.code],
  }).onDelete("no action").onUpdate("no action"),
}));

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true,
}).extend({ department: z.string().trim().min(1).max(80) });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

export const jobTitles = pgTable("job_titles", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  department: departmentEnum("department"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertJobTitleSchema = createInsertSchema(jobTitles).omit({
  id: true,
  createdAt: true,
});
export type InsertJobTitle = z.infer<typeof insertJobTitleSchema>;
export type JobTitle = typeof jobTitles.$inferSelect;

export const hrAuditLog = pgTable("hr_audit_log", {
  id: serial("id").primaryKey(),
  performedBy: integer("performed_by").references(() => users.id),
  targetUserId: integer("target_user_id").references(() => users.id),
  employeeId: integer("employee_id").references(() => employees.id),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertHrAuditLogSchema = createInsertSchema(hrAuditLog).omit({
  id: true,
  createdAt: true,
});
export type InsertHrAuditLog = z.infer<typeof insertHrAuditLogSchema>;
export type HrAuditLog = typeof hrAuditLog.$inferSelect;

export const assetStatusEnum = pgEnum("asset_status", ["active", "returned"]);

export const employeeAssets = pgTable("employee_assets", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  assetType: text("asset_type").notNull(),
  description: text("description").notNull(),
  serialNumber: text("serial_number"),
  status: assetStatusEnum("status").notNull().default("active"),
  assignedAt: date("assigned_at").notNull(),
  returnedAt: date("returned_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEmployeeAssetSchema = createInsertSchema(employeeAssets).omit({
  id: true,
  createdAt: true,
});
export type InsertEmployeeAsset = z.infer<typeof insertEmployeeAssetSchema>;
export type EmployeeAsset = typeof employeeAssets.$inferSelect;

export const payrollStatusEnum = pgEnum("payroll_status", ["draft", "paid"]);

export const payrollRecords = pgTable("payroll_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  period: text("period").notNull(), // "YYYY-MM"
  basicSalary: decimal("basic_salary", { precision: 12, scale: 2 }).notNull().default("0"),
  allowances: decimal("allowances", { precision: 12, scale: 2 }).notNull().default("0"),
  deductions: decimal("deductions", { precision: 12, scale: 2 }).notNull().default("0"),
  advanceDeduction: decimal("advance_deduction", { precision: 12, scale: 2 }).notNull().default("0"),
  netSalary: decimal("net_salary", { precision: 12, scale: 2 }).notNull().default("0"),
  status: payrollStatusEnum("status").notNull().default("draft"),
  paidDate: date("paid_date"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPayrollRecordSchema = createInsertSchema(payrollRecords).omit({
  id: true,
  createdAt: true,
});
export type InsertPayrollRecord = z.infer<typeof insertPayrollRecordSchema>;
export type PayrollRecord = typeof payrollRecords.$inferSelect;

// ===== Employee Advances (السلف) =====
export const advanceStatusEnum = pgEnum("advance_status", ["pending", "approved", "rejected", "settled"]);

export const employeeAdvances = pgTable("employee_advances", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  installments: integer("installments").notNull().default(1),
  monthlyDeduction: decimal("monthly_deduction", { precision: 12, scale: 2 }).notNull().default("0"),
  remainingAmount: decimal("remaining_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  reason: text("reason"),
  status: advanceStatusEnum("status").notNull().default("pending"),
  requestDate: date("request_date").notNull(),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedDate: date("approved_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEmployeeAdvanceSchema = createInsertSchema(employeeAdvances).omit({
  id: true,
  createdAt: true,
});
export type InsertEmployeeAdvance = z.infer<typeof insertEmployeeAdvanceSchema>;
export type EmployeeAdvance = typeof employeeAdvances.$inferSelect;

// ===== Leave Management (الإجازات) =====
export const leaveTypeEnum = pgEnum("leave_type", ["annual", "sick", "unpaid", "emergency", "maternity", "other"]);
export const leaveStatusEnum = pgEnum("leave_status", ["pending", "manager_approved", "approved", "rejected", "clarification_requested"]);

export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  leaveType: leaveTypeEnum("leave_type").notNull().default("annual"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  days: integer("days").notNull().default(1),
  reason: text("reason"),
  leaveFormData: jsonb("leave_form_data"),
  status: leaveStatusEnum("status").notNull().default("pending"),
  managerApprovedBy: integer("manager_approved_by").references(() => users.id),
  managerApprovedDate: date("manager_approved_date"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedDate: date("approved_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLeaveRequestSchema = createInsertSchema(leaveRequests).omit({
  id: true,
  createdAt: true,
});
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;
export type LeaveRequest = typeof leaveRequests.$inferSelect;

// ===== Performance Evaluations (تقييم الأداء) =====
export const evaluationStatusEnum = pgEnum("evaluation_status", ["draft", "finalized"]);

export const performanceEvaluations = pgTable("performance_evaluations", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  period: text("period").notNull(), // "YYYY-MM" or "YYYY-Q1" etc.
  evaluatorId: integer("evaluator_id").references(() => users.id),
  scoreQuality: integer("score_quality").notNull().default(3),
  scoreProductivity: integer("score_productivity").notNull().default(3),
  scoreAttendance: integer("score_attendance").notNull().default(3),
  scoreTeamwork: integer("score_teamwork").notNull().default(3),
  scoreDiscipline: integer("score_discipline").notNull().default(3),
  overallScore: decimal("overall_score", { precision: 4, scale: 2 }).notNull().default("3"),
  strengths: text("strengths"),
  improvements: text("improvements"),
  status: evaluationStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPerformanceEvaluationSchema = createInsertSchema(performanceEvaluations).omit({
  id: true,
  createdAt: true,
});
export type InsertPerformanceEvaluation = z.infer<typeof insertPerformanceEvaluationSchema>;
export type PerformanceEvaluation = typeof performanceEvaluations.$inferSelect;

export const customerSourceEnum = pgEnum("customer_source", [
  "website",
  "walk_in",
  "referral",
  "phone",
  "social_media",
]);

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  city: text("city"),
  district: text("district"),
  buildingStatus: text("building_status"),
  source: customerSourceEnum("source").default("phone"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

export const productCategoryEnum = pgEnum("product_category", [
  "kitchen",
  "wardrobe",
  "door",
  "decoration",
  "hotel",
]);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  category: productCategoryEnum("category").notNull(),
  descriptionAr: text("description_ar"),
  descriptionEn: text("description_en"),
  images: text("images").array(),
  featured: boolean("featured").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const woodTypes = pgTable("wood_types", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  pricePerMeter: decimal("price_per_meter", { precision: 10, scale: 2 }).notNull(),
  category: text("category"),
  grade: text("grade").notNull().default("standard"),
  active: boolean("active").notNull().default(true),
});

export const insertWoodTypeSchema = createInsertSchema(woodTypes).omit({
  id: true,
});
export type InsertWoodType = z.infer<typeof insertWoodTypeSchema>;
export type WoodType = typeof woodTypes.$inferSelect;

export const doorTypes = pgTable("door_types", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  pricePerMeter: decimal("price_per_meter", { precision: 10, scale: 2 }).notNull(),
  woodTypeId: integer("wood_type_id").references(() => woodTypes.id),
  active: boolean("active").notNull().default(true),
});

export const insertDoorTypeSchema = createInsertSchema(doorTypes).omit({
  id: true,
});
export type InsertDoorType = z.infer<typeof insertDoorTypeSchema>;
export type DoorType = typeof doorTypes.$inferSelect;

export const quotationStatusEnum = pgEnum("quotation_status", [
  "requested",
  "open",
  "draft",
  "sent",
  "approved",
  "rejected",
  "expired",
  "cancelled",
]);

export const ORDER_STAGE_VALUES = [
  "new",
  "appointment_scheduled",
  "survey_done",
  "quote_draft",
  "quote_sent",
  "quote_approved",
  "in_production",
  "ready_for_delivery",
  "delivered",
  "installed",
  "completed",
  "rejected",
  "cancelled",
] as const;
export type OrderStageValue = typeof ORDER_STAGE_VALUES[number];

export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  quotationNumber: serial("quotation_number"),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  items: jsonb("items").notNull().default([]),
  totalArea: decimal("total_area", { precision: 10, scale: 2 }),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).notNull().default("15"),
  vatAmount: decimal("vat_amount", { precision: 12, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 12, scale: 2 }).default("0"),
  finalPrice: decimal("final_price", { precision: 12, scale: 2 }).notNull(),
  status: quotationStatusEnum("status").notNull().default("draft"),
  assignedTo: integer("assigned_to").references(() => users.id),
  assignedAt: timestamp("assigned_at"),
  claimedAt: timestamp("claimed_at"),
  previousAssignees: jsonb("previous_assignees").default([]),
  designFile: text("design_file"),
  validUntil: date("valid_until"),
  inspectionDate: date("inspection_date"),
  deliveryDays: integer("delivery_days"),
  city: text("city"),
  notes: text("notes"),
  orderStage: text("order_stage").default("new"),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at"),
  attachmentData: text("attachment_data"),
  attachmentName: text("attachment_name"),
  attachmentMime: text("attachment_mime"),
  showAttachmentToCustomer: boolean("show_attachment_to_customer").default(false),
  attachedDesignFiles: jsonb("attached_design_files").default([]),
  paymentReceiptData: text("payment_receipt_data"),
  paymentReceiptName: text("payment_receipt_name"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  warrantyMonths: integer("warranty_months").default(24),
  paymentInstallments: jsonb("payment_installments").default([]),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertQuotationSchema = createInsertSchema(quotations).omit({
  id: true,
  quotationNumber: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertQuotation = z.infer<typeof insertQuotationSchema>;
export type Quotation = typeof quotations.$inferSelect;

export const paymentScheduleStatusEnum = pgEnum("payment_schedule_status", [
  "pending",
  "due",
  "paid",
  "overdue",
]);

export const paymentScheduleTriggerEnum = pgEnum("payment_schedule_trigger", [
  "on_approval",
  "on_production",
  "on_delivery",
  "on_installation",
  "on_completion",
]);

export const paymentSchedules = pgTable("payment_schedules", {
  id: serial("id").primaryKey(),
  quotationId: integer("quotation_id").references(() => quotations.id).notNull(),
  contractId: integer("contract_id"),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  installmentNumber: integer("installment_number").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  percentage: decimal("percentage", { precision: 5, scale: 2 }),
  triggerStage: paymentScheduleTriggerEnum("trigger_stage").notNull(),
  dueDate: date("due_date"),
  status: paymentScheduleStatusEnum("status").notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  paymentMethod: text("payment_method"),
  receiptData: text("receipt_data"),
  confirmedBy: integer("confirmed_by").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentScheduleSchema = createInsertSchema(paymentSchedules).omit({
  id: true,
  createdAt: true,
});
export type InsertPaymentSchedule = z.infer<typeof insertPaymentScheduleSchema>;
export type PaymentSchedule = typeof paymentSchedules.$inferSelect;

export const contractStatusEnum = pgEnum("contract_status", [
  "active",
  "completed",
  "cancelled",
]);

export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  contractNumber: text("contract_number").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  quotationId: integer("quotation_id").references(() => quotations.id),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  remainingAmount: decimal("remaining_amount", { precision: 12, scale: 2 }).notNull(),
  status: contractStatusEnum("status").notNull().default("active"),
  signedDate: date("signed_date"),
  expectedDeliveryDate: date("expected_delivery_date"),
  paymentSchedule: jsonb("payment_schedule").default([]),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContractSchema = createInsertSchema(contracts).omit({
  id: true,
  createdAt: true,
});
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contracts.$inferSelect;

export const paymentStageEnum = pgEnum("payment_stage", [
  "deposit",
  "pre_manufacturing",
  "delivery",
  "final",
  "other",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "bank_transfer",
  "cash",
  "card",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "sales_reviewed",
  "confirmed",
  "rejected",
]);

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => contracts.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  invoiceId: integer("invoice_id"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentStage: paymentStageEnum("payment_stage").notNull(),
  method: paymentMethodEnum("method").notNull(),
  status: paymentStatusEnum("payment_status").notNull().default("confirmed"),
  bankReference: text("bank_reference"),
  receiptNumber: text("receipt_number"),
  attachmentUrl: text("attachment_url"),
  notes: text("notes"),
  recordedBy: integer("recorded_by").references(() => users.id),
  salesReviewedBy: integer("sales_reviewed_by").references(() => users.id),
  salesReviewedAt: timestamp("sales_reviewed_at"),
  confirmedBy: integer("confirmed_by").references(() => users.id),
  confirmedAt: timestamp("confirmed_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

export const invoiceTypeEnum = pgEnum("invoice_type", [
  "quotation",
  "simplified_tax_invoice",
  "standard_tax_invoice",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "paid",
  "cancelled",
]);

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: serial("invoice_number"),
  contractId: integer("contract_id").references(() => contracts.id),
  quotationId: integer("quotation_id").references(() => quotations.id),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  paymentStage: paymentStageEnum("payment_stage"),
  type: invoiceTypeEnum("type").notNull().default("quotation"),
  items: jsonb("items").notNull().default([]),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).notNull().default("15"),
  vatAmount: decimal("vat_amount", { precision: 12, scale: 2 }).notNull(),
  totalWithVat: decimal("total_with_vat", { precision: 12, scale: 2 }).notNull(),
  sellerName: text("seller_name").notNull(),
  sellerVatNumber: text("seller_vat_number").notNull(),
  sellerAddress: text("seller_address").notNull(),
  buyerName: text("buyer_name").notNull(),
  buyerPhone: text("buyer_phone"),
  buyerVatNumber: text("buyer_vat_number"),
  buyerAddress: text("buyer_address"),
  paymentMethod: text("payment_method"),
  qrCodeData: text("qr_code_data"),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  issuedAt: timestamp("issued_at"),
  paidAt: timestamp("paid_at"),
  cancelledAt: timestamp("cancelled_at"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  invoiceNumber: true,
});
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

export const workOrderStatusEnum = pgEnum("work_order_status", [
  "pending",
  "in_production",
  "quality_check",
  "ready",
  "shipped",
  "delivered",
  "installed",
  "completed",
]);

export const priorityEnum = pgEnum("priority", ["normal", "urgent"]);

export const workOrders = pgTable("work_orders", {
  id: serial("id").primaryKey(),
  orderNumber: serial("order_number"),
  contractId: integer("contract_id").references(() => contracts.id),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  quotationId: integer("quotation_id").references(() => quotations.id),
  designFile: text("design_file"),
  specifications: jsonb("specifications"),
  priority: priorityEnum("priority").notNull().default("normal"),
  status: workOrderStatusEnum("status").notNull().default("pending"),
  assignedTo: integer("assigned_to").references(() => users.id),
  deliveryDays: integer("delivery_days"),
  productionStartDate: timestamp("production_start_date"),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  completedDate: date("completed_date"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWorkOrderSchema = createInsertSchema(workOrders).omit({
  id: true,
  orderNumber: true,
  createdAt: true,
});
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type WorkOrder = typeof workOrders.$inferSelect;

export const productionStageEnum = pgEnum("production_stage", [
  "cutting",
  "edging",
  "assembly",
  "finishing",
]);

export const stageStatusEnum = pgEnum("stage_status", [
  "pending",
  "in_progress",
  "completed",
  "on_hold",
]);

export const productionStages = pgTable("production_stages", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").references(() => workOrders.id).notNull(),
  stage: productionStageEnum("stage").notNull(),
  status: stageStatusEnum("status").notNull().default("pending"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  assignedTo: integer("assigned_to").references(() => users.id),
});

export const insertProductionStageSchema = createInsertSchema(productionStages).omit({
  id: true,
});
export type InsertProductionStage = z.infer<typeof insertProductionStageSchema>;
export type ProductionStage = typeof productionStages.$inferSelect;

export const unitEnum = pgEnum("unit", [
  "piece",
  "meter",
  "sqm",
  "kg",
  "liter",
  "sheet",
]);

export const inventory = pgTable("inventory", {
  id: serial("id").primaryKey(),
  materialNameAr: text("material_name_ar").notNull(),
  materialNameEn: text("material_name_en").notNull(),
  sku: text("sku"),
  category: text("category"),
  color: text("color"),
  imageUrl: text("image_url"),
  warehouseId: integer("warehouse_id"),
  unit: unitEnum("unit").notNull().default("piece"),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull().default("0"),
  minQuantity: decimal("min_quantity", { precision: 12, scale: 2 }).notNull().default("0"),
  costPerUnit: decimal("cost_per_unit", { precision: 10, scale: 2 }),
  location: text("location"),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const insertInventorySchema = createInsertSchema(inventory).omit({
  id: true,
  lastUpdated: true,
});
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type InventoryItem = typeof inventory.$inferSelect;

export const transactionTypeEnum = pgEnum("transaction_type", [
  "stock_in",
  "stock_out",
  "adjustment",
]);

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: serial("id").primaryKey(),
  inventoryId: integer("inventory_id").references(() => inventory.id).notNull(),
  type: transactionTypeEnum("type").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason"),
  contractId: integer("contract_id").references(() => contracts.id),
  supplierId: integer("supplier_id"),
  notes: text("notes"),
  workOrderId: integer("work_order_id").references(() => workOrders.id),
  purchaseOrderId: integer("purchase_order_id"),
  performedBy: integer("performed_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInventoryTransactionSchema = createInsertSchema(inventoryTransactions).omit({
  id: true,
  createdAt: true,
});
export type InsertInventoryTransaction = z.infer<typeof insertInventoryTransactionSchema>;
export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  materials: text("materials"),
  taxNumber: text("tax_number"),
  notes: text("notes"),
  approvalStatus: text("approval_status").notNull().default("approved"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSupplierSchema = createInsertSchema(suppliers).omit({
  id: true,
  createdAt: true,
});
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliers.$inferSelect;

export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWarehouseSchema = createInsertSchema(warehouses).omit({
  id: true,
  createdAt: true,
});
export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;
export type Warehouse = typeof warehouses.$inferSelect;

export const poStatusEnum = pgEnum("po_status", [
  "draft",
  "pending_approval",
  "approved",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
]);

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  orderNumber: serial("order_number"),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  items: jsonb("items").notNull().default([]),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  status: poStatusEnum("status").notNull().default("draft"),
  approvedBy: integer("approved_by").references(() => users.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({
  id: true,
  orderNumber: true,
  createdAt: true,
});
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "scheduled",
  "in_transit",
  "delivered",
  "failed",
]);

export const deliveries = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").references(() => workOrders.id).notNull(),
  scheduledDate: date("scheduled_date"),
  deliveredDate: date("delivered_date"),
  status: deliveryStatusEnum("status").notNull().default("scheduled"),
  deliveredBy: integer("delivered_by").references(() => users.id),
  notes: text("notes"),
  customerSignature: text("customer_signature"),
  deliveryPhotos: text("delivery_photos").array(),
});

export const insertDeliverySchema = createInsertSchema(deliveries).omit({
  id: true,
});
export type InsertDelivery = z.infer<typeof insertDeliverySchema>;
export type Delivery = typeof deliveries.$inferSelect;

export const installationStatusEnum = pgEnum("installation_status", [
  "scheduled",
  "in_progress",
  "completed",
  "rescheduled",
]);

export const installations = pgTable("installations", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").references(() => workOrders.id).notNull(),
  scheduledDate: date("scheduled_date"),
  completedDate: date("completed_date"),
  status: installationStatusEnum("status").notNull().default("scheduled"),
  installedBy: integer("installed_by").references(() => users.id),
  notes: text("notes"),
});

export const insertInstallationSchema = createInsertSchema(installations).omit({
  id: true,
});
export type InsertInstallation = z.infer<typeof insertInstallationSchema>;
export type Installation = typeof installations.$inferSelect;

export const maintenanceStatusEnum = pgEnum("maintenance_status", [
  "pending",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);

export const maintenancePriorityEnum = pgEnum("maintenance_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);

export const maintenanceRequests = pgTable("maintenance_requests", {
  id: serial("id").primaryKey(),
  requestNumber: serial("request_number"),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  contractId: integer("contract_id").references(() => contracts.id),
  description: text("description").notNull(),
  mediaUrls: text("media_urls").array(),
  status: maintenanceStatusEnum("status").notNull().default("pending"),
  priority: maintenancePriorityEnum("priority").notNull().default("normal"),
  scheduledDate: date("scheduled_date"),
  completedDate: date("completed_date"),
  resolution: text("resolution"),
  assignedTo: integer("assigned_to").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMaintenanceRequestSchema = createInsertSchema(maintenanceRequests).omit({
  id: true,
  requestNumber: true,
  createdAt: true,
});
export type InsertMaintenanceRequest = z.infer<typeof insertMaintenanceRequestSchema>;
export type MaintenanceRequest = typeof maintenanceRequests.$inferSelect;

export const checkTypeEnum = pgEnum("check_type", [
  "material_incoming",
  "in_process",
  "final_product",
]);

export const checkResultEnum = pgEnum("check_result", [
  "pass",
  "fail",
  "conditional",
]);

export const qualityChecks = pgTable("quality_checks", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").references(() => workOrders.id).notNull(),
  checkType: checkTypeEnum("check_type").notNull(),
  result: checkResultEnum("result").notNull(),
  notes: text("notes"),
  checkedBy: integer("checked_by").references(() => users.id),
  checkedAt: timestamp("checked_at").notNull().defaultNow(),
});

export const insertQualityCheckSchema = createInsertSchema(qualityChecks).omit({
  id: true,
  checkedAt: true,
});
export type InsertQualityCheck = z.infer<typeof insertQualityCheckSchema>;
export type QualityCheck = typeof qualityChecks.$inferSelect;

export const notificationTypeEnum = pgEnum("notification_type", [
  "info",
  "warning",
  "action",
  "success",
]);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  titleAr: text("title_ar").notNull(),
  titleEn: text("title_en").notNull(),
  messageAr: text("message_ar").notNull(),
  messageEn: text("message_en").notNull(),
  type: notificationTypeEnum("type").notNull().default("info"),
  relatedEntity: text("related_entity"),
  relatedId: integer("related_id"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLog).omit({
  id: true,
  createdAt: true,
});
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLog.$inferSelect;

export const companySettings = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  vatNumber: text("vat_number").notNull(),
  address: text("address").notNull(),
  phone: text("phone"),
  email: text("email"),
  logo: text("logo"),
  stampImage: text("stamp_image"),
  retainedEarningsAccountCode: text("retained_earnings_account_code").notNull().default("3200"),
});

export const insertCompanySettingsSchema = createInsertSchema(companySettings).omit({
  id: true,
});
export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type CompanySettings = typeof companySettings.$inferSelect;

export const designAssignmentStatusEnum = pgEnum("design_assignment_status", [
  "pending",
  "designing",
  "completed",
  "revision",
]);

export const designAssignments = pgTable("design_assignments", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  quotationId: integer("quotation_id").references(() => quotations.id),
  assignedTo: integer("assigned_to").references(() => users.id).notNull(),
  status: designAssignmentStatusEnum("status").notNull().default("pending"),
  measurements: jsonb("measurements"),
  productSpecs: jsonb("product_specs"),
  sketchData: text("sketch_data"),
  sketchImage: text("sketch_image"),
  screenshot3d: text("screenshot_3d"),
  designFiles: text("design_files").array(),
  notes: text("notes"),
  productDescription: text("product_description"),
  customerApproval: text("customer_approval"),
  customerApprovalNotes: text("customer_approval_notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDesignAssignmentSchema = createInsertSchema(designAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDesignAssignment = z.infer<typeof insertDesignAssignmentSchema>;
export type DesignAssignment = typeof designAssignments.$inferSelect;

export const warrantyStatusEnum = pgEnum("warranty_status", [
  "active",
  "expired",
  "claimed",
  "void",
]);

export const warranties = pgTable("warranties", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => contracts.id),
  workOrderId: integer("work_order_id").references(() => workOrders.id),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  quotationId: integer("quotation_id").references(() => quotations.id),
  durationMonths: integer("duration_months").default(24),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  terms: text("terms"),
  status: warrantyStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWarrantySchema = createInsertSchema(warranties).omit({
  id: true,
  createdAt: true,
});
export type InsertWarranty = z.infer<typeof insertWarrantySchema>;
export type Warranty = typeof warranties.$inferSelect;

export const adekoProducts = pgTable("adeko_products", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  descriptionEn: text("description_en").notNull(),
  descriptionAr: text("description_ar"),
  groupCode: text("group_code").notNull(),
  groupNameAr: text("group_name_ar").notNull(),
  groupNameEn: text("group_name_en").notNull(),
  manufacturingW: decimal("manufacturing_w", { precision: 10, scale: 2 }),
  manufacturingH: decimal("manufacturing_h", { precision: 10, scale: 2 }),
  manufacturingD: decimal("manufacturing_d", { precision: 10, scale: 2 }),
  designW: decimal("design_w", { precision: 10, scale: 2 }),
  designH: decimal("design_h", { precision: 10, scale: 2 }),
  designD: decimal("design_d", { precision: 10, scale: 2 }),
  priceBeforeVat: decimal("price_before_vat", { precision: 12, scale: 2 }).default("0"),
  priceAfterVat: decimal("price_after_vat", { precision: 12, scale: 2 }).default("0"),
  priceEconomy: decimal("price_economy", { precision: 12, scale: 2 }).default("0"),
  priceStandard: decimal("price_standard", { precision: 12, scale: 2 }).default("0"),
  pricePremium: decimal("price_premium", { precision: 12, scale: 2 }).default("0"),
  thumbnail: text("thumbnail"),
  usageType: text("usage_type").notNull().default("kitchen"),
  active: boolean("active").notNull().default(true),
});

export const insertAdekoProductSchema = createInsertSchema(adekoProducts).omit({
  id: true,
});
export type InsertAdekoProduct = z.infer<typeof insertAdekoProductSchema>;
export type AdekoProduct = typeof adekoProducts.$inferSelect;

// ─── Task #3: Calendar & Site Survey ─────────────────────────────────────────
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "attended",
  "no_show",
  "client_refused",
  "rescheduled",
  "cancelled",
]);

export const appointmentFailReasonEnum = pgEnum("appointment_fail_reason", [
  "lazy",
  "emergency",
  "client_not_available",
  "client_cancelled",
]);

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  assignedTo: integer("assigned_to").references(() => users.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  quotationId: integer("quotation_id").references(() => quotations.id),
  title: text("title").notNull(),
  appointmentDate: date("appointment_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  status: appointmentStatusEnum("status").notNull().default("scheduled"),
  failReason: text("fail_reason"),
  failNotes: text("fail_notes"),
  notes: text("notes"),
  rescheduledTo: integer("rescheduled_to"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointments.$inferSelect;

export const buildingStatusEnum = pgEnum("building_status_type", [
  "ready",
  "under_construction",
]);

export const siteSurveys = pgTable("site_surveys", {
  id: serial("id").primaryKey(),
  appointmentId: integer("appointment_id").references(() => appointments.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  quotationId: integer("quotation_id").references(() => quotations.id),
  roomLength: decimal("room_length", { precision: 10, scale: 2 }),
  roomWidth: decimal("room_width", { precision: 10, scale: 2 }),
  roomHeight: decimal("room_height", { precision: 10, scale: 2 }),
  buildingStatus: text("building_status"),
  constructionPhase: text("construction_phase"),
  doorsCount: integer("doors_count"),
  windowsCount: integer("windows_count"),
  doorDetails: jsonb("door_details"),
  windowDetails: jsonb("window_details"),
  electricalOutlets: jsonb("electrical_outlets"),
  drainagePoints: jsonb("drainage_points"),
  obstacles: text("obstacles"),
  walls: jsonb("walls"),
  spaces: jsonb("spaces"),
  selectedProducts: jsonb("selected_products"),
  notes: text("notes"),
  photos: text("photos").array(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSiteSurveySchema = createInsertSchema(siteSurveys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSiteSurvey = z.infer<typeof insertSiteSurveySchema>;
export type SiteSurvey = typeof siteSurveys.$inferSelect;

// ─── Task #5: Payment schedules on contracts ─────────────────────────────────
export const quoteProductCategories = pgTable("quote_product_categories", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertQuoteProductCategorySchema = createInsertSchema(quoteProductCategories).omit({
  id: true,
});
export type InsertQuoteProductCategory = z.infer<typeof insertQuoteProductCategorySchema>;
export type QuoteProductCategory = typeof quoteProductCategories.$inferSelect;

export const resetRequestStatusEnum = pgEnum("reset_request_status", ["pending", "resolved"]);

export const passwordResetRequests = pgTable("password_reset_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  status: resetRequestStatusEnum("status").notNull().default("pending"),
  note: text("note"),
  resolvedBy: integer("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  requestedAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPasswordResetRequestSchema = createInsertSchema(passwordResetRequests).omit({
  id: true,
  requestedAt: true,
});
export type InsertPasswordResetRequest = z.infer<typeof insertPasswordResetRequestSchema>;

// ─── Task #35: Daily Marketing Performance Tracking ──────────────────────────
export const dailySalesLogs = pgTable("daily_sales_logs", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  salesRepId: integer("sales_rep_id").references(() => users.id).notNull(),
  callsCount: integer("calls_count").notNull().default(0),
  whatsappCount: integer("whatsapp_count").notNull().default(0),
  showroomVisits: integer("showroom_visits").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDailySalesLogSchema = createInsertSchema(dailySalesLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertDailySalesLog = z.infer<typeof insertDailySalesLogSchema>;
export type DailySalesLog = typeof dailySalesLogs.$inferSelect;

export const surveyDesignFiles = pgTable("survey_design_files", {
  id: serial("id").primaryKey(),
  surveyId: integer("survey_id"),
  quotationId: integer("quotation_id").references(() => quotations.id),
  fileName: text("file_name").notNull(),
  fileLabel: text("file_label"),
  fileData: text("file_data"),
  fileUrl: text("file_url"),
  mimeType: text("mime_type").notNull().default("application/pdf"),
  fileSize: integer("file_size").notNull().default(0),
  attachToQuote: boolean("attach_to_quote").notNull().default(false),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSurveyDesignFileSchema = createInsertSchema(surveyDesignFiles).omit({
  id: true,
  createdAt: true,
});
export type InsertSurveyDesignFile = z.infer<typeof insertSurveyDesignFileSchema>;
export type SurveyDesignFile = typeof surveyDesignFiles.$inferSelect;
export type PasswordResetRequest = typeof passwordResetRequests.$inferSelect;

// ─── Task #40: Marketing Map System ──────────────────────────────────────────
export const buildingVisitStatusEnum = pgEnum("building_visit_status", [
  "interested",
  "under_construction",
  "not_suitable",
  "follow_up",
]);

export const buildingVisits = pgTable("building_visits", {
  id: serial("id").primaryKey(),
  repId: integer("rep_id").references(() => users.id).notNull(),
  lat: decimal("lat", { precision: 10, scale: 7 }).notNull(),
  lng: decimal("lng", { precision: 10, scale: 7 }).notNull(),
  address: text("address"),
  city: text("city"),
  district: text("district"),
  buildingStatus: buildingVisitStatusEnum("building_status").notNull().default("follow_up"),
  notes: text("notes"),
  quotationId: integer("quotation_id").references(() => quotations.id),
  visitedAt: timestamp("visited_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBuildingVisitSchema = createInsertSchema(buildingVisits).omit({
  id: true,
  createdAt: true,
});
export type InsertBuildingVisit = z.infer<typeof insertBuildingVisitSchema>;
export type BuildingVisit = typeof buildingVisits.$inferSelect;

export const marketingZones = pgTable("marketing_zones", {
  id: serial("id").primaryKey(),
  repId: integer("rep_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  polygon: jsonb("polygon").notNull().$default(() => []),
  targetCount: integer("target_count").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMarketingZoneSchema = createInsertSchema(marketingZones).omit({
  id: true,
  createdAt: true,
});
export type InsertMarketingZone = z.infer<typeof insertMarketingZoneSchema>;
export type MarketingZone = typeof marketingZones.$inferSelect;

export const osmBuildingsCache = pgTable("osm_buildings_cache", {
  id: serial("id").primaryKey(),
  bbox: text("bbox").notNull().unique(),
  buildings: jsonb("buildings").notNull().$default(() => []),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});
export type OsmBuildingsCache = typeof osmBuildingsCache.$inferSelect;

export const attendanceRecordTypeEnum = pgEnum("attendance_record_type", ["check_in", "check_out"]);
export const attendancePermissionTypeEnum = pgEnum("attendance_permission_type", ["leave", "permission", "sick", "official", "remote"]);
export const attendancePermissionStatusEnum = pgEnum("attendance_permission_status", ["pending", "auto_approved", "approved", "rejected", "clarification_requested"]);
export const locationZoneTypeEnum = pgEnum("location_zone_type", ["factory", "showroom", "other"]);

export const attendanceRecords = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id),
  employeePhone: text("employee_phone"),
  employeeNameAr: text("employee_name_ar"),
  type: attendanceRecordTypeEnum("type").notNull(),
  checkTime: timestamp("check_time").notNull().defaultNow(),
  locationName: text("location_name"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  isOutOfZone: boolean("is_out_of_zone").notNull().default(false),
  deviceInfo: jsonb("device_info").$default(() => ({})),
  deviceFingerprint: text("device_fingerprint"),
  notes: text("notes"),
  isManualEdit: boolean("is_manual_edit").notNull().default(false),
  editedBy: integer("edited_by").references(() => users.id),
  // التدخل الإداري (المرحلة 6): عذر معتمد بلا أثر مالي
  overrideExcuse: text("override_excuse"), // forgot_fingerprint | technical_issue | emergency_leave | medical_excuse
  overrideNote: text("override_note"),
  overrideBy: integer("override_by").references(() => users.id),
  overrideAt: timestamp("override_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAttendanceRecordSchema = createInsertSchema(attendanceRecords).omit({
  id: true,
  createdAt: true,
});
export type InsertAttendanceRecord = z.infer<typeof insertAttendanceRecordSchema>;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;

export const attendancePermissions = pgTable("attendance_permissions", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id),
  employeePhone: text("employee_phone"),
  date: date("date").notNull(),
  type: attendancePermissionTypeEnum("type").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  hoursRequested: decimal("hours_requested", { precision: 4, scale: 2 }),
  formDetails: jsonb("form_details").$type<{ returnDate?: string; [key: string]: unknown }>(),
  reason: text("reason"),
  status: attendancePermissionStatusEnum("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAttendancePermissionSchema = createInsertSchema(attendancePermissions, {
  formDetails: z.object({returnDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()}).catchall(z.unknown()).nullable().optional(),
}).omit({
  id: true,
  createdAt: true,
});

// مخالفات الحضور — محاولات مرفوضة (مثل خروج بلا دخول)
export const attendanceViolations = pgTable("attendance_violations", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id),
  employeePhone: text("employee_phone"),
  employeeNameAr: text("employee_name_ar"),
  violationType: text("violation_type").notNull(), // missing_checkin | missing_checkout
  attemptedType: text("attempted_type"), // check_in | check_out
  details: text("details"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
});

export const insertAttendanceViolationSchema = createInsertSchema(attendanceViolations).omit({
  id: true,
  occurredAt: true,
});
export type InsertAttendanceViolation = z.infer<typeof insertAttendanceViolationSchema>;
export type AttendanceViolation = typeof attendanceViolations.$inferSelect;

// إعدادات أوقات الدوام — افتراضي عام + تخصيص لكل قسم أو موظف
// Keep the worker checkpoint in the published schema, even when the dev worker is idle.
export const attendanceJobState = pgTable("attendance_job_state", {
  id: text("id").primaryKey(),
  lastDay: text("last_day").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workScheduleSettings = pgTable("work_schedule_settings", {
  id: serial("id").primaryKey(),
  scopeType: text("scope_type").notNull(), // default | department | employee
  department: text("department"), // when scopeType = department
  employeeId: integer("employee_id").references(() => employees.id), // when scopeType = employee
  workStartTime: text("work_start_time").notNull().default("08:00"), // HH:mm (Asia/Riyadh)
  graceMinutes: integer("grace_minutes").notNull().default(15),
  workEndTime: text("work_end_time"),
  shifts: jsonb("shifts").$type<import("./attendance").AttendanceShift[]>(),
  locationZoneId: integer("location_zone_id"),
  labelAr: text("label_ar"),
});

export const insertWorkScheduleSettingSchema = createInsertSchema(workScheduleSettings).omit({
  id: true,
}).extend({shifts:z.array(z.object({
  id:z.string(),label:z.string(),start:z.string(),end:z.string(),graceMinutes:z.number(),
})).nullable().optional()});
export type InsertWorkScheduleSetting = z.infer<typeof insertWorkScheduleSettingSchema>;
export type WorkScheduleSetting = typeof workScheduleSettings.$inferSelect;

// تنبيهات مؤشر الخطر — منع تكرار التنبيه لنفس الموظف/الشهر/المستوى
export const riskAlerts = pgTable("risk_alerts", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  period: text("period").notNull(), // YYYY-MM
  level: text("level").notNull(), // orange | red
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRiskAlertSchema = createInsertSchema(riskAlerts).omit({
  id: true,
  createdAt: true,
});
export type InsertRiskAlert = z.infer<typeof insertRiskAlertSchema>;
export type RiskAlert = typeof riskAlerts.$inferSelect;

// سجل تدقيق الحضور — Audit Trail لأي تعديل/تدخل إداري
export const attendanceAuditLog = pgTable("attendance_audit_log", {
  id: serial("id").primaryKey(),
  recordId: integer("record_id").references(() => attendanceRecords.id),
  employeeId: integer("employee_id").references(() => employees.id),
  action: text("action").notNull(), // manual_edit | admin_override
  excuseType: text("excuse_type"), // forgot_fingerprint | technical_issue | emergency_leave | medical_excuse
  oldValue: jsonb("old_value").$default(() => ({})),
  newValue: jsonb("new_value").$default(() => ({})),
  reason: text("reason"),
  editedBy: integer("edited_by").references(() => users.id),
  editedAt: timestamp("edited_at").notNull().defaultNow(),
});

export const insertAttendanceAuditLogSchema = createInsertSchema(attendanceAuditLog).omit({
  id: true,
  editedAt: true,
});
export type InsertAttendanceAuditLog = z.infer<typeof insertAttendanceAuditLogSchema>;
export type AttendanceAuditLog = typeof attendanceAuditLog.$inferSelect;
export type InsertAttendancePermission = z.infer<typeof insertAttendancePermissionSchema>;
export type AttendancePermission = typeof attendancePermissions.$inferSelect;

export const locationZones = pgTable("location_zones", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  type: locationZoneTypeEnum("type").notNull(),
  centerLat: decimal("center_lat", { precision: 10, scale: 7 }),
  centerLng: decimal("center_lng", { precision: 10, scale: 7 }),
  radiusMeters: integer("radius_meters").default(200),
  polygonCoords: jsonb("polygon_coords").$default(() => []),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLocationZoneSchema = createInsertSchema(locationZones).omit({
  id: true,
  createdAt: true,
});
export type InsertLocationZone = z.infer<typeof insertLocationZoneSchema>;
export type LocationZone = typeof locationZones.$inferSelect;

// ── ACCOUNTING MODULE ────────────────────────────────────────────────────────

export const fiscalYearStatusEnum = pgEnum("fiscal_year_status", ["active", "closed"]);
export const calendarTypeEnum = pgEnum("calendar_type", ["gregorian", "hijri"]);

export const fiscalYears = pgTable("fiscal_years", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  calendarType: calendarTypeEnum("calendar_type").notNull().default("gregorian"),
  status: fiscalYearStatusEnum("status").notNull().default("active"),
  closingEntryId: integer("closing_entry_id"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFiscalYearSchema = createInsertSchema(fiscalYears).omit({
  id: true,
  createdAt: true,
});
export type InsertFiscalYear = z.infer<typeof insertFiscalYearSchema>;
export type FiscalYear = typeof fiscalYears.$inferSelect;

export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "cost",
  "expense",
]);

export const chartOfAccounts = pgTable("chart_of_accounts", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  type: accountTypeEnum("type").notNull(),
  parentCode: text("parent_code"),
  isActive: boolean("is_active").notNull().default(true),
  isSystem: boolean("is_system").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertChartOfAccountSchema = createInsertSchema(chartOfAccounts).omit({
  id: true,
  createdAt: true,
});
export type InsertChartOfAccount = z.infer<typeof insertChartOfAccountSchema>;
export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;

export const journalEntryStatusEnum = pgEnum("journal_entry_status", [
  "draft",
  "posted",
  "reversed",
]);

export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  entryNumber: serial("entry_number"),
  date: date("date").notNull(),
  description: text("description").notNull(),
  reference: text("reference"),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  status: journalEntryStatusEnum("status").notNull().default("posted"),
  totalDebit: decimal("total_debit", { precision: 15, scale: 2 }).notNull().default("0"),
  totalCredit: decimal("total_credit", { precision: 15, scale: 2 }).notNull().default("0"),
  attachmentUrl: text("attachment_url"),
  attachments: jsonb("attachments").$type<{ url: string; name: string }[]>(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({
  id: true,
  entryNumber: true,
  createdAt: true,
});
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;

export const journalEntryLines = pgTable("journal_entry_lines", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").references(() => journalEntries.id).notNull(),
  accountCode: text("account_code").notNull(),
  accountNameAr: text("account_name_ar").notNull(),
  debit: decimal("debit", { precision: 15, scale: 2 }).notNull().default("0"),
  credit: decimal("credit", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  // دفتر مساعد: ربط سطر القيد بطرف محدد (عميل/مورد) لاستخراج كشف حساب لكل طرف
  partyType: text("party_type"), // "customer" | "supplier"
  partyId: integer("party_id"),
});

export const insertJournalEntryLineSchema = createInsertSchema(journalEntryLines).omit({
  id: true,
});
export type InsertJournalEntryLine = z.infer<typeof insertJournalEntryLineSchema>;
export type JournalEntryLine = typeof journalEntryLines.$inferSelect;

// ===== HR Actions (ملف الموظف — مسارات WF-01..WF-10) =====
export const hrActions = pgTable("hr_actions", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id),
  workflow: text("workflow").notNull(),
  tab: text("tab").notNull(),
  status: text("status").notNull().default("pending"),
  currentStep: integer("current_step").notNull().default(0),
  formData: jsonb("form_data").$default(() => ({})),
  timeline: jsonb("timeline").$default(() => []),
  linkedActionId: integer("linked_action_id"),
  createdBy: integer("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertHrActionSchema = createInsertSchema(hrActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertHrAction = z.infer<typeof insertHrActionSchema>;
export type HrAction = typeof hrActions.$inferSelect;
