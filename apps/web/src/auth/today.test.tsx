import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { createFakeFood } from "../food/fake-food";
import { createFakeTargets } from "../settings/fake-targets";
import { createFakeEntries } from "../today/fake-entries";
import { createFakeAuth, makeSession } from "./fake-auth";

function renderToday(food = createFakeFood()) {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App
        auth={createFakeAuth(makeSession())}
        targets={createFakeTargets()}
        food={food}
        entries={createFakeEntries()}
      />
    </MemoryRouter>,
  );
  return food;
}

describe("Today", () => {
  it("has today's date as its heading and no sign-out button", async () => {
    renderToday();
    const date = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: date }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("links to Settings", async () => {
    const user = userEvent.setup();
    renderToday();
    await user.click(await screen.findByRole("link", { name: "Settings" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Settings" }),
    ).toBeTruthy();
  });

  it("logs food from Today through the food API", async () => {
    const user = userEvent.setup();
    const food = renderToday();
    await user.type(
      await screen.findByRole("textbox", { name: "What did you eat?" }),
      "2 eggs{Enter}",
    );
    expect(food.parse).toHaveBeenCalledWith("2 eggs");
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});
