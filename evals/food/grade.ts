import type {
  FoodPreview,
  PreviewItem,
} from "../../packages/core/src/index.js";
import {
  type AnySplit,
  DEFAULT_TOLERANCES,
  type EvalCase,
  type EveryItem,
  type ExpectedItem,
  isAnySplit,
  isUnconfirmed,
  type Range,
  type Tolerances,
  type Unconfirmed,
} from "./types.js";

/** The checks each repeat is graded on, in report order. */
export const CHECKS = [
  "split",
  "grams",
  "flags",
  "canonical",
  "pathSource",
  "pick",
  "estimate",
  "total",
] as const;
export type CheckName = (typeof CHECKS)[number];

export interface Failure {
  /** The expected item's canonical name; absent for entry-level checks. */
  item?: string;
  field: string;
  expected: unknown;
  actual: unknown;
}

export interface CheckResult {
  pass: boolean;
  failures: Failure[];
}

export type Checks = Partial<Record<CheckName, CheckResult>>;

/** What one repeat of a case produced. */
export type Outcome =
  | { kind: "ok"; preview: Pick<FoodPreview, "items" | "totals"> }
  | { kind: "error"; type: string; message: string };

export type ErrorClass = "no-food" | "ai" | "infrastructure";

const AI_ERRORS = new Set([
  "AiValidationError",
  "AiRefusalError",
  "AiTruncatedError",
  "FoodLookupError",
]);

/**
 * How an error is graded. Anything that isn't a no-food or AI error, a bug in
 * code included, is treated like an outage: left out of the pass rates.
 */
export function classifyError(type: string): ErrorClass {
  if (type === "NoFoodError") return "no-food";
  return AI_ERRORS.has(type) ? "ai" : "infrastructure";
}

/** Within `pct` of `expected` or within `floor`, whichever is wider. */
export function withinTolerance(
  expected: number,
  actual: number,
  pct: number,
  floor: number,
): boolean {
  const allowed = Math.max(Math.abs(expected) * pct, floor);
  // A hair of slack so a value exactly on the edge isn't failed by float error.
  return Math.abs(actual - expected) <= allowed + 1e-9;
}

/** A case with every Unconfirmed marker ruled out. */
type Confirmed<T> = T extends Unconfirmed
  ? never
  : T extends readonly (infer U)[]
    ? readonly Confirmed<U>[]
    : T extends object
      ? { [K in keyof T]: Confirmed<T[K]> }
      : T;
type ConfirmedCase = Confirmed<EvalCase>;
type ConfirmedItem = Confirmed<ExpectedItem>;
type ConfirmedAnySplit = Confirmed<AnySplit>;

const isNoFood = (c: ConfirmedCase) =>
  !isAnySplit(c.expected.items) && c.expected.items.length === 0;

const hasUnconfirmed = (value: unknown): boolean => {
  if (isUnconfirmed(value)) return true;
  if (Array.isArray(value)) return value.some(hasUnconfirmed);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(hasUnconfirmed);
  }
  return false;
};

/** True when the owner has written every expected value. */
export const isConfirmed = (c: EvalCase): boolean =>
  !hasUnconfirmed(c.expected);

const result = (failures: Failure[]): CheckResult => ({
  pass: failures.length === 0,
  failures,
});

/** One failure, or none when `ok`. Entry-level checks leave out `item`. */
const unless = (
  ok: boolean,
  field: string,
  expected: unknown,
  actual: unknown,
  item?: string,
): Failure[] =>
  ok
    ? []
    : [{ ...(item === undefined ? {} : { item }), field, expected, actual }];

const dropUnscored = (checks: Checks): Checks =>
  Object.fromEntries(
    Object.entries(checks).filter(([, v]) => v !== undefined),
  ) as Checks;

/** The item fields an any-split case can require of every item, by check. */
const EVERY_ITEM_FIELDS = {
  flags: ["portionEstimated"],
  pathSource: ["path", "brand"],
} as const;

