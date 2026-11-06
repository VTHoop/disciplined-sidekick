import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeTargets } from "../settings/fake-targets";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import {
  loaded,
  pillar,
  renderToday,
  setNow,
  sublabel,
  TARGETS,
} from "./test-utils";

afterEach(() => vi.useRealTimers());

describe("Targets on Today", () => {
  it("uses a target saved in Settings as soon as Today is shown again, without refetching", async () => {
    setNow(2026, 10, 30);
    const user = userEvent.setup();
    const { targets } = renderToday({
      targets: createFakeTargets(TARGETS),
      entries: createFakeEntries({
        "2026-10-30": [sampleEntry({ items: [sampleItem({ kcal: 1000 })] })],
      }),
    });
    await loaded();
    expect(sublabel(pillar("calories"))).toBe("limit 2,200 kcal");

    await user.click(screen.getByRole("link", { name: "Settings" }));
    const field = (await screen.findByLabelText(
      "Calories (kcal)",
    )) as HTMLInputElement;
    await user.clear(field);
    await user.type(field, "1500");
    await user.tab();
    await waitFor(() =>
      expect(targets.save).toHaveBeenCalledWith("calories", 1500),
    );

    await user.click(screen.getByRole("link", { name: "Today" }));
    await loaded();
    expect(sublabel(pillar("calories"))).toBe("limit 1,500 kcal");
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(targets.load).toHaveBeenCalledTimes(1);
  });

  it("shows a Set a target link once a target is cleared in Settings", async () => {
    setNow(2026, 10, 30);
    const user = userEvent.setup();
    renderToday({ targets: createFakeTargets(TARGETS) });
    await loaded();
    await user.click(screen.getByRole("link", { name: "Settings" }));
    const field = (await screen.findByLabelText(
      "Fruit/veg (g)",
    )) as HTMLInputElement;
    await user.clear(field);
    await user.tab();
    await user.click(screen.getByRole("link", { name: "Today" }));
    await loaded();
    expect(pillar("fruitVeg").querySelector("a")?.textContent).toBe(
      "Set a target",
    );
  });

  it("updates Today when a save started in Settings resolves after going back", async () => {
    setNow(2026, 10, 30);
    const user = userEvent.setup();
    const targets = createFakeTargets(TARGETS);
    let finish!: () => void;
    targets.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderToday({ targets });
    await loaded();
    await user.click(screen.getByRole("link", { name: "Settings" }));
    const field = (await screen.findByLabelText(
      "Calories (kcal)",
    )) as HTMLInputElement;
    await user.clear(field);
    await user.type(field, "1500");
    await user.tab();
    await waitFor(() => expect(targets.save).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("link", { name: "Today" }));
    await loaded();
    expect(sublabel(pillar("calories"))).toBe("limit 2,200 kcal");
    await act(async () => finish());
    await waitFor(() =>
      expect(sublabel(pillar("calories"))).toBe("limit 1,500 kcal"),
    );
    expect(targets.load).toHaveBeenCalledTimes(1);
  });
});
