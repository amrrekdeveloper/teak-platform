import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { FinanceLayout } from "@/components/finance-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Printer, CheckCircle2, AlertCircle } from "lucide-react";
import { format, startOfMonth } from "date-fns";

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

  const closingBookBalance = data?.closingBookBalance || 0;
  const totalPending = data?.totalPending || 0;
  const bankBalanceNum = parseFloat(bankBalance || "0");
  // Adjusted bank balance = bank statement + in-transit items
  const adjustedBankBalance = bankBalanceNum + totalPending;
  const difference = adjustedBankBalance - closingBookBalance;
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
            <p className="text-sm text-muted-foreground">
              {t("مقارنة رصيد حساب البنك (1112) برصيد كشف الحساب البنكي", "Compare GL bank account (1112) balance with bank statement balance")}
            </p>
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
            {/* Summary Cards */}
            <div className="grid md:grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{t("رصيد الدفتر (حساب البنك 1112)", "Book Balance (GL account 1112)")}</p>
                  <p className="text-2xl font-bold tabular-nums mt-1">
                    {closingBookBalance.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                  </p>
                  {data.openingBalance !== 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      رصيد افتتاحي: {parseFloat(data.openingBalance).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                    </p>
                  )}
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
                  {totalPending > 0 && (
                    <p className="text-xs text-yellow-600 mt-1">
                      + قيد التسوية: {totalPending.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                    </p>
                  )}
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

            {/* GL Bank Account Movements */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {t("حركات حساب البنك (دفتر الأستاذ 1112)", "GL Bank Account Movements (1112)")}
                  <span className="text-muted-foreground font-normal">({applied.from} → {applied.to})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(data.glLines || []).length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">لا توجد حركات على حساب البنك في هذه الفترة</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs">
                        <tr>
                          <th className="text-right px-3 py-2">التاريخ</th>
                          <th className="text-right px-3 py-2">رقم القيد</th>
                          <th className="text-right px-3 py-2">البيان</th>
                          <th className="text-right px-3 py-2 w-28">مدين</th>
                          <th className="text-right px-3 py-2 w-28">دائن</th>
                          <th className="text-right px-3 py-2 w-28">الرصيد</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.openingBalance !== undefined && (
                          <tr className="bg-yellow-50/50 dark:bg-yellow-950/20 italic">
                            <td colSpan={5} className="px-3 py-2 text-muted-foreground text-xs">الرصيد الافتتاحي</td>
                            <td className="px-3 py-2 tabular-nums font-semibold">
                              {parseFloat(data.openingBalance).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}
                        {(data.glLines || []).map((r: any, i: number) => (
                          <tr key={i} className="hover:bg-accent/30" data-testid={`bank-gl-${r.id}`}>
                            <td className="px-3 py-2 text-muted-foreground text-xs">{r.entry_date}</td>
                            <td className="px-3 py-2 font-mono text-xs">#{r.entry_number}</td>
                            <td className="px-3 py-2">{r.entry_description}</td>
                            <td className="px-3 py-2 tabular-nums text-blue-700 dark:text-blue-400">
                              {parseFloat(r.debit) > 0 ? parseFloat(r.debit).toLocaleString("ar-SA", { minimumFractionDigits: 2 }) : ""}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-red-600 dark:text-red-400">
                              {parseFloat(r.credit) > 0 ? parseFloat(r.credit).toLocaleString("ar-SA", { minimumFractionDigits: 2 }) : ""}
                            </td>
                            <td className={`px-3 py-2 tabular-nums font-medium ${r.runningBalance >= 0 ? "text-foreground" : "text-red-600"}`}>
                              {Math.abs(r.runningBalance).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                              {r.runningBalance < 0 && " (م)"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/30 font-bold border-t-2">
                        <tr>
                          <td colSpan={3} className="px-3 py-2">رصيد الإغلاق</td>
                          <td className="px-3 py-2 tabular-nums text-blue-700 dark:text-blue-400">
                            {(data.periodDebits || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-red-600 dark:text-red-400">
                            {(data.periodCredits || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {closingBookBalance.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
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
                    {t("مدفوعات قيد التسوية (لم تُقيَّد في الدفتر بعد)", "In-Transit Payments (not yet journalized)")}
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
