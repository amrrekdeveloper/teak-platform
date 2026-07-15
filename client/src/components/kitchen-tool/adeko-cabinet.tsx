/**
 * Parametric, realistic 3D cabinet built from a real Adeko catalog product.
 * No GLB — geometry is generated from the product's real dimensions (W×H×D)
 * and its classified kind (base/wall/tall, doors/drawers/glass/open/filler).
 *
 * Local coordinates: origin at bottom-center of the footprint, front face
 * toward +Z (matches how GLTF cabinets are placed by the scene).
 *
 * Customization (per placed instance):
 * - finish: factory wood type mapped to a wood-texture or flat painted look
 * - topFinish: countertop material (base units only)
 * - handle: bar handle (black/white/gray) or none (push-to-open)
 * - doors open/close on click with a smooth 90° swing revealing the interior
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import type { CabinetDef, AdekoKind } from "@/components/kitchen-tool/cabinets";
import {
  DEFAULT_ADEKO_FINISH,
  DEFAULT_ADEKO_TOP_FINISH,
  ADEKO_HANDLE_COLORS,
  type AdekoFinish,
  type AdekoTopFinish,
  type AdekoHandleStyle,
  type AdekoHandleColor,
} from "@/components/kitchen-tool/materials";

const ASSETS = "/kitchen-tool-assets";

const WOOD_MAPS = {
  map: `${ASSETS}/countertop/textures/oak_veneer_01_diff_2k.jpg`,
  armMap: `${ASSETS}/countertop/textures/oak_veneer_01_arm_2k.jpg`,
};

/* Construction constants (m) — Saudi/Gulf standard cabinet build. */
const KICK_H = 0.1; // kickplate height
const KICK_REC = 0.055; // kickplate recess from the front
const TOP_T = 0.03; // countertop thickness
const TOP_OVER = 0.025; // countertop front overhang
const DOOR_T = 0.019; // door slab thickness
const GAP = 0.003; // reveal gap around doors
const STILE_W = 0.068; // shaker frame stile/rail width
const PANEL_REC = 0.007; // center panel recess depth
const PANEL_T = 0.018; // carcass panel thickness
/** Door swing animation: lerp rate constant (~250ms settle). */
const DOOR_LERP_RATE = 10;
const DOOR_OPEN_ANGLE = (95 * Math.PI) / 180;

const DEFAULT_KIND: AdekoKind = {
  place: "base",
  doors: 1,
  drawers: 0,
  topDrawer: false,
  glass: false,
  open: false,
  filler: false,
};

