import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeFood } from "../food/fake-food";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import {
  figure,
  headingText,
  loaded,
  pillar,
  prevDay,
  renderToday,
  setNow,
} from "./test-utils";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const yogurt = sampleItem({
  name: "Chobani plain greek yogurt",
  canonicalName: "plain greek yogurt",
  brand: "Chobani",
  grams: 170,
  kcal: 100,
  protein: 17,
  kcalPer100g: 59,
  proteinPer100g: 10,
  estimated: true,
  portionEstimated: true,
  fdcId: null,
  source: "estimated",
});
const LABEL = "Chobani Plain greek yogurt";

const days = () =>
  createFakeEntries({
    "2026-10-29": [
      sampleEntry({
        id: "old",
        at: [2026, 10, 29, 9, 0],
        items: [sampleItem({ kcal: 300 }), { ...yogurt, position: 1 }],
      }),
    ],
    "2026-10-30": [
      sampleEntry({ id: "e1", at: [2026, 10, 30, 8, 0], items: [yogurt] }),
    ],
  });

const setup = async (
  { food = createFakeFood(), entries = days() } = {},
  at: [number, number, number, number, number] = [2026, 10, 30, 12, 0],
) => {
  setNow(...at);
  const user = userEvent.setup();
  renderToday({ entries, food });
  await loaded();
  return { user, food, entries };
};

const openRow = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole("button", { expanded: false, name: /Chobani/ }),
  );
  return screen.getByRole("button", { name: `Log ${LABEL} now` });
};

const setOnline = (online: boolean) => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
};

const composer = () =>
  screen.getByRole("textbox", {
    name: "What did you eat?",
  }) as HTMLTextAreaElement;

describe("Log now button", () => {
  it("shows in an open row's panel beside Delete, named for the item, on today", async () => {
    const { user } = await setup();
    expect(screen.queryByRole("button", { name: /Log .* now/ })).toBeNull();
    const button = await openRow(user);
    expect(button.textContent).toBe("Log now");
    expect(
      screen.getByRole("button", { name: `Delete ${LABEL}` }),
    ).toBeTruthy();
  });

  it("shows on a past day too", async () => {
    const { user } = await setup();
    await user.click(prevDay());
    await screen.findAllByText(LABEL);
    await user.click(
      screen.getByRole("button", { expanded: false, name: /Chobani/ }),
    );
    expect(
      screen.getByRole("button", { name: `Log ${LABEL} now` }),
    ).toBeTruthy();
  });

  it("is disabled offline, with the offline note", async () => {
    const { user } = await setup();
    const button = await openRow(user);
    setOnline(false);
    await screen.findByText("You're offline");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("is disabled while a lookup is running", async () => {
    const food = createFakeFood();
    const release = food.holdParse();
    const { user } = await setup({ food });
    const button = await openRow(user);
    await user.type(composer(), "toast{Control>}{Enter}{/Control}");
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(true),
    );
    act(() => release());
    await screen.findByRole("dialog");
  });

  it("is hidden while the Delete confirmation shows, and returns when it is cancelled", async () => {
    const { user } = await setup();
    await openRow(user);
    await user.click(screen.getByRole("button", { name: `Delete ${LABEL}` }));
    expect(
      screen.queryByRole("button", { name: `Log ${LABEL} now` }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("button", { name: `Log ${LABEL} now` }),
    ).toBeTruthy();
  });
});

describe("Log now preview", () => {
  it("opens the sheet with that one item and its saved values, without parsing", async () => {
    const { user, food } = await setup();
    await user.click(await openRow(user));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Check 1 item")).toBeTruthy();
    expect(within(dialog).getByText(LABEL)).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: `Grams of ${LABEL}`,
        }) as HTMLInputElement
      ).value,
    ).toBe("170");
    expect(within(dialog).getByText("Estimated")).toBeTruthy();
    expect(within(dialog).getByText("est. portion")).toBeTruthy();
    expect(food.parse).not.toHaveBeenCalled();
  });

  it("is for the device's current day when another day is viewed, with that day's pillars plus the item", async () => {
    const { user } = await setup();
    await user.click(prevDay());
    await screen.findAllByText(LABEL);
    await user.click(
      screen.getByRole("button", { expanded: false, name: /Chobani/ }),
    );
    await user.click(screen.getByRole("button", { name: `Log ${LABEL} now` }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("For Fri, Oct 30")).toBeTruthy();
    // Today's 100 kcal plus the item's 100.
    await waitFor(() => expect(figure(pillar("calories", dialog))).toBe("200"));
  });

  it("recomputes from per-100 g values when grams change, and clears est. portion", async () => {
    const { user } = await setup();
    await user.click(await openRow(user));
    const dialog = await screen.findByRole("dialog");
    const grams = within(dialog).getByRole("textbox", {
      name: `Grams of ${LABEL}`,
    });
    await user.clear(grams);
    await user.type(grams, "100");
    expect(within(dialog).getAllByText("59 kcal").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("est. portion")).toBeNull();
  });

  it("leaves the composer text alone when the sheet opens and closes", async () => {
    const { user } = await setup();
    await user.type(composer(), "half-typed");
    await user.click(await openRow(user));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(composer().value).toBe("half-typed");
  });
});

