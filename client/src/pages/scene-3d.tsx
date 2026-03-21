import { Suspense, useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RotateCcw, Package, ArrowLeft, Trash2, Share2, Loader2, RefreshCw, Search } from "lucide-react";
import { Link } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const SCALE = 0.01;

const PRODUCT_COLORS = [
  "#8B4513", "#D2691E", "#CD853F", "#A0522D", "#6B3A2A",
  "#5C4033", "#4A2C2A", "#795548", "#8D6E63", "#A1887F",
];

function Room({ length = 400, width = 300, height = 240 }: { length: number; width: number; height: number }) {
  const L = length * SCALE;
  const W = width * SCALE;
  const H = height * SCALE;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial color="#E8DCC8" side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]}>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial color="#F5F0E8" opacity={0.3} transparent />
      </mesh>
      <mesh position={[0, H / 2, -W / 2]}>
        <planeGeometry args={[L, H]} />
        <meshStandardMaterial color="#EDE8E0" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, H / 2, W / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[L, H]} />
        <meshStandardMaterial color="#EDE8E0" opacity={0.15} transparent side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-L / 2, H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#E8E0D8" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[L / 2, H / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#E8E0D8" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function FurnitureItem({
  product, index, roomL, roomW, selected, onSelect,
}: {
  product: any; index: number; roomL: number; roomW: number; selected: boolean; onSelect: (idx: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = PRODUCT_COLORS[index % PRODUCT_COLORS.length];
  const W = (product.width || product.dimensions?.w || 60) * SCALE;
  const H = (product.height || product.dimensions?.h || 180) * SCALE;
  const D = (product.depth || product.dimensions?.d || 55) * SCALE;
  const L = roomL * SCALE;
  const rW = roomW * SCALE;

  const wallIndex = product.wallIndex || 0;
  const posInWall = product.positionInWall || index;
  let x = 0, z = 0, rotY = 0;

  if (wallIndex === 0) {
    const spacing = L / (5 + 1);
    x = -L / 2 + spacing * ((posInWall % 5) + 1);
    z = -rW / 2 + D / 2;
  } else if (wallIndex === 1) {
    const spacing = rW / (5 + 1);
    x = L / 2 - D / 2;
    z = -rW / 2 + spacing * ((posInWall % 5) + 1);
    rotY = -Math.PI / 2;
  } else if (wallIndex === 2) {
    const spacing = L / (5 + 1);
    x = -L / 2 + spacing * ((posInWall % 5) + 1);
    z = rW / 2 - D / 2;
    rotY = Math.PI;
  } else {
    const spacing = rW / (5 + 1);
    x = -L / 2 + D / 2;
    z = -rW / 2 + spacing * ((posInWall % 5) + 1);
    rotY = Math.PI / 2;
  }
  const y = H / 2;

  const displayColor = selected ? "#FFD700" : hovered ? "#C0A060" : color;

  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onSelect(index); }}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color={displayColor} roughness={0.8} metalness={0.1} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(W, H, D)]} />
        <lineBasicMaterial color={selected ? "#B8860B" : "#5C3A1A"} />
      </lineSegments>
      {(hovered || selected) && (
        <Text
          position={[0, H / 2 + 0.12, 0]}
          fontSize={0.07}
          color="white"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.005}
          outlineColor="black"
        >
          {product.nameAr || product.code || `Item ${index + 1}`}
        </Text>
      )}
    </group>
  );
}

