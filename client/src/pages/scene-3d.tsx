import { Suspense, useState, useMemo, useCallback, useEffect, useRef } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  RotateCcw, Package, ArrowLeft, Trash2, Share2, Loader2,
  RefreshCw, Search, Sun, Moon, Download, Map,
} from "lucide-react";
import { Link } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const SCALE = 0.01;

const GROUP_COLORS: Record<string, string> = {
  TK1: "#8B6340",
  TK2: "#7A5530",
  TK3: "#9A7450",
  TK4: "#6B4A30",
  TK5: "#5A3D25",
  default: "#795548",
};

const PRODUCT_COLORS = [
  "#8B4513", "#D2691E", "#CD853F", "#A0522D", "#6B3A2A",
  "#5C4033", "#4A2C2A", "#795548", "#8D6E63", "#A1887F",
];

function getCabinetColor(product: any, index: number): string {
  const code = product.code || "";
  for (const [prefix, color] of Object.entries(GROUP_COLORS)) {
    if (prefix !== "default" && code.startsWith(prefix)) return color;
  }
  return PRODUCT_COLORS[index % PRODUCT_COLORS.length];
}

function isBaseUnit(product: any): boolean {
  const code = (product.code || "").toUpperCase();
  return code.startsWith("TK1") || code.startsWith("TK2") || code.startsWith("A") || code.startsWith("B");
}

function isTallUnit(product: any): boolean {
  const code = (product.code || "").toUpperCase();
  return code.startsWith("TK4") || code.startsWith("U1");
}

function isWallUnit(product: any): boolean {
  const code = (product.code || "").toUpperCase();
  return code.startsWith("TK3") || code.startsWith("W");
}

function getDefaultHeight(product: any): number {
  if (isTallUnit(product)) return 200;
  if (isWallUnit(product)) return 70;
  return 85;
}

function getDefaultDepth(product: any): number {
  if (isWallUnit(product)) return 35;
  return 60;
}

function DayLighting() {
  return (
    <>
      {/* 6500K daylight: neutral white ambient with slight cool tint */}
      <ambientLight intensity={0.6} color="#EEF4FF" />
      <directionalLight
        position={[6, 10, 6]}
        intensity={1.0}
        color="#F5F8FF"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-radius={4}
      />
      {/* sky fill — cool blue sky bounce */}
      <directionalLight position={[-4, 6, -4]} intensity={0.3} color="#B0CEFF" />
    </>
  );
}

function NightLighting({ roomL, roomW, roomH }: { roomL: number; roomW: number; roomH: number }) {
  const L = roomL * SCALE;
  const W = roomW * SCALE;
  const H = roomH * SCALE;
  const warmColor = "#FFB347";
  const spotY = H * 0.92;
  const spotIntensity = 12;
  const spotAngle = Math.PI / 5;
  const spotPenumbra = 0.4;
  const spotDist = 8;

  return (
    <>
      <ambientLight intensity={0.07} color="#1a1a2e" />
      <hemisphereLight args={["#2a1f0a", "#0a0a1a", 0.08]} />
      <spotLight
        position={[0, spotY, 0]}
        angle={spotAngle}
        penumbra={spotPenumbra}
        intensity={spotIntensity}
        color={warmColor}
        castShadow
        distance={spotDist}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-radius={6}
      />
      <spotLight
        position={[-L * 0.3, spotY, -W * 0.2]}
        angle={spotAngle}
        penumbra={spotPenumbra}
        intensity={spotIntensity * 0.8}
        color={warmColor}
        castShadow={false}
        distance={spotDist}
      />
      <spotLight
        position={[L * 0.3, spotY, W * 0.2]}
        angle={spotAngle}
        penumbra={spotPenumbra}
        intensity={spotIntensity * 0.8}
        color={warmColor}
        castShadow={false}
        distance={spotDist}
      />
      <pointLight position={[0, H * 0.9, 0]} intensity={0.3} color={warmColor} distance={3} />
      {/* visible lamp fixtures — small glowing spheres at ceiling spotlights */}
      {[
        [0, spotY + 0.05, 0],
        [-L * 0.3, spotY + 0.05, -W * 0.2],
        [L * 0.3, spotY + 0.05, W * 0.2],
      ].map(([lx, ly, lz], i) => (
        <mesh key={`lamp-${i}`} position={[lx, ly, lz]}>
          <sphereGeometry args={[0.04, 10, 10]} />
          <meshBasicMaterial color="#FFF0C0" />
        </mesh>
      ))}
    </>
  );
}

