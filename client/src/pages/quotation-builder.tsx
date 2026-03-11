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
import { Plus, Trash2, Loader2, Calculator, ArrowLeft, ArrowRight, Paperclip, Image, FileText } from "lucide-react";

interface LineItem {
  id: string;
  productType: string;
  woodType: string;
  doorType: string;
  description: string;
  area: number;
  pricePerMeter: number;
  total: number;
}

export default function QuotationBuilderPage() {
  const { t, isRTL } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const preselectedCustomerId = searchParams.get("customerId");

  const [customerId, setCustomerId] = useState(preselectedCustomerId || "");
  const [items, setItems] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [deliveryDays, setDeliveryDays] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: woodTypes = [] } = useQuery<WoodType[]>({ queryKey: ["/api/wood-types"] });
  const { data: doorTypes = [] } = useQuery<DoorType[]>({ queryKey: ["/api/door-types"] });

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

  const addItem = () => {
    setItems([
      ...items,
      {
        id: Date.now().toString(),
        productType: "",
        woodType: "",
        doorType: "",
        description: "",
        area: 0,
        pricePerMeter: 0,
        total: 0,
      },
    ]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, field: string, value: any) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };

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

        return updated;
      })
    );
  };

  const totals = useMemo(() => {
    const totalArea = items.reduce((sum, i) => sum + (i.area || 0), 0);
    const subtotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
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
        productType: i.productType,
        woodType: i.woodType,
        doorType: i.doorType,
        description: i.description,
        area: i.area,
        pricePerMeter: i.pricePerMeter,
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
                    {completedDesign.designFiles.map((file, idx) => (
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
                    {String(typeof completedDesign.measurements === "string"
                      ? completedDesign.measurements
                      : JSON.stringify(completedDesign.measurements, null, 2))}
                  </pre>
                </div>
              )}

              {completedDesign.notes && (
                <div className="space-y-1">
                  <p className={`text-sm font-medium ${isRTL ? "text-right" : "text-left"}`}>{t("ملاحظات المصمم", "Designer Notes")}</p>
                  <p className={`text-sm text-muted-foreground ${isRTL ? "text-right" : "text-left"}`} data-testid="text-designer-notes">
                    {completedDesign.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("البنود", "Line Items")}</CardTitle>
            <Button size="sm" onClick={addItem} data-testid="button-add-item">
              <Plus className="w-3 h-3 me-1" /> {t("إضافة بند", "Add Item")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("اضغط 'إضافة بند' لبدء بناء عرض السعر", "Click 'Add Item' to start building the quotation")}
              </p>
            ) : (
              items.map((item, index) => (
                <div
                  key={item.id}
                  className="p-4 border rounded-lg space-y-3"
                  data-testid={`item-${index}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {t(`بند ${index + 1}`, `Item ${index + 1}`)}
                    </span>
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
                      <Label className="text-xs">{t("وصف إضافي", "Description")}</Label>
                      <Input
                        value={item.description}
                        onChange={(e) => updateItem(item.id, "description", e.target.value)}
                        placeholder={t("اختياري", "Optional")}
                        data-testid={`input-description-${index}`}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t text-sm">
                    <span className="text-muted-foreground">
                      {t("السعر/م²:", "Price/m²:")} {item.pricePerMeter.toLocaleString()} SAR
                    </span>
                    <span className="font-bold text-primary">
                      {t("الإجمالي:", "Total:")} {item.total.toLocaleString()} SAR
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("إجمالي المساحة", "Total Area")}</span>
                    <span>{totals.totalArea.toFixed(2)} {t("م²", "m²")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("المجموع قبل الضريبة", "Subtotal")}</span>
                    <span>{totals.subtotal.toLocaleString()} SAR</span>
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
    </div>
  );
}