function Scene({ survey, selectedIdx, onSelect }: { survey: any; selectedIdx: number; onSelect: (i: number) => void }) {
  const roomDims = survey.roomDimensions || { length: 400, width: 300, height: 240 };
  const L = parseFloat(roomDims.length) || 400;
  const W = parseFloat(roomDims.width) || 300;
  const H = parseFloat(roomDims.height) || 240;
  const products = (survey.selectedProducts || []) as any[];

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, H * SCALE * 1.5, W * SCALE * 2]} fov={60} />
      <OrbitControls enableDamping dampingFactor={0.05} minDistance={1} maxDistance={20} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
      <pointLight position={[0, H * SCALE * 0.8, 0]} intensity={0.3} />

      <Room length={L} width={W} height={H} />

      {products.map((p: any, i: number) => (
        <FurnitureItem
          key={`${i}-${p.code || p.productId}`}
          product={p}
          index={i}
          roomL={L}
          roomW={W}
          selected={selectedIdx === i}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

export default function Scene3DPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const surveyId = params.get("surveyId");
  const appointmentIdParam = params.get("appointmentId");
  const isPublic = params.get("public") === "1";
  const quotationIdParam = params.get("quotationId");
  const [key, setKey] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState(-1);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const [replaceSearch, setReplaceSearch] = useState("");

  const tokenParam = params.get("token");
  const [isPortalAuth, setIsPortalAuth] = useState(false);

  useEffect(() => {
    if (isPublic) {
      fetch("/api/customer-portal/profile", { credentials: "include" })
        .then(res => { if (res.ok) setIsPortalAuth(true); })
        .catch(() => {});
    }
  }, [isPublic]);

  const canEdit = isPublic && isPortalAuth;

  const { data: survey, isLoading } = useQuery<any>({
    queryKey: ["/api/site-surveys", surveyId, appointmentIdParam, isPublic, tokenParam],
    queryFn: async () => {
      if (isPublic && surveyId) {
        const tokenQuery = tokenParam ? `?token=${tokenParam}` : "";
        const res = await fetch(`/api/public/3d-scene/${surveyId}${tokenQuery}`, { credentials: "include" });
        if (!res.ok) throw new Error("Not found");
        return res.json();
      }
      let data: any;
      if (surveyId) {
        const res = await fetch(`/api/site-surveys/${surveyId}`, { credentials: "include" });
        if (!res.ok) throw new Error("Not found");
        data = await res.json();
      } else if (appointmentIdParam) {
        const res = await fetch(`/api/appointments/${appointmentIdParam}/site-survey`, { credentials: "include" });
        if (!res.ok) throw new Error("Not found");
        data = await res.json();
        if (!data) throw new Error("No survey for this appointment");
      } else {
        throw new Error("No survey id");
      }
      data.roomDimensions = {
        length: parseFloat(data.roomLength || "400"),
        width: parseFloat(data.roomWidth || "300"),
        height: parseFloat(data.roomHeight || "240"),
      };
      return data;
    },
    enabled: !!(surveyId || appointmentIdParam),
    staleTime: 30000,
  });

  const selectedProducts = useMemo(() => (survey?.selectedProducts || []) as any[], [survey]);

  const subtotal = useMemo(() =>
    selectedProducts.reduce((s: number, p: any) => {
      const price = Number(p.price || p.unitPrice || p.priceBeforeVat || 0);
      const optCost = Number(p.optionsCost || 0);
      return s + (price + optCost) * (p.quantity || 1);
    }, 0),
    [selectedProducts]
  );

  const removeProductMutation = useMutation({
    mutationFn: async (productIndex: number) => {
      const qId = survey?.quotationId || quotationIdParam;
      if (!qId) throw new Error("No quotation");
      const updatedProducts = selectedProducts.filter((_: any, i: number) => i !== productIndex);
      const res = await fetch("/api/customer-portal/update-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          quotationId: parseInt(qId),
          products: updatedProducts,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Error" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("تم حذف المنتج", "Product removed") });
      setSelectedProduct(-1);
      queryClient.invalidateQueries({ queryKey: ["/api/site-surveys", surveyId, isPublic, tokenParam] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/my-data"] });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const { data: adekoProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/adeko-products-3d"],
    queryFn: async () => {
      const res = await fetch("/api/adeko-products?limit=500", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.products || []);
    },
    enabled: replacingIndex !== null,
    staleTime: 120000,
  });

  const filteredReplacements = useMemo(() => {
    if (!replaceSearch.trim()) return adekoProducts.slice(0, 30);
    const q = replaceSearch.toLowerCase();
    return adekoProducts.filter((p: any) =>
      p.code?.toLowerCase().includes(q) ||
      p.descriptionAr?.toLowerCase().includes(q) ||
      p.descriptionEn?.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [adekoProducts, replaceSearch]);

  const replaceProductMutation = useMutation({
    mutationFn: async ({ index, newProductId }: { index: number; newProductId: number }) => {
      const qId = survey?.quotationId || quotationIdParam;
      if (!qId) throw new Error("No quotation");
      const adeko = adekoProducts.find((p: any) => p.id === newProductId);
      if (!adeko) throw new Error("Product not found");

      const replacement = {
        productId: adeko.id,
        code: adeko.code,
        nameAr: adeko.descriptionAr || adeko.code,
        name: adeko.descriptionAr || adeko.code,
        unitPrice: parseFloat(adeko.priceBeforeVat?.toString() || "0"),
        quantity: selectedProducts[index]?.quantity || 1,
        optionsCost: selectedProducts[index]?.optionsCost || 0,
        optionDetails: selectedProducts[index]?.optionDetails || {},
        dimensions: {
          w: parseFloat(adeko.designW?.toString() || adeko.manufacturingW?.toString() || "0"),
          h: parseFloat(adeko.designH?.toString() || adeko.manufacturingH?.toString() || "0"),
          d: parseFloat(adeko.designD?.toString() || adeko.manufacturingD?.toString() || "0"),
        },
      };

      const updatedProducts = [...selectedProducts];
      updatedProducts[index] = replacement;

      const res = await fetch("/api/customer-portal/update-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ quotationId: parseInt(qId), products: updatedProducts }),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("تم استبدال المنتج", "Product replaced") });
      setReplacingIndex(null);
      setReplaceSearch("");
      queryClient.invalidateQueries({ queryKey: ["/api/site-surveys", surveyId, isPublic, tokenParam] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/my-data"] });
    },
    onError: () => {
      toast({ title: t("حدث خطأ في الاستبدال", "Replacement error"), variant: "destructive" });
    },
  });

  const handleShare = useCallback(() => {
    const token = survey?.shareToken || "";
    const shareUrl = `${window.location.origin}/view-3d?surveyId=${surveyId}&public=1${token ? `&token=${token}` : ""}`;
    if (navigator.share) {
      navigator.share({
        title: t("تصميم ثلاثي الأبعاد - تيك", "3D Design - Teak"),
        text: t("شاهد التصميم ثلاثي الأبعاد", "View the 3D design"),
        url: shareUrl,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast({ title: t("تم نسخ الرابط", "Link copied") });
    }
  }, [surveyId, survey, t, toast]);

  if (!surveyId) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">{t("لم يتم تحديد زيارة ميدانية", "No site survey specified")}</p>
        <Link href="/my-calendar"><Button variant="outline" className="mt-4">{t("العودة للتقويم", "Back to Calendar")}</Button></Link>
      </div>
    );
  }

  const roomDims = survey?.roomDimensions || {
    length: parseFloat(survey?.roomLength || "400"),
    width: parseFloat(survey?.roomWidth || "300"),
    height: parseFloat(survey?.roomHeight || "240"),
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="p-3 border-b flex items-center justify-between bg-background z-10">
        <div className="flex items-center gap-3">
          {!isPublic && (
            <Link href="/my-calendar">
              <Button variant="ghost" size="sm" data-testid="btn-back-to-calendar">
                <ArrowLeft className="h-4 w-4 me-1" />{t("التقويم", "Calendar")}
              </Button>
            </Link>
          )}
          <div>
            <h1 className="font-bold text-sm">{t("التصور ثلاثي الأبعاد", "3D Visualization")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("الغرفة:", "Room:")} {roomDims.length}×{roomDims.width}×{roomDims.height} cm
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Package className="h-3 w-3" /> {selectedProducts.length} {t("منتج", "products")}
          </Badge>
          <Badge variant="secondary" className="font-bold">
            {(() => { const d = parseFloat(survey?.discount || "0"); return ((subtotal - d) * 1.15).toLocaleString(undefined, { maximumFractionDigits: 0 }); })()} {t("ر.س", "SAR")}
          </Badge>
          <Button size="sm" variant="outline" onClick={handleShare} data-testid="btn-share-3d">
            <Share2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setKey(k => k + 1); setSelectedProduct(-1); }} data-testid="btn-reset-camera">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative bg-gradient-to-b from-sky-100 to-sky-200">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p>{t("جاري التحميل...", "Loading...")}</p>
            </div>
          )}
          {survey && (
            <Canvas key={key} shadows>
              <Suspense fallback={null}>
                <Scene survey={survey} selectedIdx={selectedProduct} onSelect={setSelectedProduct} />
              </Suspense>
            </Canvas>
          )}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/40 text-white text-xs px-3 py-1 rounded-full">
            {t("اسحب للتدوير • اضغط على منتج لتحديده • Scroll للتقريب", "Drag to rotate • Click product to select • Scroll to zoom")}
          </div>
        </div>

        <div className="w-72 border-s overflow-y-auto bg-background hidden md:block">
          <div className="p-3 border-b">
            <h2 className="font-semibold text-sm">{t("قائمة المنتجات", "Products List")}</h2>
          </div>
          {selectedProducts.length === 0 ? (
            <p className="p-4 text-muted-foreground text-sm text-center">{t("لا توجد منتجات", "No products")}</p>
          ) : (
            <div className="p-2 space-y-2">
              {selectedProducts.map((p: any, i: number) => {
                const isSelected = selectedProduct === i;
                const price = Number(p.price || p.unitPrice || p.priceBeforeVat || 0);
                const optCost = Number(p.optionsCost || 0);
                return (
                  <Card
                    key={i}
                    className={`overflow-hidden cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary" : ""}`}
                    onClick={() => setSelectedProduct(isSelected ? -1 : i)}
                    data-testid={`product-3d-${i}`}
                  >
                    <CardContent className="p-2">
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-sm mt-1 flex-shrink-0"
                          style={{ backgroundColor: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium line-clamp-1">{p.nameAr || p.code || `Item ${i + 1}`}</p>
                          {p.code && <p className="text-[10px] text-muted-foreground">{p.code}</p>}
                          <p className="text-[10px]">
                            {p.width || p.dimensions?.w || "—"}×{p.height || p.dimensions?.h || "—"}×{p.depth || p.dimensions?.d || "—"} cm
                            {p.quantity > 1 && ` × ${p.quantity}`}
                          </p>
                          <p className="text-xs font-bold text-primary">
                            {((price + optCost) * (p.quantity || 1)).toLocaleString()} {t("ر.س", "SAR")}
                          </p>
                          {p.optionDetails && Object.keys(p.optionDetails).length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {Object.entries(p.optionDetails).map(([key, val]: any) => (
                                <p key={key} className="text-[9px] text-muted-foreground">
                                  {key}: {val.name} (+{val.price} {t("ر.س", "SAR")})
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                        {isSelected && canEdit && (survey?.quotationId || quotationIdParam) && (
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={(e) => { e.stopPropagation(); removeProductMutation.mutate(i); }}
                              disabled={removeProductMutation.isPending}
                              data-testid={`btn-remove-product-${i}`}
                            >
                              {removeProductMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-blue-600"
                              onClick={(e) => { e.stopPropagation(); setReplacingIndex(replacingIndex === i ? null : i); setReplaceSearch(""); }}
                              data-testid={`btn-replace-product-${i}`}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {replacingIndex === i && (
                        <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-md space-y-1.5" onClick={(e) => e.stopPropagation()}>
                          <p className="text-[10px] font-medium text-blue-700 dark:text-blue-300">{t("استبدال بمنتج آخر", "Replace with another product")}</p>
                          <div className="relative">
                            <Search className="absolute start-2 top-1.5 w-3 h-3 text-muted-foreground" />
                            <Input
                              className="h-7 ps-7 text-[10px]"
                              placeholder={t("ابحث...", "Search...")}
                              value={replaceSearch}
                              onChange={(e) => setReplaceSearch(e.target.value)}
                              data-testid={`input-replace-search-${i}`}
                            />
                          </div>
                          <div className="max-h-32 overflow-y-auto space-y-0.5">
                            {filteredReplacements.map((rp: any) => (
                              <button
                                key={rp.id}
                                className="w-full text-start text-[10px] p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 flex justify-between items-center"
                                onClick={() => replaceProductMutation.mutate({ index: i, newProductId: rp.id })}
                                disabled={replaceProductMutation.isPending}
                                data-testid={`btn-select-replacement-${rp.id}`}
                              >
                                <span className="truncate flex-1">{t(rp.descriptionAr || rp.code, rp.descriptionEn || rp.code)}</span>
                                <span className="text-muted-foreground ms-1 shrink-0">{parseFloat(rp.priceBeforeVat || 0).toLocaleString()} SAR</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              <div className="mt-3 p-3 bg-muted rounded-lg space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("المجموع", "Subtotal")}</span>
                  <span>{subtotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} {t("ر.س", "SAR")}</span>
                </div>
                {survey?.discount && parseFloat(survey.discount) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>{t("الخصم", "Discount")}</span>
                    <span>-{parseFloat(survey.discount).toLocaleString()} {t("ر.س", "SAR")}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("الضريبة 15%", "VAT 15%")}</span>
                  <span>{(() => { const d = parseFloat(survey?.discount || "0"); return ((subtotal - d) * 0.15).toLocaleString(undefined, { maximumFractionDigits: 0 }); })()} {t("ر.س", "SAR")}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1">
                  <span>{t("الإجمالي", "Total")}</span>
                  <span className="text-primary">{(() => { const d = parseFloat(survey?.discount || "0"); return ((subtotal - d) * 1.15).toLocaleString(undefined, { maximumFractionDigits: 0 }); })()} {t("ر.س", "SAR")}</span>
                </div>
              </div>

              {survey?.quotationId && !isPublic && (
                <Link href={`/quotations/${survey.quotationId}`}>
                  <Button className="w-full mt-2" size="sm" data-testid="btn-go-to-quotation">
                    {t("عرض طلب السعر", "View Quotation")}
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
