import { describe, it, expect } from "vitest";
import { isHrWorkspaceApi, isHrWorkspaceIdentity, isManagerApi } from "./hr-access";
describe("maintenance domain scope", () => {
  it("allows HR onboarding and preparation, not unrelated administration", () => {
    expect(isHrWorkspaceApi("POST", "/api/employees")).toBe(true);
    expect(isHrWorkspaceApi("POST", "/api/payroll/bulk")).toBe(true);
    for (const path of ["/api/users", "/api/auth/login", "/api/settings", "/api/customers", "/api/hr/reset-password"])
      expect(isHrWorkspaceApi("POST", path)).toBe(false);
  });
  it("requires an explicitly scoped active HR identity", () => {
    const session = {userId:1, adminAuthenticated:true, hrWorkspace:true};
    expect(isHrWorkspaceIdentity({role:"hr",active:true},session)).toBe(true);
    for (const role of ["owner","it","accountant","employee"])
      expect(isHrWorkspaceIdentity({role,active:true},session)).toBe(false);
    expect(isHrWorkspaceIdentity({role:"hr",active:false},session)).toBe(false);
    expect(isHrWorkspaceIdentity({role:"hr",active:true,archived:true},session)).toBe(false);
    expect(isHrWorkspaceIdentity({role:"hr",active:true},{userId:1})).toBe(false);
  });
  it("manager scope exposes decisions, never employee directory or payroll", () => {
    expect(isManagerApi("POST","/api/leaves/21/decision")).toBe(true);
    expect(isManagerApi("GET","/api/manager/workspace")).toBe(true);
    expect(isManagerApi("GET","/api/employees")).toBe(false);
    expect(isManagerApi("POST","/api/payroll/1/pay")).toBe(false);
  });
});
