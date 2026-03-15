import { useState, useMemo, useCallback, useEffect } from "react";
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
import { Plus, Trash2, Loader2, Calculator, ArrowLeft, ArrowRight, Paperclip, Image, FileText, Search, Package, Ruler, Send, Save, ChevronDown, ChevronUp, Settings2 } from "lucide-react";

type ItemMode = "area" | "product";

interface ProductOption {
  value: string;
  labelAr: string;
  labelEn: string;
  price: number;
}

interface PricingOptions {
  drawerType: ProductOption[];
  hingeType: ProductOption[];
  liftMechanism: ProductOption[];
}

interface LineItem {
  id: string;
  mode: ItemMode;
  productId: number | null;
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
  total: number;
  quantity: number;
  unitPrice: number;
  optionsCost: number;
  optionDetails: Record<string, { name: string; price: number }>;
  options: {
    drawerType: string;
    hingeType: string;
    liftMechanism: string;
  };
  code: string;
  nameAr: string;
  nameEn: string;
  dimensions: { w: number; h: number; d: number };
  useAdeko: boolean;
  showOptions: boolean;
}

function createEmptyItem(): LineItem {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    mode: "product" as ItemMode,
    productId: null,
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
    total: 0,
    quantity: 1,
    unitPrice: 0,
    optionsCost: 0,
    optionDetails: {},
    options: { drawerType: "standard", hingeType: "standard", liftMechanism: "none" },
    code: "",
    nameAr: "",
    nameEn: "",
    dimensions: { w: 0, h: 0, d: 0 },
    useAdeko: true,
    showOptions: false,
  };
}

