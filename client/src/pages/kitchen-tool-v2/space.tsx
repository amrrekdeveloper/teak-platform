/**
 * Kitchen Designer V2 — Space input page (isolated from V1).
 * Route: /kitchen-designer-v2/space
 */
import { useMemo } from "react";
import { useLocation } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowLeft, Box, RotateCcw } from "lucide-react";
import { useKitchenToolV2Store } from "@/components/kitchen-tool-v2/store";
import {
  type RoomLayoutV2,
  type RoomInputV2,
  cmToMm,
  validateRoomInputV2,
  generateRoomV2,
  requiredFieldsForLayout,
} from "@/components/kitchen-tool-v2/room-model";
import { V2Gate } from "@/components/kitchen-tool-v2/v2-gate";

const LAYOUTS: { id: RoomLayoutV2; ar: string; en: string }[] = [
  { id: "single_wall", ar: "جدار واحد", en: "Single Wall" },
  { id: "l_shape", ar: "حرف L", en: "L Shape" },
  { id: "u_shape", ar: "حرف U", en: "U Shape" },
  { id: "galley", ar: "جداران متقابلان", en: "Galley" },
];

/** Tiny 2D preview of a layout (SVG, plan view). */
function LayoutPreview({ layout, active }: { layout: RoomLayoutV2; active: boolean }) {
  const stroke = active ? "hsl(var(--primary))" : "currentColor";
  const common = { stroke, strokeWidth: 8, strokeLinecap: "round" as const, fill: "none" };
  return (
    <svg viewBox="0 0 100 100" className="w-full h-20 text-muted-foreground/60">
      <rect x="8" y="8" width="84" height="84" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.4" />
      {layout === "single_wall" && <path d="M 12 14 H 88" {...common} />}
      {layout === "l_shape" && <path d="M 12 14 H 88 V 88" {...common} />}
      {layout === "u_shape" && <path d="M 12 88 V 14 H 88 V 88" {...common} />}
      {layout === "galley" && (
        <>
          <path d="M 12 14 H 88" {...common} />
          <path d="M 12 86 H 88" {...common} />
        </>
      )}
    </svg>
  );
}

function parseCm(v: string): number {
  // Normalize Arabic-Indic digits before parsing.
  const normalized = v
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[،٫]/g, ".")
    .trim();
  return parseFloat(normalized);
}

export default function KitchenToolV2SpacePage() {
  return (
    <V2Gate>
      <KitchenToolV2SpaceInner />
    </V2Gate>
  );
}

