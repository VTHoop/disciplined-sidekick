export const DEFAULT_FRUIT_VEG_G = 800;

export type TargetField = "calories" | "protein" | "fruitVeg";

/** What is stored per user. `fruitVeg` only counts once `fruitVegEdited` is true. */
export interface StoredTargets {
  calories: number | null;
  protein: number | null;
  fruitVeg: number | null;
  fruitVegEdited: boolean;
}

export interface ResolvedTargets {
  calories: number | null;
  protein: number | null;
  fruitVeg: number | null;
}

export type ParsedTarget =
  | { ok: true; value: number | null }
  | { ok: false; message: string };

/**
 * Display name, unit and sanity cap per target. The caps are above any
 * realistic target but catch a stray zero or kJ typed as kcal.
 */
const TARGET_SPECS = {
  calories: { name: "Calories", unit: "kcal", max: 6000 },
  protein: { name: "Protein", unit: "g", max: 500 },
  fruitVeg: { name: "Fruit/veg", unit: "g", max: 3000 },
} as const satisfies Record<
  TargetField,
  { name: string; unit: string; max: number }
>;

/**
 * A user who never edited fruit/veg follows the current default, so changing
 * the default reaches them; a cleared value stays unset (null).
 */
export function resolveTargets(
  stored: StoredTargets | null,
  defaults: { fruitVeg: number | null } = { fruitVeg: DEFAULT_FRUIT_VEG_G },
): ResolvedTargets {
  return {
    calories: stored?.calories ?? null,
    protein: stored?.protein ?? null,
    fruitVeg: stored?.fruitVegEdited ? stored.fruitVeg : defaults.fruitVeg,
  };
}

export const targetName = (field: TargetField): string =>
  TARGET_SPECS[field].name;

export const MAX_TARGETS: Record<TargetField, number> = {
  calories: TARGET_SPECS.calories.max,
  protein: TARGET_SPECS.protein.max,
  fruitVeg: TARGET_SPECS.fruitVeg.max,
};

/** Blank clears the target; anything else must be a whole number greater than 0 and within its cap. */
export function parseTarget(field: TargetField, raw: string): ParsedTarget {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  const name = targetName(field);
  // Number() of a huge digit string is still > any cap (Infinity at worst).
  const value = /^\d+$/.test(text) ? Number(text) : 0;
  if (value <= 0) {
    return {
      ok: false,
      message: `${name} must be a whole number greater than 0`,
    };
  }
  const max = TARGET_SPECS[field].max;
  if (value > max) {
    return {
      ok: false,
      message: `${name} must be ${max.toLocaleString("en-US")} ${TARGET_SPECS[field].unit} or less`,
    };
  }
  return { ok: true, value };
}
