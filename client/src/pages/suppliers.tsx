import { useState } from "react";
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
import { Loader2, Plus, Search, Building2, Phone, Mail, MapPin, Pencil, CheckCircle2, XCircle, Clock } from "lucide-react";

type SupplierFormData = {
  name: string; contactPerson: string; phone: string; email: string;
  address: string; materials: string; taxNumber: string; notes: string;
};

function SupplierForm({ data, onChange, onSubmit, isPending, submitLabel }: {
  data: SupplierFormData; onChange: (d: SupplierFormData) => void;
  onSubmit: () => void; isPending: boolean; submitLabel: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>{t("اسم المورد", "Supplier Name")} *</Label>
          <Input value={data.name} onChange={e => onChange({ ...data, name: e.target.value })} data-testid="input-supplier-name" />
        </div>
        <div className="space-y-1">
          <Label>{t("جهة الاتصال", "Contact Person")}</Label>
          <Input value={data.contactPerson} onChange={e => onChange({ ...data, contactPerson: e.target.value })} data-testid="input-contact-person" />
        </div>
        <div className="space-y-1">
          <Label>{t("الهاتف", "Phone")}</Label>
          <Input type="tel" inputMode="numeric" value={data.phone} onChange={e => onChange({ ...data, phone: e.target.value })} data-testid="input-supplier-phone" />
        </div>
        <div className="space-y-1">
          <Label>{t("البريد", "Email")}</Label>
          <Input value={data.email} onChange={e => onChange({ ...data, email: e.target.value })} data-testid="input-supplier-email" />
        </div>
        <div className="space-y-1">
          <Label>{t("الرقم الضريبي", "Tax Number")}</Label>
          <Input value={data.taxNumber} onChange={e => onChange({ ...data, taxNumber: e.target.value })} data-testid="input-tax-number" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>{t("العنوان", "Address")}</Label>
          <Input value={data.address} onChange={e => onChange({ ...data, address: e.target.value })} data-testid="input-supplier-address" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>{t("المواد المتوفرة", "Available Materials")}</Label>
          <Input value={data.materials} onChange={e => onChange({ ...data, materials: e.target.value })} placeholder={t("خشب، MDF، حديد...", "Wood, MDF, Iron...")} data-testid="input-materials" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>{t("ملاحظات", "Notes")}</Label>
          <Textarea value={data.notes} onChange={e => onChange({ ...data, notes: e.target.value })} data-testid="input-supplier-notes" />
        </div>
      </div>
      <Button className="w-full" onClick={onSubmit} disabled={!data.name || isPending} data-testid="button-submit-supplier">
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : submitLabel}
      </Button>
    </div>
  );
}

export default function SuppliersPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const canApprove = user?.role === "owner" || user?.role === "assistant";
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

  const emptyForm = { name: "", contactPerson: "", phone: "", email: "", address: "", materials: "", taxNumber: "", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

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

  const filtered = suppliers.filter(s =>
    s.name.includes(search) || (s.contactPerson && s.contactPerson.includes(search)) ||
    (s.phone && s.phone.includes(search)) || (s.materials && s.materials.toLowerCase().includes(search.toLowerCase()))
  );

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

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
          <DialogContent className="max-w-lg">
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

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="ps-10" placeholder={t("بحث بالاسم أو الهاتف أو المواد...", "Search by name, phone, or materials...")} value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-suppliers" />
        </div>
        <div className="text-sm text-muted-foreground" data-testid="text-supplier-count">{suppliers.length} {t("مورد", "suppliers")}</div>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("لا يوجد موردون", "No suppliers found")}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(supplier => (
            <Card key={supplier.id} className="hover:shadow-md transition-shadow" data-testid={`card-supplier-${supplier.id}`}>
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
                    onClick={() => {
                      setEditSupplier(supplier);
                    }}
                    data-testid={`button-edit-supplier-${supplier.id}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 mb-3" data-testid={`status-supplier-approval-${supplier.id}`}>
                  {approvalBadge((supplier as any).approvalStatus || "approved")}
                  {canApprove && (supplier as any).approvalStatus !== "approved" && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-green-600 dark:text-green-400 border-green-500" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ id: supplier.id, approvalStatus: "approved" })} data-testid={`button-approve-supplier-${supplier.id}`}>
                        <CheckCircle2 className="w-3.5 h-3.5 me-1" />{t("اعتماد", "Approve")}
                      </Button>
                      {(supplier as any).approvalStatus !== "rejected" && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-red-600 dark:text-red-400 border-red-500" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ id: supplier.id, approvalStatus: "rejected" })} data-testid={`button-reject-supplier-${supplier.id}`}>
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
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

      <Dialog open={!!editSupplier} onOpenChange={(open) => { if (!open) setEditSupplier(null); }}>
        <DialogContent className="max-w-lg">
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
