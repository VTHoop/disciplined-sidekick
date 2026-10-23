import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createFakeAuth } from "./fake-auth";
import { requestCode, verifyCode } from "./otp-client";

const EMAIL = "me@example.com";

function goOffline() {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
}

describe("requestCode", () => {
  it("asks Supabase for a code without ever creating a user", async () => {
    const auth = createFakeAuth();
    expect(await requestCode(auth, EMAIL)).toEqual({ status: "sent" });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: EMAIL,
      options: { shouldCreateUser: false },
    });
  });

  it.each([
    ["otp_disabled", 422],
    ["signup_disabled", 422],
  ])(
    "reports %s as sent so an unknown email is indistinguishable",
    async (code, status) => {
      const auth = createFakeAuth();
      auth.signInWithOtp.mockResolvedValue({
        error: new AuthApiError("Signups not allowed", status, code),
      });
      expect(await requestCode(auth, "nobody@example.com")).toEqual({
        status: "sent",
      });
    },
  );

  it("surfaces other API errors such as a rate limit", async () => {
    const auth = createFakeAuth();
    auth.signInWithOtp.mockResolvedValue({
      error: new AuthApiError(
        "Rate limited",
        429,
        "over_email_send_rate_limit",
      ),
    });
    expect(await requestCode(auth, EMAIL)).toMatchObject({ status: "error" });
  });

  it("reports offline without calling Supabase when the browser is offline", async () => {
    const auth = createFakeAuth();
    goOffline();
    expect(await requestCode(auth, EMAIL)).toEqual({ status: "offline" });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("reports offline when the request fails at the network", async () => {
    const auth = createFakeAuth();
    auth.signInWithOtp.mockResolvedValue({
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });
    expect(await requestCode(auth, EMAIL)).toEqual({ status: "offline" });

    auth.signInWithOtp.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await requestCode(auth, EMAIL)).toEqual({ status: "offline" });
  });
});

describe("verifyCode", () => {
  it("verifies an email code", async () => {
    const auth = createFakeAuth();
    expect(await verifyCode(auth, EMAIL, "123456")).toEqual({
      status: "verified",
    });
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: EMAIL,
      token: "123456",
      type: "email",
    });
  });

  it("reports a wrong or expired code as invalid", async () => {
    const auth = createFakeAuth();
    expect(await verifyCode(auth, EMAIL, "000000")).toEqual({
      status: "invalid",
    });
  });

  it("does not call a server fault an invalid code", async () => {
    const auth = createFakeAuth();
    auth.verifyOtp.mockResolvedValue({
      error: new AuthApiError("Internal error", 500, "unexpected_failure"),
    });
    expect(await verifyCode(auth, EMAIL, "123456")).toMatchObject({
      status: "error",
    });
  });

  it("reports offline when the browser is offline or the request fails", async () => {
    const auth = createFakeAuth();
    auth.verifyOtp.mockResolvedValue({
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });
    expect(await verifyCode(auth, EMAIL, "123456")).toEqual({
      status: "offline",
    });

    goOffline();
    auth.verifyOtp.mockClear();
    expect(await verifyCode(auth, EMAIL, "123456")).toEqual({
      status: "offline",
    });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
});
