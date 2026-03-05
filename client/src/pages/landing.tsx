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
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import logoAr from "@assets/logo_teak1_1772689915503.png";
import logoEn from "@assets/logo_teak2_1772689894105.png";
import teakLogoWhite from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

const heroSlides = [
  {
    image: "/images/products/kitchen_modern.jpg",
    titleAr: "مطابخ عصرية",
    titleEn: "Modern Kitchens",
    subtitleAr: "الابداع في بساطة التصاميم",
    subtitleEn: "Creativity in the simplicity of design",
  },
  {
    image: "/images/products/kitchen_classic.jpg",
    titleAr: "نيو كلاسيك",
    titleEn: "Neo Classic",
    subtitleAr: "المفهوم العصري للمطابخ الكلاسيكية",
    subtitleEn: "The modern concept of classic kitchens",
  },
  {
    image: "/images/products/kitchen_neo_classic.jpg",
    titleAr: "نيو كلاسيك",
    titleEn: "Neo Classic",
    subtitleAr: "نوستلجيا الماضي الجميل بطريقة حديثة",
    subtitleEn: "Nostalgia of the beautiful past in a modern way",
  },
  {
    image: "/images/products/kitchen_modern2.jpg",
    titleAr: "مطابخ مودرن",
    titleEn: "Modern Kitchens",
    subtitleAr: "تصاميم مبتكرة تواكب العصر",
    subtitleEn: "Innovative designs keeping up with modern times",
  },
];

const productCards = [
  {
    image: "/images/products/kitchen_main.jpg",
    titleAr: "المطابخ",
    titleEn: "Kitchens",
    descAr: "مصنعة من خشب شيبورد الإيطالي واكسسوارات ألمانية",
    descEn: "Made from Italian chipboard with German accessories",
  },
  {
    image: "/images/products/wardrobe.jpg",
    titleAr: "الخزائن",
    titleEn: "Wardrobes",
    descAr: "مصنعة من خشب شيبورد الإيطالي واكسسوارات ألمانية",
    descEn: "Made from Italian chipboard with German accessories",
  },
  {
    image: "/images/products/door_natural.jpg",
    titleAr: "أبواب خشب طبيعي",
    titleEn: "Natural Wood Doors",
    descAr: "مصنعة من الخشب السويدي مكسي بقشر الجوز وخشب البلوط",
    descEn: "Made from Swedish wood with walnut and oak veneer",
  },
  {
    image: "/images/products/door_chipboard.jpg",
    titleAr: "أبواب شيبورد",
    titleEn: "Chipboard Doors",
    descAr: "مصنعة من خشب شيبورد الإيطالي",
    descEn: "Made from Italian chipboard",
  },
  {
    image: "/images/products/decoration.jpg",
    titleAr: "ديكورات خشبية",
    titleEn: "Wood Decorations",
    descAr: "مصنعة من خشب شيبورد الايطالي المقاوم للماء والرطوبة",
    descEn: "Made from Italian water & moisture resistant chipboard",
  },
];

const galleryImages = [
  { src: "/images/gallery/gallery_mosque.jpg", captionAr: "ديكورات مسجد وضحي الرياض – حي اليرموك", captionEn: "Wadhi Mosque Decorations - Riyadh, Al Yarmouk" },
  { src: "/images/gallery/gallery_kitchen_art.jpg", captionAr: "عندما يتحول مطبخك لتحفة فنية", captionEn: "When your kitchen becomes a masterpiece" },
  { src: "/images/gallery/gallery_design1.jpg", captionAr: "من تصميمنا", captionEn: "Our Design" },
  { src: "/images/gallery/gallery_design2.jpg", captionAr: "من تصميمنا", captionEn: "Our Design" },
  { src: "/images/gallery/gallery_wardrobe_luxury.jpg", captionAr: "فخامة التصميم والألوان للخزائن", captionEn: "Luxury design and colors for wardrobes" },
  { src: "/images/gallery/gallery_design3.jpg", captionAr: "من تصميمنا", captionEn: "Our Design" },
  { src: "/images/gallery/gallery_design4.jpg", captionAr: "من تصميمنا", captionEn: "Our Design" },
  { src: "/images/gallery/gallery_sayyar_jeddah.jpg", captionAr: "ديكورات معرض سيار مدينة جدة", captionEn: "Sayyar Showroom Decorations - Jeddah" },
];

