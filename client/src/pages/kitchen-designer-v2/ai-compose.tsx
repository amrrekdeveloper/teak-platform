/**
 * V2 «الأداة المطورة» — "كوّن مطبخي" step.
 *
 * Short preference questions (style + island), then the AI plans the
 * kitchen (a structured plan, never meshes). The plan is compiled through
 * the deterministic collision engine into normal placed cabinets and the
 * regular 3D studio opens with a fully editable design. On any AI failure
 * the smart templates take over, so the customer always gets a kitchen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/components/language-provider";
import DesktopGate from "@/components/kitchen-designer-v2/desktop-gate";
import { ToolStages, ToolNav } from "@/components/kitchen-designer-v2/tool-stages";
import { useKitchenToolStore, type KitchenLayout } from "@/components/kitchen-designer-v2/store";
import { getWallSegments } from "@/components/kitchen-designer-v2/plan-svg";
import { computeIslandPlacement } from "@/components/kitchen-designer-v2/island";
import {
  adekoDefFromProduct,
  registerAdekoDef,
  EXTRA_CABINET_DEFS,
  type AdekoProductRow,
  type CabinetDef,
} from "@/components/kitchen-designer-v2/cabinets";
import { KITCHEN_TEMPLATES } from "@/components/kitchen-designer-v2/templates";
import {
  buildRoomSummary,
  parseAiPlan,
  compileAiPlan,
  buildFallbackPlan,
} from "@/components/kitchen-designer-v2/ai-plan";
import { apiRequest } from "@/lib/queryClient";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

type IslandChoice = "yes" | "no" | "auto";

const PHRASES: { ar: string; en: string }[] = [
  { ar: "نحلل مساحة الغرفة...", en: "Analyzing the room space..." },
  { ar: "نراعي الأبواب والنوافذ واتجاهات الفتح...", en: "Accounting for doors, windows and swing directions..." },
  { ar: "ندرس نقاط المياه والصرف والغاز...", en: "Studying water, drain and gas points..." },
  { ar: "نوزع مناطق العمل: الغسيل، الطهي، التخزين...", en: "Laying out work zones: washing, cooking, storage..." },
  { ar: "تصميم الخزائن وتنسيق الواجهات...", en: "Designing cabinets and coordinating fronts..." },
  { ar: "جاري تصميم مطبخك...", en: "Composing your kitchen..." },
];

/** Minimum time (ms) the composing screen stays up so it never flashes. */
const MIN_COMPOSE_MS = 4500;

