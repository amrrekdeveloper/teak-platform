import { useState } from "react";
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
  Loader2, Plus, Search, UserCog, Pencil, Phone, Mail,
  Calendar, Building2, DollarSign, Users, UserCheck, UserX
} from "lucide-react";

const departmentLabels: Record<string, { ar: string; en: string }> = {
  sales: { ar: "المبيعات", en: "Sales" },
  design: { ar: "التصميم", en: "Design" },
  production: { ar: "الإنتاج", en: "Production" },
  warehouse: { ar: "المستودع", en: "Warehouse" },
  finance: { ar: "المالية", en: "Finance" },
  hr: { ar: "الموارد البشرية", en: "HR" },
  it: { ar: "تقنية المعلومات", en: "IT" },
  delivery: { ar: "التوصيل", en: "Delivery" },
  installation: { ar: "التركيب", en: "Installation" },
  quality: { ar: "الجودة", en: "Quality" },
  management: { ar: "الإدارة", en: "Management" },
  customer_service: { ar: "خدمة العملاء", en: "Customer Service" },
};

const statusLabels: Record<string, { ar: string; en: string; color: string }> = {
  active: { ar: "نشط", en: "Active", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  inactive: { ar: "غير نشط", en: "Inactive", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  terminated: { ar: "منتهي", en: "Terminated", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

const nationalityLabels: Record<string, { ar: string; en: string }> = {
  saudi: { ar: "سعودي", en: "Saudi" },
  resident: { ar: "مقيم", en: "Resident" },
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
  employeeNumber: "", nationality: "saudi", position: "", department: "production",
  monthlySalary: "", iqamaNumber: "", iqamaExpiry: "", contractStart: "", contractEnd: "",
  status: "active", userId: "",
};

export default function EmployeesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/employees", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setCreateOpen(false);
      setForm(emptyForm);
      toast({ title: t("تمت إضافة الموظف بنجاح", "Employee added successfully") });
    },
    onError: () => {
      toast({ title: t("حدث خطأ في إضافة الموظف", "Error adding employee"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/employees/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setEditEmployee(null);
      toast({ title: t("تم تحديث بيانات الموظف", "Employee updated") });
    },
  });

  const filtered = employees
    .filter(e => filter === "all" || e.status === filter)
    .filter(e =>
      e.employeeNumber.includes(search) || e.position.includes(search) ||
      (e.iqamaNumber && e.iqamaNumber.includes(search))
    );

  const saudiCount = employees.filter(e => e.nationality === "saudi" && e.status === "active").length;
  const residentCount = employees.filter(e => e.nationality === "resident" && e.status === "active").length;
  const totalSalary = employees.filter(e => e.status === "active").reduce((sum, e) => sum + parseFloat(e.monthlySalary?.toString() || "0"), 0);

  const getUserName = (userId: number | null) => {
    if (!userId) return "";
    const u = users.find((u: any) => u.id === userId);
    return u ? t(u.fullNameAr, u.fullNameEn) : "";
  };

  const handleCreate = () => {
    const data: any = {
      employeeNumber: form.employeeNumber,
      nationality: form.nationality,
      position: form.position,
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

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const FormFields = ({ data, onChange }: { data: EmployeeForm; onChange: (d: EmployeeForm) => void }) => (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label>{t("رقم الموظف", "Employee #")} *</Label>
        <Input value={data.employeeNumber} onChange={e => onChange({ ...data, employeeNumber: e.target.value })} data-testid="input-emp-number" />
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
        <Label>{t("المسمى الوظيفي", "Position")} *</Label>
        <Input value={data.position} onChange={e => onChange({ ...data, position: e.target.value })} data-testid="input-position" />
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
        <Label>{t("الراتب الشهري", "Monthly Salary")} *</Label>
        <Input type="number" value={data.monthlySalary} onChange={e => onChange({ ...data, monthlySalary: e.target.value })} data-testid="input-salary" />
      </div>
      <div className="space-y-1">
        <Label>{t("حساب المستخدم", "User Account")}</Label>
        <Select value={data.userId} onValueChange={v => onChange({ ...data, userId: v })}>
          <SelectTrigger data-testid="select-user"><SelectValue placeholder={t("بدون حساب", "No account")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("بدون حساب", "No account")}</SelectItem>
            {users.map((u: any) => (
              <SelectItem key={u.id} value={u.id.toString()}>{t(u.fullNameAr, u.fullNameEn)} ({u.username})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {data.nationality === "resident" && (
        <>
          <div className="space-y-1">
            <Label>{t("رقم الإقامة", "Iqama Number")}</Label>
            <Input value={data.iqamaNumber} onChange={e => onChange({ ...data, iqamaNumber: e.target.value })} data-testid="input-iqama" />
          </div>
          <div className="space-y-1">
            <Label>{t("تاريخ انتهاء الإقامة", "Iqama Expiry")}</Label>
            <Input type="date" value={data.iqamaExpiry} onChange={e => onChange({ ...data, iqamaExpiry: e.target.value })} data-testid="input-iqama-expiry" />
          </div>
        </>
      )}
      <div className="space-y-1">
        <Label>{t("بداية العقد", "Contract Start")} *</Label>
        <Input type="date" value={data.contractStart} onChange={e => onChange({ ...data, contractStart: e.target.value })} data-testid="input-contract-start" />
      </div>
      <div className="space-y-1">
        <Label>{t("نهاية العقد", "Contract End")}</Label>
        <Input type="date" value={data.contractEnd} onChange={e => onChange({ ...data, contractEnd: e.target.value })} data-testid="input-contract-end" />
      </div>
      <div className="space-y-1">
        <Label>{t("الحالة", "Status")}</Label>
        <Select value={data.status} onValueChange={v => onChange({ ...data, status: v })}>
          <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(statusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{t(v.ar, v.en)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-employees-title">{t("الموظفين", "Employees")}</h1>
          <p className="text-muted-foreground text-sm">{t("إدارة شؤون الموظفين", "Human Resources Management")}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-employee"><Plus className="w-4 h-4 me-2" />{t("إضافة موظف", "Add Employee")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("إضافة موظف جديد", "Add New Employee")}</DialogTitle></DialogHeader>
            <FormFields data={form} onChange={setForm} />
            <Button
              className="w-full mt-2"
              onClick={handleCreate}
              disabled={!form.employeeNumber || !form.position || !form.monthlySalary || !form.contractStart || createMutation.isPending}
              data-testid="button-create-employee"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إضافة", "Add")}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-employees">{employees.filter(e => e.status === "active").length}</p>
              <p className="text-xs text-muted-foreground">{t("موظف نشط", "Active Employees")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <UserCheck className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-green-600" data-testid="text-saudi-count">{saudiCount}</p>
              <p className="text-xs text-muted-foreground">{t("سعودي", "Saudi")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <UserCog className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold text-blue-600" data-testid="text-resident-count">{residentCount}</p>
              <p className="text-xs text-muted-foreground">{t("مقيم", "Resident")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-primary" />
            <div>
              <p className="text-lg font-bold" data-testid="text-total-salary">{totalSalary.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{t("إجمالي الرواتب", "Total Salaries")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="ps-10" placeholder={t("بحث برقم الموظف أو المسمى...", "Search by number or position...")} value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-employees" />
        </div>
        <div className="flex gap-2 overflow-x-auto flex-nowrap pb-1">
          {[
            { key: "all", ar: "الكل", en: "All" },
            { key: "active", ar: "نشط", en: "Active" },
            { key: "inactive", ar: "غير نشط", en: "Inactive" },
            { key: "terminated", ar: "منتهي", en: "Terminated" },
          ].map(tab => (
            <Button key={tab.key} size="sm" className="shrink-0 whitespace-nowrap" variant={filter === tab.key ? "default" : "outline"} onClick={() => setFilter(tab.key)} data-testid={`button-filter-${tab.key}`}>
              {t(tab.ar, tab.en)}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("لا يوجد موظفون", "No employees found")}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(emp => {
            const dept = departmentLabels[emp.department] || { ar: emp.department, en: emp.department };
            const status = statusLabels[emp.status] || statusLabels.active;
            const nat = nationalityLabels[emp.nationality] || { ar: emp.nationality, en: emp.nationality };
            const salary = parseFloat(emp.monthlySalary?.toString() || "0");

            return (
              <Card key={emp.id} className="hover:shadow-md transition-shadow" data-testid={`card-employee-${emp.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{emp.position}</h3>
                        <Badge className={status.color} data-testid={`badge-status-${emp.id}`}>{t(status.ar, status.en)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">#{emp.employeeNumber}</p>
                      {emp.userId && <p className="text-xs text-primary mt-0.5">{getUserName(emp.userId)}</p>}
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditEmployee(emp)} data-testid={`button-edit-employee-${emp.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{t(dept.ar, dept.en)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <UserCog className="w-3.5 h-3.5 text-muted-foreground" />
                      <Badge variant="outline" className="text-[10px]">{t(nat.ar, nat.en)}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-semibold">{salary.toLocaleString()} {t("ر.س", "SAR")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs">{t("بداية العقد", "Start")}: {emp.contractStart}</span>
                    </div>
                    {emp.nationality === "resident" && emp.iqamaExpiry && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-orange-500" />
                        <span className="text-xs text-orange-600">{t("انتهاء الإقامة", "Iqama Expiry")}: {emp.iqamaExpiry}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editEmployee} onOpenChange={(open) => { if (!open) setEditEmployee(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("تعديل بيانات الموظف", "Edit Employee")}</DialogTitle></DialogHeader>
          {editEmployee && (
            <>
              <FormFields
                data={{
                  employeeNumber: editEmployee.employeeNumber,
                  nationality: editEmployee.nationality,
                  position: editEmployee.position,
                  department: editEmployee.department,
                  monthlySalary: editEmployee.monthlySalary?.toString() || "",
                  iqamaNumber: editEmployee.iqamaNumber || "",
                  iqamaExpiry: editEmployee.iqamaExpiry || "",
                  contractStart: editEmployee.contractStart,
                  contractEnd: editEmployee.contractEnd || "",
                  status: editEmployee.status,
                  userId: editEmployee.userId?.toString() || "",
                }}
                onChange={(d) => setEditEmployee({ ...editEmployee, ...d, userId: d.userId ? parseInt(d.userId) : null, monthlySalary: d.monthlySalary } as any)}
              />
              <Button
                className="w-full mt-2"
                onClick={() => updateMutation.mutate({
                  id: editEmployee.id,
                  data: {
                    position: editEmployee.position,
                    department: editEmployee.department,
                    monthlySalary: editEmployee.monthlySalary?.toString(),
                    nationality: editEmployee.nationality,
                    status: editEmployee.status,
                    iqamaNumber: editEmployee.iqamaNumber,
                    iqamaExpiry: editEmployee.iqamaExpiry,
                    contractEnd: editEmployee.contractEnd,
                  }
                })}
                disabled={updateMutation.isPending}
                data-testid="button-save-employee"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("حفظ التعديلات", "Save Changes")}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
