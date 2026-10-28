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
import { describe, expect, it } from "vitest";
import { createFakeFood, type FakeFood, samplePreview } from "./fake-food";
import { FoodLog } from "./food-log";

const TEXT = "2 eggs and 150 g blueberries";
const NO_FOOD =
  "Couldn't find any food in that. Try e.g. '2 eggs and 150 g blueberries'.";
const LOOKUP_FAILED = "Couldn't log that. Check your connection and try again.";
const SAVE_FAILED = "Couldn't save that. Check your connection and try again.";

function setup({
  food = createFakeFood(),
  now = () => new Date(2026, 9, 28, 12, 0),
}: {
  food?: FakeFood;
  now?: () => Date;
} = {}) {
  const user = userEvent.setup();
  const view = render(<FoodLog api={food} now={now} />);
  const field = () =>
    screen.getByRole("textbox", {
      name: "What did you eat?",
    }) as HTMLInputElement;
  const logButton = () =>
    screen.getByRole("button", { name: "Log" }) as HTMLButtonElement;
  const submit = async (text = TEXT) => {
    await user.type(field(), text);
    await user.click(logButton());
  };
  const sheet = () => screen.getByRole("dialog");
  const openSheet = async (text = TEXT) => {
    await submit(text);
    return screen.findByRole("dialog");
  };
  return { user, food, view, field, logButton, submit, sheet, openSheet };
}

/** The alert region is always present (so it is announced); this waits for its text. */
const expectAlert = (text: string) =>
  waitFor(() => expect(screen.getByRole("alert").textContent).toBe(text));

const itemRow = (dialog: HTMLElement, name: string) => {
  const row = within(dialog)
    .getAllByRole("listitem")
    .find((li) => li.textContent?.includes(name));
  if (!row) throw new Error(`no item row for ${name}`);
  return row;
};

const withEstimate = (): FoodPreview => {
  const preview = samplePreview();
  const [egg, berry] = preview.items;
  if (!egg || !berry) throw new Error("sample has two items");
  return {
    ...preview,
    items: [{ ...egg, estimated: true, fdcId: null }, berry],
  };
};

describe("input", () => {
  it.each(["", "   ", "\t  "])(
    "disables Log for blank or whitespace-only input %j, so no AI call is made",
    async (text) => {
      const { user, field, logButton, food } = setup();
      if (text) await user.type(field(), text);
      expect(logButton().disabled).toBe(true);
      await user.type(field(), "{Enter}");
      expect(food.parse).not.toHaveBeenCalled();
    },
  );

  it("enables Log once there is text", async () => {
    const { user, field, logButton } = setup();
    await user.type(field(), "egg");
    expect(logButton().disabled).toBe(false);
  });

  it("submits with Enter", async () => {
    const { user, field, food } = setup();
    await user.type(field(), `${TEXT}{Enter}`);
    expect(food.parse).toHaveBeenCalledWith(TEXT);
  });
});

describe("while parsing", () => {
  it("disables the field and Log and announces the busy state", async () => {
    const food = createFakeFood();
    food.holdParse();
    const { submit, field, logButton } = setup({ food });
    await submit();

    expect(field().disabled).toBe(true);
    expect(logButton().disabled).toBe(true);
    expect(
      screen.getByRole("form", { name: "Log food" }).getAttribute("aria-busy"),
    ).toBe("true");
    expect(screen.getByRole("status").textContent).toMatch(/looking up/i);
  });

  it("cannot be submitted twice", async () => {
    const food = createFakeFood();
    food.holdParse();
    const { submit } = setup({ food });
    await submit();
    fireEvent.submit(screen.getByRole("form", { name: "Log food" }));
    expect(food.parse).toHaveBeenCalledOnce();
  });

  it("clears the busy state when the preview arrives", async () => {
    const { openSheet } = setup();
    await openSheet();
    expect(
      screen.getByRole("form", { name: "Log food" }).getAttribute("aria-busy"),
    ).not.toBe("true");
  });
});

