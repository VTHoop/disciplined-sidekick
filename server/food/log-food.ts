import {
  canonicalKey,
  energyKcalPer100g,
  entryTotals,
  type FoodPreview,
  fruitVegGrams,
  itemNutrition,
  type Per100g,
  type PreviewItem,
  proteinPer100g,
} from "../../packages/core/src/index.js";
import type {
  EstimateFoodInput,
  EstimateFoodOutput,
} from "../ai/functions/estimate-food.js";
import type {
  ParsedFoodItem,
  ParseFoodInput,
  ParseFoodOutput,
} from "../ai/functions/parse-food.js";
import type {
  PickFoodInput,
  PickFoodOutput,
} from "../ai/functions/pick-food.js";
import type { AiLogger } from "../ai/run.js";
import type { CachedFood, FoodCache } from "./cache.js";
import type { UsdaClient } from "./usda.js";

/** The three AI functions, already bound to the user and the entry. */
export interface FoodAi {
  parseFood(input: ParseFoodInput): Promise<ParseFoodOutput>;
  pickFood(input: PickFoodInput): Promise<PickFoodOutput>;
  estimateFood(input: EstimateFoodInput): Promise<EstimateFoodOutput>;
}

export interface LogFoodDeps {
  ai: FoodAi;
  usda: UsdaClient;
  cache: FoodCache;
  logger?: AiLogger;
}

/** parseFood found no food in the entry. */
export class NoFoodError extends Error {
  constructor() {
    super("No food found in the entry");
  }
}

/** The pick named a result that was not one of the candidates. */
export class FoodLookupError extends Error {}

/**
 * Looks one food up: the cache, else USDA plus an AI pick, else an AI
 * estimate. Only a successful lookup is cached; any failure fails the entry.
 */
async function lookUp(
  deps: LogFoodDeps,
  item: ParsedFoodItem,
): Promise<CachedFood> {
  const key = canonicalKey(item.canonicalName);
  const cached = await deps.cache.get(key);
  if (cached) return cached;

  const food = (await findUsda(deps, item)) ?? {
    source: "estimate" as const,
    ...(await deps.ai.estimateFood({ canonicalName: item.canonicalName })),
  };
  try {
    await deps.cache.put(key, food);
  } catch (error) {
    (deps.logger ?? console).error("food_cache write failed", { error, key });
  }
  return food;
}

/** The AI's pick of the USDA results, or null when there is no usable match. */
async function findUsda(
  deps: LogFoodDeps,
  item: ParsedFoodItem,
): Promise<CachedFood | null> {
  const results = await deps.usda.search(item.usdaQuery);
  if (results.length === 0) return null;
  const { fdcId } = await deps.ai.pickFood({
    canonicalName: item.canonicalName,
    candidates: results.map(({ fdcId, description, dataType }) => ({
      fdcId,
      description,
      dataType,
    })),
  });
  if (fdcId === null) return null;
  const pick = results.find((r) => r.fdcId === fdcId);
  if (!pick) throw new FoodLookupError(`Pick ${fdcId} was not a candidate`);
  const kcal = energyKcalPer100g(pick.foodNutrients);
  const protein = proteinPer100g(pick.foodNutrients);
  if (kcal === null || protein === null) return null;
  return {
    source: "usda",
    fdcId: pick.fdcId,
    description: pick.description,
    kcalPer100g: kcal,
    proteinPer100g: protein,
  };
}

function toPreviewItem(item: ParsedFoodItem, food: CachedFood): PreviewItem {
  const per100: Per100g = {
    kcalPer100g: food.kcalPer100g,
    proteinPer100g: food.proteinPer100g,
  };
  return {
    name: item.name,
    canonicalName: item.canonicalName,
    grams: item.grams,
    ...itemNutrition(per100, item.grams),
    fruitVegG: fruitVegGrams(item.grams, item.countsFruitVeg),
    ...per100,
    estimated: food.source === "estimate",
    portionEstimated: item.portionEstimated,
    fdcId: food.source === "usda" ? food.fdcId : null,
  };
}

/** Parses an entry and looks up every item. Saves nothing: that is Done's job. */
export async function logFood(
  deps: LogFoodDeps,
  { entryId, text }: { entryId: string; text: string },
): Promise<FoodPreview> {
  const { items: parsed } = await deps.ai.parseFood({ text });
  if (parsed.length === 0) throw new NoFoodError();
  // One lookup per canonical name, so a food named twice costs one search and
  // gets one answer.
  const lookups = new Map<string, Promise<CachedFood>>();
  for (const item of parsed) {
    const key = canonicalKey(item.canonicalName);
    if (!lookups.has(key)) lookups.set(key, lookUp(deps, item));
  }
  // Wait for every lookup before failing: the response must not go out while
  // an AI call is still running, or its ai_runs row may never be written.
  const settled = await Promise.allSettled(lookups.values());
  const failed = settled.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
  const foods = new Map(
    [...lookups.keys()].map((key, i) => [
      key,
      (settled[i] as PromiseFulfilledResult<CachedFood>).value,
    ]),
  );
  const items = parsed.map((item) =>
    toPreviewItem(
      item,
      foods.get(canonicalKey(item.canonicalName)) as CachedFood,
    ),
  );
  return { entryId, text, items, totals: entryTotals(items) };
}
