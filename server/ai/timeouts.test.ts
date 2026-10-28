import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAnthropicClient } from "./client";
import { BASE_BACKOFF_MS, MAX_RETRIES } from "./run";
import {
  fetchWithTimeout,
  REQUEST_TIMEOUT_MS,
  STORE_TIMEOUT_MS,
  USDA_TIMEOUT_MS,
} from "./timeouts";

describe("per-attempt timeouts", () => {
  it("bounds each Anthropic attempt instead of using the SDK's 10-minute default", () => {
    const client = createAnthropicClient("sk-ant-test");
    expect(client.timeout).toBe(REQUEST_TIMEOUT_MS);
    expect(client.maxRetries).toBe(0);
  });

  const { functions } = JSON.parse(
    readFileSync(join(import.meta.dirname, "../../vercel.json"), "utf8"),
  );
  const maxDurationMs = functions["api/index.ts"].maxDuration * 1000;
  let backoffMs = 0;
  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    backoffMs += BASE_BACKOFF_MS * 2 ** retry;
  }
  /** One AI function call at its worst: every attempt times out, then the row is written. */
  const oneCallWorstMs =
    (MAX_RETRIES + 1) * REQUEST_TIMEOUT_MS + backoffMs + STORE_TIMEOUT_MS;

  it("keeps every attempt, the backoffs and the row write of one AI call inside the function's max duration", () => {
    // Leave headroom so the row is written and the response returned before Vercel kills the function.
    expect(oneCallWorstMs).toBeLessThanOrEqual(maxDurationMs - 30_000);
  });

  // Known exception, documented in ARCHITECTURE.md → Food logging: an entry
  // runs parse, then per item a USDA search, a pick and an estimate, in
  // sequence. If this starts passing the budget, update the docs.
  it("records that POST /api/food/parse can outlast the max duration in a long outage", () => {
    const foodWorstMs = 3 * oneCallWorstMs + STORE_TIMEOUT_MS + USDA_TIMEOUT_MS;
    expect(foodWorstMs).toBeGreaterThan(maxDurationMs);
  });
});

describe("fetchWithTimeout", () => {
  const hangingFetch = ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(init.signal?.reason),
      );
    })) as typeof fetch;

  it("aborts a request that outlives the timeout", async () => {
    const guarded = fetchWithTimeout(20, hangingFetch);
    await expect(guarded("https://example.test/")).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("still honours the caller's own abort signal", async () => {
    const guarded = fetchWithTimeout(60_000, hangingFetch);
    const controller = new AbortController();
    const pending = guarded("https://example.test/", {
      signal: controller.signal,
    });
    controller.abort(new Error("caller gave up"));
    await expect(pending).rejects.toThrow("caller gave up");
  });

  it("passes the request through when it finishes in time", async () => {
    const ok = (async () => new Response("ok")) as unknown as typeof fetch;
    const res = await fetchWithTimeout(1000, ok)("https://example.test/");
    expect(await res.text()).toBe("ok");
  });
});
