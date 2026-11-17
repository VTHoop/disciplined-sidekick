import { describe, expect, it } from "vitest";
import type { PreviewItem } from "../../packages/core/src/index.js";
import {
  type CaseGrade,
  classifyError,
  gradeCase,
  gradeRepeat,
  isConfirmed,
  type Outcome,
  passRates,
  withinTolerance,
} from "./grade";
import { type EvalCase, type ExpectedItem, UNCONFIRMED } from "./types";

const eggs: ExpectedItem = {
  name: "Eggs",
  canonicalName: "egg, whole, cooked",
  grams: 100,
  portionEstimated: false,
  countsFruitVeg: false,
  brand: null,
  path: "generic",
  source: "usda",
  fdcIds: [171287, 748967],
  answerSource: "usda-entry",
};

const blueberries: ExpectedItem = {
  name: "Blueberries",
  canonicalName: "blueberries, raw",
  grams: 150,
  portionEstimated: false,
  countsFruitVeg: true,
  brand: null,
  path: "generic",
  source: "usda",
  fdcIds: [171711],
  answerSource: "usda-entry",
};

const bowlChicken: ExpectedItem = {
  name: "Chicken",
  canonicalName: "grilled chicken",
  grams: 113,
  portionEstimated: true,
  countsFruitVeg: false,
  brand: "Chipotle",
  path: "restaurant",
  source: "estimated",
  kcalPer100g: { min: 150, max: 200 },
  proteinPer100g: { min: 25, max: 35 },
  answerSource: "chain-nutrition",
};

const breakfast: EvalCase = {
  id: "eggs-and-blueberries",
  category: "multi-food",
  input: "2 eggs and 150 g blueberries",
  expected: { items: [eggs, blueberries], kcal: 229, protein: 13.6 },
};

const chipotle: EvalCase = {
  id: "chipotle-chicken",
  category: "restaurant-by-component",
  input: "Chipotle chicken",
  expected: { items: [bowlChicken], kcal: 198, protein: 36 },
};

const noFood: EvalCase = {
  id: "no-food",
  category: "no-food",
  input: "went for a 5k run",
  expected: { items: [], kcal: 0, protein: 0 },
};

const actual = (over: Partial<PreviewItem>): PreviewItem => ({
  name: "Eggs",
  canonicalName: "egg, whole, cooked",
  grams: 100,
  kcal: 143,
  protein: 12.6,
  fruitVegG: 0,
  kcalPer100g: 143,
  proteinPer100g: 12.6,
  estimated: false,
  portionEstimated: false,
  fdcId: 171287,
  brand: null,
  path: "generic",
  source: "usda",
  ...over,
});

const actualBerries = (over: Partial<PreviewItem> = {}) =>
  actual({
    name: "Blueberries",
    canonicalName: "blueberries, raw",
    grams: 150,
    kcal: 86,
    protein: 1,
    fruitVegG: 150,
    kcalPer100g: 57,
    proteinPer100g: 0.7,
    fdcId: 171711,
    ...over,
  });

const actualChicken = (over: Partial<PreviewItem> = {}) =>
  actual({
    name: "Chicken",
    canonicalName: "grilled chicken",
    grams: 113,
    kcal: 198,
    protein: 36,
    kcalPer100g: 175,
    proteinPer100g: 32,
    estimated: true,
    portionEstimated: true,
    fdcId: null,
    brand: "Chipotle",
    path: "restaurant",
    source: "estimated",
    ...over,
  });

const ok = (items: PreviewItem[]): Outcome => ({
  kind: "ok",
  preview: {
    items,
    totals: {
      kcal: items.reduce((s, i) => s + i.kcal, 0),
      protein: items.reduce((s, i) => s + i.protein, 0),
      fruitVegG: items.reduce((s, i) => s + i.fruitVegG, 0),
    },
  },
});

const failed = (type: string, message = "boom"): Outcome => ({
  kind: "error",
  type,
  message,
});

const goodBreakfast = () => ok([actual({}), actualBerries()]);

