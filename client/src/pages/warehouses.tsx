import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, type UseMutationResult } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Activity, ArrowDownToLine, ArrowLeftRight, ArrowRight, Boxes, CircleHelp,
  ClipboardList, Download, FileText, Package, Plus, Printer, RefreshCw,
  Search, Settings2, Warehouse as WarehouseIcon,
} from "lucide-react";
import { WarehouseEmpty, WarehouseError, WarehousePanel, WarehouseSkeleton } from "@/components/warehouse/warehouse-ui";
import { WarehouseRequests } from "@/components/warehouse/warehouse-requests";
import { useWarehouseMovements, useWarehouseReceipts, useWarehouseSummary } from "@/components/warehouse/use-warehouse";
import { canManageWarehouse } from "@shared/warehouse-access";
import { BASE, downloadWarehouseCsv, operationKey, warehouseInvalidate, warehouseReason, warehouseStatus, warehouseUnit } from "@/components/warehouse/warehouse-utils";
import type { Item, Unit, Warehouse } from "@/components/warehouse/types";

const units: Unit[] = ["piece", "meter", "sqm", "kg", "liter", "sheet"];
const sections = ["overview", "items", "movements", "requests", "receipts", "reports", "settings"] as const;
type Section = typeof sections[number];
const labels: Record<Section, [string, string]> = {
  overview: ["نظرة عامة", "Overview"], items: ["الأصناف", "Items"], movements: ["حركات المخزون", "Movements"],
  requests: ["طلبات الشراء", "Requests"], receipts: ["استلام المشتريات", "Receipts"], reports: ["التقارير", "Reports"], settings: ["الإعدادات", "Settings"],
};
const unitText: Record<string, [string, string]> = {
  piece: ["قطعة", "Piece"], meter: ["متر", "Meter"], sqm: ["م²", "Square meter"], kg: ["كجم", "Kilogram"], liter: ["لتر", "Liter"], sheet: ["لوح", "Sheet"],
};
const newItem = () => ({ materialNameAr: "", materialNameEn: "", warehouseId: "", categoryId: "", category: "", unit: "piece", quantity: "0", minQuantity: "0", costPerUnit: "", location: "", sku: "", color: "", itemKind: "material", serialNumber: "", assignmentReason: "" });

