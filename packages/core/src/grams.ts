import type { FoodPreview, PreviewItem } from "./food.js";
import { fruitVegGrams } from "./fruit-veg.js";
import { entryTotals, formatGrams, itemNutrition } from "./nutrition.js";

/** The most grams one item can have: a sanity cap above any real portion, like the targets caps. */
export const MAX_GRAMS = 3000;

export type ParsedGrams =
  | { ok: true; value: number }
  | { ok: false; message: string };

/** A whole number of grams from 1 to MAX_GRAMS. */
export function parseGrams(raw: string): ParsedGrams {
  const text = raw.trim();
  // Number() of a huge digit string is still > MAX_GRAMS (Infinity at worst).
  const value = /^\d+$/.test(text) ? Number(text) : 0;
  if (value <= 0) {
    return {
      ok: false,
      message: "Grams must be a whole number greater than 0",
    };
  }
  if (value > MAX_GRAMS) {
    return {
      ok: false,
      message: `Grams must be ${MAX_GRAMS.toLocaleString("en-US")} or less`,
    };
  }
  return { ok: true, value };
}

/** What the grams field first shows: the parsed grams as a whole number. */
export const gramsDraft = (item: Pick<PreviewItem, "grams">) =>
  formatGrams(item.grams);

export interface EditedPreview {
  preview: FoodPreview;
  /** Per item: why its draft can't be used, or null. An invalid item stays as parsed. */
  errors: (string | null)[];
}

/**
 * The preview with each item's grams field applied. A draft equal to the
 * field's first value leaves the item exactly as parsed (decimals and
 * portionEstimated included). A different valid number sets the grams,
 * recomputes the item from its per-100 g values and the totals, clears
 * portionEstimated, and keeps the parse's grams in parsedGrams.
 */
export function applyGramEdits(
  preview: FoodPreview,
  drafts: readonly string[],
): EditedPreview {
  const errors: (string | null)[] = [];
  const items = preview.items.map((item, i) => {
    const draft = (drafts[i] ?? gramsDraft(item)).trim();
    errors.push(null);
    if (draft === gramsDraft(item)) return item;
    const parsed = parseGrams(draft);
    if (!parsed.ok) {
      errors[i] = parsed.message;
      return item;
    }
    const { kcal, protein } = itemNutrition(item, parsed.value);
    return {
      ...item,
      grams: parsed.value,
      kcal,
      protein,
      // All or nothing per item: it counts if the parse gave it fruit/veg grams.
      fruitVegG: fruitVegGrams(parsed.value, item.fruitVegG > 0),
      portionEstimated: false,
      parsedGrams: item.grams,
    };
  });
  // Nothing edited: keep the parse's own totals untouched.
  if (items.every((item, i) => item === preview.items[i])) {
    return { preview, errors };
  }
  return { preview: { ...preview, items, totals: entryTotals(items) }, errors };
}
