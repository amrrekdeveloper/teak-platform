/**
 * Kitchen Designer V2 — Architectural empty-room shell preview.
 * Route: /kitchen-designer-v2/room-preview
 * Renders ONLY from RoomV2 (never from V1 answers/state).
 *
 * Visual-only elements (skirting, ceiling presets, cove/downlights) never
 * alter the canonical RoomV2 geometry used by the design engine.
 */
import { useMemo, useEffect, Suspense } from "react";
import { Link } from "wouter";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, PerspectiveCamera, Text, Environment, useTexture } from "@react-three/drei";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { useKitchenToolV2Store } from "@/components/kitchen-tool-v2/store";
import { type RoomV2, type RoomWallV2, roomBounds } from "@/components/kitchen-tool-v2/room-model";
import {
  WALL_MATERIALS_V2,
  FLOOR_MATERIALS_V2,
  findMaterialV2,
  repeatForSurface,
  type MaterialDefV2,
} from "@/components/kitchen-tool-v2/materials-v2";
import { V2Gate } from "@/components/kitchen-tool-v2/v2-gate";

const MM = 0.001; // mm → meters
const WALL_THICKNESS_MM = 150;
const SKIRTING_HEIGHT_MM = 100;
const SKIRTING_DEPTH_MM = 15;
const GYPSUM_BORDER_MM = 450;
const GYPSUM_DROP_MM = 140;
const FLOOR_NORMAL_SCALE = new THREE.Vector2(0.6, 0.6);
const PHOTO_TILE_NORMAL_SCALE = new THREE.Vector2(0.55, 0.55);
const PHOTO_WALL_NORMAL_SCALE = new THREE.Vector2(0.35, 0.35);

/**
 * Photoreal calibration preset — real CC0 PBR assets served locally
 * (no runtime network requests). Sources documented in
 * client/public/textures/v2/LICENSES.md:
 * - Tiles139 (ambientCG, CC0) — beige square tiles; texture spans a 6×6 tile
 *   grid, scaled so each tile is exactly 600×600 mm ⇒ 3600 mm physical span.
 * - PaintedPlaster017 (ambientCG, CC0) — painted plaster micro-surface,
 *   tinted warm off-white; 2000×1000 mm physical span.
 * - lebombo_1k.hdr (Poly Haven, CC0) — interior HDR used for IBL only.
 */
const PHOTO_ASSETS = {
  hdr: "/textures/v2/lebombo_1k.hdr",
  floor: {
    urls: { map: "/textures/v2/tiles139_color.webp", normalMap: "/textures/v2/tiles139_normal.webp", roughnessMap: "/textures/v2/tiles139_rough.webp" },
    physMmX: 3600,
    physMmY: 3600,
  },
  wall: {
    urls: { map: "/textures/v2/plaster017_color.webp", normalMap: "/textures/v2/plaster017_normal.webp", roughnessMap: "/textures/v2/plaster017_rough.webp" },
    physMmX: 2000,
    physMmY: 1000,
  },
};

/**
 * Loads a shared PBR set and returns per-surface CLONES with the given UV
 * repeat, correct color spaces, and disposal of the clones on cleanup
 * (base textures stay in the drei cache).
 */
function usePbrMaps(urls: { map: string; normalMap: string; roughnessMap: string }, repX: number, repY: number) {
  const base = useTexture(urls) as { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };
  const maps = useMemo(() => {
    const prep = (t: THREE.Texture, srgb: boolean) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(repX, repY);
      c.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      c.anisotropy = 8;
      c.needsUpdate = true;
      return c;
    };
    return {
      map: prep(base.map, true),
      normalMap: prep(base.normalMap, false),
      roughnessMap: prep(base.roughnessMap, false),
    };
  }, [base.map, base.normalMap, base.roughnessMap, repX, repY]);
  useEffect(
    () => () => {
      maps.map.dispose();
      maps.normalMap.dispose();
      maps.roughnessMap.dispose();
    },
    [maps]
  );
  return maps;
}

/* ------------------------- textures ------------------------------- */