function Stat({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Package; tone: string }) {
  return <Card className="overflow-hidden border-border/80"><CardContent className="flex items-center justify-between p-4 sm:p-5">
    <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</p></div>
    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></div>
  </CardContent></Card>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

export default function WarehousesPage() {
  const { t, isRTL } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const params = useParams<{ section?: string }>();
  const [, setLocation] = useLocation();
  const section = sections.includes(params.section as Section) ? params.section as Section : "overview";
  const canManage = canManageWarehouse(user?.role);
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [itemDialog, setItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [itemForm, setItemForm] = useState(newItem());
  const [movementDialog, setMovementDialog] = useState<Item | null>(null);
  const [movementType, setMovementType] = useState<"stock_in" | "stock_out" | "adjustment">("stock_in");
  const [movementForm, setMovementForm] = useState({ quantity: "", reason: "", notes: "", receiverName: "", supplierId: "" });
  const [staleCountError, setStaleCountError] = useState(false);
  const [transferDialog, setTransferDialog] = useState<Item | null>(null);
  const [transferForm, setTransferForm] = useState({ targetWarehouseId: "", quantity: "", receiverName: "", notes: "" });
  const [requestDialog, setRequestDialog] = useState<Item | null>(null);
  const [requestForm, setRequestForm] = useState({ quantity: "", reason: "", requestedFor: "" });
  const [receiptTarget, setReceiptTarget] = useState<{ poId: number; lineIndex: number; inventoryId?: number; name: string; remaining: number } | null>(null);
  const [receiptForm, setReceiptForm] = useState({ quantity: "", notes: "", inventoryId: "" });
  const [filterDates, setFilterDates] = useState({ from: "", to: "" });
  const [reportWarehouse, setReportWarehouse] = useState("all");
  const [reportKind, setReportKind] = useState("balances");
  const [movementPage, setMovementPage] = useState(1);
  const [printingReport, setPrintingReport] = useState(false);
  const summaryQuery = useWarehouseSummary();
  const suppliersQuery = useQuery<Array<{ id: number; nameAr?: string; nameEn?: string; name?: string }>>({ queryKey: ["/api/suppliers"] });
  const suppliers = suppliersQuery.data ?? [];
  const summary = summaryQuery.data;
  const warehouses = summary?.warehouses ?? [];
  const items = summary?.items ?? [];
  const movementsQuery = useWarehouseMovements(useMemo(() => {
    const q = new URLSearchParams();
    if (warehouseFilter !== "all") q.set("warehouseId", warehouseFilter);
    if (filterDates.from) q.set("from", filterDates.from);
    if (filterDates.to) q.set("to", filterDates.to);
    q.set("page", String(movementPage)); q.set("pageSize", "25");
    return q;
  }, [warehouseFilter, filterDates, movementPage]));
  useEffect(() => { setMovementPage(1); }, [warehouseFilter, filterDates]);
  const receiptsQuery = useWarehouseReceipts();
  const selectedItems = items.filter((item) => {
    const term = search.toLocaleLowerCase();
    const matches = !term || `${item.materialNameAr} ${item.materialNameEn ?? ""} ${item.sku ?? ""}`.toLocaleLowerCase().includes(term);
    const warehouseMatch = warehouseFilter === "all" || String(item.warehouseId ?? "") === warehouseFilter;
    const qty = Number(item.quantity) || 0, min = Number(item.minQuantity) || 0;
    const stockMatch = stockFilter === "all" || (stockFilter === "low" && min > 0 && qty <= min) || (stockFilter === "out" && qty <= 0);
    return matches && warehouseMatch && stockMatch;
  });
  const unitName = (unit: string) => t(...(unitText[unit] ?? [unit, unit]));
  const itemName = (item: Item) => t(item.materialNameAr, item.materialNameEn || item.materialNameAr);
  const nameWarehouse = (id?: number | null) => {
    const found = warehouses.find((w) => w.id === id);
    return found ? t(found.nameAr, found.nameEn || found.nameAr) : t("غير معيّن", "Unassigned");
  };
  const reportKindLabel = reportKind === "balances" ? t("الأرصدة", "Balances") : reportKind === "movements" ? t("الحركات", "Movements") : t("المخزون المنخفض", "Low stock");
  const invalidate = async () => { await warehouseInvalidate(); };
  const [operationKeys, setOperationKeys] = useState<Record<string, string>>({});
  const opKey = (name: string) => operationKeys[name] ?? "";
  const ensureKey = (name: string) => {
    const current = operationKeys[name] || operationKey();
    if (!operationKeys[name]) setOperationKeys((prev) => ({ ...prev, [name]: current }));
    return current;
  };
  const clearKey = (name: string) => setOperationKeys((prev) => { const next = { ...prev }; delete next[name]; return next; });
  const reportError = (error: Error) => toast({ title: t("تعذر تنفيذ العملية", "Could not complete action"), description: error.message, variant: "destructive" });
  const mutation = useMutation({
    mutationFn: ({ method, path, data }: { method: string; path: string; data: unknown }) => apiRequest(method, `${BASE}${path}`, data),
    onSuccess: async (_res, variables) => {
      clearKey(variables.path);
      await invalidate();
      if (variables.path.startsWith("/items/")) setItemDialog(false);
    },
    onError: reportError,
  });
  const createItem = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiRequest("POST", `${BASE}/items`, payload),
    onSuccess: async () => { clearKey("createItem"); await invalidate(); setItemDialog(false); setEditingItem(null); setItemForm(newItem()); },
    onError: reportError,
  });
  const movementMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiRequest("POST", `${BASE}/movements`, payload),
    onSuccess: async (_res, variables) => { await invalidate(); setMovementDialog(null); setMovementForm({ quantity: "", reason: "", notes: "", receiverName: "", supplierId: "" }); setStaleCountError(false); clearKey(`movement-${variables.inventoryId}-${variables.type}`); },
    onError: (error: Error, variables: Record<string, unknown>) => {
      if (variables.type === "adjustment" && (error as Error & { status?: number }).status === 409) {
        setStaleCountError(true);
        toast({ title: t("تغير رصيد الصنف أثناء الجرد", "Stock changed during count"), description: t("حدّث أساس الجرد ثم أعد المحاولة مع الاحتفاظ بالكمية المدخلة.", "Refresh the count basis, then retry without losing the entered count."), variant: "destructive" });
      } else reportError(error);
    },
  });
  const transferMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiRequest("POST", `${BASE}/transfers`, payload),
    onSuccess: async (_res, variables) => { await invalidate(); setTransferDialog(null); setTransferForm({ targetWarehouseId: "", quantity: "", receiverName: "", notes: "" }); clearKey(`transfer-${variables.inventoryId}-${variables.targetWarehouseId}`); },
    onError: reportError,
  });
  const requisitionMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiRequest("POST", `${BASE}/requisitions`, payload),
    onSuccess: async (_res, variables) => { await invalidate(); setRequestDialog(null); setRequestForm({ quantity: "", reason: "", requestedFor: "" }); clearKey(`request-${variables.inventoryId}`); },
    onError: reportError,
  });
  const receiptMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiRequest("POST", `${BASE}/receipts`, payload),
    onSuccess: async (_res, variables) => { await invalidate(); setReceiptTarget(null); setReceiptForm({ quantity: "", notes: "", inventoryId: "" }); clearKey(`receipt-${variables.purchaseOrderId}-${variables.lineIndex}`); },
    onError: reportError,
  });

  const openCreateItem = () => { clearKey("createItem"); setEditingItem(null); setItemForm(newItem()); setItemDialog(true); };
  const openMovement = (item: Item) => {
    if (!operationKeys[`movement-${item.id}-stock_in`]) setMovementForm({ quantity: "", reason: "", notes: "", receiverName: "", supplierId: "" });
    setStaleCountError(false);
    setMovementDialog(item);
    setMovementType("stock_in");
  };
  const refreshCountBasis = async () => {
    if (!movementDialog) return;
    const refreshed = await summaryQuery.refetch();
    const latest = refreshed.data?.items.find((item) => item.id === movementDialog.id);
    if (latest && !refreshed.isError) {
      setMovementDialog(latest);
      setStaleCountError(false);
    } else {
      toast({ title: t("تعذر تحديث رصيد الصنف", "Could not refresh item balance"), description: (refreshed.error as Error | null)?.message, variant: "destructive" });
    }
  };
  const openRequest = (item: Item) => {
    if (!operationKeys[`request-${item.id}`]) setRequestForm({ quantity: "", reason: "", requestedFor: "" });
    setRequestDialog(item);
  };
  const openReceipt = (target: { poId: number; lineIndex: number; inventoryId?: number; name: string; remaining: number }) => {
    if (!operationKeys[`receipt-${target.poId}-${target.lineIndex}`]) setReceiptForm({ quantity: String(target.remaining), notes: "", inventoryId: String(target.inventoryId ?? "") });
    setReceiptTarget(target);
  };
  const openEditItem = (item: Item) => {
    setEditingItem(item);
    setItemForm({ materialNameAr: item.materialNameAr, materialNameEn: item.materialNameEn ?? "", warehouseId: String(item.warehouseId ?? ""), categoryId: String(item.categoryId ?? ""), category: item.category ?? "", unit: item.unit, quantity: String(item.quantity), minQuantity: String(item.minQuantity), costPerUnit: String(item.costPerUnit ?? ""), location: item.location ?? "", sku: item.sku ?? "", color: item.color ?? "", itemKind: item.itemKind ?? "material", serialNumber: item.serialNumber ?? "", assignmentReason: "" });
    setItemDialog(true);
  };
  const submitItem = () => {
    const data: Record<string, unknown> = {
      materialNameAr: itemForm.materialNameAr, materialNameEn: itemForm.materialNameEn || undefined,
      categoryId: itemForm.categoryId ? Number(itemForm.categoryId) : undefined,
      category: itemForm.category || undefined, minQuantity: Number(itemForm.minQuantity) || 0,
      costPerUnit: itemForm.costPerUnit ? Number(itemForm.costPerUnit) : undefined,
      location: itemForm.location || undefined, sku: itemForm.sku || undefined, color: itemForm.color || undefined,
      itemKind: itemForm.itemKind,
    };
    if (editingItem) {
      if (!editingItem.warehouseId && itemForm.warehouseId) {
        data.warehouseId = Number(itemForm.warehouseId);
        data.assignmentReason = itemForm.assignmentReason;
      }
      mutation.mutate({ method: "PATCH", path: `/items/${editingItem.id}`, data });
    } else {
      if (!itemForm.warehouseId) return;
      createItem.mutate({ key: ensureKey("createItem") || operationKey(), ...data, serialNumber: itemForm.serialNumber || undefined, active: true, warehouseId: Number(itemForm.warehouseId), unit: itemForm.unit, quantity: Number(itemForm.quantity) || 0, minQuantity: Number(itemForm.minQuantity) || 0 });
    }
  };
  const sectionLink = (key: Section) => setLocation(key === "overview" ? "/warehouses" : `/warehouses/${key}`);
  const title = labels[section];
  const doExport = async () => {
    const q = new URLSearchParams({ kind: reportKind });
    if (reportWarehouse !== "all") q.set("warehouseId", reportWarehouse);
    if (filterDates.from) q.set("from", filterDates.from);
    if (filterDates.to) q.set("to", filterDates.to);
    try { await downloadWarehouseCsv(`${BASE}/reports.csv?${q.toString()}`); }
    catch (e) { reportError(e as Error); }
  };
  const printReport = async () => {
    if (printingReport) return;
    setPrintingReport(true);
    const printWindow = window.open("about:blank", "_blank");
    const q = new URLSearchParams({ kind: reportKind });
    if (reportWarehouse !== "all") q.set("warehouseId", reportWarehouse);
    if (filterDates.from) q.set("from", filterDates.from);
    if (filterDates.to) q.set("to", filterDates.to);
    try {
      const response = await apiRequest("GET", `${BASE}/reports/print?${q.toString()}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (!printWindow) {
        const link = document.createElement("a");
        link.href = objectUrl;
        const contentType = response.headers.get("content-type") ?? "";
        const extension = contentType.includes("pdf") ? "pdf" : contentType.includes("csv") ? "csv" : "html";
        link.download = `warehouse-${reportKind}-report.${extension}`;
        link.click();
        toast({ title: t("تم تنزيل التقرير للطباعة", "Report downloaded for printing") });
      } else {
        printWindow.opener = null;
        const isHtml = response.headers.get("content-type")?.includes("text/html");
        printWindow.addEventListener("load", () => { if (isHtml) { printWindow.focus(); printWindow.print(); } }, { once: true });
        printWindow.location.href = objectUrl;
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      printWindow?.close();
      reportError(error as Error);
    } finally {
      setPrintingReport(false);
    }
  };

  if (summaryQuery.isLoading) return <div className="mx-auto max-w-7xl p-4 sm:p-6"><WarehouseSkeleton /></div>;
  if (summaryQuery.isError || !summary) return <div className="mx-auto max-w-7xl p-4 sm:p-6"><WarehouseError message={(summaryQuery.error as Error)?.message ?? t("تعذر تحميل البيانات", "Unable to load data")} retry={() => summaryQuery.refetch()} label={t("تعذر تحميل البيانات", "Could not load data")} /></div>;

  return <main className="mx-auto min-h-[100dvh] w-full max-w-7xl space-y-5 p-3 pb-20 sm:p-6">
    <header className="relative overflow-hidden rounded-2xl bg-[#173d38] px-5 py-6 text-[#f4f1e8] shadow-sm sm:px-7 sm:py-7">
      <div className="pointer-events-none absolute -end-10 -top-20 h-64 w-64 rounded-full border-[1px] border-white/10" /><div className="pointer-events-none absolute -end-2 -top-12 h-48 w-48 rounded-full border border-white/10" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl"><p className="mb-2 flex items-center gap-2 text-xs font-medium tracking-[.14em] text-[#b7c8b6]"><WarehouseIcon className="h-4 w-4" />TEAK · WAREHOUSE CENTER</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("المستودعات", "Warehouses")}</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#d2ded0]">{t("مساحة واحدة للأصناف والأرصدة والحركات وطلبات إعادة التوريد.", "One clear workspace for items, balances, stock movements and replenishment.")}</p></div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button variant="secondary" className="flex-1 bg-white/10 text-white hover:bg-white/20 sm:flex-none" onClick={() => { void invalidate(); }}><RefreshCw className="me-2 h-4 w-4" />{t("تحديث", "Refresh")}</Button>
          {canManage && <Button onClick={openCreateItem} className="flex-1 bg-[#d4b878] text-[#173d38] hover:bg-[#e0c98e] sm:flex-none"><Plus className="me-2 h-4 w-4" />{t("صنف جديد", "New item")}</Button>}
        </div>
      </div>
    </header>
    <nav aria-label={t("أقسام المستودعات", "Warehouse sections")} className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 scrollbar-thin">
      {sections.map((key) => <button key={key} onClick={() => sectionLink(key)} className={`min-h-10 shrink-0 rounded-lg px-3 text-sm transition-colors ${section === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} aria-current={section === key ? "page" : undefined}>{t(...labels[key])}</button>)}
    </nav>

    {section === "overview" && <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={t("المستودعات النشطة", "Active warehouses")} value={summary.stats.warehouses} icon={WarehouseIcon} tone="bg-primary/10 text-primary" />
        <Stat label={t("الأصناف", "Items")} value={summary.stats.items} icon={Boxes} tone="bg-[#f5edda] text-[#876d34] dark:bg-[#594b2d]/40 dark:text-[#dfc787]" />
        <Stat label={t("مخزون منخفض", "Low stock")} value={summary.stats.lowStock} icon={Activity} tone="bg-amber-500/10 text-amber-700 dark:text-amber-300" />
        <Stat label={t("غير معيّن", "Unassigned")} value={summary.stats.unassigned} icon={CircleHelp} tone="bg-slate-500/10 text-slate-600 dark:text-slate-300" />
        <Stat label={t("طلبات معلقة", "Pending requests")} value={summary.stats.pendingRequests} icon={ClipboardList} tone="bg-rose-500/10 text-rose-700 dark:text-rose-300" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.35fr_.85fr]">
        <WarehousePanel eyebrow={t("مواقع التخزين", "Storage locations")} title={t("المستودعات", "Warehouse locations")} action={<Button variant="outline" size="sm" onClick={() => sectionLink("settings")}><Settings2 className="me-2 h-4 w-4" />{t("إدارة", "Manage")}</Button>}>
          {warehouses.length ? <div className="grid gap-3 sm:grid-cols-2">{warehouses.map((w) => <WarehouseCard key={w.id} warehouse={w} count={items.filter((i) => i.warehouseId === w.id).length} t={t} onSelect={() => { setWarehouseFilter(String(w.id)); sectionLink("items"); }} />)}</div> : <WarehouseEmpty title={t("لا توجد مستودعات", "No warehouses yet")} detail={t("ابدأ بإضافة موقع تخزين من الإعدادات.", "Add a storage location in settings to get started.")} /> }
        </WarehousePanel>
        <WarehousePanel eyebrow={t("نظرة سريعة", "At a glance")} title={t("إشارات المخزون", "Stock signals")}>
          <div className="space-y-3">
            <SignalRow title={t("أصناف منخفضة الرصيد", "Items below minimum")} value={items.filter((i) => Number(i.minQuantity) > 0 && Number(i.quantity) <= Number(i.minQuantity)).length} color="amber" onClick={() => { setStockFilter("low"); sectionLink("items"); }} />
            <SignalRow title={t("أصناف بلا مستودع", "Items without a warehouse")} value={summary.stats.unassigned} color="slate" onClick={() => { setWarehouseFilter("all"); sectionLink("items"); }} />
            <SignalRow title={t("طلبات تنتظر قراراً", "Requests awaiting a decision")} value={summary.stats.pendingRequests} color="rose" onClick={() => sectionLink("requests")} />
            <p className="rounded-lg bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">{t("تُدار المعدات والمركبات كسجلات تشغيلية للمخزون، وليست أصولاً مالية.", "Equipment and vehicles are operational inventory records, not financial assets.")}</p>
          </div>
        </WarehousePanel>
      </div>
      <WarehousePanel eyebrow={t("آخر الأصناف", "Recent stock")} title={t("الأصناف المسجلة", "Registered items")} action={<Button variant="ghost" size="sm" onClick={() => sectionLink("items")}>{t("عرض الكل", "View all")}<ArrowRight className={`ms-2 h-4 w-4 ${isRTL ? "rotate-180" : ""}`} /></Button>}>
        <ItemsList items={items.slice(0, 5)} warehouses={warehouses} t={t} unitName={unitName} onEdit={openEditItem} onMove={openMovement} onRequest={openRequest} onToggleActive={(item)=>mutation.mutate({method:"PATCH",path:`/items/${item.id}`,data:{active:item.active===false}})} />
      </WarehousePanel>
    </div>}

    {section === "items" && <WarehousePanel eyebrow={t("سجل المخزون", "Stock register")} title={t("الأصناف والأرصدة", "Items & balances")} action={canManage ? <Button onClick={openCreateItem}><Plus className="me-2 h-4 w-4" />{t("إضافة صنف", "Add item")}</Button> : undefined}>
      <div className="grid gap-2 sm:grid-cols-[1fr_190px_170px]">
        <div className="relative"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("ابحث بالاسم أو الرمز", "Search name or SKU")} /></div>
        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}><SelectTrigger><SelectValue placeholder={t("كل المستودعات", "All warehouses")} /></SelectTrigger><SelectContent><SelectItem value="all">{t("كل المستودعات", "All warehouses")}</SelectItem>{warehouses.map((w) => <SelectItem key={w.id} value={String(w.id)}>{t(w.nameAr, w.nameEn || w.nameAr)}</SelectItem>)}</SelectContent></Select>
        <Select value={stockFilter} onValueChange={setStockFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("كل الأرصدة", "All balances")}</SelectItem><SelectItem value="low">{t("منخفض", "Low stock")}</SelectItem><SelectItem value="out">{t("نفد", "Out of stock")}</SelectItem></SelectContent></Select>
      </div>
      <ItemsList items={selectedItems} warehouses={warehouses} t={t} unitName={unitName} onEdit={openEditItem} onMove={openMovement} onRequest={openRequest} onTransfer={(item) => { setTransferDialog(item); setTransferForm({ targetWarehouseId: "", quantity: "", receiverName: "", notes: "" }); }} onToggleActive={(item)=>mutation.mutate({method:"PATCH",path:`/items/${item.id}`,data:{active:item.active===false}})} emptyTitle={t("لا توجد أصناف مطابقة", "No matching items")} />
    </WarehousePanel>}

    {section === "movements" && <MovementSection warehouses={warehouses} items={items} t={t} query={movementsQuery} warehouseFilter={warehouseFilter} setWarehouseFilter={(value)=>{setWarehouseFilter(value);setMovementPage(1);}} dates={filterDates} setDates={(value)=>{setFilterDates(value);setMovementPage(1);}} page={movementPage} setPage={setMovementPage} />}
    {section === "requests" && <WarehousePanel eyebrow={t("إعادة التوريد", "Replenishment")} title={t("طلبات الشراء", "Purchase requests")}><WarehouseRequests /></WarehousePanel>}
    {section === "receipts" && <ReceiptsSection query={receiptsQuery} t={t} onReceive={openReceipt} canReceive={["owner","assistant","warehouse"].includes(user?.role ?? "")} />}
    {section === "reports" && <WarehousePanel eyebrow={t("تصدير ومراجعة", "Export & review")} title={t("تقارير المستودعات", "Warehouse reports")}>
      <div className="rounded-2xl border bg-card p-4 sm:p-6 print:hidden">
        <div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><FileText className="h-5 w-5" /></div><div><h3 className="font-semibold">{t("تقرير واضح، بلا رسوم مشتتة", "A clean report, without chart clutter")}</h3><p className="mt-1 text-sm text-muted-foreground">{t("اختر نطاق التقرير والفترة ثم صدّره أو اطبعه.", "Choose a report scope and date range, then export or print.")}</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("نوع التقرير", "Report type")}><Select value={reportKind} onValueChange={setReportKind}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="balances">{t("الأرصدة", "Balances")}</SelectItem><SelectItem value="movements">{t("الحركات", "Movements")}</SelectItem><SelectItem value="low_stock">{t("المخزون المنخفض", "Low stock")}</SelectItem></SelectContent></Select></Field>
          <Field label={t("المستودع", "Warehouse")}><Select value={reportWarehouse} onValueChange={setReportWarehouse}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("كل المستودعات", "All warehouses")}</SelectItem>{warehouses.map((w) => <SelectItem key={w.id} value={String(w.id)}>{t(w.nameAr, w.nameEn || w.nameAr)}</SelectItem>)}</SelectContent></Select></Field>
          <Field label={t("من تاريخ", "From")}><Input type="date" value={filterDates.from} onChange={(e) => setFilterDates({ ...filterDates, from: e.target.value })} /></Field>
          <Field label={t("إلى تاريخ", "To")}><Input type="date" value={filterDates.to} onChange={(e) => setFilterDates({ ...filterDates, to: e.target.value })} /></Field>
        </div>
        <div className="mt-5 flex flex-wrap gap-2"><Button onClick={doExport}><Download className="me-2 h-4 w-4" />{t("تنزيل CSV", "Download CSV")}</Button><Button variant="outline" disabled={printingReport} onClick={printReport}><Printer className="me-2 h-4 w-4" />{printingReport?t("جارٍ تجهيز التقرير…","Preparing report…"):t("طباعة التقرير", "Print report")}</Button></div>
      </div>
    </WarehousePanel>}
    {section === "settings" && <SettingsSection summary={summary} t={t} mutation={mutation} canManage={canManage} />}

    <Dialog open={itemDialog} onOpenChange={setItemDialog}><DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{editingItem ? t("تعديل بيانات الصنف", "Edit item details") : t("صنف جديد", "New item")}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("الاسم بالعربية *", "Arabic name *")}><Input value={itemForm.materialNameAr} onChange={(e) => setItemForm({ ...itemForm, materialNameAr: e.target.value })} /></Field>
        <Field label={t("الاسم بالإنجليزية", "English name")}><Input value={itemForm.materialNameEn} onChange={(e) => setItemForm({ ...itemForm, materialNameEn: e.target.value })} /></Field>
        <Field label={t("المستودع", "Warehouse")}><Select disabled={!!editingItem?.warehouseId} value={itemForm.warehouseId} onValueChange={(v) => setItemForm({ ...itemForm, warehouseId: v })}><SelectTrigger><SelectValue placeholder={t("اختر مستودعاً", "Choose warehouse")} /></SelectTrigger><SelectContent>{warehouses.filter(w=>w.active).map((w) => <SelectItem key={w.id} value={String(w.id)}>{t(w.nameAr, w.nameEn || w.nameAr)}</SelectItem>)}</SelectContent></Select>{!!editingItem?.warehouseId&&<p className="text-xs text-muted-foreground">{t("تغيير المستودع يتم عبر التحويل.","Change the warehouse through Transfer.")}</p>}</Field>
        {editingItem && !editingItem.warehouseId && <Field label={t("سبب تعيين الرصيد القديم *", "Legacy stock assignment reason *")}><Input value={itemForm.assignmentReason} onChange={(e)=>setItemForm({...itemForm,assignmentReason:e.target.value})} /></Field>}
        <Field label={t("الفئة", "Category")}><Select value={itemForm.categoryId || "legacy"} onValueChange={(v) => setItemForm({ ...itemForm, categoryId: v === "legacy" ? "" : v })}><SelectTrigger><SelectValue placeholder={t("بدون فئة", "No category")} /></SelectTrigger><SelectContent><SelectItem value="legacy">{t("بدون فئة", "No category")}</SelectItem>{summary.categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{t(c.nameAr, c.nameEn || c.nameAr)}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={t("نوع السجل", "Record type")}><Select value={itemForm.itemKind} onValueChange={(v) => setItemForm({ ...itemForm, itemKind: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[["material","مادة","Material"],["equipment","معدات","Equipment"],["vehicle","مركبة","Vehicle"],["other","أخرى","Other"]].map(([v,ar,en]) => <SelectItem key={v} value={v}>{t(ar,en)}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={t("رقم تسلسلي", "Serial number")}><Input disabled={!!editingItem} value={itemForm.serialNumber} onChange={(e) => setItemForm({ ...itemForm, serialNumber: e.target.value })} />{editingItem&&<p className="text-xs text-muted-foreground">{t("الرقم التسلسلي ثابت بعد إنشاء السجل.","Serial number is fixed after creation.")}</p>}</Field>
        {!editingItem && <><Field label={t("الوحدة", "Unit")}><Select value={itemForm.unit} onValueChange={(v) => setItemForm({ ...itemForm, unit: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{units.map((u) => <SelectItem key={u} value={u}>{unitName(u)}</SelectItem>)}</SelectContent></Select></Field><Field label={t("رصيد افتتاحي", "Opening quantity")}><Input type="number" min="0" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} /></Field></>}
        <Field label={t("حد إعادة الطلب", "Minimum quantity")}><Input type="number" min="0" value={itemForm.minQuantity} onChange={(e) => setItemForm({ ...itemForm, minQuantity: e.target.value })} /></Field>
        <Field label={t("تكلفة الوحدة", "Unit cost")}><Input type="number" min="0" value={itemForm.costPerUnit} onChange={(e) => setItemForm({ ...itemForm, costPerUnit: e.target.value })} /></Field>
        <Field label={t("SKU", "SKU")}><Input value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} /></Field>
        <Field label={t("الموقع داخل المستودع", "Location")}><Input value={itemForm.location} onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })} /></Field>
        <Field label={t("اللون أو المواصفة", "Color or specification")}><Input value={itemForm.color} onChange={(e) => setItemForm({ ...itemForm, color: e.target.value })} /></Field>
        {!editingItem && summary.categories.length === 0 && <Field label={t("الفئة النصية", "Legacy category")}><Input value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} /></Field>}
      </div>
      {editingItem && <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{t("تعديل الرصيد أو الوحدة يتم من خلال حركة مخزون، وليس من نموذج البيانات.", "Balance and unit changes must be recorded as stock movements, not edited here.")}</p>}
      {createItem.isError && <p className="text-sm text-destructive">{(createItem.error as Error).message}</p>}
      {mutation.isError && <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>}
      <Button className="w-full" disabled={!itemForm.materialNameAr || (!editingItem && (!itemForm.warehouseId || createItem.isPending)) || (!!editingItem && !editingItem.warehouseId && !!itemForm.warehouseId && !itemForm.assignmentReason.trim()) || createItem.isPending || mutation.isPending} onClick={submitItem}>{createItem.isPending || mutation.isPending ? t("جارٍ الحفظ…", "Saving…") : t("حفظ الصنف", "Save item")}</Button>
    </DialogContent></Dialog>

    <Dialog open={!!movementDialog} onOpenChange={(open) => { if (!open) setMovementDialog(null); }}><DialogContent><DialogHeader><DialogTitle>{t("تسجيل حركة مخزون", "Record stock movement")}</DialogTitle></DialogHeader>{movementDialog && <div className="space-y-4">
      <div className="rounded-lg bg-muted p-3"><p className="font-medium">{itemName(movementDialog)}</p><p className="text-sm text-muted-foreground">{t("الرصيد الحالي", "Current balance")}: {movementDialog.quantity} {unitName(movementDialog.unit)}</p></div>
      <Field label={t("نوع الحركة", "Movement type")}><Select value={movementType} onValueChange={(v: "stock_in"|"stock_out"|"adjustment") => { setMovementType(v); setStaleCountError(false); setMovementForm((current)=>({...current,reason:"",supplierId:""})); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="stock_in">{t("إضافة رصيد", "Stock in")}</SelectItem><SelectItem value="stock_out">{t("صرف رصيد", "Stock out")}</SelectItem><SelectItem value="adjustment">{t("جرد فعلي", "Counted adjustment")}</SelectItem></SelectContent></Select></Field>
      <Field label={movementType === "adjustment" ? t("الرصيد الفعلي المعدود", "Counted actual balance") : t("الكمية", "Quantity")}><Input type="number" min={movementType === "adjustment" ? "0" : "0.001"} value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })} /></Field>
      <Field label={t("السبب", "Reason")}><Select value={movementForm.reason} onValueChange={(v) => setMovementForm({ ...movementForm, reason: v })}><SelectTrigger><SelectValue placeholder={t("اختر السبب", "Choose reason")} /></SelectTrigger><SelectContent>{(movementType === "adjustment" ? [["inventory_count","جرد مخزون","Inventory count"]] : movementType === "stock_in" ? [["other","أخرى","Other"],["production_return","مرتجع إنتاج","Production return"],["customer_return","مرتجع عميل","Customer return"],["adjustment","تسوية جردية","Adjustment"]] : [["production_use","استخدام إنتاج","Production use"],["contract_delivery","تسليم عقد","Contract delivery"],["supplier_return","إرجاع لمورد","Supplier return"],["damaged","تالف","Damaged"],["sample","عينة","Sample"],["adjustment","تسوية جردية","Adjustment"],["other","أخرى","Other"]]).map(([v,ar,en]) => <SelectItem key={v} value={v}>{t(ar,en)}</SelectItem>)}</SelectContent></Select></Field>
      {movementType === "stock_out" && <Field label={t("اسم المستلم *", "Receiver name *")}><Input value={movementForm.receiverName} onChange={(e) => setMovementForm({ ...movementForm, receiverName: e.target.value })} /></Field>}
      {movementType === "stock_out" && movementForm.reason === "supplier_return" && <Field label={t("المورد *", "Supplier *")}><Select value={movementForm.supplierId} onValueChange={(v) => setMovementForm({ ...movementForm, supplierId: v })}><SelectTrigger><SelectValue placeholder={t("اختر المورد", "Choose supplier")} /></SelectTrigger><SelectContent>{suppliers.map((supplier)=><SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.nameAr||supplier.nameEn||supplier.name||`#${supplier.id}`}</SelectItem>)}</SelectContent></Select>{suppliersQuery.isError&&<p className="text-xs text-destructive">{t("تعذر تحميل الموردين","Could not load suppliers")} <button className="underline" onClick={()=>suppliersQuery.refetch()}>{t("إعادة المحاولة","Retry")}</button></p>}</Field>}
      <Field label={t("ملاحظات", "Notes")}><Textarea value={movementForm.notes} onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })} rows={3} /></Field>
      {movementType === "stock_out" && <p className="text-xs text-muted-foreground">{t("يجب كتابة السبب والملاحظات، ولا يسمح برصيد سالب.", "Reason and notes are required; negative stock is not allowed.")}</p>}
      {staleCountError && movementType === "adjustment" && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"><p className="text-sm font-medium text-destructive">{t("تغيرت بيانات الرصيد بعد فتح الجرد. حدّث الأساس قبل إعادة المحاولة.", "Stock changed after this count began. Refresh the count basis before retrying.")}</p><Button size="sm" variant="outline" className="mt-2" disabled={summaryQuery.isFetching} onClick={refreshCountBasis}>{summaryQuery.isFetching?t("جارٍ التحديث…","Refreshing…"):t("تحديث أساس الجرد","Refresh count basis")}</Button></div>}
      <Button className="w-full" disabled={!movementForm.quantity || Number(movementForm.quantity) < 0 || (movementType !== "adjustment" && Number(movementForm.quantity) <= 0) || (movementType === "stock_out" && Number(movementForm.quantity) > Number(movementDialog.quantity)) || !movementForm.reason || (movementType === "stock_out" && (!movementForm.notes.trim() || !movementForm.receiverName.trim() || (movementForm.reason==="supplier_return"&&!movementForm.supplierId))) || movementMutation.isPending} onClick={() => movementMutation.mutate({ key: ensureKey(`movement-${movementDialog.id}-${movementType}`), inventoryId: movementDialog.id, type: movementType, quantity: Number(movementForm.quantity), reason: movementForm.reason, notes: movementForm.notes, receiverName: movementForm.receiverName || undefined, ...(movementForm.reason==="supplier_return"&&movementForm.supplierId?{supplierId:Number(movementForm.supplierId)}:{}), ...(movementType === "adjustment" ? { expectedQuantity: Number(movementDialog.quantity), expectedVersion: movementDialog.version } : {}) })}>{movementMutation.isPending ? t("جارٍ التسجيل…", "Recording…") : t("تسجيل الحركة", "Record movement")}</Button>
    </div>}</DialogContent></Dialog>

    <Dialog open={!!transferDialog} onOpenChange={(open) => { if (!open) setTransferDialog(null); }}><DialogContent><DialogHeader><DialogTitle>{t("تحويل بين المستودعات", "Transfer between warehouses")}</DialogTitle></DialogHeader>{transferDialog && <div className="space-y-4">
      <p className="rounded-lg bg-muted p-3 font-medium">{itemName(transferDialog)} · {nameWarehouse(transferDialog.warehouseId)}</p>
      <Field label={t("إلى المستودع", "Target warehouse")}><Select value={transferForm.targetWarehouseId} onValueChange={(v) => setTransferForm({ ...transferForm, targetWarehouseId: v })}><SelectTrigger><SelectValue placeholder={t("اختر المستودع", "Select warehouse")} /></SelectTrigger><SelectContent>{warehouses.filter((w) => w.id !== transferDialog.warehouseId && w.active).map((w) => <SelectItem key={w.id} value={String(w.id)}>{t(w.nameAr, w.nameEn || w.nameAr)}</SelectItem>)}</SelectContent></Select></Field>
      <Field label={t("الكمية", "Quantity")}><Input type="number" min="0.001" max={Number(transferDialog.quantity)} value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} /></Field>
      <Field label={t("المستلم", "Receiver")}><Input value={transferForm.receiverName} onChange={(e) => setTransferForm({ ...transferForm, receiverName: e.target.value })} /></Field><Field label={t("ملاحظات", "Notes")}><Textarea value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} /></Field>
      <Button className="w-full" disabled={!transferForm.targetWarehouseId || !transferForm.quantity || Number(transferForm.quantity)<=0 || Number(transferForm.quantity)>Number(transferDialog.quantity) || transferMutation.isPending} onClick={() => transferMutation.mutate({ key: ensureKey(`transfer-${transferDialog.id}-${transferForm.targetWarehouseId}`), inventoryId: transferDialog.id, targetWarehouseId: Number(transferForm.targetWarehouseId), quantity: Number(transferForm.quantity), receiverName: transferForm.receiverName || undefined, notes: transferForm.notes || undefined })}>{t("تأكيد التحويل", "Confirm transfer")}</Button>
    </div>}</DialogContent></Dialog>

    <Dialog open={!!requestDialog} onOpenChange={(open) => { if (!open) setRequestDialog(null); }}><DialogContent><DialogHeader><DialogTitle>{t("طلب إعادة توريد", "Request replenishment")}</DialogTitle></DialogHeader>{requestDialog && <div className="space-y-4">
      <p className="rounded-lg bg-muted p-3 font-medium">{itemName(requestDialog)} · {requestDialog.quantity} {unitName(requestDialog.unit)}</p>
      <Field label={t("الكمية المطلوبة", "Requested quantity")}><Input type="number" min="0.001" value={requestForm.quantity} onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })} /></Field>
      <Field label={t("سبب الطلب", "Request reason")}><Textarea value={requestForm.reason} onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })} /></Field>
      <Field label={t("مطلوب لـ", "Requested for")}><Input value={requestForm.requestedFor} onChange={(e) => setRequestForm({ ...requestForm, requestedFor: e.target.value })} /></Field>
      {requisitionMutation.isError && <p className="text-sm text-destructive">{(requisitionMutation.error as Error).message}</p>}
      <Button className="w-full" disabled={!requestForm.quantity || Number(requestForm.quantity)<=0 || !requestForm.reason || !requestForm.requestedFor || requisitionMutation.isPending} onClick={() => requisitionMutation.mutate({ key: ensureKey(`request-${requestDialog.id}`), inventoryId: requestDialog.id, quantity: Number(requestForm.quantity), reason: requestForm.reason, requestedFor: requestForm.requestedFor })}>{t("إرسال الطلب", "Send request")}</Button>
    </div>}</DialogContent></Dialog>

    <Dialog open={!!receiptTarget} onOpenChange={(open) => { if (!open) setReceiptTarget(null); }}><DialogContent><DialogHeader><DialogTitle>{t("استلام بند شراء", "Receive purchase line")}</DialogTitle></DialogHeader>{receiptTarget && <div className="space-y-4">
      <div className="rounded-lg bg-muted p-3"><p className="font-medium">{receiptTarget.name}</p><p className="text-sm text-muted-foreground">{t("المتبقي", "Remaining")}: {receiptTarget.remaining}</p></div>
      {!receiptTarget.inventoryId && <Field label={t("ربط الصنف المستلم", "Link received item")}><Select value={receiptForm.inventoryId} onValueChange={(v) => setReceiptForm({ ...receiptForm, inventoryId: v })}><SelectTrigger><SelectValue placeholder={t("اختر الصنف المطابق", "Choose matching item")} /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.id} value={String(item.id)}>{itemName(item)} · {nameWarehouse(item.warehouseId)}</SelectItem>)}</SelectContent></Select></Field>}
      <Field label={t("الكمية المستلمة", "Received quantity")}><Input type="number" min="0.001" max={receiptTarget.remaining} value={receiptForm.quantity} onChange={(e) => setReceiptForm({ ...receiptForm, quantity: e.target.value })} /></Field>
      <Field label={t("ملاحظات", "Notes")}><Textarea value={receiptForm.notes} onChange={(e) => setReceiptForm({ ...receiptForm, notes: e.target.value })} /></Field>
      {receiptMutation.isError && <p className="text-sm text-destructive">{(receiptMutation.error as Error).message}</p>}
      <Button className="w-full" disabled={!receiptForm.quantity || Number(receiptForm.quantity)<=0 || Number(receiptForm.quantity) > receiptTarget.remaining || (!receiptTarget.inventoryId && !receiptForm.inventoryId) || receiptMutation.isPending} onClick={() => receiptMutation.mutate({ key: ensureKey(`receipt-${receiptTarget.poId}-${receiptTarget.lineIndex}`), purchaseOrderId: receiptTarget.poId, lineIndex: receiptTarget.lineIndex, inventoryId: receiptTarget.inventoryId ?? Number(receiptForm.inventoryId), quantity: Number(receiptForm.quantity), notes: receiptForm.notes })}>{t("تأكيد الاستلام", "Confirm receipt")}</Button>
    </div>}</DialogContent></Dialog>
  </main>;
}

