import type { Employee, LeaveRequest } from "@shared/schema";
import type { ReportData } from "@/components/hr-report";
import type { LeaveFormSnapshot } from "@shared/hr-leave-form";

const missing = "غير مسجل — يُستكمل من الجهة المختصة";
/** Only wording visually verified against HR-001 V01 is included here.
 * Missing paper-only data is explicit, never a fabricated approval/signature.
 */
export function officialLeaveReport(employee: Employee, leave: LeaveRequest): ReportData {
  const e = employee as Employee & { passportNumber?: string };
  const l = leave as LeaveRequest & Record<string, unknown>;
  const snapshot = l.leaveFormData as LeaveFormSnapshot | null | undefined;
  const captured: Record<string, unknown> = snapshot?.version === 1 ? {
    ...snapshot.submitted,
    substituteEmployeeName: snapshot.substitute?.name,
    substituteEmployeeNumber: snapshot.substitute?.employeeNumber,
    leaveContact: [snapshot.submitted.leaveAddress, snapshot.submitted.leavePhone].filter(Boolean).join(" — "),
    entitlementDate: snapshot.hr.entitlementDate,
    leaveBalance: `${snapshot.hr.leaveBalance} يوم — سنة ${snapshot.hr.year} — لقطة ${snapshot.hr.calculatedAt}`,
    lastReturnDate: snapshot.hr.lastReturnDate,
    lastLeaveType: snapshot.hr.lastLeaveType,
    employeeSignature: snapshot.acknowledgment ? `إقرار إلكتروني عادي بواسطة الموظف #${snapshot.acknowledgment.employeeId} في ${snapshot.acknowledgment.acknowledgedAt}؛ ليس توقيعاً رقمياً مؤهلاً` : undefined,
  } : {};
  const field = (key: string) => {
    const value = captured[key] ?? l[key];
    return value == null || value === "" ? missing : String(value);
  };
  const identity = snapshot?.version === 1 ? snapshot.employee : null;
  return {
    title: "طلب إجازة — HR-001 V01",
    subtitle: `TEAK | سجل الطلب #${leave.id} | ${leave.status} | نسخة بيانات للمراجعة؛ الفراغات ليست اعتماداً أو توقيعاً.`,
    headings: ["القسم / البيان", "القيمة"],
    rows: [
      ["رقم الملف", employee.employeeNumber], ["تاريخ الطلب", leave.createdAt ? new Date(leave.createdAt).toLocaleDateString("en-GB", { timeZone: "Asia/Riyadh" }) : missing],
      ["الاسم", identity?.name || employee.fullNameAr || employee.fullNameEn || missing], ["الرقم الوظيفي", identity?.employeeNumber || employee.employeeNumber],
      ["القسم", identity?.department || employee.department], ["الوظيفة", identity?.position || employee.position], ["رقم الجواز", snapshot?.submitted.passportNumber || e.passportNumber || missing],
      ["الجنسية", identity?.nationality || employee.nationality], ["رقم الهوية", identity?.idNumber || employee.iqamaNumber || missing], ["رقم الجوال", identity?.phone || employee.phone || missing],
      ["نوع الإجازة", String(l.leaveType || missing)], ["تحديد نوع آخر / السبب", leave.reason || "—"],
      ["عدد أيام الإجازة", field("days")], ["أول يوم في الإجازة", leave.startDate], ["آخر يوم في الإجازة", leave.endDate],
      ["الوجهة", field("destination")], ["تاريخ المغادرة", field("actualDepartureDate")], ["تاريخ العودة", field("actualReturnDate")],
      ["الموظف البديل — الاسم", field("substituteEmployeeName")], ["الموظف البديل — الرقم الوظيفي", field("substituteEmployeeNumber")], ["الموظف البديل — التوقيع", field("substituteSignature")],
      ["إقرار الموظف (النص الرسمي)", "أتعهد أنا الموقع أدناه بالالتزام بمواعيد عودتي من الإجازة المعتمدة."],
      ["العنوان ورقم الهاتف أثناء الإجازة", field("leaveContact")], ["توقيع الموظف", field("employeeSignature")],
      ["تاريخ الاستحقاق", field("entitlementDate")], ["رصيد الإجازة", field("leaveBalance")],
      ["تاريخ العودة من آخر إجازة", field("lastReturnDate")], ["نوع آخر إجازة", field("lastLeaveType")],
      ["اعتماد المدير المباشر", leave.managerApprovedBy ? `مراجع #${leave.managerApprovedBy} — ${leave.managerApprovedDate || missing} (قرار إلكتروني، ليس توقيعاً)` : missing],
      ["اعتماد إدارة الموارد البشرية", leave.approvedBy ? `مراجع #${leave.approvedBy} — ${leave.approvedDate || missing} — ${leave.status} (قرار إلكتروني، ليس توقيعاً)` : missing],
      ["اعتماد المدير العام", field("generalManagerApproval")],
      ["ملاحظات", field("notes")],
      ["التذاكر / التأشيرة (طلب إضافي، غير موجود في نسخة HR-001 المرفقة)", snapshot ? `${snapshot.submitted.ticketDetails || "—"} / ${snapshot.submitted.visaDetails || "—"}` : "غير متاح في السجل الحالي"],
      ["قاعدة التوقيع الورقي في الأصل", "التوقيع باللون الأسود يلغي المعاملة — قاعدة ورقية؛ لا يُفترض لها مقابل إلكتروني دون اعتماد."],
    ],
  };
}
