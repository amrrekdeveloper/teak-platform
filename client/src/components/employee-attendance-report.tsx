import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Employee } from "@shared/schema";
import { riyadhDateKey } from "@shared/attendance";
import { attendanceReportCells, attendanceTime, type AttendanceReportRow } from "@shared/attendance-report";
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
  const valid = !!from && !!to && from <= to && Date.parse(to)-Date.parse(from)<=366*86400000;
  const { data, isLoading, error } = useQuery<{ records: any[]; permissions: any[] }>({
    queryKey: ["/api/attendance/monitor", "employee-file", employee.id, from, to],
    enabled: valid,
    queryFn: async () => {
      const res = await fetch(`/api/attendance/monitor?${new URLSearchParams({ employeeId: String(employee.id), from, to })}`, { credentials: "include" });
      if (!res.ok) throw new Error("تعذر تحميل سجل الحضور والأذونات");
      return res.json();
    },
  });
  const authoritative = useQuery<{rows:AttendanceReportRow[];configurationWarnings:string[]}>({
    queryKey:["attendance-individual-report",String(employee.id),from,to],enabled:valid,
    queryFn:async()=>{
      const res=await fetch(`/api/attendance/employees/${employee.id}/report?${new URLSearchParams({from,to})}`,{credentials:"include"});
      if(!res.ok)throw new Error("تعذر تحميل الجداول التاريخية الموثقة.");
      return res.json();
    },
  });
  // Defense in depth: never export a record for another employee, even if an API regresses.
  const records = (data?.records || []).filter(r => Number(r.employeeId) === employee.id && riyadhDateKey(new Date(r.checkTime)) >= from && riyadhDateKey(new Date(r.checkTime)) <= to);
  const reportRows=authoritative.data?.rows||[];
  const represented=new Set(reportRows.flatMap(r=>r.recordIds||[]));
  const rows:(string|number)[][]=reportRows.filter(r=>r.checkIn||r.checkOut||(r.recordIds?.length||0)>0)
    .map(r=>attendanceReportCells(r));
  // Preserve unmatched raw movements, without assigning a current shift to them.
  for(const e of records.filter(r=>!represented.has(r.id)))rows.push([
    riyadhDateKey(new Date(e.checkTime)),"غير معيّنة — يلزم مراجعة",
    e.type==="check_in"?attendanceTime(e.checkTime):"—",e.type==="check_out"?attendanceTime(e.checkTime):"—",
    "حركة تاريخية غير مصنفة","غير متاح","غير متاح",e.isManualEdit?"نعم":"—",
  ]);
  rows.sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
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
        <Button className="self-end" disabled={!valid || isLoading || !!error || authoritative.isLoading || !!authoritative.error} onClick={() => setReport(reportData)}>عرض / طباعة / حفظ PDF</Button>
      </div>
      {!valid && <p role="alert" className="text-destructive">اختر فترة صحيحة لا تتجاوز سنة؛ تاريخ النهاية لا يسبق البداية.</p>}
      {(error || authoritative.error) && <p role="alert" className="text-destructive">تعذر تحميل التقرير. يرجى إعادة المحاولة؛ لا تُعتبر البيانات الفارغة نتيجة صحيحة.</p>}
      {authoritative.data?.configurationWarnings.map(w=><p key={w} className="text-xs text-amber-700">{w}</p>)}
      {isLoading || authoritative.isLoading ? <p>جارٍ تحميل الحضور…</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{reportData.headings.map(h => <th key={h} className="p-2 border text-start whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td className="border p-2 whitespace-nowrap" key={j}>{v}</td>)}</tr>)}</tbody></table>{!rows.length && !error && !authoritative.error && <p className="py-4">لا توجد حركات مسجلة في الفترة المحددة.</p>}</div>}
      <p className="text-xs text-muted-foreground">الأوقات بتوقيت الرياض. لا تستنتج المخالفات أو الغياب من غياب البيانات. الحركات القديمة غير المعيّنة لا تُدمج بين الصباح والمساء.</p>
      <h3 className="font-semibold">كامل سجل الأذونات التاريخي</h3>
      <div className="space-y-2">{permissions.map(p => <div key={p.id} className="border rounded-lg p-3 text-sm grid sm:grid-cols-3 gap-2"><span>{p.date} · {p.type}</span><span>{p.startTime || "—"} — {p.endTime || "—"} · {p.hoursRequested ?? "—"} ساعة</span><span>{p.status}</span><p className="sm:col-span-3 break-words">{p.reason || "—"}</p></div>)}{!permissions.length && !error && <p className="text-sm text-muted-foreground">لا توجد أذونات مسجلة.</p>}</div>
      <ReportPreview report={report} onClose={() => setReport(null)} />
    </CardContent>
  </Card>;
}
