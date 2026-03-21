import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AdekoProduct } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, Download, ArrowLeft, Check, X, Package, Plus } from "lucide-react";
import { Link } from "wouter";

const USAGE_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  kitchen: { ar: "مطبخ", en: "Kitchen", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  wardrobe: { ar: "دواليب", en: "Wardrobe", color: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200" },
  both: { ar: "مشترك", en: "Both", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

const GROUP_LIST = [
  { code: "TK1", ar: "وحدات قاعدة", en: "TEAK BASE UNIT" },
  { code: "TK2", ar: "وحدات حوض", en: "TEAK SINK UNIT" },
  { code: "TK3", ar: "وحدات علوية", en: "TEAK WALL UNIT" },
  { code: "TK4", ar: "وحدات طويلة", en: "TEAK TALL UNIT" },
  { code: "TK5", ar: "وحدات ميكانيزم", en: "TEAK MECANISM UNIT" },
  { code: "TK6", ar: "ألواح وجوانب", en: "TEAK shelf-panel-side" },
];

const defaultForm = {
  code: "", descriptionAr: "", descriptionEn: "", groupCode: "TK1",
  manufacturingW: "", manufacturingH: "", manufacturingD: "",
  designW: "", designH: "", designD: "",
  priceBeforeVat: "0", usageType: "kitchen",
};

export default function SettingsProductsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editUsage, setEditUsage] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const { data: products = [], isLoading } = useQuery<AdekoProduct[]>({
    queryKey: ["/api/adeko-products", search, groupFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (groupFilter && groupFilter !== "all") params.set("groupCode", groupFilter);
      const res = await fetch(`/api/adeko-products?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: groups = [] } = useQuery<{ groupCode: string; groupNameAr: string; groupNameEn: string; count: number }[]>({
    queryKey: ["/api/adeko-products/groups"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, any> }) =>
      apiRequest("PATCH", `/api/adeko-products/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adeko-products"] });
      setEditingId(null);
      setEditPrice("");
      setEditUsage(null);
      toast({ title: t("تم التحديث", "Updated") });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof defaultForm) => apiRequest("POST", "/api/adeko-products", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adeko-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/adeko-products/groups"] });
      setShowAddDialog(false);
      setForm(defaultForm);
      toast({ title: t("تمت إضافة المنتج", "Product added") });
    },
    onError: (err: any) => {
      toast({ title: err?.message || t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const groupColorMap: Record<string, string> = {
    TK1: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    TK2: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    TK3: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    TK4: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    TK5: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    TK6: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  };

  const handleExport = () => window.open("/api/adeko-products/export", "_blank");

  const startEdit = (product: AdekoProduct) => {
    setEditingId(product.id);
    setEditPrice(product.priceBeforeVat || "0");
    setEditUsage(product.usageType || "kitchen");
  };

  const saveEdit = (id: number) => {
    const data: Record<string, any> = {};
    if (editPrice !== "") data.priceBeforeVat = editPrice;
    if (editUsage !== null) data.usageType = editUsage;
    updateMutation.mutate({ id, data });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPrice("");
    setEditUsage(null);
  };

  const handleCreate = () => {
    if (!form.code.trim() || !form.descriptionEn.trim()) {
      toast({ title: t("الكود والوصف مطلوبان", "Code and description required"), variant: "destructive" });
      return;
    }
    createMutation.mutate(form);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="ghost" size="icon" data-testid="button-back-settings">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-products-title">
              {t("مكتبة منتجات TEAK", "TEAK Product Library")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(`${products.length} منتج من Adeko`, `${products.length} Adeko products`)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-product">
            <Plus className="w-4 h-4 me-2" />
            {t("إضافة منتج", "Add Product")}
          </Button>
          <Button onClick={handleExport} variant="outline" data-testid="button-export-products">
            <Download className="w-4 h-4 me-2" />
            {t("تصدير Excel", "Export Excel")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("بحث بالكود أو الوصف...", "Search by code or description...")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ps-9"
            data-testid="input-search-products"
          />
        </div>
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-full sm:w-[240px]" data-testid="select-group-filter">
            <SelectValue placeholder={t("كل المجموعات", "All Groups")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("كل المجموعات", "All Groups")}</SelectItem>
            {groups.map(g => (
              <SelectItem key={g.groupCode} value={g.groupCode}>
                {g.groupCode} - {t(g.groupNameAr, g.groupNameEn)} ({g.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {groups.map(g => (
            <Badge
              key={g.groupCode}
              variant="outline"
              className={`cursor-pointer ${groupFilter === g.groupCode ? "ring-2 ring-primary" : ""}`}
              onClick={() => setGroupFilter(groupFilter === g.groupCode ? "all" : g.groupCode)}
              data-testid={`badge-group-${g.groupCode}`}
            >
              {g.groupCode}: {t(g.groupNameAr, g.groupNameEn)} ({g.count})
            </Badge>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="w-5 h-5" />
            {t("المنتجات", "Products")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium w-[50px]"></th>
                  <th className="text-start p-3 font-medium">{t("الكود", "Code")}</th>
                  <th className="text-start p-3 font-medium">{t("الوصف", "Description")}</th>
                  <th className="text-start p-3 font-medium">{t("المجموعة", "Group")}</th>
                  <th className="text-start p-3 font-medium">{t("الاستخدام", "Usage")}</th>
                  <th className="text-start p-3 font-medium">{t("أبعاد تصنيعية", "Mfg Dims")}</th>
                  <th className="text-start p-3 font-medium">{t("السعر قبل الضريبة", "Price (excl. VAT)")}</th>
                  <th className="text-start p-3 font-medium">{t("السعر بعد الضريبة", "Price (incl. VAT)")}</th>
                  <th className="text-start p-3 font-medium w-[120px]"></th>
                </tr>
              </thead>
              <tbody>
                {products.map(product => {
                  const usageMeta = USAGE_LABELS[product.usageType || "kitchen"] || USAGE_LABELS.kitchen;
                  return (
                    <tr
                      key={product.id}
                      className="border-b hover:bg-muted/30 transition-colors"
                      data-testid={`row-product-${product.id}`}
                    >
                      <td className="p-3">
                        {product.thumbnail ? (
                          <img
                            src={product.thumbnail}
                            alt={product.code}
                            className="w-10 h-10 object-contain rounded border bg-white"
                            data-testid={`img-product-${product.id}`}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center">
                            <Package className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-xs font-semibold" data-testid={`text-code-${product.id}`}>
                          {product.code}
                        </span>
                      </td>
                      <td className="p-3 max-w-[200px]">
                        <span className="truncate block" data-testid={`text-desc-${product.id}`}>
                          {product.descriptionEn}
                        </span>
                      </td>
                      <td className="p-3">
                        <Badge className={groupColorMap[product.groupCode] || ""} variant="secondary">
                          {product.groupCode}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {editingId === product.id ? (
                          <Select value={editUsage || "kitchen"} onValueChange={setEditUsage}>
                            <SelectTrigger className="h-7 text-xs w-28" data-testid={`select-usage-${product.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="kitchen">{t("مطبخ", "Kitchen")}</SelectItem>
                              <SelectItem value="wardrobe">{t("دواليب", "Wardrobe")}</SelectItem>
                              <SelectItem value="both">{t("مشترك", "Both")}</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={usageMeta.color} variant="secondary" data-testid={`badge-usage-${product.id}`}>
                            {t(usageMeta.ar, usageMeta.en)}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {product.manufacturingW}x{product.manufacturingH}x{product.manufacturingD}
                      </td>
                      <td className="p-3">
                        {editingId === product.id ? (
                          <Input
                            type="number"
                            value={editPrice}
                            onChange={e => setEditPrice(e.target.value)}
                            className="w-28 h-8 text-sm"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === "Enter") saveEdit(product.id);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            data-testid={`input-price-${product.id}`}
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:text-primary hover:underline tabular-nums"
                            onClick={() => startEdit(product)}
                            data-testid={`text-price-${product.id}`}
                          >
                            {parseFloat(product.priceBeforeVat || "0").toLocaleString("en-SA", { minimumFractionDigits: 2 })} SAR
                          </span>
                        )}
                      </td>
                      <td className="p-3 tabular-nums text-muted-foreground">
                        {parseFloat(product.priceAfterVat || "0").toLocaleString("en-SA", { minimumFractionDigits: 2 })} SAR
                      </td>
                      <td className="p-3">
                        {editingId === product.id ? (
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => saveEdit(product.id)}
                              disabled={updateMutation.isPending}
                              data-testid={`button-save-${product.id}`}
                            >
                              {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-green-600" />}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={cancelEdit}
                              data-testid={`button-cancel-${product.id}`}
                            >
                              <X className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => startEdit(product)}
                            data-testid={`button-edit-${product.id}`}
                          >
                            {t("تعديل", "Edit")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      {t("لا توجد منتجات", "No products found")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("إضافة منتج جديد", "Add New Product")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>{t("كود المنتج *", "Product Code *")}</Label>
                <Input
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. A1C1K 45"
                  className="font-mono"
                  data-testid="input-new-code"
                />
              </div>
              <div>
                <Label>{t("الوصف بالعربي", "Arabic Description")}</Label>
                <Input
                  value={form.descriptionAr}
                  onChange={e => setForm({ ...form, descriptionAr: e.target.value })}
                  placeholder={t("وصف المنتج بالعربي", "Product description in Arabic")}
                  data-testid="input-new-desc-ar"
                />
              </div>
              <div>
                <Label>{t("الوصف بالإنجليزي *", "English Description *")}</Label>
                <Input
                  value={form.descriptionEn}
                  onChange={e => setForm({ ...form, descriptionEn: e.target.value })}
                  placeholder="Product description in English"
                  data-testid="input-new-desc-en"
                />
              </div>
              <div>
                <Label>{t("المجموعة", "Group")}</Label>
                <Select value={form.groupCode} onValueChange={v => setForm({ ...form, groupCode: v })}>
                  <SelectTrigger data-testid="select-new-group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUP_LIST.map(g => (
                      <SelectItem key={g.code} value={g.code}>
                        {g.code} - {t(g.ar, g.en)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("الاستخدام", "Usage")}</Label>
                <Select value={form.usageType} onValueChange={v => setForm({ ...form, usageType: v })}>
                  <SelectTrigger data-testid="select-new-usage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kitchen">{t("مطبخ", "Kitchen")}</SelectItem>
                    <SelectItem value="wardrobe">{t("دواليب", "Wardrobe")}</SelectItem>
                    <SelectItem value="both">{t("مشترك", "Both")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">{t("الأبعاد التصنيعية (سم)", "Manufacturing Dimensions (cm)")}</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">{t("العرض", "Width")}</Label>
                  <Input type="number" value={form.manufacturingW} onChange={e => setForm({ ...form, manufacturingW: e.target.value })} placeholder="0" data-testid="input-mfg-w" />
                </div>
                <div>
                  <Label className="text-xs">{t("الارتفاع", "Height")}</Label>
                  <Input type="number" value={form.manufacturingH} onChange={e => setForm({ ...form, manufacturingH: e.target.value })} placeholder="0" data-testid="input-mfg-h" />
                </div>
                <div>
                  <Label className="text-xs">{t("العمق", "Depth")}</Label>
                  <Input type="number" value={form.manufacturingD} onChange={e => setForm({ ...form, manufacturingD: e.target.value })} placeholder="0" data-testid="input-mfg-d" />
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">{t("الأبعاد التصميمية (سم)", "Design Dimensions (cm)")}</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">{t("العرض", "Width")}</Label>
                  <Input type="number" value={form.designW} onChange={e => setForm({ ...form, designW: e.target.value })} placeholder="0" data-testid="input-des-w" />
                </div>
                <div>
                  <Label className="text-xs">{t("الارتفاع", "Height")}</Label>
                  <Input type="number" value={form.designH} onChange={e => setForm({ ...form, designH: e.target.value })} placeholder="0" data-testid="input-des-h" />
                </div>
                <div>
                  <Label className="text-xs">{t("العمق", "Depth")}</Label>
                  <Input type="number" value={form.designD} onChange={e => setForm({ ...form, designD: e.target.value })} placeholder="0" data-testid="input-des-d" />
                </div>
              </div>
            </div>

            <div>
              <Label>{t("السعر قبل الضريبة (ر.س)", "Price Before VAT (SAR)")}</Label>
              <Input type="number" value={form.priceBeforeVat} onChange={e => setForm({ ...form, priceBeforeVat: e.target.value })} placeholder="0" data-testid="input-new-price" />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => { setShowAddDialog(false); setForm(defaultForm); }}>
                {t("إلغاء", "Cancel")}
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-confirm-add">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Plus className="w-4 h-4 me-2" />}
                {t("إضافة", "Add")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
