import { createClient } from "@supabase/supabase-js";
import { createAnthropicClient } from "../ai/client.js";
import { AI_CONFIG } from "../ai/config.js";
import { MODEL_PRICES } from "../ai/pricing.js";
import { supabaseAiRunStore } from "../ai/store.js";
import { fetchWithTimeout, STORE_TIMEOUT_MS } from "../ai/timeouts.js";
import type { FoodRoutes } from "../app.js";
import { supabaseFoodCache } from "./cache.js";
import { createFoodService } from "./service.js";
import { createUsdaClient } from "./usda.js";

export interface FoodEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  anthropicApiKey: string;
  usdaApiKey: string;
}

/** Per USDA search. */
export const USDA_TIMEOUT_MS = 10_000;

/** Wires food logging to the real Anthropic client, USDA, ai_runs and food_cache. */
export function createFoodRoutes(env: FoodEnv): FoodRoutes {
  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithTimeout(STORE_TIMEOUT_MS) },
  });
  return createFoodService({
    run: {
      client: createAnthropicClient(env.anthropicApiKey),
      store: supabaseAiRunStore(supabase),
      config: AI_CONFIG,
      prices: MODEL_PRICES,
    },
    usda: createUsdaClient({
      apiKey: env.usdaApiKey,
      fetch: fetchWithTimeout(USDA_TIMEOUT_MS),
    }),
    cache: supabaseFoodCache(supabase),
  });
}
