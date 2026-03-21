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

const SPACE_TYPES = [
  { value: "kitchen", ar: "مطبخ", en: "Kitchen" },
  { value: "bedroom", ar: "غرفة نوم", en: "Bedroom" },
  { value: "living", ar: "صالة", en: "Living Room" },
  { value: "salon", ar: "صالون", en: "Salon" },
  { value: "dressing", ar: "دريسنج", en: "Dressing Room" },
  { value: "storage", ar: "مستودع", en: "Storage" },
  { value: "office", ar: "مكتب", en: "Office" },
  { value: "bathroom", ar: "حمام", en: "Bathroom" },
  { value: "other", ar: "أخرى", en: "Other" },
];

const CONSTRUCTION_PHASES = [
  { value: "skeleton", ar: "حفظة الهيكل", en: "Skeleton" },
  { value: "plaster", ar: "البياض", en: "Plaster" },
  { value: "frame", ar: "الطارمة", en: "Frame" },
  { value: "finishing", ar: "التشطيب", en: "Finishing" },
  { value: "exterior_decor", ar: "الديكور الخارجي", en: "Exterior Decor" },
  { value: "interior_decor", ar: "ديكور داخلي", en: "Interior Decor" },
  { value: "other", ar: "أخرى", en: "Other" },
];

const LIFT_MECHANISMS = [
  { value: "none", ar: "لا يوجد", en: "None" },
  { value: "push_pull", ar: "دفع-سحب", en: "Push-Pull" },
  { value: "gas_strut", ar: "جاز ستروت", en: "Gas Strut" },
  { value: "aventos_hf", ar: "أفانتوس HF", en: "Aventos HF" },
  { value: "aventos_hl", ar: "أفانتوس HL", en: "Aventos HL" },
  { value: "servo_drive", ar: "سيرفو درايف", en: "Servo Drive" },
  { value: "other", ar: "أخرى", en: "Other" },
];

interface WallItem {
  type: "door" | "window" | "outlet" | "drain" | "obstacle";
  width: string;
  height: string;
  distanceFromFirst: string;
  heightFromFloor: string;
  specs: string;
  notes: string;
}

interface WallData {
  id: string;
  name: string;
  length: string;
  wallHeight: string;
  items: WallItem[];
}

interface SpaceData {
  id: string;
  name: string;
  type: string;
  length: string;
  width: string;
  height: string;
  buildingStatus: string;
  constructionPhase: string;
  constructionPhaseOther: string;
  doorsCount: string;
  windowsCount: string;
  notes: string;
  walls: WallData[];
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
  liftMechanism: string;
  liftMechanismNote: string;
  notes: string;
  spaceId: string;
}

const stepLabels: Record<WizardStep, { ar: string; en: string; icon: typeof Ruler }> = {
  1: { ar: "الأماكن", en: "Spaces", icon: Building2 },
  2: { ar: "الجدران", en: "Walls", icon: LayoutGrid },
  3: { ar: "المنتجات", en: "Products", icon: Package },
  4: { ar: "الملاحظات والصور", en: "Notes & Photos", icon: Camera },
};

