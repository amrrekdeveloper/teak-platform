import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  useTexture,
  useGLTF,
  Html,
  GizmoHelper,
  GizmoViewport,
} from "@react-three/drei";
import {
  type KitchenLayout,
  type KitchenWall,
  type KitchenOpening,
  type KitchenUtility,
} from "@/components/kitchen-tool/store";
import {
  getWallSegments,
  getFloorBounds,
  planPointAt,
  type WallSegment,
} from "@/components/kitchen-tool/plan-svg";
import {
  findCabinetDef,
  junctionOfPlaced,
  getJunctions,
  blockedIntervals,
  verticalSpan,
  resolveDragOffset,
  isLCorner,
  type CabinetDef,
} from "@/components/kitchen-tool/cabinets";
import type { ThreeEvent } from "@react-three/fiber";
import AdekoBaseCabinet, { AdekoCornerCabinet } from "@/components/kitchen-tool/adeko-cabinet";
import type { PlacedCabinetState } from "@/components/kitchen-tool/store";
import {
  findFloorOption,
  findWallOption,
  findCeilingOption,
  findAdekoTopFinish,
  findEnvironmentOption,
  DEFAULT_ADEKO_FINISH,
  type MaterialOption,
  type AdekoFinish,
} from "@/components/kitchen-tool/materials";
import { useKitchenToolStore, type PlacedDecorState } from "@/components/kitchen-tool/store";
import { findDecorItem, type DecorItem } from "@/components/kitchen-tool/decor-items";

/* ── Constants (meters unless noted) ─────────────────────── */
const WALL_T = 0.12;
const DOOR_HEIGHT_CM = 210;
const WINDOW_SILL_CM = 90;
const WINDOW_HEIGHT_CM = 120;
const CM = 1 / 100;

const ASSETS = "/kitchen-tool-assets";

/** Oak veneer countertop maps — prepared for later phases (cabinet runs). */
export const COUNTERTOP_TEX = {
  map: `${ASSETS}/countertop/textures/oak_veneer_01_diff_2k.jpg`,
  armMap: `${ASSETS}/countertop/textures/oak_veneer_01_arm_2k.jpg`,
};

