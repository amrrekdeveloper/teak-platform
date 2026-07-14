import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, SkipForward, Check, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import DesktopGate from "@/components/kitchen-tool/desktop-gate";
import { useKitchenToolStore, canCloseLayout, type KitchenAnswers, type KitchenLayout } from "@/components/kitchen-tool/store";
import { ToolStages } from "@/components/kitchen-tool/tool-stages";
import {
  OvenUnderCounterIllustration,
  OvenTallCabinetIllustration,
  HoodWallIllustration,
  HoodIntegratedIllustration,
  FridgeFreestandingIllustration,
  FridgeIntegratedIllustration,
  LayoutIIllustration,
  LayoutLIllustration,
  LayoutUIllustration,
  LayoutParallelIllustration,
} from "@/components/kitchen-tool/illustrations";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

interface QuestionOption {
  value: string;
  labelAr: string;
  labelEn: string;
  Illustration: (props: { className?: string }) => JSX.Element;
}

interface Question {
  key: keyof KitchenAnswers;
  titleAr: string;
  titleEn: string;
  hintAr: string;
  hintEn: string;
  options: QuestionOption[];
}

const questions: Question[] = [
  {
    key: "ovenPlacement",
    titleAr: "أين تفضّل وضع الفرن؟",
    titleEn: "Where do you prefer the oven?",
    hintAr: "يمكنك تخطي السؤال إذا لم تحسم رأيك بعد",
    hintEn: "You can skip if you haven't decided yet",
    options: [
      { value: "under_counter", labelAr: "تحت سطح العمل", labelEn: "Under the Counter", Illustration: OvenUnderCounterIllustration },
      { value: "tall_cabinet", labelAr: "في خزانة عالية", labelEn: "In a Tall Cabinet", Illustration: OvenTallCabinetIllustration },
    ],
  },
  {
    key: "hoodType",
    titleAr: "ما نوع الشفاط المفضل لديك؟",
    titleEn: "What hood type do you prefer?",
    hintAr: "يمكنك تخطي السؤال إذا لم تحسم رأيك بعد",
    hintEn: "You can skip if you haven't decided yet",
    options: [
      { value: "wall", labelAr: "شفاط جداري", labelEn: "Wall-Mounted Hood", Illustration: HoodWallIllustration },
      { value: "integrated", labelAr: "شفاط مدمج", labelEn: "Integrated Hood", Illustration: HoodIntegratedIllustration },
    ],
  },
  {
    key: "fridgeType",
    titleAr: "ما نوع الثلاجة في مطبخك؟",
    titleEn: "What fridge type is in your kitchen?",
    hintAr: "يمكنك تخطي السؤال إذا لم تحسم رأيك بعد",
    hintEn: "You can skip if you haven't decided yet",
    options: [
      { value: "freestanding", labelAr: "قائمة بذاتها", labelEn: "Freestanding", Illustration: FridgeFreestandingIllustration },
      { value: "integrated", labelAr: "مدمجة", labelEn: "Integrated", Illustration: FridgeIntegratedIllustration },
    ],
  },
  {
    key: "layout",
    titleAr: "ما شكل توزيع مطبخك؟",
    titleEn: "What is your kitchen layout?",
    hintAr: "اختر الشكل الأقرب لمساحة مطبخك",
    hintEn: "Choose the shape closest to your kitchen space",
    options: [
      { value: "I", labelAr: "حرف I", labelEn: "I-Shape", Illustration: LayoutIIllustration },
      { value: "L", labelAr: "حرف L", labelEn: "L-Shape", Illustration: LayoutLIllustration },
      { value: "U", labelAr: "حرف U", labelEn: "U-Shape", Illustration: LayoutUIllustration },
      { value: "parallel", labelAr: "على الجانبين", labelEn: "Galley (Two Sides)", Illustration: LayoutParallelIllustration },
    ],
  },
];

