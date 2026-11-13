import { entryTotals, type Totals } from "./nutrition.js";

/** How an item is looked up: no brand, a packaged product, or a restaurant's food. */
export type FoodPath = "generic" | "branded" | "restaurant";

/** Where an item's per-100 g values came from. */
export type FoodSource = "usda" | "branded" | "estimated";

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
  /** Set when the user edited the grams in the preview: the grams the parse gave. Absent if unedited. */
  parsedGrams?: number;
  fdcId: number | null;
  /** The brand or restaurant named in the entry; null for a generic item. */
  brand: string | null;
  /** Steers the preview's wording only; it is not saved. */
  path: FoodPath;
  source: FoodSource;
}

/** The item's title: brand then capitalised canonical name, or the display name when it has no brand. */
export function foodLabel({
  name,
  canonicalName,
  brand,
}: Pick<PreviewItem, "name" | "canonicalName" | "brand">): string {
  if (!brand) return name;
  return `${brand} ${canonicalName.charAt(0).toUpperCase()}${canonicalName.slice(1)}`;
}

/** Where a saved item came from: a parse of typed text, or a copy of a logged item. */
export type FoodOrigin = "parsed" | "reused";

/** A one-item preview of a copy of a saved item, ready to save as the new entry `entryId`. Its text is the item's label. */
export function previewFromSavedItem(
  item: Omit<PreviewItem, "path" | "parsedGrams">,
  entryId: string,
): FoodPreview {
  const copy: PreviewItem = {
    name: item.name,
    canonicalName: item.canonicalName,
    grams: item.grams,
    kcal: item.kcal,
    protein: item.protein,
    fruitVegG: item.fruitVegG,
    kcalPer100g: item.kcalPer100g,
    proteinPer100g: item.proteinPer100g,
    estimated: item.estimated,
    portionEstimated: item.portionEstimated,
    fdcId: item.fdcId,
    brand: item.brand,
    path: item.brand ? "branded" : "generic",
    source: item.source,
  };
  return {
    entryId,
    text: foodLabel(copy),
    items: [copy],
    totals: entryTotals([copy]),
  };
}

/** What POST /api/food/parse returns; nothing is saved until Done. */
export interface FoodPreview {
  /** Stamped on every ai_runs row for the entry; becomes the saved entry's id. */
  entryId: string;
  text: string;
  items: PreviewItem[];
  totals: Totals;
}
