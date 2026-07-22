import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useRoute, Link } from "wouter";
import type { Employee, LeaveRequest } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HrWorkflowSection } from "@/components/hr-action-panel";
import {
  Loader2, ArrowLeft, ArrowRight, FileText, Download, Phone, Mail,
  CreditCard, CalendarDays, Briefcase, Building2, BadgeCheck, User, Clock,
  Eye, Image as ImageIcon, ExternalLink, Package, ShieldAlert, FileSignature, ClipboardList,
} from "lucide-react";

const isImageDoc = (mime?: string) => !!mime && mime.startsWith("image/");

const departmentLabels: Record<string, { ar: string; en: string }> = {
  sales:            { ar: "المبيعات",         en: "Sales" },
  design:           { ar: "التصميم",           en: "Design" },
  production:       { ar: "الإنتاج",           en: "Production" },
  warehouse:        { ar: "المستودع",          en: "Warehouse" },
  finance:          { ar: "المالية",           en: "Finance" },
  hr:               { ar: "الموارد البشرية",   en: "HR" },
  it:               { ar: "تقنية المعلومات",  en: "IT" },
  delivery:         { ar: "التوصيل",           en: "Delivery" },
  installation:     { ar: "التركيب",           en: "Installation" },
  quality:          { ar: "الجودة",            en: "Quality" },
  management:       { ar: "الإدارة",           en: "Management" },
  customer_service: { ar: "خدمة العملاء",      en: "Customer Service" },
  purchasing:       { ar: "المشتريات",         en: "Purchasing" },
};

