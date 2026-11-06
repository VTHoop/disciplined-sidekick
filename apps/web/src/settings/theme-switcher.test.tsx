import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { createFakeAuth, makeSession } from "../auth/fake-auth";
import { createFakeFood } from "../food/fake-food";
import { THEME_KEY } from "../theme";
import { createFakeEntries } from "../today/fake-entries";
import { createFakeTargets } from "./fake-targets";

function renderSettings(
  targets = createFakeTargets(),
  auth = createFakeAuth(makeSession()),
) {
  render(
    <MemoryRouter initialEntries={["/settings"]}>
      <App
        auth={auth}
        targets={targets}
        food={createFakeFood()}
        entries={createFakeEntries()}
      />
    </MemoryRouter>,
  );
  return { targets, auth };
}

const group = () => screen.findByRole("group", { name: "Theme" });
const radio = (name: string) => screen.getByRole("radio", { name });

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("Theme control", () => {
  it("is one group labelled Theme holding Light, Dark and System, in that order", async () => {
    renderSettings();
    const radios = within(await group()).getAllByRole("radio");
    expect(
      radios.map((r) => (r as HTMLInputElement).labels?.[0]?.textContent),
    ).toEqual(["Light", "Dark", "System"]);
  });

  it("starts on System when nothing has been chosen", async () => {
    renderSettings();
    await group();
    expect(radio("System")).toHaveProperty("checked", true);
    expect(radio("Light")).toHaveProperty("checked", false);
    expect(radio("Dark")).toHaveProperty("checked", false);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("starts on the stored choice", async () => {
    localStorage.setItem(THEME_KEY, "dark");
    renderSettings();
    await group();
    expect(radio("Dark")).toHaveProperty("checked", true);
  });

  it.each([
    ["Light", "light"],
    ["Dark", "dark"],
  ])("applies %s straight away and stores it", async (name, theme) => {
    const user = userEvent.setup();
    renderSettings();
    await group();
    await user.click(radio(name));
    expect(radio(name)).toHaveProperty("checked", true);
    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(localStorage.getItem(THEME_KEY)).toBe(theme);
  });

  it("returns to the device theme when System is chosen again", async () => {
    const user = userEvent.setup();
    renderSettings();
    await group();
    await user.click(radio("Dark"));
    await user.click(radio("System"));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe("system");
  });

  it("has no Save step and shows no Saved message for a choice", async () => {
    const user = userEvent.setup();
    const { targets } = renderSettings();
    await group();
    await screen.findByLabelText("Calories (kcal)");
    await user.click(radio("Dark"));
    expect(screen.queryByText("Saved")).toBeNull();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(targets.save).not.toHaveBeenCalled();
  });

  it("changes with the arrow keys alone", async () => {
    const user = userEvent.setup();
    renderSettings();
    await group();
    radio("System").focus();
    await user.keyboard("{ArrowLeft}");
    expect(radio("Dark")).toHaveProperty("checked", true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("can be reached with Tab", async () => {
    const user = userEvent.setup();
    renderSettings();
    await group();
    for (let i = 0; i < 6 && document.activeElement !== radio("System"); i++) {
      await user.tab();
    }
    expect(document.activeElement).toBe(radio("System"));
  });

  it("keeps the choice after the screen is opened again", async () => {
    const user = userEvent.setup();
    renderSettings();
    await group();
    await user.click(radio("Light"));
    document.body.innerHTML = "";
    renderSettings();
    await group();
    expect(radio("Light")).toHaveProperty("checked", true);
  });

  it("keeps the choice after signing out", async () => {
    const user = userEvent.setup();
    const { auth } = renderSettings();
    await group();
    await user.click(radio("Dark"));
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalled();
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("is shown while targets are loading", async () => {
    const targets = createFakeTargets();
    targets.load.mockImplementation(() => new Promise(() => {}));
    renderSettings(targets);
    expect(await group()).toBeTruthy();
    expect(screen.getByRole("status")).toHaveProperty(
      "textContent",
      expect.stringMatching(/loading/i),
    );
  });

  it("is shown and works when targets fail to load", async () => {
    const user = userEvent.setup();
    const targets = createFakeTargets();
    targets.failNextLoad();
    renderSettings(targets);
    await screen.findByRole("alert");
    await user.click(radio("Dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("works offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const user = userEvent.setup();
    renderSettings();
    await group();
    await user.click(radio("Light"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
  });
});
