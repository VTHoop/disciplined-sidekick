import { describe, expect, it } from "vitest";
import { foodLabel, previewFromSavedItem } from "./food";

const saved = {
  name: "Chobani plain greek yogurt",
  canonicalName: "plain greek yogurt",
  grams: 170,
  kcal: 100.3,
  protein: 17.1,
  fruitVegG: 0,
  kcalPer100g: 59,
  proteinPer100g: 10.1,
  estimated: true,
  portionEstimated: true,
  fdcId: null,
  brand: "Chobani",
  source: "estimated" as const,
};

describe("previewFromSavedItem", () => {
  it("makes a one-item preview that carries the saved values, with the label as its text", () => {
    const preview = previewFromSavedItem(saved, "new-id");
    expect(preview.entryId).toBe("new-id");
    expect(preview.text).toBe("Chobani Plain greek yogurt");
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]).toMatchObject({ ...saved });
    expect(preview.items[0]).not.toHaveProperty("parsedGrams");
    expect(preview.totals).toEqual({
      kcal: 100.3,
      protein: 17.1,
      fruitVegG: 0,
    });
  });

  it("steers the wording by the brand and source", () => {
    expect(previewFromSavedItem(saved, "x").items[0]?.path).toBe("branded");
    expect(
      previewFromSavedItem({ ...saved, brand: null }, "x").items[0]?.path,
    ).toBe("generic");
  });
});

describe("foodLabel", () => {
  it("shows a branded item as its brand and its capitalised canonical name", () => {
    expect(
      foodLabel({
        name: "Chobani plain greek yogurt",
        canonicalName: "plain greek yogurt",
        brand: "Chobani",
      }),
    ).toBe("Chobani Plain greek yogurt");
  });

  it("shows a restaurant item the same way", () => {
    expect(
      foodLabel({
        name: "Chipotle white rice",
        canonicalName: "white rice",
        brand: "Chipotle",
      }),
    ).toBe("Chipotle White rice");
  });

  it("shows a generic item by its display name, as today", () => {
    expect(
      foodLabel({
        name: "2 eggs",
        canonicalName: "egg, whole, raw",
        brand: null,
      }),
    ).toBe("2 eggs");
  });
});
