import { useState, useMemo, useEffect, useRef } from "react";
import teakLogoUrl from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  KITCHEN_TEMPLATES,
  APPLIANCE_VARIANT_LABELS,
  matchKitchenTemplates,
  type ApplianceVariant,
  type TemplateWarning,
} from "@/lib/kitchenTemplates";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useParams, useSearch } from "wouter";
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
  ShowerHead,
  Box,
  FileText,
  Calendar,
  Filter,
  AlertCircle,
  Zap,
  UtensilsCrossed,
  Layers,
  Columns,
  Settings2,
  Map,
  Printer,
  Upload,
  FileImage,
  Check,
  Paperclip,
} from "lucide-react";

type WizardStep = 1 | 2 | 3;
type SubStep = "info" | "walls";

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
  { value: "planning", ar: "التخطيط", en: "Planning" },
  { value: "structure", ar: "العظم", en: "Structure" },
  { value: "mep", ar: "التأسيس كهرباء وسباكة وميكانيك", en: "MEP Foundation" },
  { value: "plastering", ar: "اللياسة", en: "Plastering" },
  { value: "gypsum", ar: "الجبس", en: "Gypsum" },
  { value: "tiling", ar: "البلاط", en: "Tiling" },
  { value: "painting", ar: "الدهان", en: "Painting" },
  { value: "installations", ar: "التركيبات", en: "Installations" },
  { value: "other", ar: "أخرى", en: "Other" },
];

const OUTLET_SPECS = [
  { value: "single_switch", ar: "مفتاح كهرباء فردي", en: "Single Switch" },
  { value: "double_switch", ar: "مفتاح كهرباء ثنائي", en: "Double Switch" },
  { value: "triple_switch", ar: "مفتاح كهرباء ثلاثي", en: "Triple Switch" },
  { value: "quad_switch", ar: "مفتاح كهرباء رباعي", en: "Quad Switch" },
  { value: "round_switch", ar: "مفتاح كهرباء دائري", en: "Round Switch" },
  { value: "double_socket", ar: "فيش ثنائي", en: "Double Socket" },
  { value: "triple_socket", ar: "فيش ثلاثي", en: "Triple Socket" },
  { value: "heater_ac", ar: "مفتاح سخان ومكيف", en: "Heater/AC Switch" },
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
  type: "door" | "window" | "outlet" | "drain" | "water_supply" | "obstacle";
  width: string;
  height: string;
  distanceFromFirst: string;
  heightFromFloor: string;
  specs: string;
  notes: string;
  drainPlacement?: "wall" | "floor";
  distanceFromWall?: string;
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
  spaceTypeOther: string;
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
  wallId: string;
  designW: string;
}

