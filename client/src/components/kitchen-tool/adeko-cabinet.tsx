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
  CARCASS_OFFWHITE,
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
const GLASS_FRAME_W = 0.055; // slab glass-door frame width around the pane
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
  /** Sink cabinets: real Teak sink family (marble integrated / steel drop-in). */
  sinkType?: "marble" | "steel-silver" | "steel-black";
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
  edgeMat,
  panelMat,
  glass,
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
  /** Edge-banding material for the visible 18mm slab edges. */
  edgeMat: THREE.Material;
  /** Glass pane material (used only when `glass` is true). */
  panelMat: THREE.Material;
  /** Glass-door variant: slim slab frame around a glass pane. */
  glass?: boolean;
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

  // Glass door: slim slab frame around the pane (degrades on narrow doors).
  const frameW = Math.min(GLASS_FRAME_W, dw / 3.2, dh / 3.2);
  const glassRailW = Math.max(dw - 2 * frameW, 0.02);
  const paneW = Math.max(dw - 2 * frameW + 0.01, 0.03);
  const paneH = Math.max(dh - 2 * frameW + 0.01, 0.03);
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
        {glass ? (
          <>
            {/* Glass door: slim slab frame (banded edges) + glass pane */}
            <mesh
              position={[-dw / 2 + frameW / 2, 0, 0]}
              material={[edgeMat, edgeMat, edgeMat, edgeMat, doorMat, doorMat]}
              castShadow
            >
              <boxGeometry args={[frameW, dh, DOOR_T]} />
            </mesh>
            <mesh
              position={[dw / 2 - frameW / 2, 0, 0]}
              material={[edgeMat, edgeMat, edgeMat, edgeMat, doorMat, doorMat]}
              castShadow
            >
              <boxGeometry args={[frameW, dh, DOOR_T]} />
            </mesh>
            <mesh
              position={[0, dh / 2 - frameW / 2, 0]}
              material={[edgeMat, edgeMat, edgeMat, edgeMat, doorMat, doorMat]}
              castShadow
            >
              <boxGeometry args={[glassRailW, frameW, DOOR_T]} />
            </mesh>
            <mesh
              position={[0, -dh / 2 + frameW / 2, 0]}
              material={[edgeMat, edgeMat, edgeMat, edgeMat, doorMat, doorMat]}
              castShadow
            >
              <boxGeometry args={[glassRailW, frameW, DOOR_T]} />
            </mesh>
            <mesh position={[0, 0, 0]} material={panelMat}>
              <boxGeometry args={[paneW, paneH, 0.006]} />
            </mesh>
          </>
        ) : (
          /* Flat slab front — faces in the decor finish, 18mm banded edges */
          <mesh
            material={[edgeMat, edgeMat, edgeMat, edgeMat, doorMat, doorMat]}
            castShadow
          >
            <boxGeometry args={[dw, dh, DOOR_T]} />
          </mesh>
        )}
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

