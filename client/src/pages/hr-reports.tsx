import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Employee } from "@shared/schema";
import { HR_STATUS_LABELS, HR_WORKFLOWS } from "@shared/hr-workflows";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, ArrowDownToLine, CalendarDays, Printer, TableProperties } from "lucide-react";

type ReportType = "employees" | "leaves" | "permissions" | "payroll" | "advances" | "evaluations" | "actions" | "audit";
type Report = { type: ReportType; from: string; to: string; columns: { key: string; ar: string; en: string }[]; rows: Record<string, string | number | null>[]; truncated: boolean };
type StatusOption = { value: string; ar: string; en: string };
const REPORT_TYPES: { key: ReportType; ar: string; en: string }[] = [
  { key: "employees", ar: "الموظفون", en: "Employees" }, { key: "leaves", ar: "الإجازات", en: "Leaves" },
  { key: "permissions", ar: "الاستئذانات", en: "Permissions" }, { key: "payroll", ar: "الرواتب", en: "Payroll" },
  { key: "advances", ar: "السلف", en: "Advances" }, { key: "evaluations", ar: "التقييمات", en: "Evaluations" },
  { key: "actions", ar: "الإجراءات", en: "Actions" }, { key: "audit", ar: "سجل التدقيق", en: "Audit log" },
];
const today = new Date();
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
const todayDate = localDate(today);
const dateSpan = (from: string, to: string) => {
  if (!from || !to) return null;
  const start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.floor((end - start) / 86400000) + 1 : null;
};
function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
const statusOptions: Partial<Record<ReportType, StatusOption[]>> = {
  employees: [
    { value: "active", ar: "نشط", en: "Active" }, { value: "inactive", ar: "غير نشط", en: "Inactive" },
    { value: "terminated", ar: "منتهية خدمته", en: "Terminated" },
  ],
  leaves: [
    { value: "pending", ar: "قيد الانتظار", en: "Pending" }, { value: "manager_pending", ar: "بانتظار المدير", en: "Manager review" },
    { value: "manager_approved", ar: "بانتظار الموارد البشرية", en: "HR review" }, { value: "approved", ar: "معتمد", en: "Approved" },
    { value: "auto_approved", ar: "معتمد تلقائياً", en: "Auto-approved" }, { value: "rejected", ar: "مرفوض", en: "Rejected" },
    { value: "clarification_requested", ar: "توضيح مطلوب", en: "Needs clarification" }, { value: "cancelled", ar: "ملغى", en: "Cancelled" },
  ],
  permissions: [
    { value: "pending", ar: "قيد الانتظار", en: "Pending" }, { value: "manager_pending", ar: "بانتظار المدير", en: "Manager review" },
    { value: "manager_approved", ar: "بانتظار الموارد البشرية", en: "HR review" }, { value: "approved", ar: "معتمد", en: "Approved" },
    { value: "rejected", ar: "مرفوض", en: "Rejected" }, { value: "clarification_requested", ar: "توضيح مطلوب", en: "Needs clarification" },
    { value: "cancelled", ar: "ملغى", en: "Cancelled" },
  ],
  payroll: [
    { value: "draft", ar: "مسودة", en: "Draft" }, { value: "pending", ar: "قيد الانتظار", en: "Pending" },
    { value: "approved", ar: "معتمد", en: "Approved" }, { value: "paid", ar: "مدفوع", en: "Paid" },
    { value: "processed", ar: "تمت المعالجة", en: "Processed" }, { value: "cancelled", ar: "ملغى", en: "Cancelled" },
  ],
  advances: [
    { value: "pending", ar: "قيد الانتظار", en: "Pending" }, { value: "approved", ar: "معتمد", en: "Approved" },
    { value: "rejected", ar: "مرفوض", en: "Rejected" }, { value: "paid", ar: "مدفوع", en: "Paid" },
    { value: "completed", ar: "مكتمل", en: "Completed" }, { value: "cancelled", ar: "ملغى", en: "Cancelled" },
  ],
  evaluations: [
    { value: "pending", ar: "قيد الانتظار", en: "Pending" }, { value: "completed", ar: "مكتمل", en: "Completed" },
    { value: "approved", ar: "معتمد", en: "Approved" }, { value: "cancelled", ar: "ملغى", en: "Cancelled" },
  ],
  actions: Object.entries(HR_STATUS_LABELS).map(([value, label]) => ({ value, ...label })),
  audit: Object.entries(HR_STATUS_LABELS).map(([value, label]) => ({ value, ...label })),
};
const knownValues: Record<string, { ar: string; en: string }> = {
  annual: { ar: "سنوية", en: "Annual" }, sick: { ar: "مرضية", en: "Sick" },
  unpaid: { ar: "بدون راتب", en: "Unpaid" }, emergency: { ar: "طارئة", en: "Emergency" },
  maternity: { ar: "أمومة", en: "Maternity" }, other: { ar: "أخرى", en: "Other" },
  leave: { ar: "مغادرة", en: "Leave" }, permission: { ar: "استئذان", en: "Permission" },
  official: { ar: "مهمة رسمية", en: "Official" }, remote: { ar: "عمل عن بعد", en: "Remote" },
  true: { ar: "نعم", en: "Yes" }, false: { ar: "لا", en: "No" },
  yes: { ar: "نعم", en: "Yes" }, no: { ar: "لا", en: "No" },
  active: { ar: "نشط", en: "Active" }, inactive: { ar: "غير نشط", en: "Inactive" },
};

