import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_ENVIRONMENT_ID } from "@/components/kitchen-tool/materials";

export type OvenPlacement = "under_counter" | "tall_cabinet";
export type HoodType = "wall" | "integrated";
export type FridgeType = "freestanding" | "integrated";
export type KitchenLayout = "I" | "L" | "U" | "parallel";

export interface KitchenAnswers {
  ovenPlacement: OvenPlacement | null;
  hoodType: HoodType | null;
  fridgeType: FridgeType | null;
  layout: KitchenLayout | null;
}

export interface KitchenWall {
  id: string;
  length: number;
}

export type OpeningType = "door" | "window";
export type DoorSwing = "in" | "out";
export type DoorHinge = "start" | "end";

export interface KitchenOpening {
  id: string;
  wallId: string;
  type: OpeningType;
  width: number;
  distanceFromWallStart: number;
  /** Doors only. Defaults to "in" (opens into the room) when absent. */
  swing?: DoorSwing;
  /** Doors only. Hinge side along the wall. Defaults to "start" when absent. */
  hinge?: DoorHinge;
}

export interface PlacedCabinetState {
  id: string;
  catalogId: string;
  wallId: string;
  /** Distance (m) from wall start to the cabinet's near edge. */
  offset: number;
  /** Optional per-instance mounting height (m); undefined = catalog default. */
  mountY?: number;
}

export type UtilityKind = "water" | "outlet" | "switch" | "drain" | "gas";

export interface KitchenUtility {
  id: string;
  kind: UtilityKind;
  /** Wall-mounted when wallId is set (water/outlet/switch/wall-drain). */
  wallId?: string;
  /** Distance (cm) from wall start for wall-mounted utilities. */
  positionAlongWall?: number;
  /** Floor position (cm, plan coordinates) — floor drains only. */
  x?: number;
  y?: number;
  /** Height from floor (cm). Hidden default per kind; 0 for floor drains. */
  heightFromFloor: number;
}

export const UTILITY_DEFAULT_HEIGHT: Record<UtilityKind, number> = {
  water: 55,
  outlet: 30,
  switch: 110,
  drain: 40,
  gas: 55,
};

export const WALL_MIN = 120;
export const WALL_MAX = 800;
export const WALL_DEFAULT = 360;
export const CEILING_MIN = 220;
export const CEILING_MAX = 400;
export const CEILING_DEFAULT = 270;
export const DOOR_DEFAULT_WIDTH = 90;
export const WINDOW_DEFAULT_WIDTH = 120;
export const OPENING_MIN_WIDTH = 40;
export const OPENING_MAX_WIDTH = 400;

export function wallCountForLayout(layout: KitchenLayout): number {
  switch (layout) {
    case "I":
      return 1;
    case "L":
      return 2;
    case "U":
      return 3;
    case "parallel":
      return 2;
  }
}

const WALL_IDS = ["A", "B", "C"];

interface KitchenToolState {
  answers: KitchenAnswers;
  step: number;
  walls: KitchenWall[];
  ceilingHeight: number;
  openings: KitchenOpening[];
  utilities: KitchenUtility[];
  /** Selected material ids for the 3D studio. */
  floorMaterialId: string;
  wallMaterialId: string;
  /** Selected environment (HDRI ambiance) for the 3D studio. */
  environmentId: string;
  /** Artificial lighting (downlights + cove + under-cabinet LED). */
  lightsOn: boolean;
  lightTemp: "warm" | "cool";
  /** Cabinets placed in the 3D studio. */
  placedCabinets: PlacedCabinetState[];
  setAnswer: <K extends keyof KitchenAnswers>(key: K, value: KitchenAnswers[K]) => void;
  setStep: (step: number) => void;
  ensureWalls: (layout: KitchenLayout) => void;
  setWallLength: (id: string, length: number) => void;
  setCeilingHeight: (height: number) => void;
  addOpening: (opening: KitchenOpening) => void;
  updateOpening: (id: string, patch: Partial<Omit<KitchenOpening, "id">>) => void;
  removeOpening: (id: string) => void;
  addUtility: (utility: KitchenUtility) => void;
  updateUtility: (id: string, patch: Partial<Omit<KitchenUtility, "id" | "kind">>) => void;
  removeUtility: (id: string) => void;
  setFloorMaterial: (id: string) => void;
  setWallMaterial: (id: string) => void;
  setEnvironment: (id: string) => void;
  toggleLights: () => void;
  setLightTemp: (temp: "warm" | "cool") => void;
  addPlacedCabinet: (cabinet: PlacedCabinetState) => void;
  movePlacedCabinet: (id: string, wallId: string, offset: number) => void;
  setPlacedCabinetHeight: (id: string, mountY: number) => void;
  removePlacedCabinet: (id: string) => void;
  reset: () => void;
}

