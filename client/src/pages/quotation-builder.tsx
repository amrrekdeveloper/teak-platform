import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Customer, WoodType, DoorType, Product, DesignAssignment } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, Calculator, ArrowLeft, ArrowRight, Paperclip, Image, FileText, Search, Package, Ruler } from "lucide-react";

type ItemMode = "area" | "product";

interface LineItem {
  id: string;
  mode: ItemMode;
  productType: string;
  woodType: string;
  doorType: string;
  description: string;
  area: number;
  pricePerMeter: number;
  adekoProductId: number | null;
  adekoCode: string;
  adekoNameAr: string;
  adekoNameEn: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export default function QuotationBuilderPage() {
  const { t, isRTL, lang } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const preselectedCustomerId = searchParams.get("customerId");

  const [customerId, setCustomerId] = useState(preselectedCustomerId || "");
  const [items, setItems] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [deliveryDays, setDeliveryDays] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [adekoSearch, setAdekoSearch] = useState("");
  const [adekoDialog, setAdekoDialog] = useState<string | null>(null);

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: woodTypes = [] } = useQuery<WoodType[]>({ queryKey: ["/api/wood-types"] });
  const { data: doorTypes = [] } = useQuery<DoorType[]>({ queryKey: ["/api/door-types"] });
  const { data: adekoProducts = [] } = useQuery<any[]>({ queryKey: ["/api/adeko-products"] });

