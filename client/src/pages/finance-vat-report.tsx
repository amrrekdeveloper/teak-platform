import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { FinanceLayout } from "@/components/finance-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Receipt, Printer } from "lucide-react";

export default function FinanceVatReportPage() {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();
  const currentQ = Math.ceil((new Date().getMonth() + 1) / 3);

  const [quarter, setQuarter] = useState(String(currentQ));
  const [year, setYear] = useState(String(currentYear));
  const [applied, setApplied] = useState({ quarter, year });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/accounting/vat-report", applied.quarter, applied.year],
    queryFn: async () => {
      const res = await fetch(`/api/accounting/vat-report?quarter=${applied.quarter}&year=${applied.year}`, { credentials: "include" });
      return res.json();
    },
  });

  const fmt = (n: number) => n.toLocaleString("ar-SA", { minimumFractionDigits: 2 });

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
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="btn-print-vat">
            <Printer className="h-4 w-4 me-1.5" />
            {t("طباعة", "Print")}
          </Button>
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