export default function KitchenToolSetupPage() {
  const { t, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const { answers, step, closed, setAnswer, setStep, setClosed } = useKitchenToolStore();

  const numericStep = Number.isFinite(step) ? Math.trunc(step) : 0;
  const safeStep = Math.min(Math.max(numericStep, 0), questions.length - 1);
  const question = questions[safeStep];
  const selected = answers[question.key];
  const progress = ((safeStep + 1) / questions.length) * 100;
  const isLast = safeStep === questions.length - 1;

  const goNext = () => {
    if (isLast) {
      setLocation("/kitchen-designer/dimensions");
    } else {
      setStep(safeStep + 1);
    }
  };

  const goBack = () => {
    if (safeStep === 0) {
      setLocation("/kitchen-designer");
    } else {
      setStep(safeStep - 1);
    }
  };

  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;

  return (
    <DesktopGate>
      <div className="min-h-screen bg-background flex flex-col">
        <nav className="border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="/kitchen-designer" data-testid="link-setup-logo">
              <img src={teakLogo} alt="Teak" className="h-10 w-auto object-contain logo-auto" />
            </a>
            <a href="/" data-testid="link-setup-home">
              <Button variant="ghost" size="sm">
                <Home className="w-4 h-4 me-2" />
                {t("الرئيسية", "Home")}
              </Button>
            </a>
          </div>
        </nav>

        <div className="max-w-5xl mx-auto w-full px-6 pt-6">
          <div className="mb-6">
            <ToolStages current="questions" />
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-primary" data-testid="text-setup-step">
              {t(`السؤال ${safeStep + 1} من ${questions.length}`, `Question ${safeStep + 1} of ${questions.length}`)}
            </span>
            <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden" data-testid="progress-setup">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={safeStep}
              initial={{ opacity: 0, x: isRTL ? -40 : 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isRTL ? 40 : -40 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-4xl text-center"
            >
              <h1 className="text-3xl xl:text-4xl font-bold mb-3" data-testid="text-setup-question">
                {t(question.titleAr, question.titleEn)}
              </h1>
              <p className="text-muted-foreground mb-10">{t(question.hintAr, question.hintEn)}</p>

              <div
                className={`grid gap-6 mx-auto ${
                  question.options.length > 2 ? "grid-cols-2 xl:grid-cols-4 max-w-4xl" : "grid-cols-2 max-w-2xl"
                }`}
              >
                {question.options.map((opt) => {
                  const isSelected = selected === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() =>
                        setAnswer(question.key, (isSelected ? null : opt.value) as never)
                      }
                      className={`group relative rounded-xl border-2 p-6 transition-all text-center bg-card hover:shadow-lg ${
                        isSelected
                          ? "border-primary shadow-lg shadow-primary/10"
                          : "border-border hover:border-primary/40"
                      }`}
                      data-testid={`card-option-${question.key}-${opt.value}`}
                    >
                      {isSelected && (
                        <div className="absolute top-3 end-3 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-4 h-4 text-primary-foreground" />
                        </div>
                      )}
                      <opt.Illustration
                        className={`w-full max-w-[140px] mx-auto mb-4 transition-colors ${
                          isSelected ? "text-primary" : "text-muted-foreground group-hover:text-primary/70"
                        }`}
                      />
                      <span className={`block text-lg font-bold ${isSelected ? "text-primary" : ""}`}>
                        {t(opt.labelAr, opt.labelEn)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {question.key === "layout" &&
                canCloseLayout((selected ?? "") as KitchenLayout) && (
                  <label
                    className="mt-8 inline-flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 cursor-pointer hover:border-primary/40 transition-colors"
                    data-testid="toggle-close-room"
                  >
                    <input
                      type="checkbox"
                      checked={closed}
                      onChange={(e) => setClosed(e.target.checked)}
                      className="w-4 h-4 accent-primary"
                      data-testid="checkbox-close-room"
                    />
                    <span className="text-sm font-bold">
                      {t("أغلق الغرفة بالكامل", "Fully close the room")}
                    </span>
                  </label>
                )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="border-t border-border/50 bg-background">
          <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
            <Button variant="outline" size="lg" onClick={goBack} className="font-bold min-w-[130px]" data-testid="button-setup-back">
              <BackIcon className="w-4 h-4 me-1" />
              {t("السابق", "Back")}
            </Button>
            <Button
              variant="ghost"
              onClick={goNext}
              className="text-muted-foreground"
              data-testid="button-setup-skip"
            >
              <SkipForward className="w-4 h-4 me-2 rtl:rotate-180" />
              {t("تخطي", "Skip")}
            </Button>
            <Button size="lg" onClick={goNext} className="font-bold min-w-[130px]" data-testid="button-setup-next">
              {isLast ? t("إنهاء", "Finish") : t("التالي", "Next")}
              <NextIcon className="w-4 h-4 ms-1" />
            </Button>
          </div>
        </div>
      </div>
    </DesktopGate>
  );
}
