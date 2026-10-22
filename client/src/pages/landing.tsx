import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useTheme } from "@/components/theme-provider";
import { useLanguage, LanguageToggle } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import {
  Sun,
  Moon,
  ArrowUp,
  Menu,
  X,
  Phone,
  Mail,
  MapPin,
  Award,
  Users,
  Package,
  Clock,
  Shield,
  MessageCircle,
  Factory,
  Store,
  Building2,
  Lock,
  Fingerprint,
  Calculator,
  ChefHat,
  ArrowLeft,
  Images,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

import imgKitchenGrayTeak from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_(1)_1774689872332.jpeg";
import imgKitchenWarmTeak from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_(2)_1774689872333.jpeg";
import imgKitchenLightWood from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_(3)_1774689872333.jpeg";
import imgKitchenWhiteGlossy from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_(4)_1774691363250.jpeg";
import imgKitchenVelvetChairs from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_(5)_1774691363250.jpeg";
import imgKitchenTeakBrochure from "@assets/WhatsApp_Image_2026-03-28_at_10.47.59_AM_(2)_1774691363251.jpeg";
import imgKitchenGrayCloseup from "@assets/WhatsApp_Image_2026-03-28_at_10.47.59_AM_(3)_1774691363251.jpeg";
import imgKitchenDarkVelvetIsland from "@assets/WhatsApp_Image_2026-03-28_at_10.47.59_AM_(1)_1774691363251.jpeg";
import imgKitchenGrayIsland from "@assets/WhatsApp_Image_2026-03-28_at_10.47.59_AM_(4)_1774691363252.jpeg";
import imgTeakOvenUnit from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_1774691363250.jpeg";

import imgWalkInClosetEmpty from "@assets/WhatsApp_Image_2026-03-28_at_10.47.57_AM_(3)_1774689872331.jpeg";
import imgWalkInClosetClothes from "@assets/WhatsApp_Image_2026-03-28_at_10.47.57_AM_(4)_1774689872331.jpeg";
import imgWalkInClosetRobes from "@assets/WhatsApp_Image_2026-03-28_at_10.47.57_AM_(5)_1774689872331.jpeg";
import imgWardrobeFullRoom from "@assets/WhatsApp_Image_2026-03-28_at_10.48.02_AM_(1)_1774691415124.jpeg";

import imgWallGeometric from "@assets/WhatsApp_Image_2026-03-28_at_10.47.53_AM_1774689748826.jpeg";
import imgWallWhiteGeometric from "@assets/WhatsApp_Image_2026-03-28_at_10.47.54_AM_(4)_1774689748827.jpeg";
import imgStairRailing1 from "@assets/WhatsApp_Image_2026-03-28_at_10.47.53_AM_(2)_1774689748825.jpeg";
import imgStairRailing2 from "@assets/WhatsApp_Image_2026-03-28_at_10.47.53_AM_(4)_1774689748826.jpeg";
import imgTvUnitFireplace1 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.02_AM_(2)_1774691415124.jpeg";
import imgTvUnitFireplace2 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.02_AM_(3)_1774691415124.jpeg";
import imgSayyarShelf from "@assets/WhatsApp_Image_2026-03-28_at_10.48.01_AM_1774691415123.jpeg";

import imgHotelLobbySphereChandelier from "@assets/WhatsApp_Image_2026-03-28_at_10.47.54_AM_(5)_1774689748827.jpeg";
import imgHotelLobbySofasGoldWall from "@assets/WhatsApp_Image_2026-03-28_at_10.47.57_AM_1774689872332.jpeg";
import imgCafeGreenChairs1 from "@assets/WhatsApp_Image_2026-03-28_at_10.47.54_AM_(1)_1774689748826.jpeg";
import imgCafeGreenChairs2 from "@assets/WhatsApp_Image_2026-03-28_at_10.47.54_AM_(2)_1774689748827.jpeg";
import imgCommercialReception from "@assets/WhatsApp_Image_2026-03-28_at_10.47.54_AM_(3)_1774689748827.jpeg";
import imgVipOffice from "@assets/WhatsApp_Image_2026-03-28_at_10.47.57_AM_(2)_1774689872331.jpeg";
import imgSayyarDisplay from "@assets/WhatsApp_Image_2026-03-28_at_10.48.01_AM_(5)_1774691415123.jpeg";

type GalleryCategory = "kitchens" | "wardrobes" | "decor";

const galleryItems: {
  src: string;
  category: GalleryCategory;
  captionAr: string;
  captionEn: string;
}[] = [
  { src: imgKitchenGrayTeak, category: "kitchens", captionAr: "مطبخ رمادي وخشبي عصري", captionEn: "Modern Gray & Wood Kitchen" },
  { src: imgKitchenWarmTeak, category: "kitchens", captionAr: "مطبخ بألوان دافئة", captionEn: "Warm-Toned Kitchen" },
  { src: imgKitchenLightWood, category: "kitchens", captionAr: "مطبخ خشبي فاتح", captionEn: "Light Wood Kitchen" },
  { src: imgKitchenWhiteGlossy, category: "kitchens", captionAr: "مطبخ أبيض لامع", captionEn: "White Glossy Kitchen" },
  { src: imgKitchenVelvetChairs, category: "kitchens", captionAr: "مطبخ فاخر مع جلسة", captionEn: "Luxury Kitchen with Seating" },
  { src: imgKitchenDarkVelvetIsland, category: "kitchens", captionAr: "مطبخ بجزيرة وسطية داكنة", captionEn: "Kitchen with Dark Island" },
  { src: imgKitchenGrayIsland, category: "kitchens", captionAr: "مطبخ رمادي بجزيرة وسطية", captionEn: "Gray Kitchen with Island" },
  { src: imgTeakOvenUnit, category: "kitchens", captionAr: "وحدة مطبخ متكاملة - برج الأفران", captionEn: "Integrated Kitchen Unit - Oven Tower" },
  { src: imgKitchenTeakBrochure, category: "kitchens", captionAr: "من معرضنا - خميس مشيط", captionEn: "From Our Showroom - Khamis Mushait" },
  { src: imgKitchenGrayCloseup, category: "kitchens", captionAr: "تفاصيل التشطيب الراقي", captionEn: "Refined Finishing Details" },
  { src: imgWardrobeFullRoom, category: "wardrobes", captionAr: "خزانة مدمجة فاخرة مع إضاءة LED", captionEn: "Luxury Built-in Wardrobe with LED Lighting" },
  { src: imgWalkInClosetEmpty, category: "wardrobes", captionAr: "غرفة ملابس بإضاءة ذهبية", captionEn: "Walk-in Closet with Golden Lighting" },
  { src: imgWalkInClosetClothes, category: "wardrobes", captionAr: "غرفة ملابس فاخرة", captionEn: "Luxury Walk-in Closet" },
  { src: imgWalkInClosetRobes, category: "wardrobes", captionAr: "خزائن ملابس بتفصيل خاص", captionEn: "Custom Wardrobe Closets" },
  { src: imgWallGeometric, category: "decor", captionAr: "ديكور جداري هندسي", captionEn: "Geometric Wall Decoration" },
  { src: imgWallWhiteGeometric, category: "decor", captionAr: "ديكور جداري هندسي أبيض", captionEn: "White Geometric Wall Decoration" },
  { src: imgStairRailing1, category: "decor", captionAr: "درابزين درج فاخر بقضبان ذهبية", captionEn: "Luxury Stair Railing with Gold Bars" },
  { src: imgStairRailing2, category: "decor", captionAr: "درابزين درج - زاوية ثانية", captionEn: "Stair Railing - Second Angle" },
  { src: imgTvUnitFireplace1, category: "decor", captionAr: "ديكور صالة مع وحدة تلفزيون", captionEn: "Living Room Decor with TV Unit" },
  { src: imgTvUnitFireplace2, category: "decor", captionAr: "وحدة تلفزيون مع مدفأة", captionEn: "TV Unit with Fireplace" },
  { src: imgSayyarShelf, category: "decor", captionAr: "ديكورات معرض تجاري", captionEn: "Commercial Showroom Decor" },
];

const projectCards = [
  { image: imgHotelLobbySphereChandelier, titleAr: "لوبي فندقي - خميس مشيط", titleEn: "Hotel Lobby - Khamis Mushait" },
  { image: imgHotelLobbySofasGoldWall, titleAr: "ديكورات فندقية فاخرة", titleEn: "Luxury Hotel Decorations" },
  { image: imgCafeGreenChairs1, titleAr: "مشروع كافيه تجاري", titleEn: "Commercial Café Project" },
  { image: imgCafeGreenChairs2, titleAr: "مشروع كافيه - منطقة الاستقبال", titleEn: "Café Project - Reception Area" },
  { image: imgCommercialReception, titleAr: "مشروع استقبال تجاري", titleEn: "Commercial Reception Project" },
  { image: imgVipOffice, titleAr: "مكتب VIP فاخر", titleEn: "Luxury VIP Office" },
  { image: imgSayyarShelf, titleAr: "ديكورات معرض سيار", titleEn: "Sayyar Showroom Decorations" },
  { image: imgSayyarDisplay, titleAr: "تجهيزات معرض تجاري", titleEn: "Commercial Showroom Fittings" },
];

function FactoryHeroArt() {
  return (
    <svg
      viewBox="0 0 440 300"
      className="w-full h-auto text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Factory roofline */}
      <path d="M 20 90 L 20 55 L 60 30 L 60 55 L 100 30 L 100 55 L 140 30 L 140 90" opacity="0.45" />
      <rect x="30" y="62" width="16" height="14" rx="2" opacity="0.45" />
      <rect x="70" y="62" width="16" height="14" rx="2" opacity="0.45" />
      <rect x="110" y="62" width="16" height="14" rx="2" opacity="0.45" />
      {/* Wall cabinets */}
      <rect x="170" y="30" width="100" height="62" rx="4" opacity="0.7" />
      <line x1="220" y1="30" x2="220" y2="92" opacity="0.7" />
      <circle cx="212" cy="61" r="2.5" fill="currentColor" opacity="0.7" />
      <circle cx="228" cy="61" r="2.5" fill="currentColor" opacity="0.7" />
      <rect x="290" y="16" width="66" height="76" rx="4" opacity="0.5" />
      <line x1="290" y1="54" x2="356" y2="54" opacity="0.5" />
      {/* Hood */}
      <path d="M 380 92 L 428 92 L 414 56 L 394 56 Z" opacity="0.8" />
      <rect x="398" y="20" width="12" height="36" opacity="0.8" />
      {/* Countertop */}
      <line x1="10" y1="150" x2="430" y2="150" strokeWidth="6" />
      {/* Base cabinets: drawers */}
      <rect x="24" y="162" width="100" height="106" rx="4" opacity="0.7" />
      <rect x="34" y="176" width="80" height="26" rx="2" opacity="0.7" />
      <rect x="34" y="210" width="80" height="26" rx="2" opacity="0.7" />
      <rect x="34" y="244" width="80" height="16" rx="2" opacity="0.7" />
      {/* Oven unit */}
      <rect x="146" y="162" width="130" height="106" rx="4" />
      <line x1="153" y1="176" x2="269" y2="176" />
      <circle cx="162" cy="169" r="2" fill="currentColor" />
      <circle cx="174" cy="169" r="2" fill="currentColor" />
      <circle cx="186" cy="169" r="2" fill="currentColor" />
      <rect x="166" y="188" width="90" height="62" rx="3" />
      <path d="M 176 220 Q 211 200 246 220" opacity="0.6" />
      {/* Base cabinet unit */}
      <rect x="298" y="162" width="126" height="106" rx="4" opacity="0.7" />
      <line x1="361" y1="162" x2="361" y2="268" opacity="0.7" />
      <line x1="350" y1="200" x2="350" y2="230" opacity="0.7" />
      <line x1="372" y1="200" x2="372" y2="230" opacity="0.7" />
      {/* Cooktop */}
      <circle cx="200" cy="136" r="9" opacity="0.6" />
      <circle cx="232" cy="136" r="9" opacity="0.6" />
      {/* Faucet */}
      <path d="M 340 150 L 340 128 Q 340 118 350 118 L 358 118" opacity="0.6" />
      <line x1="358" y1="118" x2="358" y2="126" opacity="0.6" />
    </svg>
  );
}

function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { t, toggleLang, lang } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const { user } = useAuth();
  const canSeeV2 = !!user && ["owner", "it", "designer"].includes(user.role);

  const navLinks = [
    { href: "/kitchen-designer", labelAr: "صمّم مطبخك", labelEn: "Design Your Kitchen" },
    ...(canSeeV2
      ? [{ href: "/kitchen-designer-v2", labelAr: "تحت التطوير", labelEn: "Under Development" }]
      : []),
    { href: "#gallery", labelAr: "معرض أعمالنا", labelEn: "Our Gallery" },
    { href: "#projects", labelAr: "مشاريعنا", labelEn: "Projects" },
    { href: "#location", labelAr: "فروعنا", labelEn: "Branches" },
    { href: "#contact", labelAr: "تواصل معنا", labelEn: "Contact" },
  ];

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16 sm:h-20">
          <a href="/" className="flex items-center gap-3">
            <img
              src={teakLogo}
              alt="Teak Logo"
              className="h-12 sm:h-14 w-auto object-contain logo-auto transition-all duration-500"
              data-testid="img-logo"
            />
          </a>

          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid={`link-nav-${link.labelEn.toLowerCase().replace(/\s/g, "-")}`}
              >
                {t(link.labelAr, link.labelEn)}
              </a>
            ))}
            <a
              href="/portal/login"
              className="px-3 py-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors"
              data-testid="link-customer-portal"
            >
              {t("بوابة العملاء", "Customer Portal")}
            </a>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageToggle />
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
              aria-label={t("تبديل الوضع", "Toggle theme")}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden"
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
            className="lg:hidden bg-background/95 backdrop-blur-xl border-b border-border"
          >
            <div className="px-4 py-4 flex flex-col gap-2">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-3 text-sm font-medium rounded-md hover:bg-muted"
                  data-testid={`link-nav-${link.labelEn.toLowerCase().replace(/\s/g, "-")}-mobile`}
                >
                  {t(link.labelAr, link.labelEn)}
                </a>
              ))}
              <a
                href="/portal/login"
                onClick={() => setMobileOpen(false)}
                className="px-4 py-3 text-sm font-medium rounded-md hover:bg-muted text-primary"
                data-testid="link-customer-portal-mobile"
              >
                {t("بوابة العملاء", "Customer Portal")}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

