import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { FinanceLayout } from "@/components/finance-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Printer, FileText, FileSpreadsheet } from "lucide-react";
import { format, startOfYear } from "date-fns";
import { exportReportPDF, exportReportExcel } from "@/lib/finance-export";
import { useToast } from "@/hooks/use-toast";

function StatRow({ label, amount, indent, bold, separator, color }: {
  label: string; amount: number; indent?: boolean; bold?: boolean; separator?: boolean; color?: string;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-2 ${separator ? "border-t-2 mt-1 bg-muted/20" : "border-b"} ${bold ? "font-bold" : ""}`}>
      <span className={`text-sm ${indent ? "ps-4" : ""} ${color || ""}`}>{label}</span>
      <span className={`tabular-nums text-sm ${color || ""}`}>
        {Math.abs(amount).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
        {amount < 0 && <span className="text-xs text-muted-foreground ms-1">(خسارة)</span>}
      </span>
    </div>
  );
}

export default function FinanceIncomeStatementPage() {
  const { t } = useLanguage();
  const [from, setFrom] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [applied, setApplied] = useState({ from, to });
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const { toast } = useToast();
  const [selectedFy, setSelectedFy] = useState("custom");

  const { data: fiscalYears = [] } = useQuery<any[]>({ queryKey: ["/api/accounting/fiscal-years"] });

  const handleFyChange = (fyId: string) => {
    setSelectedFy(fyId);
    if (fyId !== "custom") {
      const fy = (fiscalYears as any[]).find((f: any) => String(f.id) === fyId);
      if (fy) { setFrom(fy.startDate); setTo(fy.endDate); }
    }
  };

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/accounting/income-statement", applied.from, applied.to],
    queryFn: async () => {
      const res = await fetch(`/api/accounting/income-statement?from=${applied.from}&to=${applied.to}`, { credentials: "include" });
      return res.json();
    },
  });

  const periodLabel = `${applied.from} — ${applied.to}`;
  const fmt2 = (n: number) => `${Math.abs(n).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س`;

  const handleExportPdf = async () => {
    if (!data) return;
    setExportingPdf(true);
    try {
      const revenueBody = (data.revenue || []).map((r: any) => [`${r.code}`, r.nameAr, fmt2(r.amount)]);
      const costBody = (data.cost || []).map((r: any) => [`${r.code}`, r.nameAr, fmt2(r.amount)]);
      const expBody = (data.expense || []).map((r: any) => [`${r.code}`, r.nameAr, fmt2(Math.abs(r.amount))]);

      await exportReportPDF(
        "Income Statement - قائمة الدخل",
        periodLabel,
        [
          {
            title: "الإيرادات",
            head: [["الرمز", "الحساب", "المبلغ"]],
            body: revenueBody,
            footRow: ["", "إجمالي الإيرادات", fmt2(data.totalRevenue || 0)],
          },
          {
            title: "تكلفة المبيعات",
            head: [["الرمز", "الحساب", "المبلغ"]],
            body: costBody,
            footRow: ["", "إجمالي تكلفة المبيعات", fmt2(data.totalCost || 0)],
          },
          {
            title: "المصروفات التشغيلية",
            head: [["الرمز", "الحساب", "المبلغ"]],
            body: expBody,
            footRow: ["", "إجمالي المصروفات", fmt2(Math.abs(data.totalExpense || 0))],
          },
          {
            title: (data.netProfit || 0) >= 0 ? "صافي الربح" : "صافي الخسارة",
            head: [["البيان", "المبلغ"]],
            body: [
              ["مجمل الربح", fmt2(data.grossProfit || 0)],
              ["إجمالي المصروفات التشغيلية", fmt2(Math.abs(data.totalExpense || 0))],
            ],
            footRow: [(data.netProfit || 0) >= 0 ? "صافي الربح" : "صافي الخسارة", fmt2(data.netProfit || 0)],
          },
        ],
        `income-statement-${applied.from}-${applied.to}.pdf`,
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
      const accountCols = [
        { header: "الرمز", key: "code", width: 12 },
        { header: "اسم الحساب", key: "name", width: 40 },
        { header: "المبلغ (ر.س)", key: "amount", width: 20 },
      ];

      await exportReportExcel(
        "Income Statement - قائمة الدخل",
        periodLabel,
        [
          {
            name: "الإيرادات",
            columns: accountCols,
            rows: (data.revenue || []).map((r: any) => ({ code: r.code, name: r.nameAr, amount: r.amount })),
            totalsRow: { code: "", name: "إجمالي الإيرادات", amount: data.totalRevenue || 0 },
          },
          {
            name: "تكلفة المبيعات",
            columns: accountCols,
            rows: (data.cost || []).map((r: any) => ({ code: r.code, name: r.nameAr, amount: r.amount })),
            totalsRow: { code: "", name: "إجمالي تكلفة المبيعات", amount: data.totalCost || 0 },
          },
          {
            name: "المصروفات",
            columns: accountCols,
            rows: (data.expense || []).map((r: any) => ({ code: r.code, name: r.nameAr, amount: Math.abs(r.amount) })),
            totalsRow: { code: "", name: "إجمالي المصروفات", amount: Math.abs(data.totalExpense || 0) },
          },
          {
            name: "الملخص",
            columns: [
              { header: "البيان", key: "item", width: 40 },
              { header: "المبلغ (ر.س)", key: "amount", width: 20 },
            ],
            rows: [
              { item: "إجمالي الإيرادات", amount: data.totalRevenue || 0 },
              { item: "إجمالي تكلفة المبيعات", amount: data.totalCost || 0 },
              { item: "مجمل الربح", amount: data.grossProfit || 0 },
              { item: "إجمالي المصروفات التشغيلية", amount: Math.abs(data.totalExpense || 0) },
            ],
            totalsRow: {
              item: (data.netProfit || 0) >= 0 ? "صافي الربح" : "صافي الخسارة",
              amount: data.netProfit || 0,
            },
          },
        ],
        `income-statement-${applied.from}-${applied.to}.xlsx`,
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
              <TrendingUp className="h-5 w-5 text-primary" />
              {t("قائمة الدخل", "Income Statement")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("الإيرادات والمصروفات وصافي الربح", "Revenue, expenses and net profit")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={!data || exportingPdf}
              data-testid="btn-export-pdf-is"
            >
              <FileText className="h-4 w-4 me-1.5" />
              {exportingPdf ? t("جاري التصدير...", "Exporting...") : t("تصدير PDF", "Export PDF")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              disabled={!data || exportingXlsx}
              data-testid="btn-export-excel-is"
            >
              <FileSpreadsheet className="h-4 w-4 me-1.5" />
              {exportingXlsx ? t("جاري التصدير...", "Exporting...") : t("تصدير Excel", "Export Excel")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="btn-print-income">
              <Printer className="h-4 w-4 me-1.5" />
              {t("طباعة", "Print")}
            </Button>
          </div>
        </div>

        <Card className="print:hidden">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              {(fiscalYears as any[]).length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("السنة المالية", "Fiscal Year")}</Label>
                  <Select value={selectedFy} onValueChange={handleFyChange}>
                    <SelectTrigger className="w-44" data-testid="select-is-fy">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">{t("تاريخ مخصص", "Custom Range")}</SelectItem>
                      {(fiscalYears as any[]).map((fy: any) => (
                        <SelectItem key={fy.id} value={String(fy.id)}>{fy.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{t("من", "From")}</Label>
                <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setSelectedFy("custom"); }} className="w-40" data-testid="input-is-from" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("إلى", "To")}</Label>
                <Input type="date" value={to} onChange={e => { setTo(e.target.value); setSelectedFy("custom"); }} className="w-40" data-testid="input-is-to" />
              </div>
              <Button size="sm" onClick={() => setApplied({ from, to })} data-testid="btn-apply-is">
                {t("عرض", "Show")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">{t("جاري التحميل...", "Loading...")}</p>
        ) : data && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t("قائمة الدخل", "Income Statement")}
                <span className="text-sm font-normal text-muted-foreground ms-2">({applied.from} → {applied.to})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Revenue */}
              <div className="bg-green-50 dark:bg-green-950/20 px-4 py-2 text-sm font-bold text-green-700 dark:text-green-300 border-b">
                الإيرادات
              </div>
              {(data.revenue || []).map((r: any, i: number) => (
                <StatRow key={i} label={`${r.code} — ${r.nameAr}`} amount={r.amount} indent />
              ))}
              <StatRow label="إجمالي الإيرادات" amount={data.totalRevenue || 0} bold separator color="text-green-700 dark:text-green-300" />

              {/* Cost */}
              <div className="bg-orange-50 dark:bg-orange-950/20 px-4 py-2 text-sm font-bold text-orange-700 dark:text-orange-300 border-b mt-2">
                تكلفة المبيعات
              </div>
              {(data.cost || []).map((r: any, i: number) => (
                <StatRow key={i} label={`${r.code} — ${r.nameAr}`} amount={r.amount} indent />
              ))}
              <StatRow label="إجمالي تكلفة المبيعات" amount={data.totalCost || 0} bold separator color="text-orange-700 dark:text-orange-300" />

              <StatRow
                label="مجمل الربح"
                amount={data.grossProfit || 0}
                bold separator
                color={(data.grossProfit || 0) >= 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}
              />

              {/* Expenses */}
              <div className="bg-red-50 dark:bg-red-950/20 px-4 py-2 text-sm font-bold text-red-700 dark:text-red-300 border-b mt-2">
                المصروفات التشغيلية
              </div>
              {(data.expense || []).map((r: any, i: number) => (
                <StatRow key={i} label={`${r.code} — ${r.nameAr}`} amount={Math.abs(r.amount)} indent />
              ))}
              <StatRow label="إجمالي المصروفات" amount={Math.abs(data.totalExpense || 0)} bold separator color="text-red-700 dark:text-red-300" />

              {/* Net Profit */}
              <div className={`px-4 py-4 border-t-4 ${(data.netProfit || 0) >= 0 ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`}>
                <div className="flex justify-between font-bold text-lg">
                  <span className={(data.netProfit || 0) >= 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}>
                    {(data.netProfit || 0) >= 0 ? "صافي الربح" : "صافي الخسارة"}
                  </span>
                  <span className={(data.netProfit || 0) >= 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}>
                    {Math.abs(data.netProfit || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </FinanceLayout>
  );
}
