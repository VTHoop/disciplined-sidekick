import type { FoodPreview } from "../../packages/core/src/index.js";
import { estimateFoodFunction } from "../ai/functions/estimate-food.js";
import { parseFoodFunction } from "../ai/functions/parse-food.js";
import { pickFoodFunction } from "../ai/functions/pick-food.js";
import { type RunContext, type RunDeps, runAiFunction } from "../ai/run.js";
import type { FoodCache } from "./cache.js";
import { type FoodAi, logFood } from "./log-food.js";
import type { UsdaClient } from "./usda.js";

export interface FoodServiceDeps {
  run: RunDeps;
  usda: UsdaClient;
  cache: FoodCache;
  newId?: () => string;
}

/** The AI functions an entry's lookup calls, in the order it calls them. */
export const FOOD_AI_FUNCTIONS = [
  parseFoodFunction,
  pickFoodFunction,
  estimateFoodFunction,
] as const;

/** Binds logFood's AI functions to runAiFunction, stamping `ctx` on every call. */
export function createFoodAi(run: RunDeps, ctx: RunContext): FoodAi {
  return {
    parseFood: (input) => runAiFunction(run, parseFoodFunction, input, ctx),
    pickFood: (input) => runAiFunction(run, pickFoodFunction, input, ctx),
    estimateFood: (input) =>
      runAiFunction(run, estimateFoodFunction, input, ctx),
  };
}

/** Issues each entry an id and stamps it, with the user, on every AI call the entry makes. */
export function createFoodService({
  run,
  usda,
  cache,
  newId = () => crypto.randomUUID(),
}: FoodServiceDeps) {
  return {
    parse(text: string, userId: string): Promise<FoodPreview> {
      const entryId = newId();
      const ai = createFoodAi(run, { userId, entryId });
      return logFood(
        { ai, usda, cache, ...(run.logger ? { logger: run.logger } : {}) },
        { entryId, text },
      );
    },
  };
}
