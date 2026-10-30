import type { StoredTargets } from "@disciplined-sidekick/core";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { createFakeAuth, makeSession } from "../auth/fake-auth";
import { createFakeFood } from "../food/fake-food";
import { createFakeEntries } from "../today/fake-entries";
import { todayHeading } from "../today/test-utils";
import { createFakeTargets, type FakeTargets } from "./fake-targets";
import type { TargetsStore } from "./targets-store";

const CALORIES = "Calories (kcal)";
const PROTEIN = "Protein (g)";
const FRUIT_VEG = "Fruit/veg (g)";

const edited: StoredTargets = {
  calories: 2000,
  protein: 120,
  fruitVeg: 500,
  fruitVegEdited: true,
};

function renderSettings<T extends TargetsStore = FakeTargets>(
  targets: T = createFakeTargets() as unknown as T,
) {
  render(
    <MemoryRouter initialEntries={["/settings"]}>
      <App
        auth={createFakeAuth(makeSession())}
        targets={targets}
        food={createFakeFood()}
        entries={createFakeEntries()}
      />
    </MemoryRouter>,
  );
  return targets;
}

const field = async (label: string) =>
  (await screen.findByLabelText(label)) as HTMLInputElement;

/** Reopening Settings: a fresh render against the same stored data. */
async function reopen(targets: FakeTargets) {
  document.body.innerHTML = "";
  renderSettings(targets);
  await field(CALORIES);
}

describe("defaults", () => {
  it("shows 800 g fruit/veg and blank calories and protein for a new user", async () => {
    renderSettings();
    expect((await field(FRUIT_VEG)).value).toBe("800");
    expect((await field(CALORIES)).value).toBe("");
    expect((await field(PROTEIN)).value).toBe("");
  });

  it("shows 800 g for a stored row where fruit/veg was never edited", async () => {
    renderSettings(
      createFakeTargets({
        calories: 1800,
        protein: null,
        fruitVeg: null,
        fruitVegEdited: false,
      }),
    );
    expect((await field(FRUIT_VEG)).value).toBe("800");
    expect((await field(CALORIES)).value).toBe("1800");
  });

  it("shows a load error when the targets cannot be read", async () => {
    const targets = createFakeTargets();
    targets.failNextLoad();
    renderSettings(targets);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringMatching(/couldn't load/i),
    );
  });
});

describe("saving on blur", () => {
  it("saves just the edited field when it loses focus, and shows it after reopening", async () => {
    const user = userEvent.setup();
    const targets = renderSettings();
    await user.type(await field(PROTEIN), "120");
    expect(targets.save).not.toHaveBeenCalled();
    await user.tab();

    expect(targets.save).toHaveBeenCalledTimes(1);
    expect(targets.save).toHaveBeenCalledWith("protein", 120);
    expect(screen.getAllByText("Saved")).toHaveLength(1);

    await reopen(targets);
    expect((await field(PROTEIN)).value).toBe("120");
    expect((await field(CALORIES)).value).toBe("");
  });

  it("saves a changed fruit/veg value", async () => {
    const user = userEvent.setup();
    const targets = renderSettings();
    const input = await field(FRUIT_VEG);
    await user.clear(input);
    await user.type(input, "900");
    await user.tab();
    expect(targets.save).toHaveBeenCalledWith("fruitVeg", 900);
    await reopen(targets);
    expect((await field(FRUIT_VEG)).value).toBe("900");
  });

  it("does not save when focus leaves a field that did not change", async () => {
    const user = userEvent.setup();
    const targets = renderSettings(createFakeTargets(edited));
    await user.click(await field(CALORIES));
    await user.tab();
    expect(targets.save).not.toHaveBeenCalled();
  });
});

describe("clearing", () => {
  it.each([
    [CALORIES, "calories"],
    [PROTEIN, "protein"],
    [FRUIT_VEG, "fruitVeg"],
  ])(
    "clears %s back to unset and keeps it unset after reopening",
    async (label, key) => {
      const user = userEvent.setup();
      const targets = renderSettings(createFakeTargets(edited));
      await user.clear(await field(label));
      await user.tab();

      expect(targets.save).toHaveBeenCalledWith(key, null);
      await reopen(targets);
      expect((await field(label)).value).toBe("");
    },
  );

  it("does not bring 800 g back after fruit/veg is cleared", async () => {
    const user = userEvent.setup();
    const targets = renderSettings();
    await user.clear(await field(FRUIT_VEG));
    await user.tab();
    expect(targets.save).toHaveBeenCalledWith("fruitVeg", null);
    await reopen(targets);
    expect((await field(FRUIT_VEG)).value).toBe("");
  });
});

