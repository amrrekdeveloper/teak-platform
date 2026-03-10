import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import type { Product } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sun, Moon, ArrowLeft, ArrowRight, Package } from "lucide-react";
import { Link } from "wouter";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

const categories = [
  { key: "all", ar: "الكل", en: "All" },
  { key: "kitchen", ar: "مطابخ", en: "Kitchens" },
  { key: "wardrobe", ar: "خزائن ملابس", en: "Wardrobes" },
  { key: "door", ar: "أبواب", en: "Doors" },
  { key: "decoration", ar: "ديكورات", en: "Decorations" },
  { key: "hotel", ar: "تجهيز فنادق", en: "Hotel Furnishing" },
];

export default function ProductsPage() {
  const { lang, toggleLang, t, isRTL } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [activeCategory, setActiveCategory] = useState("all");

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products/public", activeCategory],
    queryFn: async () => {
      const url = activeCategory === "all"
        ? "/api/products/public"
        : `/api/products/public?category=${activeCategory}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/">
                <div className="flex items-center gap-2 cursor-pointer" data-testid="link-home">
                  <BackIcon className="w-4 h-4" />
                  <img src={teakLogo} alt="Teak" className="w-8 h-8 object-contain logo-auto transition-all duration-300" />
                  <span className="font-bold hidden sm:inline">{t("تيك للتصنيع", "Teak Manufacturing")}</span>
                </div>
              </Link>
            </div>
            <div className="flex items-center gap-1">
              <Link href="/request-quote">
                <Button size="sm" data-testid="button-request-quote">
                  {t("طلب عرض سعر", "Request Quote")}
                </Button>
              </Link>
              <Button size="icon" variant="ghost" onClick={toggleLang} data-testid="button-lang">
                <span className="text-xs font-bold">{lang === "ar" ? "EN" : "ع"}</span>
              </Button>
              <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme">
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2" data-testid="text-products-title">
            {t("منتجاتنا", "Our Products")}
          </h1>
          <p className="text-muted-foreground">
            {t("تشكيلة واسعة من المنتجات الخشبية عالية الجودة", "A wide selection of high-quality wood products")}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {categories.map((cat) => (
            <Button
              key={cat.key}
              variant={activeCategory === cat.key ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCategory(cat.key)}
              data-testid={`button-category-${cat.key}`}
            >
              {t(cat.ar, cat.en)}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("لا توجد منتجات في هذه الفئة", "No products in this category")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <Card key={product.id} className="overflow-hidden group" data-testid={`card-product-${product.id}`}>
                <div className="aspect-[4/3] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  {product.images && product.images.length > 0 ? (
                    <img
                      src={product.images[0]}
                      alt={t(product.nameAr, product.nameEn)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <Package className="w-16 h-16 text-primary/30" />
                  )}
                </div>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-lg" data-testid={`text-product-name-${product.id}`}>
                        {t(product.nameAr, product.nameEn)}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {t(product.descriptionAr || "", product.descriptionEn || "")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                      {t(
                        categories.find((c) => c.key === product.category)?.ar || product.category,
                        categories.find((c) => c.key === product.category)?.en || product.category
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
