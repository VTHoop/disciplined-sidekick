import { createClient } from "@supabase/supabase-js";
import type { AiRoutes } from "../app.js";
import { createAnthropicClient } from "./client.js";
import { AI_CONFIG } from "./config.js";
import { demoFunction } from "./functions/demo.js";
import { MODEL_PRICES } from "./pricing.js";
import { type RunDeps, runAiFunction } from "./run.js";
import { supabaseAiRunStore } from "./store.js";
import { fetchWithTimeout, STORE_TIMEOUT_MS } from "./timeouts.js";

export interface AiEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  anthropicApiKey: string;
}

/** The server's service-role Supabase client, with a per-request timeout. */
export function createServiceClient(env: AiEnv) {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithTimeout(STORE_TIMEOUT_MS) },
  });
}

/** The real Anthropic client, the ai_runs store, config and prices: what every AI function runs on. */
export function createRunDeps(
  env: AiEnv,
  supabase = createServiceClient(env),
): RunDeps {
  return {
    client: createAnthropicClient(env.anthropicApiKey),
    store: supabaseAiRunStore(supabase),
    config: AI_CONFIG,
    prices: MODEL_PRICES,
  };
}

/** Wires the AI functions to the real Anthropic client and the ai_runs store. */
export function createAiRoutes(env: AiEnv): AiRoutes {
  const deps = createRunDeps(env);
  return {
    demo: (input, userId) =>
      runAiFunction(deps, demoFunction, input, { userId }),
  };
}
