import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Employee } from "@shared/schema";
import { riyadhDateKey, resolveAttendanceShifts, shiftAttendanceStatus, type WorkScheduleLike } from "@shared/attendance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ReportPreview, type ReportData } from "@/components/hr-report";

export function EmployeeAttendanceReport({ employee }: { employee: Employee }) {
  const today = riyadhDateKey(new Date());
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<ReportData | null>(null);
  const valid = !!from && !!to && from <= to;
  const { data, isLoading, error } = useQuery<{ records: any[]; permissions: any[] }>({
    queryKey: ["/api/attendance/monitor", "employee-file", employee.id, from, to],
    enabled: valid,
    queryFn: async () => {
      const res = await fetch(`/api/attendance/monitor?${new URLSearchParams({ employeeId: String(employee.id), from, to })}`, { credentials: "include" });
      if (!res.ok) throw new Error("تعذر تحميل سجل الحضور والأذونات");
      return res.json();
    },
  });
  const schedules = useQuery<WorkScheduleLike[]>({ queryKey: ["/api/attendance/work-settings"] });
  // Defense in depth: never export a record for another employee, even if an API regresses.
  const records = (data?.records || []).filter(r => Number(r.employeeId) === employee.id && riyadhDateKey(new Date(r.checkTime)) >= from && riyadhDateKey(new Date(r.checkTime)) <= to);
  const shifts = resolveAttendanceShifts(schedules.data || [], employee);
  const groups = new Map<string, any[]>();
  records.forEach(r => {
    const day = riyadhDateKey(new Date(r.checkTime));
    const key = `${day}|${r.shiftKey || (shifts.length === 1 ? shifts[0].id : "unassigned")}`;
    groups.set(key, [...(groups.get(key) || []), r]);
  });
  const time = (v: string | Date | null) => v ? new Date(v).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" }) : "—";
  const labels: Record<string, string> = { present: "حاضر", late: "متأخر", absent: "غائب", pending: "قيد الدوام", missing_checkin: "نقص حضور", missing_checkout: "نقص انصراف" };
  const rows: (string | number)[][] = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, events]) => {
    const [day, shiftId] = key.split("|");
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return events.map(e => [day, "غير معيّنة — يلزم مراجعة", e.type === "check_in" ? time(e.checkTime) : "—", e.type === "check_out" ? time(e.checkTime) : "—", "حركة تاريخية غير مصنفة", "—", "—", e.isManualEdit ? "نعم" : "لا"]);
    const summary = shiftAttendanceStatus(day, shift, events);
    return [[day, shift.label, time(summary.checkIn), time(summary.checkOut), events.some(e => e.isOutOfZone) ? "خارج النطاق" : labels[summary.status], summary.late ? summary.lateMinutes : 0, summary.earlyDepartureMinutes, summary.adminOverride ? "نعم" : "لا"]];
  });
  const reportData: ReportData = {
    title: `سجل حضور ${employee.fullNameAr || employee.fullNameEn || employee.employeeNumber}`,
    subtitle: `رقم الموظف: ${employee.employeeNumber} | ${from} — ${to} | Asia/Riyadh | الحركات المسجلة فقط؛ عدم وجود حركة لا يثبت الغياب.`,
    headings: ["التاريخ", "الوردية", "الحضور", "الانصراف", "الحالة", "التأخير (دقيقة)", "الخروج المبكر (دقيقة)", "تصحيح إداري"],
    rows,
  };
  const permissions = (data?.permissions || []).filter(p => Number(p.employeeId) === employee.id).sort((a, b) => b.date.localeCompare(a.date));
  return <Card>
    <CardHeader><CardTitle className="text-base">سجل حضور الموظف والأذونات</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><Label htmlFor="employee-attendance-from">من تاريخ</Label><Input id="employee-attendance-from" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><Label htmlFor="employee-attendance-to">إلى تاريخ</Label><Input id="employee-attendance-to" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <Button className="self-end" disabled={!valid || isLoading || !!error || schedules.isLoading || !!schedules.error} onClick={() => setReport(reportData)}>عرض / طباعة / حفظ PDF</Button>
      </div>
      {!valid && <p role="alert" className="text-destructive">اختر فترة صحيحة؛ تاريخ النهاية لا يسبق البداية.</p>}
      {(error || schedules.error) && <p role="alert" className="text-destructive">تعذر تحميل التقرير. يرجى إعادة المحاولة؛ لا تُعتبر البيانات الفارغة نتيجة صحيحة.</p>}
      {isLoading ? <p>جارٍ تحميل الحضور…</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{reportData.headings.map(h => <th key={h} className="p-2 border text-start whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td className="border p-2 whitespace-nowrap" key={j}>{v}</td>)}</tr>)}</tbody></table>{!rows.length && !error && <p className="py-4">لا توجد حركات مسجلة في الفترة المحددة.</p>}</div>}
      <p className="text-xs text-muted-foreground">الأوقات بتوقيت الرياض. لا تستنتج المخالفات أو الغياب من غياب البيانات. الحركات القديمة غير المعيّنة لا تُدمج بين الصباح والمساء.</p>
      <h3 className="font-semibold">كامل سجل الأذونات التاريخي</h3>
      <div className="space-y-2">{permissions.map(p => <div key={p.id} className="border rounded-lg p-3 text-sm grid sm:grid-cols-3 gap-2"><span>{p.date} · {p.type}</span><span>{p.startTime || "—"} — {p.endTime || "—"} · {p.hoursRequested ?? "—"} ساعة</span><span>{p.status}</span><p className="sm:col-span-3 break-words">{p.reason || "—"}</p></div>)}{!permissions.length && !error && <p className="text-sm text-muted-foreground">لا توجد أذونات مسجلة.</p>}</div>
      <ReportPreview report={report} onClose={() => setReport(null)} />
    </CardContent>
  </Card>;
}