function FloorMesh({ L, W }: { L: number; W: number }) {
  const texture = useMemo(() => {
    const size = 512;
    const data = new Uint8Array(size * size * 4);
    const plankW = 64;
    const plankH = 256;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const row = Math.floor(y / plankH);
        const col = Math.floor(x / plankW);
        const offset = (row % 2) * (plankW / 2);
        const px = ((x + offset) % plankW) / plankW;
        const py = (y % plankH) / plankH;
        const grain = Math.sin(py * 40 + col * 1.7) * 8 + Math.sin(px * 15) * 4;
        const border = (px < 0.02 || px > 0.98 || py < 0.005 || py > 0.995) ? -20 : 0;
        const base = 155 + grain + border;
        data[idx] = Math.min(255, Math.max(0, base + 18));
        data[idx + 1] = Math.min(255, Math.max(0, base - 15));
        data[idx + 2] = Math.min(255, Math.max(0, base - 50));
        data[idx + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.ceil(L * 3), Math.ceil(W * 3));
    tex.needsUpdate = true;
    return tex;
  }, [L, W]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[L, W]} />
      <meshStandardMaterial map={texture} roughness={0.75} metalness={0.0} />
    </mesh>
  );
}

function Room({ length = 400, width = 300, height = 240 }: { length: number; width: number; height: number }) {
  const L = length * SCALE;
  const W = width * SCALE;
  const H = height * SCALE;
  const wallMat = <meshStandardMaterial color="#F2ECE4" roughness={0.9} metalness={0.0} />;

  return (
    <group>
      <FloorMesh L={L} W={W} />
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]}>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial color="#FAFAF8" roughness={1} transparent opacity={0.0} />
      </mesh>
      <mesh position={[0, H / 2, -W / 2]} receiveShadow>{wallMat}<planeGeometry args={[L, H]} /></mesh>
      <mesh position={[0, H / 2, W / 2]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[L, H]} />
        <meshStandardMaterial color="#F2ECE4" roughness={0.9} transparent opacity={0.18} />
      </mesh>
      <mesh position={[-L / 2, H / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[W, H]} />{wallMat}
      </mesh>
      <mesh position={[L / 2, H / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[W, H]} />{wallMat}
      </mesh>
    </group>
  );
}

function CabinetFront({ code, W, H, D, color }: { code: string; W: number; H: number; D: number; color: string }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(
      `/products/${code}.bmp`,
      (tex) => {
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        setTexture(tex);
      },
      undefined,
      () => setTexture(null)
    );
    return () => { setTexture(null); };
  }, [code]);

  const faceW = W * 0.88;
  const faceH = H * 0.82;
  const frameDepth = 0.025;

  return (
    <group position={[0, 0, D / 2]}>
      <mesh position={[0, 0, frameDepth + 0.001]} castShadow>
        <planeGeometry args={[faceW, faceH]} />
        <meshStandardMaterial
          color={texture ? "#FFFFFF" : color}
          map={texture || undefined}
          roughness={0.55}
          metalness={0.05}
        />
      </mesh>
    </group>
  );
}