/* ── Texture helpers ─────────────────────────────────────── */
function prepTexture(tex: THREE.Texture, repeatX: number, repeatY: number, srgb: boolean) {
  const t = tex.clone();
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/* ── Material rendering (paint or PBR) ───────────────────── */
function PbrSurfaceMaterial({
  opt,
  repeatX,
  repeatY,
  opacity = 1,
}: {
  opt: MaterialOption;
  repeatX: number;
  repeatY: number;
  opacity?: number;
}) {
  const maps = opt.maps!;
  const urls = useMemo(() => {
    const u: Record<string, string> = { map: maps.map };
    if (maps.normalMap) u.normalMap = maps.normalMap;
    if (maps.roughnessMap) u.roughnessMap = maps.roughnessMap;
    if (maps.armMap) u.armMap = maps.armMap;
    return u;
  }, [maps]);
  const tex = useTexture(urls) as Record<string, THREE.Texture>;

  const prepped = useMemo(() => {
    const out: Record<string, THREE.Texture> = {};
    for (const [key, t] of Object.entries(tex)) {
      out[key] = prepTexture(t, repeatX, repeatY, key === "map");
    }
    return out;
  }, [tex, repeatX, repeatY]);

  // Dispose cloned GPU textures when the material changes or unmounts
  useEffect(() => {
    const clones = Object.values(prepped);
    return () => {
      for (const t of clones) t.dispose();
    };
  }, [prepped]);

  return (
    <meshStandardMaterial
      map={prepped.map}
      normalMap={prepped.normalMap}
      roughnessMap={prepped.roughnessMap ?? prepped.armMap}
      aoMap={prepped.armMap}
      metalnessMap={prepped.armMap}
      color={opt.color ?? "#ffffff"}
      transparent={opacity < 1}
      opacity={opacity}
    />
  );
}

function SurfaceMaterial({
  opt,
  repeatX,
  repeatY,
  opacity = 1,
}: {
  opt: MaterialOption;
  repeatX: number;
  repeatY: number;
  opacity?: number;
}) {
  if (!opt.maps) {
    return (
      <meshStandardMaterial
        color={opt.color ?? "#eeeeee"}
        roughness={opt.roughness ?? 0.85}
        transparent={opacity < 1}
        opacity={opacity}
      />
    );
  }
  return (
    <PbrSurfaceMaterial opt={opt} repeatX={repeatX} repeatY={repeatY} opacity={opacity} />
  );
}

/* ── Wall geometry: real cut openings ────────────────────── */
interface WallPiece {
  /** start/end along the wall (m) */
  u0: number;
  u1: number;
  /** bottom/top height (m) */
  h0: number;
  h1: number;
}

function wallPieces(
  wallLengthM: number,
  ceilingM: number,
  openings: KitchenOpening[]
): WallPiece[] {
  const doorH = Math.min(DOOR_HEIGHT_CM * CM, ceilingM - 0.1);

  const sorted = [...openings]
    .map((o) => {
      const w = o.width * CM;
      const start = Math.min(
        Math.max(o.distanceFromWallStart * CM, 0),
        Math.max(wallLengthM - w, 0)
      );
      return { ...o, startM: start, endM: Math.min(start + w, wallLengthM) };
    })
    .filter((o) => o.endM - o.startM > 0.01)
    .sort((a, b) => a.startM - b.startM);

  const pieces: WallPiece[] = [];
  let cursor = 0;
  for (const o of sorted) {
    const s = Math.max(o.startM, cursor);
    const e = Math.max(o.endM, s);
    if (s - cursor > 0.005) {
      pieces.push({ u0: cursor, u1: s, h0: 0, h1: ceilingM });
    }
    if (o.type === "door") {
      if (ceilingM - doorH > 0.005) pieces.push({ u0: s, u1: e, h0: doorH, h1: ceilingM });
    } else {
      const sill = Math.min((o.sillHeight ?? WINDOW_SILL_CM) * CM, ceilingM - 0.2);
      const winTop = Math.min(sill + (o.height ?? WINDOW_HEIGHT_CM) * CM, ceilingM - 0.1);
      if (sill > 0.005) pieces.push({ u0: s, u1: e, h0: 0, h1: sill });
      if (ceilingM - winTop > 0.005) pieces.push({ u0: s, u1: e, h0: winTop, h1: ceilingM });
    }
    cursor = e;
  }
  if (wallLengthM - cursor > 0.005) {
    pieces.push({ u0: cursor, u1: wallLengthM, h0: 0, h1: ceilingM });
  }
  return pieces;
}

function segVectors(seg: WallSegment) {
  const dx = (seg.x2 - seg.x1) * CM;
  const dz = (seg.y2 - seg.y1) * CM;
  const len = Math.hypot(dx, dz) || 1;
  return {
    origin: new THREE.Vector3(seg.x1 * CM, 0, seg.y1 * CM),
    dir: new THREE.Vector3(dx / len, 0, dz / len),
    out: new THREE.Vector3(seg.nx, 0, seg.ny),
    theta: Math.atan2(-dz / len, dx / len),
    lengthM: seg.length * CM,
  };
}

/* ── Window sunlight ─────────────────────────────────────── */
interface WindowSun {
  /** Window rect corners (world, meters). */
  corners: THREE.Vector3[];
  /** Normalized direction the sun rays travel (from sun into the room). */
  rayDir: THREE.Vector3;
  /** Sun light position (outside, behind the window). */
  sunPos: THREE.Vector3;
  /** Light target (inside the room, on the floor). */
  targetPos: THREE.Vector3;
  /** Window size (m). */
  width: number;
  height: number;
}

/** Derive a sun beam from the largest window: rays enter through the
    opening at ~38° elevation, slightly angled along the wall. */
function computeWindowSun(
  segments: WallSegment[],
  openings: KitchenOpening[],
  ceilingM: number
): WindowSun | null {
  const windows = openings.filter((o) => o.type === "window");
  if (windows.length === 0) return null;
  const win = windows.reduce((a, b) => (b.width > a.width ? b : a));
  const seg = segments.find((s) => s.id === win.wallId);
  if (!seg) return null;

  const { origin, dir, out } = segVectors(seg);
  const wallLenM = seg.length * CM;
  const w = Math.min(win.width * CM, wallLenM);
  const u0 = Math.min(Math.max(win.distanceFromWallStart * CM, 0), Math.max(wallLenM - w, 0));
  const u1 = u0 + w;
  const sill = Math.min((win.sillHeight ?? WINDOW_SILL_CM) * CM, ceilingM - 0.2);
  const top = Math.min(sill + (win.height ?? WINDOW_HEIGHT_CM) * CM, ceilingM - 0.1);
  const height = Math.max(top - sill, 0.2);

  const at = (u: number, y: number) => {
    const p = origin.clone();
    p.addScaledVector(dir, u);
    p.y = y;
    return p;
  };
  const corners = [at(u0, sill), at(u1, sill), at(u1, top), at(u0, top)];
  const center = at((u0 + u1) / 2, (sill + top) / 2);

  // Ray direction: inward (opposite the wall's outward normal), tilted
  // 38° down and skewed a little along the wall for a natural angle.
  const elevation = (38 * Math.PI) / 180;
  const inward = out.clone().multiplyScalar(-1);
  const rayDir = inward
    .clone()
    .addScaledVector(dir, 0.28)
    .normalize()
    .multiplyScalar(Math.cos(elevation));
  rayDir.y = -Math.sin(elevation);
  rayDir.normalize();

  const sunPos = center.clone().addScaledVector(rayDir, -6);
  const targetPos = center.clone().addScaledVector(rayDir, (sill + top) / 2 / Math.sin(elevation));
  return { corners, rayDir, sunPos, targetPos, width: w, height };
}

/** Sun tint/strength per ambiance (HDRI) option. */
function sunParamsForEnv(envId: string): { color: string; intensity: number } {
  switch (envId) {
    case "brown_photostudio_02":
      return { color: "#ffb877", intensity: 2.6 }; // warm sunset
    case "studio_small_03":
      return { color: "#ffdfa3", intensity: 2.8 }; // high contrast
    case "photo_studio_01":
      return { color: "#fff0d4", intensity: 2.0 }; // neutral day
    default:
      return { color: "#ffe3ae", intensity: 2.3 }; // soft golden daylight
  }
}

/** Soft radial-gradient texture for the warm light pool on the floor. */
let poolTexCache: THREE.Texture | null = null;
function getPoolTexture(): THREE.Texture {
  if (poolTexCache) return poolTexCache;
  const size = 256;
  const cnv = document.createElement("canvas");
  cnv.width = size;
  cnv.height = size;
  const ctx = cnv.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  poolTexCache = new THREE.CanvasTexture(cnv);
  return poolTexCache;
}

/** Directional sun shining through the window + soft warm pool on the floor. */
function WindowSunlight({ sun, envId }: { sun: WindowSun; envId: string }) {
  const target = useMemo(() => new THREE.Object3D(), []);
  const { color, intensity } = sunParamsForEnv(envId);

  useEffect(() => {
    target.position.copy(sun.targetPos);
    target.updateMatrixWorld();
  }, [sun, target]);

  // Where the sun rays land on the floor — a soft warm pool of light.
  const { poolCenter, poolRadius } = useMemo(() => {
    const floorPt = (c: THREE.Vector3) => {
      const t = sun.rayDir.y < -1e-4 ? c.y / -sun.rayDir.y : 0;
      return c.clone().addScaledVector(sun.rayDir, t);
    };
    const far = sun.corners.map(floorPt);
    const center = far
      .reduce((acc, p) => acc.add(p), new THREE.Vector3())
      .multiplyScalar(1 / far.length);
    let radius = 0.6;
    for (const p of far) radius = Math.max(radius, p.distanceTo(center));
    return { poolCenter: center, poolRadius: radius * 1.15 };
  }, [sun]);

  const shadowW = Math.max(sun.width * 1.4, 1.2);
  const shadowH = Math.max(sun.height * 1.8, 1.6);

  return (
    <>
      <directionalLight
        position={sun.sunPos.toArray()}
        target={target}
        color={color}
        intensity={intensity}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-shadowW}
        shadow-camera-right={shadowW}
        shadow-camera-top={shadowH}
        shadow-camera-bottom={-shadowH}
        shadow-camera-near={0.5}
        shadow-camera-far={25}
      />
      <primitive object={target} />
      <mesh
        position={[poolCenter.x, 0.012, poolCenter.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
      >
        <circleGeometry args={[poolRadius, 40]} />
        <meshBasicMaterial
          color={color}
          map={getPoolTexture()}
          transparent
          opacity={0.32}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

/* ── Camera-relative wall fading (IKEA-style cutaway) ────── */
const WALL_FADE_MIN = 0.08;
/** Hysteresis deadzone around the dot-product threshold to avoid jitter. */
const WALL_FADE_DEADZONE = 0.04;
/** Lerp rate constant — settles in roughly 250ms. */
const WALL_FADE_RATE = 14;

interface WallFadeEntry {
  value: number;
  target: number;
}
type WallFadeMap = Record<string, WallFadeEntry>;

function WallPieceMesh({
  seg,
  piece,
  option,
  fadeMap,
}: {
  seg: WallSegment;
  piece: WallPiece;
  option: MaterialOption;
  fadeMap: React.MutableRefObject<WallFadeMap>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { origin, dir, out, theta } = useMemo(() => segVectors(seg), [seg]);
  const w = piece.u1 - piece.u0;
  const h = piece.h1 - piece.h0;

  const position = useMemo(() => {
    const p = origin.clone();
    p.addScaledVector(dir, (piece.u0 + piece.u1) / 2);
    p.addScaledVector(out, WALL_T / 2);
    p.y = (piece.h0 + piece.h1) / 2;
    return p;
  }, [origin, dir, out, piece]);

  // Drive material opacity imperatively each frame — no React re-render.
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const entry = fadeMap.current[seg.id];
    const opacity = entry ? entry.value : 1;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat) return;
    const solid = opacity > 0.995;
    if (mat.transparent !== !solid) {
      // Toggling `transparent` swaps the compiled shader variant (OPAQUE
      // define), so the material must be recompiled or opacity is ignored.
      mat.transparent = !solid;
      mat.depthWrite = solid;
      mat.needsUpdate = true;
    }
    mat.opacity = opacity;
    mesh.castShadow = opacity > 0.5;
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[0, theta, 0]} castShadow receiveShadow>
      <boxGeometry args={[w, h, WALL_T]} />
      <SurfaceMaterial key={option.id} opt={option} repeatX={w / (option.tileSizeM ?? 1)} repeatY={h / (option.tileSizeM ?? 1)} />
    </mesh>
  );
}

function Walls({
  segments,
  ceilingM,
  openings,
  option,
}: {
  segments: WallSegment[];
  ceilingM: number;
  openings: KitchenOpening[];
  option: MaterialOption;
}) {
  const fadeMap = useRef<WallFadeMap>({});

  // Per-segment fade: if the camera sits on the outward side of a wall
  // (it would occlude the interior), fade that whole segment down.
  useFrame((state, delta) => {
    const cam = state.camera.position;
    const alpha = 1 - Math.exp(-WALL_FADE_RATE * Math.min(delta, 0.1));
    for (const seg of segments) {
      const midX = ((seg.x1 + seg.x2) / 2) * CM;
      const midZ = ((seg.y1 + seg.y2) / 2) * CM;
      let vx = cam.x - midX;
      let vz = cam.z - midZ;
      const len = Math.hypot(vx, vz) || 1;
      vx /= len;
      vz /= len;
      const dot = vx * seg.nx + vz * seg.ny;
      let entry = fadeMap.current[seg.id];
      if (!entry) {
        entry = { value: 1, target: 1 };
        fadeMap.current[seg.id] = entry;
      }
      // Hysteresis: only flip the target outside the deadzone.
      if (dot > WALL_FADE_DEADZONE) entry.target = WALL_FADE_MIN;
      else if (dot < -WALL_FADE_DEADZONE) entry.target = 1;
      entry.value += (entry.target - entry.value) * alpha;
      if (Math.abs(entry.target - entry.value) < 0.002) entry.value = entry.target;
    }
  });

  return (
    <>
      {segments.map((seg) => (
        <Baseboard
          key={`bb-${seg.id}`}
          seg={seg}
          openings={openings.filter((o) => o.wallId === seg.id)}
        />
      ))}
      {segments.map((seg) => {
        const pieces = wallPieces(
          seg.length * CM,
          ceilingM,
          openings.filter((o) => o.wallId === seg.id)
        );
        return pieces.map((p, i) => (
          <WallPieceMesh
            key={`${seg.id}-${i}`}
            seg={seg}
            piece={p}
            option={option}
            fadeMap={fadeMap}
          />
        ));
      })}
    </>
  );
}

/** Thin dark skirting strip along the base of a wall segment. */
const BASEBOARD_H = 0.08;
const BASEBOARD_T = 0.02;

function Baseboard({
  seg,
  openings,
}: {
  seg: WallSegment;
  openings: KitchenOpening[];
}) {
  const { origin, dir, out, theta, lengthM } = useMemo(() => segVectors(seg), [seg]);

  // Split into runs broken only by DOOR openings (doors reach the floor);
  // windows keep the baseboard continuous underneath.
  const runs = useMemo(() => {
    const doors = openings
      .filter((o) => o.type === "door")
      .map((o) => {
        const w = o.width * CM;
        const start = Math.min(
          Math.max(o.distanceFromWallStart * CM, 0),
          Math.max(lengthM - w, 0)
        );
        return { startM: start, endM: Math.min(start + w, lengthM) };
      })
      .filter((d) => d.endM - d.startM > 0.01)
      .sort((a, b) => a.startM - b.startM);

    const out: Array<{ u0: number; u1: number }> = [];
    let cursor = 0;
    for (const d of doors) {
      const s = Math.max(d.startM, cursor);
      const e = Math.max(d.endM, s);
      if (s - cursor > 0.005) out.push({ u0: cursor, u1: s });
      cursor = e;
    }
    if (lengthM - cursor > 0.005) out.push({ u0: cursor, u1: lengthM });
    return out;
  }, [openings, lengthM]);

  return (
    <>
      {runs.map((run, i) => {
        const len = run.u1 - run.u0;
        const p = origin.clone();
        p.addScaledVector(dir, (run.u0 + run.u1) / 2);
        // Proud of the inner wall face (inner face sits at out*0).
        p.addScaledVector(out, -BASEBOARD_T / 2);
        p.y = BASEBOARD_H / 2;
        return (
          <mesh key={i} position={p} rotation={[0, theta, 0]} receiveShadow>
            <boxGeometry args={[len, BASEBOARD_H, BASEBOARD_T]} />
            <meshStandardMaterial color="#3a3a3c" roughness={0.6} />
          </mesh>
        );
      })}
    </>
  );
}

/* ── Floor & ceiling ─────────────────────────────────────── */
function Floor({
  bounds,
  option,
  onPointerMove,
  onPointerDown,
}: {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  option: MaterialOption;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const w = (bounds.maxX - bounds.minX) * CM;
  const d = (bounds.maxY - bounds.minY) * CM;
  const cx = ((bounds.minX + bounds.maxX) / 2) * CM;
  const cz = ((bounds.minY + bounds.maxY) / 2) * CM;

  return (
    <mesh
      position={[cx, 0, cz]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
    >
      <planeGeometry args={[w, d]} />
      <SurfaceMaterial
        key={option.id}
        opt={option}
        repeatX={w / (option.tileSizeM ?? 1)}
        repeatY={d / (option.tileSizeM ?? 1)}
      />
    </mesh>
  );
}

/** Two-tier gypsum cove ceiling (Gulf style): lowered perimeter border +
 *  recessed pocket + inset main ceiling, always in plaster. */
const COVE_W = 0.25;
export const COVE_DROP = 0.12;
const COVE_T = 0.03;

/* Artificial lighting colors */
const WARM_LIGHT = "#ffcc80";
const COOL_LIGHT = "#eaf2ff";
function useLighting() {
  const lightsOn = useKitchenToolStore((s) => s.lightsOn ?? false);
  const lightTemp = useKitchenToolStore((s) => s.lightTemp ?? "warm");
  return { lightsOn, lightColor: lightTemp === "cool" ? COOL_LIGHT : WARM_LIGHT };
}

function Ceiling({
  bounds,
  ceilingM,
  segments,
}: {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  ceilingM: number;
  segments: WallSegment[];
}) {
  const ceilingMaterialId = useKitchenToolStore((s) => s.ceilingMaterialId);
  const showSoffit = useKitchenToolStore((s) => s.showSoffit ?? true);
  const plaster = useMemo(
    () => findCeilingOption(ceilingMaterialId),
    [ceilingMaterialId]
  );

  // Main flat ceiling, inset by the cove width on every side.
  const w = Math.max((bounds.maxX - bounds.minX) * CM - 2 * COVE_W, 0.1);
  const d = Math.max((bounds.maxY - bounds.minY) * CM - 2 * COVE_W, 0.1);
  const cx = ((bounds.minX + bounds.maxX) / 2) * CM;
  const cz = ((bounds.minY + bounds.maxY) / 2) * CM;

  return (
    <>
      <mesh
        position={[cx, ceilingM, cz]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
      >
        <planeGeometry args={[w, d]} />
        <SurfaceMaterial key={plaster.id} opt={plaster} repeatX={w} repeatY={d} />
      </mesh>
      {segments.map((seg) => (
        <CeilingBorder
          key={`cb-${seg.id}`}
          seg={seg}
          segments={segments}
          ceilingM={ceilingM}
          opt={plaster}
        />
      ))}
      {showSoffit &&
        segments.map((seg) => (
          <WallSoffit
            key={`sf-${seg.id}`}
            seg={seg}
            segments={segments}
            ceilingM={ceilingM}
            opt={plaster}
          />
        ))}
    </>
  );
}

/** Gypsum soffit boxes: one per upper cabinet, dropping from the perimeter
 *  cove's underside down to just above that cabinet (Gulf-kitchen style).
 *  Cabinets at different heights produce a natural stepped look. */
const SOFFIT_DEPTH = 0.42;
const SOFFIT_MARGIN = 0.04;

function WallSoffit({
  seg,
  segments,
  ceilingM,
  opt,
}: {
  seg: WallSegment;
  segments: WallSegment[];
  ceilingM: number;
  opt: MaterialOption;
}) {
  const placed = useKitchenToolStore((s) => s.placedCabinets ?? []);
  const placedDecor = useKitchenToolStore((s) => s.placedDecor ?? []);

  const boxes = useMemo(() => {
    const uppers = placed
      .map((p) => ({ p, def: findCabinetDef(p.catalogId) }))
      .filter(
        (x): x is { p: PlacedCabinetState; def: CabinetDef } =>
          !!x.def &&
          x.p.wallId === seg.id &&
          x.def.level === "upper" &&
          !x.def.corner
      );
    const soffitDecor = placedDecor
      .map((p) => ({ p, item: findDecorItem(p.decorId) }))
      .filter(
        (x): x is { p: PlacedDecorState; item: DecorItem } =>
          !!x.item &&
          !!x.item.soffit &&
          x.item.placement === "wall" &&
          x.p.wallId === seg.id
      );
    if (uppers.length === 0 && soffitDecor.length === 0) return [];

    const { origin, dir, out, theta, lengthM } = segVectors(seg);
    const inward = out.clone().negate();
    const topY = ceilingM - COVE_DROP;

    const result: {
      id: string;
      pos: THREE.Vector3;
      theta: number;
      len: number;
      h: number;
    }[] = [];
    const pushBox = (
      id: string,
      offset: number,
      width: number,
      bottomY: number
    ) => {
      if (topY - bottomY <= 0.02) return;
      const uMin = Math.max(offset - SOFFIT_MARGIN, 0);
      const uMax = Math.min(offset + width + SOFFIT_MARGIN, lengthM);
      if (uMax - uMin <= 0.01) return;
      const pos = origin
        .clone()
        .addScaledVector(dir, (uMin + uMax) / 2)
        .addScaledVector(inward, SOFFIT_DEPTH / 2);
      pos.y = (bottomY + topY) / 2;
      result.push({ id, pos, theta, len: uMax - uMin, h: topY - bottomY });
    };
    for (const { p, def } of uppers) {
      pushBox(p.id, p.offset, def.width, (p.mountY ?? def.mountY) + def.height + 0.03);
    }
    for (const { p, item } of soffitDecor) {
      pushBox(
        p.id,
        p.offset ?? 0,
        item.width,
        (p.mountY ?? item.defaultMountY ?? 0) + item.height + 0.03
      );
    }
    return result;
  }, [placed, placedDecor, seg, ceilingM]);

  if (boxes.length === 0) return null;

  return (
    <>
      {boxes.map((b) => (
        <mesh
          key={b.id}
          position={b.pos}
          rotation={[0, b.theta, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[b.len, b.h, SOFFIT_DEPTH]} />
          <SurfaceMaterial key={opt.id} opt={opt} repeatX={b.len} repeatY={b.h} />
        </mesh>
      ))}
    </>
  );
}

function CeilingBorder({
  seg,
  segments,
  ceilingM,
  opt,
}: {
  seg: WallSegment;
  segments: WallSegment[];
  ceilingM: number;
  opt: MaterialOption;
}) {
  const { lightsOn, lightColor } = useLighting();
  const { origin, dir, theta, lengthM } = useMemo(() => segVectors(seg), [seg]);
  const inward = useMemo(() => inwardOf(seg), [seg]);
  // Only extend past an end if another wall actually meets it there
  // (fills the corner miter); open ends stay flush with the wall.
  const { extStart, extEnd } = useMemo(() => {
    const jns = getJunctions(segments);
    const { dir: myDir } = segVectors(seg);
    // Extend only when the extension actually fills a corner miter:
    // the adjacent wall must exist at this end AND the extension
    // direction must point into that wall's inward (cove band) side.
    // Convex/outward corners and open ends stay flush.
    const fillsMiter = (end: "start" | "end") => {
      const extDir = end === "end" ? myDir.clone() : myDir.clone().negate();
      return jns.some((jn) => {
        const mine =
          (jn.aId === seg.id && jn.aEnd === end) ||
          (jn.bId === seg.id && jn.bEnd === end);
        if (!mine) return false;
        const otherId = jn.aId === seg.id ? jn.bId : jn.aId;
        const other = segments.find((s) => s.id === otherId);
        if (!other) return false;
        return extDir.dot(inwardOf(other)) > 0.1;
      });
    };
    return {
      extStart: fillsMiter("start") ? COVE_W : 0,
      extEnd: fillsMiter("end") ? COVE_W : 0,
    };
  }, [segments, seg]);
  const len = lengthM + extStart + extEnd;
  const RISER_T = 0.02;
  const { position, riserPos } = useMemo(() => {
    const mid = lengthM / 2 + (extEnd - extStart) / 2;
    const p = origin.clone();
    p.addScaledVector(dir, mid);
    p.addScaledVector(inward, COVE_W / 2);
    // Underside sits at ceilingM - COVE_DROP.
    p.y = ceilingM - COVE_DROP + COVE_T / 2;
    // Dark riser closing the recess pocket at the border's inner edge.
    const r = origin.clone();
    r.addScaledVector(dir, mid);
    r.addScaledVector(inward, COVE_W - RISER_T / 2);
    r.y = ceilingM - COVE_DROP / 2;
    return { position: p, riserPos: r };
  }, [origin, dir, inward, lengthM, ceilingM, extStart, extEnd]);

  return (
    <>
      <mesh position={position} rotation={[0, theta, 0]} castShadow receiveShadow>
        <boxGeometry args={[len, COVE_T, COVE_W]} />
        <SurfaceMaterial key={opt.id} opt={opt} repeatX={len} repeatY={COVE_W} />
      </mesh>
      <mesh position={riserPos} rotation={[0, theta, 0]} castShadow receiveShadow>
        <boxGeometry args={[len, COVE_DROP, RISER_T]} />
        <meshStandardMaterial color="#2a2a2c" roughness={0.7} />
      </mesh>
      {lightsOn && (
        <>
          {/* Hidden LED strip inside the cove pocket */}
          <mesh
            position={[
              riserPos.x,
              ceilingM - COVE_DROP + COVE_T + 0.01,
              riserPos.z,
            ]}
            rotation={[0, theta, 0]}
          >
            <boxGeometry args={[len, 0.012, 0.03]} />
            <meshStandardMaterial
              color={lightColor}
              emissive={lightColor}
              emissiveIntensity={2.4}
              toneMapped={false}
            />
          </mesh>
          {/* One soft wash light per wall segment (max 3 walls) */}
          <pointLight
            position={[position.x, ceilingM - COVE_DROP / 2, position.z]}
            color={lightColor}
            intensity={5}
            distance={5}
            decay={1.6}
          />
        </>
      )}
    </>
  );
}

/* ── Recessed ceiling downlights ─────────────────────────── */
function Downlights({
  bounds,
  ceilingM,
}: {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  ceilingM: number;
}) {
  const { lightsOn, lightColor } = useLighting();
  const spots = useMemo(() => {
    const minX = bounds.minX * CM + COVE_W + 0.3;
    const maxX = bounds.maxX * CM - COVE_W - 0.3;
    const minZ = bounds.minY * CM + COVE_W + 0.3;
    const maxZ = bounds.maxY * CM - COVE_W - 0.3;
    const w = Math.max(maxX - minX, 0.1);
    const d = Math.max(maxZ - minZ, 0.1);
    let nx = Math.min(3, Math.max(1, Math.round(w / 1.6)));
    let nz = Math.min(2, Math.max(1, Math.round(d / 1.6)));
    while (nx * nz > 6) (nx > nz ? nx-- : nz--);
    const pts: [number, number][] = [];
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++)
        pts.push([
          nx === 1 ? (minX + maxX) / 2 : minX + (w * i) / (nx - 1),
          nz === 1 ? (minZ + maxZ) / 2 : minZ + (d * j) / (nz - 1),
        ]);
    return pts;
  }, [bounds]);

  return (
    <>
      {spots.map(([x, z], i) => (
        <group key={`dl-${i}`}>
          {/* Recessed fixture housing (always visible) */}
          <mesh position={[x, ceilingM - 0.006, z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.07, 24]} />
            <meshStandardMaterial color="#26262a" roughness={0.5} />
          </mesh>
          {lightsOn && (
            <>
              <mesh position={[x, ceilingM - 0.01, z]} rotation={[Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.05, 24]} />
                <meshStandardMaterial
                  color={lightColor}
                  emissive={lightColor}
                  emissiveIntensity={3}
                  toneMapped={false}
                />
              </mesh>
              <SpotDown x={x} z={z} ceilingM={ceilingM} color={lightColor} />
            </>
          )}
        </group>
      ))}
    </>
  );
}

function SpotDown({
  x,
  z,
  ceilingM,
  color,
}: {
  x: number;
  z: number;
  ceilingM: number;
  color: string;
}) {
  const target = useMemo(() => {
    const t = new THREE.Object3D();
    t.position.set(x, 0, z);
    return t;
  }, [x, z]);
  return (
    <>
      <spotLight
        position={[x, ceilingM - 0.02, z]}
        target={target}
        angle={0.6}
        penumbra={0.5}
        color={color}
        intensity={14}
        distance={ceilingM + 2}
        decay={1.4}
      />
      <primitive object={target} />
    </>
  );
}

/* ── Placed cabinets (catalog items on walls) ────────────── */
function inwardOf(seg: WallSegment): THREE.Vector3 {
  return new THREE.Vector3(-seg.nx, 0, -seg.ny);
}

/** Wood-type finish for a placed cabinet, with optional custom color override. */
function resolvePlacedFinish(
  placed: PlacedCabinetState,
  adekoFinishById?: Record<number, AdekoFinish>
): AdekoFinish | undefined {
  const base =
    placed.finishWoodTypeId != null
      ? adekoFinishById?.[placed.finishWoodTypeId]
      : undefined;
  if (!placed.finishColor) return base;
  const b = base ?? DEFAULT_ADEKO_FINISH;
  return { ...b, id: `${b.id}-custom-${placed.finishColor}`, tint: placed.finishColor };
}

function PlacedCabinetMesh({
  placed,
  def,
  segments,
  selected,
  onGrab,
  adekoFinishById,
}: {
  placed: PlacedCabinetState;
  def: CabinetDef;
  segments: WallSegment[];
  selected: boolean;
  onGrab: (id: string, def: CabinetDef) => void;
  adekoFinishById?: Record<number, AdekoFinish>;
}) {
  const { lightsOn, lightColor } = useLighting();
  const seg = segments.find((s) => s.id === placed.wallId);

  const lCorner = isLCorner(def);

  const built = useMemo(() => {
    if (!seg) return null;
    const { origin, dir } = segVectors(seg);
    const inward = inwardOf(seg);
    let rotY = Math.atan2(inward.x, inward.z);
    let pos: THREE.Vector3 | null = null;
    let corner = false;
    let swapArms = false;

    if (def.corner) {
      const jn = junctionOfPlaced(placed, def, segments);
      if (jn) {
        const segA = segments.find((s) => s.id === jn.aId)!;
        const segB = segments.find((s) => s.id === jn.bId)!;
        const inA = inwardOf(segA);
        const inB = inwardOf(segB);
        if (lCorner) {
          // L-shaped corner: local origin at the junction, +X along one wall,
          // +Z along the other. Try each wall's frame; the geometry is
          // diagonal-symmetric so one of the two is always right-handed.
          const frames = [
            { seg: segA, end: jn.aEnd, inw: inA },
            { seg: segB, end: jn.bEnd, inw: inB },
          ];
          let chosen = frames[0];
          for (const f of frames) {
            const v = segVectors(f.seg);
            const d = f.end === "start" ? v.dir.clone() : v.dir.clone().negate();
            const xAxis = new THREE.Vector3(f.inw.z, 0, -f.inw.x);
            if (xAxis.dot(d) > 0) {
              chosen = f;
              break;
            }
          }
          rotY = Math.atan2(chosen.inw.x, chosen.inw.z);
          const xAxis = new THREE.Vector3(chosen.inw.z, 0, -chosen.inw.x);
          pos = new THREE.Vector3(jn.x * CM, 0, jn.y * CM)
            .addScaledVector(chosen.inw, 0.005)
            .addScaledVector(xAxis, 0.005);
          corner = true;
          // Arm A (def.width) belongs on the placed wall; when the chosen
          // frame is the OTHER wall's, the arms must be swapped so each arm
          // length matches the wall it was reserved on.
          swapArms = chosen.seg.id !== placed.wallId;
        }
      }
    }
    if (!pos) {
      pos = origin
        .clone()
        .addScaledVector(dir, placed.offset + def.width / 2)
        .addScaledVector(inward, def.depth / 2 + 0.005);
    }
    pos.y = placed.mountY ?? def.mountY;
    return { pos, rotY: rotY + (placed.rotYOffset ?? 0), corner, swapArms };
  }, [seg, placed, def, segments, lCorner]);

  if (!built) return null;

  return (
    <group
      position={built.pos}
      rotation={[0, built.rotY, 0]}
      onPointerDown={(e) => {
        e.stopPropagation();
        onGrab(placed.id, def);
      }}
    >
      {built.corner ? (
        <AdekoCornerCabinet
          def={def}
          swapArms={built.swapArms}
          options={{
            finish: resolvePlacedFinish(placed, adekoFinishById),
            topFinish: findAdekoTopFinish(placed.topFinishId),
            handleStyle: placed.handleStyle ?? "bar",
            handleColor: placed.handleColor ?? "gray",
          }}
        />
      ) : (
        <AdekoBaseCabinet
          def={def}
          options={{
            finish: resolvePlacedFinish(placed, adekoFinishById),
            topFinish: findAdekoTopFinish(placed.topFinishId),
            handleStyle: placed.handleStyle ?? "bar",
            handleColor: placed.handleColor ?? "gray",
            doorHinge: placed.doorHinge,
          }}
        />
      )}
      {def.level === "upper" && lightsOn && !built.corner && (
        <mesh position={[0, -0.008, def.depth / 2 - 0.02]}>
          <boxGeometry args={[Math.max(def.width - 0.04, 0.1), 0.014, 0.025]} />
          <meshStandardMaterial
            color={lightColor}
            emissive={lightColor}
            emissiveIntensity={2.2}
            toneMapped={false}
          />
        </mesh>
      )}
      {selected &&
        (built.corner ? (
          <mesh position={[def.width / 2, def.height / 2, def.width / 2]}>
            <boxGeometry args={[def.width + 0.05, def.height + 0.05, def.width + 0.05]} />
            <meshBasicMaterial color="#d92626" transparent opacity={0.16} depthWrite={false} />
          </mesh>
        ) : (
          <mesh position={[0, def.height / 2, 0]}>
            <boxGeometry args={[def.width + 0.05, def.height + 0.05, def.depth + 0.05]} />
            <meshBasicMaterial color="#d92626" transparent opacity={0.16} depthWrite={false} />
          </mesh>
        ))}
    </group>
  );
}

function PlacedCabinets({
  segments,
  selectedId,
  onGrab,
  adekoFinishById,
}: {
  segments: WallSegment[];
  selectedId: string | null;
  onGrab: (id: string, def: CabinetDef) => void;
  adekoFinishById?: Record<number, AdekoFinish>;
}) {
  const placed = useKitchenToolStore((s) => s.placedCabinets ?? []);
  return (
    <>
      {placed.map((p) => {
        const def = findCabinetDef(p.catalogId);
        if (!def) return null;
        return (
          <PlacedCabinetMesh
            key={p.id}
            placed={p}
            def={def}
            segments={segments}
            selected={p.id === selectedId}
            onGrab={onGrab}
            adekoFinishById={adekoFinishById}
          />
        );
      })}
    </>
  );
}

/* ── Decor items (appliances / furniture / plants / details) ── */

/**
 * Loads a glTF model and normalizes it: optionally isolates a named node,
 * uniform-scales to the item's target height, centers on X/Z and rests the
 * bottom at y=0. Handles the wildly different native units of the assets.
 */
function DecorModel({ item, tint }: { item: DecorItem; tint?: string }) {
  const gltf = useGLTF(item.modelPath);

  const built = useMemo(() => {
    const clonedMats: THREE.Material[] = [];
    let source: THREE.Object3D = gltf.scene;
    if (item.nodeName) {
      const node = gltf.scene.getObjectByName(item.nodeName);
      if (node) source = node;
    }
    const clone = source.clone(true);
    const holder = new THREE.Group();
    holder.add(clone);
    // Neutralize inherited world transform when isolating a nested node.
    if (item.nodeName && source !== gltf.scene) {
      source.updateWorldMatrix(true, false);
      clone.matrix.copy(source.matrixWorld);
      clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
    }
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const s = size.y > 1e-6 ? item.height / size.y : 1;
    holder.scale.setScalar(s);
    holder.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    holder.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (tint) {
          const applyTint = (m: THREE.Material) => {
            const c = m.clone();
            if ("color" in c) (c as THREE.MeshStandardMaterial).color.set(tint);
            clonedMats.push(c);
            return c;
          };
          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map(applyTint)
            : applyTint(mesh.material);
        }
      }
    });
    const wrapper = new THREE.Group();
    wrapper.add(holder);
    wrapper.rotation.y = item.rotYOffset ?? 0;
    return { wrapper, clonedMats };
  }, [gltf.scene, item, tint]);

  // Dispose cloned tint materials when tint changes or the item unmounts.
  // Textures are shared with the source materials and must NOT be disposed.
  useEffect(() => {
    const mats = built.clonedMats;
    return () => {
      for (const m of mats) m.dispose();
    };
  }, [built]);

  return <primitive object={built.wrapper} />;
}

function PlacedDecorMesh({
  placed,
  item,
  segments,
  selected,
  onGrab,
}: {
  placed: PlacedDecorState;
  item: DecorItem;
  segments: WallSegment[];
  selected: boolean;
  onGrab: (placed: PlacedDecorState, item: DecorItem) => void;
}) {
  const built = useMemo(() => {
    if (item.placement === "wall") {
      const seg = segments.find((s) => s.id === placed.wallId);
      if (!seg) return null;
      const { origin, dir } = segVectors(seg);
      const inward = inwardOf(seg);
      const rotY = Math.atan2(inward.x, inward.z) + (placed.rotY ?? 0);
      const pos = origin
        .clone()
        .addScaledVector(dir, (placed.offset ?? 0) + item.width / 2)
        .addScaledVector(inward, item.depth / 2 + 0.005);
      pos.y = placed.mountY ?? item.defaultMountY ?? 0;
      return { pos, rotY };
    }
    if (placed.x == null || placed.z == null) return null;
    return {
      pos: new THREE.Vector3(placed.x, 0, placed.z),
      rotY: placed.rotY ?? 0,
    };
  }, [placed, item, segments]);

  if (!built) return null;

  return (
    <group
      position={built.pos}
      rotation={[0, built.rotY, 0]}
      onPointerDown={(e) => {
        e.stopPropagation();
        onGrab(placed, item);
      }}
      onClick={(e) => {
        if (!item.togglesLights) return;
        e.stopPropagation();
        // Only a real click (no drag movement) flips the switch.
        if (e.delta <= 4) useKitchenToolStore.getState().toggleLights();
      }}
    >
      <Suspense fallback={null}>
        <DecorModel item={item} tint={placed.tint} />
      </Suspense>
      {selected && (
        <mesh position={[0, item.height / 2, 0]}>
          <boxGeometry args={[item.width + 0.06, item.height + 0.06, item.depth + 0.06]} />
          <meshBasicMaterial color="#d92626" transparent opacity={0.16} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function PlacedDecorItems({
  segments,
  selectedId,
  onGrab,
}: {
  segments: WallSegment[];
  selectedId: string | null;
  onGrab: (placed: PlacedDecorState, item: DecorItem) => void;
}) {
  const placed = useKitchenToolStore((s) => s.placedDecor ?? []);
  return (
    <>
      {placed.map((p) => {
        const item = findDecorItem(p.decorId);
        if (!item) return null;
        return (
          <PlacedDecorMesh
            key={p.id}
            placed={p}
            item={item}
            segments={segments}
            selected={p.id === selectedId}
            onGrab={onGrab}
          />
        );
      })}
    </>
  );
}

/* ── Utility markers ─────────────────────────────────────── */
function WallMarker({
  seg,
  positionAlongWall,
  heightM,
  children,
}: {
  seg: WallSegment;
  positionAlongWall: number;
  heightM: number;
  children: React.ReactNode;
}) {
  const { pos, faceTheta } = useMemo(() => {
    const { origin, dir, out, lengthM } = segVectors(seg);
    const inward = out.clone().negate();
    const d = Math.min(Math.max(positionAlongWall * CM, 0.05), Math.max(lengthM - 0.05, 0));
    const p = origin.clone().addScaledVector(dir, d);
    p.addScaledVector(inward, 0.012);
    p.y = heightM;
    return { pos: p, faceTheta: Math.atan2(inward.x, inward.z) };
  }, [seg, positionAlongWall, heightM]);

  return (
    <group position={pos} rotation={[0, faceTheta, 0]}>
      {children}
    </group>
  );
}

function UtilityMarkers({
  utilities,
  segments,
}: {
  utilities: KitchenUtility[];
  segments: WallSegment[];
}) {
  const segById = useMemo(() => new Map(segments.map((s) => [s.id, s])), [segments]);

  return (
    <>
      {utilities.map((u) => {
        if (u.wallId) {
          const seg = segById.get(u.wallId);
          if (!seg) return null;
          const h = Math.max(u.heightFromFloor * CM, 0.05);
          return (
            <WallMarker
              key={u.id}
              seg={seg}
              positionAlongWall={u.positionAlongWall ?? 0}
              heightM={h}
            >
              {u.kind === "water" && (
                <group>
                  <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.045, 0.045, 0.02, 24]} />
                    <meshStandardMaterial color="#2f86c9" roughness={0.4} />
                  </mesh>
                  <mesh position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.012, 0.012, 0.04, 16]} />
                    <meshStandardMaterial color="#c8cdd2" metalness={0.7} roughness={0.3} />
                  </mesh>
                </group>
              )}
              {u.kind === "outlet" && (
                <group>
                  <mesh>
                    <boxGeometry args={[0.085, 0.085, 0.014]} />
                    <meshStandardMaterial color="#f6f6f4" roughness={0.5} />
                  </mesh>
                  <mesh position={[-0.016, 0, 0.009]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.006, 0.006, 0.006, 12]} />
                    <meshStandardMaterial color="#3a3f45" />
                  </mesh>
                  <mesh position={[0.016, 0, 0.009]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.006, 0.006, 0.006, 12]} />
                    <meshStandardMaterial color="#3a3f45" />
                  </mesh>
                </group>
              )}
              {u.kind === "switch" && (
                <group>
                  <mesh>
                    <boxGeometry args={[0.085, 0.085, 0.012]} />
                    <meshStandardMaterial color="#f6f6f4" roughness={0.5} />
                  </mesh>
                  <mesh position={[0, 0, 0.011]}>
                    <boxGeometry args={[0.032, 0.052, 0.01]} />
                    <meshStandardMaterial color="#e7e6e2" roughness={0.45} />
                  </mesh>
                </group>
              )}
              {u.kind === "drain" && (
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.05, 0.05, 0.014, 24]} />
                  <meshStandardMaterial color="#3c4046" roughness={0.6} metalness={0.35} />
                </mesh>
              )}
              {u.kind === "gas" && (
                <group>
                  <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.045, 0.045, 0.018, 24]} />
                    <meshStandardMaterial color="#e8842c" roughness={0.45} />
                  </mesh>
                  <mesh position={[0, 0, 0.028]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.014, 0.014, 0.045, 16]} />
                    <meshStandardMaterial color="#c9a227" metalness={0.75} roughness={0.3} />
                  </mesh>
                  <mesh position={[0, 0.026, 0.045]}>
                    <boxGeometry args={[0.012, 0.038, 0.012]} />
                    <meshStandardMaterial color="#b3261e" roughness={0.4} />
                  </mesh>
                </group>
              )}
            </WallMarker>
          );
        }
        // Floor drain
        if (u.kind === "drain" && u.x != null && u.y != null) {
          return (
            <mesh key={u.id} position={[u.x * CM, 0.006, u.y * CM]}>
              <cylinderGeometry args={[0.06, 0.06, 0.01, 28]} />
              <meshStandardMaterial color="#33373c" roughness={0.55} metalness={0.4} />
            </mesh>
          );
        }
        return null;
      })}
    </>
  );
}