describe("the preview sheet", () => {
  it("is a labelled modal dialog", async () => {
    const { openSheet } = setup();
    const dialog = await openSheet();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(
      document.getElementById(labelId ?? "")?.textContent?.trim(),
    ).toBeTruthy();
  });

  it("shows the entry text", async () => {
    const { openSheet } = setup();
    const dialog = await openSheet();
    expect(dialog.textContent).toContain(TEXT);
  });

  it("shows each item with its grams, kcal, protein and fruit/veg grams", async () => {
    const { openSheet } = setup();
    const dialog = await openSheet();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);

    const eggs = itemRow(dialog, "2 eggs").textContent ?? "";
    expect(eggs).toContain("100 g");
    expect(eggs).toContain("143 kcal");
    expect(eggs).toContain("12.6 g protein");
    expect(eggs).toContain("0 g fruit/veg");

    const berries = itemRow(dialog, "150 g blueberries").textContent ?? "";
    expect(berries).toContain("86 kcal");
    expect(berries).toContain("1.1 g protein");
    expect(berries).toContain("150 g fruit/veg");
  });

  it("shows the entry's totals for kcal, protein and fruit/veg grams", async () => {
    const { openSheet } = setup();
    const dialog = await openSheet();
    const totals =
      within(dialog).getByRole("region", { name: "Entry total" }).textContent ??
      "";
    expect(totals).toContain("229 kcal");
    expect(totals).toContain("13.7 g protein");
    expect(totals).toContain("150 g fruit/veg");
  });

  it("marks an estimated item with the Estimated sticker and its explanation", async () => {
    const food = createFakeFood(withEstimate());
    const { openSheet } = setup({ food });
    const dialog = await openSheet();

    const eggs = itemRow(dialog, "2 eggs");
    expect(within(eggs).getByText("Estimated")).toBeTruthy();
    expect(eggs.textContent).toContain(
      "No USDA match, so this is an AI estimate.",
    );

    const berries = itemRow(dialog, "150 g blueberries");
    expect(within(berries).queryByText("Estimated")).toBeNull();
    expect(berries.textContent).not.toContain("No USDA match");
  });

  it("marks guessed grams with est. portion, separately from Estimated", async () => {
    const food = createFakeFood(withEstimate());
    const { openSheet } = setup({ food });
    const dialog = await openSheet();

    const eggs = itemRow(dialog, "2 eggs");
    expect(within(eggs).getByText("est. portion")).toBeTruthy();
    expect(within(eggs).getByText("Estimated")).toBeTruthy();
    const berries = itemRow(dialog, "150 g blueberries");
    expect(within(berries).queryByText("est. portion")).toBeNull();
  });

  it("gives every sticker text, not colour alone", async () => {
    const food = createFakeFood(withEstimate());
    const { openSheet } = setup({ food });
    const dialog = await openSheet();
    const stickers = dialog.querySelectorAll("[data-sticker]");
    // Estimated and est. portion on the eggs, fruit/veg on the blueberries.
    expect(stickers.length).toBe(3);
    for (const s of stickers) expect(s.textContent?.trim()).toBeTruthy();
  });

  it("moves focus into the sheet when it opens", async () => {
    const { openSheet } = setup();
    const dialog = await openSheet();
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
  });

  it("reaches Undo and Done from the keyboard", async () => {
    const { openSheet, user } = setup();
    const dialog = await openSheet();
    const reached = new Set<string>();
    for (let i = 0; i < 6; i++) {
      await user.tab();
      if (dialog.contains(document.activeElement)) {
        reached.add(document.activeElement?.textContent?.trim() ?? "");
      }
    }
    expect(reached).toContain("Done");
    expect(reached).toContain("Undo");
  });
});

