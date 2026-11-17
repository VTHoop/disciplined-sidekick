import { type EvalCase, type ExpectedItem, UNCONFIRMED } from "./types.js";

/**
 * A drafted item for the owner to fill in: one per food the input names,
 * with every expected value still unconfirmed.
 */
const draftItem = (): ExpectedItem => ({
  name: UNCONFIRMED,
  canonicalName: UNCONFIRMED,
  grams: UNCONFIRMED,
  portionEstimated: UNCONFIRMED,
  countsFruitVeg: UNCONFIRMED,
  brand: UNCONFIRMED,
  path: UNCONFIRMED,
  source: UNCONFIRMED,
  answerSource: UNCONFIRMED,
});

const unconfirmedTotals = { kcal: UNCONFIRMED, protein: UNCONFIRMED } as const;

/**
 * The golden set. Inputs are drafts until the owner confirms them against
 * real entries; read README.md before adding or editing a case.
 */
export const CASES: readonly EvalCase[] = [
  {
    id: "two-eggs",
    category: "count",
    input: "2 eggs",
    expected: { items: [draftItem()], ...unconfirmedTotals },
  },
  {
    id: "cup-of-rice",
    category: "household-measure",
    input: "a cup of white rice",
    expected: { items: [draftItem()], ...unconfirmedTotals },
  },
  {
    id: "chobani-plain-greek-yogurt",
    category: "branded",
    input: "Chobani plain Greek yogurt",
    expected: { items: [draftItem()], ...unconfirmedTotals },
  },
  {
    id: "pura-vida-provencale-vegetables",
    category: "branded",
    input: "Pura Vida provençale vegetables",
    expected: { items: [draftItem()], ...unconfirmedTotals },
  },
  {
    id: "chipotle-burrito-bowl",
    category: "chain-restaurant",
    input: "Chipotle chicken burrito bowl",
    expected: { items: UNCONFIRMED, ...unconfirmedTotals },
  },
  {
    id: "chipotle-by-component",
    category: "restaurant-by-component",
    input: "Chipotle chicken, white rice and black beans",
    expected: {
      items: [draftItem(), draftItem(), draftItem()],
      ...unconfirmedTotals,
    },
  },
  {
    id: "mezeh-bowl",
    category: "mixed-dish",
    input: "Mezeh bowl",
    expected: { items: UNCONFIRMED, ...unconfirmedTotals },
  },
  {
    id: "eggs-and-blueberries",
    category: "multi-food",
    input: "2 eggs and 150 g blueberries",
    expected: { items: [draftItem(), draftItem()], ...unconfirmedTotals },
  },
  {
    id: "orange-juice",
    category: "fruit-veg-edge",
    input: "a glass of orange juice",
    expected: { items: [draftItem()], ...unconfirmedTotals },
  },
  {
    id: "no-food",
    category: "no-food",
    input: "went for a 5k run",
    expected: { items: [], ...unconfirmedTotals },
  },
];