/** The checks an any-split case scores: split, what every item must be, and the total. */
function anySplitChecks({ every = {} }: ConfirmedAnySplit): CheckName[] {
  return CHECKS.filter(
    (check) =>
      check === "split" ||
      check === "total" ||
      ((check === "flags" || check === "pathSource") &&
        EVERY_ITEM_FIELDS[check].some((f) => every[f] !== undefined)),
  );
}

/** The checks a confirmed case scores on a repeat that produced items. */
function applicableChecks(c: ConfirmedCase): CheckName[] {
  if (isAnySplit(c.expected.items)) return anySplitChecks(c.expected.items);
  if (isNoFood(c)) return ["split"];
  const sources = new Set(c.expected.items.map((i) => i.source));
  return CHECKS.filter(
    (check) =>
      (check !== "pick" || sources.has("usda") || sources.has("branded")) &&
      (check !== "estimate" || sources.has("estimated")),
  );
}

export interface RepeatGrade {
  /** False when an infrastructure error left the repeat out. */
  scored: boolean;
  checks: Checks;
  /** Expected canonical names with no actual item. */
  unmatched: string[];
  /** Actual canonical names with no expected item. */
  extras: string[];
}

/** Pairs expected and actual items by canonical name, in order. */
function match(expected: readonly ConfirmedItem[], actual: PreviewItem[]) {
  const left = [...actual];
  const pairs: [ConfirmedItem, PreviewItem][] = [];
  const unmatched: string[] = [];
  for (const e of expected) {
    const i = left.findIndex((a) => a.canonicalName === e.canonicalName);
    if (i === -1) unmatched.push(e.canonicalName);
    else pairs.push([e, ...left.splice(i, 1)] as [ConfirmedItem, PreviewItem]);
  }
  return { pairs, unmatched, extras: left.map((a) => a.canonicalName) };
}

const inRange = (value: number, { min, max }: Range) =>
  value >= min && value <= max;

/** Grades the matched pairs on one item-level check; undefined when no pair applies. */
function itemCheck(
  pairs: [ConfirmedItem, PreviewItem][],
  grade: (e: ConfirmedItem, a: PreviewItem) => Failure[] | null,
): CheckResult | undefined {
  let scored = false;
  const failures: Failure[] = [];
  for (const [e, a] of pairs) {
    const f = grade(e, a);
    if (f === null) continue;
    scored = true;
    failures.push(...f);
  }
  return scored ? result(failures) : undefined;
}

const differs = (
  item: string,
  field: string,
  expected: unknown,
  actual: unknown,
): Failure[] => unless(expected === actual, field, expected, actual, item);

function totalCheck(
  c: ConfirmedCase,
  totals: FoodPreview["totals"],
  tol: Required<Tolerances>,
): CheckResult {
  const { kcal, protein } = c.expected;
  return result([
    ...unless(
      withinTolerance(kcal, totals.kcal, tol.kcalPct, tol.kcalFloor),
      "kcal",
      kcal,
      totals.kcal,
    ),
    ...unless(
      withinTolerance(
        protein,
        totals.protein,
        tol.proteinPct,
        tol.proteinFloorG,
      ),
      "protein",
      protein,
      totals.protein,
    ),
  ]);
}

/** Every actual item against what every item must be, for the fields given. */
function everyCheck(
  items: PreviewItem[],
  every: Confirmed<EveryItem>,
  fields: readonly (keyof EveryItem)[],
): CheckResult | undefined {
  const given = fields.filter((f) => every[f] !== undefined);
  if (given.length === 0) return undefined;
  return result(
    items.flatMap((a) =>
      given.flatMap((f) => differs(a.canonicalName, f, every[f], a[f])),
    ),
  );
}

/** A dish named without its contents: any split passes; the totals are graded. */
function gradeAnySplit(
  c: ConfirmedCase,
  { every = {} }: ConfirmedAnySplit,
  preview: Pick<FoodPreview, "items" | "totals">,
  tol: Required<Tolerances>,
): RepeatGrade {
  const checks: Checks = {
    split: result(
      unless(preview.items.length > 0, "items", "at least one item", 0),
    ),
    flags: everyCheck(preview.items, every, EVERY_ITEM_FIELDS.flags),
    pathSource: everyCheck(preview.items, every, EVERY_ITEM_FIELDS.pathSource),
    total: totalCheck(c, preview.totals, tol),
  };
  return {
    scored: true,
    unmatched: [],
    extras: [],
    checks: dropUnscored(checks),
  };
}

