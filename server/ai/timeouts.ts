/**
 * Time limits for the AI path. The Vercel function is killed at its max
 * duration (vercel.json), and the runner writes its ai_runs row only after the
 * last attempt, so attempts x REQUEST_TIMEOUT_MS + backoffs + STORE_TIMEOUT_MS
 * must stay well under it. timeouts.test.ts checks that.
 */

/** Per Anthropic attempt; the SDK default is 10 minutes. */
export const REQUEST_TIMEOUT_MS = 45_000;

/** For the ai_runs insert. */
export const STORE_TIMEOUT_MS = 10_000;

/** Per USDA FoodData Central search. */
export const USDA_TIMEOUT_MS = 10_000;

/** Wraps fetch so a stalled request is aborted after `ms`, and still honours the caller's own signal. */
export function fetchWithTimeout(
  ms: number,
  baseFetch: typeof fetch = fetch,
): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    return baseFetch(input, { ...init, signal });
  };
}
