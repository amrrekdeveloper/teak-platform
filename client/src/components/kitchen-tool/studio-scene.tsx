import { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, useTexture } from "@react-three/drei";
import {
  type KitchenLayout,
  type KitchenWall,
  type KitchenOpening,
  type KitchenUtility,
} from "@/components/kitchen-tool/store";
import {
  getWallSegments,
  getFloorBounds,
  type WallSegment,
} from "@/components/kitchen-tool/plan-svg";

/* ── Constants (meters unless noted) ─────────────────────── */
const WALL_T = 0.12;
const DOOR_HEIGHT_CM = 210;
const WINDOW_SILL_CM = 90;
const WINDOW_HEIGHT_CM = 120;
const CM = 1 / 100;

const ASSETS = "/kitchen-tool-assets";
const HDR_URL = `${ASSETS}/hdri/relax_inn_seaview_suite_2k.hdr`;
const CABINET_URL = `${ASSETS}/cabinet-lower-standard.glb`;

const FLOOR_TEX = {
  map: `${ASSETS}/floor/textures/laminate_floor_02_diff_2k.jpg`,
  normalMap: `${ASSETS}/floor/textures/laminate_floor_02_nor_gl_2k.jpg`,
  roughnessMap: `${ASSETS}/floor/textures/laminate_floor_02_rough_2k.jpg`,
};
const WALL_TEX = {
  map: `${ASSETS}/wall/textures/painted_plaster_wall_diff_2k.jpg`,
  normalMap: `${ASSETS}/wall/textures/painted_plaster_wall_nor_gl_2k.jpg`,
  armMap: `${ASSETS}/wall/textures/painted_plaster_wall_arm_2k.jpg`,
};
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

function WallPieceMesh({
  seg,
  piece,
  textures,
}: {
  seg: WallSegment;
  piece: WallPiece;
  textures: { map: THREE.Texture; normalMap: THREE.Texture; armMap: THREE.Texture };
}) {
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

  const mats = useMemo(() => {
    const map = prepTexture(textures.map, w, h, true);
    const normalMap = prepTexture(textures.normalMap, w, h, false);
    const arm = prepTexture(textures.armMap, w, h, false);
    return { map, normalMap, arm };
  }, [textures, w, h]);

  return (
    <mesh position={position} rotation={[0, theta, 0]} castShadow receiveShadow>
      <boxGeometry args={[w, h, WALL_T]} />
      <meshStandardMaterial
        map={mats.map}
        normalMap={mats.normalMap}
        aoMap={mats.arm}
        roughnessMap={mats.arm}
        metalnessMap={mats.arm}
        color="#f5f2ec"
      />
    </mesh>
  );
}

function Walls({
  segments,
  ceilingM,
  openings,
  textures,
}: {
  segments: WallSegment[];
  ceilingM: number;
  openings: KitchenOpening[];
  textures: { map: THREE.Texture; normalMap: THREE.Texture; armMap: THREE.Texture };
}) {
  return (
    <>
      {segments.map((seg) => {
        const pieces = wallPieces(
          seg.length * CM,
          ceilingM,
          openings.filter((o) => o.wallId === seg.id)
        );
        return pieces.map((p, i) => (
          <WallPieceMesh key={`${seg.id}-${i}`} seg={seg} piece={p} textures={textures} />
        ));
      })}
    </>
  );
}