/** Static drawer face — flat slab with banded edges and a bar handle. */
function AdekoDrawerFace({
  y,
  h,
  W,
  doorZ,
  doorMat,
  edgeMat,
  handleMat,
  showHandle,
}: {
  y: number;
  h: number;
  W: number;
  doorZ: number;
  doorMat: THREE.Material;
  edgeMat: THREE.Material;
  handleMat: THREE.Material;
  showHandle: boolean;
}) {
  const fw = W - 2 * GAP;
  const handleLen = Math.min(0.16, fw * 0.4);
  return (
    <group position={[0, y, doorZ]}>
      <mesh material={[edgeMat, edgeMat, edgeMat, edgeMat, doorMat, doorMat]} castShadow>
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

/** Chrome faucet: base + column + spout, standing at the counter rear. */
function Faucet({
  topY,
  z,
  steelMat,
}: {
  topY: number;
  z: number;
  steelMat: THREE.Material;
}) {
  return (
    <group position={[0, topY, z]}>
      <mesh material={steelMat} position={[0, 0.015, 0]} castShadow>
        <cylinderGeometry args={[0.022, 0.026, 0.03, 16]} />
      </mesh>
      <mesh material={steelMat} position={[0, 0.14, 0]} castShadow>
        <cylinderGeometry args={[0.011, 0.011, 0.25, 12]} />
      </mesh>
      {/* Curved spout approximated: short bend + horizontal reach toward the basin */}
      <mesh material={steelMat} position={[0, 0.265, 0.02]} rotation={[Math.PI / 2.6, 0, 0]} castShadow>
        <cylinderGeometry args={[0.01, 0.01, 0.09, 12]} />
      </mesh>
      <mesh material={steelMat} position={[0, 0.28, 0.09]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.009, 0.009, 0.1, 12]} />
      </mesh>
      {/* Lever */}
      <mesh material={steelMat} position={[0.03, 0.05, 0]} rotation={[0, 0, -0.5]} castShadow>
        <cylinderGeometry args={[0.006, 0.006, 0.07, 8]} />
      </mesh>
    </group>
  );
}

/** One drop-in basin (top-mount rim + cavity) — brushed or black stainless,
 *  matching Teak's real mounted sinks (rectangular bowls, thin proud rim). */
function Basin({
  x,
  topY,
  bw,
  bd,
  depth,
  steelMat,
  darkMat,
}: {
  x: number;
  topY: number;
  bw: number;
  bd: number;
  depth: number;
  steelMat: THREE.Material;
  darkMat: THREE.Material;
}) {
  const wall = 0.012;
  return (
    <group position={[x, topY, 0.03]}>
      {/* Rim plate slightly proud of the counter */}
      <mesh material={steelMat} position={[0, 0.004, 0]}>
        <boxGeometry args={[bw + 0.04, 0.008, bd + 0.04]} />
      </mesh>
      {/* Cavity walls */}
      <mesh material={steelMat} position={[-bw / 2 + wall / 2, -depth / 2, 0]}>
        <boxGeometry args={[wall, depth, bd]} />
      </mesh>
      <mesh material={steelMat} position={[bw / 2 - wall / 2, -depth / 2, 0]}>
        <boxGeometry args={[wall, depth, bd]} />
      </mesh>
      <mesh material={steelMat} position={[0, -depth / 2, -bd / 2 + wall / 2]}>
        <boxGeometry args={[bw - 2 * wall, depth, wall]} />
      </mesh>
      <mesh material={steelMat} position={[0, -depth / 2, bd / 2 - wall / 2]}>
        <boxGeometry args={[bw - 2 * wall, depth, wall]} />
      </mesh>
      {/* Bottom with drain */}
      <mesh material={steelMat} position={[0, -depth, 0]}>
        <boxGeometry args={[bw, wall, bd]} />
      </mesh>
      <mesh material={darkMat} position={[0, -depth + wall, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.02, 16]} />
      </mesh>
    </group>
  );
}

/** Countertop with real rectangular cutouts over sink/laundry bowls.
 *  Built as an extruded shape with holes so the basin reads as an open
 *  bowl instead of sitting under a solid slab. Local mapping: the shape
 *  lives in XY, rotation [-PI/2,0,0] maps shape.y -> -z and extrusion
 *  z (0..TOP_T) -> +y, so the mesh sits with its bottom at `bottomY`. */
function SinkCounterTop({
  W,
  D,
  bottomY,
  bowls,
  bd,
  stoneMat,
}: {
  W: number;
  D: number;
  bottomY: number;
  bowls: Array<{ x: number; bw: number }>;
  bd: number;
  stoneMat: THREE.Material;
}) {
  const geom = useMemo(() => {
    const zMin = -D / 2;
    const zMax = D / 2 + TOP_OVER;
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, -zMax);
    shape.lineTo(W / 2, -zMax);
    shape.lineTo(W / 2, -zMin);
    shape.lineTo(-W / 2, -zMin);
    shape.closePath();
    for (const b of bowls) {
      // Hole slightly smaller than the bowl so the rim / molded wall tops
      // always cover the cut edge.
      const hw = (b.bw - 0.012) / 2;
      const hd = (bd - 0.012) / 2;
      const cz = 0.03; // bowls are grouped at local z = 0.03
      const hole = new THREE.Path();
      hole.moveTo(b.x - hw, -(cz + hd));
      hole.lineTo(b.x + hw, -(cz + hd));
      hole.lineTo(b.x + hw, -(cz - hd));
      hole.lineTo(b.x - hw, -(cz - hd));
      hole.closePath();
      shape.holes.push(hole);
    }
    return new THREE.ExtrudeGeometry(shape, { depth: TOP_T, bevelEnabled: false });
  }, [W, D, bowls, bd]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh
      geometry={geom}
      material={stoneMat}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, bottomY, 0]}
      castShadow
      receiveShadow
    />
  );
}

