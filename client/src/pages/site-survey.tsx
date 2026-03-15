import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, ChevronLeft, Plus, Trash2, Search, CheckCircle, Home, Layers, Package, FileText } from "lucide-react";

const STEPS = [
  { id: 1, icon: Home, labelAr: "تفاصيل المكان", labelEn: "Room Details" },
  { id: 2, icon: Layers, labelAr: "الجدران", labelEn: "Walls" },
  { id: 3, icon: Package, labelAr: "المنتجات", labelEn: "Products" },
  { id: 4, icon: FileText, labelAr: "الملاحظات", labelEn: "Notes" },
];

interface RoomDimensions {
  length: string; width: string; height: string;
}
interface Door { width: string; height: string; wall: string; }
interface Window { width: string; height: string; wall: string; }
interface Wall { name: string; length: string; contents: string; }
interface SelectedProduct {
  productId: number; code: string; nameAr: string; nameEn: string;
  width: number; height: number; depth: number;
  quantity: number; comment: string;
  doorType: string; drawerType: string; mechanism: string;
  price: string;
}

export default function SiteSurveyPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const appointmentId = params.get("appointmentId");
  const quotationId = params.get("quotationId");

  const [step, setStep] = useState(1);
  const [room, setRoom] = useState<RoomDimensions>({ length: "", width: "", height: "" });
  const [constructionStatus, setConstructionStatus] = useState("ready");
  const [constructionPhase, setConstructionPhase] = useState("");
  const [doors, setDoors] = useState<Door[]>([{ width: "", height: "", wall: "north" }]);
  const [windows, setWindows] = useState<Window[]>([{ width: "", height: "", wall: "north" }]);
  const [walls, setWalls] = useState<Wall[]>([
    { name: t("الجدار الشمالي", "North Wall"), length: "", contents: "" },
    { name: t("الجدار الجنوبي", "South Wall"), length: "", contents: "" },
    { name: t("الجدار الشرقي", "East Wall"), length: "", contents: "" },
    { name: t("الجدار الغربي", "West Wall"), length: "", contents: "" },
  ]);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [surveyId, setSurveyId] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: existingSurvey } = useQuery<any>({
    queryKey: ["/api/site-surveys/by-appointment", appointmentId],
    queryFn: async () => {
      if (!appointmentId) return null;
      const res = await fetch(`/api/site-surveys/by-appointment/${appointmentId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!appointmentId,
    staleTime: 30000,
  });

  useEffect(() => {
    if (existingSurvey) {
      setSurveyId(existingSurvey.id);
      if (existingSurvey.roomDimensions) setRoom(existingSurvey.roomDimensions as any);
      if (existingSurvey.walls) setWalls(existingSurvey.walls as any);
      if (existingSurvey.selectedProducts) setSelectedProducts(existingSurvey.selectedProducts as any);
      if (existingSurvey.notes) setNotes(existingSurvey.notes);
      if (existingSurvey.constructionStatus) setConstructionStatus(existingSurvey.constructionStatus);
      if (existingSurvey.constructionPhase) setConstructionPhase(existingSurvey.constructionPhase);
    }
  }, [existingSurvey]);

  const { data: adekoProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/adeko-products", productSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (productSearch) params.set("search", productSearch);
      const res = await fetch(`/api/adeko-products?${params}&limit=40`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30000,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (surveyId) {
        return apiRequest("PATCH", `/api/site-surveys/${surveyId}`, data);
      } else {
        return apiRequest("POST", "/api/site-surveys", data);
      }
    },
    onSuccess: async (res: any) => {
      const data = await res.json();
      setSurveyId(data.id);
      qc.invalidateQueries({ queryKey: ["/api/site-surveys"] });
      toast({ title: t("تم الحفظ بنجاح", "Saved successfully") });
      if (step === 4) {
        setSaved(true);
        // Update appointment status to attended if needed
        if (appointmentId) {
          await apiRequest("PATCH", `/api/appointments/${appointmentId}`, { status: "attended" }).catch(() => {});
          qc.invalidateQueries({ queryKey: ["/api/appointments"] });
        }
      }
    },
    onError: () => toast({ title: t("حدث خطأ في الحفظ", "Save error"), variant: "destructive" }),
  });

  const getSurveyData = () => ({
    appointmentId: appointmentId ? parseInt(appointmentId) : null,
    quotationId: quotationId ? parseInt(quotationId) : null,
    roomDimensions: room,
    walls,
    selectedProducts,
    notes,
    constructionStatus,
    constructionPhase,
    electricalOutlets: null,
    drains: null,
    images: null,
  });

  const handleSave = () => saveMutation.mutate(getSurveyData());

  const addProduct = (p: any) => {
    setSelectedProducts(prev => [...prev, {
      productId: p.id,
      code: p.code,
      nameAr: p.groupNameAr || p.descriptionAr || p.descriptionEn,
      nameEn: p.descriptionEn,
      width: parseFloat(p.designW || p.manufacturingW || "60"),
      height: parseFloat(p.designH || p.manufacturingH || "180"),
      depth: parseFloat(p.designD || p.manufacturingD || "55"),
      quantity: 1, comment: "", doorType: "", drawerType: "", mechanism: "",
      price: p.priceBeforeVat || p.priceAfterVat || "0",
    }]);
    setShowProductPicker(false);
    setProductSearch("");
  };

  const removeProduct = (i: number) => setSelectedProducts(prev => prev.filter((_, idx) => idx !== i));

  const updateProduct = (i: number, field: string, val: string | number) =>
    setSelectedProducts(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p));

  if (saved) {
    return (
      <div className="p-4 md:p-8 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <CheckCircle className="h-16 w-16 text-green-500" />
        <h2 className="text-2xl font-bold">{t("تم حفظ نموذج الزيارة", "Site Survey Saved")}</h2>
        <p className="text-muted-foreground">{t("يمكنك الآن مشاهدة التصور ثلاثي الأبعاد وحساب الأسعار", "You can now view 3D visualization and pricing")}</p>
        <div className="flex gap-3 flex-wrap justify-center">
          {surveyId && (
            <Button onClick={() => navigate(`/scene-3d?surveyId=${surveyId}`)} data-testid="btn-view-3d">
              {t("مشاهدة التصور ثلاثي الأبعاد", "View 3D Scene")}
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate("/my-calendar")}>
            {t("العودة للتقويم", "Back to Calendar")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t("نموذج الزيارة الميدانية", "Site Survey Form")}</h1>
        <p className="text-muted-foreground text-sm">
          {appointmentId ? t(`موعد #${appointmentId}`, `Appointment #${appointmentId}`) : t("زيارة جديدة", "New Survey")}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isDone = step > s.id;
          const isActive = step === s.id;
          return (
            <div key={s.id} className="flex items-center gap-1">
              <button
                onClick={() => setStep(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive ? "bg-primary text-primary-foreground" :
                  isDone ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}
                data-testid={`step-btn-${s.id}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(s.labelAr, s.labelEn)}
                {isDone && <CheckCircle className="h-3 w-3" />}
              </button>
              {i < STEPS.length - 1 && <ChevronLeft className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Room Details */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>{t("تفاصيل الغرفة / المكان", "Room / Space Details")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="font-semibold">{t("أبعاد الغرفة (بالسنتيمتر)", "Room Dimensions (cm)")}</Label>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div>
                  <Label className="text-xs text-muted-foreground">{t("الطول", "Length")}</Label>
                  <Input type="number" value={room.length} onChange={e => setRoom(r => ({ ...r, length: e.target.value }))}
                    placeholder="400" data-testid="input-room-length" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("العرض", "Width")}</Label>
                  <Input type="number" value={room.width} onChange={e => setRoom(r => ({ ...r, width: e.target.value }))}
                    placeholder="300" data-testid="input-room-width" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("الارتفاع", "Height")}</Label>
                  <Input type="number" value={room.height} onChange={e => setRoom(r => ({ ...r, height: e.target.value }))}
                    placeholder="240" data-testid="input-room-height" />
                </div>
              </div>
            </div>

            <div>
              <Label className="font-semibold">{t("حالة البناء", "Construction Status")}</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {[
                  { val: "ready", ar: "جاهز", en: "Ready" },
                  { val: "under_construction", ar: "قيد الإنشاء", en: "Under Construction" },
                ].map(opt => (
                  <Button key={opt.val} variant={constructionStatus === opt.val ? "default" : "outline"}
                    size="sm" onClick={() => setConstructionStatus(opt.val)}
                    data-testid={`btn-construction-${opt.val}`}>
                    {t(opt.ar, opt.en)}
                  </Button>
                ))}
              </div>
              {constructionStatus === "under_construction" && (
                <div className="mt-2">
                  <Label className="text-xs">{t("المرحلة", "Phase")}</Label>
                  <Input value={constructionPhase} onChange={e => setConstructionPhase(e.target.value)}
                    placeholder={t("مثال: مرحلة التشطيب", "e.g. Finishing phase")}
                    data-testid="input-construction-phase" />
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-semibold">{t("الأبواب", "Doors")}</Label>
                <Button size="sm" variant="outline" onClick={() => setDoors(d => [...d, { width: "", height: "", wall: "north" }])}
                  data-testid="btn-add-door">
                  <Plus className="h-3.5 w-3.5 me-1" />{t("إضافة", "Add")}
                </Button>
              </div>
              {doors.map((door, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-end">
                  <div>
                    <Label className="text-xs">{t("العرض (cm)", "W (cm)")}</Label>
                    <Input type="number" value={door.width} onChange={e => setDoors(d => d.map((x, j) => j === i ? { ...x, width: e.target.value } : x))}
                      placeholder="90" data-testid={`input-door-width-${i}`} />
                  </div>
                  <div>
                    <Label className="text-xs">{t("الارتفاع (cm)", "H (cm)")}</Label>
                    <Input type="number" value={door.height} onChange={e => setDoors(d => d.map((x, j) => j === i ? { ...x, height: e.target.value } : x))}
                      placeholder="210" data-testid={`input-door-height-${i}`} />
                  </div>
                  <div>
                    <Label className="text-xs">{t("الجدار", "Wall")}</Label>
                    <Select value={door.wall} onValueChange={v => setDoors(d => d.map((x, j) => j === i ? { ...x, wall: v } : x))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="north">{t("شمالي", "North")}</SelectItem>
                        <SelectItem value="south">{t("جنوبي", "South")}</SelectItem>
                        <SelectItem value="east">{t("شرقي", "East")}</SelectItem>
                        <SelectItem value="west">{t("غربي", "West")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setDoors(d => d.filter((_, j) => j !== i))}
                    data-testid={`btn-remove-door-${i}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-semibold">{t("النوافذ", "Windows")}</Label>
                <Button size="sm" variant="outline" onClick={() => setWindows(w => [...w, { width: "", height: "", wall: "north" }])}
                  data-testid="btn-add-window">
                  <Plus className="h-3.5 w-3.5 me-1" />{t("إضافة", "Add")}
                </Button>
              </div>
              {windows.map((win, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-end">
                  <div>
                    <Label className="text-xs">{t("العرض (cm)", "W (cm)")}</Label>
                    <Input type="number" value={win.width} onChange={e => setWindows(w => w.map((x, j) => j === i ? { ...x, width: e.target.value } : x))}
                      placeholder="120" data-testid={`input-window-width-${i}`} />
                  </div>
                  <div>
                    <Label className="text-xs">{t("الارتفاع (cm)", "H (cm)")}</Label>
                    <Input type="number" value={win.height} onChange={e => setWindows(w => w.map((x, j) => j === i ? { ...x, height: e.target.value } : x))}
                      placeholder="120" data-testid={`input-window-height-${i}`} />
                  </div>
                  <div>
                    <Label className="text-xs">{t("الجدار", "Wall")}</Label>
                    <Select value={win.wall} onValueChange={v => setWindows(w => w.map((x, j) => j === i ? { ...x, wall: v } : x))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="north">{t("شمالي", "North")}</SelectItem>
                        <SelectItem value="south">{t("جنوبي", "South")}</SelectItem>
                        <SelectItem value="east">{t("شرقي", "East")}</SelectItem>
                        <SelectItem value="west">{t("غربي", "West")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setWindows(w => w.filter((_, j) => j !== i))}
                    data-testid={`btn-remove-window-${i}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Walls */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>{t("تفاصيل الجدران", "Wall Details")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {walls.map((wall, i) => (
              <div key={i} className="p-3 border rounded-lg space-y-2">
                <Label className="font-semibold">{wall.name}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("طول الجدار (cm)", "Wall Length (cm)")}</Label>
                    <Input type="number" value={wall.length}
                      onChange={e => setWalls(w => w.map((x, j) => j === i ? { ...x, length: e.target.value } : x))}
                      placeholder="400" data-testid={`input-wall-length-${i}`} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("محتويات الجدار (فتحات/نوافذ/مخارج كهرباء/إلخ)", "Wall contents (openings/windows/outlets/etc)")}</Label>
                  <Textarea value={wall.contents}
                    onChange={e => setWalls(w => w.map((x, j) => j === i ? { ...x, contents: e.target.value } : x))}
                    rows={2} placeholder={t("صف ما يوجد على هذا الجدار...", "Describe what's on this wall...")}
                    data-testid={`textarea-wall-contents-${i}`} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Products */}
      {step === 3 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("المنتجات المطلوبة", "Required Products")}</CardTitle>
            <Button size="sm" onClick={() => setShowProductPicker(true)} data-testid="btn-add-product">
              <Plus className="h-3.5 w-3.5 me-1" />{t("إضافة منتج", "Add Product")}
            </Button>
          </CardHeader>
          <CardContent>
            {selectedProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>{t("لم تتم إضافة منتجات بعد", "No products added yet")}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowProductPicker(true)}>
                  {t("اختيار من مكتبة Adeko", "Choose from Adeko library")}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedProducts.map((p, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2" data-testid={`survey-product-${i}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{p.nameAr}</p>
                        <p className="text-xs text-muted-foreground">{p.code} — {p.width}×{p.height}×{p.depth} cm</p>
                        <p className="text-xs font-semibold text-primary">{Number(p.price).toLocaleString()} ر.س</p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeProduct(i)} data-testid={`btn-remove-product-${i}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <Label className="text-xs">{t("الكمية", "Qty")}</Label>
                        <Input type="number" min={1} value={p.quantity}
                          onChange={e => updateProduct(i, "quantity", parseInt(e.target.value) || 1)}
                          data-testid={`input-product-qty-${i}`} />
                      </div>
                      <div>
                        <Label className="text-xs">{t("نوع الباب", "Door Type")}</Label>
                        <Input value={p.doorType} onChange={e => updateProduct(i, "doorType", e.target.value)}
                          placeholder={t("زجاجي/خشبي", "Glass/Wood")} data-testid={`input-door-type-${i}`} />
                      </div>
                      <div>
                        <Label className="text-xs">{t("نوع الدرج", "Drawer")}</Label>
                        <Input value={p.drawerType} onChange={e => updateProduct(i, "drawerType", e.target.value)}
                          placeholder={t("عادي/بطيء", "Normal/Soft")} data-testid={`input-drawer-type-${i}`} />
                      </div>
                      <div>
                        <Label className="text-xs">{t("الميكانيزم", "Mechanism")}</Label>
                        <Input value={p.mechanism} onChange={e => updateProduct(i, "mechanism", e.target.value)}
                          placeholder={t("هيدروليكي/يدوي", "Hydraulic/Manual")} data-testid={`input-mechanism-${i}`} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">{t("تعليق", "Comment")}</Label>
                      <Input value={p.comment} onChange={e => updateProduct(i, "comment", e.target.value)}
                        placeholder={t("أي تفاصيل إضافية...", "Additional details...")}
                        data-testid={`input-product-comment-${i}`} />
                    </div>
                  </div>
                ))}
                {/* Totals */}
                <div className="border-t pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("المجموع الفرعي (قبل الضريبة)", "Subtotal (before VAT)")}</span>
                    <span className="font-medium">
                      {selectedProducts.reduce((s, p) => s + Number(p.price) * p.quantity, 0).toLocaleString()} ر.س
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-muted-foreground">{t("ضريبة القيمة المضافة 15%", "VAT 15%")}</span>
                    <span className="font-medium">
                      {(selectedProducts.reduce((s, p) => s + Number(p.price) * p.quantity, 0) * 0.15).toLocaleString()} ر.س
                    </span>
                  </div>
                  <div className="flex justify-between font-bold mt-1 pt-1 border-t">
                    <span>{t("الإجمالي", "Total")}</span>
                    <span className="text-primary">
                      {(selectedProducts.reduce((s, p) => s + Number(p.price) * p.quantity, 0) * 1.15).toLocaleString()} ر.س
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Notes */}
      {step === 4 && (
        <Card>
          <CardHeader><CardTitle>{t("الملاحظات الختامية", "Final Notes")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{t("ملاحظات الزيارة", "Visit Notes")}</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5}
                placeholder={t("اكتب أي ملاحظات إضافية حول الزيارة والعميل والمكان...", "Any additional notes...")}
                data-testid="textarea-final-notes" />
            </div>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <p className="font-semibold">{t("ملخص الزيارة", "Survey Summary")}</p>
              <p>{t("الغرفة:", "Room:")} {room.length}×{room.width}×{room.height} cm</p>
              <p>{t("عدد المنتجات:", "Products:")} {selectedProducts.length}</p>
              <p>{t("إجمالي التكلفة:", "Total:")} {(selectedProducts.reduce((s, p) => s + Number(p.price) * p.quantity, 0) * 1.15).toLocaleString()} ر.س</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation buttons */}
      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={() => step > 1 ? setStep(s => s - 1) : navigate("/my-calendar")}
          data-testid="btn-prev-step">
          <ChevronRight className="h-4 w-4 me-1" />
          {step === 1 ? t("إلغاء", "Cancel") : t("السابق", "Previous")}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSave} disabled={saveMutation.isPending} data-testid="btn-save-survey">
            {saveMutation.isPending ? t("جاري الحفظ...", "Saving...") : t("حفظ مسودة", "Save Draft")}
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep(s => s + 1)} data-testid="btn-next-step">
              {t("التالي", "Next")}
              <ChevronLeft className="h-4 w-4 ms-1" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="btn-finalize-survey">
              {saveMutation.isPending ? t("جاري الحفظ...", "Saving...") : t("إنهاء الزيارة", "Finalize Survey")}
            </Button>
          )}
        </div>
      </div>

      {/* Product Picker Dialog */}
      <Dialog open={showProductPicker} onOpenChange={setShowProductPicker}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("اختيار منتج من مكتبة Adeko", "Select from Adeko Library")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="ps-9" placeholder={t("ابحث عن منتج...", "Search products...")}
                value={productSearch} onChange={e => setProductSearch(e.target.value)}
                data-testid="input-product-search" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto">
              {(adekoProducts as any[]).slice(0, 60).map(p => (
                <button key={p.id} onClick={() => addProduct(p)}
                  className="border rounded-lg p-2 text-start hover:border-primary hover:bg-primary/5 transition-colors"
                  data-testid={`product-picker-${p.id}`}>
                  {p.thumbnail ? (
                    <img src={`/products/${p.thumbnail}`} alt={p.descriptionEn}
                      className="w-full h-20 object-cover rounded mb-1"
                      onError={e => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                  ) : (
                    <div className="w-full h-20 bg-muted rounded mb-1 flex items-center justify-center">
                      <Package className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <p className="text-xs font-medium line-clamp-1">{p.groupNameAr}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{p.descriptionEn}</p>
                  <p className="text-[10px] text-muted-foreground">{p.code}</p>
                  <p className="text-xs font-bold text-primary">{Number(p.priceBeforeVat || 0).toLocaleString()} ر.س</p>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
