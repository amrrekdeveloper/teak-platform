import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
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
import { AccountCombobox } from "@/components/account-combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit2, BookOpen, FileText, ChevronLeft, AlertCircle, CheckCircle2, DollarSign, ExternalLink, Printer, Paperclip, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { exportReportPDF } from "@/lib/finance-export";
import { toLatinDigits } from "@shared/digits";

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

// Normalize Arabic-Indic digits then keep only digits and a single decimal point.
// Using type="text" + this sanitizer avoids type="number" quirks (values silently
// wiped to "" on invalid/localized input, which made fields appear to reset to 0).
const sanitizeAmount = (raw: string): string => {
  const latin = toLatinDigits(raw).replace(/[^0-9.]/g, "");
  const firstDot = latin.indexOf(".");
  return firstDot === -1 ? latin : latin.slice(0, firstDot + 1) + latin.slice(firstDot + 1).replace(/\./g, "");
};

function getSourceDocumentUrl(referenceType: string, referenceId: number | null | undefined): string | null {
  if (!referenceId) return null;
  if (referenceType === "invoice") return `/invoices/${referenceId}`;
  if (referenceType === "payment") return `/payments/${referenceId}`;
  if (referenceType === "purchase_order") return `/purchases/${referenceId}`;
  return null;
}

function getSourceDocumentLabel(referenceType: string): string {
  if (referenceType === "invoice") return "فاتورة / Invoice";
  if (referenceType === "payment") return "دفعة / Payment";
  if (referenceType === "purchase_order") return "أمر شراء / Purchase Order";
  return referenceType;
}