const projectCards = [
  { image: "/images/projects/project_khamis.jpg", titleAr: "تركيب مطبخ بمدينة خميس مشيط", titleEn: "Kitchen Installation - Khamis Mushait" },
  { image: "/images/projects/project_abha_wardrobe.jpg", titleAr: "تركيب سرير وغرفة خزائن في مدينة أبها", titleEn: "Bed & Wardrobe Room Installation - Abha" },
  { image: "/images/projects/project_abha_closet.jpg", titleAr: "تركيب خزائن بمدينة أبها", titleEn: "Wardrobe Installation - Abha" },
  { image: "/images/projects/project_hail_sayyar.jpg", titleAr: "ديكورات معرض سيار بمدينة حائل", titleEn: "Sayyar Showroom Decorations - Hail" },
  { image: "/images/projects/project_modern_kitchen.jpg", titleAr: "تركيب مطبخ مودرن", titleEn: "Modern Kitchen Installation" },
  { image: "/images/projects/project_classic_jazan.jpg", titleAr: "تركيب مطبخ نيو كلاسيك بجازان", titleEn: "Neo Classic Kitchen Installation - Jazan" },
  { image: "/images/projects/project_bahah.jpg", titleAr: "مشروع الباحة", titleEn: "Al Baha Project" },
  { image: "/images/projects/project_sayyar_decor.jpg", titleAr: "ديكورات معرض سيار", titleEn: "Sayyar Showroom Decorations" },
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
              src={showWhiteLogo ? teakLogoWhite : (lang === "ar" ? logoAr : logoEn)}
              alt="Teak Logo"
              className="h-12 sm:h-14 w-auto object-contain transition-all duration-300"
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
            <a href="/login" data-testid="link-login">
              <Button
                size="sm"
                variant={isOnHero ? "secondary" : "outline"}
                className={`hidden lg:inline-flex ${isOnHero ? "bg-white/15 backdrop-blur-sm text-white border-white/20 hover:bg-white/25" : ""}`}
              >
                {t("تسجيل الدخول", "Sign In")}
              </Button>
            </a>
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
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="px-4 py-3 text-sm font-medium rounded-md bg-primary text-primary-foreground text-center"
                data-testid="link-login-mobile"
              >
                {t("تسجيل الدخول", "Sign In")}
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
            {t("مطابخ - خزائن - أبواب - ديكورات", "Kitchens - Wardrobes - Doors - Decorations")}
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
                  "تأسـس مـصـنــع تيـك للصناعـات الخشـبية تحـت إشـراف أفضـل الكفـاءات الفنيـة والإداريـة صاحبـة الدراسة الأكاديمية والخبرة العملية لتلبية احتياجات المجتمع السعودي في القطاعين الحكومي والخاص للمساهمة الفعالة في النهضة العمرانية التي تشهدها المملكة العربية السعودية لينافس المؤسسات والشركات والمصانع والهيئات الرائدة في مجال الصناعات الخشبية.",
                  "Teak Wood Products Factory was established under the supervision of the finest technical and administrative professionals with academic qualifications and practical experience to meet the needs of Saudi society in both government and private sectors, contributing effectively to the urban development witnessed by the Kingdom of Saudi Arabia, competing with leading institutions, companies, factories and organizations in the wood products industry."
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
                    "السلام عليكم ورحمة الله وبركاته … وبعد\n\nإنه لمن دواعي سروري أن أرحب بكم عملاء معارض ومصنع تيك للصناعات الخشبية لتلبية احتياجاتكم وتطلعاتكم المتجددة، ونطمح أن يشارك مصنع تيك في نهضة الصناعة التي تشهدها المملكة ونحاول قدر المستطاع أن نحظي بثقة عملائنا وتقديم كل ما هو جديد في مجال الصناعات الخشبية وذلك على مستوى عال باستخدام التقنيات الحديثة وتعيين الكوادر الفنية والإدارية لنقدم منتج بأعلى مواصفات في وقت قياسي.\n\nنسأل المولي عز وجل أن يحفظ مليكنا وولي عهده وأن يديم على بلادنا نعمة الأمن والأمان والاستقرار.",
                    "Peace be upon you.\n\nIt is my pleasure to welcome you, clients of Teak Wood Products Factory showrooms and factory, to meet your needs and renewed aspirations. We aspire to participate in the industrial renaissance the Kingdom is witnessing, striving to earn the trust of our clients by providing the latest in wood products manufacturing using modern technologies and qualified technical and administrative staff to deliver products with the highest specifications in record time.\n\nWe ask God to preserve our King and Crown Prince and to maintain the blessings of security and stability in our country."
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
      gMapsLink: "https://maps.app.goo.gl/Y4FHN6vXRgr2qPuv9",
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
  const { t } = useLanguage();

  const quickLinks = [
    { href: "/", labelAr: "الرئيسية", labelEn: "Home" },
    { href: "/products", labelAr: "منتجاتنا", labelEn: "Products" },
    { href: "/request-quote", labelAr: "طلب عرض سعر", labelEn: "Request Quote" },
    { href: "/track-order", labelAr: "تتبع طلبك", labelEn: "Track Order" },
  ];

  return (
    <footer className="border-t border-border bg-card/50 py-12 sm:py-16" data-testid="section-footer">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <img
                src={lang === "ar" ? logoAr : logoEn}
                alt="Teak Logo"
                className="w-10 h-10 object-contain"
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

        <div className="pt-8 border-t border-border text-center">
          <p className="text-xs text-muted-foreground" data-testid="text-copyright">
            {t(
              `© ${new Date().getFullYear()} مصنع تيك للصناعات الخشبية. جميع الحقوق محفوظة.`,
              `© ${new Date().getFullYear()} Teak Wood Products Factory. All rights reserved.`
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
          className="fixed bottom-6 end-6 z-50 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg"
          data-testid="button-scroll-top"
        >
          <ArrowUp className="w-4 h-4" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function WhatsAppFAB() {
  return (
    <a
      href="https://wa.me/966558090498"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 start-6 z-50 w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg transition-colors"
      data-testid="button-whatsapp-fab"
      aria-label="WhatsApp"
    >
      <SiWhatsapp className="w-7 h-7" />
    </a>
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
      <GallerySection />
      <ProjectsSection />
      <StatsSection />
      <MapSection />
      <ContactSection />
      <Footer />
      <ScrollToTop />
      <WhatsAppFAB />
    </div>
  );
}