/** Integrated solid-surface (marble) bowl molded into the countertop —
 *  matches Teak's cast-marble sinks: no rim, soft sloped walls in the same
 *  stone as the top, dark drain. Walls are tilted boxes for a molded look. */
function MarbleBasin({
  x,
  topY,
  bw,
  bd,
  depth,
  stoneMat,
  darkMat,
}: {
  x: number;
  topY: number;
  bw: number;
  bd: number;
  depth: number;
  stoneMat: THREE.Material;
  darkMat: THREE.Material;
}) {
  const wall = 0.02;
  const slope = 0.12; // walls lean inward toward the bottom (molded feel)
  return (
    <group position={[x, topY + 0.001, 0.03]}>
      {/* Sloped cavity walls in the countertop stone */}
      <mesh material={stoneMat} position={[-bw / 2 + wall / 2, -depth / 2, 0]} rotation={[0, 0, -slope]}>
        <boxGeometry args={[wall, depth, bd]} />
      </mesh>
      <mesh material={stoneMat} position={[bw / 2 - wall / 2, -depth / 2, 0]} rotation={[0, 0, slope]}>
        <boxGeometry args={[wall, depth, bd]} />
      </mesh>
      <mesh material={stoneMat} position={[0, -depth / 2, -bd / 2 + wall / 2]} rotation={[slope, 0, 0]}>
        <boxGeometry args={[bw, depth, wall]} />
      </mesh>
      <mesh material={stoneMat} position={[0, -depth / 2, bd / 2 - wall / 2]} rotation={[-slope, 0, 0]}>
        <boxGeometry args={[bw, depth, wall]} />
      </mesh>
      {/* Bottom (slightly smaller because of the slope) with drain */}
      <mesh material={stoneMat} position={[0, -depth, 0]}>
        <boxGeometry args={[bw - 2 * depth * slope, wall, bd - 2 * depth * slope]} />
      </mesh>
      <mesh material={darkMat} position={[0, -depth + wall, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.024, 20]} />
      </mesh>
    </group>
  );
}

/** Built-in oven front face (dark glass door + steel handle + control strip). */
function OvenFace({
  y,
  h,
  fw,
  faceZ,
  darkMat,
  glassMat,
  steelMat,
  micro,
}: {
  y: number;
  h: number;
  fw: number;
  faceZ: number;
  darkMat: THREE.Material;
  glassMat: THREE.Material;
  steelMat: THREE.Material;
  /** Microwave proportions (shallower door, wider control zone). */
  micro?: boolean;
}) {
  const ctrlH = micro ? 0.05 : 0.07;
  const doorH = h - ctrlH - 0.01;
  return (
    <group position={[0, y, faceZ]}>
      {/* Face panel */}
      <mesh material={darkMat} castShadow>
        <boxGeometry args={[fw, h, DOOR_T]} />
      </mesh>
      {/* Control strip on top */}
      <mesh material={steelMat} position={[0, h / 2 - ctrlH / 2, DOOR_T / 2 + 0.002]}>
        <boxGeometry args={[fw - 0.02, ctrlH - 0.015, 0.004]} />
      </mesh>
      {/* Door glass window */}
      <mesh
        material={glassMat}
        position={[0, -ctrlH / 2, DOOR_T / 2 + 0.003]}
      >
        <boxGeometry args={[fw * 0.82, doorH * 0.62, 0.005]} />
      </mesh>
      {/* Handle bar */}
      <mesh
        material={steelMat}
        position={[0, h / 2 - ctrlH - 0.035, DOOR_T / 2 + 0.028]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.009, 0.009, fw * 0.85, 12]} />
      </mesh>
    </group>
  );
}

