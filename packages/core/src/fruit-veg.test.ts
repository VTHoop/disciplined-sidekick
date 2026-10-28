import { describe, expect, it } from "vitest";
import { FRUIT_VEG_RULES, fruitVegGrams, fruitVegRulesText } from "./fruit-veg";

describe("FRUIT_VEG_RULES (OptimizeMe 800g)", () => {
  it.each([
    "fresh, frozen or cooked fruit and veg",
    "canned packed in water or spices (weighed drained)",
    "potatoes unless commercially fried",
    "beans, lentils, peas, corn, edamame",
    "avocado, olives, fresh coconut",
    "unsweetened applesauce",
    "ferments and pickles with no sugar in the brine",
    "salsa, tomato sauce and guacamole with no added water, oil or sugar",
  ])("counts %s", (rule) => {
    expect(FRUIT_VEG_RULES.counts).toContain(rule);
  });

  it.each([
    "juice",
    "plant milks",
    "dried fruit",
    "veggie chips",
    "commercially fried foods",
    "grains",
    "flour",
    "pasta (including bean pasta)",
    "nuts",
    "seeds",
    "popcorn",
    "tofu",
    "store-bought dishes premixed with juice, water, oil or sugar",
  ])("does not count %s", (rule) => {
    expect(FRUIT_VEG_RULES.doesNotCount).toContain(rule);
  });

  it("says that when in doubt, it doesn't count", () => {
    expect(FRUIT_VEG_RULES.whenInDoubt).toMatch(/doesn't count/i);
  });
});

describe("fruitVegRulesText", () => {
  it("includes every rule and the tie-break, for the parseFood prompt", () => {
    const text = fruitVegRulesText();
    for (const rule of [
      ...FRUIT_VEG_RULES.counts,
      ...FRUIT_VEG_RULES.doesNotCount,
      FRUIT_VEG_RULES.whenInDoubt,
    ]) {
      expect(text).toContain(rule);
    }
  });
});

describe("fruitVegGrams", () => {
  it("is the item's grams when it counts", () => {
    expect(fruitVegGrams(150, true)).toBe(150);
  });

  it("is 0 when it does not count", () => {
    expect(fruitVegGrams(100, false)).toBe(0);
  });
});
