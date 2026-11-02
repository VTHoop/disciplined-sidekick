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

  it("passes a prompt answer through and stops the timer once the body has been read", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("ok"));
    const response = await withTimeout(fetchImpl, 1000)("https://x/y");
    expect(await response.text()).toBe("ok");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("also times out a body that stalls after the headers arrive", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () =>
            controller.error(init.signal?.reason),
          );
        },
      });
      return new Response(body);
    });
    const response = await withTimeout(fetchImpl, 1000)("https://x/y");
    const read = expect(response.text()).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(1001);
    await read;
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