describe("withinTolerance", () => {
  it("passes within the percentage", () => {
    expect(withinTolerance(100, 109, 0.1, 5)).toBe(true);
    expect(withinTolerance(100, 111, 0.1, 5)).toBe(false);
  });

  it("passes within the floor when the floor is wider", () => {
    // ±10% of 20 g is 2 g; the 5 g floor wins.
    expect(withinTolerance(20, 25, 0.1, 5)).toBe(true);
    expect(withinTolerance(20, 25.5, 0.1, 5)).toBe(false);
  });

  it("is symmetric about the expected value", () => {
    expect(withinTolerance(100, 91, 0.1, 5)).toBe(true);
    expect(withinTolerance(100, 89, 0.1, 5)).toBe(false);
  });
});

describe("default tolerances", () => {
  const grams = (item: ExpectedItem, g: number) =>
    gradeRepeat(
      { ...breakfast, expected: { ...breakfast.expected, items: [item] } },
      ok([actual({ grams: g })]),
    ).checks.grams?.pass;

  it("allows ±10% on grams when a quantity is given", () => {
    expect(grams(eggs, 110)).toBe(true);
    expect(grams(eggs, 111)).toBe(false);
  });

  it("allows ±40% on grams when the portion is estimated", () => {
    const guessed = { ...eggs, portionEstimated: true };
    expect(grams(guessed, 140)).toBe(true);
    expect(grams(guessed, 141)).toBe(false);
  });

  it("applies the 5 g floor to grams", () => {
    const small = { ...eggs, grams: 20 };
    expect(grams(small, 25)).toBe(true);
    expect(grams(small, 26)).toBe(false);
  });

  const total = (kcal: number, protein: number, c: EvalCase = breakfast) => {
    const outcome = goodBreakfast();
    if (outcome.kind === "ok") {
      outcome.preview.totals = { kcal, protein, fruitVegG: 150 };
    }
    return gradeRepeat(c, outcome).checks.total?.pass;
  };

  it("allows ±15% on entry kcal and protein", () => {
    expect(total(229 * 1.15, 13.6)).toBe(true);
    expect(total(229 * 1.16, 13.6)).toBe(false);
    expect(total(229, 13.6 * 1.15)).toBe(true);
    expect(total(229, 13.6 * 1.2)).toBe(false);
  });

  it("applies the 10 kcal and 2 g protein floors to the entry", () => {
    const small: EvalCase = {
      ...breakfast,
      expected: { ...breakfast.expected, kcal: 40, protein: 1 },
    };
    expect(total(50, 1, small)).toBe(true);
    expect(total(51, 1, small)).toBe(false);
    expect(total(40, 3, small)).toBe(true);
    expect(total(40, 3.1, small)).toBe(false);
  });

  it("lets a case override a tolerance", () => {
    const loose: EvalCase = {
      ...breakfast,
      expected: { ...breakfast.expected, items: [eggs] },
      tolerances: { gramsPct: 0.5 },
    };
    expect(
      gradeRepeat(loose, ok([actual({ grams: 150 })])).checks.grams?.pass,
    ).toBe(true);
  });
});

describe("isConfirmed", () => {
  it("is true when every expected value is written", () => {
    expect(isConfirmed(breakfast)).toBe(true);
    expect(isConfirmed(noFood)).toBe(true);
  });

  it("is false when any expected value is unconfirmed", () => {
    expect(
      isConfirmed({
        ...breakfast,
        expected: { ...breakfast.expected, kcal: UNCONFIRMED },
      }),
    ).toBe(false);
    expect(
      isConfirmed({
        ...breakfast,
        expected: {
          ...breakfast.expected,
          items: [eggs, { ...blueberries, grams: UNCONFIRMED }],
        },
      }),
    ).toBe(false);
    expect(
      isConfirmed({
        ...breakfast,
        expected: { ...breakfast.expected, items: UNCONFIRMED },
      }),
    ).toBe(false);
  });
});

