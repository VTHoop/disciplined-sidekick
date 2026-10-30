export interface Measure {
  amount: number;
  unit: string;
}

const ALIASES: Record<string, string> = {
  c: "cup",
  tablespoon: "tbsp",
  tbs: "tbsp",
  teaspoon: "tsp",
  pc: "piece",
  pcs: "piece",
};

/** A weight or a metric volume. The weight is already in grams, so it is not a household measure. */
const NOT_HOUSEHOLD = new Set([
  "g",
  "gram",
  "grm",
  "kg",
  "mg",
  "oz",
  "onz",
  "ounce",
  "lb",
  "ml",
  "mlt",
  "l",
]);

/** One spelling for a unit: lower case, singular, "tablespoons" as "tbsp", "pcs" as "piece". */
export function normalizeUnit(raw: string): string {
  const unit = raw.trim().toLowerCase().replace(/\.$/, "");
  const singular =
    unit.length > 3 && unit.endsWith("s") ? unit.slice(0, -1) : unit;
  return ALIASES[unit] ?? ALIASES[singular] ?? singular;
}

function parseAmount(text: string): number | null {
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

// "1 Cup (103g) Per serving", "1/2 cup", "1 1/3 cups (60g)": an amount, one
// word for the unit, then at most a bracketed note and "per serving".
const HOUSEHOLD =
  /^\s*(?:about\s+)?(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*([a-z]+)\s*(?:\([^()]*\))?\s*(?:per serving)?\s*$/i;

/**
 * The household serving a Branded label states, e.g. 1 cup. Null for a weight, a
 * zero amount, or text that is more than a plain measure ("1 cup with 1/2 cup
 * milk", "3 pieces plus 2 tbsp sauce"): a wrong match is worse than a guess.
 */
export function parseHousehold(
  text: string | null | undefined,
): Measure | null {
  const match = text?.match(HOUSEHOLD);
  if (!match) return null;
  const amount = parseAmount((match[1] ?? "").trim());
  const unit = normalizeUnit(match[2] ?? "");
  if (amount === null || amount <= 0 || NOT_HOUSEHOLD.has(unit)) return null;
  return { amount, unit };
}
