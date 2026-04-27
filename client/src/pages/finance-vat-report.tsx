import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { FinanceLayout } from "@/components/finance-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Receipt, Printer, FileText, FileSpreadsheet } from "lucide-react";
import { exportReportPDF, exportReportExcel, type PdfSection, type ExcelSheet } from "@/lib/finance-export";
import { useToast } from "@/hooks/use-toast";

export default function FinanceVatReportPage() {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();
  const currentQ = Math.ceil((new Date().getMonth() + 1) / 3);

  const [quarter, setQuarter] = useState(String(currentQ));
  const [year, setYear] = useState(String(currentYear));
  const [applied, setApplied] = useState({ quarter, year });
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/accounting/vat-report", applied.quarter, applied.year],
    queryFn: async () => {
      const res = await fetch(`/api/accounting/vat-report?quarter=${applied.quarter}&year=${applied.year}`, { credentials: "include" });
      return res.json();
    },
  });

  const fmt = (n: number) => n.toLocaleString("ar-SA", { minimumFractionDigits: 2 });

  const periodLabel = `Q${applied.quarter} — ${applied.year}${data?.period ? ` (${data.period.from} - ${data.period.to})` : ""}`;

  const handleExportPdf = async () => {
    if (!data) return;
    setExportingPdf(true);
    try {
      const summaryBody: (string | number)[][] = [
        ["إجمالي المبيعات الخاضعة للضريبة (شامل ض.ق.م)", `${fmt(data.output?.taxableSales || 0)} ر.س`],
        ["عدد الفواتير الصادرة", `${data.output?.invoiceCount || 0} فاتورة`],
        ["ضريبة المخرجات المستحقة (15%)", `${fmt(data.output?.outputVat || 0)} ر.س`],
        ["إجمالي المشتريات الخاضعة للضريبة", `${fmt(data.input?.taxablePurchases || 0)} ر.س`],
        ["عدد فواتير الشراء", `${data.input?.poCount || 0} فاتورة`],
        ["ضريبة المدخلات القابلة للاسترداد (15%)", `${fmt(data.input?.inputVat || 0)} ر.س`],
      ];

      const invoiceBody: (string | number)[][] = (data.invoices || []).map((inv: any) => [
        `#${inv.invoice_number}`,
        inv.issued_at?.slice(0, 10) || "",
        inv.buyer_name || "",
        `${parseFloat(inv.subtotal || 0).toLocaleString("ar-SA")} ر.س`,
        `${parseFloat(inv.vat_amount || 0).toLocaleString("ar-SA")} ر.س`,
        `${parseFloat(inv.total_with_vat || 0).toLocaleString("ar-SA")} ر.س`,
      ]);

      const sections: PdfSection[] = [
        {
          title: "ملخص ضريبة القيمة المضافة",
          head: [["البيان", "المبلغ"]],
          body: summaryBody,
          footRow: [
            (data.netVat || 0) >= 0 ? "صافي الضريبة المستحقة للسداد" : "ضريبة مستردة",
            `${fmt(Math.abs(data.netVat || 0))} ر.س`,
          ],
        },
      ];

      if (invoiceBody.length > 0) {
        sections.push({
          title: "تفاصيل الفواتير الصادرة",
          head: [["رقم الفاتورة", "التاريخ", "العميل", "قبل الضريبة", "الضريبة", "الإجمالي"]],
          body: invoiceBody,
        });
      }

      await exportReportPDF(
        "VAT Report - تقرير ض.ق.م",
        periodLabel,
        sections,
        `vat-report-Q${applied.quarter}-${applied.year}.pdf`,
      );
    } catch {
      toast({ title: t("فشل تصدير PDF", "PDF export failed"), variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (!data) return;
    setExportingXlsx(true);
    try {
      const summaryRows = [
        { item: "إجمالي المبيعات الخاضعة للضريبة (شامل ض.ق.م)", amount: data.output?.taxableSales || 0, note: "" },
        { item: "عدد الفواتير الصادرة", amount: data.output?.invoiceCount || 0, note: "فاتورة" },
        { item: "ضريبة المخرجات المستحقة (15%)", amount: data.output?.outputVat || 0, note: "" },
        { item: "إجمالي المشتريات الخاضعة للضريبة", amount: data.input?.taxablePurchases || 0, note: "" },
        { item: "عدد فواتير الشراء", amount: data.input?.poCount || 0, note: "فاتورة" },
        { item: "ضريبة المدخلات القابلة للاسترداد (15%)", amount: data.input?.inputVat || 0, note: "" },
      ];

      const sheets: ExcelSheet[] = [
        {
          name: "الملخص",
          columns: [
            { header: "البيان", key: "item", width: 50 },
            { header: "المبلغ (ر.س)", key: "amount", width: 20 },
            { header: "ملاحظة", key: "note", width: 15 },
          ],
          rows: summaryRows,
          totalsRow: {
            item: (data.netVat || 0) >= 0 ? "صافي الضريبة المستحقة للسداد" : "ضريبة مستردة",
            amount: Math.abs(data.netVat || 0),
            note: "ر.س",
          },
        },
      ];

      if ((data.invoices || []).length > 0) {
        sheets.push({
          name: "تفاصيل الفواتير",
          columns: [
            { header: "رقم الفاتورة", key: "invoice_number", width: 18 },
            { header: "التاريخ", key: "issued_at", width: 15 },
            { header: "العميل", key: "buyer_name", width: 30 },
            { header: "قبل الضريبة", key: "subtotal", width: 18 },
            { header: "الضريبة", key: "vat_amount", width: 18 },
            { header: "الإجمالي", key: "total_with_vat", width: 18 },
          ],
          rows: (data.invoices || []).map((inv: any) => ({
            invoice_number: `#${inv.invoice_number}`,
            issued_at: inv.issued_at?.slice(0, 10) || "",
            buyer_name: inv.buyer_name || "",
            subtotal: parseFloat(inv.subtotal || 0),
            vat_amount: parseFloat(inv.vat_amount || 0),
            total_with_vat: parseFloat(inv.total_with_vat || 0),
          })),
        });
      }

      await exportReportExcel(
        "VAT Report - تقرير ض.ق.م",
        periodLabel,
        sheets,
        `vat-report-Q${applied.quarter}-${applied.year}.xlsx`,
      );
    } catch {
      toast({ title: t("فشل تصدير Excel", "Excel export failed"), variant: "destructive" });
    } finally {
      setExportingXlsx(false);
    }
  };

  return (
    <FinanceLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              {t("تقرير ضريبة القيمة المضافة", "VAT Report")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("ملخص ضريبة المخرجات والمدخلات للإقرار الضريبي ربع السنوي — ZATCA", "Output & input VAT summary for quarterly filing — ZATCA")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={!data || exportingPdf}
              data-testid="btn-export-pdf-vat"
            >
              <FileText className="h-4 w-4 me-1.5" />
              {exportingPdf ? t("جاري التصدير...", "Exporting...") : t("تصدير PDF", "Export PDF")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              disabled={!data || exportingXlsx}
              data-testid="btn-export-excel-vat"
            >
              <FileSpreadsheet className="h-4 w-4 me-1.5" />
              {exportingXlsx ? t("جاري التصدير...", "Exporting...") : t("تصدير Excel", "Export Excel")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="btn-print-vat">
              <Printer className="h-4 w-4 me-1.5" />
              {t("طباعة", "Print")}
            </Button>
          </div>
        </div>

        <Card className="print:hidden">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">{t("الربع المالي", "Quarter")}</Label>
                <Select value={quarter} onValueChange={setQuarter}>
                  <SelectTrigger className="w-36" data-testid="select-vat-quarter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">الربع الأول (Q1)</SelectItem>
                    <SelectItem value="2">الربع الثاني (Q2)</SelectItem>
                    <SelectItem value="3">الربع الثالث (Q3)</SelectItem>
                    <SelectItem value="4">الربع الرابع (Q4)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("السنة", "Year")}</Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="w-28" data-testid="select-vat-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={() => setApplied({ quarter, year })} data-testid="btn-apply-vat">
                {t("عرض", "Show")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">{t("جاري التحميل...", "Loading...")}</p>
        ) : data && (
          <>
            {/* ZATCA-style Summary */}
            <Card className="border-primary/30">
              <CardHeader className="bg-primary/5 pb-3">
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  {t("نموذج إقرار ضريبة القيمة المضافة", "VAT Return Form")}
                  <span className="text-sm font-normal text-muted-foreground">
                    {t(`الربع ${applied.quarter} — ${applied.year}`, `Q${applied.quarter} — ${applied.year}`)}
                    {data.period && ` (${data.period.from} → ${data.period.to})`}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {/* Output VAT */}
                  <div className="px-4 py-3 bg-green-50/50 dark:bg-green-950/10">
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-2">أ — المبيعات (ضريبة المخرجات)</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>إجمالي المبيعات الخاضعة للضريبة (شامل ضريبة القيمة المضافة)</span>
                        <span className="tabular-nums font-medium">{fmt(data.output?.taxableSales || 0)} ر.س</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>عدد الفواتير الصادرة</span>
                        <span className="tabular-nums">{data.output?.invoiceCount || 0} فاتورة</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-green-700 dark:text-green-300">
                        <span>ضريبة المخرجات المستحقة (15%)</span>
                        <span className="tabular-nums">{fmt(data.output?.outputVat || 0)} ر.س</span>
                      </div>
                    </div>
                  </div>

                  {/* Input VAT */}
                  <div className="px-4 py-3 bg-red-50/50 dark:bg-red-950/10">
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-2">ب — المشتريات (ضريبة المدخلات)</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>إجمالي المشتريات الخاضعة للضريبة</span>
                        <span className="tabular-nums font-medium">{fmt(data.input?.taxablePurchases || 0)} ر.س</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>عدد فواتير الشراء</span>
                        <span className="tabular-nums">{data.input?.poCount || 0} فاتورة</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-red-700 dark:text-red-300">
                        <span>ضريبة المدخلات القابلة للاسترداد (15%)</span>
                        <span className="tabular-nums">{fmt(data.input?.inputVat || 0)} ر.س</span>
                      </div>
                    </div>
                  </div>

                  {/* Net VAT */}
                  <div className={`px-4 py-4 ${(data.netVat || 0) >= 0 ? "bg-blue-50 dark:bg-blue-950/20" : "bg-green-50 dark:bg-green-950/20"}`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold text-base">
                          {(data.netVat || 0) >= 0 ? "صافي الضريبة المستحقة للسداد" : "ضريبة مستردة"}
                        </p>
                        <p className="text-xs text-muted-foreground">ضريبة المخرجات - ضريبة المدخلات</p>
                      </div>
                      <p className={`text-2xl font-bold tabular-nums ${(data.netVat || 0) >= 0 ? "text-blue-700 dark:text-blue-300" : "text-green-700 dark:text-green-300"}`}>
                        {fmt(Math.abs(data.netVat || 0))} ر.س
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Invoice Details */}
            {(data.invoices || []).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t("تفاصيل الفواتير الصادرة", "Issued Invoice Details")}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-right px-3 py-2">رقم الفاتورة</th>
                          <th className="text-right px-3 py-2">التاريخ</th>
                          <th className="text-right px-3 py-2">العميل</th>
                          <th className="text-right px-3 py-2">قبل الضريبة</th>
                          <th className="text-right px-3 py-2">الضريبة</th>
                          <th className="text-right px-3 py-2">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(data.invoices || []).map((inv: any, i: number) => (
                          <tr key={i} className="hover:bg-accent/30">
                            <td className="px-3 py-1.5 font-mono">#{inv.invoice_number}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{inv.issued_at?.slice(0, 10)}</td>
                            <td className="px-3 py-1.5">{inv.buyer_name}</td>
                            <td className="px-3 py-1.5 tabular-nums">{parseFloat(inv.subtotal).toLocaleString("ar-SA")}</td>
                            <td className="px-3 py-1.5 tabular-nums text-green-700 dark:text-green-400">{parseFloat(inv.vat_amount).toLocaleString("ar-SA")}</td>
                            <td className="px-3 py-1.5 tabular-nums font-medium">{parseFloat(inv.total_with_vat).toLocaleString("ar-SA")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </FinanceLayout>
  );
}
