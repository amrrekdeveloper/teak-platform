import { eq, desc, like, and, sql } from "drizzle-orm";
import { db } from "./db";
import {
  users, type User, type InsertUser,
  customers, type Customer, type InsertCustomer,
  products, type Product, type InsertProduct,
  woodTypes, type WoodType, type InsertWoodType,
  doorTypes, type DoorType, type InsertDoorType,
  quotations, type Quotation, type InsertQuotation,
  contracts, type Contract, type InsertContract,
  payments, type Payment, type InsertPayment,
  invoices, type Invoice, type InsertInvoice,
  companySettings, type CompanySettings, type InsertCompanySettings,
  workOrders, type WorkOrder, type InsertWorkOrder,
  productionStages, type ProductionStage, type InsertProductionStage,
  inventory, type InventoryItem, type InsertInventory,
  inventoryTransactions, type InventoryTransaction, type InsertInventoryTransaction,
  suppliers, type Supplier, type InsertSupplier,
  purchaseOrders, type PurchaseOrder, type InsertPurchaseOrder,
  deliveries, type Delivery, type InsertDelivery,
  installations, type Installation, type InsertInstallation,
  maintenanceRequests, type MaintenanceRequest, type InsertMaintenanceRequest,
  qualityChecks, type QualityCheck, type InsertQualityCheck,
  notifications, type Notification, type InsertNotification,
  activityLog, type ActivityLog, type InsertActivityLog,
  employees, type Employee, type InsertEmployee,
  designAssignments, type DesignAssignment, type InsertDesignAssignment,
  warranties, type Warranty, type InsertWarranty,
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;

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

  getContracts(): Promise<Contract[]>;
  getContract(id: number): Promise<Contract | undefined>;
  getContractsByCustomer(customerId: number): Promise<Contract[]>;
  createContract(contract: InsertContract): Promise<Contract>;
  updateContract(id: number, data: Partial<InsertContract>): Promise<Contract | undefined>;

  getPayments(): Promise<Payment[]>;
  getPaymentsByContract(contractId: number): Promise<Payment[]>;
  getPaymentsByCustomer(customerId: number): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;

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

  createInventoryTransaction(tx: InsertInventoryTransaction): Promise<InventoryTransaction>;

  getSuppliers(): Promise<Supplier[]>;
  getSupplier(id: number): Promise<Supplier | undefined>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<Supplier | undefined>;

  getInventoryTransactions(inventoryId?: number): Promise<InventoryTransaction[]>;

  getPurchaseOrders(): Promise<PurchaseOrder[]>;
  getPurchaseOrder(id: number): Promise<PurchaseOrder | undefined>;
  createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: number, data: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined>;

  getDeliveries(): Promise<Delivery[]>;
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

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [created] = await db.insert(payments).values(payment).returning();
    return created;
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
}

export const storage = new DatabaseStorage();
