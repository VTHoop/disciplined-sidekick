import { localDate, type StoredTargets } from "@disciplined-sidekick/core";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { App } from "../App";
import { createFakeAuth, makeSession } from "../auth/fake-auth";
import { fullDay } from "../day-label";
import { createFakeFood, type FakeFood } from "../food/fake-food";
import { createFakeTargets, type FakeTargets } from "../settings/fake-targets";
import {
  createFakeEntries,
  type FakeEntries,
  sampleEntry,
  sampleItem,
} from "./fake-entries";

export const TARGETS: StoredTargets = {
  calories: 2200,
  protein: 140,
  fruitVeg: 800,
  fruitVegEdited: true,
};

/** A day (2026-10-30) with one entry holding one item of these amounts. */
export const oneEntryDay = (kcal: number, protein = 0, fruitVegG = 0) =>
  createFakeEntries({
    "2026-10-30": [
      sampleEntry({ items: [sampleItem({ kcal, protein, fruitVegG })] }),
    ],
  });

/** The heading's full date for a day (the device's current day by default), e.g. "Friday, October 30". */
export const todayHeading = (day = localDate(new Date())) => fullDay(day);

export const LOAD_FAILED = "Couldn't load this day's totals.";
export const NOTHING_LOGGED = "Nothing logged yet. Type what you ate below.";

/** Pins the device clock (month is 1-based) without faking timers. */
export const setNow = (y: number, mo: number, d: number, h = 12, mi = 0) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(y, mo - 1, d, h, mi));
};

export function renderToday({
  entries = createFakeEntries(),
  targets = createFakeTargets(TARGETS),
  food = createFakeFood(),
  route = "/",
}: {
  entries?: FakeEntries;
  targets?: FakeTargets;
  food?: FakeFood;
  route?: string;
} = {}) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <App
        auth={createFakeAuth(makeSession())}
        targets={targets}
        food={food}
        entries={entries}
      />
    </MemoryRouter>,
  );
  return { entries, targets, food };
}

/** Waits for the day's totals to load. */
export const loaded = () =>
  screen.findByRole("heading", { name: "Food journal" });

/** A pillar row. On the page by default (not the preview sheet's); pass the dialog for its card. */
export const pillar = (
  kind: "calories" | "protein" | "fruitVeg",
  root: ParentNode = document,
) => {
  const el = [
    ...root.querySelectorAll<HTMLElement>(`[data-pillar="${kind}"]`),
  ].find((e) => root !== document || !e.closest("dialog"));
  if (!el) throw new Error(`no ${kind} pillar`);
  return el;
};

export const figure = (el: HTMLElement) =>
  el.querySelector("[data-figure]")?.textContent ?? null;
export const sublabel = (el: HTMLElement) =>
  el.querySelector("[data-sublabel]")?.textContent ?? null;
export const stickers = (el: HTMLElement) =>
  [...el.querySelectorAll(".sticker")].map((s) => s.textContent);
export const fillPercent = (el: HTMLElement) => {
  const fill = el.querySelector<HTMLElement>("[data-fill]");
  return fill ? Number.parseFloat(fill.style.width) : null;
};

export const prevDay = () =>
  screen.getByRole("button", { name: "Previous day" });
export const nextDay = () => screen.getByRole("button", { name: "Next day" });
export const backToToday = () => screen.queryByText("Back to today");

/** The visible short date heading text, e.g. "Thu, Nov 5". */
export const headingText = () =>
  screen.getByRole("heading", { level: 1 }).querySelector("[data-short-date]")
    ?.textContent;

/** Hides or shows the page and fires `visibilitychange`. Undone by `vi.restoreAllMocks()`. */
export const setVisibility = (state: "hidden" | "visible") => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};
