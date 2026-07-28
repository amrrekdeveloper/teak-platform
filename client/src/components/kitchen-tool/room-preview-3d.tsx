/**
 * Lightweight live 3D room preview for the "Space" wizard stage.
 * Renders floor + walls (with real door/window cutouts) and dimension
 * labels — no HDRI, no cabinets, no heavy PBR — so it stays snappy
 * while the customer types wall lengths.
 */
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import {
  getWallSegments,
  getFloorBounds,
  wallLabelAr,
  wallLabelEn,
  type WallSegment,
} from "@/components/kitchen-tool/plan-svg";
import type {
  KitchenLayout,
  KitchenWall,
  KitchenOpening,
} from "@/components/kitchen-tool/store";

const CM = 0.01;
const WALL_T = 0.1; // wall thickness (m)

function segVectors(seg: WallSegment) {
  const origin = new THREE.Vector3(seg.x1 * CM, 0, seg.y1 * CM);
  const end = new THREE.Vector3(seg.x2 * CM, 0, seg.y2 * CM);
  const dir = end.clone().sub(origin);
  const lengthM = dir.length();
  dir.normalize();
  const out = new THREE.Vector3(seg.nx, 0, seg.ny);
  return { origin, end, dir, out, lengthM };
}

/** Split one wall into solid boxes around door/window holes. */
function wallPieces(
  seg: WallSegment,
  ceilingM: number,
  openings: KitchenOpening[]
): { along: number; width: number; y0: number; y1: number }[] {
  const lengthM = seg.length * CM;
  const holes = openings
    .filter((o) => o.wallId === seg.id)
    .map((o) => {
      const a = o.distanceFromWallStart * CM;
      const b = a + o.width * CM;
      if (o.type === "door") {
        return { a, b, y0: 0, y1: Math.min(2.1, ceilingM) };
      }
      const sill = (o.sillHeight ?? 90) * CM;
      const top = Math.min(sill + (o.height ?? 120) * CM, ceilingM);
      return { a, b, y0: sill, y1: top };
    })
    .sort((h1, h2) => h1.a - h2.a);

  const pieces: { along: number; width: number; y0: number; y1: number }[] = [];
  let cursor = 0;
  for (const h of holes) {
    if (h.a > cursor + 1e-4) {
      pieces.push({ along: cursor, width: h.a - cursor, y0: 0, y1: ceilingM });
    }
    // Below the hole (windows).
    if (h.y0 > 1e-4) pieces.push({ along: h.a, width: h.b - h.a, y0: 0, y1: h.y0 });
    // Above the hole.
    if (h.y1 < ceilingM - 1e-4)
      pieces.push({ along: h.a, width: h.b - h.a, y0: h.y1, y1: ceilingM });
    cursor = Math.max(cursor, h.b);
  }
  if (cursor < lengthM - 1e-4) {
    pieces.push({ along: cursor, width: lengthM - cursor, y0: 0, y1: ceilingM });
  }
  return pieces;
}

function PreviewWall({
  seg,
  ceilingM,
  openings,
  labelAr,
}: {
  seg: WallSegment;
  ceilingM: number;
  openings: KitchenOpening[];
  labelAr: string;
}) {
  const { origin, dir, out, lengthM } = segVectors(seg);
  const pieces = useMemo(
    () => wallPieces(seg, ceilingM, openings),
    [seg, ceilingM, openings]
  );
  const mid = origin.clone().addScaledVector(dir, lengthM / 2);
  const labelPos = mid
    .clone()
    .addScaledVector(out, -0.18)
    .setY(Math.min(ceilingM + 0.14, ceilingM + 0.2));

  return (
    <group>
      {pieces.map((p, i) => {
        const center = origin
          .clone()
          .addScaledVector(dir, p.along + p.width / 2)
          .addScaledVector(out, WALL_T / 2);
        center.y = (p.y0 + p.y1) / 2;
        const rotY = Math.atan2(dir.x, dir.z) - Math.PI / 2;
        return (
          <mesh key={i} position={center} rotation={[0, rotY, 0]}>
            <boxGeometry args={[p.width, Math.max(p.y1 - p.y0, 0.01), WALL_T]} />
            <meshStandardMaterial color="#e8dfd0" roughness={0.9} />
          </mesh>
        );
      })}
      <Html position={labelPos} center zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
        <div
          style={{
            background: "rgba(20,22,26,0.82)",
            color: "#fff",
            borderRadius: 6,
            padding: "2px 8px",
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
            direction: "rtl",
          }}
        >
          {labelAr} — {Math.round(seg.length)} سم
        </div>
      </Html>
    </group>
  );
}

export default function RoomPreview3D({
  layout,
  walls,
  ceilingHeight,
  openings,
  className,
  isRTL,
}: {
  layout: KitchenLayout;
  walls: KitchenWall[];
  ceilingHeight: number;
  openings: KitchenOpening[];
  className?: string;
  isRTL?: boolean;
}) {
  const segments = useMemo(() => getWallSegments(layout, walls), [layout, walls]);
  const bounds = useMemo(() => getFloorBounds(segments), [segments]);
  const ceilingM = ceilingHeight * CM;
  const center = new THREE.Vector3(
    ((bounds.minX + bounds.maxX) / 2) * CM,
    0,
    ((bounds.minY + bounds.maxY) / 2) * CM
  );
  const span = Math.max(
    (bounds.maxX - bounds.minX) * CM,
    (bounds.maxY - bounds.minY) * CM,
    2
  );
  const camPos: [number, number, number] = [
    center.x + span * 0.85,
    ceilingM + span * 0.7,
    center.z + span * 1.15,
  ];

  return (
    <div className={className} data-testid="canvas-room-preview-3d">
      <Canvas camera={{ position: camPos, fov: 50, near: 0.05, far: 80 }} gl={{ antialias: true }}>
        <ambientLight intensity={0.85} color="#fff4e4" />
        <directionalLight position={[center.x + 4, 7, center.z + 5]} intensity={0.9} />
        {/* Floor */}
        <mesh
          position={[center.x, -0.005, center.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry
            args={[
              (bounds.maxX - bounds.minX) * CM + WALL_T * 2,
              (bounds.maxY - bounds.minY) * CM + WALL_T * 2,
            ]}
          />
          <meshStandardMaterial color="#cfc4b0" roughness={0.95} />
        </mesh>
        {segments.map((seg) => (
          <PreviewWall
            key={seg.id}
            seg={seg}
            ceilingM={ceilingM}
            openings={openings}
            labelAr={isRTL === false ? wallLabelEn(seg.id) : wallLabelAr(seg.id)}
          />
        ))}
        <OrbitControls
          target={[center.x, ceilingM / 2.5, center.z]}
          maxPolarAngle={Math.PI / 2 + 0.15}
          minDistance={1}
          maxDistance={span * 4}
          enableDamping
        />
      </Canvas>
    </div>
  );
}
