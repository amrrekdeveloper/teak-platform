/**
 * Kitchen Designer V2 — Empty 3D room preview.
 * Route: /kitchen-designer-v2/room-preview
 * Renders ONLY from RoomV2 (never from V1 answers/state).
 */
import { useMemo, useEffect } from "react";
import { Link } from "wouter";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { useKitchenToolV2Store } from "@/components/kitchen-tool-v2/store";
import { type RoomV2, type RoomWallV2, roomBounds } from "@/components/kitchen-tool-v2/room-model";
import {
  WALL_MATERIALS_V2,
  FLOOR_MATERIALS_V2,
  findMaterialV2,
  repeatForSurface,
  type MaterialDefV2,
} from "@/components/kitchen-tool-v2/materials-v2";
import { V2Gate } from "@/components/kitchen-tool-v2/v2-gate";

const MM = 0.001; // mm → meters
const WALL_THICKNESS_MM = 100;

function useSurfaceTexture(def: MaterialDefV2 | undefined, wMm: number, hMm: number) {
  const texture = useMemo(() => {
    if (!def?.makeTexture) return null;
    const tex = def.makeTexture();
    const rep = repeatForSurface(def, wMm, hMm);
    if (rep) tex.repeat.set(rep.x, rep.y);
    return tex;
  }, [def?.id, wMm, hMm]);
  useEffect(() => () => { texture?.dispose(); }, [texture]);
  return texture;
}

function WallMesh({ wall, materialDef }: { wall: RoomWallV2; materialDef: MaterialDefV2 | undefined }) {
  const cx = (wall.start.xMm + wall.end.xMm) / 2;
  const cz = (wall.start.zMm + wall.end.zMm) / 2;
  const angle = Math.atan2(wall.end.zMm - wall.start.zMm, wall.end.xMm - wall.start.xMm);
  // Offset wall body half a thickness OUTWARD (opposite inward normal)
  const ox = -wall.inwardNormal.xMm * (WALL_THICKNESS_MM / 2);
  const oz = -wall.inwardNormal.zMm * (WALL_THICKNESS_MM / 2);
  return (
    <group
      position={[(cx + ox) * MM, (wall.heightMm / 2) * MM, (cz + oz) * MM]}
      rotation={[0, -angle, 0]}
    >
      <mesh>
        <boxGeometry args={[wall.lengthMm * MM, wall.heightMm * MM, WALL_THICKNESS_MM * MM]} />
        <meshStandardMaterial
          color={materialDef?.baseColor ?? "#eeeeee"}
          roughness={materialDef?.roughness ?? 0.9}
          metalness={materialDef?.metalness ?? 0}
        />
      </mesh>
    </group>
  );
}

function FloorMesh({ room, materialDef }: { room: RoomV2; materialDef: MaterialDefV2 | undefined }) {
  const b = roomBounds(room);
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const texture = useSurfaceTexture(materialDef, w, d);
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
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]} scale={[1, 1, 1]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial
        side={THREE.DoubleSide}
        color={materialDef?.baseColor ?? "#ddd"}
        roughness={materialDef?.roughness ?? 0.5}
        metalness={0}
        map={texture ?? undefined}
      />
    </mesh>
  );
}

function CeilingMesh({ room }: { room: RoomV2 }) {
  const b = roomBounds(room);
  const w = (b.maxX - b.minX) * MM;
  const d = (b.maxZ - b.minZ) * MM;
  return (
    <mesh
      rotation={[Math.PI / 2, 0, 0]}
      position={[(b.minX + b.maxX) / 2 * MM, room.ceilingHeightMm * MM, (b.minZ + b.maxZ) / 2 * MM]}
    >
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color="#f5f2ec" roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}

function WallLabel({ wall }: { wall: RoomWallV2 }) {
  const cx = (wall.start.xMm + wall.end.xMm) / 2;
  const cz = (wall.start.zMm + wall.end.zMm) / 2;
  const inX = wall.inwardNormal.xMm;
  const inZ = wall.inwardNormal.zMm;
  const label = `${wall.id} — ${(wall.lengthMm / 10).toFixed(0)} cm`;
  return (
    <Text
      position={[(cx + inX * 250) * MM, (wall.heightMm + 200) * MM, (cz + inZ * 250) * MM]}
      fontSize={0.22}
      color="#8a6d3b"
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.008}
      outlineColor="#ffffff"
    >
      {label}
    </Text>
  );
}

