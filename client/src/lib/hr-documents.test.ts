import { describe, expect, it } from "vitest";
import type { Employee, LeaveRequest } from "@shared/schema";
import { buildEmployeeWorkbook, uniqueSheetName } from "./hr-employee-export";
import { officialLeaveReport } from "./hr-official-forms";
import { commencementReport } from "./hr-commencement-report";
import type { HrAction } from "@shared/schema";

const employee = (id: number, department: string) => ({
  id, employeeNumber: `T-${id}`, fullNameAr: `موظف اختبار ${id}`, fullNameEn: "=1+1",
  department, position: "اختبار", monthlySalary: "1234.50", status: "active",
  phone: "0500000000", contractStart: "2026-01-01", nationality: "saudi",
} as Employee);

describe("HR employee workbook", () => {
  it("creates real XLSX with the all-employees master and department tabs", async () => {
    const workbook = await buildEmployeeWorkbook([employee(1, "hr"), employee(2, "sales"), employee(3, "hr")]);
    expect(workbook.worksheets.map(s => s.name)).toEqual(["المصنع", "hr", "sales"]);
    expect(workbook.getWorksheet("المصنع")?.rowCount).toBe(4);
    expect(workbook.getWorksheet("hr")?.rowCount).toBe(3);
    expect(workbook.getWorksheet("hr")?.views[0].rightToLeft).toBe(true);
    expect(workbook.getWorksheet("المصنع")?.getCell("C2").value).toBe("=1+1");
    expect(workbook.getWorksheet("المصنع")?.getCell("L2").value).toBe(1234.5);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
  });
  it("department export excludes everyone else", async () => {
    const workbook = await buildEmployeeWorkbook([employee(1, "hr"), employee(2, "sales")], "hr");
    expect(workbook.worksheets).toHaveLength(1);
    expect(workbook.worksheets[0].rowCount).toBe(2);
    expect(workbook.worksheets[0].getCell("A2").value).toBe("T-1");
  });
  it("deduplicates legal sheet names without truncation collisions", () => {
    const used = new Set<string>(["المصنع"]);
    expect(uniqueSheetName("المصنع", used)).toBe("المصنع (1)");
    expect(uniqueSheetName("a/b?c", used)).toBe("a b c");
    const a = uniqueSheetName("x".repeat(40), used);
    const b = uniqueSheetName("x".repeat(40), used);
    expect(a.length).toBeLessThanOrEqual(31);
    expect(b.length).toBeLessThanOrEqual(31);
    expect(a).not.toBe(b);
  });
});

describe("official leave field mapping", () => {
  it("preserves official acknowledgment and does not manufacture signatures", () => {
    const report = officialLeaveReport(employee(1, "hr"), {
      id: 2, employeeId: 1, leaveType: "annual", startDate: "2026-01-01", endDate: "2026-01-03",
      days: 3, status: "approved", managerApprovedBy: 22, managerApprovedDate: "2025-12-20",
    } as LeaveRequest);
    const fields = new Map(report.rows.map(row => [row[0], row[1]]));
    expect(fields.get("عدد أيام الإجازة")).toBe("3");
    expect(fields.get("الرقم الوظيفي")).toBe("T-1");
    expect(fields.get("توقيع الموظف")).toContain("غير مسجل");
    expect(fields.get("اعتماد المدير المباشر")).toContain("#22");
    expect(fields.get("اعتماد المدير المباشر")).toContain("ليس توقيعاً");
    expect(fields.get("إقرار الموظف (النص الرسمي)")).toBe("أتعهد أنا الموقع أدناه بالالتزام بمواعيد عودتي من الإجازة المعتمدة.");
    expect(report.rows).toHaveLength(34);
  });
});

describe("available commencement DOCX mapping", () => {
  it("prints all source fields with actual workflow evidence and no invented signature", () => {
    const report = commencementReport({
      id: 44, status: "completed", workflow: "wf03",
      formData: { startDate: "2026-04-01", notes: "تمت المراجعة" },
      timeline: [{ step: "employee_start", action: "acknowledge", byEmployeeId: 1, at: "2026-04-01T08:00:00Z" }],
    } as unknown as HrAction, employee(1, "hr"));
    const fields = new Map(report.rows.map(row => [row[0], row[1]]));
    expect(report.rows).toHaveLength(16);
    expect(fields.get("تاريخ المباشرة / Hiring date")).toBe("2026-04-01");
    expect(fields.get("توقيع الموظف / Employee Signature")).toContain("byEmployeeId: 1");
    expect(fields.get("مدير القسم — التوقيع")).toContain("غير مسجل");
    expect(fields.get("تاريخ الإدراج بكشوفات الرواتب")).toBe("غير مسجل");
  });
});
