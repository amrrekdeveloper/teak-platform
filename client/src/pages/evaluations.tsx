import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PerformanceEvaluation, Employee } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Star, Plus } from "lucide-react";

const CRITERIA: { key: string; ar: string; en: string }[] = [
  { key: "scoreQuality", ar: "جودة العمل", en: "Quality" },
  { key: "scoreProductivity", ar: "الإنتاجية", en: "Productivity" },
  { key: "scoreAttendance", ar: "الالتزام والحضور", en: "Attendance" },
  { key: "scoreTeamwork", ar: "العمل الجماعي", en: "Teamwork" },
  { key: "scoreDiscipline", ar: "الانضباط", en: "Discipline" },
];

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function EvaluationsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    employeeId: "", period: currentPeriod(),
    scoreQuality: 3, scoreProductivity: 3, scoreAttendance: 3, scoreTeamwork: 3, scoreDiscipline: 3,
    strengths: "", improvements: "", status: "draft",
  });

  const { data: evals = [], isLoading } = useQuery<PerformanceEvaluation[]>({ queryKey: ["/api/evaluations"] });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const empName = (id: number) => {
    const e = employees.find(x => x.id === id);
    return e?.fullNameAr || e?.fullNameEn || `#${id}`;
  };

  const liveOverall = ((Number(form.scoreQuality) + Number(form.scoreProductivity) + Number(form.scoreAttendance) + Number(form.scoreTeamwork) + Number(form.scoreDiscipline)) / 5).toFixed(2);

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/evaluations", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evaluations"] });
      setOpen(false);
      setForm({ employeeId: "", period: currentPeriod(), scoreQuality: 3, scoreProductivity: 3, scoreAttendance: 3, scoreTeamwork: 3, scoreDiscipline: 3, strengths: "", improvements: "", status: "draft" });
      toast({ title: t("تم حفظ التقييم", "Evaluation saved") });
    },
    onError: () => toast({ title: t("حدث خطأ في الحفظ", "Error saving evaluation"), variant: "destructive" }),
  });

  const scoreColor = (n: number) => n >= 4 ? "text-green-600 dark:text-green-400" : n >= 3 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-evaluations-title">
            <Star className="w-6 h-6" />{t("تقييم الأداء", "Performance Evaluations")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("تقييمات دورية لأداء الموظفين", "Periodic employee performance reviews")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-evaluation"><Plus className="w-4 h-4 me-1" />{t("تقييم جديد", "New Evaluation")}</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("تقييم أداء", "Performance Evaluation")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("الموظف", "Employee")}</Label>
                  <Select value={form.employeeId} onValueChange={v => setForm((f: any) => ({ ...f, employeeId: v }))}>
                    <SelectTrigger data-testid="select-eval-employee"><SelectValue placeholder={t("اختر الموظف", "Select employee")} /></SelectTrigger>
                    <SelectContent>
                      {employees.filter(e => e.status === "active").map(e => (<SelectItem key={e.id} value={String(e.id)}>{empName(e.id)}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("الفترة", "Period")}</Label>
                  <Input type="month" value={form.period} onChange={e => setForm((f: any) => ({ ...f, period: e.target.value }))} data-testid="input-eval-period" />
                </div>
              </div>
              {CRITERIA.map(c => (
                <div key={c.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>{t(c.ar, c.en)}</Label>
                    <span className={`font-bold ${scoreColor(Number(form[c.key]))}`}>{form[c.key]}/5</span>
                  </div>
                  <input type="range" min="1" max="5" step="1" value={form[c.key]} onChange={e => setForm((f: any) => ({ ...f, [c.key]: Number(e.target.value) }))} className="w-full accent-primary" data-testid={`input-${c.key}`} />
                </div>
              ))}
              <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
                <span className="font-medium">{t("التقييم الإجمالي", "Overall Score")}</span>
                <span className={`text-xl font-bold ${scoreColor(Number(liveOverall))}`} data-testid="text-live-overall">{liveOverall}/5</span>
              </div>
              <div className="space-y-1">
                <Label>{t("نقاط القوة", "Strengths")}</Label>
                <Textarea value={form.strengths} onChange={e => setForm((f: any) => ({ ...f, strengths: e.target.value }))} data-testid="input-strengths" />
              </div>
              <div className="space-y-1">
                <Label>{t("مجالات التحسين", "Areas for Improvement")}</Label>
                <Textarea value={form.improvements} onChange={e => setForm((f: any) => ({ ...f, improvements: e.target.value }))} data-testid="input-improvements" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.employeeId || !form.period} data-testid="button-submit-evaluation">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("حفظ", "Save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : evals.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground" data-testid="text-empty">{t("لا توجد تقييمات", "No evaluations")}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-3 text-start font-medium">{t("الموظف", "Employee")}</th>
                  <th className="p-3 text-start font-medium">{t("الفترة", "Period")}</th>
                  <th className="p-3 text-start font-medium">{t("الإجمالي", "Overall")}</th>
                  <th className="p-3 text-start font-medium">{t("نقاط القوة", "Strengths")}</th>
                  <th className="p-3 text-start font-medium">{t("مجالات التحسين", "Improvements")}</th>
                </tr>
              </thead>
              <tbody>
                {evals.map(ev => (
                  <tr key={ev.id} className="border-b last:border-0" data-testid={`row-evaluation-${ev.id}`}>
                    <td className="p-3 font-medium">{empName(ev.employeeId)}</td>
                    <td className="p-3" dir="ltr">{ev.period}</td>
                    <td className="p-3"><span className={`font-bold ${scoreColor(Number(ev.overallScore))}`} data-testid={`text-overall-${ev.id}`}>{Number(ev.overallScore).toFixed(2)}/5</span></td>
                    <td className="p-3 max-w-[200px] truncate text-muted-foreground">{ev.strengths || "—"}</td>
                    <td className="p-3 max-w-[200px] truncate text-muted-foreground">{ev.improvements || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