function useFloorMaps(def: MaterialDefV2 | undefined, wMm: number, hMm: number) {
  const maps = useMemo(() => {
    if (!def) return null;
    const rep = repeatForSurface(def, wMm, hMm);
    const apply = (tex: THREE.Texture | null) => {
      if (tex && rep) tex.repeat.set(rep.x, rep.y);
      return tex;
    };
    return {
      map: apply(def.makeTexture ? def.makeTexture() : null),
      normalMap: apply(def.makeNormalTexture ? def.makeNormalTexture() : null),
      aoMap: apply(def.makeAoTexture ? def.makeAoTexture() : null),
    };
  }, [def?.id, wMm, hMm]);
  useEffect(
    () => () => {
      maps?.map?.dispose();
      maps?.normalMap?.dispose();
      maps?.aoMap?.dispose();
    },
    [maps]
  );
  return maps;
}

/* ------------------------- camera framing -------------------------- */

/**
 * Auto-frames the room whenever the room geometry or camera mode changes.
 * Perspective mode: human-height interior view. Top mode: TRUE orthographic
 * plan view sized to the room bounding box (no perspective distortion).
 */
function CameraRig({ room, mode }: { room: RoomV2; mode: "perspective" | "top" }) {
  const { camera, controls, size } = useThree() as any;
  const b = roomBounds(room);
  const cx = ((b.minX + b.maxX) / 2) * MM;
  const cz = ((b.minZ + b.maxZ) / 2) * MM;
  const spanX = (b.maxX - b.minX) * MM;
  const spanZ = (b.maxZ - b.minZ) * MM;
  const span = Math.max(spanX, spanZ);
  const h = room.ceilingHeightMm * MM;

  // Orthographic zoom so the room bounding box fills ~82% of the viewport.
  const orthoZoom = Math.max(
    10,
    Math.min(size.width / Math.max(spanX, 0.5), size.height / Math.max(spanZ, 0.5)) * 0.82
  );

  useEffect(() => {
    if (mode === "top") {
      camera.position.set(cx, h + Math.max(span, 2.5), cz);
      camera.up.set(0, 0, -1);
      camera.lookAt(cx, 0, cz);
      if (controls) controls.target.set(cx, 0, cz);
    } else {
      // Human-height interior perspective: stand inside/near the open side
      // (positive Z is away from wall A), look toward wall A.
      const eyeY = 1.6;
      const dist = Math.max(spanZ * 1.05, span * 0.75) + 1.2;
      camera.position.set(cx, eyeY, b.maxZ * MM + (dist - spanZ) * 0.55);
      camera.up.set(0, 1, 0);
      if (controls) controls.target.set(cx, h * 0.45, cz * 0.6);
    }
    camera.updateProjectionMatrix();
    controls?.update();
  }, [room, mode, camera, controls]);

  return mode === "top" ? (
    <OrthographicCamera makeDefault position={[cx, h + Math.max(span, 2.5), cz]} zoom={orthoZoom} near={0.05} far={200} />
  ) : (
    // 52° avoids wide-angle distortion while keeping the room feeling spacious.
    <PerspectiveCamera makeDefault fov={52} near={0.05} far={200} />
  );
}

/* --------------------------- meshes -------------------------------- */

function samePoint(a: { xMm: number; zMm: number }, b: { xMm: number; zMm: number }) {
  return Math.abs(a.xMm - b.xMm) < 0.5 && Math.abs(a.zMm - b.zMm) < 0.5;
}

/**
 * Shared wall body transform: extends the wall by one thickness ONLY at ends
 * that meet another wall (clean 90° corners) and offsets the body OUTSIDE the
 * canonical line so the interior face == canonical dimension.
 */
function wallBodyTransform(wall: RoomWallV2, allWalls: RoomWallV2[]) {
  const others = allWalls.filter((w) => w.id !== wall.id);
  const startConnected = others.some((w) => samePoint(w.start, wall.start) || samePoint(w.end, wall.start));
  const endConnected = others.some((w) => samePoint(w.start, wall.end) || samePoint(w.end, wall.end));
  const extStart = startConnected ? WALL_THICKNESS_MM : 0;
  const extEnd = endConnected ? WALL_THICKNESS_MM : 0;

  const angle = Math.atan2(wall.end.zMm - wall.start.zMm, wall.end.xMm - wall.start.xMm);
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  const cx = (wall.start.xMm + wall.end.xMm) / 2 + (ux * (extEnd - extStart)) / 2;
  const cz = (wall.start.zMm + wall.end.zMm) / 2 + (uz * (extEnd - extStart)) / 2;
  const ox = -wall.inwardNormal.xMm * (WALL_THICKNESS_MM / 2);
  const oz = -wall.inwardNormal.zMm * (WALL_THICKNESS_MM / 2);
  return {
    position: [(cx + ox) * MM, (wall.heightMm / 2) * MM, (cz + oz) * MM] as [number, number, number],
    rotationY: -angle,
    size: [(wall.lengthMm + extStart + extEnd) * MM, wall.heightMm * MM, WALL_THICKNESS_MM * MM] as [number, number, number],
    lengthMm: wall.lengthMm + extStart + extEnd,
  };
}

