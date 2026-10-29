import { describe, expect, it, vi } from "vitest";
import { lookupKey } from "../../packages/core/src/index.js";
import { AiValidationError } from "../ai/errors";
import type { ParsedFoodItem } from "../ai/functions/parse-food";
import type { CachedFood, FoodCache } from "./cache";
import { type FoodAi, FoodLookupError, logFood, NoFoodError } from "./log-food";
import { USDA_BRANDED_DATA_TYPES, UsdaError, type UsdaFood } from "./usda";

const ENTRY_ID = "7d0c4a52-2f8e-4b8e-9a51-5b8a8c1f0e01";

const eggs: ParsedFoodItem = {
  name: "2 eggs",
  canonicalName: "egg, whole, raw",
  usdaQuery: "egg whole raw",
  grams: 100,
  portionEstimated: true,
  countsFruitVeg: false,
  brand: null,
  path: "generic",
  servings: null,
};

const blueberries: ParsedFoodItem = {
  name: "150 g blueberries",
  canonicalName: "blueberries, raw",
  usdaQuery: "blueberries raw",
  grams: 150,
  portionEstimated: false,
  countsFruitVeg: true,
  brand: null,
  path: "generic",
  servings: null,
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

const chobani: ParsedFoodItem = {
  name: "Chobani plain greek yogurt",
  canonicalName: "plain greek yogurt",
  usdaQuery: "plain greek yogurt",
  grams: 170,
  portionEstimated: false,
  countsFruitVeg: false,
  brand: "Chobani",
  path: "branded",
  servings: null,
};

const plainYogurt: ParsedFoodItem = {
  ...chobani,
  name: "plain greek yogurt",
  brand: null,
  path: "generic",
};

const chipotleRice: ParsedFoodItem = {
  name: "Chipotle white rice",
  canonicalName: "white rice",
  usdaQuery: "white rice",
  grams: 140,
  portionEstimated: true,
  countsFruitVeg: false,
  brand: "Chipotle",
  path: "restaurant",
  servings: null,
};

const usdaChobani: UsdaFood = {
  fdcId: 2755837,
  description: "Chobani Plain Non- Fat Greek Yogurt",
  dataType: "Branded",
  brandOwner: "",
  brandName: "Chobani",
  servingSize: 170,
  servingSizeUnit: "g",
  foodNutrients: [
    { nutrientId: 1008, value: 59 },
    { nutrientId: 1003, value: 10.3 },
  ],
};

const usdaStoreBrand: UsdaFood = {
  ...usdaChobani,
  fdcId: 1999001,
  description: "Plain Greek Yogurt",
  brandOwner: "Kroger",
  brandName: "Simple Truth",
};

const chobaniKey = lookupKey("Chobani", "plain greek yogurt");

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
  /** What a Branded search returns, whatever the query. */
  branded?: UsdaFood[] | Error;
  cached?: Record<string, CachedFood>;
}

