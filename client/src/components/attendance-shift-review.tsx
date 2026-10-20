import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { MedicalDocumentLinks } from "@/components/medical-document-links";
import { riyadhDateKey, type AttendanceShift } from "@shared/attendance";
import { attendanceMinutes, attendanceReportCells, type AttendanceReportRow } from "@shared/attendance-report";

export type AttendanceShiftReport = { employeeName: string; configurationWarnings: string[]; unassignedLegacyRecords: number; rows: AttendanceReportRow[] };
type Report = AttendanceShiftReport;
const labels: Record<string,string> = { present: "حاضر", late: "متأخر", absent: "غائب", pending: "لم تنته الوردية",
  missing_checkin: "نقص دخول", missing_checkout: "نقص خروج", rest_day: "راحة أسبوعية", approved_leave: "إجازة معتمدة", not_started: "قبل المباشرة", out_of_zone: "خارج النطاق", admin_override: "مصحح إدارياً", unverified_schedule: "جدول تاريخي غير موثق" };
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!));
const time = (value: string | Date | null) => value ? new Date(value).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" }) : "—";

/** Can also be mounted in the existing employee file with a fixed employeeId. */
export function AttendanceShiftReview({ employees, employeeId }: { employees: {id:number;nameAr:string}[]; employeeId?: number }) {
  const [selected, setSelected] = useState(employeeId ? String(employeeId) : "");
  const [from, setFrom] = useState(riyadhDateKey(new Date()));
  const [to, setTo] = useState(riyadhDateKey(new Date()));
  const [shift, setShift] = useState("");
  const report = useQuery<Report>({
    queryKey: ["attendance-individual-report", selected, from, to], enabled: !!selected && !!from && !!to,
    queryFn: async () => (await apiRequest("GET", `/api/attendance/employees/${selected}/report?from=${from}&to=${to}`)).json(),
  });
  const rows = report.data?.rows.filter(r => !shift || r.shiftId === shift) || [];
  const print = () => {
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(`<html lang="ar" dir="rtl"><head><title>سجل حضور الموظف</title><style>
      body{font:14px Arial;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}
      thead{display:table-header-group}tr{break-inside:avoid}@page{size:A4 landscape;margin:12mm}</style></head>
      <body><h1>${escapeHtml(report.data?.employeeName)}</h1><p>${escapeHtml(from)} — ${escapeHtml(to)} (توقيت الرياض)</p>
      <table><thead><tr>${["التاريخ","الوردية","الدخول","الخروج","الحالة","تأخير (دقيقة)","خروج مبكر (دقيقة)","تصحيح"].map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>
      ${rows.map(r=>`<tr>${attendanceReportCells(r).map(v=>`<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("")}
      </tbody></table></body></html>`);
    popup.document.close(); popup.focus(); popup.print();
  };
  return <section className="border rounded-xl p-3 space-y-3" dir="rtl">
    <h2 className="font-semibold">سجل الموظف حسب الوردية</h2>
    <div className="flex flex-wrap gap-2">
      {!employeeId && <select aria-label="الموظف" className="border rounded p-2 max-w-full" value={selected} onChange={e=>setSelected(e.target.value)}>
        <option value="">اختر الموظف</option>{employees.map(e=><option key={e.id} value={e.id}>{e.nameAr}</option>)}</select>}
      <Input aria-label="من تاريخ" className="w-40" type="date" value={from} onChange={e=>setFrom(e.target.value)} />
      <Input aria-label="إلى تاريخ" className="w-40" type="date" value={to} onChange={e=>setTo(e.target.value)} />
      <select aria-label="الوردية" className="border rounded p-2" value={shift} onChange={e=>setShift(e.target.value)}>
        <option value="">كل الورديات</option>{Array.from(new Map(report.data?.rows.map(r=>[r.shiftId,r.shiftLabel])).entries()).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
      <Button variant="outline" disabled={!report.data} onClick={print}>طباعة / حفظ PDF</Button>
    </div>
    {report.isLoading && <p>جاري التحميل…</p>}
    {report.isError && <p role="alert" className="text-destructive">{report.error.message}</p>}
    {report.data?.configurationWarnings.map(w=><p key={w} className="text-amber-700">{w}</p>)}
    {!!report.data?.unassignedLegacyRecords && <p className="text-amber-700">سجلات تاريخية غير منسوبة لوردية: {report.data.unassignedLegacyRecords} — يلزم مراجعتها ولا تُنسب تلقائياً.</p>}
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{rows.map(r=><article className="border rounded-lg p-3 space-y-1 text-sm" key={`${r.day}:${r.shiftId}`}>
      <div className="flex justify-between gap-2 font-medium"><span>{r.day} · {r.shiftLabel}</span><span>{labels[r.status]}</span></div>
      <p>الدخول: {time(r.checkIn)} · الخروج: {time(r.checkOut)}</p>
      <p className={!r.scheduleVerified?"text-amber-700":""}>تأخير: {attendanceMinutes(r,"lateMinutes")} · خروج مبكر: {attendanceMinutes(r,"earlyDepartureMinutes")}{!r.scheduleVerified?" — تحتاج مراجعة الجدول التاريخي.":" دقيقة"}</p>
      {r.adminOverride && <p className="text-violet-700">مصحح إدارياً</p>}
      {r.recordId != null && <div className="border-t pt-2 space-y-1">
        <strong className="text-xs">المرفقات الطبية</strong>
        {(r.recordIds ?? [r.recordId!]).map(id=><MedicalDocumentLinks key={id} recordId={id} />)}
      </div>}
    </article>)}</div>
  </section>;
}

export function AttendanceShiftEditor({ settingId }: { settingId: number }) {
  const [open, setOpen] = useState(false);
  const [shifts, setShifts] = useState<AttendanceShift[]>([{ id:"single",label:"الدوام",start:"08:00",end:"",graceMinutes:15 }]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const settings = await (await apiRequest("GET","/api/attendance/shift-settings")).json();
      const current = settings.find((s: {id:number})=>s.id===settingId);
      setShifts(current.shifts?.length ? current.shifts : [{id:"single",label:"الدوام",start:current.workStartTime,end:current.workEndTime||"",graceMinutes:current.graceMinutes}]);
      setOpen(true);
    } catch (e) { setMessage((e as Error).message); }
  };
  const save = async () => {
    setBusy(true); setMessage("");
    try { await apiRequest("PUT",`/api/attendance/work-settings/${settingId}/shifts`,{shifts}); setMessage("تم حفظ الورديات. تُطبّق التغييرات على الأيام المستقبلية غير الملتقطة؛ اليوم الحالي بعد بدء الرصد لا يُعاد احتسابه."); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="w-full space-y-2"><Button size="sm" variant="outline" onClick={()=>open?setOpen(false):load()}>{open?"إغلاق":"ضبط نهاية الدوام / ورديتين"}</Button>
    {open && <div className="space-y-2">{shifts.map((s,i)=><div key={i} className="flex flex-wrap gap-2">
      <Input className="w-32" aria-label="اسم الوردية" value={s.label} onChange={e=>setShifts(shifts.map((x,j)=>j===i?{...x,label:e.target.value}:x))}/>
      {(["start","end"] as const).map(key=><Input key={key} type="time" className="w-32" aria-label={key==="start"?"بداية الوردية":"نهاية الوردية"} value={s[key]} onChange={e=>setShifts(shifts.map((x,j)=>j===i?{...x,[key]:e.target.value}:x))}/>)}
      <Input className="w-24" type="number" aria-label="السماح بالدقائق" min={0} max={240} value={s.graceMinutes} onChange={e=>setShifts(shifts.map((x,j)=>j===i?{...x,graceMinutes:Number(e.target.value)}:x))}/>
    </div>)}
    <Button size="sm" variant="outline" onClick={()=>setShifts(shifts.length===1?[{...shifts[0],id:"morning"},{id:"evening",label:"مسائي",start:"",end:"",graceMinutes:15}]:[{...shifts[0],id:"single"}])}>{shifts.length===1?"إضافة وردية مستقلة":"دوام واحد"}</Button>
    <Button size="sm" disabled={busy} onClick={save}>حفظ</Button><p className="text-xs">لا يدعم اعتماد دوام عابر لمنتصف الليل دون سياسة معتمدة. تغيير الورديات يحتاج مراجعة السجلات التاريخية.</p></div>}
    {message&&<p role="status" className="text-sm">{message}</p>}
  </div>;
}

type CollectiveRow = Report["rows"][number] & { employeeId:number; employeeName:string; department:string;
  homeLocation:string; locationNames:string[]; outOfZone:boolean };
export function CollectiveShiftReview({ from, to, location, outOfZoneOnly }: {
  from:string;to:string;location:string;outOfZoneOnly:boolean;
}) {
  const [department,setDepartment] = useState("");
  const [employee,setEmployee] = useState("");
  const [shift,setShift] = useState("");
  const [status,setStatus] = useState("");
  const query = useQuery<{rows:CollectiveRow[];warnings:string[]}>({
    queryKey:["attendance-shift-monitor",from,to],
    queryFn:async()=> (await apiRequest("GET",`/api/attendance/shift-monitor?from=${riyadhDateKey(new Date(from))}&to=${riyadhDateKey(new Date(to))}`)).json(),
    refetchInterval:60000,
  });
  const all = query.data?.rows || [];
  const locationEmployees = new Set(all.filter(r=>r.homeLocation===location || r.locationNames.includes(location)).map(r=>r.employeeId));
  const base = all.filter(r=>(!department || r.department===department) && (!employee || String(r.employeeId)===employee) &&
    (!shift || r.shiftId===shift) && (location==="all" || locationEmployees.has(r.employeeId)) && (!outOfZoneOnly || r.outOfZone));
  const matches = (r:CollectiveRow,key:string) => key==="out_of_zone" ? r.outOfZone : key==="admin_override" ? r.adminOverride : r.status===key;
  const filtered = base.filter(r=>!status || matches(r,status));
  const columns = ["الموظف","القسم","التاريخ","الوردية","الدخول","الخروج","الحالة","تأخير (دقيقة)","خروج مبكر (دقيقة)","تصحيح إداري","الموقع"];
  const values = (r:CollectiveRow) => [r.employeeName,r.department,r.day,r.shiftLabel,time(r.checkIn),time(r.checkOut),labels[r.status]||r.status,
    attendanceMinutes(r,"lateMinutes"),attendanceMinutes(r,"earlyDepartureMinutes"),r.adminOverride?"نعم":"—",r.locationNames.join("، ")||r.homeLocation];
  const [exportError,setExportError] = useState("");
  const excel = async () => {
    try {
      const ExcelJS = await import("exceljs");
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet("الورديات",{views:[{rightToLeft:true,state:"frozen",ySplit:1}]});
      sheet.addRow(columns); sheet.addRows(filtered.map(values)); sheet.columns.forEach(c=>c.width=23);
      sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
      sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF245B49"}};
      sheet.autoFilter={from:"A1",to:"K1"};
      const url=URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      const a=document.createElement("a");a.href=url;a.download="تقرير_الورديات.xlsx";a.click();URL.revokeObjectURL(url);
    } catch {setExportError("تعذّر إنشاء ملف Excel. أعد المحاولة.");}
  };
  const print = () => {
    const popup=window.open("","_blank");
    if(!popup){setExportError("اسمح بالنوافذ المنبثقة للطباعة.");return;}
    popup.document.write(`<html lang="ar" dir="rtl"><head><title>تقرير الحضور حسب الوردية</title><style>body{font:11px Arial}table{width:100%;border-collapse:collapse}th,td{padding:6px;border:1px solid #ccc}thead{display:table-header-group}tr{break-inside:avoid}@page{size:A4 landscape;margin:10mm}</style></head><body>
      <h1>تقرير الحضور حسب الوردية</h1><p>${escapeHtml(riyadhDateKey(new Date(from)))} — ${escapeHtml(riyadhDateKey(new Date(to)))} · السجلات: ${filtered.length}</p>
      <table><thead><tr>${columns.map(c=>`<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${filtered.map(r=>`<tr>${values(r).map(v=>`<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);
    popup.document.close();popup.focus();popup.print();
  };
  return <section className="space-y-3" dir="rtl">
    <div className="flex flex-wrap gap-2 items-center">
      <select aria-label="فلتر القسم" className="border rounded p-2 bg-background" value={department} onChange={e=>setDepartment(e.target.value)}><option value="">كل الأقسام</option>
        {Array.from(new Set(all.map(r=>r.department))).map(d=><option key={d} value={d}>{d}</option>)}</select>
      <select aria-label="فلتر الموظف" className="border rounded p-2 bg-background max-w-full" value={employee} onChange={e=>setEmployee(e.target.value)}><option value="">كل الموظفين</option>
        {Array.from(new Map(all.map(r=>[r.employeeId,r.employeeName])).entries()).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
      <select aria-label="فلتر الوردية" className="border rounded p-2 bg-background" value={shift} onChange={e=>setShift(e.target.value)}><option value="">كل الورديات</option>
        {Array.from(new Map(all.map(r=>[r.shiftId,r.shiftLabel])).entries()).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
      <Button variant="outline" onClick={excel} disabled={!filtered.length}>Excel — الورديات</Button>
      <Button variant="outline" onClick={print} disabled={!filtered.length}>طباعة / PDF — الورديات</Button>
      <Button variant="outline" onClick={()=>query.refetch()}>تحديث الورديات</Button>
    </div>
    <p className="text-xs text-muted-foreground">الأعداد حسب الموظف / اليوم / الوردية. تُطبّق فلاتر التاريخ والموقع أعلاه. لا يُحتسب الغياب أو نقص الخروج قبل نهاية الوردية.</p>
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">{["present","late","absent","missing_checkin","missing_checkout","out_of_zone","admin_override","pending"].map(key=>
      <button key={key} className={`border rounded-lg p-3 min-h-20 text-right ${status===key?"ring-2 ring-primary bg-primary/5":""}`} onClick={()=>setStatus(status===key?"":key)}>
        <span className="block text-xl font-bold">{base.filter(r=>matches(r,key)).length}</span><span className="text-xs">{labels[key]}</span></button>)}</div>
    {status&&<Button size="sm" variant="ghost" onClick={()=>setStatus("")}>إلغاء فلتر الحالة</Button>}
    {query.isLoading&&<p>جارٍ تحميل الورديات…</p>}
    {(query.isError||exportError)&&<p role="alert" className="text-destructive">{exportError||query.error?.message}</p>}
    {!!query.data?.warnings.length&&<details className="border rounded p-2 text-sm text-amber-700"><summary>تنبيهات الإعداد والسجلات التاريخية ({query.data.warnings.length})</summary>{query.data.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}
    {!query.isLoading&&!filtered.length&&<p className="p-5 text-center text-muted-foreground">لا توجد سجلات مطابقة.</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map(r=><article key={`${r.employeeId}:${r.day}:${r.shiftId}`} className="border rounded-lg p-3 space-y-2 text-sm">
      <div className="flex justify-between gap-2"><strong>{r.employeeName}</strong><span>{labels[r.status]||r.status}</span></div>
      <p>{r.day} · {r.shiftLabel} · {r.department}</p><p>الدخول: {time(r.checkIn)} · الخروج: {time(r.checkOut)}</p>
      <p className={!r.scheduleVerified?"text-amber-700":""}>تأخير: {attendanceMinutes(r,"lateMinutes")} · خروج مبكر: {attendanceMinutes(r,"earlyDepartureMinutes")}</p>
      <p className="text-muted-foreground">{r.locationNames.join("، ")||r.homeLocation}</p>
      {r.outOfZone&&<p className="text-amber-700">محاولة خارج النطاق</p>}{r.adminOverride&&<p className="text-violet-700">تصحيح إداري مسجل</p>}
    </article>)}</div>
  </section>;
}