function WallMesh({ wall, allWalls, materialDef }: { wall: RoomWallV2; allWalls: RoomWallV2[]; materialDef: MaterialDefV2 | undefined }) {
  const tr = wallBodyTransform(wall, allWalls);
  return (
    <group position={tr.position} rotation={[0, tr.rotationY, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={tr.size} />
        <meshStandardMaterial
          color={materialDef?.baseColor ?? "#eeeeee"}
          roughness={materialDef?.roughness ?? 0.92}
          metalness={materialDef?.metalness ?? 0}
        />
      </mesh>
    </group>
  );
}

/** Photoreal wall: real painted-plaster PBR maps, tinted warm off-white. */
function PhotoWallMesh({ wall, allWalls }: { wall: RoomWallV2; allWalls: RoomWallV2[] }) {
  const tr = wallBodyTransform(wall, allWalls);
  const a = PHOTO_ASSETS.wall;
  const maps = usePbrMaps(a.urls, tr.lengthMm / a.physMmX, wall.heightMm / a.physMmY);
  return (
    <group position={tr.position} rotation={[0, tr.rotationY, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={tr.size} />
        <meshStandardMaterial
          color="#f3ece1"
          map={maps.map}
          normalMap={maps.normalMap}
          normalScale={PHOTO_WALL_NORMAL_SCALE}
          roughnessMap={maps.roughnessMap}
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

/** Visual-only skirting board along the interior wall-floor intersection. */
function Skirting({ wall }: { wall: RoomWallV2 }) {
  const cx = (wall.start.xMm + wall.end.xMm) / 2;
  const cz = (wall.start.zMm + wall.end.zMm) / 2;
  const angle = Math.atan2(wall.end.zMm - wall.start.zMm, wall.end.xMm - wall.start.xMm);
  const ox = wall.inwardNormal.xMm * (SKIRTING_DEPTH_MM / 2);
  const oz = wall.inwardNormal.zMm * (SKIRTING_DEPTH_MM / 2);
  return (
    <group
      position={[(cx + ox) * MM, (SKIRTING_HEIGHT_MM / 2) * MM, (cz + oz) * MM]}
      rotation={[0, -angle, 0]}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[wall.lengthMm * MM, SKIRTING_HEIGHT_MM * MM, SKIRTING_DEPTH_MM * MM]} />
        <meshStandardMaterial color="#f7f5f0" roughness={0.6} metalness={0} />
      </mesh>
    </group>
  );
}

function FloorMesh({ room, materialDef }: { room: RoomV2; materialDef: MaterialDefV2 | undefined }) {
  const b = roomBounds(room);
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const maps = useFloorMaps(materialDef, w, d);
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    room.floor.polygon.forEach((p, i) => {
      if (i === 0) s.moveTo(p.xMm * MM, p.zMm * MM);
      else s.lineTo(p.xMm * MM, p.zMm * MM);
    });
    s.closePath();
    return s;
  }, [room]);
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial
        side={THREE.DoubleSide}
        color={materialDef?.baseColor ?? "#ddd"}
        roughness={materialDef?.roughness ?? 0.5}
        metalness={0}
        map={maps?.map ?? undefined}
        normalMap={maps?.normalMap ?? undefined}
        normalScale={FLOOR_NORMAL_SCALE}
        aoMap={maps?.aoMap ?? undefined}
        aoMapIntensity={0.7}
      />
    </mesh>
  );
}

/**
 * Photoreal floor: real beige-tile PBR maps. shapeGeometry UVs are in WORLD
 * METERS, so the repeat is 1 / physical-span-in-meters (independent of room
 * size) — tiles stay exactly 600×600 mm.
 */
function PhotoFloorMesh({ room }: { room: RoomV2 }) {
  const a = PHOTO_ASSETS.floor;
  const maps = usePbrMaps(a.urls, 1 / (a.physMmX * MM), 1 / (a.physMmY * MM));
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    room.floor.polygon.forEach((p, i) => {
      if (i === 0) s.moveTo(p.xMm * MM, p.zMm * MM);
      else s.lineTo(p.xMm * MM, p.zMm * MM);
    });
    s.closePath();
    return s;
  }, [room]);
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial
        side={THREE.DoubleSide}
        map={maps.map}
        normalMap={maps.normalMap}
        normalScale={PHOTO_TILE_NORMAL_SCALE}
        roughnessMap={maps.roughnessMap}
        roughness={1}
        metalness={0}
        envMapIntensity={0.55}
      />
    </mesh>
  );
}

