import { createClient } from "@supabase/supabase-js";

/** How long a Supabase request may take before it counts as failed. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Fails a request that stalls, headers or body, so a read that never answers
 * reaches the error and Retry path instead of leaving the screen loading. The
 * caller's own abort still works.
 */
export function withTimeout(fetchImpl: typeof fetch, ms: number): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(new DOMException("Request timed out", "TimeoutError")),
      ms,
    );
    const outer = init?.signal;
    if (outer?.aborted) controller.abort(outer.reason);
    else
      outer?.addEventListener("abort", () => controller.abort(outer.reason), {
        once: true,
      });
    const stop = () => clearTimeout(timer);
    return fetchImpl(input, { ...init, signal: controller.signal }).then(
      (response) => {
        if (!response.body) {
          stop();
          return response;
        }
        // The timer runs until the body has been read: the abort also ends a
        // body that stalls after the headers arrive.
        const body = response.body.pipeThrough(
          new TransformStream({ flush: stop }),
        );
        return new Response(body, response);
      },
      (error) => {
        stop();
        throw error;
      },
    );
  };
}

/** Browser client: the session lives in localStorage and refreshes until sign-out. */
export function createSupabaseClient(url: string, anonKey: string) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: window.localStorage,
    },
    global: {
      fetch: withTimeout(
        (input, init) => fetch(input, init),
        REQUEST_TIMEOUT_MS,
      ),
    },
  });
}
