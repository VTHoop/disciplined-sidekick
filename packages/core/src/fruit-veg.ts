/**
 * The OptimizeMe 800g rules for what counts toward fruit/veg grams.
 * Source: https://optimizemenutrition.com/800g-challenge/
 * parseFood gives these to the model, which marks each item.
 */
export const FRUIT_VEG_RULES = {
  counts: [
    "fresh, frozen or cooked fruit and veg",
    "canned packed in water or spices (weighed drained)",
    "potatoes unless commercially fried",
    "beans, lentils, peas, corn, edamame",
    "avocado, olives, fresh coconut",
    "unsweetened applesauce",
    "ferments and pickles with no sugar in the brine",
    "salsa, tomato sauce and guacamole with no added water, oil or sugar",
  ],
  doesNotCount: [
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
  ],
  whenInDoubt: "When in doubt, it doesn't count.",
} as const;

/** The rules as prompt text. */
export function fruitVegRulesText(): string {
  const list = (rules: readonly string[]) =>
    rules.map((r) => `- ${r}`).join("\n");
  return [
    "Counts toward fruit/veg:",
    list(FRUIT_VEG_RULES.counts),
    "Does not count:",
    list(FRUIT_VEG_RULES.doesNotCount),
    FRUIT_VEG_RULES.whenInDoubt,
  ].join("\n");
}

/** An item's fruit/veg grams: all of it if it counts, none if not. */
export const fruitVegGrams = (grams: number, counts: boolean) =>
  counts ? grams : 0;
