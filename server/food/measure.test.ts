import { describe, expect, it } from "vitest";
import { normalizeUnit, parseHousehold } from "./measure";

describe("normalizeUnit", () => {
  it.each([
    ["cup", "cup"],
    ["Cups", "cup"],
    ["CUP", "cup"],
    ["tablespoon", "tbsp"],
    ["Tablespoons", "tbsp"],
    ["Tbsp", "tbsp"],
    ["tbs", "tbsp"],
    ["teaspoon", "tsp"],
    ["tsp", "tsp"],
    ["PIECES", "piece"],
    ["pcs", "piece"],
    ["piece", "piece"],
    ["CONTAINER", "container"],
    ["Bars", "bar"],
    ["ravioli", "ravioli"],
  ])("reads %s as %s", (raw, unit) => {
    expect(normalizeUnit(raw)).toBe(unit);
  });
});

describe("parseHousehold", () => {
  it.each([
    ["1 Cup (103g) Per serving", { amount: 1, unit: "cup" }],
    ["1/2 cup", { amount: 0.5, unit: "cup" }],
    ["0.5 package", { amount: 0.5, unit: "package" }],
    ["1 1/3 cups (60g)", { amount: 1 + 1 / 3, unit: "cup" }],
    ["3 Tbsp", { amount: 3, unit: "tbsp" }],
    ["1 CONTAINER", { amount: 1, unit: "container" }],
    ["9 PIECES", { amount: 9, unit: "piece" }],
    ["1 BAR", { amount: 1, unit: "bar" }],
    ["4 ravioli (142g/5.1oz)", { amount: 4, unit: "ravioli" }],
    ["about 2 cups", { amount: 2, unit: "cup" }],
  ])("reads %s", (text, measure) => {
    expect(parseHousehold(text)).toEqual(measure);
  });

  it.each([
    "5 ONZ",
    "134 g",
    "147 GRM",
    "4.36OZ",
    "6 oz / 170 g",
    "240 ml",
    "1/14 cup with 1/2 cup skim milk",
    "13 PIECES) | (ABOUT",
    "3 PIECES PLUS 2 TBSP SAUCE",
    "0 cup",
    "cup",
    "",
  ])(
    "returns null for %j, which is a weight or is not a plain measure",
    (text) => {
      expect(parseHousehold(text)).toBeNull();
    },
  );

  it("returns null when there is no text", () => {
    expect(parseHousehold(undefined)).toBeNull();
    expect(parseHousehold(null)).toBeNull();
  });
});
