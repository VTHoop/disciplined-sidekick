import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { createFakeTargets } from "../settings/fake-targets";
import { createFakeAuth, makeSession } from "./fake-auth";

function renderApp(auth: ReturnType<typeof createFakeAuth>) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <App auth={auth} targets={createFakeTargets()} />
    </MemoryRouter>,
  );
}

describe("session", () => {
  it("restores a stored session on start", async () => {
    renderApp(createFakeAuth(makeSession()));
    expect(await screen.findByRole("heading", { name: "Today" })).toBeTruthy();
  });

  it("returns to sign-in when the session can no longer be refreshed", async () => {
    const auth = createFakeAuth(makeSession());
    renderApp(auth);
    await screen.findByRole("heading", { name: "Today" });
    act(() => auth.emit("SIGNED_OUT", null));
    expect(await screen.findByLabelText("Email")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Today" })).toBeNull();
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
    expect(await screen.findByRole("heading", { name: "Today" })).toBeTruthy();
  });

  it("stops listening when unmounted", async () => {
    const auth = createFakeAuth();
    const { unmount } = renderApp(auth);
    await waitFor(() => expect(auth.listenerCount()).toBe(1));
    unmount();
    expect(auth.listenerCount()).toBe(0);
  });
});
