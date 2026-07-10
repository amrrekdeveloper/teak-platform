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

interface KitchenToolState {
  answers: KitchenAnswers;
  step: number;
  setAnswer: <K extends keyof KitchenAnswers>(key: K, value: KitchenAnswers[K]) => void;
  setStep: (step: number) => void;
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
      setAnswer: (key, value) =>
        set((state) => ({ answers: { ...state.answers, [key]: value } })),
      setStep: (step) => set({ step }),
      reset: () => set({ answers: initialAnswers, step: 0 }),
    }),
    { name: "teak-kitchen-tool" }
  )
);
