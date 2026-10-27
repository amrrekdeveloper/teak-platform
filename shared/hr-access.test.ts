import { describe, it, expect } from "vitest";
import { isHrWorkspaceApi, isHrWorkspacePage, isHrWorkspaceIdentity, isManagerApi, isSystemAdminApi } from "./hr-access";
describe("attendance approvals stay within the narrow HR maintenance scope",()=>{
  it("allows list/review GETs without granting mutation or other workspaces access",()=>{
    for(const path of ["/api/attendance/approvals","/api/attendance/corrections/12/review"]){
      expect(isHrWorkspaceApi("GET",path)).toBe(true);
      expect(isHrWorkspaceApi("DELETE",path)).toBe(false);
      expect(isManagerApi("GET",path)).toBe(false);
      expect(isSystemAdminApi("GET",path)).toBe(false);
    }
    expect(isHrWorkspaceApi("POST","/api/attendance/approvals")).toBe(false);
  });
  it("allows direct refresh of the two new pages without opening arbitrary HR subroutes",()=>{
    expect(isHrWorkspacePage("/hr/attendance-monitor/approvals")).toBe(true);
    expect(isHrWorkspacePage("/hr/reports/attendance-records")).toBe(true);
    expect(isHrWorkspacePage("/hr/reports/finance")).toBe(false);
    expect(isHrWorkspacePage("/hr/attendance-monitor/unrelated")).toBe(false);
  });
});
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
  it("system administrator can only provision HR accounts", () => {
    expect(isSystemAdminApi("POST", "/api/system-admin/login")).toBe(true);
    expect(isSystemAdminApi("POST", "/api/system-admin/hr-accounts")).toBe(true);
    expect(isSystemAdminApi("PATCH", "/api/system-admin/hr-accounts/2")).toBe(true);
    for (const path of ["/api/users", "/api/customers", "/api/payroll/1/pay", "/api/hr-access/login"])
      expect(isSystemAdminApi("POST", path)).toBe(false);
    expect(isSystemAdminApi("DELETE", "/api/system-admin/hr-accounts/2")).toBe(false);
  });
});
