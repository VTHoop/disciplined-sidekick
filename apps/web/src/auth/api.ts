import type { AuthClient } from "./auth-client";

/** `fetch` for our own `/api/*`: adds the signed-in user's access token, if there is one. */
export function createApiFetch(
  auth: Pick<AuthClient, "getSession">,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
) {
  return async (input: string, init: RequestInit = {}) => {
    const { data } = await auth.getSession();
    const headers = new Headers(init.headers);
    if (data.session) {
      headers.set("Authorization", `Bearer ${data.session.access_token}`);
    }
    return fetchImpl(input, { ...init, headers });
  };
}