  const { data: designAssignments = [] } = useQuery<DesignAssignment[]>({
    queryKey: ["/api/design-assignments/customer", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const res = await fetch(`/api/design-assignments/customer/${customerId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!customerId,
  });

  const completedDesign = designAssignments.find(da => da.status === "completed");

  const categoryLabels: Record<string, { ar: string; en: string }> = {
    kitchen: { ar: "مطبخ", en: "Kitchen" },
    wardrobe: { ar: "خزانة ملابس", en: "Wardrobe" },
    door: { ar: "باب", en: "Door" },
    decoration: { ar: "ديكور", en: "Decoration" },
    hotel: { ar: "تجهيز فنادق", en: "Hotel Furnishing" },
  };

  function newItem(mode: ItemMode): LineItem {
    return {
      id: Date.now().toString(),
      mode,
      productType: "",
      woodType: "",
      doorType: "",
      description: "",
      area: 0,
      pricePerMeter: 0,
      adekoProductId: null,
      adekoCode: "",
      adekoNameAr: "",
      adekoNameEn: "",
      qty: 1,
      unitPrice: 0,
      total: 0,
    };
  }

  const addAreaItem = () => setItems([...items, newItem("area")]);
  const addProductItem = () => setItems([...items, newItem("product")]);

  const removeItem = (id: string) => setItems(items.filter((i) => i.id !== id));

  const updateItem = (id: string, field: string, value: any) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };

        if (item.mode === "area") {
          if (field === "woodType") {
            const wt = woodTypes.find((w) => w.id === parseInt(value));
            if (wt) {
              updated.pricePerMeter = parseFloat(wt.pricePerMeter);
              updated.total = updated.area * parseFloat(wt.pricePerMeter);
            }
          }
          if (field === "doorType") {
            const dt = doorTypes.find((d) => d.id === parseInt(value));
            if (dt) {
              updated.pricePerMeter = parseFloat(dt.pricePerMeter);
              updated.total = updated.area * parseFloat(dt.pricePerMeter);
            }
          }
          if (field === "area") {
            updated.total = parseFloat(value) * updated.pricePerMeter;
          }
          if (field === "pricePerMeter") {
            updated.total = updated.area * parseFloat(value || "0");
          }
        }

        if (item.mode === "product") {
          if (field === "qty") {
            updated.total = parseFloat(value || "1") * updated.unitPrice;
          }
          if (field === "unitPrice") {
            updated.total = updated.qty * parseFloat(value || "0");
          }
        }

        return updated;
      })
    );
  };

  const selectAdekoProduct = (itemId: string, product: any) => {
    setItems(
      items.map((item) => {
        if (item.id !== itemId) return item;
        const unitPrice = parseFloat(product.priceBeforeVat || product.price || "0");
        return {
          ...item,
          adekoProductId: product.id,
          adekoCode: product.code,
          adekoNameAr: product.nameAr,
          adekoNameEn: product.nameEn,
          description: lang === "ar" ? product.nameAr : product.nameEn,
          unitPrice,
          total: item.qty * unitPrice,
        };
      })
    );
    setAdekoDialog(null);
    setAdekoSearch("");
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
    const totalArea = items.filter(i => i.mode === "area").reduce((sum, i) => sum + (i.area || 0), 0);
    const vatAmount = subtotal * 0.15;
    const totalPrice = subtotal + vatAmount;
    const finalPrice = totalPrice - discount;
    return { totalArea, subtotal, vatAmount, totalPrice, finalPrice };
  }, [items, discount]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/quotations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests"] });
      toast({ title: t("تم إنشاء عرض السعر بنجاح", "Quotation created successfully") });
      setLocation("/quotations");
    },
    onError: () => {
      toast({ title: t("حدث خطأ في إنشاء عرض السعر", "Error creating quotation"), variant: "destructive" });
    },
  });

  const handleSubmit = (status: "draft" | "sent") => {
    if (!customerId) {
      toast({ title: t("يجب اختيار العميل", "Customer is required"), variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: t("يجب إضافة عنصر واحد على الأقل", "Add at least one item"), variant: "destructive" });
      return;
    }

    createMutation.mutate({
      customerId: parseInt(customerId),
      items: items.map((i) => ({
        mode: i.mode,
        productType: i.productType,
        woodType: i.woodType,
        doorType: i.doorType,
        description: i.description,
        area: i.mode === "area" ? i.area : 0,
        pricePerMeter: i.mode === "area" ? i.pricePerMeter : 0,
        adekoProductId: i.adekoProductId,
        adekoCode: i.adekoCode,
        adekoNameAr: i.adekoNameAr,
        adekoNameEn: i.adekoNameEn,
        qty: i.mode === "product" ? i.qty : 1,
        unitPrice: i.mode === "product" ? i.unitPrice : i.pricePerMeter,
        total: i.total,
      })),
      totalArea: String(totals.totalArea),
      subtotal: String(totals.subtotal),
      vatRate: "15",
      vatAmount: String(totals.vatAmount),
      totalPrice: String(totals.totalPrice),
      discount: String(discount),
      finalPrice: String(totals.finalPrice),
      status,
      deliveryDays: deliveryDays || null,
      notes,
      designFile: completedDesign?.sketchImage || null,
    });
  };

  const filteredAdeko = useMemo(() => {
    if (!adekoSearch.trim()) return adekoProducts.slice(0, 60);
    const q = adekoSearch.toLowerCase();
    return adekoProducts.filter((p: any) =>
      p.nameAr?.toLowerCase().includes(q) ||
      p.nameEn?.toLowerCase().includes(q) ||
      p.code?.toLowerCase().includes(q)
    ).slice(0, 60);
  }, [adekoProducts, adekoSearch]);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/quotations")} data-testid="button-back">
          <BackIcon className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-builder-title">
            {t("إنشاء عرض سعر", "Create Quotation")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("أنشئ عرض سعر جديد للعميل", "Create a new price quotation")}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("اختيار العميل", "Select Customer")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger data-testid="select-customer">
                <SelectValue placeholder={t("اختر العميل", "Select customer")} />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.fullName} - {c.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {completedDesign && (
          <Card className="border-green-200 dark:border-green-800" dir={isRTL ? "rtl" : "ltr"} data-testid="card-designer-attachments">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className={`text-base flex items-center gap-2 ${isRTL ? "text-right" : "text-left"}`}>
                <Paperclip className="w-4 h-4 text-green-600 shrink-0" />
                {t("مرفقات المصمم", "Designer Attachments")}
                <Badge variant="secondary" className="text-xs shrink-0">
                  {t("مكتمل", "Completed")}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {completedDesign.sketchImage && (
                <div className="space-y-1">
                  <p className={`text-sm font-medium flex items-center gap-1 ${isRTL ? "text-right" : "text-left"}`}>
                    <Image className="w-3 h-3 shrink-0" />
                    {t("رسم التصميم", "Design Sketch")}
                  </p>
                  <div className="border rounded-md overflow-hidden max-w-md">
                    <img
                      src={completedDesign.sketchImage}
                      alt="Design Sketch"
                      className="w-full h-auto"
                      data-testid="img-design-sketch"
                    />
                  </div>
                </div>
              )}
              {completedDesign.designFiles && completedDesign.designFiles.length > 0 && (
                <div className="space-y-1">
                  <p className={`text-sm font-medium flex items-center gap-1 ${isRTL ? "text-right" : "text-left"}`}>
                    <FileText className="w-3 h-3 shrink-0" />
                    {t("ملفات التصميم", "Design Files")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {completedDesign.designFiles.map((file: string, idx: number) => (
                      <a
                        key={idx}
                        href={file}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary underline"
                        data-testid={`link-design-file-${idx}`}
                      >
                        {t(`ملف ${idx + 1}`, `File ${idx + 1}`)}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle>{t("البنود", "Line Items")}</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addProductItem} data-testid="button-add-product-item">
                <Package className="w-3 h-3 me-1" /> {t("منتج Adeko", "Adeko Product")}
              </Button>
              <Button size="sm" onClick={addAreaItem} data-testid="button-add-item">
                <Ruler className="w-3 h-3 me-1" /> {t("تسعير بالمتر", "By m²")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("اضغط لإضافة بند — منتج Adeko أو تسعير بالمتر المربع", "Add an item — Adeko product or m² pricing")}
                </p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={addProductItem} data-testid="button-add-product-empty">
                    <Package className="w-4 h-4 me-1" /> {t("منتج Adeko", "Adeko Product")}
                  </Button>
                  <Button onClick={addAreaItem} data-testid="button-add-area-empty">
                    <Ruler className="w-4 h-4 me-1" /> {t("تسعير بالمتر²", "By m²")}
                  </Button>
                </div>
              </div>
            ) : (
              items.map((item, index) => (
                <div
                  key={item.id}
                  className="p-4 border rounded-lg space-y-3"
                  data-testid={`item-${index}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {t(`بند ${index + 1}`, `Item ${index + 1}`)}
                      </span>
                      <Badge variant={item.mode === "product" ? "secondary" : "outline"} className="text-[10px]">
                        {item.mode === "product" ? t("منتج", "Product") : t("متر²", "m²")}
                      </Badge>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => removeItem(item.id)}
                      data-testid={`button-remove-item-${index}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {item.mode === "product" ? (
                    <div className="space-y-3">
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-2 text-sm h-10"
                        onClick={() => { setAdekoDialog(item.id); setAdekoSearch(""); }}
                        data-testid={`button-select-adeko-${index}`}
                      >
                        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                        {item.adekoProductId ? (
                          <span className="truncate font-medium">{lang === "ar" ? item.adekoNameAr : item.adekoNameEn} <span className="font-normal text-muted-foreground">({item.adekoCode})</span></span>
                        ) : (
                          <span className="text-muted-foreground">{t("اختر منتج من مكتبة Adeko", "Choose product from Adeko library")}</span>
                        )}
                      </Button>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">{t("الكمية", "Quantity")}</Label>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={item.qty || ""}
                            onChange={(e) => updateItem(item.id, "qty", parseFloat(e.target.value) || 1)}
                            data-testid={`input-qty-${index}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("سعر الوحدة (ريال)", "Unit Price (SAR)")}</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice || ""}
                            onChange={(e) => updateItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            data-testid={`input-unit-price-${index}`}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("وصف إضافي", "Description")}</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(item.id, "description", e.target.value)}
                          placeholder={t("اختياري", "Optional")}
                          data-testid={`input-description-${index}`}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">{t("نوع المنتج", "Product Type")}</Label>
                        <Select
                          value={item.productType}
                          onValueChange={(v) => updateItem(item.id, "productType", v)}
                        >
                          <SelectTrigger data-testid={`select-product-${index}`}>
                            <SelectValue placeholder={t("اختر", "Select")} />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(categoryLabels).map(([key, label]) => (
                              <SelectItem key={key} value={key}>
                                {t(label.ar, label.en)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">{t("نوع الخشب", "Wood Type")}</Label>
                        <Select
                          value={item.woodType}
                          onValueChange={(v) => updateItem(item.id, "woodType", v)}
                        >
                          <SelectTrigger data-testid={`select-wood-${index}`}>
                            <SelectValue placeholder={t("اختر", "Select")} />
                          </SelectTrigger>
                          <SelectContent>
                            {woodTypes.map((wt) => (
                              <SelectItem key={wt.id} value={String(wt.id)}>
                                {t(wt.nameAr, wt.nameEn)} - {parseFloat(wt.pricePerMeter).toLocaleString()} SAR/م²
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {item.productType === "door" && (
                        <div className="space-y-1">
                          <Label className="text-xs">{t("نوع الباب", "Door Type")}</Label>
                          <Select
                            value={item.doorType}
                            onValueChange={(v) => updateItem(item.id, "doorType", v)}
                          >
                            <SelectTrigger data-testid={`select-door-${index}`}>
                              <SelectValue placeholder={t("اختر", "Select")} />
                            </SelectTrigger>
                            <SelectContent>
                              {doorTypes.map((dt) => (
                                <SelectItem key={dt.id} value={String(dt.id)}>
                                  {t(dt.nameAr, dt.nameEn)} - {parseFloat(dt.pricePerMeter).toLocaleString()} SAR/م²
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label className="text-xs">{t("المساحة (م²)", "Area (m²)")}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.area || ""}
                          onChange={(e) => updateItem(item.id, "area", parseFloat(e.target.value) || 0)}
                          data-testid={`input-area-${index}`}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">{t("سعر/م² (ريال)", "Price/m² (SAR)")}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.pricePerMeter || ""}
                          onChange={(e) => updateItem(item.id, "pricePerMeter", parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          data-testid={`input-price-per-meter-${index}`}
                        />
                      </div>

                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">{t("وصف إضافي", "Description")}</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(item.id, "description", e.target.value)}
                          placeholder={t("اختياري", "Optional")}
                          data-testid={`input-description-${index}`}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t text-sm">
                    {item.mode === "product" ? (
                      <span className="text-muted-foreground">
                        {item.qty} × {item.unitPrice.toLocaleString()} SAR
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {t("السعر/م²:", "Price/m²:")} {item.pricePerMeter.toLocaleString()} SAR
                      </span>
                    )}
                    <span className="font-bold text-primary">
                      {t("الإجمالي:", "Total:")} {item.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {items.length > 0 && (
          <>
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("خصم (ريال)", "Discount (SAR)")}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={discount || ""}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      data-testid="input-discount"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("فترة التسليم (أيام عمل)", "Delivery Period (working days)")}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={deliveryDays || ""}
                      onChange={(e) => setDeliveryDays(parseInt(e.target.value) || null)}
                      placeholder={t("مثال: 30", "e.g. 30")}
                      data-testid="input-delivery-days"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("ملاحظات", "Notes")}</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    data-testid="input-notes"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="w-5 h-5 text-primary" />
                  <span className="font-bold">{t("ملخص السعر", "Price Summary")}</span>
                </div>
                <div className="space-y-2 text-sm">
                  {totals.totalArea > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("إجمالي المساحة", "Total Area")}</span>
                      <span>{totals.totalArea.toFixed(2)} {t("م²", "m²")}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("المجموع قبل الضريبة", "Subtotal")}</span>
                    <span>{totals.subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("ضريبة القيمة المضافة (15%)", "VAT (15%)")}</span>
                    <span>{totals.vatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>{t("الخصم", "Discount")}</span>
                      <span>-{discount.toLocaleString()} SAR</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold pt-2 border-t">
                    <span>{t("الإجمالي النهائي", "Final Total")}</span>
                    <span className="text-primary" data-testid="text-final-total">
                      {totals.finalPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleSubmit("draft")}
                disabled={createMutation.isPending}
                data-testid="button-save-draft"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("حفظ كمسودة", "Save as Draft")}
              </Button>
              <Button
                className="flex-1"
                onClick={() => handleSubmit("sent")}
                disabled={createMutation.isPending}
                data-testid="button-send-quotation"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إرسال للعميل", "Send to Customer")}
              </Button>
            </div>
          </>
        )}
      </div>

      <Dialog open={!!adekoDialog} onOpenChange={(o) => { if (!o) { setAdekoDialog(null); setAdekoSearch(""); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col" data-testid="dialog-adeko-picker">
          <DialogHeader>
            <DialogTitle>{t("اختيار منتج Adeko", "Select Adeko Product")}</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="ps-9"
              placeholder={t("ابحث بالاسم أو الكود...", "Search by name or code...")}
              value={adekoSearch}
              onChange={(e) => setAdekoSearch(e.target.value)}
              autoFocus
              data-testid="input-adeko-search"
            />
          </div>
          <div className="overflow-y-auto flex-1 space-y-1">
            {filteredAdeko.length === 0 ? (
              <p className="text-center py-6 text-sm text-muted-foreground">{t("لا توجد نتائج", "No results")}</p>
            ) : (
              filteredAdeko.map((p: any) => (
                <button
                  key={p.id}
                  className="w-full text-start px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-colors border border-transparent hover:border-border"
                  onClick={() => adekoDialog && selectAdekoProduct(adekoDialog, p)}
                  data-testid={`adeko-product-${p.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{lang === "ar" ? p.nameAr : p.nameEn}</p>
                      <p className="text-xs text-muted-foreground">{p.code} · {lang === "ar" ? p.groupNameAr : p.groupNameEn}</p>
                    </div>
                    {parseFloat(p.priceBeforeVat || "0") > 0 ? (
                      <span className="text-xs font-semibold text-primary shrink-0">
                        {parseFloat(p.priceBeforeVat).toLocaleString()} SAR
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">{t("السعر يدوي", "Manual price")}</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
