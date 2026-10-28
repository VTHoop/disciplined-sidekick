import type { Totals } from "./nutrition.js";

/** One logged item as previewed and saved. kcal, protein and fruitVegG are unrounded. */
export interface PreviewItem {
  name: string;
  canonicalName: string;
  grams: number;
  kcal: number;
  protein: number;
  fruitVegG: number;
  kcalPer100g: number;
  proteinPer100g: number;
  /** No usable USDA match: the per-100 g values are an AI estimate. */
  estimated: boolean;
  /** The AI guessed the grams (no quantity given, or a mixed-dish component). */
  portionEstimated: boolean;
  fdcId: number | null;
}

/** What POST /api/food/parse returns; nothing is saved until Done. */
export interface FoodPreview {
  /** Stamped on every ai_runs row for the entry; becomes the saved entry's id. */
  entryId: string;
  text: string;
  items: PreviewItem[];
  totals: Totals;
}
