import { describe, expect, it, vi } from "vitest";
import { createSupabaseEntriesStore, type EntriesDb } from "./entries-store";

const row = (id: string, loggedAt: string, items: object[]) => ({
  id,
  text: `text ${id}`,
  logged_at: loggedAt,
  food_items: items,
});

const item = (position: number, name: string) => ({
  position,
  name,
  canonical_name: `canon ${name}`,
  grams: 100,
  kcal: 143.5,
  protein_g: 12.5,
  fruit_veg_g: 70,
  estimated: true,
  portion_estimated: false,
  brand: "Chobani",
});

function fakeDb(result: { data: unknown; error: { message: string } | null }) {
  const eq = vi.fn(async () => result);
  const select = vi.fn((_columns: string) => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { db: { from } as unknown as EntriesDb, from, select, eq };
}

describe("createSupabaseEntriesStore", () => {
  it("reads the entries of one local day with their items", async () => {
    const { db, from, select, eq } = fakeDb({ data: [], error: null });
    await createSupabaseEntriesStore(db).load("2026-10-30");
    expect(from).toHaveBeenCalledWith("food_entries");
    expect(select.mock.calls[0]?.[0]).toMatch(/food_items\(/);
    expect(eq).toHaveBeenCalledWith("local_date", "2026-10-30");
  });

  it("maps rows to entries and keeps items in saved order", async () => {
    const { db } = fakeDb({
      data: [
        row("a", "2026-10-30T16:00:00Z", [item(1, "second"), item(0, "first")]),
      ],
      error: null,
    });
    const [entry] = await createSupabaseEntriesStore(db).load("2026-10-30");
    expect(entry).toMatchObject({
      id: "a",
      text: "text a",
      loggedAt: "2026-10-30T16:00:00Z",
    });
    expect(entry?.items.map((i) => i.name)).toEqual(["first", "second"]);
    expect(entry?.items[0]).toEqual({
      position: 0,
      name: "first",
      canonicalName: "canon first",
      grams: 100,
      kcal: 143.5,
      protein: 12.5,
      fruitVegG: 70,
      estimated: true,
      portionEstimated: false,
      brand: "Chobani",
    });
  });

  it("rejects when the read fails, so a failure is never an empty day", async () => {
    const { db } = fakeDb({ data: null, error: { message: "boom" } });
    await expect(
      createSupabaseEntriesStore(db).load("2026-10-30"),
    ).rejects.toThrow("boom");
  });

  it("deletes one item by entry and position, with the user's own rows only", async () => {
    const second = vi.fn(async () => ({ error: null }));
    const first = vi.fn(() => ({ eq: second }));
    const del = vi.fn(() => ({ eq: first }));
    const from = vi.fn(() => ({ delete: del }));
    await createSupabaseEntriesStore({ from } as unknown as EntriesDb).deleteItem(
      "e1",
      2,
    );
    expect(from).toHaveBeenCalledWith("food_items");
    expect(first).toHaveBeenCalledWith("entry_id", "e1");
    expect(second).toHaveBeenCalledWith("position", 2);
  });

  it("rejects when the delete fails", async () => {
    const eq2 = vi.fn(async () => ({ error: { message: "nope" } }));
    const db = {
      from: () => ({ delete: () => ({ eq: () => ({ eq: eq2 }) }) }),
    } as unknown as EntriesDb;
    await expect(createSupabaseEntriesStore(db).deleteItem("e1", 0)).rejects.toThrow(
      "nope",
    );
  });
});
