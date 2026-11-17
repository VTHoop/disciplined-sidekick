import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CASES } from "./cases";
import { containsDateOrTime, fieldsOutsideCaseType } from "./privacy";
import { UNCONFIRMED } from "./types";

describe("containsDateOrTime", () => {
  it.each([
    "2026-11-17 oatmeal",
    "11/17/2026 eggs",
    "17/11/26 eggs",
    "Nov 17 toast",
    "17 November toast",
    "oatmeal at 7:30",
    "eggs at 7am",
    "eggs at 7 pm",
    "coffee 07:05",
  ])("finds one in %j", (text) => {
    expect(containsDateOrTime(text)).toBe(true);
  });

  it.each([
    "2 eggs and 150 g blueberries",
    "1/2 cup oats",
    "3/4 cup white rice",
    "Chobani plain Greek yogurt, 170 g",
    "a cup of rice",
    "Mezeh bowl",
    "may contain nuts",
  ])("finds none in %j", (text) => {
    expect(containsDateOrTime(text)).toBe(false);
  });
});

describe("fieldsOutsideCaseType", () => {
  const ok = {
    id: "x",
    category: "count",
    input: "2 eggs",
    expected: {
      items: [
        {
          name: "Eggs",
          canonicalName: "egg",
          grams: 100,
          portionEstimated: false,
          countsFruitVeg: false,
          brand: null,
          path: "generic",
          source: "usda",
          fdcIds: [1],
          answerSource: "usda-entry",
        },
      ],
      kcal: UNCONFIRMED,
      protein: 12,
    },
    tolerances: { gramsPct: 0.2 },
  };

  it("finds none in a well-formed case", () => {
    expect(fieldsOutsideCaseType(ok)).toEqual([]);
  });

  it("names a field at any depth", () => {
    expect(fieldsOutsideCaseType({ ...ok, userId: "u" })).toEqual(["userId"]);
    expect(
      fieldsOutsideCaseType({
        ...ok,
        expected: { ...ok.expected, loggedAt: "t" },
      }),
    ).toEqual(["expected.loggedAt"]);
    expect(
      fieldsOutsideCaseType({
        ...ok,
        expected: {
          ...ok.expected,
          items: [{ ...ok.expected.items[0], entryId: "e" }],
        },
      }),
    ).toEqual(["expected.items[0].entryId"]);
    expect(
      fieldsOutsideCaseType({ ...ok, tolerances: { when: "now" } }),
    ).toEqual(["tolerances.when"]);
  });

  it("checks the fields of a range", () => {
    const item = {
      ...ok.expected.items[0],
      source: "estimated",
      kcalPer100g: { min: 1, max: 2, at: "noon" },
      proteinPer100g: { min: 1, max: 2 },
    };
    expect(
      fieldsOutsideCaseType({
        ...ok,
        expected: { ...ok.expected, items: [item] },
      }),
    ).toEqual(["expected.items[0].fdcIds", "expected.items[0].kcalPer100g.at"]);
  });
});

describe("golden set privacy", () => {
  it.each(CASES.map((c) => [c.id, c] as const))(
    "%s has no field outside the case type",
    (_id, c) => {
      expect(fieldsOutsideCaseType(c)).toEqual([]);
    },
  );

  it.each(CASES.map((c) => [c.id, c.input] as const))(
    "%s has no date or time in its input",
    (_id, input) => {
      expect(containsDateOrTime(input)).toBe(false);
    },
  );

  it("evals/food/README.md states the privacy rule", () => {
    const readme = readFileSync(join(import.meta.dirname, "README.md"), "utf8");
    expect(readme).toMatch(/real entries/i);
    expect(readme).toMatch(/reads each case before it's committed/i);
    expect(readme).toMatch(/health context/i);
    expect(readme).toMatch(/people/i);
    expect(readme).toMatch(/where the owner lives/i);
  });
});
