import { useRef, useCallback, Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Grid } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";

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

export interface ProductSpecs {
  productType: ProductType;
  woodType: WoodMaterial;
  kitchen?: KitchenSpec;
  wardrobe?: WardrobeSpec;
  width?: number;
  height?: number;
  depth?: number;
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

function GenericBoxScene({
  width,
  height,
  depth,
  woodType,
  productType,
}: {
  width: number;
  height: number;
  depth: number;
  woodType: WoodMaterial;
  productType: ProductType;
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
          <mesh position={[0, h / 2, d / 2 + 0.003]}>
            <boxGeometry args={[w * 0.85, h * 0.9, 0.005]} />
            <meshStandardMaterial color={color} toneMapped={false} />
          </mesh>
          <mesh position={[w * 0.35, h * 0.5, d / 2 + 0.015]}>
            <sphereGeometry args={[0.02, 16, 16]} />
            <meshStandardMaterial color={HANDLE_COLOR} metalness={0.8} roughness={0.2} />
          </mesh>
        </>
      )}
      <DimensionLabel position={[0, -0.1, d / 2 + 0.08]} text={`${width} x ${height} x ${depth} mm`} />
      <DimensionLabel position={[0, h + 0.1, 0]} text={typeLabels[productType]} />
    </group>
  );
}

function SceneContent({ specs }: { specs: ProductSpecs }) {
  if (specs.productType === "kitchen" && specs.kitchen) {
    return <KitchenScene specs={specs.kitchen} woodType={specs.woodType} />;
  }

  if (specs.productType === "wardrobe" && specs.wardrobe) {
    return <WardrobeScene specs={specs.wardrobe} woodType={specs.woodType} />;
  }

  return (
    <GenericBoxScene
      width={specs.width || 80}
      height={specs.height || 210}
      depth={specs.depth || 10}
      woodType={specs.woodType}
      productType={specs.productType}
    />
  );
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
  onScreenshot?: (dataUrl: string) => void;
  className?: string;
}

export default function Viewer3D({ specs, onScreenshot, className }: Viewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  return (
    <div
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
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[5, 8, 5]}
            intensity={1}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <directionalLight position={[-3, 4, -2]} intensity={0.3} />

          <SceneContent specs={specs} />

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
            makeDefault
            enablePan
            enableZoom
            enableRotate
            minDistance={0.5}
            maxDistance={15}
            target={[0, 0.5, 0]}
          />

          <ScreenshotHelper onCapture={handleCapture} />
        </Suspense>
      </Canvas>

      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <Button
          size="icon"
          variant="secondary"
          onClick={handleScreenshot}
          data-testid="button-screenshot-3d"
        >
          <Camera className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
