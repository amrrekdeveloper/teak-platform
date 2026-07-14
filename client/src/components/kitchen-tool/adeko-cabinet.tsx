/**
 * Parametric, realistic 3D cabinet built from a real Adeko catalog product.
 * No GLB — geometry is generated from the product's real dimensions (W×H×D).
 *
 * Local coordinates: origin at bottom-center of the footprint, front face
 * toward +Z (matches how GLTF cabinets are placed by the scene).
 *
 * Customization (per placed instance):
 * - finish: factory wood type mapped to a wood-texture or flat painted look
 * - handle: bar handle (black/white/gray) or none (push-to-open)
 * - doors open/close on click with a smooth 90° swing revealing the interior
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import type { CabinetDef } from "@/components/kitchen-tool/cabinets";
import {
  DEFAULT_ADEKO_FINISH,
  ADEKO_HANDLE_COLORS,
  type AdekoFinish,
  type AdekoHandleStyle,
  type AdekoHandleColor,
} from "@/components/kitchen-tool/materials";

const ASSETS = "/kitchen-tool-assets";

const WOOD_MAPS = {
  map: `${ASSETS}/countertop/textures/oak_veneer_01_diff_2k.jpg`,
  armMap: `${ASSETS}/countertop/textures/oak_veneer_01_arm_2k.jpg`,
};
const STONE_MAPS = {
  map: `${ASSETS}/floor-granite-dark/textures/granite_tile_diff_2k.jpg`,
  armMap: `${ASSETS}/floor-granite-dark/textures/granite_tile_arm_2k.jpg`,
};

/* Construction constants (m) — Saudi/Gulf standard base cabinet build. */
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

  const railW = Math.max(dw - 2 * STILE_W, 0.02);
  const panelW = Math.max(dw - 2 * STILE_W + 0.02, 0.03);
  const panelH = Math.max(dh - 2 * STILE_W + 0.02, 0.03);
  const handleX = hingeLeft ? contentX + dw / 2 - 0.05 : contentX - dw / 2 + 0.05;

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
        <mesh position={[-dw / 2 + STILE_W / 2, 0, 0]} material={doorMat} castShadow>
          <boxGeometry args={[STILE_W, dh, DOOR_T]} />
        </mesh>
        <mesh position={[dw / 2 - STILE_W / 2, 0, 0]} material={doorMat} castShadow>
          <boxGeometry args={[STILE_W, dh, DOOR_T]} />
        </mesh>
        {/* Rails (top + bottom, between stiles) */}
        <mesh position={[0, dh / 2 - STILE_W / 2, 0]} material={doorMat} castShadow>
          <boxGeometry args={[railW, STILE_W, DOOR_T]} />
        </mesh>
        <mesh position={[0, -dh / 2 + STILE_W / 2, 0]} material={doorMat} castShadow>
          <boxGeometry args={[railW, STILE_W, DOOR_T]} />
        </mesh>
        {/* Recessed center panel */}
        <mesh position={[0, 0, -PANEL_REC]} material={panelMat}>
          <boxGeometry args={[panelW, panelH, DOOR_T - PANEL_REC]} />
        </mesh>
        {/* Bar handle (vertical, near opening edge, upper third) */}
        {showHandle && (
          <group position={[handleX, dh / 2 - 0.14, DOOR_T / 2 + 0.02]}>
            <mesh material={handleMat} castShadow>
              <cylinderGeometry args={[0.006, 0.006, 0.16, 12]} />
            </mesh>
            <mesh position={[0, 0.06, -0.012]} rotation={[Math.PI / 2, 0, 0]} material={handleMat}>
              <cylinderGeometry args={[0.004, 0.004, 0.024, 8]} />
            </mesh>
            <mesh position={[0, -0.06, -0.012]} rotation={[Math.PI / 2, 0, 0]} material={handleMat}>
              <cylinderGeometry args={[0.004, 0.004, 0.024, 8]} />
            </mesh>
          </group>
        )}
      </group>
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

  const finish = options?.finish ?? DEFAULT_ADEKO_FINISH;
  const handleStyle = options?.handleStyle ?? "bar";
  const handleColorHex = ADEKO_HANDLE_COLORS[options?.handleColor ?? "gray"];

  const wood = useTexture(WOOD_MAPS);
  const stone = useTexture(STONE_MAPS);

  const [openDoors, setOpenDoors] = useState<boolean[]>([]);

  const { doorMat, carcassMat, interiorMat, stoneMat, kickMat, panelMat, metalMat, clones } =
    useMemo(() => {
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
      });
      const kickMat = new THREE.MeshStandardMaterial({ color: "#2d2d30", roughness: 0.55 });
      const metalMat = new THREE.MeshStandardMaterial({
        color: handleColorHex,
        metalness: handleColorHex === ADEKO_HANDLE_COLORS.gray ? 0.92 : 0.35,
        roughness: handleColorHex === ADEKO_HANDLE_COLORS.gray ? 0.22 : 0.45,
      });
      return { doorMat, carcassMat, interiorMat, stoneMat, kickMat, panelMat, metalMat, clones };
    }, [wood.map, wood.armMap, stone.map, stone.armMap, W, finish, handleColorHex]);

  // Dispose cloned textures + materials on unmount (see r3f texture memory).
  useEffect(() => {
    return () => {
      clones.forEach((t) => t.dispose());
      [doorMat, carcassMat, interiorMat, stoneMat, kickMat, panelMat, metalMat].forEach((m) =>
        m.dispose()
      );
    };
  }, [clones, doorMat, carcassMat, interiorMat, stoneMat, kickMat, panelMat, metalMat]);

  const built = useMemo(() => {
    const carcassTop = H - TOP_T;
    const bodyH = carcassTop - KICK_H;
    const doorCount = W > 0.601 ? 2 : 1;
    const dw = (W - GAP * (doorCount + 1)) / doorCount;
    const dh = bodyH - 2 * GAP;
    const doorY = KICK_H + GAP + dh / 2;
    const doorZ = D / 2 - DOOR_T / 2;

    const doors: Array<{ x: number; hingeLeft: boolean }> = [];
    for (let i = 0; i < doorCount; i++) {
      const x = -W / 2 + GAP + dw / 2 + i * (dw + GAP);
      doors.push({ x, hingeLeft: doorCount === 2 ? i === 0 : true });
    }
    return { carcassTop, bodyH, doorCount, dw, dh, doorY, doorZ, doors };
  }, [W, H, D]);

  const { carcassTop, bodyH, dw, dh, doorY, doorZ, doors } = built;

  /* Interior box (visible when a door is open): sides, back, bottom, top, shelf. */
  const innerBackZ = -D / 2 + PANEL_T / 2 + 0.004;
  const innerDepth = D - DOOR_T - PANEL_T - 0.01; // from back panel to behind doors
  const innerZ = -D / 2 + PANEL_T + 0.004 + innerDepth / 2;
  const innerW = W - 2 * PANEL_T;
  const innerH = bodyH - 2 * PANEL_T;
  const shelfY = KICK_H + PANEL_T + innerH / 2; // middle shelf

  return (
    <group>
      {/* Kickplate (recessed, dark) */}
      <mesh
        position={[0, KICK_H / 2, D / 2 - KICK_REC - 0.01]}
        material={kickMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[W - 0.02, KICK_H, 0.02]} />
      </mesh>

      {/* Carcass shell — sides, back, bottom, top (open toward the doors) */}
      {/* Left side */}
      <mesh
        position={[-W / 2 + PANEL_T / 2, KICK_H + bodyH / 2, innerZ]}
        material={carcassMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[PANEL_T, bodyH, innerDepth + PANEL_T]} />
      </mesh>
      {/* Right side */}
      <mesh
        position={[W / 2 - PANEL_T / 2, KICK_H + bodyH / 2, innerZ]}
        material={carcassMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[PANEL_T, bodyH, innerDepth + PANEL_T]} />
      </mesh>
      {/* Back panel */}
      <mesh
        position={[0, KICK_H + bodyH / 2, innerBackZ]}
        material={interiorMat}
        receiveShadow
      >
        <boxGeometry args={[innerW, bodyH, PANEL_T]} />
      </mesh>
      {/* Bottom */}
      <mesh
        position={[0, KICK_H + PANEL_T / 2, innerZ]}
        material={interiorMat}
        receiveShadow
      >
        <boxGeometry args={[innerW, PANEL_T, innerDepth + PANEL_T]} />
      </mesh>
      {/* Top */}
      <mesh
        position={[0, KICK_H + bodyH - PANEL_T / 2, innerZ]}
        material={interiorMat}
        receiveShadow
      >
        <boxGeometry args={[innerW, PANEL_T, innerDepth + PANEL_T]} />
      </mesh>
      {/* Middle shelf */}
      <mesh position={[0, shelfY, innerZ]} material={interiorMat} castShadow receiveShadow>
        <boxGeometry args={[innerW, PANEL_T, innerDepth - 0.02]} />
      </mesh>

      {/* Countertop (granite, front overhang) */}
      <mesh
        position={[0, carcassTop + TOP_T / 2, TOP_OVER / 2]}
        material={stoneMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[W, TOP_T, D + TOP_OVER]} />
      </mesh>

      {/* Shaker doors — click to open/close (90° swing from the hinge) */}
      {doors.map((d, i) => (
        <AdekoDoor
          key={i}
          x={d.x}
          hingeLeft={d.hingeLeft}
          dw={dw}
          dh={dh}
          doorY={doorY}
          doorZ={doorZ}
          doorMat={doorMat}
          panelMat={panelMat}
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
    </group>
  );
}