function gradePreview(
  c: ConfirmedCase,
  preview: Pick<FoodPreview, "items" | "totals">,
): RepeatGrade {
  const tol = { ...DEFAULT_TOLERANCES, ...(c.tolerances as Tolerances) };
  if (isAnySplit(c.expected.items)) {
    return gradeAnySplit(c, c.expected.items, preview, tol);
  }
  const { pairs, unmatched, extras } = match(c.expected.items, preview.items);
  const split = result([
    ...unmatched.map((name) => ({
      field: "item",
      expected: name,
      actual: null,
    })),
    ...extras.map((name) => ({ field: "item", expected: null, actual: name })),
  ]);
  const base = { scored: true, unmatched, extras };
  // A no-food case that produced items fails its split and scores nothing else.
  if (isNoFood(c)) return { ...base, checks: { split } };

  const checks: Checks = {
    split,
    grams: itemCheck(pairs, (e, a) =>
      unless(
        withinTolerance(
          e.grams,
          a.grams,
          e.portionEstimated ? tol.gramsEstimatedPct : tol.gramsPct,
          tol.gramsFloorG,
        ),
        "grams",
        e.grams,
        a.grams,
        e.canonicalName,
      ),
    ),
    flags: itemCheck(pairs, (e, a) => [
      ...differs(
        e.canonicalName,
        "portionEstimated",
        e.portionEstimated,
        a.portionEstimated,
      ),
      ...differs(
        e.canonicalName,
        "countsFruitVeg",
        e.countsFruitVeg,
        a.fruitVegG > 0,
      ),
    ]),
    pathSource: itemCheck(pairs, (e, a) => [
      ...differs(e.canonicalName, "path", e.path, a.path),
      ...differs(e.canonicalName, "source", e.source, a.source),
      ...differs(e.canonicalName, "brand", e.brand, a.brand),
    ]),
    pick: itemCheck(pairs, (e, a) => {
      if (e.source === "estimated") return null;
      return unless(
        a.fdcId !== null && e.fdcIds.includes(a.fdcId),
        "fdcId",
        e.fdcIds,
        a.fdcId,
        e.canonicalName,
      );
    }),
    estimate: itemCheck(pairs, (e, a) => {
      if (e.source !== "estimated") return null;
      return [
        ...unless(
          inRange(a.kcalPer100g, e.kcalPer100g),
          "kcalPer100g",
          e.kcalPer100g,
          a.kcalPer100g,
          e.canonicalName,
        ),
        ...unless(
          inRange(a.proteinPer100g, e.proteinPer100g),
          "proteinPer100g",
          e.proteinPer100g,
          a.proteinPer100g,
          e.canonicalName,
        ),
      ];
    }),
    total: totalCheck(c, preview.totals, tol),
  };
  return { ...base, checks: dropUnscored(checks) };
}

/**
 * Grades one repeat of a confirmed case on every check but canonical-name
 * consistency, which needs all the repeats (see gradeCase).
 */
export function gradeRepeat(c: EvalCase, outcome: Outcome): RepeatGrade {
  const confirmed = c as ConfirmedCase;
  if (outcome.kind === "ok") return gradePreview(confirmed, outcome.preview);
  const none = { unmatched: [], extras: [] };
  const errorClass = classifyError(outcome.type);
  if (errorClass === "infrastructure") {
    return { ...none, scored: false, checks: {} };
  }
  if (errorClass === "no-food") {
    return {
      ...none,
      scored: true,
      checks: {
        split: result(
          unless(isNoFood(confirmed), "items", "items", "NoFoodError"),
        ),
      },
    };
  }
  const failure = { field: "error", expected: null, actual: outcome.type };
  return {
    ...none,
    scored: true,
    checks: Object.fromEntries(
      applicableChecks(confirmed).map((check) => [check, result([failure])]),
    ),
  };
}