/** Flat ceiling slab (visual only). */
function FlatCeiling({ room }: { room: RoomV2 }) {
  const b = roomBounds(room);
  const w = (b.maxX - b.minX) * MM;
  const d = (b.maxZ - b.minZ) * MM;
  return (
    <mesh
      rotation={[Math.PI / 2, 0, 0]}
      position={[((b.minX + b.maxX) / 2) * MM, room.ceilingHeightMm * MM, ((b.minZ + b.maxZ) / 2) * MM]}
    >
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color="#f6f3ee" roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * Photoreal flat ceiling: clean soft-white slab with subtle recessed
 * downlights (visual discs + at most 2 real lights for performance).
 */
function PhotoFlatCeiling({ room }: { room: RoomV2 }) {
  const b = roomBounds(room);
  const minX = b.minX * MM, maxX = b.maxX * MM, minZ = b.minZ * MM, maxZ = b.maxZ * MM;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const h = room.ceilingHeightMm * MM;
  const downlights = useMemo(() => {
    const pts: [number, number][] = [];
    const n = Math.min(2, Math.max(1, Math.round(w / 2.2)));
    for (let i = 0; i < n; i++) {
      const x = minX + (w * (i + 0.5)) / n;
      pts.push([x, cz - d * 0.22]);
      pts.push([x, cz + d * 0.22]);
    }
    return pts.slice(0, 4);
  }, [minX, w, cz, d]);
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, h, cz]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#fafaf7" roughness={0.94} metalness={0} side={THREE.DoubleSide} envMapIntensity={0.4} />
      </mesh>
      {downlights.map(([x, z], i) => (
        <group key={i}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[x, h - 0.004, z]}>
            <circleGeometry args={[0.04, 20]} />
            <meshStandardMaterial color="#fefaf0" emissive="#ffedc9" emissiveIntensity={1.5} side={THREE.DoubleSide} />
          </mesh>
          {i < 2 && (
            <pointLight position={[x, h - 0.18, z]} intensity={0.5} color="#ffe8c2" distance={h * 1.9} decay={1.8} />
          )}
        </group>
      ))}
    </group>
  );
}

/**
 * Experimental gypsum-board ceiling preset: recessed perimeter border with a
 * warm cove-light glow and a few recessed downlights. Visual only.
 */
