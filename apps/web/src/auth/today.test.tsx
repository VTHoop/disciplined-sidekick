import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { createFakeAuth, makeSession } from "./fake-auth";

describe("Today placeholder", () => {
  it("has a heading and a sign-out button", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App auth={createFakeAuth(makeSession())} />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Today" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("signs out and returns to sign-in", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuth(makeSession());
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App auth={auth} />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText("Email")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Today" })).toBeNull();
  });
});
