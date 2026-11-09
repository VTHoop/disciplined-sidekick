import type { FoodPreview } from "@disciplined-sidekick/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeFood, samplePreview } from "./fake-food";
import { FoodLog } from "./food-log";

const TEXT = "2 eggs and 150 g blueberries";

function setup(preview: FoodPreview = samplePreview()) {
  const food = createFakeFood(preview);
  const user = userEvent.setup();
  const onSaved = vi.fn();
  render(
    <FoodLog
      api={food}
      day="2026-10-28"
      currentDay="2026-10-28"
      now={() => new Date(2026, 9, 28, 12, 0)}
      onSignIn={() => {}}
      onSaved={onSaved}
      renderCard={(p) => (
        <p data-testid="card">
          {Math.round(p.totals.kcal)}|{Math.round(p.totals.fruitVegG)}
        </p>
      )}
    />,
  );
  const open = async () => {
    await user.type(
      screen.getByRole("textbox", { name: "What did you eat?" }),
      TEXT,
    );
    await user.click(screen.getByRole("button", { name: "Log" }));
    return screen.findByRole("dialog");
  };
  const grams = (name: string) =>
    screen.getByRole("textbox", {
      name: `Grams of ${name}`,
    }) as HTMLInputElement;
  const type = async (name: string, value: string) => {
    await user.clear(grams(name));
    if (value) await user.type(grams(name), value);
  };
  const done = () => screen.getByRole("button", { name: "Done" });
  const row = (name: string) => {
    const li = within(screen.getByRole("dialog"))
      .getAllByRole("listitem")
      .find((l) => l.textContent?.includes(name));
    if (!li) throw new Error(`no row ${name}`);
    return li;
  };
  const savedItems = () => {
    const call = food.save.mock.calls.at(-1);
    if (!call) throw new Error("not saved");
    return call[0].items;
  };
  return { food, user, onSaved, open, grams, type, done, row, savedItems };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("grams field", () => {
  it("is a labelled whole-number field showing the parsed grams, with the numeric keypad", async () => {
    const { open, grams } = setup();
    await open();
    const f = grams("2 eggs");
    expect(f.value).toBe("100");
    expect(f.inputMode).toBe("numeric");
    expect(grams("150 g blueberries").value).toBe("150");
  });

  it("shows decimal parsed grams rounded", async () => {
    const p = samplePreview();
    const [egg, berry] = p.items;
    if (!egg || !berry) throw new Error("items");
    const { open, grams } = setup({
      ...p,
      items: [{ ...egg, grams: 113.4 }, berry],
    });
    await open();
    expect(grams("2 eggs").value).toBe("113");
  });

  it("saves an unedited item with exactly the parsed grams, decimals included, and no parsed_grams", async () => {
    const p = samplePreview();
    const [egg, berry] = p.items;
    if (!egg || !berry) throw new Error("items");
    const { open, user, done, savedItems } = setup({
      ...p,
      items: [{ ...egg, grams: 113.4 }, berry],
    });
    await open();
    await user.click(done());
    await waitFor(() => expect(savedItems()).toHaveLength(2));
    expect(savedItems()[0]).toMatchObject({
      grams: 113.4,
      portionEstimated: true,
    });
    expect(savedItems()[0]?.parsedGrams ?? null).toBeNull();
  });
});

describe("editing grams", () => {
  it("recomputes the item, the entry total and the card without another call", async () => {
    const { open, type, row, food } = setup();
    const dialog = await open();
    await type("2 eggs", "200");
    expect(row("2 eggs").textContent).toContain("286 kcal");
    // 286 + 85.5 = 371.5 kcal, 150 g of fruit/veg unchanged
    expect(
      within(dialog).getByRole("region", { name: "Entry total" }).textContent,
    ).toContain("372 kcal");
    expect(screen.getByTestId("card").textContent).toBe("372|150");
    await type("150 g blueberries", "300");
    expect(row("150 g blueberries").textContent).toContain("300 g fruit/veg");
    expect(screen.getByTestId("card").textContent).toBe("457|300");
    expect(food.parse).toHaveBeenCalledOnce();
  });

  it("announces the new kcal when focus leaves the field, not on each keystroke", async () => {
    const { open, user, grams, type } = setup();
    const dialog = await open();
    const live = () =>
      dialog.querySelector('[aria-live="polite"]')?.textContent ?? "";
    await user.click(grams("2 eggs"));
    await type("2 eggs", "200");
    expect(live()).not.toMatch(/286/);
    await user.tab();
    expect(live()).toContain("286 kcal");
  });

  it("scrolls the field into view when it is focused", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { open, user, grams } = setup();
    await open();
    await user.click(grams("2 eggs"));
    expect(scroll).toHaveBeenCalled();
  });

  it("clears est. portion on an edit and brings it back when the number returns", async () => {
    const { open, type, row } = setup();
    await open();
    expect(within(row("2 eggs")).getByText("est. portion")).toBeTruthy();
    await type("2 eggs", "120");
    expect(within(row("2 eggs")).queryByText("est. portion")).toBeNull();
    await type("2 eggs", "100");
    expect(within(row("2 eggs")).getByText("est. portion")).toBeTruthy();
  });

  it("edits the same food twice as two items", async () => {
    const p = samplePreview();
    const [egg] = p.items;
    if (!egg) throw new Error("items");
    const twice = { ...p, items: [egg, { ...egg }] };
    const { open, user, done, savedItems } = setup(twice);
    await open();
    const [a, b] = screen.getAllByRole("textbox", { name: "Grams of 2 eggs" });
    if (!a || !b) throw new Error("two fields");
    await user.clear(a);
    await user.type(a, "50");
    expect((b as HTMLInputElement).value).toBe("100");
    await user.click(done());
    await waitFor(() => expect(savedItems()).toHaveLength(2));
    expect(savedItems().map((i) => i.grams)).toEqual([50, 100]);
  });
});