function SourceDocumentBadge({ referenceType, referenceId, reference, entryId }: {
  referenceType: string;
  referenceId?: number | null;
  reference?: string | null;
  entryId: number;
}) {
  const url = getSourceDocumentUrl(referenceType, referenceId);
  const label = getSourceDocumentLabel(referenceType);
  const badgeClass = "text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors";

  if (url) {
    return (
      <Link href={url}>
        <Badge
          variant="secondary"
          className={`${badgeClass} inline-flex items-center gap-1`}
          data-testid={`badge-auto-${entryId}`}
        >
          تلقائي / Auto
          <ExternalLink className="w-2.5 h-2.5" />
        </Badge>
      </Link>
    );
  }

  const tooltipText = reference
    ? `${label} — ${reference}`
    : `${label}${referenceId ? ` #${referenceId}` : ""}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className={`${badgeClass} inline-flex items-center gap-1`}
            data-testid={`badge-auto-${entryId}`}
          >
            تلقائي / Auto
            <ExternalLink className="w-2.5 h-2.5 opacity-50" />
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

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
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewEntryId, setViewEntryId] = useState<number | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);

  // Opening balances state
  const [obDate, setObDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [obLines, setObLines] = useState<LineItem[]>([EMPTY_LINE()]);
  const [printingOB, setPrintingOB] = useState(false);

  const handleExportOpeningBalances = async () => {
    if ((obData as any[]).length === 0) return;
    setPrintingOB(true);
    try {
      const rows = obData as any[];
      const totalDebit = rows.reduce((s, r) => s + parseFloat(r.debit || "0"), 0);
      const totalCredit = rows.reduce((s, r) => s + parseFloat(r.credit || "0"), 0);
      await exportReportPDF(
        t("قسيمة الأرصدة الافتتاحية", "Opening Balances Voucher"),
        obDate,
        [
          {
            head: [[
              t("الرمز", "Code"),
              t("اسم الحساب", "Account Name"),
              t("مدين", "Debit"),
              t("دائن", "Credit"),
            ]],
            body: rows.map((r: any) => [
              r.account_code,
              r.account_name_ar,
              parseFloat(r.debit) > 0 ? parseFloat(r.debit).toFixed(2) : "",
              parseFloat(r.credit) > 0 ? parseFloat(r.credit).toFixed(2) : "",
            ]),
            footRow: [
              t("الإجمالي", "Total"),
              "",
              totalDebit.toFixed(2),
              totalCredit.toFixed(2),
            ],
          },
        ],
        `opening-balances-${obDate}.pdf`,
      );
    } catch (e: any) {
      toast({ title: e.message || t("تعذّر تصدير الأرصدة الافتتاحية", "Failed to export opening balances"), variant: "destructive" });
    } finally {
      setPrintingOB(false);
    }
  };

  const { data: accounts = [] } = useQuery<any[]>({ queryKey: ["/api/accounting/accounts"] });
  const entriesUrl = typeFilter && typeFilter !== "all"
    ? `/api/accounting/journal-entries?typeFilter=${typeFilter}`
    : "/api/accounting/journal-entries";
  const { data: entries = [], isLoading: entriesLoading } = useQuery<any[]>({
    queryKey: ["/api/accounting/journal-entries", typeFilter],
    queryFn: () => apiRequest("GET", entriesUrl).then(r => r.json()),
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

  const resetJournalForm = () => {
    setLines([EMPTY_LINE(), EMPTY_LINE()]);
    setJForm({ date: format(new Date(), "yyyy-MM-dd"), description: "", reference: "" });
    setJAttachments([]);
    setEditingEntryId(null);
  };

  const createEntryMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/accounting/journal-entries", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/accounting/journal-entries"], exact: false });
      setJournalDialog(false);
      resetJournalForm();
      toast({ title: "تم ترحيل القيد بنجاح" });
    },
    onError: (e: any) => toast({ title: e.message || "حدث خطأ", variant: "destructive" }),
  });

  const updateEntryMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/accounting/journal-entries/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/accounting/journal-entries"], exact: false });
      setJournalDialog(false);
      resetJournalForm();
      toast({ title: t("تم تعديل القيد بنجاح", "Entry updated successfully") });
    },
    onError: (e: any) => toast({ title: e.message || "حدث خطأ", variant: "destructive" }),
  });

  const deleteEntryMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/accounting/journal-entries/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/accounting/journal-entries"], exact: false });
      setViewEntryId(null);
      toast({ title: t("تم حذف القيد", "Entry deleted") });
    },
    onError: (e: any) => toast({ title: e.message || "حدث خطأ", variant: "destructive" }),
  });

  const reverseEntryMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/accounting/journal-entries/${id}/reverse`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/accounting/journal-entries"], exact: false });
      setViewEntryId(null);
      toast({ title: t("تم إنشاء القيد العكسي", "Reversing entry created") });
    },
    onError: (e: any) => toast({ title: e.message || "حدث خطأ", variant: "destructive" }),
  });

  const [invDialog, setInvDialog] = useState(false);
  const INV_EMPTY = () => ({
    invoiceKind: "sales",
    terms: "credit",
    date: format(new Date(), "yyyy-MM-dd"),
    reference: "",
    counterpartyName: "",
    revenueExpenseAccountCode: "",
    paymentAccountCode: "",
    subtotal: "",
    vatAmount: "",
  });
  const [invForm, setInvForm] = useState(INV_EMPTY());
  const [invAttachments, setInvAttachments] = useState<{ url: string; name: string }[]>([]);
  const [jAttachments, setJAttachments] = useState<{ url: string; name: string }[]>([]);
  const [uploadingAtt, setUploadingAtt] = useState(false);

  const uploadAttachment = async (file: File): Promise<{ url: string; name: string } | null> => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/accounting/upload-attachment", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      const data = await res.json();
      return { url: data.url, name: data.name };
    } catch (e: any) {
      toast({ title: e.message || t("تعذّر رفع المرفق", "Failed to upload attachment"), variant: "destructive" });
      return null;
    }
  };

  const uploadAttachments = async (
    files: FileList | null,
    setItems: React.Dispatch<React.SetStateAction<{ url: string; name: string }[]>>,
  ) => {
    if (!files || files.length === 0) return;
    setUploadingAtt(true);
    try {
      for (const file of Array.from(files)) {
        const res = await uploadAttachment(file);
        if (res) setItems(prev => [...prev, res]);
      }
    } finally {
      setUploadingAtt(false);
    }
  };

  const AttachmentListField = ({ label, items, setItems, idPrefix }: {
    label: string;
    items: { url: string; name: string }[];
    setItems: React.Dispatch<React.SetStateAction<{ url: string; name: string }[]>>;
    idPrefix: string;
  }) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {items.map((att, i) => (
        <div key={`${att.url}-${i}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
          <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline truncate" data-testid={`link-${idPrefix}-attachment-${i}`}>
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{att.name}</span>
          </a>
          <button type="button" onClick={() => setItems(prev => prev.filter((_, j) => j !== i))} className="text-destructive hover:text-destructive/80 shrink-0" data-testid={`btn-remove-${idPrefix}-attachment-${i}`}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Input
        type="file"
        multiple
        accept="application/pdf,image/*"
        disabled={uploadingAtt}
        onChange={async (e) => {
          const files = e.target.files;
          const input = e.target;
          await uploadAttachments(files, setItems);
          input.value = "";
        }}
        data-testid={`input-${idPrefix}-attachment`}
      />
      {uploadingAtt && <p className="text-xs text-muted-foreground">{t("جاري رفع المرفقات...", "Uploading attachments...")}</p>}
    </div>
  );

  const recordInvoiceMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/accounting/record-invoice", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/accounting/journal-entries"], exact: false });
      setInvDialog(false);
      setInvForm(INV_EMPTY());
      setInvAttachments([]);
      toast({ title: t("تم تسجيل الفاتورة وترحيل القيد", "Invoice recorded and posted") });
    },
    onError: (e: any) => toast({ title: e.message || "حدث خطأ", variant: "destructive" }),
  });

  const [voucherDialog, setVoucherDialog] = useState(false);
  const VOUCHER_EMPTY = () => ({
    voucherKind: "receipt",
    date: format(new Date(), "yyyy-MM-dd"),
    reference: "",
    partyName: "",
    paymentAccountCode: "",
    counterAccountCode: "",
    amount: "",
  });
  const [voucherForm, setVoucherForm] = useState(VOUCHER_EMPTY());
  const [voucherAttachments, setVoucherAttachments] = useState<{ url: string; name: string }[]>([]);

  const recordVoucherMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/accounting/record-voucher", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/accounting/journal-entries"], exact: false });
      setVoucherDialog(false);
      setVoucherForm(VOUCHER_EMPTY());
      setVoucherAttachments([]);
      toast({ title: t("تم تسجيل السند وترحيل القيد", "Voucher recorded and posted") });
    },
    onError: (e: any) => toast({ title: e.message || "حدث خطأ", variant: "destructive" }),
  });

  const handleRecordVoucher = () => {
    const amt = parseFloat(voucherForm.amount || "0");
    if (!voucherForm.date) return toast({ title: t("تاريخ السند مطلوب", "Voucher date required"), variant: "destructive" });
    if (!(amt > 0)) return toast({ title: t("المبلغ يجب أن يكون أكبر من صفر", "Amount must be greater than zero"), variant: "destructive" });
    if (!voucherForm.paymentAccountCode) return toast({ title: t("يجب اختيار حساب الصندوق/البنك", "Select cash/bank account"), variant: "destructive" });
    if (!voucherForm.counterAccountCode) return toast({ title: t("يجب اختيار الحساب المقابل", "Select counter account"), variant: "destructive" });
    if (voucherForm.paymentAccountCode === voucherForm.counterAccountCode) return toast({ title: t("لا يمكن أن يكون الحسابان متطابقين", "Accounts cannot be identical"), variant: "destructive" });
    recordVoucherMut.mutate({
      voucherKind: voucherForm.voucherKind,
      date: voucherForm.date,
      reference: voucherForm.reference,
      partyName: voucherForm.partyName,
      paymentAccountCode: voucherForm.paymentAccountCode,
      counterAccountCode: voucherForm.counterAccountCode,
      amount: amt,
      attachments: voucherAttachments,
    });
  };

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
    if (!jForm.date) return toast({ title: "تاريخ القيد مطلوب", variant: "destructive" });
    if (!jForm.description?.trim()) return toast({ title: "بيان القيد مطلوب", variant: "destructive" });
    // A line is "in use" if it has any data; every in-use line must be complete.
    const inUse = lines.filter(l => l.accountCode || parseFloat(l.debit || "0") > 0 || parseFloat(l.credit || "0") > 0);
    for (let i = 0; i < inUse.length; i++) {
      const l = inUse[i];
      const debit = parseFloat(l.debit || "0");
      const credit = parseFloat(l.credit || "0");
      if (!l.accountCode) return toast({ title: `السطر ${i + 1}: يجب اختيار الحساب`, variant: "destructive" });
      if (debit <= 0 && credit <= 0) return toast({ title: `السطر ${i + 1}: يجب إدخال مبلغ مدين أو دائن`, variant: "destructive" });
      if (debit > 0 && credit > 0) return toast({ title: `السطر ${i + 1}: لا يمكن إدخال مدين ودائن معاً`, variant: "destructive" });
    }
    if (inUse.length < 2) return toast({ title: "يجب إدخال سطرين مكتملين على الأقل", variant: "destructive" });
    if (!isBalanced) return toast({ title: "القيد غير متوازن — مجموع المدين يجب أن يساوي الدائن", variant: "destructive" });
    const payload = { ...jForm, attachments: jAttachments, lines: inUse };
    if (editingEntryId) {
      updateEntryMut.mutate({ id: editingEntryId, data: payload });
    } else {
      createEntryMut.mutate(payload);
    }
  };

  // Re-derive the live entry from the query so the dialog never shows a stale snapshot.
  const viewedEntry = viewEntryId != null ? (entries as any[]).find((e: any) => e.id === viewEntryId) ?? null : null;

  const openEditEntry = (entry: any) => {
    setEditingEntryId(entry.id);
    setJForm({ date: entry.date, description: entry.description || "", reference: entry.reference || "" });
    setLines(
      (entry.lines || []).length > 0
        ? (entry.lines as any[]).map((l: any) => ({
            accountCode: l.accountCode,
            accountNameAr: l.accountNameAr || "",
            debit: parseFloat(l.debit) > 0 ? String(parseFloat(l.debit)) : "",
            credit: parseFloat(l.credit) > 0 ? String(parseFloat(l.credit)) : "",
            notes: l.notes || "",
          }))
        : [EMPTY_LINE(), EMPTY_LINE()],
    );
    setJAttachments(
      Array.isArray(entry.attachments) && entry.attachments.length > 0
        ? entry.attachments
        : entry.attachmentUrl
          ? [{ url: entry.attachmentUrl, name: t("مرفق القيد", "Entry attachment") }]
          : [],
    );
    setViewEntryId(null);
    setJournalDialog(true);
  };

  const invSubtotal = parseFloat(invForm.subtotal || "0");
  const invVat = parseFloat(invForm.vatAmount || "0");
  const invTotal = +(invSubtotal + invVat).toFixed(2);

  const revenueExpenseAccounts = (accounts as any[]).filter((a: any) =>
    invForm.invoiceKind === "sales"
      ? a.type === "revenue"
      : a.type === "expense" || a.type === "cost" || a.code?.startsWith("113"),
  );
  const paymentAccounts = (accounts as any[]).filter((a: any) => a.code?.startsWith("111") && a.code !== "1110");

  const handleRecordInvoice = () => {
    if (!invForm.date) return toast({ title: t("تاريخ الفاتورة مطلوب", "Invoice date required"), variant: "destructive" });
    if (!(invSubtotal > 0)) return toast({ title: t("المبلغ قبل الضريبة يجب أن يكون أكبر من صفر", "Subtotal must be greater than zero"), variant: "destructive" });
    if (!invForm.revenueExpenseAccountCode) return toast({ title: invForm.invoiceKind === "sales" ? t("يجب اختيار حساب الإيراد", "Select revenue account") : t("يجب اختيار حساب المصروف/المخزون", "Select expense/inventory account"), variant: "destructive" });
    if (invForm.terms === "cash" && !invForm.paymentAccountCode) return toast({ title: t("يجب اختيار حساب الدفع (صندوق/بنك)", "Select payment account (cash/bank)"), variant: "destructive" });
    recordInvoiceMut.mutate({
      invoiceKind: invForm.invoiceKind,
      terms: invForm.terms,
      date: invForm.date,
      reference: invForm.reference,
      counterpartyName: invForm.counterpartyName,
      revenueExpenseAccountCode: invForm.revenueExpenseAccountCode,
      paymentAccountCode: invForm.terms === "cash" ? invForm.paymentAccountCode : undefined,
      subtotal: invSubtotal,
      vatAmount: invVat,
      attachments: invAttachments,
    });
  };

  const obValidLines = obLines.filter(l => l.accountCode && (parseFloat(l.debit || "0") > 0 || parseFloat(l.credit || "0") > 0));
  const obDiff = +(
    obValidLines.reduce((s, l) => s + parseFloat(l.debit || "0"), 0) -
    obValidLines.reduce((s, l) => s + parseFloat(l.credit || "0"), 0)
  ).toFixed(2);

  const handleSaveOpeningBalances = () => {
    if (obValidLines.length === 0) return toast({ title: "يجب إدخال أرصدة للحسابات", variant: "destructive" });
    saveObMut.mutate({ date: obDate, lines: obValidLines });
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-8 text-xs w-48" data-testid="select-entry-type-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("الكل", "All Entries")}</SelectItem>
                    <SelectItem value="manual">{t("يدوي فقط", "Manual Only")}</SelectItem>
                    <SelectItem value="auto">{t("تلقائي فقط", "Auto-generated Only")}</SelectItem>
                    <SelectItem value="invoice">{t("فواتير مبيعات", "Invoices")}</SelectItem>
                    <SelectItem value="payment">{t("مدفوعات", "Payments")}</SelectItem>
                    <SelectItem value="purchase_order">{t("أوامر شراء", "Purchase Orders")}</SelectItem>
                  </SelectContent>
                </Select>
                {typeFilter !== "all" && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => setTypeFilter("all")}
                    data-testid="btn-clear-type-filter"
                  >
                    {t("مسح الفلتر", "Clear filter")}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => { setVoucherForm(VOUCHER_EMPTY()); setVoucherAttachments([]); setVoucherDialog(true); }} data-testid="btn-record-voucher">
                  <Plus className="h-4 w-4 me-1.5" />
                  {t("سند قبض / صرف", "Receipt / Payment Voucher")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setInvForm(INV_EMPTY()); setInvAttachments([]); setInvDialog(true); }} data-testid="btn-record-invoice">
                  <Plus className="h-4 w-4 me-1.5" />
                  {t("تسجيل فاتورة", "Record Invoice")}
                </Button>
                <Button size="sm" onClick={() => setJournalDialog(true)} data-testid="btn-new-entry">
                  <Plus className="h-4 w-4 me-1.5" />
                  {t("قيد جديد", "New Entry")}
                </Button>
              </div>
            </div>
            {entriesLoading ? (
              <p className="text-center text-muted-foreground py-8">{t("جاري التحميل...", "Loading...")}</p>
            ) : (entries as any[]).length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">{t("لا توجد قيود محاسبية بعد", "No journal entries yet")}</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {(entries as any[]).map((entry: any) => (
                  <Card
                    key={entry.id}
                    data-testid={`journal-entry-${entry.id}`}
                    className="cursor-pointer transition-colors hover:border-primary/50"
                    onClick={() => setViewEntryId(entry.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">#{entry.entryNumber}</span>
                          <span className="text-sm font-medium">{entry.description}</span>
                          {entry.reference && <span className="text-xs text-muted-foreground">({entry.reference})</span>}
                          {(() => {
                            const atts: { url: string; name: string }[] =
                              Array.isArray(entry.attachments) && entry.attachments.length > 0
                                ? entry.attachments
                                : entry.attachmentUrl
                                  ? [{ url: entry.attachmentUrl, name: t("مرفق", "Attachment") }]
                                  : [];
                            if (atts.length === 0) return null;
                            return (
                              <span className="inline-flex items-center gap-1 text-xs text-primary" data-testid={`link-entry-attachment-${entry.id}`}>
                                <Paperclip className="h-3 w-3" />
                                {atts.length > 1 ? t(`${atts.length} مرفقات`, `${atts.length} attachments`) : t("مرفق", "Attachment")}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2">
                          {entry.referenceType && (
                            <SourceDocumentBadge
                              referenceType={entry.referenceType}
                              referenceId={entry.referenceId}
                              reference={entry.reference}
                              entryId={entry.id}
                            />
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
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted-foreground">{t("الأرصدة المحفوظة حالياً", "Currently saved balances")}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-blue-700 border-blue-300 hover:bg-blue-50 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-950"
                        onClick={handleExportOpeningBalances}
                        disabled={printingOB}
                        data-testid="btn-export-opening-balances"
                      >
                        <Printer className="h-3.5 w-3.5 me-1.5" />
                        {printingOB ? t("جاري التصدير...", "Exporting...") : t("تصدير PDF", "Export PDF")}
                      </Button>
                    </div>
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
                              <AccountCombobox
                                accounts={accounts as any[]}
                                value={line.accountCode}
                                onChange={(code, acc) => setObLines(ls => ls.map((l, j) => j === i ? { ...l, accountCode: code, accountNameAr: acc?.nameAr || "" } : l))}
                                placeholder={t("اختر", "Select")}
                                testId={`select-ob-account-${i}`}
                              />
                            </td>
                            <td className="px-1 py-1 text-xs text-muted-foreground">{line.accountNameAr}</td>
                            <td className="px-1 py-1">
                              <Input
                                type="text" inputMode="decimal" dir="ltr"
                                className="h-7 text-xs text-blue-700 dark:text-blue-400"
                                value={line.debit}
                                onChange={e => { const v = sanitizeAmount(e.target.value); setObLines(ls => ls.map((l, j) => j === i ? { ...l, debit: v, credit: v ? "" : l.credit } : l)); }}
                                placeholder="0.00"
                                data-testid={`input-ob-debit-${i}`}
                              />
                            </td>
                            <td className="px-1 py-1">
                              <Input
                                type="text" inputMode="decimal" dir="ltr"
                                className="h-7 text-xs text-green-700 dark:text-green-400"
                                value={line.credit}
                                onChange={e => { const v = sanitizeAmount(e.target.value); setObLines(ls => ls.map((l, j) => j === i ? { ...l, credit: v, debit: v ? "" : l.debit } : l)); }}
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
                  {Math.abs(obDiff) > 0.009 && (
                    <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-2.5 text-xs text-amber-800 dark:text-amber-200" data-testid="note-ob-autobalance">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        {t(
                          `سيتم موازنة القيد تلقائيًا على حساب الأرصدة الافتتاحية (3999) بمبلغ ${Math.abs(obDiff).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ${obDiff > 0 ? "دائن" : "مدين"}.`,
                          `The entry will be auto-balanced to the Opening Balance Equity account (3999) with ${Math.abs(obDiff).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${obDiff > 0 ? "credit" : "debit"}.`,
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center mt-3">
                    <p className="text-xs text-muted-foreground">
                      {t("ملاحظة: الأرصدة الجديدة تُضاف إلى الأرصدة المحفوظة مسبقاً. إذا كرّرت حساباً موجوداً سيُحدَّث رصيده.", "Note: new balances are merged with previously saved ones. Re-entering an existing account updates its balance.")}
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

      {/* Journal Entry Details Dialog */}
      <Dialog open={!!viewedEntry} onOpenChange={(open) => { if (!open) setViewEntryId(null); }}>
        <DialogContent className="max-w-2xl" dir="rtl">
          {viewedEntry && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t(`تفاصيل القيد #${viewedEntry.entryNumber}`, `Entry #${viewedEntry.entryNumber} Details`)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2" data-testid="dialog-entry-details">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("رقم القيد", "Entry Number")}</p>
                    <p className="font-mono" data-testid="text-entry-number">#{viewedEntry.entryNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("التاريخ", "Date")}</p>
                    <p data-testid="text-entry-date">{viewedEntry.date}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">{t("البيان", "Description")}</p>
                    <p data-testid="text-entry-description">{viewedEntry.description}</p>
                  </div>
                  {viewedEntry.reference && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t("المرجع", "Reference")}</p>
                      <p data-testid="text-entry-reference">{viewedEntry.reference}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">{t("المصدر", "Source")}</p>
                    {viewedEntry.referenceType ? (
                      <SourceDocumentBadge
                        referenceType={viewedEntry.referenceType}
                        referenceId={viewedEntry.referenceId}
                        reference={viewedEntry.reference}
                        entryId={viewedEntry.id}
                      />
                    ) : (
                      <Badge variant="outline" className="text-[10px]" data-testid="badge-manual-entry">{t("يدوي", "Manual")}</Badge>
                    )}
                  </div>
                  {(() => {
                    const atts: { url: string; name: string }[] =
                      Array.isArray(viewedEntry.attachments) && viewedEntry.attachments.length > 0
                        ? viewedEntry.attachments
                        : viewedEntry.attachmentUrl
                          ? [{ url: viewedEntry.attachmentUrl, name: t("فتح المرفق", "Open attachment") }]
                          : [];
                    if (atts.length === 0) return null;
                    return (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">{atts.length > 1 ? t("المرفقات", "Attachments") : t("المرفق", "Attachment")}</p>
                        <div className="flex flex-col gap-1">
                          {atts.map((att, i) => (
                            <a key={`${att.url}-${i}`} href={att.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid={`link-view-entry-attachment-${i}`}>
                              <Paperclip className="h-3.5 w-3.5" />
                              <span className="truncate">{att.name}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-right px-2 py-1">{t("الحساب", "Account")}</th>
                        <th className="text-right px-2 py-1 w-24">{t("مدين", "Debit")}</th>
                        <th className="text-right px-2 py-1 w-24">{t("دائن", "Credit")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(viewedEntry.lines || []).map((l: any, i: number) => (
                        <tr key={i}>
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
                        <td className="px-2 py-1">{t("المجموع", "Total")}</td>
                        <td className="px-2 py-1 tabular-nums">{parseFloat(viewedEntry.totalDebit).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
                        <td className="px-2 py-1 tabular-nums">{parseFloat(viewedEntry.totalCredit).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <DialogFooter className="gap-2">
                {viewedEntry.referenceType ? (
                  <Button
                    variant="outline"
                    onClick={() => reverseEntryMut.mutate(viewedEntry.id)}
                    disabled={reverseEntryMut.isPending}
                    data-testid="btn-reverse-entry"
                  >
                    {reverseEntryMut.isPending ? t("جاري الإنشاء...", "Creating...") : t("قيد عكسي", "Reversing Entry")}
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => openEditEntry(viewedEntry)} data-testid="btn-edit-entry">
                      <Edit2 className="h-3.5 w-3.5 me-1.5" />
                      {t("تعديل", "Edit")}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (window.confirm(t(`هل أنت متأكد من حذف القيد #${viewedEntry.entryNumber}؟ لا يمكن التراجع عن هذا الإجراء.`, `Delete entry #${viewedEntry.entryNumber}? This cannot be undone.`))) {
                          deleteEntryMut.mutate(viewedEntry.id);
                        }
                      }}
                      disabled={deleteEntryMut.isPending}
                      data-testid="btn-delete-entry"
                    >
                      <Trash2 className="h-3.5 w-3.5 me-1.5" />
                      {deleteEntryMut.isPending ? t("جاري الحذف...", "Deleting...") : t("حذف", "Delete")}
                    </Button>
                  </>
                )}
                <Button variant="secondary" onClick={() => setViewEntryId(null)} data-testid="btn-close-entry-details">{t("إغلاق", "Close")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Journal Entry Dialog */}
      <Dialog open={journalDialog} onOpenChange={(open) => { setJournalDialog(open); if (!open) resetJournalForm(); }}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {editingEntryId ? t("تعديل قيد محاسبي", "Edit Journal Entry") : t("قيد محاسبي جديد", "New Journal Entry")}
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
                          <AccountCombobox
                            accounts={accounts as any[]}
                            value={line.accountCode}
                            onChange={(code, acc) => setLines(ls => ls.map((l, j) => j === i ? { ...l, accountCode: code, accountNameAr: acc?.nameAr || "" } : l))}
                            placeholder={t("اختر", "Select")}
                            testId={`select-line-account-${i}`}
                          />
                        </td>
                        <td className="px-1 py-1 text-xs text-muted-foreground">{line.accountNameAr}</td>
                        <td className="px-1 py-1">
                          <Input
                            type="number" min="0" step="0.01"
                            className="h-7 text-xs text-blue-700 dark:text-blue-400"
                            value={line.debit}
                            onChange={e => { const v = toLatinDigits(e.target.value); setLines(ls => ls.map((l, j) => j === i ? { ...l, debit: v, credit: v ? "" : l.credit } : l)); }}
                            placeholder="0.00"
                            data-testid={`input-line-debit-${i}`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            type="number" min="0" step="0.01"
                            className="h-7 text-xs text-green-700 dark:text-green-400"
                            value={line.credit}
                            onChange={e => { const v = toLatinDigits(e.target.value); setLines(ls => ls.map((l, j) => j === i ? { ...l, credit: v, debit: v ? "" : l.debit } : l)); }}
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

            <AttachmentListField
              label={t("مرفقات (صور / PDF — يمكن اختيار أكثر من ملف)", "Attachments (Images / PDF — multiple allowed)")}
              items={jAttachments}
              setItems={setJAttachments}
              idPrefix="journal"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJournalDialog(false)}>{t("إلغاء", "Cancel")}</Button>
            <Button onClick={handleSubmitEntry} disabled={!isBalanced || createEntryMut.isPending || updateEntryMut.isPending || uploadingAtt} data-testid="btn-post-entry">
              {(createEntryMut.isPending || updateEntryMut.isPending)
                ? t("جاري الحفظ...", "Saving...")
                : editingEntryId ? t("حفظ التعديلات", "Save Changes") : t("ترحيل القيد", "Post Entry")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Invoice Dialog */}
      <Dialog open={invDialog} onOpenChange={setInvDialog}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t("تسجيل فاتورة", "Record Invoice")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("نوع الفاتورة", "Invoice Type")} *</Label>
                <Select value={invForm.invoiceKind} onValueChange={v => setInvForm(f => ({ ...f, invoiceKind: v, revenueExpenseAccountCode: "" }))}>
                  <SelectTrigger data-testid="select-invoice-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">{t("مبيعات", "Sales")}</SelectItem>
                    <SelectItem value="purchase">{t("مشتريات", "Purchase")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("طريقة الدفع", "Terms")} *</Label>
                <Select value={invForm.terms} onValueChange={v => setInvForm(f => ({ ...f, terms: v, paymentAccountCode: "" }))}>
                  <SelectTrigger data-testid="select-invoice-terms"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">{t("آجل", "Credit")}</SelectItem>
                    <SelectItem value="cash">{t("نقدي", "Cash")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("التاريخ", "Date")} *</Label>
                <Input type="date" value={invForm.date} onChange={e => setInvForm(f => ({ ...f, date: e.target.value }))} data-testid="input-invoice-date" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("رقم الفاتورة / المرجع", "Invoice # / Reference")}</Label>
                <Input value={invForm.reference} onChange={e => setInvForm(f => ({ ...f, reference: e.target.value }))} placeholder={t("رقم الفاتورة...", "Invoice #...")} data-testid="input-invoice-reference" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{invForm.invoiceKind === "sales" ? t("اسم العميل", "Customer Name") : t("اسم المورد", "Supplier Name")}</Label>
              <Input value={invForm.counterpartyName} onChange={e => setInvForm(f => ({ ...f, counterpartyName: e.target.value }))} placeholder={invForm.invoiceKind === "sales" ? t("اسم العميل...", "Customer name...") : t("اسم المورد...", "Supplier name...")} data-testid="input-invoice-counterparty" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{invForm.invoiceKind === "sales" ? t("حساب الإيراد", "Revenue Account") : t("حساب المصروف / المخزون", "Expense / Inventory Account")} *</Label>
              <AccountCombobox
                accounts={revenueExpenseAccounts}
                value={invForm.revenueExpenseAccountCode}
                onChange={(code) => setInvForm(f => ({ ...f, revenueExpenseAccountCode: code }))}
                placeholder={t("اختر الحساب", "Select account")}
                testId="select-invoice-revenue-expense"
              />
            </div>

            {invForm.terms === "cash" && (
              <div className="space-y-1">
                <Label className="text-xs">{t("حساب الدفع (صندوق / بنك)", "Payment Account (Cash / Bank)")} *</Label>
                <AccountCombobox
                  accounts={paymentAccounts}
                  value={invForm.paymentAccountCode}
                  onChange={(code) => setInvForm(f => ({ ...f, paymentAccountCode: code }))}
                  placeholder={t("اختر حساب الدفع", "Select payment account")}
                  testId="select-invoice-payment"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("المبلغ قبل الضريبة", "Subtotal")} *</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={invForm.subtotal}
                  onChange={e => setInvForm(f => ({ ...f, subtotal: toLatinDigits(e.target.value) }))}
                  placeholder="0.00"
                  data-testid="input-invoice-subtotal"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t("ضريبة القيمة المضافة", "VAT")}</Label>
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline"
                    onClick={() => setInvForm(f => ({ ...f, vatAmount: (parseFloat(f.subtotal || "0") * 0.15).toFixed(2) }))}
                    data-testid="btn-invoice-vat-15"
                  >
                    {t("احسب 15%", "Calc 15%")}
                  </button>
                </div>
                <Input
                  type="number" min="0" step="0.01"
                  value={invForm.vatAmount}
                  onChange={e => setInvForm(f => ({ ...f, vatAmount: toLatinDigits(e.target.value) }))}
                  placeholder="0.00"
                  data-testid="input-invoice-vat"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm font-semibold">
              <span>{t("الإجمالي", "Total")}</span>
              <span className="tabular-nums" data-testid="text-invoice-total">{invTotal.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} {t("ر.س", "SAR")}</span>
            </div>

            <AttachmentListField
              label={t("مرفقات الفاتورة (صور / PDF — يمكن اختيار أكثر من ملف)", "Invoice Attachments (Images / PDF — multiple allowed)")}
              items={invAttachments}
              setItems={setInvAttachments}
              idPrefix="invoice"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvDialog(false)}>{t("إلغاء", "Cancel")}</Button>
            <Button onClick={handleRecordInvoice} disabled={recordInvoiceMut.isPending || uploadingAtt} data-testid="btn-submit-invoice">
              {recordInvoiceMut.isPending ? t("جاري الترحيل...", "Posting...") : t("تسجيل وترحيل", "Record & Post")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt / Payment Voucher Dialog */}
      <Dialog open={voucherDialog} onOpenChange={setVoucherDialog}>
        <DialogContent className="max-w-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              {voucherForm.voucherKind === "receipt" ? t("سند قبض", "Receipt Voucher") : t("سند صرف", "Payment Voucher")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("نوع السند", "Voucher Type")} *</Label>
                <Select value={voucherForm.voucherKind} onValueChange={v => setVoucherForm(f => ({ ...f, voucherKind: v, counterAccountCode: "" }))}>
                  <SelectTrigger data-testid="select-voucher-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receipt">{t("سند قبض (مقبوضات)", "Receipt (money in)")}</SelectItem>
                    <SelectItem value="payment">{t("سند صرف (مدفوعات)", "Payment (money out)")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("التاريخ", "Date")} *</Label>
                <Input type="date" value={voucherForm.date} onChange={e => setVoucherForm(f => ({ ...f, date: e.target.value }))} data-testid="input-voucher-date" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{voucherForm.voucherKind === "receipt" ? t("اسم الدافع", "Payer Name") : t("اسم المستفيد", "Payee Name")}</Label>
                <Input value={voucherForm.partyName} onChange={e => setVoucherForm(f => ({ ...f, partyName: e.target.value }))} placeholder={voucherForm.voucherKind === "receipt" ? t("من...", "From...") : t("إلى...", "To...")} data-testid="input-voucher-party" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("رقم السند / المرجع", "Voucher # / Reference")}</Label>
                <Input value={voucherForm.reference} onChange={e => setVoucherForm(f => ({ ...f, reference: e.target.value }))} placeholder={t("رقم السند...", "Voucher #...")} data-testid="input-voucher-reference" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t("حساب الصندوق / البنك", "Cash / Bank Account")} *</Label>
              <AccountCombobox
                accounts={paymentAccounts}
                value={voucherForm.paymentAccountCode}
                onChange={(code) => setVoucherForm(f => ({ ...f, paymentAccountCode: code }))}
                placeholder={t("اختر حساب الصندوق / البنك", "Select cash / bank account")}
                testId="select-voucher-payment"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{voucherForm.voucherKind === "receipt" ? t("الحساب المقابل (المصدر)", "Counter Account (Source)") : t("الحساب المقابل (الوجهة)", "Counter Account (Destination)")} *</Label>
              <AccountCombobox
                accounts={accounts}
                value={voucherForm.counterAccountCode}
                onChange={(code) => setVoucherForm(f => ({ ...f, counterAccountCode: code }))}
                placeholder={t("اختر الحساب المقابل", "Select counter account")}
                testId="select-voucher-counter"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t("المبلغ", "Amount")} *</Label>
              <Input
                type="number" min="0" step="0.01"
                value={voucherForm.amount}
                onChange={e => setVoucherForm(f => ({ ...f, amount: toLatinDigits(e.target.value) }))}
                placeholder="0.00"
                data-testid="input-voucher-amount"
              />
            </div>

            <AttachmentListField
              label={t("إيصالات (صور / PDF — يمكن اختيار أكثر من ملف)", "Receipts (Images / PDF — multiple allowed)")}
              items={voucherAttachments}
              setItems={setVoucherAttachments}
              idPrefix="voucher"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoucherDialog(false)}>{t("إلغاء", "Cancel")}</Button>
            <Button onClick={handleRecordVoucher} disabled={recordVoucherMut.isPending || uploadingAtt} data-testid="btn-submit-voucher">
              {recordVoucherMut.isPending ? t("جاري الترحيل...", "Posting...") : t("تسجيل وترحيل", "Record & Post")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FinanceLayout>
  );
}
