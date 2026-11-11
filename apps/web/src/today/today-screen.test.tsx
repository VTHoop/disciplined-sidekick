import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderToday, todayHeading } from "./test-utils";

describe("Today", () => {
  it("has today's date as its heading and no sign-out button", async () => {
    renderToday();
    expect(
      await screen.findByRole("heading", { level: 1, name: todayHeading() }),
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
    const { food } = renderToday();
    await user.type(
      await screen.findByRole("textbox", { name: "What did you eat?" }),
      "2 eggs{Control>}{Enter}{/Control}",
    );
    expect(food.parse).toHaveBeenCalledWith("2 eggs");
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});