function GypsumCeiling({ room, lightsOn }: { room: RoomV2; lightsOn: boolean }) {
  const b = roomBounds(room);
  const minX = b.minX * MM, maxX = b.maxX * MM, minZ = b.minZ * MM, maxZ = b.maxZ * MM;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const hTop = room.ceilingHeightMm * MM; // recessed (higher) center
  const hDrop = hTop - GYPSUM_DROP_MM * MM; // dropped perimeter
  // Clamp the border so small rooms never produce non-positive center panels.
  const border = Math.min(GYPSUM_BORDER_MM * MM, w / 4, d / 4);

  // Downlight positions on the dropped border (max 6 for performance).
  const downlights = useMemo(() => {
    const pts: [number, number][] = [];
    const inset = border / 2;
    const n = Math.min(3, Math.max(2, Math.round(w / 1.6)));
    for (let i = 0; i < n; i++) {
      const x = minX + inset + ((w - inset * 2) * (i + 0.5)) / n;
      pts.push([x, minZ + inset]);
      pts.push([x, maxZ - inset]);
    }
    return pts.slice(0, 6);
  }, [minX, minZ, maxZ, w, border]);

  const gyp = <meshStandardMaterial color="#f6f3ee" roughness={0.95} side={THREE.DoubleSide} />;

  return (
    <group>
      {/* recessed center panel */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, hTop, cz]}>
        <planeGeometry args={[w - border * 2, d - border * 2]} />
        {gyp}
      </mesh>
      {/* dropped perimeter border (4 slabs) */}
      {[
        { pos: [cx, hDrop, minZ + border / 2] as const, size: [w, border] as const },
        { pos: [cx, hDrop, maxZ - border / 2] as const, size: [w, border] as const },
        { pos: [minX + border / 2, hDrop, cz] as const, size: [border, d - border * 2] as const },
        { pos: [maxX - border / 2, hDrop, cz] as const, size: [border, d - border * 2] as const },
      ].map((s, i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]} position={[s.pos[0], s.pos[1], s.pos[2]]}>
          <planeGeometry args={[s.size[0], s.size[1]]} />
          {gyp}
        </mesh>
      ))}
      {/* inner vertical fascia of the drop, glowing warm (cove light strip) */}
      {[
        { pos: [cx, (hTop + hDrop) / 2, minZ + border] as const, rot: 0, len: w - border * 2 },
        { pos: [cx, (hTop + hDrop) / 2, maxZ - border] as const, rot: Math.PI, len: w - border * 2 },
        { pos: [minX + border, (hTop + hDrop) / 2, cz] as const, rot: Math.PI / 2, len: d - border * 2 },
        { pos: [maxX - border, (hTop + hDrop) / 2, cz] as const, rot: -Math.PI / 2, len: d - border * 2 },
      ].map((s, i) => (
        <mesh key={`cove-${i}`} position={[s.pos[0], s.pos[1], s.pos[2]]} rotation={[0, s.rot, 0]}>
          <planeGeometry args={[s.len, GYPSUM_DROP_MM * MM]} />
          <meshStandardMaterial
            color="#fff5e0"
            emissive={lightsOn ? "#ffd9a0" : "#3a3021"}
            emissiveIntensity={lightsOn ? 1.6 : 0.1}
            roughness={0.9}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {/* warm indirect cove fill light */}
      {lightsOn && <pointLight position={[cx, hDrop - 0.05, cz]} intensity={0.5} color="#ffd9a8" distance={Math.max(w, d) * 1.6} />}
      {/* recessed downlights */}
      {downlights.map(([x, z], i) => (
        <group key={`dl-${i}`}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[x, hDrop - 0.004, z]}>
            <circleGeometry args={[0.045, 20]} />
            <meshStandardMaterial
              color="#fffbe8"
              emissive={lightsOn ? "#fff0c8" : "#333"}
              emissiveIntensity={lightsOn ? 2.2 : 0.2}
              side={THREE.DoubleSide}
            />
          </mesh>
          {lightsOn && i < 4 && (
            <pointLight
              position={[x, hDrop - 0.15, z]}
              intensity={1.4}
              color="#ffe2b0"
              distance={room.ceilingHeightMm * MM * 1.7}
              decay={1.7}
            />
          )}
        </group>
      ))}
    </group>
  );
}

function WallLabel({ wall }: { wall: RoomWallV2 }) {
  const cx = (wall.start.xMm + wall.end.xMm) / 2;
  const cz = (wall.start.zMm + wall.end.zMm) / 2;
  const label = `${wall.id} — ${(wall.lengthMm / 10).toFixed(0)} cm`;
  return (
    <Text
      position={[(cx + wall.inwardNormal.xMm * 120) * MM, wall.heightMm * MM * 0.62, (cz + wall.inwardNormal.zMm * 120) * MM]}
      fontSize={0.16}
      color="#7a6a52"
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.006}
      outlineColor="#ffffff"
      rotation={[0, Math.atan2(wall.inwardNormal.xMm, wall.inwardNormal.zMm), 0]}
    >
      {label}
    </Text>
  );
}