/** Black-glass cooktop with 4 burner rings, laid on the counter. */
function CooktopPlate({
  topY,
  W,
  D,
  glassMat,
  darkMat,
}: {
  topY: number;
  W: number;
  D: number;
  glassMat: THREE.Material;
  darkMat: THREE.Material;
}) {
  const pw = Math.min(W - 0.06, 0.75);
  const pd = D - 0.14;
  const bx = pw / 4.5;
  const bz = pd / 4.5;
  return (
    <group position={[0, topY, 0.01]}>
      <mesh material={glassMat}>
        <boxGeometry args={[pw, 0.012, pd]} />
      </mesh>
      {[
        [-bx, -bz],
        [bx, -bz],
        [-bx, bz],
        [bx, bz],
      ].map(([x, z], i) => (
        <mesh key={i} material={darkMat} position={[x, 0.0075, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.03, 0.055, 24]} />
        </mesh>
      ))}
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
    // Edge banding on slab fronts — same decor, slightly darker and more
    // matte so the 18mm edges read as banded chipboard edges.
    const edgeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(finish.tint).multiplyScalar(0.82),
      roughness: 0.62,
    });
    // Carcass is ALWAYS standard grey chipboard melamine (Teak factory
    // standard) — only doors, panels and tops follow the customer's finish.
    const carcassMat = new THREE.MeshStandardMaterial({
      color: CARCASS_OFFWHITE,
      roughness: 0.85,
    });
    // Interior matches the grey chipboard carcass, slightly lighter so the
    // inside still reads clearly when doors are open.
    const interiorMat = new THREE.MeshStandardMaterial({
      color: "#c2bdb5",
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

    let stoneMat: THREE.MeshStandardMaterial;
    if (topFinish.metal) {
      // Brushed stainless steel — plain metal, no stone texture.
      stoneMat = new THREE.MeshStandardMaterial({
        color: "#c9cdd1",
        metalness: 0.92,
        roughness: 0.32,
      });
    } else {
      const stMap = prepWood(stone.map, W * 0.9, 0.6);
      const stArm = prepWood(stone.armMap, W * 0.9, 0.6);
      clones.push(stMap, stArm);
      stoneMat = new THREE.MeshStandardMaterial({
        map: stMap,
        aoMap: stArm,
        roughnessMap: stArm,
        metalnessMap: stArm,
        roughness: 1,
        metalness: 1,
        ...(topFinish.tint ? { color: new THREE.Color(topFinish.tint) } : {}),
      });
    }
    // Shared appliance materials (sinks, faucet, oven fronts).
    const steelMat = new THREE.MeshStandardMaterial({
      color: "#c4c8cc",
      metalness: 0.95,
      roughness: 0.25,
    });
    const applianceDarkMat = new THREE.MeshStandardMaterial({
      color: "#1c1d1f",
      metalness: 0.35,
      roughness: 0.35,
    });
    // Black nano stainless (Teak's black drop-in sinks + matching faucet).
    const blackSteelMat = new THREE.MeshStandardMaterial({
      color: "#1a1a1c",
      metalness: 0.7,
      roughness: 0.38,
    });
    const applianceGlassMat = new THREE.MeshStandardMaterial({
      color: "#121316",
      metalness: 0.55,
      roughness: 0.12,
    });
    const kickMat = new THREE.MeshStandardMaterial({ color: "#2d2d30", roughness: 0.55 });
    const metalMat = new THREE.MeshStandardMaterial({
      color: handleColorHex,
      metalness: handleColorHex === ADEKO_HANDLE_COLORS.gray ? 0.92 : 0.35,
      roughness: handleColorHex === ADEKO_HANDLE_COLORS.gray ? 0.22 : 0.45,
    });
    return {
      doorMat,
      edgeMat,
      carcassMat,
      interiorMat,
      stoneMat,
      kickMat,
      panelMat,
      glassMat,
      metalMat,
      steelMat,
      blackSteelMat,
      applianceDarkMat,
      applianceGlassMat,
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

  const {
    doorMat,
    edgeMat,
    carcassMat,
    interiorMat,
    stoneMat,
    kickMat,
    panelMat,
    glassMat,
    metalMat,
    steelMat,
    blackSteelMat,
    applianceDarkMat,
    applianceGlassMat,
  } = useAdekoMaterials(W, finish, topFinish, handleColorHex);

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

    // Appliance tower: door rows shrink to leave a fixed band for the
    // built-in oven (0.9–1.5m) and microwave (1.5–1.92m).
    if (kind.feature === "tallOven" && kind.place === "tall") {
      rows.length = 0;
      const lowerBandH = 0.9 - kickH - 2 * GAP;
      if (lowerBandH > 0.1) rows.push({ y: kickH + GAP + lowerBandH / 2, dh: lowerBandH });
      const upperStart = 1.95;
      const upperBandH = carcassTop - upperStart - GAP;
      if (upperBandH > 0.12) rows.push({ y: upperStart + upperBandH / 2, dh: upperBandH });
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

  // Bowl layout shared by the cut-out countertop and the basin meshes.
  const sinkBowls = useMemo(() => {
    if (!hasTop) return null;
    if (kind.feature === "sink1")
      return { bowls: [{ x: 0, bw: Math.min(0.44, W * 0.55) }], bd: Math.min(0.42, D * 0.62) };
    if (kind.feature === "sink2")
      return {
        bowls: [
          { x: -W * 0.22, bw: Math.min(0.36, W * 0.38) },
          { x: W * 0.22, bw: Math.min(0.36, W * 0.38) },
        ],
        bd: Math.min(0.42, D * 0.62),
      };
    if (kind.feature === "laundry")
      return { bowls: [{ x: 0, bw: Math.min(0.5, W * 0.6) }], bd: Math.min(0.46, D * 0.65) };
    return null;
  }, [hasTop, kind.feature, W, D]);

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

  const showFronts =
    doors.length > 0 || drawerFaces.length > 0 || kind.feature === "cooktop";

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

      {/* Countertop (stone, front overhang) — base units only.
          Sink/laundry tops get real bowl cutouts instead of a solid slab. */}
      {hasTop &&
        (sinkBowls ? (
          <SinkCounterTop
            W={W}
            D={D}
            bottomY={carcassTop}
            bowls={sinkBowls.bowls}
            bd={sinkBowls.bd}
            stoneMat={stoneMat}
          />
        ) : (
          <mesh
            position={[0, carcassTop + TOP_T / 2, TOP_OVER / 2]}
            material={stoneMat}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[W, TOP_T, D + TOP_OVER]} />
          </mesh>
        ))}

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

      {/* Slab doors — click to open/close (90° swing from the hinge) */}
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
          edgeMat={edgeMat}
          panelMat={kind.glass ? glassMat : panelMat}
          glass={!!kind.glass}
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
          edgeMat={edgeMat}
          handleMat={metalMat}
          showHandle={handleStyle !== "none"}
        />
      ))}

      {/* ── Functional features: sinks, laundry tub, cooktop+oven, tower ── */}
      {(kind.feature === "sink1" || kind.feature === "sink2") && hasTop && (
        <>
          {(() => {
            const sinkType = options?.sinkType ?? "steel-silver";
            const basinMat = sinkType === "steel-black" ? blackSteelMat : steelMat;
            const bowls = sinkBowls?.bowls ?? [];
            const bd = sinkBowls?.bd ?? Math.min(0.42, D * 0.62);
            return bowls.map((b, i) =>
              sinkType === "marble" ? (
                <MarbleBasin
                  key={i}
                  x={b.x}
                  topY={carcassTop + TOP_T}
                  bw={b.bw}
                  bd={bd}
                  depth={0.16}
                  stoneMat={stoneMat}
                  darkMat={applianceDarkMat}
                />
              ) : (
                <Basin
                  key={i}
                  x={b.x}
                  topY={carcassTop + TOP_T}
                  bw={b.bw}
                  bd={bd}
                  depth={0.17}
                  steelMat={basinMat}
                  darkMat={applianceDarkMat}
                />
              )
            );
          })()}
          <Faucet
            topY={carcassTop + TOP_T}
            z={-D / 2 + 0.09}
            steelMat={(options?.sinkType ?? "steel-silver") === "steel-black" ? blackSteelMat : steelMat}
          />
        </>
      )}

      {kind.feature === "laundry" && hasTop && (
        <>
          <Basin
            x={0}
            topY={carcassTop + TOP_T}
            bw={Math.min(0.5, W * 0.6)}
            bd={Math.min(0.46, D * 0.65)}
            depth={0.24}
            steelMat={steelMat}
            darkMat={applianceDarkMat}
          />
          <Faucet topY={carcassTop + TOP_T} z={-D / 2 + 0.09} steelMat={steelMat} />
        </>
      )}

      {kind.feature === "cooktop" && hasTop && (
        <>
          <CooktopPlate
            topY={carcassTop + TOP_T + 0.006}
            W={W}
            D={D}
            glassMat={applianceGlassMat}
            darkMat={applianceDarkMat}
          />
          {/* Built-in oven at the top of the front field, under the cooktop */}
          <OvenFace
            y={kickH + bodyH - GAP - Math.min(bodyH - 2 * GAP, 0.62) / 2}
            h={Math.min(bodyH - 2 * GAP, 0.62)}
            fw={W - 2 * GAP}
            faceZ={doorZ}
            darkMat={applianceDarkMat}
            glassMat={applianceGlassMat}
            steelMat={steelMat}
          />
          {/* Filler strip below the oven when the field is taller than the oven */}
          {bodyH - 0.62 - 2 * GAP > 0.03 && (
            <mesh
              material={doorMat}
              position={[0, kickH + (bodyH - 0.62) / 2, doorZ]}
              castShadow
            >
              <boxGeometry args={[W - 2 * GAP, bodyH - 0.62 - 2 * GAP, DOOR_T]} />
            </mesh>
          )}
        </>
      )}

      {kind.feature === "tallOven" && (
        <>
          <OvenFace
            y={0.9 + 0.3}
            h={0.6}
            fw={W - 2 * GAP}
            faceZ={doorZ}
            darkMat={applianceDarkMat}
            glassMat={applianceGlassMat}
            steelMat={steelMat}
          />
          <OvenFace
            y={1.5 + 0.21}
            h={0.42}
            fw={W - 2 * GAP}
            faceZ={doorZ}
            darkMat={applianceDarkMat}
            glassMat={applianceGlassMat}
            steelMat={steelMat}
            micro
          />
        </>
      )}
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
 * clickable slab door hinged at its outer edge (swings away from the corner).
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

  const { doorMat, edgeMat, carcassMat, interiorMat, stoneMat, kickMat, panelMat, glassMat, metalMat } =
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
        edgeMat={edgeMat}
        panelMat={panelForDoors}
        glass={!!kind.glass}
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
          edgeMat={edgeMat}
          panelMat={panelForDoors}
          glass={!!kind.glass}
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

