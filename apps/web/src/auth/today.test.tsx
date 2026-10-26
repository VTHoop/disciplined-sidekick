import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { createFakeTargets } from "../settings/fake-targets";
import { createFakeAuth, makeSession } from "./fake-auth";

describe("Today placeholder", () => {
  it("has a heading and a sign-out button", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App
          auth={createFakeAuth(makeSession())}
          targets={createFakeTargets()}
        />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Today" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("links to Settings", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App
          auth={createFakeAuth(makeSession())}
          targets={createFakeTargets()}
        />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("link", { name: "Settings" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Settings" }),
    ).toBeTruthy();
  });

  it("signs out and returns to sign-in", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuth(makeSession());
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App auth={auth} targets={createFakeTargets()} />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText("Email")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Today" })).toBeNull();
  });

  it("still drops the session from this device when the server call fails offline", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuth(makeSession());
    auth.signOut.mockResolvedValueOnce({
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App auth={auth} targets={createFakeTargets()} />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: "local" });
    expect(await screen.findByLabelText("Email")).toBeTruthy();
  });
});
