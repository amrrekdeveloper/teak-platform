import { describe, expect, it } from "vitest";
import { accountAccessSchema, administrationSystems, EMPTY_ACCOUNT_ACCESS, delegateMayManage, policyWithinDelegation, isUserWorkspaceApi } from "./account-access";
import { isHrWorkspacePage } from "./hr-access";
describe("explicit bounded account administration", () => {
  it("requires an explicit valid owner-issued program scope, not the IT job/role", () => {
    expect(administrationSystems({ role: "it" })).toEqual([]);
    expect(administrationSystems({ role: "it", accessPolicy: { ...EMPTY_ACCOUNT_ACCESS, administration: { systems: ["warehouse"] } } })).toEqual(["warehouse"]);
    expect(accountAccessSchema.safeParse({ ...EMPTY_ACCOUNT_ACCESS, administration: { systems: [] } }).success).toBe(false);
    expect(accountAccessSchema.safeParse({ ...EMPTY_ACCOUNT_ACCESS, administration: { systems: ["owner"] } }).success).toBe(false);
  });
  it("does not let delegated admins grant administration or unapproved programs", () => {
    expect(policyWithinDelegation({ ...EMPTY_ACCOUNT_ACCESS, hr: "manage" }, ["hr"])).toBe(true);
    expect(policyWithinDelegation({ ...EMPTY_ACCOUNT_ACCESS, warehouse: "manage" }, ["hr"])).toBe(false);
    expect(policyWithinDelegation({ ...EMPTY_ACCOUNT_ACCESS, administration: { systems: ["hr"] } }, ["hr"])).toBe(false);
  });
  it("protects owners, other admins and identities with broader ERP access", () => {
    expect(delegateMayManage({ role: "owner", accessPolicy: EMPTY_ACCOUNT_ACCESS }, ["hr", "warehouse", "purchasing"])).toBe(false);
    expect(delegateMayManage({ role: "it" }, ["hr", "warehouse", "purchasing"])).toBe(false);
    expect(delegateMayManage({ role: "customer", accessPolicy: { ...EMPTY_ACCOUNT_ACCESS, administration: { systems: ["hr"] } } }, ["hr"])).toBe(false);
    expect(delegateMayManage({ role: "warehouse", accessPolicy: { ...EMPTY_ACCOUNT_ACCESS, hr: "manage", warehouse: "manage" } }, ["hr"])).toBe(false);
  });
  it("allows in-scope existing staff accounts without permitting consumer-account takeover", () => {
    expect(delegateMayManage({ role: "hr" }, ["hr"])).toBe(true);
    expect(delegateMayManage({ role: "warehouse" }, ["hr"])).toBe(false);
    expect(delegateMayManage({ role: "customer", employees: [] }, ["hr"])).toBe(false);
    expect(delegateMayManage({ role: "customer", employees: [{}] }, ["hr"])).toBe(true);
    expect(delegateMayManage({ role: "warehouse", accessPolicy: { ...EMPTY_ACCOUNT_ACCESS, warehouse: "view" } }, ["warehouse"])).toBe(true);
  });
  it("exposes exact unified entry/control paths, not arbitrary API prefixes", () => {
    expect(isHrWorkspacePage("/user-login")).toBe(true);
    expect(isHrWorkspacePage("/workspace")).toBe(true);
    expect(isUserWorkspaceApi("POST", "/api/user-access/workspace")).toBe(true);
    expect(isUserWorkspaceApi("POST", "/api/user-access/admin")).toBe(false);
    expect(isUserWorkspaceApi("GET", "/api/user-access/password")).toBe(false);
  });
});
