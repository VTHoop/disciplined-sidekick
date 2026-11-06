import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeFood } from "../food/fake-food";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import {
  backToToday,
  figure,
  headingText,
  loaded,
  nextDay,
  pillar,
  prevDay,
  renderToday,
  setNow,
} from "./test-utils";

afterEach(() => vi.useRealTimers());

const entries = () =>
  createFakeEntries({
    "2026-10-30": [
      sampleEntry({
        text: "today's lunch",
        items: [sampleItem({ kcal: 600 })],
      }),
    ],
    "2026-10-29": [
      sampleEntry({
        text: "last night's dinner",
        at: [2026, 10, 29, 19, 0],
        items: [sampleItem({ kcal: 900, protein: 40 })],
      }),
    ],
  });

describe("Today's header", () => {
  it("has the date heading, then Previous day, Next day and an icon Settings button, in one header", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: entries() });
    await loaded();
    const header = screen.getByRole("banner");
    const controls = within(header)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    const settings = within(header).getByRole("link", { name: "Settings" });
    expect(settings.textContent?.trim()).toBe("");
    expect(controls).toEqual(["Previous day", "Next day"]);
    const heading = within(header).getByRole("heading", { level: 1 });
    const order = [heading, prevDay(), nextDay(), settings];
    for (let i = 0; i < order.length - 1; i++) {
      expect(order[i]?.compareDocumentPosition(order[i + 1] as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });

  it("shows the short date only, with no Today or Yesterday", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: entries() });
    await loaded();
    expect(headingText()).toBe("Fri, Oct 30");
    await userEvent.click(prevDay());
    expect(headingText()).toBe("Thu, Oct 29");
    expect(screen.queryByText(/yesterday/i)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toMatch(
      /today/i,
    );
  });

  it("adds the year for a day in a different year, and reads the full date", async () => {
    setNow(2026, 1, 2);
    renderToday();
    await loaded();
    const user = userEvent.setup();
    await user.click(prevDay());
    await user.click(prevDay());
    await user.click(prevDay());
    expect(headingText()).toBe("Tue, Dec 30, 2025");
    expect(
      screen.getByRole("heading", { level: 1, name: "Tuesday, December 30" }),
    ).toBeTruthy();
  });
});

describe("moving between days", () => {
  it("steps back with no lower limit and forward again, never past the current day", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: entries() });
    await loaded();
    const user = userEvent.setup();
    expect(nextDay().getAttribute("aria-disabled")).toBe("true");
    await user.click(nextDay());
    expect(headingText()).toBe("Fri, Oct 30");

    for (let i = 0; i < 40; i++) await user.click(prevDay());
    expect(headingText()).toBe("Sun, Sep 20");
    expect(prevDay().getAttribute("aria-disabled")).not.toBe("true");
    expect(nextDay().getAttribute("aria-disabled")).toBeNull();

    for (let i = 0; i < 40; i++) await user.click(nextDay());
    expect(headingText()).toBe("Fri, Oct 30");
    expect(nextDay().getAttribute("aria-disabled")).toBe("true");
  });

  it("shows Back to today only off the current day, and it returns there", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: entries() });
    await loaded();
    const user = userEvent.setup();
    expect(backToToday()).toBeNull();
    await user.click(prevDay());
    expect(backToToday()).not.toBeNull();
    await user.click(screen.getByText("Back to today"));
    expect(headingText()).toBe("Fri, Oct 30");
    expect(backToToday()).toBeNull();
  });

  it("shows each day's own entries and totals against the current targets", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: entries() });
    await loaded();
    const user = userEvent.setup();
    expect(figure(pillar("calories"))).toBe("600");
    await user.click(prevDay());
    expect(await screen.findByText("last night's dinner")).toBeTruthy();
    expect(screen.queryByText("today's lunch")).toBeNull();
    expect(figure(pillar("calories"))).toBe("900");
    expect(pillar("calories").textContent).toContain("2,200");
  });

  it("moves the heading at once and keeps the arrows usable while the day loads", async () => {
    setNow(2026, 10, 30);
    const fake = entries();
    renderToday({ entries: fake });
    await loaded();
    const release = fake.holdLoad();
    const user = userEvent.setup();
    await user.click(prevDay());
    expect(headingText()).toBe("Thu, Oct 29");
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(document.querySelector("[data-pillar]")).toBeNull();
    await user.click(prevDay());
    expect(headingText()).toBe("Wed, Oct 28");
    release();
    await loaded();
    expect(fake.load).toHaveBeenLastCalledWith("2026-10-28");
  });

  it("opens on the current day on a cold start", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: entries() });
    await loaded();
    await userEvent.click(prevDay());
    cleanup();
    renderToday({ entries: entries() });
    await loaded();
    expect(headingText()).toBe("Fri, Oct 30");
  });

  it("returns to the viewed day after Settings", async () => {
    setNow(2026, 10, 30);
    const fake = entries();
    renderToday({ entries: fake });
    await loaded();
    const user = userEvent.setup();
    await user.click(prevDay());
    await user.click(screen.getByRole("link", { name: "Settings" }));
    await user.click(await screen.findByRole("link", { name: "Today" }));
    await loaded();
    expect(headingText()).toBe("Thu, Oct 29");
    expect(await screen.findByText("last night's dinner")).toBeTruthy();
  });
});

