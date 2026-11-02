import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeTargets } from "../settings/fake-targets";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import {
  figure,
  fillPercent,
  loaded,
  oneEntryDay,
  pillar,
  renderToday,
  setNow,
  stickers,
  sublabel,
  TARGETS,
} from "./test-utils";

afterEach(() => vi.useRealTimers());

const day = oneEntryDay;

describe("Today pillars", () => {
  it("shows each pillar's total against its target, summing unrounded values", async () => {
    setNow(2026, 10, 30);
    renderToday({
      entries: createFakeEntries({
        "2026-10-30": [
          sampleEntry({
            at: [2026, 10, 30, 8, 0],
            items: [
              sampleItem({ kcal: 500.4, protein: 30.04, fruitVegG: 100 }),
            ],
          }),
          sampleEntry({
            at: [2026, 10, 30, 12, 30],
            items: [
              sampleItem({ kcal: 700.4, protein: 40.04, fruitVegG: 200 }),
            ],
          }),
        ],
      }),
    });
    await loaded();
    expect(figure(pillar("calories"))).toBe("1,201");
    expect(sublabel(pillar("calories"))).toBe("limit 2,200 kcal");
    expect(figure(pillar("protein"))).toBe("70");
    expect(sublabel(pillar("protein"))).toBe("goal 140 g");
    expect(figure(pillar("fruitVeg"))).toBe("300");
    expect(sublabel(pillar("fruitVeg"))).toBe("goal 800 g");
    expect(fillPercent(pillar("calories"))).toBeCloseTo(54.58, 1);
    expect(fillPercent(pillar("protein"))).toBeCloseTo(50.06, 1);
    expect(fillPercent(pillar("fruitVeg"))).toBeCloseTo(37.5, 1);
  });

  it("draws a level line at the fill and no sticker below the line", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: day(1000, 50, 100) });
    await loaded();
    for (const kind of ["calories", "protein", "fruitVeg"] as const) {
      expect(pillar(kind).querySelector("[data-level]")).not.toBeNull();
      expect(stickers(pillar(kind))).toEqual([]);
    }
  });

  it("stops the fill at the full bar and shows the true total with a red sticker over the limit", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: day(2450) });
    await loaded();
    expect(fillPercent(pillar("calories"))).toBe(100);
    expect(figure(pillar("calories"))).toBe("2,450");
    expect(stickers(pillar("calories"))).toEqual(["250 over"]);
  });

  it("shows no sticker exactly at the limit", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: day(2200) });
    await loaded();
    expect(stickers(pillar("calories"))).toEqual([]);
  });

  it("shows no sticker when the excess rounds to 0 kcal", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: day(2200.4) });
    await loaded();
    expect(figure(pillar("calories"))).toBe("2,200");
    expect(stickers(pillar("calories"))).toEqual([]);
  });

  it("shows Reached at or above the goal for protein and fruit & veg", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: day(100, 148, 800) });
    await loaded();
    expect(stickers(pillar("protein"))).toEqual(["Reached"]);
    expect(stickers(pillar("fruitVeg"))).toEqual(["Reached"]);
    expect(fillPercent(pillar("protein"))).toBe(100);
    expect(figure(pillar("protein"))).toBe("148");
  });

  it("shows zero and no fill on an empty day", async () => {
    setNow(2026, 10, 30);
    renderToday();
    await loaded();
    expect(figure(pillar("calories"))).toBe("0");
    expect(figure(pillar("protein"))).toBe("0");
    expect(figure(pillar("fruitVeg"))).toBe("0");
    expect(fillPercent(pillar("calories"))).toBe(0);
  });

  it("shows a pillar with no target on the plain track with a Set a target link", async () => {
    setNow(2026, 10, 30);
    renderToday({
      entries: day(1000, 83.4, 100),
      targets: createFakeTargets({ ...TARGETS, protein: null }),
    });
    await loaded();
    const protein = pillar("protein");
    expect(figure(protein)).toBe("83");
    expect(protein.querySelector("[data-fill]")).toBeNull();
    expect(protein.querySelector("[data-level]")).toBeNull();
    expect(protein.querySelector("[data-sublabel]")).toBeNull();
    expect(stickers(protein)).toEqual([]);
    const link = protein.querySelector("a");
    expect(link?.textContent).toBe("Set a target");
    expect(link?.getAttribute("href")).toBe("/settings");
    expect(pillar("calories").querySelector("a")).toBeNull();
  });

  it("uses the core default for a fruit/veg target never edited", async () => {
    setNow(2026, 10, 30);
    const { targets } = renderToday({
      targets: createFakeTargets({
        calories: 2200,
        protein: 140,
        fruitVeg: null,
        fruitVegEdited: false,
      }),
    });
    await loaded();
    expect(sublabel(pillar("fruitVeg"))).toBe("goal 800 g");
    expect(targets.load).toHaveBeenCalled();
  });

  it("leaves a cleared fruit/veg target unset", async () => {
    setNow(2026, 10, 30);
    renderToday({
      targets: createFakeTargets({
        calories: 2200,
        protein: 140,
        fruitVeg: null,
        fruitVegEdited: true,
      }),
    });
    await loaded();
    expect(pillar("fruitVeg").querySelector("a")?.textContent).toBe(
      "Set a target",
    );
    expect(pillar("fruitVeg").querySelector("[data-sublabel]")).toBeNull();
  });

  it("uses a plain fill for fruit & veg: no segments and no item count", async () => {
    setNow(2026, 10, 30);
    renderToday({
      entries: createFakeEntries({
        "2026-10-30": [
          sampleEntry({
            items: [
              sampleItem({ fruitVegG: 70 }),
              sampleItem({ name: "apple", fruitVegG: 90 }),
              sampleItem({ name: "kale", fruitVegG: 40 }),
            ],
          }),
        ],
      }),
    });
    await loaded();
    const fv = pillar("fruitVeg");
    expect(fv.querySelectorAll("[data-fill]")).toHaveLength(1);
    expect(fv.querySelector("[data-segment]")).toBeNull();
    expect(fv.textContent).not.toMatch(/\bitems?\b/);
  });

  it("sets every figure in tabular numerals", async () => {
    setNow(2026, 10, 30);
    renderToday();
    await loaded();
    for (const kind of ["calories", "protein", "fruitVeg"] as const) {
      expect(
        pillar(kind).querySelector("[data-figure]")?.classList.contains("num"),
      ).toBe(true);
    }
  });
});
