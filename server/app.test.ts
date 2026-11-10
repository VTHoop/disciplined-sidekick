import {
  type CryptoKey,
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  SignJWT,
  UnsecuredJWT,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  AiApiError,
  AiRefusalError,
  AiTruncatedError,
  AiValidationError,
} from "./ai/errors";
import { type AiRoutes, createApp, type FoodRoutes } from "./app";
import { FoodLookupError, NoFoodError } from "./food/log-food";
import { UsdaError } from "./food/usda";

const SUPABASE_URL = "https://example.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const USER_ID = "4f1c1f0e-8f0b-4a53-9b0c-0d2b7d3f6a11";
const KID = "test-key";

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let app: ReturnType<typeof createApp>;
let jwks: ReturnType<typeof createLocalJWKSet>;

interface SignOptions {
  exp?: string | number;
  sub?: string | null;
  iss?: string;
  aud?: string;
}

async function sign(
  key: CryptoKey | Uint8Array,
  {
    exp = "1h",
    sub = USER_ID,
    iss = ISSUER,
    aud = "authenticated",
  }: SignOptions = {},
  alg = "ES256",
) {
  const jwt = new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg, kid: KID })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(exp);
  if (sub !== null) jwt.setSubject(sub);
  return jwt.sign(key);
}

const get = (path: string, token?: string, scheme = "Bearer") =>
  app.request(path, {
    headers: token ? { Authorization: `${scheme} ${token}` } : {},
  });

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  const other = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  otherPrivateKey = other.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "ES256" };
  jwks = createLocalJWKSet({ keys: [jwk] });
  app = createApp({ supabaseUrl: SUPABASE_URL, jwks, commitSha: "abc1234" });
});

describe("GET /api/health", () => {
  it("returns 200 with a status and the deployed commit SHA, without auth", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", commit: "abc1234" });
  });
});

describe("GET /api/me", () => {
  it("returns the caller's user id for a valid token", async () => {
    const res = await get("/api/me", await sign(privateKey));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: USER_ID });
  });

  it("returns 401 when the token is missing", async () => {
    expect((await get("/api/me")).status).toBe(401);
  });

  it("returns 401 when the token is expired", async () => {
    const expired = await sign(privateKey, {
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    expect((await get("/api/me", expired)).status).toBe(401);
  });

  it("returns 401 when the payload was tampered with", async () => {
    const [header, , signature] = (await sign(privateKey)).split(".");
    const forged = Buffer.from(
      JSON.stringify({
        sub: "someone-else",
        iss: ISSUER,
        aud: "authenticated",
      }),
    ).toString("base64url");
    expect(
      (await get("/api/me", `${header}.${forged}.${signature}`)).status,
    ).toBe(401);
  });

  it("returns 401 when signed by a different key", async () => {
    expect((await get("/api/me", await sign(otherPrivateKey))).status).toBe(
      401,
    );
  });
});

