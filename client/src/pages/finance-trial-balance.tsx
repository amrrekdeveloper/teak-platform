import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { FinanceLayout } from "@/components/finance-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scale, Printer, CheckCircle2, AlertCircle, FileText, FileSpreadsheet } from "lucide-react";
import { format, startOfYear } from "date-fns";
import { exportReportPDF, exportReportExcel } from "@/lib/finance-export";
import { useToast } from "@/hooks/use-toast";

const TYPE_LABELS: Record<string, string> = {
  asset: "أصول", liability: "خصوم", equity: "حقوق ملكية",
  revenue: "إيرادات", cost: "تكلفة مبيعات", expense: "مصروفات",
};

export default function FinanceTrialBalancePage() {
  const { t } = useLanguage();
  const [from, setFrom] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [applied, setApplied] = useState({ from, to });
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/accounting/trial-balance", applied.from, applied.to],
    queryFn: async () => {
      const res = await fetch(`/api/accounting/trial-balance?from=${applied.from}&to=${applied.to}`, { credentials: "include" });
      return res.json();
    },
  });

  const periodLabel = `${applied.from} — ${applied.to}`;
  const fmtN = (n: number) => n.toLocaleString("ar-SA", { minimumFractionDigits: 2 });

  const handleExportPdf = async () => {
    if (!data) return;
    setExportingPdf(true);
    try {
      const body = (data.rows || []).map((row: any) => [
        row.account_code,
        row.account_name_ar,
        TYPE_LABELS[row.type] || row.type,
        `${fmtN(row.total_debit)} ر.س`,
        `${fmtN(row.total_credit)} ر.س`,
        `${fmtN(Math.abs(row.balance))} ر.س${row.balance < 0 ? " (د)" : ""}`,
      ]);

      await exportReportPDF(
        "Trial Balance - ميزان المراجعة",
        periodLabel,
        [
          {
            head: [["الرمز", "اسم الحساب", "النوع", "مجموع المدين", "مجموع الدائن", "الرصيد"]],
            body,
            footRow: [
              "",
              "الإجمالي",
              "",
              `${fmtN(data.totalDebit || 0)} ر.س`,
              `${fmtN(data.totalCredit || 0)} ر.س`,
              `${fmtN(Math.abs((data.totalDebit || 0) - (data.totalCredit || 0)))} ر.س`,
            ],
          },
        ],
        `trial-balance-${applied.from}-${applied.to}.pdf`,
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
      await exportReportExcel(
        "Trial Balance - ميزان المراجعة",
        periodLabel,
        [
          {
            name: "ميزان المراجعة",
            columns: [
              { header: "الرمز", key: "account_code", width: 12 },
              { header: "اسم الحساب", key: "account_name_ar", width: 35 },
              { header: "النوع", key: "type_label", width: 18 },
              { header: "مجموع المدين (ر.س)", key: "total_debit", width: 22 },
              { header: "مجموع الدائن (ر.س)", key: "total_credit", width: 22 },
              { header: "الرصيد (ر.س)", key: "balance", width: 18 },
            ],
            rows: (data.rows || []).map((row: any) => ({
              account_code: row.account_code,
              account_name_ar: row.account_name_ar,
              type_label: TYPE_LABELS[row.type] || row.type,
              total_debit: row.total_debit,
              total_credit: row.total_credit,
              balance: Math.abs(row.balance),
            })),
            totalsRow: {
              account_code: "",
              account_name_ar: "الإجمالي",
              type_label: "",
              total_debit: data.totalDebit || 0,
              total_credit: data.totalCredit || 0,
              balance: Math.abs((data.totalDebit || 0) - (data.totalCredit || 0)),
            },
          },
        ],
        `trial-balance-${applied.from}-${applied.to}.xlsx`,
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
              <Scale className="h-5 w-5 text-primary" />
              {t("ميزان المراجعة", "Trial Balance")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("مجموع المدين والدائن لكل الحسابات", "Total debit and credit for all accounts")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={!data || exportingPdf}
              data-testid="btn-export-pdf-tb"
            >
              <FileText className="h-4 w-4 me-1.5" />
              {exportingPdf ? t("جاري التصدير...", "Exporting...") : t("تصدير PDF", "Export PDF")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              disabled={!data || exportingXlsx}
              data-testid="btn-export-excel-tb"
            >
              <FileSpreadsheet className="h-4 w-4 me-1.5" />
              {exportingXlsx ? t("جاري التصدير...", "Exporting...") : t("تصدير Excel", "Export Excel")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="btn-print-trial-balance">
              <Printer className="h-4 w-4 me-1.5" />
              {t("طباعة", "Print")}
            </Button>
          </div>
        </div>

        <Card className="print:hidden">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">{t("من", "From")}</Label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" data-testid="input-tb-from" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("إلى", "To")}</Label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" data-testid="input-tb-to" />
              </div>
              <Button size="sm" onClick={() => setApplied({ from, to })} data-testid="btn-apply-tb">
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
              <CardTitle className="text-base flex items-center gap-2">
                {t("ميزان المراجعة", "Trial Balance")}
                <span className="text-sm font-normal text-muted-foreground">({applied.from} → {applied.to})</span>
                {data.isBalanced ? (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 ms-auto flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> {t("متوازن", "Balanced")}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="ms-auto flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {t("غير متوازن", "Unbalanced")}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="text-right px-3 py-2">{t("رمز الحساب", "Code")}</th>
                      <th className="text-right px-3 py-2">{t("اسم الحساب", "Account Name")}</th>
                      <th className="text-right px-3 py-2">{t("النوع", "Type")}</th>
                      <th className="text-right px-3 py-2 w-32">{t("مجموع المدين", "Total Debit")}</th>
                      <th className="text-right px-3 py-2 w-32">{t("مجموع الدائن", "Total Credit")}</th>
                      <th className="text-right px-3 py-2 w-32">{t("الرصيد", "Balance")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(data.rows || []).map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-accent/30">
                        <td className="px-3 py-2 font-mono text-xs">{row.account_code}</td>
                        <td className="px-3 py-2">{row.account_name_ar}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{TYPE_LABELS[row.type] || row.type}</td>
                        <td className="px-3 py-2 tabular-nums text-blue-700 dark:text-blue-400">
                          {row.total_debit.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-green-700 dark:text-green-400">
                          {row.total_credit.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`px-3 py-2 tabular-nums font-medium ${row.balance < 0 ? "text-red-600" : ""}`}>
                          {Math.abs(row.balance).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                          {row.balance < 0 && " (د)"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 font-bold border-t-2 text-sm">
                    <tr>
                      <td colSpan={3} className="px-3 py-2">{t("الإجمالي", "Total")}</td>
                      <td className="px-3 py-2 tabular-nums text-blue-700 dark:text-blue-400">
                        {(data.totalDebit || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-green-700 dark:text-green-400">
                        {(data.totalCredit || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {Math.abs((data.totalDebit || 0) - (data.totalCredit || 0)).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </FinanceLayout>
  );
}