const stepLabels: Record<WizardStep, { ar: string; en: string; icon: typeof Ruler }> = {
  1: { ar: "الأماكن والجدران", en: "Spaces & Walls", icon: Building2 },
  2: { ar: "المنتجات", en: "Products", icon: Package },
  3: { ar: "الملاحظات والصور", en: "Notes & Photos", icon: Camera },
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
    spaceTypeOther: "",
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

const KITCHEN_CATEGORIES = [
  { groupCode: "TK1", ar: "وحدات القاعدة", en: "Base Units", icon: Layers },
  { groupCode: "TK2", ar: "وحدات الحوض", en: "Sink Units", icon: UtensilsCrossed },
  { groupCode: "TK3", ar: "وحدات العلوية", en: "Wall Units", icon: Columns },
  { groupCode: "TK4", ar: "وحدات البرج/الطويلة", en: "Tall Units", icon: Ruler },
  { groupCode: "TK5", ar: "ميكانيزم", en: "Mechanisms", icon: Settings2 },
] as const;

const WARDROBE_SPACE_TYPES = ["bedroom", "dressing", "storage"];

const wallItemIcons: Record<string, typeof DoorOpen> = {
  door: DoorOpen,
  window: Grid3X3,
  outlet: Plug,
  drain: Droplets,
  water_supply: Droplets,
  obstacle: X,
};

const wallItemLabels: Record<string, { ar: string; en: string }> = {
  door: { ar: "باب", en: "Door" },
  window: { ar: "نافذة", en: "Window" },
  outlet: { ar: "مخرج كهرباء", en: "Outlet" },
  drain: { ar: "فتحة صرف", en: "Drain" },
  water_supply: { ar: "تغذية مياه", en: "Water Supply" },
  obstacle: { ar: "عائق", en: "Obstacle" },
};

const wallItemColors: Record<string, { bg: string; border: string; icon: string; label: string; btnBg: string; btnBorder: string; btnText: string }> = {
  door:         { bg: "bg-amber-50",   border: "border-amber-200",  icon: "text-amber-700",  label: "text-amber-900",  btnBg: "bg-amber-50 hover:bg-amber-100",   btnBorder: "border-amber-300",  btnText: "text-amber-800" },
  window:       { bg: "bg-sky-50",     border: "border-sky-200",    icon: "text-sky-600",    label: "text-sky-900",    btnBg: "bg-sky-50 hover:bg-sky-100",       btnBorder: "border-sky-300",    btnText: "text-sky-800" },
  outlet:       { bg: "bg-yellow-50",  border: "border-yellow-300", icon: "text-yellow-600", label: "text-yellow-900", btnBg: "bg-yellow-50 hover:bg-yellow-100", btnBorder: "border-yellow-400", btnText: "text-yellow-800" },
  drain:        { bg: "bg-teal-50",    border: "border-teal-200",   icon: "text-teal-600",   label: "text-teal-900",   btnBg: "bg-teal-50 hover:bg-teal-100",     btnBorder: "border-teal-300",   btnText: "text-teal-800" },
  water_supply: { bg: "bg-blue-50",    border: "border-blue-200",   icon: "text-blue-600",   label: "text-blue-900",   btnBg: "bg-blue-50 hover:bg-blue-100",     btnBorder: "border-blue-300",   btnText: "text-blue-800" },
  obstacle:     { bg: "bg-purple-50",  border: "border-purple-200", icon: "text-purple-600", label: "text-purple-900", btnBg: "bg-purple-50 hover:bg-purple-100", btnBorder: "border-purple-300", btnText: "text-purple-800" },
};

export default function SiteSurveyPage() {
  const { t, lang } = useLanguage();
  const isRTL = lang === "ar";
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = useParams<{ appointmentId: string }>();
  const appointmentId = parseInt(params.appointmentId || "0");
  const returnTo = new URLSearchParams(search).get("returnTo") || "/my-orders";
  const autoPrint = new URLSearchParams(search).get("print") === "1";
  const autoPrintDoneRef = useRef(false);

  const [step, setStep] = useState<WizardStep>(1);
  const [subStep, setSubStep] = useState<SubStep>("info");
  const [autoSavePending, setAutoSavePending] = useState(false);
  const [autoSaveError, setAutoSaveError] = useState(false);
  const autoSaveDirtyRef = useRef(false);
  const savedSurveyIdRef = useRef<number | null>(null);
  const surveyInitializedRef = useRef(false);
  const [productSearchDialog, setProductSearchDialog] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [currentSpaceId, setCurrentSpaceId] = useState<string>("");
  const [templateVariant, setTemplateVariant] = useState<ApplianceVariant>("none");
  const [templatePreviewId, setTemplatePreviewId] = useState<string | null>(null);
  const [templateWarningsId, setTemplateWarningsId] = useState<string | null>(null);
  const [activeWallSpaceId, setActiveWallSpaceId] = useState<string>("");
  const [selectedWallId, setSelectedWallId] = useState<string>("");

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
  const [uploadDesignDialog, setUploadDesignDialog] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ id: number; file_name: string; file_label?: string; mime_type: string; file_size: number; attach_to_quote: boolean }>>([]);
  const [printingPdf, setPrintingPdf] = useState(false);
  const [designFilesLoaded, setDesignFilesLoaded] = useState(false);
  const [pendingFileLabel, setPendingFileLabel] = useState("");
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (existingSurvey && existingSurvey.id && !surveyInitializedRef.current) {
      surveyInitializedRef.current = true;
      if (existingSurvey.spaces && Array.isArray(existingSurvey.spaces) && existingSurvey.spaces.length > 0) {
        setSpaces(existingSurvey.spaces as SpaceData[]);
      }
      if (existingSurvey.selectedProducts) {
        const products = (existingSurvey.selectedProducts as any[]).map((p: any) => ({
          ...p,
          liftMechanism: p.liftMechanism || p.mechanism || "none",
          liftMechanismNote: p.liftMechanismNote || "",
          spaceId: p.spaceId || p.room || "",
          wallId: p.wallId || "",
          designW: p.designW || "",
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

  useEffect(() => {
    if (autoPrint && !autoPrintDoneRef.current && (existingSurvey || spaces.length > 0)) {
      autoPrintDoneRef.current = true;
      setTimeout(() => { handlePrintSurveyReport(); }, 600);
    }
  }, [autoPrint, existingSurvey, spaces.length]);

  function goToWallsSubStep(spaceId: string, currentSpaces?: SpaceData[]) {
    const src = currentSpaces || spaces;
    const updatedSpaces = src.map((space) => {
      if (space.id !== spaceId) return space;
      if (space.walls.length === 0) return { ...space, walls: autoGenerateWalls(space) };
      return space;
    });
    setSpaces(updatedSpaces);
    const spaceAfter = updatedSpaces.find((s) => s.id === spaceId);
    if (spaceAfter && spaceAfter.walls.length > 0) {
      setSelectedWallId(spaceAfter.walls[0].id);
    }
    setSubStep("walls");
  }

  const autoSaveMutation = useMutation({
    mutationFn: async (data: any) => {
      const surveyId = existingSurvey?.id || savedSurveyIdRef.current;
      if (surveyId) {
        const res = await apiRequest("PATCH", `/api/site-surveys/${surveyId}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/site-surveys", data);
      return res.json();
    },
    onMutate: () => {
      setAutoSavePending(true);
      setAutoSaveError(false);
    },
    onSuccess: (saved: any) => {
      setAutoSavePending(false);
      if (!savedSurveyIdRef.current && saved?.id) {
        savedSurveyIdRef.current = saved.id;
        setSavedSurveyId(saved.id);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/site-surveys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", appointmentId, "site-survey"] });
      if (autoSaveDirtyRef.current) {
        autoSaveDirtyRef.current = false;
        performAutoSaveNow();
      }
    },
    onError: () => {
      setAutoSavePending(false);
      setAutoSaveError(true);
    },
  });

  function performAutoSaveNow(currentSpaces?: SpaceData[], currentProducts?: any[]) {
    const data = {
      appointmentId,
      customerId: appointment?.customerId || null,
      quotationId: appointment?.quotationId || null,
      spaces: currentSpaces || spaces,
      selectedProducts: currentProducts ?? selectedProducts,
      notes: surveyNotes || null,
      photos,
    };
    autoSaveMutation.mutate(data);
  }

  function performAutoSave(currentSpaces?: SpaceData[], currentProducts?: any[]) {
    if (autoSaveMutation.isPending) {
      autoSaveDirtyRef.current = true;
      return;
    }
    performAutoSaveNow(currentSpaces, currentProducts);
  }

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const surveyId = existingSurvey?.id || savedSurveyIdRef.current;
      if (surveyId) {
        const res = await apiRequest("PATCH", `/api/site-surveys/${surveyId}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/site-surveys", data);
      return res.json();
    },
    onSuccess: (saved: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-surveys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", appointmentId, "site-survey"] });
      toast({ title: t("تم حفظ نموذج الزيارة بنجاح", "Survey saved successfully") });
      const newId = saved?.id || existingSurvey?.id || null;
      if (newId) savedSurveyIdRef.current = newId;
      setSavedSurveyId(newId);
      setNextStepsDialog(true);
    },
    onError: () => {
      toast({ title: t("حدث خطأ في الحفظ", "Save failed"), variant: "destructive" });
    },
  });

  const saveMeasurementsMutation = useMutation({
    mutationFn: async (data: any) => {
      const surveyId = existingSurvey?.id || savedSurveyIdRef.current;
      if (surveyId) {
        const res = await apiRequest("PATCH", `/api/site-surveys/${surveyId}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/site-surveys", data);
      return res.json();
    },
    onSuccess: (saved: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-surveys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", appointmentId, "site-survey"] });
      const newId = saved?.id || existingSurvey?.id || null;
      if (newId) savedSurveyIdRef.current = newId;
      setSavedSurveyId(newId);
      toast({ title: t("تم حفظ المقاسات بنجاح", "Measurements saved successfully") });
      setShowResults(true);
    },
    onError: () => {
      toast({ title: t("حدث خطأ في الحفظ", "Save failed"), variant: "destructive" });
    },
  });

  const sendToDesignerMutation = useMutation({
    mutationFn: async (quotationId: number) => {
      const res = await apiRequest("PATCH", `/api/quotations/${quotationId}`, {
        orderStage: "survey_done",
        notes: `[تم رفع المقاسات]: بتاريخ ${new Date().toLocaleDateString("ar-SA")} — بانتظار إعداد عرض السعر`,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: t("تم حفظ الطلب بالمقاسات بنجاح — بانتظار إعداد عرض السعر", "Order saved with measurements — awaiting quotation") });
      navigate(returnTo);
    },
    onError: () => {
      navigate(returnTo);
    },
  });

  function handleSaveMeasurements() {
    const data: any = {
      appointmentId,
      customerId: appointment?.customerId || null,
      quotationId: appointment?.quotationId || null,
      spaces,
      selectedProducts,
      notes: surveyNotes || null,
      photos,
    };
    saveMeasurementsMutation.mutate(data);
  }

  function navigateToStep(targetStep: WizardStep) {
    const currentStep = step;
    if (targetStep === currentStep) return;
    if (targetStep > currentStep) {
      if (currentStep === 1) {
        const editSpace = spaces.find((s) => s.id === activeWallSpaceId) || spaces[0];
        if (subStep === "info" && editSpace) {
          goToWallsSubStep(editSpace.id);
          return;
        }
        performAutoSave();
        setStep(2);
        return;
      }
      performAutoSave();
      setStep((currentStep + 1) as WizardStep);
    } else {
      setStep(targetStep);
      if (targetStep === 1) setSubStep("walls");
    }
  }

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

  useEffect(() => {
    if (uploadDesignDialog && !designFilesLoaded) {
      const sid = savedSurveyId || existingSurvey?.id;
      if (!sid) return;
      setDesignFilesLoaded(true);
      fetch(`/api/site-surveys/${sid}/design-files`, { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then((files: any[]) => setUploadedFiles(files))
        .catch(() => {});
    }
    if (!uploadDesignDialog) setDesignFilesLoaded(false);
  }, [uploadDesignDialog, savedSurveyId, existingSurvey?.id]);

  async function handlePrintSurveyReport() {
    setPrintingPdf(true);
    try {
      const customer = (customers as any[]).find((c: any) => c.id === appointment?.customerId);
      const surveyNum = savedSurveyId || existingSurvey?.id || "—";
      const apptNum = appointmentId || "—";
      const dateStr = new Date().toLocaleDateString("ar-SA");
      const repName = user ? (user.fullNameAr || user.fullNameEn || "") : "";

      const wallLetters = ["A", "B", "C", "D"];
      const itemLabelAr: Record<string, string> = {
        door: "باب", window: "نافذة", outlet: "مخرج كهرباء",
        drain: "فتحة صرف", obstacle: "عائق", water_supply: "تغذية مياه",
      };

      let spacesHtml = "";
      spaces.forEach((space, si) => {
        const spaceType = SPACE_TYPES.find(st => st.value === space.type);
        const typeName = spaceType ? spaceType.ar : space.type || "";
        let wallsHtml = "";
        if (space.walls.length > 0) {
          const rows = space.walls.map((w, wi) => {
            const letter = wallLetters[wi] || String(wi + 1);
            let itemsHtml = "";
            if (w.items.length > 0) {
              itemsHtml = w.items.map(it => {
                const label = itemLabelAr[it.type] || it.type;
                const parts: string[] = [];
                if (it.distanceFromFirst) parts.push(`بُعد عن الحرف: ${it.distanceFromFirst}م`);
                if (it.heightFromFloor && it.type !== "drain") parts.push(`ارتفاع: ${it.heightFromFloor}م`);
                if (it.width && it.type !== "drain" && it.type !== "water_supply") parts.push(`عرض: ${it.width}م`);
                if (it.height && it.type !== "drain" && it.type !== "water_supply") parts.push(`ارتفاع: ${it.height}م`);
                if (it.specs) parts.push(it.specs);
                return `<span class="item-badge">${label}${parts.length ? ": " + parts.join(" | ") : ""}</span>`;
              }).join("");
            } else {
              itemsHtml = `<span class="no-items">—</span>`;
            }
            return `<tr>
              <td class="wall-letter">${letter}</td>
              <td>${w.length ? w.length + " م" : "—"}</td>
              <td>${w.wallHeight || space.height ? (w.wallHeight || space.height) + " م" : "—"}</td>
              <td class="items-cell">${itemsHtml}</td>
            </tr>`;
          }).join("");
          wallsHtml = `<table class="wall-table">
            <thead><tr><th>الجدار</th><th>الطول</th><th>الارتفاع</th><th>العناصر</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
        } else {
          wallsHtml = `<p class="no-walls">لم تُضف جدران</p>`;
        }
        const dims = [space.length && `${space.length}م`, space.width && `${space.width}م`, space.height && `${space.height}م`].filter(Boolean).join(" × ");
        spacesHtml += `<div class="space-section">
          <div class="space-header">${si + 1}. ${space.name || "مكان"} — ${typeName}${dims ? ` | ${dims}` : ""}</div>
          ${wallsHtml}
        </div>`;
      });

      const logoDataUrl = await new Promise<string>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width; canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (ctx) { ctx.drawImage(img, 0, 0); resolve(canvas.toDataURL("image/png")); }
          else resolve("");
        };
        img.onerror = () => resolve("");
        img.src = teakLogoUrl;
      });

      const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/>
<title>تقرير الزيارة الميدانية</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 13px; color: #111; background: #fff; direction: rtl; }
  .page { max-width: 800px; margin: 0 auto; padding: 24px; }
  .header { background: #1a365d; color: white; border-radius: 8px; padding: 16px 20px; display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
  .header img { width: 56px; height: 56px; object-fit: contain; filter: brightness(0) invert(1); }
  .header-text h1 { font-size: 18px; font-weight: 700; }
  .header-text p { font-size: 11px; opacity: 0.8; margin-top: 2px; }
  .header-text .subtitle { font-size: 12px; margin-top: 6px; background: rgba(255,255,255,0.15); padding: 3px 8px; border-radius: 4px; display: inline-block; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 20px; padding: 12px 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
  .meta-item { font-size: 12px; }
  .meta-label { color: #64748b; font-size: 11px; }
  .meta-value { font-weight: 600; color: #1a365d; }
  .space-section { margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .space-header { background: #1a365d; color: white; padding: 8px 14px; font-size: 13px; font-weight: 700; }
  .wall-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .wall-table th { background: #e2e8f0; padding: 7px 10px; text-align: right; font-weight: 600; color: #1a365d; border-bottom: 2px solid #cbd5e1; }
  .wall-table td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .wall-table tr:last-child td { border-bottom: none; }
  .wall-table tr:nth-child(even) td { background: #f8fafc; }
  .wall-letter { font-weight: 700; color: #1a365d; font-size: 14px; }
  .items-cell { line-height: 1.8; }
  .item-badge { display: inline-block; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; padding: 1px 7px; margin: 2px 2px; font-size: 11px; color: #1e40af; }
  .no-items { color: #94a3b8; }
  .no-walls { padding: 10px 14px; color: #94a3b8; font-size: 12px; }
  .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
  @media print {
    body { font-size: 12px; }
    .page { padding: 12px; }
    .space-section { break-inside: avoid; }
    @page { margin: 15mm; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Teak"/>` : ""}
    <div class="header-text">
      <h1>مصنع تيك للمنتجات الخشبية</h1>
      <p>Teak Wood Products Factory</p>
      <span class="subtitle">تقرير الزيارة الميدانية — Site Survey Report</span>
    </div>
  </div>
  <div class="meta-grid">
    <div class="meta-item"><div class="meta-label">العميل</div><div class="meta-value">${customer?.fullName || "—"}</div></div>
    <div class="meta-item"><div class="meta-label">تاريخ الرفع</div><div class="meta-value">${dateStr}</div></div>
    <div class="meta-item"><div class="meta-label">رقم الجوال</div><div class="meta-value">${customer?.phone || "—"}</div></div>
    <div class="meta-item"><div class="meta-label">المندوب</div><div class="meta-value">${repName}</div></div>
    <div class="meta-item"><div class="meta-label">رقم الزيارة</div><div class="meta-value">${surveyNum}</div></div>
    <div class="meta-item"><div class="meta-label">رقم الموعد</div><div class="meta-value">${apptNum}</div></div>
  </div>
  ${spacesHtml}
  <div class="footer">تيك للصناعات الخشبية — جميع الحقوق محفوظة ${new Date().getFullYear()}</div>
</div>
<script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

      const printWin = window.open("", "_blank", "width=900,height=700");
      if (printWin) {
        printWin.document.write(html);
        printWin.document.close();
      } else {
        toast({ title: t("يرجى السماح بفتح النوافذ المنبثقة", "Please allow popups"), variant: "destructive" });
      }
    } catch (err) {
      console.error("Print report error:", err);
      toast({ title: t("تعذر إنشاء التقرير", "Failed to generate report"), variant: "destructive" });
    } finally {
      setPrintingPdf(false);
    }
  }

  async function handleFileUpload(file: File, fileLabel?: string) {
    const sid = savedSurveyId || existingSurvey?.id;
    if (!sid) {
      toast({ title: t("احفظ النموذج أولاً", "Save the survey first"), variant: "destructive" });
      return;
    }
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (fileLabel && fileLabel.trim()) formData.append("fileLabel", fileLabel.trim());
      if (appointment?.quotationId) formData.append("quotationId", String(appointment.quotationId));
      const res = await fetch(`/api/site-surveys/${sid}/design-files`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      const newFile = await res.json();
      setUploadedFiles(prev => [newFile, ...prev]);
      setPendingFileLabel("");
      toast({ title: t("تم رفع الملف بنجاح", "File uploaded successfully") });
    } catch (e: any) {
      toast({ title: e.message || t("حدث خطأ في رفع الملف", "File upload failed"), variant: "destructive" });
    } finally {
      setUploadingFile(false);
    }
  }

  async function handleToggleAttach(fileId: number, attachToQuote: boolean) {
    const sid = savedSurveyId || existingSurvey?.id;
    if (!sid) return;
    const quotationId = appointment?.quotationId;
    try {
      // Send quotationId so server can sync quotation.attachedDesignFiles directly
      await apiRequest("PATCH", `/api/site-surveys/${sid}/design-files/${fileId}`, {
        attachToQuote,
        ...(quotationId ? { quotationId } : {}),
      });
      setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, attach_to_quote: attachToQuote } : f));
      if (quotationId) {
        queryClient.invalidateQueries({ queryKey: ["/api/quotations", String(quotationId)] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/site-surveys", String(sid), "design-files"] });
      toast({ title: attachToQuote ? t("تم إرفاق الملف بعرض السعر", "File attached to quotation") : t("تم إلغاء الإرفاق", "Attachment removed") });
    } catch {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
    }
  }

  async function handleDeleteFile(fileId: number) {
    const sid = savedSurveyId || existingSurvey?.id;
    if (!sid) return;
    try {
      await apiRequest("DELETE", `/api/site-surveys/${sid}/design-files/${fileId}`);
      setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
      queryClient.invalidateQueries({ queryKey: ["/api/site-surveys", String(sid), "design-files"] });
    } catch {
      toast({ title: t("حدث خطأ في الحذف", "Delete failed"), variant: "destructive" });
    }
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
            items: [...w.items, {
              type, width: "", height: "", distanceFromFirst: "", heightFromFloor: "", specs: "", notes: "",
              ...(type === "drain" ? { drainPlacement: "wall" as const, distanceFromWall: "" } : {}),
              ...(type === "water_supply" ? { drainPlacement: undefined, distanceFromWall: "" } : {}),
            }],
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
      wallId: "",
      designW: String(parseFloat(adekoProduct.designW || "0") || ""),
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

  const currentSpace = useMemo(() =>
    spaces.find((s) => s.id === currentSpaceId) || spaces[0],
  [spaces, currentSpaceId]);

  const spaceUsageFilter = useMemo((): string[] | null => {
    if (!currentSpace) return null;
    if (currentSpace.type === "kitchen") return ["kitchen", "both"];
    if (WARDROBE_SPACE_TYPES.includes(currentSpace.type)) return ["wardrobe", "both"];
    return null;
  }, [currentSpace]);

  const filteredAdekoProducts = useMemo(() => {
    let list = adekoProducts as any[];
    if (spaceUsageFilter) {
      list = list.filter((p: any) => spaceUsageFilter.includes(p.usageType || "kitchen"));
    }
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
  }, [adekoProducts, selectedGroup, productSearch, spaceUsageFilter]);

  const customer = customers.find((c: any) => c.id === appointment?.customerId);

  // ── Kitchen template matching ──────────────────────────────
  const kitchenTemplateMatches = useMemo(() => {
    if (!currentSpace || currentSpace.type !== "kitchen") return [];
    const L = parseFloat(currentSpace.length) || 0;
    const W = parseFloat(currentSpace.width) || 0;
    if (!L || !W) return [];
    const wallObstructions = (currentSpace.walls || []).map((wall: any, idx: number) => ({
      label: (["A","B","C","D"][idx] || "A") as "A" | "B" | "C" | "D",
      items: (wall.items || []).map((item: any) => ({
        type: item.type,
        wall: (["A","B","C","D"][idx] || "A") as "A" | "B" | "C" | "D",
        width: parseFloat(item.width) || 0,
        distanceFromFirst: parseFloat(item.distanceFromFirst) || 0,
      })),
    }));
    return matchKitchenTemplates(L, W, wallObstructions).slice(0, 4);
  }, [currentSpace]);

  function applyKitchenTemplate(templateId: string, variant: ApplianceVariant) {
    if (!currentSpace) return;
    const tmpl = KITCHEN_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;
    const items = tmpl.variants[variant];
    const allProducts = adekoProducts as any[];

    const wallLetters = ["A","B","C","D"];
    const wallIdMap: Record<string, string> = {};
    (currentSpace.walls || []).forEach((wall: any, idx: number) => {
      const letter = wallLetters[idx];
      if (letter) wallIdMap[letter] = wall.id;
    });

    const newProducts = items.flatMap((item) => {
      const adekoProduct = allProducts.find((p: any) => p.code === item.code);
      if (!adekoProduct) return [];
      return Array.from({ length: item.qty }, (_, i) => ({
        id: `prod_${Date.now()}_${Math.random().toString(36).slice(2,6)}_${i}`,
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
        notes: item.notes || (item.isApplianceSpace ? t("مكان جهاز", "Appliance space") : ""),
        spaceId: currentSpace.id,
        wallId: wallIdMap[item.wall] || "",
        designW: String(parseFloat(adekoProduct.designW || "0") || ""),
        _isCorner: !!item.cornerAnchor,
        _cornerJunction: item.cornerAnchor ? (item.cornerJunction ?? "end") : null,
        _zone: item.zone || null,
      }));
    });

    const validSpaceIds = new Set(spaces.map((s) => s.id));
    const withoutCurrentSpace = selectedProducts.filter(
      (p) => p.spaceId !== currentSpace.id && validSpaceIds.has(p.spaceId)
    );
    const mergedProducts = [...withoutCurrentSpace, ...newProducts];
    setSelectedProducts(mergedProducts);
    performAutoSave(undefined, mergedProducts);
    toast({
      title: t("تم تطبيق القالب", "Template Applied"),
      description: t(
        `تم إضافة ${newProducts.length} منتج من قالب ${tmpl.nameAr}`,
        `Added ${newProducts.length} products from ${tmpl.nameEn}`
      ),
    });
  }

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
        <Button variant="ghost" size="sm" onClick={() => navigate(returnTo)} data-testid="button-back-calendar">
          {lang === "ar" ? <ChevronRight className="w-4 h-4 me-1" /> : <ChevronLeft className="w-4 h-4 me-1" />}
          {t("العودة", "Back")}
        </Button>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-hide">
        {!showResults ? (
          <button
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap bg-primary text-primary-foreground flex-shrink-0"
            data-testid="button-step-1"
          >
            <Ruler className="w-3.5 h-3.5" />
            {t("الأماكن والجدران", "Spaces & Walls")}
          </button>
        ) : (
          <>
            <button
              onClick={() => setShowResults(false)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap bg-primary/10 text-primary flex-shrink-0 transition-all"
              data-testid="button-step-1-done"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t("الأماكن والجدران", "Spaces & Walls")}
            </button>
            {lang === "ar" ? <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronLeft className="w-3 h-3 text-muted-foreground shrink-0" />}
            <button
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap bg-primary text-primary-foreground flex-shrink-0"
              data-testid="button-step-results"
            >
              <Map className="w-3.5 h-3.5" />
              {t("النتائج", "Results")}
            </button>
          </>
        )}
      </div>

      {showResults && (
        <div className="space-y-4" data-testid="section-survey-results">
          <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-green-800 dark:text-green-300">
                {t("تم حفظ المقاسات بنجاح", "Measurements Saved Successfully")}
              </h2>
              <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
                {t("بانتظار إعداد عرض السعر", "Awaiting quotation preparation")}
              </p>
            </div>
          </div>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Ruler className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">{t("ملخص المقاسات", "Measurements Summary")}</h3>
                <Badge variant="secondary" className="ms-auto text-xs">{spaces.length} {t("مكان", spaces.length === 1 ? "space" : "spaces")}</Badge>
                <button
                  className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-primary"
                  onClick={handlePrintSurveyReport}
                  disabled={printingPdf}
                  title={t("طباعة المقاسات PDF", "Print Measurements PDF")}
                  data-testid="button-print-measurements-pdf"
                >
                  {printingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                </button>
                {(savedSurveyId || existingSurvey?.id) && (
                  <>
                    <button
                      className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-primary"
                      onClick={() => window.open(`/scene-3d?surveyId=${savedSurveyId || existingSurvey?.id}&printMode=3d`, "_blank")}
                      title={t("طباعة التصميم ثلاثي الأبعاد", "Print 3D Design")}
                      data-testid="button-print-3d"
                    >
                      <Box className="w-4 h-4" />
                    </button>
                    <button
                      className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-primary"
                      onClick={() => window.open(`/scene-3d?surveyId=${savedSurveyId || existingSurvey?.id}&printMode=2d`, "_blank")}
                      title={t("طباعة المخطط الأفقي 2D", "Print 2D Floor Plan")}
                      data-testid="button-print-2d"
                    >
                      <Map className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
              {spaces.map((space, idx) => {
                const wallLetters = ["A", "B", "C", "D"];
                return (
                  <div key={space.id} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 bg-muted/50 px-3 py-2 border-b">
                      <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="font-medium text-sm">{idx + 1}. {space.name || t("مكان", "Space")}</span>
                      {space.length && space.width && (
                        <Badge variant="outline" className="text-xs ms-auto shrink-0">
                          {space.length} × {space.width}{space.height ? ` × ${space.height}` : ""} م
                        </Badge>
                      )}
                    </div>
                    {space.walls.length > 0 ? (
                      <div className="p-3 overflow-x-auto">
                        <table className="w-full text-xs min-w-[280px]">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="text-start pb-1.5 font-medium pe-3">{t("الجدار", "Wall")}</th>
                              <th className="text-start pb-1.5 font-medium pe-3">{t("الطول", "Length")}</th>
                              <th className="text-start pb-1.5 font-medium pe-3">{t("الارتفاع", "Height")}</th>
                              <th className="text-start pb-1.5 font-medium">{t("العناصر", "Items")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {space.walls.map((wall, wi) => (
                              <tr key={wall.id} className="border-b last:border-0">
                                <td className="py-1.5 font-mono font-bold text-primary pe-3">{wallLetters[wi] || String(wi + 1)}</td>
                                <td className="py-1.5 pe-3">{wall.length ? `${wall.length} م` : "—"}</td>
                                <td className="py-1.5 pe-3">{wall.wallHeight || space.height ? `${wall.wallHeight || space.height} م` : "—"}</td>
                                <td className="py-1.5 text-muted-foreground">
                                  {wall.items.length > 0
                                    ? wall.items.map(i => ({ door: t("باب", "Door"), window: t("نافذة", "Window"), outlet: t("مقبس", "Outlet"), drain: t("فتحة صرف", "Drain"), water_supply: t("تغذية مياه", "Water Supply"), obstacle: t("عائق", "Obstacle") }[i.type] || i.type)).join("، ")
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-3">{t("لم تُضف جدران", "No walls added")}</p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {(savedSurveyId || existingSurvey?.id) && (() => {
            const sid = savedSurveyId || existingSurvey?.id;
            return (
              <Card className="overflow-hidden border-violet-200 dark:border-violet-800">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Box className="w-3.5 h-3.5" />
                    {t("معاينة التصميم", "Design Preview")}
                  </div>
                  <button
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors bg-primary/5 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => navigate(`/scene-3d?surveyId=${sid}`)}
                    data-testid="button-open-fullscreen"
                    title={t("فتح ملء الشاشة", "Open fullscreen")}
                  >
                    ⛶ {t("ملء الشاشة", "Full Screen")}
                  </button>
                </div>
                <iframe
                  key={`${sid}`}
                  src={`/scene-3d?surveyId=${sid}&embed=1`}
                  className="w-full border-0"
                  style={{ height: "380px" }}
                  title={t("معاينة التصميم", "Design Preview")}
                  data-testid="iframe-inline-view"
                />
              </Card>
            );
          })()}
        </div>
      )}

      {!showResults && step === 1 && (() => {
        const editSpace = spaces.find((s) => s.id === activeWallSpaceId) || spaces[0];
        const editSpaceIndex = spaces.findIndex((s) => s.id === editSpace?.id);
        const otherSpaces = spaces.filter((s) => s.id !== editSpace?.id);

        return (
          <div className="space-y-3" data-testid="section-spaces-walls">
            {/* All spaces tab-bar */}
            {spaces.length > 0 && (
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1 overflow-x-auto" data-testid="tabs-spaces">
                {spaces.map((s) => {
                  const isActive = s.id === activeWallSpaceId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        if (isActive) return;
                        if (subStep === "info") {
                          const currentEditSpace = spaces.find((sp) => sp.id === activeWallSpaceId) || spaces[0];
                          if (currentEditSpace) goToWallsSubStep(currentEditSpace.id);
                          return;
                        }
                        performAutoSave();
                        setActiveWallSpaceId(s.id);
                        setSubStep("info");
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                        isActive
                          ? "bg-background shadow font-semibold text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid={`tab-space-${s.id}`}
                    >
                      {s.walls.length > 0 && <CheckCircle2 className="w-3 h-3 text-primary" />}
                      {s.name || t("مكان", "Space")}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Current space card */}
            {editSpace && (
              <Card data-testid={`card-space-${editSpace.id}`}>
                <CardContent className="p-4 space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-primary" />
                      {t("المكان", "Space")} {editSpaceIndex + 1}
                      {editSpace.name ? `: ${editSpace.name}` : ""}
                    </h3>
                    {spaces.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          const remaining = spaces.filter((s) => s.id !== editSpace.id);
                          setSpaces(remaining);
                          setActiveWallSpaceId(remaining[0]?.id || "");
                          setSubStep("info");
                        }}
                        data-testid={`button-remove-space-${editSpace.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>

                  {/* Sub-step indicator */}
                  <div className="flex items-center gap-1" data-testid="substep-indicator">
                    <button
                      onClick={() => setSubStep("info")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${subStep === "info" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}
                      data-testid="substep-info"
                    >
                      {subStep === "walls" ? <CheckCircle2 className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                      {t("معلومات المكان", "Space Info")}
                    </button>
                    <div className="flex-1 h-0.5 bg-border mx-1" />
                    <button
                      onClick={() => editSpace.walls.length > 0 && setSubStep("walls")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${subStep === "walls" ? "bg-primary text-primary-foreground" : editSpace.walls.length > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground cursor-default"}`}
                      data-testid="substep-walls"
                    >
                      <LayoutGrid className="w-3 h-3" />
                      {t("الجدران", "Walls")}
                    </button>
                  </div>

                  {/* INFO sub-step */}
                  {subStep === "info" && (
                    <div className="space-y-3" data-testid={`section-space-info-${editSpace.id}`}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">{t("اسم المكان", "Space Name")}</Label>
                          <Input
                            value={editSpace.name}
                            onChange={(e) => updateSpace(editSpace.id, "name", e.target.value)}
                            placeholder={t("مثال: المطبخ الرئيسي", "e.g. Main Kitchen")}
                            data-testid={`input-space-name-${editSpace.id}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">{t("نوع المكان", "Space Type")}</Label>
                          <Select value={editSpace.type} onValueChange={(v) => updateSpace(editSpace.id, "type", v)}>
                            <SelectTrigger data-testid={`select-space-type-${editSpace.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SPACE_TYPES.map((st) => (
                                <SelectItem key={st.value} value={st.value}>{t(st.ar, st.en)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {editSpace.type === "other" && (
                            <Input
                              className="mt-2"
                              value={editSpace.spaceTypeOther}
                              onChange={(e) => updateSpace(editSpace.id, "spaceTypeOther", e.target.value)}
                              placeholder={t("اذكر نوع المكان", "Specify space type")}
                              data-testid={`input-space-type-other-${editSpace.id}`}
                            />
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">{t("الطول (م)", "Length (m)")}</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editSpace.length}
                            onChange={(e) => updateSpace(editSpace.id, "length", e.target.value)}
                            placeholder="0.00"
                            data-testid={`input-space-length-${editSpace.id}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">{t("العرض (م)", "Width (m)")}</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editSpace.width}
                            onChange={(e) => updateSpace(editSpace.id, "width", e.target.value)}
                            placeholder="0.00"
                            data-testid={`input-space-width-${editSpace.id}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">{t("الارتفاع (م)", "Height (m)")}</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editSpace.height}
                            onChange={(e) => updateSpace(editSpace.id, "height", e.target.value)}
                            placeholder="0.00"
                            data-testid={`input-space-height-${editSpace.id}`}
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs">{t("حالة البناء", "Building Status")}</Label>
                        <Select value={editSpace.buildingStatus} onValueChange={(v) => updateSpace(editSpace.id, "buildingStatus", v)}>
                          <SelectTrigger data-testid={`select-building-status-${editSpace.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ready">{t("جاهز", "Ready")}</SelectItem>
                            <SelectItem value="under_construction">{t("قيد الإنشاء", "Under Construction")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {editSpace.buildingStatus === "under_construction" && (
                        <div>
                          <Label className="text-xs">{t("مرحلة البناء", "Construction Phase")}</Label>
                          <Select
                            value={editSpace.constructionPhase}
                            onValueChange={(v) => updateSpace(editSpace.id, "constructionPhase", v)}
                          >
                            <SelectTrigger data-testid={`select-construction-phase-${editSpace.id}`}>
                              <SelectValue placeholder={t("اختر المرحلة", "Select phase")} />
                            </SelectTrigger>
                            <SelectContent>
                              {CONSTRUCTION_PHASES.map((cp) => (
                                <SelectItem key={cp.value} value={cp.value}>{t(cp.ar, cp.en)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {editSpace.constructionPhase === "other" && (
                            <Input
                              className="mt-2"
                              value={editSpace.constructionPhaseOther}
                              onChange={(e) => updateSpace(editSpace.id, "constructionPhaseOther", e.target.value)}
                              placeholder={t("اذكر المرحلة", "Specify phase")}
                              data-testid={`input-construction-phase-other-${editSpace.id}`}
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
                            value={editSpace.doorsCount}
                            onChange={(e) => updateSpace(editSpace.id, "doorsCount", e.target.value)}
                            data-testid={`input-doors-count-${editSpace.id}`}
                          />
                          <p className="text-[10px] text-muted-foreground mt-1">{t("يمكن أن يكون صفراً (مكان مفتوح)", "0 if open space with no door")}</p>
                        </div>
                        <div>
                          <Label className="text-xs">{t("عدد النوافذ", "Windows Count")}</Label>
                          <Input
                            type="number"
                            min="0"
                            value={editSpace.windowsCount}
                            onChange={(e) => updateSpace(editSpace.id, "windowsCount", e.target.value)}
                            data-testid={`input-windows-count-${editSpace.id}`}
                          />
                          <p className="text-[10px] text-muted-foreground mt-1">{t("يمكن أن يكون صفراً (مكان مفتوح)", "0 if open space with no door")}</p>
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs">{t("ملاحظات", "Notes")}</Label>
                        <Textarea
                          value={editSpace.notes}
                          onChange={(e) => updateSpace(editSpace.id, "notes", e.target.value)}
                          placeholder={t("أي ملاحظات عن المكان", "Any notes about the space")}
                          data-testid={`input-space-notes-${editSpace.id}`}
                          rows={2}
                        />
                      </div>
                    </div>
                  )}

                  {/* WALLS sub-step */}
                  {subStep === "walls" && (() => {
                    const wallLetters = ["A", "B", "C", "D"];
                    const activeWall = editSpace.walls.find((w) => w.id === selectedWallId) || editSpace.walls[0];
                    const activeWallIndex = editSpace.walls.findIndex((w) => w.id === activeWall?.id);
                    const wallLen = activeWall ? (parseFloat(activeWall.length) || 0) : 0;
                    const spaceHeight = parseFloat(editSpace.height) || 0;
                    return (
                      <div className="space-y-3" data-testid={`section-space-walls-${editSpace.id}`}>

                        {/* Wall tab selector — max 4 walls */}
                        <div className="flex gap-2 flex-wrap">
                          {editSpace.walls.map((wall, idx) => {
                            const isActive = wall.id === (activeWall?.id);
                            const hasItems = wall.items.length > 0;
                            const letter = wallLetters[idx] || String(idx + 1);
                            return (
                              <button
                                key={wall.id}
                                onClick={() => setSelectedWallId(wall.id)}
                                className={`relative flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 transition-all text-center ${
                                  isActive
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-card text-muted-foreground hover:border-primary/40"
                                }`}
                                data-testid={`wall-tab-${idx}`}
                              >
                                <span className="text-lg font-bold leading-none">{letter}</span>
                                <span className="text-[10px] mt-0.5 opacity-70">{wall.length ? `${wall.length}م` : "—"}</span>
                                {hasItems && <span className="absolute top-1 end-1 w-2 h-2 rounded-full bg-primary" />}
                                {editSpace.walls.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); removeWall(editSpace.id, wall.id); if (wall.id === selectedWallId) setSelectedWallId(editSpace.walls.find(w => w.id !== wall.id)?.id || ""); }}
                                    className="absolute -top-1.5 -start-1.5 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center"
                                    data-testid={`button-remove-wall-${idx}`}
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </button>
                            );
                          })}
                          {editSpace.walls.length < 4 && (
                            <button
                              onClick={() => {
                                const newWall: WallData = {
                                  id: `wall_${editSpace.id}_${Date.now()}`,
                                  name: `${t("الجدار", "Wall")} ${wallLetters[editSpace.walls.length] || editSpace.walls.length + 1}`,
                                  length: "",
                                  wallHeight: editSpace.height || "",
                                  items: [],
                                };
                                const updated = spaces.map((s) => s.id === editSpace.id ? { ...s, walls: [...s.walls, newWall] } : s);
                                setSpaces(updated);
                                setSelectedWallId(newWall.id);
                              }}
                              className="flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-all"
                              data-testid="button-add-wall"
                            >
                              <Plus className="w-5 h-5" />
                              <span className="text-[10px] mt-0.5">{t("جدار", "Wall")}</span>
                            </button>
                          )}
                        </div>

                        {/* Active wall details panel */}
                        {activeWall && (
                          <div className="rounded-xl border bg-card p-3 space-y-3">
                            {/* Wall name + length */}
                            <div className="flex items-center gap-2">
                              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary text-sm font-bold flex-shrink-0">
                                {wallLetters[activeWallIndex] || String(activeWallIndex + 1)}
                              </div>
                              <Input
                                value={activeWall.name}
                                onChange={(e) => updateWall(editSpace.id, activeWall.id, "name", e.target.value)}
                                className="h-8 text-sm font-medium flex-1"
                                data-testid={`input-wall-name-${activeWallIndex}`}
                              />
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={activeWall.length}
                                  onChange={(e) => updateWall(editSpace.id, activeWall.id, "length", e.target.value)}
                                  placeholder={t("م", "m")}
                                  className="w-20 h-8 text-xs text-center"
                                  data-testid={`input-wall-length-${activeWallIndex}`}
                                />
                                <span className="text-xs text-muted-foreground">م</span>
                              </div>
                            </div>

                            {/* Wall items list */}
                            {activeWall.items.length > 0 && (
                              <div className="space-y-2">
                                {activeWall.items.map((item, itemIndex) => {
                                  const ItemIcon = wallItemIcons[item.type] || X;
                                  const isDoorOrWindow = item.type === "door" || item.type === "window";
                                  const isOutlet = item.type === "outlet";
                                  const distFromSecond = isDoorOrWindow && wallLen > 0
                                    ? (wallLen - (parseFloat(item.distanceFromFirst) || 0) - (parseFloat(item.width) || 0)).toFixed(2)
                                    : null;
                                  const heightFromCeiling = isOutlet && spaceHeight > 0
                                    ? (spaceHeight - (parseFloat(item.heightFromFloor) || 0)).toFixed(2)
                                    : null;
                                  const itemColor = wallItemColors[item.type] || wallItemColors.obstacle;
                                  return (
                                    <div key={itemIndex} className={`p-2.5 rounded-lg border space-y-2 ${itemColor.bg} ${itemColor.border}`}>
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <ItemIcon className={`w-3.5 h-3.5 ${itemColor.icon}`} />
                                          <span className={`text-xs font-semibold ${itemColor.label}`}>{t(wallItemLabels[item.type]?.ar || "", wallItemLabels[item.type]?.en || "")}</span>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeWallItem(editSpace.id, activeWall.id, itemIndex)}>
                                          <Trash2 className="w-3 h-3 text-destructive" />
                                        </Button>
                                      </div>
                                      {isDoorOrWindow && (
                                        <div className="grid grid-cols-3 gap-1.5">
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">{t("العرض م", "W (m)")}</Label>
                                            <Input type="number" step="0.01" value={item.width} onChange={(e) => updateWallItem(editSpace.id, activeWall.id, itemIndex, "width", e.target.value)} className="h-7 text-xs" />
                                          </div>
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">{t("الارتفاع م", "H (m)")}</Label>
                                            <Input type="number" step="0.01" value={item.height} onChange={(e) => updateWallItem(editSpace.id, activeWall.id, itemIndex, "height", e.target.value)} className="h-7 text-xs" />
                                          </div>
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">{t("بُعد عن الحرف الأول م", "From Edge (m)")}</Label>
                                            <Input type="number" step="0.01" value={item.distanceFromFirst} onChange={(e) => updateWallItem(editSpace.id, activeWall.id, itemIndex, "distanceFromFirst", e.target.value)} className="h-7 text-xs" />
                                          </div>
                                        </div>
                                      )}
                                      {isDoorOrWindow && distFromSecond !== null && (
                                        <p className="text-[10px] text-muted-foreground">
                                          {t("بُعد عن الحرف الثاني", "From Second Edge")}: <span className="font-semibold text-foreground">{distFromSecond} م</span>
                                        </p>
                                      )}
                                      {item.type === "window" && (
                                        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">{t("ارتفاع عن الأرضية م", "From Floor (m)")}</Label>
                                            <Input type="number" step="0.01" value={item.heightFromFloor} onChange={(e) => updateWallItem(editSpace.id, activeWall.id, itemIndex, "heightFromFloor", e.target.value)} className="h-7 text-xs" data-testid={`input-window-height-from-floor-${itemIndex}`} />
                                          </div>
                                          {spaceHeight > 0 && item.heightFromFloor && (
                                            <div className="flex flex-col justify-end pb-1">
                                              <p className="text-[10px] text-muted-foreground">{t("الحافة العليا عن الأرضية", "Top edge from floor")}</p>
                                              <p className="text-xs font-semibold text-foreground">
                                                {(parseFloat(item.heightFromFloor) + parseFloat(item.height || "0")).toFixed(2)} م
                                              </p>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      {isOutlet && (
                                        <div className="grid grid-cols-2 gap-1.5">
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">{t("ارتفاع عن الأرضية م", "From Floor (m)")}</Label>
                                            <Input type="number" step="0.01" value={item.heightFromFloor} onChange={(e) => updateWallItem(editSpace.id, activeWall.id, itemIndex, "heightFromFloor", e.target.value)} className="h-7 text-xs" />
                                          </div>
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">{t("بُعد عن الحرف الأول م", "From Edge (m)")}</Label>
                                            <Input type="number" step="0.01" value={item.distanceFromFirst} onChange={(e) => updateWallItem(editSpace.id, activeWall.id, itemIndex, "distanceFromFirst", e.target.value)} className="h-7 text-xs" />
                                          </div>
                                        </div>
                                      )}
                                      {isOutlet && heightFromCeiling !== null && (
                                        <p className="text-[10px] text-muted-foreground">
                                          {t("مسافة من السقف", "From Ceiling")}: <span className="font-semibold text-foreground">{heightFromCeiling} م</span>
                                        </p>
                                      )}
                                      {isOutlet && (
                                        <div>
                                          <Label className="text-[10px] text-muted-foreground mb-1 block">{t("نوع مخرج الكهرباء", "Outlet Type")}</Label>
                                          <div className="flex flex-wrap gap-1">
                                            {OUTLET_SPECS.map((spec) => {
                                              const selected = item.specs.split(",").map((s) => s.trim()).filter(Boolean).includes(spec.value);
                                              return (
                                                <button key={spec.value} type="button"
                                                  onClick={() => {
                                                    const current = item.specs.split(",").map((s) => s.trim()).filter(Boolean);
                                                    const next = selected ? current.filter((v) => v !== spec.value) : [...current, spec.value];
                                                    updateWallItem(editSpace.id, activeWall.id, itemIndex, "specs", next.join(","));
                                                  }}
                                                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${selected ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}
                                                >{t(spec.ar, spec.en)}</button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                      {item.type === "drain" && (
                                        <div className="space-y-2">
                                          {/* Drain location only: distanceFromFirst */}
                                          <div className="grid grid-cols-1 gap-1.5">
                                            <div>
                                              <Label className="text-[10px] text-muted-foreground">{t("بُعد عن الحرف الأول م", "From Corner (m)")}</Label>
                                              <Input type="number" step="0.01" value={item.distanceFromFirst} onChange={(e) => updateWallItem(editSpace.id, activeWall.id, itemIndex, "distanceFromFirst", e.target.value)} className="h-7 text-xs" data-testid={`input-drain-dist-first-${itemIndex}`} />
                                            </div>
                                          </div>

                                          {/* Additional specs */}
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">{t("مواصفات إضافية", "Additional Specs")}</Label>
                                            <Input value={item.specs} onChange={(e) => updateWallItem(editSpace.id, activeWall.id, itemIndex, "specs", e.target.value)} placeholder={t("مثال: فتحة تصريف مياه PVC", "e.g. PVC drain pipe")} className="h-7 text-xs" data-testid={`input-drain-specs-${itemIndex}`} />
                                          </div>
                                        </div>
                                      )}
                                      {item.type === "water_supply" && (
                                        <div className="space-y-2">
                                          <div className="grid grid-cols-2 gap-1.5">
                                            <div>
                                              <Label className="text-[10px] text-muted-foreground">{t("بُعد عن الحرف م", "From Corner (m)")}</Label>
                                              <Input type="number" step="0.01" value={item.distanceFromFirst} onChange={(e) => updateWallItem(editSpace.id, activeWall.id, itemIndex, "distanceFromFirst", e.target.value)} className="h-7 text-xs" data-testid={`input-water-dist-first-${itemIndex}`} />
                                            </div>
                                            <div>
                                              <Label className="text-[10px] text-muted-foreground">{t("ارتفاع عن الأرضية م", "From Floor (m)")}</Label>
                                              <Input type="number" step="0.01" value={item.heightFromFloor} onChange={(e) => updateWallItem(editSpace.id, activeWall.id, itemIndex, "heightFromFloor", e.target.value)} className="h-7 text-xs" data-testid={`input-water-height-floor-${itemIndex}`} />
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      {item.type === "obstacle" && (
                                        <div>
                                          <Label className="text-[10px] text-muted-foreground">{t("وصف العائق", "Obstacle Description")}</Label>
                                          <Input value={item.notes} onChange={(e) => updateWallItem(editSpace.id, activeWall.id, itemIndex, "notes", e.target.value)} placeholder={t("وصف العائق", "Describe obstacle")} className="h-7 text-xs" />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Add item buttons */}
                            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
                              <span className="text-[10px] text-muted-foreground self-center w-full mb-0.5">{t("إضافة عنصر للجدار", "Add to wall")}:</span>
                              {(["door", "window", "outlet", "drain", "water_supply", "obstacle"] as WallItem["type"][]).map((type) => {
                                const Icon = wallItemIcons[type];
                                const c = wallItemColors[type];
                                return (
                                  <button key={type} onClick={() => addWallItem(editSpace.id, activeWall.id, type)} data-testid={`button-add-${type}-${activeWallIndex}`} className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${c.btnBg} ${c.btnBorder} ${c.btnText}`}>
                                    <Icon className={`w-3 h-3 ${c.icon}`} />
                                    {t(wallItemLabels[type].ar, wallItemLabels[type].en)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Add another space — visible in walls sub-step */}
            {subStep === "walls" && (
              <button
                onClick={() => {
                  performAutoSave();
                  const s = newSpace();
                  s.name = t(`المكان ${spaces.length + 1}`, `Space ${spaces.length + 1}`);
                  const updated = [...spaces, s];
                  setSpaces(updated);
                  setActiveWallSpaceId(s.id);
                  setSubStep("info");
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:border-primary/70 transition-all text-sm font-medium"
                data-testid="button-add-space"
              >
                <Plus className="w-4 h-4" />
                {t("إضافة غرفة أخرى", "Add Another Room")}
              </button>
            )}

          </div>
        );
      })()}

      {false && step === 2 && (
        <div className="space-y-3" data-testid="section-products">
          {/* ── مسار اختيار: منتجات أو مخطط يدوي ── */}
          {selectedProducts.length === 0 && (
            <div className="grid grid-cols-2 gap-3" data-testid="section-path-selector">
              <button
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-primary/40 text-primary hover:bg-primary/5 hover:border-primary/60 transition-all text-center"
                onClick={() => { setProductSearch(""); setSelectedGroup("all"); setProductSearchDialog(true); }}
                data-testid="button-path-products"
              >
                <Package className="w-7 h-7" />
                <span className="text-xs font-semibold leading-snug">{t("إضافة منتجات من الكتالوج", "Add Products from Catalog")}</span>
              </button>
              <button
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 hover:border-blue-500 transition-all text-center"
                onClick={() => setUploadDesignDialog(true)}
                data-testid="button-path-manual-plan"
              >
                <Upload className="w-7 h-7" />
                <span className="text-xs font-semibold leading-snug">{t("رفع مخطط من برنامج خارجي", "Upload Plan from External Software")}</span>
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              {t("المنتجات المطلوبة", "Required Products")}
            </h3>
            <div className="flex items-center gap-2">
              {spaces.length > 1 && (
                <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5" data-testid="tabs-spaces-products">
                  {spaces.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setCurrentSpaceId(s.id)}
                      data-testid={`tab-product-space-${s.id}`}
                      className={`text-xs px-2.5 py-1 rounded-md transition-all whitespace-nowrap max-w-[110px] truncate ${
                        currentSpaceId === s.id
                          ? "bg-background shadow font-semibold text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={s.name || t("مكان", "Space")}
                    >
                      {s.name || t("مكان", "Space")}
                    </button>
                  ))}
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setUploadDesignDialog(true)}
                data-testid="button-upload-manual-plan"
                title={t("رفع مخطط من برنامج خارجي", "Upload plan from external software")}
              >
                <Paperclip className="w-3 h-3 me-1" />
                {t("رفع مخطط", "Upload Plan")}
              </Button>
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

          {/* ── مطابخ تيك القياسية — Kitchen Templates ────── */}
          {currentSpace?.type === "kitchen" && kitchenTemplateMatches.length > 0 && (
            <Card className="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-orange-800 dark:text-orange-300">
                    <UtensilsCrossed className="w-4 h-4" />
                    {t("مطابخ تيك القياسية", "Teak Standard Kitchens")}
                  </div>
                  <Select
                    value={templateVariant}
                    onValueChange={(v) => setTemplateVariant(v as ApplianceVariant)}
                  >
                    <SelectTrigger className="h-7 text-xs w-[150px]" data-testid="select-template-variant">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["none","spaces","full"] as ApplianceVariant[]).map((v) => (
                        <SelectItem key={v} value={v}>
                          {t(APPLIANCE_VARIANT_LABELS[v].ar, APPLIANCE_VARIANT_LABELS[v].en)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {kitchenTemplateMatches.map((match) => {
                    const tmpl = match.template;
                    const items = tmpl.variants[templateVariant];
                    const count = items.reduce((s, it) => s + it.qty, 0);
                    const isPreview = templatePreviewId === tmpl.id;
                    return (
                      <div
                        key={tmpl.id}
                        className="rounded-md border border-orange-200 dark:border-orange-700 bg-white dark:bg-gray-900 p-2.5 space-y-2"
                        data-testid={`card-kitchen-template-${tmpl.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                              {isRTL ? tmpl.nameAr : tmpl.nameEn}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {isRTL ? tmpl.subtitleAr : tmpl.nameEn}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-[9px] h-4 border-orange-300 text-orange-700 dark:text-orange-400">
                                {tmpl.layout.toUpperCase()}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {t(`${count} قطعة`, `${count} pcs`)}
                              </span>
                              {match.score > 0 && (
                                <Badge className="text-[9px] h-4 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-none">
                                  {t(`تطابق ${Math.round(match.score * 100)}%`, `${Math.round(match.score * 100)}% match`)}
                                </Badge>
                              )}
                              {match.warnings.length > 0 && (() => {
                                const errors = match.warnings.filter((w: TemplateWarning) => w.severity === "error");
                                const warns  = match.warnings.filter((w: TemplateWarning) => w.severity === "warning");
                                const isWarningsOpen = templateWarningsId === tmpl.id;
                                /* Icon/colour based on worst severity */
                                const hasErrors = errors.length > 0;
                                const hasWarns  = warns.length > 0;
                                const icon  = hasErrors ? "🚫" : hasWarns ? "⚠" : "✅";
                                const borderColor = hasErrors ? "rgb(239,68,68)" : hasWarns ? "rgb(251,191,36)" : "rgb(34,197,94)";
                                const textColor   = hasErrors ? "rgb(185,28,28)" : hasWarns ? "rgb(146,64,14)" : "rgb(21,128,61)";
                                const bgOpen      = hasErrors ? "rgb(254,226,226)" : hasWarns ? "rgb(254,243,199)" : "rgb(220,252,231)";
                                return (
                                  <button
                                    type="button"
                                    data-testid={`button-warnings-badge-${tmpl.id}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTemplateWarningsId(isWarningsOpen ? null : tmpl.id);
                                    }}
                                    className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium border cursor-pointer transition-colors select-none"
                                    style={{
                                      borderColor,
                                      color: textColor,
                                      background: isWarningsOpen ? bgOpen : "transparent",
                                    }}
                                  >
                                    {icon} {match.warnings.length} {t("تنبيهات", "checks")}
                                  </button>
                                );
                              })()}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                              onClick={() => applyKitchenTemplate(tmpl.id, templateVariant)}
                              data-testid={`button-apply-template-${tmpl.id}`}
                            >
                              {t("تطبيق", "Apply")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => setTemplatePreviewId(isPreview ? null : tmpl.id)}
                              data-testid={`button-preview-template-${tmpl.id}`}
                            >
                              {isPreview ? t("إخفاء", "Hide") : t("معاينة", "Preview")}
                            </Button>
                          </div>
                        </div>

                        {/* Collapsible warnings panel — toggled by badge click, independent of preview */}
                        {templateWarningsId === tmpl.id && match.warnings.length > 0 && (
                          <div
                            className="pt-1.5 border-t border-red-100 dark:border-red-800 space-y-1"
                            data-testid={`panel-warnings-${tmpl.id}`}
                          >
                            {match.warnings.map((w: TemplateWarning, wi: number) => {
                              const icon = w.severity === "error" ? "🚫" : w.severity === "warning" ? "⚠" : "✅";
                              const bg =
                                w.severity === "error"
                                  ? "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                                  : w.severity === "warning"
                                  ? "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
                                  : "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400";
                              return (
                                <div key={wi} className={`flex items-start gap-1.5 rounded px-2 py-1 border text-[10px] leading-snug ${bg}`}>
                                  <span className="shrink-0 mt-px">{icon}</span>
                                  <span>{isRTL ? w.message : w.messageEn}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {isPreview && (
                          <div className="pt-1.5 border-t border-orange-100 dark:border-orange-800 space-y-2">
                            {/* Product list */}
                            <div className="grid grid-cols-1 gap-0.5 max-h-40 overflow-y-auto">
                              {items.map((item, idx) => {
                                const ap = (adekoProducts as any[]).find((p: any) => p.code === item.code);
                                const cornerIcon = item.cornerAnchor ? "📐 " : "";
                                return (
                                  <div key={idx} className="flex items-center justify-between text-[10px] py-0.5">
                                    <span className="text-muted-foreground me-1 shrink-0">{item.wall}–</span>
                                    <span className="font-mono text-primary shrink-0">{cornerIcon}{item.code}</span>
                                    <span className="flex-1 text-muted-foreground truncate mx-1.5 text-end">
                                      {ap ? (isRTL ? ap.descriptionAr : ap.descriptionEn) : item.code}
                                    </span>
                                    <span className="shrink-0 text-gray-500">×{item.qty}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {spaces.map((space) => {
            const spaceProducts = selectedProducts.filter((p) => p.spaceId === space.id);
            const isKitchen = space.type === "kitchen";

            const kitchenCompleteness = isKitchen ? KITCHEN_CATEGORIES.map((cat) => {
              const present = spaceProducts.some((p) => {
                const product = (adekoProducts as any[]).find((ap: any) => ap.id === p.adekoProductId);
                return product?.groupCode === cat.groupCode;
              });
              return { ...cat, present };
            }) : [];

            const hasWallData = space.walls.length > 0;

            return (
              <div key={space.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-muted-foreground">
                    {space.name || t("مكان", "Space")} ({spaceProducts.length})
                  </div>
                  {isKitchen && (
                    <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 dark:text-orange-400">
                      <UtensilsCrossed className="w-2.5 h-2.5 me-1" />
                      {t("مطبخ", "Kitchen")}
                    </Badge>
                  )}
                </div>

                {isKitchen && (
                  <Card className="border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-950/10" data-testid={`card-kitchen-completeness-${space.id}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Zap className="w-3.5 h-3.5 text-orange-600" />
                        <span className="text-xs font-semibold text-orange-800 dark:text-orange-300">
                          {t("اكتمال وحدات المطبخ", "Kitchen Units Completeness")}
                        </span>
                        <span className="text-[10px] font-bold ms-auto text-orange-700 dark:text-orange-400">
                          {kitchenCompleteness.filter(c => c.present).length}/{kitchenCompleteness.length}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-orange-100 dark:bg-orange-900/30 overflow-hidden mb-2.5" data-testid={`progress-kitchen-completeness-${space.id}`}>
                        <div
                          className={`h-full rounded-full transition-all ${kitchenCompleteness.filter(c => c.present).length === kitchenCompleteness.length ? "bg-green-500" : "bg-orange-400"}`}
                          style={{ width: `${(kitchenCompleteness.filter(c => c.present).length / kitchenCompleteness.length) * 100}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        {kitchenCompleteness.map((cat) => {
                          const CatIcon = cat.icon;
                          return (
                            <div key={cat.groupCode} className={`flex items-center gap-2 p-1.5 rounded-md ${cat.present ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`} data-testid={`kitchen-cat-${cat.groupCode}`}>
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${cat.present ? "bg-green-100 dark:bg-green-900/50" : "bg-red-100 dark:bg-red-900/50"}`}>
                                {cat.present
                                  ? <CheckCircle2 className="w-3 h-3 text-green-600" />
                                  : <AlertCircle className="w-3 h-3 text-red-500" />
                                }
                              </div>
                              <CatIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className={`text-[11px] flex-1 ${cat.present ? "text-green-800 dark:text-green-300 font-medium" : "text-red-700 dark:text-red-400"}`}>
                                {t(cat.ar, cat.en)}
                              </span>
                              {!cat.present && (
                                <button
                                  className="text-[10px] text-primary font-semibold px-2 py-0.5 rounded border border-primary/30 hover:bg-primary/5 transition-colors flex items-center gap-1"
                                  onClick={() => {
                                    setCurrentSpaceId(space.id);
                                    setProductSearch("");
                                    setSelectedGroup(cat.groupCode);
                                    setProductSearchDialog(true);
                                  }}
                                  data-testid={`button-quick-add-${cat.groupCode}`}
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                  {t("إضافة", "Add")}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {hasWallData && (
                  <Card className="bg-muted/20" data-testid={`card-wall-usage-${space.id}`}>
                    <CardContent className="p-3">
                      <div className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
                        <LayoutGrid className="w-3 h-3" />
                        {t("استهلاك مساحة الجدران", "Wall Space Usage")}
                      </div>
                      <div className="space-y-1.5">
                        {space.walls.map((wall) => {
                          const wallProducts = spaceProducts.filter(p => p.wallId === wall.id);
                          const usedCm = wallProducts.reduce((sum, p) => sum + (parseFloat(p.designW || "0") * p.quantity), 0);
                          const totalCm = parseFloat(wall.length || "0") * 100;
                          const pct = totalCm > 0 ? Math.min((usedCm / totalCm) * 100, 100) : 0;
                          const isOver = usedCm > totalCm && totalCm > 0;
                          const isEmpty = usedCm === 0;
                          return (
                            <div key={wall.id}>
                              <div className="flex justify-between items-center mb-0.5">
                                <span className="text-[10px] font-medium">{wall.name}</span>
                                <span className={`text-[10px] tabular-nums ${isOver ? "text-destructive font-bold" : isEmpty ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                                  {totalCm > 0
                                    ? `${(usedCm / 100).toFixed(2)}م / ${wall.length}م${isOver ? ` ⚠ +${((usedCm - totalCm) / 100).toFixed(2)}م` : ""}`
                                    : t("طول الجدار غير محدد", "Wall length not set")}
                                </span>
                              </div>
                              {totalCm > 0 && (
                                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${isOver ? "bg-destructive" : isEmpty ? "bg-muted-foreground/20" : pct > 90 ? "bg-amber-500" : "bg-primary"}`}
                                    style={{ width: `${isEmpty ? 0 : pct}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

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

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                        <div>
                          <Label className="text-[10px]">{t("الجدار", "Wall")}</Label>
                          <Select value={product.wallId || "none"} onValueChange={(v) => updateProduct(product.id, "wallId", v === "none" ? "" : v)}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder={t("اختر الجدار", "Select wall")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">{t("غير محدد", "Unassigned")}</SelectItem>
                              {(spaces.find(s => s.id === product.spaceId)?.walls || []).map((w) => (
                                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px]">{t("العرض التصميمي (سم)", "Design W (cm)")}</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={product.designW}
                            onChange={(e) => updateProduct(product.id, "designW", e.target.value)}
                            placeholder="0"
                            className="h-7 text-xs"
                          />
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

                {spaceProducts.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-xs border border-dashed rounded-lg">
                    {t("لا توجد منتجات في هذا المكان", "No products in this space")}
                    <button
                      className="block mx-auto mt-2 text-primary text-xs font-medium hover:underline"
                      onClick={() => { setCurrentSpaceId(space.id); setProductSearch(""); setSelectedGroup("all"); setProductSearchDialog(true); }}
                    >
                      + {t("إضافة أول منتج", "Add first product")}
                    </button>
                  </div>
                )}
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

      {false && step === 3 && (
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

      <div className="fixed bottom-0 start-0 end-0 md:start-16 bg-card border-t border-border z-40" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="px-3 pt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showResults ? (
            <Button
              variant="outline"
              onClick={() => setShowResults(false)}
              data-testid="button-results-back-edit"
            >
              {lang === "ar" ? <ChevronRight className="w-4 h-4 me-1" /> : <ChevronLeft className="w-4 h-4 me-1" />}
              {t("تعديل المقاسات", "Edit Measurements")}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                if (step === 1 && subStep === "walls") {
                  setSubStep("info");
                } else if (step > 1) {
                  setStep((step - 1) as WizardStep);
                  if (step - 1 === 1) setSubStep("walls");
                }
              }}
              disabled={step === 1 && subStep === "info"}
              data-testid="button-prev-step"
            >
              {lang === "ar" ? <ChevronRight className="w-4 h-4 me-1" /> : <ChevronLeft className="w-4 h-4 me-1" />}
              {t("السابق", "Previous")}
            </Button>
          )}
          {(savedSurveyId || existingSurvey?.id) && !showResults && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs text-violet-600 border-violet-300 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30"
              onClick={() => navigate(`/scene-3d?surveyId=${savedSurveyId || existingSurvey?.id}`)}
              data-testid="button-quick-3d"
            >
              <Box className="w-3.5 h-3.5" />
              <span className="hidden sm:inline ms-1">{t("3D", "3D")}</span>
            </Button>
          )}
          {showResults && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs text-blue-600 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
              onClick={handlePrintSurveyReport}
              disabled={printingPdf}
              title={t("طباعة المقاسات", "Print Measurements")}
              data-testid="button-print-survey-results"
            >
              {printingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline ms-1">{t("طباعة", "Print")}</span>
            </Button>
          )}
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full transition-colors ${!showResults ? "bg-primary" : "bg-primary/40"}`} />
            <div className={`w-2 h-2 rounded-full transition-colors ${showResults ? "bg-primary" : "bg-muted-foreground/30"}`} />
          </div>
          {autoSavePending && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground" data-testid="autosave-pending-footer">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              {t("جاري الحفظ...", "Saving...")}
            </div>
          )}
          {autoSaveError && !autoSavePending && (
            <div className="flex items-center gap-1 text-[10px] text-amber-600" data-testid="autosave-error-footer">
              <AlertCircle className="w-2.5 h-2.5" />
              {t("تعذر الحفظ التلقائي", "Auto-save failed")}
            </div>
          )}
        </div>

        {showResults ? (
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={sendToDesignerMutation.isPending}
            onClick={() => {
              const qid = appointment?.quotationId;
              if (qid) {
                sendToDesignerMutation.mutate(qid);
              } else {
                navigate(returnTo);
              }
            }}
            data-testid="button-send-to-designer"
          >
            {sendToDesignerMutation.isPending
              ? <Loader2 className="w-4 h-4 me-1 animate-spin" />
              : <Save className="w-4 h-4 me-1" />}
            {t("حفظ الطلب بالمقاسات", "Save Order with Measurements")}
          </Button>
        ) : step === 1 && subStep === "walls" ? (
          <Button
            onClick={handleSaveMeasurements}
            disabled={saveMeasurementsMutation.isPending}
            data-testid="button-save-measurements"
          >
            {saveMeasurementsMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin me-1" />
              : <Save className="w-4 h-4 me-1" />}
            <span className="hidden sm:inline">{t("حفظ المقاسات", "Save Measurements")}</span>
            <span className="sm:hidden">{t("حفظ", "Save")}</span>
          </Button>
        ) : (
          <Button
            onClick={() => navigateToStep((step + 1) as WizardStep)}
            data-testid="button-next-step"
          >
            {step === 1 && subStep === "info"
              ? <><span className="hidden sm:inline">{t("التالي: الجدران", "Next: Walls")}</span><span className="sm:hidden">{t("الجدران", "Walls")}</span></>
              : t("التالي", "Next")}
            {lang === "ar" ? <ChevronLeft className="w-4 h-4 ms-1" /> : <ChevronRight className="w-4 h-4 ms-1" />}
          </Button>
        )}
        </div>
      </div>

      <Dialog open={productSearchDialog} onOpenChange={setProductSearchDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-product-search">
          <DialogHeader>
            <DialogTitle>{t("اختيار منتج من مكتبة Adeko", "Select Product from Adeko Library")}</DialogTitle>
            {spaceUsageFilter && (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-md">
                <Filter className="w-3 h-3 shrink-0" />
                {spaceUsageFilter[0] === "kitchen"
                  ? t("مفلتر: يعرض منتجات المطبخ فقط", "Filtered: showing kitchen products only")
                  : t("مفلتر: يعرض منتجات الدولاب فقط", "Filtered: showing wardrobe products only")}
              </div>
            )}
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
                const sid = savedSurveyId || existingSurvey?.id;
                navigate(`/scene-3d?surveyId=${sid}&tab=2d`);
              }}
              data-testid="button-view-2d-plan"
            >
              <Map className="w-5 h-5 shrink-0" />
              <div className="text-start">
                <div className="font-semibold text-sm">{t("مخطط هندسي 2D", "2D Floor Plan")}</div>
                <div className="text-xs opacity-75">{t("مسقط أفقي للمساحات والمنتجات", "Top-view plan with products")}</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-14"
              onClick={() => {
                setNextStepsDialog(false);
                const existingQid = appointment?.quotationId;
                if (existingQid) {
                  navigate(`/quotation-builder?quotationId=${existingQid}`);
                } else {
                  const cid = appointment?.customerId;
                  const sid = savedSurveyId || existingSurvey?.id;
                  const params = new URLSearchParams();
                  if (cid) params.set("customerId", String(cid));
                  if (sid) params.set("surveyId", String(sid));
                  navigate(`/quotations/new${params.toString() ? "?" + params.toString() : ""}`);
                }
              }}
              data-testid="button-create-quotation"
            >
              <FileText className="w-5 h-5 shrink-0" />
              <div className="text-start">
                <div className="font-semibold text-sm">
                  {appointment?.quotationId ? t("تعديل عرض السعر", "Edit Quotation") : t("إنشاء عرض سعر", "Create Quotation")}
                </div>
                <div className="text-xs opacity-75">
                  {appointment?.quotationId ? t("تعديل عرض السعر المرتبط بهذا الطلب", "Edit the linked quotation") : t("أنشئ عرض سعر للعميل", "Build a price quotation")}
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-14 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
              onClick={() => {
                setNextStepsDialog(false);
                setUploadDesignDialog(true);
              }}
              data-testid="button-upload-design-file"
            >
              <Upload className="w-5 h-5 shrink-0" />
              <div className="text-start">
                <div className="font-semibold text-sm">{t("رفع مخطط يدوي", "Upload Manual Plan")}</div>
                <div className="text-xs opacity-75">{t("رفع ملف PDF أو صورة من برنامج خارجي", "Upload PDF or image from external software")}</div>
              </div>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-14"
              onClick={() => { setNextStepsDialog(false); navigate(returnTo); }}
              data-testid="button-back-to-calendar"
            >
              <Calendar className="w-5 h-5 shrink-0" />
              <div className="text-start">
                <div className="font-semibold text-sm">
                  {returnTo === "/my-orders" ? t("العودة للطلبات", "Back to Orders") : t("العودة للتقويم", "Back to Calendar")}
                </div>
                <div className="text-xs opacity-75">
                  {returnTo === "/my-orders" ? t("قائمة طلباتك", "Your orders list") : t("مواعيدك وزياراتك", "Your appointments")}
                </div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadDesignDialog} onOpenChange={setUploadDesignDialog}>
        <DialogContent className="max-w-sm" data-testid="dialog-upload-design">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="w-5 h-5 text-blue-600" />
              {t("رفع مخطط يدوي", "Upload Manual Plan")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("ارفع ملفات PDF للمخططات من برنامج AutoCAD أو غيره. أضف تسمية لكل ملف ثم اضغط اختيار الملف.", "Upload PDF plan files from AutoCAD or other software. Add a label for each file then select the file.")}
          </p>

          <div className="space-y-2">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">{t("تسمية الملف", "File Label")}</label>
              <input
                type="text"
                className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder={t("مثال: مخطط المطبخ — AutoCAD", "e.g. Kitchen Plan — AutoCAD")}
                value={pendingFileLabel}
                onChange={(e) => setPendingFileLabel(e.target.value)}
                disabled={uploadingFile}
                data-testid="input-file-label"
              />
            </div>
            <label
              className={`flex flex-col items-center justify-center gap-2 py-6 px-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${uploadingFile ? "opacity-60 pointer-events-none" : "border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/20"}`}
              data-testid="label-upload-zone"
            >
              {uploadingFile ? (
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-blue-400" />
              )}
              <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                {uploadingFile ? t("جاري الرفع...", "Uploading...") : t("اختر ملف PDF أو اسحبه هنا", "Choose a PDF file or drag here")}
              </span>
              <span className="text-xs text-muted-foreground">{t("PDF فقط", "PDF only")}</span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                disabled={uploadingFile}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
                    toast({ title: t("الرجاء اختيار ملف PDF فقط", "Please select a PDF file only"), variant: "destructive" });
                    e.target.value = "";
                    return;
                  }
                  handleFileUpload(file, pendingFileLabel);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {uploadedFiles.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground">{t("الملفات المرفوعة", "Uploaded Files")} ({uploadedFiles.length})</p>
              {uploadedFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30" data-testid={`uploaded-file-${f.id}`}>
                  <FileImage className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="flex-1 text-xs truncate min-w-0">{(f as any).file_label || f.file_name}</span>
                  <button
                    onClick={() => handleToggleAttach(f.id, !f.attach_to_quote)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors shrink-0 ${f.attach_to_quote ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700" : "bg-muted text-muted-foreground border-border"}`}
                    data-testid={`button-toggle-attach-${f.id}`}
                  >
                    {f.attach_to_quote ? <><Check className="w-2.5 h-2.5 me-0.5" />{t("مرفق", "Attached")}</> : t("إرفاق", "Attach")}
                  </button>
                  <button
                    onClick={() => handleDeleteFile(f.id)}
                    className="text-destructive hover:opacity-70 shrink-0"
                    data-testid={`button-delete-file-${f.id}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadedFiles.length === 0 && !uploadingFile && (
            <p className="text-center text-xs text-muted-foreground">{t("لم يتم رفع أي ملفات بعد", "No files uploaded yet")}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
