import { describe, it, expect } from "vitest";
import { EMPTY_ACCOUNT_ACCESS, accountAccessSchema, hasHrAccess, hrWriteAccess, hasWarehouseAccess, stockWriteAccess, buyingWriteAccess, scopedAccount, accountPermissionKeys } from "./account-access";
import { isHrWorkspaceIdentity, isSystemAdminApi } from "./hr-access";
const policy = (value: object) => ({ ...EMPTY_ACCOUNT_ACCESS, ...value });
describe("independent employee/account workspace authorization", () => {
  it("preserves legacy role-based accounts and makes explicit policy authoritative", () => {
    expect(hasHrAccess({ role: "hr" })).toBe(true);
    expect(hasHrAccess({ role: "hr", accessPolicy: policy({}) })).toBe(false);
    expect(hrWriteAccess({ role: "warehouse", accessPolicy: policy({ hr: "manage" }) })).toBe(true);
    expect(hrWriteAccess({ role: "hr", accessPolicy: policy({}) })).toBe(false);
    expect(scopedAccount({ role: "hr", accessPolicy: policy({}) }, "hr").role).toBe("customer");
    expect(stockWriteAccess({ role: "warehouse" })).toBe(true);
    expect(stockWriteAccess({ role: "warehouse", accessPolicy: policy({ warehouse: "view" }) })).toBe(false);
    expect(scopedAccount({ role: "warehouse", accessPolicy: policy({ warehouse: "view" }) }, "warehouse").role).toBe("warehouse");
    expect(buyingWriteAccess({ role: "purchasing", accessPolicy: policy({ purchasing: "view" }) })).toBe(false);
  });
  it("supports one identity across separate authorized workspaces without role escalation", () => {
    const user = { role: "customer", active: true, accessPolicy: policy({ hr: "manage", warehouse: "manage", purchasing: "manage" }) };
    expect(hasHrAccess(user)).toBe(true);
    expect(hasWarehouseAccess(user)).toBe(true);
    expect(scopedAccount(user, "hr").role).toBe("hr");
    expect(scopedAccount(user, "warehouse").role).toBe("warehouse");
    expect(stockWriteAccess(user)).toBe(true);
    expect(buyingWriteAccess(user)).toBe(true);
    expect(user.role).toBe("customer");
    expect(isHrWorkspaceIdentity(user, { userId: 1, adminAuthenticated: true, hrWorkspace: true })).toBe(true);
    expect(accountPermissionKeys(user, ["/employees"])).not.toContain("/settings");
  });
  it("allows required purchasing stock visibility without stock writes", () => {
    const user = { role: "hr", accessPolicy: policy({ purchasing: "manage" }) };
    expect(hasWarehouseAccess(user)).toBe(true);
    expect(hasHrAccess(user)).toBe(false);
    expect(stockWriteAccess(user)).toBe(false);
    expect(buyingWriteAccess(user)).toBe(true);
    expect(scopedAccount(user, "warehouse").role).toBe("purchasing");
  });
  it("fails closed for malformed policies and rejects privilege injection", () => {
    const user: any = { role: "owner", accessPolicy: { warehouse: "owner" } };
    expect(hasWarehouseAccess(user)).toBe(false);
    expect(hasHrAccess(user)).toBe(false);
    expect(stockWriteAccess(user)).toBe(false);
    expect(accountAccessSchema.safeParse({ ...policy({}), owner: true }).success).toBe(false);
  });
  it("exposes owner APIs only through their exact isolated API scope", () => {
    expect(isSystemAdminApi("GET", "/api/system-admin/accounts")).toBe(true);
    expect(isSystemAdminApi("GET", "/api/system-admin/employees")).toBe(true);
    expect(isSystemAdminApi("PATCH", "/api/system-admin/accounts/7")).toBe(true);
    expect(isSystemAdminApi("DELETE", "/api/system-admin/accounts/7")).toBe(false);
  });
});
