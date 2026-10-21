import { useState, useMemo, useRef, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { toLatinDigits } from "@shared/digits";
import { ReportPreview, type ReportData } from "@/components/hr-report";
import { exportEmployeeWorkbook, employeeExportRow, employeeHeadings } from "@/lib/hr-employee-export";
import { useToast } from "@/hooks/use-toast";
import type { Employee, EmployeeAsset, HrAction } from "@shared/schema";
import { HrActionCard, NewHrActionDialog } from "@/components/hr-action-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, Plus, Search, UserCog, Pencil, DollarSign,
  Users, UserCheck, ChevronUp, ChevronDown, ChevronsUpDown,
  FileText, Upload, Trash2, AlertTriangle, Download, Lock, UserX, UserCheck2, ClipboardList, X,
  Calculator, Package, CheckCircle2, RotateCcw, Eye, Image as ImageIcon, ExternalLink, MapPin
} from "lucide-react";

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
  fixed:     { ar: "محدد المدة",    en: "Fixed Term" },
  open:      { ar: "غير محدد",      en: "Open-Ended" },
  temporary: { ar: "مؤقت",          en: "Temporary" },
  training:  { ar: "تدريب",         en: "Training" },
};

const auditActionLabels: Record<string, { ar: string; en: string; cls: string }> = {
  reset_password:  { ar: "إعادة تعيين كلمة المرور", en: "Password Reset", cls: "text-orange-600 dark:text-orange-400" },
  enable_account:  { ar: "تفعيل الحساب",             en: "Account Enabled", cls: "text-green-600 dark:text-green-400" },
  disable_account: { ar: "تعطيل الحساب",             en: "Account Disabled", cls: "text-red-600 dark:text-red-400" },
};

const assetTypeLabels: Record<string, { ar: string; en: string }> = {
  car:        { ar: "سيارة",   en: "Car" },
  laptop:     { ar: "لابتوب",  en: "Laptop" },
  mobile:     { ar: "جوال",    en: "Mobile" },
  tools:      { ar: "أدوات",   en: "Tools" },
  uniform:    { ar: "زي رسمي", en: "Uniform" },
  id_card:    { ar: "بطاقة",   en: "ID Card" },
  key:        { ar: "مفتاح",   en: "Key" },
  other:      { ar: "أخرى",    en: "Other" },
};

const terminationReasons: Record<string, { ar: string; en: string }> = {
  resignation:  { ar: "استقالة",                    en: "Resignation" },
  termination:  { ar: "فصل من قِبل صاحب العمل",    en: "Employer Termination" },
  contract_end: { ar: "انتهاء العقد",               en: "Contract End" },
  death:        { ar: "وفاة",                        en: "Death" },
  disability:   { ar: "عجز",                         en: "Disability" },
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

interface EmployeeForm {
  employeeNumber: string;
  fullNameAr: string;
  fullNameEn: string;
  nationality: string;
  position: string;
  department: string;
  monthlySalary: string;
  iqamaNumber: string;
  dateOfBirth: string;
  iqamaExpiry: string;
  contractStart: string;
  contractEnd: string;
  status: string;
  userId: string;
  contractType: string;
  insuranceExpiry: string;
  fingerScanLocation: string;
  phone: string;
  email: string;
  attendanceEnabled: boolean;
  managerId: string;
  attendanceZoneId: string;
  attendanceScheduleId: string;
}

const emptyForm: EmployeeForm = {
  employeeNumber: "",
  fullNameAr: "",
  fullNameEn: "",
  nationality: "saudi",
  position: "",
  department: "production",
  monthlySalary: "",
  iqamaNumber: "",
  dateOfBirth: "",
  iqamaExpiry: "",
  contractStart: "",
  contractEnd: "",
  status: "active",
  userId: "",
  contractType: "",
  insuranceExpiry: "",
  fingerScanLocation: "",
  phone: "",
  email: "",
  attendanceEnabled: true,
  managerId: "",
  attendanceZoneId: "",
  attendanceScheduleId: "",
};

type SortKey = "employeeNumber" | "position" | "department" | "nationality" | "monthlySalary" | "contractStart" | "status";

function DateInput({ label, value, onChange, required, testId }: {
  label: string; value: string; onChange: (v: string) => void;
  required?: boolean; testId?: string;
}) {
  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) formatted = digits.slice(0, 4) + "-" + digits.slice(4);
    if (digits.length > 6) formatted = digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-" + digits.slice(6);
    onChange(formatted);
  };
  return (
    <div className="space-y-1">
      <Label>{label}{required && " *"}</Label>
      <Input
        value={value}
        onChange={e => handleChange(e.target.value)}
        placeholder="2024-01-15"
        maxLength={10}
        data-testid={testId}
        dir="ltr"
        className="text-start"
      />
    </div>
  );
}

