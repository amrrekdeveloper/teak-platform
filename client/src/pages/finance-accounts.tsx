import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { apiRequest } from "@/lib/queryClient";
import { FinanceLayout } from "@/components/finance-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit2, BookOpen, FileText, ChevronLeft, AlertCircle, CheckCircle2, DollarSign } from "lucide-react";
import { format } from "date-fns";

const ACCOUNT_TYPES: Record<string, { labelAr: string; color: string }> = {
  asset:     { labelAr: "أصول",        color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  liability: { labelAr: "خصوم",        color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  equity:    { labelAr: "حقوق الملكية", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  revenue:   { labelAr: "إيرادات",     color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  cost:      { labelAr: "تكلفة مبيعات", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  expense:   { labelAr: "مصروفات",     color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
};

type LineItem = { accountCode: string; accountNameAr: string; debit: string; credit: string; notes: string };

const EMPTY_LINE = (): LineItem => ({ accountCode: "", accountNameAr: "", debit: "", credit: "", notes: "" });

export default function FinanceAccountsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [location] = useLocation();
  const defaultTab = location === "/finance/journal" ? "journal" : location === "/finance/opening-balances" ? "opening-balances" : "accounts";

  const [accountDialog, setAccountDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [form, setForm] = useState({ code: "", nameAr: "", nameEn: "", type: "asset", parentCode: "", notes: "" });

  const [journalDialog, setJournalDialog] = useState(false);
  const [jForm, setJForm] = useState({ date: format(new Date(), "yyyy-MM-dd"), description: "", reference: "" });
  const [lines, setLines] = useState<LineItem[]>([EMPTY_LINE(), EMPTY_LINE()]);

  // Opening balances state
  const [obDate, setObDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [obLines, setObLines] = useState<LineItem[]>([EMPTY_LINE()]);

  const { data: accounts = [] } = useQuery<any[]>({ queryKey: ["/api/accounting/accounts"] });
  const { data: entries = [], isLoading: entriesLoading } = useQuery<any[]>({
    queryKey: ["/api/accounting/journal-entries"],
  });
  const { data: obData = [], isLoading: obLoading } = useQuery<any[]>({
    queryKey: ["/api/accounting/opening-balances"],
  });

  const accountMap = new Map((accounts as any[]).map((a: any) => [a.code, a]));

  const createAccountMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/accounting/accounts", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/accounting/accounts"] }); setAccountDialog(false); toast({ title: "تم إنشاء الحساب" }); },
    onError: (e: any) => toast({ title: e.message || "حدث خطأ", variant: "destructive" }),
  });

  const updateAccountMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/accounting/accounts/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/accounting/accounts"] }); setAccountDialog(false); toast({ title: "تم التحديث" }); },
    onError: (e: any) => toast({ title: e.message || "حدث خطأ", variant: "destructive" }),
  });

  const deleteAccountMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/accounting/accounts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/accounting/accounts"] }); toast({ title: "تم الحذف" }); },
  });

  const createEntryMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/accounting/journal-entries", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/accounting/journal-entries"] });
      setJournalDialog(false);
      setLines([EMPTY_LINE(), EMPTY_LINE()]);
      setJForm({ date: format(new Date(), "yyyy-MM-dd"), description: "", reference: "" });
      toast({ title: "تم ترحيل القيد بنجاح" });
    },
    onError: (e: any) => toast({ title: e.message || "حدث خطأ", variant: "destructive" }),
  });

  const saveObMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/accounting/opening-balances", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/accounting/opening-balances"] });
      qc.invalidateQueries({ queryKey: ["/api/accounting/journal-entries"] });
      toast({ title: "تم حفظ الأرصدة الافتتاحية" });
    },
    onError: (e: any) => toast({ title: e.message || "حدث خطأ", variant: "destructive" }),
  });

  const openNewAccount = () => {
    setEditingAccount(null);
    setForm({ code: "", nameAr: "", nameEn: "", type: "asset", parentCode: "", notes: "" });
    setAccountDialog(true);
  };

  const openEditAccount = (acc: any) => {
    setEditingAccount(acc);
    setForm({ code: acc.code, nameAr: acc.nameAr, nameEn: acc.nameEn, type: acc.type, parentCode: acc.parentCode || "", notes: acc.notes || "" });
    setAccountDialog(true);
  };

  const handleAccountSubmit = () => {
    if (!form.code || !form.nameAr) return toast({ title: "الرمز والاسم مطلوبان", variant: "destructive" });
    if (editingAccount) {
      updateAccountMut.mutate({ id: editingAccount.id, data: form });
    } else {
      createAccountMut.mutate(form);
    }
  };

  const totalDebit = lines.reduce((s, l) => s + parseFloat(l.debit || "0"), 0);
  const totalCredit = lines.reduce((s, l) => s + parseFloat(l.credit || "0"), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const handleSubmitEntry = () => {
    if (!jForm.description || !jForm.date) return toast({ title: "البيانات ناقصة", variant: "destructive" });
    if (!isBalanced) return toast({ title: "القيد غير متوازن", variant: "destructive" });
    const validLines = lines.filter(l => l.accountCode && (parseFloat(l.debit || "0") > 0 || parseFloat(l.credit || "0") > 0));
    createEntryMut.mutate({ ...jForm, lines: validLines });
  };

  const handleSaveOpeningBalances = () => {
    const validLines = obLines.filter(l => l.accountCode && (parseFloat(l.debit || "0") > 0 || parseFloat(l.credit || "0") > 0));
    if (validLines.length === 0) return toast({ title: "يجب إدخال أرصدة للحسابات", variant: "destructive" });
    saveObMut.mutate({ date: obDate, lines: validLines });
  };

  const groupedAccounts = Object.entries(ACCOUNT_TYPES).map(([type, meta]) => ({
    type,
    ...meta,
    items: (accounts as any[]).filter((a: any) => a.type === type),
  }));

  return (
    <FinanceLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{t("المحاسبة", "Accounting")}</h1>
            <p className="text-sm text-muted-foreground">{t("شجرة الحسابات والقيود اليومية", "Chart of Accounts & Journal Entries")}</p>
          </div>
        </div>

        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="accounts" data-testid="tab-accounts">
              <BookOpen className="h-4 w-4 me-1.5" />
              {t("شجرة الحسابات", "Chart of Accounts")}
            </TabsTrigger>
            <TabsTrigger value="journal" data-testid="tab-journal">
              <FileText className="h-4 w-4 me-1.5" />
              {t("القيود اليومية", "Journal Entries")}
            </TabsTrigger>
            <TabsTrigger value="opening-balances" data-testid="tab-opening-balances">
              <DollarSign className="h-4 w-4 me-1.5" />
              {t("الأرصدة الافتتاحية", "Opening Balances")}
            </TabsTrigger>
          </TabsList>

          {/* ── Chart of Accounts Tab ── */}
          <TabsContent value="accounts" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={openNewAccount} data-testid="btn-new-account">
                <Plus className="h-4 w-4 me-1.5" />
                {t("حساب جديد", "New Account")}
              </Button>
            </div>
            {groupedAccounts.map(group => group.items.length > 0 && (
              <Card key={group.type}>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Badge className={group.color}>{group.labelAr}</Badge>
                    <span className="text-muted-foreground text-xs">({group.items.length} حساب)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {group.items.map((acc: any) => (
                      <div key={acc.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/40 transition-colors" data-testid={`account-row-${acc.code}`}>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-muted-foreground w-12">{acc.code}</span>
                          <div>
                            <p className="text-sm font-medium">{acc.nameAr}</p>
                            <p className="text-xs text-muted-foreground">{acc.nameEn}</p>
                          </div>
                          {acc.parentCode && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <ChevronLeft className="h-3 w-3" />{acc.parentCode}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {acc.isSystem && <Badge variant="outline" className="text-[10px] py-0">نظام</Badge>}
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditAccount(acc)} data-testid={`btn-edit-account-${acc.code}`}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          {!acc.isSystem && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteAccountMut.mutate(acc.id)} data-testid={`btn-delete-account-${acc.code}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ── Journal Entries Tab ── */}
          <TabsContent value="journal" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setJournalDialog(true)} data-testid="btn-new-entry">
                <Plus className="h-4 w-4 me-1.5" />
                {t("قيد جديد", "New Entry")}
              </Button>
            </div>
            {entriesLoading ? (
              <p className="text-center text-muted-foreground py-8">{t("جاري التحميل...", "Loading...")}</p>
            ) : (entries as any[]).length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">{t("لا توجد قيود محاسبية بعد", "No journal entries yet")}</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {(entries as any[]).map((entry: any) => (
                  <Card key={entry.id} data-testid={`journal-entry-${entry.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">#{entry.entryNumber}</span>
                          <span className="text-sm font-medium">{entry.description}</span>
                          {entry.reference && <span className="text-xs text-muted-foreground">({entry.reference})</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {entry.referenceType && (
                            <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" data-testid={`badge-auto-${entry.id}`}>
                              تلقائي / Auto
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">{entry.date}</Badge>
                          <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">مرحّل</Badge>
                        </div>
                      </div>
                      <div className="rounded border overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-right px-2 py-1">الحساب</th>
                              <th className="text-right px-2 py-1 w-24">مدين</th>
                              <th className="text-right px-2 py-1 w-24">دائن</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(entry.lines || []).map((l: any, i: number) => (
                              <tr key={i} className="hover:bg-accent/30">
                                <td className="px-2 py-1">
                                  <span className="font-mono text-muted-foreground me-2">{l.accountCode}</span>
                                  {l.accountNameAr}
                                </td>
                                <td className="px-2 py-1 tabular-nums text-blue-700 dark:text-blue-400">
                                  {parseFloat(l.debit) > 0 ? parseFloat(l.debit).toLocaleString("ar-SA", { minimumFractionDigits: 2 }) : ""}
                                </td>
                                <td className="px-2 py-1 tabular-nums text-green-700 dark:text-green-400">
                                  {parseFloat(l.credit) > 0 ? parseFloat(l.credit).toLocaleString("ar-SA", { minimumFractionDigits: 2 }) : ""}
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-muted/30 font-semibold">
                              <td className="px-2 py-1">المجموع</td>
                              <td className="px-2 py-1 tabular-nums">{parseFloat(entry.totalDebit).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
                              <td className="px-2 py-1 tabular-nums">{parseFloat(entry.totalCredit).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          {/* ── Opening Balances Tab ── */}
          <TabsContent value="opening-balances" className="space-y-4">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  {t("الأرصدة الافتتاحية", "Opening Balances")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  {t("أدخل الأرصدة الافتتاحية عند الترحيل من نظام محاسبي سابق. سيتم إنشاء قيد محاسبي خاص بالأرصدة الافتتاحية.", "Enter opening balances when migrating from a previous accounting system. A special opening balance journal entry will be created.")}
                </p>

                <div className="space-y-1 max-w-xs">
                  <Label className="text-xs">{t("تاريخ الأرصدة الافتتاحية", "Opening Balance Date")} *</Label>
                  <Input type="date" value={obDate} onChange={e => setObDate(e.target.value)} data-testid="input-ob-date" />
                </div>

                {/* Existing opening balances (read-only) */}
                {obLoading ? (
                  <p className="text-xs text-muted-foreground">{t("جاري التحميل...", "Loading...")}</p>
                ) : (obData as any[]).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2 text-muted-foreground">{t("الأرصدة المحفوظة حالياً", "Currently saved balances")}</p>
                    <div className="rounded border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-right px-3 py-1.5 w-20">{t("الرمز", "Code")}</th>
                            <th className="text-right px-3 py-1.5">{t("الحساب", "Account")}</th>
                            <th className="text-right px-3 py-1.5 w-28">{t("مدين", "Debit")}</th>
                            <th className="text-right px-3 py-1.5 w-28">{t("دائن", "Credit")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(obData as any[]).map((row: any, i: number) => (
                            <tr key={i} className="hover:bg-accent/30">
                              <td className="px-3 py-1.5 font-mono text-muted-foreground">{row.account_code}</td>
                              <td className="px-3 py-1.5">{row.account_name_ar}</td>
                              <td className="px-3 py-1.5 tabular-nums text-blue-700 dark:text-blue-400">
                                {parseFloat(row.debit) > 0 ? parseFloat(row.debit).toLocaleString("ar-SA", { minimumFractionDigits: 2 }) : ""}
                              </td>
                              <td className="px-3 py-1.5 tabular-nums text-green-700 dark:text-green-400">
                                {parseFloat(row.credit) > 0 ? parseFloat(row.credit).toLocaleString("ar-SA", { minimumFractionDigits: 2 }) : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Entry form */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold">{t("إدخال أرصدة جديدة", "Enter New Balances")}</p>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setObLines(l => [...l, EMPTY_LINE()])} data-testid="btn-ob-add-line">
                      <Plus className="h-3 w-3 me-1" />
                      {t("إضافة سطر", "Add Line")}
                    </Button>
                  </div>
                  <div className="rounded border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs">
                        <tr>
                          <th className="text-right px-2 py-1.5 w-36">{t("الحساب", "Account")}</th>
                          <th className="text-right px-2 py-1.5">{t("اسم الحساب", "Account Name")}</th>
                          <th className="text-right px-2 py-1.5 w-28">{t("مدين", "Debit")}</th>
                          <th className="text-right px-2 py-1.5 w-28">{t("دائن", "Credit")}</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {obLines.map((line, i) => (
                          <tr key={i}>
                            <td className="px-1 py-1">
                              <Select value={line.accountCode || "none"} onValueChange={v => {
                                const acc = accountMap.get(v);
                                setObLines(ls => ls.map((l, j) => j === i ? { ...l, accountCode: v === "none" ? "" : v, accountNameAr: acc?.nameAr || "" } : l));
                              }}>
                                <SelectTrigger className="h-7 text-xs font-mono" data-testid={`select-ob-account-${i}`}>
                                  <SelectValue placeholder={t("اختر", "Select")} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">{t("اختر حساباً", "Select account")}</SelectItem>
                                  {(accounts as any[]).map((a: any) => (
                                    <SelectItem key={a.code} value={a.code}>{a.code} - {a.nameAr}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-1 py-1 text-xs text-muted-foreground">{line.accountNameAr}</td>
                            <td className="px-1 py-1">
                              <Input
                                type="number" min="0" step="0.01"
                                className="h-7 text-xs text-blue-700 dark:text-blue-400"
                                value={line.debit}
                                onChange={e => setObLines(ls => ls.map((l, j) => j === i ? { ...l, debit: e.target.value, credit: e.target.value ? "" : l.credit } : l))}
                                placeholder="0.00"
                                data-testid={`input-ob-debit-${i}`}
                              />
                            </td>
                            <td className="px-1 py-1">
                              <Input
                                type="number" min="0" step="0.01"
                                className="h-7 text-xs text-green-700 dark:text-green-400"
                                value={line.credit}
                                onChange={e => setObLines(ls => ls.map((l, j) => j === i ? { ...l, credit: e.target.value, debit: e.target.value ? "" : l.debit } : l))}
                                placeholder="0.00"
                                data-testid={`input-ob-credit-${i}`}
                              />
                            </td>
                            <td className="px-1 py-1">
                              {obLines.length > 1 && (
                                <button onClick={() => setObLines(ls => ls.filter((_, j) => j !== i))} className="text-destructive hover:text-destructive/80">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between items-center mt-3">
                    <p className="text-xs text-muted-foreground">
                      {t("ملاحظة: حفظ أرصدة جديدة سيلغي الأرصدة المحفوظة مسبقاً.", "Note: saving new balances will replace any previously saved opening balances.")}
                    </p>
                    <Button onClick={handleSaveOpeningBalances} disabled={saveObMut.isPending} data-testid="btn-save-opening-balances">
                      {saveObMut.isPending ? t("جاري الحفظ...", "Saving...") : t("حفظ الأرصدة الافتتاحية", "Save Opening Balances")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Account Dialog */}
      <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingAccount ? t("تعديل حساب", "Edit Account") : t("حساب جديد", "New Account")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("رمز الحساب", "Account Code")} *</Label>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="مثال: 1111" data-testid="input-account-code" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("النوع", "Type")} *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger data-testid="select-account-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACCOUNT_TYPES).map(([v, m]) => (
                      <SelectItem key={v} value={v}>{m.labelAr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("الاسم بالعربية", "Name (Arabic)")} *</Label>
              <Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} placeholder="اسم الحساب بالعربية" data-testid="input-account-name-ar" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("الاسم بالإنجليزية", "Name (English)")}</Label>
              <Input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Account name in English" data-testid="input-account-name-en" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("الحساب الأب", "Parent Account")}</Label>
              <Select value={form.parentCode || "none"} onValueChange={v => setForm(f => ({ ...f, parentCode: v === "none" ? "" : v }))}>
                <SelectTrigger data-testid="select-parent-code"><SelectValue placeholder={t("بدون", "None")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("بدون أب", "No parent")}</SelectItem>
                  {(accounts as any[]).filter((a: any) => a.code !== form.code).map((a: any) => (
                    <SelectItem key={a.code} value={a.code}>{a.code} - {a.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountDialog(false)}>{t("إلغاء", "Cancel")}</Button>
            <Button onClick={handleAccountSubmit} disabled={createAccountMut.isPending || updateAccountMut.isPending} data-testid="btn-save-account">
              {editingAccount ? t("حفظ التعديلات", "Save Changes") : t("إنشاء", "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Journal Entry Dialog */}
      <Dialog open={journalDialog} onOpenChange={setJournalDialog}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t("قيد محاسبي جديد", "New Journal Entry")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("التاريخ", "Date")} *</Label>
                <Input type="date" value={jForm.date} onChange={e => setJForm(f => ({ ...f, date: e.target.value }))} data-testid="input-entry-date" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">{t("البيان", "Description")} *</Label>
                <Input value={jForm.description} onChange={e => setJForm(f => ({ ...f, description: e.target.value }))} placeholder={t("وصف القيد...", "Entry description...")} data-testid="input-entry-description" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("المرجع", "Reference")}</Label>
              <Input value={jForm.reference} onChange={e => setJForm(f => ({ ...f, reference: e.target.value }))} placeholder={t("رقم الفاتورة أو المرجع...", "Invoice # or reference...")} data-testid="input-entry-reference" />
            </div>

            {/* Entry Lines */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold">{t("سطور القيد", "Entry Lines")}</Label>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLines(l => [...l, EMPTY_LINE()])} data-testid="btn-add-line">
                  <Plus className="h-3 w-3 me-1" />
                  {t("سطر", "Line")}
                </Button>
              </div>
              <div className="rounded border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="text-right px-2 py-1.5 w-28">الرمز</th>
                      <th className="text-right px-2 py-1.5">اسم الحساب</th>
                      <th className="text-right px-2 py-1.5 w-28">مدين</th>
                      <th className="text-right px-2 py-1.5 w-28">دائن</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lines.map((line, i) => (
                      <tr key={i}>
                        <td className="px-1 py-1">
                          <Select value={line.accountCode || "none"} onValueChange={v => {
                            const acc = accountMap.get(v);
                            setLines(ls => ls.map((l, j) => j === i ? { ...l, accountCode: v === "none" ? "" : v, accountNameAr: acc?.nameAr || "" } : l));
                          }}>
                            <SelectTrigger className="h-7 text-xs font-mono" data-testid={`select-line-account-${i}`}>
                              <SelectValue placeholder="اختر" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">اختر حساباً</SelectItem>
                              {(accounts as any[]).map((a: any) => (
                                <SelectItem key={a.code} value={a.code}>{a.code} - {a.nameAr}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1 text-xs text-muted-foreground">{line.accountNameAr}</td>
                        <td className="px-1 py-1">
                          <Input
                            type="number" min="0" step="0.01"
                            className="h-7 text-xs text-blue-700 dark:text-blue-400"
                            value={line.debit}
                            onChange={e => setLines(ls => ls.map((l, j) => j === i ? { ...l, debit: e.target.value, credit: e.target.value ? "" : l.credit } : l))}
                            placeholder="0.00"
                            data-testid={`input-line-debit-${i}`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            type="number" min="0" step="0.01"
                            className="h-7 text-xs text-green-700 dark:text-green-400"
                            value={line.credit}
                            onChange={e => setLines(ls => ls.map((l, j) => j === i ? { ...l, credit: e.target.value, debit: e.target.value ? "" : l.debit } : l))}
                            placeholder="0.00"
                            data-testid={`input-line-credit-${i}`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          {lines.length > 2 && (
                            <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="text-destructive hover:text-destructive/80">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30 font-semibold text-sm">
                      <td colSpan={2} className="px-2 py-1.5">المجموع</td>
                      <td className="px-2 py-1.5 text-blue-700 dark:text-blue-400 tabular-nums">{totalDebit.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1.5 text-green-700 dark:text-green-400 tabular-nums">{totalCredit.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${isBalanced ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"}`}>
                {isBalanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {isBalanced
                  ? t("القيد متوازن ✓", "Entry is balanced ✓")
                  : t(`الفرق: ${Math.abs(totalDebit - totalCredit).toFixed(2)} ر.س`, `Difference: ${Math.abs(totalDebit - totalCredit).toFixed(2)} SAR`)}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJournalDialog(false)}>{t("إلغاء", "Cancel")}</Button>
            <Button onClick={handleSubmitEntry} disabled={!isBalanced || createEntryMut.isPending} data-testid="btn-post-entry">
              {createEntryMut.isPending ? t("جاري الترحيل...", "Posting...") : t("ترحيل القيد", "Post Entry")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FinanceLayout>
  );
}
