import { describe, expect, it, vi } from "vitest";
import { createApiFetch } from "./api";
import { createFakeAuth, makeSession } from "./fake-auth";

function setup(signedIn: boolean) {
  const auth = createFakeAuth(signedIn ? makeSession("tok-123") : null);
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}"));
  return { auth, fetchImpl, apiFetch: createApiFetch(auth, fetchImpl) };
}

const authorization = (fetchImpl: ReturnType<typeof setup>["fetchImpl"]) =>
  new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get("Authorization");

describe("apiFetch", () => {
  it("sends the access token as a bearer token when signed in", async () => {
    const { apiFetch, fetchImpl } = setup(true);
    await apiFetch("/api/me");
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/me");
    expect(authorization(fetchImpl)).toBe("Bearer tok-123");
  });

  it("sends no Authorization header when signed out, so the server answers 401", async () => {
    const { apiFetch, fetchImpl } = setup(false);
    await apiFetch("/api/me");
    expect(authorization(fetchImpl)).toBeNull();
  });

  it("stops sending the token once the user signs out", async () => {
    const { auth, apiFetch, fetchImpl } = setup(true);
    await auth.signOut();
    await apiFetch("/api/me");
    expect(authorization(fetchImpl)).toBeNull();
  });

  it("keeps the caller's own headers and options", async () => {
    const { apiFetch, fetchImpl } = setup(true);
    await apiFetch("/api/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });
});
