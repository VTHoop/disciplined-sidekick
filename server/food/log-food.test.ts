import { describe, expect, it, vi } from "vitest";
import { AiValidationError } from "../ai/errors";
import type { ParsedFoodItem } from "../ai/functions/parse-food";
import type { CachedFood, FoodCache } from "./cache";
import { type FoodAi, FoodLookupError, logFood, NoFoodError } from "./log-food";
import { UsdaError, type UsdaFood } from "./usda";

const ENTRY_ID = "7d0c4a52-2f8e-4b8e-9a51-5b8a8c1f0e01";

const eggs: ParsedFoodItem = {
  name: "2 eggs",
  canonicalName: "egg, whole, raw",
  usdaQuery: "egg whole raw",
  grams: 100,
  portionEstimated: true,
  countsFruitVeg: false,
};

const blueberries: ParsedFoodItem = {
  name: "150 g blueberries",
  canonicalName: "blueberries, raw",
  usdaQuery: "blueberries raw",
  grams: 150,
  portionEstimated: false,
  countsFruitVeg: true,
};

const usdaEgg: UsdaFood = {
  fdcId: 171287,
  description: "Egg, whole, raw, fresh",
  dataType: "SR Legacy",
  foodNutrients: [
    { nutrientId: 1008, value: 143 },
    { nutrientId: 1003, value: 12.56 },
  ],
};

const usdaBlueberries: UsdaFood = {
  fdcId: 171711,
  description: "Blueberries, raw",
  dataType: "SR Legacy",
  foodNutrients: [
    { nutrientId: 1008, value: 57 },
    { nutrientId: 1003, value: 0.74 },
  ],
};

function memoryCache(initial: Record<string, CachedFood> = {}) {
  const entries = new Map(Object.entries(initial));
  const cache = {
    get: vi.fn<FoodCache["get"]>(async (key) => entries.get(key) ?? null),
    put: vi.fn<FoodCache["put"]>(async (key, food) => {
      entries.set(key, food);
    }),
  };
  return { cache, entries };
}

interface SetupOptions {
  items?: ParsedFoodItem[];
  results?: Record<string, UsdaFood[] | Error>;
  cached?: Record<string, CachedFood>;
}

function setup({
  items = [eggs, blueberries],
  results = {
    "egg whole raw": [usdaEgg],
    "blueberries raw": [usdaBlueberries],
  },
  cached = {},
}: SetupOptions = {}) {
  const ai = {
    parseFood: vi.fn<FoodAi["parseFood"]>(async () => ({ items })),
    // Picks the first candidate unless a test says otherwise.
    pickFood: vi.fn<FoodAi["pickFood"]>(async ({ candidates }) => ({
      fdcId: candidates[0]?.fdcId ?? null,
    })),
    estimateFood: vi.fn<FoodAi["estimateFood"]>(async () => ({
      kcalPer100g: 200,
      proteinPer100g: 10,
    })),
  };
  const usda = {
    search: vi.fn(async (query: string) => {
      const r = results[query] ?? [];
      if (r instanceof Error) throw r;
      return r;
    }),
  };
  const { cache, entries } = memoryCache(cached);
  const deps = { ai, usda, cache, logger: { error: vi.fn() } };
  const log = (text = "2 eggs and 150 g blueberries") =>
    logFood(deps, { entryId: ENTRY_ID, text });
  return { log, ai, usda, cache, entries, deps };
}

describe("logFood: preview", () => {
  it("previews two eggs and 150 g blueberries with grams, kcal, protein and fruit/veg grams", async () => {
    const { log } = setup();
    const preview = await log();

    expect(preview.entryId).toBe(ENTRY_ID);
    expect(preview.text).toBe("2 eggs and 150 g blueberries");
    expect(preview.items).toHaveLength(2);

    const [egg, berry] = preview.items;
    expect(egg).toMatchObject({
      name: "2 eggs",
      canonicalName: "egg, whole, raw",
      grams: 100,
      fruitVegG: 0,
      estimated: false,
      portionEstimated: true,
      fdcId: 171287,
      kcalPer100g: 143,
      proteinPer100g: 12.56,
    });
    expect(egg?.kcal).toBeCloseTo(143, 10);
    expect(egg?.protein).toBeCloseTo(12.56, 10);

    expect(berry).toMatchObject({
      name: "150 g blueberries",
      grams: 150,
      fruitVegG: 150,
      estimated: false,
      portionEstimated: false,
      fdcId: 171711,
    });
    expect(berry?.kcal).toBeCloseTo(85.5, 10);
    expect(berry?.protein).toBeCloseTo(1.11, 10);
  });

  it("totals the entry from the unrounded item values", async () => {
    const { log } = setup();
    const { totals } = await log();
    expect(totals.kcal).toBeCloseTo(228.5, 10);
    expect(totals.protein).toBeCloseTo(13.67, 10);
    expect(totals.fruitVegG).toBe(150);
  });

  it("searches USDA with each item's query and asks the AI to pick by canonical name", async () => {
    const { log, usda, ai } = setup();
    await log();
    expect(usda.search).toHaveBeenCalledWith("egg whole raw");
    expect(usda.search).toHaveBeenCalledWith("blueberries raw");
    expect(ai.pickFood).toHaveBeenCalledWith({
      canonicalName: "blueberries, raw",
      candidates: [
        {
          fdcId: 171711,
          description: "Blueberries, raw",
          dataType: "SR Legacy",
        },
      ],
    });
  });

  it("passes the entry text to parseFood", async () => {
    const { log, ai } = setup();
    await log("2 eggs and 150 g blueberries");
    expect(ai.parseFood).toHaveBeenCalledWith({
      text: "2 eggs and 150 g blueberries",
    });
  });
});

