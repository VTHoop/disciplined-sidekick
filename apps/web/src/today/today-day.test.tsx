import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import { figure, loaded, pillar, renderToday, setNow } from "./test-utils";

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, "visibilityState");
});

const dateHeading = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

const entries = () =>
  createFakeEntries({
    "2026-10-30": [
      sampleEntry({
        text: "yesterday's lunch",
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
        name: dateHeading(2026, 10, 30),
      }),
    ).toBeTruthy();
    expect(fake.load).toHaveBeenCalledWith("2026-10-30");
    expect(screen.getByText("yesterday's lunch")).toBeTruthy();
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
        name: dateHeading(2026, 10, 31),
      }),
    ).toBeTruthy();
    expect(fake.load).toHaveBeenLastCalledWith("2026-10-31");
    expect(await screen.findByText("new day")).toBeTruthy();
    expect(screen.queryByText("yesterday's lunch")).toBeNull();
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
        name: dateHeading(2026, 10, 31),
      }),
    ).toBeTruthy();
  });

  it("checks the date when the app returns to the foreground", async () => {
    setNow(2026, 10, 30, 22, 0);
    const fake = entries();
    renderToday({ entries: fake });
    await loaded();

    vi.setSystemTime(new Date(2026, 9, 31, 8, 0));
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() =>
      expect(fake.load).toHaveBeenLastCalledWith("2026-10-31"),
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: dateHeading(2026, 10, 31),
      }),
    ).toBeTruthy();
  });

  it("does not reload when it returns to the foreground on the same day", async () => {
    setNow(2026, 10, 30, 22, 0);
    const fake = entries();
    renderToday({ entries: fake });
    await loaded();
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fake.load).toHaveBeenCalledTimes(1);
  });
});