export default function QuotationBuilderPage() {
  const { t, isRTL, lang } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const preselectedCustomerId = searchParams.get("customerId");
  const preselectedSurveyId = searchParams.get("surveyId");

  const [customerId, setCustomerId] = useState(preselectedCustomerId || "");
  const [items, setItems] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [deliveryDays, setDeliveryDays] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [adekoSearch, setAdekoSearch] = useState("");
  const [adekoDialog, setAdekoDialog] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: woodTypes = [] } = useQuery<WoodType[]>({ queryKey: ["/api/wood-types"] });
  const { data: doorTypes = [] } = useQuery<DoorType[]>({ queryKey: ["/api/door-types"] });
  const { data: adekoProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/adeko-products"],
    queryFn: async () => {
      const res = await fetch("/api/adeko-products?limit=500", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.products || []);
    },
  });

  const { data: surveyData } = useQuery<any>({
    queryKey: ["/api/site-surveys", preselectedSurveyId],
    queryFn: async () => {
      const res = await fetch(`/api/site-surveys/${preselectedSurveyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!preselectedSurveyId,
  });

  const [surveyLoaded, setSurveyLoaded] = useState(false);
  useEffect(() => {
    if (surveyData && !surveyLoaded && adekoProducts.length > 0) {
      setSurveyLoaded(true);
      const surveyProducts = (surveyData.selectedProducts || []) as any[];
      if (surveyProducts.length > 0 && items.length === 0) {
        const loadedItems: LineItem[] = surveyProducts.map((sp: any) => {
          const adeko = sp.productId ? adekoProducts.find((p: any) => p.id === sp.productId) : null;
          return {
            id: Date.now().toString() + Math.random().toString(36).slice(2),
            productId: sp.productId || null,
            productType: "",
            woodType: "",
            doorType: "",
            description: sp.name || sp.nameAr || sp.code || "",
            area: 0,
            pricePerMeter: 0,
            total: (parseFloat(sp.unitPrice || adeko?.priceBeforeVat || 0) + parseFloat(sp.optionsCost || 0)) * (sp.quantity || 1),
            quantity: sp.quantity || 1,
            unitPrice: parseFloat(sp.unitPrice || adeko?.priceBeforeVat || 0),
            optionsCost: parseFloat(sp.optionsCost || 0),
            optionDetails: sp.optionDetails || {},
            options: { drawerType: "standard", hingeType: "standard", liftMechanism: "none" },
            code: sp.code || adeko?.code || "",
            nameAr: sp.name || sp.nameAr || adeko?.descriptionAr || "",
            nameEn: sp.nameEn || adeko?.descriptionEn || "",
            dimensions: sp.dimensions || { w: adeko?.designW || 0, h: adeko?.designH || 0, d: adeko?.designD || 0 },
            useAdeko: !!sp.productId,
            showOptions: false,
          };
        });
        setItems(loadedItems);
        if (surveyData.customerId) {
          setCustomerId(String(surveyData.customerId));
        }
      }
    }
  }, [surveyData, surveyLoaded, adekoProducts, items.length]);

  const { data: pricingOptions } = useQuery<PricingOptions>({
    queryKey: ["/api/pricing/options"],
  });

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

  const filteredAdekoProducts = useMemo(() => {
    if (!productSearch.trim()) return adekoProducts.slice(0, 50);
    const q = productSearch.toLowerCase();
    return adekoProducts.filter((p: any) =>
      (p.code?.toLowerCase().includes(q)) ||
      (p.descriptionAr?.toLowerCase().includes(q)) ||
      (p.descriptionEn?.toLowerCase().includes(q)) ||
      (p.groupNameAr?.toLowerCase().includes(q)) ||
      (p.groupNameEn?.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [adekoProducts, productSearch]);

  const categoryLabels: Record<string, { ar: string; en: string }> = {
    kitchen: { ar: "مطبخ", en: "Kitchen" },
    wardrobe: { ar: "خزانة ملابس", en: "Wardrobe" },
    door: { ar: "باب", en: "Door" },
    decoration: { ar: "ديكور", en: "Decoration" },
    hotel: { ar: "تجهيز فنادق", en: "Hotel Furnishing" },
  };

  function newItem(mode: ItemMode): LineItem {
    return {
      ...createEmptyItem(),
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      mode,
      useAdeko: mode !== "area",
    };
  }

  const getOptionPrice = useCallback((optKey: string, optVal: string): number => {
    if (!pricingOptions) return 0;
    const opts = (pricingOptions as any)[optKey];
    if (!opts) return 0;
    const found = opts.find((o: ProductOption) => o.value === optVal);
    return found?.price || 0;
  }, [pricingOptions]);

  const addAreaItem = () => setItems([...items, newItem("area")]);
  const addProductItem = () => setItems([...items, newItem("product")]);
  const addItem = () => setItems([...items, createEmptyItem()]);

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
              updated.unitPrice = updated.area * parseFloat(wt.pricePerMeter);
              updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
            }
          }
          if (field === "doorType") {
            const dt = doorTypes.find((d) => d.id === parseInt(value));
            if (dt) {
              updated.pricePerMeter = parseFloat(dt.pricePerMeter);
              updated.unitPrice = updated.area * parseFloat(dt.pricePerMeter);
              updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
            }
          }
          if (field === "area") {
            const newArea = parseFloat(value) || 0;
            updated.area = newArea;
            updated.unitPrice = newArea * updated.pricePerMeter;
            updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
          }
          if (field === "pricePerMeter") {
            updated.pricePerMeter = parseFloat(value || "0");
            updated.unitPrice = updated.area * updated.pricePerMeter;
            updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
          }
          if (field === "quantity") {
            updated.quantity = parseInt(value) || 1;
            updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
          }
        }

        if (item.mode === "product") {
          if (field === "productId" && value) {
            const adeko = adekoProducts.find((p: any) => p.id === parseInt(value));
            if (adeko) {
              updated.unitPrice = parseFloat(adeko.priceBeforeVat?.toString() || "0");
              updated.code = adeko.code || "";
              updated.nameAr = adeko.descriptionAr || adeko.code || "";
              updated.nameEn = adeko.descriptionEn || adeko.code || "";
              updated.dimensions = {
                w: parseFloat(adeko.designW?.toString() || adeko.manufacturingW?.toString() || "0"),
                h: parseFloat(adeko.designH?.toString() || adeko.manufacturingH?.toString() || "0"),
                d: parseFloat(adeko.designD?.toString() || adeko.manufacturingD?.toString() || "0"),
              };
              updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
            }
          }
          if (field === "qty" || field === "quantity") {
            updated.quantity = parseInt(value) || 1;
            updated.qty = updated.quantity;
            updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
          }
          if (field === "unitPrice") {
            updated.unitPrice = parseFloat(value || "0");
            updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
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
        const qty = item.quantity || item.qty || 1;
        return {
          ...item,
          productId: product.id,
          adekoProductId: product.id,
          adekoCode: product.code,
          adekoNameAr: product.nameAr || product.descriptionAr,
          adekoNameEn: product.nameEn || product.descriptionEn,
          code: product.code,
          nameAr: product.nameAr || product.descriptionAr,
          nameEn: product.nameEn || product.descriptionEn,
          description: lang === "ar" ? (product.nameAr || product.descriptionAr) : (product.nameEn || product.descriptionEn),
          unitPrice,
          total: (unitPrice + item.optionsCost) * qty,
          dimensions: {
            w: parseFloat(product.designW?.toString() || product.manufacturingW?.toString() || "0"),
            h: parseFloat(product.designH?.toString() || product.manufacturingH?.toString() || "0"),
            d: parseFloat(product.designD?.toString() || product.manufacturingD?.toString() || "0"),
          }
        };
      })
    );
    setAdekoDialog(null);
    setAdekoSearch("");
  };

  const updateItemOption = (id: string, optKey: string, optVal: string) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item;
        const price = getOptionPrice(optKey, optVal);
        const newOptions = { ...item.options, [optKey]: optVal };
        const newOptDetails = { ...item.optionDetails };

        if (price > 0) {
          newOptDetails[optKey] = { name: optVal, price };
        } else {
          delete newOptDetails[optKey];
        }

        const newOptCost = Object.values(newOptDetails).reduce((s, d) => s + d.price, 0);
        const qty = item.quantity || item.qty || 1;
        const newTotal = (item.unitPrice + newOptCost) * qty;

        return {
          ...item,
          options: newOptions,
          optionDetails: newOptDetails,
          optionsCost: newOptCost,
          total: newTotal,
        };
      })
    );
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
    const totalArea = items.filter(i => i.mode === "area").reduce((sum, i) => sum + (i.area || 0), 0);
    const clampedDiscount = discountType === "percent" ? Math.max(0, Math.min(discount, 100)) : Math.max(0, Math.min(discount, subtotal));
    const discountAmount = discountType === "percent" ? (subtotal * clampedDiscount) / 100 : clampedDiscount;
    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const vatAmount = afterDiscount * 0.15;
    const finalPrice = afterDiscount + vatAmount;
    return { totalArea, subtotal, discountAmount, afterDiscount, vatAmount, finalPrice };
  }, [items, discount, discountType]);

  const saveMutation = useMutation({
    mutationFn: async (status: "draft" | "sent") => {
      const hasAdekoItems = items.some(i => i.useAdeko && i.productId);
      const hasManuItems = items.some(i => !i.useAdeko);

      if (hasAdekoItems) {
        const payload = {
          customerId: parseInt(customerId),
          lineItems: items.filter(i => i.useAdeko && i.productId).map(i => ({
            productId: i.productId,
            code: i.code,
            nameAr: i.nameAr,
            nameEn: i.nameEn,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            optionsCost: i.optionsCost,
            optionDetails: i.optionDetails,
            lineTotal: i.total,
            dimensions: i.dimensions,
          })),
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          vat: totals.vatAmount,
          total: totals.finalPrice,
          notes,
          deliveryDays,
          surveyId: preselectedSurveyId ? parseInt(preselectedSurveyId) : undefined,
        };

        if (hasManuItems) {
          payload.lineItems.push(
            ...items.filter(i => !i.useAdeko).map(i => ({
              productId: 0,
              code: i.productType,
              nameAr: i.description || t(categoryLabels[i.productType]?.ar || i.productType, categoryLabels[i.productType]?.en || i.productType),
              nameEn: i.description || categoryLabels[i.productType]?.en || i.productType,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              optionsCost: i.optionsCost,
              optionDetails: i.optionDetails,
              lineTotal: i.total,
              dimensions: i.dimensions,
            }))
          );
        }

        const res = await apiRequest("POST", "/api/pricing/save-quotation", payload);
        const quotation = await res.json();

        if (status === "sent") {
          await apiRequest("POST", `/api/pricing/send-to-customer/${quotation.id}`);
        }
        return quotation;
      } else {
        const res = await apiRequest("POST", "/api/quotations", {
          customerId: parseInt(customerId),
          items: items.map((i) => ({
            productType: i.productType,
            woodType: i.woodType,
            doorType: i.doorType,
            description: i.description,
            area: i.area,
            pricePerMeter: i.pricePerMeter,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            optionsCost: i.optionsCost,
            optionDetails: i.optionDetails,
            total: i.total,
          })),
          totalArea: String(items.reduce((s, i) => s + (i.area || 0), 0)),
          subtotal: String(totals.subtotal),
          vatRate: "15",
          vatAmount: String(totals.vatAmount),
          totalPrice: String(totals.finalPrice),
          discount: String(totals.discountAmount),
          finalPrice: String(totals.finalPrice),
          status,
          deliveryDays: deliveryDays || null,
          notes,
          designFile: completedDesign?.sketchImage || null,
        });
        return res.json();
      }
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
    saveMutation.mutate(status);
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
            {t("أنشئ عرض سعر جديد مع التسعير التلقائي", "Create a new quotation with automatic pricing")}
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
                    <img src={completedDesign.sketchImage} alt="Design Sketch" className="w-full h-auto" data-testid="img-design-sketch" />
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
              {completedDesign.measurements != null && (
                <div className="space-y-1">
                  <p className={`text-sm font-medium ${isRTL ? "text-right" : "text-left"}`}>{t("القياسات", "Measurements")}</p>
                  <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto" dir="ltr" data-testid="text-measurements">
                    {String(typeof completedDesign.measurements === "string" ? completedDesign.measurements : JSON.stringify(completedDesign.measurements, null, 2))}
                  </pre>
                </div>
              )}
              {completedDesign.notes && (
                <div className="space-y-1">
                  <p className={`text-sm font-medium ${isRTL ? "text-right" : "text-left"}`}>{t("ملاحظات المصمم", "Designer Notes")}</p>
                  <p className={`text-sm text-muted-foreground ${isRTL ? "text-right" : "text-left"}`} data-testid="text-designer-notes">{completedDesign.notes}</p>
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
                <div key={item.id} className="p-4 border rounded-lg space-y-3" data-testid={`item-${index}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{t(`بند ${index + 1}`, `Item ${index + 1}`)}</span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={item.useAdeko ? "default" : "outline"}
                          className="h-6 text-[10px] px-2"
                          onClick={() => updateItem(item.id, "useAdeko", true)}
                          data-testid={`button-adeko-mode-${index}`}
                        >
                          {t("كتالوج أديكو", "Adeko Catalog")}
                        </Button>
                        <Button
                          size="sm"
                          variant={!item.useAdeko ? "default" : "outline"}
                          className="h-6 text-[10px] px-2"
                          onClick={() => updateItem(item.id, "useAdeko", false)}
                          data-testid={`button-manual-mode-${index}`}
                        >
                          {t("يدوي", "Manual")}
                        </Button>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="text-destructive h-7 w-7" onClick={() => removeItem(item.id)} data-testid={`button-remove-item-${index}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {item.useAdeko ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs">{t("البحث في كتالوج أديكو", "Search Adeko Catalog")}</Label>
                        <div className="relative">
                          <Search className="absolute start-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                          <Input
                            className="ps-8 h-9 text-sm"
                            placeholder={t("ابحث بالاسم أو الكود...", "Search by name or code...")}
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            data-testid={`input-product-search-${index}`}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("المنتج", "Product")}</Label>
                        <Select
                          value={item.productId ? String(item.productId) : ""}
                          onValueChange={(v) => updateItem(item.id, "productId", v)}
                        >
                          <SelectTrigger data-testid={`select-adeko-product-${index}`}>
                            <SelectValue placeholder={t("اختر منتج من الكتالوج", "Select catalog product")} />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {filteredAdekoProducts.map((p: any) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                <span className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] bg-muted px-1 rounded">{p.code}</span>
                                  <span className="truncate">{t(p.descriptionAr || p.code, p.descriptionEn || p.code)}</span>
                                  <span className="text-muted-foreground text-[10px]">{parseFloat(p.priceBeforeVat || 0).toLocaleString()} SAR</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {item.productId && (
                        <div className="bg-muted/30 rounded-md p-2.5 text-xs space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{t("الكود", "Code")}</span>
                            <span className="font-mono">{item.code}</span>
                          </div>
                          {(item.dimensions.w > 0 || item.dimensions.h > 0) && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">{t("الأبعاد", "Dimensions")}</span>
                              <span dir="ltr">{item.dimensions.w} × {item.dimensions.h} × {item.dimensions.d} cm</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">{t("سعر الوحدة (ريال)", "Unit Price (SAR)")}</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice || ""}
                            onChange={(e) => updateItem(item.id, "unitPrice", e.target.value)}
                            className="h-8 text-sm"
                            placeholder="0.00"
                            data-testid={`input-unit-price-${index}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("الكمية", "Quantity")}</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                            className="h-8 text-sm"
                            data-testid={`input-quantity-${index}`}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
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
                          <Select value={item.doorType} onValueChange={(v) => updateItem(item.id, "doorType", v)}>
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
                        <Label className="text-xs">{t("الكمية", "Quantity")}</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                          className="h-9"
                          data-testid={`input-quantity-manual-${index}`}
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

                  <div className="border-t pt-2">
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      onClick={() => updateItem(item.id, "showOptions", !item.showOptions)}
                      data-testid={`button-toggle-options-${index}`}
                    >
                      <Settings2 className="w-3 h-3" />
                      {t("خيارات المنتج", "Product Options")}
                      {item.optionsCost > 0 && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">+{item.optionsCost.toLocaleString()} SAR</Badge>
                      )}
                      {item.showOptions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {item.showOptions && pricingOptions && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">{t("نوع الدرج", "Drawer Type")}</Label>
                          <Select value={item.options.drawerType} onValueChange={(v) => updateItemOption(item.id, "drawerType", v)}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-drawer-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {pricingOptions.drawerType.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {t(opt.labelAr, opt.labelEn)} {opt.price > 0 ? `(+${opt.price})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">{t("نوع المفصلة", "Hinge Type")}</Label>
                          <Select value={item.options.hingeType} onValueChange={(v) => updateItemOption(item.id, "hingeType", v)}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-hinge-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {pricingOptions.hingeType.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {t(opt.labelAr, opt.labelEn)} {opt.price > 0 ? `(+${opt.price})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">{t("آلية الرفع", "Lift Mechanism")}</Label>
                          <Select value={item.options.liftMechanism} onValueChange={(v) => updateItemOption(item.id, "liftMechanism", v)}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-lift-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {pricingOptions.liftMechanism.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {t(opt.labelAr, opt.labelEn)} {opt.price > 0 ? `(+${opt.price})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t text-sm">
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {item.useAdeko ? (
                        <span>{t("سعر الوحدة:", "Unit:")} {item.unitPrice.toLocaleString()} SAR</span>
                      ) : (
                        <span>{t("السعر/م²:", "Price/m²:")} {item.pricePerMeter.toLocaleString()} SAR</span>
                      )}
                      {item.optionsCost > 0 && (
                        <span className="ms-2 text-amber-600">+ {t("خيارات:", "Options:")} {item.optionsCost.toLocaleString()} SAR</span>
                      )}
                      {(item.quantity > 1 || item.qty > 1) && <span className="ms-2">× {item.quantity || item.qty}</span>}
                    </div>
                    <span className="font-bold text-primary" data-testid={`text-item-total-${index}`}>
                      {item.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR
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
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("نوع الخصم", "Discount Type")}</Label>
                    <Select value={discountType} onValueChange={(v: any) => setDiscountType(v)}>
                      <SelectTrigger className="h-9" data-testid="select-discount-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">{t("نسبة %", "Percentage %")}</SelectItem>
                        <SelectItem value="fixed">{t("مبلغ ثابت", "Fixed Amount")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {discountType === "percent" ? t("نسبة الخصم %", "Discount %") : t("مبلغ الخصم (ريال)", "Discount (SAR)")}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      max={discountType === "percent" ? 100 : undefined}
                      value={discount || ""}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      data-testid="input-discount"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("فترة التسليم (أيام)", "Delivery (days)")}</Label>
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
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} data-testid="input-notes" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="w-5 h-5 text-primary" />
                  <span className="font-bold">{t("ملخص التسعير", "Pricing Summary")}</span>
                </div>
                <div className="space-y-2 text-sm">
                  {totals.totalArea > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("إجمالي المساحة", "Total Area")}</span>
                      <span>{totals.totalArea.toFixed(2)} {t("م²", "m²")}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("عدد البنود", "Items Count")}</span>
                    <span>{items.length} {t("بند", "items")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("المجموع قبل الخصم", "Subtotal")}</span>
                    <span>{totals.subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
                  </div>
                  {totals.discountAmount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>{t("الخصم", "Discount")} {discountType === "percent" ? `(${discount}%)` : ""}</span>
                      <span>-{totals.discountAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("بعد الخصم", "After Discount")}</span>
                    <span>{totals.afterDiscount.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("ضريبة القيمة المضافة (15%)", "VAT (15%)")}</span>
                    <span>{totals.vatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
                  </div>
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
                disabled={saveMutation.isPending}
                data-testid="button-save-draft"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <><Save className="w-4 h-4 me-1.5" />{t("حفظ كمسودة", "Save as Draft")}</>
                )}
              </Button>
              <Button
                className="flex-1"
                onClick={() => handleSubmit("sent")}
                disabled={saveMutation.isPending}
                data-testid="button-send-quotation"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <><Send className="w-4 h-4 me-1.5" />{t("إرسال للعميل", "Send to Customer")}</>
                )}
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