function Cabinet({
  product, index, roomL, roomW, roomH, selected, onSelect,
}: {
  product: any; index: number; roomL: number; roomW: number; roomH: number;
  selected: boolean; onSelect: (idx: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = getCabinetColor(product, index);

  const W = ((product.dimensions?.w || product.designW || 60)) * SCALE;
  const H = ((product.dimensions?.h || product.designH || getDefaultHeight(product))) * SCALE;
  const D = ((product.dimensions?.d || product.designD || getDefaultDepth(product))) * SCALE;

  const L = roomL * SCALE;
  const rW = roomW * SCALE;
  const rH = roomH * SCALE;

  const wallIndex = product.wallIndex ?? 0;
  const posInWall = product.positionInWall ?? index;

  let x = 0, z = 0, rotY = 0;
  const wallOff = isWallUnit(product) ? rH * 0.45 : 0;

  if (wallIndex === 0) {
    const spacing = L / (5 + 1);
    x = -L / 2 + spacing * ((posInWall % 5) + 1);
    z = -rW / 2 + D / 2 + 0.01;
  } else if (wallIndex === 1) {
    const spacing = rW / (5 + 1);
    x = L / 2 - D / 2 - 0.01;
    z = -rW / 2 + spacing * ((posInWall % 5) + 1);
    rotY = -Math.PI / 2;
  } else if (wallIndex === 2) {
    const spacing = L / (5 + 1);
    x = -L / 2 + spacing * ((posInWall % 5) + 1);
    z = rW / 2 - D / 2 - 0.01;
    rotY = Math.PI;
  } else {
    const spacing = rW / (5 + 1);
    x = -L / 2 + D / 2 + 0.01;
    z = -rW / 2 + spacing * ((posInWall % 5) + 1);
    rotY = Math.PI / 2;
  }

  const y = H / 2 + wallOff;
  const bodyColor = selected ? "#E8C547" : hovered ? "#B89A60" : color;
  const frameColor = selected ? "#C8A030" : "#3B2510";
  const handleColor = "#1A1A1A";

  const frameThick = 0.018;
  const handleR = 0.008;
  const handleLen = Math.min(W * 0.35, 0.18);

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
        <meshStandardMaterial color={bodyColor} roughness={0.75} metalness={0.08} />
      </mesh>

      <mesh position={[0, 0, D / 2 + frameThick / 2]} castShadow>
        <boxGeometry args={[W - 0.008, H - 0.008, frameThick]} />
        <meshStandardMaterial color={frameColor} roughness={0.65} metalness={0.12} />
      </mesh>

      <CabinetFront
        code={product.code || ""}
        W={W}
        H={H}
        D={D + frameThick}
        color={bodyColor}
      />

      <mesh
        position={[W * 0.3, 0, D / 2 + frameThick + handleR * 2]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[handleR, handleR, handleLen, 8]} />
        <meshStandardMaterial color={handleColor} roughness={0.3} metalness={0.8} />
      </mesh>

      {isBaseUnit(product) && (
        <mesh position={[0, H / 2 + 0.015, -0.005]} castShadow receiveShadow>
          <boxGeometry args={[W + 0.02, 0.03, D + 0.02]} />
          <meshStandardMaterial color="#D0D0C8" roughness={0.4} metalness={0.15} />
        </mesh>
      )}

      {(hovered || selected) && (
        <Text
          position={[0, H / 2 + 0.18, 0]}
          fontSize={0.07}
          color={selected ? "#FFD700" : "white"}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.006}
          outlineColor="black"
        >
          {product.nameAr || product.code || `Item ${index + 1}`}
        </Text>
      )}
    </group>
  );
}

