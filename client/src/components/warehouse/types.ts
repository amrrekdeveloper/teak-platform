export type Unit = "piece" | "meter" | "sqm" | "kg" | "liter" | "sheet";
export type ItemKind = "material" | "equipment" | "vehicle" | "other";

export interface Warehouse {
  id: number;
  nameAr: string;
  nameEn?: string | null;
  warehouseType: "main" | "sub";
  parentWarehouseId?: number | null;
  address?: string | null;
  description?: string | null;
  sections?: string[] | string | null;
  active: boolean;
}

export interface Category {
  id: number;
  nameAr: string;
  nameEn?: string | null;
  parentId?: number | null;
  active: boolean;
}

export interface Item {
  id: number;
  version: number;
  materialNameAr: string;
  materialNameEn?: string | null;
  warehouseId?: number | null;
  categoryId?: number | null;
  category?: string | null;
  itemKind?: ItemKind;
  serialNumber?: string | null;
  unit: Unit | string;
  quantity: number | string;
  minQuantity: number | string;
  costPerUnit?: number | string | null;
  location?: string | null;
  sku?: string | null;
  color?: string | null;
  active?: boolean;
}

export interface Summary {
  warehouses: Warehouse[];
  categories: Category[];
  items: Item[];
  stats: { warehouses: number; items: number; lowStock: number; unassigned: number; pendingRequests: number };
}

export interface Movement {
  id: number;
  inventoryId: number;
  type: string;
  quantity: number | string;
  reason: string;
  notes?: string | null;
  receiverName?: string | null;
  balanceAfter: number | string;
  warehouseId?: number | null;
  warehouseName?: string | null;
  itemName?: string | null;
  unit?: string | null;
  performedByName?: string | null;
  createdAt: string;
  reference?: string | null;
}

export interface Requisition {
  id: number;
  inventoryId: number;
  itemName: string;
  warehouseName?: string | null;
  warehouseId?: number | null;
  unit: string;
  quantity: number | string;
  reason: string;
  requestedFor: string;
  status: "pending" | "approved" | "rejected";
  decisionNote?: string | null;
  purchaseOrderId?: number | null;
  createdAt: string;
  purchaseStatus?: string | null;
}

export interface ReceiptLine {
  lineIndex: number;
  inventoryId?: number | null;
  materialNameAr: string;
  materialNameEn?: string | null;
  quantity: number | string;
  receivedQuantity: number | string;
  warehouseId?: number | null;
  unit?: string | null;
}

export interface ReceiptOrder {
  id: number;
  orderNumber: string;
  status: string;
  supplierName: string;
  items: ReceiptLine[];
  requisitionId?: number | null;
}
