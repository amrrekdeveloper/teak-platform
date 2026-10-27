import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, Clock3 } from "lucide-react";

type Zone = { id: number; nameAr: string };
type Period = { id: string; label: string; start: string; end: string; graceMinutes: number };
type Schedule = { id: number; scopeType: string; locationZoneId?: number | null; scopeValue?: string; labelAr?: string; workStartTime: string; workEndTime?: string; graceMinutes: number; shifts?: Period[] };
const onePeriod = (): Period[] => [{ id: "shift1", label: "الدوام", start: "07:30", end: "14:30", graceMinutes: 15 }];

export default function AttendanceZoneSchedules() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [zoneId, setZoneId] = useState("");
  const [label, setLabel] = useState("");
  const [periods, setPeriods] = useState<Period[]>(onePeriod);
  const [editId, setEditId] = useState<number | null>(null);
  const { data: zones = [] } = useQuery<Zone[]>({ queryKey: ["/api/attendance/zones"] });
  const { data: allSchedules = [] } = useQuery<Schedule[]>({ queryKey: ["/api/attendance/work-settings"] });
  const schedules = allSchedules.filter(s => s.scopeType === "location" && s.locationZoneId != null);
  const save = useMutation({
    mutationFn: async (args: { id?: number; zoneId: number; labelAr: string; shifts: Period[] }) => {
      const shifts = args.shifts.map((shift, i) => ({ ...shift, id: i ? "shift2" : "shift1" }));
      const body = { scopeType: "location", scopeValue: String(args.zoneId), locationZoneId: args.zoneId, labelAr: args.labelAr.trim(),
        workStartTime: shifts[0].start, workEndTime: shifts[shifts.length - 1].end, graceMinutes: shifts[0].graceMinutes, shifts };
      return args.id ? apiRequest("PATCH", `/api/attendance/work-settings/${args.id}`, body) : apiRequest("POST", "/api/attendance/work-settings", body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/attendance/work-settings"] }); qc.invalidateQueries({queryKey:["/api/attendance/shift-monitor"]}); setEditId(null); setLabel(""); setPeriods(onePeriod()); toast({ title: "تم حفظ الجدول", description: "تُحدّث فترات اليوم غير المستخدمة فقط؛ تبقى البصمات والفترات المسجلة والأيام السابقة محفوظة." }); },
    onError: (e: Error) => toast({ title: e.message || "تعذر حفظ الجدول", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/attendance/work-settings/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/attendance/work-settings"] }); toast({ title: "تم حذف الجدول" }); },
    onError: (e: Error) => toast({ title: e.message || "تعذر حذف الجدول؛ قد يكون مسندًا لموظف", variant: "destructive" }),
  });
  const startEdit = (item: Schedule) => { setEditId(item.id); setZoneId(String(item.locationZoneId)); setLabel(item.labelAr || ""); setPeriods(item.shifts?.length ? item.shifts.map(s => ({ ...s })) : [{ ...onePeriod()[0], start: item.workStartTime, end: item.workEndTime || "14:30", graceMinutes: item.graceMinutes }]); };
  const change = (index: number, key: keyof Period, value: string) => setPeriods(current => current.map((p, i) => i === index ? { ...p, [key]: key === "graceMinutes" ? Number(value) : value } : p));
  const submit = () => {
    const ordered=[...periods].sort((a,b)=>a.start.localeCompare(b.start));
    const invalid=ordered.length<1||ordered.length>2||ordered.some(p=>!p.label.trim()||!p.start||!p.end||p.end<=p.start||!Number.isInteger(p.graceMinutes)||p.graceMinutes<0||p.graceMinutes>240)||ordered.some((p,i)=>i>0&&ordered[i-1].end>=p.start);
    if (!zoneId || !label.trim() || invalid) { toast({ title: "أكمل اسم الخيار وحدد فترات مرتبة بلا تداخل", variant: "destructive" }); return; }
    save.mutate({ id: editId || undefined, zoneId: Number(zoneId), labelAr: label, shifts: ordered });
  };
  return <Card className="mt-4">
    <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Clock3 className="h-4 w-4"/>خيارات جداول الدوام حسب موقع البصمة</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end">
        <label className="grid gap-1 text-sm">موقع البصمة<Select disabled={editId!==null} value={zoneId} onValueChange={setZoneId}><SelectTrigger><SelectValue placeholder="اختر المنطقة"/></SelectTrigger><SelectContent>{zones.map(z=><SelectItem key={z.id} value={String(z.id)}>{z.nameAr}</SelectItem>)}</SelectContent></Select></label>
        <label className="grid gap-1 text-sm">اسم خيار الجدول<Input value={label} onChange={e=>setLabel(e.target.value)} placeholder="مثال: دوام المصنع"/></label>
        <Button variant="outline" onClick={()=>setPeriods(p=>p.length===1?[...p,{id:"shift2",label:"الفترة الثانية",start:"16:00",end:"22:00",graceMinutes:15}]:p.slice(0,1))}>{periods.length===1?"إضافة فترة ثانية":"إزالة الفترة الثانية"}</Button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {periods.map((p,i)=><div key={p.id} className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg border p-3">
          <div className="col-span-full flex items-center justify-between"><span className="text-xs font-semibold">{p.label||`الفترة ${i+1}`}</span>{periods.length>1&&<Button type="button" size="icon" variant="ghost" aria-label={`حذف ${p.label||`الفترة ${i+1}`}`} onClick={()=>setPeriods(current=>current.filter((_,index)=>index!==i))}><Trash2 className="h-4 w-4 text-destructive"/></Button>}</div>
          <label className="grid gap-1 text-xs">اسم الفترة<Input value={p.label} onChange={e=>change(i,"label",e.target.value)}/></label>
          <label className="grid gap-1 text-xs">من<Input type="time" value={p.start} onChange={e=>change(i,"start",e.target.value)}/></label>
          <label className="grid gap-1 text-xs">إلى<Input type="time" value={p.end} onChange={e=>change(i,"end",e.target.value)}/></label>
          <label className="grid gap-1 text-xs">السماح بالدقائق<Input type="number" min="0" max="240" value={p.graceMinutes} onChange={e=>change(i,"graceMinutes",e.target.value)}/></label>
        </div>)}
      </div>
      <div className="flex gap-2"><Button onClick={submit} disabled={save.isPending||!zoneId||!label.trim()}><Save className="h-4 w-4 me-1"/>{editId?"حفظ التعديل":"إضافة خيار الجدول"}</Button>{editId&&<Button variant="outline" onClick={()=>{setEditId(null);setLabel("");setPeriods(onePeriod())}}>إلغاء</Button>}</div>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/50"><tr>{["الموقع","الخيار","الفترات","الإجراءات"].map(x=><th key={x} className="p-2 text-start">{x}</th>)}</tr></thead><tbody>
        {schedules.map(s=><tr key={s.id} className="border-t"><td className="p-2">{zones.find(z=>z.id===s.locationZoneId)?.nameAr||s.locationZoneId}</td><td className="p-2">{s.labelAr||"جدول"}</td><td className="p-2">{(s.shifts||[]).map(p=>`${p.label} ${p.start}–${p.end}`).join(" / ")||`${s.workStartTime}–${s.workEndTime||"—"}`}</td><td className="p-2"><div className="flex gap-1"><Button size="sm" variant="outline" onClick={()=>startEdit(s)}>تعديل</Button><Button size="icon" variant="ghost" aria-label="حذف الجدول" disabled={remove.isPending} onClick={()=>{if(window.confirm("حذف خيار الجدول؟"))remove.mutate(s.id)}}><Trash2 className="h-4 w-4 text-destructive"/></Button></div></td></tr>)}
        {!schedules.length&&<tr><td colSpan={4} className="p-4 text-center text-muted-foreground">لا توجد خيارات جداول مرتبطة بمناطق البصمة.</td></tr>}
      </tbody></table></div>
    </CardContent>
  </Card>;
}
