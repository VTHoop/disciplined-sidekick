import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeFood, samplePreview } from "./fake-food";
import { FoodLog } from "./food-log";

describe("kcal on the preview sheet", () => {
  it("uses thousands separators for items and the entry total, like Today", async () => {
    const base = samplePreview();
    const preview = samplePreview({
      items: base.items.map((item, i) => ({
        ...item,
        kcal: i === 0 ? 1234.4 : item.kcal,
      })),
      totals: { kcal: 1677, protein: 31, fruitVegG: 150 },
    });
    render(
      <FoodLog
        api={createFakeFood(preview)}
        day="2026-10-28"
        currentDay="2026-10-28"
        onSignIn={() => {}}
      />,
    );
    await userEvent
      .setup()
      .type(
        screen.getByRole("textbox", { name: "What did you eat?" }),
        "x{Enter}",
      );
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("1,234 kcal")).toBeTruthy();
    expect(within(sheet).getByText(/1,677 kcal/)).toBeTruthy();
  });
});
