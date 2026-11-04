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

const FIELD_NAMES: Record<TargetField, string> = {
  calories: "Calories",
  protein: "Protein",
  fruitVeg: "Fruit/veg",
};

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

export const targetName = (field: TargetField): string => FIELD_NAMES[field];

/** Sanity caps: above any realistic target, low enough to catch a stray zero or kJ typed as kcal. Code only; the database just checks > 0. */
export const MAX_TARGETS: Record<TargetField, number> = {
  calories: 6000,
  protein: 500,
  fruitVeg: 3000,
};

const UNITS: Record<TargetField, string> = {
  calories: "kcal",
  protein: "g",
  fruitVeg: "g",
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
  const max = MAX_TARGETS[field];
  if (value > max) {
    return {
      ok: false,
      message: `${name} must be ${max.toLocaleString("en-US")} ${UNITS[field]} or less`,
    };
  }
  return { ok: true, value };
}
