import type {
  AuthChangeEvent,
  AuthError,
  Session,
} from "@supabase/supabase-js";

/** The slice of `supabase.auth` the app uses, so screens can be tested without a network. */
export interface AuthClient {
  getSession(): Promise<{
    data: { session: Session | null };
    error: AuthError | null;
  }>;
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ): { data: { subscription: { unsubscribe(): void } } };
  signInWithOtp(params: {
    email: string;
    options?: { shouldCreateUser?: boolean };
  }): Promise<{ error: AuthError | null }>;
  verifyOtp(params: {
    email: string;
    token: string;
    type: "email";
  }): Promise<{ error: AuthError | null }>;
  signOut(options?: {
    scope?: "global" | "local" | "others";
  }): Promise<{ error: AuthError | null }>;
}
