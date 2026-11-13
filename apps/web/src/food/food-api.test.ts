import { describe, expect, it, vi } from "vitest";
import { samplePreview } from "./fake-food";
import { createFoodApi, type FoodDb } from "./food-api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type DbError = { message: string; code?: string } | null;

function setup(
  respond: () => Response | Promise<Response> = () => json(samplePreview()),
  rpcResult: { error: DbError; status?: number } | (() => never) = {
    error: null,
  },
  existing: { data: { id: string } | null; error: DbError } = {
    data: null,
    error: null,
  },
  record: (operation: string, error: unknown) => unknown = () => {},
) {
  const apiFetch = vi.fn(async (_input: string, _init?: RequestInit) =>
    respond(),
  );
  const rpc = vi.fn(async () => {
    if (typeof rpcResult === "function") return rpcResult();
    return rpcResult;
  });
  const maybeSingle = vi.fn(async () => existing);
  const eq = vi.fn((_column: "id", _value: string) => ({ maybeSingle }));
  const select = vi.fn((_columns: "id") => ({ eq }));
  const from = vi.fn((_table: "food_entries") => ({ select }));
  const recorder = vi.fn(record);
  const db = { rpc, from } as unknown as FoodDb;
  return {
    api: createFoodApi({ apiFetch, db, record: recorder }),
    apiFetch,
    rpc,
    from,
    eq,
    record: recorder,
  };
}

