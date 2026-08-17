import { Check, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

export type ToolStage = "space" | "details" | "studio";

const STAGES: { key: ToolStage; ar: string; en: string }[] = [
  { key: "space", ar: "المساحة", en: "Space" },
  { key: "details", ar: "تفاصيل المكان", en: "Place Details" },
  { key: "studio", ar: "صمّم مطبخك", en: "Design Your Kitchen" },
];

export function ToolStages({ current }: { current: ToolStage }) {
  const { t, isRTL } = useLanguage();
  const currentIndex = STAGES.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap" data-testid="tool-stages">
      {STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={stage.key} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
              data-testid={`stage-${stage.key}`}
            >
              {done && <Check className="w-3.5 h-3.5" />}
              {t(stage.ar, stage.en)}
            </div>
            {i < STAGES.length - 1 && (
              <span className={`text-sm ${i < currentIndex ? "text-primary" : "text-muted-foreground/50"}`}>
                {isRTL ? "←" : "→"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ToolNav({ homeTestId }: { homeTestId: string }) {
  const { t } = useLanguage();
  return (
    <nav className="border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/kitchen-designer" data-testid="link-tool-logo">
          <img src={teakLogo} alt="Teak" className="h-10 w-auto object-contain logo-auto" />
        </a>
        <a href="/" data-testid={homeTestId}>
          <Button variant="ghost" size="sm">
            <Home className="w-4 h-4 me-2" />
            {t("الرئيسية", "Home")}
          </Button>
        </a>
      </div>
    </nav>
  );
}