function WarehouseCard({ warehouse, count, t, onSelect }: { warehouse: Warehouse; count: number; t: (ar:string,en:string)=>string; onSelect:()=>void }) {
  return <button onClick={onSelect} className="group flex min-h-28 items-start gap-3 rounded-xl border border-border bg-card p-4 text-start transition-colors hover:border-primary/40 hover:bg-primary/[.03]">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e7eee7] text-[#315d4a] dark:bg-[#27463a] dark:text-[#c4d7c4]"><WarehouseIcon className="h-5 w-5" /></span>
    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{t(warehouse.nameAr, warehouse.nameEn || warehouse.nameAr)}</span><span className="mt-1 block text-xs text-muted-foreground">{t(warehouse.warehouseType === "main" ? "رئيسي" : "فرعي", warehouse.warehouseType === "main" ? "Main" : "Sub-warehouse")}{warehouse.parentWarehouseId ? ` · #${warehouse.parentWarehouseId}` : ""}</span><span className="mt-2 block text-xs font-medium text-primary">{count} {t("صنف", "items")}</span></span>
    <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
  </button>;
}

function SignalRow({ title, value, color, onClick }: { title:string; value:number; color:string; onClick:()=>void }) {
  const tone = color === "amber" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : color === "rose" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-muted text-muted-foreground";
  return <button onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-start transition-colors hover:bg-muted/50"><span className="text-sm">{title}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${tone}`}>{value}</span></button>;
}

