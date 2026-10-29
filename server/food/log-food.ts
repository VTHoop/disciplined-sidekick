import {
  energyKcalPer100g,
  entryTotals,
  type FoodPreview,
  fruitVegGrams,
  itemNutrition,
  lookupKey,
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
import { brandMatches } from "./brand.js";
import type { CachedFood, FoodCache } from "./cache.js";
import {
  USDA_BRANDED_DATA_TYPES,
  type UsdaClient,
  type UsdaFood,
} from "./usda.js";

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

/** The brand a branded or restaurant item named; null for a generic item. */
const namedBrand = (item: ParsedFoodItem) =>
  item.path === "generic" ? null : item.brand;

/**
 * Looks one food up: the cache, else (by path) USDA plus an AI pick, else an
 * AI estimate. Only a successful lookup is cached; any failure fails the entry.
 */
async function lookUp(
  deps: LogFoodDeps,
  item: ParsedFoodItem,
): Promise<CachedFood> {
  const key = lookupKey(namedBrand(item), item.canonicalName);
  const cached = await deps.cache.get(key);
  if (cached) return cached;

  const food = (await findInUsda(deps, item)) ?? (await estimate(deps, item));
  try {
    await deps.cache.put(key, food);
  } catch (error) {
    (deps.logger ?? console).error("food_cache write failed", { error, key });
  }
  return food;
}

/** Generic items search the everyday datasets, branded items the Branded one, restaurant items nothing. */
function findInUsda(
  deps: LogFoodDeps,
  item: ParsedFoodItem,
): Promise<CachedFood | null> {
  const brand = namedBrand(item);
  if (brand === null) return findUsda(deps, item);
  if (item.path === "restaurant") return Promise.resolve(null);
  return findBranded(deps, item, brand);
}

async function estimate(
  deps: LogFoodDeps,
  item: ParsedFoodItem,
): Promise<CachedFood> {
  const brand = namedBrand(item);
  const estimated = await deps.ai.estimateFood(
    brand === null
      ? { canonicalName: item.canonicalName }
      : {
          canonicalName: item.canonicalName,
          brand,
          path: item.path === "restaurant" ? "restaurant" : "branded",
        },
  );
  return {
    source: "estimate",
    ...(brand === null ? {} : { brand }),
    ...estimated,
  };
}

/** The pick from `results` by id; a pick that was not a candidate fails the entry. */
function pickedResult(results: UsdaFood[], fdcId: number): UsdaFood {
  const pick = results.find((r) => r.fdcId === fdcId);
  if (!pick) throw new FoodLookupError(`Pick ${fdcId} was not a candidate`);
  return pick;
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
  const pick = pickedResult(results, fdcId);
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

/** The label serving size in grams, or null when it is missing or in another unit. */
const servingSizeGrams = ({ servingSize, servingSizeUnit }: UsdaFood) =>
  servingSize !== undefined &&
  servingSize > 0 &&
  /^g(rams?)?$/i.test(servingSizeUnit ?? "")
    ? servingSize
    : null;

/**
 * The AI's pick of the Branded results, kept only if code agrees it is from the
 * named brand. Null means no usable match; it never falls back to a generic food.
 */
async function findBranded(
  deps: LogFoodDeps,
  item: ParsedFoodItem,
  brand: string,
): Promise<CachedFood | null> {
  const results = await deps.usda.search(
    `${brand} ${item.usdaQuery}`,
    USDA_BRANDED_DATA_TYPES,
  );
  if (results.length === 0) return null;
  const { fdcId } = await deps.ai.pickFood({
    canonicalName: item.canonicalName,
    brand,
    candidates: results.map((r) => ({
      fdcId: r.fdcId,
      description: r.description,
      dataType: r.dataType,
      brandOwner: r.brandOwner ?? "",
      brandName: r.brandName ?? "",
    })),
  });
  if (fdcId === null) return null;
  const pick = pickedResult(results, fdcId);
  if (!brandMatches(brand, pick)) return null;
  const kcal = energyKcalPer100g(pick.foodNutrients);
  const protein = proteinPer100g(pick.foodNutrients);
  if (kcal === null || protein === null) return null;
  return {
    source: "branded",
    fdcId: pick.fdcId,
    description: pick.description,
    brand,
    servingSizeG: servingSizeGrams(pick),
    kcalPer100g: kcal,
    proteinPer100g: protein,
  };
}

/** Label servings × the label serving size, for a branded match with a gram serving size. */
function portion(item: ParsedFoodItem, food: CachedFood) {
  if (
    item.path === "branded" &&
    item.servings !== null &&
    food.source === "branded" &&
    food.servingSizeG !== null
  ) {
    return {
      grams: item.servings * food.servingSizeG,
      portionEstimated: false,
    };
  }
  return { grams: item.grams, portionEstimated: item.portionEstimated };
}

function toPreviewItem(item: ParsedFoodItem, food: CachedFood): PreviewItem {
  const per100: Per100g = {
    kcalPer100g: food.kcalPer100g,
    proteinPer100g: food.proteinPer100g,
  };
  const { grams, portionEstimated } = portion(item, food);
  return {
    name: item.name,
    canonicalName: item.canonicalName,
    grams,
    ...itemNutrition(per100, grams),
    fruitVegG: fruitVegGrams(grams, item.countsFruitVeg),
    ...per100,
    estimated: food.source === "estimate",
    portionEstimated,
    fdcId: food.source === "estimate" ? null : food.fdcId,
    brand: namedBrand(item),
    path: item.path,
    source: food.source === "estimate" ? "estimated" : food.source,
  };
}

/** Parses an entry and looks up every item. Saves nothing: that is Done's job. */
export async function logFood(
  deps: LogFoodDeps,
  { entryId, text }: { entryId: string; text: string },
): Promise<FoodPreview> {
  const { items: parsed } = await deps.ai.parseFood({ text });
  if (parsed.length === 0) throw new NoFoodError();
  // One lookup per brand and canonical name, so a food named twice costs one
  // search and gets one answer.
  const lookups = new Map<string, Promise<CachedFood>>();
  for (const item of parsed) {
    const key = lookupKey(namedBrand(item), item.canonicalName);
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
      foods.get(lookupKey(namedBrand(item), item.canonicalName)) as CachedFood,
    ),
  );
  return { entryId, text, items, totals: entryTotals(items) };
}
