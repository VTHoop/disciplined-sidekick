import { describe, expect, it, vi } from "vitest";
import { samplePreview } from "./fake-food";
import { createFoodApi, type FoodDb } from "./food-api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function setup(
  respond: () => Response | Promise<Response> = () => json(samplePreview()),
  rpcResult: { error: { message: string } | null } = { error: null },
) {
  const apiFetch = vi.fn(async (_input: string, _init?: RequestInit) =>
    respond(),
  );
  const rpc = vi.fn(async () => rpcResult);
  const db = { rpc } as unknown as FoodDb;
  return { api: createFoodApi({ apiFetch, db }), apiFetch, rpc };
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
        },
      ],
    });
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

  it("rejects when the save fails", async () => {
    const { api } = setup(undefined, { error: { message: "offline" } });
    await expect(api.save(samplePreview(), "2026-10-28")).rejects.toThrow(
      "offline",
    );
  });
});