describe("Log now save", () => {
  it("saves a reused copy for today with the label as its text and a fixed new entry id", async () => {
    const { user, food } = await setup();
    await user.click(await openRow(user));
    await user.click(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(food.save).toHaveBeenCalledTimes(1);
    const [preview, day, origin] = food.save.mock.calls[0] ?? [];
    expect(day).toBe("2026-10-30");
    expect(origin).toBe("reused");
    expect(preview?.text).toBe(LABEL);
    expect(preview?.entryId).not.toBe("e1");
    expect(preview?.items[0]).toMatchObject({
      kcalPer100g: 59,
      brand: "Chobani",
      source: "estimated",
      estimated: true,
    });
    expect(preview?.items[0]).not.toHaveProperty("parsedGrams");
  });

  it("keeps the sheet and edits after a failed save, and retries with the same entry id", async () => {
    const food = createFakeFood();
    food.failNextSave("network");
    const { user } = await setup({ food });
    await user.click(await openRow(user));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await within(dialog).findByText(/Couldn't save that/);
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(food.save.mock.calls[1]?.[0].entryId).toBe(
      food.save.mock.calls[0]?.[0].entryId,
    );
  });
});

describe("Log now exit", () => {
  it("after Done on today: closes, adds the entry and its pillars, keeps the row open and returns focus to the button", async () => {
    const { user } = await setup();
    await user.click(await openRow(user));
    await user.click(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getAllByText(LABEL)).toHaveLength(2);
    expect(figure(pillar("calories"))).toBe("200");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: `Log ${LABEL} now` }),
      ),
    );
    expect(document.activeElement).not.toBe(composer());
  });

  it("after Done on a past day: stays on that day with its journal and pillars unchanged", async () => {
    const { user } = await setup();
    await user.click(prevDay());
    await screen.findAllByText(LABEL);
    const before = figure(pillar("calories"));
    await user.click(
      screen.getByRole("button", { expanded: false, name: /Chobani/ }),
    );
    await user.click(screen.getByRole("button", { name: `Log ${LABEL} now` }));
    await user.click(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(headingText()).toBe("Thu, Oct 29");
    expect(figure(pillar("calories"))).toBe(before);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: `Log ${LABEL} now` }),
      ),
    );
  });

  it("shows a status line with the time, which updates on a repeat and goes when the row closes", async () => {
    const { user } = await setup();
    await user.click(await openRow(user));
    await user.click(await screen.findByRole("button", { name: "Done" }));
    const status = await screen.findByText(/^Logged today at /);
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toMatch(/12:00/);
    vi.setSystemTime(new Date(2026, 9, 30, 12, 7));
    await user.click(screen.getByRole("button", { name: `Log ${LABEL} now` }));
    await user.click(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.getByText(/^Logged today at /).textContent).toMatch(
        /12:07/,
      ),
    );
    await user.click(
      screen.getAllByRole("button", { expanded: true })[0] as HTMLElement,
    );
    expect(screen.queryByText(/^Logged today at /)).toBeNull();
  });

  it("names the sheet's day in the status line when midnight passed while it was open", async () => {
    const { user, food } = await setup({}, [2026, 10, 30, 23, 59]);
    await user.click(await openRow(user));
    await screen.findByRole("dialog");
    vi.setSystemTime(new Date(2026, 9, 31, 0, 1));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(food.save.mock.calls[0]?.[1]).toBe("2026-10-30");
    expect(screen.queryByText(/^Logged today at /)).toBeNull();
    expect(screen.getByText(/^Logged .*Oct.* at /)).toBeTruthy();
  });

  it.each([
    [
      "Undo",
      async (u: ReturnType<typeof userEvent.setup>) =>
        u.click(screen.getByRole("button", { name: "Undo" })),
    ],
    [
      "Escape",
      async (u: ReturnType<typeof userEvent.setup>) => u.keyboard("{Escape}"),
    ],
  ])(
    "%s saves nothing, keeps the row open and returns focus to Log now",
    async (_name, close) => {
      const { user, food } = await setup();
      await user.click(await openRow(user));
      await screen.findByRole("dialog");
      await close(user);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(food.save).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole("button", { name: `Log ${LABEL} now` }),
        ),
      );
      expect(screen.queryByText(/^Logged today at /)).toBeNull();
    },
  );

  it("drops the sheet and shows the sign-in prompt when the session expired, as a typed entry does", async () => {
    const food = createFakeFood();
    food.failNextSave("session");
    const { user } = await setup({ food });
    await user.click(await openRow(user));
    await user.click(await screen.findByRole("button", { name: "Done" }));
    await screen.findByText("Your session expired. Sign in again.");
    expect(screen.queryByRole("dialog")).toBeNull();
    // Focus does not fall to <body> when the sheet goes.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: `Log ${LABEL} now` }),
      ),
    );
  });
});
