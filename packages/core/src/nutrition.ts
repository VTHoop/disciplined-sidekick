import type { FoodPath } from "./food.js";

/** USDA FoodData Central nutrient ids the app reads. Values are per 100 g. */
export const NUTRIENT = {
  energyKcal: 1008,
  energyAtwaterSpecific: 2048,
  energyAtwaterGeneral: 2047,
  protein: 1003,
} as const;

const ENERGY_PRIORITY = [
  NUTRIENT.energyKcal,
  NUTRIENT.energyAtwaterSpecific,
  NUTRIENT.energyAtwaterGeneral,
];

export interface FdcNutrient {
  nutrientId: number;
  value?: number | null;
}

function nutrientValue(nutrients: readonly FdcNutrient[], id: number) {
  const value = nutrients.find((n) => n.nutrientId === id)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** kcal per 100 g from 1008, falling back to 2048 then 2047; null if none has a value. */
export function energyKcalPer100g(
  nutrients: readonly FdcNutrient[],
): number | null {
  for (const id of ENERGY_PRIORITY) {
    const value = nutrientValue(nutrients, id);
    if (value !== null) return value;
  }
  return null;
}

/** Protein (g) per 100 g from 1003; null if missing. */
export const proteinPer100g = (nutrients: readonly FdcNutrient[]) =>
  nutrientValue(nutrients, NUTRIENT.protein);

export interface Per100g {
  kcalPer100g: number;
  proteinPer100g: number;
}

/** One item's kcal and protein: per-100 g value × grams / 100, unrounded. */
export function itemNutrition(
  { kcalPer100g, proteinPer100g }: Per100g,
  grams: number,
) {
  return {
    kcal: (kcalPer100g * grams) / 100,
    protein: (proteinPer100g * grams) / 100,
  };
}

export interface Totals {
  kcal: number;
  protein: number;
  fruitVegG: number;
}

/** Sums the unrounded item values; round only for display. */
export function entryTotals(items: readonly Totals[]): Totals {
  return items.reduce(
    (t, i) => ({
      kcal: t.kcal + i.kcal,
      protein: t.protein + i.protein,
      fruitVegG: t.fruitVegG + i.fruitVegG,
    }),
    { kcal: 0, protein: 0, fruitVegG: 0 },
  );
}

// `+ 0` turns a rounded -0 into 0.
const whole = (n: number) => String(Math.round(n) + 0);

export const formatGrams = whole;
export const formatKcal = whole;
/** Whole kcal with thousands separators; the number round trip keeps a rounded -0 from printing as "-0". */
export const formatKcalGrouped = (n: number) =>
  Number(formatKcal(n)).toLocaleString("en-US");
export const formatProtein = (n: number) =>
  (Math.round(n * 10) / 10 + 0).toFixed(1);

const pad = (n: number) => String(n).padStart(2, "0");

/** The device's local calendar day, as YYYY-MM-DD. */
export const localDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The food cache key: a canonical name ignoring case and extra spaces. */
export const canonicalKey = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The food cache key. A food with no brand keeps its canonicalKey, so rows
 * cached before brands existed still hit; a branded or restaurant food is
 * keyed by its brand and its path, so a chain's menu item and a packaged
 * product with the same brand and name never share a row.
 */
export const lookupKey = (
  brand: string | null | undefined,
  canonicalName: string,
  path: FoodPath = "branded",
) =>
  brand
    ? `${path === "restaurant" ? "restaurant" : "brand"}:${canonicalKey(brand)}|${canonicalKey(canonicalName)}`
    : canonicalKey(canonicalName);
