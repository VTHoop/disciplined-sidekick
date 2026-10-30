import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalKey,
  energyKcalPer100g,
  entryTotals,
  formatGrams,
  formatKcal,
  formatProtein,
  itemNutrition,
  localDate,
  lookupKey,
  NUTRIENT,
  proteinPer100g,
} from "./nutrition";

describe("NUTRIENT", () => {
  it("names the USDA FDC nutrient ids the app reads", () => {
    expect(NUTRIENT).toEqual({
      energyKcal: 1008,
      energyAtwaterSpecific: 2048,
      energyAtwaterGeneral: 2047,
      protein: 1003,
    });
  });
});

describe("energyKcalPer100g", () => {
  it("prefers 1008 over 2048 and 2047", () => {
    expect(
      energyKcalPer100g([
        { nutrientId: 2047, value: 60 },
        { nutrientId: 2048, value: 58 },
        { nutrientId: 1008, value: 57 },
      ]),
    ).toBe(57);
  });

  it("falls back to 2048 when 1008 is missing", () => {
    expect(
      energyKcalPer100g([
        { nutrientId: 2047, value: 60 },
        { nutrientId: 2048, value: 58 },
      ]),
    ).toBe(58);
  });

  it("falls back to 2047 when 1008 and 2048 are missing", () => {
    expect(energyKcalPer100g([{ nutrientId: 2047, value: 60 }])).toBe(60);
  });

  it("skips a listed nutrient that has no value", () => {
    expect(
      energyKcalPer100g([
        { nutrientId: 1008, value: null },
        { nutrientId: 2048, value: undefined },
        { nutrientId: 2047, value: 60 },
      ]),
    ).toBe(60);
  });

  it("keeps a real 0 (e.g. water) rather than falling back", () => {
    expect(
      energyKcalPer100g([
        { nutrientId: 1008, value: 0 },
        { nutrientId: 2047, value: 5 },
      ]),
    ).toBe(0);
  });

  it("returns null when no energy nutrient is present", () => {
    expect(energyKcalPer100g([{ nutrientId: 1003, value: 12 }])).toBeNull();
    expect(energyKcalPer100g([])).toBeNull();
  });
});

describe("proteinPer100g", () => {
  it("reads nutrient 1003", () => {
    expect(
      proteinPer100g([
        { nutrientId: 1008, value: 143 },
        { nutrientId: 1003, value: 12.56 },
      ]),
    ).toBe(12.56);
  });

  it("returns null when 1003 is missing or has no value", () => {
    expect(proteinPer100g([{ nutrientId: 1008, value: 143 }])).toBeNull();
    expect(proteinPer100g([{ nutrientId: 1003, value: null }])).toBeNull();
  });
});

describe("itemNutrition", () => {
  it("scales per-100 g values by grams / 100, unrounded", () => {
    const { kcal, protein } = itemNutrition(
      { kcalPer100g: 57, proteinPer100g: 0.74 },
      150,
    );
    expect(kcal).toBeCloseTo(85.5, 10);
    expect(protein).toBeCloseTo(1.11, 10);
  });

  it("keeps fractional results without rounding", () => {
    const { kcal, protein } = itemNutrition(
      { kcalPer100g: 143, proteinPer100g: 12.56 },
      33.3,
    );
    expect(kcal).toBeCloseTo(47.619, 10);
    expect(protein).toBeCloseTo(4.18248, 10);
  });

  it("gives 0 for 0 grams", () => {
    expect(
      itemNutrition({ kcalPer100g: 143, proteinPer100g: 12.56 }, 0),
    ).toEqual({ kcal: 0, protein: 0 });
  });
});

describe("entryTotals", () => {
  it("sums the unrounded item values", () => {
    // Rounded first, 0.4 + 0.4 + 0.4 kcal would total 0; unrounded it is 1.2.
    const items = [
      { kcal: 0.4, protein: 0.04, fruitVegG: 0.4 },
      { kcal: 0.4, protein: 0.04, fruitVegG: 0.4 },
      { kcal: 0.4, protein: 0.04, fruitVegG: 0.4 },
    ];
    const totals = entryTotals(items);
    expect(totals.kcal).toBeCloseTo(1.2, 10);
    expect(totals.protein).toBeCloseTo(0.12, 10);
    expect(totals.fruitVegG).toBeCloseTo(1.2, 10);
  });

  it("totals two eggs and 150 g blueberries", () => {
    const totals = entryTotals([
      { kcal: 143, protein: 12.56, fruitVegG: 0 },
      { kcal: 85.5, protein: 1.11, fruitVegG: 150 },
    ]);
    expect(totals.kcal).toBeCloseTo(228.5, 10);
    expect(totals.protein).toBeCloseTo(13.67, 10);
    expect(totals.fruitVegG).toBe(150);
  });

  it("is all zeros for no items", () => {
    expect(entryTotals([])).toEqual({ kcal: 0, protein: 0, fruitVegG: 0 });
  });
});