describe("Done", () => {
  it("saves all previewed items as one entry, then closes and clears the field", async () => {
    const { openSheet, user, food, field } = setup();
    await openSheet();
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(food.save).toHaveBeenCalledOnce();
    const [saved] = food.save.mock.calls[0] ?? [];
    expect(saved?.items).toHaveLength(2);
    expect(saved?.entryId).toBe(samplePreview().entryId);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(field().value).toBe("");
    expect(document.activeElement).toBe(field());
  });

  it("counts the entry toward the local day at the moment Done is pressed", async () => {
    let clock = new Date(2026, 9, 28, 23, 59);
    const { openSheet, user, food } = setup({ now: () => clock });
    await openSheet();
    clock = new Date(2026, 9, 29, 0, 1);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(food.save.mock.calls[0]?.[1]).toBe("2026-10-29");
  });

  it("saves only once when pressed twice", async () => {
    const food = createFakeFood();
    const release = food.holdSave();
    const { openSheet, user } = setup({ food });
    await openSheet();
    const done = screen.getByRole("button", { name: "Done" });
    await user.dblClick(done);
    fireEvent.click(done);
    expect(food.save).toHaveBeenCalledOnce();
    await act(async () => release());
  });

  it("keeps the sheet open and announces an error when the save fails", async () => {
    const food = createFakeFood();
    food.failNextSave();
    const { openSheet, user } = setup({ food });
    await openSheet();
    await user.click(screen.getByRole("button", { name: "Done" }));

    await expectAlert(SAVE_FAILED);
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(food.save).toHaveBeenCalledTimes(2);
  });

  it("keeps keyboard focus on Done while saving and after a failed save", async () => {
    const food = createFakeFood();
    food.failNextSave();
    const { openSheet, user } = setup({ food });
    await openSheet();
    const done = screen.getByRole("button", { name: "Done" });
    done.focus();
    await user.keyboard("{Enter}");
    await expectAlert(SAVE_FAILED);
    expect(document.activeElement).toBe(done);
  });

  it("marks Done as unavailable while saving", async () => {
    const food = createFakeFood();
    const release = food.holdSave();
    const { openSheet, user } = setup({ food });
    await openSheet();
    const done = screen.getByRole("button", { name: "Done" });
    await user.click(done);
    expect(done.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(done);
    await act(async () => release());
  });
});

describe("closing without saving", () => {
  const expectBackToField = async (
    food: FakeFood,
    field: () => HTMLInputElement,
  ) => {
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(food.save).not.toHaveBeenCalled();
    expect(field().value).toBe(TEXT);
    expect(field().disabled).toBe(false);
    expect(document.activeElement).toBe(field());
  };

  it("Undo saves nothing and returns to the field with the text intact", async () => {
    const { openSheet, user, food, field } = setup();
    await openSheet();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await expectBackToField(food, field);
  });

  it("Escape acts as Undo", async () => {
    const { openSheet, user, food, field } = setup();
    await openSheet();
    await user.keyboard("{Escape}");
    await expectBackToField(food, field);
  });

  it("the dialog's own cancel event acts as Undo", async () => {
    const { openSheet, food, field } = setup();
    const dialog = await openSheet();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await expectBackToField(food, field);
  });

  it("the back button acts as Undo", async () => {
    const { openSheet, food, field } = setup();
    await openSheet();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expectBackToField(food, field);
  });

  it("swiping the sheet down acts as Undo", async () => {
    const { openSheet, food, field } = setup();
    const dialog = await openSheet();
    fireEvent.pointerDown(dialog, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(dialog, { pointerId: 1, clientY: 260 });
    fireEvent.pointerUp(dialog, { pointerId: 1, clientY: 260 });
    await expectBackToField(food, field);
  });

  it("a short drag does not close the sheet", async () => {
    const { openSheet } = setup();
    const dialog = await openSheet();
    fireEvent.pointerDown(dialog, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(dialog, { pointerId: 1, clientY: 120 });
    fireEvent.pointerUp(dialog, { pointerId: 1, clientY: 120 });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closing the app with the sheet open saves nothing", async () => {
    const { openSheet, food, view } = setup();
    await openSheet();
    view.unmount();
    expect(food.save).not.toHaveBeenCalled();
  });

  it("Undo makes no call, so the lookups it cached stay cached", async () => {
    const { openSheet, user, food } = setup();
    await openSheet();
    food.parse.mockClear();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(food.parse).not.toHaveBeenCalled();
    expect(food.save).not.toHaveBeenCalled();
  });

  it("a resubmit after Undo parses again", async () => {
    const { openSheet, user, food, logButton } = setup();
    await openSheet();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await user.click(logButton());
    expect(food.parse).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});

describe("failures", () => {
  it("shows the no-food message, keeps the text and saves nothing", async () => {
    const food = createFakeFood();
    food.respondWith({ ok: false, reason: "no_food" });
    const { submit, field } = setup({ food });
    await submit("hello there");

    await expectAlert(NO_FOOD);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(field().value).toBe("hello there");
    expect(field().disabled).toBe(false);
    expect(food.save).not.toHaveBeenCalled();
  });

  it("shows a retry message for a failed lookup, keeps the text and saves nothing", async () => {
    const food = createFakeFood();
    food.respondWith({ ok: false, reason: "failed" });
    const { submit, field, logButton } = setup({ food });
    await submit();

    await expectAlert(LOOKUP_FAILED);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(field().value).toBe(TEXT);
    expect(logButton().disabled).toBe(false);
    expect(food.save).not.toHaveBeenCalled();
  });

  it("announces errors through a live region that exists before the error", async () => {
    const food = createFakeFood();
    food.respondWith({ ok: false, reason: "failed" });
    const { submit } = setup({ food });
    const live = screen.getByRole("alert");
    expect(live).toBeTruthy();
    await submit();
    await waitFor(() => expect(live?.textContent).toBe(LOOKUP_FAILED));
  });

  it("clears the error on the next submit", async () => {
    const food = createFakeFood();
    food.respondWith({ ok: false, reason: "failed" });
    const { submit, user, logButton } = setup({ food });
    await submit();
    await expectAlert(LOOKUP_FAILED);
    food.respondWith({ ok: true, preview: samplePreview() });
    await user.click(logButton());
    await screen.findByRole("dialog");
    expect(screen.queryByText(LOOKUP_FAILED)).toBeNull();
  });
});
