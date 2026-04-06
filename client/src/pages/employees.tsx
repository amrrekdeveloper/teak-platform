import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Employee } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Plus, Search, UserCog, Pencil, DollarSign,
  Users, UserCheck, ChevronUp, ChevronDown, ChevronsUpDown,
  FileText, Upload, Trash2, AlertTriangle, Download, Lock, UserX, UserCheck2, ClipboardList, X
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
  nationality: string;
  position: string;
  department: string;
  monthlySalary: string;
  iqamaNumber: string;
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
}

const emptyForm: EmployeeForm = {
  employeeNumber: "",
  nationality: "saudi",
  position: "",
  department: "production",
  monthlySalary: "",
  iqamaNumber: "",
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
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            {Object.entries(departmentLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{t(v.ar, v.en)}</SelectItem>
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
        <Label>{t("رقم الجوال", "Phone")}</Label>
        <Input value={data.phone} onChange={e => onChange({ ...data, phone: e.target.value })}
          placeholder="+966 5x xxx xxxx" data-testid="input-phone" dir="ltr" className="text-start" />
      </div>
      <div className="space-y-1">
        <Label>{t("البريد الإلكتروني", "Email")}</Label>
        <Input type="email" value={data.email} onChange={e => onChange({ ...data, email: e.target.value })}
          placeholder="employee@example.com" data-testid="input-email" dir="ltr" className="text-start" />
      </div>
      <div className="space-y-1">
        <Label>{t("موقع البصمة", "Fingerprint Location")}</Label>
        <Input value={data.fingerScanLocation} onChange={e => onChange({ ...data, fingerScanLocation: e.target.value })}
          placeholder={t("مثال: المقر الرئيسي", "e.g. Main Office")} data-testid="input-finger-scan" />
      </div>
      <div className="space-y-1">
        <Label>{t("حساب المستخدم", "User Account")}</Label>
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

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: "asc" | "desc" }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 text-muted-foreground/50 inline ms-1" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 text-primary inline ms-1" />
    : <ChevronDown className="w-3 h-3 text-primary inline ms-1" />;
}

function exportEmployeePDF(emp: Employee, users: any[], t: (ar: string, en: string) => string) {
  const user = users.find((u: any) => u.id === emp.userId);
  const nameAr = user?.fullNameAr || "—";
  const nameEn = user?.fullNameEn || "—";
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

function DocumentsSection({ emp }: { emp: Employee }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [docName, setDocName] = useState("");

  const docs = (emp.documents as any[] || []);

  const handleUpload = async (file: File) => {
    if (!file) return;
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
      if (!res.ok) throw new Error("Upload failed");
      await queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setDocName("");
      toast({ title: t("تم رفع المستند بنجاح", "Document uploaded successfully") });
    } catch {
      toast({ title: t("حدث خطأ في رفع المستند", "Error uploading document"), variant: "destructive" });
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
      <div className="flex items-center gap-2">
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
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t("لا توجد مستندات مرفوعة", "No documents uploaded")}</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border overflow-hidden">
          {docs.map((doc: any) => (
            <div key={doc.id} className="flex items-center justify-between px-4 py-3" data-testid={`row-doc-${doc.id}`}>
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(doc.uploadedAt).toLocaleDateString("ar-SA")}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" asChild data-testid={`button-view-doc-${doc.id}`}>
                  <a href={doc.url} target="_blank" rel="noopener noreferrer">
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600"
                  onClick={() => deleteMutation.mutate(doc.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-doc-${doc.id}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
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

function EmployeeDetailDialog({ emp, users, onClose }: { emp: Employee; users: any[]; onClose: () => void }) {
  const { t } = useLanguage();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [editForm, setEditForm] = useState<EmployeeForm>({
    employeeNumber: emp.employeeNumber,
    nationality: emp.nationality,
    position: emp.position,
    department: emp.department,
    monthlySalary: emp.monthlySalary?.toString() || "",
    iqamaNumber: emp.iqamaNumber || "",
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
  });

  const { data: jobTitlesList = [] } = useQuery<any[]>({ queryKey: ["/api/job-titles"] });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/employees/${emp.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: t("تم تحديث بيانات الموظف", "Employee updated") });
    },
    onError: () => toast({ title: t("حدث خطأ في التحديث", "Error updating"), variant: "destructive" }),
  });

  const isFormValid = editForm.employeeNumber.trim() && editForm.position.trim() && editForm.monthlySalary && editForm.contractStart.length === 10;

  const handleUpdate = () => {
    const data: any = {
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
      email: editForm.email || null,
    };
    if (editForm.userId && editForm.userId !== "none") data.userId = parseInt(editForm.userId);
    else data.userId = null;
    if (editForm.iqamaNumber) data.iqamaNumber = editForm.iqamaNumber;
    if (editForm.iqamaExpiry) data.iqamaExpiry = editForm.iqamaExpiry;
    if (editForm.contractEnd) data.contractEnd = editForm.contractEnd;
    updateMutation.mutate(data);
  };

  const serviceDuration = computeServiceDuration(emp.contractStart, t);
  const linkedUser = users.find((u: any) => u.id === emp.userId);
  const canManageAccess = currentUser?.role === "owner" || currentUser?.role === "hr" || currentUser?.role === "it";

  return (
    <Tabs defaultValue="info" className="w-full">
      <TabsList className="w-full mb-4" data-testid="tabs-employee-detail">
        <TabsTrigger value="info" className="flex-1" data-testid="tab-info">{t("البيانات", "Info")}</TabsTrigger>
        <TabsTrigger value="documents" className="flex-1" data-testid="tab-docs">{t("المستندات", "Documents")}</TabsTrigger>
        {canManageAccess && emp.userId && (
          <TabsTrigger value="access" className="flex-1" data-testid="tab-access">{t("الصلاحيات", "Access")}</TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="info" className="space-y-4">
        <div className="bg-muted/30 rounded-lg p-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t("مدة الخدمة", "Service Duration")}</p>
            <p className="text-lg font-bold text-primary" data-testid="text-service-duration">{serviceDuration}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportEmployeePDF(emp, users, t)}
            data-testid="button-export-pdf"
          >
            <Download className="w-4 h-4 me-1" />
            {t("تصدير PDF", "Export PDF")}
          </Button>
        </div>
        <FormFields data={editForm} onChange={setEditForm} users={users} jobTitlesList={jobTitlesList} />
        <Button
          className="w-full"
          onClick={handleUpdate}
          disabled={!isFormValid || updateMutation.isPending}
          data-testid="button-save-employee"
        >
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
          {t("حفظ التعديلات", "Save Changes")}
        </Button>
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
  );
}

function JobTitlesManager() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [newAr, setNewAr] = useState("");
  const [newEn, setNewEn] = useState("");
  const [newDept, setNewDept] = useState("");

  const { data: jobTitlesList = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/job-titles"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/job-titles", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-titles"] });
      setNewAr(""); setNewEn(""); setNewDept("");
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
        <Input
          placeholder={t("المسمى الوظيفي (عربي) *", "Arabic title *")}
          value={newAr}
          onChange={e => setNewAr(e.target.value)}
          data-testid="input-job-title-ar"
        />
        <Input
          placeholder={t("المسمى الوظيفي (إنجليزي)", "English title")}
          value={newEn}
          onChange={e => setNewEn(e.target.value)}
          data-testid="input-job-title-en"
          dir="ltr"
          className="text-start"
        />
        <Button onClick={() => createMutation.mutate({ nameAr: newAr.trim(), nameEn: newEn.trim() || newAr.trim(), department: newDept || null })}
          disabled={!newAr.trim() || createMutation.isPending}
          data-testid="button-add-job-title">
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
                onClick={() => deleteMutation.mutate(jt.id)}
                disabled={deleteMutation.isPending}
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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [sortKey, setSortKey] = useState<SortKey>("employeeNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [jobTitlesOpen, setJobTitlesOpen] = useState(false);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const { data: jobTitlesList = [] } = useQuery<any[]>({ queryKey: ["/api/job-titles"] });

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
        toast({ title: r?.message || t("حدث خطأ في إضافة الموظف", "Error adding employee"), variant: "destructive" });
      } catch {
        toast({ title: t("حدث خطأ في إضافة الموظف", "Error adding employee"), variant: "destructive" });
      }
    },
  });

  const getUserName = (userId: number | null) => {
    if (!userId) return "—";
    const u = users.find((u: any) => u.id === userId);
    return u ? t(u.fullNameAr, u.fullNameEn) : "—";
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  // Insurance expiry alerts: within 30 days
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
      .filter(e =>
        !q ||
        e.employeeNumber?.toLowerCase().includes(q) ||
        e.position?.toLowerCase().includes(q) ||
        (e.iqamaNumber && e.iqamaNumber.includes(q)) ||
        getUserName(e.userId).toLowerCase().includes(q) ||
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
  }, [employees, filter, search, sortKey, sortDir, users]);

  const activeEmps = employees.filter(e => e.status === "active");
  const saudiCount = activeEmps.filter(e => e.nationality === "saudi").length;
  const residentCount = activeEmps.filter(e => e.nationality === "resident").length;
  const totalSalary = activeEmps.reduce((s, e) => s + parseFloat(e.monthlySalary?.toString() || "0"), 0);

  const isFormValid = (f: EmployeeForm) =>
    f.employeeNumber.trim() && f.position.trim() && f.monthlySalary && f.contractStart.length === 10;

  const handleCreate = () => {
    const data: any = {
      employeeNumber: form.employeeNumber.trim(),
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
      email: form.email || null,
    };
    if (form.userId && form.userId !== "none") data.userId = parseInt(form.userId);
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
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 flex items-start gap-3"
          data-testid="alert-insurance-expiry">
          <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">
              {t("تنبيه: انتهاء التأمين الصحي قريباً", "Alert: Health Insurance Expiring Soon")}
            </p>
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
              {insuranceAlerts.map(e => `#${e.employeeNumber}`).join("، ")}
              {" — "}
              {t("تنتهي خلال 30 يوم أو أقل", "expiring within 30 days")}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-employees-title">{t("الموارد البشرية", "Human Resources")}</h1>
          <p className="text-muted-foreground text-sm">{t("إدارة شؤون الموظفين والصلاحيات", "Employee & Access Management")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setJobTitlesOpen(true)} data-testid="button-manage-job-titles">
            <ClipboardList className="w-4 h-4 me-1" />
            {t("المسميات الوظيفية", "Job Titles")}
          </Button>
          <Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); if (!open) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-employee">
                <Plus className="w-4 h-4 me-2" />{t("إضافة موظف", "Add Employee")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("إضافة موظف جديد", "Add New Employee")}</DialogTitle></DialogHeader>
              <FormFields data={form} onChange={setForm} users={users} jobTitlesList={jobTitlesList} />
              <Button
                className="w-full mt-3"
                onClick={handleCreate}
                disabled={!isFormValid(form) || createMutation.isPending}
                data-testid="button-create-employee"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Plus className="w-4 h-4 me-2" />}
                {t("إضافة الموظف", "Add Employee")}
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <Users className="w-7 h-7 text-primary" />, val: activeEmps.length, label: t("موظف نشط", "Active Employees"), tid: "text-total-employees" },
          { icon: <UserCheck className="w-7 h-7 text-green-600" />, val: saudiCount, label: t("سعودي", "Saudi"), tid: "text-saudi-count", cls: "text-green-600" },
          { icon: <UserCog className="w-7 h-7 text-blue-600" />, val: residentCount, label: t("مقيم", "Resident"), tid: "text-resident-count", cls: "text-blue-600" },
          { icon: <DollarSign className="w-7 h-7 text-primary" />, val: totalSalary.toLocaleString(), label: t("إجمالي الرواتب ر.س", "Total Salaries SAR"), tid: "text-total-salary" },
        ].map((card, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-3">
              {card.icon}
              <div>
                <p className={`text-xl font-bold ${card.cls || ""}`} data-testid={card.tid}>{card.val}</p>
                <p className="text-xs text-muted-foreground leading-tight">{card.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="ps-10" placeholder={t("بحث بالاسم أو الرقم أو المسمى أو الجوال...", "Search by name, number, title, phone...")}
            value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-employees" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "all", ar: "الكل", en: "All" },
            { key: "active", ar: "نشط", en: "Active" },
            { key: "inactive", ar: "غير نشط", en: "Inactive" },
            { key: "terminated", ar: "منتهي", en: "Terminated" },
          ].map(tab => (
            <Button key={tab.key} size="sm" variant={filter === tab.key ? "default" : "outline"}
              onClick={() => setFilter(tab.key)} data-testid={`button-filter-${tab.key}`}>
              {t(tab.ar, tab.en)}
            </Button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-employees">
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
                const dept = departmentLabels[emp.department] || { ar: emp.department, en: emp.department };
                const status = statusConfig[emp.status] || statusConfig.active;
                const salary = parseFloat(emp.monthlySalary?.toString() || "0");
                const userName = getUserName(emp.userId);
                const serviceDuration = computeServiceDuration(emp.contractStart, t);
                const insuranceExp = (emp as any).insuranceExpiry;
                const insuranceDaysLeft = insuranceExp
                  ? Math.ceil((new Date(insuranceExp).getTime() - Date.now()) / (1000 * 3600 * 24))
                  : null;
                const insuranceAlert = insuranceDaysLeft !== null && insuranceDaysLeft >= 0 && insuranceDaysLeft <= 30;

                return (
                  <tr key={emp.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-employee-${emp.id}`}>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground" data-testid={`text-emp-number-${emp.id}`}>
                      #{emp.employeeNumber}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-sm leading-tight">{userName}</div>
                      {emp.userId && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          @{users.find((u: any) => u.id === emp.userId)?.username || "—"}
                        </div>
                      )}
                      {(emp as any).phone && (
                        <div className="text-xs text-muted-foreground mt-0.5" dir="ltr">{(emp as any).phone}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 font-medium">{emp.position}</td>
                    <td className="px-3 py-3 text-muted-foreground">{t(dept.ar, dept.en)}</td>
                    <td className="px-3 py-3 text-sm" data-testid={`text-service-${emp.id}`}>
                      <span className="font-medium">{serviceDuration}</span>
                      {insuranceAlert && (
                        <div className="text-[10px] text-orange-500 font-semibold flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="w-3 h-3" />
                          {t(`تأمين: ${insuranceDaysLeft}ي`, `Ins: ${insuranceDaysLeft}d`)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 font-semibold tabular-nums text-end" data-testid={`text-salary-${emp.id}`}>
                      {salary.toLocaleString()}
                    </td>
                    <td className="px-3 py-3">
                      <Badge className={`${status.cls} text-[10px]`} data-testid={`badge-status-${emp.id}`}>
                        {t(status.ar, status.en)}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => setSelectedEmployee(emp)} data-testid={`button-edit-employee-${emp.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t text-xs text-muted-foreground text-end">
            {t(`${filtered.length} موظف`, `${filtered.length} employees`)}
          </div>
        )}
      </Card>

      <Dialog open={!!selectedEmployee} onOpenChange={open => { if (!open) setSelectedEmployee(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("ملف الموظف", "Employee File")} — #{selectedEmployee?.employeeNumber}
            </DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <EmployeeDetailDialog
              emp={selectedEmployee}
              users={users}
              onClose={() => setSelectedEmployee(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={jobTitlesOpen} onOpenChange={setJobTitlesOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("إدارة المسميات الوظيفية", "Manage Job Titles")}</DialogTitle>
          </DialogHeader>
          <JobTitlesManager />
        </DialogContent>
      </Dialog>
    </div>
  );
}
