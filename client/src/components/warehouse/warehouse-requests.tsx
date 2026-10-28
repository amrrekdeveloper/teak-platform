import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useWarehouseRequisitions } from "./use-warehouse";
import { warehouseInvalidate, operationKey, warehouseStatus, warehouseUnit } from "./warehouse-utils";
import { WarehouseEmpty } from "./warehouse-ui";
import { toLatinDigits } from "@shared/digits";
import { buyingWriteAccess } from "@shared/account-access";

export function WarehouseRequests() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, isLoading, isError, error, refetch } = useWarehouseRequisitions();
  const suppliersQuery = useQuery<Array<{ id: number; nameAr?: string; nameEn?: string; name?: string; active?: boolean; approvalStatus?: string }>>({ queryKey: ["/api/suppliers"] });
  const suppliers = (suppliersQuery.data ?? []).filter((supplier) => supplier.active === true && supplier.approvalStatus === "approved");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [keys, setKeys] = useState<Record<number, string>>({});
  const [supplierIds, setSupplierIds] = useState<Record<number, string>>({});
  const [unitPrices, setUnitPrices] = useState<Record<number, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<number, { note?: string; supplier?: string; price?: string }>>({});
  const canDecide = !!user && buyingWriteAccess(user);
  const decision = useMutation({
    mutationFn: ({ id, choice }: { id: number; choice: "approved" | "rejected" }) => {
      const key = keys[id] ?? operationKey();
      setKeys((prev) => ({ ...prev, [id]: key }));
      return apiRequest("POST", `/api/warehouse-center/requisitions/${id}/decision`, {
        key, decision: choice, note: (notes[id] ?? "").trim(),
        ...(choice === "approved" ? { supplierId: Number(supplierIds[id]), unitPrice: Number(toLatinDigits(unitPrices[id])) } : {}),
      });
    },
    onSuccess: async (_result, vars) => {
      setKeys((prev) => { const next = { ...prev }; delete next[vars.id]; return next; });
      setFieldErrors((prev) => ({ ...prev, [vars.id]: {} }));
      await warehouseInvalidate();
      toast({ title: t("تم تحديث الطلب", "Request updated") });
    },
    onError: (e: Error) => toast({ title: t("تعذر تحديث الطلب", "Could not update request"), description: e.message, variant: "destructive" }),
  });

  const submitDecision = (id: number, choice: "approved" | "rejected") => {
    const errors: { note?: string; supplier?: string; price?: string } = {};
    if (!notes[id]?.trim()) errors.note = t("اكتب ملاحظة القرار.", "Enter a decision note.");
    if (choice === "approved") {
      if (suppliersQuery.isError) errors.supplier = t("تعذر التحقق من الموردين النشطين المعتمدين.", "Could not verify active approved suppliers.");
      else if (!suppliers.some((supplier) => String(supplier.id) === supplierIds[id])) errors.supplier = t("اختر مورداً نشطاً ومعتمداً.", "Select an active, approved supplier.");
      const price = Number(toLatinDigits(unitPrices[id]));
      if (!unitPrices[id] || !Number.isFinite(price) || price <= 0) errors.price = t("أدخل سعراً موجباً للوحدة.", "Enter a positive unit price.");
    }
    setFieldErrors((prev) => ({ ...prev, [id]: errors }));
    if (Object.keys(errors).length) return;
    decision.mutate({ id, choice });
  };

  if (isLoading) return <div className="h-36 animate-pulse rounded-xl bg-muted" />;
  if (isError) return <div className="rounded-xl border border-destructive/30 p-4"><p className="font-medium">{t("تعذر تحميل الطلبات", "Could not load requests")}</p><p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>{t("إعادة المحاولة", "Retry")}</Button></div>;
  const rows = data?.rows ?? [];
  if (!rows.length) return <WarehouseEmpty title={t("لا توجد طلبات شراء", "No purchase requests")} detail={t("ستظهر طلبات إعادة التوريد هنا.", "Replenishment requests will appear here.")} />;

  return <div className="space-y-3">{rows.map((r) => <article key={r.id} className="rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{r.itemName}</h3><Badge variant={r.status === "pending" ? "secondary" : r.status === "approved" ? "default" : "destructive"}>{warehouseStatus(t, r.status)}</Badge></div>
        <p className="mt-1 text-sm text-muted-foreground">{r.warehouseName || t("غير معيّن", "Unassigned")} · {r.quantity} {warehouseUnit(t, r.unit)} · {r.requestedFor}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("تاريخ الطلب","Requested")}: {new Date(r.createdAt).toLocaleDateString()}</p>
        <p className="mt-2 text-sm">{r.reason}</p>{r.decisionNote && <p className="mt-1 text-xs text-muted-foreground">{r.decisionNote}</p>}
        {r.purchaseOrderId && <p className="mt-2 text-sm font-medium">{t("أمر الشراء","Purchase order")} #{r.purchaseOrderId} · {r.purchaseStatus ? warehouseStatus(t,r.purchaseStatus) : t("الحالة غير متاحة","Status unavailable")}</p>}</div>
      {r.purchaseOrderId && ["owner", "assistant", "purchasing"].includes(user?.role ?? "") && <Button variant="outline" size="sm" onClick={() => { window.location.href = `/dashboard/purchases/${r.purchaseOrderId}`; }}><ExternalLink className="me-2 h-4 w-4" />{t("فتح أمر الشراء", "Open purchase order")}</Button>}
    </div>
    {r.status === "pending" && canDecide && <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
      <div><Input aria-invalid={!!fieldErrors[r.id]?.note} value={notes[r.id] ?? ""} onChange={(e) => { setNotes((prev) => ({ ...prev, [r.id]: e.target.value })); setFieldErrors((prev) => ({ ...prev, [r.id]: { ...prev[r.id], note: undefined } })); }} placeholder={t("ملاحظة القرار *", "Decision note *")} className="min-w-0" />{fieldErrors[r.id]?.note&&<p className="mt-1 text-xs text-destructive">{fieldErrors[r.id].note}</p>}</div>
      <div><Select value={supplierIds[r.id] ?? ""} onValueChange={(v) => { setSupplierIds((prev) => ({ ...prev, [r.id]: v })); setFieldErrors((prev) => ({ ...prev, [r.id]: { ...prev[r.id], supplier: undefined } })); }}><SelectTrigger aria-invalid={!!fieldErrors[r.id]?.supplier}><SelectValue placeholder={t("المورد النشط المعتمد *", "Active approved supplier *")} /></SelectTrigger><SelectContent>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.nameAr || supplier.nameEn || supplier.name || `#${supplier.id}`}</SelectItem>)}</SelectContent></Select>{fieldErrors[r.id]?.supplier&&<p className="mt-1 text-xs text-destructive">{fieldErrors[r.id].supplier}</p>}{suppliersQuery.isError&&<p className="mt-1 text-xs text-destructive">{t("تعذر تحميل الموردين","Could not load suppliers")} <button className="underline" onClick={() => suppliersQuery.refetch()}>{t("إعادة المحاولة","Retry")}</button></p>}{!suppliersQuery.isLoading&&!suppliersQuery.isError&&!suppliers.length&&<p className="mt-1 text-xs text-muted-foreground">{t("لا يوجد مورد نشط معتمد","No active approved supplier available")}</p>}</div>
      <div><Input aria-invalid={!!fieldErrors[r.id]?.price} type="text" inputMode="decimal" value={unitPrices[r.id] ?? ""} onChange={(e) => { setUnitPrices((prev) => ({ ...prev, [r.id]: e.target.value })); setFieldErrors((prev) => ({ ...prev, [r.id]: { ...prev[r.id], price: undefined } })); }} placeholder={t("سعر الوحدة *", "Unit price *")} />{fieldErrors[r.id]?.price&&<p className="mt-1 text-xs text-destructive">{fieldErrors[r.id].price}</p>}</div>
      <div className="flex gap-2"><Button size="sm" disabled={decision.isPending || suppliersQuery.isLoading} onClick={() => submitDecision(r.id, "approved")}><Check className="me-1 h-4 w-4" />{t("اعتماد", "Approve")}</Button>
      <Button size="sm" variant="destructive" disabled={decision.isPending} onClick={() => submitDecision(r.id, "rejected")}><X className="me-1 h-4 w-4" />{t("رفض", "Reject")}</Button></div>
    </div>}
  </article>)}</div>;
}

export function WarehousePurchasingRequests() {
  return <WarehouseRequests />;
}
