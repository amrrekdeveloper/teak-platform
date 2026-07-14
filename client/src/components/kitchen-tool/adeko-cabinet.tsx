/**
 * Parametric, realistic 3D cabinet built from a real Adeko catalog product.
 * No GLB — geometry is generated from the product's real dimensions (W×H×D).
 *
 * Local coordinates: origin at bottom-center of the footprint, front face
 * toward +Z (matches how GLTF cabinets are placed by the scene).
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import type { CabinetDef } from "@/components/kitchen-tool/cabinets";

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

export default function AdekoBaseCabinet({ def }: { def: CabinetDef }) {
  const W = def.width;
  const H = def.height;
  const D = def.depth;

  const wood = useTexture(WOOD_MAPS);
  const stone = useTexture(STONE_MAPS);

  const { doorMat, carcassMat, stoneMat, kickMat, panelMat, metalMat, clones } =
    useMemo(() => {
      // Vertical grain on doors, subtle tile on carcass, stone on top.
      const doorMap = prepWood(wood.map, W * 1.6, 1.1, Math.PI / 2);
      const doorArm = prepWood(wood.armMap, W * 1.6, 1.1, Math.PI / 2);
      const carMap = prepWood(wood.map, W * 1.2, 1.0);
      const carArm = prepWood(wood.armMap, W * 1.2, 1.0);
      const panMap = prepWood(wood.map, W * 1.1, 0.8, Math.PI / 2);
      const panArm = prepWood(wood.armMap, W * 1.1, 0.8, Math.PI / 2);
      const stMap = prepWood(stone.map, W * 0.9, 0.6);
      const stArm = prepWood(stone.armMap, W * 0.9, 0.6);

      const mk = (map: THREE.Texture, arm: THREE.Texture, extra?: Partial<THREE.MeshStandardMaterialParameters>) =>
        new THREE.MeshStandardMaterial({
          map,
          aoMap: arm,
          roughnessMap: arm,
          metalnessMap: arm,
          roughness: 1,
          metalness: 1,
          ...extra,
        });

      const doorMat = mk(doorMap, doorArm);
      const carcassMat = mk(carMap, carArm, { color: new THREE.Color("#e8e2d6") });
      const panelMat = mk(panMap, panArm, { color: new THREE.Color("#f0ece2") });
      const stoneMat = mk(stMap, stArm);
      const kickMat = new THREE.MeshStandardMaterial({ color: "#2d2d30", roughness: 0.55 });
      const metalMat = new THREE.MeshStandardMaterial({
        color: "#c9ccd1",
        metalness: 0.92,
        roughness: 0.22,
      });
      return {
        doorMat,
        carcassMat,
        stoneMat,
        kickMat,
        panelMat,
        metalMat,
        clones: [doorMap, doorArm, carMap, carArm, panMap, panArm, stMap, stArm],
      };
    }, [wood.map, wood.armMap, stone.map, stone.armMap, W]);

  // Dispose cloned textures + materials on unmount (see r3f texture memory).
  useEffect(() => {
    return () => {
      clones.forEach((t) => t.dispose());
      [doorMat, carcassMat, stoneMat, kickMat, panelMat, metalMat].forEach((m) => m.dispose());
    };
  }, [clones, doorMat, carcassMat, stoneMat, kickMat, panelMat, metalMat]);

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
  const railW = Math.max(dw - 2 * STILE_W, 0.02);
  const panelW = Math.max(dw - 2 * STILE_W + 0.02, 0.03);
  const panelH = Math.max(dh - 2 * STILE_W + 0.02, 0.03);

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

      {/* Carcass body */}
      <mesh
        position={[0, KICK_H + bodyH / 2, -DOOR_T / 2 - 0.002]}
        material={carcassMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[W, bodyH, D - DOOR_T - 0.004]} />
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

      {/* Shaker doors */}
      {doors.map((d, i) => {
        const handleX = d.hingeLeft ? d.x + dw / 2 - 0.05 : d.x - dw / 2 + 0.05;
        return (
          <group key={i} position={[d.x, doorY, doorZ]}>
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
            {/* Metal bar handle (vertical, near opening edge, upper third) */}
            <group position={[handleX, dh / 2 - 0.14, DOOR_T / 2 + 0.02]}>
              <mesh material={metalMat} castShadow>
                <cylinderGeometry args={[0.006, 0.006, 0.16, 12]} />
              </mesh>
              <mesh position={[0, 0.06, -0.012]} rotation={[Math.PI / 2, 0, 0]} material={metalMat}>
                <cylinderGeometry args={[0.004, 0.004, 0.024, 8]} />
              </mesh>
              <mesh position={[0, -0.06, -0.012]} rotation={[Math.PI / 2, 0, 0]} material={metalMat}>
                <cylinderGeometry args={[0.004, 0.004, 0.024, 8]} />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
}
