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
}

/** One door on a hinge pivot — animates open/close on click. */
function AdekoDoor({
  x,
  hingeLeft,
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
  const hingeX = hingeLeft ? x - dw / 2 : x + dw / 2;
  const contentX = hingeLeft ? dw / 2 : -dw / 2;
  // Left-hinged door swings free edge toward +Z ⇒ negative Y rotation.
  const target = open ? (hingeLeft ? -DOOR_OPEN_ANGLE : DOOR_OPEN_ANGLE) : 0;

  useFrame((_, delta) => {
    const g = pivotRef.current;
    if (!g) return;
    const alpha = 1 - Math.exp(-DOOR_LERP_RATE * Math.min(delta, 0.1));
    g.rotation.y += (target - g.rotation.y) * alpha;
    if (Math.abs(target - g.rotation.y) < 0.002) g.rotation.y = target;
  });

  // Narrow/short doors degrade the shaker frame gracefully.
  const stile = Math.min(STILE_W, dw / 3.2, dh / 3.2);
  const railW = Math.max(dw - 2 * stile, 0.02);
  const panelW = Math.max(dw - 2 * stile + 0.02, 0.03);
  const panelH = Math.max(dh - 2 * stile + 0.02, 0.03);
  // Relative to the inner content group (already offset by contentX):
  // near the opening edge, 5cm from the door edge.
  const handleX = hingeLeft ? dw / 2 - 0.05 : -dw / 2 + 0.05;
  const handleLen = Math.min(0.16, dh * 0.4);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Ignore drags — only a real click toggles the door.
    if (e.delta > 4) return;
    onToggle();
  };

  return (
    <group ref={pivotRef} position={[hingeX, doorY, doorZ]} onClick={handleClick}>
      <group position={[contentX, 0, 0]}>
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
        {/* Bar handle (vertical, near opening edge) */}
        {showHandle && (
          <group position={[handleX, dh / 2 - 0.14, DOOR_T / 2 + 0.02]}>
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
  const kind = def.adeko?.kind ?? DEFAULT_KIND;

  const finish = options?.finish ?? DEFAULT_ADEKO_FINISH;
  const topFinish = options?.topFinish ?? DEFAULT_ADEKO_TOP_FINISH;
  const handleStyle = options?.handleStyle ?? "bar";
  const handleColorHex = ADEKO_HANDLE_COLORS[options?.handleColor ?? "gray"];

  const wood = useTexture(WOOD_MAPS);
  const stone = useTexture({ map: topFinish.map, armMap: topFinish.armMap });

  const [openDoors, setOpenDoors] = useState<boolean[]>([]);

  const {
    doorMat,
    carcassMat,
    interiorMat,
    stoneMat,
    kickMat,
    panelMat,
    glassMat,
    metalMat,
    clones,
  } = useMemo(() => {
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
    return () => {
      clones.forEach((t) => t.dispose());
      [doorMat, carcassMat, interiorMat, stoneMat, kickMat, panelMat, glassMat, metalMat].forEach(
        (m) => m.dispose()
      );
    };
  }, [clones, doorMat, carcassMat, interiorMat, stoneMat, kickMat, panelMat, glassMat, metalMat]);

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
          hingeLeft={d.hingeLeft}
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
