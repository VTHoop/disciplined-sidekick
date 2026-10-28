import { handle } from "hono/vercel";
import { createAiRoutes } from "../server/ai/index.js";
import { createApp } from "../server/app.js";
import { createFoodRoutes } from "../server/food/index.js";
import { remoteSupabaseJwks } from "../server/jwks.js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const usdaApiKey = process.env.API_DATA_GOV_KEY;

const app = createApp({
  supabaseUrl,
  // Resolved lazily so /api/health works even when Supabase env is missing.
  jwks: remoteSupabaseJwks(supabaseUrl),
  commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
  // Left out when its env is missing, so other routes keep working and AI routes answer 503.
  ai:
    supabaseUrl && serviceRoleKey && anthropicApiKey
      ? createAiRoutes({ supabaseUrl, serviceRoleKey, anthropicApiKey })
      : undefined,
  food:
    supabaseUrl && serviceRoleKey && anthropicApiKey && usdaApiKey
      ? createFoodRoutes({
          supabaseUrl,
          serviceRoleKey,
          anthropicApiKey,
          usdaApiKey,
        })
      : undefined,
});

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
