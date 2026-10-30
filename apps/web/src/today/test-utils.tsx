import type { StoredTargets } from "@disciplined-sidekick/core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { App } from "../App";
import { createFakeAuth, makeSession } from "../auth/fake-auth";
import { createFakeFood, type FakeFood } from "../food/fake-food";
import { createFakeTargets, type FakeTargets } from "../settings/fake-targets";
import { createFakeEntries, type FakeEntries } from "./fake-entries";

export const TARGETS: StoredTargets = {
  calories: 2200,
  protein: 140,
  fruitVeg: 800,
  fruitVegEdited: true,
};

export const LOAD_FAILED = "Couldn't load today's totals.";
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
  screen.findByRole("heading", { name: "Logged today" });

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