/* ── Live drag measurements ──────────────────────────────── */
interface DragMeasureInfo {
  wallId: string;
  offset: number;
  width: number;
  mountY: number;
  height: number;
  depth: number;
  leftEdge: number;
  rightEdge: number;
  leftIsWall: boolean;
  rightIsWall: boolean;
}

function MeasureLabel({
  position,
  text,
  sub,
  testId,
}: {
  position: THREE.Vector3;
  text: string;
  sub?: string;
  testId: string;
}) {
  return (
    <Html position={position} center zIndexRange={[100, 0]} style={{ pointerEvents: "none" }}>
      <div
        data-testid={testId}
        style={{
          background: "rgba(20, 22, 26, 0.85)",
          color: "#fff",
          borderRadius: 6,
          padding: "2px 8px",
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: "nowrap",
          textAlign: "center",
          direction: "rtl",
          boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
          lineHeight: 1.3,
        }}
      >
        {text}
        {sub && (
          <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.75 }}>{sub}</div>
        )}
      </div>
    </Html>
  );
}

function DragMeasurements({
  info,
  segments,
}: {
  info: DragMeasureInfo;
  segments: WallSegment[];
}) {
  const seg = segments.find((s) => s.id === info.wallId);
  if (!seg) return null;
  const { origin, dir, out } = segVectors(seg);
  const inward = out.clone().negate();
  const labelY = info.mountY + info.height + 0.14;
  const frontOff = info.depth + 0.06;

  const at = (along: number) =>
    origin
      .clone()
      .addScaledVector(dir, along)
      .addScaledVector(inward, frontOff)
      .setY(labelY);

  const leftGap = Math.max(info.offset - info.leftEdge, 0);
  const rightGap = Math.max(info.rightEdge - (info.offset + info.width), 0);
  const cm = (m: number) => `${Math.round(m / CM)} سم`;

  return (
    <>
      <MeasureLabel
        position={at((info.leftEdge + info.offset) / 2)}
        text={cm(leftGap)}
        sub={info.leftIsWall ? "من بداية الجدار" : "من العنصر المجاور"}
        testId="label-drag-gap-left"
      />
      <MeasureLabel
        position={at(info.offset + info.width / 2)}
        text={cm(info.width)}
        sub={`الإزاحة ${cm(info.offset)}`}
        testId="label-drag-offset"
      />
      <MeasureLabel
        position={at((info.offset + info.width + info.rightEdge) / 2)}
        text={cm(rightGap)}
        sub={info.rightIsWall ? "إلى نهاية الجدار" : "إلى العنصر المجاور"}
        testId="label-drag-gap-right"
      />
    </>
  );
}

