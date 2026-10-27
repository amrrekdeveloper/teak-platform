import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Check, CircleUserRound, LockKeyhole, Phone, Search, ShieldCheck, UserRoundCog } from "lucide-react";

type AccessEmployee = {
  id: number; employeeNumber: string; fullNameAr: string | null; fullNameEn: string | null; phone: string | null;
  status: string; attendanceEnabled: boolean; username: string | null; accountActive: boolean | null; managerName: string | null;
  phoneValid: boolean; duplicatePhone: boolean;
};
type AccessData = { employees: AccessEmployee[]; hrAccounts: { id: number; username: string; fullNameAr: string | null; fullNameEn: string | null; active: boolean }[]; modules: { key: string; ar: string; en: string }[] };

export default function HrAccessManagementPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [toggleTarget, setToggleTarget] = useState<AccessEmployee | null>(null);
  const [toggleReason, setToggleReason] = useState("");
  const { data, isLoading, isError, refetch } = useQuery<AccessData>({ queryKey: ["/api/hr/access"] });
  const mutation = useMutation({
    mutationFn: ({ employee, attendanceEnabled, reason }: { employee: AccessEmployee; attendanceEnabled: boolean; reason: string }) => apiRequest("PATCH", `/api/hr/access/employees/${employee.id}`, {
      attendanceEnabled,
      expectedAttendanceEnabled: employee.attendanceEnabled,
      reason,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/access"] });
      setToggleTarget(null);
      setToggleReason("");
      toast({ title: t("تم تحديث صلاحية الحضور", "Attendance access updated") });
    },
    onError: (error: Error) => toast({ title: error.message || t("تعذر تحديث الصلاحية", "Could not update access"), variant: "destructive" }),
  });
  const employees = useMemo(() => (data?.employees || []).filter(employee => {
    const value = `${employee.employeeNumber} ${employee.fullNameAr || ""} ${employee.fullNameEn || ""} ${employee.phone || ""} ${employee.username || ""} ${employee.managerName || ""}`.toLocaleLowerCase();
    return value.includes(search.toLocaleLowerCase());
  }), [data?.employees, search]);
  const employeeLabel = (employee: AccessEmployee) => employee.fullNameAr || employee.fullNameEn || `#${employee.id}`;
  const employeeStatus = (status: string) => status === "active" ? t("نشط", "Active") : status === "inactive" ? t("غير نشط", "Inactive") : status === "terminated" ? t("منتهية خدمته", "Terminated") : status;
  const requestToggle = (employee: AccessEmployee) => {
    if (!employee.attendanceEnabled && (!employee.phoneValid || employee.duplicatePhone)) return;
    setToggleTarget(employee);
    setToggleReason("");
  };
  const submitToggle = () => {
    if (!toggleTarget || toggleReason.trim().length < 3) return;
    mutation.mutate({ employee: toggleTarget, attendanceEnabled: !toggleTarget.attendanceEnabled, reason: toggleReason.trim() });
  };
  const accountStatus = (employee: AccessEmployee) => {
    if (!employee.phone) return <Badge variant="outline">{t("هاتف مفقود", "Phone missing")}</Badge>;
    if (employee.duplicatePhone) return <Badge variant="outline" className="border-amber-600 text-amber-800">{t("هاتف مكرر", "Duplicate phone")}</Badge>;
    if (!employee.phoneValid) return <Badge variant="outline" className="border-amber-600 text-amber-800">{t("هاتف غير صالح", "Invalid phone")}</Badge>;
    if (employee.accountActive === true) return <Badge variant="outline" className="gap-1"><Check className="h-3 w-3" />{t("الحساب نشط", "Account active")}</Badge>;
    if (employee.accountActive === false) return <Badge variant="outline">{t("الحساب غير نشط", "Account inactive")}</Badge>;
    return <Badge variant="outline">{t("لا يوجد حساب", "No account")}</Badge>;
  };
  return <div className="space-y-5">
    <header><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />{t("إدارة الوصول", "Access management")}</div>
      <h1 className="text-2xl font-bold">{t("الحسابات والصلاحيات", "Accounts & access")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("إدارة أهلية الحضور ومراجعة معلومات الحسابات. لا تمنح هذه الصفحة الموظفين صلاحيات إدارية.", "Manage attendance eligibility and review account information. This page never grants employees administrative access.")}</p>
    </header>
    <div className="relative"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t("ابحث بالاسم أو الرقم أو الهاتف", "Search name, number or phone")} /></div>
    {isLoading ? <div className="space-y-3" aria-label={t("جارٍ التحميل", "Loading")}><div className="h-24 animate-pulse rounded-xl bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /></div>
      : isError ? <div className="rounded-xl border border-destructive/30 p-5" role="alert"><p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{t("تعذر تحميل معلومات الوصول.", "Could not load access information.")}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => refetch()}>{t("إعادة المحاولة", "Retry")}</Button></div>
      : <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-semibold">{t("الموظفون", "Employees")}</h2><span className="text-xs text-muted-foreground">{employees.length} {t("موظف", "employees")}</span></div>
        {employees.length ? <><div className="space-y-3 md:hidden">{employees.map(employee => <article key={employee.id} className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><Link href={`/employees/${employee.id}`} className="font-semibold underline-offset-4 hover:underline">{employeeLabel(employee)}</Link><p className="mt-1 text-xs text-muted-foreground">{employee.employeeNumber} · {employeeStatus(employee.status)}</p></div>{accountStatus(employee)}</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{employee.phone || t("غير مسجل", "Not listed")}</p><p>{t("المدير", "Manager")}: {employee.managerName || "—"}</p>
            <p>{t("اسم مستخدم", "Admin username")}: {employee.username || "—"}</p><p>{t("حالة الحساب", "Account")}: {employee.accountActive == null ? "—" : employee.accountActive ? t("نشط", "Active") : t("غير نشط", "Inactive")}</p></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3"><div><p className="text-sm font-medium">{t("السماح بالحضور", "Attendance access")}</p><p className="text-xs text-muted-foreground">{employee.attendanceEnabled ? t("مفعّل", "Enabled") : t("متوقف", "Disabled")}</p></div><Button size="sm" variant={employee.attendanceEnabled ? "outline" : "default"} disabled={mutation.isPending || (!employee.attendanceEnabled && (!employee.phoneValid || employee.duplicatePhone))} onClick={() => requestToggle(employee)}>{employee.attendanceEnabled ? t("إيقاف", "Disable") : t("تفعيل", "Enable")}</Button></div>
        </article>)}</div>
        <div className="hidden overflow-x-auto rounded-xl border md:block"><table className="w-full min-w-[850px] text-sm"><thead className="bg-muted/50"><tr>{[t("الموظف", "Employee"), t("الحالة", "Status"), t("الهاتف", "Phone"), t("معلومات الحساب", "Account info"), t("المدير", "Manager"), t("الحضور", "Attendance")].map(label => <th key={label} className="p-3 text-start">{label}</th>)}</tr></thead>
          <tbody>{employees.map(employee => <tr key={employee.id} className="border-t"><td className="p-3"><Link href={`/employees/${employee.id}`} className="font-medium underline-offset-4 hover:underline">{employeeLabel(employee)}</Link><p className="text-xs text-muted-foreground">{employee.employeeNumber}</p></td><td className="p-3">{employeeStatus(employee.status)}</td><td className="p-3">{employee.phone || "—"}<div className="mt-1">{accountStatus(employee)}</div></td><td className="p-3"><div>{employee.username || t("لا يوجد اسم مستخدم", "No admin username")}</div><div className="text-xs text-muted-foreground">{employee.accountActive == null ? t("حساب غير مرتبط", "No linked account") : employee.accountActive ? t("نشط", "Active") : t("غير نشط", "Inactive")}</div></td><td className="p-3">{employee.managerName || "—"}</td><td className="p-3"><div className="flex items-center gap-2"><span>{employee.attendanceEnabled ? t("مفعّل", "Enabled") : t("متوقف", "Disabled")}</span><Button size="sm" variant={employee.attendanceEnabled ? "outline" : "default"} disabled={mutation.isPending || (!employee.attendanceEnabled && (!employee.phoneValid || employee.duplicatePhone))} onClick={() => requestToggle(employee)}>{employee.attendanceEnabled ? t("إيقاف", "Disable") : t("تفعيل", "Enable")}</Button></div></td></tr>)}</tbody></table></div></>
          : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("لا يوجد موظفون مطابقون.", "No matching employees.")}</div>}
      </section>}
    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CircleUserRound className="h-4 w-4" />{t("حسابات الموارد البشرية", "HR accounts")}</CardTitle><p className="text-sm text-muted-foreground">{t("معلومات للقراءة فقط؛ إنشاء الحساب وإعادة تعيينه من لوحة مالك النظام.", "Read-only information. Account creation and resets are owner-managed.")}</p></CardHeader><CardContent className="space-y-2">
        {(data?.hrAccounts || []).length ? data?.hrAccounts.map(account => <div key={account.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="font-medium">{account.fullNameAr || account.fullNameEn || account.username}</p><p className="text-xs text-muted-foreground" dir="ltr">{account.username}</p></div><Badge variant="outline">{account.active ? t("نشط", "Active") : t("غير نشط", "Inactive")}</Badge></div>)
          : <p className="text-sm text-muted-foreground">{t("لا توجد معلومات حسابات.", "No account information.")}</p>}
        <p className="flex items-start gap-2 pt-2 text-xs text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />{t("هاتف الموظف هو معرف بوابة الموظف؛ اسم المستخدم الإداري لا يستخدم لتسجيل الدخول إلى البوابة.", "Employee mobile is used for the employee portal; the admin username is not used for portal sign-in.")}</p>
      </CardContent></Card>
      <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><UserRoundCog className="h-4 w-4" />{t("وحدات الموارد البشرية", "HR modules")}</CardTitle><p className="text-sm text-muted-foreground">{t("الوحدات متاحة لأدوار الموارد البشرية؛ لا تُدار صلاحيات إدارية للموظفين هنا.", "Modules remain available to HR roles; employee administrative access is not managed here.")}</p></CardHeader><CardContent><div className="flex flex-wrap gap-2">{(data?.modules || []).map(module => <Badge key={module.key} variant="secondary">{t(module.ar, module.en)}</Badge>)}</div></CardContent></Card>
    </div>
    <Dialog open={!!toggleTarget} onOpenChange={open => { if (!open && !mutation.isPending) { setToggleTarget(null); setToggleReason(""); } }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>{toggleTarget?.attendanceEnabled ? t("إيقاف صلاحية الحضور", "Disable attendance access") : t("تفعيل صلاحية الحضور", "Enable attendance access")}</DialogTitle>
          <DialogDescription>{t("هذا يغيّر أهلية الحضور فقط، ولا يوقف بوابة الموظف أو طلبات الإجازة، ولا يغيّر كلمات المرور أو الحسابات.", "This changes attendance eligibility only. It does not disable employee self-service or leave requests, and does not change passwords or accounts.")}</DialogDescription>
        </DialogHeader>
        {toggleTarget && <div className="space-y-2">
          <p className="text-sm font-medium">{employeeLabel(toggleTarget)} · {toggleTarget.employeeNumber}</p>
          <Label htmlFor="attendance-toggle-reason">{t("سبب التغيير (٣ أحرف على الأقل)", "Reason (at least 3 characters)")}</Label>
          <Textarea id="attendance-toggle-reason" autoFocus value={toggleReason} onChange={event => setToggleReason(event.target.value)} maxLength={500} />
          {toggleReason.trim().length > 0 && toggleReason.trim().length < 3 && <p className="text-xs text-destructive">{t("أدخل سبباً من ٣ أحرف على الأقل.", "Enter a reason with at least 3 characters.")}</p>}
        </div>}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => { setToggleTarget(null); setToggleReason(""); }}>{t("رجوع", "Back")}</Button>
          <Button type="button" disabled={mutation.isPending || toggleReason.trim().length < 3} onClick={submitToggle}>{mutation.isPending ? t("جارٍ الحفظ…", "Saving…") : toggleTarget?.attendanceEnabled ? t("تأكيد الإيقاف", "Confirm disable") : t("تأكيد التفعيل", "Confirm enable")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
