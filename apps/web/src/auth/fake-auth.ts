import {
  AuthApiError,
  type AuthChangeEvent,
  type Session,
} from "@supabase/supabase-js";
import { vi } from "vitest";
import type { AuthClient } from "./auth-client";

export const VALID_CODE = "123456";

export function makeSession(accessToken = "access-token"): Session {
  return {
    access_token: accessToken,
    refresh_token: "refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "4f1c1f0e-8f0b-4a53-9b0c-0d2b7d3f6a11" },
  } as Session;
}

type Listener = (event: AuthChangeEvent, session: Session | null) => void;

/** In-memory stand-in for `supabase.auth` that behaves like the real client's contract. */
export function createFakeAuth(initial: Session | null = null) {
  let session = initial;
  const listeners = new Set<Listener>();

  const emit = (event: AuthChangeEvent, next: Session | null) => {
    session = next;
    for (const listener of listeners) listener(event, next);
  };

  return {
    emit,
    listenerCount: () => listeners.size,
    getSession: vi.fn<AuthClient["getSession"]>(async () => ({
      data: { session },
      error: null,
    })),
    onAuthStateChange: vi.fn<AuthClient["onAuthStateChange"]>((listener) => {
      listeners.add(listener);
      return {
        data: {
          subscription: { unsubscribe: () => listeners.delete(listener) },
        },
      };
    }),
    signInWithOtp: vi.fn<AuthClient["signInWithOtp"]>(async () => ({
      error: null,
    })),
    verifyOtp: vi.fn<AuthClient["verifyOtp"]>(async ({ token }) => {
      if (token !== VALID_CODE) {
        return {
          error: new AuthApiError(
            "Token has expired or is invalid",
            403,
            "otp_expired",
          ),
        };
      }
      emit("SIGNED_IN", makeSession());
      return { error: null };
    }),
    signOut: vi.fn<AuthClient["signOut"]>(async () => {
      emit("SIGNED_OUT", null);
      return { error: null };
    }),
  } satisfies AuthClient & { emit: unknown; listenerCount: unknown };
}

export type FakeAuth = ReturnType<typeof createFakeAuth>;

export const signupsDisabledError = () =>
  new AuthApiError("Signups not allowed for otp", 422, "otp_disabled");
