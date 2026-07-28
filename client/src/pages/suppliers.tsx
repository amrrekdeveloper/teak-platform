import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Supplier } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Plus, Search, Building2, Phone, Mail, MapPin, Pencil, CheckCircle2, XCircle, Clock,
  User, Hash, Package, FileText, LayoutGrid, List, ArrowUpDown, Wallet, Eye,
} from "lucide-react";

type SupplierFormData = {
  name: string; contactPerson: string; phone: string; email: string;
  address: string; materials: string; taxNumber: string; notes: string;
};

function FieldIcon({ icon: Icon }: { icon: React.ElementType }) {
  return <Icon className="absolute top-1/2 -translate-y-1/2 end-3 w-4 h-4 text-muted-foreground pointer-events-none" />;
}

function SupplierForm({ data, onChange, onSubmit, isPending, submitLabel }: {
  data: SupplierFormData; onChange: (d: SupplierFormData) => void;
  onSubmit: () => void; isPending: boolean; submitLabel: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-5">

      {/* القسم الأول: الهوية */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">
          {t("بيانات المورد", "Supplier Info")}
        </p>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t("اسم المورد", "Supplier Name")} <span className="text-destructive">*</span></Label>
          <div className="relative">
            <Input
              value={data.name}
              onChange={e => onChange({ ...data, name: e.target.value })}
              placeholder={t("مثال: مؤسسة الخشب السعودي", "e.g. Saudi Wood Est.")}
              className="pe-9"
              data-testid="input-supplier-name"
            />
            <FieldIcon icon={Building2} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t("جهة الاتصال", "Contact Person")}</Label>
            <div className="relative">
              <Input
                value={data.contactPerson}
                onChange={e => onChange({ ...data, contactPerson: e.target.value })}
                placeholder={t("الاسم الكامل", "Full name")}
                className="pe-9"
                data-testid="input-contact-person"
              />
              <FieldIcon icon={User} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t("الهاتف", "Phone")}</Label>
            <div className="relative" dir="ltr">
              <Input
                type="tel"
                inputMode="numeric"
                value={data.phone}
                onChange={e => onChange({ ...data, phone: e.target.value })}
                placeholder="05xxxxxxxx"
                className="pe-9"
                dir="ltr"
                data-testid="input-supplier-phone"
              />
              <FieldIcon icon={Phone} />
            </div>
          </div>
        </div>
      </div>

      {/* القسم الثاني: التواصل */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">
          {t("بيانات التواصل", "Contact Details")}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t("البريد الإلكتروني", "Email")}</Label>
            <div className="relative" dir="ltr">
              <Input
                type="email"
                value={data.email}
                onChange={e => onChange({ ...data, email: e.target.value })}
                placeholder="example@domain.com"
                className="pe-9"
                dir="ltr"
                data-testid="input-supplier-email"
              />
              <FieldIcon icon={Mail} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t("الرقم الضريبي", "Tax Number")}</Label>
            <div className="relative" dir="ltr">
              <Input
                value={data.taxNumber}
                onChange={e => onChange({ ...data, taxNumber: e.target.value })}
                placeholder="3xxxxxxxxxx3"
                className="pe-9"
                dir="ltr"
                data-testid="input-tax-number"
              />
              <FieldIcon icon={Hash} />
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t("العنوان", "Address")}</Label>
          <div className="relative">
            <Input
              value={data.address}
              onChange={e => onChange({ ...data, address: e.target.value })}
              placeholder={t("المدينة - الحي - الشارع", "City - District - Street")}
              className="pe-9"
              data-testid="input-supplier-address"
            />
            <FieldIcon icon={MapPin} />
          </div>
        </div>
      </div>

      {/* القسم الثالث: التفاصيل */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">
          {t("تفاصيل إضافية", "Additional Details")}
        </p>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t("المواد المتوفرة", "Available Materials")}</Label>
          <div className="relative">
            <Input
              value={data.materials}
              onChange={e => onChange({ ...data, materials: e.target.value })}
              placeholder={t("خشب، MDF، حديد، زجاج...", "Wood, MDF, Iron, Glass...")}
              className="pe-9"
              data-testid="input-materials"
            />
            <FieldIcon icon={Package} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t("ملاحظات", "Notes")}</Label>
          <div className="relative">
            <Textarea
              value={data.notes}
              onChange={e => onChange({ ...data, notes: e.target.value })}
              placeholder={t("أي معلومات إضافية عن المورد...", "Any additional info...")}
              className="resize-none pe-9 min-h-[80px]"
              data-testid="input-supplier-notes"
            />
            <FileText className="absolute top-3 end-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      <Button
        className="w-full h-11 text-base font-semibold"
        onClick={onSubmit}
        disabled={!data.name || isPending}
        data-testid="button-submit-supplier"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}

