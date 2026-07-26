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
import { Canvas, useThree, useFrame } from "@react-three/fiber";
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
    nameAr: "بورسلان رملي 80×80",
    nameEn: "Sand porcelain 80×80",
    urls: {
      // Real Poly Haven "Interior Tiles" (CC0), straightened to an
      // orthogonal 2×2 grid — clear grout joints like the reference.
      map: "/textures/v2/tiles800_color.webp",
      normalMap: "/textures/v2/tiles800_normal.webp",
      roughnessMap: "/textures/v2/tiles800_rough.webp",
    },
    // The texture spans 2×2 tiles of 800 mm each.
    physMmX: 1600,
    physMmY: 1600,
    skirtingColor: "#c9bda7",
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

/**
 * Hard camera clamp for perspective mode: the eye can never rise above the
 * ceiling (no more looking down into the fixture cavities) nor sink below
 * the floor. Runs every frame after OrbitControls updates.
 */
function CameraClamp({ room, mode }: { room: RoomV2; mode: "perspective" | "top" }) {
  const h = room.ceilingHeightMm * MM;
  useFrame(({ camera }) => {
    if (mode !== "perspective") return;
    const maxY = h - 0.12;
    const minY = 0.35;
    if (camera.position.y > maxY) camera.position.y = maxY;
    if (camera.position.y < minY) camera.position.y = minY;
  });
  return null;
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
        // Slight warm tint pulls the neutral tile scan toward the sandy
        // reference tone without hiding the grout lines.
        color="#f6ecd9"
        envMapIntensity={0.4}
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

/** Transparent AO overlay for the floor edges (walls/ceiling carry their own baked shading). */
function FloorEdgeAO({ room }: { room: RoomV2 }) {
  const tex = useEdgeVignetteTexture(0.22);
  const b = roomBounds(room);
  const w = (b.maxX - b.minX) * MM;
  const d = (b.maxZ - b.minZ) * MM;
  const cx = ((b.minX + b.maxX) / 2) * MM;
  const cz = ((b.minZ + b.maxZ) / 2) * MM;
  return (
    <mesh position={[cx, 0.002, cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  );
}

/* ---------------------- baked wall lightmaps ------------------------ */

/**
 * The core of the reference-image match. Real-time WebGL cannot reproduce
 * the global-illumination softness of the approved AI render, so instead we
 * BAKE the lighting into a per-wall canvas texture generated from the exact
 * wall dimensions the customer enters:
 *  - warm-white base with a gentle vertical gradient,
 *  - ceiling-hugging light scallops directly above each downlight position,
 *  - soft corner shading at both wall ends,
 *  - subtle contact shadow at the ceiling line and near the skirting.
 * The baked plane is UNLIT (meshBasicMaterial) so every wall reads as the
 * same warm tone regardless of orientation — no gray-vs-white walls.
 */
const PX_PER_M = 150;

function drawScallop(ctx: CanvasRenderingContext2D, xPx: number, hPx: number) {
  // Ellipse of light attached to the ceiling line, fading downward.
  const rx = 0.62 * PX_PER_M;
  const ry = 1.05 * PX_PER_M;
  ctx.save();
  ctx.translate(xPx, 0);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, "rgba(255,252,244,0.85)");
  g.addColorStop(0.45, "rgba(255,250,240,0.42)");
  g.addColorStop(1, "rgba(255,250,240,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-rx, 0, rx * 2, Math.min(hPx, ry * 1.15));
  ctx.restore();
}

function useWallBakeTexture(lengthMm: number, heightMm: number, lightsAlongMm: number[]) {
  const key = lightsAlongMm.join(",");
  // Real plaster micro-texture (Poly Haven "Beige Wall 001", CC0) blended
  // into the bake so walls read as painted plaster, not flat vector fill.
  const plaster = useTexture("/textures/v2/plaster_detail.webp");
  const tex = useMemo(() => {
    const lenM = lengthMm * MM;
    const hM = heightMm * MM;
    const W = Math.min(2048, Math.max(256, Math.round(lenM * PX_PER_M)));
    const H = Math.min(1024, Math.max(256, Math.round(hM * PX_PER_M)));
    const sx = W / (lenM * PX_PER_M); // compensation if clamped
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // 1) Base: warm greige, deliberately BELOW white so ACES tonemapping
    // cannot clip it — the scallops must stay clearly brighter than the base.
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, "#e1d6c2");
    base.addColorStop(0.55, "#d9cdb7");
    base.addColorStop(1, "#d2c5ad");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    // 1b) Tile the real plaster grain over the base (subtle overlay).
    const img = plaster.image as CanvasImageSource | undefined;
    if (img) {
      const pat = ctx.createPattern(img, "repeat");
      if (pat) {
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.globalCompositeOperation = "overlay";
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    // 2) Broad soft spill across the upper wall (light from the downlight row).
    const spill = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    spill.addColorStop(0, "rgba(255,250,240,0.26)");
    spill.addColorStop(1, "rgba(255,250,240,0)");
    ctx.fillStyle = spill;
    ctx.fillRect(0, 0, W, H * 0.55);

    // 3) Ceiling-hugging scallops above each downlight of this wall.
    // Independent X/Y compensation for canvas clamping so scallop shape
    // stays physically correct on very short or very long walls.
    const sy = H / (hM * PX_PER_M);
    ctx.save();
    ctx.scale(sx, sy);
    for (const along of lightsAlongMm) drawScallop(ctx, along * MM * PX_PER_M, hM * PX_PER_M);
    ctx.restore();

    // 4) Corner shading at both wall ends (soft GI-style occlusion).
    const cw = Math.min(W * 0.18, 0.6 * PX_PER_M * sx);
    const left = ctx.createLinearGradient(0, 0, cw, 0);
    left.addColorStop(0, "rgba(78,68,54,0.20)");
    left.addColorStop(1, "rgba(78,68,54,0)");
    ctx.fillStyle = left;
    ctx.fillRect(0, 0, cw, H);
    const right = ctx.createLinearGradient(W, 0, W - cw, 0);
    right.addColorStop(0, "rgba(78,68,54,0.20)");
    right.addColorStop(1, "rgba(78,68,54,0)");
    ctx.fillStyle = right;
    ctx.fillRect(W - cw, 0, cw, H);

    // 5) Thin contact shadow at the ceiling junction + near the skirting.
    const top = ctx.createLinearGradient(0, 0, 0, H * 0.03);
    top.addColorStop(0, "rgba(70,62,50,0.16)");
    top.addColorStop(1, "rgba(70,62,50,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, H * 0.03);
    const bottom = ctx.createLinearGradient(0, H, 0, H - H * 0.05);
    bottom.addColorStop(0, "rgba(70,62,50,0.10)");
    bottom.addColorStop(1, "rgba(70,62,50,0)");
    ctx.fillStyle = bottom;
    ctx.fillRect(0, H - H * 0.05, W, H * 0.05);

    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, heightMm, key, plaster]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Opaque baked interior face of one wall — this IS the visible wall surface. */
function BakedWallFace({ wall, lightsAlongMm }: { wall: RoomWallV2; lightsAlongMm: number[] }) {
  const tex = useWallBakeTexture(wall.lengthMm, wall.heightMm, lightsAlongMm);
  const GAP_MM = 2; // sit 2 mm inside the box face to avoid z-fighting
  const mx = ((wall.start.xMm + wall.end.xMm) / 2 + wall.inwardNormal.xMm * GAP_MM) * MM;
  const mz = ((wall.start.zMm + wall.end.zMm) / 2 + wall.inwardNormal.zMm * GAP_MM) * MM;
  const yaw = Math.atan2(wall.inwardNormal.xMm, wall.inwardNormal.zMm);
  // planeGeometry U runs along local +X = (cos yaw, 0, -sin yaw). If that
  // direction opposes the wall's start→end direction, flip the texture so
  // scallop positions match the physical downlight positions.
  const ux = Math.cos(yaw);
  const uz = -Math.sin(yaw);
  const wx = wall.end.xMm - wall.start.xMm;
  const wz = wall.end.zMm - wall.start.zMm;
  const flipped = ux * wx + uz * wz < 0;
  useEffect(() => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = flipped ? -1 : 1;
    tex.needsUpdate = true;
  }, [tex, flipped]);
  return (
    <mesh position={[mx, (wall.heightMm / 2) * MM, mz]} rotation={[0, yaw, 0]}>
      <planeGeometry args={[wall.lengthMm * MM, wall.heightMm * MM]} />
      <meshBasicMaterial map={tex} toneMapped />
    </mesh>
  );
}

/* ---------------------- baked floor light pools --------------------- */

/** Soft brighter pools on the floor under each downlight (baked, additive-free). */
function FloorLightPools({ room, lights }: { room: RoomV2; lights: DownlightPoint[] }) {
  const b = roomBounds(room);
  const w = (b.maxX - b.minX) * MM;
  const d = (b.maxZ - b.minZ) * MM;
  const cx = ((b.minX + b.maxX) / 2) * MM;
  const cz = ((b.minZ + b.maxZ) / 2) * MM;
  const key = lights.map((l) => `${l.x.toFixed(2)},${l.z.toFixed(2)}`).join(";");
  const tex = useMemo(() => {
    const W = 512;
    const H = Math.max(64, Math.round((512 * d) / Math.max(w, 0.01)));
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    for (const l of lights) {
      const px = ((l.x - b.minX * MM) / w) * W;
      const py = ((l.z - b.minZ * MM) / d) * H;
      const r = (0.85 / w) * W;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, "rgba(255,249,235,0.20)");
      g.addColorStop(0.6, "rgba(255,249,235,0.08)");
      g.addColorStop(1, "rgba(255,249,235,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, w, d]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[cx, 0.0015, cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

/* ---------------------- recessed downlights ------------------------ */

const DOWNLIGHT_RADIUS = 0.045; // 90 mm diameter — physically plausible
const DOWNLIGHT_DEPTH = 0.055; // real 55 mm gypsum recess depth

/**
 * TRULY recessed downlight: the ceiling has a real circular cutout (see
 * Ceiling below), and this fixture places the cavity ABOVE the ceiling
 * plane — trim ring flush with the gypsum, diffuser lens deep inside.
 * No protruding cylinder under the ceiling anymore.
 */
function RecessedDownlight({ x, z, ceilingY }: { x: number; z: number; ceilingY: number }) {
  return (
    <group position={[x, ceilingY, z]}>
      {/* thin trim ring flush with the gypsum surface */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <ringGeometry args={[DOWNLIGHT_RADIUS * 0.86, DOWNLIGHT_RADIUS + 0.011, 40]} />
        <meshStandardMaterial color="#f2f0ec" roughness={0.4} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      {/* cavity wall INSIDE the ceiling thickness (visible through the cutout) */}
      <mesh position={[0, DOWNLIGHT_DEPTH / 2, 0]}>
        <cylinderGeometry args={[DOWNLIGHT_RADIUS, DOWNLIGHT_RADIUS, DOWNLIGHT_DEPTH, 40, 1, true]} />
        <meshStandardMaterial color="#c9c5be" roughness={0.75} metalness={0} side={THREE.BackSide} />
      </mesh>
      {/* glowing diffuser lens recessed at the top of the cavity */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, DOWNLIGHT_DEPTH * 0.8, 0]}>
        <circleGeometry args={[DOWNLIGHT_RADIUS * 0.92, 36]} />
        <meshStandardMaterial color="#fdf9f0" emissive="#ffedcf" emissiveIntensity={2.2} roughness={0.5} side={THREE.DoubleSide} toneMapped />
      </mesh>
      {/* opaque cap sealing the cavity from above — the fixture housing is
          never visible even if the camera somehow ends up above the ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, DOWNLIGHT_DEPTH + 0.001, 0]}>
        <circleGeometry args={[DOWNLIGHT_RADIUS + 0.012, 36]} />
        <meshStandardMaterial color="#c9c5be" roughness={0.8} metalness={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

interface DownlightPoint {
  x: number;
  z: number;
  wallId: string;
  /** Distance along the wall from its start, mm. */
  alongMm: number;
}

/** Distance from wall interior face to the perimeter downlight row (mm). */
const DOWNLIGHT_WALL_OFFSET_MM = 600;
/** Target spacing between downlights along a wall (mm). */
const DOWNLIGHT_SPACING_MM = 1500;

/**
 * Reference-image layout: perimeter rows of downlights parallel to each
 * wall (~600 mm out). Fixture positions drive BOTH the 3D fixtures and
 * the baked wall scallops, so they always line up for any dimensions.
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
      pts.push({ x, z, wallId: wallDef.id, alongMm: along });
    }
  }
  // Deduplicate fixtures that ended up close together at corners.
  const dedup: DownlightPoint[] = [];
  for (const p of pts) {
    if (!dedup.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.7)) dedup.push(p);
  }
  return dedup.slice(0, 16);
}

/** Shared soft radial glow decal texture (warm light halo on the gypsum). */
function useGlowTexture() {
  const tex = useMemo(() => {
    const S = 128;
    const canvas = document.createElement("canvas");
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(255,241,214,0.55)");
    g.addColorStop(0.4, "rgba(255,244,222,0.22)");
    g.addColorStop(1, "rgba(255,244,222,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/**
 * Flat gypsum-board ceiling with REAL circular cutouts at each downlight
 * (shapeGeometry holes) so fixtures are genuinely recessed. Unlit material
 * keeps it uniformly clean-white like the reference; a soft baked glow
 * decal surrounds each fixture; edges get the shared vignette AO.
 */
function Ceiling({ room, lights }: { room: RoomV2; lights: DownlightPoint[] }) {
  const b = roomBounds(room);
  const w = (b.maxX - b.minX) * MM;
  const d = (b.maxZ - b.minZ) * MM;
  const cx = ((b.minX + b.maxX) / 2) * MM;
  const cz = ((b.minZ + b.maxZ) / 2) * MM;
  const h = room.ceilingHeightMm * MM;
  const glow = useGlowTexture();
  const aoTex = useEdgeVignetteTexture(0.16);
  const key = lights.map((l) => `${l.x.toFixed(2)},${l.z.toFixed(2)}`).join(";");
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    room.floor.polygon.forEach((p, i) => {
      if (i === 0) s.moveTo(p.xMm * MM, p.zMm * MM);
      else s.lineTo(p.xMm * MM, p.zMm * MM);
    });
    s.closePath();
    for (const l of lights) {
      const holePath = new THREE.Path();
      holePath.absarc(l.x, l.z, DOWNLIGHT_RADIUS, 0, Math.PI * 2, true);
      s.holes.push(holePath);
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, key]);
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, h, 0]}>
        <shapeGeometry args={[shape, 24]} />
        <meshBasicMaterial color={CEILING_PAINT.color} side={THREE.DoubleSide} />
      </mesh>
      {/* warm glow halo baked around each fixture */}
      {lights.map((p, i) => (
        <mesh key={`glow-${i}`} rotation={[Math.PI / 2, 0, 0]} position={[p.x, h - 0.002, p.z]}>
          <planeGeometry args={[0.55, 0.55]} />
          <meshBasicMaterial map={glow} transparent depthWrite={false} />
        </mesh>
      ))}
      {/* soft edge shading so the ceiling doesn't read as a flat white card */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, h - 0.003, cz]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial map={aoTex} transparent depthWrite={false} />
      </mesh>
      {lights.map((p, i) => (
        <RecessedDownlight key={i} x={p.x} z={p.z} ceilingY={h} />
      ))}
    </group>
  );
}

/* ---------------------------- scene -------------------------------- */

function RoomScene({ room, floor, mode }: { room: RoomV2; floor: FloorDefV2E; mode: "perspective" | "top" }) {
  const lights = useMemo(() => downlightLayout(room), [room]);

  return (
    <group>
      {/*
       * BAKED-LIGHTING pipeline (reference-image match): walls and ceiling
       * are unlit surfaces carrying pre-drawn light scallops / glows / AO.
       * Real lights only serve the PBR floor, skirting and fixture trims —
       * so every wall reads the same warm tone from any angle, like the
       * approved AI render.
       */}
      <Suspense fallback={null}>
        <Environment files="/textures/v2/lebombo_1k.hdr" background={false} environmentIntensity={0.5} />
      </Suspense>
      <hemisphereLight args={["#fffdf8", "#eae5db", 0.85]} />

      <Suspense fallback={null}>
        <FloorMesh room={room} floor={floor} />
      </Suspense>
      <FloorLightPools room={room} lights={lights} />
      <FloorEdgeAO room={room} />
      {room.walls.map((w) => (
        <WallMesh key={w.id} wall={w} allWalls={room.walls} />
      ))}
      <Suspense fallback={null}>
        {room.walls.map((w) => (
          <BakedWallFace key={`bw-${w.id}`} wall={w} lightsAlongMm={lights.filter((l) => l.wallId === w.id).map((l) => l.alongMm)} />
        ))}
      </Suspense>
      {room.walls.map((w) => (
        <Skirting key={`sk-${w.id}`} wall={w} floor={floor} />
      ))}
      {/* Ceiling is part of the room; hidden only when technically necessary (top view). */}
      {mode !== "top" && <Ceiling room={room} lights={lights} />}
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
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95 }}
        >
          <CameraRig room={room} mode={s.cameraMode} />
          <CameraClamp room={room} mode={s.cameraMode} />
          <OrbitControls
            makeDefault
            enableRotate={s.cameraMode !== "top"}
            minPolarAngle={s.cameraMode === "top" ? 0 : Math.PI * 0.3}
            maxPolarAngle={Math.PI * 0.52}
            minDistance={0.6}
            maxDistance={s.cameraMode === "top" ? 30 : 12}
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
        <span>{t("الأرضية: بورسلان رملي 80×80 (معتمد)", "Floor: sand porcelain 80×80 (approved)")}</span>
        <span>{t("الجدران: أبيض تيك الدافئ (معتمد)", "Walls: Teak Warm White (approved)")}</span>
      </div>
    </div>
  );
}
