import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Ruler,
  Building2,
  LayoutGrid,
  Package,
  Camera,
  Save,
  Search,
  Plus,
  Trash2,
  X,
  CheckCircle2,
  DoorOpen,
  Grid3X3,
  Plug,
  Droplets,
  Box,
  FileText,
  Calendar,
} from "lucide-react";

type WizardStep = 1 | 2 | 3 | 4;

interface WallData {
  id: string;
  name: string;
  length: string;
  items: WallItem[];
}

interface WallItem {
  type: "door" | "window" | "outlet" | "drain" | "obstacle";
  width: string;
  height: string;
  positionFromLeft: string;
  notes: string;
}

interface SelectedProduct {
  id: string;
  adekoProductId: number;
  code: string;
  description: string;
  groupName: string;
  thumbnail?: string;
  quantity: number;
  doorType: string;
  drawerType: string;
  mechanism: string;
  notes: string;
  room: string;
}

const stepLabels: Record<WizardStep, { ar: string; en: string; icon: typeof Ruler }> = {
  1: { ar: "تفاصيل المكان", en: "Room Details", icon: Ruler },
  2: { ar: "الجدران", en: "Wall Layout", icon: LayoutGrid },
  3: { ar: "المنتجات", en: "Products", icon: Package },
  4: { ar: "الملاحظات والصور", en: "Notes & Photos", icon: Camera },
};