function FormFields({ data, onChange, users, jobTitlesList }: {
  data: EmployeeForm;
  onChange: (d: EmployeeForm) => void;
  users: any[];
  jobTitlesList: any[];
}) {
  const { t } = useLanguage();
  const { data: allEmployees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: departments = [] } = useQuery<{ id: number; code: string; nameAr: string }[]>({ queryKey: ["/api/hr/departments"] });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label>{t("اسم الموظف (عربي)", "Employee Name (Arabic)")} *</Label>
        <Input value={data.fullNameAr} onChange={e => onChange({ ...data, fullNameAr: e.target.value })}
          placeholder={t("مثال: محمد عبدالله", "e.g. Mohammed Abdullah")} data-testid="input-emp-name-ar" />
      </div>
      <div className="space-y-1">
        <Label>{t("اسم الموظف (إنجليزي)", "Employee Name (English)")}</Label>
        <Input value={data.fullNameEn} onChange={e => onChange({ ...data, fullNameEn: e.target.value })}
          placeholder="e.g. Mohammed Abdullah" data-testid="input-emp-name-en" dir="ltr" className="text-start" />
      </div>
      <div className="space-y-1">
        <Label>{t("رقم الموظف", "Employee #")} *</Label>
        <Input value={data.employeeNumber} onChange={e => onChange({ ...data, employeeNumber: e.target.value })}
          placeholder="EMP-016" data-testid="input-emp-number" dir="ltr" className="text-start" />
      </div>
      <div className="space-y-1">
        <Label>{t("الجنسية", "Nationality")} *</Label>
        <Select value={data.nationality} onValueChange={v => onChange({ ...data, nationality: v })}>
          <SelectTrigger data-testid="select-nationality"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(nationalityLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{t(v.ar, v.en)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>{t("المسمى الوظيفي", "Job Title")} *</Label>
        {jobTitlesList.length > 0 ? (
          <Select value={data.position} onValueChange={v => onChange({ ...data, position: v })}>
            <SelectTrigger data-testid="select-position"><SelectValue placeholder={t("اختر المسمى", "Select title")} /></SelectTrigger>
            <SelectContent>
              {data.position && !jobTitlesList.some((jt:any)=>jt.active&&jt.nameAr===data.position) &&
                <SelectItem value={data.position}>{data.position}</SelectItem>}
              {jobTitlesList.filter((jt: any) => jt.active).map((jt: any) => (
                <SelectItem key={jt.id} value={jt.nameAr}>{t(jt.nameAr, jt.nameEn)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input value={data.position} onChange={e => onChange({ ...data, position: e.target.value })}
            placeholder={t("مثال: مندوب مبيعات", "e.g. Sales Rep")} data-testid="input-position" />
        )}
      </div>
      <div className="space-y-1">
        <Label>{t("القسم", "Department")} *</Label>
        <Select value={data.department} onValueChange={v => onChange({ ...data, department: v })}>
          <SelectTrigger data-testid="select-department"><SelectValue /></SelectTrigger>
          <SelectContent>
            {departments.map((d: any) => (
              <SelectItem key={d.code} value={d.code}>{d.nameAr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>{t("الراتب الشهري (ر.س)", "Monthly Salary (SAR)")} *</Label>
        <Input type="number" min="0" value={data.monthlySalary}
          onChange={e => onChange({ ...data, monthlySalary: e.target.value })}
          placeholder="8000" data-testid="input-salary" dir="ltr" className="text-start" />
      </div>
      <div className="space-y-1">
        <Label>{t("نوع العقد", "Contract Type")}</Label>
        <Select value={data.contractType || "none"} onValueChange={v => onChange({ ...data, contractType: v === "none" ? "" : v })}>
          <SelectTrigger data-testid="select-contract-type"><SelectValue placeholder={t("اختر نوع العقد", "Select type")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("غير محدد", "Not specified")}</SelectItem>
            {Object.entries(contractTypeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{t(v.ar, v.en)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>{t("رقم الجوال", "Phone")} *</Label>
        <Input type="tel" inputMode="numeric" maxLength={15} value={data.phone}
          onChange={e => onChange({ ...data, phone: toLatinDigits(e.target.value).replace(/[^0-9+]/g, "") })}
          placeholder="05xxxxxxxx" data-testid="input-phone" dir="ltr" className="text-start" />
      </div>
      <div className="space-y-1">
        <Label>{t("تاريخ الميلاد", "Date of birth")}</Label>
        <Input type="date" value={data.dateOfBirth} onChange={e => onChange({ ...data, dateOfBirth: e.target.value })} data-testid="input-birth-date" />
      </div>
      <div className="space-y-1">
        <Label>{t("البريد الإلكتروني", "Email")}</Label>
        <Input type="email" value={data.email} onChange={e => onChange({ ...data, email: e.target.value })}
          placeholder="employee@example.com" data-testid="input-email" dir="ltr" className="text-start" />
      </div>
      <AttendanceAssignmentFields data={data} onChange={onChange} />
      <div className="space-y-1">
        <Label>{t("موقع السكن / الملاحظة (نص)", "Home location / note (text)")}</Label>
        <Input value={data.fingerScanLocation} onChange={e => onChange({ ...data, fingerScanLocation: e.target.value })}
          placeholder={t("اختياري، لا يُستخدم كنطاق بصمة", "Optional; not used as attendance zone")} data-testid="input-finger-scan" />
      </div>
      <div className="space-y-1">
        <Label>{t("حساب إداري مرتبط (اختياري)", "Linked admin account (optional)")}</Label>
        <Select value={data.userId || "none"} onValueChange={v => onChange({ ...data, userId: v === "none" ? "" : v })}>
          <SelectTrigger data-testid="select-user"><SelectValue placeholder={t("بدون حساب", "No account")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("بدون حساب", "No account")}</SelectItem>
            {users.map((u: any) => (
              <SelectItem key={u.id} value={u.id.toString()}>
                {t(u.fullNameAr, u.fullNameEn)} <span className="text-muted-foreground">(@{u.username})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("لا يلزم حساب إداري لدخول الموظف للخدمة الذاتية.", "Self-service does not require an admin account.")}</p>
      </div>
      <div className="space-y-1">
        <Label>{t("المدير المباشر (اختياري)", "Direct Manager (optional)")}</Label>
        <Select value={data.managerId || "none"} onValueChange={v => onChange({ ...data, managerId: v === "none" ? "" : v })}>
          <SelectTrigger data-testid="select-manager"><SelectValue placeholder={t("بدون مدير — الاعتماد من الموارد البشرية", "No manager — HR approves")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("بدون مدير (HR/المالك)", "No manager (HR/Owner)")}</SelectItem>
            {allEmployees.filter(e => e.status === "active").map(e => (
              <SelectItem key={e.id} value={e.id.toString()}>{e.fullNameAr || e.fullNameEn || `#${e.id}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data.nationality === "resident" && (
        <>
          <div className="space-y-1">
            <Label>{t("رقم الإقامة", "Iqama Number")}</Label>
            <Input value={data.iqamaNumber} onChange={e => onChange({ ...data, iqamaNumber: e.target.value })}
              data-testid="input-iqama" dir="ltr" className="text-start" />
          </div>
          <DateInput label={t("تاريخ انتهاء الإقامة", "Iqama Expiry")}
            value={data.iqamaExpiry} onChange={v => onChange({ ...data, iqamaExpiry: v })}
            testId="input-iqama-expiry" />
        </>
      )}

      <DateInput label={t("تاريخ انتهاء التأمين الصحي", "Health Insurance Expiry")}
        value={data.insuranceExpiry} onChange={v => onChange({ ...data, insuranceExpiry: v })}
        testId="input-insurance-expiry" />

      <DateInput label={t("بداية العقد", "Contract Start")} required
        value={data.contractStart} onChange={v => onChange({ ...data, contractStart: v })}
        testId="input-contract-start" />
      <DateInput label={t("نهاية العقد", "Contract End")}
        value={data.contractEnd} onChange={v => onChange({ ...data, contractEnd: v })}
        testId="input-contract-end" />

      <div className="space-y-1 sm:col-span-2">
        <Label>{t("الحالة", "Status")}</Label>
        <Select value={data.status} onValueChange={v => onChange({ ...data, status: v })}>
          <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(statusConfig).map(([k, v]) => (
              <SelectItem key={k} value={k}>{t(v.ar, v.en)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function AttendanceAssignmentFields({ data, onChange }: {
  data: EmployeeForm;
  onChange: (data: EmployeeForm) => void;
}) {
  const { data: zones = [] } = useQuery<{ id: number; nameAr: string; radiusMeters?: number }[]>({ queryKey: ["/api/attendance/zones"] });
  const { data: schedules = [] } = useQuery<any[]>({ queryKey: ["/api/attendance/work-settings"] });
  return (
    <div className="space-y-3 rounded-md border p-3 sm:col-span-2">
      <p className="text-sm font-semibold">تعيين موقع البصمة وجدول الدوام</p>
      <div className="space-y-1">
        <Label>موقع البصمة المخصص</Label>
        <Select value={data.attendanceZoneId || "none"} onValueChange={value => onChange({ ...data, attendanceZoneId: value === "none" ? "" : value, attendanceScheduleId: "" })}>
          <SelectTrigger className="min-h-11"><SelectValue placeholder="اختر موقع البصمة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">بدون موقع مخصص</SelectItem>
            {zones.map(zone => <SelectItem key={zone.id} value={String(zone.id)}>{zone.nameAr} · نطاق {zone.radiusMeters || 50}م</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {data.attendanceZoneId && (
        <div className="space-y-1">
          <Label>خيار جدول الدوام</Label>
          <Select value={data.attendanceScheduleId || "none"} onValueChange={value => onChange({ ...data, attendanceScheduleId: value === "none" ? "" : value })}>
            <SelectTrigger className="min-h-11"><SelectValue placeholder="اختر الجدول" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">تحديد تلقائي</SelectItem>
              {schedules.filter((schedule: any) => schedule.scopeType === "location" && String(schedule.locationZoneId) === data.attendanceZoneId)
                .map((schedule: any) => <SelectItem key={schedule.id} value={String(schedule.id)}>{schedule.labelAr || schedule.label || `جدول ${schedule.id}`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: "asc" | "desc" }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 text-muted-foreground/50 inline ms-1" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 text-primary inline ms-1" />
    : <ChevronDown className="w-3 h-3 text-primary inline ms-1" />;
}

function exportEmployeePDF(emp: Employee, users: any[], t: (ar: string, en: string) => string) {
  const user = users.find((u: any) => u.id === emp.userId);
  const nameAr = (emp as any).fullNameAr || user?.fullNameAr || "—";
  const nameEn = (emp as any).fullNameEn || user?.fullNameEn || "—";
  const dept = departmentLabels[emp.department] || { ar: emp.department, en: emp.department };
  const status = statusConfig[emp.status] || statusConfig.active;
  const nat = nationalityLabels[emp.nationality] || { ar: emp.nationality, en: emp.nationality };
  const ct = emp.contractType ? (contractTypeLabels[emp.contractType as string] || { ar: emp.contractType as string, en: emp.contractType as string }) : { ar: "—", en: "—" };
  const serviceDuration = computeServiceDuration(emp.contractStart, t);

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<title>ملف الموظف - ${nameAr}</title>
<style>
  body { font-family: Arial, sans-serif; direction: rtl; margin: 40px; color: #111; }
  h1 { color: #9e0a0a; border-bottom: 3px solid #9e0a0a; padding-bottom: 8px; }
  h2 { color: #333; margin-top: 24px; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: right; padding: 6px 10px; background: #f5f5f5; font-size: 13px; color: #555; width: 35%; }
  td { padding: 6px 10px; font-size: 14px; border-bottom: 1px solid #eee; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
  .active { background: #dcfce7; color: #166534; }
  .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>ملف الموظف الوظيفي</h1>
<h2>المعلومات الأساسية</h2>
<table>
  <tr><th>رقم الموظف</th><td>#${emp.employeeNumber}</td></tr>
  <tr><th>الاسم (عربي)</th><td>${nameAr}</td></tr>
  <tr><th>الاسم (إنجليزي)</th><td>${nameEn}</td></tr>
  <tr><th>المسمى الوظيفي</th><td>${emp.position}</td></tr>
  <tr><th>القسم</th><td>${dept.ar}</td></tr>
  <tr><th>الجنسية</th><td>${nat.ar}</td></tr>
  <tr><th>الراتب الشهري</th><td>${parseFloat(emp.monthlySalary?.toString() || "0").toLocaleString()} ر.س</td></tr>
  <tr><th>الحالة</th><td><span class="badge active">${status.ar}</span></td></tr>
</table>
<h2>تفاصيل العقد</h2>
<table>
  <tr><th>نوع العقد</th><td>${ct.ar}</td></tr>
  <tr><th>تاريخ بداية العقد</th><td>${emp.contractStart || "—"}</td></tr>
  <tr><th>تاريخ نهاية العقد</th><td>${emp.contractEnd || "—"}</td></tr>
  <tr><th>مدة الخدمة</th><td>${serviceDuration}</td></tr>
  <tr><th>موقع البصمة</th><td>${(emp as any).fingerScanLocation || "—"}</td></tr>
</table>
<h2>معلومات التواصل والتأمين</h2>
<table>
  <tr><th>رقم الجوال</th><td>${(emp as any).phone || "—"}</td></tr>
  <tr><th>البريد الإلكتروني</th><td>${(emp as any).email || "—"}</td></tr>
  <tr><th>تاريخ انتهاء التأمين الصحي</th><td>${(emp as any).insuranceExpiry || "—"}</td></tr>
  ${emp.nationality === "resident" ? `<tr><th>رقم الإقامة</th><td>${emp.iqamaNumber || "—"}</td></tr><tr><th>انتهاء الإقامة</th><td>${emp.iqamaExpiry || "—"}</td></tr>` : ""}
</table>
<div class="footer">
  <p>تم إنشاء هذا الملف بتاريخ: ${new Date().toLocaleDateString("ar-SA")} | نظام تيك للإدارة</p>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `employee-${emp.employeeNumber}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

const DOC_ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const DOC_MAX_SIZE = 10 * 1024 * 1024;
const isImageDoc = (mime?: string) => !!mime && mime.startsWith("image/");

function DocumentsSection({ emp }: { emp: Employee }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [docName, setDocName] = useState("");
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);

  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const liveEmp = employees.find(e => e.id === emp.id) || emp;
  const docs = (liveEmp.documents as any[] || []);

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (!DOC_ALLOWED_MIME.includes(file.type)) {
      toast({
        title: t("نوع ملف غير مدعوم", "Unsupported file type"),
        description: t("يُسمح برفع ملفات PDF أو صور (JPG/PNG) فقط", "Only PDF or images (JPG/PNG) are allowed"),
        variant: "destructive",
      });
      return;
    }
    if (file.size > DOC_MAX_SIZE) {
      toast({
        title: t("حجم الملف كبير جدًا", "File too large"),
        description: t("الحد الأقصى المسموح به 10 ميجابايت", "Maximum allowed size is 10 MB"),
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (docName) formData.append("name", docName);
      const res = await fetch(`/api/employees/${emp.id}/documents`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        let msg = "";
        try { msg = (await res.json())?.message || ""; } catch { /* ignore */ }
        throw new Error(msg);
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setDocName("");
      toast({ title: t("تم رفع المستند بنجاح", "Document uploaded successfully") });
    } catch (err: any) {
      toast({
        title: t("حدث خطأ في رفع المستند", "Error uploading document"),
        description: err?.message || undefined,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (docId: number) => apiRequest("DELETE", `/api/employees/${emp.id}/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: t("تم حذف المستند", "Document deleted") });
    },
    onError: () => toast({ title: t("خطأ في حذف المستند", "Error deleting document"), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={t("اسم المستند (اختياري)", "Document name (optional)")}
          value={docName}
          onChange={e => setDocName(e.target.value)}
          className="max-w-xs"
          data-testid="input-doc-name"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          data-testid="button-upload-doc"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin me-1" /> : <Upload className="w-4 h-4 me-1" />}
          {t("رفع مستند", "Upload Document")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
        />
      </div>
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 opacity-70" />
        {t("يُسمح برفع ملفات PDF أو صور (JPG/PNG) فقط — بحد أقصى 10 ميجابايت", "Only PDF or image files (JPG/PNG) are allowed — up to 10 MB")}
      </p>
      {docs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t("لا توجد مستندات مرفوعة", "No documents uploaded")}</p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border overflow-hidden">
          {docs.map((doc: any) => {
            const img = isImageDoc(doc.mime);
            return (
              <div key={doc.id} className="flex items-center justify-between px-4 py-3" data-testid={`row-doc-${doc.id}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-1.5 rounded shrink-0 ${img ? "bg-blue-100 dark:bg-blue-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                    {img
                      ? <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      : <FileText className="w-4 h-4 text-red-600 dark:text-red-400" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {img ? t("صورة", "Image") : "PDF"} · {new Date(doc.uploadedAt).toLocaleDateString("ar-SA")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={() => setPreviewDoc(doc)}
                    title={t("معاينة", "Preview")}
                    data-testid={`button-view-doc-${doc.id}`}>
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" asChild
                    title={t("تحميل", "Download")}
                    data-testid={`button-download-doc-${doc.id}`}>
                    <a href={doc.url} download={doc.name}>
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600"
                    onClick={() => deleteMutation.mutate(doc.id)}
                    disabled={deleteMutation.isPending}
                    title={t("حذف", "Delete")}
                    data-testid={`button-delete-doc-${doc.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
              <img
                src={previewDoc.url}
                alt={previewDoc.name}
                className="max-w-full max-h-full object-contain"
                data-testid="img-doc-preview"
              />
            ) : (
              <iframe
                src={previewDoc.url}
                title={previewDoc.name}
                className="w-full h-full border-0"
                data-testid="iframe-doc-preview"
              />
            ))}
          </div>
          <div className="px-4 py-3 border-t flex justify-end gap-2">
            <Button size="sm" variant="ghost" asChild data-testid="button-open-newtab-preview">
              <a href={previewDoc?.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 me-1.5" />
                {t("فتح في تبويب جديد", "Open in new tab")}
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild data-testid="button-download-preview">
              <a href={previewDoc?.url} download={previewDoc?.name}>
                <Download className="w-4 h-4 me-1.5" />
                {t("تحميل المستند", "Download Document")}
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountManagementSection({ emp, users, onClose }: { emp: Employee; users: any[]; onClose: () => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const linkedUser = users.find((u: any) => u.id === emp.userId);

  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/hr-audit-log", emp.id],
    queryFn: () => fetch(`/api/hr-audit-log?employeeId=${emp.id}`, { credentials: "include" }).then(r => r.json()),
    enabled: currentUser?.role === "owner" || currentUser?.role === "it",
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hr/reset-password", {
      userId: linkedUser?.id,
      newPassword,
      employeeId: emp.id,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr-audit-log", emp.id] });
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: t("تم إعادة تعيين كلمة المرور بنجاح", "Password reset successfully") });
    },
    onError: () => toast({ title: t("حدث خطأ في إعادة تعيين كلمة المرور", "Error resetting password"), variant: "destructive" }),
  });

  const toggleAccountMutation = useMutation({
    mutationFn: (active: boolean) => apiRequest("POST", "/api/hr/toggle-account", {
      userId: linkedUser?.id,
      active,
      employeeId: emp.id,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hr-audit-log", emp.id] });
      toast({ title: t("تم تحديث الحساب", "Account updated") });
    },
    onError: () => toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }),
  });

  if (!linkedUser) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {t("لا يوجد حساب مستخدم مرتبط بهذا الموظف", "No user account linked to this employee")}
      </p>
    );
  }

  const isOwnerOrIt = currentUser?.role === "owner" || currentUser?.role === "it";

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t(linkedUser.fullNameAr, linkedUser.fullNameEn)}</p>
              <p className="text-sm text-muted-foreground">@{linkedUser.username}</p>
            </div>
            <Badge className={linkedUser.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
              {linkedUser.active ? t("نشط", "Active") : t("معطّل", "Disabled")}
            </Badge>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => toggleAccountMutation.mutate(!linkedUser.active)}
              disabled={toggleAccountMutation.isPending}
              data-testid="button-toggle-account"
            >
              {toggleAccountMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-1" /> : (
                linkedUser.active ? <UserX className="w-4 h-4 me-1" /> : <UserCheck2 className="w-4 h-4 me-1" />
              )}
              {linkedUser.active ? t("تعطيل الحساب", "Disable Account") : t("تفعيل الحساب", "Enable Account")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h4 className="font-medium text-sm">{t("إعادة تعيين كلمة المرور", "Reset Password")}</h4>
        <div className="space-y-2">
          <Input
            type="password"
            placeholder={t("كلمة المرور الجديدة", "New password")}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            data-testid="input-new-password"
            dir="ltr"
            className="text-start"
          />
          <Input
            type="password"
            placeholder={t("تأكيد كلمة المرور", "Confirm password")}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            data-testid="input-confirm-password"
            dir="ltr"
            className="text-start"
          />
          <Button
            size="sm"
            onClick={() => resetPasswordMutation.mutate()}
            disabled={!newPassword || newPassword !== confirmPassword || resetPasswordMutation.isPending}
            data-testid="button-reset-password"
          >
            {resetPasswordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-1" /> : <Lock className="w-4 h-4 me-1" />}
            {t("تعيين كلمة المرور", "Set Password")}
          </Button>
          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-red-500">{t("كلمتا المرور غير متطابقتين", "Passwords do not match")}</p>
          )}
        </div>
      </div>

      {isOwnerOrIt && auditLogs.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            {t("سجل التدقيق", "Audit Log")}
          </h4>
          <div className="divide-y divide-border rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
            {auditLogs.map((log: any) => {
              const action = auditActionLabels[log.action] || { ar: log.action, en: log.action, cls: "" };
              return (
                <div key={log.id} className="px-3 py-2.5 text-xs" data-testid={`row-audit-${log.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-medium ${action.cls}`}>{t(action.ar, action.en)}</span>
                    <span className="text-muted-foreground" dir="ltr">{new Date(log.createdAt).toLocaleString("ar-SA")}</span>
                  </div>
                  {log.details && <p className="text-muted-foreground mt-0.5">{log.details}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function calcEOSB(monthlySalary: number, contractStart: string, terminationReason: string, terminationDate: string) {
  if (!contractStart || !terminationDate || !terminationReason) return null;
  const start = new Date(contractStart);
  const end = new Date(terminationDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return null;
  const diffMs = end.getTime() - start.getTime();
  const totalDays = Math.floor(diffMs / (1000 * 3600 * 24));
  const totalYears = totalDays / 365;
  const fullYears = Math.floor(totalYears);
  const remainingDays = totalDays - fullYears * 365;
  const dailyWage = monthlySalary / 30;
  let steps: string[] = [];
  let amount = 0;

  if (terminationReason === "death" || terminationReason === "disability") {
    const first5Years = Math.min(fullYears, 5);
    const beyond5Years = Math.max(0, fullYears - 5);
    const part1 = first5Years * (monthlySalary / 2);
    const part2 = beyond5Years * monthlySalary;
    const partialYear = (remainingDays / 365) * monthlySalary;
    amount = part1 + part2 + partialYear;
    steps = [
      `المدة الكلية: ${fullYears} سنة و${remainingDays} يوم`,
      `السنوات الأولى (حتى 5): ${first5Years} × نصف شهر = ${part1.toFixed(2)} ر.س`,
      beyond5Years > 0 ? `السنوات بعد الخامسة: ${beyond5Years} × شهر كامل = ${part2.toFixed(2)} ر.س` : null,
      `الكسور: ${remainingDays} يوم × ${dailyWage.toFixed(2)} = ${partialYear.toFixed(2)} ر.س`,
      `المجموع الكلي: ${amount.toFixed(2)} ر.س (مكافأة كاملة — وفاة/عجز)`,
    ].filter(Boolean) as string[];
  } else if (terminationReason === "resignation") {
    if (totalYears < 2) {
      amount = 0;
      steps = [`المدة: ${fullYears} سنة و${remainingDays} يوم`, `أقل من سنتين عند الاستقالة → لا يوجد استحقاق`];
    } else if (totalYears < 5) {
      const base = fullYears * (monthlySalary / 2);
      amount = base * (1 / 3);
      steps = [`المدة: ${fullYears} سنة`, `القاعدة: ${fullYears} × نصف شهر = ${base.toFixed(2)} ر.س`, `نسبة الاستحقاق (2-5 سنوات استقالة) = ثلث المكافأة`, `المستحق: ${amount.toFixed(2)} ر.س`];
    } else if (totalYears < 10) {
      const first5 = 5 * (monthlySalary / 2);
      const beyond5 = (fullYears - 5) * monthlySalary;
      const base = first5 + beyond5;
      amount = base * (2 / 3);
      steps = [`المدة: ${fullYears} سنة`, `5 سنوات أولى: 5 × نصف شهر = ${first5.toFixed(2)} ر.س`, `${fullYears - 5} سنوات بعد الخامسة × شهر = ${beyond5.toFixed(2)} ر.س`, `نسبة الاستحقاق (5-10 سنوات استقالة) = ثلثا المكافأة`, `المستحق: ${amount.toFixed(2)} ر.س`];
    } else {
      const first5 = 5 * (monthlySalary / 2);
      const beyond5 = (fullYears - 5) * monthlySalary;
      amount = first5 + beyond5;
      steps = [`المدة: ${fullYears} سنة`, `5 سنوات أولى: 5 × نصف شهر = ${first5.toFixed(2)} ر.س`, `${fullYears - 5} سنوات بعد الخامسة × شهر = ${beyond5.toFixed(2)} ر.س`, `10 سنوات فأكثر عند الاستقالة → مكافأة كاملة`, `المستحق: ${amount.toFixed(2)} ر.س`];
    }
  } else {
    if (fullYears < 2) {
      amount = 0;
      steps = [`المدة: ${fullYears} سنة و${remainingDays} يوم`, `أقل من سنتين → لا يوجد استحقاق`];
    } else {
      const first5Years = Math.min(fullYears, 5);
      const beyond5Years = Math.max(0, fullYears - 5);
      const part1 = first5Years * (monthlySalary / 2);
      const part2 = beyond5Years * monthlySalary;
      const partialYear = (remainingDays / 365) * monthlySalary;
      amount = part1 + part2 + partialYear;
      steps = [
        `المدة الكلية: ${fullYears} سنة و${remainingDays} يوم`,
        `السنوات الأولى (حتى 5): ${first5Years} × نصف شهر = ${part1.toFixed(2)} ر.س`,
        beyond5Years > 0 ? `السنوات بعد الخامسة: ${beyond5Years} × شهر كامل = ${part2.toFixed(2)} ر.س` : null,
        remainingDays > 0 ? `الكسور: ${remainingDays} يوم × ${dailyWage.toFixed(2)} = ${partialYear.toFixed(2)} ر.س` : null,
        `المجموع: ${amount.toFixed(2)} ر.س`,
      ].filter(Boolean) as string[];
    }
  }
  return { amount, steps, totalYears: fullYears, remainingDays };
}

function EOSCalculator({ employee }: { employee: Employee }) {
  const { t } = useLanguage();
  const [reason, setReason] = useState("");
  const [terminationDate, setTerminationDate] = useState(new Date().toISOString().split("T")[0]);
  const salary = parseFloat(employee.monthlySalary?.toString() || "0");
  const result = useMemo(() => {
    if (!reason || !terminationDate) return null;
    return calcEOSB(salary, employee.contractStart, reason, terminationDate);
  }, [reason, terminationDate, salary, employee.contractStart]);

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{t("سبب الإنهاء", "Termination Reason")} *</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger data-testid="select-termination-reason">
              <SelectValue placeholder={t("اختر السبب", "Select reason")} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(terminationReasons).map(([k, v]) => (
                <SelectItem key={k} value={k}>{t(v.ar, v.en)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t("تاريخ الإنهاء", "Termination Date")} *</Label>
          <Input type="date" value={terminationDate} onChange={e => setTerminationDate(e.target.value)}
            data-testid="input-termination-date" dir="ltr" className="text-start" />
        </div>
      </div>
      <div className="rounded-md border p-3 bg-muted/30 space-y-1">
        <p className="text-xs text-muted-foreground">{t("الراتب الشهري", "Monthly Salary")}: <span className="font-semibold text-foreground">{salary.toLocaleString()} {t("ر.س", "SAR")}</span></p>
        <p className="text-xs text-muted-foreground">{t("تاريخ بداية العقد", "Contract Start")}: <span className="font-semibold text-foreground">{employee.contractStart || "—"}</span></p>
      </div>
      {result !== null ? (
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <p className="text-sm font-semibold text-muted-foreground mb-1">{t("تفاصيل الحساب", "Calculation Details")}</p>
            <ol className="space-y-1.5">
              {result.steps.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="p-4 flex items-center justify-between">
            <span className="font-semibold">{t("إجمالي مكافأة نهاية الخدمة", "Total End-of-Service Gratuity")}</span>
            <span className={`text-2xl font-bold tabular-nums ${result.amount > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`} data-testid="text-eosb-amount">
              {result.amount.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t("ر.س", "SAR")}
            </span>
          </div>
        </div>
      ) : !reason ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
          <Calculator className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {t("اختر سبب الإنهاء لحساب المكافأة", "Select a termination reason to calculate gratuity")}
        </div>
      ) : null}
    </div>
  );
}

function AssetsPanel({ employee }: { employee: Employee }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [assetForm, setAssetForm] = useState({
    assetType: "laptop", description: "", serialNumber: "",
    assignedAt: new Date().toISOString().split("T")[0], notes: "",
  });

  const { data: assets = [], isLoading } = useQuery<EmployeeAsset[]>({
    queryKey: ["/api/employees", employee.id, "assets"],
    queryFn: () => fetch(`/api/employees/${employee.id}/assets`, { credentials: "include" }).then(r => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/employees/${employee.id}/assets`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "assets"] });
      setAddOpen(false);
      setAssetForm({ assetType: "laptop", description: "", serialNumber: "", assignedAt: new Date().toISOString().split("T")[0], notes: "" });
      toast({ title: t("تمت إضافة العُهدة", "Asset added") });
    },
    onError: () => toast({ title: t("خطأ في الإضافة", "Error adding asset"), variant: "destructive" }),
  });

  const returnMutation = useMutation({
    mutationFn: ({ id, returnedAt }: { id: number; returnedAt: string }) =>
      apiRequest("PATCH", `/api/employee-assets/${id}`, { status: "returned", returnedAt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "assets"] });
      toast({ title: t("تم تسليم العُهدة", "Asset returned") });
    },
    onError: () => toast({ title: t("خطأ في التحديث", "Error updating"), variant: "destructive" }),
  });

  const activeAssets = assets.filter(a => a.status === "active");

  return (
    <div className="space-y-4 pt-2">
      {activeAssets.length > 0 && (
        <div className="rounded-md border border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/20 p-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
          <p className="text-sm text-orange-700 dark:text-orange-400">
            {t(`يوجد ${activeAssets.length} عُهدة غير مُسترجعة`, `${activeAssets.length} unreturned asset(s)`)}
          </p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{t("العُهد الممنوحة", "Assigned Assets")}</p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" data-testid="button-add-asset">
              <Plus className="w-3.5 h-3.5 me-1.5" />{t("إضافة عُهدة", "Add Asset")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t("إضافة عُهدة جديدة", "Add New Asset")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{t("نوع العُهدة", "Asset Type")} *</Label>
                <Select value={assetForm.assetType} onValueChange={v => setAssetForm(f => ({ ...f, assetType: v }))}>
                  <SelectTrigger data-testid="select-asset-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(assetTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{t(v.ar, v.en)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("الوصف", "Description")} *</Label>
                <Input value={assetForm.description} onChange={e => setAssetForm(f => ({ ...f, description: e.target.value }))}
                  placeholder={t("مثال: لابتوب Dell XPS 13", "e.g. Dell XPS 13 Laptop")} data-testid="input-asset-description" />
              </div>
              <div className="space-y-1">
                <Label>{t("الرقم التسلسلي", "Serial Number")}</Label>
                <Input value={assetForm.serialNumber} onChange={e => setAssetForm(f => ({ ...f, serialNumber: e.target.value }))}
                  dir="ltr" className="text-start" data-testid="input-asset-serial" />
              </div>
              <div className="space-y-1">
                <Label>{t("تاريخ التسليم", "Assigned Date")} *</Label>
                <Input type="date" value={assetForm.assignedAt} onChange={e => setAssetForm(f => ({ ...f, assignedAt: e.target.value }))}
                  dir="ltr" className="text-start" data-testid="input-asset-assigned-at" />
              </div>
              <div className="space-y-1">
                <Label>{t("ملاحظات", "Notes")}</Label>
                <Textarea value={assetForm.notes} onChange={e => setAssetForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} data-testid="input-asset-notes" />
              </div>
              <Button className="w-full" disabled={!assetForm.description || addMutation.isPending}
                onClick={() => addMutation.mutate(assetForm)} data-testid="button-save-asset">
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Plus className="w-4 h-4 me-2" />}
                {t("إضافة العُهدة", "Add Asset")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : assets.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {t("لا توجد عُهد مسجلة", "No assets registered")}
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map(asset => {
            const typeLabel = assetTypeLabels[asset.assetType] || { ar: asset.assetType, en: asset.assetType };
            return (
              <div key={asset.id} className={`rounded-lg border p-3 flex items-start justify-between gap-3 ${asset.status === "returned" ? "opacity-60" : ""}`}
                data-testid={`card-asset-${asset.id}`}>
                <div className="flex gap-3 items-start min-w-0">
                  <div className={`mt-0.5 p-1.5 rounded ${asset.status === "active" ? "bg-blue-100 dark:bg-blue-900/30" : "bg-muted"}`}>
                    <Package className={`w-3.5 h-3.5 ${asset.status === "active" ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{asset.description}</span>
                      <Badge variant="outline" className="text-[10px]">{t(typeLabel.ar, typeLabel.en)}</Badge>
                      {asset.status === "active"
                        ? <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{t("نشطة", "Active")}</Badge>
                        : <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"><CheckCircle2 className="w-3 h-3 me-1" />{t("مُسترجعة", "Returned")}</Badge>
                      }
                    </div>
                    {asset.serialNumber && <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">SN: {asset.serialNumber}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{t("تسليم:", "Assigned:")} {asset.assignedAt}{asset.returnedAt ? ` — ${t("استرداد:", "Returned:")} ${asset.returnedAt}` : ""}</p>
                    {asset.notes && <p className="text-xs text-muted-foreground mt-0.5">{asset.notes}</p>}
                  </div>
                </div>
                {asset.status === "active" && (
                  <Button size="sm" variant="outline" className="shrink-0 text-xs h-7"
                    onClick={() => returnMutation.mutate({ id: asset.id, returnedAt: new Date().toISOString().split("T")[0] })}
                    disabled={returnMutation.isPending}
                    data-testid={`button-return-asset-${asset.id}`}>
                    <RotateCcw className="w-3 h-3 me-1" />{t("استرداد", "Return")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmployeeDetailDialog({ emp, users, onClose, initialTab }: { emp: Employee; users: any[]; onClose: () => void; initialTab?: "attendance" }) {
  const { t } = useLanguage();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [editForm, setEditForm] = useState<EmployeeForm>({
    employeeNumber: emp.employeeNumber,
    fullNameAr: (emp as any).fullNameAr || "",
    fullNameEn: (emp as any).fullNameEn || "",
    nationality: emp.nationality,
    position: emp.position,
    department: emp.department,
    monthlySalary: emp.monthlySalary?.toString() || "",
    iqamaNumber: emp.iqamaNumber || "",
    dateOfBirth: emp.dateOfBirth || "",
    iqamaExpiry: emp.iqamaExpiry || "",
    contractStart: emp.contractStart || "",
    contractEnd: emp.contractEnd || "",
    status: emp.status,
    userId: emp.userId?.toString() || "",
    contractType: (emp as any).contractType || "",
    insuranceExpiry: (emp as any).insuranceExpiry || "",
    fingerScanLocation: (emp as any).fingerScanLocation || "",
    phone: (emp as any).phone || "",
    email: (emp as any).email || "",
    attendanceEnabled: emp.attendanceEnabled !== false,
    managerId: (emp as any).managerId?.toString() || "",
    attendanceZoneId: (emp as any).attendanceZoneId?.toString() || "",
    attendanceScheduleId: (emp as any).attendanceScheduleId?.toString() || "",
  });

  const { data: jobTitlesList = [] } = useQuery<any[]>({ queryKey: ["/api/job-titles"] });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/employees/${emp.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: t("تم تحديث بيانات الموظف", "Employee updated") });
    },
    onError: (err: any) => toast({ title: err?.message || t("حدث خطأ في التحديث", "Error updating"), variant: "destructive" }),
  });

  const attendanceMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("PATCH", `/api/employees/${emp.id}`, { attendanceEnabled: enabled }),
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setEditForm(f => ({ ...f, attendanceEnabled: enabled }));
      toast({ title: enabled ? t("تم تفعيل الحضور", "Attendance enabled") : t("تم تعطيل الحضور", "Attendance disabled") });
    },
    onError: () => toast({ title: t("خطأ", "Error"), variant: "destructive" }),
  });

  const isFormValid = editForm.fullNameAr.trim() && editForm.employeeNumber.trim() && editForm.position.trim() && editForm.monthlySalary && editForm.contractStart.length === 10;

  const handleUpdate = () => {
    const data: any = {
      employeeNumber: editForm.employeeNumber.trim(),
      fullNameAr: editForm.fullNameAr.trim(),
      fullNameEn: editForm.fullNameEn?.trim() || null,
      position: editForm.position.trim(),
      department: editForm.department,
      monthlySalary: editForm.monthlySalary,
      nationality: editForm.nationality,
      status: editForm.status,
      contractStart: editForm.contractStart,
      contractType: editForm.contractType || null,
      insuranceExpiry: editForm.insuranceExpiry || null,
      fingerScanLocation: editForm.fingerScanLocation || null,
      phone: editForm.phone || null,
      dateOfBirth: editForm.dateOfBirth || null,
      email: editForm.email || null,
      attendanceEnabled: editForm.attendanceEnabled,
      attendanceZoneId: editForm.attendanceZoneId ? Number(editForm.attendanceZoneId) : null,
      attendanceScheduleId: editForm.attendanceScheduleId ? Number(editForm.attendanceScheduleId) : null,
    };
    if (editForm.userId && editForm.userId !== "none") data.userId = parseInt(editForm.userId);
    else data.userId = null;
    data.managerId = editForm.managerId && parseInt(editForm.managerId) !== emp.id ? parseInt(editForm.managerId) : null;
    if (editForm.iqamaNumber) data.iqamaNumber = editForm.iqamaNumber;
    if (editForm.iqamaExpiry) data.iqamaExpiry = editForm.iqamaExpiry;
    if (editForm.contractEnd) data.contractEnd = editForm.contractEnd;
    updateMutation.mutate(data);
  };

  const serviceDuration = computeServiceDuration(emp.contractStart, t);
  const canManageAccess = !currentUser?.maintenanceScope && (currentUser?.role === "owner" || currentUser?.role === "hr" || currentUser?.role === "it");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("مدة الخدمة", "Service")}: <span className="font-semibold text-foreground">{serviceDuration}</span></p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("الحضور", "Attendance")}</span>
          <Switch
            checked={editForm.attendanceEnabled}
            onCheckedChange={v => attendanceMutation.mutate(v)}
            disabled={attendanceMutation.isPending}
            data-testid="switch-attendance-enabled"
          />
        </div>
      </div>

      <Tabs defaultValue={initialTab === "attendance" ? "attendance" : "info"} className="w-full">
        <TabsList className="mb-4 flex h-auto w-full flex-wrap gap-1" data-testid="tabs-employee-detail">
          <TabsTrigger value="info" className="min-h-11 flex-1" data-testid="tab-employee-info">{t("البيانات", "Info")}</TabsTrigger>
          <TabsTrigger value="attendance" className="min-h-11 flex-1" data-testid="tab-employee-attendance"><MapPin className="me-1 h-4 w-4" />الدوام</TabsTrigger>
          <TabsTrigger value="assets" className="min-h-11 flex-1" data-testid="tab-employee-assets">
            <Package className="w-3.5 h-3.5 me-1" />{t("العُهد", "Assets")}
          </TabsTrigger>
          <TabsTrigger value="eosb" className="min-h-11 flex-1" data-testid="tab-employee-eosb">
            <Calculator className="w-3.5 h-3.5 me-1" />{t("نهاية الخدمة", "EOS")}
          </TabsTrigger>
          <TabsTrigger value="documents" className="min-h-11 flex-1" data-testid="tab-docs">{t("المستندات", "Documents")}</TabsTrigger>
          {canManageAccess && emp.userId && (
            <TabsTrigger value="access" className="min-h-11 flex-1" data-testid="tab-access">{t("الصلاحيات", "Access")}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => exportEmployeePDF(emp, users, t)} data-testid="button-export-pdf">
              <Download className="w-4 h-4 me-1" />{t("تصدير PDF", "Export PDF")}
            </Button>
          </div>
          <FormFields data={editForm} onChange={setEditForm} users={users} jobTitlesList={jobTitlesList} />
          <Button className="w-full" onClick={handleUpdate} disabled={!isFormValid || updateMutation.isPending} data-testid="button-save-employee">
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
            {t("حفظ التعديلات", "Save Changes")}
          </Button>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <p className="text-sm text-muted-foreground">هذه الحقول تستخدم تعيين الموظف الحالي لموقع البصمة وخيار جدول الدوام.</p>
          <AttendanceAssignmentFields data={editForm} onChange={setEditForm} />
          <Button className="min-h-11 w-full" onClick={handleUpdate} disabled={!isFormValid || updateMutation.isPending} data-testid="button-save-employee-attendance">
            {updateMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
            حفظ تعيينات الدوام
          </Button>
        </TabsContent>

        <TabsContent value="assets" className="mt-2">
          <AssetsPanel employee={emp} />
        </TabsContent>

        <TabsContent value="eosb" className="mt-2">
          <EOSCalculator employee={emp} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsSection emp={emp} />
        </TabsContent>

        {canManageAccess && emp.userId && (
          <TabsContent value="access">
            <AccountManagementSection emp={emp} users={users} onClose={onClose} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function JobTitlesManager() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [newAr, setNewAr] = useState("");
  const [newEn, setNewEn] = useState("");

  const { data: jobTitlesList = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/job-titles"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/job-titles", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-titles"] });
      setNewAr(""); setNewEn("");
      toast({ title: t("تمت إضافة المسمى الوظيفي", "Job title added") });
    },
    onError: () => toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/job-titles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-titles"] });
      toast({ title: t("تم حذف المسمى الوظيفي", "Job title deleted") });
    },
    onError: () => toast({ title: t("حدث خطأ في الحذف", "Error deleting"), variant: "destructive" }),
  });

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input placeholder={t("المسمى الوظيفي (عربي) *", "Arabic title *")} value={newAr} onChange={e => setNewAr(e.target.value)} data-testid="input-job-title-ar" />
        <Input placeholder={t("المسمى الوظيفي (إنجليزي)", "English title")} value={newEn} onChange={e => setNewEn(e.target.value)} data-testid="input-job-title-en" dir="ltr" className="text-start" />
        <Button onClick={() => createMutation.mutate({ nameAr: newAr.trim(), nameEn: newEn.trim() || newAr.trim() })}
          disabled={!newAr.trim() || createMutation.isPending} data-testid="button-add-job-title">
          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-1" /> : <Plus className="w-4 h-4 me-1" />}
          {t("إضافة", "Add")}
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : jobTitlesList.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">{t("لا توجد مسميات وظيفية", "No job titles yet")}</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border overflow-hidden">
          {jobTitlesList.map((jt: any) => (
            <div key={jt.id} className="flex items-center justify-between px-4 py-2.5" data-testid={`row-job-title-${jt.id}`}>
              <div>
                <p className="text-sm font-medium">{jt.nameAr}</p>
                <p className="text-xs text-muted-foreground">{jt.nameEn}</p>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500"
                onClick={() => deleteMutation.mutate(jt.id)} disabled={deleteMutation.isPending}
                data-testid={`button-delete-job-title-${jt.id}`}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EmployeesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [deleteEmpConfirm, setDeleteEmpConfirm] = useState<Employee | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [employeeDialogExpanded, setEmployeeDialogExpanded] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [sortKey, setSortKey] = useState<SortKey>("employeeNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [jobTitlesOpen, setJobTitlesOpen] = useState(false);
  const [departmentsOpen, setDepartmentsOpen] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const routeSearch = useSearch();
  const assignmentFocus = new URLSearchParams(routeSearch).get("tab") === "attendance";
  const employeeListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (assignmentFocus) employeeListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [assignmentFocus]);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const { data: jobTitlesList = [] } = useQuery<any[]>({ queryKey: ["/api/job-titles"] });
  const { data: departments = [] } = useQuery<{id:number;code:string;nameAr:string}[]>({ queryKey: ["/api/hr/departments"] });
  const addDepartmentMutation = useMutation({
    mutationFn: (nameAr: string) => apiRequest("POST", "/api/hr/departments", { nameAr }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/hr/departments"] }); setNewDepartmentName(""); toast({title:"تمت إضافة القسم"}); },
    onError: (err: Error) => toast({title:err.message||"تعذرت إضافة القسم",variant:"destructive"}),
  });
  const deleteDepartmentMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/hr/departments/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/hr/departments"] }); toast({title:"تم حذف القسم"}); },
    onError: (err: Error) => toast({title:err.message||"تعذر حذف القسم؛ قد يكون مرتبطًا بموظفين",variant:"destructive"}),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/employees", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setCreateOpen(false);
      setForm(emptyForm);
      toast({ title: t("تمت إضافة الموظف بنجاح", "Employee added successfully") });
    },
    onError: async (err: any) => {
      try {
        const r = await err.json?.();
        toast({ title: r?.message || err?.message || t("حدث خطأ في إضافة الموظف", "Error adding employee"), variant: "destructive" });
      } catch {
        toast({ title: t("حدث خطأ في إضافة الموظف", "Error adding employee"), variant: "destructive" });
      }
    },
  });

  const deleteEmpMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/employees/${id}`, { confirmEmployeeNumber: deleteConfirmation }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setDeleteEmpConfirm(null);
      toast({ title: t("تم حذف سجل الموظف بنجاح", "Employee record deleted") });
    },
    onError: (error: Error) => {
      toast({ title: error.message || t("خطأ في الحذف", "Delete failed"), variant: "destructive" });
    },
  });

  const getEmployeeName = (emp: any) => {
    if (emp.fullNameAr) return t(emp.fullNameAr, emp.fullNameEn || emp.fullNameAr);
    if (emp.userId) {
      const u = users.find((u: any) => u.id === emp.userId);
      if (u) return t(u.fullNameAr, u.fullNameEn);
    }
    return "—";
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const insuranceAlerts = useMemo(() => {
    return employees.filter(e => {
      const exp = (e as any).insuranceExpiry;
      if (!exp) return false;
      const diff = (new Date(exp).getTime() - Date.now()) / (1000 * 3600 * 24);
      return diff >= 0 && diff <= 30;
    });
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees
      .filter(e => filter === "all" || e.status === filter)
      .filter(e => departmentFilter === "all" || (e.department || "__none") === departmentFilter)
      .filter(e =>
        !q ||
        e.employeeNumber?.toLowerCase().includes(q) ||
        e.position?.toLowerCase().includes(q) ||
        (e.iqamaNumber && e.iqamaNumber.includes(q)) ||
        getEmployeeName(e).toLowerCase().includes(q) ||
        ((e as any).phone && (e as any).phone.includes(q)) ||
        ((e as any).email && (e as any).email.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        let av: string | number = "";
        let bv: string | number = "";
        if (sortKey === "monthlySalary") {
          av = parseFloat(a.monthlySalary?.toString() || "0");
          bv = parseFloat(b.monthlySalary?.toString() || "0");
          return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
        }
        av = (a[sortKey] || "").toString().toLowerCase();
        bv = (b[sortKey] || "").toString().toLowerCase();
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [employees, filter, search, sortKey, sortDir, users, departmentFilter]);

  const activeEmps = employees.filter(e => e.status === "active");
  const saudiCount = activeEmps.filter(e => e.nationality === "saudi").length;
  const residentCount = activeEmps.filter(e => e.nationality === "resident").length;
  const totalSalary = activeEmps.reduce((s, e) => s + parseFloat(e.monthlySalary?.toString() || "0"), 0);

  const isFormValid = (f: EmployeeForm) =>
    f.fullNameAr.trim() && f.employeeNumber.trim() && f.position.trim() && f.monthlySalary && f.contractStart.length === 10 &&
    /^(?:05\d{8}|(?:\+?966|00966)5\d{8})$/.test(toLatinDigits(f.phone));

  const handleCreate = () => {
    const data: any = {
      employeeNumber: form.employeeNumber.trim(),
      fullNameAr: form.fullNameAr.trim(),
      fullNameEn: form.fullNameEn?.trim() || null,
      nationality: form.nationality,
      position: form.position.trim(),
      department: form.department,
      monthlySalary: form.monthlySalary,
      contractStart: form.contractStart,
      status: form.status,
      contractType: form.contractType || null,
      insuranceExpiry: form.insuranceExpiry || null,
      fingerScanLocation: form.fingerScanLocation || null,
      phone: form.phone || null,
      dateOfBirth: form.dateOfBirth || null,
      email: form.email || null,
      attendanceEnabled: form.attendanceEnabled,
      attendanceZoneId: form.attendanceZoneId ? Number(form.attendanceZoneId) : null,
      attendanceScheduleId: form.attendanceScheduleId ? Number(form.attendanceScheduleId) : null,
    };
    if (form.userId && form.userId !== "none") data.userId = parseInt(form.userId);
    if (form.managerId) data.managerId = parseInt(form.managerId);
    if (form.iqamaNumber) data.iqamaNumber = form.iqamaNumber;
    if (form.iqamaExpiry) data.iqamaExpiry = form.iqamaExpiry;
    if (form.contractEnd) data.contractEnd = form.contractEnd;
    createMutation.mutate(data);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const thCls = "px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors";

  return (
    <div className="space-y-5">
      {insuranceAlerts.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 flex items-start gap-3" data-testid="alert-insurance-expiry">
          <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">{t("تنبيه: انتهاء التأمين الصحي قريباً", "Alert: Health Insurance Expiring Soon")}</p>
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
              {insuranceAlerts.map(e => `#${e.employeeNumber}`).join("، ")} — {t("تنتهي خلال 30 يوم أو أقل", "expiring within 30 days")}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-employees-title">{t("الموظفون", "Employees")}</h1>
      </div>

      <Dialog open={departmentsOpen} onOpenChange={setDepartmentsOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>إدارة الأقسام</DialogTitle></DialogHeader>
          <form className="flex gap-2" onSubmit={e=>{e.preventDefault();if(newDepartmentName.trim())addDepartmentMutation.mutate(newDepartmentName.trim())}}>
            <Input value={newDepartmentName} onChange={e=>setNewDepartmentName(e.target.value)} placeholder="اسم القسم بالعربية" required />
            <Button type="submit" disabled={!newDepartmentName.trim()||addDepartmentMutation.isPending}><Plus className="h-4 w-4 me-1"/>إضافة</Button>
          </form>
          <div className="divide-y rounded-md border max-h-72 overflow-auto">
            {departments.map(d=><div key={d.id} className="flex items-center justify-between px-3 py-2"><span>{d.nameAr}<small className="ms-2 text-muted-foreground" dir="ltr">{d.code}</small></span><Button size="icon" variant="ghost" aria-label={`حذف ${d.nameAr}`} onClick={()=>{if(window.confirm(`حذف قسم ${d.nameAr}؟`))deleteDepartmentMutation.mutate(d.id)}} disabled={deleteDepartmentMutation.isPending}><Trash2 className="h-4 w-4 text-destructive"/></Button></div>)}
            {!departments.length&&<p className="p-5 text-sm text-muted-foreground">لا توجد أقسام مخصصة.</p>}
          </div>
          <p className="text-xs text-muted-foreground">الأقسام المرتبطة بموظفين لا يمكن حذفها.</p>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <Users className="w-7 h-7 text-primary" />, val: activeEmps.length, label: t("موظف نشط", "Active Employees"), tid: "text-total-employees" },
          { icon: <UserCheck className="w-7 h-7 text-green-600" />, val: saudiCount, label: t("سعودي", "Saudi"), tid: "text-saudi-count", cls: "text-green-600" },
          { icon: <UserCog className="w-7 h-7 text-blue-600" />, val: residentCount, label: t("مقيم", "Resident"), tid: "text-resident-count", cls: "text-blue-600" },
          { icon: <DollarSign className="w-7 h-7 text-primary" />, val: totalSalary.toLocaleString(), label: t("إجمالي الرواتب ر.س", "Total Salaries SAR"), tid: "text-total-salary" },
        ].map((card, i) => (
          <Card key={i}>
            <CardContent className="p-2.5 sm:p-4 flex items-center gap-2 sm:gap-3">
              <span className="[&>svg]:h-5 [&>svg]:w-5 sm:[&>svg]:h-6 sm:[&>svg]:w-6">{card.icon}</span>
              <div>
                <p className={`text-lg sm:text-xl font-bold tabular-nums ${card.cls || ""}`} data-testid={card.tid}>{card.val}</p>
                <p className="text-xs text-muted-foreground leading-tight">{card.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label="أدوات إدارة الموظفين">
        <Button variant="outline" size="sm" className="min-h-11" onClick={() => setJobTitlesOpen(true)} data-testid="button-manage-job-titles">
          <ClipboardList className="w-4 h-4 me-1" />{t("المسميات الوظيفية", "Job Titles")}
        </Button>
        <Link href="/attendance-monitor?tab=zones" className="inline-flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="link-attendance-zones">
          <MapPin className="h-4 w-4" />مواقع البصمة
        </Link>
        <Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); if (!open) setForm(emptyForm); }}>
          <DialogTrigger asChild>
            <Button className="min-h-11" data-testid="button-new-employee">
              <Plus className="w-4 h-4 me-2" />{t("إضافة موظف", "Add Employee")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("إضافة موظف جديد", "Add New Employee")}</DialogTitle></DialogHeader>
            <FormFields data={form} onChange={setForm} users={users} jobTitlesList={jobTitlesList} />
            <Button className="w-full mt-3 min-h-11" onClick={handleCreate} disabled={!isFormValid(form) || createMutation.isPending} data-testid="button-create-employee">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Plus className="w-4 h-4 me-2" />}
              {t("إضافة الموظف", "Add Employee")}
            </Button>
          </DialogContent>
        </Dialog>
        <PrehireSection />
      </div>

      {assignmentFocus && (
        <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground" role="status">
          اختر «تعيين الموقع والجدول» من الموظف المطلوب؛ سيتم التعديل من نموذج الموظف المعتاد.
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="ps-10 min-h-11" placeholder={t("بحث بالاسم أو الرقم أو المسمى أو الجوال...", "Search by name, number, title, phone...")}
            value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-employees" />
        </div>
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-full sm:w-56 min-h-11" aria-label={t("القسم", "Department")}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("كل الأقسام", "All departments")} ({employees.length})</SelectItem>
            {Array.from(new Set(employees.map(e => e.department || ""))).sort().map(d => <SelectItem key={d} value={d || "__none"}>{departments.find(x=>x.code===d)?.nameAr || departmentLabels[d]?.ar || d || t("غير محدد", "Unassigned")} ({employees.filter(e => (e.department || "") === d).length})</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "all", ar: "الكل", en: "All" },
            { key: "active", ar: "نشط", en: "Active" },
            { key: "inactive", ar: "غير نشط", en: "Inactive" },
            { key: "terminated", ar: "منتهي", en: "Terminated" },
          ].map(tab => (
            <Button key={tab.key} size="sm" className="min-h-11" variant={filter === tab.key ? "default" : "outline"}
              onClick={() => setFilter(tab.key)} data-testid={`button-filter-${tab.key}`}>
              {t(tab.ar, tab.en)}
            </Button>
          ))}
        </div>
      </div>

      <details className="rounded-lg border bg-card px-3 py-2">
        <summary className="cursor-pointer min-h-11 flex items-center text-sm font-medium">أدوات إضافية: الأقسام والتصدير والطباعة</summary>
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => setDepartmentsOpen(true)}><Users className="w-4 h-4 me-1" />إدارة الأقسام</Button>
          <Button variant="outline" className="min-h-11" disabled={exporting || isLoading} onClick={async () => {
            setExporting(true);
            try { await exportEmployeeWorkbook(employees, departmentFilter === "all" ? undefined : departmentFilter === "__none" ? "" : departmentFilter); }
            catch (e) { toast({ title: t("تعذر تصدير Excel", "Excel export failed"), description: (e as Error).message, variant: "destructive" }); }
            finally { setExporting(false); }
          }}>{exporting ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Download className="w-4 h-4 me-2" />}{t("تصدير Excel", "Export Excel")}</Button>
          <Button variant="outline" className="min-h-11" onClick={() => setReport({ title: t("تقرير الموظفين", "Employee report"), subtitle: `${t("عدد النتائج", "Results")}: ${filtered.length}`, headings: employeeHeadings, rows: filtered.map(employeeExportRow) })}>{t("طباعة النتائج / PDF", "Print results / PDF")}</Button>
        </div>
      </details>
      <ReportPreview report={report} onClose={() => setReport(null)} />

      <Card className="overflow-hidden">
        <div ref={employeeListRef} className="scroll-mt-20">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm hr-responsive" data-testid="table-employees">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className={thCls} onClick={() => handleSort("employeeNumber")}>
                  {t("رقم الموظف", "Emp #")}<SortIcon col="employeeNumber" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thCls}>{t("الاسم / الحساب", "Name / Account")}</th>
                <th className={thCls} onClick={() => handleSort("position")}>
                  {t("المسمى الوظيفي", "Job Title")}<SortIcon col="position" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thCls} onClick={() => handleSort("department")}>
                  {t("القسم", "Dept")}<SortIcon col="department" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thCls} onClick={() => handleSort("contractStart")}>
                  {t("مدة الخدمة", "Service")}<SortIcon col="contractStart" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thCls} onClick={() => handleSort("monthlySalary")}>
                  {t("الراتب ر.س", "Salary SAR")}<SortIcon col="monthlySalary" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thCls} onClick={() => handleSort("status")}>
                  {t("الحالة", "Status")}<SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap w-12">
                  {t("إجراء", "Action")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    {t("لا يوجد موظفون مطابقون", "No employees found")}
                  </td>
                </tr>
              ) : filtered.map(emp => {
                const dept = { ar: departments.find(x=>x.code===emp.department)?.nameAr || departmentLabels[emp.department]?.ar || emp.department, en: departmentLabels[emp.department]?.en || emp.department };
                const status = statusConfig[emp.status] || statusConfig.active;
                const salary = parseFloat(emp.monthlySalary?.toString() || "0");
                const userName = getEmployeeName(emp);
                const serviceDuration = computeServiceDuration(emp.contractStart, t);

                return (
                  <tr key={emp.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-employee-${emp.id}`}>
                    <td data-label={t("رقم الموظف", "Employee number")} className="px-3 py-3 font-mono text-xs text-muted-foreground" data-testid={`text-emp-number-${emp.id}`}>
                      <div>#{emp.employeeNumber}</div>
                      {!emp.attendanceEnabled && (
                        <span className="text-[9px] text-orange-500 font-medium">{t("حضور معطّل", "Attendance off")}</span>
                      )}
                    </td>
                    <td data-label={t("الاسم", "Name")} className="px-3 py-3">
                      <div className="font-medium text-sm leading-tight">{userName}</div>
                      {emp.userId && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          @{users.find((u: any) => u.id === emp.userId)?.username || "—"}
                        </div>
                      )}
                    </td>
                    <td data-label={t("المسمى", "Position")} className="px-3 py-3 font-medium">{emp.position}</td>
                    <td data-label={t("القسم", "Department")} className="px-3 py-3 text-muted-foreground">{t(dept.ar, dept.en)}</td>
                    <td data-label={t("مدة الخدمة", "Service")} className="px-3 py-3 text-sm text-muted-foreground">{serviceDuration}</td>
                    <td data-label={t("الراتب", "Salary")} className="px-3 py-3 font-semibold tabular-nums text-end" data-testid={`text-salary-${emp.id}`}>
                      {salary.toLocaleString()}
                    </td>
                    <td data-label={t("الحالة", "Status")} className="px-3 py-3">
                      <Badge className={`${status.cls} text-[10px]`} data-testid={`badge-status-${emp.id}`}>
                        {t(status.ar, status.en)}
                      </Badge>
                    </td>
                    <td data-label={t("إجراءات", "Actions")} className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {(currentUser?.role === "owner" || currentUser?.role === "assistant" || currentUser?.role === "hr") && (
                          <Button size="icon" variant="ghost" className="h-11 w-11" aria-label={t("عرض ملف الموظف", "View employee file")} asChild
                            data-testid={`button-view-employee-${emp.id}`}>
                            <Link href={`/employees/${emp.id}`}>
                              <Eye className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-11 w-11" aria-label={assignmentFocus ? `تعيين موقع وجدول الدوام للموظف ${emp.employeeNumber}` : t("تعديل الموظف", "Edit employee")}
                          onClick={() => setSelectedEmployee(emp)} data-testid={`button-edit-employee-${emp.id}`}>
                          {assignmentFocus ? <MapPin className="w-4 h-4" /> : <Pencil className="w-3.5 h-3.5" />}
                        </Button>
                        {(currentUser?.role === "owner" || currentUser?.role === "hr" || currentUser?.role === "it" || currentUser?.role === "assistant") && (
                          <Button size="icon" variant="ghost"
                            className="h-11 w-11 text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label={t("حذف سجل غير مستخدم", "Delete unused record")}
                            onClick={() => { setDeleteConfirmation(""); setDeleteEmpConfirm(emp); }}
                            data-testid={`button-delete-employee-${emp.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="md:hidden space-y-2 p-2" data-testid="employee-mobile-cards">
          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("لا يوجد موظفون مطابقون", "No employees found")}
            </div>
          ) : filtered.map(emp => {
            const dept = departments.find(x => x.code === emp.department)?.nameAr || departmentLabels[emp.department]?.ar || emp.department || t("غير محدد", "Unassigned");
            const status = statusConfig[emp.status] || statusConfig.active;
            const salary = parseFloat(emp.monthlySalary?.toString() || "0");
            return (
              <article key={emp.id} className="rounded-md border bg-background p-3" data-testid={`card-employee-${emp.id}`}>
                <header className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{getEmployeeName(emp)}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground" dir="ltr">#{emp.employeeNumber}</p>
                  </div>
                  <Badge className={`${status.cls} shrink-0 text-[10px]`}>{t(status.ar, status.en)}</Badge>
                </header>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div className="col-span-2"><dt className="text-[11px] text-muted-foreground">المسمى الوظيفي</dt><dd className="font-medium">{emp.position}</dd></div>
                  <div><dt className="text-[11px] text-muted-foreground">القسم</dt><dd>{dept}</dd></div>
                  <div><dt className="text-[11px] text-muted-foreground">مدة الخدمة</dt><dd>{computeServiceDuration(emp.contractStart, t)}</dd></div>
                  <div><dt className="text-[11px] text-muted-foreground">الراتب الشهري</dt><dd className="font-semibold tabular-nums">{salary.toLocaleString()} ر.س</dd></div>
                  <div><dt className="text-[11px] text-muted-foreground">الحضور</dt><dd>{emp.attendanceEnabled === false ? "غير مفعّل" : "مفعّل"}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(currentUser?.role === "owner" || currentUser?.role === "assistant" || currentUser?.role === "hr") && (
                    <Button size="sm" variant="outline" className="min-h-11 flex-1" asChild data-testid={`mobile-button-view-employee-${emp.id}`}>
                      <Link href={`/employees/${emp.id}`}><Eye className="me-1 h-4 w-4" />الملف</Link>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="min-h-11 flex-1" aria-label={assignmentFocus ? `تعيين موقع وجدول الدوام للموظف ${emp.employeeNumber}` : `تعديل الموظف ${emp.employeeNumber}`} onClick={() => setSelectedEmployee(emp)} data-testid={`mobile-button-edit-employee-${emp.id}`}>
                    {assignmentFocus ? <MapPin className="me-1 h-4 w-4" /> : <Pencil className="me-1 h-4 w-4" />}
                    {assignmentFocus ? "موقع وجدول الدوام" : "تعديل"}
                  </Button>
                  {(currentUser?.role === "owner" || currentUser?.role === "hr" || currentUser?.role === "it" || currentUser?.role === "assistant") && (
                    <Button size="icon" variant="ghost" className="h-11 w-11 text-destructive" aria-label={`حذف سجل الموظف ${emp.employeeNumber}`} onClick={() => { setDeleteConfirmation(""); setDeleteEmpConfirm(emp); }} data-testid={`mobile-button-delete-employee-${emp.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t text-xs text-muted-foreground text-end">
            {t(`${filtered.length} موظف`, `${filtered.length} employees`)}
          </div>
        )}
      </Card>

      <Dialog open={!!selectedEmployee} onOpenChange={open => { if (!open) setSelectedEmployee(null); }}>
        <DialogContent className={employeeDialogExpanded ? "w-[98vw] max-w-[98vw] h-[96dvh] overflow-y-auto" : "w-[96vw] max-w-2xl max-h-[94dvh] overflow-y-auto"}>
          <DialogHeader>
            <DialogTitle>{t("ملف الموظف", "Employee Profile")} — #{selectedEmployee?.employeeNumber}</DialogTitle>
          </DialogHeader>
          <Button variant="outline" size="sm" onClick={() => setEmployeeDialogExpanded(v => !v)}>{employeeDialogExpanded ? t("تصغير مساحة العمل", "Compact workspace") : t("توسيع البيانات والمستندات والعهد", "Expand information, documents & assets")}</Button>
          {selectedEmployee && (
            <EmployeeDetailDialog key={selectedEmployee.id} emp={selectedEmployee} users={users} onClose={() => setSelectedEmployee(null)} initialTab={assignmentFocus ? "attendance" : undefined} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={jobTitlesOpen} onOpenChange={setJobTitlesOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("إدارة المسميات الوظيفية", "Manage Job Titles")}</DialogTitle></DialogHeader>
          <JobTitlesManager />
        </DialogContent>
      </Dialog>

      {/* Delete Employee Confirmation Dialog */}
      <Dialog open={!!deleteEmpConfirm} onOpenChange={(open) => { setDeleteConfirmation(""); if (!open) setDeleteEmpConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {t("تأكيد حذف سجل الموظف", "Confirm Employee Record Deletion")}
            </DialogTitle>
          </DialogHeader>
          {deleteEmpConfirm && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                {t(
                  `الحذف نهائي ومتاح فقط للسجل غير المستخدم قبل بدء العمل دون أي تاريخ مرتبط. للموظف الفعلي استخدم التعطيل أو إجراء الإنهاء. اكتب رقم الموظف ${deleteEmpConfirm.employeeNumber} للتأكيد.`,
                  `Permanent deletion is only allowed for unused pre-employment records without history. Deactivate or terminate real employees instead. Type ${deleteEmpConfirm.employeeNumber} to confirm.`
                )}
              </p>
              <Input aria-label={t("تأكيد رقم الموظف", "Confirm employee number")} value={deleteConfirmation} onChange={e => setDeleteConfirmation(e.target.value)} autoComplete="off" />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDeleteEmpConfirm(null)} data-testid="button-cancel-delete-emp">
                  {t("إلغاء", "Cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteEmpMutation.mutate(deleteEmpConfirm.id)}
                  disabled={deleteEmpMutation.isPending || deleteConfirmation !== deleteEmpConfirm.employeeNumber}
                  data-testid="button-confirm-delete-emp"
                >
                  {deleteEmpMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("حذف نهائي", "Delete")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>

  );
}

function PrehireSection() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const queryKey = ["/api/hr-actions", "prehire"];
  const { data: actions = [], isLoading } = useQuery<HrAction[]>({
    queryKey,
    queryFn: async () => {
      const r = await fetch("/api/hr-actions?prehire=true", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });
  const pending = actions.filter(a => !["completed", "rejected", "cancelled"].includes(a.status));

  return (
    <>
      <Button variant="outline" className="min-h-11" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-controls="prehire-dialog" data-testid="button-open-prehire">
        <UserCog className="me-2 h-4 w-4" />{t("التوظيف الجديد", "New hiring")}
        {pending.length > 0 && <Badge variant="secondary" className="ms-2 text-[10px]">{pending.length}</Badge>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent id="prehire-dialog" className="max-w-xl max-h-[88dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("التوظيف الجديد", "New hiring")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">أنشئ طلب توظيف أو ترشيح موظف، وتابع الاعتمادات من هنا.</p>
          <div className="flex flex-wrap gap-2">
            <NewHrActionDialog workflow="wf02" employeeId={null} queryKey={queryKey} triggerLabel="طلب توظيف" />
            <NewHrActionDialog workflow="wf03" employeeId={null} queryKey={queryKey} triggerLabel="ترشيح موظف" />
          </div>
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : actions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("لا توجد طلبات توظيف", "No hiring requests")}</p>
          ) : (
            <div className="space-y-2">
              {actions.map(a => <HrActionCard key={a.id} action={a} queryKey={queryKey} />)}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
