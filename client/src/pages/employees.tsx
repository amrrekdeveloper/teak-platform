import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Employee } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Plus, Search, UserCog, Pencil, DollarSign,
  Users, UserCheck, ChevronUp, ChevronDown, ChevronsUpDown
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

function FormFields({ data, onChange, users }: {
  data: EmployeeForm;
  onChange: (d: EmployeeForm) => void;
  users: any[];
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
        <Input value={data.position} onChange={e => onChange({ ...data, position: e.target.value })}
          placeholder={t("مثال: مندوب مبيعات", "e.g. Sales Rep")} data-testid="input-position" />
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

export default function EmployeesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState<EmployeeForm>(emptyForm);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [sortKey, setSortKey] = useState<SortKey>("employeeNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: employees = [], isLoading } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });

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

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/employees/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setEditEmployee(null);
      toast({ title: t("تم تحديث بيانات الموظف", "Employee updated") });
    },
    onError: () => toast({ title: t("حدث خطأ في التحديث", "Error updating"), variant: "destructive" }),
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees
      .filter(e => filter === "all" || e.status === filter)
      .filter(e =>
        !q ||
        e.employeeNumber?.toLowerCase().includes(q) ||
        e.position?.toLowerCase().includes(q) ||
        (e.iqamaNumber && e.iqamaNumber.includes(q)) ||
        getUserName(e.userId).toLowerCase().includes(q)
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
    };
    if (form.userId && form.userId !== "none") data.userId = parseInt(form.userId);
    if (form.iqamaNumber) data.iqamaNumber = form.iqamaNumber;
    if (form.iqamaExpiry) data.iqamaExpiry = form.iqamaExpiry;
    if (form.contractEnd) data.contractEnd = form.contractEnd;
    createMutation.mutate(data);
  };

  const handleUpdate = () => {
    if (!editEmployee) return;
    const data: any = {
      position: editForm.position.trim(),
      department: editForm.department,
      monthlySalary: editForm.monthlySalary,
      nationality: editForm.nationality,
      status: editForm.status,
      contractStart: editForm.contractStart,
    };
    if (editForm.userId && editForm.userId !== "none") data.userId = parseInt(editForm.userId);
    else data.userId = null;
    if (editForm.iqamaNumber) data.iqamaNumber = editForm.iqamaNumber;
    if (editForm.iqamaExpiry) data.iqamaExpiry = editForm.iqamaExpiry;
    if (editForm.contractEnd) data.contractEnd = editForm.contractEnd;
    updateMutation.mutate({ id: editEmployee.id, data });
  };

  const openEdit = (emp: Employee) => {
    setEditEmployee(emp);
    setEditForm({
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
    });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const thCls = "px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors";

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-employees-title">{t("الموظفون", "Employees")}</h1>
          <p className="text-muted-foreground text-sm">{t("إدارة شؤون الموظفين", "Human Resources Management")}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); if (!open) setForm(emptyForm); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-employee">
              <Plus className="w-4 h-4 me-2" />{t("إضافة موظف", "Add Employee")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("إضافة موظف جديد", "Add New Employee")}</DialogTitle></DialogHeader>
            <FormFields data={form} onChange={setForm} users={users} />
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
          <Input className="ps-10" placeholder={t("بحث بالاسم أو الرقم أو المسمى...", "Search by name, number or title...")}
            value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-employees" />
        </div>
        <div className="flex gap-2">
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
                <th className={thCls} onClick={() => handleSort("nationality")}>
                  {t("الجنسية", "Nationality")}<SortIcon col="nationality" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thCls} onClick={() => handleSort("monthlySalary")}>
                  {t("الراتب ر.س", "Salary SAR")}<SortIcon col="monthlySalary" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thCls} onClick={() => handleSort("contractStart")}>
                  {t("بداية العقد", "Start Date")}<SortIcon col="contractStart" sortKey={sortKey} sortDir={sortDir} />
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
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
                    {t("لا يوجد موظفون مطابقون", "No employees found")}
                  </td>
                </tr>
              ) : filtered.map(emp => {
                const dept = departmentLabels[emp.department] || { ar: emp.department, en: emp.department };
                const status = statusConfig[emp.status] || statusConfig.active;
                const nat = nationalityLabels[emp.nationality] || { ar: emp.nationality, en: emp.nationality };
                const salary = parseFloat(emp.monthlySalary?.toString() || "0");
                const userName = getUserName(emp.userId);
                const isExpiringSoon = emp.iqamaExpiry && (() => {
                  const d = new Date(emp.iqamaExpiry);
                  const diff = (d.getTime() - Date.now()) / (1000 * 3600 * 24);
                  return diff < 90;
                })();

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
                    </td>
                    <td className="px-3 py-3 font-medium">{emp.position}</td>
                    <td className="px-3 py-3 text-muted-foreground">{t(dept.ar, dept.en)}</td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className="text-[10px]">{t(nat.ar, nat.en)}</Badge>
                      {emp.nationality === "resident" && emp.iqamaExpiry && (
                        <div className={`text-[10px] mt-0.5 ${isExpiringSoon ? "text-orange-500 font-semibold" : "text-muted-foreground"}`}>
                          {t("إقامة", "Iqama")}: {emp.iqamaExpiry}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 font-semibold tabular-nums text-end" data-testid={`text-salary-${emp.id}`}>
                      {salary.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap" dir="ltr">{emp.contractStart || "—"}</td>
                    <td className="px-3 py-3">
                      <Badge className={`${status.cls} text-[10px]`} data-testid={`badge-status-${emp.id}`}>
                        {t(status.ar, status.en)}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => openEdit(emp)} data-testid={`button-edit-employee-${emp.id}`}>
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

      <Dialog open={!!editEmployee} onOpenChange={open => { if (!open) setEditEmployee(null); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("تعديل بيانات الموظف", "Edit Employee")} — #{editEmployee?.employeeNumber}
            </DialogTitle>
          </DialogHeader>
          {editEmployee && (
            <>
              <FormFields data={editForm} onChange={setEditForm} users={users} />
              <Button
                className="w-full mt-3"
                onClick={handleUpdate}
                disabled={!isFormValid(editForm) || updateMutation.isPending}
                data-testid="button-save-employee"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                {t("حفظ التعديلات", "Save Changes")}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
