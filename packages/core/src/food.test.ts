import { describe, expect, it } from "vitest";
import { foodLabel } from "./food";

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
