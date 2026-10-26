import { describe, expect, it, vi } from "vitest";
import {
  createSupabaseTargetsStore,
  type TargetsDb,
  type TargetsRow,
} from "./targets-store";

type Result<T> = { data: T; error: { message: string } | null };

function fakeDb(opts: {
  row?: TargetsRow | null;
  loadError?: string;
  saveError?: string;
}) {
  const maybeSingle = vi.fn(
    async (): Promise<Result<TargetsRow | null>> => ({
      data: opts.row ?? null,
      error: opts.loadError ? { message: opts.loadError } : null,
    }),
  );
  const select = vi.fn((_columns: string) => ({ maybeSingle }));
  const upsert = vi.fn(async (_values: Partial<TargetsRow>) => ({
    error: opts.saveError ? { message: opts.saveError } : null,
  }));
  const from = vi.fn((_table: "user_targets") => ({ select, upsert }));
  return { db: { from } satisfies TargetsDb, from, select, upsert };
}

describe("createSupabaseTargetsStore.load", () => {
  it("reads the user's row from user_targets and maps it", async () => {
    const { db, from } = fakeDb({
      row: {
        calories_kcal: 2000,
        protein_g: null,
        fruit_veg_g: 500,
        fruit_veg_edited: true,
      },
    });
    await expect(createSupabaseTargetsStore(db).load()).resolves.toEqual({
      calories: 2000,
      protein: null,
      fruitVeg: 500,
      fruitVegEdited: true,
    });
    expect(from).toHaveBeenCalledWith("user_targets");
  });

  it("returns null for a user with no row", async () => {
    const { db } = fakeDb({ row: null });
    await expect(createSupabaseTargetsStore(db).load()).resolves.toBeNull();
  });

  it("rejects when the read fails", async () => {
    const { db } = fakeDb({ loadError: "boom" });
    await expect(createSupabaseTargetsStore(db).load()).rejects.toThrow("boom");
  });
});

describe("createSupabaseTargetsStore.save", () => {
  it("upserts only the changed column", async () => {
    const { db, upsert } = fakeDb({});
    const store = createSupabaseTargetsStore(db);
    await store.save("protein", 120);
    await store.save("calories", null);
    expect(upsert.mock.calls).toEqual([
      [{ protein_g: 120 }],
      [{ calories_kcal: null }],
    ]);
  });

  it("marks fruit/veg as edited, including when it is cleared", async () => {
    const { db, upsert } = fakeDb({});
    const store = createSupabaseTargetsStore(db);
    await store.save("fruitVeg", 600);
    await store.save("fruitVeg", null);
    expect(upsert.mock.calls).toEqual([
      [{ fruit_veg_g: 600, fruit_veg_edited: true }],
      [{ fruit_veg_g: null, fruit_veg_edited: true }],
    ]);
  });

  it("rejects when the write fails", async () => {
    const { db } = fakeDb({ saveError: "denied" });
    await expect(
      createSupabaseTargetsStore(db).save("protein", 1),
    ).rejects.toThrow("denied");
  });
});