/* ── Auto camera tour (presentation mode) ────────────────── */
function CameraTour({
  center,
  roomSpan,
  ceilingM,
  onEnd,
}: {
  center: THREE.Vector3;
  roomSpan: number;
  ceilingM: number;
  onEnd?: () => void;
}) {
  const tRef = useRef(0);
  const { camera, gl } = useThree();

  useEffect(() => {
    // A press or scroll on the 3D canvas itself stops the tour and hands
    // control back. UI buttons outside the canvas are unaffected.
    const stop = () => onEnd?.();
    const el = gl.domElement;
    el.addEventListener("pointerdown", stop);
    el.addEventListener("wheel", stop, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("wheel", stop);
    };
  }, [onEnd, gl]);

  useFrame((_, delta) => {
    tRef.current += Math.min(delta, 0.05);
    const t = tRef.current;
    const angle = t * 0.22; // slow orbit
    // Radius breathes: sweeps in close then back out (cinematic feel).
    const far = Math.max(roomSpan * 1.6, 3.4);
    const near = Math.max(roomSpan * 0.55, 1.6);
    const radius = near + (far - near) * (0.5 + 0.5 * Math.cos(t * 0.13));
    // Eye height drifts between standing height and a gentle high shot.
    const y = 1.5 + (Math.min(ceilingM + 1.2, 3.4) - 1.5) * (0.5 + 0.5 * Math.sin(t * 0.09));
    camera.position.set(
      center.x + radius * Math.cos(angle),
      y,
      center.z + radius * Math.sin(angle)
    );
    camera.lookAt(center.x, 0.95, center.z);
  });

  return null;
}

