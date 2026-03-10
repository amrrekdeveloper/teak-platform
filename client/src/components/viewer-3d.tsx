import { useRef, useCallback, useState, useEffect, Suspense } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Grid, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Camera, Maximize, RotateCcw, Eye, ArrowUp, ArrowRight, Palette } from "lucide-react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export type WoodMaterial = "oak" | "beech" | "mdf" | "walnut" | "cherry" | "chipboard";
export type ProductType = "kitchen" | "wardrobe" | "door" | "decoration";

export interface CabinetUnit {
  type: "base" | "wall" | "tall";
  width: number;
  height: number;
  depth: number;
  label?: string;
}

export interface WardrobeSpec {
  width: number;
  height: number;
  depth: number;
  shelves: number;
  hasHangingRail: boolean;
  doorType: "hinged" | "sliding";
  sections: number;
}

export interface KitchenSpec {
  wallLength: number;
  units: CabinetUnit[];
  countertopThickness: number;
  countertopOverhang: number;
}

export type DoorPatternType = "plain" | "classic_raised" | "shaker" | "cathedral" | "geometric" | "islamic_arch" | "modern_lines" | "french" | "louver" | "glass_insert";

export interface ProductSpecs {
  productType: ProductType;
  woodType: WoodMaterial;
  kitchen?: KitchenSpec;
  wardrobe?: WardrobeSpec;
  width?: number;
  height?: number;
  depth?: number;
  doorPattern?: DoorPatternType;
  isDoubleDoor?: boolean;
}

export interface FixtureElement3D {
  id: string;
  fixtureType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  color: string;
  label?: string;
}

const MATERIAL_COLORS: Record<WoodMaterial, string> = {
  oak: "#c4913b",
  beech: "#d4b896",
  mdf: "#e8e0d8",
  walnut: "#5c3d2e",
  cherry: "#8b4513",
  chipboard: "#c9b99a",
};

const COUNTERTOP_COLOR = "#808080";
const HANDLE_COLOR = "#a0a0a0";

function getMaterialColor(woodType: WoodMaterial): THREE.Color {
  return new THREE.Color(MATERIAL_COLORS[woodType] || MATERIAL_COLORS.oak);
}

function DimensionLabel({
  position,
  text,
  rotation,
}: {
  position: [number, number, number];
  text: string;
  rotation?: [number, number, number];
}) {
  return (
    <Text
      position={position}
      fontSize={0.06}
      color="#333333"
      anchorX="center"
      anchorY="middle"
      rotation={rotation}
    >
      {text}
    </Text>
  );
}

const S = 1000;

function BaseCabinet({
  position,
  width,
  height,
  depth,
  woodType,
  label,
}: {
  position: [number, number, number];
  width: number;
  height: number;
  depth: number;
  woodType: WoodMaterial;
  label?: string;
}) {
  const color = getMaterialColor(woodType);
  const w = width / S;
  const h = height / S;
  const d = depth / S;

  return (
    <group position={position}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, h / 2, d / 2 + 0.005]} castShadow>
        <boxGeometry args={[w * 0.9, h * 0.85, 0.01]} />
        <meshStandardMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, h * 0.55, d / 2 + 0.015]}>
        <boxGeometry args={[0.08, 0.015, 0.03]} />
        <meshStandardMaterial color={HANDLE_COLOR} metalness={0.8} roughness={0.2} />
      </mesh>
      {label && (
        <DimensionLabel
          position={[0, h + 0.08, 0]}
          text={label}
        />
      )}
      <DimensionLabel
        position={[0, -0.06, d / 2 + 0.05]}
        text={`${width}mm`}
      />
    </group>
  );
}

function WallCabinet({
  position,
  width,
  height,
  depth,
  woodType,
  label,
}: {
  position: [number, number, number];
  width: number;
  height: number;
  depth: number;
  woodType: WoodMaterial;
  label?: string;
}) {
  const color = getMaterialColor(woodType);
  const w = width / S;
  const h = height / S;
  const d = depth / S;

  return (
    <group position={position}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} opacity={0.9} transparent />
      </mesh>
      <mesh position={[0, h / 2, d / 2 + 0.005]} castShadow>
        <boxGeometry args={[w * 0.9, h * 0.85, 0.008]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, h * 0.55, d / 2 + 0.015]}>
        <boxGeometry args={[0.06, 0.012, 0.025]} />
        <meshStandardMaterial color={HANDLE_COLOR} metalness={0.8} roughness={0.2} />
      </mesh>
      {label && (
        <DimensionLabel
          position={[0, h + 0.06, 0]}
          text={label}
        />
      )}
    </group>
  );
}

