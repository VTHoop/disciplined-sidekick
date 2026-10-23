import { createClient } from "@supabase/supabase-js";

/** Browser client: the session lives in localStorage and refreshes until sign-out. */
export function createSupabaseClient(url: string, anonKey: string) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: window.localStorage,
    },
  });
}
