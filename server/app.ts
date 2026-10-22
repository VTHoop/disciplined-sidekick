import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { errors, type JWTVerifyGetKey, jwtVerify } from "jose";

export interface AppOptions {
  supabaseUrl: string;
  jwks: JWTVerifyGetKey;
  commitSha?: string;
}

type Env = { Variables: { userId: string } };

// Errors that mean the key lookup failed, not that the caller's token is bad.
const KEY_LOOKUP_FAULT_CODES = new Set([
  "ERR_JWKS_TIMEOUT",
  "ERR_JOSE_GENERIC",
]);

function isKeyLookupFault(e: unknown): boolean {
  return !(e instanceof errors.JOSEError) || KEY_LOOKUP_FAULT_CODES.has(e.code);
}

export function createApp({
  supabaseUrl,
  jwks,
  commitSha = "unknown",
}: AppOptions) {
  const issuer = `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;

  const requireUser = createMiddleware<Env>(async (c, next) => {
    const token = c.req.header("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return c.json({ error: "unauthorized" }, 401);
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: "authenticated",
        algorithms: ["ES256", "RS256", "EdDSA"],
      });
      if (!payload.sub) return c.json({ error: "unauthorized" }, 401);
      c.set("userId", payload.sub);
    } catch (e) {
      if (isKeyLookupFault(e)) {
        console.error("JWT key lookup failed", e);
        return c.json({ error: "auth_unavailable" }, 503);
      }
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });

  return new Hono<Env>()
    .get("/api/health", (c) => c.json({ status: "ok", commit: commitSha }))
    .get("/api/me", requireUser, (c) => c.json({ id: c.get("userId") }));
}