function TallCabinet({
  position,
  width,
  height,
  depth,
  woodType,
  label,
}: {
  position: [number, number, number];
  width: number;
  height: number;
  depth: number;
  woodType: WoodMaterial;
  label?: string;
}) {
  const color = getMaterialColor(woodType);
  const w = width / S;
  const h = height / S;
  const d = depth / S;

  return (
    <group position={position}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, h * 0.65, d / 2 + 0.005]} castShadow>
        <boxGeometry args={[w * 0.9, h * 0.28, 0.01]} />
        <meshStandardMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, h * 0.3, d / 2 + 0.005]} castShadow>
        <boxGeometry args={[w * 0.9, h * 0.45, 0.01]} />
        <meshStandardMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, h * 0.7, d / 2 + 0.015]}>
        <boxGeometry args={[0.06, 0.012, 0.025]} />
        <meshStandardMaterial color={HANDLE_COLOR} metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, h * 0.35, d / 2 + 0.015]}>
        <boxGeometry args={[0.08, 0.015, 0.03]} />
        <meshStandardMaterial color={HANDLE_COLOR} metalness={0.8} roughness={0.2} />
      </mesh>
      {label && (
        <DimensionLabel
          position={[0, h + 0.08, 0]}
          text={label}
        />
      )}
    </group>
  );
}

function Countertop({
  position,
  width,
  depth,
  thickness,
  overhang,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  thickness: number;
  overhang: number;
}) {
  const w = width / S;
  const d = (depth + overhang) / S;
  const t = thickness / S;

  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={[w, t, d]} />
      <meshStandardMaterial color={COUNTERTOP_COLOR} roughness={0.3} metalness={0.1} />
    </mesh>
  );
}

function KitchenScene({ specs, woodType }: { specs: KitchenSpec; woodType: WoodMaterial }) {
  let xOffset = 0;
  const baseUnits = specs.units.filter((u) => u.type === "base");
  const wallUnits = specs.units.filter((u) => u.type === "wall");
  const tallUnits = specs.units.filter((u) => u.type === "tall");

  const totalBaseWidth = baseUnits.reduce((sum, u) => sum + u.width, 0);
  const startX = -totalBaseWidth / (S * 2);

  const baseElements: JSX.Element[] = [];
  xOffset = 0;
  for (let i = 0; i < baseUnits.length; i++) {
    const unit = baseUnits[i];
    const x = startX + xOffset / S + unit.width / (S * 2);
    baseElements.push(
      <BaseCabinet
        key={`base-${i}`}
        position={[x, 0, 0]}
        width={unit.width}
        height={unit.height}
        depth={unit.depth}
        woodType={woodType}
        label={unit.label}
      />
    );
    xOffset += unit.width;
  }

  const countertopY = (baseUnits[0]?.height || 850) / S;
  const countertopWidth = totalBaseWidth + (specs.countertopOverhang || 25);
  const countertopDepth = (baseUnits[0]?.depth || 600);

  const wallElements: JSX.Element[] = [];
  xOffset = 0;
  const wallStartX = wallUnits.length > 0
    ? -wallUnits.reduce((s, u) => s + u.width, 0) / (S * 2)
    : startX;
  for (let i = 0; i < wallUnits.length; i++) {
    const unit = wallUnits[i];
    const x = wallStartX + xOffset / S + unit.width / (S * 2);
    const wallMountHeight = 1.4;
    wallElements.push(
      <WallCabinet
        key={`wall-${i}`}
        position={[x, wallMountHeight, 0.12]}
        width={unit.width}
        height={unit.height}
        depth={unit.depth}
        woodType={woodType}
        label={unit.label}
      />
    );
    xOffset += unit.width;
  }

  const tallElements: JSX.Element[] = [];
  const tallX = startX + totalBaseWidth / S + 0.05;
  for (let i = 0; i < tallUnits.length; i++) {
    const unit = tallUnits[i];
    tallElements.push(
      <TallCabinet
        key={`tall-${i}`}
        position={[tallX + (i * unit.width) / S, 0, 0]}
        width={unit.width}
        height={unit.height}
        depth={unit.depth}
        woodType={woodType}
        label={unit.label}
      />
    );
  }

  return (
    <group>
      {baseElements}
      {wallElements}
      {tallElements}
      {baseUnits.length > 0 && (
        <Countertop
          position={[0, countertopY + (specs.countertopThickness || 30) / (S * 2), -0.01]}
          width={countertopWidth}
          depth={countertopDepth}
          thickness={specs.countertopThickness || 30}
          overhang={specs.countertopOverhang || 25}
        />
      )}
      <DimensionLabel
        position={[0, -0.12, countertopDepth / (S * 2) + 0.1]}
        text={`${totalBaseWidth}mm total width`}
      />
    </group>
  );
}

