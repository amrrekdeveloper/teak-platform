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

/** Gap between the two runs of a parallel (galley) kitchen, in cm. */
export const PARALLEL_GAP = 300;

const WALL_IDS = ["A", "B", "C", "D"];

/** Whether the "close the room" option applies to this layout. */
export function canCloseLayout(layout: KitchenLayout): boolean {
  return layout === "L" || layout === "U" || layout === "parallel";
}

/** Wall ids for a layout, including the extra closing wall(s) when closed. */
export function wallIdsForLayout(layout: KitchenLayout, closed: boolean): string[] {
  const base = WALL_IDS.slice(0, wallCountForLayout(layout));
  if (!closed || !canCloseLayout(layout)) return base;
  switch (layout) {
    case "L":
      return ["A", "B", "C"];
    case "U":
      return ["A", "B", "C", "D"];
    case "parallel":
      return ["A", "B", "C", "D"];
    default:
      return base;
  }
}

/** True when this wall's length is auto-synced (not editable) while closed. */
export function isSyncedWall(layout: KitchenLayout, closed: boolean, id: string): boolean {
  if (!closed || !canCloseLayout(layout)) return false;
  switch (layout) {
    case "L":
      return id === "C";
    case "U":
      return id === "C" || id === "D";
    case "parallel":
      return id === "B" || id === "C" || id === "D";
    default:
      return false;
  }
}

/** Apply the closing sync rules (master → synced wall lengths). */
function syncWallLengths(
  layout: KitchenLayout,
  closed: boolean,
  walls: KitchenWall[]
): KitchenWall[] {
  if (!closed || !canCloseLayout(layout)) return walls;
  const lengthOf = (id: string) =>
    walls.find((w) => w.id === id)?.length ?? WALL_DEFAULT;
  return walls.map((w) => {
    if (layout === "L" && w.id === "C") return { ...w, length: lengthOf("A") };
    if (layout === "U" && w.id === "C") return { ...w, length: lengthOf("B") };
    if (layout === "U" && w.id === "D") return { ...w, length: lengthOf("A") };
    if (layout === "parallel" && w.id === "B") return { ...w, length: lengthOf("A") };
    if (layout === "parallel" && (w.id === "C" || w.id === "D"))
      return { ...w, length: PARALLEL_GAP };
    return w;
  });
}

/** Rebuild the walls list for a layout + closed flag, preserving lengths. */
function buildWalls(
  layout: KitchenLayout,
  closed: boolean,
  prev: KitchenWall[]
): KitchenWall[] {
  const ids = wallIdsForLayout(layout, closed);
  const prevById = new Map(prev.map((w) => [w.id, w]));
  const walls: KitchenWall[] = ids.map((id) => {
    const existing = prevById.get(id);
    const length =
      existing && Number.isFinite(existing.length) ? existing.length : WALL_DEFAULT;
    return { id, length };
  });
  return syncWallLengths(layout, closed, walls);
}

interface KitchenToolState {
  answers: KitchenAnswers;
  step: number;
  walls: KitchenWall[];
  /** Layout the current walls array was built for (detects layout switches). */
  wallsLayout: KitchenLayout | null;
  /** Fully close the room with an extra wall (L/U/parallel only). */
  closed: boolean;
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
  setClosed: (value: boolean) => void;
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
  clearPlacedCabinets: () => void;
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
      wallsLayout: null,
      closed: false,
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
          const prevLayout = state.wallsLayout ?? layout;
          const prevClosed = (state.closed ?? false) && canCloseLayout(prevLayout);
          // Drop walls whose length was auto-synced under the previous layout
          // so stale closing-wall values don't leak into the new layout.
          const prevWalls =
            prevLayout === layout
              ? state.walls
              : state.walls.filter((w) => !isSyncedWall(prevLayout, prevClosed, w.id));
          const closed = (state.closed ?? false) && canCloseLayout(layout);
          const walls = buildWalls(layout, closed, prevWalls);
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
          return { walls, wallsLayout: layout, openings, utilities };
        }),
      setClosed: (value) =>
        set((state) => {
          const layout = state.answers.layout ?? state.wallsLayout ?? "L";
          const closed = value && canCloseLayout(layout);
          const walls = buildWalls(layout, closed, state.walls);
          const wallById = new Map(walls.map((w) => [w.id, w]));
          const openings = state.openings.filter((o) => wallById.has(o.wallId));
          const utilities = (state.utilities ?? []).filter(
            (u) => !u.wallId || wallById.has(u.wallId)
          );
          const placedCabinets = (state.placedCabinets ?? []).filter((c) =>
            wallById.has(c.wallId)
          );
          return { closed, walls, wallsLayout: layout, openings, utilities, placedCabinets };
        }),
      setWallLength: (id, length) =>
        set((state) => {
          const layout = state.answers.layout ?? "L";
          const closed = state.closed ?? false;
          if (isSyncedWall(layout, closed, id)) return {};
          const walls = syncWallLengths(
            layout,
            closed,
            state.walls.map((w) => (w.id === id ? { ...w, length } : w))
          );
          return { walls };
        }),
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
      clearPlacedCabinets: () => set({ placedCabinets: [] }),
      reset: () =>
        set({
          answers: initialAnswers,
          step: 0,
          walls: [],
          wallsLayout: null,
          closed: false,
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
