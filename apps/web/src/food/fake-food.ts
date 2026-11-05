import type { FoodPreview } from "@disciplined-sidekick/core";
import { vi } from "vitest";
import type { FoodApi, ParseResult, SaveResult } from "./food-api";

/** Two eggs (grams guessed) and 150 g blueberries, as the server would preview them. */
export function samplePreview(
  overrides: Partial<FoodPreview> = {},
): FoodPreview {
  return {
    entryId: "7d0c4a52-2f8e-4b8e-9a51-5b8a8c1f0e01",
    text: "2 eggs and 150 g blueberries",
    items: [
      {
        name: "2 eggs",
        canonicalName: "egg, whole, raw",
        grams: 100,
        kcal: 143,
        protein: 12.56,
        fruitVegG: 0,
        kcalPer100g: 143,
        proteinPer100g: 12.56,
        estimated: false,
        portionEstimated: true,
        fdcId: 171287,
        brand: null,
        path: "generic",
        source: "usda",
      },
      {
        name: "150 g blueberries",
        canonicalName: "blueberries, raw",
        grams: 150,
        kcal: 85.5,
        protein: 1.11,
        fruitVegG: 150,
        kcalPer100g: 57,
        proteinPer100g: 0.74,
        estimated: false,
        portionEstimated: false,
        fdcId: 171711,
        brand: null,
        path: "generic",
        source: "usda",
      },
    ],
    totals: { kcal: 228.5, protein: 13.67, fruitVegG: 150 },
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** In-memory stand-in for the food API, with hooks to hold or fail calls. */
export function createFakeFood(preview: FoodPreview = samplePreview()) {
  let parseImpl: (text: string) => Promise<ParseResult> = async (text) => ({
    ok: true,
    preview: { ...preview, text },
  });
  let saveImpl: () => Promise<SaveResult> = async () => ({ ok: true });

  return {
    parse: vi.fn<FoodApi["parse"]>((text) => parseImpl(text)),
    save: vi.fn<FoodApi["save"]>(() => saveImpl()),
    respondWith(result: ParseResult) {
      parseImpl = async () => result;
    },
    /** Keeps parse pending until the returned function is called. */
    holdParse() {
      const d = deferred<ParseResult>();
      parseImpl = () => d.promise;
      return (result: ParseResult = { ok: true, preview }) => d.resolve(result);
    },
    /** Keeps save pending until the returned function is called. */
    holdSave() {
      const d = deferred<SaveResult>();
      saveImpl = () => d.promise;
      return (result: SaveResult = { ok: true }) => d.resolve(result);
    },
    failNextSave(reason: "network" | "session" | "other" = "other") {
      saveImpl = async () => {
        saveImpl = async () => ({ ok: true });
        return { ok: false, reason };
      };
    },
  } satisfies FoodApi & Record<string, unknown>;
}

export type FakeFood = ReturnType<typeof createFakeFood>;