function WardrobeScene({ specs, woodType }: { specs: WardrobeSpec; woodType: WoodMaterial }) {
  const color = getMaterialColor(woodType);
  const w = specs.width / S;
  const h = specs.height / S;
  const d = specs.depth / S;
  const panelThickness = 0.018;
  const sectionWidth = (w - panelThickness * (specs.sections + 1)) / specs.sections;

  return (
    <group position={[0, 0, 0]}>
      <mesh position={[-w / 2 + panelThickness / 2, h / 2, 0]} castShadow>
        <boxGeometry args={[panelThickness, h, d]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[w / 2 - panelThickness / 2, h / 2, 0]} castShadow>
        <boxGeometry args={[panelThickness, h, d]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, h - panelThickness / 2, 0]} castShadow>
        <boxGeometry args={[w, panelThickness, d]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, panelThickness / 2, 0]} castShadow>
        <boxGeometry args={[w, panelThickness, d]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, h + panelThickness, 0]} castShadow>
        <boxGeometry args={[w + 0.02, panelThickness * 2, d + 0.02]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {Array.from({ length: specs.sections - 1 }).map((_, i) => {
        const x = -w / 2 + panelThickness + (i + 1) * (sectionWidth + panelThickness);
        return (
          <mesh key={`divider-${i}`} position={[x, h / 2, 0]} castShadow>
            <boxGeometry args={[panelThickness, h - panelThickness * 2, d - 0.01]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}

      {Array.from({ length: specs.sections }).map((_, si) => {
        const sectionX = -w / 2 + panelThickness + si * (sectionWidth + panelThickness) + sectionWidth / 2;
        const shelves: JSX.Element[] = [];

        if (specs.hasHangingRail && si === 0) {
          const railHeight = h * 0.75;
          shelves.push(
            <mesh key={`rail-${si}`} position={[sectionX, railHeight, 0]} castShadow>
              <cylinderGeometry args={[0.012, 0.012, sectionWidth - 0.02, 16]} />
              <meshStandardMaterial color={HANDLE_COLOR} metalness={0.8} roughness={0.2} />
            </mesh>
          );
          shelves.push(
            <mesh key={`rail-shelf-${si}`} position={[sectionX, railHeight + 0.05, 0]} castShadow>
              <boxGeometry args={[sectionWidth - 0.01, panelThickness, d - 0.02]} />
              <meshStandardMaterial color={color} />
            </mesh>
          );
        } else {
          for (let sh = 0; sh < specs.shelves; sh++) {
            const shelfY = panelThickness + ((h - panelThickness * 2) / (specs.shelves + 1)) * (sh + 1);
            shelves.push(
              <mesh key={`shelf-${si}-${sh}`} position={[sectionX, shelfY, 0]} castShadow>
                <boxGeometry args={[sectionWidth - 0.01, panelThickness, d - 0.02]} />
                <meshStandardMaterial color={color} />
              </mesh>
            );
          }
        }
        return <group key={`section-${si}`}>{shelves}</group>;
      })}

      {specs.doorType === "hinged" &&
        Array.from({ length: specs.sections }).map((_, i) => {
          const doorX = -w / 2 + panelThickness + i * (sectionWidth + panelThickness) + sectionWidth / 2;
          return (
            <group key={`door-${i}`}>
              <mesh position={[doorX, h / 2, d / 2 + 0.005]} castShadow>
                <boxGeometry args={[sectionWidth - 0.005, h - panelThickness * 3, 0.01]} />
                <meshStandardMaterial color={color} opacity={0.95} transparent />
              </mesh>
              <mesh position={[doorX, h * 0.5, d / 2 + 0.02]}>
                <boxGeometry args={[0.06, 0.012, 0.025]} />
                <meshStandardMaterial color={HANDLE_COLOR} metalness={0.8} roughness={0.2} />
              </mesh>
            </group>
          );
        })}

      {specs.doorType === "sliding" && (
        <group>
          <mesh position={[-sectionWidth / 4, h / 2, d / 2 + 0.008]} castShadow>
            <boxGeometry args={[w / 2 - 0.01, h - panelThickness * 3, 0.008]} />
            <meshStandardMaterial color={color} opacity={0.9} transparent />
          </mesh>
          <mesh position={[sectionWidth / 4, h / 2, d / 2 + 0.018]} castShadow>
            <boxGeometry args={[w / 2 - 0.01, h - panelThickness * 3, 0.008]} />
            <meshStandardMaterial color={color} opacity={0.85} transparent />
          </mesh>
          <mesh position={[0, h * 0.5, d / 2 + 0.03]}>
            <cylinderGeometry args={[0.015, 0.015, 0.04, 16]} />
            <meshStandardMaterial color={HANDLE_COLOR} metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      )}

      <DimensionLabel position={[0, -0.1, d / 2 + 0.08]} text={`${specs.width} x ${specs.height} x ${specs.depth} mm`} />
      <DimensionLabel position={[0, h + 0.15, 0]} text={`Wardrobe - ${specs.sections} sections`} />
    </group>
  );
}

function DoorPatternGeometry({
  w,
  h,
  d,
  pattern,
  color,
  isDouble,
}: {
  w: number;
  h: number;
  d: number;
  pattern: DoorPatternType;
  color: THREE.Color;
  isDouble?: boolean;
}) {
  const panelZ = d / 2 + 0.003;
  const frameW = w * 0.08;
  const darkerColor = color.clone().multiplyScalar(0.85);
  const lighterColor = color.clone().multiplyScalar(1.1);

  const renderLeaf = (offsetX: number, leafW: number) => {
    const elements: JSX.Element[] = [];
    const key = `leaf-${offsetX}`;

    switch (pattern) {
      case "classic_raised":
        elements.push(
          <mesh key={`${key}-frame`} position={[offsetX, h / 2, panelZ]}>
            <boxGeometry args={[leafW, h * 0.95, 0.004]} />
            <meshStandardMaterial color={darkerColor} />
          </mesh>,
          <mesh key={`${key}-panel`} position={[offsetX, h / 2, panelZ + 0.005]}>
            <boxGeometry args={[leafW * 0.7, h * 0.75, 0.006]} />
            <meshStandardMaterial color={lighterColor} />
          </mesh>
        );
        break;
      case "shaker":
        elements.push(
          <mesh key={`${key}-bg`} position={[offsetX, h / 2, panelZ]}>
            <boxGeometry args={[leafW, h * 0.95, 0.004]} />
            <meshStandardMaterial color={color} />
          </mesh>,
          <mesh key={`${key}-inner`} position={[offsetX, h / 2, panelZ + 0.003]}>
            <boxGeometry args={[leafW * 0.75, h * 0.8, 0.003]} />
            <meshStandardMaterial color={darkerColor} />
          </mesh>
        );
        break;
      case "modern_lines":
        elements.push(
          <mesh key={`${key}-bg`} position={[offsetX, h / 2, panelZ]}>
            <boxGeometry args={[leafW, h * 0.95, 0.004]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
        for (let i = 0; i < 4; i++) {
          const lineY = h * 0.2 + (h * 0.6 / 3) * i;
          elements.push(
            <mesh key={`${key}-line-${i}`} position={[offsetX, lineY, panelZ + 0.004]}>
              <boxGeometry args={[leafW * 0.85, 0.003, 0.002]} />
              <meshStandardMaterial color={darkerColor} />
            </mesh>
          );
        }
        break;
      case "french":
        elements.push(
          <mesh key={`${key}-bg`} position={[offsetX, h / 2, panelZ]}>
            <boxGeometry args={[leafW, h * 0.95, 0.004]} />
            <meshStandardMaterial color={darkerColor} />
          </mesh>,
          <mesh key={`${key}-top`} position={[offsetX, h * 0.72, panelZ + 0.005]}>
            <boxGeometry args={[leafW * 0.7, h * 0.35, 0.005]} />
            <meshStandardMaterial color={lighterColor} />
          </mesh>,
          <mesh key={`${key}-bot`} position={[offsetX, h * 0.3, panelZ + 0.005]}>
            <boxGeometry args={[leafW * 0.7, h * 0.35, 0.005]} />
            <meshStandardMaterial color={lighterColor} />
          </mesh>
        );
        break;
      case "louver":
        elements.push(
          <mesh key={`${key}-bg`} position={[offsetX, h / 2, panelZ]}>
            <boxGeometry args={[leafW, h * 0.95, 0.004]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
        const slatCount = Math.floor(h / 0.025);
        for (let i = 0; i < Math.min(slatCount, 30); i++) {
          const slatY = h * 0.08 + (h * 0.84 / slatCount) * i;
          elements.push(
            <mesh key={`${key}-slat-${i}`} position={[offsetX, slatY, panelZ + 0.004]} rotation={[0.15, 0, 0]}>
              <boxGeometry args={[leafW * 0.85, 0.008, 0.003]} />
              <meshStandardMaterial color={darkerColor} />
            </mesh>
          );
        }
        break;
      case "glass_insert":
        elements.push(
          <mesh key={`${key}-bg`} position={[offsetX, h / 2, panelZ]}>
            <boxGeometry args={[leafW, h * 0.95, 0.004]} />
            <meshStandardMaterial color={color} />
          </mesh>,
          <mesh key={`${key}-glass`} position={[offsetX, h * 0.55, panelZ + 0.003]}>
            <boxGeometry args={[leafW * 0.65, h * 0.5, 0.003]} />
            <meshStandardMaterial color="#b8d4e3" opacity={0.4} transparent metalness={0.3} roughness={0.1} />
          </mesh>
        );
        break;
      case "geometric":
        elements.push(
          <mesh key={`${key}-bg`} position={[offsetX, h / 2, panelZ]}>
            <boxGeometry args={[leafW, h * 0.95, 0.004]} />
            <meshStandardMaterial color={color} />
          </mesh>,
          <mesh key={`${key}-diamond`} position={[offsetX, h * 0.5, panelZ + 0.005]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[leafW * 0.4, leafW * 0.4, 0.004]} />
            <meshStandardMaterial color={darkerColor} />
          </mesh>
        );
        break;
      case "islamic_arch":
        elements.push(
          <mesh key={`${key}-bg`} position={[offsetX, h / 2, panelZ]}>
            <boxGeometry args={[leafW, h * 0.95, 0.004]} />
            <meshStandardMaterial color={darkerColor} />
          </mesh>,
          <mesh key={`${key}-arch-body`} position={[offsetX, h * 0.4, panelZ + 0.005]}>
            <boxGeometry args={[leafW * 0.65, h * 0.55, 0.005]} />
            <meshStandardMaterial color={lighterColor} />
          </mesh>,
          <mesh key={`${key}-arch-top`} position={[offsetX, h * 0.72, panelZ + 0.005]}>
            <cylinderGeometry args={[leafW * 0.325, leafW * 0.325, 0.005, 16, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color={lighterColor} />
          </mesh>
        );
        break;
      case "cathedral":
        elements.push(
          <mesh key={`${key}-bg`} position={[offsetX, h / 2, panelZ]}>
            <boxGeometry args={[leafW, h * 0.95, 0.004]} />
            <meshStandardMaterial color={darkerColor} />
          </mesh>,
          <mesh key={`${key}-lower`} position={[offsetX, h * 0.35, panelZ + 0.005]}>
            <boxGeometry args={[leafW * 0.7, h * 0.45, 0.005]} />
            <meshStandardMaterial color={lighterColor} />
          </mesh>,
          <mesh key={`${key}-upper`} position={[offsetX, h * 0.72, panelZ + 0.005]}>
            <boxGeometry args={[leafW * 0.6, h * 0.2, 0.005]} />
            <meshStandardMaterial color={lighterColor} />
          </mesh>
        );
        break;
      default:
        elements.push(
          <mesh key={`${key}-plain`} position={[offsetX, h / 2, panelZ]}>
            <boxGeometry args={[leafW * 0.95, h * 0.95, 0.005]} />
            <meshStandardMaterial color={color} toneMapped={false} />
          </mesh>
        );
    }
    return elements;
  };

  if (isDouble) {
    const leafW = w * 0.48;
    return (
      <group>
        {renderLeaf(-leafW / 2 - 0.002, leafW)}
        {renderLeaf(leafW / 2 + 0.002, leafW)}
      </group>
    );
  }

  return <group>{renderLeaf(0, w * 0.95)}</group>;
}

function GenericBoxScene({
  width,
  height,
  depth,
  woodType,
  productType,
  doorPattern,
  isDoubleDoor,
}: {
  width: number;
  height: number;
  depth: number;
  woodType: WoodMaterial;
  productType: ProductType;
  doorPattern?: DoorPatternType;
  isDoubleDoor?: boolean;
}) {
  const color = getMaterialColor(woodType);
  const w = width / S;
  const h = height / S;
  const d = depth / S;

  const typeLabels: Record<ProductType, string> = {
    kitchen: "Kitchen Unit",
    wardrobe: "Wardrobe",
    door: "Door",
    decoration: "Decoration",
  };

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {productType === "door" && (
        <>
          <DoorPatternGeometry
            w={w}
            h={h}
            d={d}
            pattern={doorPattern || "plain"}
            color={color}
            isDouble={isDoubleDoor}
          />
          <mesh position={[isDoubleDoor ? 0 : w * 0.35, h * 0.5, d / 2 + 0.02]}>
            <sphereGeometry args={[0.015, 16, 16]} />
            <meshStandardMaterial color={HANDLE_COLOR} metalness={0.8} roughness={0.2} />
          </mesh>
          {isDoubleDoor && (
            <mesh position={[0, h * 0.5, d / 2 + 0.02]}>
              <boxGeometry args={[0.004, h * 0.9, 0.004]} />
              <meshStandardMaterial color={HANDLE_COLOR} metalness={0.6} roughness={0.3} />
            </mesh>
          )}
        </>
      )}
      <DimensionLabel position={[0, -0.1, d / 2 + 0.08]} text={`${width} x ${height} x ${depth} mm`} />
      <DimensionLabel position={[0, h + 0.1, 0]} text={typeLabels[productType]} />
    </group>
  );
}

function TreeFixture3D({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.15 * scale, 0]}>
        <cylinderGeometry args={[0.02 * scale, 0.03 * scale, 0.3 * scale, 8]} />
        <meshStandardMaterial color="#6b4423" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.4 * scale, 0]}>
        <sphereGeometry args={[0.18 * scale, 12, 12]} />
        <meshStandardMaterial color="#228B22" roughness={0.7} />
      </mesh>
      <mesh position={[0.08 * scale, 0.32 * scale, 0.05 * scale]}>
        <sphereGeometry args={[0.12 * scale, 10, 10]} />
        <meshStandardMaterial color="#2d8f2d" roughness={0.7} />
      </mesh>
      <mesh position={[-0.06 * scale, 0.35 * scale, -0.04 * scale]}>
        <sphereGeometry args={[0.1 * scale, 10, 10]} />
        <meshStandardMaterial color="#1e7a1e" roughness={0.7} />
      </mesh>
    </group>
  );
}

function PlantFixture3D({ position, color, scale = 1 }: { position: [number, number, number]; color: string; scale?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.06 * scale, 0]}>
        <cylinderGeometry args={[0.08 * scale, 0.06 * scale, 0.12 * scale, 12]} />
        <meshStandardMaterial color="#8B4513" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.18 * scale, 0]}>
        <coneGeometry args={[0.14 * scale, 0.22 * scale, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0.05 * scale, 0.22 * scale, 0.03 * scale]}>
        <sphereGeometry args={[0.08 * scale, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  );
}

function ApplianceFixture3D({ position, color, size, label }: { position: [number, number, number]; color: string; size: [number, number, number]; label?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, size[1] / 2, 0]}>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
      </mesh>
      {label && (
        <Text position={[0, size[1] + 0.05, 0]} fontSize={0.06} color="#333" anchorX="center" anchorY="bottom">
          {label}
        </Text>
      )}
    </group>
  );
}

