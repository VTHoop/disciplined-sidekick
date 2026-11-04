import { describe, expect, it } from "vitest";
import { readWeb, stripComments } from "../styles/css-test-utils";

const css = () => stripComments(readWeb("src/today/today.css"));

describe("today.css", () => {
  it("is loaded by the Today screen", () => {
    expect(readWeb("src/today/today.tsx")).toMatch(
      /import\s+["']\.\/today\.css["']/,
    );
  });

  it("pins the composer to the bottom on the ground colour", () => {
    const rule = [...css().matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) =>
      /composer/.test(m[1] ?? ""),
    );
    expect(rule, "a .today-composer rule").toBeDefined();
    const body = rule?.[2] ?? "";
    expect(body).toMatch(/position:\s*(sticky|fixed)/);
    expect(body).toMatch(/bottom:\s*0/);
    expect(body).toMatch(/background:\s*var\(--color-surface-ground\)/);
  });

  it("styles the over and reached stickers with their tokens", () => {
    expect(css()).toMatch(/var\(--color-sticker-over\)/);
    expect(css()).toMatch(/var\(--color-sticker-reached\)/);
  });

  it("draws the entry's share as a repeating pattern", () => {
    expect(css()).toMatch(
      /\.pillar-hatch[^{}]*\{[^}]*(repeating-linear-gradient)/,
    );
  });

  const bodyOf = (selector: RegExp) =>
    [...css().matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => selector.test((m[1] ?? "").trim()))
      .map((m) => m[2] ?? "")
      .join(";");

  it("sets the whole pillar row, sub-label and stickers in tabular numerals", () => {
    expect(bodyOf(/^\.pillar$/)).toMatch(
      /font-variant-numeric:\s*tabular-nums/,
    );
  });

  it("styles the Settings link as a button", () => {
    expect(bodyOf(/\.today-settings/)).toMatch(/border:/);
  });

  it("keeps the hatch in a band under the text, since stripes behind it fall below 4.5:1", () => {
    const hatch = bodyOf(/^\.pillar-hatch$/);
    expect(hatch).toMatch(/height:/);
    expect(hatch).not.toMatch(/inset-block/);
    expect(hatch).toMatch(/bottom:\s*0/);
  });
});

describe("today.css delete control", () => {
  const rule = (selector: RegExp) =>
    [...css().matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => selector.test((m[1] ?? "").trim()))
      .map((m) => m[2] ?? "")
      .join(";");

  it("is at least 48 x 48 and uses danger, not action", () => {
    const body = rule(/^\.food-item-delete$/);
    expect(body).toMatch(/min-(width|inline-size):\s*var\(--touch-target\)/);
    expect(body).toMatch(/min-(height|block-size):\s*var\(--touch-target\)/);
    expect(body).toMatch(/var\(--color-danger\)/);
    expect(body).not.toMatch(/--color-action/);
  });

  it("lets the row leave in 160 ms, and not at all under reduced motion", () => {
    expect(rule(/^\.food-item-leaving$/)).toMatch(/var\(--motion-press\)/);
    expect(readWeb("src/styles/base.css")).toMatch(
      /prefers-reduced-motion:\s*reduce/,
    );
  });
});