describe("split", () => {
  it("passes when the canonical names match one to one", () => {
    expect(gradeRepeat(breakfast, goodBreakfast()).checks.split?.pass).toBe(
      true,
    );
  });

  it("an unmatched expected or extra actual item fails split and its other checks aren't scored", () => {
    const g = gradeRepeat(
      breakfast,
      ok([
        actual({}),
        actualBerries({ canonicalName: "blueberry", grams: 999 }),
      ]),
    );
    expect(g.checks.split?.pass).toBe(false);
    expect(g.unmatched).toEqual(["blueberries, raw"]);
    expect(g.extras).toEqual(["blueberry"]);
    // Only the matched eggs are graded, and they're right.
    expect(g.checks.grams?.pass).toBe(true);
    expect(g.checks.flags?.pass).toBe(true);
    expect(g.checks.split?.failures).toContainEqual(
      expect.objectContaining({ expected: "blueberries, raw" }),
    );
  });

  it("doesn't score item checks when no item matched", () => {
    const g = gradeRepeat(
      breakfast,
      ok([
        actual({ canonicalName: "egg" }),
        actualBerries({ canonicalName: "x" }),
      ]),
    );
    expect(g.checks.split?.pass).toBe(false);
    expect(g.checks.grams).toBeUndefined();
    expect(g.checks.pick).toBeUndefined();
    expect(g.checks.total).toBeDefined();
  });

  it("fails on a no-food case that returned items, and scores nothing else", () => {
    const g = gradeRepeat(noFood, ok([actual({})]));
    expect(g.checks.split?.pass).toBe(false);
    expect(Object.keys(g.checks)).toEqual(["split"]);
  });
});

describe("grams", () => {
  it("fails a matched item outside tolerance, showing expected and actual", () => {
    const g = gradeRepeat(
      breakfast,
      ok([actual({ grams: 130 }), actualBerries()]),
    );
    expect(g.checks.grams?.pass).toBe(false);
    expect(g.checks.grams?.failures).toEqual([
      expect.objectContaining({
        item: "egg, whole, cooked",
        field: "grams",
        expected: 100,
        actual: 130,
      }),
    ]);
  });
});

describe("flags", () => {
  it("compares portionEstimated exactly", () => {
    const g = gradeRepeat(
      breakfast,
      ok([actual({ portionEstimated: true }), actualBerries()]),
    );
    expect(g.checks.flags?.pass).toBe(false);
  });

  it("reads countsFruitVeg from the item's fruit/veg grams", () => {
    const g = gradeRepeat(
      breakfast,
      ok([actual({}), actualBerries({ fruitVegG: 0 })]),
    );
    expect(g.checks.flags?.pass).toBe(false);
    expect(g.checks.flags?.failures).toEqual([
      expect.objectContaining({
        field: "countsFruitVeg",
        expected: true,
        actual: false,
      }),
    ]);
  });
});

describe("path and source", () => {
  it("passes when path, source and brand match", () => {
    expect(
      gradeRepeat(chipotle, ok([actualChicken()])).checks.pathSource?.pass,
    ).toBe(true);
  });

  it("compares the brand exactly", () => {
    const g = gradeRepeat(chipotle, ok([actualChicken({ brand: "chipotle" })]));
    expect(g.checks.pathSource?.pass).toBe(false);
  });

  it("fails a wrong path or source", () => {
    expect(
      gradeRepeat(chipotle, ok([actualChicken({ path: "branded" })])).checks
        .pathSource?.pass,
    ).toBe(false);
    expect(
      gradeRepeat(
        breakfast,
        ok([actual({ source: "estimated" }), actualBerries()]),
      ).checks.pathSource?.pass,
    ).toBe(false);
  });
});

