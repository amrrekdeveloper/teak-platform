import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InventoryItem } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Package, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Search, Pencil } from "lucide-react";

const unitLabels: Record<string, { ar: string; en: string }> = {
  piece: { ar: "قطعة", en: "Piece" },
  meter: { ar: "متر", en: "Meter" },
  sqm: { ar: "م²", en: "sqm" },
  kg: { ar: "كجم", en: "kg" },
  liter: { ar: "لتر", en: "Liter" },
  sheet: { ar: "لوح", en: "Sheet" },
};

export default function InventoryPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [txOpen, setTxOpen] = useState<InventoryItem | null>(null);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);

  const [newItem, setNewItem] = useState({
    materialNameAr: "", materialNameEn: "", sku: "", category: "",
    unit: "piece", quantity: "0", minQuantity: "0", costPerUnit: "0", location: "",
  });

  const [txData, setTxData] = useState({ type: "stock_in", quantity: "", reason: "" });

  const { data: items = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/inventory", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setCreateOpen(false);
      setNewItem({ materialNameAr: "", materialNameEn: "", sku: "", category: "", unit: "piece", quantity: "0", minQuantity: "0", costPerUnit: "0", location: "" });
      toast({ title: t("تمت إضافة المادة بنجاح", "Item added successfully") });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/inventory/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setEditItem(null);
      toast({ title: t("تم تحديث المادة", "Item updated") });
    },
  });

  const txMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/inventory-transactions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setTxOpen(null);
      setTxData({ type: "stock_in", quantity: "", reason: "" });
      toast({ title: t("تم تسجيل الحركة بنجاح", "Transaction recorded") });
    },
  });

  const filtered = items.filter(item =>
    item.materialNameAr.includes(search) || item.materialNameEn.toLowerCase().includes(search.toLowerCase()) ||
    (item.sku && item.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const lowStockCount = items.filter(i => parseFloat(i.quantity?.toString() || "0") <= parseFloat(i.minQuantity?.toString() || "0")).length;
  const totalValue = items.reduce((sum, i) => sum + parseFloat(i.quantity?.toString() || "0") * parseFloat(i.costPerUnit?.toString() || "0"), 0);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-inventory-title">{t("المخزون", "Inventory")}</h1>
          <p className="text-muted-foreground text-sm">{t("إدارة المواد والمخزون", "Manage materials and stock")}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-inventory"><Plus className="w-4 h-4 me-2" />{t("إضافة مادة", "Add Material")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{t("إضافة مادة جديدة", "Add New Material")}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("الاسم بالعربي", "Name (AR)")}</Label>
                <Input value={newItem.materialNameAr} onChange={e => setNewItem({ ...newItem, materialNameAr: e.target.value })} data-testid="input-material-name-ar" />
              </div>
              <div className="space-y-1">
                <Label>{t("الاسم بالإنجليزي", "Name (EN)")}</Label>
                <Input value={newItem.materialNameEn} onChange={e => setNewItem({ ...newItem, materialNameEn: e.target.value })} data-testid="input-material-name-en" />
              </div>
              <div className="space-y-1">
                <Label>{t("رمز SKU", "SKU")}</Label>
                <Input value={newItem.sku} onChange={e => setNewItem({ ...newItem, sku: e.target.value })} data-testid="input-sku" />
              </div>
              <div className="space-y-1">
                <Label>{t("الفئة", "Category")}</Label>
                <Input value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} data-testid="input-category" />
              </div>
              <div className="space-y-1">
                <Label>{t("الوحدة", "Unit")}</Label>
                <Select value={newItem.unit} onValueChange={v => setNewItem({ ...newItem, unit: v })}>
                  <SelectTrigger data-testid="select-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(unitLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{t(v.ar, v.en)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("الكمية", "Quantity")}</Label>
                <Input type="number" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: e.target.value })} data-testid="input-quantity" />
              </div>
              <div className="space-y-1">
                <Label>{t("الحد الأدنى", "Min Quantity")}</Label>
                <Input type="number" value={newItem.minQuantity} onChange={e => setNewItem({ ...newItem, minQuantity: e.target.value })} data-testid="input-min-quantity" />
              </div>
              <div className="space-y-1">
                <Label>{t("التكلفة/وحدة", "Cost/Unit")}</Label>
                <Input type="number" value={newItem.costPerUnit} onChange={e => setNewItem({ ...newItem, costPerUnit: e.target.value })} data-testid="input-cost" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("الموقع", "Location")}</Label>
                <Input value={newItem.location} onChange={e => setNewItem({ ...newItem, location: e.target.value })} data-testid="input-location" />
              </div>
            </div>
            <Button
              className="w-full mt-2"
              onClick={() => createMutation.mutate(newItem)}
              disabled={!newItem.materialNameAr || !newItem.materialNameEn || createMutation.isPending}
              data-testid="button-create-inventory"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إضافة", "Add")}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-items">{items.length}</p>
              <p className="text-xs text-muted-foreground">{t("إجمالي المواد", "Total Materials")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold text-orange-500" data-testid="text-low-stock">{lowStockCount}</p>
              <p className="text-xs text-muted-foreground">{t("مخزون منخفض", "Low Stock")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-value">{totalValue.toLocaleString()} {t("ر.س", "SAR")}</p>
              <p className="text-xs text-muted-foreground">{t("إجمالي القيمة", "Total Value")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="ps-10"
          placeholder={t("بحث بالاسم أو SKU...", "Search by name or SKU...")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="input-search-inventory"
        />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("لا توجد مواد", "No materials found")}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => {
            const qty = parseFloat(item.quantity?.toString() || "0");
            const minQty = parseFloat(item.minQuantity?.toString() || "0");
            const isLow = qty <= minQty && minQty > 0;
            const cost = parseFloat(item.costPerUnit?.toString() || "0");
            const unitLabel = unitLabels[item.unit] || { ar: item.unit, en: item.unit };

            return (
              <Card key={item.id} className={`${isLow ? "border-orange-400 dark:border-orange-600" : ""}`} data-testid={`card-inventory-${item.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{t(item.materialNameAr, item.materialNameEn)}</h3>
                      {item.sku && <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditItem(item)}
                        data-testid={`button-edit-inventory-${item.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      {isLow && <Badge variant="destructive" className="text-[10px]">{t("منخفض", "Low")}</Badge>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>
                      <span className="text-muted-foreground">{t("الكمية", "Qty")}:</span>
                      <span className="font-bold ms-1" data-testid={`text-qty-${item.id}`}>{qty} {t(unitLabel.ar, unitLabel.en)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("الحد الأدنى", "Min")}:</span>
                      <span className="ms-1">{minQty}</span>
                    </div>
                    {cost > 0 && (
                      <div>
                        <span className="text-muted-foreground">{t("التكلفة", "Cost")}:</span>
                        <span className="ms-1">{cost} {t("ر.س", "SAR")}</span>
                      </div>
                    )}
                    {item.location && (
                      <div>
                        <span className="text-muted-foreground">{t("الموقع", "Location")}:</span>
                        <span className="ms-1">{item.location}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 text-green-600" onClick={() => { setTxOpen(item); setTxData({ type: "stock_in", quantity: "", reason: "" }); }} data-testid={`button-stock-in-${item.id}`}>
                      <ArrowDownCircle className="w-3.5 h-3.5 me-1" />{t("إدخال", "Stock In")}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-red-600" onClick={() => { setTxOpen(item); setTxData({ type: "stock_out", quantity: "", reason: "" }); }} data-testid={`button-stock-out-${item.id}`}>
                      <ArrowUpCircle className="w-3.5 h-3.5 me-1" />{t("إخراج", "Stock Out")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!txOpen} onOpenChange={(open) => { if (!open) setTxOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {txData.type === "stock_in" ? t("إدخال مخزون", "Stock In") : t("إخراج مخزون", "Stock Out")}
              {txOpen && ` - ${t(txOpen.materialNameAr, txOpen.materialNameEn)}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("الكمية", "Quantity")}</Label>
              <Input type="number" value={txData.quantity} onChange={e => setTxData({ ...txData, quantity: e.target.value })} data-testid="input-tx-quantity" />
            </div>
            <div className="space-y-1">
              <Label>{t("السبب", "Reason")}</Label>
              <Input value={txData.reason} onChange={e => setTxData({ ...txData, reason: e.target.value })} placeholder={t("مشتريات، إنتاج، إرجاع...", "Purchase, production, return...")} data-testid="input-tx-reason" />
            </div>
            <Button
              className="w-full"
              onClick={() => txOpen && txMutation.mutate({ inventoryId: txOpen.id, type: txData.type, quantity: txData.quantity, reason: txData.reason })}
              disabled={!txData.quantity || parseFloat(txData.quantity) <= 0 || txMutation.isPending}
              data-testid="button-submit-tx"
            >
              {txMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("تأكيد", "Confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) setEditItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("تعديل المادة", "Edit Material")}</DialogTitle></DialogHeader>
          {editItem && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("الاسم بالعربي", "Name (AR)")}</Label>
                <Input value={editItem.materialNameAr} onChange={e => setEditItem({ ...editItem, materialNameAr: e.target.value })} data-testid="input-edit-name-ar" />
              </div>
              <div className="space-y-1">
                <Label>{t("الاسم بالإنجليزي", "Name (EN)")}</Label>
                <Input value={editItem.materialNameEn} onChange={e => setEditItem({ ...editItem, materialNameEn: e.target.value })} data-testid="input-edit-name-en" />
              </div>
              <div className="space-y-1">
                <Label>{t("رمز SKU", "SKU")}</Label>
                <Input value={editItem.sku || ""} onChange={e => setEditItem({ ...editItem, sku: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t("الفئة", "Category")}</Label>
                <Input value={editItem.category || ""} onChange={e => setEditItem({ ...editItem, category: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t("الحد الأدنى", "Min Quantity")}</Label>
                <Input type="number" value={editItem.minQuantity?.toString() || "0"} onChange={e => setEditItem({ ...editItem, minQuantity: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t("التكلفة/وحدة", "Cost/Unit")}</Label>
                <Input type="number" value={editItem.costPerUnit?.toString() || "0"} onChange={e => setEditItem({ ...editItem, costPerUnit: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("الموقع", "Location")}</Label>
                <Input value={editItem.location || ""} onChange={e => setEditItem({ ...editItem, location: e.target.value })} />
              </div>
              <Button
                className="col-span-2"
                onClick={() => updateMutation.mutate({ id: editItem.id, data: { materialNameAr: editItem.materialNameAr, materialNameEn: editItem.materialNameEn, sku: editItem.sku, category: editItem.category, minQuantity: editItem.minQuantity?.toString(), costPerUnit: editItem.costPerUnit?.toString(), location: editItem.location } })}
                disabled={updateMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("حفظ التعديلات", "Save Changes")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
