import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import {
  figure,
  headingText,
  loaded,
  nextDay,
  pillar,
  prevDay,
  renderToday,
  setNow,
  setVisibility,
  todayHeading,
} from "./test-utils";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const entries = () =>
  createFakeEntries({
    "2026-10-30": [
      sampleEntry({
        text: "today's lunch",
        items: [sampleItem({ kcal: 600 })],
      }),
    ],
    "2026-10-29": [
      sampleEntry({ text: "two days ago", items: [sampleItem({ kcal: 999 })] }),
    ],
    "2026-10-31": [
      sampleEntry({
        text: "new day",
        at: [2026, 10, 31, 0, 5],
        items: [sampleItem({ kcal: 100 })],
      }),
    ],
  });

describe("Today's day", () => {
  it("shows the date as the heading and loads the device's current local day", async () => {
    setNow(2026, 10, 30, 9, 0);
    const fake = entries();
    renderToday({ entries: fake });
    await loaded();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: todayHeading("2026-10-30"),
      }),
    ).toBeTruthy();
    expect(fake.load).toHaveBeenCalledWith("2026-10-30");
    expect(screen.getByText("today's lunch")).toBeTruthy();
    expect(screen.queryByText("two days ago")).toBeNull();
    expect(figure(pillar("calories"))).toBe("600");
  });

  it("switches to the new day at local midnight while open", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout"],
      shouldAdvanceTime: true,
    });
    vi.setSystemTime(new Date(2026, 9, 30, 23, 59, 30));
    const fake = entries();
    renderToday({ entries: fake });
    await loaded();
    expect(fake.load).toHaveBeenLastCalledWith("2026-10-30");

    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: todayHeading("2026-10-31"),
      }),
    ).toBeTruthy();
    expect(fake.load).toHaveBeenLastCalledWith("2026-10-31");
    expect(await screen.findByText("new day")).toBeTruthy();
    expect(screen.queryByText("today's lunch")).toBeNull();
  });

  it("schedules the next midnight check when a timer fires before the date changes", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout"],
      shouldAdvanceTime: true,
    });
    vi.setSystemTime(new Date(2026, 9, 30, 23, 59, 30));
    const fake = entries();
    renderToday({ entries: fake });
    await loaded();

    // The clock is set back, so the first timer fires with the date unchanged.
    vi.setSystemTime(new Date(2026, 9, 30, 23, 59, 0));
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    expect(fake.load).toHaveBeenLastCalledWith("2026-10-30");

    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: todayHeading("2026-10-31"),
      }),
    ).toBeTruthy();
  });

  it("checks the date when the app returns to the foreground", async () => {
    setNow(2026, 10, 30, 22, 0);
    const fake = entries();
    renderToday({ entries: fake });
    await loaded();

    vi.setSystemTime(new Date(2026, 9, 31, 8, 0));
    setVisibility("visible");
    await waitFor(() =>
      expect(fake.load).toHaveBeenLastCalledWith("2026-10-31"),
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: todayHeading("2026-10-31"),
      }),
    ).toBeTruthy();
  });

  it("does not reload when it returns to the foreground on the same day", async () => {
    setNow(2026, 10, 30, 22, 0);
    const fake = entries();
    renderToday({ entries: fake });
    await loaded();
    setVisibility("visible");
    expect(fake.load).toHaveBeenCalledTimes(1);
  });
});

const minutes = (n: number) => n * 60_000;

describe("a past day under the midnight and resume rules", () => {
  it("is not moved by midnight, and Next day then reaches the day that is now past", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout"],
      shouldAdvanceTime: true,
    });
    vi.setSystemTime(new Date(2026, 9, 30, 23, 59, 30));
    const fake = entries();
    renderToday({ entries: fake });
    await loaded();
    const user = userEvent.setup({ delay: null });
    await user.click(prevDay());
    expect(headingText()).toBe("Thu, Oct 29");

    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    expect(headingText()).toBe("Thu, Oct 29");
    expect(fake.load).toHaveBeenLastCalledWith("2026-10-29");

    await user.click(nextDay());
    expect(headingText()).toBe("Fri, Oct 30");
    expect(nextDay().getAttribute("aria-disabled")).not.toBe("true");
    await user.click(nextDay());
    expect(headingText()).toBe("Sat, Oct 31");
    expect(nextDay().getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps the day when the app returns after less than 5 minutes away", async () => {
    setNow(2026, 10, 30, 12, 0);
    renderToday({ entries: entries() });
    await loaded();
    await userEvent.click(prevDay());
    setVisibility("hidden");
    vi.setSystemTime(new Date(2026, 9, 30, 12, 4, 59));
    setVisibility("visible");
    expect(headingText()).toBe("Thu, Oct 29");
  });

  it("shows the current day when the app returns after 5 minutes or more away", async () => {
    setNow(2026, 10, 30, 12, 0);
    renderToday({ entries: entries() });
    await loaded();
    await userEvent.click(prevDay());
    setVisibility("hidden");
    vi.setSystemTime(new Date(2026, 9, 30, 12, 0, 0, minutes(5)));
    setVisibility("visible");
    expect(headingText()).toBe("Fri, Oct 30");
    expect(await screen.findByText("today's lunch")).toBeTruthy();
  });

  it("counts time spent on Settings as away too", async () => {
    setNow(2026, 10, 30, 12, 0);
    renderToday({ entries: entries() });
    await loaded();
    const user = userEvent.setup();
    await user.click(prevDay());
    await user.click(screen.getByRole("link", { name: "Settings" }));
    setVisibility("hidden");
    vi.setSystemTime(new Date(2026, 9, 30, 12, 10));
    setVisibility("visible");
    await user.click(await screen.findByRole("link", { name: "Home" }));
    await loaded();
    expect(headingText()).toBe("Fri, Oct 30");
  });

  it("leaves the current day to follow the date whatever the time away", async () => {
    setNow(2026, 10, 30, 23, 58);
    renderToday({ entries: entries() });
    await loaded();
    setVisibility("hidden");
    vi.setSystemTime(new Date(2026, 9, 31, 0, 1));
    setVisibility("visible");
    expect(headingText()).toBe("Sat, Oct 31");
  });
});