describe("invalid grams", () => {
  it.each([
    ["empty", ""],
    ["zero", "0"],
    ["non-numeric", "abc"],
    ["above 3,000", "3001"],
  ])("shows an inline message and blocks Done for %s", async (_n, value) => {
    const { open, type, done, user, grams, food } = setup();
    const dialog = await open();
    await type("2 eggs", value);
    const f = grams("2 eggs");
    expect(f.getAttribute("aria-invalid")).toBe("true");
    const msgId = f.getAttribute("aria-describedby");
    expect(msgId && document.getElementById(msgId)?.textContent).toBeTruthy();
    expect(done().getAttribute("aria-disabled")).toBe("true");
    await user.click(done());
    expect(food.save).not.toHaveBeenCalled();
    expect(dialog.isConnected).toBe(true);
  });

  it("accepts 3,000 and re-enables Done once fixed", async () => {
    const { open, type, done, grams } = setup();
    await open();
    await type("2 eggs", "3001");
    expect(done().getAttribute("aria-disabled")).toBe("true");
    await type("2 eggs", "3000");
    expect(grams("2 eggs").getAttribute("aria-invalid")).toBeNull();
    expect(done().getAttribute("aria-disabled")).not.toBe("true");
  });
});

describe("Done with edits", () => {
  it("saves the edited grams and recomputed values, parsed_grams, and a cleared portion flag", async () => {
    const { open, type, user, done, savedItems, onSaved } = setup();
    await open();
    await type("2 eggs", "200");
    await user.click(done());
    await waitFor(() => expect(savedItems()).toHaveLength(2));
    const [egg, berry] = savedItems();
    expect(egg).toMatchObject({
      grams: 200,
      parsedGrams: 100,
      portionEstimated: false,
    });
    expect(egg?.kcal).toBeCloseTo(286);
    expect(egg?.protein).toBeCloseTo(25.12);
    expect(berry?.parsedGrams ?? null).toBeNull();
    expect(berry?.grams).toBe(150);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0]?.[0].totals.kcal).toBeCloseTo(371.5);
  });

  it("keeps the edits across a failed save and a retry saves them", async () => {
    const { open, type, user, done, grams, food, savedItems } = setup();
    await open();
    await type("2 eggs", "200");
    food.failNextSave("network");
    await user.click(done());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/connection/i),
    );
    expect(grams("2 eggs").value).toBe("200");
    await user.click(done());
    await waitFor(() => expect(food.save).toHaveBeenCalledTimes(2));
    expect(savedItems()[0]).toMatchObject({ grams: 200, parsedGrams: 100 });
  });

  it("drops the preview, edits included, when the session expired", async () => {
    const { open, type, user, done, food } = setup();
    await open();
    await type("2 eggs", "200");
    food.failNextSave("session");
    await user.click(done());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("discarding edits", () => {
  const reopen = async (
    ctx: ReturnType<typeof setup>,
    close: () => Promise<void> | void,
  ) => {
    await ctx.open();
    await ctx.type("2 eggs", "200");
    await close();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      (
        screen.getByRole("textbox", {
          name: "What did you eat?",
        }) as HTMLInputElement
      ).value,
    ).toBe(TEXT);
    await ctx.user.click(screen.getByRole("button", { name: "Log" }));
    await screen.findByRole("dialog");
    expect(ctx.grams("2 eggs").value).toBe("100");
    expect(ctx.food.save).not.toHaveBeenCalled();
  };

  it("Undo", async () => {
    const ctx = setup();
    await reopen(ctx, () =>
      ctx.user.click(screen.getByRole("button", { name: "Undo" })),
    );
  });

  it("Escape", async () => {
    const ctx = setup();
    await reopen(ctx, () => ctx.user.keyboard("{Escape}"));
  });

  it("back", async () => {
    const ctx = setup();
    await reopen(ctx, () => {
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
    });
  });

  it("swipe down", async () => {
    const ctx = setup();
    await reopen(ctx, () => {
      const dialog = screen.getByRole("dialog");
      fireEvent.pointerDown(dialog, { pointerId: 1, clientY: 100 });
      fireEvent.pointerMove(dialog, { pointerId: 1, clientY: 260 });
      fireEvent.pointerUp(dialog, { pointerId: 1, clientY: 260 });
    });
  });
});
