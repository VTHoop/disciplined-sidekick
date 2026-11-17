import type { FoodPath } from "../../packages/core/src/index.js";

/**
 * Marks an expected value the owner hasn't written or confirmed yet. A case
 * with any such value runs but isn't scored.
 */
export const UNCONFIRMED = { unconfirmed: true } as const;
export type Unconfirmed = typeof UNCONFIRMED;
export type Confirmable<T> = T | Unconfirmed;

export const isUnconfirmed = (value: unknown): value is Unconfirmed =>
  typeof value === "object" &&
  value !== null &&
  (value as { unconfirmed?: unknown }).unconfirmed === true;

/** The golden-set categories from the AI Evals decision record. */
export const CATEGORIES = [
  "count",
  "household-measure",
  "branded",
  "chain-restaurant",
  "restaurant-by-component",
  "mixed-dish",
  "multi-food",
  "fruit-veg-edge",
  "no-food",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Where an expected answer came from. */
export type AnswerSource =
  | "package-label"
  | "chain-nutrition"
  | "usda-entry"
  | "judgment";

/** An inclusive range. */
export interface Range {
  min: number;
  max: number;
}

interface ExpectedItemBase {
  name: Confirmable<string>;
  /** Actual items are matched to expected ones by this, exactly. */
  canonicalName: Confirmable<string>;
  grams: Confirmable<number>;
  portionEstimated: Confirmable<boolean>;
  countsFruitVeg: Confirmable<boolean>;
  /** The brand or restaurant; null for a generic item. */
  brand: Confirmable<string | null>;
  path: Confirmable<FoodPath>;
  answerSource: Confirmable<AnswerSource>;
}

/** A USDA or Branded match: the pick passes when its fdcId is one of these. */
interface LookedUpItem extends ExpectedItemBase {
  source: "usda" | "branded";
  fdcIds: Confirmable<readonly number[]>;
}

/** An AI estimate: it passes when its per-100 g values are in range. */
interface EstimatedItem extends ExpectedItemBase {
  source: "estimated";
  kcalPer100g: Confirmable<Range>;
  proteinPer100g: Confirmable<Range>;
}

/** A drafted item whose source the owner hasn't decided yet. */
interface UndecidedItem extends ExpectedItemBase {
  source: Unconfirmed;
}

export type ExpectedItem = LookedUpItem | EstimatedItem | UndecidedItem;

/**
 * Overrides for one case. Percentages are fractions (0.1 is ±10%); a check
 * passes within its percentage or its floor, whichever is wider.
 */
export interface Tolerances {
  /** Grams when a quantity is given. */
  gramsPct?: number;
  /** Grams when the portion is estimated. */
  gramsEstimatedPct?: number;
  gramsFloorG?: number;
  kcalPct?: number;
  kcalFloor?: number;
  proteinPct?: number;
  proteinFloorG?: number;
}

export const DEFAULT_TOLERANCES: Readonly<Required<Tolerances>> = {
  gramsPct: 0.1,
  gramsEstimatedPct: 0.4,
  gramsFloorG: 5,
  kcalPct: 0.15,
  kcalFloor: 10,
  proteinPct: 0.15,
  proteinFloorG: 2,
};

/**
 * One golden-set case. It holds only what's here: no dates, times, user ids
 * or entry ids (see README.md).
 */
export interface EvalCase {
  /** Stable across runs: runs are compared case by case on it. */
  id: string;
  category: Category;
  input: string;
  expected: {
    /** Empty for a no-food case. */
    items: Confirmable<readonly ExpectedItem[]>;
    kcal: Confirmable<number>;
    protein: Confirmable<number>;
  };
  tolerances?: Tolerances;
}
