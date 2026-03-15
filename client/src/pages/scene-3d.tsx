import { Suspense, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, PerspectiveCamera, Text } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, ZoomIn, ZoomOut, Eye, Package, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const SCALE = 0.01; // cm to meters

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
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial color="#E8DCC8" side={THREE.DoubleSide} />
      </mesh>
      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]}>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial color="#F5F0E8" opacity={0.3} transparent />
      </mesh>
      {/* Back wall (North) */}
      <mesh position={[0, H / 2, -W / 2]}>
        <planeGeometry args={[L, H]} />
        <meshStandardMaterial color="#EDE8E0" side={THREE.DoubleSide} />
      </mesh>
      {/* Front wall (South) */}
      <mesh position={[0, H / 2, W / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[L, H]} />
        <meshStandardMaterial color="#EDE8E0" opacity={0.15} transparent side={THREE.DoubleSide} />
      </mesh>
      {/* Left wall (East) */}
      <mesh position={[-L / 2, H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#E8E0D8" side={THREE.DoubleSide} />
      </mesh>
      {/* Right wall (West) */}
      <mesh position={[L / 2, H / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#E8E0D8" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function FurnitureItem({
  product, index, roomL, roomW, roomH
}: {
  product: any; index: number; roomL: number; roomW: number; roomH: number;
}) {
  const [hovered, setHovered] = useState(false);
  const color = PRODUCT_COLORS[index % PRODUCT_COLORS.length];
  const W = (product.width || 60) * SCALE;
  const H = (product.height || 180) * SCALE;
  const D = (product.depth || 55) * SCALE;
  const L = roomL * SCALE;
  const rW = roomW * SCALE;

  // Place items along the north wall with spacing
  const spacing = L / (5 + 1);
  const x = -L / 2 + spacing * ((index % 5) + 1);
  const z = -rW / 2 + D / 2;
  const y = H / 2;

  return (
    <group position={[x, y, z]}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color={hovered ? "#C0A060" : color} roughness={0.8} metalness={0.1} />
      </mesh>
      {/* Cabinet lines */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(W, H, D)]} />
        <lineBasicMaterial color="#5C3A1A" />
      </lineSegments>
      {hovered && (
        <Text
          position={[0, H / 2 + 0.1, 0]}
          fontSize={0.08}
          color="white"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.005}
          outlineColor="black"
        >
          {product.nameAr || product.code}
        </Text>
      )}
    </group>
  );
}

function Scene({ survey }: { survey: any }) {
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

      {products.map((p, i) => (
        <FurnitureItem key={i} product={p} index={i} roomL={L} roomW={W} roomH={H} />
      ))}
    </>
  );
}

export default function Scene3DPage() {
  const { t } = useLanguage();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const surveyId = params.get("surveyId");
  const [key, setKey] = useState(0); // for reset

  const { data: survey, isLoading, error } = useQuery<any>({
    queryKey: ["/api/site-surveys", surveyId],
    queryFn: async () => {
      const res = await fetch(`/api/site-surveys/${surveyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!surveyId,
    staleTime: 30000,
  });

  const roomDims = survey?.roomDimensions || { length: 400, width: 300, height: 240 };
  const selectedProducts = (survey?.selectedProducts || []) as any[];
  const subtotal = selectedProducts.reduce((s: number, p: any) => s + Number(p.price || 0) * (p.quantity || 1), 0);

  if (!surveyId) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">{t("لم يتم تحديد زيارة ميدانية", "No site survey specified")}</p>
        <Link href="/my-calendar"><Button variant="outline" className="mt-4">{t("العودة للتقويم", "Back to Calendar")}</Button></Link>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <div className="p-3 border-b flex items-center justify-between bg-background z-10">
        <div className="flex items-center gap-3">
          <Link href="/my-calendar">
            <Button variant="ghost" size="sm" data-testid="btn-back-to-calendar">
              <ArrowLeft className="h-4 w-4 me-1" />{t("التقويم", "Calendar")}
            </Button>
          </Link>
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
            {(subtotal * 1.15).toLocaleString()} ر.س
          </Badge>
          <Button size="sm" variant="outline" onClick={() => setKey(k => k + 1)} data-testid="btn-reset-camera">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 3D Canvas */}
        <div className="flex-1 relative bg-gradient-to-b from-sky-100 to-sky-200">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p>{t("جاري التحميل...", "Loading...")}</p>
            </div>
          )}
          {survey && (
            <Canvas key={key} shadows>
              <Suspense fallback={null}>
                <Scene survey={survey} />
              </Suspense>
            </Canvas>
          )}
          {/* Controls hint */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/40 text-white text-xs px-3 py-1 rounded-full">
            {t("اسحب للتدوير • اضغط مزدوج للتكبير • Scroll للتقريب", "Drag to rotate • Double-click to zoom • Scroll to zoom")}
          </div>
        </div>

        {/* Sidebar: Product list */}
        <div className="w-72 border-s overflow-y-auto bg-background hidden md:block">
          <div className="p-3 border-b">
            <h2 className="font-semibold text-sm">{t("قائمة المنتجات", "Products List")}</h2>
          </div>
          {selectedProducts.length === 0 ? (
            <p className="p-4 text-muted-foreground text-sm text-center">{t("لا توجد منتجات", "No products")}</p>
          ) : (
            <div className="p-2 space-y-2">
              {selectedProducts.map((p: any, i: number) => (
                <Card key={i} className="overflow-hidden" data-testid={`product-3d-${i}`}>
                  <CardContent className="p-2">
                    <div className="flex items-start gap-2">
                      <div className="w-3 h-3 rounded-sm mt-1 flex-shrink-0"
                        style={{ backgroundColor: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium line-clamp-1">{p.nameAr}</p>
                        <p className="text-[10px] text-muted-foreground">{p.code}</p>
                        <p className="text-[10px]">{p.width}×{p.height}×{p.depth} cm × {p.quantity}</p>
                        <p className="text-xs font-bold text-primary">{(Number(p.price || 0) * (p.quantity || 1)).toLocaleString()} ر.س</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Price summary */}
              <div className="mt-3 p-3 bg-muted rounded-lg space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("المجموع", "Subtotal")}</span>
                  <span>{subtotal.toLocaleString()} ر.س</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("الضريبة 15%", "VAT 15%")}</span>
                  <span>{(subtotal * 0.15).toLocaleString()} ر.س</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1">
                  <span>{t("الإجمالي", "Total")}</span>
                  <span className="text-primary">{(subtotal * 1.15).toLocaleString()} ر.س</span>
                </div>
              </div>

              {/* Action button */}
              {survey?.quotationId && (
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
