import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/components/language-provider";
import {
  Sun,
  Moon,
  Globe,
  Factory,
  Users,
  ClipboardCheck,
  BarChart3,
  Settings,
  ChevronDown,
  CheckCircle2,
  Clock,
  Circle,
  ArrowUp,
  Menu,
  X,
  Cpu,
  Shield,
  Zap,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import logoEN from "@assets/logo_teak2_1772689894105.png";
import logoAR from "@assets/logo_teak1_1772689915503.png";

const OVERALL_PROGRESS = 40;

interface Phase {
  id: number;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  progress: number;
  icon: React.ReactNode;
  status: "completed" | "in-progress" | "upcoming";
  featuresAr: string[];
  featuresEn: string[];
}

const phases: Phase[] = [
  {
    id: 1,
    titleAr: "الموقع الخارجي",
    titleEn: "Public Website",
    descAr: "واجهة العملاء الرئيسية مع عرض المنتجات ومعرض الأعمال وحجز المواعيد",
    descEn: "Customer-facing interface with product showcase, portfolio gallery and appointment booking",
    progress: 85,
    icon: <Globe className="w-6 h-6" />,
    status: "in-progress",
    featuresAr: ["الصفحة الرئيسية", "عرض المنتجات", "معرض الأعمال", "حجز موعد معاينة", "طلب عرض سعر", "تتبع حالة الطلب"],
    featuresEn: ["Homepage", "Product Showcase", "Portfolio Gallery", "Site Visit Booking", "Quote Request", "Order Tracking"],
  },
  {
    id: 2,
    titleAr: "نظام إدارة العملاء",
    titleEn: "CRM System",
    descAr: "إدارة شاملة للعملاء والزيارات والتصاميم وعروض الأسعار",
    descEn: "Complete customer management with visits, designs, and quotation handling",
    progress: 55,
    icon: <Users className="w-6 h-6" />,
    status: "in-progress",
    featuresAr: ["ملف العميل", "تسجيل الزيارات", "إدخال المقاسات", "رفع التصاميم", "إنشاء عروض الأسعار", "اعتماد العروض"],
    featuresEn: ["Customer Profile", "Visit Logging", "Measurements Entry", "Design Upload", "Quotation Creation", "Quote Approval"],
  },
  {
    id: 3,
    titleAr: "نظام إدارة التصنيع",
    titleEn: "Factory Operations",
    descAr: "تتبع مراحل الإنتاج وإدارة المواد الخام وفحص الجودة",
    descEn: "Production stage tracking, raw material management, and quality inspection",
    progress: 30,
    icon: <Factory className="w-6 h-6" />,
    status: "in-progress",
    featuresAr: ["استلام الطلبات", "مراحل الإنتاج", "تتبع التقدم", "إدارة المواد", "فحص الجودة", "الشحن والتسليم"],
    featuresEn: ["Order Reception", "Production Stages", "Progress Tracking", "Material Management", "Quality Check", "Shipping & Delivery"],
  },
  {
    id: 4,
    titleAr: "النظام المالي",
    titleEn: "Financial System",
    descAr: "إدارة الفواتير والمدفوعات وحساب التكاليف وهوامش الربح",
    descEn: "Invoice management, payments, cost calculation, and profit margins",
    progress: 15,
    icon: <BarChart3 className="w-6 h-6" />,
    status: "upcoming",
    featuresAr: ["عروض الأسعار", "الفواتير", "المدفوعات", "تكلفة المواد", "تكلفة العمالة", "تقارير مالية"],
    featuresEn: ["Quotations", "Invoices", "Payments", "Material Costs", "Labor Costs", "Financial Reports"],
  },
  {
    id: 5,
    titleAr: "لوحة الإدارة العليا",
    titleEn: "Admin Dashboard",
    descAr: "تقارير شاملة ومؤشرات الأداء وإدارة الفروع والمستخدمين",
    descEn: "Comprehensive reports, KPIs, branch and user management",
    progress: 10,
    icon: <Settings className="w-6 h-6" />,
    status: "upcoming",
    featuresAr: ["إدارة الفروع", "إدارة المستخدمين", "تقارير المبيعات", "تقارير الإنتاج", "مؤشرات الأداء", "إحصائيات شاملة"],
    featuresEn: ["Branch Management", "User Management", "Sales Reports", "Production Reports", "KPIs", "Comprehensive Stats"],
  },
];

const operationalCycle = {
  ar: [
    "تسجيل عميل",
    "إدخال مقاسات",
    "تصميم",
    "عرض سعر",
    "اعتماد",
    "تحويل للمصنع",
    "تصنيع",
    "فحص جودة",
    "شحن",
    "تركيب",
    "تحصيل نهائي",
    "تقييم",
  ],
  en: [
    "Client Registration",
    "Measurements",
    "Design",
    "Quotation",
    "Approval",
    "Factory Transfer",
    "Manufacturing",
    "Quality Check",
    "Shipping",
    "Installation",
    "Final Payment",
    "Evaluation",
  ],
};

function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { lang, toggleLang, t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentLogo = lang === "ar" ? logoAR : logoEN;

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/50"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16 sm:h-20">
          <div className="flex items-center gap-3">
            <img
              src={currentLogo}
              alt="Teak Logo"
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
              data-testid="img-logo"
            />
            <div className="flex flex-col">
              <span className="text-lg sm:text-xl font-bold leading-tight" data-testid="text-brand-name">
                {t("تيك للتصنيع", "Teak Manufacturing")}
              </span>
              <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight hidden sm:block">
                {t(
                  "Manufacturing • CRM • Project Management",
                  "Manufacturing • CRM • Project Management"
                )}
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1">
            <a
              href="#phases"
              className="px-3 py-2 text-sm font-medium text-muted-foreground"
              data-testid="link-phases"
            >
              {t("مراحل المشروع", "Project Phases")}
            </a>
            <a
              href="#workflow"
              className="px-3 py-2 text-sm font-medium text-muted-foreground"
              data-testid="link-workflow"
            >
              {t("سير العمل", "Workflow")}
            </a>
            <a
              href="#features"
              className="px-3 py-2 text-sm font-medium text-muted-foreground"
              data-testid="link-features"
            >
              {t("المميزات", "Features")}
            </a>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleLang}
              data-testid="button-language-toggle"
              aria-label={t("تبديل اللغة إلى الإنجليزية", "Switch language to Arabic")}
            >
              <span className="text-xs font-bold">{lang === "ar" ? "EN" : "ع"}</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
              aria-label={t("تبديل إلى الوضع الفاتح", "Toggle to dark mode")}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              data-testid="button-mobile-menu"
              aria-label={t("القائمة", "Menu")}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border"
          >
            <div className="px-4 py-4 flex flex-col gap-2">
              <a
                href="#phases"
                onClick={() => setMobileOpen(false)}
                className="px-4 py-3 text-sm font-medium rounded-md"
                data-testid="link-phases-mobile"
              >
                {t("مراحل المشروع", "Project Phases")}
              </a>
              <a
                href="#workflow"
                onClick={() => setMobileOpen(false)}
                className="px-4 py-3 text-sm font-medium rounded-md"
                data-testid="link-workflow-mobile"
              >
                {t("سير العمل", "Workflow")}
              </a>
              <a
                href="#features"
                onClick={() => setMobileOpen(false)}
                className="px-4 py-3 text-sm font-medium rounded-md"
                data-testid="link-features-mobile"
              >
                {t("المميزات", "Features")}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

function HeroSection() {
  const { lang, t } = useLanguage();
  const currentLogo = lang === "ar" ? logoAR : logoEN;

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-primary/20 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.6, 0.2],
            }}
            transition={{
              duration: 3 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 3,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-8"
        >
          <img
            src={currentLogo}
            alt="Teak Manufacturing Logo"
            className="w-24 h-24 sm:w-32 sm:h-32 lg:w-40 lg:h-40 mx-auto object-contain drop-shadow-2xl"
            data-testid="img-hero-logo"
          />
        </motion.div>

        <motion.h1
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black mb-4 tracking-tight"
          data-testid="text-hero-title"
        >
          {t("تيك للتصنيع", "Teak Manufacturing")}
        </motion.h1>

        <motion.p
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="text-lg sm:text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed"
          data-testid="text-hero-subtitle"
        >
          {t(
            "منصة متكاملة لإدارة التصنيع والعملاء والمشاريع",
            "Integrated Manufacturing, CRM & Project Management Platform"
          )}
        </motion.p>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-4 items-center justify-center mb-16"
        >
          <div className="w-full max-w-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">
                {t("تقدم المشروع الكلي", "Overall Project Progress")}
              </span>
              <span className="text-sm font-bold text-primary" data-testid="text-progress-percent">
                {OVERALL_PROGRESS}%
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden" data-testid="progress-overall">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${OVERALL_PROGRESS}%` }}
                transition={{ duration: 1.5, delay: 0.8, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="flex justify-center"
        >
          <a href="#phases" data-testid="link-scroll-down">
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-muted-foreground"
            >
              <ChevronDown className="w-8 h-8" />
            </motion.div>
          </a>
        </motion.div>
      </div>
    </section>
  );
}

function PhaseCard({ phase, index }: { phase: Phase; index: number }) {
  const { t, isRTL } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  const statusConfig = {
    completed: {
      icon: <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-green-400" />,
      labelAr: "مكتمل",
      labelEn: "Completed",
      badgeClass: "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20",
    },
    "in-progress": {
      icon: <Clock className="w-5 h-5 text-primary" />,
      labelAr: "قيد التطوير",
      labelEn: "In Progress",
      badgeClass: "bg-primary/10 text-primary border border-primary/20",
    },
    upcoming: {
      icon: <Circle className="w-5 h-5 text-muted-foreground" />,
      labelAr: "قادم",
      labelEn: "Upcoming",
      badgeClass: "bg-muted text-muted-foreground border border-border",
    },
  };

  const config = statusConfig[phase.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="relative"
    >
      <div className="flex gap-4 sm:gap-6">
        <div className="flex flex-col items-center">
          <div
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${
              phase.status === "in-progress"
                ? "border-primary bg-primary/10 text-primary"
                : phase.status === "completed"
                ? "border-green-500 bg-green-500/10 text-green-500 dark:border-green-400 dark:text-green-400"
                : "border-border bg-muted text-muted-foreground"
            }`}
            data-testid={`icon-phase-${phase.id}`}
          >
            {phase.icon}
          </div>
          {index < phases.length - 1 && (
            <div className="w-0.5 flex-1 min-h-[24px] bg-border mt-3" />
          )}
        </div>

        <div className="flex-1 pb-10">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-lg sm:text-xl font-bold" data-testid={`text-phase-title-${phase.id}`}>
                    {t(phase.titleAr, phase.titleEn)}
                  </h3>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${config.badgeClass}`}
                    data-testid={`badge-phase-status-${phase.id}`}
                  >
                    {t(config.labelAr, config.labelEn)}
                  </span>
                </div>
                <span className="text-sm font-bold text-primary" data-testid={`text-phase-progress-${phase.id}`}>
                  {phase.progress}%
                </span>
              </div>

              <p className="text-sm text-muted-foreground mb-4 leading-relaxed" data-testid={`text-phase-desc-${phase.id}`}>
                {t(phase.descAr, phase.descEn)}
              </p>

              <div className="mb-4">
                <div className="h-2 bg-muted rounded-full overflow-hidden" data-testid={`progress-phase-${phase.id}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${phase.progress}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className={`h-full rounded-full ${
                      phase.status === "completed"
                        ? "bg-green-500 dark:bg-green-400"
                        : phase.status === "in-progress"
                        ? "bg-gradient-to-r from-primary to-primary/60"
                        : "bg-muted-foreground/30"
                    }`}
                  />
                </div>
              </div>

              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs font-medium text-primary"
                data-testid={`button-expand-phase-${phase.id}`}
                aria-expanded={expanded}
                aria-controls={`phase-details-${phase.id}`}
              >
                {t(expanded ? "إخفاء التفاصيل" : "عرض التفاصيل", expanded ? "Hide Details" : "View Details")}
                <motion.div animate={{ rotate: expanded ? 180 : 0 }}>
                  <ChevronDown className="w-3.5 h-3.5" />
                </motion.div>
              </button>

              <AnimatePresence>
                {expanded && (
                  <motion.div
                    id={`phase-details-${phase.id}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 pt-4 border-t border-border">
                      {(isRTL ? phase.featuresAr : phase.featuresEn).map((feature, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                          data-testid={`text-feature-${phase.id}-${i}`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            phase.progress > (i / phase.featuresAr.length) * 100
                              ? "bg-primary"
                              : "bg-border"
                          }`} />
                          {feature}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}

function PhasesSection() {
  const { t } = useLanguage();

  return (
    <section id="phases" className="py-20 sm:py-28 relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-3 py-1 text-xs font-medium text-primary bg-primary/10 rounded-full border border-primary/20 mb-4">
            {t("خارطة الطريق", "Roadmap")}
          </span>
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4"
            data-testid="text-phases-heading"
          >
            {t("مراحل بناء المشروع", "Project Development Phases")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t(
              "نعمل على بناء منصة متكاملة عبر خمس مراحل رئيسية",
              "Building an integrated platform through five key phases"
            )}
          </p>
        </motion.div>

        <div className="relative">
          {phases.map((phase, i) => (
            <PhaseCard key={phase.id} phase={phase} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  const { t, isRTL } = useLanguage();
  const steps = isRTL ? operationalCycle.ar : operationalCycle.en;
  const completedSteps = 5;

  return (
    <section id="workflow" className="py-20 sm:py-28 bg-card/50 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-3 py-1 text-xs font-medium text-primary bg-primary/10 rounded-full border border-primary/20 mb-4">
            {t("العمليات", "Operations")}
          </span>
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4"
            data-testid="text-workflow-heading"
          >
            {t("السايكل التشغيلي", "Operational Cycle")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t(
              "دورة العمل الكاملة من التسجيل حتى التقييم",
              "Complete workflow from registration to evaluation"
            )}
          </p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {steps.map((step, i) => {
            const isCompleted = i < completedSteps;
            const isCurrent = i === completedSteps;

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                data-testid={`card-workflow-step-${i}`}
              >
                <Card className={`h-full ${
                    isCompleted
                      ? "bg-primary/5 border-primary/20"
                      : isCurrent
                      ? "bg-primary/10 border-primary/40 ring-2 ring-primary/20"
                      : ""
                  }`}>
                  <CardContent className="flex flex-col items-center text-center p-4">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center mb-3 text-sm font-bold ${
                        isCompleted
                          ? "bg-primary text-primary-foreground"
                          : isCurrent
                          ? "bg-primary/20 text-primary border-2 border-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <span>{i + 1}</span>
                      )}
                    </div>
                    <span
                      className={`text-xs sm:text-sm font-medium leading-tight ${
                        isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {step}
                    </span>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const { t } = useLanguage();

  const features = [
    {
      icon: <Layers className="w-7 h-7" />,
      titleAr: "نظام متكامل",
      titleEn: "Integrated System",
      descAr: "ربط جميع الأنظمة في منصة واحدة متكاملة",
      descEn: "Connect all systems in one integrated platform",
    },
    {
      icon: <Shield className="w-7 h-7" />,
      titleAr: "أمان متقدم",
      titleEn: "Advanced Security",
      descAr: "نظام صلاحيات متقدم مع سجل عمليات شامل",
      descEn: "Advanced RBAC with comprehensive audit logging",
    },
    {
      icon: <Cpu className="w-7 h-7" />,
      titleAr: "أتمتة ذكية",
      titleEn: "Smart Automation",
      descAr: "أتمتة العمليات التشغيلية وتقليل الأخطاء",
      descEn: "Automate operations and reduce human errors",
    },
    {
      icon: <Zap className="w-7 h-7" />,
      titleAr: "أداء فائق",
      titleEn: "High Performance",
      descAr: "تطبيق سريع متجاوب يعمل على جميع الأجهزة",
      descEn: "Fast responsive PWA that works on all devices",
    },
  ];

  return (
    <section id="features" className="py-20 sm:py-28 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-3 py-1 text-xs font-medium text-primary bg-primary/10 rounded-full border border-primary/20 mb-4">
            {t("المميزات", "Features")}
          </span>
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4"
            data-testid="text-features-heading"
          >
            {t("لماذا تيك للتصنيع؟", "Why Teak Manufacturing?")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t(
              "منصة مصممة خصيصاً لقطاع التصنيع والتركيب",
              "A platform designed specifically for the manufacturing & installation industry"
            )}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              data-testid={`card-feature-${i}`}
            >
              <Card className="h-full">
                <CardContent className="p-6 sm:p-8">
                  <div className="w-14 h-14 rounded-md bg-primary/10 flex items-center justify-center text-primary mb-5">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-2" data-testid={`text-feature-title-${i}`}>
                    {t(feature.titleAr, feature.titleEn)}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {t(feature.descAr, feature.descEn)}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function UserTypesSection() {
  const { t } = useLanguage();

  const userTypes = [
    { ar: "عميل", en: "Client", icon: <Users className="w-5 h-5" /> },
    { ar: "بائع", en: "Sales Rep", icon: <ClipboardCheck className="w-5 h-5" /> },
    { ar: "مصمم", en: "Designer", icon: <Layers className="w-5 h-5" /> },
    { ar: "مدير فرع", en: "Branch Manager", icon: <Settings className="w-5 h-5" /> },
    { ar: "مدير مصنع", en: "Factory Manager", icon: <Factory className="w-5 h-5" /> },
    { ar: "فني إنتاج", en: "Production Tech", icon: <Cpu className="w-5 h-5" /> },
    { ar: "محاسب", en: "Accountant", icon: <BarChart3 className="w-5 h-5" /> },
    { ar: "مدير عام", en: "General Manager", icon: <Shield className="w-5 h-5" /> },
  ];

  return (
    <section className="py-20 sm:py-28 bg-card/50 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-3 py-1 text-xs font-medium text-primary bg-primary/10 rounded-full border border-primary/20 mb-4">
            {t("المستخدمون", "Users")}
          </span>
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4"
            data-testid="text-users-heading"
          >
            {t("أنواع المستخدمين", "User Types")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t(
              "نظام صلاحيات متقدم يدعم جميع أدوار الفريق",
              "Advanced permissions system supporting all team roles"
            )}
          </p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {userTypes.map((user, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              data-testid={`card-user-type-${i}`}
            >
              <Card className="h-full">
                <CardContent className="p-4 sm:p-5 text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-3">
                    {user.icon}
                  </div>
                  <span className="text-sm font-bold">{t(user.ar, user.en)}</span>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { lang, t } = useLanguage();
  const currentLogo = lang === "ar" ? logoAR : logoEN;

  return (
    <footer className="border-t border-border bg-card/30 py-12 sm:py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img
              src={currentLogo}
              alt="Teak Logo"
              className="w-10 h-10 object-contain"
              data-testid="img-footer-logo"
            />
            <div>
              <span className="text-lg font-bold" data-testid="text-footer-brand">
                {t("تيك للتصنيع", "Teak Manufacturing")}
              </span>
              <p className="text-xs text-muted-foreground">
                Manufacturing + CRM + Project Management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span data-testid="text-footer-progress">
              {t("تقدم المشروع", "Project Progress")}: {OVERALL_PROGRESS}%
            </span>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border text-center">
          <p className="text-xs text-muted-foreground" data-testid="text-copyright">
            {t(
              `© ${new Date().getFullYear()} تيك للتصنيع. جميع الحقوق محفوظة.`,
              `© ${new Date().getFullYear()} Teak Manufacturing. All rights reserved.`
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}

function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg"
          data-testid="button-scroll-top"
        >
          <ArrowUp className="w-4 h-4" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <PhasesSection />
      <WorkflowSection />
      <FeaturesSection />
      <UserTypesSection />
      <Footer />
      <ScrollToTop />
    </div>
  );
}
