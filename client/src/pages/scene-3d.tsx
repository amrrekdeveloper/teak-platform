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
  RefreshCw, Search, Sun, Moon, Download, Map, AlertTriangle, ClipboardList,
  Plus, X, Layers, Move,
} from "lucide-react";
import { Link } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { getCornerJunctionOffset } from "@/lib/kitchenTemplates";
import { useToast } from "@/hooks/use-toast";

const SCALE = 0.01;

interface DesignWarning {
  type: "conflict" | "overflow" | "corner";
  productIdx: number;
  productName: string;
  messageAr: string;
  messageEn: string;
}

/* Natural medium-oak color used as tint when wood texture is active */
const CABINET_WOOD_COLOR = "#C8A86A";

/* Fallback solid color for hover/select states */
function getCabinetColor(_product: any, _index: number): string {
  return CABINET_WOOD_COLOR;
}

/* ── Wood grain procedural texture (natural oak) ─────── */
let _woodTexSingleton: THREE.DataTexture | null = null;
function getWoodTexture(): THREE.DataTexture {
  if (_woodTexSingleton) return _woodTexSingleton;
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      /* Horizontal plank bands */
      const plankH = 96;
      const plankRow = Math.floor(y / plankH);
      const py = (y % plankH) / plankH;
      /* Fine grain lines undulating along x */
      const grain1 = Math.sin((y + plankRow * 31) * 0.13 + x * 0.009 + Math.cos(x * 0.018) * 10) * 14;
      const grain2 = Math.sin((y + plankRow * 9) * 0.28 + x * 0.006) * 7;
      /* Occasional dark medullary ray streaks */
      const ray = Math.sin(y * 0.07 + plankRow * 1.9 + x * 0.004) > 0.82 ? -16 : 0;
      /* Plank seam darker edge */
      const seam = (py < 0.018 || py > 0.982) ? -20 : 0;
      /* Natural oak: warm honey mid-tone */
      const base = 188 + grain1 + grain2 + ray + seam;
      data[idx]     = Math.min(255, Math.max(110, base + 12));      /* R */
      data[idx + 1] = Math.min(255, Math.max(90,  base - 22));      /* G */
      data[idx + 2] = Math.min(255, Math.max(55,  base - 72));      /* B */
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  tex.needsUpdate = true;
  _woodTexSingleton = tex;
  return tex;
}