function RoomScene({ room, wallMat, floorMat, showCeiling }: {
  room: RoomV2;
  wallMat: MaterialDefV2 | undefined;
  floorMat: MaterialDefV2 | undefined;
  showCeiling: boolean;
}) {
  return (
    <group>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 3]} intensity={0.9} />
      <directionalLight position={[-4, 5, -2]} intensity={0.35} />
      <FloorMesh room={room} materialDef={floorMat} />
      {room.walls.map((w) => (
        <WallMesh key={w.id} wall={w} materialDef={wallMat} />
      ))}
      {room.walls.map((w) => (
        <WallLabel key={`label-${w.id}`} wall={w} />
      ))}
      {showCeiling && <CeilingMesh room={room} />}
    </group>
  );
}

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

  const wallMat = findMaterialV2(s.wallMaterialId);
  const floorMat = findMaterialV2(s.floorMaterialId);

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

  const b = roomBounds(room);
  const centerX = ((b.minX + b.maxX) / 2) * MM;
  const centerZ = ((b.minZ + b.maxZ) / 2) * MM;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * MM;

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="border-b px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/kitchen-designer-v2/space">
            <Button variant="ghost" size="sm" className="gap-1" data-testid="button-v2-back">
              <ArrowRight className="w-4 h-4 ltr:rotate-180" />
              {t("رجوع", "Back")}
            </Button>
          </Link>
          <h1 className="font-bold" data-testid="text-v2-preview-title">
            {t("معاينة الغرفة الفارغة", "Empty Room Preview")}
          </h1>
          <Badge variant="outline">{t("تجريبي", "Experimental")}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={s.showCeiling} onCheckedChange={s.setShowCeiling} data-testid="switch-v2-ceiling" />
            <Label className="text-xs">{t("السقف", "Ceiling")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={s.cameraMode === "top"}
              onCheckedChange={(v) => s.setCameraMode(v ? "top" : "perspective")}
              data-testid="switch-v2-camera"
            />
            <Label className="text-xs">{t("منظور علوي", "Top view")}</Label>
          </div>
        </div>
      </div>

      {room.measurementConfidence === "approximate" && (
        <div className="flex items-center gap-2 bg-amber-500/10 border-b border-amber-400/40 px-4 py-2 text-sm text-amber-700 dark:text-amber-400" data-testid="warning-v2-preview-approximate">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {t("قياسات تقريبية — غير معتمدة للتصنيع.", "Approximate measurements — not approved for manufacturing.")}
        </div>
      )}

      <div className="flex-1 relative min-h-[420px]">
        <Canvas shadows={false} dpr={[1, 2]}>
          {s.cameraMode === "top" ? (
            <OrthographicCamera
              makeDefault
              position={[centerX, Math.max(6, span * 1.5), centerZ]}
              zoom={Math.max(40, 420 / Math.max(span, 1))}
              near={0.1}
              far={100}
            />
          ) : (
            <PerspectiveCamera
              makeDefault
              position={[centerX + span * 0.9, room.ceilingHeightMm * MM * 1.3, centerZ + span * 1.15]}
              fov={50}
            />
          )}
          <OrbitControls
            target={[centerX, room.ceilingHeightMm * MM * 0.35, centerZ]}
            enableRotate={s.cameraMode !== "top"}
          />
          <color attach="background" args={["#f2efe9"]} />
          <RoomScene room={room} wallMat={wallMat} floorMat={floorMat} showCeiling={s.showCeiling} />
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

      {/* Material pickers */}
      <div className="border-t px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-bold mb-2">{t("مادة الجدران (تجريبي)", "Wall material (test)")}</p>
          <div className="flex flex-wrap gap-2">
            {WALL_MATERIALS_V2.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant={s.wallMaterialId === m.id ? "default" : "outline"}
                onClick={() => s.setWallMaterial(m.id)}
                data-testid={`button-v2-wallmat-${m.id}`}
              >
                {t(m.nameAr, m.nameEn)}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold mb-2">{t("مادة الأرضية (تجريبي)", "Floor material (test)")}</p>
          <div className="flex flex-wrap gap-2">
            {FLOOR_MATERIALS_V2.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant={s.floorMaterialId === m.id ? "default" : "outline"}
                onClick={() => s.setFloorMaterial(m.id)}
                data-testid={`button-v2-floormat-${m.id}`}
              >
                {t(m.nameAr, m.nameEn)}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
