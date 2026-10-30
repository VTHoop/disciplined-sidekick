import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeFood, samplePreview } from "./fake-food";
import { FoodLog } from "./food-log";

describe("kcal on the preview sheet", () => {
  it("uses thousands separators for items and the entry total, like Today", async () => {
    const base = samplePreview();
    const preview = samplePreview({
      items: [
        { ...base.items[0], kcal: 1234.4 },
        ...base.items.slice(1),
      ].filter((i): i is NonNullable<typeof i> => i !== undefined),
      totals: { kcal: 1677, protein: 31, fruitVegG: 150 },
    });
    render(<FoodLog api={createFakeFood(preview)} />);
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