const initialAnswers: KitchenAnswers = {
  ovenPlacement: null,
  hoodType: null,
  fridgeType: null,
  layout: null,
};

export const useKitchenToolStore = create<KitchenToolState>()(
  persist(
    (set) => ({
      answers: initialAnswers,
      step: 0,
      walls: [],
      ceilingHeight: CEILING_DEFAULT,
      openings: [],
      utilities: [],
      floorMaterialId: "laminate",
      wallMaterialId: "plaster",
      environmentId: DEFAULT_ENVIRONMENT_ID,
      lightsOn: false,
      lightTemp: "warm",
      placedCabinets: [],
      setAnswer: (key, value) =>
        set((state) => ({ answers: { ...state.answers, [key]: value } })),
      setStep: (step) => set({ step }),
      ensureWalls: (layout) =>
        set((state) => {
          const count = wallCountForLayout(layout);
          const walls: KitchenWall[] = WALL_IDS.slice(0, count).map((id, i) => {
            const existing = state.walls[i];
            const length =
              existing && Number.isFinite(existing.length)
                ? existing.length
                : WALL_DEFAULT;
            return { id, length };
          });
          const wallById = new Map(walls.map((w) => [w.id, w]));
          const openings = state.openings.filter((o) => wallById.has(o.wallId));
          const utilities = (state.utilities ?? [])
            .filter((u) => !u.wallId || wallById.has(u.wallId))
            .map((u) => {
              if (!u.wallId) return u;
              const wall = wallById.get(u.wallId)!;
              const pos = Math.min(
                Math.max(u.positionAlongWall ?? 0, 0),
                wall.length
              );
              return pos === u.positionAlongWall
                ? u
                : { ...u, positionAlongWall: pos };
            });
          return { walls, openings, utilities };
        }),
      setWallLength: (id, length) =>
        set((state) => ({
          walls: state.walls.map((w) => (w.id === id ? { ...w, length } : w)),
        })),
      setCeilingHeight: (height) => set({ ceilingHeight: height }),
      addOpening: (opening) =>
        set((state) => ({ openings: [...state.openings, opening] })),
      updateOpening: (id, patch) =>
        set((state) => ({
          openings: state.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        })),
      removeOpening: (id) =>
        set((state) => ({ openings: state.openings.filter((o) => o.id !== id) })),
      addUtility: (utility) =>
        set((state) => ({ utilities: [...(state.utilities ?? []), utility] })),
      updateUtility: (id, patch) =>
        set((state) => ({
          utilities: (state.utilities ?? []).map((u) =>
            u.id === id ? { ...u, ...patch } : u
          ),
        })),
      removeUtility: (id) =>
        set((state) => ({
          utilities: (state.utilities ?? []).filter((u) => u.id !== id),
        })),
      setFloorMaterial: (id) => set({ floorMaterialId: id }),
      setWallMaterial: (id) => set({ wallMaterialId: id }),
      setEnvironment: (id) => set({ environmentId: id }),
      toggleLights: () => set((state) => ({ lightsOn: !state.lightsOn })),
      setLightTemp: (temp) => set({ lightTemp: temp }),
      addPlacedCabinet: (cabinet) =>
        set((state) => ({
          placedCabinets: [...(state.placedCabinets ?? []), cabinet],
        })),
      movePlacedCabinet: (id, wallId, offset) =>
        set((state) => ({
          placedCabinets: (state.placedCabinets ?? []).map((c) =>
            c.id === id ? { ...c, wallId, offset } : c
          ),
        })),
      setPlacedCabinetHeight: (id, mountY) =>
        set((state) => ({
          placedCabinets: (state.placedCabinets ?? []).map((c) =>
            c.id === id ? { ...c, mountY } : c
          ),
        })),
      removePlacedCabinet: (id) =>
        set((state) => ({
          placedCabinets: (state.placedCabinets ?? []).filter((c) => c.id !== id),
        })),
      reset: () =>
        set({
          answers: initialAnswers,
          step: 0,
          walls: [],
          ceilingHeight: CEILING_DEFAULT,
          openings: [],
          utilities: [],
          floorMaterialId: "laminate",
          wallMaterialId: "plaster",
          environmentId: DEFAULT_ENVIRONMENT_ID,
          lightsOn: false,
          lightTemp: "warm",
          placedCabinets: [],
        }),
    }),
    { name: "teak-kitchen-tool" }
  )
);

export function clampWallLength(length: number): number {
  if (!Number.isFinite(length)) return WALL_DEFAULT;
  return Math.min(Math.max(length, WALL_MIN), WALL_MAX);
}

export function clampCeilingHeight(height: number): number {
  if (!Number.isFinite(height)) return CEILING_DEFAULT;
  return Math.min(Math.max(height, CEILING_MIN), CEILING_MAX);
}
