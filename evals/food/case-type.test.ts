import { describe, expect, it } from "vitest";
import { type EvalCase, UNCONFIRMED } from "./types";

// These checks run in `pnpm typecheck`: each @ts-expect-error fails the build
// if the case beneath it stops being a type error.
const base = {
  id: "example",
  category: "count",
  input: "2 eggs",
} as const;

const item = {
  name: "Eggs",
  canonicalName: "egg, whole, cooked",
  grams: 100,
  portionEstimated: false,
  countsFruitVeg: false,
  brand: null,
  path: "generic",
  answerSource: "usda-entry",
} as const;

const malformed: EvalCase[] = [
  {
    ...base,
    expected: { items: [], kcal: 0, protein: 0 },
    // @ts-expect-error a case holds no fields outside the case type
    loggedAt: "2026-11-17T08:00:00Z",
  },
  // @ts-expect-error a case needs its expected values
  { ...base },
  {
    ...base,
    // @ts-expect-error the category must be one of CATEGORIES
    category: "breakfast",
    expected: { items: [], kcal: 0, protein: 0 },
  },
  {
    ...base,
    expected: {
      // @ts-expect-error a USDA item needs its accepted fdcIds
      items: [{ ...item, source: "usda" }],
      kcal: 143,
      protein: 12.6,
    },
  },
  {
    ...base,
    expected: {
      // @ts-expect-error an estimated item needs its per-100 g ranges
      items: [{ ...item, source: "estimated" }],
      kcal: 143,
      protein: 12.6,
    },
  },
  {
    ...base,
    expected: {
      items: [
        // @ts-expect-error an item needs where its answer came from
        {
          name: "Eggs",
          canonicalName: "egg, whole, cooked",
          grams: 100,
          portionEstimated: false,
          countsFruitVeg: false,
          brand: null,
          path: "generic",
          source: "usda",
          fdcIds: [171287],
        },
      ],
      kcal: 143,
      protein: 12.6,
    },
  },
  {
    ...base,
    expected: { items: [], kcal: 0, protein: 0 },
    // @ts-expect-error tolerances are only the named ones
    tolerances: { grams: 0.2 },
  },
];

const wellFormed: EvalCase[] = [
  {
    ...base,
    expected: {
      items: [{ ...item, source: "usda", fdcIds: [171287] }],
      kcal: 143,
      protein: 12.6,
    },
    tolerances: { gramsPct: 0.2 },
  },
  {
    ...base,
    expected: {
      items: [
        {
          ...item,
          source: "estimated",
          kcalPer100g: { min: 130, max: 160 },
          proteinPer100g: { min: 11, max: 14 },
        },
      ],
      kcal: UNCONFIRMED,
      protein: UNCONFIRMED,
    },
  },
  {
    ...base,
    expected: { items: UNCONFIRMED, kcal: UNCONFIRMED, protein: UNCONFIRMED },
  },
];

describe("case type", () => {
  it("is checked by pnpm typecheck (see the @ts-expect-error lines)", () => {
    expect(malformed).toHaveLength(7);
    expect(wellFormed).toHaveLength(3);
  });
});
