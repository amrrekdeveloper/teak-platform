import type { Employee } from "@shared/schema";

export const employeeHeadings = ["رقم الموظف", "الاسم بالعربية", "الاسم بالإنجليزية", "القسم", "المسمى الوظيفي", "الجوال", "البريد الإلكتروني", "الجنسية", "الهوية / الإقامة", "بداية العقد", "نهاية العقد", "الراتب الشهري", "الحالة"];
export function employeeExportRow(e: Employee): (string | number)[] {
  return [e.employeeNumber, e.fullNameAr || "", e.fullNameEn || "", e.department || "", e.position || "", e.phone || "", e.email || "", e.nationality || "", e.iqamaNumber || "", e.contractStart || "", e.contractEnd || "", Number(e.monthlySalary || 0), e.status];
}
export function uniqueSheetName(raw: string, used: Set<string>): string {
  const base = (raw.replace(/[\\/*?:[\]]/g, " ").replace(/^'+|'+$/g, "").trim() || "غير محدد").slice(0, 31);
  let name = base, i = 1;
  while (used.has(name.toLowerCase())) { const suffix = ` (${i++})`; name = base.slice(0, 31 - suffix.length) + suffix; }
  used.add(name.toLowerCase());
  return name;
}
export async function buildEmployeeWorkbook(employees: Employee[], department?: string) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TEAK";
  const used = new Set<string>();
  const add = (name: string, entries: Employee[]) => {
    const sheet = workbook.addWorksheet(uniqueSheetName(name, used), { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
    sheet.addRow(employeeHeadings);
    entries.forEach(e => sheet.addRow(employeeExportRow(e)));
    sheet.columns.forEach((column, i) => { column.width = [18, 32, 32, 22, 26, 20, 34, 18, 22, 18, 18, 20, 18][i]; });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF891B32" } };
    sheet.eachRow(row => { row.alignment = { horizontal: "right", vertical: "middle", wrapText: true }; row.height = 30; });
    sheet.getColumn(12).numFmt = '#,##0.00';
    sheet.autoFilter = { from: "A1", to: "M1" };
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:1" };
    sheet.headerFooter.oddFooter = `TEAK | عدد الموظفين: ${entries.length} | &P / &N`;
  };
  if (department !== undefined) add(department || "غير محدد", employees.filter(e => (e.department || "") === department));
  else {
    add("المصنع", employees);
    Array.from(new Set(employees.map(e => e.department || ""))).sort().forEach(d => add(d || "غير محدد", employees.filter(e => (e.department || "") === d)));
  }
  return workbook;
}
export async function exportEmployeeWorkbook(employees: Employee[], department?: string) {
  const workbook = await buildEmployeeWorkbook(employees, department);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = "TEAK-employees.xlsx"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