function ItemsList({ items, warehouses, t, unitName, onEdit, onMove, onRequest, onTransfer, onToggleActive, emptyTitle = "لا توجد أصناف" }: { items:Item[]; warehouses:Warehouse[]; t:(ar:string,en:string)=>string; unitName:(u:string)=>string; onEdit:(i:Item)=>void; onMove:(i:Item)=>void; onRequest:(i:Item)=>void; onTransfer?:(i:Item)=>void; onToggleActive?:(i:Item)=>void; emptyTitle?:string }) {
  const { user } = useAuth();
  const canEdit = ["owner","assistant","warehouse"].includes(user?.role ?? "");
  if (!items.length) return <WarehouseEmpty title={emptyTitle} detail={t("جرّب تعديل البحث أو أضف صنفاً جديداً.", "Adjust your search or add a new item.")} />;
  return <div className="space-y-2">{items.map((item) => {
    const qty = Number(item.quantity) || 0, min = Number(item.minQuantity) || 0, low = min > 0 && qty <= min;
    const category = item.category || "—";
    const wh = warehouses.find((w) => w.id === item.warehouseId);
    return <article key={item.id} className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4">
      <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Package className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{t(item.materialNameAr,item.materialNameEn || item.materialNameAr)}</h3><Badge variant={!item.warehouseId ? "outline" : low ? "destructive" : "secondary"}>{!item.warehouseId ? t("غير معيّن","Unassigned") : low ? t("منخفض","Low") : t("متوفر","In stock")}</Badge></div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{item.sku ? `${item.sku} · ` : ""}{item.categoryId ? " " : category}{wh ? ` · ${t(wh.nameAr,wh.nameEn || wh.nameAr)}` : ""}{item.location ? ` · ${item.location}` : ""}</p>
          <p className="mt-2 text-sm font-semibold tabular-nums">{qty} <span className="font-normal text-muted-foreground">{unitName(item.unit)}</span><span className="mx-2 text-muted-foreground">/</span><span className="text-xs font-normal text-muted-foreground">{t("الحد الأدنى","min")} {min}</span></p></div>
      </div>
      <div className="flex flex-wrap gap-1 sm:justify-end">
        {canEdit && <Button size="sm" variant="outline" disabled={!item.warehouseId} title={!item.warehouseId?t("عيّن الصنف إلى مستودع قبل تسجيل الحركات","Assign this item to a warehouse before recording movements"):undefined} onClick={() => onMove(item)}><ArrowDownToLine className="me-1.5 h-4 w-4" />{t("حركة","Move")}</Button>}
        {canEdit && <Button size="sm" variant="outline" onClick={() => onRequest(item)}>{t("طلب شراء","Request")}</Button>}
        {canEdit && onTransfer && item.warehouseId && <Button size="icon" variant="ghost" title={t("تحويل","Transfer")} onClick={() => onTransfer(item)}><ArrowLeftRight className="h-4 w-4" /></Button>}
        {canEdit && <Button size="sm" variant="ghost" onClick={() => onEdit(item)}>{t("تعديل","Edit")}</Button>}
        {canEdit && onToggleActive && <Button size="sm" variant="ghost" onClick={() => onToggleActive(item)}>{item.active===false?t("تفعيل","Activate"):t("أرشفة","Archive")}</Button>}
      </div>
    </article>;
  })}</div>;
}

