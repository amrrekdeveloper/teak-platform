import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/components/language-provider";
import { Printer } from "lucide-react";

export type ReportData = { title: string; subtitle?: string; headings: string[]; rows: (string | number)[][]; language?: "ar" | "en" };

/** Print only the supplied report, never the surrounding employee list. */
export function printReport(report: ReportData) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.");
  const doc = popup.document;
  doc.title = report.title;
  doc.documentElement.lang = report.language || "ar";
  doc.documentElement.dir = report.language === "en" ? "ltr" : "rtl";
  const style = doc.createElement("style");
  style.textContent = `body{font:14px Arial,sans-serif;color:#222;margin:24px}h1{color:#891b32;font-size:23px}table{width:100%;min-width:1000px;border-collapse:collapse;table-layout:auto}td,th{border:1px solid #ccc;padding:9px;text-align:start;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#f5eeee}thead{display:table-header-group}tr{break-inside:avoid}@page{size:A4 landscape;margin:14mm}@media print{button{display:none}table{min-width:0}}`;
  doc.head.append(style);
  const h = doc.createElement("h1"); h.textContent = `TEAK | ${report.title}`; doc.body.append(h);
  const sub = doc.createElement("p"); sub.textContent = report.subtitle || ""; doc.body.append(sub);
  const table = doc.createElement("table");
  const head = table.createTHead().insertRow();
  report.headings.forEach(text => { const th = doc.createElement("th"); th.textContent = text; head.append(th); });
  const body = table.createTBody();
  report.rows.forEach(values => { const row = body.insertRow(); values.forEach(value => { row.insertCell().textContent = String(value ?? "—"); }); });
  doc.body.append(table);
  const button = doc.createElement("button"); button.textContent = "طباعة / حفظ PDF"; button.onclick = () => popup.print(); doc.body.append(button);
  popup.focus(); popup.print();
}
export function ReportPreview({ report, onClose }: { report: ReportData | null; onClose: () => void }) {
  const { t } = useLanguage();
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); setError(""); }, [report]);
  const pageCount = Math.max(1, Math.ceil((report?.rows.length || 0) / 100));
  return <Dialog open={!!report} onOpenChange={open => !open && onClose()}>
    <DialogContent className="w-[96vw] max-w-6xl max-h-[94dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{report?.title}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">{report?.subtitle}</p>
      <Button onClick={() => { try { if (report) printReport(report); } catch (e) { setError((e as Error).message); } }}><Printer className="w-4 h-4 me-2" />{t("طباعة / حفظ PDF", "Print / Save PDF")}</Button>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {pageCount > 1 && <div className="flex flex-wrap items-center gap-3 text-sm">
        <Button variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{t("السابق", "Previous")}</Button>
        <span>{page + 1} / {pageCount} · {report?.rows.length} {t("سجل؛ الطباعة تشمل الجميع", "rows; printing includes all")}</span>
        <Button variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage(p => p + 1)}>{t("التالي", "Next")}</Button>
      </div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead><tr>{report?.headings.map((h, i) => <th className="border p-3 text-start" key={i}>{h}</th>)}</tr></thead><tbody>{report?.rows.slice(page * 100, (page + 1) * 100).map((row, i) => <tr key={i}>{row.map((v, j) => <td className="border p-3 whitespace-pre-wrap break-words" key={j}>{v}</td>)}</tr>)}</tbody></table></div>
    </DialogContent>
  </Dialog>;
}

/** Kept as a layout wrapper for existing HR screens; expansion controls were removed. */
export function HrExpandedWorkspace({ children }: { children: ReactNode }) {
  return <div className="min-w-0">
    <style>{`@media(max-width:639px){table.hr-responsive,table.hr-responsive tbody{display:block;width:100%}table.hr-responsive thead{display:none}table.hr-responsive tr{display:block;border:1px solid hsl(var(--border));border-radius:12px;margin:10px;padding:6px}table.hr-responsive td{display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:none;white-space:normal;padding:8px;overflow-wrap:anywhere}table.hr-responsive td::before{content:attr(data-label);font-size:12px;color:hsl(var(--muted-foreground));flex-shrink:0}table.hr-responsive input{min-height:40px}}`}</style>
    {children}
  </div>;
}