function RoomScene({
  room, wallMat, floorMat, showCeiling, ceilingPreset, renderPreset,
}: {
  room: RoomV2;
  wallMat: MaterialDefV2 | undefined;
  floorMat: MaterialDefV2 | undefined;
  showCeiling: boolean;
  ceilingPreset: "flat" | "gypsum";
  renderPreset: "procedural" | "photoreal";
}) {
  const b = roomBounds(room);
  const cx = ((b.minX + b.maxX) / 2) * MM;
  const cz = ((b.minZ + b.maxZ) / 2) * MM;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * MM;
  const h = room.ceilingHeightMm * MM;
  const gypsumOn = showCeiling && ceilingPreset === "gypsum";
  const photo = renderPreset === "photoreal";

  return (
    <group>
      {photo ? (
        <>
          {/*
           * Photoreal calibration: image-based lighting from a local interior
           * HDR (reflections + diffuse fill, background hidden), plus one very
           * soft warm key light. No dominant directional — no harsh triangular
           * shadow.
           */}
          <Suspense fallback={null}>
            <Environment files={PHOTO_ASSETS.hdr} background={false} environmentIntensity={0.85} />
          </Suspense>
          <hemisphereLight args={["#fffaf0", "#cfc4b4", 0.35]} />
          <directionalLight
            position={[cx + span * 0.9, h * 2.2, cz + span * 1.4]}
            intensity={0.5}
            color="#fff3e0"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-bias={-0.0004}
            shadow-radius={7}
            shadow-camera-left={-span}
            shadow-camera-right={span}
            shadow-camera-top={span}
            shadow-camera-bottom={-span}
          />
        </>
      ) : (
        <>
          {/* procedural proof lighting (kept for A/B comparison) */}
          <ambientLight intensity={0.35} />
          <hemisphereLight args={["#fdf6ea", "#b8ab98", 0.5]} />
          <directionalLight
            position={[cx + span * 0.6, h * 1.6, cz + span * 1.2]}
            intensity={1.25}
            color="#fff4e2"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-bias={-0.0004}
            shadow-camera-left={-span}
            shadow-camera-right={span}
            shadow-camera-top={span}
            shadow-camera-bottom={-span}
          />
          <directionalLight position={[cx - span, h * 1.2, cz - span * 0.6]} intensity={0.3} color="#dfe8f2" />
        </>
      )}

      <Suspense fallback={null}>
        {photo ? (
          <PhotoFloorMesh room={room} />
        ) : (
          <FloorMesh room={room} materialDef={floorMat} />
        )}
        {room.walls.map((w) =>
          photo ? (
            <PhotoWallMesh key={w.id} wall={w} allWalls={room.walls} />
          ) : (
            <WallMesh key={w.id} wall={w} allWalls={room.walls} materialDef={wallMat} />
          )
        )}
      </Suspense>
      {room.walls.map((w) => (
        <Skirting key={`sk-${w.id}`} wall={w} />
      ))}
      {!photo &&
        room.walls.map((w) => <WallLabel key={`label-${w.id}`} wall={w} />)}
      {showCeiling && ceilingPreset === "flat" && (photo ? <PhotoFlatCeiling room={room} /> : <FlatCeiling room={room} />)}
      {gypsumOn && <GypsumCeiling room={room} lightsOn />}
    </group>
  );
}

export default function KitchenToolV2RoomPreviewPage() {
  return (
    <V2Gate>
      <KitchenToolV2RoomPreviewInner />
    </V2Gate>
  );
}