function HeroSection() {
  const { t } = useLanguage();

  return (
    <section className="pt-28 sm:pt-36 pb-16 sm:pb-24 px-4 sm:px-6 relative overflow-hidden" data-testid="section-hero">
      <div className="absolute top-0 start-0 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl -translate-y-1/2" />
      <div className="absolute bottom-0 end-0 w-[400px] h-[400px] rounded-full bg-primary/5 blur-3xl translate-y-1/2" />
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center relative">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-bold mb-6"
            data-testid="badge-hero-factory"
          >
            <Factory className="w-4 h-4" />
            {t("مصنع تيك للصناعات الخشبية", "Teak Wood Products Factory")}
          </div>
          <h1
            className="text-4xl sm:text-5xl xl:text-6xl font-black leading-tight mb-6"
            data-testid="text-hero-title"
          >
            {t("تصميم مطابخ بجودة عالية", "Premium Kitchen Design")}
          </h1>
          <p
            className="text-lg sm:text-xl text-muted-foreground leading-relaxed mb-4"
            data-testid="text-hero-subtitle"
          >
            {t(
              "مطابخ فاخرة تُصنّع في مصنعنا بخميس مشيط من أجود أنواع الأخشاب والخامات — تصميم، تصنيع، وتركيب بأيدٍ سعودية ومعايير عالمية.",
              "Luxury kitchens crafted in our Khamis Mushait factory from the finest woods and materials — designed, manufactured, and installed by Saudi hands to world-class standards."
            )}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-8">
            {t(
              "من المصنع إلى منزلك — جودة تدوم، وتفاصيل تليق بك.",
              "From our factory to your home — lasting quality with details worthy of you."
            )}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href="/kitchen-designer" data-testid="link-hero-design-kitchen">
              <Button size="lg" className="w-full sm:w-auto text-base sm:text-lg font-bold px-8 h-14 shadow-lg shadow-primary/25 gap-2">
                <ChefHat className="w-5 h-5" />
                {t("صمّم مطبخك", "Design Your Kitchen")}
                <ArrowLeft className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
              </Button>
            </a>
            <a href="#gallery" data-testid="link-hero-gallery">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base sm:text-lg font-bold px-8 h-14 gap-2">
                <Images className="w-5 h-5" />
                {t("معرض أعمالنا", "Our Gallery")}
              </Button>
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="rounded-2xl border border-border bg-card p-8 sm:p-10 shadow-xl"
          data-testid="img-hero-art"
        >
          <FactoryHeroArt />
          <p className="text-center text-sm text-muted-foreground mt-6">
            {t("من مصنعنا... إلى مطبخك", "From our factory... to your kitchen")}
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let frame: number;
    const duration = 2000;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * value));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isInView, value]);

  return <span ref={ref}>{count}{suffix}</span>;
}

