import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import { loaded, renderToday, setNow } from "./test-utils";

afterEach(() => vi.useRealTimers());

const time = (h: number, m: number) =>
  new Date(2026, 9, 30, h, m).toLocaleTimeString([], { timeStyle: "short" });

describe("Today's entry list", () => {
  it("lists entries newest first, each titled with its log time and total kcal, not its typed text", async () => {
    setNow(2026, 10, 30);
    renderToday({
      entries: createFakeEntries({
        "2026-10-30": [
          sampleEntry({
            at: [2026, 10, 30, 8, 5],
            text: "oatmeal",
            items: [sampleItem({ kcal: 150 })],
          }),
          sampleEntry({
            at: [2026, 10, 30, 12, 30],
            text: "2 eggs and toast",
            items: [
              sampleItem({ position: 0, kcal: 143 }),
              sampleItem({ position: 1, name: "toast", kcal: 1080 }),
            ],
          }),
        ],
      }),
    });
    await loaded();
    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent ?? "");
    expect(titles).toHaveLength(2);
    expect(titles[0]).toContain(time(12, 30));
    expect(titles[0]).toContain("1,223 kcal");
    expect(titles[0]).not.toContain("2 eggs and toast");
    expect(titles[1]).toContain(time(8, 5));
    expect(titles[1]).toContain("150 kcal");
    expect(titles[1]).not.toContain("oatmeal");
    expect(titles[0]?.indexOf(time(12, 30))).toBeLessThan(
      titles[0]?.indexOf("kcal") ?? -1,
    );
  });

  it("totals the unrounded kcal and rounds once, so it can differ from the rounded rows", async () => {
    setNow(2026, 10, 30);
    renderToday({
      entries: createFakeEntries({
        "2026-10-30": [
          sampleEntry({
            items: [0, 1, 2].map((position) =>
              sampleItem({ position, kcal: 0.4 }),
            ),
          }),
        ],
      }),
    });
    await loaded();
    expect(screen.getByRole("heading", { level: 3 }).textContent).toContain(
      "1 kcal",
    );
    expect(screen.getAllByText("0 kcal")).toHaveLength(3);
  });

  it("shows every item of an entry in saved order, with none collapsed", async () => {
    setNow(2026, 10, 30);
    const names = ["a", "b", "c", "d", "e", "f", "g"];
    renderToday({
      entries: createFakeEntries({
        "2026-10-30": [
          sampleEntry({ items: names.map((name) => sampleItem({ name })) }),
        ],
      }),
    });
    await loaded();
    const items = [...document.querySelectorAll("[data-entry] [data-item]")];
    expect(
      items.map((i) => i.querySelector("[data-item-name]")?.textContent),
    ).toEqual(names);
  });

  it("lays each item out as two lines: name with kcal, then grams and protein", async () => {
    setNow(2026, 10, 30);
    renderToday({
      entries: createFakeEntries({
        "2026-10-30": [
          sampleEntry({
            items: [
              sampleItem({
                name: "2 eggs",
                kcal: 143,
                grams: 100,
                protein: 12.56,
              }),
            ],
          }),
        ],
      }),
    });
    await loaded();
    const item = document.querySelector("[data-item]") as HTMLElement;
    expect(within(item).getByText("2 eggs")).toBeTruthy();
    expect(within(item).getByText("143 kcal")).toBeTruthy();
    expect(item.querySelector("[data-item-detail]")?.textContent).toContain(
      "100 g",
    );
    expect(item.querySelector("[data-item-detail]")?.textContent).toContain(
      "12.6 g protein",
    );
    const lines = item.querySelectorAll("[data-line]");
    expect(lines).toHaveLength(2);
    expect(lines[0]?.textContent).toContain("2 eggs");
    expect(lines[0]?.textContent).toContain("143 kcal");
    expect(lines[1]?.textContent).toContain("100 g");
    expect(lines[1]?.textContent).toContain("12.6 g protein");
    expect(item.querySelectorAll("button")).toHaveLength(1);
  });

  it("titles a branded item with its brand", async () => {
    setNow(2026, 10, 30);
    renderToday({
      entries: createFakeEntries({
        "2026-10-30": [
          sampleEntry({
            items: [
              sampleItem({
                name: "Chobani plain greek yogurt",
                canonicalName: "plain greek yogurt",
                brand: "Chobani",
              }),
            ],
          }),
        ],
      }),
    });
    await loaded();
    expect(screen.getByText("Chobani Plain greek yogurt")).toBeTruthy();
  });

  it("marks estimated items, guessed portions and fruit & veg on line 2, several on one item", async () => {
    setNow(2026, 10, 30);
    renderToday({
      entries: createFakeEntries({
        "2026-10-30": [
          sampleEntry({
            items: [
              sampleItem({
                name: "mixed berries",
                estimated: true,
                portionEstimated: true,
                grams: 85,
                fruitVegG: 70,
              }),
              sampleItem({ name: "plain item" }),
            ],
          }),
        ],
      }),
    });
    await loaded();
    const [first, second] = [
      ...document.querySelectorAll<HTMLElement>("[data-item]"),
    ] as [HTMLElement, HTMLElement];
    const line2 = first.querySelectorAll("[data-line]")[1] as HTMLElement;
    for (const label of ["Estimated", "Fruit/veg"]) {
      const sticker = within(line2).getByText(label);
      expect(sticker.classList.contains("sticker")).toBe(true);
    }
    expect(within(first).queryByText(/fruit\/veg$/)).toBeNull();
    expect(first.textContent).not.toContain("70 g fruit/veg");
    expect(line2.textContent).toContain("85 g");
    expect(within(line2).getByText("est. portion")).toBeTruthy();
    expect(within(second).queryByText("Estimated")).toBeNull();
    expect(within(second).queryByText("Fruit/veg")).toBeNull();
    expect(within(second).queryByText("est. portion")).toBeNull();
  });

  it("never shows the 'No USDA match' sentence on Today", async () => {
    setNow(2026, 10, 30);
    renderToday({
      entries: createFakeEntries({
        "2026-10-30": [
          sampleEntry({ items: [sampleItem({ estimated: true })] }),
        ],
      }),
    });
    await loaded();
    expect(document.body.textContent).not.toMatch(/No USDA match|AI estimate/);
  });
});
