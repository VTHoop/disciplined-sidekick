import { describe, expect, it } from "vitest";
import { AI_CONFIG } from "../ai/config";
import { AiValidationError } from "../ai/errors";
import { MODEL_PRICES } from "../ai/pricing";
import type { RunDeps } from "../ai/run";
import { fakeClient, memoryStore, type Scripted } from "../ai/test-helpers";
import type { CachedFood } from "./cache";
import { createFoodService } from "./service";
import { UsdaError, type UsdaFood } from "./usda";

const USER_ID = "4f1c1f0e-8f0b-4a53-9b0c-0d2b7d3f6a11";
const ENTRY_ID = "7d0c4a52-2f8e-4b8e-9a51-5b8a8c1f0e01";

const answer = (model: string, body: unknown) => ({
  model,
  stop_reason: "end_turn",
  text: typeof body === "string" ? body : JSON.stringify(body),
  usage: { input_tokens: 10, output_tokens: 5 },
});

const parsed = answer(AI_CONFIG.parseFood.model, {
  items: [
    {
      name: "2 eggs",
      canonicalName: "egg, whole, raw",
      usdaQuery: "egg whole raw",
      grams: 100,
      portionEstimated: true,
      countsFruitVeg: false,
      brand: null,
      path: "generic",
      servings: null,
    },
  ],
});
const picked = answer(AI_CONFIG.pickFood.model, { fdcId: 171287 });
const estimated = answer(AI_CONFIG.estimateFood.model, {
  kcalPer100g: 143,
  proteinPer100g: 12.6,
});

// The pick has energy but no protein, so the item also needs an estimate:
// one entry, three AI calls (parse, pick, estimate).
const eggWithoutProtein: UsdaFood = {
  fdcId: 171287,
  description: "Egg, whole, raw, fresh",
  dataType: "SR Legacy",
  foodNutrients: [{ nutrientId: 1008, value: 143 }],
};

function setup(script: Scripted[], newId?: () => string) {
  const { client } = fakeClient(script);
  const { store, rows } = memoryStore();
  const run: RunDeps = {
    client,
    store,
    config: AI_CONFIG,
    prices: MODEL_PRICES,
    sleep: async () => {},
  };
  const entries = new Map<string, CachedFood>();
  const service = createFoodService({
    run,
    usda: { search: async () => [eggWithoutProtein] },
    cache: {
      get: async (key) => entries.get(key) ?? null,
      put: async (key, food) => {
        entries.set(key, food);
      },
    },
    ...(newId ? { newId } : {}),
  });
  return { service, rows };
}

describe("food service: tracing AI runs to the entry", () => {
  it("stamps the preview's entry id and the user on the parse, pick and estimate rows", async () => {
    const { service, rows } = setup([parsed, picked, estimated]);
    const preview = await service.parse("2 eggs", USER_ID);

    expect(rows.map((r) => r.function_name)).toEqual([
      "parseFood",
      "pickFood",
      "estimateFood",
    ]);
    for (const row of rows) {
      expect(row.entry_id).toBe(preview.entryId);
      expect(row.user_id).toBe(USER_ID);
    }
  });

  it("stamps the entry id on the rows of an entry that failed", async () => {
    const { service, rows } = setup(
      [parsed, answer(AI_CONFIG.pickFood.model, "first one")],
      () => ENTRY_ID,
    );
    await expect(service.parse("2 eggs", USER_ID)).rejects.toBeInstanceOf(
      AiValidationError,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.status)).toEqual(["success", "validation_error"]);
    for (const row of rows) expect(row.entry_id).toBe(ENTRY_ID);
  });

  it("gives every parse a fresh uuid entry id", async () => {
    // The second parse finds the egg cached, so it makes only the parse call.
    const { service } = setup([parsed, picked, estimated, parsed]);
    const first = await service.parse("2 eggs", USER_ID);
    const second = await service.parse("2 eggs", USER_ID);
    expect(first.entryId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(second.entryId).not.toBe(first.entryId);
  });

  it("writes every item's AI rows before failing, when one item's USDA search fails fast", async () => {
    const twoItems = answer(AI_CONFIG.parseFood.model, {
      items: [
        {
          name: "Eggs",
          canonicalName: "egg, whole, raw",
          usdaQuery: "egg whole raw",
          grams: 100,
          portionEstimated: true,
          countsFruitVeg: false,
          brand: null,
          path: "generic",
          servings: null,
        },
        {
          name: "Blueberries",
          canonicalName: "blueberries, raw",
          usdaQuery: "blueberries raw",
          grams: 150,
          portionEstimated: false,
          countsFruitVeg: true,
          brand: null,
          path: "generic",
          servings: null,
        },
      ],
    });
    const { client } = fakeClient([
      twoItems,
      answer(AI_CONFIG.pickFood.model, { fdcId: 171711 }),
    ]);
    // Every call after the parse (the blueberries' pick) answers slowly.
    let calls = 0;
    const slowClient = {
      messages: {
        parse: async (params: never) => {
          if (calls++ > 0) await new Promise((r) => setTimeout(r, 20));
          return client.messages.parse(params);
        },
      },
    } as unknown as RunDeps["client"];
    const { store, rows } = memoryStore();
    const service = createFoodService({
      run: {
        client: slowClient,
        store,
        config: AI_CONFIG,
        prices: MODEL_PRICES,
        sleep: async () => {},
      },
      usda: {
        search: async (query) => {
          if (query === "egg whole raw")
            throw new UsdaError("USDA search failed: 503");
          return [
            {
              fdcId: 171711,
              description: "Blueberries, raw",
              dataType: "SR Legacy",
              foodNutrients: [
                { nutrientId: 1008, value: 57 },
                { nutrientId: 1003, value: 0.74 },
              ],
            },
          ];
        },
      },
      cache: { get: async () => null, put: async () => {} },
      newId: () => ENTRY_ID,
    });

    await expect(
      service.parse("eggs and blueberries", USER_ID),
    ).rejects.toBeInstanceOf(UsdaError);
    expect(rows.map((r) => r.function_name)).toEqual(["parseFood", "pickFood"]);
    for (const row of rows) expect(row.entry_id).toBe(ENTRY_ID);
  });
});