const fmtSAR = (n: number) => n.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** تبويب الحركات المالية للمورد — دفتر مساعد مبسط: كم صُرف له، كم استحق، وكم المتبقي */
function SupplierFinancials({ supplierId }: { supplierId: number }) {
  const { t } = useLanguage();
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: [`/api/suppliers/${supplierId}/financials`],
  });

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (isError || !data) return <p className="text-center text-sm text-destructive py-8">{t("تعذّر تحميل الحركات المالية", "Failed to load financials")}</p>;

  const movements = (data.movements || []) as any[];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-3 text-center">
          <p className="text-[11px] text-muted-foreground mb-1">{t("استحق له (فواتير/التزامات)", "Owed to supplier")}</p>
          <p className="text-sm font-bold tabular-nums" data-testid="text-supplier-owed">{fmtSAR(data.totalOwed || 0)}</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-[11px] text-muted-foreground mb-1">{t("صُرف له (مدفوعات)", "Paid to supplier")}</p>
          <p className="text-sm font-bold tabular-nums text-green-600 dark:text-green-400" data-testid="text-supplier-paid">{fmtSAR(data.totalPaid || 0)}</p>
        </div>
        <div className="rounded-lg border p-3 text-center bg-muted/40">
          <p className="text-[11px] text-muted-foreground mb-1">{t("الرصيد المتبقي له", "Balance due")}</p>
          <p className={`text-sm font-bold tabular-nums ${(data.balance || 0) > 0 ? "text-destructive" : ""}`} data-testid="text-supplier-balance">{fmtSAR(data.balance || 0)}</p>
        </div>
      </div>

      {movements.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">
          {t("لا توجد حركات مالية مسجلة لهذا المورد بعد — تظهر هنا السندات والقيود التي يُختار فيها المورد بالاسم.", "No financial movements recorded for this supplier yet.")}
        </p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-start text-xs">{t("التاريخ", "Date")}</TableHead>
                <TableHead className="text-start text-xs">{t("البيان", "Description")}</TableHead>
                <TableHead className="text-end text-xs">{t("له", "Credit")}</TableHead>
                <TableHead className="text-end text-xs">{t("صُرف", "Debit")}</TableHead>
                <TableHead className="text-end text-xs">{t("الرصيد", "Balance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m: any) => (
                <TableRow key={m.id} data-testid={`row-supplier-movement-${m.id}`}>
                  <TableCell className="text-xs whitespace-nowrap">{m.entry_date}</TableCell>
                  <TableCell className="text-xs max-w-[220px] truncate" title={m.description}>{m.description}</TableCell>
                  <TableCell className="text-end text-xs tabular-nums">{parseFloat(m.credit) > 0 ? fmtSAR(parseFloat(m.credit)) : "—"}</TableCell>
                  <TableCell className="text-end text-xs tabular-nums">{parseFloat(m.debit) > 0 ? fmtSAR(parseFloat(m.debit)) : "—"}</TableCell>
                  <TableCell className="text-end text-xs tabular-nums font-semibold">{fmtSAR(m.runningBalance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t("ملاحظة: تُحتسب الحركات من السندات والقيود المرتبطة بالمورد منذ تفعيل الربط — القيود القديمة غير المرتبطة لا تظهر هنا.", "Note: movements are computed from entries linked to this supplier.")}
      </p>
    </div>
  );
}

type SortKey = "name" | "status" | "materials";

export default function SuppliersPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const canApprove = user?.role === "owner" || user?.role === "assistant";
  const canSeeFinancials = user?.role === "owner" || user?.role === "assistant" || user?.role === "accountant";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<"table" | "cards">("table");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const emptyForm = { name: "", contactPerson: "", phone: "", email: "", address: "", materials: "", taxNumber: "", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  // الحوار يعرض النسخة الحية من الاستعلام دائماً (لا لقطة قديمة)
  const detailSupplier = detailId != null ? suppliers.find(s => s.id === detailId) ?? null : null;

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/suppliers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      setCreateOpen(false);
      setForm(emptyForm);
      toast({ title: t("تمت إضافة المورد بنجاح", "Supplier added successfully") });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/suppliers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      setEditSupplier(null);
      toast({ title: t("تم تحديث المورد", "Supplier updated") });
    },
  });

  const approvalMutation = useMutation({
    mutationFn: ({ id, approvalStatus }: { id: number; approvalStatus: string }) =>
      apiRequest("PATCH", `/api/suppliers/${id}/approval`, { approvalStatus }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({ title: vars.approvalStatus === "approved" ? t("تم اعتماد المورد", "Supplier approved") : t("تم رفض المورد", "Supplier rejected") });
    },
  });

  const approvalBadge = (status: string) => {
    if (status === "approved") return <Badge variant="outline" className="gap-1 border-green-500 text-green-600 dark:text-green-400"><CheckCircle2 className="w-3 h-3" />{t("معتمد", "Approved")}</Badge>;
    if (status === "rejected") return <Badge variant="outline" className="gap-1 border-red-500 text-red-600 dark:text-red-400"><XCircle className="w-3 h-3" />{t("مرفوض", "Rejected")}</Badge>;
    return <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-400"><Clock className="w-3 h-3" />{t("بانتظار الاعتماد", "Pending")}</Badge>;
  };

  const statusOf = (s: Supplier) => ((s as any).approvalStatus || "approved") as string;
  const STATUS_ORDER: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = suppliers.filter(s =>
      (statusFilter === "all" || statusOf(s) === statusFilter) &&
      (!q ||
        s.name.toLowerCase().includes(q) ||
        (s.contactPerson || "").toLowerCase().includes(q) ||
        (s.phone || "").includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.taxNumber || "").includes(q) ||
        (s.materials || "").toLowerCase().includes(q))
    );
    list = [...list].sort((a, b) => {
      let r = 0;
      if (sortKey === "name") r = a.name.localeCompare(b.name, "ar");
      else if (sortKey === "status") r = (STATUS_ORDER[statusOf(a)] ?? 9) - (STATUS_ORDER[statusOf(b)] ?? 9);
      else if (sortKey === "materials") r = (a.materials || "").localeCompare(b.materials || "", "ar");
      return sortAsc ? r : -r;
    });
    return list;
  }, [suppliers, search, statusFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortHead = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <TableHead className={className}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(k)} data-testid={`sort-suppliers-${k}`}>
        {label}
        <ArrowUpDown className="w-3 h-3 opacity-60" />
      </button>
    </TableHead>
  );

  const counts = useMemo(() => ({
    all: suppliers.length,
    approved: suppliers.filter(s => statusOf(s) === "approved").length,
    pending: suppliers.filter(s => statusOf(s) === "pending").length,
    rejected: suppliers.filter(s => statusOf(s) === "rejected").length,
  }), [suppliers]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const approvalActions = (supplier: Supplier) => canApprove && statusOf(supplier) !== "approved" && (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" className="h-7 px-2 text-green-600 dark:text-green-400 border-green-500" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ id: supplier.id, approvalStatus: "approved" })} data-testid={`button-approve-supplier-${supplier.id}`}>
        <CheckCircle2 className="w-3.5 h-3.5 me-1" />{t("اعتماد", "Approve")}
      </Button>
      {statusOf(supplier) !== "rejected" && (
        <Button size="sm" variant="outline" className="h-7 px-2 text-red-600 dark:text-red-400 border-red-500" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ id: supplier.id, approvalStatus: "rejected" })} data-testid={`button-reject-supplier-${supplier.id}`}>
          <XCircle className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-suppliers-title">{t("الموردون", "Suppliers")}</h1>
          <p className="text-muted-foreground text-sm">{t("إدارة الموردين والمشتريات", "Manage suppliers and procurement")}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-supplier"><Plus className="w-4 h-4 me-2" />{t("إضافة مورد", "Add Supplier")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("إضافة مورد جديد", "Add New Supplier")}</DialogTitle></DialogHeader>
            <SupplierForm
              data={form}
              onChange={setForm}
              onSubmit={() => createMutation.mutate(form)}
              isPending={createMutation.isPending}
              submitLabel={t("إضافة", "Add")}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* شريط البحث والفلاتر */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="ps-10" placeholder={t("بحث بالاسم أو الهاتف أو البريد أو الرقم الضريبي أو المواد...", "Search by name, phone, email, tax no, or materials...")} value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-suppliers" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[190px]" data-testid="select-supplier-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t(`كل الحالات (${counts.all})`, `All (${counts.all})`)}</SelectItem>
            <SelectItem value="approved">{t(`معتمد (${counts.approved})`, `Approved (${counts.approved})`)}</SelectItem>
            <SelectItem value="pending">{t(`بانتظار الاعتماد (${counts.pending})`, `Pending (${counts.pending})`)}</SelectItem>
            <SelectItem value="rejected">{t(`مرفوض (${counts.rejected})`, `Rejected (${counts.rejected})`)}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 rounded-md border p-0.5 self-start sm:self-auto">
          <Button size="icon" variant={view === "table" ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setView("table")} data-testid="button-suppliers-view-table">
            <List className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={view === "cards" ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setView("cards")} data-testid="button-suppliers-view-cards">
            <LayoutGrid className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground" data-testid="text-supplier-count">
        {filtered.length} {t("من", "of")} {suppliers.length} {t("مورد", "suppliers")}
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("لا يوجد موردون مطابقون", "No suppliers found")}</CardContent></Card>
      ) : view === "table" ? (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead label={t("المورد", "Supplier")} k="name" className="text-start" />
                <TableHead className="text-start">{t("الهاتف", "Phone")}</TableHead>
                <TableHead className="text-start hidden md:table-cell">{t("البريد", "Email")}</TableHead>
                <SortHead label={t("المواد", "Materials")} k="materials" className="text-start hidden lg:table-cell" />
                <SortHead label={t("الحالة", "Status")} k="status" className="text-start" />
                <TableHead className="text-end">{t("إجراءات", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(supplier => (
                <TableRow key={supplier.id} className="cursor-pointer" onClick={() => setDetailId(supplier.id)} data-testid={`row-supplier-${supplier.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{supplier.name}</p>
                        {supplier.contactPerson && <p className="text-xs text-muted-foreground truncate">{supplier.contactPerson}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap" dir="ltr">{supplier.phone || "—"}</TableCell>
                  <TableCell className="text-sm hidden md:table-cell max-w-[180px] truncate">{supplier.email || "—"}</TableCell>
                  <TableCell className="text-xs hidden lg:table-cell max-w-[200px] truncate">{supplier.materials || "—"}</TableCell>
                  <TableCell>{approvalBadge(statusOf(supplier))}</TableCell>
                  <TableCell className="text-end" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {approvalActions(supplier)}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetailId(supplier.id)} title={t("عرض التفاصيل", "View details")} data-testid={`button-view-supplier-${supplier.id}`}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditSupplier(supplier)} data-testid={`button-edit-supplier-${supplier.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(supplier => (
            <Card key={supplier.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setDetailId(supplier.id)} data-testid={`card-supplier-${supplier.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">{supplier.name}</h3>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); setEditSupplier(supplier); }}
                    data-testid={`button-edit-supplier-card-${supplier.id}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 mb-3" onClick={e => e.stopPropagation()} data-testid={`status-supplier-approval-${supplier.id}`}>
                  {approvalBadge(statusOf(supplier))}
                  {approvalActions(supplier)}
                </div>
                <div className="space-y-1.5 text-sm">
                  {supplier.contactPerson && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{supplier.contactPerson}</span>
                    </div>
                  )}
                  {supplier.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-3.5 h-3.5" /><span dir="ltr">{supplier.phone}</span>
                    </div>
                  )}
                  {supplier.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="w-3.5 h-3.5" /><span>{supplier.email}</span>
                    </div>
                  )}
                  {supplier.address && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" /><span>{supplier.address}</span>
                    </div>
                  )}
                  {supplier.materials && (
                    <div className="mt-2 p-2 bg-muted rounded text-xs">{supplier.materials}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* حوار التفاصيل: بيانات المورد + الحركات المالية (لأدوار المالية) */}
      <Dialog open={!!detailSupplier} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          {detailSupplier && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  {detailSupplier.name}
                  {approvalBadge(statusOf(detailSupplier))}
                </DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="info">
                <TabsList className="mb-3">
                  <TabsTrigger value="info" data-testid="tab-supplier-info">{t("بيانات المورد", "Details")}</TabsTrigger>
                  {canSeeFinancials && (
                    <TabsTrigger value="financials" data-testid="tab-supplier-financials">
                      <Wallet className="w-3.5 h-3.5 me-1" />
                      {t("الحركات المالية", "Financials")}
                    </TabsTrigger>
                  )}
                </TabsList>
                <TabsContent value="info">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">{t("جهة الاتصال", "Contact")}</p><p>{detailSupplier.contactPerson || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">{t("الهاتف", "Phone")}</p><p dir="ltr">{detailSupplier.phone || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">{t("البريد الإلكتروني", "Email")}</p><p dir="ltr">{detailSupplier.email || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">{t("الرقم الضريبي", "Tax No.")}</p><p dir="ltr">{detailSupplier.taxNumber || "—"}</p></div>
                    <div className="col-span-2"><p className="text-xs text-muted-foreground">{t("العنوان", "Address")}</p><p>{detailSupplier.address || "—"}</p></div>
                    <div className="col-span-2"><p className="text-xs text-muted-foreground">{t("المواد المتوفرة", "Materials")}</p><p>{detailSupplier.materials || "—"}</p></div>
                    {detailSupplier.notes && <div className="col-span-2"><p className="text-xs text-muted-foreground">{t("ملاحظات", "Notes")}</p><p className="whitespace-pre-wrap">{detailSupplier.notes}</p></div>}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => { setEditSupplier(detailSupplier); setDetailId(null); }} data-testid="button-edit-from-detail">
                      <Pencil className="w-3.5 h-3.5 me-1" />{t("تعديل", "Edit")}
                    </Button>
                  </div>
                </TabsContent>
                {canSeeFinancials && (
                  <TabsContent value="financials">
                    <SupplierFinancials supplierId={detailSupplier.id} />
                  </TabsContent>
                )}
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editSupplier} onOpenChange={(open) => { if (!open) setEditSupplier(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("تعديل المورد", "Edit Supplier")}</DialogTitle></DialogHeader>
          {editSupplier && (
            <SupplierForm
              data={{
                name: editSupplier.name,
                contactPerson: editSupplier.contactPerson || "",
                phone: editSupplier.phone || "",
                email: editSupplier.email || "",
                address: editSupplier.address || "",
                materials: editSupplier.materials || "",
                taxNumber: editSupplier.taxNumber || "",
                notes: editSupplier.notes || "",
              }}
              onChange={(d) => setEditSupplier({ ...editSupplier, ...d })}
              onSubmit={() => updateMutation.mutate({
                id: editSupplier.id,
                data: { name: editSupplier.name, contactPerson: editSupplier.contactPerson, phone: editSupplier.phone, email: editSupplier.email, address: editSupplier.address, materials: editSupplier.materials, taxNumber: editSupplier.taxNumber, notes: editSupplier.notes }
              })}
              isPending={updateMutation.isPending}
              submitLabel={t("حفظ التعديلات", "Save Changes")}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
