import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeEntries, sampleEntry, sampleItem } from "./fake-entries";
import { loaded, renderToday, setNow } from "./test-utils";

afterEach(() => vi.useRealTimers());

const time = (h: number, m: number) =>
  new Date(2026, 9, 30, h, m).toLocaleTimeString([], { timeStyle: "short" });

describe("Today's entry list", () => {
  it("lists entries newest first, each titled with its log time and original text", async () => {
    setNow(2026, 10, 30);
    renderToday({
      entries: createFakeEntries({
        "2026-10-30": [
          sampleEntry({ at: [2026, 10, 30, 8, 5], text: "oatmeal" }),
          sampleEntry({ at: [2026, 10, 30, 12, 30], text: "2 eggs and toast" }),
        ],
      }),
    });
    await loaded();
    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent ?? "");
    expect(titles).toHaveLength(2);
    expect(titles[0]).toContain(time(12, 30));
    expect(titles[0]).toContain("2 eggs and toast");
    expect(titles[1]).toContain(time(8, 5));
    expect(titles[1]).toContain("oatmeal");
    expect(titles[0]?.indexOf(time(12, 30))).toBeLessThan(
      titles[0]?.indexOf("2 eggs") ?? -1,
    );
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

  it("shows each item's name and kcal, with grams and protein underneath", async () => {
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

  it("marks estimated items, guessed portions and fruit & veg grams, several on one item", async () => {
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
    ];
    expect(
      within(first as HTMLElement)
        .getByText("Estimated")
        .classList.contains("sticker"),
    ).toBe(true);
    expect(
      within(first as HTMLElement)
        .getByText("70 g fruit/veg")
        .classList.contains("sticker"),
    ).toBe(true);
    expect(within(first as HTMLElement).getByText("est. portion")).toBeTruthy();
    expect(within(second as HTMLElement).queryByText("Estimated")).toBeNull();
    expect(
      within(second as HTMLElement).queryByText("est. portion"),
    ).toBeNull();
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