/* ── Floor & ceiling ─────────────────────────────────────── */
function Floor({
  bounds,
  textures,
}: {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  textures: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };
}) {
  const w = (bounds.maxX - bounds.minX) * CM;
  const d = (bounds.maxY - bounds.minY) * CM;
  const cx = ((bounds.minX + bounds.maxX) / 2) * CM;
  const cz = ((bounds.minY + bounds.maxY) / 2) * CM;

  const mats = useMemo(
    () => ({
      map: prepTexture(textures.map, w, d, true),
      normalMap: prepTexture(textures.normalMap, w, d, false),
      roughnessMap: prepTexture(textures.roughnessMap, w, d, false),
    }),
    [textures, w, d]
  );

  return (
    <mesh position={[cx, 0, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial
        map={mats.map}
        normalMap={mats.normalMap}
        roughnessMap={mats.roughnessMap}
      />
    </mesh>
  );
}

function Ceiling({
  bounds,
  ceilingM,
}: {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  ceilingM: number;
}) {
  const w = (bounds.maxX - bounds.minX) * CM;
  const d = (bounds.maxY - bounds.minY) * CM;
  const cx = ((bounds.minX + bounds.maxX) / 2) * CM;
  const cz = ((bounds.minY + bounds.maxY) / 2) * CM;
  return (
    <mesh position={[cx, ceilingM, cz]} rotation={[Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color="#fbfaf7" side={THREE.FrontSide} />
    </mesh>
  );
}

/* ── Cabinet GLB (0.9m tall, on floor against a wall) ────── */
function Cabinet({ segments }: { segments: WallSegment[] }) {
  const { scene } = useGLTF(CABINET_URL);

  const { object, position } = useMemo(() => {
    const obj = scene.clone(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = size.y > 0 ? 0.9 / size.y : 1;
    obj.scale.setScalar(scale);
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Face the cabinet front (assumed +Z in the GLB) toward the room interior
    const seg = segments[0];
    const { origin, dir, out, lengthM } = segVectors(seg);
    const inward = out.clone().negate();
    obj.rotation.y = Math.atan2(inward.x, inward.z);
    obj.updateMatrixWorld(true);

    // Measure AFTER scale + rotation, then anchor against the wall, on the floor
    const sBox = new THREE.Box3().setFromObject(obj);
    const sSize = new THREE.Vector3();
    const sCenter = new THREE.Vector3();
    sBox.getSize(sSize);
    sBox.getCenter(sCenter);

    const anchor = origin.clone().addScaledVector(dir, lengthM / 2);
    const depth = Math.max(Math.abs(sSize.x * inward.x) + Math.abs(sSize.z * inward.z), 0.3);
    anchor.addScaledVector(inward, depth / 2 + 0.005);

    const pos = new THREE.Vector3(
      anchor.x - sCenter.x,
      -sBox.min.y,
      anchor.z - sCenter.z
    );
    return { object: obj, position: pos };
  }, [scene, segments]);

  return (
    <group position={position}>
      <primitive object={object} />
    </group>
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

/* ── Scene contents (inside Suspense) ────────────────────── */
function SceneContents({
  layout,
  walls,
  ceilingHeight,
  openings,
  utilities,
}: StudioSceneProps) {
  const segments = useMemo(() => getWallSegments(layout, walls), [layout, walls]);
  const bounds = useMemo(() => getFloorBounds(segments), [segments]);
  const ceilingM = ceilingHeight * CM;

  const floorTex = useTexture(FLOOR_TEX);
  const wallTexRaw = useTexture({
    map: WALL_TEX.map,
    normalMap: WALL_TEX.normalMap,
    armMap: WALL_TEX.armMap,
  });

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
      <color attach="background" args={["#efece7"]} />
      <Environment files={HDR_URL} />
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

      <Floor bounds={bounds} textures={floorTex as any} />
      <Ceiling bounds={bounds} ceilingM={ceilingM} />
      <Walls
        segments={segments}
        ceilingM={ceilingM}
        openings={openings}
        textures={wallTexRaw as any}
      />
      <Cabinet segments={segments} />
      <UtilityMarkers utilities={utilities} segments={segments} />

      <OrbitControls
        target={[center.x, 1, center.z]}
        maxPolarAngle={Math.PI / 2 - 0.06}
        minDistance={0.9}
        maxDistance={Math.max(roomSpan * 2.4, 7)}
        enableDamping
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

useGLTF.preload(CABINET_URL);
