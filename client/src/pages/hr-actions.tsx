import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Employee, HrAction } from "@shared/schema";
import { HR_WORKFLOWS } from "@shared/hr-workflows";
import { useLanguage } from "@/components/language-provider";
import { HrActionCard, HrDueTerminations, NewHrActionDialog } from "@/components/hr-action-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, BriefcaseBusiness, ChevronDown, ClipboardList, Search } from "lucide-react";

type WorkflowGroup = "contracts" | "return" | "penalties" | "recruitment";
const WORKFLOW_GROUPS: { key: WorkflowGroup; ar: string; en: string; workflows: string[] }[] = [
  { key: "contracts", ar: "العقود والإجراءات", en: "Contracts & cases", workflows: ["wf05", "wf06", "wf06b", "wf07", "wf08"] },
  { key: "return", ar: "العودة ومخالصة الإجازة", en: "Leave return & settlement", workflows: ["wf04", "wf09"] },
  { key: "penalties", ar: "الجزاءات", en: "Penalties", workflows: ["wf10"] },
  { key: "recruitment", ar: "التوظيف", en: "Recruitment", workflows: ["wf02", "wf03"] },
];

export default function HrActionsPage() {
  const { t } = useLanguage();
  const [group, setGroup] = useState<WorkflowGroup>(() => new URLSearchParams(window.location.search).get("group")==="return" ? "return" : "contracts");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [employeeId, setEmployeeId] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const groupConfig = WORKFLOW_GROUPS.find(item => item.key === group) || WORKFLOW_GROUPS[0];
  const groupWorkflows = groupConfig.workflows.filter(workflow => !!HR_WORKFLOWS[workflow]);
  const [newWorkflow, setNewWorkflow] = useState(groupWorkflows[0] || "");
  const queryKey = ["/api/hr-actions", employeeId];
  const { data: actions = [], isLoading, isError, refetch } = useQuery<HrAction[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeId !== "all") params.set("employeeId", employeeId);
      const response = await fetch(`/api/hr-actions${params.size ? `?${params}` : ""}`, { credentials: "include" });
      if (!response.ok) {
        let message = `${response.status} ${response.statusText}`;
        try { const body = await response.json(); message = body.message || body.error || message; } catch { /* Use response status. */ }
        throw new Error(message);
      }
      return response.json();
    },
  });
  const { data: employees = [], isError: employeesError } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const filteredEmployees = useMemo(() => employees.filter(employee => {
    const key = `${employee.fullNameAr || ""} ${employee.fullNameEn || ""} ${employee.employeeNumber || ""}`.toLocaleLowerCase();
    return key.includes(employeeSearch.toLocaleLowerCase());
  }), [employees, employeeSearch]);
  const employeeName = (id: number | null | undefined) => {
    if (id == null) return "";
    const employee = employees.find(item => item.id === id);
    return employee ? t(employee.fullNameAr || employee.fullNameEn || `#${id}`, employee.fullNameEn || employee.fullNameAr || `#${id}`) : `#${id}`;
  };
  const switchGroup = (next: WorkflowGroup) => {
    setGroup(next);
    const firstWorkflow = WORKFLOW_GROUPS.find(item => item.key === next)?.workflows.find(workflow => !!HR_WORKFLOWS[workflow]) || "";
    setNewWorkflow(firstWorkflow);
    setWorkflowFilter("all");
  };
  const selectedDef = HR_WORKFLOWS[newWorkflow];
  const selectedEmployee = employeeId === "all" ? null : Number(employeeId);
  const needsEmployee = newWorkflow !== "wf02";
  const actionRows = useMemo(() => actions.filter(action =>
    groupWorkflows.includes(action.workflow) && (workflowFilter === "all" || action.workflow === workflowFilter),
  ), [actions, groupWorkflows, workflowFilter]);
  const createAction = selectedDef && (!needsEmployee || selectedEmployee != null)
    ? <NewHrActionDialog workflow={newWorkflow} employeeId={selectedEmployee} queryKey={queryKey} triggerLabel={t("إنشاء إجراء", "New action")} />
    : null;

  return <div className="space-y-5">
    <header>
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><BriefcaseBusiness className="h-4 w-4" />{t("مسارات الموارد البشرية", "HR workflows")}</div>
      <h1 className="text-2xl font-bold">{t("الإجراءات", "Actions")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("تابع المعاملات القائمة وافتح نموذجاً واحداً عند الحاجة. تبقى خطوات المدير والموظف والإدارة كما هي.", "Track existing cases and open one workflow form at a time. Manager, employee and owner steps remain unchanged.")}</p>
    </header>

    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {WORKFLOW_GROUPS.map(item => <button key={item.key} type="button" onClick={() => switchGroup(item.key)} aria-pressed={group === item.key}
        className={`min-h-12 rounded-xl border px-3 py-2 text-start text-sm font-semibold transition-colors ${group === item.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted/60"}`}>
        {t(item.ar, item.en)}
      </button>)}
    </div>

    <Card>
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4" />{t(groupConfig.ar, groupConfig.en)}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("تصفية المعاملات، ثم إنشاء مسار محدد فقط.", "Filter cases, then open one specific workflow.")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <Label>{t("الموظف", "Employee")}</Label>
            <Input type="search" value={employeeSearch} onChange={event => setEmployeeSearch(event.target.value)} placeholder={t("ابحث بالاسم أو الرقم", "Search name or number")} />
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("كل الموظفين", "All employees")}</SelectItem>
                {filteredEmployees.map(employee => <SelectItem key={employee.id} value={String(employee.id)}>{t(employee.fullNameAr || employee.fullNameEn || `#${employee.id}`, employee.fullNameEn || employee.fullNameAr || `#${employee.id}`)} · {employee.employeeNumber}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("نوع الإجراء", "Workflow")}</Label>
            <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("كل المسارات في القسم", "All workflows in group")}</SelectItem>
                {groupWorkflows.map(key => <SelectItem key={key} value={key}>{t(HR_WORKFLOWS[key].nameAr, HR_WORKFLOWS[key].nameEn)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("بدء مسار", "Start workflow")}</Label>
            <Select value={newWorkflow} onValueChange={setNewWorkflow}>
              <SelectTrigger><SelectValue placeholder={t("اختر مساراً", "Choose a workflow")} /></SelectTrigger>
              <SelectContent>{groupWorkflows.map(key => <SelectItem key={key} value={key}>{t(HR_WORKFLOWS[key].nameAr, HR_WORKFLOWS[key].nameEn)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            {createAction || <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{t("اختر موظفاً لبدء هذا المسار.", "Select an employee to start this workflow.")}</p>}
          </div>
        </div>
        {employeesError && <p role="alert" className="text-sm text-destructive">{t("تعذر تحميل قائمة الموظفين.", "Could not load employees.")}</p>}
        {selectedDef && <p className="text-xs text-muted-foreground">{t(selectedDef.nameAr, selectedDef.nameEn)} · {selectedDef.fields.length} {t("حقول في النموذج", "form fields")}</p>}
      </CardContent>
    </Card>

    {group === "contracts" && <details className="rounded-xl border bg-card p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><ChevronDown className="h-4 w-4" />{t("استحقاقات إنهاء مجدولة", "Scheduled termination reviews")}<Badge variant="secondary">{t("عرض", "View")}</Badge></summary>
      <div className="mt-4"><HrDueTerminations /></div>
    </details>}

    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t("المعاملات", "Cases")}</h2>
        <Badge variant="outline">{actionRows.length}</Badge>
      </div>
      {isLoading ? <div className="space-y-3" aria-label={t("جارٍ التحميل", "Loading")}><div className="h-24 animate-pulse rounded-xl bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /></div>
        : isError ? <div role="alert" className="rounded-xl border border-destructive/30 p-5"><p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{t("تعذر تحميل الإجراءات.", "Could not load actions.")}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => refetch()}>{t("إعادة المحاولة", "Retry")}</Button></div>
        : actionRows.length ? <div className="space-y-3">{actionRows.map(action => <HrActionCard key={action.id} action={action} employeeName={employeeName(action.employeeId)} queryKey={queryKey} />)}</div>
        : <div className="rounded-xl border border-dashed p-8 text-center"><Search className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 font-medium">{t("لا توجد معاملات مطابقة", "No matching cases")}</p><p className="mt-1 text-sm text-muted-foreground">{t("غيّر القسم أو مرشح الموظف أو المسار.", "Change the category, employee or workflow filter.")}</p></div>}
    </section>
  </div>;
}
