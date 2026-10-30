import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loaded, renderToday, setNow } from "./test-utils";

afterEach(() => vi.useRealTimers());

describe("Today layout (Crate v3)", () => {
  it("orders the date heading, settings button, price card, entry list and composer", async () => {
    setNow(2026, 10, 30);
    renderToday();
    await loaded();
    const heading = screen.getByRole("heading", { level: 1 });
    const settings = screen.getByRole("link", { name: "Settings" });
    const card = document.querySelector("[data-price-card]") as HTMLElement;
    const list = screen.getByRole("heading", { name: "Logged today" });
    const composer = document.querySelector("[data-composer]") as HTMLElement;
    expect(card.querySelectorAll("[data-pillar]")).toHaveLength(3);
    expect(composer.querySelector("input")).toBe(
      screen.getByRole("textbox", { name: "What did you eat?" }),
    );
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(heading, card)).toBe(true);
    expect(follows(settings, card)).toBe(true);
    expect(follows(card, list)).toBe(true);
    expect(follows(list, composer)).toBe(true);
  });

  it("shows the composer while the day is loading or failed", async () => {
    setNow(2026, 10, 30);
    renderToday();
    expect(
      screen.getByRole("textbox", { name: "What did you eat?" }),
    ).toBeTruthy();
  });

  it("keeps the pillars in order: calories, protein, fruit & veg", async () => {
    setNow(2026, 10, 30);
    renderToday();
    await loaded();
    expect(
      [...document.querySelectorAll("[data-pillar]")].map((p) =>
        p.getAttribute("data-pillar"),
      ),
    ).toEqual(["calories", "protein", "fruitVeg"]);
  });
});