describe("validation", () => {
  it.each(["abc", "1.5", "0", "-3"])(
    "does not save %j and keeps the stored value",
    async (bad) => {
      const user = userEvent.setup();
      const targets = renderSettings(createFakeTargets(edited));
      const input = await field(PROTEIN);
      await user.clear(input);
      await user.type(input, bad);
      await user.tab();

      expect(targets.save).not.toHaveBeenCalled();
      expect(screen.queryByText("Saved")).toBeNull();
      expect(targets.stored()?.protein).toBe(120);
      await reopen(targets);
      expect((await field(PROTEIN)).value).toBe("120");
    },
  );

  it("shows the message beside the field, naming it and stating the rule", async () => {
    const user = userEvent.setup();
    renderSettings();
    const input = await field(PROTEIN);
    await user.type(input, "abc");
    await user.tab();

    const message = within(input.parentElement as HTMLElement).getByRole(
      "alert",
    );
    expect(message.textContent).toBe(
      "Protein must be a whole number greater than 0",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("announces the message and ties it to its field", async () => {
    const user = userEvent.setup();
    renderSettings();
    const input = await field(CALORIES);
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
    await user.type(input, "0");
    await user.tab();

    const message = screen.getByRole("alert");
    expect(message.id).not.toBe("");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(
      message.id,
    );
  });

  it("clears the message once the value is corrected and saved", async () => {
    const user = userEvent.setup();
    const targets = renderSettings();
    const input = await field(CALORIES);
    await user.type(input, "abc");
    await user.tab();
    expect(screen.getByRole("alert")).toBeTruthy();

    await user.clear(input);
    await user.type(input, "2000");
    await user.tab();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
    expect(targets.save).toHaveBeenCalledWith("calories", 2000);
  });
});

describe("a failed save", () => {
  it("shows an error, keeps the typed value and does not show it as saved", async () => {
    const user = userEvent.setup();
    const targets = createFakeTargets();
    targets.failNextSave();
    renderSettings(targets);
    const input = await field(PROTEIN);
    await user.type(input, "120");
    await user.tab();

    const message = await within(input.parentElement as HTMLElement).findByRole(
      "alert",
    );
    expect(message.textContent).toMatch(/couldn't save protein/i);
    expect(input.value).toBe("120");
    expect(screen.queryByText("Saved")).toBeNull();
    expect(targets.stored()).toBeNull();
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(
      message.id,
    );
  });

  it("tries again on the next blur and then shows it as saved", async () => {
    const user = userEvent.setup();
    const targets = createFakeTargets();
    targets.failNextSave();
    renderSettings(targets);
    const input = await field(PROTEIN);
    await user.type(input, "120");
    await user.tab();
    await screen.findByRole("alert");

    await user.click(input);
    await user.tab();
    expect(targets.save).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(targets.stored()?.protein).toBe(120);
  });
});

describe("accessibility and navigation", () => {
  it("gives every input a visible label that includes its unit", async () => {
    renderSettings();
    for (const label of [CALORIES, PROTEIN, FRUIT_VEG]) {
      const input = await field(label);
      expect(input.tagName).toBe("INPUT");
      expect(screen.getByText(label).tagName).toBe("LABEL");
    }
  });

  it("links back to Today", async () => {
    const user = userEvent.setup();
    renderSettings();
    await field(CALORIES);
    expect(
      screen.getByRole("heading", { level: 1, name: "Settings" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Today" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: todayHeading() }),
    ).toBeTruthy();
  });
});

/** A store whose saves stay pending until the test resolves them. */
function deferredStore() {
  const pending: { resolve: () => void }[] = [];
  const store: TargetsStore = {
    load: vi.fn(async () => null),
    save: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          pending.push({ resolve });
        }),
    ),
  };
  const finish = (i: number) =>
    act(async () => {
      pending[i]?.resolve();
    });
  return { store, finish };
}

describe("overlapping saves", () => {
  it("keeps the newest value as saved when an older save finishes last", async () => {
    const user = userEvent.setup();
    const { store, finish } = deferredStore();
    renderSettings(store);
    const input = await field(PROTEIN);
    await user.type(input, "1");
    await user.tab();
    await user.clear(input);
    await user.type(input, "2");
    await user.tab();
    expect(store.save).toHaveBeenCalledTimes(2);

    await finish(1);
    expect(await screen.findByText("Saved")).toBeTruthy();
    await finish(0);

    // The older result must not undo the newer one: "2" is still the saved value.
    await user.click(input);
    await user.tab();
    expect(store.save).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("Saved")).toHaveLength(1);
  });

  it("does not show Saved next to text typed while the save was pending", async () => {
    const user = userEvent.setup();
    const { store, finish } = deferredStore();
    renderSettings(store);
    const input = await field(PROTEIN);
    await user.type(input, "120");
    await user.tab();
    await user.click(input);
    await user.type(input, "5");
    await finish(0);

    expect(input.value).toBe("1205");
    expect(screen.queryByText("Saved")).toBeNull();
    await user.tab();
    expect(store.save).toHaveBeenLastCalledWith("protein", 1205);
  });
});

describe("Sign out (moved here from Today)", () => {
  function renderWithAuth(auth = createFakeAuth(makeSession())) {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <App
          auth={auth}
          targets={createFakeTargets()}
          food={createFakeFood()}
          entries={createFakeEntries()}
        />
      </MemoryRouter>,
    );
    return auth;
  }

  it("signs out and returns to sign-in", async () => {
    const user = userEvent.setup();
    const auth = renderWithAuth();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText("Email")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
  });

  it("still drops the session from this device when the server call fails offline", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuth(makeSession());
    auth.signOut.mockResolvedValueOnce({
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });
    renderWithAuth(auth);
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: "local" });
    expect(await screen.findByLabelText("Email")).toBeTruthy();
  });
});
