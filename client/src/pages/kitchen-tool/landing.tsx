import { motion } from "framer-motion";
import { ChefHat, Ruler, Boxes, Sparkles, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import DesktopGate from "@/components/kitchen-tool/desktop-gate";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

function KitchenHeroArt() {
  return (
    <svg viewBox="0 0 400 260" className="w-full h-auto text-primary" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="20" y="30" width="110" height="70" rx="4" opacity="0.7" />
      <line x1="75" y1="30" x2="75" y2="100" opacity="0.7" />
      <rect x="150" y="10" width="60" height="90" rx="4" opacity="0.5" />
      <path d="M 250 100 L 330 100 L 305 60 L 275 60 Z" opacity="0.8" />
      <rect x="283" y="20" width="14" height="40" opacity="0.8" />
      <line x1="10" y1="150" x2="390" y2="150" strokeWidth="6" />
      <rect x="20" y="160" width="90" height="80" rx="4" opacity="0.7" />
      <rect x="30" y="175" width="70" height="24" rx="2" opacity="0.7" />
      <rect x="30" y="207" width="70" height="24" rx="2" opacity="0.7" />
      <rect x="130" y="160" width="120" height="80" rx="4" />
      <line x1="136" y1="172" x2="244" y2="172" />
      <rect x="150" y="182" width="80" height="46" rx="3" />
      <circle cx="145" cy="167" r="2" fill="currentColor" />
      <circle cx="157" cy="167" r="2" fill="currentColor" />
      <circle cx="169" cy="167" r="2" fill="currentColor" />
      <rect x="270" y="160" width="110" height="80" rx="4" opacity="0.7" />
      <line x1="325" y1="160" x2="325" y2="240" opacity="0.7" />
      <circle cx="200" cy="135" r="9" opacity="0.6" />
      <circle cx="230" cy="135" r="9" opacity="0.6" />
    </svg>
  );
}

export default function KitchenToolLandingPage() {
  const { t } = useLanguage();

  const features = [
    {
      icon: Ruler,
      titleAr: "أبعاد دقيقة",
      titleEn: "Precise Dimensions",
      descAr: "أدخل مقاسات مطبخك الحقيقية وشاهد التصميم يتشكّل أمامك بدقة هندسية.",
      descEn: "Enter your real kitchen measurements and watch the design take shape with engineering precision.",
    },
    {
      icon: Boxes,
      titleAr: "خزائن تيك الأصلية",
      titleEn: "Genuine Teak Cabinets",
      descAr: "اختر من مكتبة منتجات تيك المصنّعة محلياً بجودة سعودية عالية.",
      descEn: "Choose from Teak's locally manufactured product library with premium Saudi quality.",
    },
    {
      icon: Sparkles,
      titleAr: "تصميم ثلاثي الأبعاد",
      titleEn: "3D Visualization",
      descAr: "تجوّل داخل مطبخك قبل تنفيذه واطلب عرض سعر فوري لتصميمك.",
      descEn: "Walk through your kitchen before it's built and request an instant quote for your design.",
    },
  ];

  return (
    <DesktopGate>
      <div className="min-h-screen bg-background">
        <nav className="fixed top-0 inset-x-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3" data-testid="link-kitchen-logo-home">
              <img src={teakLogo} alt="Teak" className="h-11 w-auto object-contain logo-auto" />
            </a>
            <a href="/" data-testid="link-kitchen-back-home">
              <Button variant="ghost" className="font-medium">
                <Home className="w-4 h-4 me-2" />
                {t("العودة للرئيسية", "Back to Home")}
              </Button>
            </a>
          </div>
        </nav>

        <section className="pt-32 pb-20 px-6 relative overflow-hidden">
          <div className="absolute top-0 start-0 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl -translate-y-1/2" />
          <div className="absolute bottom-0 end-0 w-[400px] h-[400px] rounded-full bg-primary/5 blur-3xl translate-y-1/2" />
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center relative">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-bold mb-6" data-testid="badge-kitchen-innovation">
                <ChefHat className="w-4 h-4" />
                {t("ابتكار من تيك للتصنيع", "A Teak Manufacturing Innovation")}
              </div>
              <h1 className="text-4xl xl:text-5xl font-bold leading-tight mb-6" data-testid="text-kitchen-hero-title">
                {t("أداة تيك لتصميم المطابخ", "Teak Kitchen Design Tool")}
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed mb-4" data-testid="text-kitchen-hero-subtitle">
                {t(
                  "صمّم مطبخ أحلامك بنفسك في دقائق. أجب عن أسئلة بسيطة، أدخل مقاساتك، وشاهد مطبخك يتحوّل إلى واقع ثلاثي الأبعاد بخزائن تيك الأصلية.",
                  "Design your dream kitchen yourself in minutes. Answer simple questions, enter your measurements, and watch your kitchen come to life in 3D with genuine Teak cabinets."
                )}
              </p>
              <p className="text-muted-foreground leading-relaxed mb-8">
                {t(
                  "من المصنع إلى منزلك — جودة سعودية، تصميم بين يديك.",
                  "From our factory to your home — Saudi quality, design in your hands."
                )}
              </p>
              <a href="/kitchen-designer/setup" data-testid="link-kitchen-cta">
                <Button size="lg" className="text-lg font-bold px-10 h-14 shadow-lg shadow-primary/25">
                  {t("صمّم وأبدع", "Design & Create")}
                  <ArrowLeft className="w-5 h-5 ms-2 rtl:rotate-0 ltr:rotate-180" />
                </Button>
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.15 }}
              className="rounded-2xl border border-border bg-card p-10 shadow-xl"
              data-testid="img-kitchen-hero-art"
            >
              <KitchenHeroArt />
              <p className="text-center text-sm text-muted-foreground mt-6">
                {t("معاينة توضيحية — التصميم الفعلي ثلاثي الأبعاد", "Illustrative preview — actual design is in 3D")}
              </p>
            </motion.div>
          </div>
        </section>

        <section className="py-20 px-6 bg-card/50 border-t border-border/50">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-14" data-testid="text-kitchen-features-title">
              {t("لماذا تصمّم مع تيك؟", "Why Design with Teak?")}
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {features.map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="rounded-xl border border-border bg-background p-8 text-center"
                  data-testid={`card-kitchen-feature-${i}`}
                >
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
                    <f.icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{t(f.titleAr, f.titleEn)}</h3>
                  <p className="text-muted-foreground leading-relaxed">{t(f.descAr, f.descEn)}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 px-6 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-4" data-testid="text-kitchen-bottom-cta-title">
              {t("جاهز تبدأ؟", "Ready to Start?")}
            </h2>
            <p className="text-muted-foreground mb-8">
              {t(
                "أربع خطوات بسيطة تفصلك عن تصميم مطبخك المثالي.",
                "Four simple steps separate you from your perfect kitchen design."
              )}
            </p>
            <a href="/kitchen-designer/setup" data-testid="link-kitchen-cta-bottom">
              <Button size="lg" className="text-lg font-bold px-10 h-14">
                {t("صمّم وأبدع", "Design & Create")}
              </Button>
            </a>
          </div>
        </section>
      </div>
    </DesktopGate>
  );
}
