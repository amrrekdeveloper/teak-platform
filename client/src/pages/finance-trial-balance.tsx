import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { FinanceLayout } from "@/components/finance-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scale, Printer, CheckCircle2, AlertCircle } from "lucide-react";
import { format, startOfYear } from "date-fns";

const TYPE_LABELS: Record<string, string> = {
  asset: "أصول", liability: "خصوم", equity: "حقوق ملكية",
  revenue: "إيرادات", cost: "تكلفة مبيعات", expense: "مصروفات",
};

export default function FinanceTrialBalancePage() {
  const { t } = useLanguage();
  const [from, setFrom] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [applied, setApplied] = useState({ from, to });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/accounting/trial-balance", applied.from, applied.to],
    queryFn: async () => {
      const res = await fetch(`/api/accounting/trial-balance?from=${applied.from}&to=${applied.to}`, { credentials: "include" });
      return res.json();
    },
  });

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
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="btn-print-trial-balance">
            <Printer className="h-4 w-4 me-1.5" />
            {t("طباعة", "Print")}
          </Button>
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
