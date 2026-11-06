import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { createFakeFood } from "../food/fake-food";
import { createFakeTargets } from "../settings/fake-targets";
import { createFakeEntries } from "../today/fake-entries";
import { todayHeading } from "../today/test-utils";
import { createFakeAuth, makeSession } from "./fake-auth";

function renderApp(auth: ReturnType<typeof createFakeAuth>) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <App
        auth={auth}
        targets={createFakeTargets()}
        food={createFakeFood()}
        entries={createFakeEntries()}
      />
    </MemoryRouter>,
  );
}

describe("session", () => {
  it("restores a stored session on start", async () => {
    renderApp(createFakeAuth(makeSession()));
    expect(
      await screen.findByRole("heading", { level: 1, name: todayHeading() }),
    ).toBeTruthy();
  });

  it("returns to sign-in when the session can no longer be refreshed", async () => {
    const auth = createFakeAuth(makeSession());
    renderApp(auth);
    await screen.findByRole("heading", { level: 1, name: todayHeading() });
    act(() => auth.emit("SIGNED_OUT", null));
    expect(await screen.findByLabelText("Email")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { level: 1, name: todayHeading() }),
    ).toBeNull();
  });

  it("treats a failed session lookup as signed out", async () => {
    const auth = createFakeAuth();
    auth.getSession.mockRejectedValue(new Error("storage unavailable"));
    renderApp(auth);
    expect(await screen.findByLabelText("Email")).toBeTruthy();
  });

  it("follows a sign-in that happens in another tab", async () => {
    const auth = createFakeAuth();
    renderApp(auth);
    await screen.findByLabelText("Email");
    act(() => auth.emit("SIGNED_IN", makeSession()));
    expect(
      await screen.findByRole("heading", { level: 1, name: todayHeading() }),
    ).toBeTruthy();
  });

  it("stops listening when unmounted", async () => {
    const auth = createFakeAuth();
    const { unmount } = renderApp(auth);
    await waitFor(() => expect(auth.listenerCount()).toBe(1));
    unmount();
    expect(auth.listenerCount()).toBe(0);
  });

  it("stays signed in when the stored session can't be refreshed because the network is down", async () => {
    const auth = createFakeAuth(makeSession());
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });
    renderApp(auth);
    expect(
      await screen.findByRole("heading", { level: 1, name: todayHeading() }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("signs out when Supabase rejects the session", async () => {
    const auth = createFakeAuth(makeSession());
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError(
        "Invalid Refresh Token",
        400,
        "refresh_token_not_found",
      ),
    });
    renderApp(auth);
    expect(await screen.findByLabelText("Email")).toBeTruthy();
  });

  it("signs out when Supabase rejects the session after an offline start", async () => {
    const auth = createFakeAuth(makeSession());
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });
    renderApp(auth);
    await screen.findByRole("heading", { level: 1, name: todayHeading() });
    act(() => auth.emit("SIGNED_OUT", null));
    expect(await screen.findByLabelText("Email")).toBeTruthy();
  });
});

describe("session while offline", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the sign-in screen to a signed-out phone, and sending a code shows the offline error", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderApp(createFakeAuth());
    const email = await screen.findByLabelText("Email");
    expect(email).toBeTruthy();
  });
});