function Scene3D({
  survey, selectedIdx, onSelect, lightMode,
}: {
  survey: any; selectedIdx: number; onSelect: (i: number) => void; lightMode: "day" | "night";
}) {
  const roomDims = survey.roomDimensions || { length: 400, width: 300, height: 240 };
  const L = parseFloat(roomDims.length) || 400;
  const W = parseFloat(roomDims.width) || 300;
  const H = parseFloat(roomDims.height) || 240;
  const products = (survey.selectedProducts || []) as any[];

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, H * SCALE * 1.6, W * SCALE * 2.2]} fov={55} />
      <OrbitControls enableDamping dampingFactor={0.05} minDistance={1} maxDistance={25} />

      {lightMode === "day" ? (
        <DayLighting />
      ) : (
        <NightLighting roomL={L} roomW={W} roomH={H} />
      )}

      <Room length={L} width={W} height={H} />

      {products.map((p: any, i: number) => (
        <Cabinet
          key={`${i}-${p.code || p.productId}`}
          product={p}
          index={i}
          roomL={L}
          roomW={W}
          roomH={H}
          selected={selectedIdx === i}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function FloorPlan2D({ survey }: { survey: any }) {
  const { t } = useLanguage();
  const svgRef = useRef<SVGSVGElement>(null);
  const spaces: any[] = survey.spaces || [];
  const allProducts: any[] = survey.selectedProducts || [];

  const CANVAS_W = 680;
  const CANVAS_H = 500;
  const WALL_LABELS = ["A", "B", "C", "D"];
  const WALL_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6"];

  function downloadPNG() {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = CANVAS_W * scale;
      canvas.height = CANVAS_H * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(svgUrl); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "floor-plan.png";
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.src = svgUrl;
  }

  if (spaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <Map className="w-12 h-12 opacity-30" />
        <p className="text-sm">{t("لا توجد بيانات مساحات لعرض المخطط", "No space data for floor plan")}</p>
      </div>
    );
  }

  const cols = Math.ceil(Math.sqrt(spaces.length));
  const cellW = CANVAS_W / cols;
  const cellH = CANVAS_H / Math.ceil(spaces.length / cols);
  const pad = 32;

  const elements: JSX.Element[] = [];

  spaces.forEach((space, spaceIdx) => {
    const spaceProducts = allProducts.filter((p: any) => p.spaceId === space.id);
    const roomL = parseFloat(space.length) || 300;
    const roomW = parseFloat(space.width) || 240;

    const col = spaceIdx % cols;
    const row = Math.floor(spaceIdx / cols);
    const ox = col * cellW + pad;
    const oy = row * cellH + pad;
    const availW = cellW - pad * 2;
    const availH = cellH - pad * 2;

    const scale = Math.min(availW / roomL, availH / roomW, 1.2);
    const rW = roomL * scale;
    const rH = roomW * scale;
    const rx = ox + (availW - rW) / 2;
    const ry = oy + (availH - rH) / 2 + 16;

    elements.push(
      <text key={`label-${spaceIdx}`} x={ox + availW / 2} y={oy + 12} textAnchor="middle"
        fontSize={11} fontWeight="bold" fill="#1F2937">
        {space.name || t("مكان", "Space")} {spaceIdx + 1}
      </text>
    );

    elements.push(
      <rect key={`room-${spaceIdx}`} x={rx} y={ry} width={rW} height={rH}
        fill="#F9F6F0" stroke="#374151" strokeWidth={2} />
    );

    const walls: any[] = space.walls || [];
    const wallDefs = [
      { label: WALL_LABELS[0], color: WALL_COLORS[0], side: "top" },
      { label: WALL_LABELS[1], color: WALL_COLORS[1], side: "right" },
      { label: WALL_LABELS[2], color: WALL_COLORS[2], side: "bottom" },
      { label: WALL_LABELS[3], color: WALL_COLORS[3], side: "left" },
    ];

    wallDefs.forEach((wd, wi) => {
      let lx = 0, ly = 0;
      if (wd.side === "top") { lx = rx + rW / 2; ly = ry - 8; }
      else if (wd.side === "right") { lx = rx + rW + 8; ly = ry + rH / 2; }
      else if (wd.side === "bottom") { lx = rx + rW / 2; ly = ry + rH + 14; }
      else { lx = rx - 8; ly = ry + rH / 2; }

      elements.push(
        <text key={`wall-label-${spaceIdx}-${wi}`} x={lx} y={ly}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={9} fontWeight="bold" fill={wd.color}>
          {wd.label}
        </text>
      );

      const wall = walls[wi];
      if (wall?.length) {
        const wl = parseFloat(wall.length);
        let dlx = 0, dly = 0;
        if (wd.side === "top") { dlx = rx + rW / 2; dly = ry - 16; }
        else if (wd.side === "right") { dlx = rx + rW + 18; dly = ry + rH / 2; }
        else if (wd.side === "bottom") { dlx = rx + rW / 2; dly = ry + rH + 24; }
        else { dlx = rx - 22; dly = ry + rH / 2; }
        elements.push(
          <text key={`dim-${spaceIdx}-${wi}`} x={dlx} y={dly}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={8} fill="#6B7280">
            {wl}cm
          </text>
        );
      }

      if (wall) {
        const items: any[] = wall.items || [];
        items.forEach((item: any, ii: number) => {
          const dist = parseFloat(item.distanceFromFirst || "0") * scale;
          const iw = parseFloat(item.width || "90") * scale;
          let ix = 0, iy = 0;

          if (wd.side === "top") { ix = rx + dist; iy = ry; }
          else if (wd.side === "right") { ix = rx + rW; iy = ry + dist; }
          else if (wd.side === "bottom") { ix = rx + rW - dist - iw; iy = ry + rH; }
          else { ix = rx; iy = ry + rH - dist - iw; }

          const isHoriz = wd.side === "top" || wd.side === "bottom";

          if (item.type === "door") {
            const arcD = isHoriz
              ? `M ${ix} ${iy} a ${iw} ${iw} 0 0 1 ${iw} ${iw}`
              : `M ${ix} ${iy} a ${iw} ${iw} 0 0 1 ${iw} ${iw}`;
            elements.push(
              <g key={`item-${spaceIdx}-${wi}-${ii}`}>
                <path d={arcD} fill="none" stroke="#2563EB" strokeWidth={1.5} />
                <line x1={ix} y1={iy}
                  x2={ix + (isHoriz ? iw : 0)}
                  y2={iy + (isHoriz ? 0 : iw)}
                  stroke="#2563EB" strokeWidth={1.5} />
              </g>
            );
          } else if (item.type === "window") {
            elements.push(
              <line key={`item-${spaceIdx}-${wi}-${ii}`}
                x1={ix} y1={iy}
                x2={ix + (isHoriz ? iw : 0)}
                y2={iy + (isHoriz ? 0 : iw)}
                stroke="#059669" strokeWidth={3} strokeDasharray="4,3"
              />
            );
          } else if (item.type === "outlet") {
            const symX = ix + (isHoriz ? iw / 2 : 0);
            const symY = iy + (isHoriz ? 0 : iw / 2);
            elements.push(
              <g key={`item-${spaceIdx}-${wi}-${ii}`}>
                <circle cx={symX} cy={symY} r={4} fill="#F59E0B" stroke="#D97706" strokeWidth={1} />
                <text x={symX} y={symY} textAnchor="middle" dominantBaseline="middle"
                  fontSize={5} fill="white" fontWeight="bold">⚡</text>
              </g>
            );
          } else if (item.type === "drain") {
            const symX = ix + (isHoriz ? iw / 2 : 0);
            const symY = iy + (isHoriz ? 0 : iw / 2);
            elements.push(
              <g key={`item-${spaceIdx}-${wi}-${ii}`}>
                <circle cx={symX} cy={symY} r={4} fill="#3B82F6" stroke="#1D4ED8" strokeWidth={1} />
                <text x={symX} y={symY} textAnchor="middle" dominantBaseline="middle"
                  fontSize={5} fill="white">💧</text>
              </g>
            );
          }
        });
      }
    });

    spaceProducts.forEach((prod: any, pi: number) => {
      const wIdx = prod.wallIndex ?? pi % 4;
      const wDef = wallDefs[wIdx % 4];
      const pw = Math.max(parseFloat(prod.dimensions?.w || prod.designW || "60") * scale, 6);
      const pd = Math.max(parseFloat(prod.dimensions?.d || prod.designD || "60") * scale * 0.4, 4);
      const pOffset = (pi % 5) * (pw + 3);

      let px = 0, py = 0, rectW = pw, rectH = pd;
      if (wDef.side === "top") { px = rx + pOffset; py = ry; rectH = pd; }
      else if (wDef.side === "right") { px = rx + rW - pd; py = ry + pOffset; rectW = pd; rectH = pw; }
      else if (wDef.side === "bottom") { px = rx + rW - pOffset - pw; py = ry + rH - pd; rectH = pd; }
      else { px = rx; py = ry + rH - pOffset - pw; rectW = pd; rectH = pw; }

      if (px >= rx && py >= ry && px + rectW <= rx + rW + 10 && py + rectH <= ry + rH + 10) {
        elements.push(
          <g key={`prod-${spaceIdx}-${pi}`}>
            <rect x={px} y={py} width={rectW} height={rectH}
              fill={wDef.color + "40"} stroke={wDef.color} strokeWidth={1} rx={1} />
            {rectW > 18 && (
              <text x={px + rectW / 2} y={py + rectH / 2} textAnchor="middle"
                dominantBaseline="middle" fontSize={6} fill={wDef.color} fontWeight="bold">
                {(prod.code || "").slice(0, 6)}
              </text>
            )}
          </g>
        );
      }
    });

    const doorsC = parseInt(space.doorsCount || "0");
    const windowsC = parseInt(space.windowsCount || "0");
    const hasDoors = doorsC > 0;
    const hasWindows = windowsC > 0;

    if (hasDoors || hasWindows) {
      elements.push(
        <text key={`info-${spaceIdx}`} x={rx} y={ry + rH + 28}
          fontSize={7} fill="#9CA3AF">
          {hasDoors ? `${doorsC} ${t("باب", "door(s)")}` : ""}
          {hasDoors && hasWindows ? " · " : ""}
          {hasWindows ? `${windowsC} ${t("نافذة", "window(s)")}` : ""}
        </text>
      );
    }
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b shrink-0">
        <p className="text-sm font-semibold text-muted-foreground">
          {t("مخطط هندسي 2D", "2D Engineering Plan")} · {spaces.length} {t("مساحة", "spaces")}
        </p>
        <Button size="sm" variant="outline" onClick={downloadPNG} data-testid="btn-download-plan">
          <Download className="h-3.5 w-3.5 me-1" />
          {t("تحميل PNG", "Download PNG")}
        </Button>
      </div>
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900 p-2">
        <svg
          ref={svgRef}
          width={CANVAS_W}
          height={CANVAS_H}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="w-full h-auto"
          style={{ maxWidth: CANVAS_W }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width={CANVAS_W} height={CANVAS_H} fill="white" />
          <text x={CANVAS_W / 2} y={16} textAnchor="middle" fontSize={12} fontWeight="bold" fill="#374151">
            تيك للتصنيع — Floor Plan · مخطط المعاينة
          </text>
          {elements}
          <text x={CANVAS_W - 6} y={CANVAS_H - 6} textAnchor="end"
            fontSize={7} fill="#9CA3AF">
            teak2030.net
          </text>
        </svg>
      </div>
      <div className="p-2 border-t shrink-0">
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-6 h-1 border-t-2 border-blue-500 block" />{t("باب", "Door")}</span>
          <span className="flex items-center gap-1"><span className="w-6 h-1 border-t-2 border-green-500 border-dashed block" />{t("نافذة", "Window")}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-400 rounded-full flex items-center justify-center text-[6px] text-white">⚡</span>{t("كهرباء", "Outlet")}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center text-[6px] text-white">💧</span>{t("تصريف", "Drain")}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-100 border border-blue-400 rounded-sm block" />{t("منتج", "Product")}</span>
        </div>
      </div>
    </div>
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
  const [lightMode, setLightMode] = useState<"day" | "night">("day");
  const [activeTab, setActiveTab] = useState(params.get("tab") === "2d" ? "2d" : "3d");

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
        body: JSON.stringify({ quotationId: parseInt(qId), products: updatedProducts }),
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
    onError: () => { toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }); },
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
    onError: () => { toast({ title: t("حدث خطأ في الاستبدال", "Replacement error"), variant: "destructive" }); },
  });

  const handleShare = useCallback(() => {
    const token = survey?.shareToken || "";
    const shareUrl = `${window.location.origin}/view-3d?surveyId=${surveyId}&public=1${token ? `&token=${token}` : ""}`;
    if (navigator.share) {
      navigator.share({ title: t("تصميم ثلاثي الأبعاد - تيك", "3D Design - Teak"), url: shareUrl }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast({ title: t("تم نسخ الرابط", "Link copied") });
    }
  }, [surveyId, survey, t, toast]);

  if (!surveyId && !appointmentIdParam) {
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
      <div className="p-3 border-b flex items-center justify-between bg-background z-10 shrink-0">
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
          {activeTab === "3d" && (
            <Button
              size="sm"
              variant={lightMode === "night" ? "default" : "outline"}
              onClick={() => setLightMode(lm => lm === "day" ? "night" : "day")}
              data-testid="btn-toggle-light"
              title={t("تبديل الإضاءة", "Toggle lighting")}
            >
              {lightMode === "day" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleShare} data-testid="btn-share-3d">
            <Share2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setKey(k => k + 1); setSelectedProduct(-1); }} data-testid="btn-reset-camera">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-3 mt-2 mb-0 shrink-0 w-fit" data-testid="tabs-view-mode">
          <TabsTrigger value="3d" data-testid="tab-3d">{t("عرض 3D", "3D View")}</TabsTrigger>
          <TabsTrigger value="2d" data-testid="tab-2d">{t("مخطط 2D", "2D Plan")}</TabsTrigger>
        </TabsList>

        <TabsContent value="3d" className="flex-1 flex overflow-hidden mt-0 data-[state=active]:flex">
          <div className="flex-1 relative" style={{ background: lightMode === "day" ? "linear-gradient(to bottom, #e0f2fe, #bae6fd)" : "linear-gradient(to bottom, #0f0c29, #1a1a2e)" }}>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {survey && (
              <Canvas key={key} shadows gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: lightMode === "day" ? 1.0 : 0.7 }}>
                <Suspense fallback={null}>
                  <Scene3D
                    survey={survey}
                    selectedIdx={selectedProduct}
                    onSelect={setSelectedProduct}
                    lightMode={lightMode}
                  />
                </Suspense>
              </Canvas>
            )}
            <div className="absolute bottom-3 start-1/2 -translate-x-1/2 bg-black/40 text-white text-xs px-3 py-1 rounded-full whitespace-nowrap">
              {t("اسحب للتدوير • اضغط على منتج لتحديده • Scroll للتقريب", "Drag to rotate • Click product to select • Scroll to zoom")}
            </div>
            {lightMode === "night" && (
              <div className="absolute top-3 start-3 text-[10px] text-yellow-300 bg-black/50 px-2 py-1 rounded-full">
                🌙 {t("وضع الإضاءة الاصطناعية 2700K", "Artificial Light Mode 2700K")}
              </div>
            )}
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
                            style={{ backgroundColor: getCabinetColor(p, i) }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium line-clamp-1">{p.nameAr || p.code || `Item ${i + 1}`}</p>
                            {p.code && <p className="text-[10px] text-muted-foreground">{p.code}</p>}
                            <p className="text-[10px]">
                              {p.dimensions?.w || p.designW || "—"}×{p.dimensions?.h || p.designH || "—"}×{p.dimensions?.d || p.designD || "—"} cm
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
                                variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                                onClick={(e) => { e.stopPropagation(); removeProductMutation.mutate(i); }}
                                disabled={removeProductMutation.isPending}
                                data-testid={`btn-remove-product-${i}`}
                              >
                                {removeProductMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-6 w-6 text-blue-600"
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
        </TabsContent>

        <TabsContent value="2d" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex flex-col">
          {survey ? (
            <FloorPlan2D survey={survey} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
