import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import {
  figure,
  loaded,
  pillar,
  renderToday,
  setNow,
} from "./test-utils";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const eggs = sampleItem({ position: 0, name: "2 eggs", kcal: 143, protein: 12 });
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

const setOnline = (online: boolean) => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  window.dispatchEvent(new Event(online ? "online" : "offline"));
};

describe("deleting a logged item", () => {
  it("gives each item a delete control named for the food, and no entry-level one", async () => {
    await setup();
    expect(screen.getByRole("button", { name: "Delete 2 eggs" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete toast" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Delete/ })).toHaveLength(2);
  });

  it("asks once, and cancelling leaves the item untouched", async () => {
    const { entries, user } = await setup();
    await user.click(screen.getByRole("button", { name: "Delete 2 eggs" }));
    expect(screen.getByRole("button", { name: "Yes, delete" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(entries.deleteItem).not.toHaveBeenCalled();
    expect(screen.getByText("2 eggs")).toBeTruthy();
    expect(figure(pillar("calories"))).toBe("223");
  });

  it("removes the item and updates the pillars once confirmed, with no Undo", async () => {
    const { entries, user } = await setup();
    await user.click(screen.getByRole("button", { name: "Delete 2 eggs" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(entries.deleteItem).toHaveBeenCalledWith("e1", 0);
    await waitFor(() => expect(screen.queryByText("2 eggs")).toBeNull());
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
    await user.click(screen.getByRole("button", { name: "Delete 2 eggs" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() =>
      expect(screen.getByText(/Nothing logged yet/)).toBeTruthy(),
    );
    expect(document.querySelector("[data-entry]")).toBeNull();
    expect(figure(pillar("calories"))).toBe("0");
  });

  it("stays gone after a reload", async () => {
    const { entries, user } = await setup();
    await user.click(screen.getByRole("button", { name: "Delete 2 eggs" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByText("2 eggs")).toBeNull());
    expect((await entries.load("2026-10-30"))[0]?.items).toHaveLength(1);
  });

  it("keeps the item and totals and shows a danger error when the delete fails", async () => {
    const { entries, user } = await setup();
    entries.failNextDelete();
    await user.click(screen.getByRole("button", { name: "Delete 2 eggs" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Couldn't delete 2 eggs/);
    expect(alert.className).toMatch(/danger/);
    expect(screen.getByText("2 eggs")).toBeTruthy();
    expect(figure(pillar("calories"))).toBe("223");
  });

  it("disables the control offline with a note, and queues nothing", async () => {
    const { entries, user } = await setup();
    setOnline(false);
    const button = await screen.findByRole("button", { name: "Delete 2 eggs" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("You're offline")).toBeTruthy();
    await user.click(button);
    expect(entries.deleteItem).not.toHaveBeenCalled();
    setOnline(true);
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Delete 2 eggs" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(screen.queryByText("You're offline")).toBeNull();
    expect(entries.deleteItem).not.toHaveBeenCalled();
  });
});

describe("deleting from the keyboard", () => {
  it("opens the confirmation, confirms with Enter and cancels with Escape", async () => {
    const { entries, user } = await setup();
    screen.getByRole("button", { name: "Delete 2 eggs" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Escape}");
    expect(entries.deleteItem).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Delete 2 eggs" }),
    );
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Yes, delete" }),
    );
    await user.keyboard("{Enter}");
    await waitFor(() => expect(entries.deleteItem).toHaveBeenCalledWith("e1", 0));
  });

  it("moves focus to the next item after the row leaves", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Delete 2 eggs" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Delete toast" }),
      ),
    );
  });

  it("moves focus to the previous item when the last one goes", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Delete toast" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Delete 2 eggs" }),
      ),
    );
  });

  it("moves focus to the entry list when nothing is left", async () => {
    const { user } = await setup(
      createFakeEntries({
        "2026-10-30": [sampleEntry({ id: "e1", items: [eggs] })],
      }),
    );
    await user.click(screen.getByRole("button", { name: "Delete 2 eggs" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Logged today" }),
      ),
    );
  });

  it("scopes the confirmation to its own item", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete toast" }));
    const group = screen.getByRole("group", { name: /toast/i });
    expect(within(group).getByRole("button", { name: "Cancel" })).toBeTruthy();
  });
});
