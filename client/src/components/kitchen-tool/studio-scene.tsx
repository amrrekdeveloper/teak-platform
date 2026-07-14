import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, useTexture, Html } from "@react-three/drei";
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
  CABINET_DEFS,
  findCabinetDef,
  junctionOfPlaced,
  getJunctions,
  blockedIntervals,
  resolveDragOffset,
  type CabinetDef,
} from "@/components/kitchen-tool/cabinets";
import type { ThreeEvent } from "@react-three/fiber";
import type { PlacedCabinetState } from "@/components/kitchen-tool/store";
import {
  findFloorOption,
  findWallOption,
  findEnvironmentOption,
  type MaterialOption,
} from "@/components/kitchen-tool/materials";
import { useKitchenToolStore } from "@/components/kitchen-tool/store";

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
  const sill = WINDOW_SILL_CM * CM;
  const winTop = Math.min((WINDOW_SILL_CM + WINDOW_HEIGHT_CM) * CM, ceilingM - 0.1);

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
      <SurfaceMaterial key={option.id} opt={option} repeatX={w} repeatY={h} />
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
      <SurfaceMaterial key={option.id} opt={option} repeatX={w} repeatY={d} />
    </mesh>
  );
}

/** Two-tier gypsum cove ceiling (Gulf style): lowered perimeter border +
 *  recessed pocket + inset main ceiling, always in plaster. */
const COVE_W = 0.25;
const COVE_DROP = 0.12;
const COVE_T = 0.03;

function Ceiling({
  bounds,
  ceilingM,
  segments,
}: {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  ceilingM: number;
  segments: WallSegment[];
}) {
  const plaster = useMemo(() => findWallOption("plaster"), []);

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
  const { origin, dir, theta, lengthM } = useMemo(() => segVectors(seg), [seg]);
  const inward = useMemo(() => inwardOf(seg), [seg]);
  // Only extend past an end if another wall actually meets it there
  // (fills the corner miter); open ends stay flush with the wall.
  const { extStart, extEnd } = useMemo(() => {
    const jns = getJunctions(segments);
    const has = (end: "start" | "end") =>
      jns.some(
        (jn) =>
          (jn.aId === seg.id && jn.aEnd === end) ||
          (jn.bId === seg.id && jn.bEnd === end)
      );
    return {
      extStart: has("start") ? COVE_W : 0,
      extEnd: has("end") ? COVE_W : 0,
    };
  }, [segments, seg.id]);
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
    </>
  );
}

/* ── Placed cabinets (catalog items on walls) ────────────── */
function inwardOf(seg: WallSegment): THREE.Vector3 {
  return new THREE.Vector3(-seg.nx, 0, -seg.ny);
}

function PlacedCabinetMesh({
  placed,
  def,
  segments,
  selected,
  onGrab,
}: {
  placed: PlacedCabinetState;
  def: CabinetDef;
  segments: WallSegment[];
  selected: boolean;
  onGrab: (id: string, def: CabinetDef) => void;
}) {
  const { scene } = useGLTF(def.url);
  const seg = segments.find((s) => s.id === placed.wallId);

  // Clone + recenter once per model — NOT on every drag move.
  const object = useMemo(() => {
    const obj = scene.clone(true);
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    // Recenter: bottom-center of the bounding box at the local origin
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    obj.position.set(-center.x, -box.min.y, -center.z);
    return obj;
  }, [scene]);

  const built = useMemo(() => {
    if (!seg) return null;
    const { origin, dir } = segVectors(seg);
    const inward = inwardOf(seg);
    let rotY = Math.atan2(inward.x, inward.z) + (def.rotYFix ?? 0);
    let pos: THREE.Vector3 | null = null;

    if (def.corner) {
      const jn = junctionOfPlaced(placed, def, segments);
      if (jn) {
        const segA = segments.find((s) => s.id === jn.aId)!;
        const segB = segments.find((s) => s.id === jn.bId)!;
        const inA = inwardOf(segA);
        const inB = inwardOf(segB);
        const diag = inA.clone().add(inB);
        // Model's default front diagonal faces (-X, +Z)
        rotY = Math.atan2(diag.x, diag.z) + Math.PI / 4 + (def.rotYFix ?? 0);
        pos = new THREE.Vector3(jn.x * CM, 0, jn.y * CM)
          .addScaledVector(inA, def.width / 2 + 0.005)
          .addScaledVector(inB, def.width / 2 + 0.005);
      }
    }
    if (!pos) {
      pos = origin
        .clone()
        .addScaledVector(dir, placed.offset + def.width / 2)
        .addScaledVector(inward, def.depth / 2 + 0.005);
    }
    pos.y = def.mountY;
    return { pos, rotY };
  }, [seg, placed, def, segments]);

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
      <primitive object={object} />
      {selected && (
        <mesh position={[0, def.height / 2, 0]}>
          <boxGeometry args={[def.width + 0.05, def.height + 0.05, def.depth + 0.05]} />
          <meshBasicMaterial color="#d92626" transparent opacity={0.16} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function PlacedCabinets({
  segments,
  selectedId,
  onGrab,
}: {
  segments: WallSegment[];
  selectedId: string | null;
  onGrab: (id: string, def: CabinetDef) => void;
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

/* ── Scene contents (inside Suspense) ────────────────────── */
function SceneContents({
  layout,
  walls,
  ceilingHeight,
  openings,
  utilities,
  selectedCabinetId = null,
  onSelectCabinet,
}: StudioSceneProps) {
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
    const intervals = blockedIntervals(
      wallId,
      def.level,
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
    if (!drag) return;
    const up = () => {
      setDrag(null);
      setDragInfo(null);
      if (controlsRef.current) controlsRef.current.enabled = true;
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag]);

  const handleGrab = (id: string, def: CabinetDef) => {
    onSelectCabinet?.(id);
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
      def.level,
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

  return (
    <>
      <Environment files={envOption.file} background blur={0.7} />
      <directionalLight
        position={[center.x + roomSpan * 0.9, ceilingM + 2.6, center.z + roomSpan * 1.2]}
        intensity={1.35}
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
      <ambientLight intensity={0.12} />

      <Suspense fallback={null}>
        <Floor
          bounds={bounds}
          option={floorOption}
          onPointerDown={handleFloorDown}
        />
      </Suspense>

      {/* Invisible drag plane at the grabbed cabinet's height — captures
          pointer movement anywhere on screen, independent of the floor. */}
      {drag && (
        <mesh
          position={[center.x, drag.def.mountY, center.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerMove={handleDragMove}
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
        />
      </Suspense>
      <UtilityMarkers utilities={utilities} segments={segments} />

      {drag && dragInfo && <DragMeasurements info={dragInfo} segments={segments} />}

      <OrbitControls
        ref={controlsRef}
        target={[center.x, 1, center.z]}
        maxPolarAngle={Math.PI / 2 - 0.06}
        minDistance={0.9}
        maxDistance={Math.max(roomSpan * 2.4, 7)}
        enableDamping
        enabled={!drag}
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

for (const def of CABINET_DEFS) {
  useGLTF.preload(def.url);
}
