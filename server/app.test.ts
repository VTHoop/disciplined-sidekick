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
import { createApp } from "./app";

const SUPABASE_URL = "https://example.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const USER_ID = "4f1c1f0e-8f0b-4a53-9b0c-0d2b7d3f6a11";
const KID = "test-key";

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let app: ReturnType<typeof createApp>;

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
  app = createApp({
    supabaseUrl: SUPABASE_URL,
    jwks: createLocalJWKSet({ keys: [jwk] }),
    commitSha: "abc1234",
  });
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
