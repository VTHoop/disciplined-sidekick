import {
  AuthApiError,
  type AuthError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js";
import type { AuthClient } from "./auth-client";

export type RequestCodeResult =
  | { status: "sent" }
  | { status: "offline" }
  | { status: "error"; message: string };

export type VerifyCodeResult =
  | { status: "verified" }
  | { status: "invalid" }
  | { status: "offline" }
  | { status: "error"; message: string };

// Supabase answers these when `shouldCreateUser` is false and the email has no
// account. Reporting them as "sent" keeps an unknown email indistinguishable.
const SIGNUP_DISABLED_CODES = new Set(["otp_disabled", "signup_disabled"]);

const isOffline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false;

function isNetworkFailure(e: unknown): boolean {
  return (
    e instanceof TypeError || (isAuthRetryableFetchError(e) && e.status === 0)
  );
}

type Outcome =
  | { kind: "ok" }
  | { kind: "offline" }
  | { kind: "failed"; error: unknown };

async function attempt(
  call: () => Promise<{ error: AuthError | null }>,
): Promise<Outcome> {
  if (isOffline()) return { kind: "offline" };
  try {
    const { error } = await call();
    if (!error) return { kind: "ok" };
    return isNetworkFailure(error)
      ? { kind: "offline" }
      : { kind: "failed", error };
  } catch (error) {
    return isNetworkFailure(error)
      ? { kind: "offline" }
      : { kind: "failed", error };
  }
}

function failureMessage(error: unknown): string {
  return error instanceof AuthApiError && error.status === 429
    ? "Too many attempts. Wait a moment and try again."
    : "Something went wrong. Try again.";
}

export async function requestCode(
  auth: AuthClient,
  email: string,
): Promise<RequestCodeResult> {
  const outcome = await attempt(() =>
    auth.signInWithOtp({ email, options: { shouldCreateUser: false } }),
  );
  if (outcome.kind === "ok") return { status: "sent" };
  if (outcome.kind === "offline") return { status: "offline" };
  const { error } = outcome;
  if (
    error instanceof AuthApiError &&
    SIGNUP_DISABLED_CODES.has(error.code ?? "")
  ) {
    return { status: "sent" };
  }
  return { status: "error", message: failureMessage(error) };
}

export async function verifyCode(
  auth: AuthClient,
  email: string,
  token: string,
): Promise<VerifyCodeResult> {
  const outcome = await attempt(() =>
    auth.verifyOtp({ email, token, type: "email" }),
  );
  if (outcome.kind === "ok") return { status: "verified" };
  if (outcome.kind === "offline") return { status: "offline" };
  const { error } = outcome;
  if (
    error instanceof AuthApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 429
  ) {
    return { status: "invalid" };
  }
  return { status: "error", message: failureMessage(error) };
}