function newSpace(): SpaceData {
  return {
    id: `space_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    type: "kitchen",
    length: "",
    width: "",
    height: "",
    buildingStatus: "ready",
    constructionPhase: "",
    constructionPhaseOther: "",
    doorsCount: "0",
    windowsCount: "0",
    notes: "",
    walls: [],
  };
}

function autoGenerateWalls(space: SpaceData): WallData[] {
  const L = parseFloat(space.length) || 0;
  const W = parseFloat(space.width) || 0;
  const wallDefs = [
    { suffix: "A", len: L },
    { suffix: "B", len: W },
    { suffix: "C", len: L },
    { suffix: "D", len: W },
  ];
  const wallHeight = space.height ? String(parseFloat(space.height)) : "";
  return wallDefs.map((def) => ({
    id: `wall_${space.id}_${def.suffix}`,
    name: `${t_static("الجدار", "Wall")} ${def.suffix}${def.len ? ` (${def.len}م)` : ""}`,
    length: def.len ? String(def.len) : "",
    wallHeight,
    items: [],
  }));
}

function t_static(ar: string, en: string) {
  return ar;
}

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
  const [currentSpaceId, setCurrentSpaceId] = useState<string>("");
  const [activeWallSpaceId, setActiveWallSpaceId] = useState<string>("");

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

  const [spaces, setSpaces] = useState<SpaceData[]>([{ ...newSpace(), name: t("المكان الأول", "Space 1") }]);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [surveyNotes, setSurveyNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [savedSurveyId, setSavedSurveyId] = useState<number | null>(null);
  const [nextStepsDialog, setNextStepsDialog] = useState(false);

  useEffect(() => {
    if (existingSurvey && existingSurvey.id) {
      if (existingSurvey.spaces && Array.isArray(existingSurvey.spaces) && existingSurvey.spaces.length > 0) {
        setSpaces(existingSurvey.spaces as SpaceData[]);
      }
      if (existingSurvey.selectedProducts) {
        const products = (existingSurvey.selectedProducts as any[]).map((p: any) => ({
          ...p,
          liftMechanism: p.liftMechanism || p.mechanism || "none",
          liftMechanismNote: p.liftMechanismNote || "",
          spaceId: p.spaceId || p.room || "",
        })) as SelectedProduct[];
        setSelectedProducts(products);
      }
      if (existingSurvey.notes) setSurveyNotes(existingSurvey.notes);
      if (existingSurvey.photos) setPhotos(existingSurvey.photos);
    }
  }, [existingSurvey]);

  useEffect(() => {
    if (spaces.length > 0) {
      const spaceIds = spaces.map((s) => s.id);
      if (!currentSpaceId || !spaceIds.includes(currentSpaceId)) {
        setCurrentSpaceId(spaces[0].id);
      }
      if (!activeWallSpaceId || !spaceIds.includes(activeWallSpaceId)) {
        setActiveWallSpaceId(spaces[0].id);
      }
    }
  }, [spaces]);

  function goToStep2() {
    const updatedSpaces = spaces.map((space) => {
      if (space.walls.length === 0) {
        return { ...space, walls: autoGenerateWalls(space) };
      }
      const existingIds = new Set(space.walls.map((w) => w.id));
      const generated = autoGenerateWalls(space);
      const missing = generated.filter((g) => !existingIds.has(g.id));
      return { ...space, walls: [...space.walls, ...missing] };
    });
    setSpaces(updatedSpaces);
    if (updatedSpaces.length > 0) setActiveWallSpaceId(updatedSpaces[0].id);
    setStep(2);
  }

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
      spaces,
      selectedProducts,
      notes: surveyNotes || null,
      photos,
    };
    saveMutation.mutate(data);
  }

  function updateSpace(spaceId: string, field: keyof SpaceData, value: any) {
    setSpaces(spaces.map((s) => (s.id === spaceId ? { ...s, [field]: value } : s)));
  }

  function removeSpace(spaceId: string) {
    const updated = spaces.filter((s) => s.id !== spaceId);
    setSpaces(updated);
    if (currentSpaceId === spaceId && updated.length > 0) setCurrentSpaceId(updated[0].id);
    if (activeWallSpaceId === spaceId && updated.length > 0) setActiveWallSpaceId(updated[0].id);
  }

  function addWallToSpace(spaceId: string) {
    setSpaces(spaces.map((s) => {
      if (s.id !== spaceId) return s;
      const newWall: WallData = {
        id: `wall_${spaceId}_${Date.now()}`,
        name: `${t("الجدار", "Wall")} ${s.walls.length + 1}`,
        length: "",
        wallHeight: s.height || "",
        items: [],
      };
      return { ...s, walls: [...s.walls, newWall] };
    }));
  }

  function updateWall(spaceId: string, wallId: string, field: keyof WallData, value: any) {
    setSpaces(spaces.map((s) => {
      if (s.id !== spaceId) return s;
      return {
        ...s,
        walls: s.walls.map((w) => (w.id === wallId ? { ...w, [field]: value } : w)),
      };
    }));
  }

  function removeWall(spaceId: string, wallId: string) {
    setSpaces(spaces.map((s) => {
      if (s.id !== spaceId) return s;
      return { ...s, walls: s.walls.filter((w) => w.id !== wallId) };
    }));
  }

  function addWallItem(spaceId: string, wallId: string, type: WallItem["type"]) {
    setSpaces(spaces.map((s) => {
      if (s.id !== spaceId) return s;
      return {
        ...s,
        walls: s.walls.map((w) => {
          if (w.id !== wallId) return w;
          return {
            ...w,
            items: [...w.items, { type, width: "", height: "", distanceFromFirst: "", heightFromFloor: "", specs: "", notes: "" }],
          };
        }),
      };
    }));
  }

  function updateWallItem(spaceId: string, wallId: string, itemIndex: number, field: string, value: string) {
    setSpaces(spaces.map((s) => {
      if (s.id !== spaceId) return s;
      return {
        ...s,
        walls: s.walls.map((w) => {
          if (w.id !== wallId) return w;
          const newItems = [...w.items];
          newItems[itemIndex] = { ...newItems[itemIndex], [field]: value };
          return { ...w, items: newItems };
        }),
      };
    }));
  }

  function removeWallItem(spaceId: string, wallId: string, itemIndex: number) {
    setSpaces(spaces.map((s) => {
      if (s.id !== spaceId) return s;
      return {
        ...s,
        walls: s.walls.map((w) => {
          if (w.id !== wallId) return w;
          return { ...w, items: w.items.filter((_, i) => i !== itemIndex) };
        }),
      };
    }));
  }

  function addProduct(adekoProduct: any) {
    const spaceId = currentSpaceId || (spaces[0]?.id ?? "");
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
      liftMechanism: "none",
      liftMechanismNote: "",
      notes: "",
      spaceId,
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

  const activeWallSpace = spaces.find((s) => s.id === activeWallSpaceId) || spaces[0];

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

      <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-hide">
        {([1, 2, 3, 4] as WizardStep[]).map((s) => {
          const StepIcon = stepLabels[s].icon;
          const isActive = step === s;
          const isPast = step > s;
          return (
            <button
              key={s}
              onClick={() => {
                if (s === 2 && step === 1) { goToStep2(); return; }
                setStep(s);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
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
        <div className="space-y-3" data-testid="section-spaces">
          {spaces.map((space, spaceIndex) => (
            <Card key={space.id} data-testid={`card-space-${space.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    {t("المكان", "Space")} {spaceIndex + 1}
                  </h3>
                  {spaces.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeSpace(space.id)}
                      data-testid={`button-remove-space-${space.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">{t("اسم المكان", "Space Name")}</Label>
                    <Input
                      value={space.name}
                      onChange={(e) => updateSpace(space.id, "name", e.target.value)}
                      placeholder={t("مثال: المطبخ الرئيسي", "e.g. Main Kitchen")}
                      data-testid={`input-space-name-${space.id}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("نوع المكان", "Space Type")}</Label>
                    <Select value={space.type} onValueChange={(v) => updateSpace(space.id, "type", v)}>
                      <SelectTrigger data-testid={`select-space-type-${space.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SPACE_TYPES.map((st) => (
                          <SelectItem key={st.value} value={st.value}>{t(st.ar, st.en)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">{t("الطول (م)", "Length (m)")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={space.length}
                      onChange={(e) => updateSpace(space.id, "length", e.target.value)}
                      placeholder="0.00"
                      data-testid={`input-space-length-${space.id}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("العرض (م)", "Width (m)")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={space.width}
                      onChange={(e) => updateSpace(space.id, "width", e.target.value)}
                      placeholder="0.00"
                      data-testid={`input-space-width-${space.id}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("الارتفاع (م)", "Height (m)")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={space.height}
                      onChange={(e) => updateSpace(space.id, "height", e.target.value)}
                      placeholder="0.00"
                      data-testid={`input-space-height-${space.id}`}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">{t("حالة البناء", "Building Status")}</Label>
                  <Select value={space.buildingStatus} onValueChange={(v) => updateSpace(space.id, "buildingStatus", v)}>
                    <SelectTrigger data-testid={`select-building-status-${space.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ready">{t("جاهز", "Ready")}</SelectItem>
                      <SelectItem value="under_construction">{t("قيد الإنشاء", "Under Construction")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {space.buildingStatus === "under_construction" && (
                  <div>
                    <Label className="text-xs">{t("مرحلة البناء", "Construction Phase")}</Label>
                    <Select
                      value={space.constructionPhase}
                      onValueChange={(v) => updateSpace(space.id, "constructionPhase", v)}
                    >
                      <SelectTrigger data-testid={`select-construction-phase-${space.id}`}>
                        <SelectValue placeholder={t("اختر المرحلة", "Select phase")} />
                      </SelectTrigger>
                      <SelectContent>
                        {CONSTRUCTION_PHASES.map((cp) => (
                          <SelectItem key={cp.value} value={cp.value}>{t(cp.ar, cp.en)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {space.constructionPhase === "other" && (
                      <Input
                        className="mt-2"
                        value={space.constructionPhaseOther}
                        onChange={(e) => updateSpace(space.id, "constructionPhaseOther", e.target.value)}
                        placeholder={t("اذكر المرحلة", "Specify phase")}
                        data-testid={`input-construction-phase-other-${space.id}`}
                      />
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">{t("عدد الأبواب", "Doors Count")}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={space.doorsCount}
                      onChange={(e) => updateSpace(space.id, "doorsCount", e.target.value)}
                      data-testid={`input-doors-count-${space.id}`}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">{t("يمكن أن يكون صفراً (مكان مفتوح)", "0 if open space with no door")}</p>
                  </div>
                  <div>
                    <Label className="text-xs">{t("عدد النوافذ", "Windows Count")}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={space.windowsCount}
                      onChange={(e) => updateSpace(space.id, "windowsCount", e.target.value)}
                      data-testid={`input-windows-count-${space.id}`}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">{t("يمكن أن يكون صفراً (مكان مفتوح)", "0 if open space with no door")}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">{t("ملاحظات", "Notes")}</Label>
                  <Textarea
                    value={space.notes}
                    onChange={(e) => updateSpace(space.id, "notes", e.target.value)}
                    placeholder={t("أي ملاحظات عن المكان", "Any notes about the space")}
                    data-testid={`input-space-notes-${space.id}`}
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          ))}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              const s = newSpace();
              s.name = t(`المكان ${spaces.length + 1}`, `Space ${spaces.length + 1}`);
              setSpaces([...spaces, s]);
            }}
            data-testid="button-add-space"
          >
            <Plus className="w-4 h-4 me-2" />
            {t("إضافة مكان آخر", "Add Another Space")}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3" data-testid="section-walls">
          {spaces.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {spaces.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveWallSpaceId(s.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeWallSpaceId === s.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                  data-testid={`tab-space-walls-${s.id}`}
                >
                  {s.name || t("مكان", "Space")}
                </button>
              ))}
            </div>
          )}

          {activeWallSpace && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-primary" />
                  {activeWallSpace.name || t("مكان", "Space")} — {t("الجدران", "Walls")}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addWallToSpace(activeWallSpace.id)}
                  data-testid="button-add-wall"
                >
                  <Plus className="w-3 h-3 me-1" />
                  {t("إضافة جدار", "Add Wall")}
                </Button>
              </div>

              {activeWallSpace.walls.map((wall, wallIndex) => (
                <Card key={wall.id}>
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        value={wall.name}
                        onChange={(e) => updateWall(activeWallSpace.id, wall.id, "name", e.target.value)}
                        className="h-8 text-sm font-medium flex-1"
                        data-testid={`input-wall-name-${wallIndex}`}
                      />
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Input
                          type="number"
                          step="0.01"
                          value={wall.length}
                          onChange={(e) => updateWall(activeWallSpace.id, wall.id, "length", e.target.value)}
                          placeholder={t("الطول (م)", "Length (m)")}
                          className="w-28 h-8 text-xs"
                          data-testid={`input-wall-length-${wallIndex}`}
                        />
                        {activeWallSpace.walls.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeWall(activeWallSpace.id, wall.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {wall.items.map((item, itemIndex) => {
                      const ItemIcon = wallItemIcons[item.type] || X;
                      const wallLen = parseFloat(wall.length) || 0;
                      const spaceHeight = parseFloat(activeWallSpace.height) || 0;
                      const isDoorOrWindow = item.type === "door" || item.type === "window";
                      const isOutletOrDrain = item.type === "outlet" || item.type === "drain";

                      const distFromSecond = isDoorOrWindow && wallLen > 0
                        ? (wallLen - (parseFloat(item.distanceFromFirst) || 0) - (parseFloat(item.width) || 0)).toFixed(2)
                        : null;

                      const heightFromCeiling = isOutletOrDrain && spaceHeight > 0
                        ? (spaceHeight - (parseFloat(item.heightFromFloor) || 0)).toFixed(2)
                        : null;

                      return (
                        <div key={itemIndex} className="p-2 bg-muted/50 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <ItemIcon className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-xs font-medium">{t(wallItemLabels[item.type]?.ar || "", wallItemLabels[item.type]?.en || "")}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => removeWallItem(activeWallSpace.id, wall.id, itemIndex)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>

                          {isDoorOrWindow && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                              <div>
                                <Label className="text-[10px]">{t("العرض (م)", "Width (m)")}</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.width}
                                  onChange={(e) => updateWallItem(activeWallSpace.id, wall.id, itemIndex, "width", e.target.value)}
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div>
                                <Label className="text-[10px]">{t("الارتفاع (م)", "Height (m)")}</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.height}
                                  onChange={(e) => updateWallItem(activeWallSpace.id, wall.id, itemIndex, "height", e.target.value)}
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div>
                                <Label className="text-[10px]">{t("بُعد عن الحرف الأول (م)", "Distance from First Edge (m)")}</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.distanceFromFirst}
                                  onChange={(e) => updateWallItem(activeWallSpace.id, wall.id, itemIndex, "distanceFromFirst", e.target.value)}
                                  className="h-7 text-xs"
                                />
                              </div>
                            </div>
                          )}

                          {isDoorOrWindow && distFromSecond !== null && (
                            <p className="text-[10px] text-muted-foreground">
                              {t("بُعد عن الحرف الثاني", "Distance from Second Edge")}: <span className="font-semibold text-foreground">{distFromSecond} م</span>
                            </p>
                          )}

                          {isOutletOrDrain && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              <div>
                                <Label className="text-[10px]">{t("ارتفاع عن الأرضية (م)", "Height from Floor (m)")}</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.heightFromFloor}
                                  onChange={(e) => updateWallItem(activeWallSpace.id, wall.id, itemIndex, "heightFromFloor", e.target.value)}
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div>
                                <Label className="text-[10px]">{t("بُعد عن الحرف الأول (م)", "Distance from First Edge (m)")}</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.distanceFromFirst}
                                  onChange={(e) => updateWallItem(activeWallSpace.id, wall.id, itemIndex, "distanceFromFirst", e.target.value)}
                                  className="h-7 text-xs"
                                />
                              </div>
                            </div>
                          )}

                          {isOutletOrDrain && heightFromCeiling !== null && (
                            <p className="text-[10px] text-muted-foreground">
                              {t("مسافة من السقف", "Distance from Ceiling")}: <span className="font-semibold text-foreground">{heightFromCeiling} م</span>
                            </p>
                          )}

                          {isOutletOrDrain && (
                            <div>
                              <Label className="text-[10px]">{t("مواصفات", "Specs")}</Label>
                              <Input
                                value={item.specs}
                                onChange={(e) => updateWallItem(activeWallSpace.id, wall.id, itemIndex, "specs", e.target.value)}
                                placeholder={t("مثال: مخرج كهرباء 6 ملم", "e.g. 6mm socket")}
                                className="h-7 text-xs"
                              />
                            </div>
                          )}

                          {item.type === "obstacle" && (
                            <div>
                              <Label className="text-[10px]">{t("وصف العائق", "Obstacle Description")}</Label>
                              <Input
                                value={item.notes}
                                onChange={(e) => updateWallItem(activeWallSpace.id, wall.id, itemIndex, "notes", e.target.value)}
                                placeholder={t("وصف العائق", "Describe the obstacle")}
                                className="h-7 text-xs"
                              />
                            </div>
                          )}
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
                            onClick={() => addWallItem(activeWallSpace.id, wall.id, type)}
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

              {activeWallSpace.walls.length === 0 && (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  {t("لا توجد جدران — سيتم توليدها تلقائياً عند الانتقال من الخطوة الأولى", "No walls yet — they will be auto-generated from Step 1")}
                </div>
              )}
            </div>
          )}
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
              <Select value={currentSpaceId} onValueChange={setCurrentSpaceId}>
                <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-space">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {spaces.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name || t("مكان", "Space")}</SelectItem>
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

          {spaces.map((space) => {
            const spaceProducts = selectedProducts.filter((p) => p.spaceId === space.id);
            if (spaceProducts.length === 0) return null;
            return (
              <div key={space.id}>
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  {space.name || t("مكان", "Space")} ({spaceProducts.length})
                </div>
                {spaceProducts.map((product) => (
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
                          <Label className="text-[10px]">{t("المكان", "Space")}</Label>
                          <Select value={product.spaceId} onValueChange={(v) => updateProduct(product.id, "spaceId", v)}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {spaces.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name || t("مكان", "Space")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px]">{t("آلية الفتح", "Lift Mechanism")}</Label>
                          <Select value={product.liftMechanism} onValueChange={(v) => updateProduct(product.id, "liftMechanism", v)}>
                            <SelectTrigger className="h-7 text-xs" data-testid={`select-mechanism-${product.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LIFT_MECHANISMS.map((m) => (
                                <SelectItem key={m.value} value={m.value}>{t(m.ar, m.en)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px]">{t("ملاحظات آلية الفتح", "Mechanism Note")}</Label>
                          <Input
                            value={product.liftMechanismNote}
                            onChange={(e) => updateProduct(product.id, "liftMechanismNote", e.target.value)}
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

      <div className="fixed bottom-0 start-0 end-0 bg-card border-t border-border p-3 flex items-center justify-between z-40">
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
            onClick={() => {
              if (step === 1) { goToStep2(); return; }
              setStep((step + 1) as WizardStep);
            }}
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
              data-testid="button-back-to-calendar"
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