function MovementSection({ warehouses, items, t, query, warehouseFilter, setWarehouseFilter, dates, setDates, page, setPage }: { warehouses:Warehouse[]; items:Item[]; t:(ar:string,en:string)=>string; query:ReturnType<typeof useWarehouseMovements>; warehouseFilter:string; setWarehouseFilter:(s:string)=>void; dates:{from:string;to:string}; setDates:(v:{from:string;to:string})=>void; page:number; setPage:(page:number)=>void }) {
  const rows = query.data?.rows ?? [];
  return <WarehousePanel eyebrow={t("سجل تدقيق", "Audit trail")} title={t("حركات المخزون", "Stock movements")}>
    <div className="grid gap-2 sm:grid-cols-3"><Select value={warehouseFilter} onValueChange={setWarehouseFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("كل المستودعات","All warehouses")}</SelectItem>{warehouses.map(w=><SelectItem key={w.id} value={String(w.id)}>{t(w.nameAr,w.nameEn || w.nameAr)}</SelectItem>)}</SelectContent></Select><Input type="date" value={dates.from} onChange={e=>setDates({...dates,from:e.target.value})} /><Input type="date" value={dates.to} onChange={e=>setDates({...dates,to:e.target.value})} /></div>
    {query.isLoading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : query.isError ? <WarehouseError message={(query.error as Error).message} retry={()=>query.refetch()} label={t("تعذر تحميل الحركات","Could not load movements")} /> : rows.length === 0 ? <WarehouseEmpty title={t("لا توجد حركات للفترة","No movements in this period")} detail={t("ستظهر هنا عمليات الإدخال والصرف والجرد.","Stock-in, issue and count records will appear here.")} /> : <div className="space-y-2">{rows.map((m)=><div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><div><p className="font-semibold">{m.itemName || items.find(i=>i.id===m.inventoryId)?.materialNameAr || `#${m.inventoryId}`}</p><p className="mt-1 text-xs text-muted-foreground">{m.warehouseName || t("غير معيّن","Unassigned")} · {m.performedByName || "—"} · {new Date(m.createdAt).toLocaleString()}</p><p className="mt-1 text-sm text-muted-foreground">{warehouseReason(t,m.reason)}{m.notes ? ` · ${m.notes}` : ""}</p></div><div className="text-end"><Badge variant={m.type === "stock_out" ? "destructive" : "secondary"}>{warehouseStatus(t,m.type)}</Badge><p className="mt-2 text-sm font-semibold tabular-nums">{m.quantity} {warehouseUnit(t,m.unit)}</p><p className="text-xs text-muted-foreground">{t("الرصيد","Balance")}: {m.balanceAfter}</p></div></div>)}</div>}
    {query.data && <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><p className="text-xs text-muted-foreground">{t("الصفحة","Page")} {page} · {query.data.total} {t("حركة","movements")}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page<=1||query.isFetching} onClick={()=>setPage(page-1)}>{t("السابق","Previous")}</Button><Button size="sm" variant="outline" disabled={page*25>=query.data.total||query.isFetching} onClick={()=>setPage(page+1)}>{t("التالي","Next")}</Button></div></div>}
  </WarehousePanel>;
}

