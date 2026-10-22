import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { type JWTVerifyGetKey, jwtVerify } from "jose";

export interface AppOptions {
  supabaseUrl: string;
  jwks: JWTVerifyGetKey;
  commitSha?: string;
}

type Env = { Variables: { userId: string } };

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
    } catch {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });

  return new Hono<Env>()
    .get("/api/health", (c) => c.json({ status: "ok", commit: commitSha }))
    .get("/api/me", requireUser, (c) => c.json({ id: c.get("userId") }));
}
