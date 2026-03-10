import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/components/language-provider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  ArrowLeft,
  Save,
  Ruler,
  Box,
  Pencil,
  FileUp,
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  Loader2,
  Image as ImageIcon,
  File as FileIcon,
  X,
  CheckCircle2,
  Calculator,
  DoorOpen,
  ChevronDown,
} from "lucide-react";
import type { DesignAssignment } from "@shared/schema";
import {
  type ProductCategory,
  type WoodMaterial,
  type CabinetType,
  type WardrobeType,
  type DoorPattern,
  type BuildingStatus,
  type ConstructionPhase,
  type KitchenUnitSpec,
  type WardrobeUnitSpec,
  type DoorSpec,
  type DecorationSpec,
  KITCHEN_CABINET_STANDARDS,
  WARDROBE_STANDARDS,
  PANEL_THICKNESSES,
  DOOR_STANDARD_WIDTHS,
  DOOR_STANDARDS,
  DOOR_PATTERNS,
  CONSTRUCTION_PHASES,
  OPENING_TYPES,
  WALL_DIRECTIONS,
  type RoomOpening,
  type OpeningType,
  type WallDirection,
  getDefaultKitchenUnit,
  getDefaultWardrobeUnit,
  getDefaultDoorSpec,
  getDefaultDecorationSpec,
  getDefaultRoomOpening,
  calculateManufacturingDimensions,
  formatMm,
} from "@/lib/product-specs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const SketchCanvas2D = lazy(() => import("@/components/sketch-canvas-2d"));
const Viewer3D = lazy(() => import("@/components/viewer-3d"));

interface ProductSpecsState {
  productType: ProductCategory;
  material: WoodMaterial;
  roomWidth: number;
  roomLength: number;
  roomHeight: number;
  buildingStatus: BuildingStatus;
  constructionPhase: ConstructionPhase;
  kitchenUnits: KitchenUnitSpec[];
  wardrobeSpec: WardrobeUnitSpec;
  doorSpec: DoorSpec;
  decorationSpec: DecorationSpec;
  countertopMaterial: string;
  roomOpenings: RoomOpening[];
}

function getAllMfgDimensions(specs: ProductSpecsState): any[] {
  switch (specs.productType) {
    case "kitchen":
      return specs.kitchenUnits.flatMap(unit => calculateManufacturingDimensions("kitchen", unit));
    case "wardrobe":
      return calculateManufacturingDimensions("wardrobe", specs.wardrobeSpec);
    case "door":
      return calculateManufacturingDimensions("door", specs.doorSpec);
    case "decoration":
      return calculateManufacturingDimensions("decoration", specs.decorationSpec);
    default:
      return [];
  }
}

const PRODUCT_TYPES: { value: ProductCategory; labelAr: string; labelEn: string }[] = [
  { value: "kitchen", labelAr: "مطبخ", labelEn: "Kitchen" },
  { value: "wardrobe", labelAr: "خزانة ملابس", labelEn: "Wardrobe" },
  { value: "door", labelAr: "أبواب", labelEn: "Doors" },
  { value: "decoration", labelAr: "ديكور", labelEn: "Decoration" },
];

const MATERIALS: { value: WoodMaterial; labelAr: string; labelEn: string }[] = [
  { value: "chipboard", labelAr: "شيبورد", labelEn: "Chipboard" },
  { value: "mdf", labelAr: "MDF", labelEn: "MDF" },
  { value: "solid_beech", labelAr: "خشب زان", labelEn: "Solid Beech" },
  { value: "solid_oak", labelAr: "خشب بلوط", labelEn: "Solid Oak" },
  { value: "hpl", labelAr: "HPL", labelEn: "HPL" },
  { value: "pvc", labelAr: "PVC", labelEn: "PVC" },
];

function mapMaterialToViewer(m: WoodMaterial): "oak" | "beech" | "mdf" | "walnut" | "cherry" | "chipboard" {
  const map: Record<WoodMaterial, "oak" | "beech" | "mdf" | "walnut" | "cherry" | "chipboard"> = {
    chipboard: "chipboard",
    mdf: "mdf",
    solid_beech: "beech",
    solid_oak: "oak",
    hpl: "mdf",
    pvc: "mdf",
  };
  return map[m] || "oak";
}

function getInitialSpecs(): ProductSpecsState {
  return {
    productType: "kitchen",
    material: "mdf",
    roomWidth: 3000,
    roomLength: 4000,
    roomHeight: 2700,
    buildingStatus: "ready",
    constructionPhase: "construction",
    kitchenUnits: [getDefaultKitchenUnit("base")],
    wardrobeSpec: getDefaultWardrobeUnit("hinged"),
    doorSpec: getDefaultDoorSpec(),
    decorationSpec: getDefaultDecorationSpec(),
    countertopMaterial: "granite",
    roomOpenings: [],
  };
}