/**
 * Kitchen island — procedural freestanding unit built from the same real
 * Teak finish system as base cabinets: grey chipboard carcass, slab fronts
 * (customer finish) on both long sides + end panels, stone countertop with
 * an even overhang all around. Origin: island center at floor level.
 */
export function AdekoIsland({
  width,
  depth,
  options,
}: {
  /** Plan footprint (m). */
  width: number;
  depth: number;
  options?: AdekoCabinetOptions;
}) {
  const H = 0.9;
  const finish = options?.finish ?? DEFAULT_ADEKO_FINISH;
  const topFinish = options?.topFinish ?? DEFAULT_ADEKO_TOP_FINISH;
  const handleColorHex = ADEKO_HANDLE_COLORS[options?.handleColor ?? "gray"];
  const { doorMat, edgeMat, carcassMat, stoneMat, kickMat, metalMat } =
    useAdekoMaterials(width, finish, topFinish, handleColorHex);

  const bodyH = H - KICK_H - TOP_T;
  const bodyW = width;
  const bodyD = depth;
  const showHandle = (options?.handleStyle ?? "bar") === "bar";

  // Front slab fronts: split the long side into equal doors (~0.55m each).
  const nDoors = Math.max(2, Math.round(bodyW / 0.55));
  const dw = (bodyW - GAP * (nDoors + 1)) / nDoors;

  const doors: JSX.Element[] = [];
  for (let side = 0; side < 2; side++) {
    const zFace = side === 0 ? bodyD / 2 + DOOR_T / 2 : -bodyD / 2 - DOOR_T / 2;
    for (let i = 0; i < nDoors; i++) {
      const x = -bodyW / 2 + GAP + dw / 2 + i * (dw + GAP);
      doors.push(
        <group key={`${side}-${i}`} position={[x, KICK_H + bodyH / 2, zFace]}>
          <mesh material={doorMat}>
            <boxGeometry args={[dw, bodyH - GAP * 2, DOOR_T]} />
          </mesh>
          {/* edge banding hint: thin frame strips top/bottom */}
          <mesh material={edgeMat} position={[0, (bodyH - GAP * 2) / 2 - 0.004, 0]}>
            <boxGeometry args={[dw, 0.008, DOOR_T + 0.0005]} />
          </mesh>
          {showHandle && (
            <mesh
              material={metalMat}
              position={[0, (bodyH - GAP * 2) / 2 - 0.05, (side === 0 ? 1 : -1) * (DOOR_T / 2 + 0.012)]}
            >
              <boxGeometry args={[Math.min(0.18, dw * 0.5), 0.012, 0.012]} />
            </mesh>
          )}
        </group>
      );
    }
  }

  return (
    <group>
      {/* Kickplate (recessed) */}
      <mesh material={kickMat} position={[0, KICK_H / 2, 0]}>
        <boxGeometry args={[bodyW - KICK_REC * 2, KICK_H, bodyD - KICK_REC * 2]} />
      </mesh>
      {/* Carcass body */}
      <mesh material={carcassMat} position={[0, KICK_H + bodyH / 2, 0]}>
        <boxGeometry args={[bodyW, bodyH, bodyD]} />
      </mesh>
      {/* Finish end panels on the short sides */}
      <mesh material={doorMat} position={[-bodyW / 2 - DOOR_T / 2, KICK_H + bodyH / 2, 0]}>
        <boxGeometry args={[DOOR_T, bodyH, bodyD]} />
      </mesh>
      <mesh material={doorMat} position={[bodyW / 2 + DOOR_T / 2, KICK_H + bodyH / 2, 0]}>
        <boxGeometry args={[DOOR_T, bodyH, bodyD]} />
      </mesh>
      {doors}
      {/* Countertop with an even overhang all around */}
      <mesh material={stoneMat} position={[0, KICK_H + bodyH + TOP_T / 2, 0]}>
        <boxGeometry args={[
          bodyW + 2 * (DOOR_T + TOP_OVER),
          TOP_T,
          bodyD + 2 * (DOOR_T + TOP_OVER),
        ]} />
      </mesh>
    </group>
  );
}