describe("pick", () => {
  it("passes when the picked fdcId is in the accepted set", () => {
    const g = gradeRepeat(
      breakfast,
      ok([actual({ fdcId: 748967 }), actualBerries()]),
    );
    expect(g.checks.pick?.pass).toBe(true);
  });

  it("fails a pick outside the set, or no pick", () => {
    expect(
      gradeRepeat(breakfast, ok([actual({ fdcId: 1 }), actualBerries()])).checks
        .pick?.pass,
    ).toBe(false);
    expect(
      gradeRepeat(breakfast, ok([actual({ fdcId: null }), actualBerries()]))
        .checks.pick?.pass,
    ).toBe(false);
  });

  it("isn't scored for a case with only estimated items", () => {
    expect(
      gradeRepeat(chipotle, ok([actualChicken()])).checks.pick,
    ).toBeUndefined();
  });
});

describe("estimate", () => {
  it("passes when kcal and protein per 100 g are inside the range", () => {
    expect(
      gradeRepeat(chipotle, ok([actualChicken()])).checks.estimate?.pass,
    ).toBe(true);
  });

  it("fails when either is outside the range", () => {
    expect(
      gradeRepeat(chipotle, ok([actualChicken({ kcalPer100g: 220 })])).checks
        .estimate?.pass,
    ).toBe(false);
    expect(
      gradeRepeat(chipotle, ok([actualChicken({ proteinPer100g: 20 })])).checks
        .estimate?.pass,
    ).toBe(false);
  });

  it("includes the range ends", () => {
    expect(
      gradeRepeat(
        chipotle,
        ok([actualChicken({ kcalPer100g: 150, proteinPer100g: 35 })]),
      ).checks.estimate?.pass,
    ).toBe(true);
  });

  it("isn't scored for a case with only looked-up items", () => {
    expect(
      gradeRepeat(breakfast, goodBreakfast()).checks.estimate,
    ).toBeUndefined();
  });
});

describe("total", () => {
  it("a correct total from the wrong source passes total, fails source, and shows both", () => {
    const g = gradeRepeat(
      chipotle,
      ok([actualChicken({ source: "usda", fdcId: 5, estimated: false })]),
    );
    expect(g.checks.total?.pass).toBe(true);
    expect(g.checks.pathSource?.pass).toBe(false);
    expect(g.checks.pathSource?.failures).toEqual([
      expect.objectContaining({
        field: "source",
        expected: "estimated",
        actual: "usda",
      }),
    ]);
  });
});

describe("errors by cause", () => {
  it("classifies error types", () => {
    expect(classifyError("NoFoodError")).toBe("no-food");
    for (const t of [
      "AiValidationError",
      "AiRefusalError",
      "AiTruncatedError",
      "FoodLookupError",
    ]) {
      expect(classifyError(t)).toBe("ai");
    }
    expect(classifyError("AiApiError")).toBe("infrastructure");
    expect(classifyError("UsdaError")).toBe("infrastructure");
    // Anything else, such as a bug in code, is left out of the pass rates too.
    expect(classifyError("TypeError")).toBe("infrastructure");
  });

  it("NoFoodError on a no-food case passes split and scores nothing else", () => {
    const g = gradeRepeat(noFood, failed("NoFoodError"));
    expect(g.scored).toBe(true);
    expect(g.checks).toEqual({ split: { pass: true, failures: [] } });
  });

  it("NoFoodError on a food case fails split and scores nothing else", () => {
    const g = gradeRepeat(breakfast, failed("NoFoodError"));
    expect(Object.keys(g.checks)).toEqual(["split"]);
    expect(g.checks.split?.pass).toBe(false);
  });

  it("an AI error fails every check the case would have scored", () => {
    expect(
      Object.entries(
        gradeRepeat(breakfast, failed("AiValidationError")).checks,
      ),
    ).toEqual(
      [
        "split",
        "grams",
        "flags",
        "canonical",
        "pathSource",
        "pick",
        "total",
      ].map((name) => [name, expect.objectContaining({ pass: false })]),
    );
    expect(
      Object.keys(gradeRepeat(chipotle, failed("FoodLookupError")).checks),
    ).toEqual([
      "split",
      "grams",
      "flags",
      "canonical",
      "pathSource",
      "estimate",
      "total",
    ]);
    expect(gradeRepeat(noFood, failed("AiRefusalError")).checks).toEqual({
      split: expect.objectContaining({ pass: false }),
    });
  });

  it("an infrastructure error leaves the repeat out", () => {
    const g = gradeRepeat(breakfast, failed("UsdaError"));
    expect(g.scored).toBe(false);
    expect(g.checks).toEqual({});
  });
});

