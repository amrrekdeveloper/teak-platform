import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InventoryItem, Warehouse } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Package, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Search, Pencil, Trash2, AlertCircle, ImageIcon, Warehouse as WarehouseIcon, Settings, QrCode } from "lucide-react";

const STOCK_OUT_REASONS = [
  { value: "production_use", ar: "استخدام في الإنتاج", en: "Production use" },
  { value: "contract_delivery", ar: "تسليم لعقد", en: "Contract delivery" },
  { value: "damaged", ar: "تالف", en: "Damaged" },
  { value: "sample", ar: "عينة", en: "Sample" },
  { value: "adjustment", ar: "تسوية جردية", en: "Inventory adjustment" },
  { value: "other", ar: "أخرى", en: "Other" },
];

const STOCK_IN_REASONS = [
  { value: "purchase", ar: "شراء", en: "Purchase" },
  { value: "customer_return", ar: "مرتجع عميل", en: "Customer return" },
  { value: "production_return", ar: "إرجاع من الإنتاج", en: "Production return" },
  { value: "adjustment", ar: "تسوية جردية", en: "Inventory adjustment" },
  { value: "transfer", ar: "تحويل بين المستودعات", en: "Warehouse transfer" },
  { value: "other", ar: "أخرى", en: "Other" },
];

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
  const { user } = useAuth();
  const canManageWarehouses = user?.role === "owner" || user?.role === "assistant";
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [txOpen, setTxOpen] = useState<InventoryItem | null>(null);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [manageWarehousesOpen, setManageWarehousesOpen] = useState(false);

  const [newItem, setNewItem] = useState({
    materialNameAr: "", materialNameEn: "", sku: "", category: "", color: "", imageUrl: "",
    warehouseId: "", unit: "piece", quantity: "0", minQuantity: "0", costPerUnit: "0", location: "",
  });

  const [txData, setTxData] = useState({ type: "stock_in", quantity: "", reason: "", contractId: "" });
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (file: File): Promise<string | null> => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/inventory/upload-image", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("upload failed");
      const data = await res.json();
      return data.url as string;
    } catch {
      toast({ title: t("فشل رفع الصورة", "Image upload failed"), variant: "destructive" });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const { data: items = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const { data: contracts = [] } = useQuery<{ id: number; contractNumber: string }[]>({
    queryKey: ["/api/contracts"],
  });

  const warehouseName = (id: number | null | undefined) => {
    const w = warehouses.find(x => x.id === id);
    return w ? t(w.nameAr, w.nameEn) : null;
  };

  const printLabel = async (item: InventoryItem) => {
    const code = item.sku?.trim();
    if (!code) {
      toast({ title: t("لا يوجد رمز SKU", "No SKU"), description: t("أضف رمز SKU أولاً لطباعة الباركود", "Add a SKU first to print a barcode"), variant: "destructive" });
      return;
    }
    try {
      const QRCode: any = await import("qrcode");
      const qrDataUrl = await QRCode.toDataURL(code, { margin: 1, width: 300, errorCorrectionLevel: "M" });
      const jsPDFModule = await import("jspdf");
      const jsPDF = jsPDFModule.default || (jsPDFModule as any).jsPDF;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [50, 30] });
      doc.addImage(qrDataUrl, "PNG", 3, 3, 24, 24);
      doc.setFontSize(7);
      const name = (item.materialNameEn || item.materialNameAr || "").slice(0, 26);
      doc.text(name, 29, 9);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(code, 29, 17);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text("Teak Manufacturing", 29, 25);
      doc.autoPrint();
      window.open(doc.output("bloburl") as unknown as string, "_blank");
    } catch {
      toast({ title: t("فشل إنشاء الباركود", "Failed to generate barcode"), variant: "destructive" });
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/inventory", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setCreateOpen(false);
      setNewItem({ materialNameAr: "", materialNameEn: "", sku: "", category: "", color: "", imageUrl: "", warehouseId: "", unit: "piece", quantity: "0", minQuantity: "0", costPerUnit: "0", location: "" });
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
      setTxData({ type: "stock_in", quantity: "", reason: "", contractId: "" });
      toast({ title: t("تم تسجيل الحركة بنجاح", "Transaction recorded") });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/inventory/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setDeleteItem(null);
      toast({ title: t("تم حذف المادة بنجاح", "Item deleted"), variant: "default" });
    },
    onError: () => {
      toast({ title: t("خطأ في الحذف", "Delete failed"), variant: "destructive" });
    },
  });

  const warehouseMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/warehouses/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({ title: t("تم تحديث المستودع", "Warehouse updated") });
    },
    onError: () => {
      toast({ title: t("خطأ في تحديث المستودع", "Update failed"), variant: "destructive" });
    },
  });

  const filtered = items.filter(item => {
    const matchesSearch = item.materialNameAr.includes(search) || item.materialNameEn.toLowerCase().includes(search.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(search.toLowerCase()));
    const matchesWarehouse = warehouseFilter === "all" || item.warehouseId === parseInt(warehouseFilter);
    return matchesSearch && matchesWarehouse;
  });

  const lowStockCount = items.filter(i => parseFloat(i.quantity?.toString() || "0") <= parseFloat(i.minQuantity?.toString() || "0")).length;
  const totalValue = items.reduce((sum, i) => sum + parseFloat(i.quantity?.toString() || "0") * parseFloat(i.costPerUnit?.toString() || "0"), 0);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-inventory-title">{t("المخزون", "Inventory")}</h1>
          <p className="text-muted-foreground text-sm">{t("إدارة المواد والمخزون", "Manage materials and stock")}</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageWarehouses && (
            <Button variant="outline" onClick={() => setManageWarehousesOpen(true)} data-testid="button-manage-warehouses">
              <Settings className="w-4 h-4 me-2" />{t("المستودعات", "Warehouses")}
            </Button>
          )}
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
              <div className="space-y-1">
                <Label>{t("اللون", "Color")}</Label>
                <Input value={newItem.color} onChange={e => setNewItem({ ...newItem, color: e.target.value })} placeholder={t("بني، أبيض، رمادي...", "Brown, white, gray...")} data-testid="input-color" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("المستودع", "Warehouse")}</Label>
                <Select value={newItem.warehouseId} onValueChange={v => setNewItem({ ...newItem, warehouseId: v })}>
                  <SelectTrigger data-testid="select-warehouse"><SelectValue placeholder={t("اختر المستودع", "Select warehouse")} /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id.toString()}>{t(w.nameAr, w.nameEn)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("الموقع (تصنيف اختياري)", "Location (optional)")}</Label>
                <Input value={newItem.location} onChange={e => setNewItem({ ...newItem, location: e.target.value })} data-testid="input-location" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("صورة المادة", "Material Image")}</Label>
                <div className="flex items-center gap-3">
                  {newItem.imageUrl ? (
                    <img src={newItem.imageUrl} alt="" className="w-16 h-16 rounded-md object-cover border" data-testid="img-new-preview" />
                  ) : (
                    <div className="w-16 h-16 rounded-md border border-dashed flex items-center justify-center text-muted-foreground"><ImageIcon className="w-5 h-5" /></div>
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    className="flex-1"
                    disabled={uploading}
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      if (file) { const url = await uploadImage(file); if (url) setNewItem(prev => ({ ...prev, imageUrl: url })); }
                    }}
                    data-testid="input-image-upload"
                  />
                  {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                </div>
              </div>
            </div>
            <Button
              className="w-full mt-2"
              onClick={() => createMutation.mutate({ ...newItem, warehouseId: newItem.warehouseId ? parseInt(newItem.warehouseId) : null })}
              disabled={!newItem.materialNameAr || !newItem.materialNameEn || createMutation.isPending}
              data-testid="button-create-inventory"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إضافة", "Add")}
            </Button>
          </DialogContent>
        </Dialog>
        </div>
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

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="ps-10"
            placeholder={t("بحث بالاسم أو SKU...", "Search by name or SKU...")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-inventory"
          />
        </div>
        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
          <SelectTrigger className="w-full sm:w-56" data-testid="select-warehouse-filter">
            <WarehouseIcon className="w-4 h-4 me-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("كل المستودعات", "All Warehouses")}</SelectItem>
            {warehouses.map(w => (
              <SelectItem key={w.id} value={w.id.toString()}>{t(w.nameAr, w.nameEn)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                    <div className="flex items-start gap-3 min-w-0">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-12 h-12 rounded-md object-cover border flex-shrink-0" data-testid={`img-inventory-${item.id}`} />
                      ) : (
                        <div className="w-12 h-12 rounded-md border border-dashed flex items-center justify-center text-muted-foreground flex-shrink-0"><Package className="w-5 h-5" /></div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{t(item.materialNameAr, item.materialNameEn)}</h3>
                        {item.sku && <p className="text-xs text-muted-foreground font-mono truncate">{item.sku}</p>}
                        {item.color && (
                          <p className="text-xs text-muted-foreground" data-testid={`text-color-${item.id}`}>{t("اللون", "Color")}: {item.color}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => printLabel(item)}
                        title={t("طباعة الباركود", "Print barcode")}
                        data-testid={`button-print-label-${item.id}`}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditItem(item)}
                        data-testid={`button-edit-inventory-${item.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteItem(item)}
                        data-testid={`button-delete-inventory-${item.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
                    {warehouseName(item.warehouseId) && (
                      <div>
                        <span className="text-muted-foreground">{t("المستودع", "Warehouse")}:</span>
                        <span className="ms-1" data-testid={`text-warehouse-${item.id}`}>{warehouseName(item.warehouseId)}</span>
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
                    <Button size="sm" variant="outline" className="flex-1 text-green-600" onClick={() => { setTxOpen(item); setTxData({ type: "stock_in", quantity: "", reason: "", contractId: "" }); }} data-testid={`button-stock-in-${item.id}`}>
                      <ArrowDownCircle className="w-3.5 h-3.5 me-1" />{t("إدخال", "Stock In")}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-red-600" onClick={() => { setTxOpen(item); setTxData({ type: "stock_out", quantity: "", reason: "", contractId: "" }); }} data-testid={`button-stock-out-${item.id}`}>
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
            {txData.type === "stock_out" ? (
              <>
                <div className="space-y-1">
                  <Label>{t("السبب", "Reason")} <span className="text-destructive">*</span></Label>
                  <Select value={txData.reason} onValueChange={v => setTxData({ ...txData, reason: v })}>
                    <SelectTrigger data-testid="select-tx-reason"><SelectValue placeholder={t("اختر السبب", "Select reason")} /></SelectTrigger>
                    <SelectContent>
                      {STOCK_OUT_REASONS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{t(r.ar, r.en)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("ربط بعقد (اختياري)", "Link to contract (optional)")}</Label>
                  <Select value={txData.contractId || "none"} onValueChange={v => setTxData({ ...txData, contractId: v === "none" ? "" : v })}>
                    <SelectTrigger data-testid="select-tx-contract"><SelectValue placeholder={t("بدون عقد", "No contract")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("بدون عقد", "No contract")}</SelectItem>
                      {contracts.map(c => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.contractNumber}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">{t("سيتم تسجيل قيد مصروف تلقائي بقيمة التكلفة.", "An expense journal entry will be auto-posted at cost value.")}</p>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>{t("السبب", "Reason")} <span className="text-destructive">*</span></Label>
                  <Select value={txData.reason} onValueChange={v => setTxData({ ...txData, reason: v, contractId: v === "customer_return" ? txData.contractId : "" })}>
                    <SelectTrigger data-testid="select-tx-reason"><SelectValue placeholder={t("اختر السبب", "Select reason")} /></SelectTrigger>
                    <SelectContent>
                      {STOCK_IN_REASONS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{t(r.ar, r.en)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {txData.reason === "customer_return" && (
                  <div className="space-y-1">
                    <Label>{t("ربط بعقد (للمرتجع)", "Link to contract (return)")}</Label>
                    <Select value={txData.contractId || "none"} onValueChange={v => setTxData({ ...txData, contractId: v === "none" ? "" : v })}>
                      <SelectTrigger data-testid="select-tx-contract"><SelectValue placeholder={t("بدون عقد", "No contract")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("بدون عقد", "No contract")}</SelectItem>
                        {contracts.map(c => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.contractNumber}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {txData.contractId && (
                      <p className="text-xs text-muted-foreground">{t("سيتم خصم قيمة تكلفة الأصناف المُرجعة من الرصيد المتبقي للعقد تلقائياً.", "The cost value of the returned items will be deducted from the contract's remaining balance automatically.")}</p>
                    )}
                  </div>
                )}
              </>
            )}
            <Button
              className="w-full"
              onClick={() => txOpen && txMutation.mutate({ inventoryId: txOpen.id, type: txData.type, quantity: txData.quantity, reason: txData.reason, contractId: txData.contractId || null })}
              disabled={!txData.quantity || parseFloat(txData.quantity) <= 0 || !txData.reason || txMutation.isPending}
              data-testid="button-submit-tx"
            >
              {txMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("تأكيد", "Confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={(open) => { if (!open) setDeleteItem(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              {t("تأكيد الحذف", "Confirm Delete")}
            </DialogTitle>
          </DialogHeader>
          {deleteItem && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                {t(
                  `هل أنت متأكد من حذف "${deleteItem.materialNameAr}"؟ سيتم حذف جميع حركات هذه المادة أيضاً ولا يمكن التراجع.`,
                  `Are you sure you want to delete "${deleteItem.materialNameEn}"? All transactions will also be deleted. This cannot be undone.`
                )}
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDeleteItem(null)} data-testid="button-cancel-delete">
                  {t("إلغاء", "Cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate(deleteItem.id)}
                  disabled={deleteMutation.isPending}
                  data-testid="button-confirm-delete"
                >
                  {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("حذف نهائي", "Delete")}
                </Button>
              </div>
            </div>
          )}
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
              <div className="space-y-1">
                <Label>{t("اللون", "Color")}</Label>
                <Input value={editItem.color || ""} onChange={e => setEditItem({ ...editItem, color: e.target.value })} placeholder={t("بني، أبيض، رمادي...", "Brown, white, gray...")} data-testid="input-edit-color" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("المستودع", "Warehouse")}</Label>
                <Select value={editItem.warehouseId?.toString() || ""} onValueChange={v => setEditItem({ ...editItem, warehouseId: parseInt(v) })}>
                  <SelectTrigger data-testid="select-edit-warehouse"><SelectValue placeholder={t("اختر المستودع", "Select warehouse")} /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id.toString()}>{t(w.nameAr, w.nameEn)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("الموقع (تصنيف اختياري)", "Location (optional)")}</Label>
                <Input value={editItem.location || ""} onChange={e => setEditItem({ ...editItem, location: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("صورة المادة", "Material Image")}</Label>
                <div className="flex items-center gap-3">
                  {editItem.imageUrl ? (
                    <img src={editItem.imageUrl} alt="" className="w-16 h-16 rounded-md object-cover border" data-testid="img-edit-preview" />
                  ) : (
                    <div className="w-16 h-16 rounded-md border border-dashed flex items-center justify-center text-muted-foreground"><ImageIcon className="w-5 h-5" /></div>
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    className="flex-1"
                    disabled={uploading}
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      if (file) { const url = await uploadImage(file); if (url) setEditItem(prev => prev ? { ...prev, imageUrl: url } : prev); }
                    }}
                    data-testid="input-edit-image-upload"
                  />
                  {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                </div>
              </div>
              <Button
                className="col-span-2"
                onClick={() => updateMutation.mutate({ id: editItem.id, data: { materialNameAr: editItem.materialNameAr, materialNameEn: editItem.materialNameEn, sku: editItem.sku, category: editItem.category, color: editItem.color, imageUrl: editItem.imageUrl, warehouseId: editItem.warehouseId ?? null, minQuantity: editItem.minQuantity?.toString(), costPerUnit: editItem.costPerUnit?.toString(), location: editItem.location } })}
                disabled={updateMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("حفظ التعديلات", "Save Changes")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={manageWarehousesOpen} onOpenChange={setManageWarehousesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("إدارة المستودعات", "Manage Warehouses")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("يمكنك تعديل أسماء المستودعات الأربعة.", "You can rename the four warehouses.")}</p>
          <div className="space-y-4 mt-2">
            {warehouses.map(w => (
              <WarehouseRow key={w.id} warehouse={w} onSave={(data) => warehouseMutation.mutate({ id: w.id, data })} saving={warehouseMutation.isPending} t={t} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WarehouseRow({ warehouse, onSave, saving, t }: { warehouse: Warehouse; onSave: (data: { nameAr: string; nameEn: string }) => void; saving: boolean; t: (ar: string, en: string) => string }) {
  const [nameAr, setNameAr] = useState(warehouse.nameAr);
  const [nameEn, setNameEn] = useState(warehouse.nameEn);
  const dirty = nameAr !== warehouse.nameAr || nameEn !== warehouse.nameEn;
  return (
    <div className="flex items-end gap-2 border-b pb-3">
      <div className="flex-1 space-y-1">
        <Label className="text-xs">{t("الاسم بالعربي", "Name (AR)")}</Label>
        <Input value={nameAr} onChange={e => setNameAr(e.target.value)} data-testid={`input-warehouse-ar-${warehouse.id}`} />
      </div>
      <div className="flex-1 space-y-1">
        <Label className="text-xs">{t("الاسم بالإنجليزي", "Name (EN)")}</Label>
        <Input value={nameEn} onChange={e => setNameEn(e.target.value)} data-testid={`input-warehouse-en-${warehouse.id}`} />
      </div>
      <Button size="sm" disabled={!dirty || !nameAr || !nameEn || saving} onClick={() => onSave({ nameAr, nameEn })} data-testid={`button-save-warehouse-${warehouse.id}`}>
        {t("حفظ", "Save")}
      </Button>
    </div>
  );
}
