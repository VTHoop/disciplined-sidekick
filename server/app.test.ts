import {
  type CryptoKey,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
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

async function sign(
  key: CryptoKey,
  { exp = "1h", sub = USER_ID }: { exp?: string | number; sub?: string } = {},
) {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: KID })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience("authenticated")
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(exp)
    .sign(key);
}

const get = (path: string, token?: string) =>
  app.request(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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