function ReceiptsSection({ query, t, onReceive, canReceive }: { query:ReturnType<typeof useWarehouseReceipts>; t:(ar:string,en:string)=>string; onReceive:(t:{poId:number;lineIndex:number;inventoryId?:number;name:string;remaining:number})=>void; canReceive:boolean }) {
  const orders = query.data?.rows ?? [];
  return <WarehousePanel eyebrow={t("توريد معتمد", "Approved supply")} title={t("استلام المشتريات", "Purchase receipts")}>
    <p className="rounded-xl border border-[#d9c998] bg-[#f5f0df] p-3 text-sm text-[#5b513c] dark:border-[#665a3c] dark:bg-[#302c20] dark:text-[#e4d9b7]">{t("تسجيل الاستلام هنا يحدّث الرصيد عبر أمر الشراء المرتبط. لا تسجل استلام أمر الشراء كحركة مخزون يدوية.", "Receipts posted here update stock through the linked purchase order. Do not record purchase receipts as manual stock movements.")}</p>
    {query.isLoading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : query.isError ? <WarehouseError message={(query.error as Error).message} retry={()=>query.refetch()} label={t("تعذر تحميل أوامر الاستلام","Could not load receipts")} /> : orders.length ? <div className="space-y-3">{orders.map((order)=><article key={order.id} className="rounded-xl border bg-card p-4"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{t("أمر شراء","PO")} #{order.orderNumber}</h3><p className="text-sm text-muted-foreground">{order.supplierName} · {warehouseStatus(t,order.status)}</p></div><Badge variant="secondary">{order.items.length} {t("بنود","lines")}</Badge></div><div className="mt-3 space-y-2">{order.items.map((line)=>
      <div key={line.lineIndex} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3"><div><p className="font-medium">{t(line.materialNameAr,line.materialNameEn || line.materialNameAr)}</p><p className="text-xs text-muted-foreground">{t("مستلم","Received")} {line.receivedQuantity} / {line.quantity} {warehouseUnit(t,line.unit)}</p></div>{canReceive&&<Button size="sm" variant="outline" disabled={Number(line.receivedQuantity) >= Number(line.quantity)} onClick={()=>onReceive({poId:order.id,lineIndex:line.lineIndex,inventoryId:line.inventoryId ?? undefined,name:line.materialNameAr,remaining:Number(line.quantity)-Number(line.receivedQuantity)})}>{t("تسجيل استلام","Record receipt")}</Button>}</div>
    )}</div></article>)}</div> : <WarehouseEmpty title={t("لا توجد أوامر جاهزة للاستلام","No purchase orders ready for receipt")} detail={t("ستظهر أوامر الشراء المعتمدة أو المطلوبة هنا.","Approved and ordered purchase orders will appear here.")} />}
  </WarehousePanel>;
}