function GallerySection() {
  const { t } = useLanguage();
  const [activeCategory, setActiveCategory] = useState<GalleryCategory | "all">("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const categories: { id: GalleryCategory | "all"; labelAr: string; labelEn: string }[] = [
    { id: "all", labelAr: "الكل", labelEn: "All" },
    { id: "kitchens", labelAr: "المطابخ", labelEn: "Kitchens" },
    { id: "wardrobes", labelAr: "الخزائن", labelEn: "Wardrobes" },
    { id: "decor", labelAr: "الديكورات", labelEn: "Decorations" },
  ];

  const filtered = useMemo(
    () => (activeCategory === "all" ? galleryItems : galleryItems.filter((g) => g.category === activeCategory)),
    [activeCategory]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") setLightboxIndex((prev) => (prev !== null ? (prev + 1) % filtered.length : null));
      if (e.key === "ArrowLeft") setLightboxIndex((prev) => (prev !== null ? (prev - 1 + filtered.length) % filtered.length : null));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, filtered.length]);

  return (
    <section id="gallery" className="py-20 sm:py-28 bg-card/50" data-testid="section-gallery">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <span className="inline-block px-4 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full border border-primary/20 mb-4">
            {t("معرض أعمالنا", "Our Gallery")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" data-testid="text-gallery-heading">
            {t("معرض أعمالنا", "Our Gallery")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t(
              "مطابخ وخزائن وديكورات نُفّذت من أجود أنواع الأخشاب والخامات",
              "Kitchens, wardrobes, and decorations crafted from the finest woods and materials"
            )}
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-10">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                setLightboxIndex(null);
              }}
              className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all ${
                activeCategory === cat.id
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
              data-testid={`button-gallery-category-${cat.id}`}
            >
              {t(cat.labelAr, cat.labelEn)}
            </button>
          ))}
        </div>

        <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((img, i) => (
              <motion.div
                layout
                key={img.src + img.category}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="cursor-pointer"
                onClick={() => setLightboxIndex(i)}
                data-testid={`card-gallery-${i}`}
              >
                <div className="relative aspect-square rounded-lg overflow-hidden group">
                  <img
                    src={img.src}
                    alt={t(img.captionAr, img.captionEn)}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                    <p className="text-white text-xs sm:text-sm p-2 sm:p-3 opacity-0 group-hover:opacity-100 transition-opacity font-medium drop-shadow-lg">
                      {t(img.captionAr, img.captionEn)}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      <AnimatePresence>
        {lightboxIndex !== null && filtered[lightboxIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightboxIndex(null)}
            data-testid="lightbox-overlay"
          >
            <button
              onClick={() => setLightboxIndex(null)}
              className="absolute top-4 end-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white flex items-center justify-center text-white transition-colors"
              data-testid="button-lightbox-close"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={filtered[lightboxIndex].src}
              alt={t(filtered[lightboxIndex].captionAr, filtered[lightboxIndex].captionEn)}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
              data-testid="img-lightbox"
            />
            <p className="absolute bottom-8 inset-x-0 text-center text-white text-lg font-medium drop-shadow-lg">
              {t(filtered[lightboxIndex].captionAr, filtered[lightboxIndex].captionEn)}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ProjectsSection() {
  const { t } = useLanguage();

  return (
    <section id="projects" className="py-20 sm:py-28" data-testid="section-projects">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-4 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full border border-primary/20 mb-4">
            {t("مشاريعنا", "Our Projects")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" data-testid="text-projects-heading">
            {t("مشاريعنا", "Our Projects")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t(
              "نفخر بتنفيذ مشاريع في مختلف مدن المملكة",
              "We are proud to execute projects across cities of the Kingdom"
            )}
          </p>
        </motion.div>

        <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {projectCards.map((project, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="snap-start shrink-0 w-72 sm:w-80"
              data-testid={`card-project-${i}`}
            >
              <Card className="overflow-hidden h-full">
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={project.image}
                    alt={t(project.titleAr, project.titleEn)}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    data-testid={`img-project-${i}`}
                  />
                </div>
                <CardContent className="p-4">
                  <h3 className="text-sm font-bold leading-relaxed" data-testid={`text-project-title-${i}`}>
                    {t(project.titleAr, project.titleEn)}
                  </h3>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatsSection() {
  const { t } = useLanguage();

  const stats = [
    { value: 500, suffix: "+", labelAr: "عميل", labelEn: "Clients", icon: <Users className="w-6 h-6" /> },
    { value: 50, suffix: "+", labelAr: "منتج", labelEn: "Products", icon: <Package className="w-6 h-6" /> },
    { value: 10, suffix: "+", labelAr: "سنوات الخبرة", labelEn: "Years Experience", icon: <Clock className="w-6 h-6" /> },
    { value: 100, suffix: "+", labelAr: "موظف وعامل", labelEn: "Employees", icon: <Award className="w-6 h-6" /> },
    { value: 5, suffix: "", labelAr: "سنوات ضمان", labelEn: "Years Warranty", icon: <Shield className="w-6 h-6" /> },
  ];

  return (
    <section className="py-16 sm:py-20 bg-primary text-primary-foreground relative overflow-hidden" data-testid="section-stats">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 start-0 w-full h-full" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,0.05) 35px, rgba(255,255,255,0.05) 70px)" }} />
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 sm:gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="text-center"
              data-testid={`stat-${i}`}
            >
              <motion.div
                className="w-14 h-14 mx-auto mb-3 rounded-full bg-primary-foreground/10 flex items-center justify-center"
                whileHover={{ scale: 1.15, rotate: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                {stat.icon}
              </motion.div>
              <div className="text-3xl sm:text-4xl font-black mb-1 tabular-nums">
                <AnimatedCounter value={stat.value} suffix={stat.suffix} />
              </div>
              <div className="text-sm text-primary-foreground/80 font-medium">
                {t(stat.labelAr, stat.labelEn)}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MapSection() {
  const { t } = useLanguage();
  const [activeBranch, setActiveBranch] = useState(0);

  const branches = [
    {
      id: "factory",
      icon: <Factory className="w-5 h-5" />,
      labelAr: "المصنع الرئيسي",
      labelEn: "Main Factory",
      locationAr: "خميس مشيط - المدينة الصناعية",
      locationEn: "Khamis Mushait - Industrial City",
      mapUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3700!2d42.7!3d18.3!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x15fb5b0c08c5b0b7%3A0x0!2zMTjCsDE4JzAwLjAiTiA0MsKwNDInMDAuMCJF!5e0!3m2!1sar!2ssa!4v1700000000000",
      gMapsLink: "https://maps.app.goo.gl/QFzJhCpQi54RtjKt5",
    },
    {
      id: "showroom",
      icon: <Store className="w-5 h-5" />,
      labelAr: "معرض خميس مشيط",
      labelEn: "Khamis Mushait Showroom",
      locationAr: "خميس مشيط - معرض البيع",
      locationEn: "Khamis Mushait - Sales Showroom",
      mapUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3700!2d42.72!3d18.31!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x15fb5b0c08c5b0b7%3A0x0!2zMTjCsDE4JzM2LjAiTiA0MsKwNDMnMTIuMCJF!5e0!3m2!1sar!2ssa!4v1700000000001",
      gMapsLink: "https://maps.app.goo.gl/SupLeWhZeY5VxWM38",
    },
    {
      id: "riyadh",
      icon: <Building2 className="w-5 h-5" />,
      labelAr: "فرع الرياض",
      labelEn: "Riyadh Branch",
      locationAr: "الرياض",
      locationEn: "Riyadh",
      mapUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3624!2d46.68!3d24.71!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3e2f03890d489399%3A0x0!2zMjTCsDQyJzM2LjAiTiA0NsijNDAnNDguMCJF!5e0!3m2!1sar!2ssa!4v1700000000002",
      gMapsLink: "https://maps.app.goo.gl/WMjCiy6hD4Vw77zj6",
    },
  ];

  const branch = branches[activeBranch];

  return (
    <section id="location" className="py-20 sm:py-28" data-testid="section-map">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-4 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full border border-primary/20 mb-4">
            {t("فروعنا", "Our Branches")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" data-testid="text-map-heading">
            {t("فروعنا ومواقعنا", "Our Branches & Locations")}
          </h2>
          <p className="text-muted-foreground text-lg">
            {t("نتواجد في عدة مدن لخدمتكم", "We are present in multiple cities to serve you")}
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {branches.map((b, i) => (
            <motion.button
              key={b.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveBranch(i)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all ${
                activeBranch === i
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
              data-testid={`button-branch-${b.id}`}
            >
              {b.icon}
              {t(b.labelAr, b.labelEn)}
            </motion.button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeBranch}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="overflow-hidden shadow-xl">
              <div className="p-4 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    {branch.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">{t(branch.labelAr, branch.labelEn)}</h3>
                    <p className="text-xs text-muted-foreground">{t(branch.locationAr, branch.locationEn)}</p>
                  </div>
                </div>
                <a href={branch.gMapsLink} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="gap-2">
                    <MapPin className="w-4 h-4" />
                    {t("افتح في خرائط قوقل", "Open in Google Maps")}
                  </Button>
                </a>
              </div>
              <iframe
                src={branch.mapUrl}
                width="100%"
                height="400"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={t(branch.labelAr, branch.labelEn)}
                data-testid="iframe-map"
              />
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

function ContactSection() {
  const { t } = useLanguage();

  const contactInfo = [
    {
      icon: <Phone className="w-5 h-5" />,
      labelAr: "هاتف المصنع",
      labelEn: "Factory Phone",
      value: "0173250090",
      href: "tel:0173250090",
    },
    {
      icon: <SiWhatsapp className="w-5 h-5" />,
      labelAr: "واتساب",
      labelEn: "WhatsApp",
      value: "0500748478",
      href: "https://wa.me/966500748478",
    },
    {
      icon: <Mail className="w-5 h-5" />,
      labelAr: "البريد الإلكتروني",
      labelEn: "Email",
      value: "info@teak2030.net",
      href: "mailto:info@teak2030.net",
    },
    {
      icon: <MapPin className="w-5 h-5" />,
      labelAr: "العنوان",
      labelEn: "Address",
      value: t("خميس مشيط - المدينة الصناعية", "Khamis Mushait - Industrial City"),
      href: "#location",
    },
  ];

  return (
    <section id="contact" className="py-20 sm:py-28 bg-card/50" data-testid="section-contact">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-4 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full border border-primary/20 mb-4">
            {t("تواصل معنا", "Contact Us")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" data-testid="text-contact-heading">
            {t("تواصل معنا", "Contact Us")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t(
              "نحن هنا لمساعدتك. تواصل معنا في أي وقت",
              "We are here to help. Contact us anytime"
            )}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {contactInfo.map((info, i) => (
            <motion.a
              key={i}
              href={info.href}
              target={info.href.startsWith("http") ? "_blank" : undefined}
              rel={info.href.startsWith("http") ? "noopener noreferrer" : undefined}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              data-testid={`card-contact-${i}`}
            >
              <Card className="h-full hover:border-primary/30 transition-colors">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    {info.icon}
                  </div>
                  <h3 className="text-sm font-bold mb-1">{t(info.labelAr, info.labelEn)}</h3>
                  <p className="text-sm text-muted-foreground" dir="ltr">{info.value}</p>
                </CardContent>
              </Card>
            </motion.a>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-10"
        >
          <a href="/request-quote" data-testid="link-contact-quote">
            <Button size="lg" className="min-w-[200px]">
              {t("طلب عرض سعر", "Request a Quote")}
            </Button>
          </a>
          <a href="https://wa.me/966500748478" target="_blank" rel="noopener noreferrer" data-testid="link-contact-whatsapp">
            <Button size="lg" variant="outline" className="min-w-[200px] gap-2">
              <MessageCircle className="w-4 h-4" />
              {t("تواصل عبر الواتساب", "Chat on WhatsApp")}
            </Button>
          </a>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useLanguage();

  const quickLinks = [
    { href: "/", labelAr: "الرئيسية", labelEn: "Home" },
    { href: "/kitchen-designer", labelAr: "صمّم مطبخك", labelEn: "Design Your Kitchen" },
    { href: "#gallery", labelAr: "معرض أعمالنا", labelEn: "Our Gallery" },
    { href: "#projects", labelAr: "مشاريعنا", labelEn: "Our Projects" },
    { href: "#location", labelAr: "فروعنا", labelEn: "Our Branches" },
  ];

  const serviceLinks = [
    { href: "/request-quote", labelAr: "طلب عرض سعر", labelEn: "Request Quote" },
    { href: "/portal/login", labelAr: "بوابة العملاء", labelEn: "Customer Portal" },
  ];

  return (
    <footer className="border-t border-border bg-card/50 py-12 sm:py-16" data-testid="section-footer">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <img
                src={teakLogo}
                alt="Teak Logo"
                className="w-10 h-10 object-contain logo-auto transition-all duration-300"
                data-testid="img-footer-logo"
              />
              <div>
                <span className="text-lg font-bold" data-testid="text-footer-brand">
                  {t("تيك للصناعات الخشبية", "Teak Wood Products")}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t("مطابخ • خزائن • ديكورات", "Kitchens • Wardrobes • Decorations")}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(
                "مصنع تيك للصناعات الخشبية — نصنع من أجود أنواع الأخشاب والخامات. خميس مشيط، المملكة العربية السعودية.",
                "Teak Wood Products Factory — crafted from the finest woods and materials. Khamis Mushait, Saudi Arabia."
              )}
            </p>
          </div>

          <div>
            <h4 className="font-bold mb-4">{t("روابط سريعة", "Quick Links")}</h4>
            <div className="flex flex-col gap-2">
              {quickLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`link-footer-${link.labelEn.toLowerCase().replace(/\s/g, "-")}`}
                >
                  {t(link.labelAr, link.labelEn)}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-4">{t("خدمات العملاء", "Customer Services")}</h4>
            <div className="flex flex-col gap-2">
              {serviceLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`link-footer-${link.labelEn.toLowerCase().replace(/\s/g, "-")}`}
                >
                  {t(link.labelAr, link.labelEn)}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-4">{t("تواصل معنا", "Contact Us")}</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <a href="tel:0173250090" className="hover:text-foreground transition-colors flex items-center gap-2" data-testid="link-footer-phone">
                <Phone className="w-4 h-4 shrink-0" />
                <span dir="ltr">017 325 0090</span>
              </a>
              <a href="https://wa.me/966500748478" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors flex items-center gap-2" data-testid="link-footer-whatsapp">
                <SiWhatsapp className="w-4 h-4 shrink-0" />
                <span dir="ltr">050 074 8478</span>
              </a>
              <a href="mailto:info@teak2030.net" className="hover:text-foreground transition-colors flex items-center gap-2" data-testid="link-footer-email">
                <Mail className="w-4 h-4 shrink-0" />
                <span dir="ltr">info@teak2030.net</span>
              </a>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground" data-testid="text-copyright">
            {t(
              `© ${new Date().getFullYear()} مصنع تيك للصناعات الخشبية. جميع الحقوق محفوظة.`,
              `© ${new Date().getFullYear()} Teak Wood Products Factory. All rights reserved.`
            )}
          </p>
          <div className="flex items-center gap-4">
            <a
              href="/finance-login"
              className="flex items-center justify-center text-primary/50 hover:text-primary/80 border border-primary/15 hover:border-primary/35 bg-primary/5 hover:bg-primary/10 w-7 h-7 rounded-full transition-all"
              data-testid="link-finance-login"
              title={t("دخول المحاسبين", "Accountant Login")}
              aria-label={t("دخول المحاسبين", "Accountant Login")}
            >
              <Calculator className="w-3.5 h-3.5" />
            </a>
            <a
              href="/employee-login"
              className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              data-testid="link-staff-login"
            >
              <Lock className="w-3 h-3" />
              {t("دخول الموظفين", "Staff Login")}
            </a>
            <a
              href="/attendance"
              className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              data-testid="link-attendance-portal"
            >
              <Fingerprint className="w-3 h-3" />
              {t("تسجيل الدوام", "Attendance")}
            </a>
            <a
              href="/system-admin"
              className="text-muted-foreground/25 hover:text-muted-foreground/60 transition-colors"
              title="System Administration"
              data-testid="link-system-admin"
            >
              <Shield className="w-3.5 h-3.5" />
            </a>
          </div>
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
          className="fixed bottom-6 end-6 z-50 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg"
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
      <GallerySection />
      <ProjectsSection />
      <StatsSection />
      <MapSection />
      <ContactSection />
      <Footer />
      <ScrollToTop />
    </div>
  );
}