describe("logFood: estimates", () => {
  it("estimates an item when USDA returns no results", async () => {
    const { log, ai, entries } = setup({
      items: [{ ...eggs, canonicalName: "mezeh harissa", usdaQuery: "mezeh" }],
      results: {},
    });
    const [item] = (await log()).items;
    expect(ai.pickFood).not.toHaveBeenCalled();
    expect(ai.estimateFood).toHaveBeenCalledWith({
      canonicalName: "mezeh harissa",
    });
    expect(item).toMatchObject({
      estimated: true,
      fdcId: null,
      kcalPer100g: 200,
      proteinPer100g: 10,
    });
    expect(entries.get("mezeh harissa")).toEqual({
      source: "estimate",
      kcalPer100g: 200,
      proteinPer100g: 10,
    });
  });

  it("estimates an item when the AI finds no suitable result", async () => {
    const { log, ai } = setup({ items: [eggs] });
    ai.pickFood.mockResolvedValueOnce({ fdcId: null });
    const [item] = (await log()).items;
    expect(ai.estimateFood).toHaveBeenCalledOnce();
    expect(item?.estimated).toBe(true);
  });

  it.each([
    [
      "no energy under 1008, 2048 or 2047",
      [
        { nutrientId: 1062, value: 598 },
        { nutrientId: 1003, value: 12.56 },
      ],
    ],
    ["no protein under 1003", [{ nutrientId: 1008, value: 143 }]],
  ])("estimates an item whose pick has %s", async (_, foodNutrients) => {
    const { log, ai, entries } = setup({
      items: [eggs],
      results: { "egg whole raw": [{ ...usdaEgg, foodNutrients }] },
    });
    const [item] = (await log()).items;
    expect(ai.estimateFood).toHaveBeenCalledOnce();
    expect(item?.estimated).toBe(true);
    expect(entries.get("egg, whole, raw")?.source).toBe("estimate");
  });

  it("uses a 2048 or 2047 energy value when 1008 is missing, without estimating", async () => {
    const { log, ai } = setup({
      items: [blueberries],
      results: {
        "blueberries raw": [
          {
            ...usdaBlueberries,
            foodNutrients: [
              { nutrientId: 2047, value: 64 },
              { nutrientId: 1003, value: 0.7 },
            ],
          },
        ],
      },
    });
    const [item] = (await log()).items;
    expect(ai.estimateFood).not.toHaveBeenCalled();
    expect(item?.kcalPer100g).toBe(64);
    expect(item?.estimated).toBe(false);
  });

  it("keeps both marks on an estimated item whose grams were guessed", async () => {
    const { log } = setup({ items: [eggs], results: {} });
    const [item] = (await log()).items;
    expect(item).toMatchObject({ estimated: true, portionEstimated: true });
  });
});

