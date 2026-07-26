/**
 * Kitchen Designer V2 — isolated persistent store.
 *
 * IMPORTANT: this store MUST stay fully isolated from V1.
 * - Storage key: "teak-kitchen-tool-v2" (never the V1 storage key).
 * - Never reads, writes, clears or migrates the V1 key.
 * - resetV2() clears ONLY the V2 key.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type RoomV2,
  type RoomLayoutV2,
  ROOM_SCHEMA_VERSION_V2,
} from "./room-model";

export const V2_STORAGE_KEY = "teak-kitchen-tool-v2";

export interface DraftInputsV2 {
  layout: RoomLayoutV2 | null;
  /** Customer-facing values in centimeters (strings so inputs stay controlled). */
  wallACm: string;
  wallBCm: string;
  wallCCm: string;
  depthCm: string;
  ceilingHeightCm: string;
  roomType: "closed" | "open";
  measurementConfidence: "exact" | "approximate";
}

export interface KitchenToolV2State {
  schemaVersion: number;
  draftId: string;
  createdAt: string;
  updatedAt: string;
  inputs: DraftInputsV2;
  /** Generated room — the ONLY source for the 3D preview. */
  room: RoomV2 | null;
  /** Selected test surface materials (registry ids). */
  wallMaterialId: string;
  floorMaterialId: string;
  cameraMode: "perspective" | "top";
  /**
   * Render pipeline for the room preview:
   * - "baked": approved unlit baked-lighting look (default, always safe).
   * - "live": real spotlights + PBR + AO/Bloom; on capable desktops a
   *   progressive path tracer refines the frame when the camera is idle.
   */
  renderMode: "baked" | "live";

  setInputs: (patch: Partial<DraftInputsV2>) => void;
  setRoom: (room: RoomV2 | null) => void;
  setWallMaterial: (id: string) => void;
  setFloorMaterial: (id: string) => void;
  setCameraMode: (m: "perspective" | "top") => void;
  setRenderMode: (m: "baked" | "live") => void;
  resetV2: () => void;
}

function newDraftId(): string {
  return `v2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const initialInputs: DraftInputsV2 = {
  layout: null,
  wallACm: "",
  wallBCm: "",
  wallCCm: "",
  depthCm: "",
  ceilingHeightCm: "270",
  roomType: "closed",
  measurementConfidence: "exact",
};

function freshDraft() {
  const now = new Date().toISOString();
  return {
    schemaVersion: ROOM_SCHEMA_VERSION_V2,
    draftId: newDraftId(),
    createdAt: now,
    updatedAt: now,
    inputs: { ...initialInputs },
    room: null as RoomV2 | null,
    wallMaterialId: "wall_matte_warm_white",
    floorMaterialId: "floor_beige_porcelain_600",
    cameraMode: "perspective" as const,
    renderMode: "baked" as const,
  };
}

export const useKitchenToolV2Store = create<KitchenToolV2State>()(
  persist(
    (set) => ({
      ...freshDraft(),
      setInputs: (patch) =>
        set((s) => ({
          inputs: { ...s.inputs, ...patch },
          updatedAt: new Date().toISOString(),
        })),
      setRoom: (room) => set({ room, updatedAt: new Date().toISOString() }),
      setWallMaterial: (id) =>
        set({ wallMaterialId: id, updatedAt: new Date().toISOString() }),
      setFloorMaterial: (id) =>
        set({ floorMaterialId: id, updatedAt: new Date().toISOString() }),
      setCameraMode: (m) => set({ cameraMode: m }),
      setRenderMode: (m) => set({ renderMode: m }),
      resetV2: () => set({ ...freshDraft() }),
    }),
    {
      name: V2_STORAGE_KEY,
      version: ROOM_SCHEMA_VERSION_V2,
      // Backward compatibility: older persisted drafts may contain removed
      // display fields (showCeiling / ceilingPreset / renderPreset). The
      // shallow merge simply ignores fields no longer in the state shape,
      // so existing V2 drafts keep opening safely. Approved visual behavior
      // (photoreal, flat white ceiling always on) now lives in the renderer.
      migrate: (persisted: any) => persisted,
    }
  )
);