type SettingsMutationVars = { method: string; path: string; data: unknown };
function SettingsSection({ summary, t, mutation, canManage }: { summary:NonNullable<ReturnType<typeof useWarehouseSummary>["data"]>; t:(ar:string,en:string)=>string; mutation:UseMutationResult<Response, Error, SettingsMutationVars, unknown>; canManage:boolean }) {
  const [warehouseForm,setWarehouseForm]=useState({nameAr:"",nameEn:"",warehouseType:"main",parentWarehouseId:"",address:"",description:"",sections:""});
  const [categoryForm,setCategoryForm]=useState({nameAr:"",nameEn:"",parentId:""});
  const [editingWarehouse,setEditingWarehouse]=useState<Warehouse|null>(null);
  const [editingCategory,setEditingCategory]=useState<{id:number;nameAr:string;nameEn?:string|null;parentId?:number|null;active:boolean}|null>(null);
  const request=(method:string,path:string,data:unknown,options?:{onSuccess?:()=>void})=>mutation.mutate({method,path,data},options ? { onSuccess: options.onSuccess } : undefined);
  const createWarehouse=()=>{if(!warehouseForm.nameAr)return;request("POST","/warehouses",{...warehouseForm,parentWarehouseId:warehouseForm.parentWarehouseId?Number(warehouseForm.parentWarehouseId):undefined,sections:warehouseForm.sections.split(",").map(s=>s.trim()).filter(Boolean),active:true},{onSuccess:()=>setWarehouseForm({nameAr:"",nameEn:"",warehouseType:"main",parentWarehouseId:"",address:"",description:"",sections:""})});};
  const createCategory=()=>{if(!categoryForm.nameAr)return;request("POST","/categories",{nameAr:categoryForm.nameAr,nameEn:categoryForm.nameEn||undefined,parentId:categoryForm.parentId?Number(categoryForm.parentId):undefined,active:true},{onSuccess:()=>setCategoryForm({nameAr:"",nameEn:"",parentId:""})});};
  return <div className="space-y-6">
    <WarehousePanel eyebrow={t("إدارة المواقع","Locations")} title={t("المستودعات","Warehouses")}>
      {canManage && <div className="grid gap-2 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Input placeholder={t("اسم المستودع بالعربية *","Warehouse name (AR) *")} value={warehouseForm.nameAr} onChange={e=>setWarehouseForm({...warehouseForm,nameAr:e.target.value})} />
        <Input placeholder={t("الاسم بالإنجليزية","Name (EN)")} value={warehouseForm.nameEn} onChange={e=>setWarehouseForm({...warehouseForm,nameEn:e.target.value})} />
        <Select value={warehouseForm.warehouseType} onValueChange={v=>setWarehouseForm({...warehouseForm,warehouseType:v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="main">{t("رئيسي","Main")}</SelectItem><SelectItem value="sub">{t("فرعي","Sub-warehouse")}</SelectItem></SelectContent></Select>
        {warehouseForm.warehouseType==="sub" && <Select value={warehouseForm.parentWarehouseId} onValueChange={v=>setWarehouseForm({...warehouseForm,parentWarehouseId:v})}><SelectTrigger><SelectValue placeholder={t("المستودع الرئيسي","Parent warehouse")} /></SelectTrigger><SelectContent>{summary.warehouses.filter(w=>w.active).map(w=><SelectItem key={w.id} value={String(w.id)}>{t(w.nameAr,w.nameEn||w.nameAr)}</SelectItem>)}</SelectContent></Select>}
        <Input placeholder={t("العنوان","Address")} value={warehouseForm.address} onChange={e=>setWarehouseForm({...warehouseForm,address:e.target.value})} />
        <Input placeholder={t("الأقسام، مفصولة بفواصل","Sections, comma separated")} value={warehouseForm.sections} onChange={e=>setWarehouseForm({...warehouseForm,sections:e.target.value})} />
        <Input className="sm:col-span-2 lg:col-span-2" placeholder={t("الوصف","Description")} value={warehouseForm.description} onChange={e=>setWarehouseForm({...warehouseForm,description:e.target.value})} />
        <Button className="sm:col-span-2 lg:col-span-1" disabled={!warehouseForm.nameAr||mutation.isPending} onClick={createWarehouse}><Plus className="me-2 h-4 w-4" />{t("إضافة مستودع","Add warehouse")}</Button>
      </div>}
      {summary.warehouses.length ? <div className="space-y-2">{summary.warehouses.map(w=><div key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3"><div><div className="flex flex-wrap items-center gap-2 font-semibold">{t(w.nameAr,w.nameEn||w.nameAr)} <Badge variant="outline">{t(w.warehouseType==="main"?"رئيسي":"فرعي",w.warehouseType==="main"?"Main":"Sub-warehouse")}</Badge></div><p className="text-xs text-muted-foreground">{w.address||t("لا يوجد عنوان","No address")} · {w.active?t("نشط","Active"):t("مؤرشف","Archived")}</p></div>{canManage&&<div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>setEditingWarehouse(w)}>{t("تعديل","Edit")}</Button><Button size="sm" variant="ghost" onClick={()=>request("PATCH",`/warehouses/${w.id}`,{nameAr:w.nameAr,nameEn:w.nameEn,warehouseType:w.warehouseType,parentWarehouseId:w.parentWarehouseId,address:w.address,description:w.description,sections:w.sections,active:!w.active})}>{w.active?t("أرشفة","Archive"):t("تفعيل","Activate")}</Button></div>}</div>)}</div> : <WarehouseEmpty title={t("لم تتم إضافة مستودع","No warehouse added")} detail={t("أضف موقعاً قبل إنشاء الأصناف.","Add a location before creating items.")} />}
    </WarehousePanel>
    <WarehousePanel eyebrow={t("تصنيف مرن","Flexible classification")} title={t("الفئات","Categories")}>
      {canManage&&<div className="grid gap-2 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"><Input placeholder={t("اسم الفئة بالعربية *","Category name (AR) *")} value={categoryForm.nameAr} onChange={e=>setCategoryForm({...categoryForm,nameAr:e.target.value})} /><Input placeholder={t("الاسم بالإنجليزية","Name (EN)")} value={categoryForm.nameEn} onChange={e=>setCategoryForm({...categoryForm,nameEn:e.target.value})} /><Select value={categoryForm.parentId||"root"} onValueChange={v=>setCategoryForm({...categoryForm,parentId:v==="root"?"":v})}><SelectTrigger><SelectValue placeholder={t("فئة رئيسية","Parent category")} /></SelectTrigger><SelectContent><SelectItem value="root">{t("فئة رئيسية","Top level")}</SelectItem>{summary.categories.map(c=><SelectItem key={c.id} value={String(c.id)}>{t(c.nameAr,c.nameEn||c.nameAr)}</SelectItem>)}</SelectContent></Select><Button disabled={!categoryForm.nameAr||mutation.isPending} onClick={createCategory}><Plus className="me-2 h-4 w-4" />{t("إضافة فئة","Add category")}</Button></div>}
      {summary.categories.length?<div className="space-y-2">{summary.categories.map(c=>{const parent=summary.categories.find(p=>p.id===c.parentId);return <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2"><div className="flex flex-wrap items-center gap-2 text-sm font-medium">{t(c.nameAr,c.nameEn||c.nameAr)}{parent&&<span className="text-xs font-normal text-muted-foreground">{t("ضمن","under")} {t(parent.nameAr,parent.nameEn||parent.nameAr)}</span>}{!c.active&&<Badge variant="outline">{t("مؤرشفة","Archived")}</Badge>}</div>{canManage&&<div className="flex gap-1"><Button size="sm" variant="ghost" onClick={()=>setEditingCategory(c)}>{t("تعديل","Edit")}</Button><Button size="sm" variant="ghost" onClick={()=>request("PATCH",`/categories/${c.id}`,{nameAr:c.nameAr,nameEn:c.nameEn,parentId:c.parentId,active:!c.active})}>{c.active?t("أرشفة","Archive"):t("تفعيل","Activate")}</Button></div>}</div>})}</div>:<p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{t("لا توجد فئات بعد. الاقتراحات لا تُضاف تلقائياً.","No categories yet. Suggestions are never added automatically.")}</p>}
      {canManage&&<div className="flex flex-wrap gap-2">{["مواد خام","عدد ومعدات","مركبات","أخرى"].map((x)=><Button key={x} size="sm" variant="ghost" onClick={()=>setCategoryForm({...categoryForm,nameAr:x})}>{t(`اقتراح: ${x}`,`Suggestion: ${x}`)}</Button>)}</div>}
    </WarehousePanel>
    <Dialog open={!!editingWarehouse} onOpenChange={open=>{if(!open)setEditingWarehouse(null)}}><DialogContent><DialogHeader><DialogTitle>{t("تعديل المستودع","Edit warehouse")}</DialogTitle></DialogHeader>{editingWarehouse&&<div className="space-y-3"><Field label={t("الاسم بالعربية","Arabic name")}><Input value={editingWarehouse.nameAr} onChange={e=>setEditingWarehouse({...editingWarehouse,nameAr:e.target.value})}/></Field><Field label={t("الاسم بالإنجليزية","English name")}><Input value={editingWarehouse.nameEn||""} onChange={e=>setEditingWarehouse({...editingWarehouse,nameEn:e.target.value})}/></Field><Field label={t("العنوان","Address")}><Input value={editingWarehouse.address||""} onChange={e=>setEditingWarehouse({...editingWarehouse,address:e.target.value})}/></Field><Button className="w-full" disabled={mutation.isPending} onClick={()=>request("PATCH",`/warehouses/${editingWarehouse.id}`,{nameAr:editingWarehouse.nameAr,nameEn:editingWarehouse.nameEn,warehouseType:editingWarehouse.warehouseType,parentWarehouseId:editingWarehouse.parentWarehouseId,address:editingWarehouse.address,description:editingWarehouse.description,sections:editingWarehouse.sections,active:editingWarehouse.active},{onSuccess:()=>setEditingWarehouse(null)})}>{t("حفظ","Save")}</Button></div>}</DialogContent></Dialog>
    <Dialog open={!!editingCategory} onOpenChange={open=>{if(!open)setEditingCategory(null)}}><DialogContent><DialogHeader><DialogTitle>{t("تعديل الفئة","Edit category")}</DialogTitle></DialogHeader>{editingCategory&&<div className="space-y-3"><Field label={t("الاسم بالعربية","Arabic name")}><Input value={editingCategory.nameAr} onChange={e=>setEditingCategory({...editingCategory,nameAr:e.target.value})}/></Field><Field label={t("الاسم بالإنجليزية","English name")}><Input value={editingCategory.nameEn||""} onChange={e=>setEditingCategory({...editingCategory,nameEn:e.target.value})}/></Field><Field label={t("الفئة الرئيسية","Parent category")}><Select value={String(editingCategory.parentId||"root")} onValueChange={v=>setEditingCategory({...editingCategory,parentId:v==="root"?null:Number(v)})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="root">{t("بدون فئة رئيسية","Top level")}</SelectItem>{summary.categories.filter(c=>c.id!==editingCategory.id).map(c=><SelectItem key={c.id} value={String(c.id)}>{t(c.nameAr,c.nameEn||c.nameAr)}</SelectItem>)}</SelectContent></Select></Field><Button className="w-full" disabled={mutation.isPending} onClick={()=>request("PATCH",`/categories/${editingCategory.id}`,editingCategory,{onSuccess:()=>setEditingCategory(null)})}>{t("حفظ","Save")}</Button></div>}</DialogContent></Dialog>
  </div>;
}