function FurnitureFixture3D({ position, color, size }: { position: [number, number, number]; color: string; size: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, size[1] / 2, 0]}>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </group>
  );
}

const PLANT_FIXTURE_IDS = new Set(["palm_tree", "fern", "monstera", "cactus", "bonsai", "bamboo", "ivy"]);
const APPLIANCE_FIXTURE_IDS = new Set(["sink", "stove", "oven", "fridge", "dishwasher", "microwave", "range_hood", "washing_machine"]);
const FURNITURE_FIXTURE_IDS = new Set(["dining_table", "chair", "sofa", "coffee_table", "tv_unit", "bookshelf", "bed", "desk"]);

function FixtureScene3D({ fixtures, canvasSize, roomDimensions }: { fixtures: FixtureElement3D[]; canvasSize: { width: number; height: number }; roomDimensions?: { width: number; height: number } }) {
  if (!fixtures.length) return null;

  const roomW = roomDimensions ? roomDimensions.width / 1000 : 5;
  const roomH = roomDimensions ? roomDimensions.height / 1000 : 4;

  return (
    <group>
      {fixtures.map((f) => {
        const nx = f.x / canvasSize.width;
        const ny = f.y / canvasSize.height;
        const x3d = (nx - 0.5) * roomW;
        const z3d = (ny - 0.5) * roomH;
        const sizeW = (f.width / canvasSize.width) * roomW;
        const sizeH = (f.height / canvasSize.height) * roomH;
        const avgSize = (sizeW + sizeH) / 2;
        const scale = Math.max(0.5, Math.min(2, avgSize / 0.3));

        if (PLANT_FIXTURE_IDS.has(f.fixtureType)) {
          if (f.fixtureType === "palm_tree" || f.fixtureType === "bonsai") {
            return <TreeFixture3D key={f.id} position={[x3d, 0, z3d]} scale={scale} />;
          }
          return <PlantFixture3D key={f.id} position={[x3d, 0, z3d]} color={f.color} scale={scale} />;
        }

        if (APPLIANCE_FIXTURE_IDS.has(f.fixtureType)) {
          const appH = f.fixtureType === "fridge" ? 0.6 : 0.3;
          return <ApplianceFixture3D key={f.id} position={[x3d, 0, z3d]} color={f.color || "#d4d4d8"} size={[sizeW * 0.8, appH, sizeH * 0.8]} label={f.label} />;
        }

        if (FURNITURE_FIXTURE_IDS.has(f.fixtureType)) {
          return <FurnitureFixture3D key={f.id} position={[x3d, 0, z3d]} color={f.color || "#8B4513"} size={[sizeW * 0.8, 0.25, sizeH * 0.8]} />;
        }

        return <PlantFixture3D key={f.id} position={[x3d, 0, z3d]} color={f.color || "#22c55e"} scale={scale * 0.8} />;
      })}
    </group>
  );
}

