import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { createFakeFood } from "../food/fake-food";
import { createFakeTargets } from "../settings/fake-targets";
import { createFakeEntries } from "../today/fake-entries";
import { todayHeading } from "../today/test-utils";
import { createFakeAuth, makeSession } from "./fake-auth";

function renderAt(path: string, signedIn: boolean) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App
        auth={createFakeAuth(signedIn ? makeSession() : null)}
        targets={createFakeTargets()}
        food={createFakeFood()}
        entries={createFakeEntries()}
      />
    </MemoryRouter>,
  );
}

describe("route guards", () => {
  it.each(["/", "/sign-in", "/settings", "/some/other/screen"])(
    "shows sign-in for %s when signed out",
    async (path) => {
      renderAt(path, false);
      expect(await screen.findByLabelText("Email")).toBeTruthy();
      expect(
        screen.queryByRole("heading", { level: 1, name: todayHeading() }),
      ).toBeNull();
    },
  );

  it.each(["/", "/sign-in"])(
    "shows Today for %s when signed in",
    async (path) => {
      renderAt(path, true);
      expect(
        await screen.findByRole("heading", { level: 1, name: todayHeading() }),
      ).toBeTruthy();
      expect(screen.queryByLabelText("Email")).toBeNull();
    },
  );

  it("shows Settings for /settings when signed in", async () => {
    renderAt("/settings", true);
    expect(
      await screen.findByRole("heading", { name: "Settings" }),
    ).toBeTruthy();
  });

  it("shows neither screen while the session is still loading", () => {
    renderAt("/", true);
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(
      screen.queryByRole("heading", { level: 1, name: todayHeading() }),
    ).toBeNull();
  });
});
