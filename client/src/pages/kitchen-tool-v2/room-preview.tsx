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
const WALL_PAINT = { color: "#f2ede4", roughness: 0.88 };
/** Ceiling: flat gypsum board — slightly cleaner/brighter than the walls. */
const CEILING_PAINT = { color: "#fafaf7", roughness: 0.93 };

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
    // Approved default: clean modern greige porcelain, 600×600 mm tiles,
    // narrow grout close to the tile color (2×2 grid ⇒ 1200 mm repeat).
    id: "floor_beige_porcelain_600",
    nameAr: "بورسلان بيج فاتح 60×60",
    nameEn: "Light beige porcelain 60×60",
    urls: {
      map: "/textures/v2/porcelain600_color.webp",
      normalMap: "/textures/v2/porcelain600_normal.webp",
      roughnessMap: "/textures/v2/porcelain600_rough.webp",
    },
    physMmX: 1200,
    physMmY: 1200,
    skirtingColor: "#d9d1c3",
    skirtingRoughness: 0.55,
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
  };
}

/** Approved wall: clean matte "Teak Warm White" paint, no color texture. */
function WallMesh({ wall, allWalls }: { wall: RoomWallV2; allWalls: RoomWallV2[] }) {
  const tr = wallBodyTransform(wall, allWalls);
  return (
    <group position={tr.position} rotation={[0, tr.rotationY, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={tr.size} />
        <meshStandardMaterial color={WALL_PAINT.color} roughness={WALL_PAINT.roughness} metalness={0} envMapIntensity={0.45} />
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
        envMapIntensity={0.5}
      />
    </mesh>
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
function RecessedDownlight({ x, z, ceilingY, withLight }: { x: number; z: number; ceilingY: number; withLight: boolean }) {
  // Target is LOCAL to the fixture group (which already sits at [x, ceilingY, z]),
  // so a straight-down aim is simply the floor point directly below: [0, -ceilingY, 0].
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, -ceilingY, 0);
    return o;
  }, [ceilingY]);
  return (
    <group position={[x, ceilingY, z]}>
      {/* trim rim flush with the ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <ringGeometry args={[DOWNLIGHT_RADIUS, DOWNLIGHT_RADIUS + 0.008, 28]} />
        <meshStandardMaterial color="#e9e7e2" roughness={0.4} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>
      {/* shallow dark recessed cavity */}
      <mesh position={[0, -DOWNLIGHT_DEPTH / 2, 0]}>
        <cylinderGeometry args={[DOWNLIGHT_RADIUS, DOWNLIGHT_RADIUS, DOWNLIGHT_DEPTH, 28, 1, true]} />
        <meshStandardMaterial color="#242424" roughness={0.9} metalness={0} side={THREE.BackSide} />
      </mesh>
      {/* recessed diffuser lens (restrained emissive — no glowing disc) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -DOWNLIGHT_DEPTH + 0.008, 0]}>
        <circleGeometry args={[DOWNLIGHT_RADIUS * 0.72, 24]} />
        <meshStandardMaterial color="#f5f2ea" emissive="#f3e9d8" emissiveIntensity={0.85} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      {withLight && (
        <>
          <spotLight
            position={[0, -DOWNLIGHT_DEPTH, 0]}
            target={target}
            angle={0.62}
            penumbra={0.85}
            intensity={4.5}
            distance={ceilingY * 2.4}
            decay={1.8}
            color="#fff2e0"
          />
          <primitive object={target} />
        </>
      )}
    </group>
  );
}

/** Evenly spaced downlights from room size (4 for the reference room). */
function downlightLayout(room: RoomV2): [number, number][] {
  const b = roomBounds(room);
  const minX = b.minX * MM, maxX = b.maxX * MM, minZ = b.minZ * MM, maxZ = b.maxZ * MM;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const nx = Math.min(3, Math.max(1, Math.round(w / 2.1)));
  const nz = Math.min(2, Math.max(1, Math.round(d / 2.1)));
  const pts: [number, number][] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      pts.push([minX + (w * (i + 0.5)) / nx, minZ + (d * (j + 0.5)) / nz]);
    }
  }
  return pts.slice(0, 6);
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
        <meshStandardMaterial color={CEILING_PAINT.color} roughness={CEILING_PAINT.roughness} metalness={0} side={THREE.DoubleSide} envMapIntensity={0.35} />
      </mesh>
      {lights.map(([x, z], i) => (
        // Real spotlights capped at 4 for performance; extra fixtures are trim-only.
        <RecessedDownlight key={i} x={x} z={z} ceilingY={h} withLight={i < 4} />
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
        <Environment files="/textures/v2/lebombo_1k.hdr" background={false} environmentIntensity={0.7} />
      </Suspense>
      <hemisphereLight args={["#ffffff", "#d6d0c6", 0.32]} />
      <directionalLight
        position={[cx + span * 0.9, h * 2.2, cz + span * 1.4]}
        intensity={0.4}
        color="#fffaf2"
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
  const floor = findFloor(s.floorMaterialId);

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

      {/* Floor selector only — wall finish is locked to "Teak Warm White". */}
      <div className="border-t px-4 py-3 flex flex-wrap items-center gap-3 shrink-0">
        <p className="text-xs font-bold">{t("الأرضية:", "Floor:")}</p>
        <div className="flex flex-wrap gap-2">
          {PHOTO_FLOORS.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={floor.id === f.id ? "default" : "outline"}
              onClick={() => s.setFloorMaterial(f.id)}
              data-testid={`button-v2-floormat-${f.id}`}
            >
              {t(f.nameAr, f.nameEn)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground ms-auto">
          {t("الجدران: أبيض تيك الدافئ (معتمد)", "Walls: Teak Warm White (approved)")}
        </p>
      </div>
    </div>
  );
}