describe("logging to the viewed day", () => {
  it("saves to the viewed past day, names it on the sheet and leaves the current day alone", async () => {
    setNow(2026, 10, 30);
    const food = createFakeFood();
    renderToday({ entries: entries(), food });
    await loaded();
    const user = userEvent.setup();
    await user.click(prevDay());
    await screen.findByText("last night's dinner");

    const field = screen.getByRole("textbox", { name: "What did you eat?" });
    expect((field as HTMLInputElement).placeholder).toBe("Add to Thu, Oct 29");
    await user.type(field, "snack{Enter}");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("For Thu, Oct 29")).toBeTruthy();
    // That day's 900 kcal plus the entry's 228.5.
    expect(figure(pillar("calories", dialog))).toBe("1,129");
    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    expect(food.save).toHaveBeenCalledWith(expect.anything(), "2026-10-29");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(figure(pillar("calories"))).toBe("1,129");
    expect(screen.getByText("snack")).toBeTruthy();

    await user.click(nextDay());
    await screen.findByText("today's lunch");
    expect(figure(pillar("calories"))).toBe("600");
    expect(screen.queryByText("snack")).toBeNull();
  });

  it("names the day on the sheet on the current day too, with no placeholder", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: entries() });
    await loaded();
    const user = userEvent.setup();
    const field = screen.getByRole("textbox", { name: "What did you eat?" });
    expect((field as HTMLInputElement).placeholder).toBe("");
    await user.type(field, "snack{Enter}");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("For Fri, Oct 30")).toBeTruthy();
  });
});

describe("accessibility", () => {
  it("announces the new date once per change, and keeps focus on the tapped arrow", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: entries() });
    await loaded();
    const user = userEvent.setup();
    const announcer = () =>
      document.querySelector("[data-day-announcer]")?.textContent;
    expect(
      document.querySelector("[data-day-announcer]")?.getAttribute("role"),
    ).toBe("status");
    expect(announcer()).toBe("");
    await user.click(prevDay());
    expect(announcer()).toBe("Thursday, October 29");
    expect(document.activeElement).toBe(prevDay());
    await user.click(nextDay());
    expect(announcer()).toBe("Friday, October 30");
    expect(document.activeElement).toBe(nextDay());
  });

  it("moves focus to the date heading after Back to today", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: entries() });
    await loaded();
    const user = userEvent.setup();
    await user.click(prevDay());
    await user.click(screen.getByText("Back to today"));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1 }),
    );
  });
});
