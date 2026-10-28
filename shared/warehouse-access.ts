import { stockWriteAccess, buyingWriteAccess, type AccountAccessPolicy } from "./account-access";
// A narrow authenticated warehouse workspace; never reopens the rest of the ERP.
export const WAREHOUSE_WORKSPACE_PERMISSIONS = ["/warehouses", "/inventory", "/purchases", "/suppliers"];
export const WAREHOUSE_WORKSPACE_ROLES = ["owner", "assistant", "warehouse", "purchasing", "it"];
export const canManageWarehouse = (role?: string, accessPolicy?: AccountAccessPolicy | null) => stockWriteAccess({ role: role || "", accessPolicy });
export const canDecideWarehousePurchase = (role?: string, accessPolicy?: AccountAccessPolicy | null) => buyingWriteAccess({ role: role || "", accessPolicy });
export function isWarehouseWorkspacePage(path: string) {
  return path === "/warehouse-login" || /^\/(?:dashboard\/)?warehouses(?:\/(?:items|movements|requests|receipts|reports|settings))?\/?$/.test(path) ||
    /^\/dashboard\/(?:inventory|purchases(?:\/\d+)?|suppliers)\/?$/.test(path);
}
export function isWarehouseWorkspaceApi(method: string, path: string) {
  if (method === "POST" && ["/api/warehouse-access/login", "/api/auth/logout"].includes(path)) return true;
  if (method === "GET" && ["/api/auth/me", "/api/notifications"].includes(path)) return true;
  if (method === "PATCH" && /^\/api\/notifications\/(?:read-all|\d+\/read)$/.test(path)) return true;
  if (method === "GET" && /^\/api\/warehouse-center\/(?:summary|movements|requisitions|receipts|reports\.csv|reports\/print)$/.test(path)) return true;
  if (method === "POST" && /^\/api\/warehouse-center\/(?:warehouses|categories|items|movements|transfers|requisitions|receipts|requisitions\/\d+\/decision)$/.test(path)) return true;
  if (["PATCH", "DELETE"].includes(method) && /^\/api\/warehouse-center\/(?:warehouses|categories|items)\/\d+$/.test(path)) return true;
  if (method === "GET" && /^\/api\/(?:inventory(?:\/\d+)?|inventory-transactions|warehouses|purchase-orders(?:\/\d+)?|suppliers)$/.test(path)) return true;
  return (method === "POST" && /^\/api\/(?:inventory|inventory-transactions|warehouses|purchase-orders|suppliers)$/.test(path)) ||
    (["PATCH", "DELETE"].includes(method) && /^\/api\/(?:inventory|warehouses|purchase-orders|suppliers)\/\d+$/.test(path));
}
