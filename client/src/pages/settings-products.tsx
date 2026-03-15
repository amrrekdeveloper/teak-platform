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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Download, ArrowLeft, Check, X, Package } from "lucide-react";
import { Link } from "wouter";

export default function SettingsProductsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState("");

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
    mutationFn: ({ id, data }: { id: number; data: { priceBeforeVat: string } }) =>
      apiRequest("PATCH", `/api/adeko-products/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adeko-products"] });
      setEditingId(null);
      setEditPrice("");
      toast({ title: t("تم تحديث السعر", "Price updated") });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const handleExport = () => {
    window.open("/api/adeko-products/export", "_blank");
  };

  const startEdit = (product: AdekoProduct) => {
    setEditingId(product.id);
    setEditPrice(product.priceBeforeVat || "0");
  };

  const saveEdit = (id: number) => {
    updateMutation.mutate({ id, data: { priceBeforeVat: editPrice } });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPrice("");
  };

  const groupColorMap: Record<string, string> = {
    TK1: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    TK2: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    TK3: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    TK4: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    TK5: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    TK6: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
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
        <Button onClick={handleExport} variant="outline" data-testid="button-export-products">
          <Download className="w-4 h-4 me-2" />
          {t("تصدير Excel", "Export Excel")}
        </Button>
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
                  <th className="text-start p-3 font-medium">{t("أبعاد تصنيعية", "Mfg Dims")}</th>
                  <th className="text-start p-3 font-medium">{t("أبعاد تصميمية", "Design Dims")}</th>
                  <th className="text-start p-3 font-medium">{t("السعر قبل الضريبة", "Price (excl. VAT)")}</th>
                  <th className="text-start p-3 font-medium">{t("السعر بعد الضريبة", "Price (incl. VAT)")}</th>
                  <th className="text-start p-3 font-medium w-[100px]"></th>
                </tr>
              </thead>
              <tbody>
                {products.map(product => (
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
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {product.manufacturingW}x{product.manufacturingH}x{product.manufacturingD}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {product.designW}x{product.designH}x{product.designD}
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
                            data-testid={`button-save-price-${product.id}`}
                          >
                            {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-green-600" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={cancelEdit}
                            data-testid={`button-cancel-price-${product.id}`}
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
                          data-testid={`button-edit-price-${product.id}`}
                        >
                          {t("تعديل", "Edit")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
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
    </div>
  );
}
