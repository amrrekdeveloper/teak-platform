import { describe, expect, it, vi } from "vitest";
vi.mock("./db", () => ({ pool: {} }));
import { annualUsage, annualEntitlementAt, requestStage, acknowledgmentDocument, canonicalDocument } from "./hr-workflow-support";
import { canPerformAdministrativeHrStep } from "../shared/hr-workflows";

describe("HR workflow invariants", () => {
  it("never allows HR or owner to impersonate employee acknowledgment", () => {
    for (const role of ["owner","assistant","hr","sales"])
      expect(canPerformAdministrativeHrStep(role,"employee",true,true,true)).toBe(false);
    expect(canPerformAdministrativeHrStep("hr","owner",true,false,false)).toBe(false);
    expect(canPerformAdministrativeHrStep("owner","owner",true,false,false)).toBe(true);
  });
  it("checks actual manager relationship, with HR fallback only when absent", () => {
    expect(canPerformAdministrativeHrStep("hr","manager",true,true,false)).toBe(false);
    expect(canPerformAdministrativeHrStep("sales","manager",true,true,true)).toBe(true);
    expect(canPerformAdministrativeHrStep("sales","manager",true,true,false)).toBe(false);
    expect(canPerformAdministrativeHrStep("hr","manager",true,false,false)).toBe(true);
  });
  it("splits cross-year annual leave and deduplicates overlapping approved dates", () => {
    const rows = [
      {startDate:"2025-12-30",endDate:"2026-01-03",status:"approved",leaveType:"annual"},
      {startDate:"2026-01-02",endDate:"2026-01-04",status:"approved",leaveType:"annual"},
      {startDate:"2026-01-05",endDate:"2026-01-09",status:"pending",leaveType:"annual"},
      {startDate:"2026-01-05",endDate:"2026-01-09",status:"approved",leaveType:"sick"},
    ];
    expect(annualUsage(rows,2025)).toBe(2);
    expect(annualUsage(rows,2026)).toBe(4);
  });
  it("uses the actual fifth anniversary, not approximate years", () => {
    expect(annualEntitlementAt("2021-06-15","2026-06-14")).toBe(21);
    expect(annualEntitlementAt("2021-06-15","2026-06-15")).toBe(30);
  });
  it("does not permit HR to skip manager stage, including clarification", () => {
    expect(requestStage("pending",true,false)).toBe("manager");
    expect(requestStage("clarification_requested",true,false)).toBe("manager");
    expect(requestStage("clarification_requested",true,true)).toBe("hr");
    expect(requestStage("pending",false,false)).toBe("hr");
    expect(requestStage("manager_approved",true,false)).toBe("hr");
  });
  it("binds evidence to exact document, employee, action and step", () => {
    const action = { id:3,workflow:"wf08",current_step:1,employee_id:7,form_data:{agreementDate:"2026-01-01"},updated_at:"2026-01-01" };
    const original=acknowledgmentDocument(action);
    for(const change of [{id:4},{employee_id:8},{current_step:2},{form_data:{agreementDate:"2026-01-02"}}])
      expect(acknowledgmentDocument({...action,...change}).version).not.toBe(original.version);
    expect(original.document.mechanism).toBe("ordinary-electronic-acknowledgment");
    expect(canonicalDocument({b:2,a:1})).toBe(canonicalDocument({a:1,b:2}));
  });
});
