import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSupabaseClient,
  REQUEST_TIMEOUT_MS,
  withTimeout,
} from "./supabase-client";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: {} })),
}));

describe("createSupabaseClient", () => {
  it("keeps the session on the device and refreshes it until sign-out", () => {
    createSupabaseClient("https://example.supabase.co", "anon-key");
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: true,
          autoRefreshToken: true,
          storage: window.localStorage,
        }),
      }),
    );
  });

  it("returns the Supabase client", () => {
    expect(createSupabaseClient("u", "k")).toEqual({ auth: {} });
  });
});

describe("a stalled request", () => {
  afterEach(() => vi.useRealTimers());

  const stalls = () =>
    vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );

  it("gives the client a fetch that times out", () => {
    createSupabaseClient("u", "k");
    expect(createClient).toHaveBeenLastCalledWith(
      "u",
      "k",
      expect.objectContaining({
        global: expect.objectContaining({ fetch: expect.any(Function) }),
      }),
    );
  });

  it("rejects once the timeout passes, so a stall reaches the error and Retry path", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchImpl = stalls();
    const result = withTimeout(fetchImpl, REQUEST_TIMEOUT_MS)("https://x/y");
    const settled = expect(result).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
    await settled;
  });

  it("passes a prompt answer through and stops the timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const response = new Response("ok");
    const fetchImpl = vi.fn<typeof fetch>(async () => response);
    await expect(withTimeout(fetchImpl, 1000)("https://x/y")).resolves.toBe(
      response,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still honours the caller's own abort", async () => {
    const caller = new AbortController();
    const result = withTimeout(stalls(), 60_000)("https://x/y", {
      signal: caller.signal,
    });
    const settled = expect(result).rejects.toBeDefined();
    caller.abort();
    await settled;
  });
});
