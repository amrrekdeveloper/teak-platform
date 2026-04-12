import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/components/language-provider";
import {
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
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
  Sparkles,
  Hammer,
  Palette,
  CheckCircle2,
  Truck,
  PenTool,
  Globe2,
  HeartHandshake,
  Lock,
  Fingerprint,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";
import realProjectImg1 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.01_AM_1774691415123.jpeg";
import realProjectImg2 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.01_AM_(4)_1774691415123.jpeg";
import realProjectImg3 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.01_AM_(5)_1774691415123.jpeg";
import realProjectImg4 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.02_AM_(1)_1774691415124.jpeg";
import realProjectImg5 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.02_AM_(2)_1774691415124.jpeg";
import realProjectImg6 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.02_AM_(3)_1774691415124.jpeg";
import realProjectImg7 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.02_AM_(4)_1774691415124.jpeg";
import realProjectImg8 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.02_AM_1774691415125.jpeg";
import realProjectImg9 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.03_AM_1774691415125.jpeg";
import realProjectImg10 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.46_AM_(1)_1774691415125.jpeg";

import imgKitchenGrayTeak from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_(1)_1774689872332.jpeg";
import imgKitchenWarmTeak from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_(2)_1774689872333.jpeg";
import imgKitchenLightWood from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_(3)_1774689872333.jpeg";
import imgKitchenWhiteGlossy from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_(4)_1774691363250.jpeg";
import imgWalkInClosetEmpty from "@assets/WhatsApp_Image_2026-03-28_at_10.47.57_AM_(3)_1774689872331.jpeg";
import imgDoorChevron from "@assets/WhatsApp_Image_2026-03-28_at_10.47.55_AM_(2)_1774689832749.jpeg";
import imgDoorDiamond from "@assets/WhatsApp_Image_2026-03-28_at_10.47.55_AM_(6)_1774689832750.jpeg";
import imgWallGeometric from "@assets/WhatsApp_Image_2026-03-28_at_10.47.53_AM_1774689748826.jpeg";
import imgStairRailing1 from "@assets/WhatsApp_Image_2026-03-28_at_10.47.53_AM_(2)_1774689748825.jpeg";
import imgStairRailing2 from "@assets/WhatsApp_Image_2026-03-28_at_10.47.53_AM_(4)_1774689748826.jpeg";
import imgDoorChevronDouble from "@assets/WhatsApp_Image_2026-03-28_at_10.47.55_AM_(3)_1774689832750.jpeg";
import imgWallWhiteGeometric from "@assets/WhatsApp_Image_2026-03-28_at_10.47.54_AM_(4)_1774689748827.jpeg";
import imgWardrobeFullRoom from "@assets/WhatsApp_Image_2026-03-28_at_10.48.02_AM_(1)_1774691415124.jpeg";
import imgWalkInClosetClothes from "@assets/WhatsApp_Image_2026-03-28_at_10.47.57_AM_(4)_1774689872331.jpeg";
import imgTeakOvenUnit from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_1774691363250.jpeg";
import imgKitchenVelvetChairs from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_(5)_1774691363250.jpeg";
import imgKitchenTeakBrochure from "@assets/WhatsApp_Image_2026-03-28_at_10.47.59_AM_(2)_1774691363251.jpeg";
import imgKitchenGrayCloseup from "@assets/WhatsApp_Image_2026-03-28_at_10.47.59_AM_(3)_1774691363251.jpeg";
import imgHotelLobbySphereChandelier from "@assets/WhatsApp_Image_2026-03-28_at_10.47.54_AM_(5)_1774689748827.jpeg";
import imgHotelLobbySofasGoldWall from "@assets/WhatsApp_Image_2026-03-28_at_10.47.57_AM_1774689872332.jpeg";
import imgCafeGreenChairs1 from "@assets/WhatsApp_Image_2026-03-28_at_10.47.54_AM_(1)_1774689748826.jpeg";
import imgCafeGreenChairs2 from "@assets/WhatsApp_Image_2026-03-28_at_10.47.54_AM_(2)_1774689748827.jpeg";
import imgCommercialReception from "@assets/WhatsApp_Image_2026-03-28_at_10.47.54_AM_(3)_1774689748827.jpeg";
import imgVipOffice from "@assets/WhatsApp_Image_2026-03-28_at_10.47.57_AM_(2)_1774689872331.jpeg";
import imgSayyarShelf from "@assets/WhatsApp_Image_2026-03-28_at_10.48.01_AM_1774691415123.jpeg";
import imgSayyarDisplay from "@assets/WhatsApp_Image_2026-03-28_at_10.48.01_AM_(5)_1774691415123.jpeg";
import imgDoorWithGoldStripes from "@assets/WhatsApp_Image_2026-03-28_at_10.47.53_AM_(1)_1774689748825.jpeg";
import imgDoorCarvedWood from "@assets/WhatsApp_Image_2026-03-28_at_10.47.53_AM_(3)_1774689748826.jpeg";
import imgHotelColumn from "@assets/WhatsApp_Image_2026-03-28_at_10.47.54_AM_1774689832748.jpeg";
import imgCafeWrappedChairs from "@assets/WhatsApp_Image_2026-03-28_at_10.47.55_AM_(1)_1774689832749.jpeg";
import imgWallWhiteGeometricCloseup from "@assets/WhatsApp_Image_2026-03-28_at_10.47.55_AM_1774689832751.jpeg";
import imgDoorClassicWhiteGold from "@assets/WhatsApp_Image_2026-03-28_at_10.47.55_AM_(4)_1774689832750.jpeg";
import imgDoorClassicDarkCarved from "@assets/WhatsApp_Image_2026-03-28_at_10.47.55_AM_(5)_1774689832750.jpeg";
import imgHotelLobbyWoodColumns from "@assets/WhatsApp_Image_2026-03-28_at_10.47.56_AM_(1)_1774689832751.jpeg";
import imgDoorNaturalChevronOpen from "@assets/WhatsApp_Image_2026-03-28_at_10.47.56_AM_1774689872330.jpeg";
import imgHotelLobbyDecorativeShelves from "@assets/WhatsApp_Image_2026-03-28_at_10.47.56_AM_(2)_1774689832751.jpeg";
import imgCafeBookshelfFairyLights from "@assets/WhatsApp_Image_2026-03-28_at_10.47.57_AM_(1)_1774689872330.jpeg";
import imgWalkInClosetRobes from "@assets/WhatsApp_Image_2026-03-28_at_10.47.57_AM_(5)_1774689872331.jpeg";
import imgKitchenGrayTeakDuplicate from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_(1)_1774691363249.jpeg";
import imgKitchenWarmTeakDuplicate from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_(2)_1774691363249.jpeg";
import imgKitchenLightWoodDuplicate from "@assets/WhatsApp_Image_2026-03-28_at_10.47.58_AM_(3)_1774691363250.jpeg";
import imgKitchenDarkVelvetIsland from "@assets/WhatsApp_Image_2026-03-28_at_10.47.59_AM_(1)_1774691363251.jpeg";
import imgKitchenGrayIsland from "@assets/WhatsApp_Image_2026-03-28_at_10.47.59_AM_(4)_1774691363252.jpeg";
import imgSayyarShowroomExterior from "@assets/WhatsApp_Image_2026-03-28_at_10.48.01_AM_(4)_1774691415123.jpeg";
import imgSayyarBoxesCloseup from "@assets/WhatsApp_Image_2026-03-28_at_10.48.02_AM_1774691415125.jpeg";
import imgTvUnitFireplace1 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.02_AM_(2)_1774691415124.jpeg";
import imgTvUnitFireplace2 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.02_AM_(3)_1774691415124.jpeg";
import imgTvUnitFireplace3 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.02_AM_(4)_1774691415124.jpeg";
import imgTvUnitFireplace4 from "@assets/WhatsApp_Image_2026-03-28_at_10.48.03_AM_1774691415125.jpeg";
import imgAccordionDoorWhite from "@assets/WhatsApp_Image_2026-03-28_at_10.48.46_AM_(1)_1774691415125.jpeg";

const heroSlides = [
  {
    image: imgKitchenGrayTeak,
    titleAr: "مطابخ فاخرة بالسعودية",
    titleEn: "Luxury Kitchens in Saudi Arabia",
    subtitleAr: "تصميم وتركيب مطابخ عصرية في جازان وخميس مشيط وأبها",
    subtitleEn: "Design & installation of modern kitchens in Jazan, Khamis Mushait & Abha",
  },
  {
    image: imgKitchenWarmTeak,
    titleAr: "مطابخ نيو كلاسيك",
    titleEn: "Neo Classic Kitchens",
    subtitleAr: "تفصيل مطابخ بأسعار مميزة ومواد أوروبية عالية الجودة",
    subtitleEn: "Custom kitchens with premium European materials at great prices",
  },
  {
    image: imgKitchenLightWood,
    titleAr: "خزائن مدمجة فاخرة",
    titleEn: "Luxury Built-in Wardrobes",
    subtitleAr: "خزائن غرف نوم وملابس بتصاميم حديثة وجودة استثنائية",
    subtitleEn: "Bedroom & wardrobe closets with modern designs and exceptional quality",
  },
  {
    image: imgKitchenVelvetChairs,
    titleAr: "أبواب خشب طبيعي وديكور",
    titleEn: "Natural Wood Doors & Decor",
    subtitleAr: "أبواب وديكورات خشبية تُضفي الفخامة على منزلك",
    subtitleEn: "Wood doors & decorations that add luxury to your home",
  },
];

const productCards = [
  {
    image: imgKitchenWhiteGlossy,
    titleAr: "المطابخ",
    titleEn: "Kitchens",
    descAr: "مصنعة من خشب شيبورد الإيطالي واكسسوارات ألمانية",
    descEn: "Made from Italian chipboard with German accessories",
  },
  {
    image: imgWalkInClosetEmpty,
    titleAr: "الخزائن",
    titleEn: "Wardrobes",
    descAr: "مصنعة من خشب شيبورد الإيطالي واكسسوارات ألمانية",
    descEn: "Made from Italian chipboard with German accessories",
  },
  {
    image: imgDoorChevron,
    titleAr: "أبواب خشب طبيعي",
    titleEn: "Natural Wood Doors",
    descAr: "مصنعة من الخشب السويدي مكسي بقشر الجوز وخشب البلوط",
    descEn: "Made from Swedish wood with walnut and oak veneer",
  },
  {
    image: imgDoorDiamond,
    titleAr: "أبواب شيبورد",
    titleEn: "Chipboard Doors",
    descAr: "مصنعة من خشب شيبورد الإيطالي",
    descEn: "Made from Italian chipboard",
  },
  {
    image: imgWallGeometric,
    titleAr: "ديكورات خشبية",
    titleEn: "Wood Decorations",
    descAr: "مصنعة من خشب شيبورد الايطالي المقاوم للماء والرطوبة",
    descEn: "Made from Italian water & moisture resistant chipboard",
  },
];

const galleryImages = [
  { src: imgStairRailing1, captionAr: "درابزين درج فاخر بقضبان ذهبية", captionEn: "Luxury Stair Railing with Gold Bars" },
  { src: imgStairRailing2, captionAr: "درابزين درج بقضبان ذهبية - زاوية ثانية", captionEn: "Stair Railing with Gold Bars - Second Angle" },
  { src: imgDoorChevronDouble, captionAr: "باب خشب طبيعي بنقش شيفرون", captionEn: "Natural Wood Door with Chevron Pattern" },
  { src: imgWallWhiteGeometric, captionAr: "ديكور جداري هندسي أبيض", captionEn: "White Geometric Wall Decoration" },
  { src: imgWardrobeFullRoom, captionAr: "خزانة مدمجة فاخرة بتصميم عصري مع إضاءة LED", captionEn: "Luxury built-in wardrobe with modern design and LED lighting" },
  { src: imgWalkInClosetEmpty, captionAr: "غرفة خزائن مشي بإضاءة ذهبية", captionEn: "Walk-in Closet with Golden Lighting" },
  { src: imgWalkInClosetClothes, captionAr: "غرفة خزائن مشي فاخرة", captionEn: "Luxury Walk-in Closet" },
  { src: imgTeakOvenUnit, captionAr: "وحدة مطبخ متكاملة - برج الأفران", captionEn: "Integrated Kitchen Unit - Oven Tower" },
  { src: imgSayyarShelf, captionAr: "ديكورات خشبية فاخرة لمعرض سيار – تصميم احترافي", captionEn: "Luxury wood decor for Sayyar showroom - Professional design" },
  { src: imgTvUnitFireplace1, captionAr: "ديكور خشبي للصالة مع وحدة تلفزيون – تفصيل راقٍ", captionEn: "Living room wood decor with TV unit - Refined craftsmanship" },
  { src: imgKitchenTeakBrochure, captionAr: "من معرضنا - خميس مشيط", captionEn: "From Our Showroom - Khamis Mushait" },
  { src: imgKitchenGrayCloseup, captionAr: "تفاصيل التشطيب الراقي", captionEn: "Refined Finishing Details" },
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

  const isOnHero = !scrolled;
  const isDark = theme === "dark";
  const showWhiteLogo = isDark || isOnHero;
  const logoClass = showWhiteLogo ? "" : "logo-red";

  const navLinks = [
    { href: "#about", labelAr: "من نحن", labelEn: "About" },
    { href: "#products", labelAr: "منتجاتنا", labelEn: "Products" },
    { href: "#gallery", labelAr: "معرض أعمالنا", labelEn: "Gallery" },
    { href: "#projects", labelAr: "مشاريعنا", labelEn: "Projects" },
    { href: "#contact", labelAr: "تواصل معنا", labelEn: "Contact" },
  ];

  const navLinkClasses = isOnHero
    ? "px-3 py-2 text-sm font-medium text-white/90 hover:text-white transition-colors drop-shadow-sm"
    : "px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors";

  const iconBtnClasses = isOnHero
    ? "text-white/90 hover:text-white hover:bg-white/10"
    : "";

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
              className={`h-12 sm:h-14 w-auto object-contain transition-all duration-500 ${logoClass}`}
              data-testid="img-logo"
            />
          </a>

          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={navLinkClasses}
                data-testid={`link-nav-${link.labelEn.toLowerCase()}`}
              >
                {t(link.labelAr, link.labelEn)}
              </a>
            ))}
            <a
              href="/request-quote"
              className={isOnHero
                ? "px-3 py-2 text-sm font-bold text-white hover:text-white/80 transition-colors drop-shadow-sm"
                : "px-3 py-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors"
              }
              data-testid="link-request-quote"
            >
              {t("طلب عرض سعر", "Request Quote")}
            </a>
            <a
              href="/track-order"
              className={navLinkClasses}
              data-testid="link-track-order"
            >
              {t("تتبع طلبك", "Track Order")}
            </a>
            <a
              href="/portal/login"
              className={
                isOnHero
                  ? "px-3 py-2 text-sm font-bold text-white hover:text-white/80 transition-colors drop-shadow-sm"
                  : "px-3 py-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors"
              }
              data-testid="link-customer-portal"
            >
              {t("بوابة العملاء", "Customer Portal")}
            </a>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleLang}
              className={iconBtnClasses}
              data-testid="button-language-toggle"
              aria-label={t("تبديل اللغة إلى الإنجليزية", "Switch language to Arabic")}
            >
              <span className="text-xs font-bold">{lang === "ar" ? "EN" : "ع"}</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              className={iconBtnClasses}
              data-testid="button-theme-toggle"
              aria-label={t("تبديل إلى الوضع الفاتح", "Toggle to dark mode")}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={`lg:hidden ${iconBtnClasses}`}
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
                  data-testid={`link-nav-${link.labelEn.toLowerCase()}-mobile`}
                >
                  {t(link.labelAr, link.labelEn)}
                </a>
              ))}
              <a
                href="/products"
                onClick={() => setMobileOpen(false)}
                className="px-4 py-3 text-sm font-medium rounded-md hover:bg-muted"
                data-testid="link-products-mobile"
              >
                {t("جميع المنتجات", "All Products")}
              </a>
              <a
                href="/request-quote"
                onClick={() => setMobileOpen(false)}
                className="px-4 py-3 text-sm font-medium rounded-md hover:bg-muted text-primary"
                data-testid="link-request-quote-mobile"
              >
                {t("طلب عرض سعر", "Request Quote")}
              </a>
              <a
                href="/track-order"
                onClick={() => setMobileOpen(false)}
                className="px-4 py-3 text-sm font-medium rounded-md hover:bg-muted"
                data-testid="link-track-order-mobile"
              >
                {t("تتبع طلبك", "Track Order")}
              </a>
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
  const { t, isRTL } = useLanguage();
  const [current, setCurrent] = useState(0);

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % heroSlides.length);
  }, []);

  const prev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next]);

  const slide = heroSlides[current];

  return (
    <section className="relative h-screen min-h-[600px] max-h-[900px] overflow-hidden" data-testid="section-hero">
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0"
        >
          <img
            src={slide.image}
            alt={t(slide.titleAr, slide.titleEn)}
            className="w-full h-full object-cover"
            data-testid="img-hero-slide"
          />
          <div className="absolute inset-0 bg-black/50" />
        </motion.div>
      </AnimatePresence>

      <div className="relative z-10 h-full flex flex-col items-center justify-center text-center text-white px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1
              className="text-3xl sm:text-5xl md:text-6xl font-black mb-3 drop-shadow-lg"
              data-testid="text-hero-title"
            >
              {t(slide.titleAr, slide.titleEn)}
            </h1>
            <p
              className="text-lg sm:text-xl md:text-2xl text-white/90 mb-8 max-w-2xl mx-auto"
              data-testid="text-hero-subtitle"
            >
              {t(slide.subtitleAr, slide.subtitleEn)}
            </p>
          </motion.div>
        </AnimatePresence>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <a href="/request-quote" data-testid="link-hero-quote">
            <Button size="lg" className="min-w-[180px] text-base font-bold">
              {t("طلب عرض سعر", "Request Quote")}
            </Button>
          </a>
          <a href="#products" data-testid="link-hero-products">
            <Button size="lg" variant="outline" className="min-w-[180px] text-base font-bold border-white text-white hover:bg-white/20">
              {t("منتجاتنا", "Our Products")}
            </Button>
          </a>
        </motion.div>

        <div className="absolute bottom-8 inset-x-0 flex items-center justify-center gap-3">
          {heroSlides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-3 h-3 rounded-full transition-all ${
                i === current ? "bg-white scale-125" : "bg-white/40"
              }`}
              data-testid={`button-slide-dot-${i}`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>

        <button
          onClick={isRTL ? next : prev}
          className="absolute start-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 focus-visible:ring-2 focus-visible:ring-white flex items-center justify-center text-white transition-colors"
          data-testid="button-slide-prev"
          aria-label="Previous"
        >
          {isRTL ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
        <button
          onClick={isRTL ? prev : next}
          className="absolute end-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 focus-visible:ring-2 focus-visible:ring-white flex items-center justify-center text-white transition-colors"
          data-testid="button-slide-next"
          aria-label="Next"
        >
          {isRTL ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>
    </section>
  );
}

function AboutSection() {
  const { t } = useLanguage();

  return (
    <section id="about" className="py-20 sm:py-28 bg-card/50" data-testid="section-about">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-4 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full border border-primary/20 mb-4">
            {t("من نحن", "About Us")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" data-testid="text-about-heading">
            {t("مصنع تيك للصناعات الخشبية", "Teak Wood Products Factory")}
          </h2>
          <p className="text-primary text-lg font-semibold mb-6">
            {t("مطابخ فاخرة – خزائن مدمجة – أبواب خشب طبيعي – ديكور داخلي", "Luxury Kitchens – Built-in Wardrobes – Natural Wood Doors – Interior Decor")}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="max-w-4xl mx-auto"
        >
          <Card>
            <CardContent className="p-6 sm:p-10">
              <p className="text-base sm:text-lg leading-relaxed text-muted-foreground" data-testid="text-about-content">
                {t(
                  "مصنع تيك للصناعات الخشبية — المتخصص في تصنيع وتركيب المطابخ الفاخرة والخزائن المدمجة وأبواب الخشب الطبيعي والديكورات الداخلية في المملكة العربية السعودية. نخدم مدن جازان وخميس مشيط وأبها وحائل والرياض وغيرها. تأسسنا على يد كفاءات فنية وإدارية تجمع بين الخبرة العملية والتميز الأكاديمي، ملتزمين بتقديم مطابخ عصرية ونيو كلاسيك، وخزائن تفصيل، وأبواب خشب سويدي — بأسعار تنافسية وجودة أوروبية لا مثيل لها.",
                  "Teak Wood Products Factory specializes in manufacturing and installing luxury kitchens, built-in wardrobes, natural wood doors, and interior decorations across Saudi Arabia. We serve Jazan, Khamis Mushait, Abha, Hail, Riyadh, and beyond. Founded by expert professionals combining practical experience and academic excellence, we offer modern and neo-classic kitchens, custom wardrobes, and Swedish wood doors — at competitive prices with unmatched European quality."
                )}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

function CEOSection() {
  const { t } = useLanguage();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="py-20 sm:py-28 relative overflow-hidden" data-testid="section-ceo" ref={ref}>
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-4 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full border border-primary/20 mb-4">
            {t("كلمة الرئيس التنفيذي", "CEO's Message")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black" data-testid="text-ceo-heading">
            {t("كلمة الرئيس التنفيذي", "CEO's Message")}
          </h2>
        </motion.div>

        <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotate: -3 }}
            animate={isInView ? { opacity: 1, scale: 1, rotate: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2, type: "spring", stiffness: 100 }}
            className="shrink-0 relative group"
          >
            <div className="relative">
              <div className="absolute -inset-3 bg-gradient-to-br from-primary/30 via-amber-500/20 to-primary/30 rounded-2xl blur-lg opacity-60 group-hover:opacity-80 transition-opacity" />
              <div className="relative w-52 h-52 sm:w-64 sm:h-64 rounded-2xl overflow-hidden border-4 border-primary/20 shadow-2xl" style={{ filter: "contrast(1.05) saturate(1.1)" }}>
                <img
                  src="/images/ceo_photo.jpg"
                  alt={t("م. جبران الشهراني", "Eng. Jabran Al-Shahrani")}
                  className="w-full h-full object-cover"
                  data-testid="img-ceo-photo"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
              </div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="absolute -bottom-4 inset-x-0 mx-auto w-fit"
              >
                <div className="bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-sm font-bold shadow-lg whitespace-nowrap">
                  {t("م. جبران الشهراني", "Eng. Jabran Al-Shahrani")}
                </div>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="text-center mt-8 text-sm text-muted-foreground font-medium"
            >
              {t("الرئيس التنفيذي", "Chief Executive Officer")}
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex-1"
          >
            <Card className="border-primary/10 shadow-xl">
              <CardContent className="p-6 sm:p-10 relative overflow-hidden">
                <Sparkles className="absolute top-4 end-4 w-5 h-5 text-primary/20" />
                <div className="absolute top-0 start-0 w-1 h-full bg-gradient-to-b from-primary via-primary/50 to-transparent rounded-full" />

                <div className="text-5xl text-primary/10 font-serif leading-none mb-2 select-none">"</div>
                <p className="text-base sm:text-lg leading-loose text-muted-foreground whitespace-pre-line" data-testid="text-ceo-message">
                  {t(
                    "الفرق بين مكان تسكنه، ومكان ينتمي إليك — هو الإتقان.\nفي تيك، لا نبيع أثاثاً.\nنبني البيئة التي تشكّل حياتك اليومية —\nلأن المساحة التي تعيش فيها\nلا تعكس ذوقك فحسب،\nبل تعكس من أنت.\nخشب مختار. تصميم محسوب. تنفيذ لا تنازل فيه.",
                    "The difference between a place you live in, and a place that belongs to you — is craftsmanship.\nAt Teak, we don't sell furniture.\nWe build the environment that shapes your daily life —\nbecause the space you live in\ndoesn't just reflect your taste,\nit reflects who you are.\nSelected wood. Calculated design. Uncompromising execution."
                  )}
                </p>
                <div className="text-5xl text-primary/10 font-serif leading-none mt-2 text-end select-none">"</div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
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

function ProductsSection() {
  const { t } = useLanguage();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const productIcons = [
    <Hammer className="w-5 h-5" />,
    <Package className="w-5 h-5" />,
    <Shield className="w-5 h-5" />,
    <Palette className="w-5 h-5" />,
    <Sparkles className="w-5 h-5" />,
  ];

  return (
    <section id="products" className="py-20 sm:py-28 bg-card/50" data-testid="section-products">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-4 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full border border-primary/20 mb-4">
            {t("منتجاتنا", "Our Products")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" data-testid="text-products-heading">
            {t("منتجاتنا", "Our Products")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t(
              "نقدم أجود المنتجات الخشبية المصنعة بأيدي سعودية وخبرات عالمية",
              "We offer the finest wood products manufactured by Saudi hands with international expertise"
            )}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {productCards.map((product, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              onHoverStart={() => setHoveredIdx(i)}
              onHoverEnd={() => setHoveredIdx(null)}
              data-testid={`card-product-${i}`}
            >
              <Card className="overflow-hidden h-full group cursor-pointer">
                <div className="relative h-56 overflow-hidden">
                  <motion.img
                    src={product.image}
                    alt={t(product.titleAr, product.titleEn)}
                    className="w-full h-full object-cover"
                    animate={{ scale: hoveredIdx === i ? 1.1 : 1 }}
                    transition={{ duration: 0.6 }}
                    data-testid={`img-product-${i}`}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <motion.div
                    className="absolute bottom-4 start-4 end-4 flex items-end justify-between"
                    animate={{ y: hoveredIdx === i ? -4 : 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h3 className="text-white text-xl font-bold drop-shadow-lg" data-testid={`text-product-title-${i}`}>
                      {t(product.titleAr, product.titleEn)}
                    </h3>
                    <motion.div
                      className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: hoveredIdx === i ? 1 : 0, opacity: hoveredIdx === i ? 1 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {productIcons[i] || <Sparkles className="w-5 h-5" />}
                    </motion.div>
                  </motion.div>
                </div>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t(product.descAr, product.descEn)}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mt-10"
        >
          <a href="/products" data-testid="link-all-products">
            <Button variant="outline" size="lg" className="group gap-2">
              {t("عرض جميع المنتجات", "View All Products")}
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform rtl:rotate-180 rtl:group-hover:-translate-x-1" />
            </Button>
          </a>
        </motion.div>
      </div>
    </section>
  );
}

function WhyTeakSection() {
  const { t } = useLanguage();

  const reasons = [
    {
      icon: <Shield className="w-7 h-7" />,
      titleAr: "ضمان 5 سنوات",
      titleEn: "5-Year Warranty",
      descAr: "نضمن جودة منتجاتنا لمدة 5 سنوات كاملة — راحة بال حقيقية لك ولعائلتك",
      descEn: "We guarantee our product quality for 5 full years — real peace of mind for you and your family",
    },
    {
      icon: <Truck className="w-7 h-7" />,
      titleAr: "تركيب مجاني",
      titleEn: "Free Installation",
      descAr: "توصيل وتركيب مجاني في جازان وخميس مشيط وأبها وجميع مدن المنطقة",
      descEn: "Free delivery & installation in Jazan, Khamis Mushait, Abha, and all regional cities",
    },
    {
      icon: <PenTool className="w-7 h-7" />,
      titleAr: "تصميم مجاني",
      titleEn: "Free Design",
      descAr: "فريق تصميم محترف يرسم لك مطبخك أو خزانتك مجاناً قبل البدء بالتنفيذ",
      descEn: "A professional design team draws your kitchen or wardrobe for free before execution begins",
    },
    {
      icon: <Globe2 className="w-7 h-7" />,
      titleAr: "مواد أوروبية",
      titleEn: "European Materials",
      descAr: "خشب شيبورد إيطالي واكسسوارات ألمانية وخشب سويدي — جودة لا تتنازل عنها",
      descEn: "Italian chipboard, German accessories, and Swedish wood — uncompromising quality",
    },
    {
      icon: <HeartHandshake className="w-7 h-7" />,
      titleAr: "خدمة ما بعد البيع",
      titleEn: "After-Sales Service",
      descAr: "نحن معك حتى بعد التسليم — فريق دعم متاح لأي استفسار أو صيانة",
      descEn: "We're with you even after delivery — a support team available for any inquiry or maintenance",
    },
    {
      icon: <MapPin className="w-7 h-7" />,
      titleAr: "فروع في 5 مدن",
      titleEn: "Branches in 5 Cities",
      descAr: "نتواجد في جازان وخميس مشيط وأبها وحائل والرياض لخدمتك أينما كنت",
      descEn: "Present in Jazan, Khamis Mushait, Abha, Hail, and Riyadh to serve you wherever you are",
    },
  ];

  return (
    <section className="py-20 sm:py-28 bg-card/50" data-testid="section-why-teak">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-4 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full border border-primary/20 mb-4">
            {t("لماذا تيك؟", "Why Teak?")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" data-testid="text-why-teak-heading">
            {t("لماذا تختار مصنع تيك؟", "Why Choose Teak Factory?")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t(
              "6 أسباب تجعلنا الخيار الأول لتفصيل مطابخ وخزائن وأبواب فاخرة في السعودية",
              "6 reasons that make us the first choice for custom kitchens, wardrobes, and luxury doors in Saudi Arabia"
            )}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {reasons.map((reason, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              data-testid={`card-why-teak-${i}`}
            >
              <Card className="h-full hover:border-primary/40 hover:shadow-md transition-all duration-300">
                <CardContent className="p-6 flex flex-col gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    {reason.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-2" data-testid={`text-why-teak-title-${i}`}>
                      {t(reason.titleAr, reason.titleEn)}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t(reason.descAr, reason.descEn)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center mt-10"
        >
          <a href="/request-quote" data-testid="link-why-teak-quote">
            <Button size="lg" className="min-w-[220px] text-base font-bold gap-2">
              <CheckCircle2 className="w-5 h-5" />
              {t("احصل على عرض سعر مجاني", "Get a Free Quote")}
            </Button>
          </a>
        </motion.div>
      </div>
    </section>
  );
}

function GallerySection() {
  const { t } = useLanguage();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") setLightboxIndex((prev) => prev !== null ? (prev + 1) % galleryImages.length : null);
      if (e.key === "ArrowLeft") setLightboxIndex((prev) => prev !== null ? (prev - 1 + galleryImages.length) % galleryImages.length : null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex]);

  return (
    <section id="gallery" className="py-20 sm:py-28" data-testid="section-gallery">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-4 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full border border-primary/20 mb-4">
            {t("معرض أعمالنا", "Our Gallery")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" data-testid="text-gallery-heading">
            {t("معرض أعمالنا", "Our Gallery")}
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {galleryImages.map((img, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
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
        </div>
      </div>

      <AnimatePresence>
        {lightboxIndex !== null && (
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
              src={galleryImages[lightboxIndex].src}
              alt={t(galleryImages[lightboxIndex].captionAr, galleryImages[lightboxIndex].captionEn)}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
              data-testid="img-lightbox"
            />
            <p className="absolute bottom-8 inset-x-0 text-center text-white text-lg font-medium drop-shadow-lg">
              {t(galleryImages[lightboxIndex].captionAr, galleryImages[lightboxIndex].captionEn)}
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
    <section id="projects" className="py-20 sm:py-28 bg-card/50" data-testid="section-projects">
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

        <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
      value: "0558090498",
      href: "https://wa.me/966558090498",
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
          <a href="https://wa.me/966558090498" target="_blank" rel="noopener noreferrer" data-testid="link-contact-whatsapp">
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
  const { t, lang } = useLanguage();

  const quickLinks = [
    { href: "/", labelAr: "الرئيسية", labelEn: "Home" },
    { href: "/products", labelAr: "منتجاتنا", labelEn: "Products" },
    { href: "/request-quote", labelAr: "طلب عرض سعر", labelEn: "Request Quote" },
    { href: "/track-order", labelAr: "تتبع طلبك", labelEn: "Track Order" },
    { href: "/portal/login", labelAr: "بوابة العملاء", labelEn: "Customer Portal" },
    { href: "/employee-login", labelAr: "دخول الموظفين", labelEn: "Employee Login" },
  ];

  return (
    <footer className="border-t border-border bg-card/50 py-12 sm:py-16" data-testid="section-footer">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
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
                  {t("مطابخ • خزائن • أبواب • ديكورات", "Kitchens • Wardrobes • Doors • Decorations")}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(
                "مصنع تيك للصناعات الخشبية - خميس مشيط، المملكة العربية السعودية",
                "Teak Wood Products Factory - Khamis Mushait, Saudi Arabia"
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
                  data-testid={`link-footer-${link.labelEn.toLowerCase().replace(/\s/g, '-')}`}
                >
                  {t(link.labelAr, link.labelEn)}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-4">{t("تواصل معنا", "Contact Us")}</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <a href="tel:0173250090" className="hover:text-foreground transition-colors flex items-center gap-2" dir="ltr">
                <Phone className="w-4 h-4" /> 017 325 0090
              </a>
              <a href="https://wa.me/966558090498" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors flex items-center gap-2" dir="ltr">
                <SiWhatsapp className="w-4 h-4" /> 055 809 0498
              </a>
              <a href="mailto:info@teak2030.net" className="hover:text-foreground transition-colors flex items-center gap-2" dir="ltr">
                <Mail className="w-4 h-4" /> info@teak2030.net
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
      <AboutSection />
      <CEOSection />
      <ProductsSection />
      <WhyTeakSection />
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