function KitchenToolV2SpaceInner() {
  const { t, lang } = useLanguage();
  const [, navigate] = useLocation();
  const s = useKitchenToolV2Store();
  const inputs = s.inputs;

  const roomInput: RoomInputV2 | null = useMemo(() => {
    if (!inputs.layout) return null;
    return {
      layout: inputs.layout,
      wallAMm: cmToMm(parseCm(inputs.wallACm)),
      wallBMm: inputs.wallBCm ? cmToMm(parseCm(inputs.wallBCm)) : undefined,
      wallCMm: inputs.wallCCm ? cmToMm(parseCm(inputs.wallCCm)) : undefined,
      depthMm: inputs.depthCm ? cmToMm(parseCm(inputs.depthCm)) : undefined,
      ceilingHeightMm: cmToMm(parseCm(inputs.ceilingHeightCm)),
      roomType: inputs.roomType,
      measurementConfidence: inputs.measurementConfidence,
    };
  }, [inputs]);

  const validation = useMemo(
    () => (roomInput ? validateRoomInputV2(roomInput) : null),
    [roomInput]
  );

  const required = inputs.layout ? requiredFieldsForLayout(inputs.layout) : [];
  const canContinue = !!roomInput && !!validation && validation.errors.length === 0;

  const handleSaveAndPreview = () => {
    if (!roomInput || !canContinue) return;
    const room = generateRoomV2(roomInput);
    s.setRoom(room);
    navigate("/kitchen-designer-v2/room-preview");
  };

  const dimField = (
    field: "wallACm" | "wallBCm" | "wallCCm" | "depthCm" | "ceilingHeightCm",
    labelAr: string,
    labelEn: string,
    testId: string
  ) => {
    const errKey = field === "ceilingHeightCm" ? "ceilingHeightMm" : field.replace("Cm", "Mm");
    const err = validation?.errors.find((e) => e.field === errKey);
    const warn = validation?.warnings.find((w) => w.field === errKey);
    return (
      <div className="space-y-1.5">
        <Label className="text-sm">{t(labelAr, labelEn)} <span className="text-muted-foreground text-xs">({t("سم", "cm")})</span></Label>
        <Input
          inputMode="decimal"
          value={inputs[field]}
          onChange={(e) => s.setInputs({ [field]: e.target.value } as any)}
          placeholder={t("مثال: 300", "e.g. 300")}
          data-testid={`input-v2-${testId}`}
        />
        {err && <p className="text-xs text-destructive">{lang === "ar" ? err.messageAr : err.messageEn}</p>}
        {!err && warn && <p className="text-xs text-amber-600 dark:text-amber-400">{lang === "ar" ? warn.messageAr : warn.messageEn}</p>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-v2-space-title">
            {t("صمم مطبخك 2 — مساحة الغرفة", "Design Your Kitchen 2 — Room Space")}
          </h1>
          <Badge variant="outline" className="shrink-0">{t("تجريبي", "Experimental")}</Badge>
        </div>
        <p className="text-muted-foreground mb-8">
          {t("اختر شكل الغرفة وأدخل الأبعاد بالسنتيمتر لإنشاء غرفة ثلاثية الأبعاد فارغة.", "Choose the room layout and enter dimensions in centimeters to generate an empty 3D room.")}
        </p>

        {/* Layout cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {LAYOUTS.map((l) => (
            <Card
              key={l.id}
              onClick={() => s.setInputs({ layout: l.id })}
              className={`cursor-pointer transition-all hover-elevate ${inputs.layout === l.id ? "border-primary ring-1 ring-primary" : ""}`}
              data-testid={`card-v2-layout-${l.id}`}
            >
              <CardContent className="p-3 text-center">
                <LayoutPreview layout={l.id} active={inputs.layout === l.id} />
                <p className="text-sm font-medium mt-1">{t(l.ar, l.en)}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {inputs.layout && (
          <Card className="mb-6">
            <CardContent className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {dimField("wallACm", "طول الجدار A / أ", "Wall A length", "wall-a")}
                {required.includes("wallBMm") && dimField("wallBCm", "طول الجدار B / ب", "Wall B length", "wall-b")}
                {required.includes("wallCMm") && dimField("wallCCm", "طول الجدار C / ج", "Wall C length", "wall-c")}
                {required.includes("depthMm") &&
                  dimField(
                    "depthCm",
                    inputs.layout === "galley" ? "المسافة بين الجدارين" : "عمق الغرفة",
                    inputs.layout === "galley" ? "Distance between walls" : "Room depth",
                    "depth"
                  )}
                {dimField("ceilingHeightCm", "ارتفاع السقف", "Ceiling height", "ceiling")}
              </div>

              <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-2 border-t">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={inputs.roomType === "closed"}
                    onCheckedChange={(v) => s.setInputs({ roomType: v ? "closed" : "open" })}
                    data-testid="switch-v2-room-type"
                  />
                  <Label className="text-sm">{inputs.roomType === "closed" ? t("مساحة مغلقة", "Closed space") : t("مساحة مفتوحة", "Open space")}</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={inputs.measurementConfidence === "exact"}
                    onCheckedChange={(v) => s.setInputs({ measurementConfidence: v ? "exact" : "approximate" })}
                    data-testid="switch-v2-measurement"
                  />
                  <Label className="text-sm">{inputs.measurementConfidence === "exact" ? t("قياسات دقيقة", "Exact measurements") : t("قياسات تقريبية", "Approximate measurements")}</Label>
                </div>
              </div>

              {inputs.measurementConfidence === "approximate" && (
                <div className="flex items-start gap-2 rounded-md border border-amber-400/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400" data-testid="warning-v2-approximate">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{t("القياسات التقريبية غير معتمدة للتصنيع — سيلزم قياس دقيق في الموقع قبل التنفيذ.", "Approximate measurements are not approved for manufacturing — an exact on-site measurement will be required before production.")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            disabled={!canContinue}
            onClick={handleSaveAndPreview}
            className="gap-2"
            data-testid="button-v2-save-preview"
          >
            <Box className="w-5 h-5" />
            {t("حفظ ومعاينة الغرفة", "Save & Preview Room")}
            <ArrowLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
          </Button>
          <Button variant="outline" size="lg" onClick={() => s.resetV2()} className="gap-2" data-testid="button-v2-reset">
            <RotateCcw className="w-4 h-4" />
            {t("إعادة تعيين (نسخة 2 فقط)", "Reset (V2 only)")}
          </Button>
        </div>
      </div>
    </div>
  );
}