describe("display formatting", () => {
  it("rounds grams to whole numbers", () => {
    expect(formatGrams(150.4)).toBe("150");
    expect(formatGrams(99.6)).toBe("100");
  });

  it("rounds kcal to whole numbers", () => {
    expect(formatKcal(85.5)).toBe("86");
    expect(formatKcal(47.619)).toBe("48");
  });

  it("rounds protein to 1 decimal place, keeping a trailing zero", () => {
    expect(formatProtein(4.18248)).toBe("4.2");
    expect(formatProtein(12)).toBe("12.0");
    expect(formatProtein(13.67)).toBe("13.7");
  });

  it("never shows -0", () => {
    expect(formatKcal(-0.2)).toBe("0");
    expect(formatProtein(-0.01)).toBe("0.0");
  });
});

// core has no Node types (it also runs in the browser); the tests run in Node.
const env = (
  globalThis as unknown as {
    process: { env: Record<string, string | undefined> };
  }
).process.env;

describe("localDate", () => {
  const originalTz = env.TZ;
  afterEach(() => {
    env.TZ = originalTz;
  });

  it("gives the device's local calendar day as YYYY-MM-DD", () => {
    expect(localDate(new Date(2026, 9, 28, 23, 59))).toBe("2026-10-28");
    expect(localDate(new Date(2026, 9, 29, 0, 1))).toBe("2026-10-29");
  });

  it("uses the local day, not the UTC day", () => {
    env.TZ = "America/New_York";
    // 02:30 UTC on the 29th is 22:30 on the 28th in New York.
    expect(localDate(new Date("2026-10-29T02:30:00Z"))).toBe("2026-10-28");
  });

  it("pads single-digit months and days", () => {
    expect(localDate(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});

describe("canonicalKey", () => {
  it("ignores case, surrounding space and repeated inner space", () => {
    expect(canonicalKey("  Blueberries,   raw ")).toBe("blueberries, raw");
    expect(canonicalKey("BLUEBERRIES, RAW")).toBe("blueberries, raw");
  });
});

describe("lookupKey", () => {
  it("leaves a generic key exactly as canonicalKey makes it, so old food_cache rows still hit", () => {
    expect(lookupKey(null, "  Blueberries,   raw ")).toBe(
      canonicalKey("Blueberries, raw"),
    );
    expect(lookupKey(undefined, "egg, whole, raw")).toBe("egg, whole, raw");
  });

  it("keeps a branded food apart from the same food with no brand", () => {
    expect(lookupKey("Chobani", "plain greek yogurt")).not.toBe(
      lookupKey(null, "plain greek yogurt"),
    );
  });

  it("keeps two brands of the same food apart", () => {
    expect(lookupKey("Chobani", "plain greek yogurt")).not.toBe(
      lookupKey("Fage", "plain greek yogurt"),
    );
  });

  it("ignores case and spacing in the brand and the name", () => {
    expect(lookupKey("  CHOBANI ", "Plain  Greek Yogurt")).toBe(
      lookupKey("Chobani", "plain greek yogurt"),
    );
  });

  it("keeps a restaurant's food apart from the same brand and name as a packaged product", () => {
    expect(lookupKey("Chipotle", "queso", "restaurant")).not.toBe(
      lookupKey("Chipotle", "queso", "branded"),
    );
  });

  it("keys a branded item by default, and ignores the path when there is no brand", () => {
    expect(lookupKey("Chobani", "plain greek yogurt")).toBe(
      lookupKey("Chobani", "plain greek yogurt", "branded"),
    );
    expect(lookupKey(null, "queso", "generic")).toBe(canonicalKey("queso"));
  });

  it("cannot be forged by a generic name that looks like a brand key", () => {
    expect(lookupKey(null, "chobani plain greek yogurt")).not.toBe(
      lookupKey("Chobani", "plain greek yogurt"),
    );
  });
});
