import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { createFakeAuth, makeSession } from "../auth/fake-auth";
import { createFakeFood } from "../food/fake-food";
import { createFakeTargets } from "../settings/fake-targets";
import { createFakeEntries } from "../today/fake-entries";
import { loaded, todayHeading } from "../today/test-utils";
import { createFakeUpdates } from "./fake-update";

const LINE = "New version available";

function renderApp(
  updates = createFakeUpdates(),
  route = "/",
  signedIn = true,
) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <App
        auth={createFakeAuth(signedIn ? makeSession() : null)}
        targets={createFakeTargets()}
        food={createFakeFood()}
        entries={createFakeEntries()}
        updates={updates}
      />
    </MemoryRouter>,
  );
  return updates;
}

function setVisibility(state: "visible" | "hidden") {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => vi.restoreAllMocks());

describe("update line", () => {
  it("is absent while no new version is waiting", async () => {
    renderApp();
    await loaded();
    expect(screen.queryByText(LINE)).toBeNull();
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
  });

  it("checks for a new deploy when the app opens", async () => {
    const updates = renderApp();
    await loaded();
    expect(updates.check).toHaveBeenCalled();
  });

  it("checks again when the app comes back from the background, not when it leaves", async () => {
    const updates = renderApp();
    await loaded();
    updates.check.mockClear();
    act(() => setVisibility("hidden"));
    expect(updates.check).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    expect(updates.check).toHaveBeenCalledTimes(1);
  });

  it("appears above the content on Today when a new version is waiting", async () => {
    const updates = renderApp();
    await loaded();
    act(() => updates.publish());
    const line = screen.getByText(LINE);
    const heading = screen.getByRole("heading", {
      level: 1,
      name: todayHeading(),
    });
    expect(
      line.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("appears on Settings too", async () => {
    const updates = renderApp(createFakeUpdates(), "/settings");
    await screen.findByLabelText("Calories (kcal)");
    act(() => updates.publish());
    expect(screen.getByText(LINE)).toBeTruthy();
  });

  it("does not appear on the sign-in screen", async () => {
    const updates = renderApp(createFakeUpdates(), "/", false);
    await screen.findByLabelText("Email");
    act(() => updates.publish());
    expect(screen.queryByText(LINE)).toBeNull();
  });

  it("is announced once, in a status region, and stays in the page", async () => {
    const updates = renderApp();
    await loaded();
    act(() => updates.publish());
    expect(screen.getAllByText(LINE)).toHaveLength(1);
    const region = screen.getByText(LINE).closest("[role='status']");
    expect(region).toBeTruthy();
    // A second check or a re-render must not repeat the announcement.
    act(() => setVisibility("visible"));
    expect(screen.getAllByText(LINE)).toHaveLength(1);
  });

  it("never reloads by itself, and Reload applies the new version", async () => {
    const updates = renderApp();
    await loaded();
    act(() => updates.publish());
    expect(updates.reload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(updates.reload).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when the app has no update controller", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App
          auth={createFakeAuth(makeSession())}
          targets={createFakeTargets()}
          food={createFakeFood()}
          entries={createFakeEntries()}
        />
      </MemoryRouter>,
    );
    await loaded();
    expect(screen.queryByText(LINE)).toBeNull();
  });
});
