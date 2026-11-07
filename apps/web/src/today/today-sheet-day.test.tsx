import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeFood } from "../food/fake-food";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import {
  figure,
  headingText,
  loaded,
  pillar,
  prevDay,
  renderToday,
  setNow,
  setVisibility,
} from "./test-utils";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const entries = () =>
  createFakeEntries({
    "2026-10-29": [
      sampleEntry({ text: "last night", items: [sampleItem({ kcal: 900 })] }),
    ],
    "2026-10-30": [
      sampleEntry({ text: "lunch", items: [sampleItem({ kcal: 600 })] }),
    ],
  });

/** Opens a sheet on Thu Oct 29, then returns after 5 minutes away, which snaps the view to Fri Oct 30. */
async function sheetThenResume(food = createFakeFood()) {
  setNow(2026, 10, 30, 12, 0);
  renderToday({ entries: entries(), food });
  await loaded();
  const user = userEvent.setup();
  await user.click(prevDay());
  await screen.findByText("last night");
  await user.type(
    screen.getByRole("textbox", { name: "What did you eat?" }),
    "snack{Enter}",
  );
  const dialog = await screen.findByRole("dialog");
  setVisibility("hidden");
  vi.setSystemTime(new Date(2026, 9, 30, 12, 5));
  setVisibility("visible");
  await waitFor(() => expect(headingText()).toBe("Fri, Oct 30"));
  return { user, dialog, food };
}

describe("a sheet whose day is no longer the viewed day", () => {
  it("shows the sheet's own day's totals, not a Loading… that never ends", async () => {
    const { dialog } = await sheetThenResume();
    await waitFor(() =>
      // That day's 900 kcal plus the entry's 228.5.
      expect(figure(pillar("calories", dialog))).toBe("1,129"),
    );
    expect(within(dialog).queryByText("Loading…")).toBeNull();
    expect(within(dialog).getByText("For Thu, Oct 29")).toBeTruthy();
  });

  it("saves to the sheet's day, not the day the view snapped to", async () => {
    const { user, dialog, food } = await sheetThenResume();
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(food.save).toHaveBeenCalledWith(expect.anything(), "2026-10-29");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(headingText()).toBe("Fri, Oct 30");
    expect(screen.queryByText("snack")).toBeNull();
  });

  it("lists an entry saved to another day once, when that day is viewed again", async () => {
    const { user, dialog } = await sheetThenResume();
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(prevDay());
    await screen.findByText("last night");
    expect(screen.getAllByText("snack")).toHaveLength(1);
  });
});

describe("a past day and the device clock", () => {
  it("shows the current day when the clock is set back behind the picked day", async () => {
    setNow(2026, 10, 30, 12, 0);
    renderToday({ entries: entries() });
    await loaded();
    await userEvent.click(prevDay());
    expect(headingText()).toBe("Thu, Oct 29");
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0));
    await act(async () => setVisibility("visible"));
    expect(headingText()).toBe("Wed, Oct 28");
  });
});

describe("Back to today", () => {
  it("moves focus to the date heading without also announcing the date", async () => {
    setNow(2026, 10, 30, 12, 0);
    renderToday({ entries: entries() });
    await loaded();
    const user = userEvent.setup();
    await user.click(prevDay());
    await user.click(screen.getByText("Back to today"));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1 }),
    );
    // Still the earlier "Thursday, October 29" from Previous day, never the date the heading reads.
    expect(
      document.querySelector("[data-day-announcer]")?.textContent,
    ).not.toBe("Friday, October 30");
  });
});
