import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { errors, type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";
import { cleanLines, type FoodPreview } from "../packages/core/src/index.js";
import { AiError, AiRefusalError } from "./ai/errors.js";
import type { DemoInput, DemoOutput } from "./ai/functions/demo.js";
import { FoodLookupError, NoFoodError } from "./food/log-food.js";
import { UsdaError } from "./food/usda.js";

/** The typed AI functions the HTTP layer can call, bound to their dependencies. */
export interface AiRoutes {
  demo(input: DemoInput, userId: string): Promise<DemoOutput>;
}

/** Food logging bound to its dependencies. */
export interface FoodRoutes {
  parse(text: string, userId: string): Promise<FoodPreview>;
}

export interface AppOptions {
  supabaseUrl: string;
  jwks: JWTVerifyGetKey;
  commitSha?: string;
  /** Absent when AI is not configured (e.g. no API key); AI routes then answer 503. */
  ai?: AiRoutes;
  /** Absent when food logging is not configured (AI or USDA env missing); its routes then answer 503. */
  food?: FoodRoutes;
}

const demoBody = z.object({ text: z.string().min(1).max(2000) });
const foodBody = z.object({
  text: z.string().max(2000).transform(cleanLines).pipe(z.string().min(1)),
});

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
  ai,
  food,
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
    .get("/api/me", requireUser, (c) => c.json({ id: c.get("userId") }))
    .post("/api/ai/demo", requireUser, async (c) => {
      if (!ai) return c.json({ error: "ai_unavailable" }, 503);
      const body = demoBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ error: "invalid_request" }, 400);
      try {
        return c.json(await ai.demo(body.data, c.get("userId")));
      } catch (e) {
        if (e instanceof AiError) {
          const status = e instanceof AiRefusalError ? 422 : 502;
          return c.json({ error: `ai_${e.kind}` }, status);
        }
        throw e;
      }
    })
    .post("/api/food/parse", requireUser, async (c) => {
      if (!food) return c.json({ error: "food_unavailable" }, 503);
      const body = foodBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ error: "invalid_request" }, 400);
      try {
        return c.json(await food.parse(body.data.text, c.get("userId")));
      } catch (e) {
        if (e instanceof NoFoodError) return c.json({ error: "no_food" }, 422);
        if (
          e instanceof AiError ||
          e instanceof UsdaError ||
          e instanceof FoodLookupError
        ) {
          console.error("food lookup failed", e);
          return c.json({ error: "food_lookup_failed" }, 502);
        }
        throw e;
      }
    });
}