describe("food API: parse", () => {
  it("posts the text to our own /api/food/parse and nowhere else", async () => {
    const { api, apiFetch } = setup();
    await api.parse("2 eggs and 150 g blueberries");

    expect(apiFetch).toHaveBeenCalledOnce();
    const [url, init] = apiFetch.mock.calls[0] ?? [];
    expect(url).toBe("/api/food/parse");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "2 eggs and 150 g blueberries",
    });
    expect(JSON.stringify(apiFetch.mock.calls)).not.toMatch(
      /nal\.usda\.gov|api\.data\.gov|api_key|x-api-key/i,
    );
  });

  it("returns the preview on success", async () => {
    const { api } = setup();
    await expect(api.parse("2 eggs")).resolves.toEqual({
      ok: true,
      preview: samplePreview(),
    });
  });

  it("reports no_food for a 422 no_food answer", async () => {
    const { api } = setup(() => json({ error: "no_food" }, 422));
    await expect(api.parse("hello")).resolves.toEqual({
      ok: false,
      reason: "no_food",
    });
  });

  it.each([
    ["a 502", () => json({ error: "food_lookup_failed" }, 502)],
    ["a 503", () => json({ error: "food_unavailable" }, 503)],
    ["a 500 with no body", () => new Response(null, { status: 500 })],
    ["a 200 that is not a preview", () => json({ hello: "world" })],
    [
      "a network failure",
      () => {
        throw new TypeError("Failed to fetch");
      },
    ],
  ])("reports failed for %s", async (_, respond) => {
    const { api } = setup(respond);
    await expect(api.parse("egg")).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("reports session for a 401, so the user is asked to sign in again", async () => {
    const { api } = setup(() => json({ error: "unauthorized" }, 401));
    await expect(api.parse("egg")).resolves.toEqual({
      ok: false,
      reason: "session",
    });
  });

  it.each([
    ["a 502", () => json({ error: "food_lookup_failed" }, 502), 502],
    ["a 500 with no body", () => new Response(null, { status: 500 }), 500],
    ["a 401", () => json({ error: "unauthorized" }, 401), 401],
    [
      "a network failure",
      () => {
        throw new TypeError("Failed to fetch");
      },
      0,
    ],
  ])(
    "records one parse row for %s, never the entry text",
    async (_, respond, status) => {
      const { api, record } = setup(respond);
      await api.parse("secret breakfast");
      expect(record).toHaveBeenCalledOnce();
      expect(record).toHaveBeenCalledWith(
        "parse",
        expect.objectContaining({ status }),
      );
      expect(JSON.stringify(record.mock.calls)).not.toContain("secret");
    },
  );

  it("records a 200 that is not a preview", async () => {
    const { api, record } = setup(() => json({ hello: "world" }));
    await api.parse("egg");
    expect(record).toHaveBeenCalledWith(
      "parse",
      expect.objectContaining({ status: 200 }),
    );
  });

  it("records nothing for a preview or for no_food, which are answers, not failures", async () => {
    const ok = setup();
    await ok.api.parse("egg");
    const noFood = setup(() => json({ error: "no_food" }, 422));
    await noFood.api.parse("hello");
    expect(ok.record).not.toHaveBeenCalled();
    expect(noFood.record).not.toHaveBeenCalled();
  });

  it("is not affected when recording throws", async () => {
    const { api } = setup(
      () => json({}, 502),
      undefined,
      undefined,
      () => {
        throw new Error("recorder broke");
      },
    );
    await expect(api.parse("egg")).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

describe("food API: save", () => {
  it("saves the entry and all its items in one save_food_entry call, on the given local day", async () => {
    const { api, rpc, apiFetch } = setup();
    const preview = samplePreview();
    await api.save(preview, "2026-10-28");

    expect(apiFetch).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("save_food_entry", {
      p_entry_id: preview.entryId,
      p_text: "2 eggs and 150 g blueberries",
      p_local_date: "2026-10-28",
      p_items: [
        {
          name: "2 eggs",
          canonical_name: "egg, whole, raw",
          grams: 100,
          kcal: 143,
          protein_g: 12.56,
          fruit_veg_g: 0,
          kcal_per_100g: 143,
          protein_per_100g: 12.56,
          estimated: false,
          portion_estimated: true,
          fdc_id: 171287,
          brand: null,
          source: "usda",
          parsed_grams: null,
          origin: "parsed",
        },
        {
          name: "150 g blueberries",
          canonical_name: "blueberries, raw",
          grams: 150,
          kcal: 85.5,
          protein_g: 1.11,
          fruit_veg_g: 150,
          kcal_per_100g: 57,
          protein_per_100g: 0.74,
          estimated: false,
          portion_estimated: false,
          fdc_id: 171711,
          brand: null,
          source: "usda",
          parsed_grams: null,
          origin: "parsed",
        },
      ],
    });
  });

  it("saves a copy with origin reused and parsed_grams null, even when its grams were edited", async () => {
    const { api, rpc, apiFetch } = setup();
    const preview = samplePreview();
    const [egg, berry] = preview.items;
    if (!egg || !berry) throw new Error("sample has items");
    preview.items = [{ ...egg, grams: 200, parsedGrams: 100 }];
    await api.save(preview, "2026-10-28", "reused");
    expect(apiFetch).not.toHaveBeenCalled();
    const args = (rpc.mock.calls[0] as unknown[] | undefined)?.[1] as {
      p_items: Record<string, unknown>[];
    };
    expect(args.p_items[0]).toMatchObject({
      grams: 200,
      parsed_grams: null,
      origin: "reused",
    });
  });

  it("sends parsed_grams: null for an unedited item and the parse's grams for an edited one", async () => {
    const { api, rpc } = setup();
    const preview = samplePreview();
    const [egg, berry] = preview.items;
    if (!egg || !berry) throw new Error("sample has items");
    preview.items = [
      { ...egg, grams: 200, portionEstimated: false, parsedGrams: 100 },
      berry,
    ];
    await api.save(preview, "2026-10-28");
    const args = (rpc.mock.calls[0] as unknown[] | undefined)?.[1] as {
      p_items: Record<string, unknown>[];
    };
    expect(args.p_items[0]).toMatchObject({
      grams: 200,
      portion_estimated: false,
      parsed_grams: 100,
    });
    expect(args.p_items[1]).toMatchObject({ parsed_grams: null });
  });

  it("saves a branded item's brand and source, and an estimate's source", async () => {
    const { api, rpc } = setup();
    const preview = samplePreview();
    const [egg, berry] = preview.items;
    if (!egg || !berry) throw new Error("sample has items");
    preview.items = [
      {
        ...egg,
        name: "Chobani plain greek yogurt",
        canonicalName: "plain greek yogurt",
        brand: "Chobani",
        path: "branded",
        source: "branded",
        fdcId: 2755837,
      },
      {
        ...berry,
        name: "Chipotle white rice",
        canonicalName: "white rice",
        brand: "Chipotle",
        path: "restaurant",
        source: "estimated",
        estimated: true,
        fdcId: null,
      },
    ];
    await api.save(preview, "2026-10-28");
    const args = (rpc.mock.calls[0] as unknown[] | undefined)?.[1] as {
      p_items: Record<string, unknown>[];
    };
    expect(args.p_items[0]).toMatchObject({
      brand: "Chobani",
      source: "branded",
      estimated: false,
      fdc_id: 2755837,
    });
    expect(args.p_items[1]).toMatchObject({
      brand: "Chipotle",
      source: "estimated",
      estimated: true,
      fdc_id: null,
    });
    // The path only steers the preview's wording; it is not saved.
    expect(args.p_items[0]).not.toHaveProperty("path");
  });

  it("sends the unrounded values", async () => {
    const { api, rpc } = setup();
    const preview = samplePreview();
    const first = preview.items[0];
    if (!first) throw new Error("sample has items");
    preview.items = [{ ...first, kcal: 47.619, protein: 4.18248 }];
    await api.save(preview, "2026-10-28");
    const args = (rpc.mock.calls[0] as unknown[] | undefined)?.[1] as {
      p_items: { kcal: number; protein_g: number }[];
    };
    expect(args.p_items[0]).toMatchObject({ kcal: 47.619, protein_g: 4.18248 });
  });

  it("reports ok and records nothing when the save works", async () => {
    const { api, record, from } = setup();
    await expect(api.save(samplePreview(), "2026-10-28")).resolves.toEqual({
      ok: true,
    });
    expect(record).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

describe("food API: a failed save", () => {
  const network = {
    error: { message: "TypeError: Failed to fetch" },
    status: 0,
  };

  it("a rejected save reports other and records the database error text and code", async () => {
    const { api, record, from } = setup(undefined, {
      error: { message: "duplicate key value", code: "23505" },
      status: 409,
    });
    await expect(api.save(samplePreview(), "2026-10-28")).resolves.toEqual({
      ok: false,
      reason: "other",
    });
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      "save",
      expect.objectContaining({
        message: "duplicate key value",
        code: "23505",
        status: 409,
      }),
    );
    // A rejection is an answer: there is nothing to confirm.
    expect(from).not.toHaveBeenCalled();
  });

  it("with no response, checks whether the entry id exists; if it does the save is done and the lost response is recorded", async () => {
    const preview = samplePreview();
    const { api, record, from, eq } = setup(undefined, network, {
      data: { id: preview.entryId },
      error: null,
    });
    await expect(api.save(preview, "2026-10-28")).resolves.toEqual({
      ok: true,
    });
    expect(from).toHaveBeenCalledWith("food_entries");
    expect(eq).toHaveBeenCalledWith("id", preview.entryId);
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      "save",
      expect.objectContaining({ status: 0 }),
    );
  });

  it("with no response and no such entry, reports network", async () => {
    const { api, record } = setup(undefined, network, {
      data: null,
      error: null,
    });
    await expect(api.save(samplePreview(), "2026-10-28")).resolves.toEqual({
      ok: false,
      reason: "network",
    });
    expect(record).toHaveBeenCalledOnce();
  });

  it("with no response and a failing check, reports network", async () => {
    const { api, record } = setup(undefined, network, {
      data: null,
      error: { message: "TypeError: Failed to fetch" },
    });
    await expect(api.save(samplePreview(), "2026-10-28")).resolves.toEqual({
      ok: false,
      reason: "network",
    });
    // One row for the failed attempt; the check is part of the same attempt.
    expect(record).toHaveBeenCalledOnce();
  });

  it("treats a thrown fetch error like no response", async () => {
    const preview = samplePreview();
    const { api, record } = setup(
      undefined,
      () => {
        throw new TypeError("Failed to fetch");
      },
      { data: { id: preview.entryId }, error: null },
    );
    await expect(api.save(preview, "2026-10-28")).resolves.toEqual({
      ok: true,
    });
    expect(record).toHaveBeenCalledWith(
      "save",
      expect.objectContaining({ message: "Failed to fetch" }),
    );
  });

  it.each([
    ["an HTTP 401", { error: { message: "nope" }, status: 401 }],
    [
      "an expired JWT",
      { error: { message: "JWT expired", code: "PGRST301" }, status: 401 },
    ],
  ])(
    "reports session for %s, without checking for the entry",
    async (_, result) => {
      const { api, record, from } = setup(undefined, result);
      await expect(api.save(samplePreview(), "2026-10-28")).resolves.toEqual({
        ok: false,
        reason: "session",
      });
      expect(record).toHaveBeenCalledOnce();
      expect(from).not.toHaveBeenCalled();
    },
  );

  it("writes one row per failed attempt, so a retry that fails again adds a row", async () => {
    const { api, record } = setup(undefined, network);
    await api.save(samplePreview(), "2026-10-28");
    await api.save(samplePreview(), "2026-10-28");
    expect(record).toHaveBeenCalledTimes(2);
  });

  it("never records the entry text or any food data", async () => {
    const { api, record } = setup(undefined, {
      error: { message: "boom", code: "XX000" },
      status: 500,
    });
    await api.save(samplePreview(), "2026-10-28");
    const recorded = JSON.stringify(record.mock.calls);
    expect(recorded).not.toMatch(/eggs|blueberries|7d0c4a52/);
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("recorder broke");
      },
    ],
    ["rejects", () => Promise.reject(new Error("recorder broke"))],
  ])("gives the same result when recording %s", async (_, record) => {
    const { api } = setup(
      undefined,
      { error: { message: "boom" }, status: 500 },
      undefined,
      record,
    );
    await expect(api.save(samplePreview(), "2026-10-28")).resolves.toEqual({
      ok: false,
      reason: "other",
    });
  });
});
