import { handle } from "hono/vercel";
import { createRemoteJWKSet } from "jose";
import { createApp } from "../server/app";

const supabaseUrl = process.env.SUPABASE_URL ?? "";

const app = createApp({
  supabaseUrl,
  // Resolved lazily so /api/health works even when Supabase env is missing.
  jwks: (header, token) =>
    createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`))(
      header,
      token,
    ),
  commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
});

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
