import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { FinanceLayout } from "@/components/finance-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3, Printer, FileText, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { exportReportPDF, exportReportExcel } from "@/lib/finance-export";
import { useToast } from "@/hooks/use-toast";

function SectionTable({ title, groups, total, colorClass }: { title: string; groups: any[]; total: number; colorClass: string }) {
  if (!groups || groups.length === 0) return null;
  const fmt = (n: number) => Math.abs(n).toLocaleString("ar-SA", { minimumFractionDigits: 2 });
  return (
    <div className="mb-4">
      <h3 className={`font-bold text-sm px-3 py-2 ${colorClass} rounded-t`}>{title}</h3>
      <table className="w-full text-sm border border-t-0 rounded-b overflow-hidden">
        <tbody className="divide-y">
          {groups.map((group: any, gi: number) => (
            <>
              {group.children && group.children.length > 0 ? (
                <>
                  <tr key={`g-${gi}`} className="bg-muted/20">
                    <td className="px-3 py-1.5 font-semibold text-xs text-muted-foreground">
                      <span className="font-mono me-2">{group.code}</span>{group.nameAr}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums w-36 text-muted-foreground text-xs"></td>
                  </tr>
                  {group.children.map((child: any, ci: number) => (
                    <tr key={`c-${gi}-${ci}`} className="hover:bg-accent/30">
                      <td className="px-6 py-1.5">
                        <span className="font-mono text-xs text-muted-foreground me-2">{child.code}</span>
                        {child.nameAr}
                      </td>
                      <td className={`px-3 py-1.5 text-right tabular-nums w-36 ${child.balance < 0 ? "text-red-600" : ""}`}>
                        {fmt(child.balance)} ر.س
                      </td>
                    </tr>
                  ))}
                  <tr key={`st-${gi}`} className="bg-muted/10 border-t">
                    <td className="px-3 py-1 text-xs text-muted-foreground">مجموع {group.nameAr}</td>
                    <td className={`px-3 py-1 text-right tabular-nums text-sm font-medium ${group.subTotal < 0 ? "text-red-600" : ""}`}>
                      {fmt(group.subTotal)} ر.س
                    </td>
                  </tr>
                </>
              ) : (
                <tr key={`g-${gi}`} className="hover:bg-accent/30">
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-muted-foreground me-2">{group.code}</span>
                    {group.nameAr}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums w-36 ${group.balance < 0 ? "text-red-600" : ""}`}>
                    {fmt(group.balance)} ر.س
                  </td>
                </tr>
              )}
            </>
          ))}
          <tr className="bg-muted/30 font-bold border-t-2">
            <td className="px-3 py-2">إجمالي {title}</td>
            <td className="px-3 py-2 text-right tabular-nums">
              {fmt(total)} ر.س
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function flattenGroups(groups: any[]): { code: string; name: string; balance: number }[] {
  const rows: { code: string; name: string; balance: number }[] = [];
  for (const g of groups || []) {
    if (g.children && g.children.length > 0) {
      for (const c of g.children) {
        rows.push({ code: c.code, name: c.nameAr, balance: Math.abs(c.balance) });
      }
      rows.push({ code: "", name: `مجموع ${g.nameAr}`, balance: Math.abs(g.subTotal) });
    } else {
      rows.push({ code: g.code, name: g.nameAr, balance: Math.abs(g.balance) });
    }
  }
  return rows;
}

export default function FinanceBalanceSheetPage() {
  const { t } = useLanguage();
  const [asOf, setAsOf] = useState(format(new Date(), "yyyy-MM-dd"));
  const [applied, setApplied] = useState(asOf);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/accounting/balance-sheet", applied],
    queryFn: async () => {
      const res = await fetch(`/api/accounting/balance-sheet?asOf=${applied}`, { credentials: "include" });
      return res.json();
    },
  });

  const isBalanced = data ? Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)) < 1 : true;

  const handleExportPdf = async () => {
    if (!data) return;
    setExportingPdf(true);
    try {
      const fmt2 = (n: number) => `${Math.abs(n).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س`;

      const assetsBody = flattenGroups(data.assets).map(r => [r.code, r.name, fmt2(r.balance)]);
      const liabBody = flattenGroups(data.liabilities).map(r => [r.code, r.name, fmt2(r.balance)]);
      const equityBody = flattenGroups(data.equity).map(r => [r.code, r.name, fmt2(r.balance)]);

      await exportReportPDF(
        "Balance Sheet - الميزانية العمومية",
        `كما في ${applied}`,
        [
          {
            title: "الأصول",
            head: [["الرمز", "الحساب", "الرصيد"]],
            body: assetsBody,
            footRow: ["", "إجمالي الأصول", fmt2(data.totalAssets || 0)],
          },
          {
            title: "الخصوم",
            head: [["الرمز", "الحساب", "الرصيد"]],
            body: liabBody,
            footRow: ["", "إجمالي الخصوم", fmt2(data.totalLiabilities || 0)],
          },
          {
            title: "حقوق الملكية",
            head: [["الرمز", "الحساب", "الرصيد"]],
            body: equityBody,
            footRow: ["", "إجمالي حقوق الملكية", fmt2(data.totalEquity || 0)],
          },
        ],
        `balance-sheet-${applied}.pdf`,
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
      const cols = [
        { header: "الرمز", key: "code", width: 12 },
        { header: "اسم الحساب", key: "name", width: 40 },
        { header: "الرصيد (ر.س)", key: "balance", width: 20 },
      ];

      const assetsRows = flattenGroups(data.assets);
      const liabRows = flattenGroups(data.liabilities);
      const equityRows = flattenGroups(data.equity);

      await exportReportExcel(
        "Balance Sheet - الميزانية العمومية",
        `كما في ${applied}`,
        [
          {
            name: "الأصول",
            columns: cols,
            rows: assetsRows,
            totalsRow: { code: "", name: "إجمالي الأصول", balance: data.totalAssets || 0 },
          },
          {
            name: "الخصوم",
            columns: cols,
            rows: liabRows,
            totalsRow: { code: "", name: "إجمالي الخصوم", balance: data.totalLiabilities || 0 },
          },
          {
            name: "حقوق الملكية",
            columns: cols,
            rows: equityRows,
            totalsRow: { code: "", name: "إجمالي حقوق الملكية", balance: data.totalEquity || 0 },
          },
        ],
        `balance-sheet-${applied}.xlsx`,
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
              <BarChart3 className="h-5 w-5 text-primary" />
              {t("الميزانية العمومية", "Balance Sheet")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("الأصول = الخصوم + حقوق الملكية", "Assets = Liabilities + Equity")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={!data || exportingPdf}
              data-testid="btn-export-pdf-bs"
            >
              <FileText className="h-4 w-4 me-1.5" />
              {exportingPdf ? t("جاري التصدير...", "Exporting...") : t("تصدير PDF", "Export PDF")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              disabled={!data || exportingXlsx}
              data-testid="btn-export-excel-bs"
            >
              <FileSpreadsheet className="h-4 w-4 me-1.5" />
              {exportingXlsx ? t("جاري التصدير...", "Exporting...") : t("تصدير Excel", "Export Excel")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="btn-print-balance-sheet">
              <Printer className="h-4 w-4 me-1.5" />
              {t("طباعة", "Print")}
            </Button>
          </div>
        </div>

        <Card className="print:hidden">
          <CardContent className="p-4">
            <div className="flex gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">{t("كما في تاريخ", "As of Date")}</Label>
                <Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="w-44" data-testid="input-bs-asof" />
              </div>
              <Button size="sm" onClick={() => setApplied(asOf)} data-testid="btn-apply-bs">
                {t("عرض", "Show")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">{t("جاري التحميل...", "Loading...")}</p>
        ) : data && (
          <>
            <div className="print:text-center print:mb-4 hidden print:block">
              <h1 className="text-2xl font-bold">الميزانية العمومية</h1>
              <p className="text-lg">كما في {applied}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Assets */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-blue-700 dark:text-blue-300">الأصول</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <SectionTable title="الأصول" groups={data.assets || []} total={data.totalAssets || 0} colorClass="bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300" />
                  <div className="px-3 py-3 border-t-2 bg-blue-50 dark:bg-blue-950/20">
                    <div className="flex justify-between font-bold text-blue-700 dark:text-blue-300">
                      <span>إجمالي الأصول</span>
                      <span>{(data.totalAssets || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Liabilities + Equity */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-red-700 dark:text-red-300">الخصوم وحقوق الملكية</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <SectionTable title="الخصوم" groups={data.liabilities || []} total={data.totalLiabilities || 0} colorClass="bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" />
                  <SectionTable title="حقوق الملكية" groups={data.equity || []} total={data.totalEquity || 0} colorClass="bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300" />
                  <div className="px-3 py-3 border-t-2 bg-red-50 dark:bg-red-950/20">
                    <div className="flex justify-between font-bold text-red-700 dark:text-red-300">
                      <span>إجمالي الخصوم وحقوق الملكية</span>
                      <span>{((data.totalLiabilities || 0) + (data.totalEquity || 0)).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className={isBalanced ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20" : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"}>
              <CardContent className="p-4 text-center">
                <p className={`font-bold ${isBalanced ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                  {isBalanced
                    ? "✓ الميزانية متوازنة — الأصول = الخصوم + حقوق الملكية"
                    : `⚠ الميزانية غير متوازنة — الفرق: ${Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س`}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </FinanceLayout>
  );
}
