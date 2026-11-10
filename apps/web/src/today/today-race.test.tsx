import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeFood, deferred, samplePreview } from "../food/fake-food";
import type { DayEntriesStore } from "./entries-store";
import { createFakeEntries, sampleEntry } from "./fake-entries";
import {
  figure,
  headingText,
  loaded,
  pillar,
  prevDay,
  renderToday,
  setNow,
} from "./test-utils";

afterEach(() => vi.useRealTimers());

const TEXT = "2 eggs and 150 g blueberries";

async function logAndPressDone(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    await screen.findByRole("textbox", { name: "What did you eat?" }),
    `${TEXT}{Control>}{Enter}{/Control}`,
  );
  await user.click(await screen.findByRole("button", { name: "Done" }));
}

describe("Done while the day is still loading", () => {
  it("keeps the saved entry once the load answers without it", async () => {
    setNow(2026, 10, 30, 13, 0);
    const entries = createFakeEntries();
    const release = entries.holdLoad();
    const food = createFakeFood();
    renderToday({ entries, food });
    await logAndPressDone(userEvent.setup());
    await waitFor(() => expect(food.save).toHaveBeenCalledTimes(1));

    release();
    await loaded();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(figure(pillar("calories"))).toBe("229");
    expect(figure(pillar("fruitVeg"))).toBe("150");
  });

  it("lists the entry once when the load already includes it", async () => {
    setNow(2026, 10, 30, 13, 0);
    const saved = sampleEntry({
      id: samplePreview().entryId,
      text: TEXT,
      at: [2026, 10, 30, 13, 0],
    });
    const entries = createFakeEntries({ "2026-10-30": [saved] });
    const release = entries.holdLoad();
    renderToday({ entries });
    await logAndPressDone(userEvent.setup());

    release();
    await loaded();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
  });
});

describe("Done across midnight", () => {
  it("does not put yesterday's entry on the new day", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout"],
      shouldAdvanceTime: true,
    });
    vi.setSystemTime(new Date(2026, 9, 30, 23, 59, 50));
    const entries = createFakeEntries({
      "2026-10-31": [
        sampleEntry({ text: "new day", at: [2026, 10, 31, 0, 5] }),
      ],
    });
    const food = createFakeFood();
    const releaseSave = food.holdSave();
    renderToday({ entries, food });
    const user = userEvent.setup({ delay: null });
    await logAndPressDone(user);
    await waitFor(() => expect(food.save).toHaveBeenCalledTimes(1));
    expect(food.save).toHaveBeenCalledWith(expect.anything(), "2026-10-30");

    await vi.advanceTimersByTimeAsync(11_000);
    expect(await screen.findByText("new day")).toBeTruthy();
    releaseSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText(TEXT)).toBeNull();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
  });
});

describe("a day that is no longer in the heading", () => {
  it("never shows its data, even when its load answers last", async () => {
    setNow(2026, 10, 30);
    const pending = new Map<string, ReturnType<typeof deferred<never[]>>>();
    const base = createFakeEntries();
    const store = {
      ...base,
      load: vi.fn<DayEntriesStore["load"]>((date) => {
        const d = deferred<never[]>();
        pending.set(date, d);
        return d.promise as ReturnType<DayEntriesStore["load"]>;
      }),
    };
    renderToday({ entries: store as never });
    await waitFor(() => expect(pending.has("2026-10-30")).toBe(true));
    const user = userEvent.setup();
    await user.click(prevDay());
    expect(headingText()).toBe("Thu, Oct 29");
    await waitFor(() => expect(pending.has("2026-10-29")).toBe(true));

    // The current day answers after the heading moved on.
    pending.get("2026-10-30")?.resolve([]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(document.querySelector("[data-pillar]")).toBeNull();

    pending.get("2026-10-29")?.resolve([]);
    await loaded();
    expect(headingText()).toBe("Thu, Oct 29");
  });
});

describe("Done on a past day across midnight", () => {
  it("saves to the day on the sheet and not onto the new current day", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout"],
      shouldAdvanceTime: true,
    });
    vi.setSystemTime(new Date(2026, 9, 30, 23, 59, 50));
    const food = createFakeFood();
    const releaseSave = food.holdSave();
    renderToday({ food });
    const user = userEvent.setup({ delay: null });
    await user.click(
      await screen.findByRole("button", { name: "Previous day" }),
    );
    await logAndPressDone(user);
    await waitFor(() => expect(food.save).toHaveBeenCalledTimes(1));
    expect(food.save).toHaveBeenCalledWith(expect.anything(), "2026-10-29");

    await vi.advanceTimersByTimeAsync(11_000);
    releaseSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(headingText()).toBe("Thu, Oct 29");
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
  });
});
