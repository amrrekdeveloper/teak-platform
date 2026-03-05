import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PurchaseOrder, Supplier, InventoryItem } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Plus, ShoppingCart, Clock, CheckCircle2, XCircle, Truck,
  PackageCheck, Trash2
} from "lucide-react";

interface POItem {
  materialNameAr: string;
  materialNameEn: string;
  quantity: string;
  unitPrice: string;
  total: number;
}

const statusConfig: Record<string, { ar: string; en: string; color: string; icon: any }> = {
  draft: { ar: "مسودة", en: "Draft", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", icon: Clock },
  pending_approval: { ar: "بانتظار الموافقة", en: "Pending Approval", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300", icon: Clock },
  approved: { ar: "معتمد", en: "Approved", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", icon: CheckCircle2 },
  ordered: { ar: "تم الطلب", en: "Ordered", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300", icon: ShoppingCart },
  partially_received: { ar: "استلام جزئي", en: "Partially Received", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300", icon: PackageCheck },
  received: { ar: "مستلم", en: "Received", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", icon: PackageCheck },
  cancelled: { ar: "ملغي", en: "Cancelled", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", icon: XCircle },
};

export default function PurchasesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [poItems, setPoItems] = useState<POItem[]>([]);
  const [newItemRow, setNewItemRow] = useState<POItem>({ materialNameAr: "", materialNameEn: "", quantity: "", unitPrice: "", total: 0 });

  const { data: purchaseOrders = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders"],
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/purchase-orders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setCreateOpen(false);
      setSelectedSupplier("");
      setPoItems([]);
      toast({ title: t("تم إنشاء أمر الشراء بنجاح", "Purchase order created") });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/purchase-orders/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setDetailPO(null);
      toast({ title: t("تم تحديث أمر الشراء", "Purchase order updated") });
    },
  });

  const filtered = filter === "all" ? purchaseOrders : purchaseOrders.filter(po => po.status === filter);

  const addItem = () => {
    if (!newItemRow.materialNameAr || !newItemRow.quantity || !newItemRow.unitPrice) return;
    const total = parseFloat(newItemRow.quantity) * parseFloat(newItemRow.unitPrice);
    setPoItems([...poItems, { ...newItemRow, total }]);
    setNewItemRow({ materialNameAr: "", materialNameEn: "", quantity: "", unitPrice: "", total: 0 });
  };

  const removeItem = (idx: number) => {
    setPoItems(poItems.filter((_, i) => i !== idx));
  };

  const poTotal = poItems.reduce((sum, item) => sum + item.total, 0);

  const getSupplierName = (supplierId: number) => {
    return suppliers.find(s => s.id === supplierId)?.name || `#${supplierId}`;
  };

  const selectInventoryItem = (itemId: string) => {
    const item = inventoryItems.find(i => i.id === parseInt(itemId));
    if (item) {
      setNewItemRow({
        ...newItemRow,
        materialNameAr: item.materialNameAr,
        materialNameEn: item.materialNameEn,
        unitPrice: item.costPerUnit?.toString() || "",
      });
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-purchases-title">{t("أوامر الشراء", "Purchase Orders")}</h1>
          <p className="text-muted-foreground text-sm">{t("إدارة المشتريات وأوامر التوريد", "Manage procurement and supply orders")}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-po"><Plus className="w-4 h-4 me-2" />{t("أمر شراء جديد", "New Purchase Order")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("إنشاء أمر شراء", "Create Purchase Order")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>{t("المورد", "Supplier")} *</Label>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger data-testid="select-po-supplier"><SelectValue placeholder={t("اختر المورد", "Select supplier")} /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-lg p-3 space-y-3">
                <Label className="text-sm font-semibold">{t("إضافة مادة", "Add Item")}</Label>
                <div className="space-y-2">
                  {inventoryItems.length > 0 && (
                    <Select onValueChange={selectInventoryItem}>
                      <SelectTrigger data-testid="select-inventory-item">
                        <SelectValue placeholder={t("اختر من المخزون (اختياري)", "Select from inventory (optional)")} />
                      </SelectTrigger>
                      <SelectContent>
                        {inventoryItems.map(item => (
                          <SelectItem key={item.id} value={item.id.toString()}>
                            {t(item.materialNameAr, item.materialNameEn)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="grid grid-cols-4 gap-2">
                    <Input placeholder={t("الاسم بالعربي", "Name AR")} value={newItemRow.materialNameAr} onChange={e => setNewItemRow({ ...newItemRow, materialNameAr: e.target.value })} data-testid="input-po-item-name-ar" />
                    <Input placeholder={t("الاسم بالإنجليزي", "Name EN")} value={newItemRow.materialNameEn} onChange={e => setNewItemRow({ ...newItemRow, materialNameEn: e.target.value })} data-testid="input-po-item-name-en" />
                    <Input type="number" placeholder={t("الكمية", "Qty")} value={newItemRow.quantity} onChange={e => setNewItemRow({ ...newItemRow, quantity: e.target.value })} data-testid="input-po-item-qty" />
                    <Input type="number" placeholder={t("السعر", "Price")} value={newItemRow.unitPrice} onChange={e => setNewItemRow({ ...newItemRow, unitPrice: e.target.value })} data-testid="input-po-item-price" />
                  </div>
                  <Button size="sm" variant="outline" onClick={addItem} disabled={!newItemRow.materialNameAr || !newItemRow.quantity || !newItemRow.unitPrice} data-testid="button-add-po-item">
                    <Plus className="w-3.5 h-3.5 me-1" />{t("إضافة", "Add")}
                  </Button>
                </div>
              </div>

              {poItems.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-start p-2">{t("المادة", "Material")}</th>
                        <th className="text-center p-2">{t("الكمية", "Qty")}</th>
                        <th className="text-center p-2">{t("السعر", "Price")}</th>
                        <th className="text-center p-2">{t("المجموع", "Total")}</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {poItems.map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">{t(item.materialNameAr, item.materialNameEn)}</td>
                          <td className="text-center p-2">{item.quantity}</td>
                          <td className="text-center p-2">{item.unitPrice}</td>
                          <td className="text-center p-2 font-bold">{item.total.toLocaleString()}</td>
                          <td className="p-2">
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => removeItem(idx)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-muted/50">
                      <tr>
                        <td colSpan={3} className="p-2 font-bold text-end">{t("الإجمالي", "Total")}</td>
                        <td className="text-center p-2 font-bold text-primary" data-testid="text-po-total">{poTotal.toLocaleString()} {t("ر.س", "SAR")}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => createMutation.mutate({
                  supplierId: parseInt(selectedSupplier),
                  items: poItems,
                  totalAmount: poTotal.toString(),
                  status: "draft",
                })}
                disabled={!selectedSupplier || poItems.length === 0 || createMutation.isPending}
                data-testid="button-create-po"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إنشاء أمر الشراء", "Create Purchase Order")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { key: "all", ar: "الكل", en: "All" },
          { key: "draft", ar: "مسودة", en: "Draft" },
          { key: "pending_approval", ar: "بانتظار الموافقة", en: "Pending" },
          { key: "approved", ar: "معتمد", en: "Approved" },
          { key: "ordered", ar: "تم الطلب", en: "Ordered" },
          { key: "received", ar: "مستلم", en: "Received" },
        ].map(tab => (
          <Button
            key={tab.key}
            size="sm"
            variant={filter === tab.key ? "default" : "outline"}
            onClick={() => setFilter(tab.key)}
            data-testid={`button-filter-${tab.key}`}
          >
            {t(tab.ar, tab.en)}
            {tab.key !== "all" && (
              <Badge variant="secondary" className="ms-1.5 text-[10px] h-4 px-1">
                {purchaseOrders.filter(po => po.status === tab.key).length}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("لا توجد أوامر شراء", "No purchase orders found")}</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(po => {
            const status = statusConfig[po.status] || statusConfig.draft;
            const StatusIcon = status.icon;
            const items = Array.isArray(po.items) ? po.items as POItem[] : [];

            return (
              <Card key={po.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setDetailPO(po)} data-testid={`card-po-${po.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <ShoppingCart className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold" data-testid={`text-po-number-${po.id}`}>
                          {t("أمر شراء", "PO")} #{po.orderNumber}
                        </h3>
                        <p className="text-sm text-muted-foreground">{getSupplierName(po.supplierId)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-end">
                        <p className="font-bold text-primary" data-testid={`text-po-amount-${po.id}`}>
                          {parseFloat(po.totalAmount?.toString() || "0").toLocaleString()} {t("ر.س", "SAR")}
                        </p>
                        <p className="text-xs text-muted-foreground">{items.length} {t("مادة", "items")}</p>
                      </div>
                      <Badge className={status.color}>
                        <StatusIcon className="w-3 h-3 me-1" />
                        {t(status.ar, status.en)}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!detailPO} onOpenChange={(open) => { if (!open) setDetailPO(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("تفاصيل أمر الشراء", "Purchase Order Details")} #{detailPO?.orderNumber}</DialogTitle>
          </DialogHeader>
          {detailPO && (() => {
            const status = statusConfig[detailPO.status] || statusConfig.draft;
            const items = Array.isArray(detailPO.items) ? detailPO.items as POItem[] : [];
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("المورد", "Supplier")}:</span>
                  <span className="font-semibold">{getSupplierName(detailPO.supplierId)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("الحالة", "Status")}:</span>
                  <Badge className={status.color}>{t(status.ar, status.en)}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("الإجمالي", "Total")}:</span>
                  <span className="font-bold text-primary">{parseFloat(detailPO.totalAmount?.toString() || "0").toLocaleString()} {t("ر.س", "SAR")}</span>
                </div>

                {items.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-start p-2">{t("المادة", "Material")}</th>
                          <th className="text-center p-2">{t("الكمية", "Qty")}</th>
                          <th className="text-center p-2">{t("السعر", "Price")}</th>
                          <th className="text-center p-2">{t("المجموع", "Total")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2">{t(item.materialNameAr, item.materialNameEn)}</td>
                            <td className="text-center p-2">{item.quantity}</td>
                            <td className="text-center p-2">{item.unitPrice}</td>
                            <td className="text-center p-2 font-bold">{item.total?.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex gap-2">
                  {detailPO.status === "draft" && (
                    <Button className="flex-1" onClick={() => updateMutation.mutate({ id: detailPO.id, data: { status: "pending_approval" } })} disabled={updateMutation.isPending} data-testid="button-submit-for-approval">
                      {t("إرسال للموافقة", "Submit for Approval")}
                    </Button>
                  )}
                  {detailPO.status === "pending_approval" && (
                    <>
                      <Button className="flex-1" onClick={() => updateMutation.mutate({ id: detailPO.id, data: { status: "approved" } })} disabled={updateMutation.isPending} data-testid="button-approve-po">
                        <CheckCircle2 className="w-4 h-4 me-1" />{t("اعتماد", "Approve")}
                      </Button>
                      <Button variant="destructive" className="flex-1" onClick={() => updateMutation.mutate({ id: detailPO.id, data: { status: "cancelled" } })} disabled={updateMutation.isPending} data-testid="button-reject-po">
                        <XCircle className="w-4 h-4 me-1" />{t("رفض", "Reject")}
                      </Button>
                    </>
                  )}
                  {detailPO.status === "approved" && (
                    <Button className="flex-1" onClick={() => updateMutation.mutate({ id: detailPO.id, data: { status: "ordered" } })} disabled={updateMutation.isPending} data-testid="button-mark-ordered">
                      <Truck className="w-4 h-4 me-1" />{t("تم الطلب", "Mark as Ordered")}
                    </Button>
                  )}
                  {detailPO.status === "ordered" && (
                    <Button className="flex-1" onClick={() => updateMutation.mutate({ id: detailPO.id, data: { status: "received" } })} disabled={updateMutation.isPending} data-testid="button-mark-received">
                      <PackageCheck className="w-4 h-4 me-1" />{t("تم الاستلام", "Mark as Received")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