describe("logFood: cache", () => {
  it("caches a USDA pick under the canonical name", async () => {
    const { log, entries } = setup({ items: [blueberries] });
    await log();
    expect(entries.get("blueberries, raw")).toEqual({
      source: "usda",
      fdcId: 171711,
      description: "Blueberries, raw",
      kcalPer100g: 57,
      proteinPer100g: 0.74,
    });
  });

  it("makes no USDA or AI lookup call for a cached pick", async () => {
    const { log, usda, ai } = setup({
      items: [blueberries],
      cached: {
        "blueberries, raw": {
          source: "usda",
          fdcId: 171711,
          description: "Blueberries, raw",
          kcalPer100g: 57,
          proteinPer100g: 0.74,
        },
      },
    });
    const [item] = (await log()).items;
    expect(usda.search).not.toHaveBeenCalled();
    expect(ai.pickFood).not.toHaveBeenCalled();
    expect(item).toMatchObject({ fdcId: 171711, estimated: false });
    expect(item?.kcal).toBeCloseTo(85.5, 10);
  });

  it("reuses a cached estimate's per-100 g values and still marks it estimated", async () => {
    const { log, usda, ai } = setup({
      items: [{ ...eggs, canonicalName: "mezeh harissa" }],
      cached: {
        "mezeh harissa": {
          source: "estimate",
          kcalPer100g: 180,
          proteinPer100g: 8,
        },
      },
    });
    const [item] = (await log()).items;
    expect(usda.search).not.toHaveBeenCalled();
    expect(ai.estimateFood).not.toHaveBeenCalled();
    expect(item).toMatchObject({
      estimated: true,
      fdcId: null,
      kcalPer100g: 180,
      proteinPer100g: 8,
    });
  });

  it("matches the cache whatever the canonical name's case and spacing", async () => {
    const { log, usda } = setup({
      items: [{ ...blueberries, canonicalName: "  Blueberries,  Raw " }],
      cached: {
        "blueberries, raw": {
          source: "usda",
          fdcId: 171711,
          description: "Blueberries, raw",
          kcalPer100g: 57,
          proteinPer100g: 0.74,
        },
      },
    });
    await log();
    expect(usda.search).not.toHaveBeenCalled();
  });

  it("a second entry with the same canonical name makes no USDA call", async () => {
    const { log, usda } = setup({ items: [blueberries] });
    await log();
    await log();
    expect(usda.search).toHaveBeenCalledOnce();
  });

  it("still previews when the cache write fails, and logs it", async () => {
    const { log, cache, deps } = setup({ items: [blueberries] });
    cache.put.mockRejectedValueOnce(new Error("db down"));
    await expect(log()).resolves.toMatchObject({ items: [{ fdcId: 171711 }] });
    expect(deps.logger.error).toHaveBeenCalled();
  });
});

describe("logFood: failures", () => {
  it("returns NoFoodError when parseFood finds no food, with no lookups", async () => {
    const { log, usda } = setup({ items: [] });
    await expect(log("hello there")).rejects.toBeInstanceOf(NoFoodError);
    expect(usda.search).not.toHaveBeenCalled();
  });

  it("fails the entry when parseFood output is malformed, with no lookups", async () => {
    const { log, ai, usda } = setup();
    ai.parseFood.mockRejectedValueOnce(new AiValidationError([]));
    await expect(log()).rejects.toBeInstanceOf(AiValidationError);
    expect(usda.search).not.toHaveBeenCalled();
  });

  it("fails the entry when a pick is malformed, and caches nothing for that lookup", async () => {
    const { log, ai, entries } = setup({ items: [blueberries] });
    ai.pickFood.mockRejectedValueOnce(new AiValidationError([]));
    await expect(log()).rejects.toBeInstanceOf(AiValidationError);
    expect(entries.has("blueberries, raw")).toBe(false);
    expect(ai.estimateFood).not.toHaveBeenCalled();
  });

  it("fails the entry when the pick names an id that was not a candidate", async () => {
    const { log, ai, entries } = setup({ items: [blueberries] });
    ai.pickFood.mockResolvedValueOnce({ fdcId: 999 });
    await expect(log()).rejects.toBeInstanceOf(FoodLookupError);
    expect(entries.has("blueberries, raw")).toBe(false);
  });

  it("fails the whole entry on a USDA error, caching nothing for that lookup and not estimating", async () => {
    const { log, ai, entries } = setup({
      items: [blueberries],
      results: { "blueberries raw": new UsdaError("USDA search failed: 429") },
    });
    await expect(log()).rejects.toBeInstanceOf(UsdaError);
    expect(entries.has("blueberries, raw")).toBe(false);
    expect(ai.estimateFood).not.toHaveBeenCalled();
  });

  it("fails the entry when one of several lookups fails", async () => {
    const { log } = setup({
      results: {
        "egg whole raw": [usdaEgg],
        "blueberries raw": new UsdaError("USDA search failed: 503"),
      },
    });
    await expect(log()).rejects.toBeInstanceOf(UsdaError);
  });

  it("fails the entry when an estimate is malformed, caching nothing for it", async () => {
    const { log, ai, entries } = setup({ items: [eggs], results: {} });
    ai.estimateFood.mockRejectedValueOnce(new AiValidationError([]));
    await expect(log()).rejects.toBeInstanceOf(AiValidationError);
    expect(entries.has("egg, whole, raw")).toBe(false);
  });
});