describe("GET /api/me claim and header validation", () => {
  it("rejects a validly signed token from another issuer", async () => {
    const token = await sign(privateKey, {
      iss: "https://other.supabase.co/auth/v1",
    });
    expect((await get("/api/me", token)).status).toBe(401);
  });

  it("rejects a validly signed token for another audience", async () => {
    const token = await sign(privateKey, { aud: "anon" });
    expect((await get("/api/me", token)).status).toBe(401);
  });

  it("rejects a validly signed token without a subject", async () => {
    const token = await sign(privateKey, { sub: null });
    expect((await get("/api/me", token)).status).toBe(401);
  });

  it("rejects a token signed with a disallowed algorithm (HS256)", async () => {
    const secret = new TextEncoder().encode("0123456789abcdef0123456789abcdef");
    const token = await sign(secret, {}, "HS256");
    expect((await get("/api/me", token)).status).toBe(401);
  });

  it("rejects an algorithm outside the allow-list even when its key is trusted", async () => {
    const es384 = await generateKeyPair("ES384");
    const jwk = {
      ...(await exportJWK(es384.publicKey)),
      kid: "es384-key",
      alg: "ES384",
    };
    const withKey = createApp({
      supabaseUrl: SUPABASE_URL,
      jwks: createLocalJWKSet({ keys: [jwk] }),
    });
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES384", kid: "es384-key" })
      .setSubject(USER_ID)
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(es384.privateKey);
    const res = await withKey.request("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects an unsecured (alg none) token", async () => {
    const token = new UnsecuredJWT({ role: "authenticated" })
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setSubject(USER_ID)
      .setExpirationTime("1h")
      .encode();
    expect((await get("/api/me", token)).status).toBe(401);
  });

  it("rejects a non-Bearer Authorization header", async () => {
    const token = await sign(privateKey);
    expect((await get("/api/me", token, "Basic")).status).toBe(401);
  });
});

describe("GET /api/me when key lookup fails", () => {
  const appWithJwks = (jwks: () => Promise<never>) =>
    createApp({ supabaseUrl: SUPABASE_URL, jwks });

  it("returns 503, not 401, when the JWKS fetch times out", async () => {
    const failing = appWithJwks(async () => {
      throw new errors.JWKSTimeout();
    });
    const res = await failing.request("/api/me", {
      headers: { Authorization: `Bearer ${await sign(privateKey)}` },
    });
    expect(res.status).toBe(503);
  });

  it("returns 503 when the key set cannot be built (e.g. missing config)", async () => {
    const failing = appWithJwks(async () => {
      throw new TypeError("Invalid URL");
    });
    const res = await failing.request("/api/me", {
      headers: { Authorization: `Bearer ${await sign(privateKey)}` },
    });
    expect(res.status).toBe(503);
  });

  it("returns 503 when the JWKS endpoint answers with a non-200", async () => {
    const failing = appWithJwks(async () => {
      throw new errors.JOSEError(
        "Expected 200 OK from the JSON Web Key Set HTTP response",
      );
    });
    const res = await failing.request("/api/me", {
      headers: { Authorization: `Bearer ${await sign(privateKey)}` },
    });
    expect(res.status).toBe(503);
  });

  it("still returns 401 when the token's key id is unknown", async () => {
    const unknownKid = appWithJwks(async () => {
      throw new errors.JWKSNoMatchingKey();
    });
    const res = await unknownKid.request("/api/me", {
      headers: { Authorization: `Bearer ${await sign(privateKey)}` },
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/ai/demo", () => {
  const post = (
    appUnderTest: ReturnType<typeof createApp>,
    body: unknown,
    token?: string,
  ) =>
    appUnderTest.request("/api/ai/demo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  const withDemo = (demo: AiRoutes["demo"]) =>
    createApp({ supabaseUrl: SUPABASE_URL, jwks, ai: { demo } });

  it("returns 401 without a token and never calls the AI function", async () => {
    let called = false;
    const guarded = withDemo(async () => {
      called = true;
      return { category: "snack" as const };
    });
    expect((await post(guarded, { text: "toast" })).status).toBe(401);
    expect(called).toBe(false);
  });

  it("passes the text and the caller's user id and returns the parsed output", async () => {
    const seen: unknown[] = [];
    const ok = withDemo(async (input, userId) => {
      seen.push(input, userId);
      return { category: "breakfast" as const };
    });
    const res = await post(ok, { text: "toast" }, await sign(privateKey));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ category: "breakfast" });
    expect(seen).toEqual([{ text: "toast" }, USER_ID]);
  });

  it.each([[{}], [{ text: "" }], [{ text: 42 }], [{ text: "x".repeat(2001) }]])(
    "returns 400 for an invalid body %j",
    async (body) => {
      const ok = withDemo(async () => ({ category: "snack" as const }));
      expect((await post(ok, body, await sign(privateKey))).status).toBe(400);
    },
  );

  it.each([
    [
      new AiRefusalError({
        type: "refusal",
        category: null,
        explanation: null,
      }),
      422,
      "ai_refusal",
    ],
    [new AiValidationError([]), 502, "ai_validation_error"],
    [new AiTruncatedError(), 502, "ai_truncated"],
    [new AiApiError("down", 3), 502, "ai_api_error"],
  ])("maps %s to %i %s", async (error, status, code) => {
    const failing = withDemo(async () => {
      throw error;
    });
    const res = await post(failing, { text: "toast" }, await sign(privateKey));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: code });
  });

  it("returns 503 when AI is not configured", async () => {
    const res = await post(app, { text: "toast" }, await sign(privateKey));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "ai_unavailable" });
  });
});

describe("POST /api/food/parse", () => {
  const preview = {
    entryId: "7d0c4a52-2f8e-4b8e-9a51-5b8a8c1f0e01",
    text: "150 g blueberries",
    items: [],
    totals: { kcal: 0, protein: 0, fruitVegG: 0 },
  };

  const post = (
    appUnderTest: ReturnType<typeof createApp>,
    body: unknown,
    token?: string,
  ) =>
    appUnderTest.request("/api/food/parse", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  const withFood = (parse: FoodRoutes["parse"]) =>
    createApp({ supabaseUrl: SUPABASE_URL, jwks, food: { parse } });

  it("returns 401 without a token and never parses", async () => {
    let called = false;
    const guarded = withFood(async () => {
      called = true;
      return preview;
    });
    expect((await post(guarded, { text: "egg" })).status).toBe(401);
    expect(called).toBe(false);
  });

  it("passes the trimmed text and the caller's user id and returns the preview", async () => {
    const seen: unknown[] = [];
    const ok = withFood(async (text, userId) => {
      seen.push(text, userId);
      return preview;
    });
    const res = await post(
      ok,
      { text: "  150 g blueberries \n" },
      await sign(privateKey),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(preview);
    expect(seen).toEqual(["150 g blueberries", USER_ID]);
  });

  it("keeps line breaks, trims each line and drops blank lines", async () => {
    const seen: string[] = [];
    const ok = withFood(async (text) => {
      seen.push(text);
      return preview;
    });
    const res = await post(
      ok,
      { text: "  2 eggs  \n\n   \r\n150 g blueberries\t\n\n" },
      await sign(privateKey),
    );
    expect(res.status).toBe(200);
    expect(seen).toEqual(["2 eggs\n150 g blueberries"]);
  });

  it("counts line breaks and untrimmed whitespace toward the 2000 limit", async () => {
    const ok = withFood(async () => preview);
    const token = await sign(privateKey);
    const lines = (n: number) => `${"x\n".repeat(n)}`;
    expect((await post(ok, { text: lines(1000) }, token)).status).toBe(200);
    expect((await post(ok, { text: `${lines(1000)}\n` }, token)).status).toBe(
      400,
    );
    expect(
      (await post(ok, { text: `${" ".repeat(2000)}x` }, token)).status,
    ).toBe(400);
  });

  it.each([
    [{}],
    [{ text: "" }],
    [{ text: "   " }],
    [{ text: "\n\t " }],
    [{ text: "\n \n\n" }],
    [{ text: 42 }],
    [{ text: "x".repeat(2001) }],
    [{ text: "x\n".repeat(1001) }],
  ])("returns 400 for %j and never parses", async (body) => {
    let called = false;
    const ok = withFood(async () => {
      called = true;
      return preview;
    });
    expect((await post(ok, body, await sign(privateKey))).status).toBe(400);
    expect(called).toBe(false);
  });

  it("returns 422 no_food when the entry holds no food", async () => {
    const none = withFood(async () => {
      throw new NoFoodError();
    });
    const res = await post(none, { text: "hello" }, await sign(privateKey));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "no_food" });
  });

  it.each([
    ["malformed AI output", new AiValidationError([])],
    ["an AI refusal", new AiRefusalError(null)],
    ["truncated AI output", new AiTruncatedError()],
    ["an AI API failure", new AiApiError("down", 3)],
    ["a USDA error", new UsdaError("USDA search failed: 503")],
    ["a pick outside the candidates", new FoodLookupError("not a candidate")],
  ])("returns 502 food_lookup_failed for %s", async (_, error) => {
    const failing = withFood(async () => {
      throw error;
    });
    const res = await post(failing, { text: "egg" }, await sign(privateKey));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "food_lookup_failed" });
  });

  it("returns 503 when food logging is not configured", async () => {
    const res = await post(app, { text: "egg" }, await sign(privateKey));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "food_unavailable" });
  });
});
