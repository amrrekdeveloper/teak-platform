import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { HrAction } from "@shared/schema";
import { HR_WORKFLOWS, HR_STATUS_LABELS, type HrWorkflowDef } from "@shared/hr-workflows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Plus, CheckCircle2, XCircle, Clock, FileDown, ChevronDown, ChevronUp, Ban, PenLine,
} from "lucide-react";

const statusCls: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

function fmtDT(iso: string, locale: string) {
  try { return new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; }
}

function fieldLabel(def: HrWorkflowDef, key: string, t: (a: string, e: string) => string): string {
  const f = def.fields.find(f => f.key === key);
  return f ? t(f.labelAr, f.labelEn) : key;
}

function fieldValue(def: HrWorkflowDef, key: string, val: any, t: (a: string, e: string) => string): string {
  const f = def.fields.find(f => f.key === key);
  if (f?.type === "select" && f.options) {
    const opt = f.options.find(o => o.value === val);
    if (opt) return t(opt.labelAr, opt.labelEn);
  }
  return String(val ?? "—");
}

async function exportActionPdf(action: HrAction, def: HrWorkflowDef, employeeName: string) {
  const jsPDFModule = await import("jspdf");
  const jsPDF = (jsPDFModule as any).default || (jsPDFModule as any).jsPDF;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 20;
  doc.setFontSize(16);
  doc.text(`Teak Manufacturing — ${def.nameEn}`, 105, y, { align: "center" });
  y += 10;
  doc.setFontSize(10);
  doc.text(`Action #${action.id} — Status: Completed`, 105, y, { align: "center" });
  y += 12;
  doc.setFontSize(11);
  if (employeeName) { doc.text(`Employee: ${employeeName}`, 15, y); y += 8; }
  const fd: any = action.formData || {};
  for (const f of def.fields) {
    if (fd[f.key] == null || fd[f.key] === "") continue;
    doc.text(`${f.labelEn}: ${String(fd[f.key])}`, 15, y);
    y += 7;
  }
  y += 5;
  doc.setFontSize(12);
  doc.text("Timeline:", 15, y); y += 7;
  doc.setFontSize(9);
  for (const e of ((action.timeline as any[]) || [])) {
    doc.text(`${new Date(e.at).toLocaleString("en-GB")} — ${e.step} — by ${e.byName}${e.note ? ` (${e.note})` : ""}`, 15, y);
    y += 6;
    if (y > 280) { doc.addPage(); y = 20; }
  }
  doc.save(`${def.code}-${action.id}.pdf`);
}

