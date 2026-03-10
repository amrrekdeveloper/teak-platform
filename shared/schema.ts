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
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

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

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  employeeNumber: text("employee_number").notNull().unique(),
  nationality: nationalityEnum("nationality").notNull(),
  position: text("position").notNull(),
  department: departmentEnum("department").notNull(),
  monthlySalary: decimal("monthly_salary", { precision: 10, scale: 2 }).notNull(),
  iqamaNumber: text("iqama_number"),
  iqamaExpiry: date("iqama_expiry"),
  contractStart: date("contract_start").notNull(),
  contractEnd: date("contract_end"),
  status: employeeStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true,
});
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

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
  "draft",
  "sent",
  "approved",
  "rejected",
  "expired",
]);

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
  designFile: text("design_file"),
  validUntil: date("valid_until"),
  notes: text("notes"),
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

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => contracts.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  invoiceId: integer("invoice_id"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentStage: paymentStageEnum("payment_stage").notNull(),
  method: paymentMethodEnum("method").notNull(),
  bankReference: text("bank_reference"),
  receiptNumber: text("receipt_number"),
  attachmentUrl: text("attachment_url"),
  notes: text("notes"),
  recordedBy: integer("recorded_by").references(() => users.id),
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
  contractId: integer("contract_id").references(() => contracts.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  designFile: text("design_file"),
  specifications: jsonb("specifications"),
  priority: priorityEnum("priority").notNull().default("normal"),
  status: workOrderStatusEnum("status").notNull().default("pending"),
  assignedTo: integer("assigned_to").references(() => users.id),
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
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSupplierSchema = createInsertSchema(suppliers).omit({
  id: true,
  createdAt: true,
});
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliers.$inferSelect;

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
