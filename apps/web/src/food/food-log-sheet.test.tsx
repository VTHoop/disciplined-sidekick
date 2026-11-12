import type { FoodPreview, PreviewItem } from "@disciplined-sidekick/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeFood, samplePreview } from "./fake-food";
import { FoodLog } from "./food-log";

const realScrollIntoView = Element.prototype.scrollIntoView;
afterEach(() => {
  Element.prototype.scrollIntoView = realScrollIntoView;
});

/** The card stays mounted (a remount would refetch another day's totals) but is hidden. */
const cardHidden = () =>
  screen.getByTestId("card").closest("[hidden]") !== null;

function manyItems(n: number): FoodPreview {
  const base = samplePreview();
  const [egg] = base.items;
  if (!egg) throw new Error("items");
  const items: PreviewItem[] = Array.from({ length: n }, (_, i) => ({
    ...egg,
    name: `food ${i + 1}`,
  }));
  return { ...base, text: "SECRET TYPED TEXT", items };
}

async function open(preview: FoodPreview) {
  const user = userEvent.setup();
  render(
    <FoodLog
      api={createFakeFood(preview)}
      day="2026-11-11"
      currentDay="2026-11-12"
      onSignIn={() => {}}
      renderCard={() => <p data-testid="card">card</p>}
    />,
  );
  await user.type(
    screen.getByRole("textbox", { name: "What did you eat?" }),
    "SECRET TYPED TEXT",
  );
  await user.click(screen.getByRole("button", { name: "Log" }));
  const dialog = await screen.findByRole("dialog");
  return { user, dialog };
}

describe("preview sheet header", () => {
  it('reads "Check 5 items", keeps the day line and never shows the typed text', async () => {
    const { dialog } = await open(manyItems(5));
    expect(
      within(dialog).getByRole("heading", { name: "Check 5 items" }),
    ).toBeTruthy();
    expect(within(dialog).getByText("For Wed, Nov 11")).toBeTruthy();
    expect(dialog.textContent).not.toContain("SECRET TYPED TEXT");
  });

  it('reads "Check 1 item" for one', async () => {
    const { dialog } = await open(manyItems(1));
    expect(
      within(dialog).getByRole("heading", { name: "Check 1 item" }),
    ).toBeTruthy();
  });
});

describe("preview sheet item row", () => {
  it("puts the grams field first, then the name with protein and est. portion, then the kcal", async () => {
    const { dialog } = await open(samplePreview());
    const row = within(dialog).getAllByRole("listitem")[0] as HTMLElement;
    const grams = row.querySelector("input") as HTMLElement;
    const name = row.querySelector("[data-item-name]") as HTMLElement;
    const kcal = row.querySelector("[data-item-kcal]") as HTMLElement;
    expect(name.textContent).toContain("2 eggs");
    expect(name.textContent).toContain("g protein");
    expect(name.textContent).toContain("est. portion");
    const before = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(grams, name)).toBe(true);
    expect(before(name, kcal)).toBe(true);
    expect(kcal.textContent).toBe("143 kcal");
  });
});

describe("preview sheet with many items", () => {
  it("lists all 12 items inside the scrolling list, with Done outside it", async () => {
    const { dialog } = await open(manyItems(12));
    const list = dialog.querySelector(".food-items") as HTMLElement;
    expect(within(list).getAllByRole("listitem")).toHaveLength(12);
    const done = within(dialog).getByRole("button", { name: "Done" });
    expect(list.contains(done)).toBe(false);
    expect(list.contains(within(dialog).getByText("Entry total"))).toBe(false);
  });
});

describe("the day card while a grams field has focus", () => {
  it("hides on focus, stays hidden moving between fields, returns on leaving, and keeps focus", async () => {
    const { user, dialog } = await open(manyItems(3));
    expect(cardHidden()).toBe(false);
    const first = screen.getByRole("textbox", { name: "Grams of food 1" });
    const second = screen.getByRole("textbox", { name: "Grams of food 2" });
    await user.click(first);
    expect(cardHidden()).toBe(true);
    expect(document.activeElement).toBe(first);
    await user.click(second);
    expect(cardHidden()).toBe(true);
    expect(document.activeElement).toBe(second);
    await user.click(within(dialog).getByRole("heading", { level: 2 }));
    await waitFor(() => expect(cardHidden()).toBe(false));
  });

  it("keeps the other pinned areas on screen while the card is hidden", async () => {
    const { user, dialog } = await open(manyItems(3));
    await user.click(screen.getByRole("textbox", { name: "Grams of food 1" }));
    expect(within(dialog).getByRole("heading", { level: 2 })).toBeTruthy();
    expect(within(dialog).getByText("Entry total")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("scrolls the field into view again once the card has gone", async () => {
    const cardPresent: boolean[] = [];
    Element.prototype.scrollIntoView = vi.fn(() => {
      cardPresent.push(!cardHidden());
    });
    const { user } = await open(manyItems(3));
    await user.click(screen.getByRole("textbox", { name: "Grams of food 1" }));
    expect(cardPresent.at(-1)).toBe(false);
  });
});

describe("leaving a grams field by pressing Done or Undo", () => {
  it("Done saves the edited grams", async () => {
    const food = createFakeFood(manyItems(2));
    const user = userEvent.setup();
    render(
      <FoodLog
        api={food}
        day="2026-11-11"
        currentDay="2026-11-12"
        onSignIn={() => {}}
        renderCard={() => <p data-testid="card">card</p>}
      />,
    );
    await user.type(
      screen.getByRole("textbox", { name: "What did you eat?" }),
      "x",
    );
    await user.click(screen.getByRole("button", { name: "Log" }));
    const field = await screen.findByRole("textbox", {
      name: "Grams of food 1",
    });
    await user.clear(field);
    await user.type(field, "250");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(food.save).toHaveBeenCalled());
    expect(food.save.mock.calls[0]?.[0].items[0]?.grams).toBe(250);
  });
});