export function HrActionCard({ action, employeeName, queryKey }: { action: HrAction; employeeName?: string; queryKey: any[] }) {
  const { t, isRTL } = useLanguage();
  const locale = isRTL ? "ar-SA" : "en-US";
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");
  const [fillFd, setFillFd] = useState<Record<string, string>>({});
  const def = HR_WORKFLOWS[action.workflow];

  const stepMut = useMutation({
    mutationFn: (body: { decision: string; note?: string; formData?: Record<string, string> }) => apiRequest("POST", `/api/hr-actions/${action.id}/step`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/hr-actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setRejectOpen(false); setNote("");
      toast({ title: t("تم تنفيذ الخطوة", "Step processed") });
    },
    onError: (e: any) => toast({ title: e?.message || t("حدث خطأ", "Error"), variant: "destructive" }),
  });

  if (!def) return null;
  const st = HR_STATUS_LABELS[action.status] || { ar: action.status, en: action.status };
  const active = !["completed", "rejected", "cancelled"].includes(action.status);
  const curStep = def.steps[action.currentStep];
  const fd: any = action.formData || {};
  const timeline = (action.timeline as any[]) || [];
  const isLastStep = action.currentStep >= def.steps.length - 1;
  const missingRequired = def.fields.filter(f => f.required && !String(fd[f.key] ?? "").trim());
  const missingStillEmpty = missingRequired.some(f => !String(fillFd[f.key] ?? "").trim());

  return (
    <Card data-testid={`card-hr-action-${action.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm">{t(def.nameAr, def.nameEn)}</span>
          <Badge className={`${statusCls[action.status] || ""} text-[10px]`} data-testid={`badge-hr-status-${action.id}`}>{t(st.ar, st.en)}</Badge>
          <span className="text-xs text-muted-foreground ms-auto">#{action.id} · {fmtDT(action.createdAt as any, locale)}</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpanded(v => !v)} data-testid={`button-expand-${action.id}`}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        {/* Steps progress */}
        <div className="flex flex-wrap items-center gap-1.5">
          {def.steps.map((s, i) => {
            const done = action.status === "completed" || i < action.currentStep;
            const isCur = active && i === action.currentStep;
            return (
              <div key={s.key} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border
                ${done ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800 text-green-700 dark:text-green-300"
                  : isCur ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                  : "bg-muted/40 border-border text-muted-foreground"}`}>
                {done ? <CheckCircle2 className="w-3 h-3" /> : isCur ? <Clock className="w-3 h-3" /> : null}
                {t(s.labelAr, s.labelEn)}
              </div>
            );
          })}
        </div>

        {expanded && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {Object.entries(fd).filter(([, v]) => v !== "" && v != null).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-dashed border-border/60 py-1">
                  <span className="text-muted-foreground text-xs">{fieldLabel(def, k, t)}</span>
                  <span className="font-medium text-xs">{fieldValue(def, k, v, t)}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t("السجل الزمني", "Timeline")}</p>
              <div className="space-y-1">
                {timeline.map((e, i) => (
                  <div key={i} className="text-xs flex flex-wrap gap-x-2 text-muted-foreground" data-testid={`timeline-${action.id}-${i}`}>
                    <span className="tabular-nums">{fmtDT(e.at, locale)}</span>
                    <span className="font-medium text-foreground">{e.action}</span>
                    <span>— {e.byName}</span>
                    {e.note ? <span className="italic">({e.note})</span> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {active && curStep && missingRequired.length > 0 && (
          <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              {t("حقول إلزامية يجب تعبئتها قبل الإكمال النهائي", "Required fields to fill before final completion")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {missingRequired.map(f => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">{t(f.labelAr, f.labelEn)} *</Label>
                  {f.type === "select" ? (
                    <Select value={fillFd[f.key] || ""} onValueChange={v => setFillFd(s => ({ ...s, [f.key]: v }))}>
                      <SelectTrigger className="h-8" data-testid={`fill-${action.id}-${f.key}`}><SelectValue placeholder={t("اختر...", "Select...")} /></SelectTrigger>
                      <SelectContent>
                        {(f.options || []).map(o => (
                          <SelectItem key={o.value} value={o.value}>{t(o.labelAr, o.labelEn)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input className="h-8" type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      value={fillFd[f.key] || ""} onChange={e => setFillFd(s => ({ ...s, [f.key]: e.target.value }))}
                      data-testid={`fill-${action.id}-${f.key}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {active && curStep && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
            <span className="text-xs text-muted-foreground">
              {t("الخطوة الحالية:", "Current step:")} <b>{t(curStep.labelAr, curStep.labelEn)}</b>
            </span>
            <div className="flex gap-1.5 ms-auto">
              <Button size="sm" className="h-7"
                onClick={() => stepMut.mutate({ decision: "complete", ...(Object.keys(fillFd).length ? { formData: fillFd } : {}) })}
                disabled={stepMut.isPending || (isLastStep && missingRequired.length > 0 && missingStillEmpty)}
                data-testid={`button-complete-step-${action.id}`}>
                {stepMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : curStep.kind === "acknowledge" ? <PenLine className="w-3.5 h-3.5 me-1" /> : <CheckCircle2 className="w-3.5 h-3.5 me-1" />}
                {curStep.kind === "acknowledge" ? t("إقرار/توقيع", "Sign") : curStep.kind === "approve" ? t("اعتماد", "Approve") : t("تنفيذ", "Execute")}
              </Button>
              <Button size="sm" variant="destructive" className="h-7" onClick={() => setRejectOpen(true)} disabled={stepMut.isPending} data-testid={`button-reject-step-${action.id}`}>
                <XCircle className="w-3.5 h-3.5 me-1" />{t("رفض", "Reject")}
              </Button>
              <Button size="sm" variant="outline" className="h-7" onClick={() => stepMut.mutate({ decision: "cancel" })} disabled={stepMut.isPending} data-testid={`button-cancel-action-${action.id}`}>
                <Ban className="w-3.5 h-3.5 me-1" />{t("إلغاء", "Cancel")}
              </Button>
            </div>
          </div>
        )}

        {action.status === "completed" && (
          <div className="flex justify-end pt-1 border-t">
            <Button size="sm" variant="outline" className="h-7" onClick={() => exportActionPdf(action, def, employeeName || "")} data-testid={`button-pdf-${action.id}`}>
              <FileDown className="w-3.5 h-3.5 me-1" />{t("تصدير PDF", "Export PDF")}
            </Button>
          </div>
        )}

        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t("سبب الرفض", "Rejection reason")}</DialogTitle></DialogHeader>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder={t("اكتب السبب...", "Write the reason...")} data-testid="input-reject-note" />
            <DialogFooter>
              <Button variant="destructive" disabled={!note.trim() || stepMut.isPending} onClick={() => stepMut.mutate({ decision: "reject", note: note.trim() })} data-testid="button-confirm-reject">
                {stepMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("تأكيد الرفض", "Confirm rejection")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export function NewHrActionDialog({ workflow, employeeId, queryKey, triggerLabel }: {
  workflow: string; employeeId: number | null; queryKey: any[]; triggerLabel?: string;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const def = HR_WORKFLOWS[workflow];

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hr-actions", { workflow, employeeId, formData: form }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/hr-actions"] });
      setOpen(false); setForm({});
      toast({ title: t("تم إنشاء الإجراء", "Action created") });
    },
    onError: (e: any) => toast({ title: e?.message || t("حدث خطأ", "Error"), variant: "destructive" }),
  });

  if (!def) return null;
  const missingRequired = def.fields.some(f => f.required && !String(form[f.key] || "").trim());

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid={`button-new-${workflow}`}>
        <Plus className="w-3.5 h-3.5 me-1" />{triggerLabel || t(def.nameAr, def.nameEn)}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t(def.nameAr, def.nameEn)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {def.fields.map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">{t(f.labelAr, f.labelEn)}{f.required ? " *" : ""}</Label>
                {f.type === "textarea" ? (
                  <Textarea value={form[f.key] || ""} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))} data-testid={`input-${workflow}-${f.key}`} />
                ) : f.type === "select" ? (
                  <Select value={form[f.key] || ""} onValueChange={v => setForm(s => ({ ...s, [f.key]: v }))}>
                    <SelectTrigger data-testid={`select-${workflow}-${f.key}`}><SelectValue placeholder={t("اختر...", "Select...")} /></SelectTrigger>
                    <SelectContent>
                      {(f.options || []).map(o => (
                        <SelectItem key={o.value} value={o.value}>{t(o.labelAr, o.labelEn)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                    value={form[f.key] || ""} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
                    data-testid={`input-${workflow}-${f.key}`} />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => createMut.mutate()} disabled={missingRequired || createMut.isPending} data-testid={`button-submit-${workflow}`}>
              {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إنشاء", "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function HrWorkflowSection({ workflows, employeeId, employeeName }: {
  workflows: string[]; employeeId: number; employeeName?: string;
}) {
  const { t } = useLanguage();
  const queryKey = ["/api/hr-actions", { employeeId }];
  const { data: actions = [], isLoading } = useQuery<HrAction[]>({
    queryKey: ["/api/hr-actions", employeeId],
    queryFn: async () => {
      const r = await fetch(`/api/hr-actions?employeeId=${employeeId}`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });

  const relevant = actions.filter(a => workflows.includes(a.workflow));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {workflows.map(wf => (
          <NewHrActionDialog key={wf} workflow={wf} employeeId={employeeId} queryKey={["/api/hr-actions", employeeId]} />
        ))}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : relevant.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t("لا توجد إجراءات بعد", "No actions yet")}</p>
      ) : (
        <div className="space-y-2">
          {relevant.map(a => (
            <HrActionCard key={a.id} action={a} employeeName={employeeName} queryKey={["/api/hr-actions", employeeId]} />
          ))}
        </div>
      )}
    </div>
  );
}
