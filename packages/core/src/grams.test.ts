import { describe, expect, it } from "vitest";
import type { FoodPreview, PreviewItem } from "./food.js";
import { applyGramEdits, MAX_GRAMS, parseGrams } from "./grams.js";
import { entryTotals } from "./nutrition.js";

const item = (over: Partial<PreviewItem> = {}): PreviewItem => ({
  name: "banana",
  canonicalName: "banana, raw",
  grams: 113.4,
  kcal: 100.926,
  protein: 1.2342,
  fruitVegG: 113.4,
  kcalPer100g: 89,
  proteinPer100g: 1.09,
  estimated: false,
  portionEstimated: true,
  fdcId: 1,
  brand: null,
  path: "generic",
  source: "usda",
  ...over,
});

const rice = item({
  name: "rice",
  canonicalName: "rice, white",
  grams: 200,
  kcal: 260,
  protein: 5.4,
  fruitVegG: 0,
  kcalPer100g: 130,
  proteinPer100g: 2.7,
  portionEstimated: false,
});

const previewOf = (...items: PreviewItem[]): FoodPreview => ({
  entryId: "e1",
  text: "banana and rice",
  items,
  totals: entryTotals(items),
});

describe("parseGrams", () => {
  it.each([
    ["1", 1],
    ["113", 113],
    [" 250 ", 250],
    ["3000", 3000],
  ])("accepts %j", (raw, value) => {
    expect(parseGrams(raw)).toEqual({ ok: true, value });
  });

  it.each([
    "",
    "   ",
    "0",
    "00",
    "abc",
    "12.5",
    "-5",
    "1e3",
    "3001",
    "99999999999999999999",
  ])("rejects %j with a message", (raw) => {
    const r = parseGrams(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBeTruthy();
  });

  it("caps grams at 3,000 and says so", () => {
    expect(MAX_GRAMS).toBe(3000);
    const r = parseGrams("3001");
    expect(r.ok ? "" : r.message).toMatch(/3,000/);
  });
});

describe("applyGramEdits", () => {
  const base = previewOf(item(), rice);
  const untouched = ["113", "200"];

  it("leaves an unedited preview exactly as parsed, decimals included", () => {
    const { preview, errors } = applyGramEdits(base, untouched);
    expect(preview).toEqual(base);
    expect(preview.items[0]?.grams).toBe(113.4);
    expect(preview.items[0]?.parsedGrams ?? null).toBeNull();
    expect(preview.items[0]?.portionEstimated).toBe(true);
    expect(errors).toEqual([null, null]);
  });

  it("recomputes kcal and protein from the per-100 g values", () => {
    const { preview } = applyGramEdits(base, ["200", "200"]);
    const banana = preview.items[0];
    expect(banana?.grams).toBe(200);
    expect(banana?.kcal).toBeCloseTo(178);
    expect(banana?.protein).toBeCloseTo(2.18);
  });

  it("gives all grams to fruit/veg for an item that counts, none for one that does not", () => {
    const { preview } = applyGramEdits(base, ["200", "50"]);
    expect(preview.items[0]?.fruitVegG).toBe(200);
    expect(preview.items[1]?.fruitVegG).toBe(0);
  });

  it("recomputes the entry totals from the edited items", () => {
    const { preview } = applyGramEdits(base, ["200", "100"]);
    expect(preview.totals.kcal).toBeCloseTo(178 + 130);
    expect(preview.totals.protein).toBeCloseTo(2.18 + 2.7);
    expect(preview.totals.fruitVegG).toBe(200);
  });

  it("marks an edited item with the parse's grams and clears its est. portion", () => {
    const { preview } = applyGramEdits(base, ["150", "200"]);
    expect(preview.items[0]).toMatchObject({
      grams: 150,
      parsedGrams: 113.4,
      portionEstimated: false,
    });
    expect(preview.items[1]).toEqual(rice);
  });

  it("treats typing the rounded original back as unedited, so the mark returns", () => {
    const { preview } = applyGramEdits(base, ["113", "200"]);
    expect(preview.items[0]).toEqual(item());
  });

  it("treats the same food twice as two items", () => {
    const twice = previewOf(rice, rice);
    const { preview } = applyGramEdits(twice, ["100", "200"]);
    expect(preview.items.map((i) => i.grams)).toEqual([100, 200]);
    expect(preview.items.map((i) => i.parsedGrams ?? null)).toEqual([
      200,
      null,
    ]);
  });

  it("reports an invalid draft per item and keeps that item as parsed", () => {
    const { preview, errors } = applyGramEdits(base, ["", "5000"]);
    expect(errors[0]).toBeTruthy();
    expect(errors[1]).toMatch(/3,000/);
    expect(preview.items[0]).toEqual(item());
    expect(preview.items[1]).toEqual(rice);
  });

  it("does not change its input", () => {
    const copy = structuredClone(base);
    applyGramEdits(base, ["10", "10"]);
    expect(base).toEqual(copy);
  });
});