function prepWood(src: THREE.Texture, repX: number, repY: number, rot = 0) {
  const t = src.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.rotation = rot;
  t.center.set(0.5, 0.5);
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export interface AdekoCabinetOptions {
  finish?: AdekoFinish;
  topFinish?: AdekoTopFinish;
  handleStyle?: AdekoHandleStyle;
  handleColor?: AdekoHandleColor;
  /** Door opening: hinge side for single-door units, or "top" = lift-up (wall units). */
  doorHinge?: "left" | "right" | "top";
}

/** One door on a hinge pivot — animates open/close on click. */
function AdekoDoor({
  x,
  hingeLeft,
  topHinge,
  dw,
  dh,
  doorY,
  doorZ,
  doorMat,
  panelMat,
  handleMat,
  showHandle,
  open,
  onToggle,
}: {
  x: number;
  hingeLeft: boolean;
  /** Lift-up door: hinge at the top edge, opens upward (wall units). */
  topHinge?: boolean;
  dw: number;
  dh: number;
  doorY: number;
  doorZ: number;
  doorMat: THREE.Material;
  panelMat: THREE.Material;
  handleMat: THREE.Material;
  showHandle: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const pivotRef = useRef<THREE.Group>(null);
  const hingeX = topHinge ? x : hingeLeft ? x - dw / 2 : x + dw / 2;
  const hingeY = topHinge ? doorY + dh / 2 : doorY;
  const contentX = topHinge ? 0 : hingeLeft ? dw / 2 : -dw / 2;
  const contentY = topHinge ? -dh / 2 : 0;
  // Left-hinged door swings free edge toward +Z ⇒ negative Y rotation.
  // Lift-up door rotates about X at its top edge ⇒ negative X rotation opens up/out.
  const target = open
    ? topHinge
      ? -DOOR_OPEN_ANGLE
      : hingeLeft
        ? -DOOR_OPEN_ANGLE
        : DOOR_OPEN_ANGLE
    : 0;

  useFrame((_, delta) => {
    const g = pivotRef.current;
    if (!g) return;
    const alpha = 1 - Math.exp(-DOOR_LERP_RATE * Math.min(delta, 0.1));
    const axis = topHinge ? "x" : "y";
    g.rotation[axis] += (target - g.rotation[axis]) * alpha;
    if (Math.abs(target - g.rotation[axis]) < 0.002) g.rotation[axis] = target;
  });

  // Narrow/short doors degrade the shaker frame gracefully.
  const stile = Math.min(STILE_W, dw / 3.2, dh / 3.2);
  const railW = Math.max(dw - 2 * stile, 0.02);
  const panelW = Math.max(dw - 2 * stile + 0.02, 0.03);
  const panelH = Math.max(dh - 2 * stile + 0.02, 0.03);
  // Relative to the inner content group (already offset by contentX):
  // near the opening edge, 5cm from the door edge.
  const handleX = topHinge ? 0 : hingeLeft ? dw / 2 - 0.05 : -dw / 2 + 0.05;
  const handleLen = Math.min(0.16, (topHinge ? dw : dh) * 0.4);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Ignore drags — only a real click toggles the door.
    if (e.delta > 4) return;
    onToggle();
  };

  return (
    <group ref={pivotRef} position={[hingeX, hingeY, doorZ]} onClick={handleClick}>
      <group position={[contentX, contentY, 0]}>
        {/* Stiles (full height, left + right) */}
        <mesh position={[-dw / 2 + stile / 2, 0, 0]} material={doorMat} castShadow>
          <boxGeometry args={[stile, dh, DOOR_T]} />
        </mesh>
        <mesh position={[dw / 2 - stile / 2, 0, 0]} material={doorMat} castShadow>
          <boxGeometry args={[stile, dh, DOOR_T]} />
        </mesh>
        {/* Rails (top + bottom, between stiles) */}
        <mesh position={[0, dh / 2 - stile / 2, 0]} material={doorMat} castShadow>
          <boxGeometry args={[railW, stile, DOOR_T]} />
        </mesh>
        <mesh position={[0, -dh / 2 + stile / 2, 0]} material={doorMat} castShadow>
          <boxGeometry args={[railW, stile, DOOR_T]} />
        </mesh>
        {/* Recessed center panel (wood or glass) */}
        <mesh position={[0, 0, -PANEL_REC]} material={panelMat}>
          <boxGeometry args={[panelW, panelH, DOOR_T - PANEL_REC]} />
        </mesh>
        {/* Bar handle — vertical near the opening edge, or horizontal at the
            bottom edge for lift-up doors */}
        {showHandle && (
          <group
            position={[handleX, topHinge ? -dh / 2 + 0.05 : dh / 2 - 0.14, DOOR_T / 2 + 0.02]}
            rotation={topHinge ? [0, 0, Math.PI / 2] : [0, 0, 0]}
          >
            <mesh material={handleMat} castShadow>
              <cylinderGeometry args={[0.006, 0.006, handleLen, 12]} />
            </mesh>
            <mesh
              position={[0, handleLen * 0.375, -0.012]}
              rotation={[Math.PI / 2, 0, 0]}
              material={handleMat}
            >
              <cylinderGeometry args={[0.004, 0.004, 0.024, 8]} />
            </mesh>
            <mesh
              position={[0, -handleLen * 0.375, -0.012]}
              rotation={[Math.PI / 2, 0, 0]}
              material={handleMat}
            >
              <cylinderGeometry args={[0.004, 0.004, 0.024, 8]} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
}

/** Static drawer face — shaker-lite slab with a horizontal bar handle. */
function AdekoDrawerFace({
  y,
  h,
  W,
  doorZ,
  doorMat,
  handleMat,
  showHandle,
}: {
  y: number;
  h: number;
  W: number;
  doorZ: number;
  doorMat: THREE.Material;
  handleMat: THREE.Material;
  showHandle: boolean;
}) {
  const fw = W - 2 * GAP;
  const handleLen = Math.min(0.16, fw * 0.4);
  return (
    <group position={[0, y, doorZ]}>
      <mesh material={doorMat} castShadow>
        <boxGeometry args={[fw, h, DOOR_T]} />
      </mesh>
      {showHandle && (
        <group position={[0, h / 2 - 0.04, DOOR_T / 2 + 0.02]} rotation={[0, 0, Math.PI / 2]}>
          <mesh material={handleMat} castShadow>
            <cylinderGeometry args={[0.006, 0.006, handleLen, 12]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Shared material set for parametric Adeko cabinets (straight + corner). */
function useAdekoMaterials(
  W: number,
  finish: AdekoFinish,
  topFinish: AdekoTopFinish,
  handleColorHex: string
) {
  const wood = useTexture(WOOD_MAPS);
  const stone = useTexture({ map: topFinish.map, armMap: topFinish.armMap });

  const mats = useMemo(() => {
    const clones: THREE.Texture[] = [];
    const mkWood = (
      repX: number,
      repY: number,
      rot: number,
      extra?: Partial<THREE.MeshStandardMaterialParameters>
    ) => {
      const map = prepWood(wood.map, repX, repY, rot);
      const arm = prepWood(wood.armMap, repX, repY, rot);
      clones.push(map, arm);
      return new THREE.MeshStandardMaterial({
        map,
        aoMap: arm,
        roughnessMap: arm,
        metalnessMap: arm,
        roughness: 1,
        metalness: 1,
        ...extra,
      });
    };
    const mkFlat = (color: string, mul = 1) =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).multiplyScalar(mul),
        roughness: finish.roughness ?? 0.5,
      });

    // Doors/panels/carcass follow the chosen finish (wood texture or flat).
    const doorMat = finish.wood
      ? mkWood(W * 1.6, 1.1, Math.PI / 2, { color: new THREE.Color(finish.tint) })
      : mkFlat(finish.tint);
    const panelMat = finish.wood
      ? mkWood(W * 1.1, 0.8, Math.PI / 2, {
          color: new THREE.Color(finish.tint).multiplyScalar(1.04),
        })
      : mkFlat(finish.tint, 1.04);
    const carcassMat = finish.wood
      ? mkWood(W * 1.2, 1.0, 0, {
          color: new THREE.Color(finish.tint).multiplyScalar(0.96),
        })
      : mkFlat(finish.tint, 0.96);
    // Interior always a light melamine look — reads clearly when open.
    const interiorMat = new THREE.MeshStandardMaterial({
      color: "#efe9dd",
      roughness: 0.75,
    });
    // Glass center panels for glass-door units.
    const glassMat = new THREE.MeshStandardMaterial({
      color: "#cfe4e8",
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    });

    const stMap = prepWood(stone.map, W * 0.9, 0.6);
    const stArm = prepWood(stone.armMap, W * 0.9, 0.6);
    clones.push(stMap, stArm);
    const stoneMat = new THREE.MeshStandardMaterial({
      map: stMap,
      aoMap: stArm,
      roughnessMap: stArm,
      metalnessMap: stArm,
      roughness: 1,
      metalness: 1,
      ...(topFinish.tint ? { color: new THREE.Color(topFinish.tint) } : {}),
    });
    const kickMat = new THREE.MeshStandardMaterial({ color: "#2d2d30", roughness: 0.55 });
    const metalMat = new THREE.MeshStandardMaterial({
      color: handleColorHex,
      metalness: handleColorHex === ADEKO_HANDLE_COLORS.gray ? 0.92 : 0.35,
      roughness: handleColorHex === ADEKO_HANDLE_COLORS.gray ? 0.22 : 0.45,
    });
    return {
      doorMat,
      carcassMat,
      interiorMat,
      stoneMat,
      kickMat,
      panelMat,
      glassMat,
      metalMat,
      clones,
    };
  }, [wood.map, wood.armMap, stone.map, stone.armMap, W, finish, topFinish, handleColorHex]);

  // Dispose cloned textures + materials on unmount (see r3f texture memory).
  useEffect(() => {
    const { clones, ...materials } = mats;
    return () => {
      clones.forEach((t) => t.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [mats]);

  return mats;
}

export default function AdekoBaseCabinet({
  def,
  options,
}: {
  def: CabinetDef;
  options?: AdekoCabinetOptions;
}) {
  const W = def.width;
  const H = def.height;
  const D = def.depth;
  const kind = def.adeko?.kind ?? def.parametricKind ?? DEFAULT_KIND;

  const finish = options?.finish ?? DEFAULT_ADEKO_FINISH;
  const topFinish = options?.topFinish ?? DEFAULT_ADEKO_TOP_FINISH;
  const handleStyle = options?.handleStyle ?? "bar";
  const handleColorHex = ADEKO_HANDLE_COLORS[options?.handleColor ?? "gray"];

  const [openDoors, setOpenDoors] = useState<boolean[]>([]);

  const { doorMat, carcassMat, interiorMat, stoneMat, kickMat, panelMat, glassMat, metalMat } =
    useAdekoMaterials(W, finish, topFinish, handleColorHex);

  const built = useMemo(() => {
    const isBase = kind.place === "base";
    const isWall = kind.place === "wall";
    const hasKick = !isWall;
    const hasTop = isBase && !kind.filler;

    const kickH = hasKick ? KICK_H : 0;
    const carcassTop = hasTop ? H - TOP_T : H;
    const bodyH = carcassTop - kickH;

    // Front rows: an optional top drawer band, then a door/drawer field.
    const topDrawerH = kind.topDrawer ? Math.min(0.25, bodyH * 0.28) : 0;
    const fieldH = bodyH - topDrawerH;

    // Tall units split doors into a lower + upper row (larder look).
    const tallSplit = kind.place === "tall" && kind.doors > 0 && fieldH > 1.5;
    const lowerH = tallSplit ? fieldH * 0.62 : fieldH;
    const upperH = tallSplit ? fieldH - lowerH : 0;

    const doorCount = kind.doors > 0 ? kind.doors : 0;
    const dw = doorCount > 0 ? (W - GAP * (doorCount + 1)) / doorCount : 0;

    const rows: Array<{ y: number; dh: number }> = [];
    if (doorCount > 0) {
      rows.push({ y: kickH + GAP + (lowerH - 2 * GAP) / 2, dh: lowerH - 2 * GAP });
      if (tallSplit) {
        rows.push({
          y: kickH + lowerH + GAP + (upperH - 2 * GAP) / 2,
          dh: upperH - 2 * GAP,
        });
      }
    }

    // Drawer stack faces (fill the whole field evenly).
    const drawerFaces: Array<{ y: number; h: number }> = [];
    if (kind.drawers > 0) {
      const n = kind.drawers;
      const each = (fieldH - GAP * (n + 1)) / n;
      for (let i = 0; i < n; i++) {
        drawerFaces.push({ y: kickH + GAP + each / 2 + i * (each + GAP), h: each });
      }
    }
    if (kind.topDrawer && topDrawerH > 0) {
      drawerFaces.push({
        y: kickH + fieldH + GAP + (topDrawerH - 2 * GAP) / 2,
        h: topDrawerH - 2 * GAP,
      });
    }

    const doorZ = D / 2 - DOOR_T / 2;
    const doors: Array<{ x: number; hingeLeft: boolean; row: number }> = [];
    for (let r = 0; r < rows.length; r++) {
      for (let i = 0; i < doorCount; i++) {
        const x = -W / 2 + GAP + dw / 2 + i * (dw + GAP);
        doors.push({ x, hingeLeft: doorCount === 2 ? i === 0 : true, row: r });
      }
    }

    // Interior shelves: base 1, wall/tall by height.
    const shelfCount = kind.filler
      ? 0
      : Math.max(1, Math.min(5, Math.round(bodyH / 0.45) - 1));

    return {
      hasKick,
      hasTop,
      kickH,
      carcassTop,
      bodyH,
      dw,
      doorZ,
      rows,
      doors,
      drawerFaces,
      shelfCount,
    };
  }, [W, H, D, kind]);

  const { hasKick, hasTop, kickH, carcassTop, bodyH, dw, doorZ, rows, doors, drawerFaces, shelfCount } =
    built;

  /* Interior box (visible when a door is open): sides, back, bottom, top, shelves. */
  const innerBackZ = -D / 2 + PANEL_T / 2 + 0.004;
  const innerDepth = D - DOOR_T - PANEL_T - 0.01; // from back panel to behind doors
  const innerZ = -D / 2 + PANEL_T + 0.004 + innerDepth / 2;
  const innerW = W - 2 * PANEL_T;
  const innerH = bodyH - 2 * PANEL_T;

  /* Fillers are just a finished slab — nothing else. */
  if (kind.filler) {
    return (
      <group>
        <mesh position={[0, H / 2, 0]} material={doorMat} castShadow receiveShadow>
          <boxGeometry args={[W, H, D]} />
        </mesh>
      </group>
    );
  }

  const showFronts = doors.length > 0 || drawerFaces.length > 0;

  return (
    <group>
      {/* Kickplate (recessed, dark) — floor-standing units only */}
      {hasKick && (
        <mesh
          position={[0, KICK_H / 2, D / 2 - KICK_REC - 0.01]}
          material={kickMat}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[W - 0.02, KICK_H, 0.02]} />
        </mesh>
      )}

      {/* Carcass shell — sides, back, bottom, top (open toward the front) */}
      <mesh
        position={[-W / 2 + PANEL_T / 2, kickH + bodyH / 2, innerZ]}
        material={carcassMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[PANEL_T, bodyH, innerDepth + PANEL_T]} />
      </mesh>
      <mesh
        position={[W / 2 - PANEL_T / 2, kickH + bodyH / 2, innerZ]}
        material={carcassMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[PANEL_T, bodyH, innerDepth + PANEL_T]} />
      </mesh>
      <mesh position={[0, kickH + bodyH / 2, innerBackZ]} material={interiorMat} receiveShadow>
        <boxGeometry args={[innerW, bodyH, PANEL_T]} />
      </mesh>
      <mesh position={[0, kickH + PANEL_T / 2, innerZ]} material={interiorMat} receiveShadow>
        <boxGeometry args={[innerW, PANEL_T, innerDepth + PANEL_T]} />
      </mesh>
      <mesh
        position={[0, kickH + bodyH - PANEL_T / 2, innerZ]}
        material={interiorMat}
        receiveShadow
      >
        <boxGeometry args={[innerW, PANEL_T, innerDepth + PANEL_T]} />
      </mesh>
      {/* Interior shelves (evenly spaced) */}
      {Array.from({ length: shelfCount }, (_, i) => {
        const y = kickH + PANEL_T + ((i + 1) * innerH) / (shelfCount + 1);
        return (
          <mesh
            key={`shelf-${i}`}
            position={[0, y, innerZ]}
            material={interiorMat}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[innerW, PANEL_T, innerDepth - 0.02]} />
          </mesh>
        );
      })}

      {/* Countertop (stone, front overhang) — base units only */}
      {hasTop && (
        <mesh
          position={[0, carcassTop + TOP_T / 2, TOP_OVER / 2]}
          material={stoneMat}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[W, TOP_T, D + TOP_OVER]} />
        </mesh>
      )}

      {/* Open units: light face frame instead of fronts */}
      {!showFronts && (
        <>
          <mesh
            position={[-W / 2 + PANEL_T / 2, kickH + bodyH / 2, doorZ]}
            material={carcassMat}
            castShadow
          >
            <boxGeometry args={[PANEL_T, bodyH, DOOR_T]} />
          </mesh>
          <mesh
            position={[W / 2 - PANEL_T / 2, kickH + bodyH / 2, doorZ]}
            material={carcassMat}
            castShadow
          >
            <boxGeometry args={[PANEL_T, bodyH, DOOR_T]} />
          </mesh>
        </>
      )}

      {/* Shaker doors — click to open/close (90° swing from the hinge) */}
      {doors.map((d, i) => (
        <AdekoDoor
          key={`door-${i}`}
          x={d.x}
          topHinge={options?.doorHinge === "top" && kind.place === "wall"}
          hingeLeft={
            kind.doors === 1
              ? (options?.doorHinge ?? "left") !== "right"
              : d.hingeLeft
          }
          dw={dw}
          dh={rows[d.row].dh}
          doorY={rows[d.row].y}
          doorZ={doorZ}
          doorMat={doorMat}
          panelMat={kind.glass ? glassMat : panelMat}
          handleMat={metalMat}
          showHandle={handleStyle !== "none"}
          open={openDoors[i] ?? false}
          onToggle={() =>
            setOpenDoors((prev) => {
              const next = [...prev];
              next[i] = !(next[i] ?? false);
              return next;
            })
          }
        />
      ))}

      {/* Drawer faces (static) */}
      {drawerFaces.map((f, i) => (
        <AdekoDrawerFace
          key={`drawer-${i}`}
          y={f.y}
          h={f.h}
          W={W}
          doorZ={doorZ}
          doorMat={doorMat}
          handleMat={metalMat}
          showHandle={handleStyle !== "none"}
        />
      ))}
    </group>
  );
}

/**
 * True L-shaped corner cabinet (e.g. Adeko "Corner unit 90X90").
 *
 * Local frame: origin at the wall junction (corner point), floor level.
 * Arm A runs along +X (against the wall at z=0), arm B along +Z (against the
 * wall at x=0). Both arms are `def.width` long and `armDepth` deep, leaving an
 * L footprint with a notch at the inner front corner. Each notch face gets a
 * clickable shaker door hinged at its outer edge (swings away from the corner).
 */
export function AdekoCornerCabinet({
  def,
  options,
  swapArms,
}: {
  def: CabinetDef;
  options?: AdekoCabinetOptions;
  /** Render arm A along the adjacent wall instead (frame belongs to the other wall). */
  swapArms?: boolean;
}) {
  const kind = def.adeko?.kind ?? def.parametricKind ?? DEFAULT_KIND;
  const isWallUnit = kind.place === "wall";
  const armA = def.width;
  const armB = def.cornerAcross ?? def.width;
  const W = swapArms ? armB : armA;
  const WB = swapArms ? armA : armB;
  const H = def.height;
  const armD = isWallUnit ? Math.min(def.depth, 0.35) : Math.min(def.depth, 0.65);

  const finish = options?.finish ?? DEFAULT_ADEKO_FINISH;
  const topFinish = options?.topFinish ?? DEFAULT_ADEKO_TOP_FINISH;
  const handleStyle = options?.handleStyle ?? "bar";
  const handleColorHex = ADEKO_HANDLE_COLORS[options?.handleColor ?? "gray"];

  const [openA, setOpenA] = useState(false);
  const [openB, setOpenB] = useState(false);

  const { doorMat, carcassMat, interiorMat, stoneMat, kickMat, panelMat, glassMat, metalMat } =
    useAdekoMaterials(W, finish, topFinish, handleColorHex);

  const hasKick = !isWallUnit;
  const hasTop = !isWallUnit;
  const kickH = hasKick ? KICK_H : 0;
  const carcassTop = hasTop ? H - TOP_T : H;
  const bodyH = carcassTop - kickH;

  // Door on each notch face, spanning from the notch to the arm's outer end.
  const dw = Math.max(W - armD - 2 * GAP, 0.05);
  const dwB = Math.max(WB - armD - 2 * GAP, 0.05);
  const dh = bodyH - 2 * GAP;
  const doorY = kickH + GAP + dh / 2;
  const doorCX = armD + GAP + dw / 2;
  const doorCXB = armD + GAP + dwB / 2;
  const doorZ = armD - DOOR_T / 2;
  const panelForDoors = kind.glass ? glassMat : panelMat;

  return (
    <group>
      {/* Kickplates along both notch faces */}
      {hasKick && (
        <>
          <mesh
            position={[armD / 2 + W / 2 - 0.01, KICK_H / 2, armD - KICK_REC - 0.01]}
            material={kickMat}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[W - armD, KICK_H, 0.02]} />
          </mesh>
          <mesh
            position={[armD - KICK_REC - 0.01, KICK_H / 2, armD / 2 + WB / 2 - 0.01]}
            rotation={[0, Math.PI / 2, 0]}
            material={kickMat}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[WB - armD, KICK_H, 0.02]} />
          </mesh>
        </>
      )}

      {/* Carcass: arm A along +X, arm B along +Z (no overlap: B starts at z=armD) */}
      <mesh
        position={[W / 2, kickH + bodyH / 2, armD / 2]}
        material={carcassMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[W, bodyH, armD]} />
      </mesh>
      <mesh
        position={[armD / 2, kickH + bodyH / 2, armD + (WB - armD) / 2]}
        material={carcassMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[armD, bodyH, WB - armD]} />
      </mesh>

      {/* L-shaped countertop (base corner only) */}
      {hasTop && (
        <>
          <mesh
            position={[W / 2, carcassTop + TOP_T / 2, (armD + TOP_OVER) / 2]}
            material={stoneMat}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[W, TOP_T, armD + TOP_OVER]} />
          </mesh>
          <mesh
            position={[
              (armD + TOP_OVER) / 2,
              carcassTop + TOP_T / 2,
              armD + TOP_OVER + (WB - armD - TOP_OVER) / 2,
            ]}
            material={stoneMat}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[armD + TOP_OVER, TOP_T, WB - armD - TOP_OVER]} />
          </mesh>
        </>
      )}

      {/* Door on arm A's notch face (front toward +Z), hinged at the outer end */}
      <AdekoDoor
        x={doorCX}
        hingeLeft={false}
        dw={dw}
        dh={dh}
        doorY={doorY}
        doorZ={doorZ}
        doorMat={doorMat}
        panelMat={panelForDoors}
        handleMat={metalMat}
        showHandle={handleStyle !== "none"}
        open={openA}
        onToggle={() => setOpenA((v) => !v)}
      />
      {/* Door on arm B's notch face (front toward +X): rotate frame so its
          local +Z points at world +X; local x = -world z. */}
      <group rotation={[0, Math.PI / 2, 0]}>
        <AdekoDoor
          x={-doorCXB}
          hingeLeft={true}
          dw={dwB}
          dh={dh}
          doorY={doorY}
          doorZ={doorZ}
          doorMat={doorMat}
          panelMat={panelForDoors}
          handleMat={metalMat}
          showHandle={handleStyle !== "none"}
          open={openB}
          onToggle={() => setOpenB((v) => !v)}
        />
      </group>

      {/* Interior hint strip in the notch corner (visible when doors open) */}
      <mesh
        position={[armD - PANEL_T / 2, kickH + bodyH / 2, armD - PANEL_T / 2]}
        material={interiorMat}
      >
        <boxGeometry args={[PANEL_T, bodyH, PANEL_T]} />
      </mesh>
    </group>
  );
}
