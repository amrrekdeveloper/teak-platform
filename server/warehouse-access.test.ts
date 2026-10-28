import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("./storage", () => ({ storage: { getUser: mocks.getUser } }));
import { enforceWarehouseWorkspaceScope } from "./warehouse-access";
import { isWarehouseWorkspaceApi, isWarehouseWorkspacePage, canManageWarehouse, canDecideWarehousePurchase } from "../shared/warehouse-access";
beforeEach(() => { mocks.getUser.mockReset(); });
async function call(path: string, session: any = {}, method = "GET", user: any = { active: true, archived: false, role: "warehouse" }, origin?: string) {
  mocks.getUser.mockResolvedValue(user);
  const req: any = { path, method, session, get: (name: string) => name === "Origin" ? origin : "example.test" };
  const res: any = { locals: { warehouseMaintenanceRequest: isWarehouseWorkspaceApi(method, path) },
    status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }, next = vi.fn();
  await enforceWarehouseWorkspaceScope(req, res, next);
  return { res, next };
}
const signed = { userId: 501, adminAuthenticated: true, warehouseWorkspace: true };
describe("isolated warehouse access during maintenance", () => {
  it("gives the keeper management controls but not purchase decisions, and IT read-only access", async () => {
    expect(canManageWarehouse("warehouse")).toBe(true);
    expect(canManageWarehouse("purchasing")).toBe(false);
    expect(canManageWarehouse("it")).toBe(false);
    expect(canDecideWarehousePurchase("purchasing")).toBe(true);
    expect(canDecideWarehousePurchase("warehouse")).toBe(false);
    expect((await call("/api/inventory", signed, "POST", { active: true, role: "it" })).res.status).toHaveBeenCalledWith(403);
    expect((await call("/api/purchase-orders/7", signed, "PATCH")).res.status).toHaveBeenCalledWith(403);
  });
  it("allows exact warehouse pages but never the full dashboard or finance", () => {
    expect(isWarehouseWorkspacePage("/dashboard/warehouses/items")).toBe(true);
    expect(isWarehouseWorkspacePage("/warehouse-login")).toBe(true);
    expect(isWarehouseWorkspacePage("/dashboard/payments")).toBe(false);
    expect(isWarehouseWorkspacePage("/dashboard")).toBe(false);
    expect(isWarehouseWorkspaceApi("GET", "/api/warehouse-center/reports/print")).toBe(true);
    expect(isWarehouseWorkspaceApi("GET", "/api/employees")).toBe(false);
  });
  it("requires the dedicated session and a live authorized role", async () => {
    expect((await call("/api/warehouse-center/summary")).res.status).toHaveBeenCalledWith(401);
    expect((await call("/api/warehouse-center/summary", { ...signed, warehouseWorkspace: false })).res.status).toHaveBeenCalledWith(401);
    expect((await call("/api/warehouse-center/summary", signed)).next).toHaveBeenCalledOnce();
    expect((await call("/api/warehouse-center/summary", signed, "GET", { active: true, role: "hr" })).res.status).toHaveBeenCalledWith(403);
    expect((await call("/api/warehouse-center/summary", signed, "GET", { active: false, role: "warehouse" })).res.status).toHaveBeenCalledWith(403);
  });
  it("refuses broader ERP, clinical data, and forged cross-origin writes", async () => {
    for (const path of ["/api/payments", "/api/employees", "/api/system-admin/me", "/api/attendance/medical-documents"])
      expect((await call(path, signed)).res.status).toHaveBeenCalledWith(403);
    expect((await call("/api/warehouse-center/transfers", signed, "POST", undefined, "https://attacker.test")).res.status).toHaveBeenCalledWith(403);
  });
  it("keeps the employee portal independent and permits a fresh dedicated sign-in", async () => {
    expect((await call("/api/employee-portal/summary", signed)).next).toHaveBeenCalledOnce();
    expect((await call("/api/warehouse-access/login", {}, "POST")).next).toHaveBeenCalledOnce();
  });
});
