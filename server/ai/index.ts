import { createClient } from "@supabase/supabase-js";
import type { AiRoutes } from "../app.js";
import { createAnthropicClient } from "./client.js";
import { AI_CONFIG } from "./config.js";
import { demoFunction } from "./functions/demo.js";
import { MODEL_PRICES } from "./pricing.js";
import { runAiFunction } from "./run.js";
import { supabaseAiRunStore } from "./store.js";

export interface AiEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  anthropicApiKey: string;
}

/** Wires the AI functions to the real Anthropic client and the ai_runs store. */
export function createAiRoutes(env: AiEnv): AiRoutes {
  const deps = {
    client: createAnthropicClient(env.anthropicApiKey),
    store: supabaseAiRunStore(
      createClient(env.supabaseUrl, env.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    ),
    config: AI_CONFIG,
    prices: MODEL_PRICES,
  };
  return {
    demo: (input, userId) =>
      runAiFunction(deps, demoFunction, input, { userId }),
  };
}
