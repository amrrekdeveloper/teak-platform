import { eq, desc, like, and, sql, gte, lte, or, asc, isNull, isNotNull, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  users, type User, type InsertUser,
  userPermissions, type UserPermission,
  customers, type Customer, type InsertCustomer,
  products, type Product, type InsertProduct,
  woodTypes, type WoodType, type InsertWoodType,
  doorTypes, type DoorType, type InsertDoorType,
  quotations, type Quotation, type InsertQuotation,
  paymentSchedules, type PaymentSchedule, type InsertPaymentSchedule,
  contracts, type Contract, type InsertContract,
  payments, type Payment, type InsertPayment,
  invoices, type Invoice, type InsertInvoice,
  companySettings, type CompanySettings, type InsertCompanySettings,
  workOrders, type WorkOrder, type InsertWorkOrder,
  productionStages, type ProductionStage, type InsertProductionStage,
  inventory, type InventoryItem, type InsertInventory,
  inventoryTransactions, type InventoryTransaction, type InsertInventoryTransaction,
  suppliers, type Supplier, type InsertSupplier,
  warehouses, type Warehouse, type InsertWarehouse,
  purchaseOrders, type PurchaseOrder, type InsertPurchaseOrder,
  deliveries, type Delivery, type InsertDelivery,
  installations, type Installation, type InsertInstallation,
  maintenanceRequests, type MaintenanceRequest, type InsertMaintenanceRequest,
  qualityChecks, type QualityCheck, type InsertQualityCheck,
  notifications, type Notification, type InsertNotification,
  activityLog, type ActivityLog, type InsertActivityLog,
  employees, type Employee, type InsertEmployee,
  jobTitles, type JobTitle, type InsertJobTitle,
  hrAuditLog, type HrAuditLog, type InsertHrAuditLog,
  employeeAssets, type EmployeeAsset, type InsertEmployeeAsset,
  payrollRecords, type PayrollRecord, type InsertPayrollRecord,
  employeeAdvances, type EmployeeAdvance, type InsertEmployeeAdvance,
  leaveRequests, type LeaveRequest, type InsertLeaveRequest,
  performanceEvaluations, type PerformanceEvaluation, type InsertPerformanceEvaluation,
  hrActions, type HrAction, type InsertHrAction,
  designAssignments, type DesignAssignment, type InsertDesignAssignment,
  warranties, type Warranty, type InsertWarranty,
  adekoProducts, type AdekoProduct, type InsertAdekoProduct,
  quoteProductCategories, type QuoteProductCategory, type InsertQuoteProductCategory,
  appointments, type Appointment, type InsertAppointment,
  siteSurveys, type SiteSurvey, type InsertSiteSurvey,
  passwordResetRequests, type PasswordResetRequest, type InsertPasswordResetRequest,
  dailySalesLogs, type DailySalesLog, type InsertDailySalesLog,
  attendanceRecords, type AttendanceRecord, type InsertAttendanceRecord,
  attendancePermissions, type AttendancePermission, type InsertAttendancePermission,
  attendanceViolations, type AttendanceViolation, type InsertAttendanceViolation,
  attendanceAuditLog, type AttendanceAuditLog, type InsertAttendanceAuditLog,
  workScheduleSettings, type WorkScheduleSetting, type InsertWorkScheduleSetting,
  locationZones, type LocationZone, type InsertLocationZone,
  chartOfAccounts, type ChartOfAccount, type InsertChartOfAccount,
  journalEntries, type JournalEntry, type InsertJournalEntry,
  journalEntryLines, type JournalEntryLine, type InsertJournalEntryLine,
  fiscalYears, type FiscalYear, type InsertFiscalYear,
} from "@shared/schema";
import { toLatinDigits, parseNum } from "@shared/digits";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  getUserPermissions(userId: number): Promise<UserPermission[]>;
  setUserPermission(userId: number, permissionKey: string, effect: "grant" | "revoke"): Promise<void>;
  deleteUserPermission(userId: number, permissionKey: string): Promise<void>;

  getCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined>;

  getProducts(category?: string): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined>;

  getWoodTypes(): Promise<WoodType[]>;
  createWoodType(wt: InsertWoodType): Promise<WoodType>;
  updateWoodType(id: number, data: Partial<InsertWoodType>): Promise<WoodType | undefined>;

  getDoorTypes(): Promise<DoorType[]>;
  createDoorType(dt: InsertDoorType): Promise<DoorType>;
  updateDoorType(id: number, data: Partial<InsertDoorType>): Promise<DoorType | undefined>;

  getQuotations(): Promise<Quotation[]>;
  getQuotation(id: number): Promise<Quotation | undefined>;
  getQuotationsByCustomer(customerId: number): Promise<Quotation[]>;
  createQuotation(quotation: InsertQuotation): Promise<Quotation>;
  updateQuotation(id: number, data: Partial<InsertQuotation>): Promise<Quotation | undefined>;
  claimQuotation(id: number, userId: number): Promise<Quotation | undefined>;

  getContracts(): Promise<Contract[]>;
  getContract(id: number): Promise<Contract | undefined>;
  getContractsByCustomer(customerId: number): Promise<Contract[]>;
  createContract(contract: InsertContract): Promise<Contract>;
  updateContract(id: number, data: Partial<InsertContract>): Promise<Contract | undefined>;

  getPayments(): Promise<Payment[]>;
  getPayment(id: number): Promise<Payment | undefined>;
  getPaymentsByContract(contractId: number): Promise<Payment[]>;
  getPaymentsByCustomer(customerId: number): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: number, data: Partial<InsertPayment>): Promise<Payment | undefined>;

  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoicesByCustomer(customerId: number): Promise<Invoice[]>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;

  getCompanySettings(): Promise<CompanySettings | undefined>;
  upsertCompanySettings(settings: InsertCompanySettings): Promise<CompanySettings>;

  getWorkOrders(): Promise<WorkOrder[]>;
  getWorkOrder(id: number): Promise<WorkOrder | undefined>;
  createWorkOrder(wo: InsertWorkOrder): Promise<WorkOrder>;
  updateWorkOrder(id: number, data: Partial<InsertWorkOrder>): Promise<WorkOrder | undefined>;

  getProductionStages(workOrderId: number): Promise<ProductionStage[]>;
  createProductionStage(stage: InsertProductionStage): Promise<ProductionStage>;
  updateProductionStage(id: number, data: Partial<InsertProductionStage>): Promise<ProductionStage | undefined>;

  getInventory(): Promise<InventoryItem[]>;
  getInventoryItem(id: number): Promise<InventoryItem | undefined>;
  createInventoryItem(item: InsertInventory): Promise<InventoryItem>;
  updateInventoryItem(id: number, data: Partial<InsertInventory>): Promise<InventoryItem | undefined>;
  deleteInventoryItem(id: number): Promise<void>;
  deleteUser(id: number): Promise<void>;

  createInventoryTransaction(tx: InsertInventoryTransaction): Promise<InventoryTransaction>;

  getSuppliers(): Promise<Supplier[]>;
  getSupplier(id: number): Promise<Supplier | undefined>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<Supplier | undefined>;

  getWarehouses(): Promise<Warehouse[]>;
  createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse>;
  updateWarehouse(id: number, data: Partial<InsertWarehouse>): Promise<Warehouse | undefined>;

  getInventoryTransactions(inventoryId?: number): Promise<InventoryTransaction[]>;

  getPurchaseOrders(): Promise<PurchaseOrder[]>;
  getPurchaseOrder(id: number): Promise<PurchaseOrder | undefined>;
  createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: number, data: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined>;

  getDeliveries(): Promise<Delivery[]>;
  getDelivery(id: number): Promise<Delivery | undefined>;
  createDelivery(delivery: InsertDelivery): Promise<Delivery>;
  updateDelivery(id: number, data: Partial<InsertDelivery>): Promise<Delivery | undefined>;

  getInstallations(): Promise<Installation[]>;
  createInstallation(installation: InsertInstallation): Promise<Installation>;
  updateInstallation(id: number, data: Partial<InsertInstallation>): Promise<Installation | undefined>;

  getMaintenanceRequests(): Promise<MaintenanceRequest[]>;
  createMaintenanceRequest(req: InsertMaintenanceRequest): Promise<MaintenanceRequest>;
  updateMaintenanceRequest(id: number, data: Partial<InsertMaintenanceRequest>): Promise<MaintenanceRequest | undefined>;

  getQualityChecks(): Promise<QualityCheck[]>;
  createQualityCheck(qc: InsertQualityCheck): Promise<QualityCheck>;

  getNotifications(userId: number): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number): Promise<void>;

  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogs(limit?: number): Promise<ActivityLog[]>;

  getEmployees(): Promise<Employee[]>;
  getEmployee(id: number): Promise<Employee | undefined>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, data: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: number): Promise<void>;

  getJobTitles(): Promise<JobTitle[]>;
  createJobTitle(jt: InsertJobTitle): Promise<JobTitle>;
  updateJobTitle(id: number, data: Partial<InsertJobTitle>): Promise<JobTitle | undefined>;
  deleteJobTitle(id: number): Promise<void>;

  getHrAuditLogs(employeeId?: number): Promise<HrAuditLog[]>;
  createHrAuditLog(log: InsertHrAuditLog): Promise<HrAuditLog>;

  getEmployeeAssets(employeeId: number): Promise<EmployeeAsset[]>;
  createEmployeeAsset(asset: InsertEmployeeAsset): Promise<EmployeeAsset>;
  updateEmployeeAsset(id: number, data: Partial<InsertEmployeeAsset>): Promise<EmployeeAsset | undefined>;
  getPayrollRecords(period?: string): Promise<PayrollRecord[]>;
  getPayrollRecord(id: number): Promise<PayrollRecord | undefined>;
  getPayrollRecordByEmployeePeriod(employeeId: number, period: string): Promise<PayrollRecord | undefined>;
  createPayrollRecord(record: InsertPayrollRecord): Promise<PayrollRecord>;
  updatePayrollRecord(id: number, data: Partial<InsertPayrollRecord>): Promise<PayrollRecord | undefined>;

  // Employee Advances (السلف)
  getEmployeeAdvances(employeeId?: number): Promise<EmployeeAdvance[]>;
  getEmployeeAdvance(id: number): Promise<EmployeeAdvance | undefined>;
  getActiveAdvanceForEmployee(employeeId: number): Promise<EmployeeAdvance | undefined>;
  createEmployeeAdvance(data: InsertEmployeeAdvance): Promise<EmployeeAdvance>;
  updateEmployeeAdvance(id: number, data: Partial<InsertEmployeeAdvance>): Promise<EmployeeAdvance | undefined>;

  // Leave Requests (الإجازات)
  getLeaveRequests(employeeId?: number): Promise<LeaveRequest[]>;
  getLeaveRequest(id: number): Promise<LeaveRequest | undefined>;
  getApprovedAnnualLeaveDays(employeeId: number, year: string): Promise<number>;
  createLeaveRequest(data: InsertLeaveRequest): Promise<LeaveRequest>;
  updateLeaveRequest(id: number, data: Partial<InsertLeaveRequest>): Promise<LeaveRequest | undefined>;

  // HR Actions (مسارات ملف الموظف WF-01..WF-10)
  getHrActions(filters?: { employeeId?: number; workflow?: string; tab?: string; prehire?: boolean }): Promise<HrAction[]>;
  getHrAction(id: number): Promise<HrAction | undefined>;
  createHrAction(data: InsertHrAction): Promise<HrAction>;
  updateHrAction(id: number, data: Partial<InsertHrAction> & { updatedAt?: Date }): Promise<HrAction | undefined>;
  advanceHrAction(id: number, expectedStep: number, data: Partial<InsertHrAction>): Promise<HrAction | undefined>;
  getHrActionByLink(linkedActionId: number, workflow: string): Promise<HrAction | undefined>;
  getPerformanceEvaluations(employeeId?: number): Promise<PerformanceEvaluation[]>;
  getPerformanceEvaluation(id: number): Promise<PerformanceEvaluation | undefined>;
  createPerformanceEvaluation(data: InsertPerformanceEvaluation): Promise<PerformanceEvaluation>;
  updatePerformanceEvaluation(id: number, data: Partial<InsertPerformanceEvaluation>): Promise<PerformanceEvaluation | undefined>;

  getDesignAssignments(): Promise<DesignAssignment[]>;
  getDesignAssignmentsByDesigner(designerId: number): Promise<DesignAssignment[]>;
  getDesignAssignmentsByCustomer(customerId: number): Promise<DesignAssignment[]>;
  getDesignAssignment(id: number): Promise<DesignAssignment | undefined>;
  createDesignAssignment(da: InsertDesignAssignment): Promise<DesignAssignment>;
  updateDesignAssignment(id: number, data: Partial<InsertDesignAssignment>): Promise<DesignAssignment | undefined>;

  getWarranties(): Promise<Warranty[]>;
  getWarrantiesByCustomer(customerId: number): Promise<Warranty[]>;
  getWarranty(id: number): Promise<Warranty | undefined>;
  createWarranty(warranty: InsertWarranty): Promise<Warranty>;
  updateWarranty(id: number, data: Partial<InsertWarranty>): Promise<Warranty | undefined>;

  getCustomerByPhone(phone: string): Promise<Customer | undefined>;

  getAdekoProducts(search?: string, groupCode?: string): Promise<AdekoProduct[]>;
  getAdekoProduct(id: number): Promise<AdekoProduct | undefined>;
  createAdekoProduct(product: InsertAdekoProduct): Promise<AdekoProduct>;
  updateAdekoProduct(id: number, data: Partial<InsertAdekoProduct>): Promise<AdekoProduct | undefined>;
  getAdekoProductGroups(): Promise<{ groupCode: string; groupNameAr: string; groupNameEn: string; count: number }[]>;

  getQuoteProductCategories(): Promise<QuoteProductCategory[]>;
  createQuoteProductCategory(cat: InsertQuoteProductCategory): Promise<QuoteProductCategory>;
  updateQuoteProductCategory(id: number, data: Partial<InsertQuoteProductCategory>): Promise<QuoteProductCategory | undefined>;
  deleteQuoteProductCategory(id: number): Promise<boolean>;

  // Appointments (Task #3)
  getAppointments(filters?: { userId?: number }): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
  createAppointment(appt: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, data: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  getAppointmentsByDate(date: string, userId?: number): Promise<Appointment[]>;

  // Site Surveys (Task #3)
  getSiteSurveys(filters?: { quotationId?: number }): Promise<SiteSurvey[]>;
  getSiteSurvey(id: number): Promise<SiteSurvey | undefined>;
  getSiteSurveyByAppointment(appointmentId: number): Promise<SiteSurvey | undefined>;
  createSiteSurvey(survey: InsertSiteSurvey): Promise<SiteSurvey>;
  updateSiteSurvey(id: number, data: Partial<InsertSiteSurvey>): Promise<SiteSurvey | undefined>;

  // Password Reset Requests (Task #8)
  getPasswordResetRequests(status?: string): Promise<PasswordResetRequest[]>;
  createPasswordResetRequest(req: InsertPasswordResetRequest): Promise<PasswordResetRequest>;
  resolvePasswordResetRequest(id: number, resolvedBy: number): Promise<PasswordResetRequest | undefined>;

  // Payment Schedules (Task #30)
  getPaymentSchedulesByQuotation(quotationId: number): Promise<PaymentSchedule[]>;
  getPaymentSchedulesByContract(contractId: number): Promise<PaymentSchedule[]>;
  createPaymentSchedule(ps: InsertPaymentSchedule): Promise<PaymentSchedule>;
  updatePaymentSchedule(id: number, data: Partial<InsertPaymentSchedule>): Promise<PaymentSchedule | undefined>;
  getPaymentSchedulesByCustomer(customerId: number): Promise<PaymentSchedule[]>;

  // Daily Sales Logs (Task #35)
  getDailySalesLog(date: string, salesRepId: number): Promise<DailySalesLog | undefined>;
  getDailySalesLogs(filters?: { salesRepId?: number; startDate?: string; endDate?: string }): Promise<DailySalesLog[]>;
  upsertDailySalesLog(data: InsertDailySalesLog): Promise<DailySalesLog>;

  // Attendance System (Task #61)
  createAttendanceRecord(data: InsertAttendanceRecord): Promise<AttendanceRecord>;
  getAttendanceRecords(filters?: { employeeId?: number; employeePhone?: string; from?: string; to?: string; locationName?: string }): Promise<AttendanceRecord[]>;
  getAttendanceRecord(id: number): Promise<AttendanceRecord | undefined>;
  updateAttendanceRecord(id: number, data: Partial<InsertAttendanceRecord>): Promise<AttendanceRecord | undefined>;
  getLastAttendanceRecord(employeeId?: number, employeePhone?: string): Promise<AttendanceRecord | undefined>;
  createAttendancePermission(data: InsertAttendancePermission): Promise<AttendancePermission>;
  getAttendancePermissions(filters?: { employeeId?: number; employeePhone?: string; date?: string }): Promise<AttendancePermission[]>;
  updateAttendancePermission(id: number, data: Partial<InsertAttendancePermission>): Promise<AttendancePermission | undefined>;
  createAttendanceViolation(data: InsertAttendanceViolation): Promise<AttendanceViolation>;
  getAttendanceViolations(filters?: { employeeId?: number; from?: string; to?: string }): Promise<AttendanceViolation[]>;
  getWorkScheduleSettings(): Promise<WorkScheduleSetting[]>;
  createRiskAlertIfNew(employeeId: number, period: string, level: string): Promise<boolean>;
  getAttendanceRecord(id: number): Promise<AttendanceRecord | undefined>;
  createAttendanceAuditLog(data: InsertAttendanceAuditLog): Promise<AttendanceAuditLog>;
  getAttendanceAuditLogs(filters?: { recordId?: number; from?: string; to?: string }): Promise<AttendanceAuditLog[]>;
  createWorkScheduleSetting(data: InsertWorkScheduleSetting): Promise<WorkScheduleSetting>;
  updateWorkScheduleSetting(id: number, data: Partial<InsertWorkScheduleSetting>): Promise<WorkScheduleSetting | undefined>;
  deleteWorkScheduleSetting(id: number): Promise<void>;
  getLocationZones(): Promise<LocationZone[]>;
  createLocationZone(data: InsertLocationZone): Promise<LocationZone>;
  updateLocationZone(id: number, data: Partial<InsertLocationZone>): Promise<LocationZone | undefined>;
  deleteLocationZone(id: number): Promise<void>;

  getChartOfAccounts(): Promise<ChartOfAccount[]>;
  getChartOfAccount(id: number): Promise<ChartOfAccount | undefined>;
  getChartOfAccountByCode(code: string): Promise<ChartOfAccount | undefined>;
  createChartOfAccount(data: InsertChartOfAccount): Promise<ChartOfAccount>;
  updateChartOfAccount(id: number, data: Partial<InsertChartOfAccount>): Promise<ChartOfAccount | undefined>;
  deleteChartOfAccount(id: number): Promise<void>;
  seedChartOfAccounts(): Promise<void>;

  getJournalEntries(from?: string, to?: string, typeFilter?: string): Promise<JournalEntry[]>;
  getJournalEntry(id: number): Promise<JournalEntry | undefined>;
  findJournalEntryByReference(referenceType: string, referenceId: number): Promise<JournalEntry | undefined>;
  createJournalEntry(entry: InsertJournalEntry, lines: InsertJournalEntryLine[]): Promise<JournalEntry>;
  updateJournalEntry(id: number, data: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined>;
  updateJournalEntryWithLines(id: number, data: Partial<InsertJournalEntry>, lines: InsertJournalEntryLine[]): Promise<JournalEntry | undefined>;
  deleteJournalEntry(id: number): Promise<void>;
  getJournalEntryLines(entryId: number): Promise<JournalEntryLine[]>;
  getJournalEntryLinesForAccount(accountCode: string, from?: string, to?: string): Promise<(JournalEntryLine & { entryDate: string; entryDescription: string; entryNumber: number })[]>;

  getFiscalYears(): Promise<FiscalYear[]>;
  getFiscalYear(id: number): Promise<FiscalYear | undefined>;
  createFiscalYear(data: InsertFiscalYear): Promise<FiscalYear>;
  updateFiscalYear(id: number, data: Partial<InsertFiscalYear>): Promise<FiscalYear | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const clean = phone.replace(/[\s\-().]/g, "");
    const normalized = clean.replace(/^(\+966|00966|966)/, "0");
    const allUsers = await db.select().from(users);
    return allUsers.find(u => {
      if (!u.phone) return false;
      const uNorm = u.phone.replace(/[\s\-().]/g, "").replace(/^(\+966|00966|966)/, "0");
      return uNorm === normalized;
    });
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async getUserPermissions(userId: number): Promise<UserPermission[]> {
    return db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
  }

  async setUserPermission(userId: number, permissionKey: string, effect: "grant" | "revoke"): Promise<void> {
    await db
      .insert(userPermissions)
      .values({ userId, permissionKey, effect })
      .onConflictDoUpdate({
        target: [userPermissions.userId, userPermissions.permissionKey],
        set: { effect },
      });
  }

  async deleteUserPermission(userId: number, permissionKey: string): Promise<void> {
    await db
      .delete(userPermissions)
      .where(and(eq(userPermissions.userId, userId), eq(userPermissions.permissionKey, permissionKey)));
  }

  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers).orderBy(desc(customers.createdAt));
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [created] = await db.insert(customers).values(customer).returning();
    return created;
  }

  async updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [updated] = await db.update(customers).set(data).where(eq(customers.id, id)).returning();
    return updated;
  }

  async getProducts(category?: string): Promise<Product[]> {
    if (category) {
      return db.select().from(products).where(
        and(eq(products.category, category as any), eq(products.active, true))
      ).orderBy(products.sortOrder);
    }
    return db.select().from(products).where(eq(products.active, true)).orderBy(products.sortOrder);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db.update(products).set(data).where(eq(products.id, id)).returning();
    return updated;
  }

  async getWoodTypes(): Promise<WoodType[]> {
    return db.select().from(woodTypes).where(eq(woodTypes.active, true));
  }

  async createWoodType(wt: InsertWoodType): Promise<WoodType> {
    const [created] = await db.insert(woodTypes).values(wt).returning();
    return created;
  }

  async updateWoodType(id: number, data: Partial<InsertWoodType>): Promise<WoodType | undefined> {
    const [updated] = await db.update(woodTypes).set(data).where(eq(woodTypes.id, id)).returning();
    return updated;
  }

  async getDoorTypes(): Promise<DoorType[]> {
    return db.select().from(doorTypes).where(eq(doorTypes.active, true));
  }

  async createDoorType(dt: InsertDoorType): Promise<DoorType> {
    const [created] = await db.insert(doorTypes).values(dt).returning();
    return created;
  }

  async updateDoorType(id: number, data: Partial<InsertDoorType>): Promise<DoorType | undefined> {
    const [updated] = await db.update(doorTypes).set(data).where(eq(doorTypes.id, id)).returning();
    return updated;
  }

  async getQuotations(): Promise<Quotation[]> {
    return db.select().from(quotations).orderBy(desc(quotations.createdAt));
  }

  async getQuotation(id: number): Promise<Quotation | undefined> {
    const [quotation] = await db.select().from(quotations).where(eq(quotations.id, id));
    return quotation;
  }

  async getQuotationsByCustomer(customerId: number): Promise<Quotation[]> {
    return db.select().from(quotations).where(eq(quotations.customerId, customerId)).orderBy(desc(quotations.createdAt));
  }

  async createQuotation(quotation: InsertQuotation): Promise<Quotation> {
    const [created] = await db.insert(quotations).values(quotation).returning();
    return created;
  }

  async updateQuotation(id: number, data: Partial<InsertQuotation>): Promise<Quotation | undefined> {
    const [updated] = await db.update(quotations).set({ ...data, updatedAt: new Date() }).where(eq(quotations.id, id)).returning();
    return updated;
  }

  async claimQuotation(id: number, userId: number): Promise<Quotation | undefined> {
    const now = new Date();
    const [updated] = await db.update(quotations)
      .set({
        assignedTo: userId,
        assignedAt: now,
        claimedAt: now,
        status: "draft",
        orderStage: "quote_draft",
        updatedAt: now,
      })
      .where(
        and(
          eq(quotations.id, id),
          sql`${quotations.status} IN ('open', 'draft', 'requested')`,
          sql`${quotations.assignedTo} IS NULL`
        )
      )
      .returning();
    return updated;
  }

  async getContracts(): Promise<Contract[]> {
    return db.select().from(contracts).orderBy(desc(contracts.createdAt));
  }

  async getContract(id: number): Promise<Contract | undefined> {
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
    return contract;
  }

  async getContractsByCustomer(customerId: number): Promise<Contract[]> {
    return db.select().from(contracts).where(eq(contracts.customerId, customerId)).orderBy(desc(contracts.createdAt));
  }

  async createContract(contract: InsertContract): Promise<Contract> {
    const [created] = await db.insert(contracts).values(contract).returning();
    return created;
  }

  async updateContract(id: number, data: Partial<InsertContract>): Promise<Contract | undefined> {
    const [updated] = await db.update(contracts).set(data).where(eq(contracts.id, id)).returning();
    return updated;
  }

  async getPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  }

  async getPaymentsByContract(contractId: number): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.contractId, contractId)).orderBy(desc(payments.createdAt));
  }

  async getPaymentsByCustomer(customerId: number): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.customerId, customerId)).orderBy(desc(payments.createdAt));
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment;
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [created] = await db.insert(payments).values(payment).returning();
    return created;
  }

  async updatePayment(id: number, data: Partial<InsertPayment>): Promise<Payment | undefined> {
    const [updated] = await db.update(payments).set(data).where(eq(payments.id, id)).returning();
    return updated;
  }

  async getInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).orderBy(desc(invoices.id));
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getInvoicesByCustomer(customerId: number): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.customerId, customerId)).orderBy(desc(invoices.id));
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [updated] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
    return updated;
  }

  async getCompanySettings(): Promise<CompanySettings | undefined> {
    const [settings] = await db.select().from(companySettings).limit(1);
    return settings;
  }

  async upsertCompanySettings(settings: InsertCompanySettings): Promise<CompanySettings> {
    const existing = await this.getCompanySettings();
    if (existing) {
      const [updated] = await db.update(companySettings).set(settings).where(eq(companySettings.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(companySettings).values(settings).returning();
    return created;
  }

  async getWorkOrders(): Promise<WorkOrder[]> {
    return db.select().from(workOrders).orderBy(desc(workOrders.createdAt));
  }

  async getWorkOrder(id: number): Promise<WorkOrder | undefined> {
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id));
    return wo;
  }

  async createWorkOrder(wo: InsertWorkOrder): Promise<WorkOrder> {
    const [created] = await db.insert(workOrders).values(wo).returning();
    return created;
  }

  async updateWorkOrder(id: number, data: Partial<InsertWorkOrder>): Promise<WorkOrder | undefined> {
    const [updated] = await db.update(workOrders).set(data).where(eq(workOrders.id, id)).returning();
    return updated;
  }

  async getProductionStages(workOrderId: number): Promise<ProductionStage[]> {
    return db.select().from(productionStages).where(eq(productionStages.workOrderId, workOrderId));
  }

  async createProductionStage(stage: InsertProductionStage): Promise<ProductionStage> {
    const [created] = await db.insert(productionStages).values(stage).returning();
    return created;
  }

  async updateProductionStage(id: number, data: Partial<InsertProductionStage>): Promise<ProductionStage | undefined> {
    const [updated] = await db.update(productionStages).set(data).where(eq(productionStages.id, id)).returning();
    return updated;
  }

  async getInventory(): Promise<InventoryItem[]> {
    return db.select().from(inventory).orderBy(inventory.materialNameAr);
  }

  async getInventoryItem(id: number): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(inventory).where(eq(inventory.id, id));
    return item;
  }

  async createInventoryItem(item: InsertInventory): Promise<InventoryItem> {
    const [created] = await db.insert(inventory).values(item).returning();
    return created;
  }

  async updateInventoryItem(id: number, data: Partial<InsertInventory>): Promise<InventoryItem | undefined> {
    const [updated] = await db.update(inventory).set({ ...data, lastUpdated: new Date() }).where(eq(inventory.id, id)).returning();
    return updated;
  }

  async deleteInventoryItem(id: number): Promise<void> {
    await db.delete(inventoryTransactions).where(eq(inventoryTransactions.inventoryId, id));
    await db.delete(inventory).where(eq(inventory.id, id));
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async createInventoryTransaction(tx: InsertInventoryTransaction): Promise<InventoryTransaction> {
    const [created] = await db.insert(inventoryTransactions).values(tx).returning();
    return created;
  }

  async getSuppliers(): Promise<Supplier[]> {
    return db.select().from(suppliers).where(eq(suppliers.active, true));
  }

  async getSupplier(id: number): Promise<Supplier | undefined> {
    const [s] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return s;
  }

  async createSupplier(supplier: InsertSupplier): Promise<Supplier> {
    const [created] = await db.insert(suppliers).values(supplier).returning();
    return created;
  }

  async updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const [updated] = await db.update(suppliers).set(data).where(eq(suppliers.id, id)).returning();
    return updated;
  }

  async getWarehouses(): Promise<Warehouse[]> {
    return db.select().from(warehouses).orderBy(warehouses.id);
  }

  async createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse> {
    const [created] = await db.insert(warehouses).values(warehouse).returning();
    return created;
  }

  async updateWarehouse(id: number, data: Partial<InsertWarehouse>): Promise<Warehouse | undefined> {
    const [updated] = await db.update(warehouses).set(data).where(eq(warehouses.id, id)).returning();
    return updated;
  }

  async getInventoryTransactions(inventoryId?: number): Promise<InventoryTransaction[]> {
    if (inventoryId) {
      return db.select().from(inventoryTransactions).where(eq(inventoryTransactions.inventoryId, inventoryId)).orderBy(desc(inventoryTransactions.createdAt));
    }
    return db.select().from(inventoryTransactions).orderBy(desc(inventoryTransactions.createdAt));
  }

  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    return db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt));
  }

  async getPurchaseOrder(id: number): Promise<PurchaseOrder | undefined> {
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    return po;
  }

  async createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [created] = await db.insert(purchaseOrders).values(po).returning();
    return created;
  }

  async updatePurchaseOrder(id: number, data: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined> {
    const [updated] = await db.update(purchaseOrders).set(data).where(eq(purchaseOrders.id, id)).returning();
    return updated;
  }

  async getDeliveries(): Promise<Delivery[]> {
    return db.select().from(deliveries);
  }

  async getDelivery(id: number): Promise<Delivery | undefined> {
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, id));
    return delivery;
  }

  async createDelivery(delivery: InsertDelivery): Promise<Delivery> {
    const [created] = await db.insert(deliveries).values(delivery).returning();
    return created;
  }

  async updateDelivery(id: number, data: Partial<InsertDelivery>): Promise<Delivery | undefined> {
    const [updated] = await db.update(deliveries).set(data).where(eq(deliveries.id, id)).returning();
    return updated;
  }

  async getInstallations(): Promise<Installation[]> {
    return db.select().from(installations);
  }

  async createInstallation(installation: InsertInstallation): Promise<Installation> {
    const [created] = await db.insert(installations).values(installation).returning();
    return created;
  }

  async updateInstallation(id: number, data: Partial<InsertInstallation>): Promise<Installation | undefined> {
    const [updated] = await db.update(installations).set(data).where(eq(installations.id, id)).returning();
    return updated;
  }

  async getMaintenanceRequests(): Promise<MaintenanceRequest[]> {
    return db.select().from(maintenanceRequests).orderBy(desc(maintenanceRequests.createdAt));
  }

  async createMaintenanceRequest(req: InsertMaintenanceRequest): Promise<MaintenanceRequest> {
    const [created] = await db.insert(maintenanceRequests).values(req).returning();
    return created;
  }

  async updateMaintenanceRequest(id: number, data: Partial<InsertMaintenanceRequest>): Promise<MaintenanceRequest | undefined> {
    const [updated] = await db.update(maintenanceRequests).set(data).where(eq(maintenanceRequests.id, id)).returning();
    return updated;
  }

  async getQualityChecks(): Promise<QualityCheck[]> {
    return db.select().from(qualityChecks).orderBy(desc(qualityChecks.checkedAt));
  }

  async createQualityCheck(qc: InsertQualityCheck): Promise<QualityCheck> {
    const [created] = await db.insert(qualityChecks).values(qc).returning();
    return created;
  }

  async getNotifications(userId: number): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationRead(id: number): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [created] = await db.insert(activityLog).values(log).returning();
    return created;
  }

  async getActivityLogs(limit: number = 50): Promise<ActivityLog[]> {
    return db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(limit);
  }

  async getEmployees(): Promise<Employee[]> {
    return db.select().from(employees).orderBy(employees.employeeNumber);
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    const [employee] = await db.select().from(employees).where(eq(employees.id, id));
    return employee;
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const [created] = await db.insert(employees).values(employee).returning();
    return created;
  }

  async updateEmployee(id: number, data: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const [updated] = await db.update(employees).set(data).where(eq(employees.id, id)).returning();
    return updated;
  }

  async deleteEmployee(id: number): Promise<void> {
    await db.delete(employeeAssets).where(eq(employeeAssets.employeeId, id));
    await db.delete(hrAuditLog).where(eq(hrAuditLog.employeeId, id));
    await db.delete(employees).where(eq(employees.id, id));
  }

  async getJobTitles(): Promise<JobTitle[]> {
    return db.select().from(jobTitles).orderBy(jobTitles.nameAr);
  }

  async createJobTitle(jt: InsertJobTitle): Promise<JobTitle> {
    const [created] = await db.insert(jobTitles).values(jt).returning();
    return created;
  }

  async updateJobTitle(id: number, data: Partial<InsertJobTitle>): Promise<JobTitle | undefined> {
    const [updated] = await db.update(jobTitles).set(data).where(eq(jobTitles.id, id)).returning();
    return updated;
  }

  async deleteJobTitle(id: number): Promise<void> {
    await db.delete(jobTitles).where(eq(jobTitles.id, id));
  }

  async getHrAuditLogs(employeeId?: number): Promise<HrAuditLog[]> {
    if (employeeId !== undefined) {
      return db.select().from(hrAuditLog).where(eq(hrAuditLog.employeeId, employeeId)).orderBy(desc(hrAuditLog.createdAt));
    }
    return db.select().from(hrAuditLog).orderBy(desc(hrAuditLog.createdAt)).limit(200);
  }

  async createHrAuditLog(log: InsertHrAuditLog): Promise<HrAuditLog> {
    const [created] = await db.insert(hrAuditLog).values(log).returning();
    return created;
  }

  async getEmployeeAssets(employeeId: number): Promise<EmployeeAsset[]> {
    return db.select().from(employeeAssets).where(eq(employeeAssets.employeeId, employeeId)).orderBy(desc(employeeAssets.createdAt));
  }

  async createEmployeeAsset(asset: InsertEmployeeAsset): Promise<EmployeeAsset> {
    const [created] = await db.insert(employeeAssets).values(asset).returning();
    return created;
  }

  async updateEmployeeAsset(id: number, data: Partial<InsertEmployeeAsset>): Promise<EmployeeAsset | undefined> {
    const [updated] = await db.update(employeeAssets).set(data).where(eq(employeeAssets.id, id)).returning();
    return updated;
  }

  async getPayrollRecords(period?: string): Promise<PayrollRecord[]> {
    if (period) {
      return db.select().from(payrollRecords).where(eq(payrollRecords.period, period)).orderBy(desc(payrollRecords.createdAt));
    }
    return db.select().from(payrollRecords).orderBy(desc(payrollRecords.period), desc(payrollRecords.createdAt));
  }

  async getPayrollRecord(id: number): Promise<PayrollRecord | undefined> {
    const [record] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, id));
    return record;
  }

  async getPayrollRecordByEmployeePeriod(employeeId: number, period: string): Promise<PayrollRecord | undefined> {
    const [record] = await db.select().from(payrollRecords)
      .where(and(eq(payrollRecords.employeeId, employeeId), eq(payrollRecords.period, period)));
    return record;
  }

  async createPayrollRecord(record: InsertPayrollRecord): Promise<PayrollRecord> {
    const [created] = await db.insert(payrollRecords).values(record).onConflictDoNothing({
      target: [payrollRecords.employeeId, payrollRecords.period],
    }).returning();
    return created ?? (await this.getPayrollRecordByEmployeePeriod(record.employeeId, record.period))!;
  }

  async updatePayrollRecord(id: number, data: Partial<InsertPayrollRecord>): Promise<PayrollRecord | undefined> {
    return db.transaction(async tx => {
      const [row] = await tx.select().from(payrollRecords).where(eq(payrollRecords.id, id)).for("update");
      if (!row || row.status !== "draft") return undefined;
      const merged = { ...row, ...data };
      const netCents = Math.round(Number(merged.basicSalary) * 100) + Math.round(Number(merged.allowances) * 100)
        - Math.round(Number(merged.deductions) * 100) - Math.round(Number(row.advanceDeduction) * 100);
      if (!Number.isSafeInteger(netCents) || netCents < 0) throw new Error("Payroll deductions exceed salary");
      const [updated] = await tx.update(payrollRecords).set({
        basicSalary: merged.basicSalary, allowances: merged.allowances, deductions: merged.deductions,
        notes: merged.notes, netSalary: (netCents / 100).toFixed(2),
      }).where(eq(payrollRecords.id, id)).returning();
      return updated;
    });
  }

  // ===== Employee Advances (السلف) =====
  async getEmployeeAdvances(employeeId?: number): Promise<EmployeeAdvance[]> {
    if (employeeId) {
      return db.select().from(employeeAdvances).where(eq(employeeAdvances.employeeId, employeeId)).orderBy(desc(employeeAdvances.createdAt));
    }
    return db.select().from(employeeAdvances).orderBy(desc(employeeAdvances.createdAt));
  }

  async getEmployeeAdvance(id: number): Promise<EmployeeAdvance | undefined> {
    const [row] = await db.select().from(employeeAdvances).where(eq(employeeAdvances.id, id));
    return row;
  }

  async getActiveAdvanceForEmployee(employeeId: number): Promise<EmployeeAdvance | undefined> {
    const [row] = await db.select().from(employeeAdvances)
      .where(and(eq(employeeAdvances.employeeId, employeeId), eq(employeeAdvances.status, "approved")))
      .orderBy(employeeAdvances.createdAt);
    return row;
  }

  async createEmployeeAdvance(data: InsertEmployeeAdvance): Promise<EmployeeAdvance> {
    const [created] = await db.insert(employeeAdvances).values(data).returning();
    return created;
  }

  async updateEmployeeAdvance(id: number, data: Partial<InsertEmployeeAdvance>): Promise<EmployeeAdvance | undefined> {
    const [updated] = await db.update(employeeAdvances).set(data)
      .where(and(eq(employeeAdvances.id, id), eq(employeeAdvances.status, "pending"))).returning();
    return updated;
  }

  // ===== Leave Requests (الإجازات) =====
  async getLeaveRequests(employeeId?: number): Promise<LeaveRequest[]> {
    if (employeeId) {
      return db.select().from(leaveRequests).where(eq(leaveRequests.employeeId, employeeId)).orderBy(desc(leaveRequests.createdAt));
    }
    return db.select().from(leaveRequests).orderBy(desc(leaveRequests.createdAt));
  }

  async getLeaveRequest(id: number): Promise<LeaveRequest | undefined> {
    const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id));
    return row;
  }

  async getApprovedAnnualLeaveDays(employeeId: number, year: string): Promise<number> {
    const rows = await db.select().from(leaveRequests).where(and(
      eq(leaveRequests.employeeId, employeeId),
      eq(leaveRequests.leaveType, "annual"),
      eq(leaveRequests.status, "approved"),
    ));
    // Count only the portion of each leave that falls within the target year
    // so cross-year leaves (e.g. Dec→Jan) are attributed accurately per year.
    const yearStart = new Date(`${year}-01-01`);
    const yearEnd = new Date(`${year}-12-31`);
    const DAY = 1000 * 3600 * 24;
    return rows.reduce((sum, r) => {
      if (!r.startDate || !r.endDate) return sum;
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      const from = start > yearStart ? start : yearStart;
      const to = end < yearEnd ? end : yearEnd;
      if (to < from) return sum;
      const overlap = Math.floor((to.getTime() - from.getTime()) / DAY) + 1;
      return sum + overlap;
    }, 0);
  }

  async createLeaveRequest(data: InsertLeaveRequest): Promise<LeaveRequest> {
    const [created] = await db.insert(leaveRequests).values(data).returning();
    return created;
  }

  async updateLeaveRequest(id: number, data: Partial<InsertLeaveRequest>): Promise<LeaveRequest | undefined> {
    const [updated] = await db.update(leaveRequests).set(data).where(eq(leaveRequests.id, id)).returning();
    return updated;
  }

  // ===== Performance Evaluations (تقييم الأداء) =====
  async getHrActions(filters?: { employeeId?: number; workflow?: string; tab?: string; prehire?: boolean }): Promise<HrAction[]> {
    const conds = [];
    if (filters?.employeeId != null) conds.push(eq(hrActions.employeeId, filters.employeeId));
    if (filters?.workflow) conds.push(eq(hrActions.workflow, filters.workflow));
    if (filters?.tab) conds.push(eq(hrActions.tab, filters.tab));
    if (filters?.prehire) conds.push(isNull(hrActions.employeeId));
    if (conds.length > 0) {
      return db.select().from(hrActions).where(and(...conds)).orderBy(desc(hrActions.createdAt));
    }
    return db.select().from(hrActions).orderBy(desc(hrActions.createdAt));
  }

  async getHrAction(id: number): Promise<HrAction | undefined> {
    const [row] = await db.select().from(hrActions).where(eq(hrActions.id, id));
    return row;
  }

  async createHrAction(data: InsertHrAction): Promise<HrAction> {
    const [row] = await db.insert(hrActions).values(data).returning();
    return row;
  }

  async updateHrAction(id: number, data: Partial<InsertHrAction> & { updatedAt?: Date }): Promise<HrAction | undefined> {
    const [row] = await db.update(hrActions).set({ ...data, updatedAt: new Date() }).where(eq(hrActions.id, id)).returning();
    return row;
  }

  async advanceHrAction(id: number, expectedStep: number, data: Partial<InsertHrAction>): Promise<HrAction | undefined> {
    const [row] = await db.update(hrActions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(hrActions.id, id),
        eq(hrActions.currentStep, expectedStep),
        inArray(hrActions.status, ["pending", "in_progress"]),
      ))
      .returning();
    return row;
  }

  async getHrActionByLink(linkedActionId: number, workflow: string): Promise<HrAction | undefined> {
    const [row] = await db.select().from(hrActions)
      .where(and(eq(hrActions.linkedActionId, linkedActionId), eq(hrActions.workflow, workflow)));
    return row;
  }

  async getPerformanceEvaluations(employeeId?: number): Promise<PerformanceEvaluation[]> {
    if (employeeId) {
      return db.select().from(performanceEvaluations).where(eq(performanceEvaluations.employeeId, employeeId)).orderBy(desc(performanceEvaluations.createdAt));
    }
    return db.select().from(performanceEvaluations).orderBy(desc(performanceEvaluations.createdAt));
  }

  async getPerformanceEvaluation(id: number): Promise<PerformanceEvaluation | undefined> {
    const [row] = await db.select().from(performanceEvaluations).where(eq(performanceEvaluations.id, id));
    return row;
  }

  async createPerformanceEvaluation(data: InsertPerformanceEvaluation): Promise<PerformanceEvaluation> {
    const [created] = await db.insert(performanceEvaluations).values(data).returning();
    return created;
  }

  async updatePerformanceEvaluation(id: number, data: Partial<InsertPerformanceEvaluation>): Promise<PerformanceEvaluation | undefined> {
    const [updated] = await db.update(performanceEvaluations).set(data).where(eq(performanceEvaluations.id, id)).returning();
    return updated;
  }


  async getDesignAssignments(): Promise<DesignAssignment[]> {
    return db.select().from(designAssignments).orderBy(desc(designAssignments.createdAt));
  }

  async getDesignAssignmentsByDesigner(designerId: number): Promise<DesignAssignment[]> {
    return db.select().from(designAssignments).where(eq(designAssignments.assignedTo, designerId)).orderBy(desc(designAssignments.createdAt));
  }

  async getDesignAssignmentsByCustomer(customerId: number): Promise<DesignAssignment[]> {
    return db.select().from(designAssignments).where(eq(designAssignments.customerId, customerId)).orderBy(desc(designAssignments.createdAt));
  }

  async getDesignAssignment(id: number): Promise<DesignAssignment | undefined> {
    const [da] = await db.select().from(designAssignments).where(eq(designAssignments.id, id));
    return da;
  }

  async createDesignAssignment(da: InsertDesignAssignment): Promise<DesignAssignment> {
    const [created] = await db.insert(designAssignments).values(da).returning();
    return created;
  }

  async updateDesignAssignment(id: number, data: Partial<InsertDesignAssignment>): Promise<DesignAssignment | undefined> {
    const [updated] = await db.update(designAssignments).set({ ...data, updatedAt: new Date() }).where(eq(designAssignments.id, id)).returning();
    return updated;
  }

  async getWarranties(): Promise<Warranty[]> {
    return db.select().from(warranties).orderBy(desc(warranties.createdAt));
  }

  async getWarrantiesByCustomer(customerId: number): Promise<Warranty[]> {
    return db.select().from(warranties).where(eq(warranties.customerId, customerId)).orderBy(desc(warranties.createdAt));
  }

  async getWarranty(id: number): Promise<Warranty | undefined> {
    const [w] = await db.select().from(warranties).where(eq(warranties.id, id));
    return w;
  }

  async createWarranty(warranty: InsertWarranty): Promise<Warranty> {
    const [created] = await db.insert(warranties).values(warranty).returning();
    return created;
  }

  async updateWarranty(id: number, data: Partial<InsertWarranty>): Promise<Warranty | undefined> {
    const [updated] = await db.update(warranties).set(data).where(eq(warranties.id, id)).returning();
    return updated;
  }

  async getCustomerByPhone(phone: string): Promise<Customer | undefined> {
    const normalized = phone.replace(/^(\+966|00966|966)/, "0");
    const results = await db.select().from(customers);
    return results.find(c => c.phone.replace(/^(\+966|00966|966)/, "0") === normalized);
  }

  async getAdekoProducts(search?: string, groupCode?: string): Promise<AdekoProduct[]> {
    const conditions = [];
    if (groupCode) {
      conditions.push(eq(adekoProducts.groupCode, groupCode));
    }
    if (search) {
      conditions.push(
        sql`(${adekoProducts.code} ILIKE ${'%' + search + '%'} OR ${adekoProducts.descriptionEn} ILIKE ${'%' + search + '%'} OR ${adekoProducts.descriptionAr} ILIKE ${'%' + search + '%'} OR ${adekoProducts.groupNameAr} ILIKE ${'%' + search + '%'} OR ${adekoProducts.groupNameEn} ILIKE ${'%' + search + '%'})`
      );
    }
    if (conditions.length > 0) {
      return db.select().from(adekoProducts).where(and(...conditions)).orderBy(adekoProducts.groupCode, adekoProducts.code);
    }
    return db.select().from(adekoProducts).orderBy(adekoProducts.groupCode, adekoProducts.code);
  }

  async getAdekoProduct(id: number): Promise<AdekoProduct | undefined> {
    const [p] = await db.select().from(adekoProducts).where(eq(adekoProducts.id, id));
    return p;
  }

  async createAdekoProduct(product: InsertAdekoProduct): Promise<AdekoProduct> {
    const [created] = await db.insert(adekoProducts).values(product).returning();
    return created;
  }

  async updateAdekoProduct(id: number, data: Partial<InsertAdekoProduct>): Promise<AdekoProduct | undefined> {
    const [updated] = await db.update(adekoProducts).set(data).where(eq(adekoProducts.id, id)).returning();
    return updated;
  }

  async getAdekoProductGroups(): Promise<{ groupCode: string; groupNameAr: string; groupNameEn: string; count: number }[]> {
    const result = await db.select({
      groupCode: adekoProducts.groupCode,
      groupNameAr: adekoProducts.groupNameAr,
      groupNameEn: adekoProducts.groupNameEn,
      count: sql<number>`count(*)::int`,
    }).from(adekoProducts).groupBy(adekoProducts.groupCode, adekoProducts.groupNameAr, adekoProducts.groupNameEn).orderBy(adekoProducts.groupCode);
    return result;
  }

  async getQuoteProductCategories(): Promise<QuoteProductCategory[]> {
    return db.select().from(quoteProductCategories).orderBy(quoteProductCategories.sortOrder);
  }

  async createQuoteProductCategory(cat: InsertQuoteProductCategory): Promise<QuoteProductCategory> {
    const [created] = await db.insert(quoteProductCategories).values(cat).returning();
    return created;
  }

  async updateQuoteProductCategory(id: number, data: Partial<InsertQuoteProductCategory>): Promise<QuoteProductCategory | undefined> {
    const [updated] = await db.update(quoteProductCategories).set(data).where(eq(quoteProductCategories.id, id)).returning();
    return updated;
  }

  async deleteQuoteProductCategory(id: number): Promise<boolean> {
    const result = await db.delete(quoteProductCategories).where(eq(quoteProductCategories.id, id)).returning();
    return result.length > 0;
  }

  // ── Appointments (Task #3) ───────────────────────────────────────────────
  async getAppointments(filters?: { userId?: number }): Promise<Appointment[]> {
    const conditions = [];
    if (filters?.userId) conditions.push(eq(appointments.assignedTo, filters.userId));
    const query = conditions.length
      ? db.select().from(appointments).where(and(...conditions)).orderBy(desc(appointments.createdAt))
      : db.select().from(appointments).orderBy(desc(appointments.createdAt));
    return query;
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
    return appointment;
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const [created] = await db.insert(appointments).values(appointment).returning();
    return created;
  }

  async updateAppointment(id: number, data: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const [updated] = await db.update(appointments).set({ ...data, updatedAt: new Date() }).where(eq(appointments.id, id)).returning();
    return updated;
  }

  async getAppointmentsByDate(date: string, userId?: number): Promise<Appointment[]> {
    const conditions = [eq(appointments.appointmentDate, date)];
    if (userId) {
      conditions.push(eq(appointments.assignedTo, userId));
    }
    return db.select().from(appointments).where(and(...conditions)).orderBy(appointments.startTime);
  }

  // ── Site Surveys (Task #3) ───────────────────────────────────────────────
  async getSiteSurveys(filters?: { quotationId?: number }): Promise<SiteSurvey[]> {
    const conditions = [];
    if (filters?.quotationId) conditions.push(eq(siteSurveys.quotationId, filters.quotationId));
    return conditions.length
      ? db.select().from(siteSurveys).where(and(...conditions)).orderBy(desc(siteSurveys.createdAt))
      : db.select().from(siteSurveys).orderBy(desc(siteSurveys.createdAt));
  }

  async getSiteSurvey(id: number): Promise<SiteSurvey | undefined> {
    const [survey] = await db.select().from(siteSurveys).where(eq(siteSurveys.id, id));
    return survey;
  }

  async getSiteSurveyByAppointment(appointmentId: number): Promise<SiteSurvey | undefined> {
    const [survey] = await db.select().from(siteSurveys).where(eq(siteSurveys.appointmentId, appointmentId));
    return survey;
  }

  async createSiteSurvey(survey: InsertSiteSurvey): Promise<SiteSurvey> {
    const [created] = await db.insert(siteSurveys).values(survey).returning();
    return created;
  }

  async updateSiteSurvey(id: number, data: Partial<InsertSiteSurvey>): Promise<SiteSurvey | undefined> {
    const [updated] = await db.update(siteSurveys).set({ ...data, updatedAt: new Date() }).where(eq(siteSurveys.id, id)).returning();
    return updated;
  }

  async getPasswordResetRequests(status?: string): Promise<PasswordResetRequest[]> {
    if (status) {
      return db.select().from(passwordResetRequests).where(eq(passwordResetRequests.status, status as any)).orderBy(desc(passwordResetRequests.requestedAt));
    }
    return db.select().from(passwordResetRequests).orderBy(desc(passwordResetRequests.requestedAt));
  }

  async createPasswordResetRequest(req: InsertPasswordResetRequest): Promise<PasswordResetRequest> {
    const [created] = await db.insert(passwordResetRequests).values(req).returning();
    return created;
  }

  async resolvePasswordResetRequest(id: number, resolvedBy: number): Promise<PasswordResetRequest | undefined> {
    const [updated] = await db.update(passwordResetRequests).set({ status: "resolved", resolvedBy, resolvedAt: new Date() }).where(eq(passwordResetRequests.id, id)).returning();
    return updated;
  }

  async getPaymentSchedulesByQuotation(quotationId: number): Promise<PaymentSchedule[]> {
    return db.select().from(paymentSchedules).where(eq(paymentSchedules.quotationId, quotationId)).orderBy(paymentSchedules.installmentNumber);
  }

  async getPaymentSchedulesByContract(contractId: number): Promise<PaymentSchedule[]> {
    return db.select().from(paymentSchedules).where(eq(paymentSchedules.contractId, contractId)).orderBy(paymentSchedules.installmentNumber);
  }

  async createPaymentSchedule(ps: InsertPaymentSchedule): Promise<PaymentSchedule> {
    const [created] = await db.insert(paymentSchedules).values(ps).returning();
    return created;
  }

  async updatePaymentSchedule(id: number, data: Partial<InsertPaymentSchedule>): Promise<PaymentSchedule | undefined> {
    const [updated] = await db.update(paymentSchedules).set(data).where(eq(paymentSchedules.id, id)).returning();
    return updated;
  }

  async getPaymentSchedulesByCustomer(customerId: number): Promise<PaymentSchedule[]> {
    return db.select().from(paymentSchedules).where(eq(paymentSchedules.customerId, customerId)).orderBy(paymentSchedules.installmentNumber);
  }

  async getDailySalesLog(date: string, salesRepId: number): Promise<DailySalesLog | undefined> {
    const [log] = await db.select().from(dailySalesLogs)
      .where(and(eq(dailySalesLogs.date, date), eq(dailySalesLogs.salesRepId, salesRepId)));
    return log;
  }

  async getDailySalesLogs(filters?: { salesRepId?: number; startDate?: string; endDate?: string }): Promise<DailySalesLog[]> {
    const conditions = [];
    if (filters?.salesRepId) conditions.push(eq(dailySalesLogs.salesRepId, filters.salesRepId));
    if (filters?.startDate) conditions.push(gte(dailySalesLogs.date, filters.startDate));
    if (filters?.endDate) conditions.push(lte(dailySalesLogs.date, filters.endDate));
    return conditions.length
      ? db.select().from(dailySalesLogs).where(and(...conditions)).orderBy(desc(dailySalesLogs.date))
      : db.select().from(dailySalesLogs).orderBy(desc(dailySalesLogs.date));
  }

  async upsertDailySalesLog(data: InsertDailySalesLog): Promise<DailySalesLog> {
    const existing = await this.getDailySalesLog(data.date, data.salesRepId);
    if (existing) {
      const [updated] = await db.update(dailySalesLogs)
        .set({ callsCount: data.callsCount, whatsappCount: data.whatsappCount, showroomVisits: data.showroomVisits, notes: data.notes })
        .where(eq(dailySalesLogs.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(dailySalesLogs).values(data).returning();
    return created;
  }

  async createAttendanceRecord(data: InsertAttendanceRecord): Promise<AttendanceRecord> {
    const [record] = await db.insert(attendanceRecords).values(data).returning();
    return record;
  }

  async getAttendanceRecords(filters?: { employeeId?: number; employeePhone?: string; from?: string; to?: string; locationName?: string }): Promise<AttendanceRecord[]> {
    const conditions = [];
    if (filters?.employeeId) conditions.push(eq(attendanceRecords.employeeId, filters.employeeId));
    if (filters?.employeePhone) conditions.push(eq(attendanceRecords.employeePhone, filters.employeePhone));
    if (filters?.locationName) conditions.push(eq(attendanceRecords.locationName, filters.locationName));
    if (filters?.from) conditions.push(gte(attendanceRecords.checkTime, new Date(filters.from)));
    if (filters?.to) conditions.push(lte(attendanceRecords.checkTime, new Date(filters.to)));
    return conditions.length
      ? db.select().from(attendanceRecords).where(and(...conditions)).orderBy(desc(attendanceRecords.checkTime))
      : db.select().from(attendanceRecords).orderBy(desc(attendanceRecords.checkTime));
  }

  async getAttendanceRecord(id: number): Promise<AttendanceRecord | undefined> {
    const [record] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, id));
    return record;
  }

  async updateAttendanceRecord(id: number, data: Partial<InsertAttendanceRecord>): Promise<AttendanceRecord | undefined> {
    const [updated] = await db.update(attendanceRecords).set(data).where(eq(attendanceRecords.id, id)).returning();
    return updated;
  }

  async getLastAttendanceRecord(employeeId?: number, employeePhone?: string): Promise<AttendanceRecord | undefined> {
    const conditions = [];
    if (employeeId) conditions.push(eq(attendanceRecords.employeeId, employeeId));
    if (employeePhone) conditions.push(eq(attendanceRecords.employeePhone, employeePhone));
    if (!conditions.length) return undefined;
    const [record] = await db.select().from(attendanceRecords).where(and(...conditions)).orderBy(desc(attendanceRecords.checkTime)).limit(1);
    return record;
  }

  async createAttendancePermission(data: InsertAttendancePermission): Promise<AttendancePermission> {
    const [perm] = await db.insert(attendancePermissions).values(data).returning();
    return perm;
  }

  async getAttendancePermissions(filters?: { employeeId?: number; employeePhone?: string; date?: string }): Promise<AttendancePermission[]> {
    const conditions = [];
    if (filters?.employeeId) conditions.push(eq(attendancePermissions.employeeId, filters.employeeId));
    if (filters?.employeePhone) conditions.push(eq(attendancePermissions.employeePhone, filters.employeePhone));
    if (filters?.date) conditions.push(eq(attendancePermissions.date, filters.date));
    return conditions.length
      ? db.select().from(attendancePermissions).where(and(...conditions)).orderBy(desc(attendancePermissions.createdAt))
      : db.select().from(attendancePermissions).orderBy(desc(attendancePermissions.createdAt));
  }

  async updateAttendancePermission(id: number, data: Partial<InsertAttendancePermission>): Promise<AttendancePermission | undefined> {
    const [updated] = await db.update(attendancePermissions).set(data).where(eq(attendancePermissions.id, id)).returning();
    return updated;
  }

  async createAttendanceViolation(data: InsertAttendanceViolation): Promise<AttendanceViolation> {
    const [v] = await db.insert(attendanceViolations).values(data).returning();
    return v;
  }

  async getAttendanceViolations(filters?: { employeeId?: number; from?: string; to?: string }): Promise<AttendanceViolation[]> {
    const conditions = [];
    if (filters?.employeeId) conditions.push(eq(attendanceViolations.employeeId, filters.employeeId));
    if (filters?.from) conditions.push(gte(attendanceViolations.occurredAt, new Date(filters.from)));
    if (filters?.to) conditions.push(lte(attendanceViolations.occurredAt, new Date(filters.to)));
    return conditions.length
      ? db.select().from(attendanceViolations).where(and(...conditions)).orderBy(desc(attendanceViolations.occurredAt))
      : db.select().from(attendanceViolations).orderBy(desc(attendanceViolations.occurredAt));
  }

  async getWorkScheduleSettings(): Promise<WorkScheduleSetting[]> {
    return db.select().from(workScheduleSettings).orderBy(workScheduleSettings.id);
  }

  async createWorkScheduleSetting(data: InsertWorkScheduleSetting): Promise<WorkScheduleSetting> {
    const [s] = await db.insert(workScheduleSettings).values(data).returning();
    return s;
  }

  async updateWorkScheduleSetting(id: number, data: Partial<InsertWorkScheduleSetting>): Promise<WorkScheduleSetting | undefined> {
    const [s] = await db.update(workScheduleSettings).set(data).where(eq(workScheduleSettings.id, id)).returning();
    return s;
  }

  async deleteWorkScheduleSetting(id: number): Promise<void> {
    await db.delete(workScheduleSettings).where(eq(workScheduleSettings.id, id));
  }

  // إدراج تنبيه خطر إذا لم يوجد لنفس (الموظف، الشهر، المستوى) — يرجع true إذا أُدرج فعلاً
  async createRiskAlertIfNew(employeeId: number, period: string, level: string): Promise<boolean> {
    const result = await db.execute(sql`
      INSERT INTO risk_alerts (employee_id, period, level)
      VALUES (${employeeId}, ${period}, ${level})
      ON CONFLICT (employee_id, period, level) DO NOTHING
      RETURNING id
    `);
    return (result.rows?.length ?? 0) > 0;
  }

  async getAttendanceRecord(id: number): Promise<AttendanceRecord | undefined> {
    const [record] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, id));
    return record;
  }

  async createAttendanceAuditLog(data: InsertAttendanceAuditLog): Promise<AttendanceAuditLog> {
    const [created] = await db.insert(attendanceAuditLog).values(data).returning();
    return created;
  }

  async getAttendanceAuditLogs(filters?: { recordId?: number; from?: string; to?: string }): Promise<AttendanceAuditLog[]> {
    const conditions = [];
    if (filters?.recordId) conditions.push(eq(attendanceAuditLog.recordId, filters.recordId));
    if (filters?.from) conditions.push(gte(attendanceAuditLog.editedAt, new Date(filters.from)));
    if (filters?.to) conditions.push(lte(attendanceAuditLog.editedAt, new Date(filters.to)));
    return db.select().from(attendanceAuditLog)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(attendanceAuditLog.editedAt));
  }

  async getLocationZones(): Promise<LocationZone[]> {
    return db.select().from(locationZones).where(eq(locationZones.isActive, true)).orderBy(locationZones.id);
  }

  async createLocationZone(data: InsertLocationZone): Promise<LocationZone> {
    const [zone] = await db.insert(locationZones).values(data).returning();
    return zone;
  }

  async updateLocationZone(id: number, data: Partial<InsertLocationZone>): Promise<LocationZone | undefined> {
    const [updated] = await db.update(locationZones).set(data).where(eq(locationZones.id, id)).returning();
    return updated;
  }

  async deleteLocationZone(id: number): Promise<void> {
    await db.update(locationZones).set({ isActive: false }).where(eq(locationZones.id, id));
  }

  // ── CHART OF ACCOUNTS ──────────────────────────────────────────────────────

  async getChartOfAccounts(): Promise<ChartOfAccount[]> {
    return db.select().from(chartOfAccounts)
      .where(eq(chartOfAccounts.isActive, true))
      .orderBy(asc(chartOfAccounts.code));
  }

  async getChartOfAccount(id: number): Promise<ChartOfAccount | undefined> {
    const [row] = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.id, id));
    return row;
  }

  async getChartOfAccountByCode(code: string): Promise<ChartOfAccount | undefined> {
    const [row] = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, code));
    return row;
  }

  async createChartOfAccount(data: InsertChartOfAccount): Promise<ChartOfAccount> {
    const [row] = await db.insert(chartOfAccounts).values(data).returning();
    return row;
  }

  async updateChartOfAccount(id: number, data: Partial<InsertChartOfAccount>): Promise<ChartOfAccount | undefined> {
    const [row] = await db.update(chartOfAccounts).set(data).where(eq(chartOfAccounts.id, id)).returning();
    return row;
  }

  async deleteChartOfAccount(id: number): Promise<void> {
    await db.update(chartOfAccounts).set({ isActive: false }).where(eq(chartOfAccounts.id, id));
  }

  async seedChartOfAccounts(): Promise<void> {
    const existing = await db.select({ code: chartOfAccounts.code }).from(chartOfAccounts);
    if (existing.length > 0) return;
    const ACCOUNTS = [
      { code: "1000", nameAr: "الأصول", nameEn: "Assets", type: "asset" as const, isSystem: true },
      { code: "1100", nameAr: "الأصول المتداولة", nameEn: "Current Assets", type: "asset" as const, parentCode: "1000", isSystem: true },
      { code: "1110", nameAr: "النقدية والبنوك", nameEn: "Cash and Banks", type: "asset" as const, parentCode: "1100", isSystem: true },
      { code: "1111", nameAr: "الصندوق", nameEn: "Cash in Hand", type: "asset" as const, parentCode: "1110", isSystem: true },
      { code: "1112", nameAr: "البنك", nameEn: "Bank Account", type: "asset" as const, parentCode: "1110", isSystem: true },
      { code: "1120", nameAr: "الذمم المدينة", nameEn: "Accounts Receivable", type: "asset" as const, parentCode: "1100", isSystem: true },
      { code: "1121", nameAr: "ذمم العملاء", nameEn: "Customer Receivables", type: "asset" as const, parentCode: "1120", isSystem: true },
      { code: "1130", nameAr: "المخزون", nameEn: "Inventory", type: "asset" as const, parentCode: "1100", isSystem: true },
      { code: "1140", nameAr: "سلف وعهد الموظفين", nameEn: "Employee Advances", type: "asset" as const, parentCode: "1100" },
      { code: "1200", nameAr: "الأصول الثابتة", nameEn: "Fixed Assets", type: "asset" as const, parentCode: "1000", isSystem: true },
      { code: "1210", nameAr: "الأثاث والمعدات", nameEn: "Furniture & Equipment", type: "asset" as const, parentCode: "1200" },
      { code: "1220", nameAr: "المركبات", nameEn: "Vehicles", type: "asset" as const, parentCode: "1200" },
      { code: "2000", nameAr: "الخصوم", nameEn: "Liabilities", type: "liability" as const, isSystem: true },
      { code: "2100", nameAr: "الخصوم المتداولة", nameEn: "Current Liabilities", type: "liability" as const, parentCode: "2000", isSystem: true },
      { code: "2110", nameAr: "الذمم الدائنة", nameEn: "Accounts Payable", type: "liability" as const, parentCode: "2100", isSystem: true },
      { code: "2111", nameAr: "ذمم الموردين", nameEn: "Supplier Payables", type: "liability" as const, parentCode: "2110", isSystem: true },
      { code: "2120", nameAr: "ضريبة القيمة المضافة", nameEn: "VAT", type: "liability" as const, parentCode: "2100", isSystem: true },
      { code: "2121", nameAr: "ضريبة المخرجات", nameEn: "Output VAT", type: "liability" as const, parentCode: "2120", isSystem: true },
      { code: "2122", nameAr: "ضريبة المدخلات", nameEn: "Input VAT", type: "liability" as const, parentCode: "2120", isSystem: true },
      { code: "2130", nameAr: "رواتب مستحقة", nameEn: "Accrued Salaries", type: "liability" as const, parentCode: "2100" },
      { code: "2140", nameAr: "دفعات مقدمة من العملاء", nameEn: "Customer Deposits", type: "liability" as const, parentCode: "2100" },
      { code: "3000", nameAr: "حقوق الملكية", nameEn: "Equity", type: "equity" as const, isSystem: true },
      { code: "3100", nameAr: "رأس المال", nameEn: "Capital", type: "equity" as const, parentCode: "3000", isSystem: true },
      { code: "3200", nameAr: "الأرباح المحتجزة", nameEn: "Retained Earnings", type: "equity" as const, parentCode: "3000", isSystem: true },
      { code: "4000", nameAr: "الإيرادات", nameEn: "Revenue", type: "revenue" as const, isSystem: true },
      { code: "4100", nameAr: "إيرادات المبيعات", nameEn: "Sales Revenue", type: "revenue" as const, parentCode: "4000", isSystem: true },
      { code: "4110", nameAr: "مبيعات المطابخ", nameEn: "Kitchen Sales", type: "revenue" as const, parentCode: "4100" },
      { code: "4120", nameAr: "مبيعات الخزائن والأبواب", nameEn: "Wardrobe & Door Sales", type: "revenue" as const, parentCode: "4100" },
      { code: "4200", nameAr: "إيرادات أخرى", nameEn: "Other Revenue", type: "revenue" as const, parentCode: "4000" },
      { code: "5000", nameAr: "تكلفة المبيعات", nameEn: "Cost of Sales", type: "cost" as const, isSystem: true },
      { code: "5100", nameAr: "تكلفة المواد الخام", nameEn: "Raw Materials Cost", type: "cost" as const, parentCode: "5000", isSystem: true },
      { code: "5200", nameAr: "تكلفة الإنتاج", nameEn: "Production Cost", type: "cost" as const, parentCode: "5000" },
      { code: "5300", nameAr: "تكلفة التوصيل والتركيب", nameEn: "Delivery & Installation Cost", type: "cost" as const, parentCode: "5000" },
      { code: "6000", nameAr: "المصروفات التشغيلية", nameEn: "Operating Expenses", type: "expense" as const, isSystem: true },
      { code: "6100", nameAr: "رواتب وأجور", nameEn: "Salaries & Wages", type: "expense" as const, parentCode: "6000", isSystem: true },
      { code: "6200", nameAr: "إيجارات", nameEn: "Rent", type: "expense" as const, parentCode: "6000" },
      { code: "6300", nameAr: "كهرباء ومياه", nameEn: "Utilities", type: "expense" as const, parentCode: "6000" },
      { code: "6400", nameAr: "مصروفات إدارية", nameEn: "Administrative Expenses", type: "expense" as const, parentCode: "6000" },
      { code: "6500", nameAr: "مصروفات تسويقية", nameEn: "Marketing Expenses", type: "expense" as const, parentCode: "6000" },
      { code: "6600", nameAr: "مصروفات نقل وتوصيل", nameEn: "Delivery Expenses", type: "expense" as const, parentCode: "6000" },
      { code: "6700", nameAr: "صيانة وإصلاح", nameEn: "Maintenance & Repairs", type: "expense" as const, parentCode: "6000" },
      { code: "6800", nameAr: "مصروفات أخرى", nameEn: "Other Expenses", type: "expense" as const, parentCode: "6000" },
    ];
    await db.insert(chartOfAccounts).values(ACCOUNTS);
  }

  // ── JOURNAL ENTRIES ────────────────────────────────────────────────────────

  async getJournalEntries(from?: string, to?: string, typeFilter?: string): Promise<JournalEntry[]> {
    const conditions = [];
    if (from) conditions.push(gte(journalEntries.date, from));
    if (to) conditions.push(lte(journalEntries.date, to));
    if (typeFilter === "manual") conditions.push(isNull(journalEntries.referenceType));
    else if (typeFilter === "auto") conditions.push(isNotNull(journalEntries.referenceType));
    else if (typeFilter && typeFilter !== "all") conditions.push(eq(journalEntries.referenceType, typeFilter));
    const q = conditions.length > 0
      ? db.select().from(journalEntries).where(and(...conditions))
      : db.select().from(journalEntries);
    return q.orderBy(desc(journalEntries.date), desc(journalEntries.entryNumber));
  }

  async getJournalEntry(id: number): Promise<JournalEntry | undefined> {
    const [row] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    return row;
  }

  async findJournalEntryByReference(referenceType: string, referenceId: number): Promise<JournalEntry | undefined> {
    const [row] = await db.select().from(journalEntries).where(
      and(eq(journalEntries.referenceType, referenceType), eq(journalEntries.referenceId, referenceId))
    );
    return row;
  }

  async createJournalEntry(entry: InsertJournalEntry, lines: InsertJournalEntryLine[]): Promise<JournalEntry> {
    // Normalize Arabic-Indic/Persian digits so numeric casts never fail at the DB.
    const safeLines = lines.map(l => ({ ...l, debit: toLatinDigits(l.debit ?? "0") || "0", credit: toLatinDigits(l.credit ?? "0") || "0" }));
    const totalDebit = safeLines.reduce((s, l) => s + parseNum(l.debit), 0);
    const totalCredit = safeLines.reduce((s, l) => s + parseNum(l.credit), 0);
    // Atomic: header + lines are written in a single transaction so a line failure
    // never leaves a "ghost" header behind (root cause of "القيد لا يُحفظ").
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(journalEntries).values({
        ...entry,
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
      }).returning();
      if (safeLines.length > 0) {
        await tx.insert(journalEntryLines).values(safeLines.map(l => ({ ...l, entryId: created.id })));
      }
      return created;
    });
  }

  // Atomic replacement of the opening-balance entry: void existing + create new
  // in one transaction so a failure never wipes balances without a replacement.
  async replaceOpeningBalances(
    entry: InsertJournalEntry,
    lines: InsertJournalEntryLine[],
  ): Promise<JournalEntry> {
    const safeLines = lines.map(l => ({ ...l, debit: toLatinDigits(l.debit ?? "0") || "0", credit: toLatinDigits(l.credit ?? "0") || "0" }));
    const totalDebit = safeLines.reduce((s, l) => s + parseNum(l.debit), 0);
    const totalCredit = safeLines.reduce((s, l) => s + parseNum(l.credit), 0);
    return await db.transaction(async (tx) => {
      await tx
        .update(journalEntries)
        .set({ status: "reversed" })
        .where(
          and(
            eq(journalEntries.referenceType, "opening_balance"),
            eq(journalEntries.status, "posted"),
          ),
        );
      const [created] = await tx.insert(journalEntries).values({
        ...entry,
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
      }).returning();
      if (safeLines.length > 0) {
        await tx.insert(journalEntryLines).values(safeLines.map(l => ({ ...l, entryId: created.id })));
      }
      return created;
    });
  }

  async updateJournalEntry(id: number, data: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined> {
    const [row] = await db.update(journalEntries).set(data).where(eq(journalEntries.id, id)).returning();
    return row;
  }

  // Atomic: update header + replace all lines in one transaction.
  async updateJournalEntryWithLines(
    id: number,
    data: Partial<InsertJournalEntry>,
    lines: InsertJournalEntryLine[],
  ): Promise<JournalEntry | undefined> {
    const safeLines = lines.map(l => ({ ...l, debit: toLatinDigits(l.debit ?? "0") || "0", credit: toLatinDigits(l.credit ?? "0") || "0" }));
    const totalDebit = safeLines.reduce((s, l) => s + parseNum(l.debit), 0);
    const totalCredit = safeLines.reduce((s, l) => s + parseNum(l.credit), 0);
    return await db.transaction(async (tx) => {
      const [row] = await tx.update(journalEntries).set({
        ...data,
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
      }).where(eq(journalEntries.id, id)).returning();
      if (!row) return undefined;
      await tx.delete(journalEntryLines).where(eq(journalEntryLines.entryId, id));
      if (safeLines.length > 0) {
        await tx.insert(journalEntryLines).values(safeLines.map(l => ({ ...l, entryId: id })));
      }
      return row;
    });
  }

  async deleteJournalEntry(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(journalEntryLines).where(eq(journalEntryLines.entryId, id));
      await tx.delete(journalEntries).where(eq(journalEntries.id, id));
    });
  }

  async getJournalEntryLines(entryId: number): Promise<JournalEntryLine[]> {
    return db.select().from(journalEntryLines).where(eq(journalEntryLines.entryId, entryId));
  }

  async getJournalEntryLinesForAccount(accountCode: string, from?: string, to?: string) {
    const baseQ = db
      .select({
        id: journalEntryLines.id,
        entryId: journalEntryLines.entryId,
        accountCode: journalEntryLines.accountCode,
        accountNameAr: journalEntryLines.accountNameAr,
        debit: journalEntryLines.debit,
        credit: journalEntryLines.credit,
        notes: journalEntryLines.notes,
        entryDate: journalEntries.date,
        entryDescription: journalEntries.description,
        entryNumber: journalEntries.entryNumber,
      })
      .from(journalEntryLines)
      .innerJoin(journalEntries, eq(journalEntryLines.entryId, journalEntries.id));

    const codeEq = eq(journalEntryLines.accountCode, accountCode);
    const whereClause =
      from && to ? and(codeEq, gte(journalEntries.date, from), lte(journalEntries.date, to)) :
      from       ? and(codeEq, gte(journalEntries.date, from)) :
      to         ? and(codeEq, lte(journalEntries.date, to)) :
                   codeEq;

    return baseQ.where(whereClause).orderBy(asc(journalEntries.date), asc(journalEntries.id));
  }

  // ── FISCAL YEARS ───────────────────────────────────────────────────────────

  async getFiscalYears(): Promise<FiscalYear[]> {
    return db.select().from(fiscalYears).orderBy(desc(fiscalYears.startDate));
  }

  async getFiscalYear(id: number): Promise<FiscalYear | undefined> {
    const [row] = await db.select().from(fiscalYears).where(eq(fiscalYears.id, id));
    return row;
  }

  async createFiscalYear(data: InsertFiscalYear): Promise<FiscalYear> {
    const [row] = await db.insert(fiscalYears).values(data).returning();
    return row;
  }

  async updateFiscalYear(id: number, data: Partial<InsertFiscalYear>): Promise<FiscalYear | undefined> {
    const [row] = await db.update(fiscalYears).set(data).where(eq(fiscalYears.id, id)).returning();
    return row;
  }
}

export const storage = new DatabaseStorage();
