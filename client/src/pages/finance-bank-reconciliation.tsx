import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { FinanceLayout } from "@/components/finance-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Printer, AlertCircle, CheckCircle2 } from "lucide-react";
import { format, startOfMonth } from "date-fns";

const METHOD_AR: Record<string, string> = {
  bank_transfer: "تحويل بنكي",
  cash: "نقداً",
  card: "بطاقة",
};

export default function FinanceBankReconciliationPage() {
  const { t } = useLanguage();
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [bankBalance, setBankBalance] = useState("");
  const [applied, setApplied] = useState({ from, to });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/accounting/bank-reconciliation", applied.from, applied.to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (applied.from) params.set("from", applied.from);
      if (applied.to) params.set("to", applied.to);
      const res = await fetch(`/api/accounting/bank-reconciliation?${params}`, { credentials: "include" });
      return res.json();
    },
  });

  const ledgerBalance = data?.totalReceipts || 0;
  const totalPending = data?.totalPending || 0;
  const bankBalanceNum = parseFloat(bankBalance || "0");
  const adjustedBankBalance = bankBalanceNum + totalPending;
  const difference = adjustedBankBalance - ledgerBalance;
  const isReconciled = Math.abs(difference) < 1;

  return (
    <FinanceLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {t("مطابقة البنك", "Bank Reconciliation")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("مقارنة رصيد الدفتر برصيد كشف الحساب البنكي", "Compare book balance with bank statement balance")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="btn-print-bank-rec">
            <Printer className="h-4 w-4 me-1.5" />
            {t("طباعة", "Print")}
          </Button>
        </div>

        <Card className="print:hidden">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">{t("من", "From")}</Label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" data-testid="input-br-from" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("إلى", "To")}</Label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" data-testid="input-br-to" />
              </div>
              <Button size="sm" onClick={() => setApplied({ from, to })} data-testid="btn-apply-br">
                {t("عرض", "Show")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">{t("جاري التحميل...", "Loading...")}</p>
        ) : data && (
          <>
            {/* Reconciliation Summary */}
            <div className="grid md:grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{t("رصيد الدفتر (إيصالات بنكية مؤكدة)", "Book Balance (confirmed bank transfers)")}</p>
                  <p className="text-2xl font-bold tabular-nums mt-1">
                    {ledgerBalance.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{t("رصيد كشف الحساب البنكي", "Bank Statement Balance")}</p>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bankBalance}
                    onChange={e => setBankBalance(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 text-xl font-bold h-10"
                    data-testid="input-bank-statement-balance"
                  />
                </CardContent>
              </Card>
              <Card className={bankBalance ? (isReconciled ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800") : ""}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{t("الفرق", "Difference")}</p>
                  {bankBalance ? (
                    <div className="flex items-center gap-2 mt-1">
                      {isReconciled ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <p className={`text-2xl font-bold tabular-nums ${isReconciled ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                          {Math.abs(difference).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isReconciled ? "✓ مطابقة" : difference > 0 ? "البنك أعلى من الدفتر" : "الدفتر أعلى من البنك"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm mt-1">أدخل رصيد كشف الحساب</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Confirmed Transactions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {t("معاملات التحويل البنكي المؤكدة", "Confirmed Bank Transfer Transactions")}
                  <span className="text-muted-foreground font-normal">({applied.from} → {applied.to})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(data.payments || []).length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">لا توجد تحويلات بنكية مؤكدة في هذه الفترة</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs">
                        <tr>
                          <th className="text-right px-3 py-2">التاريخ</th>
                          <th className="text-right px-3 py-2">العميل</th>
                          <th className="text-right px-3 py-2">رقم العقد</th>
                          <th className="text-right px-3 py-2">رقم المرجع البنكي</th>
                          <th className="text-right px-3 py-2 w-32">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(data.payments || []).map((r: any, i: number) => (
                          <tr key={i} className="hover:bg-accent/30" data-testid={`bank-txn-${r.id}`}>
                            <td className="px-3 py-2 text-muted-foreground text-xs">{r.created_at?.slice(0, 10)}</td>
                            <td className="px-3 py-2">{r.customer_name || "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs">{r.contract_number || "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.bank_reference || "—"}</td>
                            <td className="px-3 py-2 tabular-nums font-medium text-primary">
                              {parseFloat(r.amount).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/30 font-bold border-t-2">
                        <tr>
                          <td colSpan={4} className="px-3 py-2">إجمالي التحويلات البنكية المؤكدة</td>
                          <td className="px-3 py-2 tabular-nums">
                            {ledgerBalance.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* In-Transit / Pending Items */}
            {(data.pendingPayments || []).length > 0 && (
              <Card className="border-yellow-200 dark:border-yellow-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-yellow-700 dark:text-yellow-300">
                    {t("مدفوعات قيد التسوية (لم تظهر في البنك بعد)", "In-Transit Payments (not yet cleared by bank)")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-yellow-50/50 dark:bg-yellow-950/20 text-xs">
                        <tr>
                          <th className="text-right px-3 py-2">التاريخ</th>
                          <th className="text-right px-3 py-2">العميل</th>
                          <th className="text-right px-3 py-2">رقم العقد</th>
                          <th className="text-right px-3 py-2">رقم المرجع البنكي</th>
                          <th className="text-right px-3 py-2 w-32">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(data.pendingPayments || []).map((r: any, i: number) => (
                          <tr key={i} className="hover:bg-yellow-50/30 dark:hover:bg-yellow-950/20" data-testid={`bank-pending-${r.id}`}>
                            <td className="px-3 py-2 text-muted-foreground text-xs">{r.created_at?.slice(0, 10)}</td>
                            <td className="px-3 py-2">{r.customer_name || "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs">{r.contract_number || "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.bank_reference || "—"}</td>
                            <td className="px-3 py-2 tabular-nums font-medium text-yellow-700 dark:text-yellow-300">
                              {parseFloat(r.amount).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-yellow-50/30 dark:bg-yellow-950/20 font-bold border-t-2">
                        <tr>
                          <td colSpan={4} className="px-3 py-2">إجمالي البنود قيد التسوية</td>
                          <td className="px-3 py-2 tabular-nums text-yellow-700 dark:text-yellow-300">
                            {totalPending.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                          </td>
                        </tr>
                      </tfoot>
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
