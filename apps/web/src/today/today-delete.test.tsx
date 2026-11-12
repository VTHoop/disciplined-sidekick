import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import {
  figure,
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

const eggs = sampleItem({
  position: 0,
  name: "2 eggs",
  kcal: 143,
  protein: 12,
});
const toast = sampleItem({
  position: 1,
  name: "toast",
  canonicalName: "bread, toasted",
  kcal: 80,
  protein: 3,
});

const twoItemDay = () =>
  createFakeEntries({
    "2026-10-30": [sampleEntry({ id: "e1", items: [eggs, toast] })],
  });

const setup = async (entries = twoItemDay()) => {
  setNow(2026, 10, 30);
  const user = userEvent.setup();
  renderToday({ entries });
  await loaded();
  return { entries, user };
};

const itemNames = () =>
  [...document.querySelectorAll("[data-item-name]")].map((e) => e.textContent);

const row = (name: string) => {
  const item = [...document.querySelectorAll<HTMLElement>("[data-item]")].find(
    (i) => i.querySelector("[data-item-name]")?.textContent === name,
  );
  return item?.querySelector("button[aria-expanded]") as HTMLButtonElement;
};

const openRow = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(row(name));

const deleteButton = (name: string) =>
  screen.getByRole("button", { name: `Delete ${name}` }) as HTMLButtonElement;

const setOnline = (online: boolean) => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  window.dispatchEvent(new Event(online ? "online" : "offline"));
};

