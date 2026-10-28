export type HrHelpLink = {
  href: string;
  permission: string;
  labelAr: string;
  labelEn: string;
};

export type HrHelpSection = {
  id: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  pointsAr: string[];
  pointsEn: string[];
  links: HrHelpLink[];
};

export type HrHelpIdentity = {
  role?: string;
  maintenanceScope?: string;
  permissions?: string[];
};

export const HR_HELP_SECTIONS: HrHelpSection[] = [
  {
    id: "employees",
    titleAr: "ملف الموظف وموقع العمل",
    titleEn: "Employee record & workplace",
    bodyAr: "من الموظفون حدّث بيانات الشخص، ثم عيّن موقع العمل وجدول الدوام من إعدادات الحضور. ملاحظة السكن القديمة نصّ فقط وليست تعيينًا لموقع.",
    bodyEn: "In Employees, maintain the person’s record, then assign a workplace and attendance schedule in Attendance settings. A legacy home-location note is text, not a workplace assignment.",
    pointsAr: [
      "وضع السماح من أي موقع يزيل شرط النطاق فقط؛ تظل الإحداثيات الدقيقة محفوظة.",
      "الجداول المرتبطة بموقع تظهر بحسب موقع الموظف المعيّن.",
    ],
    pointsEn: [
      "Allow-from-anywhere removes the geofence requirement only; precise coordinates are still recorded.",
      "Location-scoped schedules are offered according to the employee’s assigned workplace.",
    ],
    links: [
      { href: "/employees", permission: "/employees", labelAr: "الموظفون", labelEn: "Employees" },
      { href: "/attendance-settings", permission: "/attendance-settings", labelAr: "إعدادات الدوام", labelEn: "Attendance settings" },
    ],
  },
  {
    id: "workdays",
    titleAr: "أيام العمل والجدول",
    titleEn: "Workdays & schedules",
    bodyAr: "تغييرات أسبوع العمل تتطلب معاينة ثم تأكيدًا. اختر تاريخ السريان والنطاق بعناية؛ السياسة العامة تشمل الموظفين الجدد، والتغييرات الفردية المستقبلية تبقى محفوظة.",
    bodyEn: "Workweek changes require preview and confirmation. Check the effective date and scope: the general policy also applies to new employees, while scheduled individual changes remain in place.",
    pointsAr: [
      "اقتراح البداية المعروض هو الأحد إلى الخميس والسبت عمل، والجمعة راحة؛ إنه خيار اعتماد أولي وليس قاعدة عامة مفروضة.",
      "عند مراجعة يوم سابق، غياب الجدول التاريخي يعني أن التصنيف غير معروف؛ لا يُنشأ جدول تاريخي افتراضي.",
    ],
    pointsEn: [
      "The initial setup proposal is Sunday–Thursday and Saturday as workdays, with Friday as rest; it is a bootstrap choice, not a universal rule.",
      "When reviewing a past day, a missing historical schedule means the classification is unknown; the system does not invent a historical schedule.",
    ],
    links: [
      { href: "/attendance-settings", permission: "/attendance-settings", labelAr: "إعدادات الدوام", labelEn: "Attendance settings" },
      { href: "/attendance-monitor", permission: "/attendance-monitor", labelAr: "مراقبة الدوام", labelEn: "Attendance" },
    ],
  },
  {
    id: "movements",
    titleAr: "تصحيح حركات الحضور",
    titleEn: "Correct attendance movements",
    bodyAr: "من مراقبة الدوام افتح تصحيح الحركات. الإضافة والتعديل والاستبعاد والاستعادة إجراءات منفصلة، وكل تصحيح يحتاج سببًا محفوظًا في سجل التدقيق.",
    bodyEn: "From Attendance, open movement corrections. Adding, editing, excluding, and restoring are distinct actions; each correction requires a reason recorded in the audit trail.",
    pointsAr: [
      "التعديل يتطلب وقتًا داخل يوم العمل المحدد وليس في المستقبل، ويحافظ النظام على تسلسل الحركات.",
      "الحركة المستبعدة لا تُحذف ويمكن استعادتها؛ أعدها قبل محاولة تعديلها.",
      "العذر أو التجاوز الإداري إجراء مختلف عن تصحيح الحركة. راجع النوع والسبب قبل الحفظ.",
    ],
    pointsEn: [
      "An edited time must stay within the selected business day and not be in the future; movement order is validated.",
      "An excluded movement is not deleted and can be restored; restore it before editing.",
      "An excuse or administrative override is separate from movement correction. Verify the action and reason before saving.",
    ],
    links: [
      { href: "/attendance-monitor", permission: "/attendance-monitor", labelAr: "مراقبة الدوام", labelEn: "Attendance" },
      { href: "/attendance-monitor/approvals", permission: "/attendance-monitor/approvals", labelAr: "موافقات الحضور", labelEn: "Attendance approvals" },
    ],
  },
  {
    id: "requests",
    titleAr: "الطلبات والمرفقات والإلغاء",
    titleEn: "Requests, attachments & cancellation",
    bodyAr: "تُراجع الإجازات والاستئذانات حسب حالة الطلب ومرحلة المراجعة. افتح تفاصيل الطلب لمراجعة المرفقات وسجل القرارات قبل اتخاذ الإجراء.",
    bodyEn: "Leave and permission requests are reviewed according to status and review stage. Open request details to review attachments and decision history before acting.",
    pointsAr: [
      "قد يمر الطلب على المدير المباشر أولًا. إن لم يوجد مدير مرتبط بالموظف فالمراجعة للموارد البشرية؛ وإذا تعذر تحديد المرحلة، لا يمكن إصدار قرار من شاشة المراجعة.",
      "يمكن للتدخل الإداري تجاوز مرحلة المدير صراحةً مع تسجيل سبب لا يقل عن 3 أحرف.",
      "مرفق الإجازة اختياري: PDF أو صورة JPEG/PNG حتى 5 ميغابايت.",
      "إلغاء الإجازة يتطلب سببًا من 3 أحرف على الأقل، وهو نهائي مع الاحتفاظ بالسجل؛ قد يغيّر الحضور ورصيد الإجازة ولا يحدّث الرواتب تلقائيًا.",
    ],
    pointsEn: [
      "A request may go to the line manager first. Without a linked manager, HR reviews it; if the stage cannot be determined, the review screen does not allow a decision.",
      "An explicit administrative override can bypass the manager stage when a reason of at least 3 characters is recorded.",
      "A leave attachment is optional: PDF or JPEG/PNG image up to 5 MB.",
      "Leave cancellation requires a reason of at least 3 characters and is final with history retained. It may affect attendance and leave balance; payroll is not updated automatically.",
    ],
    links: [
      { href: "/requests", permission: "/requests", labelAr: "مركز الطلبات", labelEn: "Requests center" },
      { href: "/leaves", permission: "/leaves", labelAr: "الإجازات", labelEn: "Leaves" },
      { href: "/permissions", permission: "/permissions", labelAr: "الاستئذانات", labelEn: "Permissions" },
    ],
  },
  {
    id: "reports",
    titleAr: "التقارير والتصدير",
    titleEn: "Reports & export",
    bodyAr: "اختر نوع التقرير والفترة ثم اعرض النتائج. التقارير تقبل فترة بحد أقصى 366 يومًا، ويمكن تصدير CSV المتوافق مع Excel أو الطباعة.",
    bodyEn: "Choose a report type and date range, then view the results. Reports accept a range of up to 366 days and can be exported as Excel-compatible CSV or printed.",
    pointsAr: [
      "التصدير يتضمن الحقول الظاهرة في التقرير؛ تعامل مع ملفات الموظفين والرواتب كبيانات داخلية.",
      "يمكن عرض سجل التدقيق من أنواع التقارير المتاحة.",
    ],
    pointsEn: [
      "Exports include the report fields; handle employee and payroll files as internal data.",
      "Audit log is available as a report type.",
    ],
    links: [{ href: "/reports", permission: "/reports", labelAr: "مركز التقارير", labelEn: "Reports" }],
  },
  {
    id: "employee-file",
    titleAr: "ملف الموظف والوثائق والعهد",
    titleEn: "Employee file, documents & custody",
    bodyAr: "افتح الموظفين ثم ملف الموظف الصحيح. راجع الرقم الوظيفي قبل تعديل البيانات أو رفع أي مستند.",
    bodyEn: "Open Employees, then the correct employee file. Check the employee number before editing data or uploading a document.",
    pointsAr: [
      "تُفصل المستندات والعهد والإجازات والطلبات داخل تبويبات الملف. راجع نتيجة الرفع والمعاينة قبل مغادرة الصفحة.",
      "إذا تعذّر فتح مرفق، أعد المحاولة من الطلب أو الملف الذي يخصه. لا تستخدم رابط ملف موظف آخر ولا تحوّل المستند إلى رابط عام لتجاوز الحماية.",
      "لا تخمّن تاريخ التعيين أو جوال الموظف أو ربط حسابه الإداري. راجع المصدر المعتمد مع المسؤول عن البيانات.",
    ],
    pointsEn: [
      "Documents, custody, leaves and requests are separated into file tabs. Check upload completion and preview before leaving.",
      "If an attachment fails to open, retry from its own request or employee file. Do not use another employee’s file link or make a private document public to bypass protection.",
      "Do not guess hire dates, mobile numbers or administrative account links. Verify the authoritative source with the person responsible for the data.",
    ],
    links: [{ href: "/employees", permission: "/employees", labelAr: "الموظفون", labelEn: "Employees" }],
  },
  {
    id: "actions-and-alerts",
    titleAr: "الإجراءات والتقييمات والتنبيهات",
    titleEn: "Actions, evaluations & alerts",
    bodyAr: "راجع المرحلة والحالة الحالية قبل اتخاذ القرار. قائمة الإجراءات ليست موافقة نهائية، والتنبيه لا يثبت مخالفة.",
    bodyEn: "Check the current stage and status before deciding. An action list is not a final approval, and an alert is not proof of misconduct.",
    pointsAr: [
      "في الإجراءات، افتح الإجراء وراجع البيانات والمرفقات ثم نفّذ الخطوة المتاحة لدورك فقط. الإقرار المخصص للموظف لا يُستبدل بإقرار HR.",
      "عند رسالة تعارض، حدّث السجل وراجع القرار السابق قبل المحاولة. لا تُنشئ إجراءً بديلًا لتجاوز المرحلة أو تكرر الحفظ على نحو أعمى.",
      "راجع فترة التقييم وأبعاده قبل الحفظ والطباعة. مؤشر حضور غير متاح لا يعني أداءً جيدًا أو غيابًا مثبتًا.",
      "التنبيهات مبنية على التواريخ والبيانات المسجلة. قراءة التنبيه أو تأجيله لا تجدّد وثيقة ولا تغيّر استحقاق الموظف.",
    ],
    pointsEn: [
      "Open the action, review data and attachments, then perform only the step allowed for your role. HR cannot replace an employee-only acknowledgment.",
      "After a conflict message, refresh the record and check the previous decision. Do not create a substitute action to bypass a stage or blindly resubmit.",
      "Review the evaluation period and dimensions before saving or printing. An unavailable attendance assessment proves neither good performance nor absence.",
      "Alerts use recorded dates and data. Reading or snoozing an alert does not renew a document or change employee entitlement.",
    ],
    links: [
      { href: "/actions", permission: "/actions", labelAr: "الإجراءات", labelEn: "Actions" },
      { href: "/evaluations", permission: "/evaluations", labelAr: "التقييمات", labelEn: "Evaluations" },
      { href: "/alerts", permission: "/alerts", labelAr: "التنبيهات", labelEn: "Alerts" },
    ],
  },
  {
    id: "access-troubleshooting",
    titleAr: "الدخول والصلاحيات وتعذّر الحفظ",
    titleEn: "Access, permissions & save failures",
    bodyAr: "فرّق بين انقطاع الاتصال وانتهاء الجلسة ورفض الصلاحية. احتفظ بملاحظة غير حساسة عن الشاشة والوقت والرسالة؛ لا تشارك كلمة المرور أو وثائق الموظفين.",
    bodyEn: "Distinguish connection failure, session expiry and permission denial. Record only the screen, time and non-sensitive error; do not share passwords or employee documents.",
    pointsAr: [
      "إذا طُلب الدخول مجددًا، سجّل الدخول من مدخل HR ثم افتح السجل للتحقق مما حُفظ قبل إعادة الإرسال.",
      "رفض الصرف المالي أو إدارة كلمات مرور حسابات HR ليس عطلًا يُحل بتوسيع الصلاحية؛ يلزم المالك أو المالية بحسب الإجراء.",
      "للموظف: تحقق من نشاط ملفه وجواله الصحيح وتفعيل الحضور والتعيين في الحسابات والصلاحيات. لا تغيّر هويته بالتخمين.",
      "إذا استمر خطأ قاعدة البيانات أو تعذّر فتح خدمة مسموحة، أبلغ المسؤول المخوّل بالرسالة غير الحساسة. لا تمسح التاريخ ولا تعدّل راتبًا مدفوعًا لمعالجة خطأ تقني.",
    ],
    pointsEn: [
      "If asked to sign in again, use the HR entry, then reopen the record to check what was saved before resubmitting.",
      "Denied financial payment or HR-account password administration is not fixed by broadening HR permissions; the owner or finance must handle the relevant action.",
      "For employee access, check the active file, correct mobile, attendance enablement and assignment in Accounts & access. Never guess an identity correction.",
      "If database errors persist or an allowed service fails, report the non-sensitive message to the authorized administrator. Do not erase history or amend paid wages to work around a technical error.",
    ],
    links: [{ href: "/access", permission: "/access", labelAr: "الحسابات والصلاحيات", labelEn: "Accounts & access" }],
  },
  {
    id: "payroll",
    titleAr: "الرواتب والسلف",
    titleEn: "Payroll & advances",
    bodyAr: "تعرّف حدود الصلاحيات من الدور الفعلي للحساب. دخول مساحة HR يتيح واجهات HR فقط، ولا يمنح صلاحيات مالية إضافية.",
    bodyEn: "Financial actions follow the account’s actual role. HR workspace access is limited to HR routes and does not grant extra financial privileges.",
    pointsAr: [
      "حساب HR يستطيع الاطلاع على الرواتب وتجهيزها وتعديل المسودة واعتمادها؛ صرف الرواتب مخصص للمالك أو المحاسب.",
      "يمكن لحساب HR تسجيل السلفة ورفضها؛ اعتمادها وصرفها مخصصان للمالك أو المحاسب.",
      "خصم السلفة يظهر ضمن حساب الراتب، لكن لا تفترض أن أي تغيير آخر في طلب أو حضور يرحّل تلقائيًا إلى مسير الرواتب.",
    ],
    pointsEn: [
      "An HR account can view, prepare, edit draft payroll, and approve it; salary payment is reserved for the owner or accountant.",
      "An HR account can record or reject an advance; approval and disbursement are reserved for the owner or accountant.",
      "Advance repayment appears in payroll calculations, but do not assume other request or attendance changes automatically flow into payroll.",
    ],
    links: [
      { href: "/payroll", permission: "/payroll", labelAr: "مسير الرواتب", labelEn: "Payroll" },
      { href: "/advances", permission: "/advances", labelAr: "السلف", labelEn: "Advances" },
    ],
  },
];

export function canShowHrHelpLink(identity: HrHelpIdentity | null | undefined, link: HrHelpLink) {
  return identity?.role === "hr" &&
    identity.maintenanceScope === "hr" &&
    Array.isArray(identity.permissions) &&
    identity.permissions.includes(link.permission);
}

export function filterHrHelpSections(query: string, sections = HR_HELP_SECTIONS) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return sections;
  return sections.filter(section => [
    section.titleAr, section.titleEn, section.bodyAr, section.bodyEn,
    ...section.pointsAr, ...section.pointsEn,
    ...section.links.flatMap(link => [link.labelAr, link.labelEn, link.href]),
  ].join(" ").toLocaleLowerCase().includes(normalized));
}
