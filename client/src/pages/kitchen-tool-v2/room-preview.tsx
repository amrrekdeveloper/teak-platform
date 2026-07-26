/**
 * Kitchen Designer V2 — Approved empty-room visual baseline (Task V2-001E).
 * Route: /kitchen-designer-v2/room-preview
 * Renders ONLY from RoomV2 (never from V1 answers/state).
 *
 * Locked product decisions:
 * - Photoreal rendering is the ONLY rendering mode (no A/B switch).
 * - Ceiling: always a flat, clean-white gypsum board (auto-hidden in top
 *   view only). No gypsum tray preset, no ceiling toggle.
 * - Wall finish is locked to one approved paint: "Teak Warm White"
 *   (visual naming reference: Al-Jazeera Paints white/off-white family,
 *   e.g. Off White WH-2105 — not an exact digital swatch match).
 * - View controls: two compact buttons only (Perspective / Top).
 *
 * Visual-only elements (skirting, ceiling, downlights, wall thickness)
 * never alter the canonical RoomV2 geometry used by the design engine.
 */
import { useMemo, useEffect, Suspense } from "react";
import { Link } from "wouter";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, PerspectiveCamera, Environment, useTexture } from "@react-three/drei";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertTriangle, Eye, LayoutGrid } from "lucide-react";
import { useKitchenToolV2Store } from "@/components/kitchen-tool-v2/store";
import { type RoomV2, type RoomWallV2, roomBounds } from "@/components/kitchen-tool-v2/room-model";
import { V2Gate } from "@/components/kitchen-tool-v2/v2-gate";

const MM = 0.001; // mm → meters
const WALL_THICKNESS_MM = 150;
const SKIRTING_HEIGHT_MM = 100;
const SKIRTING_DEPTH_MM = 15;

const FLOOR_NORMAL_SCALE = new THREE.Vector2(0.45, 0.45);

/* --------------------- approved materials ------------------------- */

/**
 * Approved wall paint — "Teak Warm White" / "أبيض تيك الدافئ".
 * Clean warm white, matte, visually smooth; no color texture (the previous
 * PaintedPlaster017 treatment produced visible stains and was removed).
 */
const WALL_PAINT = { color: "#f1ece2", roughness: 0.9 };
/** Ceiling: flat gypsum board — slightly cleaner/brighter than the walls. */
const CEILING_PAINT = { color: "#fbfaf8", roughness: 0.93 };

/**
 * Floor registry — real/derived CC0 PBR sets served locally (no runtime
 * network requests). Sources in client/public/textures/v2/LICENSES.md.
 * Ids intentionally reuse the original registry ids so persisted drafts
 * keep working without migration.
 */
interface FloorDefV2E {
  id: string;
  nameAr: string;
  nameEn: string;
  urls: { map: string; normalMap: string; roughnessMap: string };
  /** Physical size of one texture repeat, mm. */
  physMmX: number;
  physMmY: number;
  /** Matching skirting color derived from the floor tone. */
  skirtingColor: string;
  skirtingRoughness: number;
}

const PHOTO_FLOORS: FloorDefV2E[] = [
  {
    // Approved default (reference-image match): large-format sandy beige
    // porcelain, 1000×1000 mm, near-uniform tone, hairline grout close to
    // the tile color. Id kept for persisted-draft compatibility.
    id: "floor_beige_porcelain_600",
    nameAr: "بورسلان رملي فاتح 100×100",
    nameEn: "Light sand porcelain 100×100",
    urls: {
      map: "/textures/v2/sand1000_color.webp",
      normalMap: "/textures/v2/sand1000_normal.webp",
      roughnessMap: "/textures/v2/sand1000_rough.webp",
    },
    physMmX: 1000,
    physMmY: 1000,
    skirtingColor: "#cfc0a4",
    skirtingRoughness: 0.6,
  },
  {
    // Optional light-oak test floor.
    id: "floor_light_oak_plank",
    nameAr: "باركيه بلوط فاتح (تجريبي)",
    nameEn: "Light oak (test)",
    urls: {
      map: "/textures/v2/oak051_color.webp",
      normalMap: "/textures/v2/oak051_normal.webp",
      roughnessMap: "/textures/v2/oak051_rough.webp",
    },
    physMmX: 1800,
    physMmY: 1800,
    // Oak has no porcelain match → approved fallback: simple clean white.
    skirtingColor: "#f4f2ee",
    skirtingRoughness: 0.6,
  },
];

