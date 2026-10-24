import { useState } from "react";
import { CalendarRange, FileText, LoaderCircle, Printer } from "lucide-react";
import { attendanceReportCells, type AttendanceReportRow } from "@shared/attendance-report";
import { riyadhDateKey } from "@shared/attendance";
import { useLanguage } from "@/components/language-provider";
import { ReportPreview, type ReportData } from "@/components/hr-report";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EmployeeOption {
  id: number;
  employeeNumber: string;
  nameAr: string;
  nameEn?: string | null;
}

interface PeriodReportRow extends AttendanceReportRow {
  employeeId: number;
  employeeNumber: string;
  employeeNameAr: string;
  employeeNameEn: string;
}

interface PeriodReportResponse {
  rows: PeriodReportRow[];
  warnings: string[];
}

const todayInRiyadh = () => riyadhDateKey(new Date());
const inclusiveDays = (from: string, to: string) =>
  Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;

export function AttendancePeriodReport({ employees }: { employees: EmployeeOption[] }) {
  const { t, lang } = useLanguage();
  const today = todayInRiyadh();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [employeeId, setEmployeeId] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PeriodReportResponse | null>(null);
  const [preview, setPreview] = useState<ReportData | null>(null);

  const count = from && to ? inclusiveDays(from, to) : 0;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
    && Number.isFinite(count) && count > 0 && count <= 366;

  const setPreset = (range: "month" | "year") => {
    const current = todayInRiyadh();
    setFrom(range === "month" ? `${current.slice(0, 7)}-01` : `${current.slice(0, 4)}-01-01`);
    setTo(current);
    setError("");
    setResult(null);
  };

  const loadReport = async () => {
    if (!valid) return;
    setBusy(true);
    setError("");
    setResult(null);
    setPreview(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (employeeId !== "all") params.set("employeeId", employeeId);
      const response = await fetch(`/api/attendance/period-report?${params.toString()}`, { credentials: "include" });
      if (!response.ok) {
        let message = t("تعذر تحميل تقرير الفترة. حاول مرة أخرى.", "Could not load the period report. Please try again.");
        try {
          const body = await response.json();
          if (typeof body?.message === "string") message = body.message;
        } catch { /* Keep the clear localized fallback for non-JSON errors. */ }
        throw new Error(message);
      }
      const payload = await response.json() as PeriodReportResponse;
      if (!payload || !Array.isArray(payload.rows) || !Array.isArray(payload.warnings)) {
        throw new Error(t("استجابة التقرير غير مكتملة؛ لم يتم إنشاء معاينة.", "The report response was incomplete; no preview was created."));
      }
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("تعذر تحميل تقرير الفترة.", "Could not load the period report."));
    } finally {
      setBusy(false);
    }
  };

  const makePreview = () => {
    if (!result) return;
    const selectedEmployee = employeeId === "all"
      ? t("جميع الموظفين", "All employees")
      : employees.find(employee => String(employee.id) === employeeId)?.nameAr ?? "";
    const warningsText = result.warnings.length
      ? `${t("تنبيهات", "Warnings")}: ${result.warnings.join(" | ")}`
      : "";
    const subtitle = [
      `${t("الفترة", "Period")}: ${from} — ${to}`,
      `${t("الموظف", "Employee")}: ${selectedEmployee}`,
      "Asia/Riyadh",
      warningsText,
      result.rows.length === 0 ? t("لا توجد صفوف تقويمية في نتيجة التقرير.", "The report returned no calendar rows.") : "",
    ].filter(Boolean).join(" | ");
    setPreview({
      language: lang,
      title: t("تقرير حضور الفترة", "Attendance period report"),
      subtitle,
      headings: [
        t("رقم الموظف", "Employee no."),
        t("اسم الموظف", "Employee name"),
        t("التاريخ", "Date"),
        t("الوردية", "Shift"),
        t("الحضور", "Check-in"),
        t("الانصراف", "Check-out"),
        t("الحالة", "Status"),
        t("التأخير (دقيقة)", "Late (min)"),
        t("الخروج المبكر (دقيقة)", "Early departure (min)"),
        t("تصحيح إداري", "Admin correction"),
      ],
      // Keep every calendar row from the server, including dates without punches.
      rows: result.rows.map(row => [
        row.employeeNumber || "—",
        row.employeeNameAr || row.employeeNameEn || "—",
        ...attendanceReportCells(row),
      ]),
    });
  };

  const changePeriod = (setter: (value: string) => void, value: string) => {
    setter(value);
    setError("");
    setResult(null);
  };

  return (
    <Card className="overflow-hidden border-[hsl(var(--primary)/0.2)] bg-gradient-to-br from-card via-card to-[hsl(var(--primary)/0.035)]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarRange className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-base">{t("تقرير حضور لفترة", "Attendance period report")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("حمّل تقويماً موثقاً لكل يوم في الفترة، ثم استعرضه أو اطبعه.", "Load verified calendar rows for every day, then preview or print.")}
              </p>
            </div>
          </div>
          {result && <Badge variant="secondary">{result.rows.length} {t("صف", "rows")}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr_auto] xl:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="period-report-from">{t("من تاريخ", "From")}</Label>
            <Input id="period-report-from" type="date" value={from} dir="ltr" className="min-h-11" onChange={event => changePeriod(setFrom, event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="period-report-to">{t("إلى تاريخ", "To")}</Label>
            <Input id="period-report-to" type="date" value={to} dir="ltr" className="min-h-11" onChange={event => changePeriod(setTo, event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("الموظف", "Employee")}</Label>
            <Select value={employeeId} onValueChange={value => { setEmployeeId(value); setResult(null); setError(""); }}>
              <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("جميع الموظفين", "All employees")}</SelectItem>
                {employees.map(employee => <SelectItem key={employee.id} value={String(employee.id)}>
                  {employee.nameAr || employee.nameEn || employee.employeeNumber} · {employee.employeeNumber}
                </SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button className="min-h-11 gap-2" disabled={!valid || busy} onClick={loadReport}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {busy ? t("جارٍ التحميل…", "Loading…") : t("تحميل التقرير", "Load report")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="me-1 text-xs font-medium text-muted-foreground">{t("اختيار سريع", "Quick range")}:</span>
          <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => setPreset("month")}>{t("الشهر الحالي", "Current month")}</Button>
          <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => setPreset("year")}>{t("السنة الحالية", "Current year")}</Button>
          <span className="ms-auto text-xs text-muted-foreground" dir="ltr">
            {valid ? `${count} ${t("يوماً · توقيت الرياض", "days · Riyadh time")}` : t("الفترة بحد أقصى 366 يوماً", "Maximum period: 366 days")}
          </span>
        </div>

        {!valid && <p role="alert" className="text-sm text-destructive">
          {t("اختر فترة صحيحة لا تتجاوز 366 يوماً، ويجب ألا يسبق تاريخ النهاية البداية.", "Choose a valid period of no more than 366 days; the end date must not precede the start date.")}
        </p>}
        {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        {result && <div className="flex flex-col gap-3 rounded-lg border bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">{t("تم تحميل التقرير للفترة المحددة.", "Report loaded for the selected period.")}</p>
            <p className="text-xs text-muted-foreground">
              {result.rows.length
                ? t(`يتضمن ${result.rows.length} صفاً تقويمياً، بما فيها الأيام بلا حركات مسجلة.`, `${result.rows.length} calendar rows, including days without punches.`)
                : t("لم تُرجع الخدمة أي صفوف تقويمية؛ لن نعرض ذلك كحضور مكتمل.", "The service returned no calendar rows; this is not presented as a complete attendance record.")}
            </p>
            {result.warnings.map((warning, index) => <p key={`${index}-${warning}`} className="mt-1 text-xs text-amber-700 dark:text-amber-300">{warning}</p>)}
          </div>
          <Button className="min-h-11 shrink-0 gap-2" onClick={makePreview}>
            <Printer className="h-4 w-4" />{t("معاينة / طباعة PDF", "Preview / Print PDF")}
          </Button>
        </div>}
      </CardContent>
      <ReportPreview report={preview} onClose={() => setPreview(null)} />
    </Card>
  );
}