/* ── Camera view presets (natural / top / iso / reset) ───── */
export interface CameraViewRequest {
  mode: "person" | "top" | "iso" | "reset";
  nonce: number;
}

function easeInOutCubic(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Smoothly animates the camera to a requested preset view.
 * Only reads/writes camera position and the OrbitControls target —
 * no scene or collision logic is touched.
 */
function CameraViewAnimator({
  request,
  center,
  roomSpan,
  ceilingM,
  bounds,
  controlsRef,
  onAnimatingChange,
}: {
  request?: CameraViewRequest | null;
  center: THREE.Vector3;
  roomSpan: number;
  ceilingM: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  controlsRef: React.MutableRefObject<any>;
  onAnimatingChange: (v: boolean) => void;
}) {
  const { camera } = useThree();
  const anim = useRef<{
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTgt: THREE.Vector3;
    toTgt: THREE.Vector3;
    t: number;
    dur: number;
  } | null>(null);
  const lastNonce = useRef(0);

  useEffect(() => {
    if (!request || request.nonce === lastNonce.current) return;
    lastNonce.current = request.nonce;

    const defaultPos = new THREE.Vector3(
      ((bounds.minX + bounds.maxX) / 2) * CM - 1.2,
      1.65,
      bounds.maxY * CM + 2.2
    );
    const defaultTgt = new THREE.Vector3(center.x, 1, center.z);

    let toPos: THREE.Vector3;
    let toTgt: THREE.Vector3;
    switch (request.mode) {
      case "person": {
        // Eye-level view from inside the room looking at the kitchen.
        toPos = new THREE.Vector3(
          center.x,
          1.6,
          center.z + Math.max(roomSpan * 0.42, 1.3)
        );
        toTgt = new THREE.Vector3(center.x, 1.35, center.z - roomSpan * 0.5);
        break;
      }
      case "top": {
        toPos = new THREE.Vector3(
          center.x,
          ceilingM + Math.max(roomSpan * 1.15, 3.2),
          center.z + 0.02
        );
        toTgt = new THREE.Vector3(center.x, 0, center.z);
        break;
      }
      case "iso":
      case "reset":
      default: {
        toPos = defaultPos;
        toTgt = defaultTgt;
        break;
      }
    }

    const fromTgt = controlsRef.current
      ? (controlsRef.current.target as THREE.Vector3).clone()
      : defaultTgt.clone();
    anim.current = {
      fromPos: camera.position.clone(),
      toPos,
      fromTgt,
      toTgt,
      t: 0,
      dur: 1.1,
    };
    onAnimatingChange(true);
  }, [request, camera, center, roomSpan, ceilingM, bounds, controlsRef, onAnimatingChange]);

  useFrame((_, delta) => {
    const a = anim.current;
    if (!a) return;
    a.t += Math.min(delta, 0.05);
    const k = easeInOutCubic(Math.min(a.t / a.dur, 1));
    camera.position.lerpVectors(a.fromPos, a.toPos, k);
    const tgt = new THREE.Vector3().lerpVectors(a.fromTgt, a.toTgt, k);
    if (controlsRef.current) {
      controlsRef.current.target.copy(tgt);
      controlsRef.current.update();
    } else {
      camera.lookAt(tgt);
    }
    if (a.t >= a.dur) {
      anim.current = null;
      onAnimatingChange(false);
    }
  });

  return null;
}

/* ── Scene contents (inside Suspense) ────────────────────── */
function SceneContents({
  layout,
  walls,
  ceilingHeight,
  openings,
  utilities,
  selectedCabinetId = null,
  onSelectCabinet,
  selectedDecorId = null,
  onSelectDecor,
  adekoFinishById,
  presentation = false,
  tourActive = false,
  onTourEnd,
  viewRequest,
}: StudioSceneProps) {
  const [camAnimating, setCamAnimating] = useState(false);
  const segments = useMemo(() => getWallSegments(layout, walls), [layout, walls]);
  const bounds = useMemo(() => getFloorBounds(segments), [segments]);
  const ceilingM = ceilingHeight * CM;

  const floorMaterialId = useKitchenToolStore((s) => s.floorMaterialId);
  const wallMaterialId = useKitchenToolStore((s) => s.wallMaterialId);
  const floorOption = findFloorOption(floorMaterialId);
  const wallOption = findWallOption(wallMaterialId);
  const environmentId = useKitchenToolStore((s) => s.environmentId);
  const envOption = findEnvironmentOption(environmentId);

  const placedCabinets = useKitchenToolStore((s) => s.placedCabinets ?? []);
  const movePlacedCabinet = useKitchenToolStore((s) => s.movePlacedCabinet);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const [drag, setDrag] = useState<{ id: string; def: CabinetDef } | null>(null);
  const [dragInfo, setDragInfo] = useState<DragMeasureInfo | null>(null);
  const [decorDrag, setDecorDrag] = useState<{
    id: string;
    item: DecorItem;
    mountY: number;
  } | null>(null);
  const updatePlacedDecor = useKitchenToolStore((s) => s.updatePlacedDecor);

  /** Compute live measurement info for a cabinet at (wallId, offset). Read-only
      use of blockedIntervals — no collision-engine changes. */
  const computeDragInfo = (
    wallId: string,
    offset: number,
    def: CabinetDef,
    excludeId: string
  ): DragMeasureInfo | null => {
    const seg = segments.find((s) => s.id === wallId);
    if (!seg) return null;
    const wallLenM = seg.length * CM;
    const subject = placedCabinets.find((c) => c.id === excludeId);
    const intervals = blockedIntervals(
      wallId,
      verticalSpan(def, subject?.mountY),
      placedCabinets,
      segments,
      openings,
      excludeId
    );
    const left = offset;
    const right = offset + def.width;
    let leftEdge = 0;
    let leftIsWall = true;
    let rightEdge = wallLenM;
    let rightIsWall = true;
    for (const iv of intervals) {
      if (iv.b <= left + 1e-4 && iv.b > leftEdge) {
        leftEdge = iv.b;
        leftIsWall = false;
      }
      if (iv.a >= right - 1e-4 && iv.a < rightEdge) {
        rightEdge = iv.a;
        rightIsWall = false;
      }
    }
    return {
      wallId,
      offset,
      width: def.width,
      mountY: def.mountY,
      height: def.height,
      depth: def.depth,
      leftEdge,
      rightEdge,
      leftIsWall,
      rightIsWall,
    };
  };

  useEffect(() => {
    if (!drag && !decorDrag) return;
    const up = () => {
      setDrag(null);
      setDragInfo(null);
      setDecorDrag(null);
      if (controlsRef.current) controlsRef.current.enabled = true;
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, decorDrag]);

  const handleGrab = (id: string, def: CabinetDef) => {
    if (presentation) return;
    onSelectCabinet?.(id);
    onSelectDecor?.(null);
    if (def.corner) return;
    // Disable orbit synchronously — the React prop update alone races with
    // OrbitControls' native DOM listeners on the same pointerdown.
    if (controlsRef.current) controlsRef.current.enabled = false;
    setDrag({ id, def });
    const placed = placedCabinets.find((c) => c.id === id);
    if (placed) setDragInfo(computeDragInfo(placed.wallId, placed.offset, def, id));
  };

  const handleDragMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drag) return;
    const placed = placedCabinets.find((c) => c.id === drag.id);
    if (!placed) return;
    const def = drag.def;
    const pp = planPointAt(segments, e.point.x / CM, e.point.z / CM);
    if (!pp.nearestWallId) return;
    const seg = segments.find((s) => s.id === pp.nearestWallId);
    if (!seg) return;
    const wallLenM = seg.length * CM;
    const desired = pp.distanceAlongWall * CM - def.width / 2;
    const intervals = blockedIntervals(
      pp.nearestWallId,
      verticalSpan(def, placed.mountY),
      placedCabinets,
      segments,
      openings,
      placed.id
    );
    const resolved = resolveDragOffset(wallLenM, intervals, desired, def.width);
    if (resolved === null) return;
    if (pp.nearestWallId !== placed.wallId || Math.abs(resolved - placed.offset) > 1e-4) {
      movePlacedCabinet(placed.id, pp.nearestWallId, resolved);
    }
    setDragInfo(computeDragInfo(pp.nearestWallId, resolved, def, placed.id));
  };

  const handleFloorDown = () => {
    onSelectCabinet?.(null);
    onSelectDecor?.(null);
  };

  const handleDecorGrab = (placed: PlacedDecorState, item: DecorItem) => {
    if (presentation) return;
    onSelectDecor?.(placed.id);
    onSelectCabinet?.(null);
    if (controlsRef.current) controlsRef.current.enabled = false;
    setDecorDrag({
      id: placed.id,
      item,
      mountY: placed.mountY ?? item.defaultMountY ?? 0,
    });
  };

  const handleDecorDragMove = (e: ThreeEvent<PointerEvent>) => {
    if (!decorDrag) return;
    const item = decorDrag.item;
    if (item.placement === "wall") {
      const pp = planPointAt(segments, e.point.x / CM, e.point.z / CM);
      if (!pp.nearestWallId) return;
      const seg = segments.find((s) => s.id === pp.nearestWallId);
      if (!seg) return;
      const wallLenM = seg.length * CM;
      const desired = pp.distanceAlongWall * CM - item.width / 2;
      // Keep the item off doors/windows when its vertical band overlaps them.
      const y0 = decorDrag.mountY;
      const y1 = y0 + item.height;
      const intervals = openings
        .filter((o) => o.wallId === pp.nearestWallId)
        .flatMap((o) => {
          if (o.type === "door") {
            if (y0 >= 2.1 - 0.02) return [];
          } else {
            const sill = (o.sillHeight ?? 90) * CM;
            const top = sill + (o.height ?? 120) * CM;
            if (y1 <= sill + 0.02 || y0 >= top - 0.02) return [];
          }
          return [
            {
              a: o.distanceFromWallStart * CM - 0.02,
              b: (o.distanceFromWallStart + o.width) * CM + 0.02,
            },
          ];
        });
      const resolved = resolveDragOffset(wallLenM, intervals, desired, item.width);
      if (resolved === null) return;
      updatePlacedDecor(decorDrag.id, { wallId: pp.nearestWallId, offset: resolved });
    } else {
      // Rotation-aware footprint so long pieces can be pushed flush to walls.
      const placed = (useKitchenToolStore.getState().placedDecor ?? []).find(
        (d) => d.id === decorDrag.id
      );
      const rot = placed?.rotY ?? 0;
      const c = Math.abs(Math.cos(rot));
      const s = Math.abs(Math.sin(rot));
      const halfX = (c * item.width + s * item.depth) / 2;
      const halfZ = (s * item.width + c * item.depth) / 2;
      const x = Math.min(
        Math.max(e.point.x, bounds.minX * CM + halfX),
        Math.max(bounds.maxX * CM - halfX, bounds.minX * CM + halfX)
      );
      const z = Math.min(
        Math.max(e.point.z, bounds.minY * CM + halfZ),
        Math.max(bounds.maxY * CM - halfZ, bounds.minY * CM + halfZ)
      );
      updatePlacedDecor(decorDrag.id, { x, z });
    }
  };

  const center = useMemo(
    () =>
      new THREE.Vector3(
        ((bounds.minX + bounds.maxX) / 2) * CM,
        1,
        ((bounds.minY + bounds.maxY) / 2) * CM
      ),
    [bounds]
  );
  const roomSpan = Math.max(
    (bounds.maxX - bounds.minX) * CM,
    (bounds.maxY - bounds.minY) * CM
  );
  const windowSun = useMemo(
    () => computeWindowSun(segments, openings, ceilingM),
    [segments, openings, ceilingM]
  );

  return (
    <>
      <Environment files={envOption.file} background blur={0.7} />
      {windowSun && <WindowSunlight sun={windowSun} envId={envOption.id} />}
      <directionalLight
        position={[center.x + roomSpan * 0.9, ceilingM + 2.6, center.z + roomSpan * 1.2]}
        intensity={windowSun ? 0.55 : 1.0}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-roomSpan * 1.6}
        shadow-camera-right={roomSpan * 1.6}
        shadow-camera-top={roomSpan * 1.6}
        shadow-camera-bottom={-roomSpan * 1.6}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
      />
      {/* Warm even fill so opposite walls don't render washed-out/uneven */}
      <ambientLight intensity={0.32} color="#ffe9d2" />

      <Suspense fallback={null}>
        <Floor
          bounds={bounds}
          option={floorOption}
          onPointerDown={handleFloorDown}
        />
      </Suspense>

      {/* Invisible drag plane at the grabbed item's height — captures
          pointer movement anywhere on screen, independent of the floor. */}
      {(drag || decorDrag) && (
        <mesh
          position={[
            center.x,
            drag
              ? drag.def.mountY
              : decorDrag!.item.placement === "wall"
                ? decorDrag!.mountY
                : 0.001,
            center.z,
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerMove={drag ? handleDragMove : handleDecorDragMove}
        >
          <planeGeometry args={[Math.max(roomSpan * 12, 60), Math.max(roomSpan * 12, 60)]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      <Suspense fallback={null}>
        <Ceiling bounds={bounds} ceilingM={ceilingM} segments={segments} />
      </Suspense>
      <Downlights bounds={bounds} ceilingM={ceilingM} />
      <Suspense fallback={null}>
        <Walls
          segments={segments}
          ceilingM={ceilingM}
          openings={openings}
          option={wallOption}
        />
      </Suspense>
      <Suspense fallback={null}>
        <PlacedCabinets
          segments={segments}
          selectedId={selectedCabinetId}
          onGrab={handleGrab}
          adekoFinishById={adekoFinishById}
        />
      </Suspense>
      <Suspense fallback={null}>
        <PlacedDecorItems
          segments={segments}
          selectedId={selectedDecorId}
          onGrab={handleDecorGrab}
        />
      </Suspense>
      <UtilityMarkers utilities={utilities} segments={segments} />

      {drag && dragInfo && <DragMeasurements info={dragInfo} segments={segments} />}

      {tourActive && (
        <CameraTour
          center={center}
          roomSpan={roomSpan}
          ceilingM={ceilingM}
          onEnd={onTourEnd}
        />
      )}

      <CameraViewAnimator
        request={viewRequest}
        center={center}
        roomSpan={roomSpan}
        ceilingM={ceilingM}
        bounds={bounds}
        controlsRef={controlsRef}
        onAnimatingChange={setCamAnimating}
      />

      {!presentation && (
        <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
          <GizmoViewport
            axisColors={["#d92626", "#8a5a33", "#5d6d63"]}
            labelColor="#f5f2ec"
            hideNegativeAxes
          />
        </GizmoHelper>
      )}

      <OrbitControls
        ref={controlsRef}
        target={[center.x, 1, center.z]}
        maxPolarAngle={Math.PI / 2 + 0.5}
        minDistance={0.3}
        maxDistance={Math.max(roomSpan * 3, 10)}
        enableDamping
        enabled={!drag && !decorDrag && !tourActive && !camAnimating}
      />
    </>
  );
}

/* ── Public component ────────────────────────────────────── */
export interface StudioSceneProps {
  layout: KitchenLayout;
  walls: KitchenWall[];
  ceilingHeight: number;
  openings: KitchenOpening[];
  utilities: KitchenUtility[];
  selectedCabinetId?: string | null;
  onSelectCabinet?: (id: string | null) => void;
  selectedDecorId?: string | null;
  onSelectDecor?: (id: string | null) => void;
  /** Wood-type id → 3D finish, for Adeko parametric cabinets. */
  adekoFinishById?: Record<number, AdekoFinish>;
  /** Presentation mode: viewing only — no grabbing/dragging of items. */
  presentation?: boolean;
  /** Auto camera tour around the kitchen (presentation mode). */
  tourActive?: boolean;
  /** Called when the user interrupts the auto tour. */
  onTourEnd?: () => void;
  /** Camera preset request (person / top / iso / reset) — animated. */
  viewRequest?: CameraViewRequest | null;
}

export default function StudioScene(props: StudioSceneProps) {
  const segments = useMemo(
    () => getWallSegments(props.layout, props.walls),
    [props.layout, props.walls]
  );
  const bounds = useMemo(() => getFloorBounds(segments), [segments]);
  const camPos: [number, number, number] = [
    ((bounds.minX + bounds.maxX) / 2) * CM - 1.2,
    1.65,
    (bounds.maxY * CM) + 2.2,
  ];

  return (
    <Canvas
      shadows
      camera={{ position: camPos, fov: 55, near: 0.05, far: 60 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      data-testid="canvas-studio-3d"
    >
      <SceneContents {...props} />
    </Canvas>
  );
}
