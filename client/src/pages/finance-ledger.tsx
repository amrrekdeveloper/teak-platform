import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { FinanceLayout } from "@/components/finance-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const { data: lines = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/accounting/ledger", applied.accountCode, applied.from, applied.to],
    queryFn: async () => {
      if (!applied.accountCode) return [];
      const res = await fetch(`/api/accounting/ledger?accountCode=${applied.accountCode}&from=${applied.from}&to=${applied.to}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!applied.accountCode,
  });

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
                <Select value={accountCode || "none"} onValueChange={v => setAccountCode(v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="select-ledger-account">
                    <SelectValue placeholder={t("اختر الحساب", "Select account")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("اختر حساباً", "Select account")}</SelectItem>
                    {(accounts as any[]).map((a: any) => (
                      <SelectItem key={a.code} value={a.code}>{a.code} - {a.nameAr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              ) : (lines as any[]).length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">{t("لا توجد حركات لهذا الحساب في الفترة المحددة", "No movements for this account in the selected period")}</p>
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
                      {(lines as any[]).map((line: any, i: number) => (
                        <tr key={i} className="hover:bg-accent/30">
                          <td className="px-3 py-2 text-muted-foreground">{line.entryDate}</td>
                          <td className="px-3 py-2 font-mono text-xs">#{line.entryNumber}</td>
                          <td className="px-3 py-2">{line.entryDescription}</td>
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
                        <td colSpan={3} className="px-3 py-2">{t("المجموع", "Total")}</td>
                        <td className="px-3 py-2 tabular-nums text-blue-700 dark:text-blue-400">
                          {(lines as any[]).reduce((s: number, l: any) => s + parseFloat(l.debit || 0), 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-green-700 dark:text-green-400">
                          {(lines as any[]).reduce((s: number, l: any) => s + parseFloat(l.credit || 0), 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {(lines as any[]).length > 0 ? parseFloat((lines as any[])[lines.length - 1].runningBalance).toLocaleString("ar-SA", { minimumFractionDigits: 2 }) : "0.00"}
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