export default function SiteSurveyPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = useParams<{ appointmentId: string }>();
  const appointmentId = parseInt(params.appointmentId || "0");

  const [step, setStep] = useState<WizardStep>(1);
  const [productSearchDialog, setProductSearchDialog] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [currentRoom, setCurrentRoom] = useState("room_1");

  const { data: appointment } = useQuery<any>({
    queryKey: ["/api/appointments", appointmentId],
    enabled: appointmentId > 0,
  });

  const { data: existingSurvey } = useQuery<any>({
    queryKey: ["/api/appointments", appointmentId, "site-survey"],
    enabled: appointmentId > 0,
    retry: false,
  });

  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const { data: adekoProducts = [] } = useQuery<any[]>({ queryKey: ["/api/adeko-products"] });
  const { data: adekoGroups = [] } = useQuery<any[]>({ queryKey: ["/api/adeko-products/groups"] });

  const [roomData, setRoomData] = useState({
    roomLength: "",
    roomWidth: "",
    roomHeight: "",
    buildingStatus: "ready",
    constructionPhase: "",
    doorsCount: "0",
    windowsCount: "0",
    obstacles: "",
  });

  const [walls, setWalls] = useState<WallData[]>([
    { id: "wall_1", name: t("الجدار 1", "Wall 1"), length: "", items: [] },
    { id: "wall_2", name: t("الجدار 2", "Wall 2"), length: "", items: [] },
    { id: "wall_3", name: t("الجدار 3", "Wall 3"), length: "", items: [] },
    { id: "wall_4", name: t("الجدار 4", "Wall 4"), length: "", items: [] },
  ]);

  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [surveyNotes, setSurveyNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (existingSurvey && existingSurvey.id) {
      setRoomData({
        roomLength: existingSurvey.roomLength || "",
        roomWidth: existingSurvey.roomWidth || "",
        roomHeight: existingSurvey.roomHeight || "",
        buildingStatus: existingSurvey.buildingStatus || "ready",
        constructionPhase: existingSurvey.constructionPhase || "",
        doorsCount: String(existingSurvey.doorsCount || 0),
        windowsCount: String(existingSurvey.windowsCount || 0),
        obstacles: existingSurvey.obstacles || "",
      });
      if (existingSurvey.walls) setWalls(existingSurvey.walls as WallData[]);
      if (existingSurvey.selectedProducts) setSelectedProducts(existingSurvey.selectedProducts as SelectedProduct[]);
      if (existingSurvey.notes) setSurveyNotes(existingSurvey.notes);
      if (existingSurvey.photos) setPhotos(existingSurvey.photos);
    }
  }, [existingSurvey]);

  const [savedSurveyId, setSavedSurveyId] = useState<number | null>(null);
  const [nextStepsDialog, setNextStepsDialog] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (existingSurvey?.id) {
        const res = await apiRequest("PATCH", `/api/site-surveys/${existingSurvey.id}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/site-surveys", data);
      return res.json();
    },
    onSuccess: (saved: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-surveys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: t("تم حفظ نموذج الزيارة بنجاح", "Survey saved successfully") });
      setSavedSurveyId(saved?.id || existingSurvey?.id || null);
      setNextStepsDialog(true);
    },
    onError: () => {
      toast({ title: t("حدث خطأ في الحفظ", "Save failed"), variant: "destructive" });
    },
  });

  function handleSave() {
    const data: any = {
      appointmentId,
      customerId: appointment?.customerId || null,
      quotationId: appointment?.quotationId || null,
      roomLength: roomData.roomLength || null,
      roomWidth: roomData.roomWidth || null,
      roomHeight: roomData.roomHeight || null,
      buildingStatus: roomData.buildingStatus,
      constructionPhase: roomData.constructionPhase || null,
      doorsCount: parseInt(roomData.doorsCount) || 0,
      windowsCount: parseInt(roomData.windowsCount) || 0,
      obstacles: roomData.obstacles || null,
      walls,
      selectedProducts,
      notes: surveyNotes || null,
      photos,
    };
    saveMutation.mutate(data);
  }

  function addWallItem(wallId: string, type: WallItem["type"]) {
    setWalls(walls.map((w) => {
      if (w.id !== wallId) return w;
      return {
        ...w,
        items: [...w.items, { type, width: "", height: "", positionFromLeft: "", notes: "" }],
      };
    }));
  }

  function updateWallItem(wallId: string, itemIndex: number, field: string, value: string) {
    setWalls(walls.map((w) => {
      if (w.id !== wallId) return w;
      const newItems = [...w.items];
      newItems[itemIndex] = { ...newItems[itemIndex], [field]: value };
      return { ...w, items: newItems };
    }));
  }

  function removeWallItem(wallId: string, itemIndex: number) {
    setWalls(walls.map((w) => {
      if (w.id !== wallId) return w;
      return { ...w, items: w.items.filter((_, i) => i !== itemIndex) };
    }));
  }

  function addProduct(adekoProduct: any) {
    const newProduct: SelectedProduct = {
      id: `prod_${Date.now()}`,
      adekoProductId: adekoProduct.id,
      code: adekoProduct.code,
      description: adekoProduct.descriptionEn,
      groupName: adekoProduct.groupNameEn,
      thumbnail: adekoProduct.thumbnail || undefined,
      quantity: 1,
      doorType: "",
      drawerType: "",
      mechanism: "",
      notes: "",
      room: currentRoom,
    };
    setSelectedProducts([...selectedProducts, newProduct]);
    setProductSearchDialog(false);
  }

  function updateProduct(productId: string, field: string, value: any) {
    setSelectedProducts(selectedProducts.map((p) =>
      p.id === productId ? { ...p, [field]: value } : p
    ));
  }

  function removeProduct(productId: string) {
    setSelectedProducts(selectedProducts.filter((p) => p.id !== productId));
  }

  const filteredAdekoProducts = useMemo(() => {
    let list = adekoProducts;
    if (selectedGroup !== "all") {
      list = list.filter((p: any) => p.groupCode === selectedGroup);
    }
    if (productSearch.trim()) {
      const q = productSearch.trim().toLowerCase();
      list = list.filter((p: any) =>
        p.code?.toLowerCase().includes(q) ||
        p.descriptionEn?.toLowerCase().includes(q) ||
        p.descriptionAr?.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 50);
  }, [adekoProducts, selectedGroup, productSearch]);

  const customer = customers.find((c: any) => c.id === appointment?.customerId);

  const wallItemIcons: Record<string, typeof DoorOpen> = {
    door: DoorOpen,
    window: Grid3X3,
    outlet: Plug,
    drain: Droplets,
    obstacle: X,
  };

  const wallItemLabels: Record<string, { ar: string; en: string }> = {
    door: { ar: "باب", en: "Door" },
    window: { ar: "نافذة", en: "Window" },
    outlet: { ar: "مخرج كهرباء", en: "Outlet" },
    drain: { ar: "فتحة صرف", en: "Drain" },
    obstacle: { ar: "عائق", en: "Obstacle" },
  };

  const rooms = [
    { id: "room_1", ar: "الغرفة 1", en: "Room 1" },
    { id: "room_2", ar: "الغرفة 2", en: "Room 2" },
    { id: "room_3", ar: "الغرفة 3", en: "Room 3" },
    { id: "kitchen", ar: "المطبخ", en: "Kitchen" },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24" data-testid="page-site-survey">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" data-testid="text-survey-title">
            {t("نموذج الزيارة الميدانية", "Site Survey Form")}
          </h1>
          {customer && (
            <p className="text-sm text-muted-foreground">
              {customer.fullName} - {customer.phone}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/my-calendar")} data-testid="button-back-calendar">
          {lang === "ar" ? <ChevronRight className="w-4 h-4 me-1" /> : <ChevronLeft className="w-4 h-4 me-1" />}
          {t("العودة", "Back")}
        </Button>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {([1, 2, 3, 4] as WizardStep[]).map((s) => {
          const StepIcon = stepLabels[s].icon;
          const isActive = step === s;
          const isPast = step > s;
          return (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isPast
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
              data-testid={`button-step-${s}`}
            >
              {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
              {t(stepLabels[s].ar, stepLabels[s].en)}
            </button>
          );
        })}
      </div>

      {step === 1 && (
        <Card>
          <CardContent className="p-4 space-y-4" data-testid="section-room-details">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Ruler className="w-4 h-4 text-primary" />
              {t("أبعاد الغرفة", "Room Dimensions")}
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">{t("الطول (م)", "Length (m)")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={roomData.roomLength}
                  onChange={(e) => setRoomData({ ...roomData, roomLength: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-room-length"
                />
              </div>
              <div>
                <Label className="text-xs">{t("العرض (م)", "Width (m)")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={roomData.roomWidth}
                  onChange={(e) => setRoomData({ ...roomData, roomWidth: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-room-width"
                />
              </div>
              <div>
                <Label className="text-xs">{t("الارتفاع (م)", "Height (m)")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={roomData.roomHeight}
                  onChange={(e) => setRoomData({ ...roomData, roomHeight: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-room-height"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">{t("حالة البناء", "Building Status")}</Label>
              <Select
                value={roomData.buildingStatus}
                onValueChange={(v) => setRoomData({ ...roomData, buildingStatus: v })}
              >
                <SelectTrigger data-testid="select-building-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ready">{t("جاهز", "Ready")}</SelectItem>
                  <SelectItem value="under_construction">{t("قيد الإنشاء", "Under Construction")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {roomData.buildingStatus === "under_construction" && (
              <div>
                <Label className="text-xs">{t("مرحلة البناء", "Construction Phase")}</Label>
                <Input
                  value={roomData.constructionPhase}
                  onChange={(e) => setRoomData({ ...roomData, constructionPhase: e.target.value })}
                  placeholder={t("مثال: التشطيب", "e.g. Finishing")}
                  data-testid="input-construction-phase"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t("عدد الأبواب", "Doors Count")}</Label>
                <Input
                  type="number"
                  min="0"
                  value={roomData.doorsCount}
                  onChange={(e) => setRoomData({ ...roomData, doorsCount: e.target.value })}
                  data-testid="input-doors-count"
                />
              </div>
              <div>
                <Label className="text-xs">{t("عدد النوافذ", "Windows Count")}</Label>
                <Input
                  type="number"
                  min="0"
                  value={roomData.windowsCount}
                  onChange={(e) => setRoomData({ ...roomData, windowsCount: e.target.value })}
                  data-testid="input-windows-count"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">{t("عوائق أخرى", "Other Obstacles")}</Label>
              <Textarea
                value={roomData.obstacles}
                onChange={(e) => setRoomData({ ...roomData, obstacles: e.target.value })}
                placeholder={t("أي عوائق أو ملاحظات عن المكان", "Any obstacles or notes about the space")}
                data-testid="input-obstacles"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-3" data-testid="section-walls">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-primary" />
              {t("تفاصيل الجدران", "Wall Details")}
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const id = `wall_${walls.length + 1}`;
                setWalls([...walls, { id, name: `${t("الجدار", "Wall")} ${walls.length + 1}`, length: "", items: [] }]);
              }}
              data-testid="button-add-wall"
            >
              <Plus className="w-3 h-3 me-1" />
              {t("إضافة جدار", "Add Wall")}
            </Button>
          </div>

          {walls.map((wall, wallIndex) => (
            <Card key={wall.id}>
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{wall.name}</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      value={wall.length}
                      onChange={(e) => {
                        const newWalls = [...walls];
                        newWalls[wallIndex].length = e.target.value;
                        setWalls(newWalls);
                      }}
                      placeholder={t("الطول (م)", "Length (m)")}
                      className="w-28 h-8 text-xs"
                      data-testid={`input-wall-length-${wallIndex}`}
                    />
                    {walls.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setWalls(walls.filter((_, i) => i !== wallIndex))}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>

                {wall.items.map((item, itemIndex) => {
                  const ItemIcon = wallItemIcons[item.type] || X;
                  return (
                    <div key={itemIndex} className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-1 min-w-[80px]">
                        <ItemIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs">{t(wallItemLabels[item.type]?.ar || "", wallItemLabels[item.type]?.en || "")}</span>
                      </div>
                      <div className="flex-1 grid grid-cols-3 gap-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          value={item.width}
                          onChange={(e) => updateWallItem(wall.id, itemIndex, "width", e.target.value)}
                          placeholder={t("العرض", "Width")}
                          className="h-7 text-xs"
                        />
                        <Input
                          type="number"
                          step="0.01"
                          value={item.height}
                          onChange={(e) => updateWallItem(wall.id, itemIndex, "height", e.target.value)}
                          placeholder={t("الارتفاع", "Height")}
                          className="h-7 text-xs"
                        />
                        <Input
                          type="number"
                          step="0.01"
                          value={item.positionFromLeft}
                          onChange={(e) => updateWallItem(wall.id, itemIndex, "positionFromLeft", e.target.value)}
                          placeholder={t("البعد", "Position")}
                          className="h-7 text-xs"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 flex-shrink-0"
                        onClick={() => removeWallItem(wall.id, itemIndex)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                })}

                <div className="flex flex-wrap gap-1">
                  {(["door", "window", "outlet", "drain", "obstacle"] as WallItem["type"][]).map((type) => {
                    const Icon = wallItemIcons[type];
                    return (
                      <Button
                        key={type}
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => addWallItem(wall.id, type)}
                        data-testid={`button-add-${type}-${wallIndex}`}
                      >
                        <Icon className="w-3 h-3 me-1" />
                        {t(wallItemLabels[type].ar, wallItemLabels[type].en)}
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3" data-testid="section-products">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              {t("المنتجات المطلوبة", "Required Products")}
            </h3>
            <div className="flex items-center gap-2">
              <Select value={currentRoom} onValueChange={setCurrentRoom}>
                <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-room">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>{t(room.ar, room.en)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => { setProductSearch(""); setSelectedGroup("all"); setProductSearchDialog(true); }}
                data-testid="button-add-product"
              >
                <Plus className="w-3 h-3 me-1" />
                {t("إضافة منتج", "Add Product")}
              </Button>
            </div>
          </div>

          {rooms.map((room) => {
            const roomProducts = selectedProducts.filter((p) => p.room === room.id);
            if (roomProducts.length === 0) return null;
            return (
              <div key={room.id}>
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  {t(room.ar, room.en)} ({roomProducts.length})
                </div>
                {roomProducts.map((product) => (
                  <Card key={product.id} className="mb-2">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2">
                          {product.thumbnail && (
                            <img
                              src={product.thumbnail}
                              alt={product.description}
                              className="w-12 h-12 object-cover rounded"
                            />
                          )}
                          <div>
                            <div className="text-xs font-medium">{product.code}</div>
                            <div className="text-xs text-muted-foreground">{product.description}</div>
                            <Badge variant="secondary" className="text-[10px] mt-1">{product.groupName}</Badge>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeProduct(product.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-[10px]">{t("الكمية", "Qty")}</Label>
                          <Input
                            type="number"
                            min="1"
                            value={product.quantity}
                            onChange={(e) => updateProduct(product.id, "quantity", parseInt(e.target.value) || 1)}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">{t("نوع الباب", "Door Type")}</Label>
                          <Input
                            value={product.doorType}
                            onChange={(e) => updateProduct(product.id, "doorType", e.target.value)}
                            placeholder={t("اختياري", "Optional")}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">{t("نوع الدرج", "Drawer Type")}</Label>
                          <Input
                            value={product.drawerType}
                            onChange={(e) => updateProduct(product.id, "drawerType", e.target.value)}
                            placeholder={t("اختياري", "Optional")}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">{t("الميكانيزم", "Mechanism")}</Label>
                          <Input
                            value={product.mechanism}
                            onChange={(e) => updateProduct(product.id, "mechanism", e.target.value)}
                            placeholder={t("اختياري", "Optional")}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-[10px]">{t("تعليق", "Comment")}</Label>
                        <Input
                          value={product.notes}
                          onChange={(e) => updateProduct(product.id, "notes", e.target.value)}
                          placeholder={t("ملاحظات على المنتج", "Product notes")}
                          className="h-7 text-xs"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })}

          {selectedProducts.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {t("لم يتم إضافة منتجات بعد", "No products added yet")}
            </div>
          )}
        </div>
      )}

      {step === 4 && (
        <Card>
          <CardContent className="p-4 space-y-4" data-testid="section-notes-photos">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" />
              {t("الملاحظات والصور", "Notes & Photos")}
            </h3>

            <div>
              <Label>{t("ملاحظات عامة", "General Notes")}</Label>
              <Textarea
                value={surveyNotes}
                onChange={(e) => setSurveyNotes(e.target.value)}
                placeholder={t("أي ملاحظات إضافية عن الزيارة", "Any additional notes about the visit")}
                rows={4}
                data-testid="input-survey-notes"
              />
            </div>

            <div>
              <Label>{t("الصور", "Photos")}</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {photos.map((photo, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                    <img src={photo} alt="" className="w-full h-full object-cover" />
                    <button
                      className="absolute top-1 end-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                      onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <label
                  className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors"
                  data-testid="button-upload-photo"
                >
                  <Camera className="w-6 h-6 text-muted-foreground mb-1" />
                  <span className="text-[10px] text-muted-foreground">{t("إضافة صورة", "Add Photo")}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const result = ev.target?.result as string;
                          if (result) setPhotos([...photos, result]);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="fixed bottom-0 start-0 end-0 md:start-64 bg-card border-t border-border p-3 flex items-center justify-between z-40">
        <Button
          variant="outline"
          onClick={() => step > 1 && setStep((step - 1) as WizardStep)}
          disabled={step === 1}
          data-testid="button-prev-step"
        >
          {lang === "ar" ? <ChevronRight className="w-4 h-4 me-1" /> : <ChevronLeft className="w-4 h-4 me-1" />}
          {t("السابق", "Previous")}
        </Button>

        <div className="flex items-center gap-1">
          {([1, 2, 3, 4] as WizardStep[]).map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${step === s ? "bg-primary" : step > s ? "bg-primary/40" : "bg-muted-foreground/30"}`}
            />
          ))}
        </div>

        {step < 4 ? (
          <Button
            onClick={() => setStep((step + 1) as WizardStep)}
            data-testid="button-next-step"
          >
            {t("التالي", "Next")}
            {lang === "ar" ? <ChevronLeft className="w-4 h-4 ms-1" /> : <ChevronRight className="w-4 h-4 ms-1" />}
          </Button>
        ) : (
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-survey"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 me-1 animate-spin" /> : <Save className="w-4 h-4 me-1" />}
            {t("حفظ النموذج", "Save Survey")}
          </Button>
        )}
      </div>

      <Dialog open={productSearchDialog} onOpenChange={setProductSearchDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-product-search">
          <DialogHeader>
            <DialogTitle>{t("اختيار منتج من مكتبة Adeko", "Select Product from Adeko Library")}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder={t("بحث بالكود أو الوصف...", "Search by code or description...")}
                className="ps-9 h-9"
                data-testid="input-product-search"
              />
            </div>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="w-[150px] h-9 text-xs" data-testid="select-product-group">
                <SelectValue placeholder={t("المجموعة", "Group")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("الكل", "All")}</SelectItem>
                {adekoGroups.map((g: any) => (
                  <SelectItem key={g.groupCode} value={g.groupCode}>
                    {lang === "ar" ? g.groupNameAr : g.groupNameEn} ({g.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filteredAdekoProducts.map((product: any) => (
                <button
                  key={product.id}
                  className="text-start border rounded-lg p-2 hover:border-primary hover:bg-primary/5 transition-all"
                  onClick={() => addProduct(product)}
                  data-testid={`product-card-${product.id}`}
                >
                  {product.thumbnail && (
                    <img
                      src={product.thumbnail}
                      alt={product.descriptionEn}
                      className="w-full aspect-square object-cover rounded mb-1.5"
                    />
                  )}
                  <div className="text-[11px] font-medium truncate">{product.code}</div>
                  <div className="text-[10px] text-muted-foreground line-clamp-2">
                    {lang === "ar" ? (product.descriptionAr || product.descriptionEn) : product.descriptionEn}
                  </div>
                  <Badge variant="secondary" className="text-[9px] mt-1">
                    {lang === "ar" ? product.groupNameAr : product.groupNameEn}
                  </Badge>
                </button>
              ))}
            </div>

            {filteredAdekoProducts.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t("لا توجد منتجات مطابقة", "No matching products")}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={nextStepsDialog} onOpenChange={setNextStepsDialog}>
        <DialogContent className="max-w-sm" data-testid="dialog-next-steps">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              {t("تم حفظ الزيارة بنجاح", "Survey Saved Successfully")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground pb-1">
            {t("اختر الخطوة التالية:", "Choose the next step:")}
          </p>
          <div className="grid gap-3">
            <Button
              className="w-full justify-start gap-3 h-14"
              onClick={() => {
                setNextStepsDialog(false);
                const sid = savedSurveyId || existingSurvey?.id;
                navigate(`/scene-3d?surveyId=${sid}`);
              }}
              data-testid="button-view-3d"
            >
              <Box className="w-5 h-5 shrink-0" />
              <div className="text-start">
                <div className="font-semibold text-sm">{t("عرض التصميم ثلاثي الأبعاد", "View 3D Design")}</div>
                <div className="text-xs opacity-75">{t("شاهد المنتجات في الغرفة", "See products in room")}</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-14"
              onClick={() => {
                setNextStepsDialog(false);
                const cid = appointment?.customerId;
                navigate(`/quotations/new${cid ? `?customerId=${cid}` : ""}`);
              }}
              data-testid="button-create-quotation"
            >
              <FileText className="w-5 h-5 shrink-0" />
              <div className="text-start">
                <div className="font-semibold text-sm">{t("إنشاء عرض سعر", "Create Quotation")}</div>
                <div className="text-xs opacity-75">{t("أنشئ عرض سعر للعميل", "Build a price quotation")}</div>
              </div>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-14"
              onClick={() => { setNextStepsDialog(false); navigate("/my-calendar"); }}
              data-testid="button-back-calendar"
            >
              <Calendar className="w-5 h-5 shrink-0" />
              <div className="text-start">
                <div className="font-semibold text-sm">{t("العودة للتقويم", "Back to Calendar")}</div>
                <div className="text-xs opacity-75">{t("مواعيدك وزياراتك", "Your appointments")}</div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