function ComposingOverlay() {
  const { t } = useLanguage();
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % PHRASES.length), 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background"
      data-testid="overlay-ai-composing"
    >
      <img
        src={teakLogo}
        alt="Teak"
        className="h-20 w-auto object-contain logo-auto animate-pulse"
      />
      <div className="flex flex-col items-center gap-3">
        <p className="text-xl font-bold" data-testid="text-composing-title">
          {t("نكوّن مطبخك الآن", "Composing your kitchen")}
        </p>
        <p
          key={idx}
          className="text-sm text-muted-foreground animate-in fade-in duration-500"
          data-testid="text-composing-phrase"
        >
          {t(PHRASES[idx].ar, PHRASES[idx].en)}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {PHRASES.map((_, i) => (
          <span
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${
              i === idx ? "bg-primary" : "bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function KitchenToolAiComposePage() {
  const { t, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const answers = useKitchenToolStore((s) => s.answers);
  const walls = useKitchenToolStore((s) => s.walls);
  const ceilingHeight = useKitchenToolStore((s) => s.ceilingHeight);
  const openings = useKitchenToolStore((s) => s.openings);
  const utilities = useKitchenToolStore((s) => s.utilities);
  const clearPlacedCabinets = useKitchenToolStore((s) => s.clearPlacedCabinets);
  const addPlacedCabinet = useKitchenToolStore((s) => s.addPlacedCabinet);
  const setIslandEnabled = useKitchenToolStore((s) => s.setIslandEnabled);

  const [templateId, setTemplateId] = useState(KITCHEN_TEMPLATES[0].id);
  const [island, setIsland] = useState<IslandChoice>("auto");
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busyRef = useRef(false);

  const layout: KitchenLayout = answers.layout ?? "L";
  const segments = useMemo(() => getWallSegments(layout, walls), [layout, walls]);

  // Same catalog as the studio — the AI plan is compiled against real defs.
  const { data: adekoProducts } = useQuery<AdekoProductRow[]>({
    queryKey: ["/api/kitchen-tool/products"],
    staleTime: 5 * 60 * 1000,
  });
  const adekoDefs = useMemo(() => {
    const defs: CabinetDef[] = [];
    for (const p of adekoProducts ?? []) {
      const def = adekoDefFromProduct(p);
      if (def) defs.push(def);
    }
    defs.forEach(registerAdekoDef);
    for (const x of EXTRA_CABINET_DEFS) {
      if (!defs.some((d) => d.id === x.id)) defs.push(x);
    }
    return defs;
  }, [adekoProducts]);

  // Deterministic island fit — «اقترح الأنسب» and the final decision both use it.
  const islandFits = useMemo(
    () => computeIslandPlacement(segments, openings, new Set<string>()) !== null,
    [segments, openings]
  );

  const template =
    KITCHEN_TEMPLATES.find((x) => x.id === templateId) ?? KITCHEN_TEMPLATES[0];

  const compose = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setComposing(true);
    setNotice(null);
    const started = Date.now();

    let cabinets = null as ReturnType<typeof compileAiPlan> | null;
    let aiIsland: boolean | undefined;
    try {
      const room = buildRoomSummary(
        layout,
        walls,
        ceilingHeight,
        openings,
        utilities,
        template.nameAr,
        island
      );
      const res = await apiRequest("POST", "/api/kitchen-designer-v2/plan", { room });
      const data = (await res.json()) as { plan?: unknown };
      const plan = parseAiPlan(data.plan);
      if (plan) {
        aiIsland = plan.island;
        const compiled = compileAiPlan(plan, segments, openings, adekoDefs, template);
        if (compiled.length >= 3) cabinets = compiled;
      }
    } catch {
      // AI unavailable/failed — the deterministic fallback below takes over.
    }

    // Intelligent service unavailable or plan uncompilable — the V2
    // deterministic utility-aware planner still designs a sensible kitchen
    // from the room data itself (never a fixed template).
    let usedFallback = false;
    if (!cabinets || cabinets.length === 0) {
      usedFallback = true;
      const fb = buildFallbackPlan(segments, openings, utilities, island);
      aiIsland = fb.island;
      cabinets = compileAiPlan(fb, segments, openings, adekoDefs, template);
    }

    // Island: explicit choice wins; "auto" follows AI opinion but only when
    // the deterministic fit test agrees. Never enabled in a tight room.
    const wantIsland =
      island === "yes" ? true : island === "no" ? false : (aiIsland ?? islandFits);
    const finalIsland = wantIsland && islandFits;

    const elapsed = Date.now() - started;
    if (elapsed < MIN_COMPOSE_MS) {
      await new Promise((r) => setTimeout(r, MIN_COMPOSE_MS - elapsed));
    }

    if (!cabinets || cabinets.length === 0) {
      busyRef.current = false;
      setComposing(false);
      setNotice(
        t(
          "لا توجد مساحة كافية على الجدران المُدخلة — راجع المقاسات ثم حاول مجددًا.",
          "Not enough space on the entered walls — review the measurements and try again."
        )
      );
      return;
    }

    clearPlacedCabinets();
    for (const c of cabinets) addPlacedCabinet(c);
    setIslandEnabled(finalIsland);
    if (usedFallback) {
      console.info("compose: used deterministic utility-aware fallback planner");
    }
    setLocation("/kitchen-designer-v2/studio");
  };

  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  return (
    <DesktopGate>
      {composing && <ComposingOverlay />}
      <div className="min-h-screen bg-background flex flex-col">
        <ToolNav homeTestId="link-compose-home" />
        <div className="max-w-6xl mx-auto w-full px-6 pt-6">
          <ToolStages current="compose" />
        </div>

        <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 space-y-8">
          <div>
            <h1 className="text-2xl font-bold mb-1 flex items-center gap-2" data-testid="text-compose-title">
              <Sparkles className="w-6 h-6 text-primary" />
              {t("كوّن مطبخي", "Compose My Kitchen")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "أجب على سؤالين فقط، وسيخطط الذكاء الاصطناعي مطبخك بناءً على مساحتك ونقاط الخدمات — ثم يفتح الاستوديو والتصميم بالكامل ملكك للتعديل.",
                "Answer just two questions and the AI will plan your kitchen from your space and utility points — then the studio opens and the design is fully yours to edit."
              )}
            </p>
          </div>

          <div className="space-y-3">
            <Label className="font-bold">{t("اختر الطابع العام", "Choose the overall style")}</Label>
            <div className="grid grid-cols-2 gap-3">
              {KITCHEN_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setTemplateId(tpl.id)}
                  className={`rounded-xl border-2 p-4 text-start transition-colors ${
                    templateId === tpl.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                  data-testid={`button-style-${tpl.id}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {tpl.swatches.map((c, i) => (
                      <span
                        key={i}
                        className="w-6 h-6 rounded-full border border-border"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <p className="font-bold text-sm">{t(tpl.nameAr, tpl.nameEn)}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t(tpl.descriptionAr, tpl.descriptionEn)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="font-bold">{t("هل ترغب بجزيرة وسط المطبخ؟", "Do you want a kitchen island?")}</Label>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { value: "yes", ar: "نعم", en: "Yes" },
                  { value: "no", ar: "لا", en: "No" },
                  { value: "auto", ar: "اقترح الأنسب", en: "Suggest the best" },
                ] as { value: IslandChoice; ar: string; en: string }[]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setIsland(opt.value)}
                  className={`rounded-lg border-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                    island === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                  data-testid={`button-island-${opt.value}`}
                >
                  {t(opt.ar, opt.en)}
                </button>
              ))}
            </div>
            {island === "yes" && !islandFits && (
              <p className="text-xs text-muted-foreground" data-testid="text-island-tight">
                {t(
                  "الجزيرة تحتاج ممرات ٩٠ سم حولها — المساحة الحالية قد لا تسمح، وسنخبرك بالنتيجة.",
                  "An island needs 90cm walkways around it — your current room may be too tight; we'll apply it only if it fits."
                )}
              </p>
            )}
          </div>

          {notice && (
            <p
              className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-3"
              data-testid="text-compose-notice"
            >
              {notice}
            </p>
          )}
        </div>

        <div className="border-t border-border/50 bg-background">
          <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setLocation("/kitchen-designer-v2/details")}
              className="font-bold min-w-[130px]"
              data-testid="button-compose-back"
            >
              <BackIcon className="w-4 h-4 me-1" />
              {t("السابق", "Back")}
            </Button>
            <Button
              size="lg"
              onClick={compose}
              disabled={composing}
              className="font-bold min-w-[180px]"
              data-testid="button-compose-go"
            >
              <Sparkles className="w-4 h-4 me-2" />
              {t("كوّن مطبخي", "Compose My Kitchen")}
            </Button>
          </div>
        </div>
      </div>
    </DesktopGate>
  );
}
