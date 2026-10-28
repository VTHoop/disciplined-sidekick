import { type AiEnv, createRunDeps, createServiceClient } from "../ai/index.js";
import { fetchWithTimeout, USDA_TIMEOUT_MS } from "../ai/timeouts.js";
import type { FoodRoutes } from "../app.js";
import { supabaseFoodCache } from "./cache.js";
import { createFoodService } from "./service.js";
import { createUsdaClient } from "./usda.js";

export interface FoodEnv extends AiEnv {
  usdaApiKey: string;
}

/** Wires food logging to the real Anthropic client, USDA, ai_runs and food_cache. */
export function createFoodRoutes(env: FoodEnv): FoodRoutes {
  const supabase = createServiceClient(env);
  return createFoodService({
    run: createRunDeps(env, supabase),
    usda: createUsdaClient({
      apiKey: env.usdaApiKey,
      fetch: fetchWithTimeout(USDA_TIMEOUT_MS),
    }),
    cache: supabaseFoodCache(supabase),
  });
}