function findFloor(id: string): FloorDefV2E {
  return PHOTO_FLOORS.find((f) => f.id === id) ?? PHOTO_FLOORS[0];
}

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
      // Human eye-level interior perspective, framed slightly off-axis like
      // an interior visualization (not a frontal CAD box view).
      const eyeY = 1.55;
      const dist = Math.max(spanZ * 1.0, span * 0.72) + 1.1;
      camera.position.set(cx + spanX * 0.16, eyeY, b.maxZ * MM + (dist - spanZ) * 0.5);
      camera.up.set(0, 1, 0);
      if (controls) controls.target.set(cx - spanX * 0.08, h * 0.42, b.minZ * MM + spanZ * 0.35);
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
  };
}

/** Approved wall: clean matte "Teak Warm White" paint, no color texture. */
function WallMesh({ wall, allWalls }: { wall: RoomWallV2; allWalls: RoomWallV2[] }) {
  const tr = wallBodyTransform(wall, allWalls);
  return (
    <group position={tr.position} rotation={[0, tr.rotationY, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={tr.size} />
        {/* envMapIntensity kept very low: the warm interior HDR was tinting
            walls beige depending on orientation (the "beige right wall"). */}
        <meshStandardMaterial color={WALL_PAINT.color} roughness={WALL_PAINT.roughness} metalness={0} envMapIntensity={0.15} />
      </mesh>
    </group>
  );
}

/** Visual-only skirting; tone derived from the selected floor. */
function Skirting({ wall, floor }: { wall: RoomWallV2; floor: FloorDefV2E }) {
  const cx = (wall.start.xMm + wall.end.xMm) / 2;
  const cz = (wall.start.zMm + wall.end.zMm) / 2;
  const angle = Math.atan2(wall.end.zMm - wall.start.zMm, wall.end.xMm - wall.start.xMm);
  const ox = wall.inwardNormal.xMm * (SKIRTING_DEPTH_MM / 2);
  const oz = wall.inwardNormal.zMm * (SKIRTING_DEPTH_MM / 2);
  return (
    <group position={[(cx + ox) * MM, (SKIRTING_HEIGHT_MM / 2) * MM, (cz + oz) * MM]} rotation={[0, -angle, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[wall.lengthMm * MM, SKIRTING_HEIGHT_MM * MM, SKIRTING_DEPTH_MM * MM]} />
        <meshStandardMaterial color={floor.skirtingColor} roughness={floor.skirtingRoughness} metalness={0} />
      </mesh>
    </group>
  );
}

/**
 * Floor: real PBR maps. shapeGeometry UVs are in WORLD METERS, so the repeat
 * is 1 / physical-span-in-meters — tiles stay exactly 600×600 mm.
 */
function FloorMesh({ room, floor }: { room: RoomV2; floor: FloorDefV2E }) {
  const maps = usePbrMaps(floor.urls, 1 / (floor.physMmX * MM), 1 / (floor.physMmY * MM));
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
        normalScale={FLOOR_NORMAL_SCALE}
        roughnessMap={maps.roughnessMap}
        roughness={1}
        metalness={0}
        envMapIntensity={0.3}
      />
    </mesh>
  );
}

/* ---------------------- approximate corner AO ----------------------- */

/**
 * Shared edge-vignette texture: transparent center, subtly dark edges.
 * Overlaid on walls / floor / ceiling it approximates the soft corner
 * ambient occlusion that makes the reference render feel like a real
 * interior rather than a flat 3D box. Purely visual — no geometry impact.
 */
function useEdgeVignetteTexture(edgeAlpha: number) {
  const tex = useMemo(() => {
    const size = 256;
    const edge = Math.round(size * 0.16);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);
    const dirs: [number, number, number, number][] = [
      [0, 0, 0, edge], // top
      [0, size, 0, size - edge], // bottom
      [0, 0, edge, 0], // left
      [size, 0, size - edge, 0], // right
    ];
    for (const [x0, y0, x1, y1] of dirs) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(30,26,20,${edgeAlpha})`);
      g.addColorStop(1, "rgba(30,26,20,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [edgeAlpha]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Transparent AO overlays hugging the interior faces of the room shell. */
function CornerAO({ room }: { room: RoomV2 }) {
  const tex = useEdgeVignetteTexture(0.34);
  const b = roomBounds(room);
  const w = (b.maxX - b.minX) * MM;
  const d = (b.maxZ - b.minZ) * MM;
  const cx = ((b.minX + b.maxX) / 2) * MM;
  const cz = ((b.minZ + b.maxZ) / 2) * MM;
  const h = room.ceilingHeightMm * MM;
  const GAP = 0.003; // 3 mm inside the surface to avoid z-fighting
  const mat = (
    <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
  );
  return (
    <group>
      {/* walls */}
      {room.walls.map((wl) => {
        const mx = ((wl.start.xMm + wl.end.xMm) / 2 + wl.inwardNormal.xMm * GAP * 1000) * MM;
        const mz = ((wl.start.zMm + wl.end.zMm) / 2 + wl.inwardNormal.zMm * GAP * 1000) * MM;
        // Rotate plane's +Z normal to the wall's inward normal.
        const yaw = Math.atan2(wl.inwardNormal.xMm, wl.inwardNormal.zMm);
        return (
          <mesh key={`ao-${wl.id}`} position={[mx, (wl.heightMm / 2) * MM, mz]} rotation={[0, yaw, 0]}>
            <planeGeometry args={[wl.lengthMm * MM, wl.heightMm * MM]} />
            {mat}
          </mesh>
        );
      })}
      {/* floor */}
      <mesh position={[cx, GAP, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        {mat}
      </mesh>
      {/* ceiling */}
      <mesh position={[cx, h - GAP, cz]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        {mat}
      </mesh>
    </group>
  );
}

/* ---------------------- recessed downlights ------------------------ */

const DOWNLIGHT_RADIUS = 0.045; // 90 mm diameter — physically plausible
const DOWNLIGHT_DEPTH = 0.03; // shallow 30 mm recess

/**
 * Reusable architectural recessed downlight: circular trim rim, shallow dark
 * inner cavity, recessed diffuser lens, and (optionally) a soft neutral-warm
 * downward spotlight (~3500–4000K look).
 */
function RecessedDownlight({
  x,
  z,
  ceilingY,
  withLight,
  aimX = 0,
  aimZ = 0,
}: {
  x: number;
  z: number;
  ceilingY: number;
  withLight: boolean;
  /** Local lateral aim offset (m) — tilts the beam toward the nearby wall so it leaves a soft wall-washing scallop. */
  aimX?: number;
  aimZ?: number;
}) {
  // Target is LOCAL to the fixture group (which already sits at [x, ceilingY, z]).
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(aimX, -ceilingY, aimZ);
    return o;
  }, [ceilingY, aimX, aimZ]);
  return (
    <group position={[x, ceilingY, z]}>
      {/* wide WHITE trim rim flush with the ceiling (reads as a real fixture) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.0015, 0]}>
        <ringGeometry args={[DOWNLIGHT_RADIUS * 0.82, DOWNLIGHT_RADIUS + 0.014, 32]} />
        <meshStandardMaterial color="#fafaf8" roughness={0.35} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      {/* shallow LIGHT-GRAY recessed cavity — no harsh dark hole */}
      <mesh position={[0, -DOWNLIGHT_DEPTH / 2, 0]}>
        <cylinderGeometry args={[DOWNLIGHT_RADIUS * 0.82, DOWNLIGHT_RADIUS * 0.82, DOWNLIGHT_DEPTH, 32, 1, true]} />
        <meshStandardMaterial color="#b9b6b0" roughness={0.7} metalness={0} side={THREE.BackSide} />
      </mesh>
      {/* diffuser lens just inside the opening — softly lit, no bloom */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -DOWNLIGHT_DEPTH * 0.45, 0]}>
        <circleGeometry args={[DOWNLIGHT_RADIUS * 0.78, 28]} />
        <meshStandardMaterial color="#fdf9f0" emissive="#f6ecd9" emissiveIntensity={1.5} roughness={0.5} side={THREE.DoubleSide} toneMapped />
      </mesh>
      {withLight && (
        <>
          <spotLight
            position={[0, -DOWNLIGHT_DEPTH, 0]}
            target={target}
            angle={0.55}
            penumbra={0.55}
            intensity={7}
            distance={ceilingY * 3}
            decay={1.6}
            color="#fff3e2"
          />
          <primitive object={target} />
        </>
      )}
    </group>
  );
}

interface DownlightPoint {
  x: number;
  z: number;
  /** Local aim offset toward the washed wall (m). */
  aimX: number;
  aimZ: number;
}

/** Distance from wall interior face to the perimeter downlight row (mm). */
const DOWNLIGHT_WALL_OFFSET_MM = 600;
/** Target spacing between downlights along a wall (mm). */
const DOWNLIGHT_SPACING_MM = 1500;

/**
 * Reference-image layout: perimeter rows of downlights parallel to each
 * wall (~600 mm out), tilted slightly toward the wall so each fixture
 * leaves a soft wall-washing scallop — the key realism cue in the
 * approved reference render.
 */
function downlightLayout(room: RoomV2): DownlightPoint[] {
  const pts: DownlightPoint[] = [];
  for (const wallDef of room.walls) {
    const dx = wallDef.end.xMm - wallDef.start.xMm;
    const dz = wallDef.end.zMm - wallDef.start.zMm;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const inx = wallDef.inwardNormal.xMm;
    const inz = wallDef.inwardNormal.zMm;
    const usable = len - 2 * DOWNLIGHT_WALL_OFFSET_MM;
    const n = Math.min(4, Math.max(2, Math.round(usable / DOWNLIGHT_SPACING_MM)));
    for (let i = 0; i < n; i++) {
      const along = DOWNLIGHT_WALL_OFFSET_MM + (usable * (i + 0.5)) / n;
      const x = (wallDef.start.xMm + ux * along + inx * DOWNLIGHT_WALL_OFFSET_MM) * MM;
      const z = (wallDef.start.zMm + uz * along + inz * DOWNLIGHT_WALL_OFFSET_MM) * MM;
      // Aim ~350 mm back toward the wall so the cone grazes it (scallop).
      pts.push({ x, z, aimX: -inx * 0.35, aimZ: -inz * 0.35 });
    }
  }
  // Deduplicate fixtures that ended up close together at corners.
  const dedup: DownlightPoint[] = [];
  for (const p of pts) {
    if (!dedup.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.7)) dedup.push(p);
  }
  return dedup.slice(0, 12);
}

/** Always-on flat gypsum-board ceiling: clean white, matte, continuous. */
function Ceiling({ room }: { room: RoomV2 }) {
  const b = roomBounds(room);
  const w = (b.maxX - b.minX) * MM;
  const d = (b.maxZ - b.minZ) * MM;
  const cx = ((b.minX + b.maxX) / 2) * MM;
  const cz = ((b.minZ + b.maxZ) / 2) * MM;
  const h = room.ceilingHeightMm * MM;
  const lights = downlightLayout(room);
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, h, cz]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={CEILING_PAINT.color} roughness={CEILING_PAINT.roughness} metalness={0} side={THREE.DoubleSide} envMapIntensity={0.1} />
      </mesh>
      {lights.map((p, i) => (
        // Real spotlights capped at 8 (no shadow-casting) for performance;
        // any extra fixtures beyond that are trim-only.
        <RecessedDownlight key={i} x={p.x} z={p.z} aimX={p.aimX} aimZ={p.aimZ} ceilingY={h} withLight={i < 8} />
      ))}
    </group>
  );
}

/* ---------------------------- scene -------------------------------- */

function RoomScene({ room, floor, mode }: { room: RoomV2; floor: FloorDefV2E; mode: "perspective" | "top" }) {
  const b = roomBounds(room);
  const cx = ((b.minX + b.maxX) / 2) * MM;
  const cz = ((b.minZ + b.maxZ) / 2) * MM;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * MM;
  const h = room.ceilingHeightMm * MM;

  return (
    <group>
      {/*
       * Neutral-warm architectural lighting: IBL from a local interior HDR
       * (reflections + diffuse fill, background hidden) + neutral hemisphere
       * + one very soft near-neutral key. No stacked warm sources, no harsh
       * directional shadow.
       */}
      <Suspense fallback={null}>
        <Environment files="/textures/v2/lebombo_1k.hdr" background={false} environmentIntensity={0.45} />
      </Suspense>
      {/* Neutral hemisphere (no warm ground bounce → no beige cast on walls). */}
      <hemisphereLight args={["#ffffff", "#e8e4dd", 0.38]} />
      {/* Kept soft/low: the perimeter downlight scallops carry the scene. */}
      <directionalLight
        position={[cx + span * 0.9, h * 2.2, cz + span * 1.4]}
        intensity={0.3}
        color="#ffffff"
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

      <Suspense fallback={null}>
        <FloorMesh room={room} floor={floor} />
      </Suspense>
      {room.walls.map((w) => (
        <WallMesh key={w.id} wall={w} allWalls={room.walls} />
      ))}
      {room.walls.map((w) => (
        <Skirting key={`sk-${w.id}`} wall={w} floor={floor} />
      ))}
      {/* Ceiling is part of the room; hidden only when technically necessary (top view). */}
      {mode !== "top" && <Ceiling room={room} />}
      {/* Approximate corner ambient occlusion (visual only). */}
      {mode !== "top" && <CornerAO room={room} />}
    </group>
  );
}

/* ----------------------------- page -------------------------------- */

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
  // V2-001F: floor is locked to the single approved porcelain. The oak set
  // remains as a hidden internal option (findFloor) but is not exposed in UI.
  const floor = PHOTO_FLOORS[0];

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
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={s.cameraMode === "perspective" ? "default" : "outline"}
            className="gap-1.5"
            onClick={() => s.setCameraMode("perspective")}
            data-testid="button-v2-view-perspective"
          >
            <Eye className="w-3.5 h-3.5" />
            {t("منظور", "Perspective")}
          </Button>
          <Button
            size="sm"
            variant={s.cameraMode === "top" ? "default" : "outline"}
            className="gap-1.5"
            onClick={() => s.setCameraMode("top")}
            data-testid="button-v2-view-top"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            {t("علوي", "Top view")}
          </Button>
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
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        >
          <CameraRig room={room} mode={s.cameraMode} />
          <OrbitControls
            makeDefault
            enableRotate={s.cameraMode !== "top"}
            maxPolarAngle={Math.PI * 0.52}
            minDistance={0.6}
            maxDistance={30}
          />
          <color attach="background" args={["#e9e6e0"]} />
          <fog attach="fog" args={["#e9e6e0", 18, 55]} />
          <RoomScene room={room} floor={floor} mode={s.cameraMode} />
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

      {/* Minimal footer — finishes are locked (walls: Teak Warm White, floor: approved porcelain). */}
      <div className="border-t px-4 py-2 flex items-center justify-between gap-3 shrink-0 text-xs text-muted-foreground">
        <span>{t("الأرضية: بورسلان رملي فاتح 100×100 (معتمد)", "Floor: light sand porcelain 100×100 (approved)")}</span>
        <span>{t("الجدران: أبيض تيك الدافئ (معتمد)", "Walls: Teak Warm White (approved)")}</span>
      </div>
    </div>
  );
}