function SceneContent({ specs, fixtures, canvasSize, roomDimensions }: { specs: ProductSpecs; fixtures?: FixtureElement3D[]; canvasSize?: { width: number; height: number }; roomDimensions?: { width: number; height: number } }) {
  const fixtureScene = fixtures && fixtures.length > 0 && canvasSize ? (
    <FixtureScene3D fixtures={fixtures} canvasSize={canvasSize} roomDimensions={roomDimensions} />
  ) : null;

  if (specs.productType === "kitchen" && specs.kitchen) {
    return <>{<KitchenScene specs={specs.kitchen} woodType={specs.woodType} />}{fixtureScene}</>;
  }

  if (specs.productType === "wardrobe" && specs.wardrobe) {
    return <>{<WardrobeScene specs={specs.wardrobe} woodType={specs.woodType} />}{fixtureScene}</>;
  }

  return (
    <>
      <GenericBoxScene
        width={specs.width || 800}
        height={specs.height || 2100}
        depth={specs.depth || 40}
        woodType={specs.woodType}
        productType={specs.productType}
        doorPattern={specs.doorPattern}
        isDoubleDoor={specs.isDoubleDoor}
      />
      {fixtureScene}
    </>
  );
}

type CameraPreset = "front" | "side" | "top" | "panoramic";

