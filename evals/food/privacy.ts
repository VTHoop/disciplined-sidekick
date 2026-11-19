import { DEFAULT_TOLERANCES } from "./types.js";

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

const DATE_OR_TIME = [
  /\b\d{4}-\d{1,2}-\d{1,2}\b/, // 2026-11-17
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, // 11/17/2026 (not 1/2 cup)
  new RegExp(`\\b(?:${MONTHS})\\.? \\d{1,2}(?:st|nd|rd|th)?\\b`, "i"), // Nov 17
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)? (?:${MONTHS})\\b`, "i"), // 17 November
  /\b\d{1,2}:\d{2}\b/, // 7:30
  /\b\d{1,2} ?(?:am|pm|a\.m\.|p\.m\.)(?![a-z])/i, // 7am, 7 pm
];

/** True when the text holds a date or a clock time. */
export const containsDateOrTime = (text: string): boolean =>
  DATE_OR_TIME.some((re) => re.test(text));

const CASE_FIELDS = ["id", "category", "input", "expected", "tolerances"];
const EXPECTED_FIELDS = ["items", "kcal", "protein"];
const ITEM_FIELDS = [
  "name",
  "canonicalName",
  "grams",
  "portionEstimated",
  "countsFruitVeg",
  "brand",
  "path",
  "source",
  "answerSource",
];
const SOURCE_FIELDS: Record<string, string[]> = {
  usda: ["fdcIds"],
  branded: ["fdcIds"],
  estimated: ["kcalPer100g", "proteinPer100g"],
};
const RANGE_FIELDS = ["min", "max"];
const ANY_SPLIT_FIELDS = ["anySplit", "every"];
const EVERY_FIELDS = ["portionEstimated", "brand", "path"];
const UNCONFIRMED_FIELDS = ["unconfirmed"];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function extra(
  value: unknown,
  allowed: string[],
  path: string,
  out: string[],
): void {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) out.push(path ? `${path}.${key}` : key);
  }
}

/** A marker or a range: only their own fields. */
function extraInValue(value: unknown, path: string, out: string[]) {
  if (!isObject(value)) return;
  extra(
    value,
    "unconfirmed" in value ? UNCONFIRMED_FIELDS : RANGE_FIELDS,
    path,
    out,
  );
}

/**
 * Every field of a case, at any depth, that the case type doesn't have. The
 * type already rejects them at compile time; this catches what a cast or a
 * JSON copy-paste could slip past it.
 */
export function fieldsOutsideCaseType(c: unknown): string[] {
  const out: string[] = [];
  if (!isObject(c)) return out;
  extra(c, CASE_FIELDS, "", out);
  extra(c.tolerances, Object.keys(DEFAULT_TOLERANCES), "tolerances", out);
  const expected = c.expected;
  extra(expected, EXPECTED_FIELDS, "expected", out);
  if (!isObject(expected)) return out;
  for (const key of ["kcal", "protein"]) {
    extraInValue(expected[key], `expected.${key}`, out);
  }
  const items = expected.items;
  if (isObject(items) && "anySplit" in items) {
    extra(items, ANY_SPLIT_FIELDS, "expected.items", out);
    extra(items.every, EVERY_FIELDS, "expected.items.every", out);
    if (isObject(items.every)) {
      for (const [key, value] of Object.entries(items.every)) {
        extraInValue(value, `expected.items.every.${key}`, out);
      }
    }
    return out;
  }
  if (!Array.isArray(items)) {
    extraInValue(items, "expected.items", out);
    return out;
  }
  items.forEach((item, i) => {
    const path = `expected.items[${i}]`;
    if (!isObject(item)) return;
    const source = typeof item.source === "string" ? item.source : "";
    extra(item, [...ITEM_FIELDS, ...(SOURCE_FIELDS[source] ?? [])], path, out);
    for (const [key, value] of Object.entries(item)) {
      if (Array.isArray(value)) continue;
      extraInValue(value, `${path}.${key}`, out);
    }
  });
  return out;
}