export default function DesignStudioPage() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const params = useParams<{ orderId: string }>();
  const orderId = parseInt(params.orderId || "0");
  const isRTL = lang === "ar";
  const BackArrow = isRTL ? ArrowRight : ArrowLeft;

  const [activeTab, setActiveTab] = useState("product");
  const [specs, setSpecs] = useState<ProductSpecsState>(getInitialSpecs);
  const [notes, setNotes] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const { data: designAssignment, isLoading: daLoading } = useQuery<DesignAssignment>({
    queryKey: ["/api/design-assignments/quotation", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/design-assignments/quotation/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: orderId > 0,
  });

  const { data: quotation } = useQuery<any>({
    queryKey: ["/api/quotations", orderId],
  });

  const { data: customer } = useQuery<any>({
    queryKey: ["/api/customers", quotation?.customerId],
    enabled: !!quotation?.customerId,
  });

  useEffect(() => {
    if (designAssignment) {
      if (designAssignment.productSpecs) {
        const saved = designAssignment.productSpecs as any;
        setSpecs(prev => ({ ...prev, ...saved }));
      }
      if (designAssignment.notes) setNotes(designAssignment.notes);
      if (designAssignment.designFiles) setUploadedFiles(designAssignment.designFiles);
    }
  }, [designAssignment]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!designAssignment?.id) return;
      return apiRequest("PATCH", `/api/design-assignments/${designAssignment.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/design-assignments/quotation", orderId] });
      toast({ title: t("تم الحفظ", "Saved"), description: t("تم حفظ التصميم بنجاح", "Design saved successfully") });
    },
    onError: () => {
      toast({ title: t("خطأ", "Error"), description: t("حدث خطأ أثناء الحفظ", "Error while saving"), variant: "destructive" });
    },
  });

  const handleSave = useCallback(() => {
    setIsSaving(true);
    saveMutation.mutate({
      productSpecs: specs,
      notes,
      designFiles: uploadedFiles,
      status: "designing",
    }, { onSettled: () => setIsSaving(false) });
  }, [specs, notes, uploadedFiles, saveMutation]);

  const handleSketchSave = useCallback((jsonData: string, imageDataUrl: string) => {
    if (!designAssignment?.id) return;
    saveMutation.mutate({
      sketchData: jsonData,
      sketchImage: imageDataUrl,
      status: "designing",
    });
  }, [designAssignment, saveMutation]);

  const handle3DScreenshot = useCallback((dataUrl: string) => {
    if (!designAssignment?.id) return;
    saveMutation.mutate({
      screenshot3d: dataUrl,
      status: "designing",
    });
    toast({ title: t("تم حفظ لقطة 3D", "3D Screenshot Saved") });
  }, [designAssignment, saveMutation, toast, t]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setUploadedFiles(prev => [...prev, result]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateUnit = useCallback((index: number, field: string, value: any) => {
    setSpecs(prev => {
      const units = [...prev.kitchenUnits];
      (units[index] as any)[field] = value;
      return { ...prev, kitchenUnits: units };
    });
  }, []);

  const addUnit = useCallback((type: CabinetType) => {
    setSpecs(prev => ({
      ...prev,
      kitchenUnits: [...prev.kitchenUnits, getDefaultKitchenUnit(type)],
    }));
  }, []);

  const removeUnit = useCallback((index: number) => {
    setSpecs(prev => ({
      ...prev,
      kitchenUnits: prev.kitchenUnits.filter((_, i) => i !== index),
    }));
  }, []);

  const mfgDimensions = getAllMfgDimensions(specs);

  const viewer3dSpecs = {
    productType: specs.productType as any,
    woodType: mapMaterialToViewer(specs.material),
    kitchen: specs.productType === "kitchen" ? {
      wallLength: specs.roomWidth,
      units: specs.kitchenUnits.map(u => ({
        type: u.cabinetType as any,
        width: u.designWidth,
        height: u.designHeight,
        depth: u.designDepth,
      })),
      countertopThickness: 30,
      countertopOverhang: 25,
    } : undefined,
    wardrobe: specs.productType === "wardrobe" ? {
      width: specs.wardrobeSpec.designWidth,
      height: specs.wardrobeSpec.designHeight,
      depth: specs.wardrobeSpec.designDepth,
      shelves: specs.wardrobeSpec.shelfCount,
      hasHangingRail: specs.wardrobeSpec.hasHangingRail,
      doorType: specs.wardrobeSpec.wardrobeType as any,
      sections: specs.wardrobeSpec.doorCount,
    } : undefined,
    width: specs.productType === "door" ? specs.doorSpec.designWidth :
           specs.productType === "decoration" ? specs.decorationSpec.designWidth : undefined,
    height: specs.productType === "door" ? specs.doorSpec.designHeight :
            specs.productType === "decoration" ? specs.decorationSpec.designHeight : undefined,
    depth: specs.productType === "door" ? (specs.doorSpec.panelThickness || 40) :
           specs.productType === "decoration" ? specs.decorationSpec.designDepth : undefined,
    doorPattern: specs.productType === "door" ? specs.doorSpec.pattern : undefined,
    isDoubleDoor: specs.productType === "door" ? specs.doorSpec.isDouble : undefined,
  };

  if (daLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="loading-design-studio">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="design-studio-page">
      <div className="border-b bg-card sticky top-0 z-20">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-3 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.href = "/dashboard/order-center"}
              data-testid="button-back-to-orders"
            >
              <BackArrow className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <Pencil className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                <span className="truncate">{t("استوديو التصميم", "Design Studio")}</span>
                <Badge variant="outline" className="text-xs">#{orderId}</Badge>
              </h1>
              {customer && (
                <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                  <span className="flex items-center gap-1"><User className="w-3 h-3" />{customer.fullName}</span>
                  {customer.phone && <span className="flex items-center gap-1" dir="ltr"><Phone className="w-3 h-3" />{customer.phone}</span>}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {designAssignment?.status && (
              <Badge variant={designAssignment.status === "completed" ? "default" : "secondary"} data-testid="badge-da-status">
                {designAssignment.status === "pending" ? t("معلق", "Pending") :
                 designAssignment.status === "designing" ? t("قيد التصميم", "Designing") :
                 designAssignment.status === "completed" ? t("مكتمل", "Completed") :
                 t("مراجعة", "Revision")}
              </Badge>
            )}
            <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-design">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : <Save className="w-4 h-4 me-1.5" />}
              {t("حفظ", "Save")}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto p-2 sm:p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} dir={isRTL ? "rtl" : "ltr"}>
          <div className="overflow-x-auto -mx-2 px-2 sm:-mx-4 sm:px-4 mb-4">
            <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-4 sm:w-full sm:max-w-xl" data-testid="tabs-design-studio">
              <TabsTrigger value="product" className="gap-1 sm:gap-1.5 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-product">
                <Ruler className="w-3.5 h-3.5 shrink-0" />
                {t("تفاصيل المنتج", "Product Details")}
              </TabsTrigger>
              <TabsTrigger value="sketch" className="gap-1 sm:gap-1.5 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-sketch">
                <Pencil className="w-3.5 h-3.5 shrink-0" />
                {t("الكروكي", "Sketch")}
              </TabsTrigger>
              <TabsTrigger value="3d" className="gap-1 sm:gap-1.5 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-3d">
                <Box className="w-3.5 h-3.5 shrink-0" />
                {t("عرض 3D", "3D View")}
              </TabsTrigger>
              <TabsTrigger value="files" className="gap-1 sm:gap-1.5 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-files">
                <FileUp className="w-3.5 h-3.5 shrink-0" />
                {t("الملفات", "Files")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="product">
            <ProductDetailsTab
              specs={specs}
              setSpecs={setSpecs}
              notes={notes}
              setNotes={setNotes}
              mfgDimensions={mfgDimensions}
              updateUnit={updateUnit}
              addUnit={addUnit}
              removeUnit={removeUnit}
              t={t}
              lang={lang}
            />
          </TabsContent>

          <TabsContent value="sketch">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Pencil className="w-4 h-4" />
                  {t("الكروكي / الرسم ثنائي الأبعاد", "2D Sketch / Croquis")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-1 sm:p-2">
                <Suspense fallback={<div className="flex items-center justify-center h-[300px] sm:h-[500px]"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
                  <SketchCanvas2D
                    initialData={designAssignment?.sketchData || undefined}
                    onSave={handleSketchSave}
                    roomDimensions={specs.roomWidth > 0 && specs.roomLength > 0 ? { width: specs.roomWidth / 10, height: specs.roomLength / 10 } : undefined}
                  />
                </Suspense>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="3d">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Box className="w-4 h-4" />
                  {t("العرض ثلاثي الأبعاد", "3D Preview")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-1 sm:p-2">
                <Suspense fallback={<div className="flex items-center justify-center h-[300px] sm:h-[500px]"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
                  <Viewer3D
                    specs={viewer3dSpecs}
                    onScreenshot={handle3DScreenshot}
                    className="h-[350px] sm:h-[500px] lg:h-[600px] w-full rounded-lg overflow-hidden border"
                  />
                </Suspense>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="files">
            <FilesTab
              uploadedFiles={uploadedFiles}
              onUpload={handleFileUpload}
              onRemove={removeFile}
              t={t}
            />
          </TabsContent>
        </Tabs>

        <div className="mt-4">
          <Card>
            <CardContent className="p-4">
              <Label className="text-sm font-medium mb-2 block">{t("ملاحظات", "Notes")}</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t("ملاحظات إضافية حول التصميم...", "Additional design notes...")}
                className="min-h-[80px]"
                data-testid="textarea-notes"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ProductDetailsTab({ specs, setSpecs, notes, setNotes, mfgDimensions, updateUnit, addUnit, removeUnit, t, lang }: any) {
  const handleProductTypeChange = (value: ProductCategory) => {
    setSpecs((prev: ProductSpecsState) => ({ ...prev, productType: value }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("نوع المنتج والخامة", "Product Type & Material")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">{t("نوع المنتج", "Product Type")}</Label>
                <Select value={specs.productType} onValueChange={handleProductTypeChange}>
                  <SelectTrigger data-testid="select-product-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_TYPES.map(pt => (
                      <SelectItem key={pt.value} value={pt.value}>{lang === "ar" ? pt.labelAr : pt.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">{t("الخامة", "Material")}</Label>
                <Select value={specs.material} onValueChange={v => setSpecs((p: ProductSpecsState) => ({ ...p, material: v as WoodMaterial }))}>
                  <SelectTrigger data-testid="select-material">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIALS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{lang === "ar" ? m.labelAr : m.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-xs font-medium mb-2 block">{t("أبعاد الغرفة (مم)", "Room Dimensions (mm)")}</Label>
              <div className="grid grid-cols-1 xs:grid-cols-3 gap-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground">{t("العرض", "Width")}</Label>
                  <Input
                    type="number"
                    value={specs.roomWidth}
                    onChange={e => setSpecs((p: ProductSpecsState) => ({ ...p, roomWidth: parseInt(e.target.value) || 0 }))}
                    data-testid="input-room-width"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">{t("الطول", "Length")}</Label>
                  <Input
                    type="number"
                    value={specs.roomLength}
                    onChange={e => setSpecs((p: ProductSpecsState) => ({ ...p, roomLength: parseInt(e.target.value) || 0 }))}
                    data-testid="input-room-length"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">{t("الارتفاع", "Height")}</Label>
                  <Input
                    type="number"
                    value={specs.roomHeight}
                    onChange={e => setSpecs((p: ProductSpecsState) => ({ ...p, roomHeight: parseInt(e.target.value) || 0 }))}
                    data-testid="input-room-height"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-xs font-medium mb-2 block">{t("حالة المبنى", "Building Status")}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground">{t("الحالة", "Status")}</Label>
                  <Select
                    value={specs.buildingStatus}
                    onValueChange={(v: string) => setSpecs((p: ProductSpecsState) => ({ ...p, buildingStatus: v as BuildingStatus }))}
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
                {specs.buildingStatus === "under_construction" && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground">{t("مرحلة البناء", "Construction Phase")}</Label>
                    <Select
                      value={specs.constructionPhase}
                      onValueChange={(v: string) => setSpecs((p: ProductSpecsState) => ({ ...p, constructionPhase: v as ConstructionPhase }))}
                    >
                      <SelectTrigger data-testid="select-construction-phase">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONSTRUCTION_PHASES.map(phase => (
                          <SelectItem key={phase.value} value={phase.value}>
                            {lang === "ar" ? phase.labelAr : phase.labelEn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <RoomOpeningsEditor
          openings={specs.roomOpenings}
          onChange={(openings: RoomOpening[]) => setSpecs((p: ProductSpecsState) => ({ ...p, roomOpenings: openings }))}
          t={t}
          lang={lang}
        />

        {specs.productType === "kitchen" && (
          <KitchenUnitsEditor
            units={specs.kitchenUnits}
            material={specs.material}
            updateUnit={updateUnit}
            addUnit={addUnit}
            removeUnit={removeUnit}
            t={t}
            lang={lang}
          />
        )}

        {specs.productType === "wardrobe" && (
          <WardrobeEditor
            spec={specs.wardrobeSpec}
            material={specs.material}
            onChange={(s: WardrobeUnitSpec) => setSpecs((p: ProductSpecsState) => ({ ...p, wardrobeSpec: s }))}
            t={t}
            lang={lang}
          />
        )}

        {specs.productType === "door" && (
          <DoorEditor
            spec={specs.doorSpec}
            material={specs.material}
            onChange={(s: DoorSpec) => setSpecs((p: ProductSpecsState) => ({ ...p, doorSpec: s }))}
            t={t}
            lang={lang}
          />
        )}

        {specs.productType === "decoration" && (
          <DecorationEditor
            spec={specs.decorationSpec}
            material={specs.material}
            onChange={(s: DecorationSpec) => setSpecs((p: ProductSpecsState) => ({ ...p, decorationSpec: s }))}
            t={t}
            lang={lang}
          />
        )}
      </div>

      <div className="space-y-4">
        <Card className="lg:sticky lg:top-20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="w-4 h-4 text-primary" />
              {t("الأبعاد التصنيعية", "Manufacturing Dimensions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mfgDimensions && mfgDimensions.length > 0 ? (
              <div className="space-y-2">
                {mfgDimensions.map((dim: any, idx: number) => (
                  <div key={idx} className="bg-muted/50 rounded-lg p-3 space-y-1.5" data-testid={`mfg-dim-${idx}`}>
                    <p className="text-xs font-semibold text-primary">{lang === "ar" ? dim.labelAr : dim.labelEn}</p>
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-muted-foreground">{t("التصميمي", "Design")}: </span>
                        <span className="font-medium">{formatMm(dim.designMm)}</span>
                      </div>
                      <div className="text-end">
                        <span className="text-green-600 dark:text-green-400">{t("التصنيعي", "Mfg")}: </span>
                        <span className="font-bold text-green-600 dark:text-green-400">{formatMm(dim.manufacturingMm)}</span>
                      </div>
                    </div>
                    {dim.deductions && dim.deductions.length > 0 && (
                      <div className="text-[10px] text-muted-foreground space-y-0.5 border-t pt-1">
                        {dim.deductions.map((d: string, di: number) => (
                          <p key={di} className="font-mono">{d}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">{t("أدخل الأبعاد لرؤية الحسابات", "Enter dimensions to see calculations")}</p>
            )}
          </CardContent>
        </Card>

        <MfgReferenceGuide t={t} lang={lang} />
      </div>
    </div>
  );
}

function RoomOpeningsEditor({ openings, onChange, t, lang }: { openings: RoomOpening[]; onChange: (o: RoomOpening[]) => void; t: (ar: string, en: string) => string; lang: string }) {
  const [isOpen, setIsOpen] = useState(false);

  const addOpening = () => {
    onChange([...openings, getDefaultRoomOpening()]);
    setIsOpen(true);
  };

  const removeOpening = (index: number) => {
    onChange(openings.filter((_, i) => i !== index));
  };

  const updateOpening = (index: number, field: keyof RoomOpening, value: any) => {
    const updated = [...openings];
    (updated[index] as any)[field] = value;
    if (field === "type" && value !== "window") {
      delete (updated[index] as any).sillHeightMm;
    }
    onChange(updated);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover-elevate">
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <DoorOpen className="w-4 h-4 text-primary" />
                {t("فتحات الغرفة (اختياري)", "Room Openings (Optional)")}
                {openings.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{openings.length}</Badge>
                )}
              </span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {openings.map((opening, idx) => (
              <div key={idx} className="border rounded-md p-3 space-y-3" data-testid={`room-opening-${idx}`}>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-xs">
                    {OPENING_TYPES.find(ot => ot.value === opening.type)?.[lang === "ar" ? "labelAr" : "labelEn"]} #{idx + 1}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeOpening(idx)}
                    data-testid={`button-remove-opening-${idx}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">{t("النوع", "Type")}</Label>
                    <Select
                      value={opening.type}
                      onValueChange={(v) => updateOpening(idx, "type", v as OpeningType)}
                    >
                      <SelectTrigger data-testid={`select-opening-type-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPENING_TYPES.map(ot => (
                          <SelectItem key={ot.value} value={ot.value}>
                            {lang === "ar" ? ot.labelAr : ot.labelEn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">{t("الجدار", "Wall")}</Label>
                    <Select
                      value={opening.wall}
                      onValueChange={(v) => updateOpening(idx, "wall", v as WallDirection)}
                    >
                      <SelectTrigger data-testid={`select-opening-wall-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WALL_DIRECTIONS.map(wd => (
                          <SelectItem key={wd.value} value={wd.value}>
                            {lang === "ar" ? wd.labelAr : wd.labelEn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 xs:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">{t("العرض (مم)", "Width (mm)")}</Label>
                    <Input
                      type="number"
                      value={opening.widthMm}
                      onChange={e => updateOpening(idx, "widthMm", parseInt(e.target.value) || 0)}
                      data-testid={`input-opening-width-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">{t("الارتفاع (مم)", "Height (mm)")}</Label>
                    <Input
                      type="number"
                      value={opening.heightMm}
                      onChange={e => updateOpening(idx, "heightMm", parseInt(e.target.value) || 0)}
                      data-testid={`input-opening-height-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">{t("المسافة من الزاوية (مم)", "Distance from Corner (mm)")}</Label>
                    <Input
                      type="number"
                      value={opening.distanceFromCornerMm}
                      onChange={e => updateOpening(idx, "distanceFromCornerMm", parseInt(e.target.value) || 0)}
                      data-testid={`input-opening-distance-${idx}`}
                    />
                  </div>
                </div>

                {opening.type === "window" && (
                  <div className="grid grid-cols-1 xs:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">{t("ارتفاع حافة النافذة (مم)", "Sill Height (mm)")}</Label>
                      <Input
                        type="number"
                        value={opening.sillHeightMm ?? 900}
                        onChange={e => updateOpening(idx, "sillHeightMm", parseInt(e.target.value) || 0)}
                        data-testid={`input-opening-sill-${idx}`}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={addOpening}
              className="w-full"
              data-testid="button-add-opening"
            >
              <Plus className="w-4 h-4 me-1.5" />
              {t("إضافة فتحة", "Add Opening")}
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function KitchenUnitsEditor({ units, material, updateUnit, addUnit, removeUnit, t, lang }: any) {
  const cabinetLabels: Record<CabinetType, { ar: string; en: string }> = {
    base: { ar: "وحدة أرضية", en: "Base Cabinet" },
    wall: { ar: "وحدة حائطية", en: "Wall Cabinet" },
    tall: { ar: "وحدة طويلة", en: "Tall Cabinet" },
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <CardTitle className="text-base">{t("وحدات المطبخ", "Kitchen Units")}</CardTitle>
          <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => addUnit("base")} data-testid="button-add-base">
              <Plus className="w-3 h-3 me-1" />{t("أرضية", "Base")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => addUnit("wall")} data-testid="button-add-wall">
              <Plus className="w-3 h-3 me-1" />{t("حائطية", "Wall")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => addUnit("tall")} data-testid="button-add-tall">
              <Plus className="w-3 h-3 me-1" />{t("طويلة", "Tall")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {units.map((unit: KitchenUnitSpec, idx: number) => (
          <div key={idx} className="border rounded-lg p-3 space-y-3" data-testid={`kitchen-unit-${idx}`}>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[10px]">
                {lang === "ar" ? cabinetLabels[unit.cabinetType].ar : cabinetLabels[unit.cabinetType].en}
                {" #"}{idx + 1}
              </Badge>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeUnit(idx)} data-testid={`button-remove-unit-${idx}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-1 xs:grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">{t("العرض (مم)", "Width (mm)")}</Label>
                <Input type="number" value={unit.designWidth} onChange={e => updateUnit(idx, "designWidth", parseInt(e.target.value) || 0)} className="h-8 text-xs" data-testid={`input-unit-width-${idx}`} />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">{t("الارتفاع (مم)", "Height (mm)")}</Label>
                <Input type="number" value={unit.designHeight} onChange={e => updateUnit(idx, "designHeight", parseInt(e.target.value) || 0)} className="h-8 text-xs" data-testid={`input-unit-height-${idx}`} />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">{t("العمق (مم)", "Depth (mm)")}</Label>
                <Input type="number" value={unit.designDepth} onChange={e => updateUnit(idx, "designDepth", parseInt(e.target.value) || 0)} className="h-8 text-xs" data-testid={`input-unit-depth-${idx}`} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={unit.hasDoor} onChange={e => updateUnit(idx, "hasDoor", e.target.checked)} className="rounded" data-testid={`check-unit-door-${idx}`} />
                <Label className="text-[10px]">{t("باب", "Door")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={unit.hasDrawer} onChange={e => updateUnit(idx, "hasDrawer", e.target.checked)} className="rounded" data-testid={`check-unit-drawer-${idx}`} />
                <Label className="text-[10px]">{t("درج", "Drawer")}</Label>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">{t("عدد الأدراج", "Drawers")}</Label>
                <Input type="number" value={unit.drawerCount} onChange={e => updateUnit(idx, "drawerCount", parseInt(e.target.value) || 0)} className="h-8 text-xs" data-testid={`input-unit-drawers-${idx}`} />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function WardrobeEditor({ spec, material, onChange, t, lang }: any) {
  const update = (field: string, value: any) => onChange({ ...spec, [field]: value });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("خزانة الملابس", "Wardrobe Specifications")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs mb-1.5 block">{t("نوع الخزانة", "Wardrobe Type")}</Label>
          <Select value={spec.wardrobeType} onValueChange={v => update("wardrobeType", v)}>
            <SelectTrigger data-testid="select-wardrobe-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hinged">{t("مفصلي", "Hinged")}</SelectItem>
              <SelectItem value="sliding">{t("منزلق", "Sliding")}</SelectItem>
              <SelectItem value="walkin">{t("غرفة ملابس", "Walk-in")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 xs:grid-cols-3 gap-3">
          <div>
            <Label className="text-[10px] text-muted-foreground">{t("العرض (مم)", "Width (mm)")}</Label>
            <Input type="number" value={spec.designWidth} onChange={e => update("designWidth", parseInt(e.target.value) || 0)} data-testid="input-wardrobe-width" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">{t("الارتفاع (مم)", "Height (mm)")}</Label>
            <Input type="number" value={spec.designHeight} onChange={e => update("designHeight", parseInt(e.target.value) || 0)} data-testid="input-wardrobe-height" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">{t("العمق (مم)", "Depth (mm)")}</Label>
            <Input type="number" value={spec.designDepth} onChange={e => update("designDepth", parseInt(e.target.value) || 0)} data-testid="input-wardrobe-depth" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] text-muted-foreground">{t("عدد الأبواب", "Doors")}</Label>
            <Input type="number" value={spec.doorCount} onChange={e => update("doorCount", parseInt(e.target.value) || 0)} data-testid="input-wardrobe-doors" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">{t("عدد الأرفف", "Shelves")}</Label>
            <Input type="number" value={spec.shelfCount} onChange={e => update("shelfCount", parseInt(e.target.value) || 0)} data-testid="input-wardrobe-shelves" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={spec.hasHangingRail} onChange={e => update("hasHangingRail", e.target.checked)} className="rounded" data-testid="check-wardrobe-rail" />
            <Label className="text-xs">{t("علاقة ملابس", "Hanging Rail")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={spec.hasDoubleHanging} onChange={e => update("hasDoubleHanging", e.target.checked)} className="rounded" data-testid="check-wardrobe-double" />
            <Label className="text-xs">{t("علاقة مزدوجة", "Double Hanging")}</Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DoorEditor({ spec, material, onChange, t, lang }: any) {
  const update = (field: string, value: any) => onChange({ ...spec, [field]: value });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("الأبواب", "Door Specifications")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] text-muted-foreground">{t("العرض (مم)", "Width (mm)")}</Label>
            <Input type="number" value={spec.designWidth} onChange={e => update("designWidth", parseInt(e.target.value) || 0)} data-testid="input-door-width" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">{t("الارتفاع (مم)", "Height (mm)")}</Label>
            <Input type="number" value={spec.designHeight} onChange={e => update("designHeight", parseInt(e.target.value) || 0)} data-testid="input-door-height" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] text-muted-foreground">{t("عرض الإطار (مم)", "Frame Width (mm)")}</Label>
            <Input type="number" value={spec.frameWidth} onChange={e => update("frameWidth", parseInt(e.target.value) || 0)} data-testid="input-door-frame-width" />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" checked={spec.isDouble} onChange={e => update("isDouble", e.target.checked)} className="rounded" data-testid="check-door-double" />
            <Label className="text-xs">{t("باب مزدوج", "Double Door")}</Label>
          </div>
        </div>

        <Separator />

        <div>
          <Label className="text-xs font-medium mb-2 block">{t("نقشة الباب", "Door Pattern")}</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {DOOR_PATTERNS.map(p => (
              <button
                key={p.value}
                onClick={() => update("pattern", p.value)}
                className={`border rounded-lg p-2 text-center transition-all hover:border-primary/50 ${
                  spec.pattern === p.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                }`}
                data-testid={`button-door-pattern-${p.value}`}
              >
                <div className="w-full h-12 bg-muted/50 rounded mb-1.5 flex items-center justify-center text-lg">
                  {p.value === "plain" ? "▬" :
                   p.value === "classic_raised" ? "◻" :
                   p.value === "shaker" ? "⬜" :
                   p.value === "cathedral" ? "⌂" :
                   p.value === "geometric" ? "◇" :
                   p.value === "islamic_arch" ? "☪" :
                   p.value === "modern_lines" ? "≡" :
                   p.value === "french" ? "⊞" :
                   p.value === "louver" ? "☰" :
                   "◫"}
                </div>
                <p className="text-[10px] font-medium leading-tight">{lang === "ar" ? p.labelAr : p.labelEn}</p>
                <p className="text-[8px] text-muted-foreground leading-tight mt-0.5">{lang === "ar" ? p.descAr : p.descEn}</p>
              </button>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <Label className="text-xs mb-1.5 block">{t("مقاسات قياسية سريعة", "Quick Standard Sizes")}</Label>
          <div className="flex gap-2 flex-wrap">
            {DOOR_STANDARD_WIDTHS.map(d => (
              <Button
                key={d.widthMm}
                size="sm"
                variant={spec.designWidth === d.widthMm ? "default" : "outline"}
                onClick={() => {
                  onChange({
                    ...spec,
                    designWidth: d.widthMm,
                    designHeight: DOOR_STANDARDS.standardHeight,
                    frameWidth: DOOR_STANDARDS.frameWidth,
                  });
                }}
                className="text-xs h-7"
                data-testid={`button-door-size-${d.widthMm}`}
              >
                {lang === "ar" ? d.labelAr : d.labelEn}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DecorationEditor({ spec, material, onChange, t, lang }: any) {
  const update = (field: string, value: any) => onChange({ ...spec, [field]: value });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("الديكور", "Decoration Specifications")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 xs:grid-cols-3 gap-3">
          <div>
            <Label className="text-[10px] text-muted-foreground">{t("العرض (مم)", "Width (mm)")}</Label>
            <Input type="number" value={spec.designWidth} onChange={e => update("designWidth", parseInt(e.target.value) || 0)} data-testid="input-deco-width" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">{t("الارتفاع (مم)", "Height (mm)")}</Label>
            <Input type="number" value={spec.designHeight} onChange={e => update("designHeight", parseInt(e.target.value) || 0)} data-testid="input-deco-height" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">{t("العمق (مم)", "Depth (mm)")}</Label>
            <Input type="number" value={spec.designDepth} onChange={e => update("designDepth", parseInt(e.target.value) || 0)} data-testid="input-deco-depth" />
          </div>
        </div>
        <div>
          <Label className="text-xs mb-1.5 block">{t("الوصف", "Description")}</Label>
          <Textarea
            value={spec.description || ""}
            onChange={e => update("description", e.target.value)}
            placeholder={t("وصف قطعة الديكور...", "Describe the decoration piece...")}
            className="min-h-[60px]"
            data-testid="textarea-deco-description"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MfgReferenceGuide({ t, lang }: { t: (ar: string, en: string) => string; lang: string }) {
  const [open, setOpen] = useState(false);

  const refData = [
    {
      titleAr: "سماكات الألواح القياسية",
      titleEn: "Standard Panel Thicknesses",
      items: [
        { ar: "شيبورد / MDF: 18 مم", en: "Chipboard / MDF: 18mm" },
        { ar: "خشب زان / بلوط صولد: 20 مم", en: "Solid Beech / Oak: 20mm" },
        { ar: "HPL / PVC: 18 مم", en: "HPL / PVC: 18mm" },
      ],
    },
    {
      titleAr: "خلوصات التجميع",
      titleEn: "Assembly Clearances",
      items: [
        { ar: "شريط حافة (Edge Banding): 0.5 مم لكل جانب", en: "Edge Banding: 0.5mm per side" },
        { ar: "خلوص سكة الدرج: 13 مم لكل جانب", en: "Drawer Runner Clearance: 13mm per side" },
        { ar: "خلوص مفصل الباب: 3 مم", en: "Door Hinge Clearance: 3mm" },
        { ar: "خلوص سكة الانزلاق: 15 مم", en: "Sliding Track Clearance: 15mm" },
        { ar: "فجوة التجميع: 1 مم", en: "Assembly Gap: 1mm" },
      ],
    },
    {
      titleAr: "معادلات الحساب",
      titleEn: "Calculation Formulas",
      items: [
        { ar: "العرض الداخلي = العرض التصميمي - (سماكة اللوح × 2)", en: "Internal Width = Design Width - (Panel Thickness × 2)" },
        { ar: "العمق الداخلي = العمق التصميمي - سماكة اللوح - شريط حافة", en: "Internal Depth = Design Depth - Panel Thickness - Edge Banding" },
        { ar: "عرض الرف = العرض الداخلي - (شريط حافة × 2)", en: "Shelf Width = Internal Width - (Edge Banding × 2)" },
        { ar: "عرض الدرج = العرض الداخلي - (خلوص سكة × 2) - خلوص تركيب", en: "Drawer Width = Internal Width - (Runner Clearance × 2) - Fitting Clearance" },
      ],
    },
    {
      titleAr: "مقاسات الأبواب القياسية",
      titleEn: "Standard Door Sizes",
      items: [
        { ar: "الارتفاع القياسي: 2100 مم", en: "Standard Height: 2100mm" },
        { ar: "عرض الإطار: 100 مم", en: "Frame Width: 100mm" },
        { ar: "فجوة أسفل الباب: 10 مم", en: "Bottom Gap: 10mm" },
        { ar: "فجوة أعلى الباب: 3 مم", en: "Top Gap: 3mm" },
      ],
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpen(!open)}>
        <CardTitle className="text-sm flex items-center gap-2">
          <Ruler className="w-4 h-4 text-blue-500" />
          {t("دليل الأبعاد التصنيعية", "Manufacturing Dimensions Guide")}
          {open ? <ChevronRight className="w-3 h-3 ms-auto rotate-90 transition-transform" /> : <ChevronRight className="w-3 h-3 ms-auto rtl:rotate-180 transition-transform" />}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 pt-0">
          {refData.map((section, si) => (
            <div key={si} className="space-y-1">
              <p className="text-[11px] font-semibold text-primary">{lang === "ar" ? section.titleAr : section.titleEn}</p>
              <div className="bg-muted/30 rounded p-2 space-y-0.5">
                {section.items.map((item, ii) => (
                  <p key={ii} className="text-[10px] text-muted-foreground font-mono">
                    • {lang === "ar" ? item.ar : item.en}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function FilesTab({ uploadedFiles, onUpload, onRemove, t }: any) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileUp className="w-4 h-4" />
          {t("الملفات والمرفقات", "Files & Attachments")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-2 border-dashed rounded-lg p-4 sm:p-8 text-center hover:border-primary/50 transition-colors" data-testid="file-drop-zone">
          <FileUp className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-3">
            {t("اسحب الملفات هنا أو اضغط لاختيار الملفات", "Drag files here or click to browse")}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {t("صور، PDF، ملفات Adeko، AutoCAD", "Images, PDFs, Adeko files, AutoCAD")}
          </p>
          <label>
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.dwg,.dxf"
              onChange={onUpload}
              className="hidden"
              data-testid="input-file-upload"
            />
            <Button variant="outline" asChild>
              <span data-testid="button-browse-files">{t("اختيار ملفات", "Browse Files")}</span>
            </Button>
          </label>
        </div>

        {uploadedFiles.length > 0 && (
          <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {uploadedFiles.map((file: string, idx: number) => (
              <div key={idx} className="relative group border rounded-lg overflow-hidden" data-testid={`file-item-${idx}`}>
                {file.startsWith("data:image") ? (
                  <img src={file} alt={`File ${idx + 1}`} className="w-full h-32 object-cover" />
                ) : (
                  <div className="w-full h-32 flex items-center justify-center bg-muted">
                    <FileIcon className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  className="absolute top-1 end-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onRemove(idx)}
                  data-testid={`button-remove-file-${idx}`}
                >
                  <X className="w-3 h-3" />
                </Button>
                <p className="text-[10px] text-center py-1 text-muted-foreground">{t("ملف", "File")} {idx + 1}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