const CAMERA_PRESETS: Record<Exclude<CameraPreset, "panoramic">, { position: [number, number, number]; target: [number, number, number] }> = {
  front: { position: [0, 1, 3], target: [0, 0.5, 0] },
  side: { position: [3, 1, 0], target: [0, 0.5, 0] },
  top: { position: [0, 4, 0.01], target: [0, 0.5, 0] },
};

function CameraController({
  preset,
  autoRotate,
  controlsRef,
}: {
  preset: CameraPreset | null;
  autoRotate: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const animating = useRef(false);
  const animStart = useRef(0);
  const startPos = useRef(new THREE.Vector3());
  const endPos = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!preset || preset === "panoramic") return;
    const target = CAMERA_PRESETS[preset];
    startPos.current.copy(camera.position);
    endPos.current.set(...target.position);
    animStart.current = performance.now();
    animating.current = true;
    if (controlsRef.current) {
      controlsRef.current.target.set(...target.target);
    }
  }, [preset, camera, controlsRef]);

  useFrame(() => {
    if (animating.current) {
      const elapsed = (performance.now() - animStart.current) / 600;
      const t = Math.min(elapsed, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(startPos.current, endPos.current, eased);
      if (t >= 1) animating.current = false;
      controlsRef.current?.update();
    }
  });

  return null;
}

