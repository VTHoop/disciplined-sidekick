import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeTargets } from "../settings/fake-targets";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import { loaded, pillar, renderToday, setNow, TARGETS } from "./test-utils";

afterEach(() => vi.useRealTimers());

const day = (kcal: number, protein: number, fruitVegG = 0) =>
  createFakeEntries({
    "2026-10-30": [
      sampleEntry({ items: [sampleItem({ kcal, protein, fruitVegG })] }),
    ],
  });

describe("Today accessibility", () => {
  it("reads each pillar as one sentence", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: day(2450, 148, 640) });
    await loaded();
    expect(
      screen.getByText("Calories: 2,450 kcal, limit 2,200 kcal, 250 over."),
    ).toBeTruthy();
    expect(
      screen.getByText("Protein: 148.0 g, goal 140 g, reached."),
    ).toBeTruthy();
    expect(screen.getByText("Fruit & veg: 640 g, goal 800 g.")).toBeTruthy();
  });

  it("says no target set for a pillar without one", async () => {
    setNow(2026, 10, 30);
    renderToday({
      entries: day(1000, 83.4),
      targets: createFakeTargets({ ...TARGETS, protein: null }),
    });
    await loaded();
    expect(screen.getByText("Protein: 83.4 g, no target set.")).toBeTruthy();
  });

  it("hides the bar, the visible figures and the stickers from assistive tech so nothing is announced twice", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: day(2450, 148) });
    await loaded();
    for (const kind of ["calories", "protein", "fruitVeg"] as const) {
      const row = pillar(kind);
      expect(
        row.querySelector("[data-bar]")?.closest('[aria-hidden="true"]'),
      ).not.toBeNull();
      expect(
        row.querySelector("[data-figure]")?.closest('[aria-hidden="true"]'),
      ).not.toBeNull();
    }
    for (const part of [".pillar-name", "[data-sublabel]"]) {
      expect(
        pillar("protein").querySelector(part)?.closest('[aria-hidden="true"]'),
      ).not.toBeNull();
    }
    for (const sticker of pillar("protein").querySelectorAll(".sticker")) {
      expect(sticker.textContent).toBe("Reached");
      expect(sticker.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    for (const sticker of pillar("calories").querySelectorAll(".sticker")) {
      expect(sticker.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    const sentence = screen.getByText(
      "Calories: 2,450 kcal, limit 2,200 kcal, 250 over.",
    );
    expect(sentence.closest('[aria-hidden="true"]')).toBeNull();
  });

  it("keeps the over amount and the reached state in text", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: day(2450, 148) });
    await loaded();
    expect(pillar("calories").textContent).toContain("250 over");
    expect(pillar("protein").textContent).toContain("Reached");
  });

  it("keeps Set a target reachable by assistive tech", async () => {
    setNow(2026, 10, 30);
    renderToday({ targets: createFakeTargets({ ...TARGETS, protein: null }) });
    await loaded();
    expect(screen.getByRole("link", { name: "Set a target" })).toBeTruthy();
  });

  it("does not announce stickers twice on entry items either", async () => {
    setNow(2026, 10, 30);
    renderToday({
      entries: createFakeEntries({
        "2026-10-30": [
          sampleEntry({
            items: [sampleItem({ estimated: true, fruitVegG: 70 })],
          }),
        ],
      }),
    });
    await loaded();
    // One Estimated sticker, once, in the item's own text.
    expect(screen.getAllByText("Estimated")).toHaveLength(1);
  });
});