const statusConfig: Record<string, { ar: string; en: string; cls: string }> = {
  active:     { ar: "نشط",      en: "Active",      cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  inactive:   { ar: "غير نشط", en: "Inactive",    cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  terminated: { ar: "منتهي",    en: "Terminated",  cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

const nationalityLabels: Record<string, { ar: string; en: string }> = {
  saudi:    { ar: "سعودي", en: "Saudi" },
  resident: { ar: "مقيم",  en: "Resident" },
};

const contractTypeLabels: Record<string, { ar: string; en: string }> = {
  fixed:     { ar: "محدد المدة",  en: "Fixed Term" },
  open:      { ar: "غير محدد",    en: "Open-Ended" },
  temporary: { ar: "مؤقت",        en: "Temporary" },
  training:  { ar: "تدريب",       en: "Training" },
};

const leaveStatusLabels: Record<string, { ar: string; en: string; cls: string }> = {
  pending:                 { ar: "معلّق", en: "Pending", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  manager_approved:        { ar: "موافقة المدير", en: "Manager approved", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  clarification_requested: { ar: "بانتظار توضيح", en: "Clarification", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  approved:                { ar: "معتمد", en: "Approved", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  rejected:                { ar: "مرفوض", en: "Rejected", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

const leaveTypeLabels: Record<string, { ar: string; en: string }> = {
  annual: { ar: "سنوية", en: "Annual" }, sick: { ar: "مرضية", en: "Sick" },
  unpaid: { ar: "بدون راتب", en: "Unpaid" }, emergency: { ar: "طارئة", en: "Emergency" },
  maternity: { ar: "أمومة", en: "Maternity" }, other: { ar: "أخرى", en: "Other" },
};

function computeServiceDuration(contractStart: string | null, t: (ar: string, en: string) => string): string {
  if (!contractStart) return "—";
  const start = new Date(contractStart);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) { years--; months += 12; }
  if (years === 0 && months === 0) return t("أقل من شهر", "< 1 month");
  const parts: string[] = [];
  if (years > 0) parts.push(t(`${years} سنة`, `${years}y`));
  if (months > 0) parts.push(t(`${months} شهر`, `${months}m`));
  return parts.join(" ");
}

function fmtDate(d: string | null | undefined, locale: string): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return "—"; }
}

function isContractDoc(name: string): boolean {
  const n = (name || "").toLowerCase();
  return n.includes("عقد") || n.includes("contract");
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words" data-testid={`value-${label}`}>{value || "—"}</p>
      </div>
    </div>
  );
}

const assetStatusLabels: Record<string, { ar: string; en: string; cls: string }> = {
  assigned: { ar: "بعهدته", en: "Assigned", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  returned: { ar: "مُعاد", en: "Returned", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  damaged:  { ar: "تالف", en: "Damaged", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

export default function EmployeeDetailPage() {
  const { t, isRTL } = useLanguage();
  const locale = isRTL ? "ar-SA" : "en-US";
  const [, params] = useRoute("/employees/:id");
  const id = params?.id;
  const empId = id ? parseInt(id) : NaN;
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);

  const { data: employee, isLoading } = useQuery<Employee>({
    queryKey: ["/api/employees", id],
    enabled: !!id,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { data: assets = [] } = useQuery<any[]>({
    queryKey: ["/api/employees", id, "assets"],
    queryFn: async () => {
      const r = await fetch(`/api/employees/${id}/assets`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!id,
  });

  const { data: allLeaves = [] } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leaves"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-muted-foreground">{t("الموظف غير موجود", "Employee not found")}</p>
        <Link href="/employees">
          <Button variant="outline" data-testid="button-back-list">{t("العودة للقائمة", "Back to list")}</Button>
        </Link>
      </div>
    );
  }

  const emp = employee as any;
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
  const name = emp.fullNameAr ? t(emp.fullNameAr, emp.fullNameEn || emp.fullNameAr)
    : (() => { const u = users.find((u: any) => u.id === emp.userId); return u ? t(u.fullNameAr, u.fullNameEn) : "—"; })();
  const linkedUser = users.find((u: any) => u.id === emp.userId);
  const dept = departmentLabels[emp.department] || { ar: emp.department, en: emp.department };
  const status = statusConfig[emp.status] || statusConfig.active;
  const nat = nationalityLabels[emp.nationality] || { ar: emp.nationality, en: emp.nationality };
  const cType = emp.contractType ? (contractTypeLabels[emp.contractType] || { ar: emp.contractType, en: emp.contractType }) : null;
  const salary = parseFloat(emp.monthlySalary?.toString() || "0");
  const serviceDuration = computeServiceDuration(emp.contractStart, t);
  const docs: any[] = (emp.documents as any[]) || [];
  const initials = name && name !== "—" ? name.trim().slice(0, 2) : "؟";
  const manager = emp.managerId ? undefined : undefined;
  const empLeaves = allLeaves.filter(l => l.employeeId === emp.id);

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Link href="/employees">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <BackIcon className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-lg md:text-xl font-bold flex-1 truncate">{t("ملف الموظف", "Employee Profile")}</h1>
      </div>

      {/* Header card */}
      <Card className="overflow-hidden">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shrink-0 mx-auto sm:mx-0">
              {initials}
            </div>
            <div className="flex-1 text-center sm:text-start min-w-0">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h2 className="text-xl font-bold truncate" data-testid="text-employee-name">{name}</h2>
                <Badge className={`${status.cls} text-[10px]`} data-testid="badge-status">{t(status.ar, status.en)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-mono">#{emp.employeeNumber}</span>
                {emp.position ? <span> · {emp.position}</span> : null}
                <span> · {t(dept.ar, dept.en)}</span>
              </p>
              {linkedUser && (
                <p className="text-xs text-muted-foreground mt-0.5">@{linkedUser.username}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 6 tabs (المرحلة 8) */}
      <Tabs defaultValue="basic" dir={isRTL ? "rtl" : "ltr"}>
        <TabsList className="w-full h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="basic" data-testid="tab-basic"><User className="w-3.5 h-3.5 me-1" />{t("البيانات الأساسية والعقد", "Basic & Contract")}</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents"><FileSignature className="w-3.5 h-3.5 me-1" />{t("المستندات وسرية المعلومات", "Documents & NDA")}</TabsTrigger>
          <TabsTrigger value="assets" data-testid="tab-assets"><Package className="w-3.5 h-3.5 me-1" />{t("العهد", "Custody")}</TabsTrigger>
          <TabsTrigger value="leaves" data-testid="tab-leaves"><CalendarDays className="w-3.5 h-3.5 me-1" />{t("الإجازات والدوام", "Leaves & Attendance")}</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-requests"><ClipboardList className="w-3.5 h-3.5 me-1" />{t("الطلبات والإنهاء", "Requests & Termination")}</TabsTrigger>
          <TabsTrigger value="penalties" data-testid="tab-penalties"><ShieldAlert className="w-3.5 h-3.5 me-1" />{t("الجزاءات والمخالفات", "Penalties")}</TabsTrigger>
        </TabsList>

        {/* 1: البيانات الأساسية والعقد */}
        <TabsContent value="basic" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("مدة الخدمة", "Service")}</p>
              <p className="text-sm font-semibold mt-1" data-testid="stat-service">{serviceDuration}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("الراتب (ر.س)", "Salary (SAR)")}</p>
              <p className="text-sm font-semibold mt-1 tabular-nums" data-testid="stat-salary">{salary.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("الجنسية", "Nationality")}</p>
              <p className="text-sm font-semibold mt-1" data-testid="stat-nationality">{t(nat.ar, nat.en)}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("نوع العقد", "Contract")}</p>
              <p className="text-sm font-semibold mt-1" data-testid="stat-contract-type">{cType ? t(cType.ar, cType.en) : "—"}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="w-4 h-4" />{t("بيانات التواصل والهوية", "Contact & Identity")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 divide-y divide-border">
                <InfoRow icon={<Phone className="w-4 h-4" />} label={t("الجوال", "Phone")} value={emp.phone} />
                <InfoRow icon={<Mail className="w-4 h-4" />} label={t("البريد الإلكتروني", "Email")} value={emp.email} />
                <InfoRow icon={<CreditCard className="w-4 h-4" />} label={t("رقم الهوية / الإقامة", "ID / Iqama No.")} value={emp.iqamaNumber} />
                <InfoRow icon={<CalendarDays className="w-4 h-4" />} label={t("انتهاء الإقامة", "Iqama Expiry")} value={fmtDate(emp.iqamaExpiry, locale)} />
                <InfoRow icon={<BadgeCheck className="w-4 h-4" />} label={t("انتهاء التأمين", "Insurance Expiry")} value={fmtDate(emp.insuranceExpiry, locale)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />{t("بيانات الوظيفة والعقد", "Job & Contract")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 divide-y divide-border">
                <InfoRow icon={<Briefcase className="w-4 h-4" />} label={t("المسمى الوظيفي", "Job Title")} value={emp.position} />
                <InfoRow icon={<Building2 className="w-4 h-4" />} label={t("القسم", "Department")} value={t(dept.ar, dept.en)} />
                <InfoRow icon={<User className="w-4 h-4" />} label={t("المدير المباشر", "Direct Manager")} value={(() => {
                  if (!emp.managerId) return t("— (يذهب الاعتماد لـ HR/المالك)", "— (approvals go to HR/owner)");
                  return `#${emp.managerId}`;
                })()} />
                <InfoRow icon={<CalendarDays className="w-4 h-4" />} label={t("بداية العقد", "Contract Start")} value={fmtDate(emp.contractStart, locale)} />
                <InfoRow icon={<CalendarDays className="w-4 h-4" />} label={t("نهاية العقد", "Contract End")} value={fmtDate(emp.contractEnd, locale)} />
                <InfoRow icon={<Clock className="w-4 h-4" />} label={t("الحضور", "Attendance")} value={emp.attendanceEnabled ? t("مفعّل", "Enabled") : t("معطّل", "Disabled")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 2: المستندات وسرية المعلومات (WF-08) */}
        <TabsContent value="documents" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />{t("المستندات والعقود", "Documents & Contracts")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {docs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-docs">
                  {t("لا توجد مستندات مرفوعة", "No documents uploaded")}
                </p>
              ) : (
                <div className="divide-y divide-border rounded-lg border overflow-hidden">
                  {docs.map((doc: any) => {
                    const img = isImageDoc(doc.mime);
                    return (
                      <div key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`row-doc-${doc.id}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-1.5 rounded shrink-0 ${img ? "bg-blue-100 dark:bg-blue-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                            {img
                              ? <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              : <FileText className={`w-4 h-4 ${isContractDoc(doc.name) ? "text-primary" : "text-red-600 dark:text-red-400"}`} />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{doc.name}</p>
                              {isContractDoc(doc.name) && (
                                <Badge variant="secondary" className="text-[9px]">{t("عقد", "Contract")}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {img ? t("صورة", "Image") : "PDF"} · {fmtDate(doc.uploadedAt, locale)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => setPreviewDoc(doc)} data-testid={`button-view-doc-${doc.id}`}>
                            <Eye className="w-3.5 h-3.5 me-1" />{t("معاينة", "Preview")}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" asChild title={t("تحميل", "Download")} data-testid={`button-download-doc-${doc.id}`}>
                            <a href={doc.url} download={doc.name}>
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("سرية المعلومات (WF-08)", "Confidentiality (WF-08)")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <HrWorkflowSection workflows={["wf08"]} employeeId={emp.id} employeeName={name} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3: العهد */}
        <TabsContent value="assets" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4" />{t("عهد الموظف", "Employee Custody")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {assets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-assets">
                  {t("لا توجد عهد مسجلة لهذا الموظف", "No custody items for this employee")}
                </p>
              ) : (
                <div className="divide-y divide-border rounded-lg border overflow-hidden">
                  {assets.map((a: any) => {
                    const st = assetStatusLabels[a.status] || { ar: a.status, en: a.status, cls: "" };
                    return (
                      <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`row-asset-${a.id}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{a.assetName || a.nameAr || a.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.serialNumber ? `${t("الرقم التسلسلي", "Serial")}: ${a.serialNumber} · ` : ""}
                            {fmtDate(a.assignedDate || a.createdAt, locale)}
                          </p>
                        </div>
                        <Badge className={`${st.cls} text-[10px]`}>{t(st.ar, st.en)}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4: الإجازات والدوام (WF-01 عبر نظام الإجازات + WF-04/09) */}
        <TabsContent value="leaves" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />{t("طلبات الإجازة (WF-01)", "Leave Requests (WF-01)")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {empLeaves.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t("لا توجد طلبات إجازة — تُدار من صفحة الإجازات", "No leave requests — managed from the Leaves page")}</p>
              ) : (
                <div className="divide-y divide-border rounded-lg border overflow-hidden">
                  {empLeaves.map(l => {
                    const st = leaveStatusLabels[l.status] || { ar: l.status, en: l.status, cls: "" };
                    const lt = leaveTypeLabels[(l as any).leaveType] || { ar: (l as any).leaveType, en: (l as any).leaveType };
                    return (
                      <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`row-leave-${l.id}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{t(lt.ar, lt.en)} · {l.startDate} ← {l.endDate}</p>
                          {l.reason ? <p className="text-xs text-muted-foreground truncate">{l.reason}</p> : null}
                        </div>
                        <Badge className={`${st.cls} text-[10px]`}>{t(st.ar, st.en)}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="pt-3">
                <Link href="/leaves">
                  <Button size="sm" variant="ghost" data-testid="link-leaves-page">
                    <ExternalLink className="w-3.5 h-3.5 me-1" />{t("إدارة الإجازات", "Manage leaves")}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("عودة من إجازة ومخالصة (WF-04 / WF-09)", "Return & Settlement (WF-04 / WF-09)")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <HrWorkflowSection workflows={["wf04", "wf09"]} employeeId={emp.id} employeeName={name} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5: الطلبات والإنهاء */}
        <TabsContent value="requests" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("الإنهاء وعدم التجديد والمستحقات (WF-05 / WF-06 / WF-06B / WF-07)", "Termination & Non-renewal & Dues")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <HrWorkflowSection workflows={["wf05", "wf06", "wf06b", "wf07"]} employeeId={emp.id} employeeName={name} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6: الجزاءات والمخالفات */}
        <TabsContent value="penalties" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("الإنذارات والمخالفات (WF-10)", "Warnings & Violations (WF-10)")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <HrWorkflowSection workflows={["wf10"]} employeeId={emp.id} employeeName={name} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!previewDoc} onOpenChange={open => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl w-[95vw] h-[88vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="text-base truncate pe-8 flex items-center gap-2">
              {previewDoc && (isImageDoc(previewDoc.mime)
                ? <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                : <FileText className="w-4 h-4 text-red-500 shrink-0" />)}
              <span className="truncate">{previewDoc?.name}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto bg-muted/30 flex items-center justify-center">
            {previewDoc && (isImageDoc(previewDoc.mime) ? (
              <img src={previewDoc.url} alt={previewDoc.name} className="max-w-full max-h-full object-contain" data-testid="img-doc-preview" />
            ) : (
              <iframe src={previewDoc.url} title={previewDoc.name} className="w-full h-full border-0" data-testid="iframe-doc-preview" />
            ))}
          </div>
          <div className="px-4 py-3 border-t flex justify-end gap-2">
            <Button size="sm" variant="ghost" asChild data-testid="button-open-newtab-preview">
              <a href={previewDoc?.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 me-1.5" />{t("فتح في تبويب جديد", "Open in new tab")}
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild data-testid="button-download-preview">
              <a href={previewDoc?.url} download={previewDoc?.name}>
                <Download className="w-4 h-4 me-1.5" />{t("تحميل المستند", "Download Document")}
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
