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

  it("hatches the entry's share with a pattern, not colour alone", () => {
    expect(css()).toMatch(
      /\.pillar-hatch[^{}]*\{[^}]*(repeating-linear-gradient)/,
    );
  });
});