describe("deleting a logged item", () => {
  it("shows no delete control until a row is opened, and then only that row's, named for the food", async () => {
    const { user } = await setup();
    expect(screen.queryAllByRole("button", { name: /^Delete/ })).toHaveLength(
      0,
    );
    await openRow(user, "2 eggs");
    expect(screen.getAllByRole("button", { name: /^Delete/ })).toHaveLength(1);
    expect(deleteButton("2 eggs")).toBeTruthy();
  });

  it("opens a row on a tap and closes it on the next, flipping the chevron's state", async () => {
    const { user } = await setup();
    const eggsRow = row("2 eggs");
    expect(eggsRow.getAttribute("aria-expanded")).toBe("false");
    expect(eggsRow.querySelector("[data-chevron]")).not.toBeNull();
    await user.click(eggsRow);
    expect(eggsRow.getAttribute("aria-expanded")).toBe("true");
    expect(deleteButton("2 eggs")).toBeTruthy();
    await user.click(eggsRow);
    expect(eggsRow.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
  });

  it("keeps one row open across the whole journal, and counts a closed confirmation as cancelled", async () => {
    const { user } = await setup(
      createFakeEntries({
        "2026-10-30": [
          sampleEntry({ id: "e1", at: [2026, 10, 30, 8, 0], items: [eggs] }),
          sampleEntry({ id: "e2", at: [2026, 10, 30, 9, 0], items: [toast] }),
        ],
      }),
    );
    await openRow(user, "2 eggs");
    await openRow(user, "toast");
    expect(row("2 eggs").getAttribute("aria-expanded")).toBe("false");
    expect(row("toast").getAttribute("aria-expanded")).toBe("true");
    await user.click(deleteButton("toast"));
    expect(screen.getByRole("button", { name: "Yes, delete" })).toBeTruthy();
    await openRow(user, "2 eggs");
    expect(row("toast").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Yes, delete" })).toBeNull();
    await openRow(user, "toast");
    expect(screen.queryByRole("button", { name: "Yes, delete" })).toBeNull();
    expect(deleteButton("toast")).toBeTruthy();
  });

  it("updates the entry's total kcal as soon as an item is deleted", async () => {
    const { user } = await setup();
    const heading = () => screen.getByRole("heading", { level: 3 }).textContent;
    expect(heading()).toContain("223 kcal");
    await openRow(user, "2 eggs");
    await user.click(deleteButton("2 eggs"));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(heading()).toContain("80 kcal"));
  });

  it("asks once, and cancelling leaves the item untouched", async () => {
    const { entries, user } = await setup();
    await openRow(user, "2 eggs");
    await user.click(deleteButton("2 eggs"));
    expect(screen.getByRole("button", { name: "Yes, delete" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteButton("2 eggs")).toBeTruthy();
    expect(entries.deleteItem).not.toHaveBeenCalled();
    expect(itemNames()).toContain("2 eggs");
    expect(figure(pillar("calories"))).toBe("223");
  });

  it("removes the item and updates the pillars once confirmed, with no Undo", async () => {
    const { entries, user } = await setup();
    await openRow(user, "2 eggs");
    await user.click(deleteButton("2 eggs"));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(entries.deleteItem).toHaveBeenCalledWith("e1", 0);
    await waitFor(() => expect(itemNames()).not.toContain("2 eggs"));
    expect(figure(pillar("calories"))).toBe("80");
    expect(figure(pillar("protein"))).toBe("3");
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
  });

  it("removes the entry when its last item goes", async () => {
    const { user } = await setup(
      createFakeEntries({
        "2026-10-30": [sampleEntry({ id: "e1", items: [eggs] })],
      }),
    );
    await openRow(user, "2 eggs");
    await user.click(deleteButton("2 eggs"));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() =>
      expect(screen.getByText(/Nothing logged yet/)).toBeTruthy(),
    );
    expect(document.querySelector("[data-entry]")).toBeNull();
    expect(figure(pillar("calories"))).toBe("0");
  });

  it("stays gone when the day is loaded again (persistence itself is proved by check-food.sh)", async () => {
    const { entries, user } = await setup();
    await openRow(user, "2 eggs");
    await user.click(deleteButton("2 eggs"));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(itemNames()).not.toContain("2 eggs"));
    expect((await entries.load("2026-10-30"))[0]?.items).toHaveLength(1);
  });

  it("keeps the item and totals and shows a danger error when the delete fails", async () => {
    const { entries, user } = await setup();
    entries.failNextDelete();
    await openRow(user, "2 eggs");
    await user.click(deleteButton("2 eggs"));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    const alert = (await screen.findAllByRole("alert")).find((a) =>
      /Couldn't delete 2 eggs/.test(a.textContent ?? ""),
    );
    expect(alert?.className).toMatch(/food-item-error/);
    expect(row("2 eggs").getAttribute("aria-expanded")).toBe("true");
    expect(itemNames()).toContain("2 eggs");
    expect(figure(pillar("calories"))).toBe("223");
  });

  it("opens rows offline, with Delete disabled and a note, and queues nothing", async () => {
    const { entries, user } = await setup();
    setOnline(false);
    await screen.findByText("You're offline");
    await openRow(user, "2 eggs");
    expect(row("2 eggs").getAttribute("aria-expanded")).toBe("true");
    const button = deleteButton("2 eggs");
    expect(button.disabled).toBe(true);
    await user.click(button);
    expect(entries.deleteItem).not.toHaveBeenCalled();
    setOnline(true);
    await waitFor(() => expect(deleteButton("2 eggs").disabled).toBe(false));
    expect(screen.queryByText("You're offline")).toBeNull();
    expect(entries.deleteItem).not.toHaveBeenCalled();
  });
});

describe("deleting from the keyboard", () => {
  it("opens with Enter keeping focus on the row, makes Delete the next Tab stop, and Escape closes", async () => {
    const { user } = await setup();
    row("2 eggs").focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(row("2 eggs"));
    await user.tab();
    expect(document.activeElement).toBe(deleteButton("2 eggs"));
    await user.keyboard("{Escape}");
    expect(row("2 eggs").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(row("2 eggs"));
  });

  it("confirms with Enter; Escape cancels to Delete, and a second Escape closes the row", async () => {
    const { entries, user } = await setup();
    await openRow(user, "2 eggs");
    deleteButton("2 eggs").focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Yes, delete" }),
    );
    await user.keyboard("{Escape}");
    expect(entries.deleteItem).not.toHaveBeenCalled();
    expect(row("2 eggs").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(deleteButton("2 eggs"));
    await user.keyboard("{Escape}");
    expect(row("2 eggs").getAttribute("aria-expanded")).toBe("false");
    await openRow(user, "2 eggs");
    await user.click(deleteButton("2 eggs"));
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(entries.deleteItem).toHaveBeenCalledWith("e1", 0),
    );
  });

  it("moves focus to the next item after the row leaves", async () => {
    const { user } = await setup();
    await openRow(user, "2 eggs");
    await user.click(deleteButton("2 eggs"));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(document.activeElement).toBe(row("toast")));
  });

  it("moves focus to the previous item when the last one goes", async () => {
    const { user } = await setup();
    await openRow(user, "toast");
    await user.click(deleteButton("toast"));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(document.activeElement).toBe(row("2 eggs")));
  });

  it("moves focus to the entry list when nothing is left", async () => {
    const { user } = await setup(
      createFakeEntries({
        "2026-10-30": [sampleEntry({ id: "e1", items: [eggs] })],
      }),
    );
    await openRow(user, "2 eggs");
    await user.click(deleteButton("2 eggs"));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Food journal" }),
      ),
    );
  });

  it("scopes the confirmation to its own item", async () => {
    await setup();
    fireEvent.click(row("toast"));
    fireEvent.click(screen.getByRole("button", { name: "Delete toast" }));
    const group = screen.getByRole("group", { name: /toast/i });
    expect(within(group).getByRole("button", { name: "Cancel" })).toBeTruthy();
  });
});

