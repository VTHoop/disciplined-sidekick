import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeFood } from "../food/fake-food";
import { createFakeTargets } from "../settings/fake-targets";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import {
  figure,
  LOAD_FAILED,
  loaded,
  NOTHING_LOGGED,
  pillar,
  renderToday,
  setNow,
  TARGETS,
} from "./test-utils";

afterEach(() => vi.useRealTimers());

describe("Today with nothing logged", () => {
  it("points at the composer", async () => {
    setNow(2026, 10, 30);
    renderToday();
    await loaded();
    expect(screen.getByRole("heading", { name: "Logged today" })).toBeTruthy();
    expect(screen.getByText(NOTHING_LOGGED)).toBeTruthy();
  });
});

describe("Today while loading", () => {
  it("shows a loading state, never a zero or the empty message", async () => {
    setNow(2026, 10, 30);
    const entries = createFakeEntries();
    const release = entries.holdLoad();
    renderToday({ entries });
    expect(await screen.findByText("Loading today…")).toBeTruthy();
    expect(document.querySelector("[data-figure]")).toBeNull();
    expect(screen.queryByText(NOTHING_LOGGED)).toBeNull();
    expect(screen.queryByText("Set a target")).toBeNull();
    release();
    await loaded();
    expect(screen.queryByText("Loading today…")).toBeNull();
    expect(figure(pillar("calories"))).toBe("0");
  });

  it("keeps loading while targets are slow, even if entries have arrived", async () => {
    setNow(2026, 10, 30);
    const targets = createFakeTargets(TARGETS);
    let release!: () => void;
    targets.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(TARGETS);
        }),
    );
    renderToday({ targets });
    expect(await screen.findByText("Loading today…")).toBeTruthy();
    expect(screen.queryByText("Set a target")).toBeNull();
    release();
    await loaded();
  });
});

describe.each([
  [
    "entries",
    () => {
      const entries = createFakeEntries({
        "2026-10-30": [sampleEntry({ items: [sampleItem({ kcal: 500 })] })],
      });
      entries.failNextLoad();
      return { entries, targets: createFakeTargets(TARGETS) };
    },
  ],
  [
    "targets",
    () => {
      const targets = createFakeTargets(TARGETS);
      targets.failNextLoad();
      return {
        entries: createFakeEntries({
          "2026-10-30": [sampleEntry({ items: [sampleItem({ kcal: 500 })] })],
        }),
        targets,
      };
    },
  ],
])("Today when %s can't load", (_name, make) => {
  it("says so with a Retry button, never reading the failure as no target or no entries", async () => {
    setNow(2026, 10, 30);
    renderToday(make());
    expect(await screen.findByText(LOAD_FAILED)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByText("Set a target")).toBeNull();
    expect(screen.queryByText(NOTHING_LOGGED)).toBeNull();
    expect(document.querySelector("[data-figure]")).toBeNull();
  });

  it("loads again on Retry", async () => {
    setNow(2026, 10, 30);
    renderToday(make());
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Retry" }));
    await loaded();
    expect(screen.queryByText(LOAD_FAILED)).toBeNull();
    expect(figure(pillar("calories"))).toBe("500");
  });
});

describe("Today after Done", () => {
  it("updates pillars and the list in place, with no loading state and no reload", async () => {
    setNow(2026, 10, 30, 13, 0);
    const food = createFakeFood();
    const entries = createFakeEntries({
      "2026-10-30": [
        sampleEntry({
          text: "breakfast",
          at: [2026, 10, 30, 8, 0],
          items: [sampleItem({ kcal: 400, protein: 20, fruitVegG: 0 })],
        }),
      ],
    });
    const { targets } = renderToday({ entries, food });
    await loaded();
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("textbox", { name: "What did you eat?" }),
      "2 eggs and 150 g blueberries{Enter}",
    );
    await user.click(await screen.findByRole("button", { name: "Done" }));

    await waitFor(() =>
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2),
    );
    expect(screen.queryByText("Loading today…")).toBeNull();
    // 400 + 228.5, 20 + 13.67, 0 + 150
    expect(figure(pillar("calories"))).toBe("629");
    expect(figure(pillar("protein"))).toBe("34");
    expect(figure(pillar("fruitVeg"))).toBe("150");
    const [newest] = screen.getAllByRole("heading", { level: 3 });
    expect(newest?.textContent).toContain("2 eggs and 150 g blueberries");
    expect(entries.load).toHaveBeenCalledTimes(1);
    expect(targets.load).toHaveBeenCalledTimes(1);
  });
});