function AutoRotator({ active, controlsRef }: { active: boolean; controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  useFrame(() => {
    if (!active || !controlsRef.current) return;
    const controls = controlsRef.current;
    const azimuth = controls.getAzimuthalAngle();
    controls.setAzimuthalAngle(azimuth + 0.005);
    controls.update();
  });
  return null;
}

function ScreenshotHelper({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const { gl, scene, camera } = useThree();

  const capture = useCallback(() => {
    gl.render(scene, camera);
    const dataUrl = gl.domElement.toDataURL("image/png");
    onCapture(dataUrl);
  }, [gl, scene, camera, onCapture]);

  (window as any).__viewer3dCapture = capture;

  return null;
}

interface Viewer3DProps {
  specs: ProductSpecs;
  fixtures?: FixtureElement3D[];
  canvasSize?: { width: number; height: number };
  roomDimensions?: { width: number; height: number };
  onScreenshot?: (dataUrl: string) => void;
  className?: string;
}

export default function Viewer3D({ specs, fixtures, canvasSize, roomDimensions, onScreenshot, className }: Viewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [materialIndex, setMaterialIndex] = useState(0);

  const woodTypes: WoodMaterial[] = ["oak", "beech", "mdf", "walnut", "cherry", "chipboard"];
  const currentWoodOverride = woodTypes[materialIndex % woodTypes.length];

  const handlePreset = useCallback((preset: CameraPreset) => {
    if (preset === "panoramic") {
      setAutoRotate((prev) => !prev);
      setCameraPreset(null);
    } else {
      setAutoRotate(false);
      setCameraPreset(preset);
    }
  }, []);

  const handleScreenshot = useCallback(() => {
    const captureFn = (window as any).__viewer3dCapture;
    if (captureFn) {
      captureFn();
    }
  }, []);

  const handleCapture = useCallback(
    (dataUrl: string) => {
      if (onScreenshot) {
        onScreenshot(dataUrl);
      } else {
        const link = document.createElement("a");
        link.download = "3d-view.png";
        link.href = dataUrl;
        link.click();
      }
    },
    [onScreenshot]
  );

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const cycleMaterial = useCallback(() => {
    setMaterialIndex((prev) => prev + 1);
  }, []);

  const displaySpecs = { ...specs, woodType: currentWoodOverride };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className || ""}`}
      style={{ minHeight: 400, background: "linear-gradient(180deg, #f0f4f8 0%, #e2e8f0 100%)" }}
      data-testid="viewer-3d-container"
    >
      <Canvas
        ref={canvasRef}
        shadows
        camera={{ position: [2, 1.5, 2.5], fov: 45 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.6} />
          <hemisphereLight intensity={0.4} color="#ffffff" groundColor="#8d7c6a" />
          <directionalLight
            position={[5, 8, 5]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-bias={-0.0001}
          />
          <directionalLight position={[-3, 4, -2]} intensity={0.4} />
          <pointLight position={[0, 3, 3]} intensity={0.3} color="#ffeedd" />

          <SceneContent specs={displaySpecs} fixtures={fixtures} canvasSize={canvasSize} roomDimensions={roomDimensions} />

          <ContactShadows
            position={[0, -0.01, 0]}
            opacity={0.4}
            scale={10}
            blur={2}
            far={4}
          />

          <Grid
            position={[0, -0.001, 0]}
            args={[10, 10]}
            cellSize={0.1}
            cellThickness={0.5}
            cellColor="#c0c0c0"
            sectionSize={1}
            sectionThickness={1}
            sectionColor="#909090"
            fadeDistance={8}
            infiniteGrid
          />

          <OrbitControls
            ref={controlsRef}
            makeDefault
            enablePan
            enableZoom
            enableRotate
            minDistance={0.5}
            maxDistance={15}
            target={[0, 0.5, 0]}
            enableDamping
            dampingFactor={0.1}
            touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
          />

          <CameraController preset={cameraPreset} autoRotate={autoRotate} controlsRef={controlsRef} />
          <AutoRotator active={autoRotate} controlsRef={controlsRef} />

          <ScreenshotHelper onCapture={handleCapture} />
        </Suspense>
      </Canvas>

      <div className="absolute top-3 left-3 flex flex-col gap-1" data-testid="camera-presets-panel">
        <Button
          size="icon"
          variant="secondary"
          onClick={() => handlePreset("front")}
          title="Front View"
          data-testid="button-camera-front"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          onClick={() => handlePreset("side")}
          title="Side View"
          data-testid="button-camera-side"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          onClick={() => handlePreset("top")}
          title="Top View"
          data-testid="button-camera-top"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant={autoRotate ? "default" : "secondary"}
          onClick={() => handlePreset("panoramic")}
          title="Panoramic (360° Auto-Rotate)"
          data-testid="button-camera-panoramic"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <Button
          size="icon"
          variant="secondary"
          onClick={handleScreenshot}
          data-testid="button-screenshot-3d"
        >
          <Camera className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          onClick={cycleMaterial}
          title={`Material: ${currentWoodOverride}`}
          data-testid="button-cycle-material"
        >
          <Palette className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          onClick={toggleFullscreen}
          title="Fullscreen"
          data-testid="button-fullscreen-3d"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>

      {autoRotate && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-sm rounded-md px-3 py-1 text-xs text-muted-foreground" data-testid="text-panoramic-indicator">
          360° Panoramic View
        </div>
      )}

      <div className="absolute bottom-3 right-3 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 text-xs text-muted-foreground" data-testid="text-material-label">
        {currentWoodOverride.charAt(0).toUpperCase() + currentWoodOverride.slice(1)}
      </div>
    </div>
  );
}
