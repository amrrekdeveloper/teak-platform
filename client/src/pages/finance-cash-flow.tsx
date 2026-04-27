import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { FinanceLayout } from "@/components/finance-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Printer, TrendingUp, TrendingDown } from "lucide-react";
import { format, startOfYear } from "date-fns";

const METHOD_AR: Record<string, string> = {
  bank_transfer: "تحويل بنكي",
  cash: "نقداً",
  card: "بطاقة",
};

const STAGE_AR: Record<string, string> = {
  deposit: "عربون",
  pre_manufacturing: "قبل التصنيع",
  delivery: "عند التوصيل",
  final: "نهائية",
  other: "أخرى",
};

export default function FinanceCashFlowPage() {
  const { t } = useLanguage();
  const [from, setFrom] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [applied, setApplied] = useState({ from, to });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/accounting/cash-flow", applied.from, applied.to],
    queryFn: async () => {
      const res = await fetch(`/api/accounting/cash-flow?from=${applied.from}&to=${applied.to}`, { credentials: "include" });
      return res.json();
    },
  });

  return (
    <FinanceLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              {t("قائمة التدفقات النقدية", "Cash Flow Statement")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("التدفقات الداخلة والخارجة من الأنشطة التشغيلية", "Operating cash inflows and outflows")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="btn-print-cashflow">
            <Printer className="h-4 w-4 me-1.5" />
            {t("طباعة", "Print")}
          </Button>
        </div>

        <Card className="print:hidden">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">{t("من", "From")}</Label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" data-testid="input-cf-from" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("إلى", "To")}</Label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" data-testid="input-cf-to" />
              </div>
              <Button size="sm" onClick={() => setApplied({ from, to })} data-testid="btn-apply-cf">
                {t("عرض", "Show")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">{t("جاري التحميل...", "Loading...")}</p>
        ) : data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="border-green-200 dark:border-green-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t("التدفقات الداخلة", "Cash Inflows")}</p>
                      <p className="text-lg font-bold text-green-700 dark:text-green-300">
                        {(data.totalInflows || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-red-200 dark:border-red-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t("التدفقات الخارجة", "Cash Outflows")}</p>
                      <p className="text-lg font-bold text-red-700 dark:text-red-300">
                        {(data.totalOutflows || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className={(data.netCashFlow || 0) >= 0 ? "border-blue-200 dark:border-blue-800" : "border-orange-200 dark:border-orange-800"}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Wallet className={`h-5 w-5 ${(data.netCashFlow || 0) >= 0 ? "text-blue-500" : "text-orange-500"}`} />
                    <div>
                      <p className="text-xs text-muted-foreground">{t("صافي التدفق النقدي", "Net Cash Flow")}</p>
                      <p className={`text-lg font-bold ${(data.netCashFlow || 0) >= 0 ? "text-blue-700 dark:text-blue-300" : "text-orange-700 dark:text-orange-300"}`}>
                        {Math.abs(data.netCashFlow || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                        {(data.netCashFlow || 0) < 0 && <span className="text-xs ms-1">(خروج)</span>}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Inflows */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-green-700 dark:text-green-300 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  {t("التدفقات الداخلة — مدفوعات العملاء المؤكدة", "Cash Inflows — Confirmed Customer Payments")}
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 ms-auto">
                    {(data.inflows || []).length} معاملة
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(data.inflows || []).length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground text-sm">لا توجد تدفقات داخلة في هذه الفترة</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs">
                        <tr>
                          <th className="text-right px-3 py-2">التاريخ</th>
                          <th className="text-right px-3 py-2">العميل</th>
                          <th className="text-right px-3 py-2">رقم العقد</th>
                          <th className="text-right px-3 py-2">المرحلة</th>
                          <th className="text-right px-3 py-2">طريقة الدفع</th>
                          <th className="text-right px-3 py-2 w-32">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(data.inflows || []).map((r: any, i: number) => (
                          <tr key={i} className="hover:bg-accent/30">
                            <td className="px-3 py-2 text-muted-foreground text-xs">{r.created_at?.slice(0, 10)}</td>
                            <td className="px-3 py-2">{r.customer_name || "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs">{r.contract_number || "—"}</td>
                            <td className="px-3 py-2 text-xs">{STAGE_AR[r.payment_stage] || r.payment_stage}</td>
                            <td className="px-3 py-2 text-xs">{METHOD_AR[r.method] || r.method}</td>
                            <td className="px-3 py-2 tabular-nums text-green-700 dark:text-green-400 font-medium">
                              {parseFloat(r.amount).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Outflows */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-red-700 dark:text-red-300 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  {t("التدفقات الخارجة — أوامر شراء مستلمة", "Cash Outflows — Received Purchase Orders")}
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 ms-auto">
                    {(data.outflows || []).length} معاملة
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(data.outflows || []).length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground text-sm">لا توجد تدفقات خارجة في هذه الفترة</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs">
                        <tr>
                          <th className="text-right px-3 py-2">التاريخ</th>
                          <th className="text-right px-3 py-2">المورد</th>
                          <th className="text-right px-3 py-2 w-32">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(data.outflows || []).map((r: any, i: number) => (
                          <tr key={i} className="hover:bg-accent/30">
                            <td className="px-3 py-2 text-muted-foreground text-xs">{r.created_at?.slice(0, 10)}</td>
                            <td className="px-3 py-2">{r.supplier_name || "—"}</td>
                            <td className="px-3 py-2 tabular-nums text-red-700 dark:text-red-400 font-medium">
                              {parseFloat(r.amount).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </FinanceLayout>
  );
}
