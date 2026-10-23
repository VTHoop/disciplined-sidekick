import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { createFakeAuth, makeSession } from "./fake-auth";

function renderAt(path: string, signedIn: boolean) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App auth={createFakeAuth(signedIn ? makeSession() : null)} />
    </MemoryRouter>,
  );
}

describe("route guards", () => {
  it.each(["/", "/sign-in", "/some/other/screen"])(
    "shows sign-in for %s when signed out",
    async (path) => {
      renderAt(path, false);
      expect(await screen.findByLabelText("Email")).toBeTruthy();
      expect(screen.queryByRole("heading", { name: "Today" })).toBeNull();
    },
  );

  it.each(["/", "/sign-in"])(
    "shows Today for %s when signed in",
    async (path) => {
      renderAt(path, true);
      expect(
        await screen.findByRole("heading", { name: "Today" }),
      ).toBeTruthy();
      expect(screen.queryByLabelText("Email")).toBeNull();
    },
  );

  it("shows neither screen while the session is still loading", () => {
    renderAt("/", true);
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Today" })).toBeNull();
  });
});
