import { queryClient, apiRequest } from "@/lib/queryClient";
import { warehouseKeys } from "./use-warehouse";

export const BASE = "/api/warehouse-center";
const unitLabels: Record<string, [string, string]> = {
  piece: ["قطعة", "Piece"], meter: ["متر", "Meter"], sqm: ["م²", "Square meter"],
  kg: ["كجم", "Kilogram"], liter: ["لتر", "Liter"], sheet: ["لوح", "Sheet"],
};
const reasonLabels: Record<string, [string, string]> = {
  production_use: ["استخدام في الإنتاج", "Production use"],
  contract_delivery: ["تسليم عقد", "Contract delivery"],
  supplier_return: ["إرجاع لمورد", "Supplier return"],
  damaged: ["تالف", "Damaged"], sample: ["عينة", "Sample"],
  adjustment: ["تسوية جردية", "Adjustment"], inventory_count: ["جرد مخزون", "Inventory count"],
  other: ["أخرى", "Other"], production_return: ["مرتجع إنتاج", "Production return"],
  customer_return: ["مرتجع عميل", "Customer return"],
};
const statusLabels: Record<string, [string, string]> = {
  pending: ["قيد المراجعة", "Pending"], approved: ["معتمد", "Approved"],
  rejected: ["مرفوض", "Rejected"], draft: ["مسودة", "Draft"],
  pending_approval: ["بانتظار الموافقة", "Pending approval"], ordered: ["تم الطلب", "Ordered"],
  partially_received: ["استلام جزئي", "Partially received"], received: ["مستلم", "Received"],
  cancelled: ["ملغي", "Cancelled"], canceled: ["ملغي", "Cancelled"],
  stock_in: ["إدخال رصيد", "Stock in"], stock_out: ["صرف رصيد", "Stock out"],
  adjustment: ["تسوية جردية", "Adjustment"],
};

export function warehouseUnit(t: (ar: string, en: string) => string, unit?: string | null) {
  return unit ? t(...(unitLabels[unit] ?? [unit.replace(/_/g, " "), unit.replace(/_/g, " ")])) : "—";
}

export function warehouseReason(t: (ar: string, en: string) => string, reason?: string | null) {
  if (!reason) return "—";
  const fallback = reason.replace(/_/g, " ");
  return t(...(reasonLabels[reason] ?? [fallback, fallback]));
}

export function warehouseStatus(t: (ar: string, en: string) => string, status?: string | null) {
  if (!status) return "—";
  const fallback = status.replace(/_/g, " ");
  return t(...(statusLabels[status] ?? [fallback, fallback]));
}

export function operationKey() {
  if (typeof crypto === "undefined" || !crypto.getRandomValues)
    throw new Error("يلزم استخدام متصفح حديث واتصال آمن لتسجيل الحركات");
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export async function warehouseInvalidate() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: warehouseKeys.summary }),
    queryClient.invalidateQueries({ queryKey: warehouseKeys.movements }),
    queryClient.invalidateQueries({ queryKey: warehouseKeys.requisitions }),
    queryClient.invalidateQueries({ queryKey: warehouseKeys.receipts }),
    queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] }),
  ]);
}

export async function downloadWarehouseCsv(url: string) {
  const response = await apiRequest("GET", url);
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = "warehouse-report.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
