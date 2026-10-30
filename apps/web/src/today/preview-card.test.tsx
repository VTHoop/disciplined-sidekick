import type { FoodPreview } from "@disciplined-sidekick/core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeFood, samplePreview } from "../food/fake-food";
import { createFakeTargets } from "../settings/fake-targets";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import {
  figure,
  LOAD_FAILED,
  loaded,
  pillar,
  renderToday,
  setNow,
  stickers,
  TARGETS,
} from "./test-utils";

afterEach(() => vi.useRealTimers());

const preview = (totals: Partial<FoodPreview["totals"]>): FoodPreview =>
  samplePreview({
    totals: { kcal: 677, protein: 31, fruitVegG: 150, ...totals },
  });

const dayWith = (kcal: number, protein = 52.4, fruitVegG = 0) =>
  createFakeEntries({
    "2026-10-30": [
      sampleEntry({ items: [sampleItem({ kcal, protein, fruitVegG })] }),
    ],
  });

async function openPreview(opts: Parameters<typeof renderToday>[0] = {}) {
  setNow(2026, 10, 30);
  const view = renderToday(opts);
  const user = userEvent.setup();
  await screen.findByRole("textbox", { name: "What did you eat?" });
  await user.type(
    screen.getByRole("textbox", { name: "What did you eat?" }),
    "lunch{Enter}",
  );
  const dialog = await screen.findByRole("dialog");
  return { ...view, user, dialog };
}

const share = (el: HTMLElement) =>
  el.querySelector("[data-share]")?.textContent ?? null;

describe("Preview price card", () => {
  it("shows the day's total plus the unsaved entry, with the entry's share hatched and spelled out", async () => {
    const { dialog } = await openPreview({
      entries: dayWith(1000),
      food: createFakeFood(preview({})),
    });
    const calories = pillar("calories", dialog);
    expect(figure(calories)).toBe("1,677");
    expect(calories.querySelector("[data-hatch]")).not.toBeNull();
    expect(share(calories)).toBe("+677, limit 2,200 kcal");
    expect(figure(pillar("protein", dialog))).toBe("83.4");
    expect(share(pillar("protein", dialog))).toBe("+31.0, goal 140 g");
    expect(figure(pillar("fruitVeg", dialog))).toBe("150");
  });

  it("hides the share text from assistive tech, since the sentence already says it", async () => {
    const { dialog } = await openPreview({
      entries: dayWith(1000),
      food: createFakeFood(preview({})),
    });
    const el = dialog.querySelector("[data-share]");
    expect(el?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("uses the same sticker rules on the total with the entry", async () => {
    const { dialog } = await openPreview({
      entries: dayWith(2000, 120, 700),
      food: createFakeFood(preview({ protein: 25, fruitVegG: 150 })),
    });
    expect(stickers(pillar("calories", dialog))).toEqual(["477 over"]);
    expect(stickers(pillar("protein", dialog))).toEqual(["Reached"]);
    expect(stickers(pillar("fruitVeg", dialog))).toEqual(["Reached"]);
  });

  it("gets no hatch and no +0 for an amount that rounds to 0", async () => {
    const { dialog } = await openPreview({
      entries: dayWith(1000),
      food: createFakeFood(preview({ kcal: 0.4 })),
    });
    const calories = pillar("calories", dialog);
    expect(calories.querySelector("[data-hatch]")).toBeNull();
    expect(share(calories)).toBeNull();
    expect(calories.textContent).not.toContain("+0");
  });

  it("shows the total and the share for a pillar with no target, with no fill, hatch or link", async () => {
    const { dialog } = await openPreview({
      entries: dayWith(1000, 52.4, 0),
      targets: createFakeTargets({
        ...TARGETS,
        protein: null,
        fruitVeg: null,
        fruitVegEdited: true,
      }),
      food: createFakeFood(preview({ fruitVegG: 31 })),
    });
    const protein = pillar("protein", dialog);
    expect(figure(protein)).toBe("83.4");
    expect(share(protein)).toBe("+31.0 g from this entry");
    expect(share(pillar("fruitVeg", dialog))).toBe("+31 g from this entry");
    for (const p of [protein, pillar("fruitVeg", dialog)]) {
      expect(p.querySelector("[data-fill]")).toBeNull();
      expect(p.querySelector("[data-hatch]")).toBeNull();
      expect(p.querySelector("a")).toBeNull();
    }
  });

  it("gets no hatch when the day was already at or past the line, but the share, total and sticker update", async () => {
    const { dialog } = await openPreview({
      entries: dayWith(2300),
      food: createFakeFood(preview({})),
    });
    const calories = pillar("calories", dialog);
    expect(calories.querySelector("[data-hatch]")).toBeNull();
    expect(share(calories)).toBe("+677 kcal from this entry");
    expect(figure(calories)).toBe("2,977");
    expect(stickers(calories)).toEqual(["777 over"]);
  });

  it("says what the entry adds in the pillar's sentence, unless it adds nothing", async () => {
    const { dialog } = await openPreview({
      entries: dayWith(1000),
      food: createFakeFood(preview({ kcal: 0.4 })),
    });
    expect(
      within(dialog).getByText(
        "Protein: 83.4 g, goal 140 g, this entry adds 31.0 g.",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("Calories: 1,000 kcal, limit 2,200 kcal."),
    ).toBeTruthy();
  });

  it("replaces the card with an error when the day's totals can't load, keeping the items and Done", async () => {
    const entries = dayWith(1000);
    entries.failNextLoad();
    const food = createFakeFood(preview({}));
    const { dialog, user } = await openPreview({ entries, food });
    expect(within(dialog).getByText(LOAD_FAILED)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(dialog.querySelector("[data-pillar]")).toBeNull();
    expect(within(dialog).getByText("2 eggs")).toBeTruthy();
    expect(within(dialog).getByText(/677 kcal/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(food.save).toHaveBeenCalledTimes(1);
  });

  it("leaves Today's totals unchanged on Undo and on Escape", async () => {
    const { dialog, user } = await openPreview({
      entries: dayWith(1000),
      food: createFakeFood(preview({})),
    });
    expect(figure(pillar("calories"))).toBe("1,000");
    await user.click(within(dialog).getByRole("button", { name: "Undo" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(figure(pillar("calories"))).toBe("1,000");
    expect(figure(pillar("protein"))).toBe("52.4");

    await user.type(
      screen.getByRole("textbox", { name: "What did you eat?" }),
      "lunch{Enter}",
    );
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(figure(pillar("calories"))).toBe("1,000");
  });

  it("keeps Today's totals in the card out of the page while previewing", async () => {
    await openPreview({
      entries: dayWith(1000),
      food: createFakeFood(preview({})),
    });
    await loaded();
    expect(figure(pillar("calories"))).toBe("1,000");
  });
});
