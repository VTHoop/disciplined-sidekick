import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import {
  createFakeAuth,
  type FakeAuth,
  signupsDisabledError,
  VALID_CODE,
} from "./fake-auth";

const EMAIL = "me@example.com";

function renderSignIn(auth: FakeAuth) {
  return render(
    <MemoryRouter initialEntries={["/sign-in"]}>
      <App auth={auth} />
    </MemoryRouter>,
  );
}

async function sendCode(
  user: ReturnType<typeof userEvent.setup>,
  email = EMAIL,
) {
  await user.type(await screen.findByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Send code" }));
  return screen.findByLabelText("6-digit code");
}

const codeSentMessage = (email: string) =>
  screen.getByRole("status").textContent?.replaceAll(email, "<email>");

describe("requesting a code", () => {
  it("sends the code without creating a user and moves to the code screen", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuth();
    renderSignIn(auth);
    await sendCode(user);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: EMAIL,
      options: { shouldCreateUser: false },
    });
    expect(screen.getByRole("status").textContent).toContain(EMAIL);
  });

  it("shows an unknown email the same code screen and message as a real one", async () => {
    const user = userEvent.setup();
    const known = createFakeAuth();
    const first = renderSignIn(known);
    await sendCode(user, EMAIL);
    const knownMessage = codeSentMessage(EMAIL);
    first.unmount();

    const unknown = createFakeAuth();
    unknown.signInWithOtp.mockResolvedValue({ error: signupsDisabledError() });
    renderSignIn(unknown);
    await sendCode(user, "nobody@example.com");
    expect(codeSentMessage("nobody@example.com")).toBe(knownMessage);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stays on the email screen and shows other errors", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuth();
    auth.signInWithOtp.mockResolvedValue({
      error: new AuthApiError(
        "Rate limited",
        429,
        "over_email_send_rate_limit",
      ),
    });
    renderSignIn(auth);
    await user.type(await screen.findByLabelText("Email"), EMAIL);
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });
});

describe("entering the code", () => {
  it("signs in with the correct code and lands on Today", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuth();
    renderSignIn(auth);
    await user.type(await sendCode(user), VALID_CODE);
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("heading", { name: "Today" })).toBeTruthy();
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: EMAIL,
      token: VALID_CODE,
      type: "email",
    });
  });

  it("shows an error and stays on the code screen for a wrong or expired code", async () => {
    const user = userEvent.setup();
    renderSignIn(createFakeAuth());
    await user.type(await sendCode(user), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /incorrect|invalid|expired/i,
    );
    expect(screen.getByLabelText("6-digit code")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Today" })).toBeNull();
  });

  it("gives an unknown email the ordinary wrong-code error", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuth();
    auth.signInWithOtp.mockResolvedValue({ error: signupsDisabledError() });
    // No code was ever issued, so Supabase rejects whatever is entered.
    auth.verifyOtp.mockResolvedValue({
      error: new AuthApiError(
        "Token has expired or is invalid",
        403,
        "otp_expired",
      ),
    });
    renderSignIn(auth);
    await user.type(await sendCode(user, "nobody@example.com"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /incorrect|invalid|expired/i,
    );
    expect(screen.getByLabelText("6-digit code")).toBeTruthy();
  });

  it("offers a new code and a different email", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuth();
    renderSignIn(auth);
    await sendCode(user);

    await user.click(screen.getByRole("button", { name: "Send a new code" }));
    await waitFor(() => expect(auth.signInWithOtp).toHaveBeenCalledTimes(2));
    expect(auth.signInWithOtp).toHaveBeenLastCalledWith({
      email: EMAIL,
      options: { shouldCreateUser: false },
    });
    expect(screen.getByLabelText("6-digit code")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Use a different email" }),
    );
    expect(await screen.findByLabelText("Email")).toBeTruthy();
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });
});

describe("in-flight requests", () => {
  it("disables Send code while the request is in flight", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuth();
    let release = () => {};
    auth.signInWithOtp.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ error: null });
        }),
    );
    renderSignIn(auth);
    await user.type(await screen.findByLabelText("Email"), EMAIL);
    const send = screen.getByRole("button", { name: "Send code" });
    await user.click(send);
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await user.click(send);
    expect(auth.signInWithOtp).toHaveBeenCalledTimes(1);
    release();
    await screen.findByLabelText("6-digit code");
  });

  it("disables Verify and Send a new code while verifying", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuth();
    let release = () => {};
    auth.verifyOtp.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ error: null });
        }),
    );
    renderSignIn(auth);
    await user.type(await sendCode(user), VALID_CODE);
    await user.click(screen.getByRole("button", { name: "Verify" }));
    for (const name of ["Verify", "Send a new code"]) {
      expect(
        (screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
      ).toBe(true);
    }
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Verify" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
  });
});

describe("offline", () => {
  it("shows an offline message instead of sending a code", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuth();
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderSignIn(auth);
    await user.type(await screen.findByLabelText("Email"), EMAIL);
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/offline/i);
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });

  it("shows an offline message when verifying fails at the network", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuth();
    auth.verifyOtp.mockResolvedValue({
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });
    renderSignIn(auth);
    await user.type(await sendCode(user), VALID_CODE);
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/offline/i);
    expect(screen.getByLabelText("6-digit code")).toBeTruthy();
  });
});

describe("accessibility", () => {
  it("labels both fields and announces errors in an alert region", async () => {
    const user = userEvent.setup();
    renderSignIn(createFakeAuth());
    expect(await screen.findByLabelText("Email")).toBeTruthy();
    const code = await sendCode(user);
    await user.type(code, "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("opens a numeric keypad and accepts one-time-code autofill", async () => {
    const user = userEvent.setup();
    renderSignIn(createFakeAuth());
    const code = await sendCode(user);
    expect(code.getAttribute("inputmode")).toBe("numeric");
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect(code.getAttribute("maxlength")).toBe("6");
  });

  it("asks the email field for email autofill and keyboard", async () => {
    renderSignIn(createFakeAuth());
    const email = await screen.findByLabelText("Email");
    expect(email.getAttribute("type")).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");
  });
});

describe("keyboard only", () => {
  it("completes the whole flow with Tab and Enter", async () => {
    const user = userEvent.setup();
    renderSignIn(createFakeAuth());
    const email = await screen.findByLabelText("Email");
    await user.tab();
    expect(document.activeElement).toBe(email);
    await user.keyboard(`${EMAIL}{Enter}`);

    const code = await screen.findByLabelText("6-digit code");
    await waitFor(() => expect(document.activeElement).toBe(code));
    await user.keyboard(`${VALID_CODE}{Enter}`);
    expect(await screen.findByRole("heading", { name: "Today" })).toBeTruthy();
  });

  it("tabs through the code screen in reading order", async () => {
    const user = userEvent.setup();
    renderSignIn(createFakeAuth());
    const code = await sendCode(user);
    await waitFor(() => expect(document.activeElement).toBe(code));
    for (const name of ["Verify", "Send a new code", "Use a different email"]) {
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole("button", { name }));
    }
  });
});
