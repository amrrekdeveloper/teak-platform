// تعريفات مسارات HR الموحّدة (WF-02..WF-10). WF-01 غير معرّف ولا تُخترع له قواعد.
// الحالات الموحّدة (القسم 3): pending / in_progress / approved / rejected / completed / cancelled

export type HrStepRole = "manager" | "hr" | "owner" | "employee";

export function canPerformAdministrativeHrStep(
  role: string, step: HrStepRole, hasEmployee: boolean, hasManager: boolean, isAssignedManager: boolean,
): boolean {
  const hr = ["owner", "assistant", "hr"].includes(role);
  if (step === "employee") return false;
  if (step === "owner") return ["owner", "assistant"].includes(role);
  if (step === "hr") return hr;
  return hasEmployee && (hasManager ? isAssignedManager : hr);
}

export interface HrWorkflowStep {
  key: string;
  labelAr: string;
  labelEn: string;
  role: HrStepRole; // المسؤول عن الخطوة
  kind: "approve" | "acknowledge" | "execute"; // اعتماد / إقرار-توقيع / تنفيذ
}

export interface HrFieldDef {
  key: string;
  labelAr: string;
  labelEn: string;
  type: "text" | "textarea" | "date" | "number" | "select";
  required?: boolean;
  options?: { value: string; labelAr: string; labelEn: string }[];
}

export interface HrWorkflowDef {
  code: string;
  tab: "prehire" | "documents" | "leaves" | "requests" | "penalties";
  nameAr: string;
  nameEn: string;
  fields: HrFieldDef[];
  steps: HrWorkflowStep[];
  autoNext?: string; // عند الاكتمال يُنشأ هذا المسار تلقائياً
}

export const HR_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  pending: { ar: "معلّق", en: "Pending" },
  in_progress: { ar: "قيد التنفيذ", en: "In Progress" },
  approved: { ar: "معتمد", en: "Approved" },
  rejected: { ar: "مرفوض", en: "Rejected" },
  completed: { ar: "مكتمل", en: "Completed" },
  cancelled: { ar: "ملغى", en: "Cancelled" },
};

const terminationReasonOptions = [
  { value: "probation", labelAr: "فترة تجربة", labelEn: "Probation" },
  { value: "cause", labelAr: "بسبب", labelEn: "For cause" },
  { value: "resignation", labelAr: "استقالة", labelEn: "Resignation" },
  { value: "other", labelAr: "أخرى", labelEn: "Other" },
];

