import { describe, expect, it, vi } from "vitest";
import {
  createSupabaseTargetsStore,
  type TargetsDb,
  type TargetsRow,
} from "./targets-store";

type Result<T> = {
  data: T;
  error: { message: string; code?: string } | null;
  status?: number;
};

function fakeDb(opts: {
  row?: TargetsRow | null;
  loadError?: string;
  saveError?: string;
  code?: string;
  status?: number;
}) {
  const maybeSingle = vi.fn(
    async (): Promise<Result<TargetsRow | null>> => ({
      data: opts.row ?? null,
      error: opts.loadError
        ? { message: opts.loadError, code: opts.code }
        : null,
      status: opts.status,
    }),
  );
  const select = vi.fn((_columns: string) => ({ maybeSingle }));
  const upsert = vi.fn(async (_values: Partial<TargetsRow>) => ({
    error: opts.saveError ? { message: opts.saveError, code: opts.code } : null,
    status: opts.status,
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
    await expect(
      createSupabaseTargetsStore(db, vi.fn()).load(),
    ).resolves.toEqual({
      calories: 2000,
      protein: null,
      fruitVeg: 500,
      fruitVegEdited: true,
    });
    expect(from).toHaveBeenCalledWith("user_targets");
  });

  it("returns null for a user with no row", async () => {
    const { db } = fakeDb({ row: null });
    await expect(
      createSupabaseTargetsStore(db, vi.fn()).load(),
    ).resolves.toBeNull();
  });

  it("rejects when the read fails", async () => {
    const { db } = fakeDb({ loadError: "boom" });
    await expect(
      createSupabaseTargetsStore(db, vi.fn()).load(),
    ).rejects.toThrow("boom");
  });
});

describe("createSupabaseTargetsStore.save", () => {
  it("upserts only the changed column", async () => {
    const { db, upsert } = fakeDb({});
    const store = createSupabaseTargetsStore(db, vi.fn());
    await store.save("protein", 120);
    await store.save("calories", null);
    expect(upsert.mock.calls).toEqual([
      [{ protein_g: 120 }],
      [{ calories_kcal: null }],
    ]);
  });

  it("marks fruit/veg as edited, including when it is cleared", async () => {
    const { db, upsert } = fakeDb({});
    const store = createSupabaseTargetsStore(db, vi.fn());
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
      createSupabaseTargetsStore(db, vi.fn()).save("protein", 1),
    ).rejects.toThrow("denied");
  });
});

describe("createSupabaseTargetsStore: recording failures", () => {
  it("records a failed read as load_targets, with its code and status, and still rejects", async () => {
    const { db } = fakeDb({ loadError: "boom", code: "57014", status: 500 });
    const record = vi.fn();
    await expect(createSupabaseTargetsStore(db, record).load()).rejects.toThrow(
      "boom",
    );
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      "load_targets",
      expect.objectContaining({ message: "boom", code: "57014", status: 500 }),
    );
  });

  it("records a failed write as save_targets, once per failed attempt", async () => {
    const { db } = fakeDb({ saveError: "denied", status: 0 });
    const record = vi.fn();
    const store = createSupabaseTargetsStore(db, record);
    await expect(store.save("protein", 1)).rejects.toThrow("denied");
    await expect(store.save("protein", 1)).rejects.toThrow("denied");
    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledWith(
      "save_targets",
      expect.objectContaining({ message: "denied", status: 0 }),
    );
  });

  it("records nothing when the call succeeds", async () => {
    const { db } = fakeDb({});
    const record = vi.fn();
    const store = createSupabaseTargetsStore(db, record);
    await store.load();
    await store.save("protein", 1);
    expect(record).not.toHaveBeenCalled();
  });

  it("is not affected when recording throws", async () => {
    const { db } = fakeDb({ saveError: "denied" });
    const record = vi.fn(() => {
      throw new Error("recorder broke");
    });
    await expect(
      createSupabaseTargetsStore(db, record).save("protein", 1),
    ).rejects.toThrow("denied");
  });
});
