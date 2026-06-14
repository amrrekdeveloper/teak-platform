import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { FinanceLayout } from "@/components/finance-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountCombobox } from "@/components/account-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookText, Printer } from "lucide-react";
import { format, startOfYear } from "date-fns";

export default function FinanceLedgerPage() {
  const { t } = useLanguage();
  const [accountCode, setAccountCode] = useState("");
  const [from, setFrom] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [applied, setApplied] = useState({ accountCode: "", from, to });

  const { data: accounts = [] } = useQuery<any[]>({ queryKey: ["/api/accounting/accounts"] });
  const { data: ledgerData, isLoading } = useQuery<{ openingBalance: number; lines: any[] }>({
    queryKey: ["/api/accounting/ledger", applied.accountCode, applied.from, applied.to],
    queryFn: async () => {
      if (!applied.accountCode) return { openingBalance: 0, lines: [] };
      const params = new URLSearchParams({ accountCode: applied.accountCode });
      if (applied.from) params.set("from", applied.from);
      if (applied.to) params.set("to", applied.to);
      const res = await fetch(`/api/accounting/ledger?${params}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!applied.accountCode,
  });
  const lines = ledgerData?.lines || [];
  const openingBalance = ledgerData?.openingBalance ?? 0;

  const selectedAccount = (accounts as any[]).find((a: any) => a.code === applied.accountCode);

  return (
    <FinanceLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BookText className="h-5 w-5 text-primary" />
              {t("دفتر الأستاذ العام", "General Ledger")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("عرض حركات الحساب مع الرصيد الجاري", "Account movements with running balance")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden" data-testid="btn-print-ledger">
            <Printer className="h-4 w-4 me-1.5" />
            {t("طباعة", "Print")}
          </Button>
        </div>

        <Card className="print:hidden">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs">{t("الحساب", "Account")} *</Label>
                <AccountCombobox
                  accounts={accounts as any[]}
                  value={accountCode}
                  onChange={(code) => setAccountCode(code)}
                  placeholder={t("اختر الحساب", "Select account")}
                  triggerClassName="h-9 text-sm"
                  testId="select-ledger-account"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("من", "From")}</Label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} data-testid="input-ledger-from" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("إلى", "To")}</Label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} data-testid="input-ledger-to" />
              </div>
            </div>
            <div className="mt-3">
              <Button size="sm" onClick={() => setApplied({ accountCode, from, to })} disabled={!accountCode} data-testid="btn-apply-ledger">
                {t("عرض", "Show")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {applied.accountCode && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {selectedAccount ? `${selectedAccount.code} — ${selectedAccount.nameAr}` : applied.accountCode}
                <span className="text-sm font-normal text-muted-foreground ms-2">({applied.from} → {applied.to})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">{t("جاري التحميل...", "Loading...")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs">
                      <tr>
                        <th className="text-right px-3 py-2">{t("التاريخ", "Date")}</th>
                        <th className="text-right px-3 py-2">{t("رقم القيد", "Entry #")}</th>
                        <th className="text-right px-3 py-2">{t("البيان", "Description")}</th>
                        <th className="text-right px-3 py-2 w-28">{t("مدين", "Debit")}</th>
                        <th className="text-right px-3 py-2 w-28">{t("دائن", "Credit")}</th>
                        <th className="text-right px-3 py-2 w-28">{t("الرصيد", "Balance")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {applied.from && (
                        <tr className="bg-yellow-50/50 dark:bg-yellow-950/20 italic">
                          <td colSpan={5} className="px-3 py-2 text-muted-foreground text-xs">
                            {t(`الرصيد الافتتاحي حتى ${applied.from}`, `Opening balance as of ${applied.from}`)}
                          </td>
                          <td className={`px-3 py-2 tabular-nums font-semibold ${openingBalance < 0 ? "text-red-600" : "text-foreground"}`}>
                            {Math.abs(openingBalance).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                            {openingBalance < 0 && " (د)"}
                          </td>
                        </tr>
                      )}
                      {lines.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                            {t("لا توجد حركات في الفترة المحددة", "No movements in selected period")}
                          </td>
                        </tr>
                      ) : lines.map((line: any, i: number) => (
                        <tr key={i} className="hover:bg-accent/30">
                          <td className="px-3 py-2 text-muted-foreground">{line.entry_date}</td>
                          <td className="px-3 py-2 font-mono text-xs">#{line.entry_number}</td>
                          <td className="px-3 py-2">{line.entry_description}</td>
                          <td className="px-3 py-2 tabular-nums text-blue-700 dark:text-blue-400">
                            {parseFloat(line.debit) > 0 ? parseFloat(line.debit).toLocaleString("ar-SA", { minimumFractionDigits: 2 }) : ""}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-green-700 dark:text-green-400">
                            {parseFloat(line.credit) > 0 ? parseFloat(line.credit).toLocaleString("ar-SA", { minimumFractionDigits: 2 }) : ""}
                          </td>
                          <td className={`px-3 py-2 tabular-nums font-medium ${line.runningBalance >= 0 ? "text-foreground" : "text-red-600"}`}>
                            {Math.abs(line.runningBalance).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                            {line.runningBalance < 0 && " (د)"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 font-semibold text-sm border-t-2">
                      <tr>
                        <td colSpan={3} className="px-3 py-2">{t("مجموع الفترة", "Period Total")}</td>
                        <td className="px-3 py-2 tabular-nums text-blue-700 dark:text-blue-400">
                          {lines.reduce((s: number, l: any) => s + parseFloat(l.debit || 0), 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-green-700 dark:text-green-400">
                          {lines.reduce((s: number, l: any) => s + parseFloat(l.credit || 0), 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {lines.length > 0
                            ? parseFloat(lines[lines.length - 1].runningBalance).toLocaleString("ar-SA", { minimumFractionDigits: 2 })
                            : openingBalance.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </FinanceLayout>
  );
}
