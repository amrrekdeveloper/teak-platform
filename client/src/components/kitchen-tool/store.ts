import { create } from "zustand";
import { persist } from "zustand/middleware";

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

export interface KitchenOpening {
  id: string;
  wallId: string;
  type: OpeningType;
  width: number;
  distanceFromWallStart: number;
}

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
  setAnswer: <K extends keyof KitchenAnswers>(key: K, value: KitchenAnswers[K]) => void;
  setStep: (step: number) => void;
  ensureWalls: (layout: KitchenLayout) => void;
  setWallLength: (id: string, length: number) => void;
  setCeilingHeight: (height: number) => void;
  addOpening: (opening: KitchenOpening) => void;
  updateOpening: (id: string, patch: Partial<Omit<KitchenOpening, "id">>) => void;
  removeOpening: (id: string) => void;
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
          const wallIds = new Set(walls.map((w) => w.id));
          const openings = state.openings.filter((o) => wallIds.has(o.wallId));
          return { walls, openings };
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
      reset: () =>
        set({
          answers: initialAnswers,
          step: 0,
          walls: [],
          ceilingHeight: CEILING_DEFAULT,
          openings: [],
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