export type CaseStatus = "scored" | "unconfirmed" | "not-scored";

export interface CheckCount {
  passed: number;
  scored: number;
}

export interface CaseGrade {
  status: CaseStatus;
  /** One per repeat; empty checks for an unconfirmed case. */
  repeats: RepeatGrade[];
  counts: Partial<Record<CheckName, CheckCount>>;
  /** A check passed in some repeats and failed in others. */
  varied: boolean;
}

const signature = (outcome: Outcome) =>
  outcome.kind === "ok"
    ? JSON.stringify(outcome.preview.items.map((i) => i.canonicalName).sort())
    : null;

/**
 * Canonical-name consistency: a repeat passes when its set of canonical names
 * is the most common one and another repeat shares it (or it's the only one).
 */
function gradeConsistency(
  c: EvalCase,
  outcomes: Outcome[],
  repeats: RepeatGrade[],
) {
  // An any-split case may split differently each time; a no-food case has no names.
  const confirmed = c as ConfirmedCase;
  if (isAnySplit(confirmed.expected.items) || isNoFood(confirmed)) return;
  const sigs = outcomes.map(signature);
  const tally = new Map<string, number>();
  for (const s of sigs) if (s !== null) tally.set(s, (tally.get(s) ?? 0) + 1);
  const max = Math.max(0, ...tally.values());
  const total = [...tally.values()].reduce((a, b) => a + b, 0);
  sigs.forEach((s, i) => {
    const repeat = repeats[i];
    if (s === null || !repeat?.scored) return;
    const count = tally.get(s) ?? 0;
    const pass = count === max && (count > 1 || total === 1);
    repeat.checks = {
      ...repeat.checks,
      canonical: result(
        unless(
          pass,
          "canonicalNames",
          "the most common set across repeats",
          JSON.parse(s),
        ),
      ),
    };
    // Keep the report order.
    repeat.checks = Object.fromEntries(
      CHECKS.flatMap((k) => (repeat.checks[k] ? [[k, repeat.checks[k]]] : [])),
    );
  });
}

/** Adds passes and scored repeats to a check's count. */
function addCount(
  into: Partial<Record<CheckName, CheckCount>>,
  check: CheckName,
  passed: number,
  scored: number,
) {
  const n = into[check] ?? { passed: 0, scored: 0 };
  into[check] = n;
  n.passed += passed;
  n.scored += scored;
}

/** Grades every repeat of a case and counts each check's passes. */
export function gradeCase(c: EvalCase, outcomes: Outcome[]): CaseGrade {
  if (!isConfirmed(c)) {
    return {
      status: "unconfirmed",
      repeats: outcomes.map(() => ({
        scored: false,
        checks: {},
        unmatched: [],
        extras: [],
      })),
      counts: {},
      varied: false,
    };
  }
  const repeats = outcomes.map((o) => gradeRepeat(c, o));
  gradeConsistency(c, outcomes, repeats);
  if (!repeats.some((r) => r.scored)) {
    return { status: "not-scored", repeats, counts: {}, varied: false };
  }
  const counts: Partial<Record<CheckName, CheckCount>> = {};
  for (const check of CHECKS) {
    for (const r of repeats) {
      const res = r.checks[check];
      if (res) addCount(counts, check, res.pass ? 1 : 0, 1);
    }
  }
  const varied = Object.values(counts).some(
    (n) => n.passed > 0 && n.passed < n.scored,
  );
  return { status: "scored", repeats, counts, varied };
}

/** Each check's passes over scored repeats, summed across scored cases. */
export function passRates(
  grades: CaseGrade[],
): Partial<Record<CheckName, CheckCount>> {
  const rates: Partial<Record<CheckName, CheckCount>> = {};
  for (const check of CHECKS) {
    for (const g of grades) {
      const n = g.counts[check];
      if (n) addCount(rates, check, n.passed, n.scored);
    }
  }
  return rates;
}