/* ── White marble procedural texture (floor + countertop) */
let _whiteMarbleSingleton: THREE.DataTexture | null = null;
function getWhiteMarbleTexture(): THREE.DataTexture {
  if (_whiteMarbleSingleton) return _whiteMarbleSingleton;
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      /* Diagonal vein network */
      const v1 = Math.sin((x * 0.016 + y * 0.019 + Math.sin(x * 0.009 - y * 0.011) * 18) * 1.4) * 22;
      const v2 = Math.sin((x * 0.026 - y * 0.023 + Math.cos(x * 0.013 + y * 0.01) * 12) * 1.1) * 13;
      const v3 = Math.sin((x * 0.007 + y * 0.031 + Math.sin(y * 0.016) * 9) * 1.7) * 9;
      /* Gold/ochre vein accent */
      const gold = Math.sin(x * 0.041 + y * 0.029 + 2.5) > 0.89 ? 18 : 0;
      const base = 236 + v1 * 0.6 + v2 * 0.4 + v3 * 0.3;
      data[idx]     = Math.min(255, Math.max(205, base + gold));
      data[idx + 1] = Math.min(255, Math.max(200, base + gold * 0.7));
      data[idx + 2] = Math.min(255, Math.max(190, base - gold * 0.2));
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  _whiteMarbleSingleton = tex;
  return tex;
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
      {/* Bright studio daylight: warm white ambient */}
      <ambientLight intensity={0.85} color="#FFF8F0" />
      {/* Primary sun — upper right, warm white */}
      <directionalLight
        position={[8, 12, 6]}
        intensity={1.4}
        color="#FFFBF2"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-radius={6}
        shadow-bias={-0.0005}
      />
      {/* Sky fill — cool blue bounce from opposite side */}
      <directionalLight position={[-6, 8, -5]} intensity={0.45} color="#CADDFF" />
      {/* Under-floor soft fill — eliminates harsh under-cabinet shadows */}
      <directionalLight position={[0, -4, 3]} intensity={0.2} color="#FFF5E8" />
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

/* Better white marble floor: large tiles with thin grout + veins */
function makeMarbleTexture(L: number, W: number): THREE.DataTexture {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  const grout = 6; /* thin grout line */
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const isGrout = x < grout || y < grout || x > size - grout || y > size - grout;
      if (isGrout) {
        /* Light grey grout */
        data[idx] = 195; data[idx + 1] = 193; data[idx + 2] = 190; data[idx + 3] = 255;
      } else {
        /* White marble tile with grey/gold veins */
        const nx = x / size, ny = y / size;
        const v1 = Math.sin((nx * 2.8 + ny * 3.4 + Math.sin(nx * 1.8 - ny * 1.4) * 2.2) * Math.PI) * 18;
        const v2 = Math.sin((nx * 4.5 - ny * 2.9 + Math.cos(nx * 2.1 + ny * 1.8) * 1.5) * Math.PI) * 11;
        const v3 = Math.sin((nx * 1.2 + ny * 5.1 + Math.sin(ny * 2.4) * 1.1) * Math.PI * 1.3) * 7;
        const gold = Math.sin((nx * 3.2 + ny * 4.1 + 0.8) * Math.PI * 2) > 0.91 ? 20 : 0;
        const base = 238 + v1 * 0.55 + v2 * 0.35 + v3 * 0.25;
        data[idx]     = Math.min(255, Math.max(210, base + gold));
        data[idx + 1] = Math.min(255, Math.max(205, base + gold * 0.65));
        data[idx + 2] = Math.min(255, Math.max(198, base - gold * 0.15));
        data[idx + 3] = 255;
      }
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  /* Large tiles: ~80cm each → repeat = room_size / 0.8m */
  tex.repeat.set(Math.max(1, L / 0.8), Math.max(1, W / 0.8));
  tex.needsUpdate = true;
  return tex;
}

function FloorMesh({ L, W, floorType }: { L: number; W: number; floorType: FloorType }) {
  const texture = useMemo(() => {
    if (floorType === "tile") return makeTileTexture(L, W);
    if (floorType === "marble") return makeMarbleTexture(L, W);
    return makeParquetTexture(L, W);
  }, [L, W, floorType]);

  const roughness = floorType === "marble" ? 0.18 : floorType === "tile" ? 0.45 : 0.68;
  const metalness = floorType === "marble" ? 0.12 : 0.0;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
      <planeGeometry args={[L, W]} />
      <meshStandardMaterial map={texture} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

/* Countertop uses the white marble singleton */
function makeGraniteTexture(): THREE.DataTexture {
  return getWhiteMarbleTexture();
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
              {/* ── Outdoor scene behind window ─────────────── */}
              {/* Sky — gradient from deep sky to horizon */}
              <mesh position={[0, ih * 0.22, -0.22]}>
                <planeGeometry args={[iw * 1.05, ih * 0.6]} />
                <meshBasicMaterial color="#87CEEB" />
              </mesh>
              {/* Upper sky (deeper blue) */}
              <mesh position={[0, ih * 0.42, -0.21]}>
                <planeGeometry args={[iw * 1.05, ih * 0.2]} />
                <meshBasicMaterial color="#5DA8D4" />
              </mesh>
              {/* Ground/horizon pale */}
              <mesh position={[0, -ih * 0.32, -0.22]}>
                <planeGeometry args={[iw * 1.05, ih * 0.2]} />
                <meshBasicMaterial color="#D4E8C2" />
              </mesh>
              {/* Tree canopy — dark green middle */}
              <mesh position={[0, -ih * 0.04, -0.20]}>
                <planeGeometry args={[iw * 1.05, ih * 0.55]} />
                <meshBasicMaterial color="#3A7A3A" />
              </mesh>
              {/* Tree highlights — lighter green patches */}
              <mesh position={[-iw * 0.2, ih * 0.03, -0.19]}>
                <planeGeometry args={[iw * 0.45, ih * 0.38]} />
                <meshBasicMaterial color="#4F9A4F" />
              </mesh>
              <mesh position={[iw * 0.25, -ih * 0.01, -0.19]}>
                <planeGeometry args={[iw * 0.38, ih * 0.32]} />
                <meshBasicMaterial color="#56A656" />
              </mesh>
              {/* ── Window glass ─────────────────────────────── */}
              <mesh position={[0, 0, 0.002]}>
                <planeGeometry args={[iw - 0.05, ih - 0.05]} />
                <meshStandardMaterial
                  color="#C8E8FF"
                  transparent
                  opacity={0.22}
                  roughness={0.04}
                  metalness={0.12}
                />
              </mesh>
              {/* ── Window frame (white aluminium) ──────────── */}
              {/* Top/bottom bars */}
              {([-ih / 2, ih / 2] as number[]).map((fy, fi) => (
                <mesh key={fi} position={[0, fy, 0.016]}>
                  <boxGeometry args={[iw + 0.08, FRAME_W, FRAME_W * 0.8]} />
                  <meshStandardMaterial color="#F0F0EE" roughness={0.35} metalness={0.08} />
                </mesh>
              ))}
              {/* Left/right bars */}
              {([-iw / 2, iw / 2] as number[]).map((fx, fi) => (
                <mesh key={fi + 2} position={[fx, 0, 0.016]}>
                  <boxGeometry args={[FRAME_W, ih + 0.08, FRAME_W * 0.8]} />
                  <meshStandardMaterial color="#F0F0EE" roughness={0.35} metalness={0.08} />
                </mesh>
              ))}
              {/* Centre divider bar (horizontal) */}
              <mesh position={[0, 0, 0.016]}>
                <boxGeometry args={[iw + 0.02, FRAME_W * 0.7, FRAME_W * 0.7]} />
                <meshStandardMaterial color="#E8E8E6" roughness={0.35} metalness={0.08} />
              </mesh>
              {/* Window sill (protruding white ledge) */}
              <mesh position={[0, -ih / 2 - 0.035, 0.06]}>
                <boxGeometry args={[iw + 0.12, 0.04, 0.12]} />
                <meshStandardMaterial color="#F5F5F3" roughness={0.3} metalness={0.06} />
              </mesh>
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
  floorType = "marble" as FloorType,
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
  /* Neutral warm white walls — professional and clean */
  const wallColor = "#EEECE8";
  const items = (idx: number) => wallItems?.[idx] || [];

  return (
    <group>
      <FloorMesh L={L} W={W} floorType={floorType} />
      {/* Ceiling — slightly warm off-white with crown moulding suggestion */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]} receiveShadow>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial color="#F8F6F2" roughness={0.95} metalness={0.0} />
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

/** Detects if a product is a drawer unit by code pattern */
function isDrawerUnit(product: any): boolean {
  const code = (product.code || "").toUpperCase();
  return code.includes("DD") || code.includes("2DP") || code.includes("3DP") || code.includes("4DP") || code.includes("DR-");
}

/** Professional cabinet door front with stile/rail frame + recessed center panel */
function CabinetFront({ W, H, D, frameColor, panelColor, drawerCount }: {
  W: number; H: number; D: number; frameColor: string; panelColor: string; drawerCount?: number;
}) {
  const st = Math.min(0.042, W * 0.08);   // stile width (vertical frame members)
  const rl = Math.min(0.048, H * 0.07);   // rail height (horizontal frame members)
  const FD = 0.018;  // frame depth (protrudes from carcass front)
  const PD = 0.008;  // panel depth (recessed slightly behind frame)
  const z = D / 2;

  const panelW = W - st * 2;
  const panelH = H - rl * 2;

  const frameMat = <meshStandardMaterial color={frameColor} roughness={0.55} metalness={0.06} />;
  const panelMat = <meshStandardMaterial color={panelColor} roughness={0.70} metalness={0.02} />;

  if (drawerCount && drawerCount > 1) {
    // Drawer unit: show horizontal drawer fronts
    const drawers = Array.from({ length: drawerCount });
    const dH = (H - rl * (drawerCount + 1)) / drawerCount;
    return (
      <group position={[0, 0, z]}>
        {/* Outer frame */}
        <mesh position={[0, H / 2 - rl / 2, FD / 2]} castShadow>
          <boxGeometry args={[W, rl, FD]} />{frameMat}
        </mesh>
        <mesh position={[0, -H / 2 + rl / 2, FD / 2]} castShadow>
          <boxGeometry args={[W, rl, FD]} />{frameMat}
        </mesh>
        <mesh position={[-W / 2 + st / 2, 0, FD / 2]} castShadow>
          <boxGeometry args={[st, H, FD]} />{frameMat}
        </mesh>
        <mesh position={[W / 2 - st / 2, 0, FD / 2]} castShadow>
          <boxGeometry args={[st, H, FD]} />{frameMat}
        </mesh>
        {/* Individual drawer fronts */}
        {drawers.map((_, di) => {
          const yCenter = H / 2 - rl - di * (dH + rl) - dH / 2;
          return (
            <group key={di}>
              <mesh position={[0, yCenter, PD / 2]} castShadow>
                <boxGeometry args={[panelW - 0.002, dH - 0.004, PD]} />{panelMat}
              </mesh>
              {/* Drawer handle - horizontal bar */}
              <mesh position={[0, yCenter, FD + 0.01]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.006, 0.006, W * 0.45, 8]} />
                <meshStandardMaterial color="#2A2A2A" roughness={0.25} metalness={0.85} />
              </mesh>
            </group>
          );
        })}
      </group>
    );
  }

  // Standard door front: frame + recessed center panel
  const numDoors = W > 0.60 ? 2 : 1;
  const doorW = panelW / numDoors - (numDoors > 1 ? st / 2 : 0);

  return (
    <group position={[0, 0, z]}>
      {/* Top rail */}
      <mesh position={[0, H / 2 - rl / 2, FD / 2]} castShadow>
        <boxGeometry args={[W, rl, FD]} />{frameMat}
      </mesh>
      {/* Bottom rail */}
      <mesh position={[0, -H / 2 + rl / 2, FD / 2]} castShadow>
        <boxGeometry args={[W, rl, FD]} />{frameMat}
      </mesh>
      {/* Left stile */}
      <mesh position={[-W / 2 + st / 2, 0, FD / 2]} castShadow>
        <boxGeometry args={[st, H, FD]} />{frameMat}
      </mesh>
      {/* Right stile */}
      <mesh position={[W / 2 - st / 2, 0, FD / 2]} castShadow>
        <boxGeometry args={[st, H, FD]} />{frameMat}
      </mesh>
      {/* Center divider for double-door */}
      {numDoors === 2 && (
        <mesh position={[0, 0, FD / 2]} castShadow>
          <boxGeometry args={[st, H, FD]} />{frameMat}
        </mesh>
      )}
      {/* Center panel(s) — recessed */}
      {Array.from({ length: numDoors }).map((_, di) => {
        const px = numDoors === 2 ? (di === 0 ? -doorW / 2 - st / 4 : doorW / 2 + st / 4) : 0;
        return (
          <mesh key={di} position={[px, 0, PD / 2]} castShadow>
            <boxGeometry args={[doorW, panelH, PD]} />{panelMat}
          </mesh>
        );
      })}
    </group>
  );
}

function Cabinet({
  product, index, roomL, roomW, selected, onSelect, hasConflict,
}: {
  product: any; index: number; roomL: number; roomW: number; roomH?: number;
  selected: boolean; onSelect: (idx: number) => void; hasConflict?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

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
  const isSelected = selected;
  const frameThick = 0.018;
  const frameColor = isSelected ? "#C8A030" : "#2C1A0E";

  const graniteTexture = useMemo(() => isBaseUnit(product) ? makeGraniteTexture() : null, []);
  /* Wood texture for cabinet carcass body */
  const woodTexture = useMemo(() => {
    const t = getWoodTexture();
    /* Per-cabinet repeat: 2 tiles wide × 3 tall at default scale */
    return t;
  }, []);

  /* Selection / hover / conflict tint overlay */
  const tintColor = hasConflict
    ? (isSelected ? "#FF6B6B" : "#FF4444")
    : (isSelected ? "#E8C547" : hovered ? "#D4B870" : "#FFFFFF");
  const tintOpacity = hasConflict ? 0.55 : (isSelected || hovered) ? 0.28 : 0.0;

  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onSelect(index); }}
    >
      {/* Cabinet carcass with oak wood texture */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial
          map={hasConflict ? undefined : woodTexture}
          roughness={0.62}
          metalness={0.04}
          color={hasConflict ? "#CC2222" : tintColor}
        />
      </mesh>
      {/* Selection / conflict highlight overlay */}
      {(isSelected || hovered || hasConflict) && (
        <mesh>
          <boxGeometry args={[W + 0.004, H + 0.004, D + 0.004]} />
          <meshBasicMaterial color={tintColor} transparent opacity={tintOpacity} depthWrite={false} />
        </mesh>
      )}

      <mesh position={[0, 0, D / 2 + frameThick / 2]} castShadow>
        <boxGeometry args={[W - 0.008, H - 0.008, frameThick]} />
        <meshStandardMaterial color={frameColor} roughness={0.65} metalness={0.12} />
      </mesh>

      <CabinetFront
        W={W}
        H={H}
        D={D + frameThick}
        frameColor={isSelected ? "#C8A030" : "#2C1A0E"}
        panelColor={isSelected ? "#D4B870" : isWallUnit(product) ? "#DED0B8" : "#C8A878"}
        drawerCount={isDrawerUnit(product) ? 3 : undefined}
      />

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
  placingProduct, onWallPlace,
}: {
  survey: any; selectedIdx: number; onSelect: (i: number) => void; lightMode: "day" | "night"; floorType: FloorType;
  placingProduct?: any | null;
  onWallPlace?: (wallIndex: number, xOffsetCm: number) => void;
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

  /* Pre-pass: reserve space at the junction end for corner units so regular
     products don't overflow into the occupied zone.
     "end" corners → reserved from the far (right) end of local x.
     "start" corners → reserved from the near (left/start) end. */
  const wallRightReserved: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const wallLeftReserved:  Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  products.forEach((p: any) => {
    if (!p._isCorner) return;
    const wIdx = getWallIndex(p);
    const pW = parseFloat(p.designW || p.dimensions?.w || "60");
    const junction = (p._cornerJunction as "start" | "end") ?? "end";
    if (junction === "start") {
      wallLeftReserved[wIdx] = Math.max(wallLeftReserved[wIdx], pW + 5);
    } else {
      wallRightReserved[wIdx] = Math.max(wallRightReserved[wIdx], pW + 5);
    }
  });

  /* Initial offsets respect any start-side corner reservation */
  const wallOffsets: Record<number, number> = {
    0: 10 + wallLeftReserved[0],
    1: 10 + wallLeftReserved[1],
    2: 10 + wallLeftReserved[2],
    3: 10 + wallLeftReserved[3],
  };
  const productsWithPos = products.reduce((acc: any[], p: any, sourceIdx: number) => {
    const wIdx = getWallIndex(p);
    const pW = parseFloat(p.designW || p.dimensions?.w || "60");
    const wallLen = wallLengths[wIdx] || L;

    /* Corner units anchored via explicit junction coordinate helper.
       getCornerJunctionOffset(wallIndex, junction, wallLenCm, cornerW)
       → returns center x-offset in cm from wall start. */
    if (p._isCorner) {
      const junction = (p._cornerJunction as "start" | "end") ?? "end";
      const xOffset = getCornerJunctionOffset(wIdx, junction, wallLen, pW);
      acc.push({ ...p, _wallIndex: wIdx, _xOffset: xOffset, _sourceIndex: sourceIdx, _conflict: false });
      return acc;
    }

    const currentOffset = wallOffsets[wIdx];
    const rightReserve = wallRightReserved[wIdx];
    if (currentOffset + pW > wallLen - rightReserve - 10) return acc; /* skip overflow */
    wallOffsets[wIdx] = currentOffset + pW + 5;

    /* Conflict: does this cabinet overlap a door/window opening? */
    const pStart = currentOffset;
    const pEnd   = currentOffset + pW;
    const hasOverlap = (wallOpenings[wIdx] || []).some(
      (op) => pStart < op.end && pEnd > op.start
    );
    /* Wall units (upper cabinets) overlapping a door/window is always a conflict */
    const _conflict = hasOverlap;

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
          hasConflict={!!p._conflict}
        />
      ))}

      {/* ── Interactive Wall Click Planes (shown only in placing mode) ── */}
      {placingProduct && onWallPlace && [
        /* wall 0: top  — along +Z face, cabinet depth offset from front */
        { wallIdx: 0, pos: [-L/2*SCALE/2, H*SCALE/2, -W/2*SCALE + 0.05] as [number,number,number], rot: [0,0,0] as [number,number,number], planW: L*SCALE, planH: H*SCALE, axis: "x", axisSign: 1, axisBase: -L/2 },
        /* wall 1: right */
        { wallIdx: 1, pos: [L/2*SCALE - 0.05, H*SCALE/2, W/2*SCALE/2] as [number,number,number],  rot: [0,Math.PI/2,0] as [number,number,number], planW: W*SCALE, planH: H*SCALE, axis: "z", axisSign: 1, axisBase: -W/2 },
        /* wall 2: bottom */
        { wallIdx: 2, pos: [L/2*SCALE/2, H*SCALE/2, W/2*SCALE - 0.05] as [number,number,number],  rot: [0,Math.PI,0] as [number,number,number], planW: L*SCALE, planH: H*SCALE, axis: "x", axisSign: -1, axisBase: L/2 },
        /* wall 3: left */
        { wallIdx: 3, pos: [-L/2*SCALE + 0.05, H*SCALE/2, -W/2*SCALE/2] as [number,number,number], rot: [0,-Math.PI/2,0] as [number,number,number], planW: W*SCALE, planH: H*SCALE, axis: "z", axisSign: -1, axisBase: W/2 },
      ].map(({ wallIdx, pos, rot, planW, planH, axis, axisSign, axisBase }) => (
        <mesh
          key={`wallplane-${wallIdx}`}
          position={pos}
          rotation={rot}
          onClick={(e) => {
            e.stopPropagation();
            /* Compute click point along the wall axis → cm offset from start */
            const localPt = e.point;
            let rawOffset: number;
            if (axis === "x") rawOffset = (localPt.x - axisBase * SCALE) * axisSign / SCALE;
            else              rawOffset = (localPt.z - axisBase * SCALE) * axisSign / SCALE;
            const clampedOffset = Math.max(5, Math.min(rawOffset, (axis === "x" ? L : W) - 5));
            onWallPlace(wallIdx, clampedOffset);
          }}
        >
          <planeGeometry args={[planW, planH]} />
          <meshBasicMaterial
            color="#60A5FA"
            transparent
            opacity={0.08}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </>
  );
}


function FloorPlan2D({ survey }: { survey: any }) {
  const { t } = useLanguage();
  const svgRef = useRef<SVGSVGElement>(null);
  const spaces: any[] = survey.spaces || [];
  const allProducts: any[] = survey.selectedProducts || [];

  /* Canvas & visual constants */
  const CW = 900, CH = 680;
  const TITLE_H = 36;
  const FOOT_H  = 44;
  const CONTENT_Y = TITLE_H + 6;
  const CONTENT_H = CH - TITLE_H - 6 - FOOT_H;

  /* Engineering color palette */
  const WALL_FILL   = "#2D3748";
  const ROOM_BG     = "#FAF9F6";
  const DIM_COLOR   = "#1A202C";
  const DOOR_COLOR  = "#744210";
  const WIN_OUT     = "#1E40AF";
  const WIN_GLASS   = "#93C5FD";
  const WLABEL_COLORS = ["#2563EB","#059669","#D97706","#7C3AED"];

  const WALL_LABELS = ["A","B","C","D"];

  function downloadPNG() {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const sc = 2;
      canvas.width = CW * sc; canvas.height = CH * sc;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(svgUrl); return; }
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(sc, sc);
      ctx.drawImage(img, 0, 0, CW, CH);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "floor-plan.png"; a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.src = svgUrl;
  }

  if (spaces.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {t("لا توجد مساحات لعرضها", "No spaces to display")}
      </div>
    );
  }

  /* Layout grid */
  const cols = Math.min(spaces.length, 2);
  const rows = Math.ceil(spaces.length / cols);
  const CELL_W = CW / cols;
  const CELL_H = CONTENT_H / rows;
  const DIM_M  = 58; /* margin around room for dimension lines */

  const elements: JSX.Element[] = [];
  const defs: JSX.Element[] = [];

  /* SVG arrowhead markers */
  defs.push(
    <marker key="arre" id="arre" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 L1.5,3.5 Z" fill={DIM_COLOR} />
    </marker>
  );
  defs.push(
    <marker key="arrs" id="arrs" markerWidth="7" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse">
      <path d="M0,0 L7,3.5 L0,7 L1.5,3.5 Z" fill={DIM_COLOR} />
    </marker>
  );

  /* Hatch patterns for cabinet footprints — one per wall colour */
  WLABEL_COLORS.forEach((c, i) => {
    defs.push(
      <pattern key={`hp${i}`} id={`hp${i}`}
        patternUnits="userSpaceOnUse" width="6" height="6"
        patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke={c} strokeWidth="1.1" opacity="0.55" />
      </pattern>
    );
  });
  /* Light dot pattern for room floor */
  defs.push(
    <pattern key="floor-dot" id="floor-dot"
      patternUnits="userSpaceOnUse" width="14" height="14">
      <circle cx="7" cy="7" r="0.9" fill="#CBD5E0" />
    </pattern>
  );

  spaces.forEach((space, si) => {
    const col = si % cols;
    const row = Math.floor(si / cols);
    const cellX = col * CELL_W;
    const cellY = CONTENT_Y + row * CELL_H;

    const drawX = cellX + DIM_M;
    const drawY = cellY + DIM_M;
    const drawW = CELL_W - DIM_M * 2;
    const drawH = CELL_H - DIM_M * 2;

    const rawL = parseFloat(space.length) || 3;
    const rawW_s = parseFloat(space.width)  || 2.4;
    const roomLcm = rawL   <= 30 ? rawL   * 100 : rawL;
    const roomWcm = rawW_s <= 30 ? rawW_s * 100 : rawW_s;

    const scaleX = drawW / roomLcm;
    const scaleY = drawH / roomWcm;
    const scale  = Math.min(scaleX, scaleY, 1.6);

    const rW = roomLcm * scale;
    const rH = roomWcm * scale;
    const rx  = drawX + (drawW - rW) / 2;
    const ry  = drawY + (drawH - rH) / 2;

    /* Visual wall thickness in pixels (proportional but capped) */
    const WVIZ = Math.max(8, Math.min(16, scale * 13));

    /* ── ROOM BACKGROUND ────────────────────────────── */
    elements.push(
      <rect key={`bg-${si}`} x={rx} y={ry} width={rW} height={rH}
        fill="url(#floor-dot)" stroke="none" />
    );
    elements.push(
      <rect key={`room-${si}`} x={rx} y={ry} width={rW} height={rH}
        fill={ROOM_BG} fillOpacity={0.82} stroke="none" />
    );

    /* ── WALLS (filled rectangles) ──────────────────── */
    const wallParts = [
      { x: rx - WVIZ, y: ry - WVIZ, w: rW + WVIZ * 2, h: WVIZ },           /* top    */
      { x: rx + rW,   y: ry,         w: WVIZ,           h: rH  },           /* right  */
      { x: rx - WVIZ, y: ry + rH,    w: rW + WVIZ * 2, h: WVIZ },           /* bottom */
      { x: rx - WVIZ, y: ry,         w: WVIZ,           h: rH  },           /* left   */
    ];
    wallParts.forEach((wp, wi) => {
      elements.push(
        <rect key={`wall-${si}-${wi}`}
          x={wp.x} y={wp.y} width={wp.w} height={wp.h}
          fill={WALL_FILL}
        />
      );
    });

    /* ── DIMENSION LINES ───────────────────────────── */
    const DG = 14; /* gap from outer wall face to dim line */
    const DE = 5;  /* extension line overrun beyond dim line */

    /* Top dim — room length */
    const dimYT = ry - WVIZ - DG;
    const lenLabel = `${(roomLcm / 100).toFixed(2)} م`;
    elements.push(<line key={`dxt-l-${si}`} x1={rx} y1={ry - WVIZ - DE} x2={rx} y2={dimYT}
      stroke={DIM_COLOR} strokeWidth={0.8} />);
    elements.push(<line key={`dxt-r-${si}`} x1={rx + rW} y1={ry - WVIZ - DE} x2={rx + rW} y2={dimYT}
      stroke={DIM_COLOR} strokeWidth={0.8} />);
    elements.push(<line key={`dxt-${si}`} x1={rx} y1={dimYT} x2={rx + rW} y2={dimYT}
      stroke={DIM_COLOR} strokeWidth={1.1}
      markerStart="url(#arrs)" markerEnd="url(#arre)" />);
    elements.push(
      <text key={`dxt-lbl-${si}`} x={rx + rW / 2} y={dimYT - 5}
        textAnchor="middle" fontSize={9.5} fill={DIM_COLOR}
        fontFamily="monospace" fontWeight="600">{lenLabel}</text>
    );

    /* Left dim — room width */
    const dimXL = rx - WVIZ - DG;
    const widLabel = `${(roomWcm / 100).toFixed(2)} م`;
    elements.push(<line key={`dxl-t-${si}`} x1={rx - WVIZ - DE} y1={ry} x2={dimXL} y2={ry}
      stroke={DIM_COLOR} strokeWidth={0.8} />);
    elements.push(<line key={`dxl-b-${si}`} x1={rx - WVIZ - DE} y1={ry + rH} x2={dimXL} y2={ry + rH}
      stroke={DIM_COLOR} strokeWidth={0.8} />);
    elements.push(<line key={`dxl-${si}`} x1={dimXL} y1={ry} x2={dimXL} y2={ry + rH}
      stroke={DIM_COLOR} strokeWidth={1.1}
      markerStart="url(#arrs)" markerEnd="url(#arre)" />);
    elements.push(
      <text key={`dxl-lbl-${si}`}
        x={dimXL - 5} y={ry + rH / 2}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={9.5} fill={DIM_COLOR} fontFamily="monospace" fontWeight="600"
        transform={`rotate(-90, ${dimXL - 5}, ${ry + rH / 2})`}>{widLabel}</text>
    );

    /* ── WALL LABELS (A B C D) ─────────────────────── */
    const walls: any[] = space.walls || [];
    const wLblPos = [
      { x: rx + rW / 2, y: ry - WVIZ - DG - 16 },
      { x: rx + rW + WVIZ + 14, y: ry + rH / 2 },
      { x: rx + rW / 2, y: ry + rH + WVIZ + 16 },
      { x: rx - WVIZ - 14, y: ry + rH / 2 },
    ];
    WALL_LABELS.forEach((lbl, wi) => {
      elements.push(
        <text key={`wlbl-${si}-${wi}`}
          x={wLblPos[wi].x} y={wLblPos[wi].y}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={11} fontWeight="bold" fill={WLABEL_COLORS[wi]}>{lbl}</text>
      );
      /* individual wall length below/beside label */
      const wall = walls[wi];
      if (wall?.length) {
        const wlcm = parseFloat(wall.length) <= 30 ? parseFloat(wall.length)*100 : parseFloat(wall.length);
        const lblPos2 = [
          { x: rx + rW / 2, y: ry - WVIZ - DG - 28 },
          { x: rx + rW + WVIZ + 28, y: ry + rH / 2 },
          { x: rx + rW / 2, y: ry + rH + WVIZ + 30 },
          { x: rx - WVIZ - 30, y: ry + rH / 2 },
        ][wi];
        elements.push(
          <text key={`wlen-${si}-${wi}`} x={lblPos2.x} y={lblPos2.y}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={7.5} fill={WLABEL_COLORS[wi]} fontFamily="monospace">
            {`${(wlcm/100).toFixed(2)}م`}
          </text>
        );
      }
    });

    /* ── SPACE TITLE inside room ───────────────────── */
    elements.push(
      <text key={`sname-${si}`} x={rx + rW / 2} y={ry + rH / 2 - 7}
        textAnchor="middle" fontSize={12} fontWeight="bold" fill="#94A3B8">
        {space.name || `${t("مساحة","Space")} ${si+1}`}
      </text>
    );
    elements.push(
      <text key={`sdim-${si}`} x={rx + rW / 2} y={ry + rH / 2 + 10}
        textAnchor="middle" fontSize={8} fill="#94A3B8">
        {`${(roomLcm/100).toFixed(2)}م × ${(roomWcm/100).toFixed(2)}م`}
      </text>
    );

    /* ── WALL ITEMS (door / window / outlet / drain / water_supply) ── */
    const wallDefs = [
      { side: "top",    color: WLABEL_COLORS[0] },
      { side: "right",  color: WLABEL_COLORS[1] },
      { side: "bottom", color: WLABEL_COLORS[2] },
      { side: "left",   color: WLABEL_COLORS[3] },
    ];

    walls.forEach((wall: any, wi: number) => {
      const wd = wallDefs[wi];
      if (!wd || !wall) return;
      const items: any[] = wall.items || [];
      const isHoriz = wd.side === "top" || wd.side === "bottom";

      items.forEach((item: any, ii: number) => {
        const rawDist = parseFloat(item.distanceFromFirst || "0");
        const dist = (rawDist <= 30 ? rawDist * 100 : rawDist) * scale;
        const rawIw  = parseFloat(item.width || "0");
        const iw = Math.max(
          (rawIw > 0 ? (rawIw <= 30 ? rawIw * 100 : rawIw) : (item.type === "door" ? 90 : 100)) * scale,
          8
        );

        /* anchor position along wall */
        let ix = 0, iy = 0;
        if      (wd.side === "top")    { ix = rx + dist;             iy = ry;      }
        else if (wd.side === "right")  { ix = rx + rW;               iy = ry + dist; }
        else if (wd.side === "bottom") { ix = rx + rW - dist - iw;   iy = ry + rH; }
        else                           { ix = rx;                     iy = ry + rH - dist - iw; }

        const key = `item-${si}-${wi}-${ii}`;

        if (item.type === "door") {
          /* Gap in wall */
          elements.push(
            <rect key={`${key}-g`}
              x={isHoriz ? ix : ix - WVIZ}
              y={isHoriz ? iy - WVIZ : iy}
              width={isHoriz ? iw : WVIZ + 2}
              height={isHoriz ? WVIZ + 2 : iw}
              fill={ROOM_BG} stroke="none" />
          );
          /* Door leaf + arc */
          let arcD = "", leafX2 = ix, leafY2 = iy;
          if (wd.side === "top") {
            leafX2 = ix + iw; leafY2 = iy;
            arcD = `M${ix+iw},${iy} A${iw},${iw} 0 0,0 ${ix},${iy+iw}`;
          } else if (wd.side === "bottom") {
            leafX2 = ix + iw; leafY2 = iy;
            arcD = `M${ix},${iy} A${iw},${iw} 0 0,0 ${ix+iw},${iy-iw}`;
          } else if (wd.side === "right") {
            leafX2 = ix; leafY2 = iy + iw;
            arcD = `M${ix},${iy} A${iw},${iw} 0 0,0 ${ix-iw},${iy+iw}`;
          } else {
            leafX2 = ix + WVIZ; leafY2 = iy + iw;
            arcD = `M${ix+WVIZ},${iy+iw} A${iw},${iw} 0 0,0 ${ix+WVIZ+iw},${iy}`;
          }
          elements.push(
            <g key={key}>
              <line x1={ix+(wd.side==="left"?WVIZ:0)} y1={iy}
                x2={leafX2} y2={leafY2}
                stroke={DOOR_COLOR} strokeWidth={2.2} />
              <path d={arcD} fill="none"
                stroke={DOOR_COLOR} strokeWidth={1.2} strokeDasharray="5,3" />
            </g>
          );

        } else if (item.type === "window") {
          /* Gap in wall */
          elements.push(
            <rect key={`${key}-g`}
              x={isHoriz ? ix : ix - WVIZ}
              y={isHoriz ? iy - WVIZ : iy}
              width={isHoriz ? iw : WVIZ + 2}
              height={isHoriz ? WVIZ + 2 : iw}
              fill={ROOM_BG} stroke="none" />
          );
          const o1 = WVIZ * 0.12, o2 = WVIZ * 0.5, o3 = WVIZ * 0.88;
          elements.push(
            <g key={key}>
              {/* outer */}
              <line x1={isHoriz?ix:ix-WVIZ+o1} y1={isHoriz?iy-WVIZ+o1:iy}
                x2={isHoriz?ix+iw:ix-WVIZ+o1} y2={isHoriz?iy-WVIZ+o1:iy+iw}
                stroke={WIN_OUT} strokeWidth={1.8} />
              {/* glass */}
              <line x1={isHoriz?ix:ix-WVIZ+o2} y1={isHoriz?iy-WVIZ+o2:iy}
                x2={isHoriz?ix+iw:ix-WVIZ+o2} y2={isHoriz?iy-WVIZ+o2:iy+iw}
                stroke={WIN_GLASS} strokeWidth={2.5} />
              {/* inner */}
              <line x1={isHoriz?ix:ix-WVIZ+o3} y1={isHoriz?iy-WVIZ+o3:iy}
                x2={isHoriz?ix+iw:ix-WVIZ+o3} y2={isHoriz?iy-WVIZ+o3:iy+iw}
                stroke={WIN_OUT} strokeWidth={1.8} />
            </g>
          );

        } else if (item.type === "outlet") {
          const cx2 = isHoriz ? ix+iw/2 : ix-WVIZ/2;
          const cy2 = isHoriz ? iy-WVIZ/2 : iy+iw/2;
          elements.push(
            <g key={key}>
              <circle cx={cx2} cy={cy2} r={6} fill="#FEF3C7" stroke="#F59E0B" strokeWidth={1.5}/>
              <text x={cx2} y={cy2+1} textAnchor="middle" dominantBaseline="middle"
                fontSize={7} fill="#D97706" fontWeight="bold">⚡</text>
            </g>
          );
        } else if (item.type === "drain") {
          const cx2 = isHoriz ? ix+iw/2 : ix-WVIZ/2;
          const cy2 = isHoriz ? iy-WVIZ/2 : iy+iw/2;
          elements.push(
            <g key={key}>
              <circle cx={cx2} cy={cy2} r={6} fill="#EFF6FF" stroke="#3B82F6" strokeWidth={1.5}/>
              <line x1={cx2-3} y1={cy2-2} x2={cx2} y2={cy2+3} stroke="#1D4ED8" strokeWidth={1.5}/>
              <line x1={cx2+3} y1={cy2-2} x2={cx2} y2={cy2+3} stroke="#1D4ED8" strokeWidth={1.5}/>
            </g>
          );
        } else if (item.type === "water_supply") {
          const cx2 = isHoriz ? ix+iw/2 : ix-WVIZ/2;
          const cy2 = isHoriz ? iy-WVIZ/2 : iy+iw/2;
          elements.push(
            <g key={key}>
              <circle cx={cx2} cy={cy2} r={6} fill="#ECFDF5" stroke="#059669" strokeWidth={1.5}/>
              <line x1={cx2-3.5} y1={cy2} x2={cx2+3.5} y2={cy2} stroke="#065F46" strokeWidth={1.4}/>
              <line x1={cx2} y1={cy2-3.5} x2={cx2} y2={cy2+3.5} stroke="#065F46" strokeWidth={1.4}/>
            </g>
          );
        }
      });
    });

    /* ── CABINET FOOTPRINTS ─────────────────────────── */
    const spaceProds = allProducts.filter((p: any) => p.spaceId === space.id);
    const wallSvgLens: Record<number,number> = { 0: rW, 1: rH, 2: rW, 3: rH };
    const svgRR: Record<number,number> = { 0:0,1:0,2:0,3:0 };
    const svgLR: Record<number,number> = { 0:0,1:0,2:0,3:0 };
    const wallIdToIdx2: Record<string,number> = {};
    walls.forEach((w:any,wi:number)=>{ if(w?.id) wallIdToIdx2[w.id]=wi; });

    spaceProds.forEach((prod:any)=>{
      if(!prod._isCorner) return;
      const wIdx2 = prod.wallId && wallIdToIdx2[prod.wallId]!==undefined ? wallIdToIdx2[prod.wallId] : 0;
      const pw2 = Math.max(parseFloat(prod.designW||prod.dimensions?.w||"60")*scale,6);
      const junc2 = (prod._cornerJunction as "start"|"end")??"end";
      if(junc2==="start") svgLR[wIdx2]=Math.max(svgLR[wIdx2],pw2+2);
      else                svgRR[wIdx2]=Math.max(svgRR[wIdx2],pw2+2);
    });

    const wallOffsets2: Record<number,number> = {
      0:svgLR[0], 1:svgLR[1], 2:svgLR[2], 3:svgLR[3]
    };

    spaceProds.forEach((prod:any,pi:number)=>{
      let wIdx=0;
      if(prod.wallId && wallIdToIdx2[prod.wallId]!==undefined) wIdx=wallIdToIdx2[prod.wallId];
      else wIdx=pi%4;
      const wDef = wallDefs[wIdx%4];
      const prodCode = prod.code||"";
      const isWall2D = isWallUnitByCode(prodCode);
      const rawDepth = isWall2D ? 35 : parseFloat(prod.dimensions?.d||"60");
      const pw = Math.max(parseFloat(prod.designW||prod.dimensions?.w||"60")*scale,6);
      const pd = Math.max(rawDepth*scale*0.45,4);
      const isCorner2D = !!prod._isCorner;
      const junc2D = (prod._cornerJunction as "start"|"end")??"end";

      let pOffset:number;
      if(isCorner2D){
        pOffset=getCornerJunctionOffset(wIdx,junc2D,wallSvgLens[wIdx],pw)-pw/2;
      } else {
        const rr=svgRR[wIdx]??0;
        const maxOff=wallSvgLens[wIdx]-rr-pw-2;
        pOffset=Math.min(wallOffsets2[wIdx]??0,maxOff);
        wallOffsets2[wIdx]=pOffset+pw+2;
      }

      let px=0,py=0,rectW=pw,rectH=pd;
      if      (wDef.side==="top")    { px=rx+pOffset;         py=ry;           rectH=pd; }
      else if (wDef.side==="right")  { px=rx+rW-pd;           py=ry+pOffset;   rectW=pd; rectH=pw; }
      else if (wDef.side==="bottom") { px=rx+rW-pOffset-pw;   py=ry+rH-pd;    rectH=pd; }
      else                            { px=rx;                  py=ry+rH-pOffset-pw; rectW=pd; rectH=pw; }

      if(px>=rx-2 && py>=ry-2 && px+rectW<=rx+rW+10 && py+rectH<=ry+rH+10){
        const hatchId = `hp${wIdx%4}`;
        elements.push(
          <g key={`prod-${si}-${pi}`}>
            <rect x={px} y={py} width={rectW} height={rectH}
              fill={isCorner2D ? "#FDE68A" : `url(#${hatchId})`}
              stroke={isCorner2D ? DOOR_COLOR : wDef.color}
              strokeWidth={isWall2D ? 1.2 : isCorner2D ? 1.8 : 1.4}
              strokeDasharray={isWall2D && !isCorner2D ? "5,3" : undefined}
              rx={1.5} />
            {/* Dim label inside footprint */}
            {rectW > 12 && (
              <text x={px+rectW/2} y={py+rectH/2+1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={Math.max(5,Math.min(7,rectW/6))}
                fill={isCorner2D ? "#78350F" : wDef.color} fontWeight="bold">
                {isCorner2D ? "◣" : `${Math.round(parseFloat(prod.designW||prod.dimensions?.w||"60"))}cm`}
              </text>
            )}
          </g>
        );
      }
    });
  });

  /* ── SCALE BAR ────────────────────────────────────── */
  /* Use scale of the last (or only) space, or fallback */
  const scaleBarY = CONTENT_Y + CONTENT_H + 8;
  const scaleBarX = CW / 2 - 50;
  const pxPer1m   = Math.min(
    spaces.length > 0
      ? (() => {
          const s0 = spaces[0];
          const rl = parseFloat(s0.length)||3;
          const rlcm = rl<=30?rl*100:rl;
          const cellW2 = CW / Math.min(spaces.length,2);
          const drawW2 = cellW2 - DIM_M * 2;
          return Math.min(drawW2 / rlcm, 1.6) * 100;
        })()
      : 60,
    80 /* cap at 80px = 1m for visual clarity */
  );

  elements.push(
    <g key="scalebar">
      <line x1={scaleBarX} y1={scaleBarY+14} x2={scaleBarX+pxPer1m} y2={scaleBarY+14}
        stroke={DIM_COLOR} strokeWidth={2} markerStart="url(#arrs)" markerEnd="url(#arre)" />
      <text x={scaleBarX+pxPer1m/2} y={scaleBarY+26}
        textAnchor="middle" fontSize={8.5} fill={DIM_COLOR} fontFamily="monospace">
        1 م = 100 سم
      </text>
      <text x={CW-10} y={CH-8} textAnchor="end" fontSize={7} fill="#94A3B8">
        teak-sa.com
      </text>
    </g>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b shrink-0">
        <p className="text-sm font-semibold text-muted-foreground">
          {t("مخطط هندسي 2D","2D Engineering Plan")} · {spaces.length} {t("مساحة","spaces")}
        </p>
        <Button size="sm" variant="outline" onClick={downloadPNG} data-testid="btn-download-plan">
          <Download className="h-3.5 w-3.5 me-1" />
          {t("تحميل PNG","Download PNG")}
        </Button>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 p-2">
        <svg
          ref={svgRef}
          width={CW} height={CH}
          viewBox={`0 0 ${CW} ${CH}`}
          className="w-full h-auto shadow-sm border border-gray-200 dark:border-gray-700"
          style={{ maxWidth: CW, background: "#fff" }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>{defs}</defs>
          <rect width={CW} height={CH} fill="white" />

          {/* Title block */}
          <rect x={0} y={0} width={CW} height={TITLE_H} fill="#1E293B" />
          <text x={CW/2} y={13} textAnchor="middle" fontSize={11} fontWeight="bold" fill="white"
            fontFamily="sans-serif">
            تيك للتصنيع — مخطط هندسي / Floor Plan
          </text>
          <text x={CW/2} y={26} textAnchor="middle" fontSize={8} fill="#94A3B8"
            fontFamily="monospace">
            {new Date().toLocaleDateString("ar-SA")} · teak-sa.com
          </text>

          {/* Thin border lines between title and content */}
          <line x1={0} y1={TITLE_H} x2={CW} y2={TITLE_H} stroke="#CBD5E0" strokeWidth={0.5} />

          {elements}

          {/* Legend */}
          <g transform={`translate(10, ${CONTENT_Y + CONTENT_H + 6})`}>
            <rect x={0} y={0} width={6} height={6} fill={WALL_FILL} />
            <text x={9} y={6} fontSize={7.5} fill="#4B5563">{t("جدار","Wall")}</text>
            <line x1={52} y1={3} x2={68} y2={3} stroke={DOOR_COLOR} strokeWidth={2}/>
            <text x={71} y={6} fontSize={7.5} fill="#4B5563">{t("باب","Door")}</text>
            <line x1={106} y1={3} x2={122} y2={3} stroke={WIN_OUT} strokeWidth={1.5}/>
            <text x={125} y={6} fontSize={7.5} fill="#4B5563">{t("نافذة","Window")}</text>
            <circle cx={161} cy={3} r={4} fill="#ECFDF5" stroke="#059669" strokeWidth={1.2}/>
            <text x={168} y={6} fontSize={7.5} fill="#4B5563">{t("مياه","Water")}</text>
            <circle cx={203} cy={3} r={4} fill="#FEF3C7" stroke="#F59E0B" strokeWidth={1.2}/>
            <text x={210} y={6} fontSize={7.5} fill="#4B5563">{t("كهرباء","Electric")}</text>
            <rect x={245} y={0} width={8} height={7} fill="url(#hp0)" stroke={WLABEL_COLORS[0]} strokeWidth={1}/>
            <text x={256} y={6} fontSize={7.5} fill="#4B5563">{t("خزانة","Cabinet")}</text>
          </g>
        </svg>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   PRODUCT LIBRARY PANEL — professional catalog sidebar
   ═══════════════════════════════════════════════════════════ */
const CABINET_GROUPS: Record<string, { ar: string; en: string }> = {
  "base":    { ar: "خزائن أرضية", en: "Base Cabinets" },
  "wall":    { ar: "خزائن علوية", en: "Wall Cabinets" },
  "tall":    { ar: "خزائن طويلة", en: "Tall Cabinets" },
  "corner":  { ar: "خزائن زاوية", en: "Corner Cabinets" },
  "other":   { ar: "متنوع",       en: "Other" },
};

function classifyProduct(p: any): string {
  const code = (p.code || "").toUpperCase();
  const grp  = (p.groupName || p.descriptionAr || "").toLowerCase();
  if (code.startsWith("HK") || code.startsWith("TK3") || code.startsWith("W-") || grp.includes("علو") || grp.includes("upper") || grp.includes("wall")) return "wall";
  if (code.startsWith("TL") || code.startsWith("T-") || grp.includes("طويل") || grp.includes("tall")) return "tall";
  if (code.includes("COR") || code.includes("ZAW") || grp.includes("زاوية") || grp.includes("corner")) return "corner";
  if (code.startsWith("B-") || code.startsWith("BP") || code.startsWith("BL") || grp.includes("أرض") || grp.includes("base")) return "base";
  return "base"; /* default to base for kitchen */
}

function ProductLibraryPanel({
  products,
  placingProduct,
  onSelectProduct,
  onClose,
  isLoading,
  search,
  onSearch,
}: {
  products: any[];
  placingProduct: any | null;
  onSelectProduct: (p: any) => void;
  onClose: () => void;
  isLoading: boolean;
  search: string;
  onSearch: (s: string) => void;
}) {
  const { t } = useLanguage();
  const [activeGroup, setActiveGroup] = useState<string>("base");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      const matchGroup = classifyProduct(p) === activeGroup;
      if (!matchGroup) return false;
      if (!q) return true;
      return (
        (p.code || "").toLowerCase().includes(q) ||
        (p.descriptionAr || "").toLowerCase().includes(q) ||
        (p.descriptionEn || "").toLowerCase().includes(q)
      );
    });
  }, [products, activeGroup, search]);

  return (
    <div className="w-72 border-s bg-background flex flex-col h-full shadow-xl z-10">
      {/* Header */}
      <div className="p-3 border-b bg-slate-800 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-blue-300" />
          <span className="font-bold text-sm">{t("مكتبة المنتجات","Product Library")}</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Group Tabs */}
      <div className="flex flex-wrap gap-1 p-2 border-b shrink-0 bg-slate-50 dark:bg-slate-900">
        {Object.entries(CABINET_GROUPS).map(([grp, labels]) => {
          const count = products.filter(p => classifyProduct(p) === grp).length;
          if (count === 0) return null;
          return (
            <button
              key={grp}
              onClick={() => setActiveGroup(grp)}
              className={`text-[10px] px-2 py-1 rounded-md border transition-all font-medium ${
                activeGroup === grp
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white dark:bg-slate-800 text-muted-foreground border-transparent hover:border-blue-300"
              }`}
            >
              {t(labels.ar, labels.en)}
              <span className="ms-1 opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="p-2 shrink-0">
        <div className="relative">
          <Search className="absolute start-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={t("بحث في الكتالوج...","Search catalog...")}
            className="ps-7 h-8 text-xs"
            data-testid="input-library-search"
          />
        </div>
      </div>

      {/* Product List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-6">
            {t("لا توجد منتجات","No products found")}
          </p>
        )}
        {!isLoading && filtered.map((p: any) => {
          const isPlacing = placingProduct?.id === p.id;
          const dims = `${p.designW||p.manufacturingW||0}×${p.designH||p.manufacturingH||0}×${p.designD||p.manufacturingD||0} cm`;
          return (
            <button
              key={p.id}
              onClick={() => onSelectProduct(isPlacing ? null : p)}
              data-testid={`lib-product-${p.id}`}
              className={`w-full text-start rounded-lg border p-2.5 transition-all cursor-pointer ${
                isPlacing
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-md ring-1 ring-blue-400"
                  : "border-border hover:border-blue-300 hover:bg-accent"
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-foreground font-mono truncate">{p.code}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
                    {p.descriptionAr || p.descriptionEn || p.code}
                  </p>
                  <p className="text-[9px] text-blue-500 mt-1 font-mono">{dims}</p>
                </div>
                <div className="flex flex-col items-end shrink-0 gap-1">
                  {isPlacing ? (
                    <Badge className="text-[9px] px-1.5 py-0 bg-blue-500">
                      <Move className="h-2.5 w-2.5 me-0.5" />
                      {t("اختر جداراً","Pick wall")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                      <Plus className="h-2.5 w-2.5" />
                    </Badge>
                  )}
                  {p.priceBeforeVat && (
                    <span className="text-[9px] text-green-600 font-mono">
                      {Number(p.priceBeforeVat).toLocaleString()} {t("ر.س","SAR")}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Instructions */}
      {placingProduct && (
        <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 shrink-0">
          <p className="text-[10px] text-blue-700 dark:text-blue-300 font-medium">
            {t("انقر على الجدار في المشهد ثلاثي الأبعاد لوضع الخزانة","Click on a wall in the 3D scene to place the cabinet")}
          </p>
        </div>
      )}
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
  const [floorType, setFloorType] = useState<FloorType>("marble");

  /* ── Design Mode: interactive placement ── */
  const [showLibrary, setShowLibrary] = useState(false);
  const [placingProduct, setPlacingProduct] = useState<any | null>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [localProducts, setLocalProducts] = useState<any[] | null>(null); /* null = use server data */
  const [localHistory, setLocalHistory] = useState<any[][]>([]);
  const [designSaved, setDesignSaved] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    const t = params.get("tab");
    if (t === "2d") return "2d";
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

  /** Collect all design warnings for the current space */
  const designWarnings = useMemo<DesignWarning[]>(() => {
    const warnings: DesignWarning[] = [];
    const walls: any[] = activeSpace?.walls || [];
    const openings = walls.length > 0 ? buildWallOpenings(walls) : ({} as Record<number, Array<{ start: number; end: number }>>);
    const offsets: Record<number, number> = { 0: 10, 1: 10, 2: 10, 3: 10 };
    const wallNames: Record<number, string> = { 0: "A", 1: "B", 2: "C", 3: "D" };
    const wallLensForCheck: Record<number, number> = {};
    const rawRD = surveyForSpace?.roomDimensions || {};
    const rl = parseFloat(rawRD.length) || 400;
    const rw = parseFloat(rawRD.width) || 300;
    const roomLc = rl <= 30 ? rl * 100 : rl;
    const roomWc = rw <= 30 ? rw * 100 : rw;
    wallLensForCheck[0] = roomLc; wallLensForCheck[1] = roomWc;
    wallLensForCheck[2] = roomLc; wallLensForCheck[3] = roomWc;

    spaceProducts.forEach((p: any, idx: number) => {
      const letter = (p.wallId || "").slice(-1).toUpperCase();
      const wIdx = WALL_LETTER_IDX[letter] ?? 0;
      const pW = parseFloat(p.designW || p.dimensions?.w || "60");
      const pName = p.nameAr || p.code || `منتج ${idx + 1}`;
      const pStart = offsets[wIdx];
      const pEnd = pStart + pW;
      offsets[wIdx] = pEnd + 5;

      const wallLen = wallLensForCheck[wIdx] || roomLc;
      if (pEnd > wallLen - 5) {
        warnings.push({
          type: "overflow",
          productIdx: idx,
          productName: pName,
          messageAr: `${pName} يتجاوز نهاية جدار ${wallNames[wIdx]}`,
          messageEn: `${pName} overflows wall ${wallNames[wIdx]}`,
        });
      }

      const wallOps = openings[wIdx] || [];
      if (wallOps.some(op => pStart < op.end && pEnd > op.start)) {
        const isWall = isWallUnit(p);
        warnings.push({
          type: "conflict",
          productIdx: idx,
          productName: pName,
          messageAr: `${pName} ${isWall ? "(علوي)" : ""} يتعارض مع باب/نافذة في جدار ${wallNames[wIdx]}`,
          messageEn: `${pName} ${isWall ? "(wall unit)" : ""} conflicts with door/window on wall ${wallNames[wIdx]}`,
        });
      }
    });
    return warnings;
  }, [activeSpace, spaceProducts, surveyForSpace]);

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
    enabled: true,
    staleTime: 180000,
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

  /* ── Sync localProducts when server data arrives ── */
  const activeSelectedProducts = useMemo(() =>
    localProducts !== null ? localProducts : selectedProducts,
    [localProducts, selectedProducts]
  );
  const activeSpaceProducts = useMemo(() =>
    activeSelectedProducts.filter((p: any) => !activeSpace || p.spaceId === activeSpace.id),
    [activeSelectedProducts, activeSpace]
  );

  /* ── Save Design mutation ── */
  const saveDesignMutation = useMutation({
    mutationFn: async () => {
      const qId = survey?.quotationId || quotationIdParam;
      if (!qId || localProducts === null) throw new Error("Nothing to save");
      const res = await fetch("/api/customer-portal/update-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ quotationId: parseInt(qId), products: localProducts }),
      });
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("تم حفظ التصميم", "Design saved successfully") });
      setDesignSaved(true);
      setLocalProducts(null);
      setLocalHistory([]);
      queryClient.invalidateQueries({ queryKey: ["/api/site-surveys", surveyId, isPublic, tokenParam] });
    },
    onError: () => { toast({ title: t("خطأ في الحفظ", "Save error"), variant: "destructive" }); },
  });

  /* ── Wall click placement handler ── */
  const handleWallPlace = useCallback((wallIndex: number, xOffsetCm: number) => {
    if (!placingProduct || !activeSpace) return;
    const wallLetters = ["A","B","C","D"];
    const wallId = activeSpace.walls?.find((_w: any, i: number) => i === wallIndex)?.id
                ?? `${activeSpace.id}-wall-${wallLetters[wallIndex]}`;
    const newProd = {
      productId: placingProduct.id,
      code: placingProduct.code,
      nameAr: placingProduct.descriptionAr || placingProduct.code,
      name: placingProduct.descriptionEn || placingProduct.descriptionAr || placingProduct.code,
      unitPrice: parseFloat(placingProduct.priceBeforeVat?.toString() || "0"),
      quantity: 1,
      optionsCost: 0,
      optionDetails: {},
      spaceId: activeSpace.id,
      wallId,
      designW: parseFloat(placingProduct.designW?.toString() || "60").toString(),
      dimensions: {
        w: parseFloat(placingProduct.designW?.toString() || placingProduct.manufacturingW?.toString() || "60"),
        h: parseFloat(placingProduct.designH?.toString() || placingProduct.manufacturingH?.toString() || "72"),
        d: parseFloat(placingProduct.designD?.toString() || placingProduct.manufacturingD?.toString() || "60"),
      },
      _manualXOffset: xOffsetCm,
    };
    const base = localProducts !== null ? localProducts : selectedProducts;
    setLocalHistory(h => [...h, base]);
    setLocalProducts([...base, newProd]);
    setDesignSaved(false);
    toast({ title: t("تم إضافة الخزانة", "Cabinet added"), description: placingProduct.code });
  }, [placingProduct, activeSpace, localProducts, selectedProducts, t, toast]);

  /* ── Undo last placement ── */
  const handleUndo = useCallback(() => {
    if (localHistory.length === 0) return;
    setLocalProducts(localHistory[localHistory.length - 1]);
    setLocalHistory(h => h.slice(0, -1));
    setDesignSaved(false);
  }, [localHistory]);

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
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1">
            <Package className="h-3 w-3" /> {spaceProducts.length} {t("منتج", "products")}
          </Badge>
          {designWarnings.length > 0 && (
            <Badge variant="destructive" className="gap-1" data-testid="badge-warnings-count">
              <AlertTriangle className="h-3 w-3" /> {designWarnings.length} {t("تحذير", "warnings")}
            </Badge>
          )}
          {!designSaved && localProducts !== null && (
            <Badge variant="outline" className="gap-1 border-amber-400 text-amber-600">
              ● {t("تعديلات غير محفوظة","Unsaved")}
            </Badge>
          )}
          <Badge variant="secondary" className="font-bold">
            {(() => { const d = parseFloat(survey?.discount || "0"); return ((subtotal - d) * 1.15).toLocaleString(undefined, { maximumFractionDigits: 0 }); })()} {t("ر.س", "SAR")}
          </Badge>

          {/* Design mode: save + undo */}
          {localProducts !== null && !designSaved && (
            <>
              <Button size="sm" variant="outline" onClick={handleUndo} disabled={localHistory.length === 0}
                data-testid="btn-undo-placement" title={t("تراجع","Undo")}>
                <RotateCcw className="h-3.5 w-3.5 me-1" />{t("تراجع","Undo")}
              </Button>
              <Button size="sm" onClick={() => saveDesignMutation.mutate()}
                disabled={saveDesignMutation.isPending}
                data-testid="btn-save-design">
                {saveDesignMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin me-1" />
                  : null}
                {t("حفظ التصميم","Save Design")}
              </Button>
            </>
          )}

          {activeTab === "3d" && (
            <>
              {/* Library toggle */}
              <Button
                size="sm"
                variant={showLibrary ? "default" : "outline"}
                onClick={() => setShowLibrary(v => !v)}
                data-testid="btn-toggle-library"
                title={t("مكتبة المنتجات","Product Library")}
                className={showLibrary ? "bg-slate-700 text-white hover:bg-slate-600" : ""}
              >
                <Layers className="h-3.5 w-3.5 me-1" />{t("الكتالوج","Catalog")}
              </Button>
              <Button
                size="sm"
                variant={lightMode === "night" ? "default" : "outline"}
                onClick={() => setLightMode(lm => lm === "day" ? "night" : "day")}
                data-testid="btn-toggle-light"
                title={t("تبديل الإضاءة", "Toggle lighting")}
              >
                {lightMode === "day" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              </Button>
            </>
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
          <TabsTrigger value="bom" data-testid="tab-bom" className="flex items-center gap-1">
            <ClipboardList className="h-3.5 w-3.5" />
            {t("التصنيع", "BOM")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="3d" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex">
          {/* Library sidebar */}
          {showLibrary && (
            <ProductLibraryPanel
              products={adekoProducts}
              placingProduct={placingProduct}
              onSelectProduct={(p) => setPlacingProduct(p)}
              onClose={() => { setShowLibrary(false); setPlacingProduct(null); }}
              isLoading={false}
              search={librarySearch}
              onSearch={setLibrarySearch}
            />
          )}
          <div
            className="flex-1 relative"
            style={{
              background: lightMode === "day"
                ? "linear-gradient(to bottom, #e0f2fe, #bae6fd)"
                : "linear-gradient(to bottom, #0f0c29, #1a1a2e)",
              cursor: placingProduct ? "crosshair" : "default",
            }}
          >
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {/* Placing mode indicator banner */}
            {placingProduct && (
              <div className="absolute top-0 inset-x-0 z-20 bg-blue-600/90 text-white text-xs text-center py-1.5 font-medium">
                {t("وضع التثبيت","Placing")} · <strong>{placingProduct.code}</strong>
                {" — "}
                {t("انقر على جدار لوضع الخزانة","Click a wall to place")}
                <button
                  onClick={() => setPlacingProduct(null)}
                  className="ms-3 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30"
                >
                  {t("إلغاء","Cancel")}
                </button>
              </div>
            )}
            {surveyForSpace && (
              <Canvas key={key} shadows gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: lightMode === "day" ? 1.0 : 0.7 }}>
                <Suspense fallback={null}>
                  <Scene3D
                    survey={localProducts !== null
                      ? {
                          ...surveyForSpace,
                          selectedProducts: localProducts.filter(
                            (p: any) => !activeSpace || p.spaceId === activeSpace.id
                          ),
                        }
                      : surveyForSpace
                    }
                    selectedIdx={selectedProduct}
                    onSelect={setSelectedProduct}
                    lightMode={lightMode}
                    floorType={floorType}
                    placingProduct={placingProduct}
                    onWallPlace={handleWallPlace}
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
                                <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 shrink-0 gap-0.5" data-testid={`badge-conflict-${spaceIdx}`}>
                                  ⚠ {t("تعارض", "Conflict")}
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

                {/* Warnings panel */}
                {designWarnings.length > 0 && (
                  <div className="mt-3 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg" data-testid="warnings-panel">
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                      <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                        {t("تحذيرات التصميم", "Design Warnings")} ({designWarnings.length})
                      </p>
                    </div>
                    <div className="space-y-1">
                      {designWarnings.map((w, wi) => (
                        <button
                          key={wi}
                          className="w-full text-start text-[10px] p-1.5 rounded bg-white dark:bg-red-900/20 border border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                          onClick={() => setSelectedProduct(w.productIdx)}
                          data-testid={`warning-item-${wi}`}
                        >
                          <span className="font-medium text-red-700 dark:text-red-400">
                            {w.type === "conflict" ? "⚠ " : "↔ "}
                          </span>
                          <span className="text-red-600 dark:text-red-300">
                            {t(w.messageAr, w.messageEn)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
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

        <TabsContent value="bom" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex flex-col">
          <ManufacturingBOM products={selectedProducts} survey={survey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Manufacturing BOM (Bill of Materials) ──────────────────── */
function ManufacturingBOM({ products, survey }: { products: any[]; survey: any }) {
  const { t } = useLanguage();
  const [generating, setGenerating] = useState(false);

  function getMaterial(product: any): string {
    const code = (product.code || "").toUpperCase();
    if (code.includes("GL") || code.includes("GLASS")) return t("زجاج", "Glass");
    if (code.includes("ST") || code.includes("STEEL") || code.includes("ALU")) return t("حديد/ألومنيوم", "Metal/Aluminum");
    return t("خشب", "Wood");
  }

  function getCategory(product: any): string {
    if (isWallUnit(product)) return t("خزانة علوية", "Wall Unit");
    if (isTallUnit(product)) return t("خزانة طولية", "Tall Unit");
    return t("خزانة قاعدة", "Base Unit");
  }

  const bomRows = products.map((p: any, idx: number) => ({
    num: idx + 1,
    code: p.code || "-",
    name: p.nameAr || p.name || p.code || `منتج ${idx + 1}`,
    category: getCategory(p),
    w: Math.round(parseFloat(p.designW || p.dimensions?.w || p.manufacturingW || 0) || 0),
    h: Math.round(parseFloat(p.designH || p.dimensions?.h || p.manufacturingH || 0) || 0),
    d: Math.round(parseFloat(p.designD || p.dimensions?.d || p.manufacturingD || 0) || 0),
    mw: Math.round(parseFloat(p.manufacturingW || p.designW || p.dimensions?.w || 0) || 0),
    mh: Math.round(parseFloat(p.manufacturingH || p.designH || p.dimensions?.h || 0) || 0),
    md: Math.round(parseFloat(p.manufacturingD || p.designD || p.dimensions?.d || 0) || 0),
    material: getMaterial(p),
    qty: p.quantity || 1,
  }));

  const handlePrint = () => {
    const printContent = document.getElementById("bom-print-area");
    if (!printContent) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>${t("مخطط التصنيع", "Manufacturing Plan")}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
          h2 { color: #1a365d; margin-bottom: 4px; }
          p { color: #6b7280; margin: 0 0 12px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #1a365d; color: white; padding: 6px 8px; text-align: center; font-size: 11px; }
          td { border: 1px solid #e5e7eb; padding: 5px 8px; text-align: center; font-size: 11px; }
          tr:nth-child(even) { background: #f9fafb; }
          .footer { margin-top: 20px; color: #9ca3af; font-size: 10px; }
        </style>
      </head>
      <body>
        <h2>${t("مخطط التصنيع", "Manufacturing Plan")}</h2>
        <p>${t("عدد القطع:", "Parts count:")} ${bomRows.length} · ${new Date().toLocaleDateString("ar-SA")}</p>
        ${printContent.innerHTML}
        <div class="footer">teak2030.net · ${t("مصنع تيك للأثاث الخشبي", "Teak Wood Products Factory")}</div>
      </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const handleExportCSV = () => {
    const headers = ["#", t("الكود", "Code"), t("الاسم", "Name"), t("الفئة", "Category"),
      t("عرض التصميم", "Design W"), t("ارتفاع التصميم", "Design H"), t("عمق التصميم", "Design D"),
      t("عرض التصنيع", "Mfg W"), t("ارتفاع التصنيع", "Mfg H"), t("عمق التصنيع", "Mfg D"),
      t("المادة", "Material"), t("الكمية", "Qty")];
    const rows = bomRows.map(r =>
      [r.num, r.code, `"${r.name}"`, r.category, r.w, r.h, r.d, r.mw, r.mh, r.md, r.material, r.qty].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manufacturing-bom-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <ClipboardList className="w-12 h-12 opacity-30" />
        <p className="text-sm">{t("لا توجد منتجات في القائمة", "No products in list")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b shrink-0">
        <div>
          <p className="text-sm font-semibold">{t("مخطط التصنيع", "Manufacturing Plan")}</p>
          <p className="text-xs text-muted-foreground">{bomRows.length} {t("قطعة", "parts")} · {t("الأبعاد بالسنتيمتر", "Dimensions in cm")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExportCSV} data-testid="btn-export-bom-csv">
            <Download className="h-3.5 w-3.5 me-1" />
            {t("CSV", "CSV")}
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrint} disabled={generating} data-testid="btn-print-bom">
            {generating ? <Loader2 className="h-3.5 w-3.5 me-1 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5 me-1" />}
            {t("طباعة", "Print")}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <div id="bom-print-area">
          <table className="w-full text-xs border-collapse" data-testid="bom-table">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-2 py-2 text-center border border-slate-600">#</th>
                <th className="px-2 py-2 text-center border border-slate-600">{t("الكود", "Code")}</th>
                <th className="px-2 py-2 text-start border border-slate-600">{t("الاسم", "Name")}</th>
                <th className="px-2 py-2 text-center border border-slate-600">{t("الفئة", "Cat.")}</th>
                <th className="px-2 py-2 text-center border border-slate-600 bg-blue-900">{t("ع×ار×ع (تصميم)", "Design W×H×D")}</th>
                <th className="px-2 py-2 text-center border border-slate-600 bg-green-900">{t("ع×ار×ع (تصنيع)", "Mfg W×H×D")}</th>
                <th className="px-2 py-2 text-center border border-slate-600">{t("المادة", "Material")}</th>
                <th className="px-2 py-2 text-center border border-slate-600">{t("الكمية", "Qty")}</th>
              </tr>
            </thead>
            <tbody>
              {bomRows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-slate-50 dark:bg-gray-800"}>
                  <td className="px-2 py-1.5 text-center border border-slate-200 dark:border-slate-700 text-muted-foreground">{row.num}</td>
                  <td className="px-2 py-1.5 text-center border border-slate-200 dark:border-slate-700 font-mono font-semibold">{row.code}</td>
                  <td className="px-2 py-1.5 text-start border border-slate-200 dark:border-slate-700 max-w-[180px] truncate">{row.name}</td>
                  <td className="px-2 py-1.5 text-center border border-slate-200 dark:border-slate-700">
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{row.category}</Badge>
                  </td>
                  <td className="px-2 py-1.5 text-center border border-slate-200 dark:border-slate-700 font-mono text-blue-700 dark:text-blue-300">
                    {row.w > 0 ? `${row.w}×${row.h}×${row.d}` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center border border-slate-200 dark:border-slate-700 font-mono text-green-700 dark:text-green-300">
                    {row.mw > 0 ? `${row.mw}×${row.mh}×${row.md}` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center border border-slate-200 dark:border-slate-700">{row.material}</td>
                  <td className="px-2 py-1.5 text-center border border-slate-200 dark:border-slate-700 font-bold">{row.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 p-3 bg-muted rounded-lg text-xs text-muted-foreground">
          <p className="font-medium mb-1">{t("ملاحظة:", "Note:")}</p>
          <p>{t("أبعاد التصميم = الأبعاد الظاهرة في التصميم. أبعاد التصنيع = الأبعاد الفعلية للتصنيع. جميع القياسات بالسنتيمتر.", "Design dims = visual dimensions. Manufacturing dims = actual production dimensions. All measurements in cm.")}</p>
        </div>
      </div>
    </div>
  );
}