export default function HrReportsPage() {
  const { t, lang } = useLanguage();
  const [type, setType] = useState<ReportType>("employees");
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayDate);
  const [employeeId, setEmployeeId] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [status, setStatus] = useState("");
  const { data: employees = [], isLoading: employeesLoading } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const visibleEmployees = useMemo(() => employees.filter(employee => {
    const name = `${employee.fullNameAr || ""} ${employee.fullNameEn || ""} ${employee.employeeNumber || ""}`.toLocaleLowerCase();
    return name.includes(employeeSearch.toLocaleLowerCase());
  }), [employees, employeeSearch]);
  const span = dateSpan(from, to);
  const valid = !!span && span > 0 && span <= 366 && (employeeId === "all" || /^[1-9]\d*$/.test(employeeId));
  const queryKey = ["/api/hr/reports", type, from, to, employeeId, status];
  const { data, isLoading, isError, refetch, isFetching } = useQuery<Report>({
    queryKey,
    enabled: valid,
    queryFn: async () => {
      const params = new URLSearchParams({ type, from, to });
      if (employeeId !== "all") params.set("employeeId", employeeId);
      if (status) params.set("status", status);
      const response = await fetch(`/api/hr/reports?${params}`, { credentials: "include" });
      if (!response.ok) {
        let message = `${response.status} ${response.statusText}`;
        try { const body = await response.json(); message = body.message || body.error || message; } catch { /* Keep response status. */ }
        throw new Error(message);
      }
      return response.json();
    },
  });
  const reportLabel = REPORT_TYPES.find(item => item.key === type);
  const headers = useMemo(() => data?.columns.map(column => lang === "ar" ? column.ar : column.en) || [], [data?.columns, lang]);
  const formatCell = (key: string, value: string | number | null) => {
    if (value == null) return "—";
    const raw = String(value);
    const normalizedKey = key.toLocaleLowerCase();
    if (normalizedKey === "status" || normalizedKey.endsWith("status")) {
      const label = Object.entries(HR_STATUS_LABELS).find(([statusKey]) => statusKey === raw)?.[1]
        || statusOptions[type]?.find(option => option.value === raw);
      if (label) return lang === "ar" ? label.ar : label.en;
    }
    if (normalizedKey.includes("workflow") || normalizedKey === "type" || normalizedKey.endsWith("type")) {
      const workflow = HR_WORKFLOWS[raw];
      if (workflow) return lang === "ar" ? workflow.nameAr : workflow.nameEn;
    }
    const known = knownValues[raw.toLowerCase()];
    return known ? (lang === "ar" ? known.ar : known.en) : raw;
  };
  const exportCsv = () => {
    if (!data) return;
    const fields = data.columns.map(column => column.key);
    const csv = [data.columns.map(column => csvCell(lang === "ar" ? column.ar : column.en)).join(","),
      ...data.rows.map(row => fields.map(field => csvCell(formatCell(field, row[field]))).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `teak-${type}-${from}-${to}.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };
  const printReport = () => {
    if (!data) return;
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.opener = null;
    const doc = popup.document;
    doc.documentElement.lang = lang; doc.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    const title = doc.createElement("title"); title.textContent = `${t("تقرير", "Report")} — ${reportLabel ? t(reportLabel.ar, reportLabel.en) : type}`; doc.head.appendChild(title);
    const style = doc.createElement("style");
    style.textContent = "body{font:14px Tahoma,Arial,sans-serif;color:#2f2c28;padding:24px}h1{font-size:22px}p{color:#625d56}table{border-collapse:collapse;width:100%;margin-top:18px}th,td{border:1px solid #cfc9bf;padding:8px;text-align:start;vertical-align:top}th{background:#f0ece5}tr{break-inside:avoid}@media print{body{padding:0}}";
    doc.head.appendChild(style);
    const pageFormat=doc.createElement("style");
    pageFormat.textContent=`@page{size:A4 ${data.columns.length>7?"landscape":"portrait"};margin:12mm}table{font-size:${data.columns.length>7?"11":"13"}px}td{overflow-wrap:anywhere}`;
    doc.head.appendChild(pageFormat);
    const heading = doc.createElement("h1"); heading.textContent = `${t("تقرير", "Report")} — ${reportLabel ? t(reportLabel.ar, reportLabel.en) : type}`; doc.body.appendChild(heading);
    const period = doc.createElement("p"); period.textContent = `${from} — ${to}${data.truncated ? ` · ${t("تم تحديد النتائج بأول ٥٠٠٠ صف", "Limited to the first 5,000 rows")}` : ""}`; doc.body.appendChild(period);
    const table = doc.createElement("table"), thead = doc.createElement("thead"), headerRow = doc.createElement("tr");
    data.columns.forEach(column => { const th = doc.createElement("th"); th.textContent = lang === "ar" ? column.ar : column.en; headerRow.appendChild(th); });
    thead.appendChild(headerRow); table.appendChild(thead);
    const tbody = doc.createElement("tbody");
    data.rows.forEach(row => { const tr = doc.createElement("tr"); data.columns.forEach(column => { const td = doc.createElement("td"); td.textContent = row[column.key] == null ? "" : formatCell(column.key, row[column.key]); tr.appendChild(td); }); tbody.appendChild(tr); });
    table.appendChild(tbody); doc.body.appendChild(table);
    popup.focus(); popup.print();
  };
  return <div className="space-y-5">
    <header><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><TableProperties className="h-4 w-4" />{t("مركز التقارير", "Reports center")}</div>
      <h1 className="text-2xl font-bold">{t("التقارير", "Reports")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("اختر نطاقاً واضحاً ثم اعرض أو صدّر البيانات.", "Choose a clear date range, then view or export the data.")}</p></header>
    <Card><CardHeader className="pb-3"><CardTitle className="text-base">{t("إعداد التقرير", "Report setup")}</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-1"><Label>{t("نوع التقرير", "Report type")}</Label><Select value={type} onValueChange={value => { setType(value as ReportType); setStatus(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{REPORT_TYPES.map(item => <SelectItem key={item.key} value={item.key}>{t(item.ar, item.en)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>{t("من", "From")}</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>{t("إلى", "To")}</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="space-y-1">
          <Label>{t("الموظف", "Employee")}</Label>
          <Input type="search" value={employeeSearch} onChange={e => setEmployeeSearch(e.target.value)} placeholder={employeesLoading ? t("جارٍ تحميل الموظفين…", "Loading employees…") : t("ابحث بالاسم أو الرقم", "Search name or number")} />
          <Select value={employeeId} onValueChange={setEmployeeId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="all">{t("كل الموظفين", "All employees")}</SelectItem>
            {visibleEmployees.map(employee => <SelectItem key={employee.id} value={String(employee.id)}>{t(employee.fullNameAr || employee.fullNameEn || `#${employee.id}`, employee.fullNameEn || employee.fullNameAr || `#${employee.id}`)} · {employee.employeeNumber}</SelectItem>)}
          </SelectContent></Select>
        </div>
        <div className="space-y-1"><Label>{t("الحالة", "Status")}</Label><Select value={status || "all"} onValueChange={value => setStatus(value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="all">{t("كل الحالات", "All statuses")}</SelectItem>
          {(statusOptions[type] || []).map(option => <SelectItem key={option.value} value={option.value}>{t(option.ar, option.en)}</SelectItem>)}
        </SelectContent></Select></div>
        <div className="sm:col-span-2 xl:col-span-5 flex flex-wrap items-center gap-2">
          {!valid && <p className="me-auto text-sm text-destructive" role="alert">{t(span && span > 366 ? "النطاق الأقصى ٣٦٦ يوماً، ويجب أن يكون تاريخ البداية قبل النهاية." : "تحقق من التواريخ ورقم الموظف.", "Use a valid date range of no more than 366 days and a positive employee ID.")}</p>}
          {valid && <p className="me-auto flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" />{span} {t("يوماً", "days")}</p>}
          <Button variant="outline" disabled={!data} onClick={exportCsv}><ArrowDownToLine className="me-2 h-4 w-4" />{t("CSV متوافق مع Excel", "Excel CSV")}</Button>
          <Button variant="outline" disabled={!data} onClick={printReport}><Printer className="me-2 h-4 w-4" />{t("طباعة", "Print")}</Button>
        </div>
      </CardContent>
    </Card>
    {(type === "employees" || type === "payroll") && <p className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">{type === "employees"
      ? t("تقرير الموظفين يعرض الحالة الحالية للملفات، وليس لقطة تاريخية للفترة المحددة.", "Employee reports show the current file snapshot, not a historical snapshot for the selected period.")
      : t("لتقرير الرواتب، اختر شهراً كاملاً من أول يوم إلى آخر يوم.", "For payroll reports, select complete calendar months from the first through the last day.")}</p>}
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3"><div><CardTitle className="text-base">{reportLabel && t(reportLabel.ar, reportLabel.en)}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{from} — {to}{data ? ` · ${data.rows.length.toLocaleString()} ${t("صف", "rows")}` : ""}</p></div>
        <Link href="/attendance-monitor?tab=records" className="text-sm underline underline-offset-4">{t("سجلات الحضور", "Attendance records")}</Link>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading || isFetching ? <div className="space-y-3 p-4" aria-label={t("جارٍ التحميل", "Loading")}><div className="h-8 animate-pulse rounded bg-muted" /><div className="h-16 animate-pulse rounded bg-muted" /><div className="h-16 animate-pulse rounded bg-muted" /></div>
          : isError ? <div className="p-6" role="alert"><p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{t("تعذر تحميل التقرير.", "Could not load this report.")}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => refetch()}>{t("إعادة المحاولة", "Retry")}</Button></div>
          : data ? <>{data.truncated && <p className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("عرض أول ٥٠٠٠ صف فقط. قلّص النطاق لعرض نتائج أكثر تحديداً.", "Showing the first 5,000 rows. Narrow the range for a more focused result.")}</p>}
            {data.rows.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">{t("لا توجد بيانات في هذا النطاق.", "No data in this range.")}</div>
              : <>
                <div className="space-y-3 p-3 md:hidden">
                  {data.rows.map((row, index) => <article key={index} className="rounded-xl border bg-card p-4">
                    <h3 className="mb-3 break-words font-semibold">{data.columns[0] ? formatCell(data.columns[0].key, row[data.columns[0].key]) : `#${index + 1}`}</h3>
                    <dl className="grid grid-cols-1 gap-2 text-sm min-[360px]:grid-cols-2">
                      {data.columns.slice(1).map(column => <div key={column.key} className="min-w-0 border-t pt-2">
                        <dt className="text-xs text-muted-foreground">{lang === "ar" ? column.ar : column.en}</dt>
                        <dd className="mt-0.5 break-words font-medium">{formatCell(column.key, row[column.key])}</dd>
                      </div>)}
                    </dl>
                  </article>)}
                </div>
                {data.columns.length>7 && <p className="hidden border-y px-5 py-2 text-xs text-muted-foreground md:block">{t("مرّر الجدول أفقيًا لعرض بقية الأعمدة. الطباعة والتصدير يشملان جميع الحقول.", "Scroll the table horizontally for more columns. Print and export include every field.")}</p>}
                <div className="hidden overflow-x-auto md:block" role="region" aria-label={t("نتائج التقرير", "Report results")} tabIndex={0}>
                  <table className="w-full text-sm" style={{minWidth:Math.max(720,data.columns.length*135)}}>
                    <thead className="bg-muted/50"><tr>{headers.map(header => <th key={header} className="whitespace-nowrap p-3 text-start font-semibold">{header}</th>)}</tr></thead>
                    <tbody>{data.rows.map((row,index)=><tr key={index} className="border-t">
                      {data.columns.map(column=><td key={column.key} className="p-3 align-top" style={{minWidth:column.key==="employee"||column.key==="position"?180:110,whiteSpace:["employee","position","details","reason","notes"].includes(column.key)?"normal":"nowrap"}}>{formatCell(column.key,row[column.key])}</td>)}
                    </tr>)}</tbody>
                  </table>
                </div>
              </>}</>
          : <div className="p-8 text-center text-sm text-muted-foreground">{t("حدّد تواريخ صالحة لعرض التقرير.", "Choose a valid date range to load a report.")}</div>}
      </CardContent>
    </Card>
  </div>;
}