function KitchenToolV2RoomPreviewInner() {
  const { t, lang } = useLanguage();
  const s = useKitchenToolV2Store();
  const room = s.room;

  const wallMat = findMaterialV2(s.wallMaterialId);
  const floorMat = findMaterialV2(s.floorMaterialId);

  if (!room) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4" dir={lang === "ar" ? "rtl" : "ltr"}>
        <p className="text-muted-foreground">{t("لا توجد غرفة محفوظة بعد.", "No saved room yet.")}</p>
        <Link href="/kitchen-designer-v2/space">
          <Button data-testid="button-v2-goto-space">{t("إدخال مساحة الغرفة", "Enter room space")}</Button>
        </Link>
      </div>
    );
  }

  const b = roomBounds(room);
  const cx = ((b.minX + b.maxX) / 2) * MM;
  const cz = ((b.minZ + b.maxZ) / 2) * MM;

  return (
    <div className="h-screen bg-background flex flex-col" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="border-b px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/kitchen-designer-v2/space">
            <Button variant="ghost" size="sm" className="gap-1" data-testid="button-v2-back">
              <ArrowRight className="w-4 h-4 ltr:rotate-180" />
              {t("رجوع", "Back")}
            </Button>
          </Link>
          <h1 className="font-bold text-sm sm:text-base" data-testid="text-v2-preview-title">
            {t("معاينة الغرفة الفارغة", "Empty Room Preview")}
          </h1>
          <Badge variant="outline">{t("تجريبي", "Experimental")}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={s.showCeiling} onCheckedChange={s.setShowCeiling} data-testid="switch-v2-ceiling" />
            <Label className="text-xs">{t("السقف", "Ceiling")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={s.ceilingPreset === "gypsum"}
              onCheckedChange={(v) => s.setCeilingPreset(v ? "gypsum" : "flat")}
              disabled={!s.showCeiling}
              data-testid="switch-v2-gypsum"
            />
            <Label className="text-xs">{t("جبس بورد", "Gypsum")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={s.renderPreset === "photoreal"}
              onCheckedChange={(v) => s.setRenderPreset(v ? "photoreal" : "procedural")}
              data-testid="switch-v2-photoreal"
            />
            <Label className="text-xs">{t("واقعي", "Photoreal")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={s.cameraMode === "top"}
              onCheckedChange={(v) => s.setCameraMode(v ? "top" : "perspective")}
              data-testid="switch-v2-camera"
            />
            <Label className="text-xs">{t("منظور علوي", "Top view")}</Label>
          </div>
        </div>
      </div>

      {room.measurementConfidence === "approximate" && (
        <div className="flex items-center gap-2 bg-amber-500/10 border-b border-amber-400/40 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-400 shrink-0" data-testid="warning-v2-preview-approximate">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {t("قياسات تقريبية — غير معتمدة للتصنيع.", "Approximate measurements — not approved for manufacturing.")}
        </div>
      )}

      <div className="flex-1 relative min-h-0">
        <Canvas
          shadows="soft"
          dpr={[1, 1.75]}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
          camera={{ position: [cx, 1.6, cz + 5], fov: 60 }}
        >
          <CameraRig room={room} mode={s.cameraMode} />
          <OrbitControls
            makeDefault
            enableRotate={s.cameraMode !== "top"}
            maxPolarAngle={Math.PI * 0.52}
            minDistance={0.6}
            maxDistance={30}
          />
          <color attach="background" args={["#e9e4dc"]} />
          <fog attach="fog" args={["#e9e4dc", 18, 55]} />
          <RoomScene
            room={room}
            wallMat={wallMat}
            floorMat={floorMat}
            showCeiling={s.showCeiling}
            ceilingPreset={s.ceilingPreset}
            renderPreset={s.renderPreset}
          />
        </Canvas>

        {/* Dimensions readout */}
        <div className="absolute top-3 start-3 rounded-md bg-background/85 backdrop-blur border p-3 text-xs space-y-1" data-testid="panel-v2-dimensions">
          <p className="font-bold">{t("الأبعاد", "Dimensions")}</p>
          {room.walls.map((w) => (
            <p key={w.id}>
              {t("جدار", "Wall")} {w.id}: {(w.lengthMm / 10).toFixed(0)} {t("سم", "cm")}
            </p>
          ))}
          <p>{t("ارتفاع السقف", "Ceiling")}: {(room.ceilingHeightMm / 10).toFixed(0)} {t("سم", "cm")}</p>
        </div>
      </div>

      {/* Material pickers */}
      <div className="border-t px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
        <div>
          <p className="text-xs font-bold mb-2">{t("مادة الجدران (تجريبي)", "Wall material (test)")}</p>
          <div className="flex flex-wrap gap-2">
            {WALL_MATERIALS_V2.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant={s.wallMaterialId === m.id ? "default" : "outline"}
                onClick={() => s.setWallMaterial(m.id)}
                data-testid={`button-v2-wallmat-${m.id}`}
              >
                {t(m.nameAr, m.nameEn)}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold mb-2">{t("مادة الأرضية (تجريبي)", "Floor material (test)")}</p>
          <div className="flex flex-wrap gap-2">
            {FLOOR_MATERIALS_V2.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant={s.floorMaterialId === m.id ? "default" : "outline"}
                onClick={() => s.setFloorMaterial(m.id)}
                data-testid={`button-v2-floormat-${m.id}`}
              >
                {t(m.nameAr, m.nameEn)}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
