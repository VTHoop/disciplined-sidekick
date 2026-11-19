import { describe, expect, it } from "vitest";
import { CASES } from "./cases";
import { isConfirmed } from "./grade";
import { CATEGORIES, isAnySplit, UNCONFIRMED } from "./types";

describe("golden set", () => {
  it("ids are unique and slug-shaped", () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("categories are from the CATEGORIES list", () => {
    for (const c of CASES) expect(CATEGORIES).toContain(c.category);
  });

  it("covers every decision-record category", () => {
    const covered = new Set(CASES.map((c) => c.category));
    for (const category of CATEGORIES) expect(covered).toContain(category);
  });

  it("includes the named starting cases", () => {
    const byId = new Map(CASES.map((c) => [c.id, c]));
    for (const id of [
      "pura-vida-provencale-vegetables",
      "chipotle-by-component",
      "chobani-plain-greek-yogurt",
      "eggs-and-blueberries",
      "mezeh-bowl",
      "no-food",
    ]) {
      expect(byId.has(id), id).toBe(true);
    }
    expect(byId.get("eggs-and-blueberries")?.input).toBe(
      "2 eggs and 150 g blueberries",
    );
    expect(byId.get("chipotle-by-component")?.category).toBe(
      "restaurant-by-component",
    );
    expect(byId.get("mezeh-bowl")?.category).toBe("mixed-dish");
    // Named without its contents, so any split is fine; only the totals count.
    expect(isAnySplit(byId.get("mezeh-bowl")?.expected.items)).toBe(true);
  });

  it("the no-food case expects no items", () => {
    for (const c of CASES.filter((c) => c.category === "no-food")) {
      expect(c.expected.items).toEqual([]);
    }
  });

  it("a case with any unconfirmed value is unconfirmed", () => {
    const [first] = CASES;
    if (!first) throw new Error("no cases");
    expect(
      isConfirmed({
        ...first,
        expected: { ...first.expected, protein: UNCONFIRMED },
      }),
    ).toBe(false);
  });
});