describe("deleting: focus and motion", () => {
  it("returns focus to the delete control after a failed delete", async () => {
    const { entries, user } = await setup();
    entries.failNextDelete();
    await openRow(user, "2 eggs");
    await user.click(deleteButton("2 eggs"));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await screen.findAllByRole("alert");
    await waitFor(() =>
      expect(document.activeElement).toBe(deleteButton("2 eggs")),
    );
  });

  it("removes the row with no wait under reduced motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { user } = await setup();
    await openRow(user, "2 eggs");
    await user.click(deleteButton("2 eggs"));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(itemNames()).not.toContain("2 eggs"), {
      timeout: 100,
    });
  });

  it("keeps the leaving row for 160 ms when motion is allowed", async () => {
    const { user } = await setup();
    await openRow(user, "2 eggs");
    await user.click(deleteButton("2 eggs"));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(itemNames()).toContain("2 eggs");
    await waitFor(() => expect(itemNames()).not.toContain("2 eggs"));
  });
});

describe("deleting on a past day", () => {
  const pastDay = () =>
    createFakeEntries({
      "2026-10-29": [
        sampleEntry({
          id: "p1",
          at: [2026, 10, 29, 19, 0],
          items: [eggs, toast],
        }),
      ],
    });

  it("asks the same question, removes the item and drops it from that day's pillars", async () => {
    setNow(2026, 10, 30);
    const entries = pastDay();
    renderToday({ entries });
    await loaded();
    const user = userEvent.setup();
    await user.click(prevDay());
    await screen.findByText("toast");
    expect(figure(pillar("calories"))).toBe("223");
    await openRow(user, "toast");
    await user.click(deleteButton("toast"));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(entries.deleteItem).toHaveBeenCalledWith("p1", 1);
    await waitFor(() => expect(itemNames()).toEqual(["2 eggs"]));
    expect(figure(pillar("calories"))).toBe("143");
  });

  it("is disabled offline", async () => {
    setNow(2026, 10, 30);
    renderToday({ entries: pastDay() });
    await loaded();
    const user = userEvent.setup();
    await user.click(prevDay());
    await screen.findByText("toast");
    await user.click(row("toast"));
    setOnline(false);
    await waitFor(() => expect(deleteButton("toast").disabled).toBe(true));
  });
});
