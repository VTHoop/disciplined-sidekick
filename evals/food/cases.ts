import { anySplit, type EvalCase } from "./types.js";

/**
 * The golden set. The owner writes the facts (inputs, grams, accepted fdcIds,
 * label and chain numbers, estimate ranges); the structural fields follow
 * from the wording and the parseFood prompt's rules, and the owner confirms
 * them. Read README.md before adding or editing a case.
 */
export const CASES: readonly EvalCase[] = [
  {
    id: "two-eggs",
    category: "count",
    input: "2 eggs",
    expected: {
      items: [
        {
          name: "Eggs",
          canonicalName: "egg, whole, cooked",
          grams: 100.6,
          portionEstimated: false,
          countsFruitVeg: false,
          brand: null,
          path: "generic",
          source: "usda",
          // Whole egg, raw or cooked without added fat. Which entries come
          // back depends on the search words: "egg whole cooked" (the prompt's
          // example) doesn't return 748967.
          fdcIds: [748967, 2707152, 172186, 2707154, 173424],
          answerSource: "usda-entry",
        },
      ],
      // 100.6 g of the accepted entries: 144–156 kcal, 12.5–12.7 g protein.
      kcal: 150,
      protein: 12.5,
    },
  },
  {
    id: "cup-of-rice",
    category: "household-measure",
    input: "a cup of white rice",
    expected: {
      items: [
        {
          name: "White rice",
          canonicalName: "white rice, cooked",
          // USDA's 1 cup of cooked white rice.
          grams: 158,
          portionEstimated: false,
          countsFruitVeg: false,
          brand: null,
          path: "generic",
          source: "usda",
          // Cooked white rice with no added fat, any grain length (123–130
          // kcal/100 g). Not "made with oil" (151) or glutinous (96).
          fdcIds: [
            2708408, 2708403, 2710788, 168878, 169753, 168935, 169708, 169759,
          ],
          answerSource: "usda-entry",
        },
      ],
      // 158 g at 129–130 kcal and 2.5–2.9 g protein per 100 g.
      kcal: 204,
      protein: 4.2,
    },
  },
  {
    id: "chobani-plain-greek-yogurt",
    category: "branded",
    input: "Chobani plain Greek yogurt",
    expected: {
      items: [
        {
          name: "Greek yogurt",
          canonicalName: "plain greek yogurt",
          grams: 150,
          // No quantity, so the grams are a guess.
          portionEstimated: true,
          countsFruitVeg: false,
          brand: "Chobani",
          path: "branded",
          source: "branded",
          // No fat level given, so any plain Chobani Greek yogurt is a
          // reasonable pick: non-fat 2755837, 1924595 and 2652626, whole milk
          // 2757438. Low-fat 2755534 has no kcal in USDA, so picking it
          // falls back to an estimate and can't pass as branded.
          fdcIds: [2755837, 1924595, 2652626, 2757438],
          answerSource: "package-label",
        },
      ],
      // Midway between 150 g of non-fat (75–80 kcal, 13.3–15 g protein) and
      // whole milk (142 kcal, 12.5 g protein); the wider kcal tolerance
      // covers both ends.
      kcal: 108,
      protein: 13.8,
    },
    tolerances: { kcalPct: 0.32 },
  },
  {
    id: "pura-vida-provencale-vegetables",
    category: "branded",
    input: "Pura Vida provençale vegetables",
    expected: {
      items: [
        {
          name: "Provençale vegetables",
          canonicalName: "provençale vegetables",
          // One label serving: 1/2 cup.
          grams: 85,
          portionEstimated: true,
          // Tossed in olive oil: "store-bought dishes premixed with oil" don't count.
          countsFruitVeg: false,
          brand: "Pura Vida",
          // A frozen 10 oz (283 g) bag.
          path: "branded",
          // Not in USDA Branded Foods, so it's estimated.
          source: "estimated",
          // Label: 45 kcal and 1 g protein per 1/2 cup (85 g), so 53 kcal and
          // 1.2 g per 100 g. Accepts the label ±15% for kcal, and its rounding
          // for protein.
          kcalPer100g: { min: 45, max: 61 },
          proteinPer100g: { min: 0.6, max: 1.8 },
          answerSource: "package-label",
        },
      ],
      // The label's serving: 45 kcal, 1 g protein.
      kcal: 45,
      protein: 1,
    },
  },
  {
    // Named without its toppings, so any split is fine and only the totals
    // are graded. Center: chicken, white rice, black beans, fresh tomato
    // salsa and cheese (Chipotle's servings: 180 kcal / 32 g, 210 / 4,
    // 130 / 8, 25 / 0, 110 / 6). ±30% covers chicken, rice and beans alone
    // (520 kcal) up to adding sour cream and corn salsa (about 845);
    // guacamole is a different order.
    id: "chipotle-burrito-bowl",
    category: "chain-restaurant",
    input: "Chipotle chicken burrito bowl",
    expected: {
      items: anySplit({
        portionEstimated: true,
        brand: "Chipotle",
        path: "restaurant",
      }),
      kcal: 655,
      protein: 50,
    },
    tolerances: { kcalPct: 0.3 },
  },
  {
    id: "chipotle-by-component",
    category: "restaurant-by-component",
    input: "Chipotle chicken, white rice and black beans",
    expected: {
      items: [
        {
          name: "Chicken",
          canonicalName: "chicken, grilled",
          grams: 115,
          portionEstimated: true,
          countsFruitVeg: false,
          brand: "Chipotle",
          path: "restaurant",
          // Restaurant food skips USDA, so it's always estimated.
          source: "estimated",
          kcalPer100g: { min: 140, max: 170 },
          proteinPer100g: { min: 24, max: 32 },
          answerSource: "chain-nutrition",
        },
        {
          name: "White rice",
          canonicalName: "white rice, cooked",
          grams: 115,
          portionEstimated: true,
          countsFruitVeg: false,
          brand: "Chipotle",
          path: "restaurant",
          source: "estimated",
          kcalPer100g: { min: 165, max: 195 },
          proteinPer100g: { min: 1, max: 5 },
          answerSource: "chain-nutrition",
        },
        {
          name: "Black beans",
          canonicalName: "black beans, cooked",
          grams: 115,
          portionEstimated: true,
          countsFruitVeg: true,
          brand: "Chipotle",
          path: "restaurant",
          source: "estimated",
          kcalPer100g: { min: 100, max: 130 },
          proteinPer100g: { min: 3, max: 8 },
          answerSource: "chain-nutrition",
        },
      ],
      kcal: 520,
      protein: 44,
    },
  },
  {
    // Named without its contents, so any split is fine and only the totals
    // are graded, from bowls built in Mezeh's nutrition calculator: kcal
    // centered on a typical bowl, ±35%; protein runs 24–38 g from a light to
    // a heavy bowl, so it's centered at 31 g, ±23%.
    id: "mezeh-bowl",
    category: "mixed-dish",
    input: "Mezeh bowl",
    expected: {
      items: anySplit({
        portionEstimated: true,
        brand: "Mezeh",
        path: "restaurant",
      }),
      kcal: 860,
      protein: 31,
    },
    tolerances: { kcalPct: 0.35, proteinPct: 0.23 },
  },
  {
    id: "eggs-and-blueberries",
    category: "multi-food",
    input: "2 eggs and 150 g blueberries",
    expected: {
      items: [
        {
          name: "Eggs",
          // Same food as two-eggs, so the same canonical name and accepted picks.
          canonicalName: "egg, whole, cooked",
          grams: 100.6,
          portionEstimated: false,
          countsFruitVeg: false,
          brand: null,
          path: "generic",
          source: "usda",
          // Whole egg, raw or cooked without added fat. Which entries come
          // back depends on the search words: "egg whole cooked" (the prompt's
          // example) doesn't return 748967.
          fdcIds: [748967, 2707152, 172186, 2707154, 173424],
          answerSource: "usda-entry",
        },
        {
          name: "Blueberries",
          canonicalName: "blueberries, raw",
          grams: 150,
          portionEstimated: false,
          countsFruitVeg: true,
          brand: null,
          path: "generic",
          source: "usda",
          // Raw blueberries (57–64 kcal/100 g). Not wild, frozen or dried.
          fdcIds: [2346411, 2709275, 171711],
          answerSource: "usda-entry",
        },
      ],
      // The eggs as in two-eggs (150 kcal, 12.5 g), plus 150 g of raw
      // blueberries (86–96 kcal, 1.1 g).
      kcal: 241,
      protein: 13.6,
    },
  },
  {
    id: "orange-juice",
    category: "fruit-veg-edge",
    input: "a glass of orange juice",
    expected: {
      items: [
        {
          name: "Orange juice",
          canonicalName: "orange juice",
          grams: 230,
          // "A glass" isn't a set measure, so the grams are a guess.
          portionEstimated: true,
          // Juice doesn't count under the 800 g rules.
          countsFruitVeg: false,
          brand: null,
          path: "generic",
          source: "usda",
          // Ready-to-drink 100% orange juice (42–47 kcal/100 g). Searching
          // just "orange juice" returns only baby-food juices, which are wrong
          // even where the numbers are close.
          fdcIds: [2709186, 2709187, 2709188, 2709190],
          answerSource: "usda-entry",
        },
      ],
      kcal: 112,
      protein: 1.7,
    },
  },
  {
    id: "no-food",
    category: "no-food",
    input: "went for a 5k run",
    expected: { items: [], kcal: 0, protein: 0 },
  },
];