function setup({
  items = [eggs, blueberries],
  results = {
    "egg whole raw": [usdaEgg],
    "blueberries raw": [usdaBlueberries],
  },
  branded = [],
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
    search: vi.fn(async (query: string, dataTypes?: string[]) => {
      const r = dataTypes?.includes("Branded")
        ? branded
        : (results[query] ?? []);
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

  it("looks a canonical name up once when an entry names it twice", async () => {
    const { log, usda, ai } = setup({
      items: [
        { ...blueberries, name: "Blueberries" },
        {
          ...blueberries,
          name: "More blueberries",
          canonicalName: "Blueberries, Raw",
        },
      ],
    });
    const preview = await log();
    expect(usda.search).toHaveBeenCalledOnce();
    expect(ai.pickFood).toHaveBeenCalledOnce();
    expect(preview.items.map((i) => i.fdcId)).toEqual([171711, 171711]);
  });

  it("estimates a repeated unmatched name once", async () => {
    const { log, ai } = setup({ items: [eggs, eggs], results: {} });
    await log();
    expect(ai.estimateFood).toHaveBeenCalledOnce();
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

describe("logFood: generic items carry no brand", () => {
  it("previews a generic USDA pick with no brand, the generic path and the usda source", async () => {
    const { log } = setup();
    const [egg] = (await log()).items;
    expect(egg).toMatchObject({ brand: null, path: "generic", source: "usda" });
  });

  it("previews a generic estimate with the estimated source", async () => {
    const { log } = setup({ items: [eggs], results: {} });
    const [egg] = (await log()).items;
    expect(egg).toMatchObject({
      brand: null,
      path: "generic",
      source: "estimated",
      estimated: true,
    });
  });
});

describe("logFood: branded items", () => {
  it("searches only the Branded dataset, with the brand in the query", async () => {
    const { log, usda } = setup({ items: [chobani], branded: [usdaChobani] });
    await log();
    expect(usda.search).toHaveBeenCalledOnce();
    expect(usda.search).toHaveBeenCalledWith(
      expect.stringContaining("Chobani"),
      USDA_BRANDED_DATA_TYPES,
    );
  });

  it("gives pickFood the brand and each candidate's brand owner and brand name", async () => {
    const { log, ai } = setup({
      items: [chobani],
      branded: [usdaChobani, usdaStoreBrand],
    });
    await log();
    expect(ai.pickFood).toHaveBeenCalledWith({
      canonicalName: "plain greek yogurt",
      brand: "Chobani",
      candidates: [
        {
          fdcId: 2755837,
          description: "Chobani Plain Non- Fat Greek Yogurt",
          dataType: "Branded",
          brandOwner: "",
          brandName: "Chobani",
        },
        {
          fdcId: 1999001,
          description: "Plain Greek Yogurt",
          dataType: "Branded",
          brandOwner: "Kroger",
          brandName: "Simple Truth",
        },
      ],
    });
  });

  it("previews a branded pick with its brand, the branded source and per-100 g values", async () => {
    const { log } = setup({ items: [chobani], branded: [usdaChobani] });
    const [item] = (await log()).items;
    expect(item).toMatchObject({
      brand: "Chobani",
      path: "branded",
      source: "branded",
      estimated: false,
      fdcId: 2755837,
      kcalPer100g: 59,
      proteinPer100g: 10.3,
      grams: 170,
      portionEstimated: false,
    });
  });

  it("caches the pick under the brand-and-name key, with the brand and label serving size", async () => {
    const { log, entries } = setup({
      items: [chobani],
      branded: [usdaChobani],
    });
    await log();
    expect(entries.get(chobaniKey)).toEqual({
      source: "branded",
      fdcId: 2755837,
      description: "Chobani Plain Non- Fat Greek Yogurt",
      brand: "Chobani",
      servingSizeG: 170,
      kcalPer100g: 59,
      proteinPer100g: 10.3,
    });
    expect(entries.has("plain greek yogurt")).toBe(false);
  });

  it.each([
    ["1008", [{ nutrientId: 1008, value: 59 }], 59],
    ["2048", [{ nutrientId: 2048, value: 61 }], 61],
    ["2047", [{ nutrientId: 2047, value: 63 }], 63],
  ])(
    "reads energy from nutrient %s, as a generic pick does",
    async (_, energy, kcal) => {
      const { log } = setup({
        items: [chobani],
        branded: [
          {
            ...usdaChobani,
            foodNutrients: [...energy, { nutrientId: 1003, value: 10.3 }],
          },
        ],
      });
      const [item] = (await log()).items;
      expect(item).toMatchObject({ source: "branded", kcalPer100g: kcal });
    },
  );

  it("prefers 1008 over 2048 and 2047", async () => {
    const { log } = setup({
      items: [chobani],
      branded: [
        {
          ...usdaChobani,
          foodNutrients: [
            { nutrientId: 2047, value: 63 },
            { nutrientId: 2048, value: 61 },
            { nutrientId: 1008, value: 59 },
            { nutrientId: 1003, value: 10.3 },
          ],
        },
      ],
    });
    expect((await log()).items[0]?.kcalPer100g).toBe(59);
  });

  describe("servings", () => {
    const twoServings = {
      ...chobani,
      servings: 2,
      grams: 100,
      portionEstimated: true,
    };

    it("uses servings × the label serving size when that is in grams, and the portion is no longer a guess", async () => {
      const { log } = setup({ items: [twoServings], branded: [usdaChobani] });
      const [item] = (await log()).items;
      expect(item).toMatchObject({ grams: 340, portionEstimated: false });
      expect(item?.kcal).toBeCloseTo(200.6, 10);
    });

    it.each([
      [
        "a label serving size in ml",
        { servingSize: 240, servingSizeUnit: "ml" },
      ],
      [
        "no label serving size",
        { servingSize: undefined, servingSizeUnit: undefined },
      ],
      [
        "a label serving size of zero",
        { servingSize: 0, servingSizeUnit: "g" },
      ],
    ])(
      "takes the grams from parseFood when the pick has %s",
      async (_, label) => {
        const { log } = setup({
          items: [twoServings],
          branded: [{ ...usdaChobani, ...label }],
        });
        const [item] = (await log()).items;
        expect(item).toMatchObject({ grams: 100, portionEstimated: true });
      },
    );

    it("takes the grams from parseFood when servings is null", async () => {
      const { log } = setup({ items: [chobani], branded: [usdaChobani] });
      expect((await log()).items[0]).toMatchObject({ grams: 170 });
    });

    it("converts servings on a cache hit, from the cached label serving size", async () => {
      const { log, usda } = setup({
        items: [twoServings],
        cached: {
          [chobaniKey]: {
            source: "branded",
            fdcId: 2755837,
            description: "Chobani Plain Non- Fat Greek Yogurt",
            brand: "Chobani",
            servingSizeG: 170,
            kcalPer100g: 59,
            proteinPer100g: 10.3,
          },
        },
      });
      const [item] = (await log()).items;
      expect(usda.search).not.toHaveBeenCalled();
      expect(item).toMatchObject({
        source: "branded",
        grams: 340,
        portionEstimated: false,
      });
    });

    it("takes the grams from parseFood on a cache hit with no gram serving size", async () => {
      const { log } = setup({
        items: [twoServings],
        cached: {
          [chobaniKey]: {
            source: "branded",
            fdcId: 2755837,
            description: "x",
            brand: "Chobani",
            servingSizeG: null,
            kcalPer100g: 59,
            proteinPer100g: 10.3,
          },
        },
      });
      expect((await log()).items[0]).toMatchObject({
        grams: 100,
        portionEstimated: true,
      });
    });

    it("is ignored for generic and restaurant items", async () => {
      const { log } = setup({
        items: [
          { ...eggs, servings: 3 },
          { ...chipotleRice, servings: 3 },
        ],
      });
      const [egg, rice] = (await log()).items;
      expect(egg?.grams).toBe(100);
      expect(rice).toMatchObject({ grams: 140, portionEstimated: true });
    });
  });

  describe("with no usable match", () => {
    it.each([
      ["no results", { branded: [] as UsdaFood[] }],
      ["a pick of none", { branded: [usdaChobani], pick: null }],
      ["a pick that fails the brand check", { branded: [usdaStoreBrand] }],
      [
        "a pick with no energy",
        {
          branded: [
            {
              ...usdaChobani,
              foodNutrients: [{ nutrientId: 1003, value: 10.3 }],
            },
          ],
        },
      ],
      [
        "a pick with no protein",
        {
          branded: [
            {
              ...usdaChobani,
              foodNutrients: [{ nutrientId: 1008, value: 59 }],
            },
          ],
        },
      ],
    ])("gives a brand-aware AI estimate for %s", async (_, scenario) => {
      const { log, ai, usda, entries } = setup({
        items: [chobani],
        branded: scenario.branded,
      });
      // The default pick takes the first candidate, so a store brand that is the
      // only candidate is picked and then fails the code-side brand check.
      if ("pick" in scenario) {
        ai.pickFood.mockResolvedValueOnce({ fdcId: scenario.pick });
      }
      const [item] = (await log()).items;

      expect(ai.estimateFood).toHaveBeenCalledWith({
        canonicalName: "plain greek yogurt",
        brand: "Chobani",
        path: "branded",
      });
      expect(item).toMatchObject({
        brand: "Chobani",
        path: "branded",
        source: "estimated",
        estimated: true,
        fdcId: null,
        kcalPer100g: 200,
      });
      expect(entries.get(chobaniKey)).toEqual({
        source: "estimate",
        brand: "Chobani",
        kcalPer100g: 200,
        proteinPer100g: 10,
      });
      // Never a silent fall-back to a generic USDA food.
      for (const call of usda.search.mock.calls) {
        expect(call[1]).toEqual(USDA_BRANDED_DATA_TYPES);
      }
    });
  });

  describe("on an error", () => {
    it("fails the entry on a USDA error, caching nothing and not estimating", async () => {
      const { log, ai, entries } = setup({
        items: [chobani],
        branded: new UsdaError("USDA search failed: 429"),
      });
      await expect(log()).rejects.toBeInstanceOf(UsdaError);
      expect(entries.size).toBe(0);
      expect(ai.estimateFood).not.toHaveBeenCalled();
    });

    it("fails the entry on a malformed pick, caching nothing and not estimating", async () => {
      const { log, ai, entries } = setup({
        items: [chobani],
        branded: [usdaChobani],
      });
      ai.pickFood.mockRejectedValueOnce(new AiValidationError([]));
      await expect(log()).rejects.toBeInstanceOf(AiValidationError);
      expect(entries.size).toBe(0);
      expect(ai.estimateFood).not.toHaveBeenCalled();
    });

    it("fails the entry when the pick was not a candidate", async () => {
      const { log, ai, entries } = setup({
        items: [chobani],
        branded: [usdaChobani],
      });
      ai.pickFood.mockResolvedValueOnce({ fdcId: 999 });
      await expect(log()).rejects.toBeInstanceOf(FoodLookupError);
      expect(entries.size).toBe(0);
    });

    it("fails the entry on a malformed estimate, caching nothing", async () => {
      const { log, ai, entries } = setup({ items: [chobani], branded: [] });
      ai.estimateFood.mockRejectedValueOnce(new AiValidationError([]));
      await expect(log()).rejects.toBeInstanceOf(AiValidationError);
      expect(entries.size).toBe(0);
    });
  });
});

describe("logFood: restaurant items", () => {
  it("makes no USDA call and asks for an estimate from the restaurant and the item", async () => {
    const { log, usda, ai } = setup({ items: [chipotleRice] });
    await log();
    expect(usda.search).not.toHaveBeenCalled();
    expect(ai.pickFood).not.toHaveBeenCalled();
    expect(ai.estimateFood).toHaveBeenCalledWith({
      canonicalName: "white rice",
      brand: "Chipotle",
      path: "restaurant",
    });
  });

  it("previews the item as an estimate with the restaurant as its brand", async () => {
    const { log } = setup({ items: [chipotleRice] });
    const [item] = (await log()).items;
    expect(item).toMatchObject({
      brand: "Chipotle",
      path: "restaurant",
      source: "estimated",
      estimated: true,
      fdcId: null,
      grams: 140,
      portionEstimated: true,
    });
  });

  it("caches the estimate under the brand-and-name key", async () => {
    const { log, entries } = setup({ items: [chipotleRice] });
    await log();
    expect(entries.get(lookupKey("Chipotle", "white rice"))).toEqual({
      source: "estimate",
      brand: "Chipotle",
      kcalPer100g: 200,
      proteinPer100g: 10,
    });
    expect(entries.has("white rice")).toBe(false);
  });

  it("reuses a cached restaurant estimate without a new AI call", async () => {
    const { log, ai, usda } = setup({
      items: [chipotleRice],
      cached: {
        [lookupKey("Chipotle", "white rice")]: {
          source: "estimate",
          brand: "Chipotle",
          kcalPer100g: 150,
          proteinPer100g: 3,
        },
      },
    });
    const [item] = (await log()).items;
    expect(ai.estimateFood).not.toHaveBeenCalled();
    expect(usda.search).not.toHaveBeenCalled();
    expect(item).toMatchObject({
      estimated: true,
      kcalPer100g: 150,
      brand: "Chipotle",
    });
  });

  it("fails the entry on a malformed estimate, caching nothing", async () => {
    const { log, ai, entries } = setup({ items: [chipotleRice] });
    ai.estimateFood.mockRejectedValueOnce(new AiValidationError([]));
    await expect(log()).rejects.toBeInstanceOf(AiValidationError);
    expect(entries.size).toBe(0);
  });
});

describe("logFood: lookup keys", () => {
  it("looks 'Chobani plain greek yogurt' and 'plain greek yogurt' up separately, one branded and one generic", async () => {
    const { log, usda, entries } = setup({
      items: [chobani, plainYogurt],
      results: { "plain greek yogurt": [usdaEgg] },
      branded: [usdaChobani],
    });
    const preview = await log();
    expect(usda.search).toHaveBeenCalledTimes(2);
    expect(preview.items.map((i) => [i.brand, i.source])).toEqual([
      ["Chobani", "branded"],
      [null, "usda"],
    ]);
    expect(entries.has(chobaniKey)).toBe(true);
    expect(entries.has("plain greek yogurt")).toBe(true);
  });

  it("looks a brand and name up once when an entry names them twice", async () => {
    const { log, usda } = setup({
      items: [chobani, { ...chobani, name: "More Chobani", brand: "CHOBANI" }],
      branded: [usdaChobani],
    });
    await log();
    expect(usda.search).toHaveBeenCalledOnce();
  });

  it("hits an existing generic cache row by the unchanged key", async () => {
    const { log, usda } = setup({
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
    await log();
    expect(usda.search).not.toHaveBeenCalled();
  });
});
