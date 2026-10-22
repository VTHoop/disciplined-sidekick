import { handle } from "hono/vercel";
import { createApp } from "../server/app.js";
import { remoteSupabaseJwks } from "../server/jwks.js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";

const app = createApp({
  supabaseUrl,
  // Resolved lazily so /api/health works even when Supabase env is missing.
  jwks: remoteSupabaseJwks(supabaseUrl),
  commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
});

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