describe("gradeCase", () => {
  const count = (g: CaseGrade, check: keyof CaseGrade["counts"]) =>
    g.counts[check];

  it("grades each check per repeat and counts passes over scored repeats", () => {
    const g = gradeCase(breakfast, [
      goodBreakfast(),
      ok([actual({ grams: 130 }), actualBerries()]),
      failed("AiApiError"),
    ]);
    expect(g.status).toBe("scored");
    expect(count(g, "grams")).toEqual({ passed: 1, scored: 2 });
    expect(count(g, "split")).toEqual({ passed: 2, scored: 2 });
    expect(g.varied).toBe(true);
  });

  it("isn't varied when every repeat agrees", () => {
    const g = gradeCase(breakfast, [goodBreakfast(), goodBreakfast()]);
    expect(g.varied).toBe(false);
  });

  it("reports a case whose repeats all hit infrastructure errors as not scored", () => {
    const g = gradeCase(breakfast, [failed("AiApiError"), failed("UsdaError")]);
    expect(g.status).toBe("not-scored");
    expect(g.counts).toEqual({});
  });

  it("doesn't score an unconfirmed case", () => {
    const g = gradeCase(
      { ...breakfast, expected: { ...breakfast.expected, kcal: UNCONFIRMED } },
      [goodBreakfast()],
    );
    expect(g.status).toBe("unconfirmed");
    expect(g.counts).toEqual({});
  });

  describe("canonical-name consistency", () => {
    it("passes repeats whose canonical names match the most common set", () => {
      const drift = ok([actual({ canonicalName: "egg" }), actualBerries()]);
      const g = gradeCase(breakfast, [goodBreakfast(), goodBreakfast(), drift]);
      expect(count(g, "canonical")).toEqual({ passed: 2, scored: 3 });
      expect(g.repeats[2]?.checks.canonical?.pass).toBe(false);
    });

    it("fails every repeat when no two repeats agree", () => {
      const g = gradeCase(breakfast, [
        goodBreakfast(),
        ok([actual({ canonicalName: "egg" }), actualBerries()]),
        ok([actual({ canonicalName: "eggs" }), actualBerries()]),
      ]);
      expect(count(g, "canonical")).toEqual({ passed: 0, scored: 3 });
    });

    it("passes a single repeat", () => {
      const g = gradeCase(breakfast, [goodBreakfast()]);
      expect(count(g, "canonical")).toEqual({ passed: 1, scored: 1 });
    });

    it("ignores item order", () => {
      const g = gradeCase(breakfast, [
        goodBreakfast(),
        ok([actualBerries(), actual({})]),
      ]);
      expect(count(g, "canonical")).toEqual({ passed: 2, scored: 2 });
    });
  });
});

describe("passRates", () => {
  it("sums passes and scored repeats per check over scored cases", () => {
    const a = gradeCase(breakfast, [
      goodBreakfast(),
      ok([actual({ grams: 130 }), actualBerries()]),
    ]);
    const b = gradeCase(chipotle, [ok([actualChicken()])]);
    const unconfirmed = gradeCase(
      { ...chipotle, expected: { ...chipotle.expected, kcal: UNCONFIRMED } },
      [ok([actualChicken({ grams: 1 })])],
    );
    const rates = passRates([a, b, unconfirmed]);
    expect(rates.grams).toEqual({ passed: 2, scored: 3 });
    expect(rates.estimate).toEqual({ passed: 1, scored: 1 });
    expect(rates.pick).toEqual({ passed: 2, scored: 2 });
  });
});
