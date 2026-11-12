import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import { loaded, renderToday, setNow } from "./test-utils";

afterEach(() => vi.useRealTimers());

const setup = async () => {
  setNow(2026, 10, 30);
  const user = userEvent.setup();
  renderToday({
    entries: createFakeEntries({
      "2026-10-30": [
        sampleEntry({
          items: [
            sampleItem({ position: 0, name: "2 eggs", kcal: 143 }),
            sampleItem({ position: 1, name: "toast", kcal: 80 }),
          ],
        }),
      ],
    }),
  });
  await loaded();
  return { user };
};

describe("Today's journal hooks for its styles", () => {
  it("marks a meal's time and its total apart, so the time can be a tag and the total stay quiet", async () => {
    await setup();
    const title = screen.getByRole("heading", { level: 3 });
    expect(title.querySelector("time.entry-time")).not.toBeNull();
    expect(
      within(title).getByText("223 kcal").classList.contains("entry-total"),
    ).toBe(true);
  });

  it("draws each row as a plain button, not an uppercase action button", async () => {
    await setup();
    for (const row of document.querySelectorAll(".food-item-row")) {
      expect(row.classList.contains("button-plain")).toBe(true);
    }
  });

  it("marks only the open row as open, and unmarks it when it closes", async () => {
    const { user } = await setup();
    const [eggs, toast] = [
      ...document.querySelectorAll<HTMLElement>("[data-item]"),
    ];
    const eggsRow = within(eggs as HTMLElement).getByRole("button", {
      expanded: false,
    });
    await user.click(eggsRow);
    expect(eggs?.classList.contains("food-item-open")).toBe(true);
    expect(toast?.classList.contains("food-item-open")).toBe(false);
    await user.click(eggsRow);
    expect(eggs?.classList.contains("food-item-open")).toBe(false);
  });
});