export const HR_WORKFLOWS: Record<string, HrWorkflowDef> = {
  // ---- Pre-hire ----
  "wf02": {
    code: "wf02", tab: "prehire", nameAr: "عرض وظيفي", nameEn: "Job Offer",
    fields: [
      { key: "candidateName", labelAr: "اسم المرشح", labelEn: "Candidate name", type: "text", required: true },
      { key: "candidatePhone", labelAr: "جوال المرشح", labelEn: "Candidate phone", type: "text", required: true },
      { key: "position", labelAr: "المسمى الوظيفي", labelEn: "Position", type: "text", required: true },
      { key: "department", labelAr: "القسم", labelEn: "Department", type: "select", required: true, options: [
        { value: "sales", labelAr: "المبيعات", labelEn: "Sales" },
        { value: "design", labelAr: "التصميم", labelEn: "Design" },
        { value: "production", labelAr: "الإنتاج", labelEn: "Production" },
        { value: "warehouse", labelAr: "المستودع", labelEn: "Warehouse" },
        { value: "finance", labelAr: "المالية", labelEn: "Finance" },
        { value: "hr", labelAr: "الموارد البشرية", labelEn: "HR" },
        { value: "it", labelAr: "تقنية المعلومات", labelEn: "IT" },
        { value: "delivery", labelAr: "التوصيل", labelEn: "Delivery" },
      ]},
      { key: "nationality", labelAr: "الجنسية", labelEn: "Nationality", type: "select", required: true, options: [
        { value: "saudi", labelAr: "سعودي", labelEn: "Saudi" },
        { value: "resident", labelAr: "مقيم", labelEn: "Resident" },
      ]},
      { key: "monthlySalary", labelAr: "الراتب الشهري", labelEn: "Monthly salary", type: "number", required: true },
      { key: "offerDate", labelAr: "تاريخ العرض", labelEn: "Offer date", type: "date", required: true },
      { key: "notes", labelAr: "ملاحظات", labelEn: "Notes", type: "textarea" },
    ],
    steps: [
      { key: "hr_prepare", labelAr: "إعداد العرض (HR)", labelEn: "Prepare offer (HR)", role: "hr", kind: "execute" },
      { key: "owner_approve", labelAr: "اعتماد المالك/الإدارة", labelEn: "Owner approval", role: "owner", kind: "approve" },
      { key: "candidate_accept", labelAr: "قبول المرشح (توقيع)", labelEn: "Candidate acceptance", role: "employee", kind: "acknowledge" },
    ],
    autoNext: "wf03",
  },
  "wf03": {
    code: "wf03", tab: "prehire", nameAr: "مباشرة عمل", nameEn: "Onboarding",
    fields: [
      { key: "startDate", labelAr: "تاريخ المباشرة", labelEn: "Start date", type: "date", required: true },
      { key: "notes", labelAr: "ملاحظات", labelEn: "Notes", type: "textarea" },
    ],
    steps: [
      { key: "employee_start", labelAr: "مباشرة الموظف (إقرار)", labelEn: "Employee start (sign)", role: "employee", kind: "acknowledge" },
      { key: "hr_confirm", labelAr: "تأكيد HR وفتح الملف", labelEn: "HR confirm & open file", role: "hr", kind: "approve" },
    ],
  },
  // ---- الإجازات والدوام ----
  "wf04": {
    code: "wf04", tab: "leaves", nameAr: "عودة من إجازة", nameEn: "Return from Leave",
    fields: [
      { key: "returnDate", labelAr: "تاريخ العودة الفعلي", labelEn: "Actual return date", type: "date", required: true },
      { key: "notes", labelAr: "ملاحظات", labelEn: "Notes", type: "textarea" },
    ],
    steps: [
      { key: "employee_report", labelAr: "إشعار العودة (الموظف)", labelEn: "Return notice (employee)", role: "employee", kind: "acknowledge" },
      { key: "manager_confirm", labelAr: "تأكيد المدير المباشر", labelEn: "Manager confirmation", role: "manager", kind: "approve" },
      { key: "hr_close", labelAr: "إغلاق HR وتحديث السجل", labelEn: "HR closure", role: "hr", kind: "approve" },
    ],
  },
  "wf09": {
    code: "wf09", tab: "leaves", nameAr: "مخالصة إجازة", nameEn: "Leave Settlement",
    fields: [
      { key: "leavePeriod", labelAr: "فترة الإجازة", labelEn: "Leave period", type: "text", required: true },
      { key: "amount", labelAr: "مبلغ المخالصة (ر.س)", labelEn: "Settlement amount (SAR)", type: "number", required: true },
      { key: "notes", labelAr: "ملاحظات", labelEn: "Notes", type: "textarea" },
    ],
    steps: [
      { key: "hr_prepare", labelAr: "إعداد المخالصة (HR)", labelEn: "Prepare settlement (HR)", role: "hr", kind: "execute" },
      // تصحيح القسم 4: خطوة الموظف إقرار/توقيع وليست اعتماداً
      { key: "employee_sign", labelAr: "إقرار وتوقيع الموظف", labelEn: "Employee sign-off", role: "employee", kind: "acknowledge" },
      { key: "hr_approve", labelAr: "اعتماد HR النهائي", labelEn: "HR final approval", role: "hr", kind: "approve" },
    ],
  },
  // ---- الطلبات والإنهاء ----
  "wf05": {
    code: "wf05", tab: "requests", nameAr: "إنهاء خدمات", nameEn: "Termination",
    fields: [
      { key: "reason", labelAr: "سبب الإنهاء", labelEn: "Reason", type: "select", required: true, options: terminationReasonOptions },
      { key: "lastWorkingDay", labelAr: "آخر يوم عمل", labelEn: "Last working day", type: "date", required: true },
      { key: "notes", labelAr: "ملاحظات", labelEn: "Notes", type: "textarea" },
    ],
    // تصحيح القسم 4: بلا شرط 60 يوماً (انتقل إلى WF-06)
    steps: [
      { key: "hr_prepare", labelAr: "إعداد الإنهاء (HR)", labelEn: "Prepare termination (HR)", role: "hr", kind: "execute" },
      { key: "owner_approve", labelAr: "اعتماد المالك/الإدارة", labelEn: "Owner approval", role: "owner", kind: "approve" },
      { key: "employee_notify", labelAr: "تبليغ الموظف (إقرار)", labelEn: "Notify employee (sign)", role: "employee", kind: "acknowledge" },
    ],
    autoNext: "wf07",
  },
  "wf06": {
    code: "wf06", tab: "requests", nameAr: "عدم تجديد عقد", nameEn: "Non-renewal",
    fields: [
      { key: "contractEnd", labelAr: "تاريخ انتهاء العقد", labelEn: "Contract end date", type: "date", required: true },
      { key: "noticeDate", labelAr: "تاريخ التبليغ (قبل 60 يوماً)", labelEn: "Notice date (60 days prior)", type: "date", required: true },
      { key: "notes", labelAr: "ملاحظات", labelEn: "Notes", type: "textarea" },
    ],
    steps: [
      { key: "hr_prepare", labelAr: "إعداد إشعار عدم التجديد (HR)", labelEn: "Prepare non-renewal notice (HR)", role: "hr", kind: "execute" },
      { key: "owner_approve", labelAr: "اعتماد المالك/الإدارة", labelEn: "Owner approval", role: "owner", kind: "approve" },
      { key: "employee_notify", labelAr: "تبليغ الموظف (إقرار)", labelEn: "Notify employee (sign)", role: "employee", kind: "acknowledge" },
    ],
    autoNext: "wf05",
  },
  "wf06b": {
    code: "wf06b", tab: "requests", nameAr: "طلب عدم تجديد (من الموظف)", nameEn: "Non-renewal (employee request)",
    fields: [
      { key: "contractEnd", labelAr: "تاريخ انتهاء العقد", labelEn: "Contract end date", type: "date", required: true },
      { key: "notes", labelAr: "سبب/ملاحظات", labelEn: "Reason/notes", type: "textarea" },
    ],
    steps: [
      { key: "employee_request", labelAr: "طلب الموظف (إقرار)", labelEn: "Employee request (sign)", role: "employee", kind: "acknowledge" },
      { key: "manager_review", labelAr: "مراجعة المدير المباشر", labelEn: "Manager review", role: "manager", kind: "approve" },
      { key: "hr_approve", labelAr: "اعتماد HR", labelEn: "HR approval", role: "hr", kind: "approve" },
    ],
    autoNext: "wf05",
  },
  "wf07": {
    code: "wf07", tab: "requests", nameAr: "إقرار مستحقات", nameEn: "Dues Acknowledgment",
    fields: [
      { key: "amount", labelAr: "إجمالي المستحقات (ر.س)", labelEn: "Total dues (SAR)", type: "number", required: true },
      { key: "details", labelAr: "تفاصيل المستحقات", labelEn: "Dues details", type: "textarea" },
    ],
    steps: [
      { key: "hr_prepare", labelAr: "احتساب المستحقات (HR)", labelEn: "Compute dues (HR)", role: "hr", kind: "execute" },
      { key: "employee_sign", labelAr: "إقرار وتوقيع الموظف", labelEn: "Employee sign-off", role: "employee", kind: "acknowledge" },
      { key: "hr_close", labelAr: "اعتماد وإغلاق (HR)", labelEn: "HR approve & close", role: "hr", kind: "approve" },
    ],
  },
  // ---- المستندات ----
  "wf08": {
    code: "wf08", tab: "documents", nameAr: "اتفاقية سرية المعلومات", nameEn: "NDA / Confidentiality",
    fields: [
      { key: "agreementDate", labelAr: "تاريخ الاتفاقية", labelEn: "Agreement date", type: "date", required: true },
      { key: "notes", labelAr: "ملاحظات", labelEn: "Notes", type: "textarea" },
    ],
    steps: [
      { key: "hr_prepare", labelAr: "إعداد الاتفاقية (HR)", labelEn: "Prepare agreement (HR)", role: "hr", kind: "execute" },
      { key: "employee_sign", labelAr: "توقيع الموظف (إقرار)", labelEn: "Employee signature", role: "employee", kind: "acknowledge" },
      { key: "hr_archive", labelAr: "أرشفة HR", labelEn: "HR archive", role: "hr", kind: "approve" },
    ],
  },
  // ---- الجزاءات ----
  "wf10": {
    code: "wf10", tab: "penalties", nameAr: "إنذار / مخالفة", nameEn: "Warning / Violation",
    fields: [
      { key: "violationType", labelAr: "نوع المخالفة", labelEn: "Violation type", type: "select", required: true, options: [
        { value: "attendance", labelAr: "حضور وانصراف", labelEn: "Attendance" },
        { value: "conduct", labelAr: "سلوك", labelEn: "Conduct" },
        { value: "performance", labelAr: "أداء", labelEn: "Performance" },
        { value: "safety", labelAr: "سلامة", labelEn: "Safety" },
        { value: "other", labelAr: "أخرى", labelEn: "Other" },
      ]},
      { key: "level", labelAr: "الدرجة", labelEn: "Level", type: "select", required: true, options: [
        { value: "notice", labelAr: "لفت نظر", labelEn: "Notice" },
        { value: "warning1", labelAr: "إنذار أول", labelEn: "First warning" },
        { value: "warning2", labelAr: "إنذار ثانٍ", labelEn: "Second warning" },
        { value: "final", labelAr: "إنذار نهائي", labelEn: "Final warning" },
      ]},
      { key: "incidentDate", labelAr: "تاريخ الواقعة", labelEn: "Incident date", type: "date", required: true },
      { key: "description", labelAr: "وصف المخالفة", labelEn: "Description", type: "textarea", required: true },
    ],
    steps: [
      { key: "manager_report", labelAr: "رفع المخالفة (المدير)", labelEn: "Report (manager)", role: "manager", kind: "execute" },
      { key: "hr_approve", labelAr: "اعتماد HR", labelEn: "HR approval", role: "hr", kind: "approve" },
      { key: "employee_sign", labelAr: "تبليغ وتوقيع الموظف", labelEn: "Employee notified (sign)", role: "employee", kind: "acknowledge" },
    ],
  },
};

export const HR_TABS: { key: string; labelAr: string; labelEn: string }[] = [
  { key: "basic", labelAr: "البيانات الأساسية والعقد", labelEn: "Basic Info & Contract" },
  { key: "documents", labelAr: "المستندات وسرية المعلومات", labelEn: "Documents & Confidentiality" },
  { key: "assets", labelAr: "العهد", labelEn: "Custody" },
  { key: "leaves", labelAr: "الإجازات والدوام", labelEn: "Leaves & Attendance" },
  { key: "requests", labelAr: "الطلبات والإنهاء", labelEn: "Requests & Termination" },
  { key: "penalties", labelAr: "الجزاءات والمخالفات", labelEn: "Penalties & Violations" },
];
