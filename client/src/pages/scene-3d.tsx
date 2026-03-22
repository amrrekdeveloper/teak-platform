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
  return code.startsWith("TK3") || code.startsWith("W") || code.startsWith("HK") || code.startsWith("AKK");
}

function isWallUnitByCode(code: string): boolean {
  const c = code.toUpperCase();
  return c.startsWith("TK3") || c.startsWith("W") || c.startsWith("HK") || c.startsWith("AKK");
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
  const spotIntensity = 8;
  const spotAngle = Math.PI / 4.5;
  const spotPenumbra = 0.6;
  const spotDist = 12;

  const lampPositions: [number, number, number][] = [
    [0, spotY, 0],
    [-L * 0.3, spotY, -W * 0.25],
    [L * 0.3, spotY, W * 0.25],
  ];

  return (
    <>
      {/* Raised ambient so walls and ceiling are NOT pitch black */}
      <ambientLight intensity={0.22} color="#3d2a0f" />
      {/* Warm sky/ground hemisphere — sky amber, ground dark */}
      <hemisphereLight color="#FFD580" groundColor="#1a0f00" intensity={0.18} />
      {/* Ceiling panel — simulates LED ceiling surface (RectAreaLight equivalent) */}
      <rectAreaLight
        position={[0, H * 0.96, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        width={L * 0.7}
        height={W * 0.7}
        intensity={4}
        color="#FFE8A0"
      />
      {/* Three warm spotlights covering the room evenly */}
      {lampPositions.map(([lx, ly, lz], i) => (
        <spotLight
          key={`spot-${i}`}
          position={[lx, ly, lz]}
          angle={spotAngle}
          penumbra={spotPenumbra}
          intensity={i === 0 ? spotIntensity : spotIntensity * 0.75}
          color={warmColor}
          castShadow={i === 0}
          distance={spotDist}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-radius={8}
        />
      ))}
      {/* Soft fill from under-cabinet area — simulates LED strip */}
      <pointLight position={[0, 1.45, -W / 2 + 0.15]} intensity={1.2} color="#FFE4A0" distance={L * 1.2} />
      {/* Visible lamp fixtures — glowing spheres */}
      {lampPositions.map(([lx, ly, lz], i) => (
        <mesh key={`lamp-${i}`} position={[lx, ly + 0.05, lz]}>
          <sphereGeometry args={[0.045, 10, 10]} />
          <meshBasicMaterial color="#FFF5C0" />
        </mesh>
      ))}
    </>
  );
}

type FloorType = "parquet" | "tile" | "marble";

function makeParquetTexture(L: number, W: number): THREE.DataTexture {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  const plankW = 85;
  const plankH = 512;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const col = Math.floor(x / plankW);
      const stagger = (col % 2) * Math.floor(plankH / 2);
      const py = ((y + stagger) % plankH) / plankH;
      const px = (x % plankW) / plankW;
      const grain = Math.sin(py * 38 + col * 2.3) * 9 + Math.sin(py * 12 + col * 0.7) * 4 + Math.cos(px * 22) * 2;
      const knot = Math.sin(py * 6 + col * 3.1) > 0.85 ? -12 : 0;
      const border = (px < 0.015 || px > 0.985 || py < 0.003 || py > 0.997) ? -22 : 0;
      const base = 148 + grain + knot + border;
      data[idx] = Math.min(255, Math.max(0, base + 22));
      data[idx + 1] = Math.min(255, Math.max(0, base - 10));
      data[idx + 2] = Math.min(255, Math.max(0, base - 52));
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(L / 0.9, W / 0.9);
  tex.needsUpdate = true;
  return tex;
}

function makeTileTexture(L: number, W: number): THREE.DataTexture {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  const grout = 14;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const gx = x % size < grout || x % size > size - grout;
      const gy = y % size < grout || y % size > size - grout;
      const isGrout = gx || gy;
      const noise = (Math.sin(x * 0.3 + y * 0.7) * 3 + Math.cos(x * 0.9 - y * 0.4) * 2);
      if (isGrout) {
        data[idx] = 180; data[idx + 1] = 180; data[idx + 2] = 178;
      } else {
        const base = 228 + noise;
        data[idx] = Math.min(255, Math.max(0, base));
        data[idx + 1] = Math.min(255, Math.max(0, base - 2));
        data[idx + 2] = Math.min(255, Math.max(0, base - 4));
      }
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(L / 0.6, W / 0.6);
  tex.needsUpdate = true;
  return tex;
}

function makeMarbleTexture(L: number, W: number): THREE.DataTexture {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  const grout = 10;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const tileX = x % size;
      const tileY = y % size;
      const gx = tileX < grout || tileX > size - grout;
      const gy = tileY < grout || tileY > size - grout;
      const isGrout = gx || gy;
      if (isGrout) {
        data[idx] = 160; data[idx + 1] = 158; data[idx + 2] = 155;
      } else {
        const vein = Math.sin((tileX + tileY * 0.5) * 0.04 + Math.sin(tileX * 0.008 + tileY * 0.012) * 8) * 28;
        const spot = Math.sin(tileX * 0.019) * Math.sin(tileY * 0.017) * 15;
        const base = 220 + vein + spot;
        data[idx] = Math.min(255, Math.max(180, base));
        data[idx + 1] = Math.min(255, Math.max(178, base - 5));
        data[idx + 2] = Math.min(255, Math.max(175, base - 8));
      }
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(L / 0.8, W / 0.8);
  tex.needsUpdate = true;
  return tex;
}

function FloorMesh({ L, W, floorType }: { L: number; W: number; floorType: FloorType }) {
  const texture = useMemo(() => {
    if (floorType === "tile") return makeTileTexture(L, W);
    if (floorType === "marble") return makeMarbleTexture(L, W);
    return makeParquetTexture(L, W);
  }, [L, W, floorType]);

  const roughness = floorType === "marble" ? 0.3 : floorType === "tile" ? 0.5 : 0.72;
  const metalness = floorType === "marble" ? 0.08 : 0.0;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
      <planeGeometry args={[L, W]} />
      <meshStandardMaterial map={texture} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

function makeGraniteTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const vein = Math.sin(x * 0.08 + y * 0.12 + Math.sin(x * 0.04) * 4) * 25;
      const speck = Math.sin(x * 1.7 + y * 2.3) > 0.8 ? -30 : (Math.sin(x * 2.1 + y * 1.4) > 0.85 ? 25 : 0);
      const base = 155 + vein + speck;
      data[idx] = Math.min(255, Math.max(80, base - 5));
      data[idx + 1] = Math.min(255, Math.max(75, base - 8));
      data[idx + 2] = Math.min(255, Math.max(70, base - 12));
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function makeBacksplashTexture(): THREE.DataTexture {
  const w = 512, h = 512;
  const data = new Uint8Array(w * h * 4);
  const tW = 128, tH = 64, grout = 8;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const row = Math.floor(y / tH);
      const stagger = (row % 2) * (tW / 2);
      const tx = (x + stagger) % tW;
      const ty = y % tH;
      const isGrout = tx < grout || ty < grout;
      if (isGrout) {
        data[idx] = 195; data[idx + 1] = 193; data[idx + 2] = 190;
      } else {
        const shine = Math.sin(tx * 0.12 + ty * 0.08) * 6;
        const base = 240 + shine;
        data[idx] = Math.min(255, base);
        data[idx + 1] = Math.min(255, base - 1);
        data[idx + 2] = Math.min(255, base - 2);
      }
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function Backsplash({ L, W, wallIndices }: { L: number; W: number; wallIndices: number[] }) {
  const bsTexture = useMemo(() => makeBacksplashTexture(), []);
  const bsH = 0.65;
  const bsY = 0.85 + bsH / 2;
  const depth = 0.005;

  return (
    <group>
      {wallIndices.map((wi) => {
        const isHoriz = wi === 0 || wi === 2;
        const len = isHoriz ? L : W;
        bsTexture.repeat.set(len / 0.3, bsH / 0.1);
        bsTexture.needsUpdate = true;
        const pos: [number, number, number] =
          wi === 0 ? [0, bsY, -W / 2 + depth] :
          wi === 1 ? [L / 2 - depth, bsY, 0] :
          wi === 2 ? [0, bsY, W / 2 - depth] :
                     [-L / 2 + depth, bsY, 0];
        const rot: [number, number, number] =
          wi === 0 ? [0, 0, 0] :
          wi === 1 ? [0, -Math.PI / 2, 0] :
          wi === 2 ? [0, Math.PI, 0] :
                     [0, Math.PI / 2, 0];
        return (
          <mesh key={wi} position={pos} rotation={rot} receiveShadow>
            <planeGeometry args={[len, bsH]} />
            <meshStandardMaterial map={bsTexture} roughness={0.3} metalness={0.1} />
          </mesh>
        );
      })}
    </group>
  );
}

// ── Architectural Openings ────────────────────────────────────────────────────

/** 15 cm wall thickness in 3D scene units. */
const WALL_DEPTH_3D = 0.15;
const REVEAL_COLOR  = "#D8D4CC";

/** Convert a survey measurement string (m or cm) to 3D scene units (SCALE=0.01). */
function parseItemMeasure(val: string | number | undefined, fallbackCm: number): number {
  const n = parseFloat(String(val ?? "0")) || 0;
  const cm = n > 0 ? (n <= 30 ? n * 100 : n) : fallbackCm;
  return cm * SCALE;
}

/** A wall panel rendered with THREE.ShapeGeometry so door/window holes are actual geometry gaps. */
function WallPanel({
  wallLen, wallH, items, wallColor, transparent = false,
}: {
  wallLen: number; wallH: number; items: any[];
  wallColor: string; transparent?: boolean;
}) {
  const geometry = useMemo(() => {
    const hw = wallLen / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-hw, 0);
    shape.lineTo( hw, 0);
    shape.lineTo( hw, wallH);
    shape.lineTo(-hw, wallH);
    shape.closePath();

    for (const item of items) {
      if (item.type !== "door" && item.type !== "window") continue;
      const dist = parseItemMeasure(item.distanceFromFirst, 0);
      const iw   = parseItemMeasure(item.width,  item.type === "door" ? 90  : 120);
      const ih   = parseItemMeasure(item.height, item.type === "door" ? 210 : 120);
      const iy   = item.type === "door" ? 0 : parseItemMeasure(item.heightFromFloor, 90);

      const hx = -hw + dist;
      const hole = new THREE.Path();
      hole.moveTo(hx,      iy);
      hole.lineTo(hx + iw, iy);
      hole.lineTo(hx + iw, iy + ih);
      hole.lineTo(hx,      iy + ih);
      hole.closePath();
      shape.holes.push(hole);
    }
    return new THREE.ShapeGeometry(shape, 2);
  }, [wallLen, wallH, items]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        color={wallColor} roughness={0.88} metalness={0}
        transparent={transparent} opacity={transparent ? 0.12 : 1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/** Renders 15 cm-deep reveal panels (jambs, lintel, sill) around each opening. */
function WallReveal({ items, wallLen, wallH }: { items: any[]; wallLen: number; wallH: number }) {
  const hw = wallLen / 2;
  return (
    <group>
      {items.map((item: any, i: number) => {
        if (item.type !== "door" && item.type !== "window") return null;
        const dist  = parseItemMeasure(item.distanceFromFirst, 0);
        const iw    = parseItemMeasure(item.width,  item.type === "door" ? 90  : 120);
        const ih    = parseItemMeasure(item.height, item.type === "door" ? 210 : 120);
        const startX = -hw + dist;
        const cx     = startX + iw / 2;
        const iy     = item.type === "door" ? 0 : parseItemMeasure(item.heightFromFloor, 90);
        const D      = WALL_DEPTH_3D;
        const mat    = <meshStandardMaterial color={REVEAL_COLOR} roughness={0.78} />;

        return (
          <group key={i} position={[0, 0, -D / 2]}>
            {/* Left jamb */}
            <mesh position={[startX, iy + ih / 2, 0]}>
              <boxGeometry args={[0.015, ih, D]} />
              {mat}
            </mesh>
            {/* Right jamb */}
            <mesh position={[startX + iw, iy + ih / 2, 0]}>
              <boxGeometry args={[0.015, ih, D]} />
              {mat}
            </mesh>
            {/* Top lintel */}
            <mesh position={[cx, iy + ih, 0]}>
              <boxGeometry args={[iw + 0.015, 0.015, D]} />
              {mat}
            </mesh>
            {/* Window bottom sill */}
            {item.type === "window" && (
              <mesh position={[cx, iy, 0]}>
                <boxGeometry args={[iw + 0.015, 0.025, D]} />
                {mat}
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Renders door frames, window glass, door swing arc, drain & outlet markers on one wall. */
function WallElements({ items, wallLen, wallH }: { items: any[]; wallLen: number; wallH: number }) {
  const hw = wallLen / 2;
  return (
    <group>
      {items.map((item: any, i: number) => {
        const dist = parseItemMeasure(item.distanceFromFirst, 0);
        const iw   = parseItemMeasure(item.width,  item.type === "door" ? 90  : 120);
        const ih   = parseItemMeasure(item.height, item.type === "door" ? 210 : 120);
        const startX = -hw + dist;
        const cx     = startX + iw / 2;
        const FRAME_COLOR = "#2C1A0E";
        const FRAME_W = 0.055;

        if (item.type === "door") {
          return (
            <group key={i}>
              {/* Door panel */}
              <group position={[cx, ih / 2, 0.006]}>
                <mesh>
                  <planeGeometry args={[iw - 0.04, ih - 0.01]} />
                  <meshStandardMaterial color="#8B6040" roughness={0.75} metalness={0.04} />
                </mesh>
                {/* Top frame */}
                <mesh position={[0, ih / 2 + FRAME_W / 2, 0.01]}>
                  <boxGeometry args={[iw + FRAME_W * 2, FRAME_W, FRAME_W]} />
                  <meshStandardMaterial color={FRAME_COLOR} roughness={0.6} />
                </mesh>
                {/* Left frame */}
                <mesh position={[-iw / 2 - FRAME_W / 2, 0, 0.01]}>
                  <boxGeometry args={[FRAME_W, ih + FRAME_W, FRAME_W]} />
                  <meshStandardMaterial color={FRAME_COLOR} roughness={0.6} />
                </mesh>
                {/* Right frame */}
                <mesh position={[ iw / 2 + FRAME_W / 2, 0, 0.01]}>
                  <boxGeometry args={[FRAME_W, ih + FRAME_W, FRAME_W]} />
                  <meshStandardMaterial color={FRAME_COLOR} roughness={0.6} />
                </mesh>
                {/* Handle */}
                <mesh position={[iw / 2 - 0.09, 0, 0.055]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.013, 0.013, 0.11, 8]} />
                  <meshStandardMaterial color="#B0B0B0" roughness={0.2} metalness={0.85} />
                </mesh>
              </group>
              {/* Door swing arc at floor level (showing 90° swing path) */}
              <mesh position={[startX, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[iw * 0.96, iw, 32, 1, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#8B6040" transparent opacity={0.14} side={THREE.DoubleSide} />
              </mesh>
            </group>
          );
        }

        if (item.type === "window") {
          const iy = parseItemMeasure(item.heightFromFloor, 90);
          return (
            <group key={i} position={[cx, iy + ih / 2, 0.006]}>
              {/* Glass */}
              <mesh>
                <planeGeometry args={[iw - 0.05, ih - 0.05]} />
                <meshStandardMaterial color="#BFDBFE" transparent opacity={0.38} roughness={0.08} metalness={0.15} />
              </mesh>
              {/* Horizontal frames */}
              {([-ih / 2, ih / 2] as number[]).map((y, fi) => (
                <mesh key={fi} position={[0, y, 0.012]}>
                  <boxGeometry args={[iw + 0.07, FRAME_W, FRAME_W]} />
                  <meshStandardMaterial color="#EFEFEF" roughness={0.4} metalness={0.05} />
                </mesh>
              ))}
              {/* Vertical frames */}
              {([-iw / 2, iw / 2] as number[]).map((x, fi) => (
                <mesh key={fi + 2} position={[x, 0, 0.012]}>
                  <boxGeometry args={[FRAME_W, ih + 0.07, FRAME_W]} />
                  <meshStandardMaterial color="#EFEFEF" roughness={0.4} metalness={0.05} />
                </mesh>
              ))}
            </group>
          );
        }

        if (item.type === "drain") {
          return (
            <mesh key={i} position={[cx, 0.04, 0.01]} rotation={[0, 0, 0]}>
              <circleGeometry args={[0.09, 16]} />
              <meshStandardMaterial color="#1D4ED8" roughness={0.4} />
            </mesh>
          );
        }

        if (item.type === "outlet") {
          const iy = parseItemMeasure(item.heightFromFloor, 40);
          return (
            <mesh key={i} position={[cx, iy, 0.01]}>
              <planeGeometry args={[0.1, 0.1]} />
              <meshStandardMaterial color="#F3F4F6" roughness={0.3} />
            </mesh>
          );
        }

        return null;
      })}
    </group>
  );
}

function Room({
  length = 400, width = 300, height = 240,
  floorType = "parquet" as FloorType,
  wallsWithBase = [],
  wallItems,
}: {
  length: number; width: number; height: number;
  floorType?: FloorType; wallsWithBase?: number[];
  wallItems?: Record<number, any[]>;
}) {
  const L = length * SCALE;
  const W = width * SCALE;
  const H = height * SCALE;
  const wallColor = "#F4F0EA";
  const items = (idx: number) => wallItems?.[idx] || [];

  return (
    <group>
      <FloorMesh L={L} W={W} floorType={floorType} />
      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]} receiveShadow>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial color="#FAFAF6" roughness={1.0} metalness={0.0} />
      </mesh>

      {/* Wall A — back, wallIndex=0, at z=-W/2 */}
      <group position={[0, 0, -W / 2]}>
        <WallPanel wallLen={L} wallH={H} items={items(0)} wallColor={wallColor} />
        <WallReveal items={items(0)} wallLen={L} wallH={H} />
        <WallElements items={items(0)} wallLen={L} wallH={H} />
      </group>

      {/* Wall B — right, wallIndex=1, at x=L/2, rotated -90°Y */}
      <group position={[L / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <WallPanel wallLen={W} wallH={H} items={items(1)} wallColor={wallColor} />
        <WallReveal items={items(1)} wallLen={W} wallH={H} />
        <WallElements items={items(1)} wallLen={W} wallH={H} />
      </group>

      {/* Wall C — front, wallIndex=2, transparent for camera but openings still visible */}
      <group position={[0, 0, W / 2]} rotation={[0, Math.PI, 0]}>
        <WallPanel wallLen={L} wallH={H} items={items(2)} wallColor={wallColor} transparent />
        <WallReveal items={items(2)} wallLen={L} wallH={H} />
        <WallElements items={items(2)} wallLen={L} wallH={H} />
      </group>

      {/* Wall D — left, wallIndex=3, at x=-L/2, rotated 90°Y */}
      <group position={[-L / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <WallPanel wallLen={W} wallH={H} items={items(3)} wallColor={wallColor} />
        <WallReveal items={items(3)} wallLen={W} wallH={H} />
        <WallElements items={items(3)} wallLen={W} wallH={H} />
      </group>

      {wallsWithBase.length > 0 && <Backsplash L={L} W={W} wallIndices={wallsWithBase} />}
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
  product, index, roomL, roomW, selected, onSelect,
}: {
  product: any; index: number; roomL: number; roomW: number; roomH?: number;
  selected: boolean; onSelect: (idx: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = getCabinetColor(product, index);

  const W = ((product.dimensions?.w || product.designW || 60)) * SCALE;
  const H = ((product.dimensions?.h || product.designH || getDefaultHeight(product))) * SCALE;
  const D = ((product.dimensions?.d || product.designD || getDefaultDepth(product))) * SCALE;

  const L = roomL * SCALE;
  const rW = roomW * SCALE;

  const wallIndex = product._wallIndex ?? 0;
  const xOffset = (product._xOffset ?? 30) * SCALE;

  let x = 0, z = 0, rotY = 0;
  /* Wall units (HK/TK3/W) mount at 150 cm from floor — bottom at 1.5m */
  const wallOff = isWallUnit(product) ? 1.5 : 0;

  if (wallIndex === 0) {
    x = -L / 2 + xOffset;
    z = -rW / 2 + D / 2 + 0.01;
  } else if (wallIndex === 1) {
    x = L / 2 - D / 2 - 0.01;
    z = -rW / 2 + xOffset;
    rotY = -Math.PI / 2;
  } else if (wallIndex === 2) {
    x = L / 2 - xOffset;
    z = rW / 2 - D / 2 - 0.01;
    rotY = Math.PI;
  } else {
    x = -L / 2 + D / 2 + 0.01;
    z = rW / 2 - xOffset;
    rotY = Math.PI / 2;
  }

  const y = H / 2 + wallOff;
  const bodyColor = selected ? "#E8C547" : hovered ? "#B89A60" : color;
  const frameColor = selected ? "#C8A030" : "#3B2510";
  const handleColor = "#1A1A1A";

  const frameThick = 0.018;
  const handleR = 0.008;
  const handleLen = Math.min(W * 0.35, 0.18);

  const graniteTexture = useMemo(() => isBaseUnit(product) ? makeGraniteTexture() : null, []);

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
        <>
          {/* Granite countertop */}
          <mesh position={[0, H / 2 + 0.018, -0.005]} castShadow receiveShadow>
            <boxGeometry args={[W + 0.02, 0.035, D + 0.025]} />
            <meshStandardMaterial map={graniteTexture} roughness={0.2} metalness={0.06} color="#C8C4BE" />
          </mesh>
          {/* Kickplate 10cm strip at bottom front */}
          <mesh position={[0, -H / 2 + 0.05, D / 2 - 0.01]} castShadow>
            <boxGeometry args={[W, 0.1, 0.025]} />
            <meshStandardMaterial color="#1C1C1C" roughness={0.8} metalness={0.1} />
          </mesh>
        </>
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

const WALL_LETTER_MAP: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

function getWallIndex(product: any): number {
  const letter = (product.wallId || "").slice(-1).toUpperCase();
  return WALL_LETTER_MAP[letter] ?? 0;
}

const WALL_LETTER_IDX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

/** Build opening ranges (in cm) per wall from survey wall data. */
function buildWallOpenings(walls: any[]): Record<number, Array<{ start: number; end: number }>> {
  const openings: Record<number, Array<{ start: number; end: number }>> = { 0: [], 1: [], 2: [], 3: [] };
  for (const wall of walls) {
    const letter = (wall.id || "").slice(-1).toUpperCase();
    const idx = WALL_LETTER_IDX[letter];
    if (idx === undefined) continue;
    for (const item of (wall.items || [])) {
      if (item.type !== "door" && item.type !== "window") continue;
      const rawDist = parseFloat(item.distanceFromFirst || "0") || 0;
      const dist = rawDist <= 30 ? rawDist * 100 : rawDist;
      const rawW = parseFloat(item.width || "0") || 0;
      const iw = rawW > 0 ? (rawW <= 30 ? rawW * 100 : rawW) : (item.type === "door" ? 90 : 120);
      openings[idx].push({ start: dist, end: dist + iw });
    }
  }
  return openings;
}

function Scene3D({
  survey, selectedIdx, onSelect, lightMode, floorType,
}: {
  survey: any; selectedIdx: number; onSelect: (i: number) => void; lightMode: "day" | "night"; floorType: FloorType;
}) {
  const firstSpace = (survey.spaces || [])[0];
  const roomDims = survey.roomDimensions
    || (firstSpace ? { length: firstSpace.length, width: firstSpace.width, height: firstSpace.height || firstSpace.wallHeight || 280 }
    : { length: 400, width: 300, height: 240 });
  const rawL = parseFloat(roomDims.length) || 400;
  const rawW = parseFloat(roomDims.width) || 300;
  const rawH = parseFloat(roomDims.height) || 240;
  const L = rawL <= 30 ? rawL * 100 : rawL;
  const W = rawW <= 30 ? rawW * 100 : rawW;
  const H = rawH <= 30 ? rawH * 100 : rawH;
  const products = (survey.selectedProducts || []) as any[];

  /* Extract wall items for architectural rendering */
  const surveyWalls: any[] = firstSpace?.walls || [];
  const wallItemsByIndex = useMemo<Record<number, any[]>>(() => {
    const result: Record<number, any[]> = { 0: [], 1: [], 2: [], 3: [] };
    for (const wall of surveyWalls) {
      const letter = (wall.id || "").slice(-1).toUpperCase();
      const idx = WALL_LETTER_IDX[letter];
      if (idx !== undefined) result[idx] = wall.items || [];
    }
    return result;
  }, [surveyWalls]);

  /* Wall opening ranges (cm) for conflict detection */
  const wallOpenings = useMemo(() => buildWallOpenings(surveyWalls), [surveyWalls]);

  /* Wall lengths (in cm) for overflow clamping */
  const wallLengths: Record<number, number> = { 0: L, 1: W, 2: L, 3: W };
  const wallOffsets: Record<number, number> = { 0: 10, 1: 10, 2: 10, 3: 10 };
  const productsWithPos = products.reduce((acc: any[], p: any, sourceIdx: number) => {
    const wIdx = getWallIndex(p);
    const pW = parseFloat(p.designW || p.dimensions?.w || "60");
    const currentOffset = wallOffsets[wIdx];
    const wallLen = wallLengths[wIdx] || L;
    if (currentOffset + pW > wallLen - 10) return acc; /* skip overflow */
    wallOffsets[wIdx] = currentOffset + pW + 5;

    /* Conflict: does this cabinet overlap a door/window opening? */
    const pStart = currentOffset;
    const pEnd   = currentOffset + pW;
    const _conflict = (wallOpenings[wIdx] || []).some(
      (op) => pStart < op.end && pEnd > op.start
    );

    acc.push({ ...p, _wallIndex: wIdx, _xOffset: currentOffset + pW / 2, _sourceIndex: sourceIdx, _conflict });
    return acc;
  }, []);

  /* Determine which walls have base cabinets → render backsplash only there */
  const wallsWithBase = Array.from(
    new Set(
      productsWithPos
        .filter((p: any) => !isWallUnit(p) && !isTallUnit(p))
        .map((p: any) => p._wallIndex as number)
    )
  );

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, H * SCALE * 1.6, W * SCALE * 2.2]} fov={55} />
      <OrbitControls enableDamping dampingFactor={0.05} minDistance={1} maxDistance={25} />

      {lightMode === "day" ? (
        <DayLighting />
      ) : (
        <NightLighting roomL={L} roomW={W} roomH={H} />
      )}

      <Room
        length={L} width={W} height={H}
        floorType={floorType}
        wallsWithBase={wallsWithBase}
        wallItems={wallItemsByIndex}
      />

      {productsWithPos.map((p: any, i: number) => (
        <Cabinet
          key={`${p._sourceIndex}-${p.code || p.productId}`}
          product={p}
          index={p._sourceIndex}
          roomL={L}
          roomW={W}
          roomH={H}
          selected={selectedIdx === p._sourceIndex}
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

  const validSpaceIds = new Set(spaces.map((s: any) => s.id));

  spaces.forEach((space, spaceIdx) => {
    const spaceProducts = allProducts.filter(
      (p: any) =>
        p.spaceId === space.id ||
        (spaceIdx === 0 && (!p.spaceId || !validSpaceIds.has(p.spaceId)))
    );
    const rawL = parseFloat(space.length) || 3;
    const rawW = parseFloat(space.width) || 2.4;
    const roomL = rawL <= 30 ? rawL * 100 : rawL;
    const roomW = rawW <= 30 ? rawW * 100 : rawW;

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
        const rawWl = parseFloat(wall.length);
        const wl = rawWl <= 30 ? rawWl * 100 : rawWl;
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
          const rawDist = parseFloat(item.distanceFromFirst || "0");
          const dist = (rawDist <= 30 ? rawDist * 100 : rawDist) * scale;
          const rawIw = parseFloat(item.width || "0");
          const iw = Math.max((rawIw > 0 ? (rawIw <= 30 ? rawIw * 100 : rawIw) : 90) * scale, 8);
          let ix = 0, iy = 0;

          if (wd.side === "top") { ix = rx + dist; iy = ry; }
          else if (wd.side === "right") { ix = rx + rW; iy = ry + dist; }
          else if (wd.side === "bottom") { ix = rx + rW - dist - iw; iy = ry + rH; }
          else { ix = rx; iy = ry + rH - dist - iw; }

          const isHoriz = wd.side === "top" || wd.side === "bottom";

          if (item.type === "door") {
            /* Door: arc from hinge corner + door leaf line + "ب" label */
            const arcDH = `M ${ix} ${iy} a ${iw} ${iw} 0 0 1 ${iw} ${iw}`;
            const arcDV = `M ${ix} ${iy} a ${iw} ${iw} 0 0 1 ${iw} ${iw}`;
            const arcD = isHoriz ? arcDH : arcDV;
            const lbX = ix + (isHoriz ? iw / 2 : -4);
            const lbY = iy + (isHoriz ? -4 : iw / 2);
            elements.push(
              <g key={`item-${spaceIdx}-${wi}-${ii}`}>
                <rect x={ix} y={iy - (isHoriz ? 0 : 0)} width={isHoriz ? iw : 4} height={isHoriz ? 4 : iw}
                  fill="#FEF3C7" stroke="none" />
                <path d={arcD} fill="none" stroke="#92400E" strokeWidth={1.5} />
                <line x1={ix} y1={iy}
                  x2={ix + (isHoriz ? iw : 0)}
                  y2={iy + (isHoriz ? 0 : iw)}
                  stroke="#92400E" strokeWidth={2} />
                <text x={lbX} y={lbY} textAnchor="middle" dominantBaseline="middle"
                  fontSize={7} fontWeight="bold" fill="#92400E">ب</text>
              </g>
            );
          } else if (item.type === "window") {
            /* Window: three parallel lines (wall thickness symbol) + "ن" label */
            const x2 = ix + (isHoriz ? iw : 0);
            const y2 = iy + (isHoriz ? 0 : iw);
            const lbX = ix + (isHoriz ? iw / 2 : -4);
            const lbY = iy + (isHoriz ? -4 : iw / 2);
            elements.push(
              <g key={`item-${spaceIdx}-${wi}-${ii}`}>
                {/* Clear gap (white) */}
                <rect x={isHoriz ? ix : ix - 3} y={isHoriz ? iy - 3 : iy}
                  width={isHoriz ? iw : 6} height={isHoriz ? 6 : iw}
                  fill="white" />
                {/* Outer wall line */}
                <line x1={ix} y1={iy} x2={x2} y2={y2} stroke="#3B82F6" strokeWidth={2} />
                {/* Glass pane (middle) */}
                {isHoriz
                  ? <line x1={ix} y1={iy + 3} x2={x2} y2={y2 + 3} stroke="#93C5FD" strokeWidth={1.5} />
                  : <line x1={ix + 3} y1={iy} x2={x2 + 3} y2={y2} stroke="#93C5FD" strokeWidth={1.5} />}
                {/* Inner wall line */}
                {isHoriz
                  ? <line x1={ix} y1={iy + 5} x2={x2} y2={y2 + 5} stroke="#3B82F6" strokeWidth={2} />
                  : <line x1={ix + 5} y1={iy} x2={x2 + 5} y2={y2} stroke="#3B82F6" strokeWidth={2} />}
                <text x={lbX} y={lbY} textAnchor="middle" dominantBaseline="middle"
                  fontSize={7} fontWeight="bold" fill="#1D4ED8">ن</text>
              </g>
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

    const wallOffsets: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

    const wallIdToIdx: Record<string, number> = {};
    walls.forEach((w: any, wi: number) => { if (w?.id) wallIdToIdx[w.id] = wi; });

    spaceProducts.forEach((prod: any, pi: number) => {
      let wIdx = 0;
      if (prod.wallId && wallIdToIdx[prod.wallId] !== undefined) {
        wIdx = wallIdToIdx[prod.wallId];
      } else {
        wIdx = pi % 4;
      }
      const wDef = wallDefs[wIdx % 4];
      const prodCode = prod.code || "";
      const isWall2D = isWallUnitByCode(prodCode);
      /* Wall units are shallower (35cm depth vs 60cm for base) */
      const rawDepth = isWall2D ? 35 : parseFloat(prod.dimensions?.d || "60");
      const pw = Math.max(parseFloat(prod.designW || prod.dimensions?.w || "60") * scale, 6);
      const pd = Math.max(rawDepth * scale * 0.4, 4);

      const pOffset = wallOffsets[wIdx] ?? 0;
      wallOffsets[wIdx] = pOffset + pw + 2;

      let px = 0, py = 0, rectW = pw, rectH = pd;
      if (wDef.side === "top") { px = rx + pOffset; py = ry; rectH = pd; }
      else if (wDef.side === "right") { px = rx + rW - pd; py = ry + pOffset; rectW = pd; rectH = pw; }
      else if (wDef.side === "bottom") { px = rx + rW - pOffset - pw; py = ry + rH - pd; rectH = pd; }
      else { px = rx; py = ry + rH - pOffset - pw; rectW = pd; rectH = pw; }

      if (px >= rx - 2 && py >= ry - 2 && px + rectW <= rx + rW + 10 && py + rectH <= ry + rH + 10) {
        elements.push(
          <g key={`prod-${spaceIdx}-${pi}`}>
            <rect x={px} y={py} width={rectW} height={rectH}
              fill={isWall2D ? "none" : wDef.color + "40"}
              stroke={wDef.color}
              strokeWidth={isWall2D ? 1.2 : 1}
              strokeDasharray={isWall2D ? "4,3" : undefined}
              rx={1} />
            {rectW > 18 && (
              <text x={px + rectW / 2} y={py + rectH / 2} textAnchor="middle"
                dominantBaseline="middle" fontSize={6} fill={wDef.color} fontWeight="bold">
                {(prodCode).slice(0, 7)}
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

/* ─── Elevation View ─────────────────────────────────── */
const EV_W = 900;
const EV_H = 500;
const EV_MARGIN = { top: 40, right: 40, bottom: 60, left: 60 };
const EV_ROOM_H = 280; /* room height in cm — fallback */

const WALL_NAMES_AR = ["جدار A (خلفي)", "جدار B (يمين)", "جدار C (أمامي)", "جدار D (يسار)"];
const WALL_NAMES_EN = ["Wall A (Back)", "Wall B (Right)", "Wall C (Front)", "Wall D (Left)"];

function ElevationView({ survey }: { survey: any }) {
  const { t } = useLanguage();
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeWall, setActiveWall] = useState(0);

  const firstSpace = (survey?.spaces || [])[0];
  const roomDims = survey?.roomDimensions || (firstSpace ? {
    length: firstSpace.length, width: firstSpace.width,
    height: firstSpace.height || firstSpace.wallHeight || EV_ROOM_H,
  } : { length: 400, width: 300, height: 240 });

  const rawL = parseFloat(roomDims.length) || 400;
  const rawW = parseFloat(roomDims.width) || 300;
  const rawH = parseFloat(roomDims.height) || 240;
  const roomL = rawL <= 30 ? rawL * 100 : rawL;
  const roomW = rawW <= 30 ? rawW * 100 : rawW;
  const roomH = rawH <= 30 ? rawH * 100 : rawH;

  const products = (survey?.selectedProducts || []) as any[];
  const wallLengths = [roomL, roomW, roomL, roomW];

  const drawW = EV_W - EV_MARGIN.left - EV_MARGIN.right;
  const drawH = EV_H - EV_MARGIN.top - EV_MARGIN.bottom;

  const wallLen = wallLengths[activeWall] || roomL;
  const scaleX = drawW / wallLen;
  const scaleY = drawH / roomH;

  const ox = EV_MARGIN.left;
  const oy = EV_MARGIN.top;

  /* Products on the active wall */
  const wallProducts: any[] = [];
  const wallOffsets: Record<number, number> = { 0: 10, 1: 10, 2: 10, 3: 10 };
  const wallLengthsClamp = [roomL, roomW, roomL, roomW];
  products.forEach((p) => {
    const wIdx = getWallIndex(p);
    const pW = parseFloat(p.designW || p.dimensions?.w || "60");
    const curOff = wallOffsets[wIdx];
    if (curOff + pW > wallLengthsClamp[wIdx] - 10) return;
    wallOffsets[wIdx] = curOff + pW + 5;
    if (wIdx === activeWall) {
      wallProducts.push({ ...p, _evX: curOff, _evW: pW });
    }
  });

  /* Wall opening items (doors/windows) for the active wall */
  const surveyWallsForEV: any[] = firstSpace?.walls || [];
  const activeWallItems: any[] = useMemo(() => {
    for (const w of surveyWallsForEV) {
      const letter = (w.id || "").slice(-1).toUpperCase();
      if (WALL_LETTER_IDX[letter] === activeWall) return w.items || [];
    }
    return [];
  }, [surveyWallsForEV, activeWall]);

  const downloadPNG = useCallback(() => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const canvas = document.createElement("canvas");
    canvas.width = EV_W * 2;
    canvas.height = EV_H * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    img.onload = () => {
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement("a");
      a.download = `elevation-wall-${["A","B","C","D"][activeWall]}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  }, [activeWall]);

  /* Dimension arrow helper */
  const DimArrow = ({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label: string }) => {
    const isH = Math.abs(y2 - y1) < 1;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6B7280" strokeWidth={1} markerEnd="url(#arrowhead)" markerStart="url(#arrowhead-rev)" />
        <text x={isH ? mx : mx - 14} y={isH ? my - 5 : my} textAnchor="middle" fontSize={8} fill="#374151">{label}</text>
      </g>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-muted-foreground">{t("مخطط الارتفاع", "Elevation View")}</p>
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((wi) => (
              <Button
                key={wi}
                size="sm"
                variant={activeWall === wi ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => setActiveWall(wi)}
                data-testid={`btn-elevation-wall-${["A","B","C","D"][wi]}`}
              >
                {["A","B","C","D"][wi]}
              </Button>
            ))}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={downloadPNG} data-testid="btn-download-elevation">
          <Download className="h-3.5 w-3.5 me-1" />
          {t("تحميل PNG", "Download PNG")}
        </Button>
      </div>

      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900 p-2">
        <svg
          ref={svgRef}
          width={EV_W}
          height={EV_H}
          viewBox={`0 0 ${EV_W} ${EV_H}`}
          className="w-full h-auto"
          style={{ maxWidth: EV_W }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
              <polygon points="0 0, 6 2.5, 0 5" fill="#6B7280" />
            </marker>
            <marker id="arrowhead-rev" markerWidth="6" markerHeight="5" refX="0" refY="2.5" orient="auto-start-reverse">
              <polygon points="0 0, 6 2.5, 0 5" fill="#6B7280" />
            </marker>
          </defs>

          <rect width={EV_W} height={EV_H} fill="white" />
          {/* Title */}
          <text x={EV_W / 2} y={20} textAnchor="middle" fontSize={12} fontWeight="bold" fill="#374151">
            {t("تيك للتصنيع — مخطط الارتفاع", "Teak — Elevation View")} · {t(WALL_NAMES_AR[activeWall], WALL_NAMES_EN[activeWall])}
          </text>

          {/* Drawing area border */}
          <rect x={ox} y={oy} width={drawW} height={drawH} fill="#FAFAF8" stroke="#E5E7EB" strokeWidth={1} />

          {/* Floor line */}
          <line x1={ox} y1={oy + drawH} x2={ox + drawW} y2={oy + drawH} stroke="#374151" strokeWidth={2.5} />

          {/* Architectural openings (doors & windows) on this wall */}
          {activeWallItems.map((item: any, oi: number) => {
            if (item.type !== "door" && item.type !== "window") return null;
            const rawDist = parseFloat(item.distanceFromFirst || "0") || 0;
            const dist = rawDist <= 30 ? rawDist * 100 : rawDist;
            const rawW2 = parseFloat(item.width || "0") || 0;
            const iw = rawW2 > 0 ? (rawW2 <= 30 ? rawW2 * 100 : rawW2) : (item.type === "door" ? 90 : 120);
            const rawH2 = parseFloat(item.height || "0") || 0;
            const ih = rawH2 > 0 ? (rawH2 <= 30 ? rawH2 * 100 : rawH2) : (item.type === "door" ? 210 : 120);
            const rawHf = parseFloat(item.heightFromFloor || "0") || 0;
            const iy = item.type === "door" ? 0 : (rawHf > 0 ? (rawHf <= 30 ? rawHf * 100 : rawHf) : 90);
            const isDoor = item.type === "door";
            const ex = ox + dist * scaleX;
            const ew = iw * scaleX;
            const ey = oy + drawH - (iy + ih) * scaleY;
            const eh = ih * scaleY;
            const label = isDoor ? t("ب", "D") : t("ن", "W");
            return (
              <g key={oi}>
                {/* Opening fill */}
                <rect x={ex} y={ey} width={ew} height={eh}
                  fill={isDoor ? "#FEF9EE" : "#EFF6FF"}
                  stroke={isDoor ? "#92400E" : "#3B82F6"}
                  strokeWidth={isDoor ? 1.5 : 1.5}
                  strokeDasharray={isDoor ? undefined : "5,3"}
                />
                {/* Door swing arc */}
                {isDoor && (
                  <path
                    d={`M ${ex} ${ey + eh} a ${ew} ${ew} 0 0 0 ${ew} ${-ew}`}
                    fill="none" stroke="#92400E" strokeWidth={1} strokeDasharray="3,2"
                  />
                )}
                {/* Opening type label */}
                <text x={ex + ew / 2} y={ey + eh / 2} textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fontWeight="bold" fill={isDoor ? "#92400E" : "#1D4ED8"}>
                  {label}
                </text>
                {/* Width dimension */}
                <text x={ex + ew / 2} y={ey + eh + 10} textAnchor="middle" fontSize={7} fill="#6B7280">
                  {iw}
                </text>
              </g>
            );
          })}

          {/* Zone: backsplash 85–150cm (light blue-gray fill) */}
          {(() => {
            const bsY1 = oy + drawH - 150 * scaleY;
            const bsY2 = oy + drawH - 85 * scaleY;
            return (
              <rect x={ox} y={bsY1} width={drawW} height={bsY2 - bsY1}
                fill="#EFF6FF" stroke="none" opacity={0.6} />
            );
          })()}

          {/* Countertop line at 85cm */}
          {(() => {
            const ctY = oy + drawH - 85 * scaleY;
            return (
              <line x1={ox} y1={ctY} x2={ox + drawW} y2={ctY} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="6,4" />
            );
          })()}

          {/* Wall-unit zone upper boundary at 220cm */}
          {(() => {
            const wuY = oy + drawH - 220 * scaleY;
            return (
              <line x1={ox} y1={wuY} x2={ox + drawW} y2={wuY} stroke="#CBD5E1" strokeWidth={0.8} strokeDasharray="3,5" />
            );
          })()}

          {/* Products on this wall */}
          {wallProducts.map((prod, pi) => {
            const pW = prod._evW;
            const pX = ox + prod._evX * scaleX;
            const pSvgW = pW * scaleX;
            const code = prod.code || "";
            const isWall = isWallUnitByCode(code);
            const isTall = isTallUnit(prod);

            let pYFrom: number, pYTo: number;
            if (isWall) {
              pYFrom = 150; pYTo = 150 + parseFloat(prod.dimensions?.h || prod.designH || "70");
            } else if (isTall) {
              pYFrom = 0; pYTo = parseFloat(prod.dimensions?.h || prod.designH || "200");
            } else {
              pYFrom = 0; pYTo = parseFloat(prod.dimensions?.h || prod.designH || "85");
            }
            const svgYTop = oy + drawH - pYTo * scaleY;
            const svgYBot = oy + drawH - pYFrom * scaleY;
            const svgCabH = svgYBot - svgYTop;

            const fillColor = isWall ? "#DBEAFE" : isTall ? "#F3E8FF" : "#FEF3C7";
            const strokeColor = isWall ? "#3B82F6" : isTall ? "#8B5CF6" : "#D97706";
            const dashArr = isWall ? "4,3" : undefined;

            return (
              <g key={pi}>
                <rect
                  x={pX} y={svgYTop}
                  width={pSvgW} height={svgCabH}
                  fill={fillColor} stroke={strokeColor} strokeWidth={1}
                  strokeDasharray={dashArr}
                  rx={1}
                />
                {/* Countertop strip for base units */}
                {!isWall && !isTall && (
                  <rect x={pX} y={svgYTop - 3 * scaleY} width={pSvgW} height={3 * scaleY}
                    fill="#9CA3AF" stroke="none" />
                )}
                {/* Door handle line */}
                {pSvgW > 14 && (
                  <line
                    x1={pX + pSvgW * 0.75} y1={svgYTop + svgCabH * 0.35}
                    x2={pX + pSvgW * 0.75} y2={svgYTop + svgCabH * 0.65}
                    stroke={strokeColor} strokeWidth={2} />
                )}
                {/* Product code label */}
                {pSvgW > 20 && (
                  <text x={pX + pSvgW / 2} y={svgYTop + svgCabH / 2 + 3}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.min(7, pSvgW / 8)} fill={strokeColor} fontWeight="bold">
                    {code.slice(0, 6)}
                  </text>
                )}
                {/* Per-cabinet width dimension arrow below floor line */}
                <DimArrow
                  x1={pX + 1} y1={oy + drawH + 22}
                  x2={pX + pSvgW - 1} y2={oy + drawH + 22}
                  label={`${pW}cm`}
                />
              </g>
            );
          })}

          {/* Dimension arrows — left side for height */}
          <DimArrow
            x1={ox - 20} y1={oy + drawH}
            x2={ox - 20} y2={oy + drawH - 85 * scaleY}
            label="85"
          />
          <DimArrow
            x1={ox - 36} y1={oy + drawH - 85 * scaleY}
            x2={ox - 36} y2={oy + drawH - 150 * scaleY}
            label="65"
          />
          <DimArrow
            x1={ox - 20} y1={oy + drawH - 150 * scaleY}
            x2={ox - 20} y2={oy + drawH - 220 * scaleY}
            label="70"
          />

          {/* Wall length dimension bottom */}
          <DimArrow
            x1={ox} y1={oy + drawH + 30}
            x2={ox + drawW} y2={oy + drawH + 30}
            label={`${wallLen} cm`}
          />

          {/* Zone labels on right */}
          {[
            { y: oy + drawH - 42 * scaleY, label: t("خزانة قاعدة", "Base"), color: "#D97706" },
            { y: oy + drawH - 117 * scaleY, label: t("رخامة / بلاطة", "Counter/Splash"), color: "#6B7280" },
            { y: oy + drawH - 185 * scaleY, label: t("خزانة علوية", "Wall Unit"), color: "#3B82F6" },
          ].map((z, zi) => (
            <text key={zi} x={ox + drawW + 6} y={z.y} fontSize={8} fill={z.color} dominantBaseline="middle">
              {z.label}
            </text>
          ))}

          {/* Floor level label */}
          <text x={ox + 4} y={oy + drawH + 10} fontSize={8} fill="#374151">0 cm</text>

          {/* Room total height dimension arrow — right side */}
          <DimArrow
            x1={ox + drawW + 15} y1={oy + drawH}
            x2={ox + drawW + 15} y2={oy}
            label={`${Math.round(roomH)}cm`}
          />

          {/* Watermark */}
          <text x={EV_W - 6} y={EV_H - 6} textAnchor="end" fontSize={7} fill="#9CA3AF">teak2030.net</text>
        </svg>
      </div>

      {/* Legend */}
      <div className="p-2 border-t shrink-0">
        <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-4 h-3 bg-yellow-100 border border-yellow-600 rounded-sm block" />
            {t("خزانة قاعدة", "Base Cabinet")}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-3 bg-blue-100 border border-blue-500 border-dashed rounded-sm block" />
            {t("خزانة علوية", "Wall Cabinet")}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-3 bg-purple-100 border border-purple-500 rounded-sm block" />
            {t("خزانة طولية", "Tall Cabinet")}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-2 bg-gray-300 rounded-sm block" />
            {t("رخامة الكونتر", "Countertop")}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-3 bg-blue-50 border border-blue-200 rounded-sm block" />
            {t("منطقة البلاطة الجدارية", "Backsplash Zone")}
          </span>
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
  const [floorType, setFloorType] = useState<FloorType>("parquet");
  const [activeTab, setActiveTab] = useState(() => {
    const t = params.get("tab");
    if (t === "2d") return "2d";
    if (t === "elevation") return "elevation";
    return "3d";
  });

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

  const surveySpaces: any[] = useMemo(() => survey?.spaces || [], [survey]);
  const [activeSpaceId, setActiveSpaceId] = useState<string>("");

  // Auto-select first space when survey loads
  useEffect(() => {
    if (surveySpaces.length > 0 && !activeSpaceId) {
      setActiveSpaceId(surveySpaces[0].id);
    }
  }, [surveySpaces, activeSpaceId]);

  const activeSpace = useMemo(() =>
    surveySpaces.find((s: any) => s.id === activeSpaceId) || surveySpaces[0],
  [surveySpaces, activeSpaceId]);

  // Create a per-space survey view for 3D/2D/Elevation
  const surveyForSpace = useMemo(() => {
    if (!survey || !activeSpace) return survey;
    const allProducts: any[] = survey.selectedProducts || [];
    const spaceProducts = allProducts.filter((p: any) => p.spaceId === activeSpace.id);
    const spaceL = parseFloat(activeSpace.length) || 400;
    const spaceW = parseFloat(activeSpace.width) || 300;
    const spaceH = parseFloat(activeSpace.height || activeSpace.wallHeight || "240") || 240;
    return {
      ...survey,
      spaces: [activeSpace],
      selectedProducts: spaceProducts,
      roomDimensions: {
        length: spaceL <= 30 ? spaceL * 100 : spaceL,
        width: spaceW <= 30 ? spaceW * 100 : spaceW,
        height: spaceH <= 30 ? spaceH * 100 : spaceH,
      },
    };
  }, [survey, activeSpace, surveySpaces]);

  const selectedProducts = useMemo(() => (survey?.selectedProducts || []) as any[], [survey]);
  const spaceProducts = useMemo(() => (surveyForSpace?.selectedProducts || []) as any[], [surveyForSpace]);

  /** Set of spaceProduct indices (0-based in spaceProducts) that overlap a door/window opening */
  const conflictIndices = useMemo<Set<number>>(() => {
    const result = new Set<number>();
    const walls: any[] = activeSpace?.walls || [];
    if (walls.length === 0) return result;
    const openings = buildWallOpenings(walls);
    const offsets: Record<number, number> = { 0: 10, 1: 10, 2: 10, 3: 10 };
    spaceProducts.forEach((p: any, idx: number) => {
      const letter = (p.wallId || "").slice(-1).toUpperCase();
      const wIdx = WALL_LETTER_IDX[letter] ?? 0;
      const pW = parseFloat(p.designW || p.dimensions?.w || "60");
      const pStart = offsets[wIdx];
      const pEnd = pStart + pW;
      offsets[wIdx] = pEnd + 5;
      const hasConflict = (openings[wIdx] || []).some(op => pStart < op.end && pEnd > op.start);
      if (hasConflict) result.add(idx);
    });
    return result;
  }, [activeSpace, spaceProducts]);

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

  const rawRoomDims = surveyForSpace?.roomDimensions || survey?.roomDimensions || {
    length: parseFloat(survey?.roomLength || "400"),
    width: parseFloat(survey?.roomWidth || "300"),
    height: parseFloat(survey?.roomHeight || "240"),
  };
  /* Convert meters to cm for display if stored as small numbers */
  const dispL = parseFloat(rawRoomDims.length) <= 30 ? Math.round(parseFloat(rawRoomDims.length) * 100) : Math.round(parseFloat(rawRoomDims.length));
  const dispW = parseFloat(rawRoomDims.width) <= 30 ? Math.round(parseFloat(rawRoomDims.width) * 100) : Math.round(parseFloat(rawRoomDims.width));
  const dispH = parseFloat(rawRoomDims.height) <= 30 ? Math.round(parseFloat(rawRoomDims.height) * 100) : Math.round(parseFloat(rawRoomDims.height));

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
              {t("الغرفة:", "Room:")} {dispL}×{dispW}×{dispH} {t("سم", "cm")}
            </p>
          </div>
          {surveySpaces.length > 1 && (
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1" data-testid="space-tabs">
              {surveySpaces.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => { setActiveSpaceId(s.id); setKey(k => k + 1); setSelectedProduct(-1); }}
                  data-testid={`btn-space-${s.id}`}
                  className={`text-xs px-3 py-1 rounded-md transition-all whitespace-nowrap max-w-[140px] truncate ${
                    activeSpaceId === s.id
                      ? "bg-background shadow font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title={s.name || t("مكان", "Space")}
                >
                  {s.name || t("مكان", "Space")}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Package className="h-3 w-3" /> {spaceProducts.length} {t("منتج", "products")}
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
          <TabsTrigger value="elevation" data-testid="tab-elevation">{t("مخطط الارتفاع", "Elevation")}</TabsTrigger>
        </TabsList>

        <TabsContent value="3d" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex">
          <div className="flex-1 relative" style={{ background: lightMode === "day" ? "linear-gradient(to bottom, #e0f2fe, #bae6fd)" : "linear-gradient(to bottom, #0f0c29, #1a1a2e)" }}>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {surveyForSpace && (
              <Canvas key={key} shadows gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: lightMode === "day" ? 1.0 : 0.7 }}>
                <Suspense fallback={null}>
                  <Scene3D
                    survey={surveyForSpace}
                    selectedIdx={selectedProduct}
                    onSelect={setSelectedProduct}
                    lightMode={lightMode}
                    floorType={floorType}
                  />
                </Suspense>
              </Canvas>
            )}
            {/* Floor type selector overlay */}
            <div className="absolute top-3 end-3 flex gap-1 bg-black/30 rounded-lg p-1">
              {(["parquet", "tile", "marble"] as FloorType[]).map((ft) => (
                <button
                  key={ft}
                  onClick={() => setFloorType(ft)}
                  data-testid={`btn-floor-${ft}`}
                  className={`text-[10px] px-2 py-1 rounded-md transition-colors ${floorType === ft ? "bg-white text-gray-900 font-bold" : "text-white/80 hover:text-white"}`}
                >
                  {ft === "parquet" ? t("باركيه", "Parquet") : ft === "tile" ? t("سيراميك", "Tile") : t("رخام", "Marble")}
                </button>
              ))}
            </div>
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
            {spaceProducts.length === 0 ? (
              <p className="p-4 text-muted-foreground text-sm text-center">{t("لا توجد منتجات", "No products")}</p>
            ) : (
              <div className="p-2 space-y-2">
                {spaceProducts.map((p: any, spaceIdx: number) => {
                  const i = selectedProducts.findIndex((sp: any) => sp.id ? sp.id === p.id : sp === p);
                  const isSelected = selectedProduct === spaceIdx;
                  const price = Number(p.price || p.unitPrice || p.priceBeforeVat || 0);
                  const optCost = Number(p.optionsCost || 0);
                  return (
                    <Card
                      key={p.id || spaceIdx}
                      className={`overflow-hidden cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary" : ""}`}
                      onClick={() => setSelectedProduct(isSelected ? -1 : spaceIdx)}
                      data-testid={`product-3d-${spaceIdx}`}
                    >
                      <CardContent className="p-2">
                        <div className="flex items-start gap-2">
                          <div className="w-3 h-3 rounded-sm mt-1 flex-shrink-0"
                            style={{ backgroundColor: getCabinetColor(p, spaceIdx) }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-xs font-medium line-clamp-1 flex-1">{p.nameAr || p.code || `Item ${spaceIdx + 1}`}</p>
                              {conflictIndices.has(spaceIdx) && (
                                <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 shrink-0" data-testid={`badge-conflict-${spaceIdx}`}>
                                  {t("تعارض", "Conflict")}
                                </Badge>
                              )}
                            </div>
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
          {surveyForSpace ? (
            <FloorPlan2D survey={surveyForSpace} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}
        </TabsContent>

        <TabsContent value="elevation" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex flex-col">
          {surveyForSpace ? (
            <ElevationView survey={surveyForSpace} />
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
