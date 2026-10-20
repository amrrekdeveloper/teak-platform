import type { Employee, HrAction } from "@shared/schema";
import type { ReportData } from "@/components/hr-report";

/** Field mapping from مباشرة_جديد_1781419263295.docx, not invented legal text. */
export function commencementReport(action: HrAction, employee?: Employee, linkedOffer?: HrAction): ReportData {
  const data = { ...(linkedOffer?.formData as Record<string, unknown> || {}), ...(action.formData as Record<string, unknown> || {}) };
  const timeline = (action.timeline as Record<string, unknown>[] || []);
  const value = (key: string) => data[key] == null || data[key] === "" ? "غير مسجل" : String(data[key]);
  const stepEvidence = (key: string) => {
    const event = timeline.find(e => e.stepKey === key || e.step === key || e.key === key);
    if (!event) return "لم يسجل قرار أو إقرار؛ لا يوجد توقيع مستنتج";
    return Object.entries(event).filter(([k]) => ["action", "byName", "byEmployeeId", "actorId", "userId", "employeeId", "decision", "at", "timestamp", "note", "actorType", "actorName", "byUserId", "date", "doneAt"].includes(k)).map(([k, v]) => `${k}: ${String(v)}`).join(" | ") || "حدث في سجل المسار؛ راجع الأدلة الأصلية";
  };
  const name = employee?.fullNameAr || employee?.fullNameEn || value("candidateNameAr");
  return {
    title: "إشعار مباشرة عمل — Effective Date Notice",
    subtitle: `المصدر: مباشرة جديد DOCX | WF-03 #${action.id} | ${action.status} | سجل بيانات وقرارات؛ ليس توقيعاً رقمياً مؤهلاً. رقم HR-APP-0015.01 لم يُثبت في الأصل المرفق.`,
    headings: ["البيان في الأصل", "القيمة / دليل القرار"],
    rows: [
      ["اسم الموظف / Name", name], ["الرقم الوظيفي / Employee ID", employee?.employeeNumber || value("employeeNumber")],
      ["المسمى الوظيفي / Position", employee?.position || value("position")],
      ["تاريخ المباشرة / Hiring date", value("startDate")],
      ["توقيع الموظف / Employee Signature", stepEvidence("employee_start")],
      ["الجنسية / Nationality", employee?.nationality || value("nationality")],
      ["إلى شؤون الموظفين / TO: personnel Department", "نأمل اعتماد مباشرة للعمل الموظف:"],
      ["اسم الموظف في خطاب المباشرة", name],
      ["مدير القسم — الاسم", value("departmentManagerName")],
      ["مدير القسم — التوقيع", "غير مسجل — لا يتضمن WF-03 الحالي خطوة اعتماد لمدير القسم"],
      ["مدير القسم — التاريخ", value("departmentManagerDate")],
      ["النص الوارد في الأصل", "المذكور باشر العمل في التاريخ المحدد ويدرج اسمه بكشوفات الرواتب اعتباراً من:"],
      ["تاريخ الإدراج بكشوفات الرواتب", value("payrollEffectiveDate")],
      ["قسم الموارد البشرية / HR Recommendation", value("notes")],
      ["تم التعيين / Approved — مرفوض / Rejected", action.status === "completed" ? "تم التعيين — اكتمال المسار" : action.status === "rejected" ? "مرفوض" : "لم يكتمل الاعتماد"],
      ["مدير الموارد البشرية / HR Director", stepEvidence("hr_confirm")],
    ],
  };
}
