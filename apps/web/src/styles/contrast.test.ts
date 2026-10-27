import { describe, expect, it } from "vitest";
import { readStyle, readTokens } from "./css-test-utils";

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi as number) + 0.05) / ((lo as number) + 0.05);
}

describe("contrast helper", () => {
  it("matches known WCAG ratios", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
});

const TEXT_MIN = 4.5;
const GRAPHIC_MIN = 3;
const PILLARS = ["energy", "protein", "produce"];

// [foreground, background] token names, without the --color- prefix.
// line-subtle is left out on purpose: it is a decorative list hairline
// (about 1.3:1 on the ground), not an outline that carries meaning.
const TEXT_PAIRS: [string, string][] = [
  ["ink", "surface-ground"],
  ["ink", "surface-raised"],
  ["ink-muted", "surface-ground"],
  ["ink-muted", "surface-raised"],
  ["on-action", "action"],
  ["danger", "surface-ground"],
  ["danger", "surface-raised"],
  ["sticker-ink", "sticker-produce"],
  ["sticker-ink", "sticker-estimated"],
  ...PILLARS.flatMap((p): [string, string][] => [
    ["ink", `pillar-${p}-track`],
    ["ink", `pillar-${p}-fill`],
    ["ink-muted-on-pillar", `pillar-${p}-track`],
    ["ink-muted-on-pillar", `pillar-${p}-fill`],
  ]),
];

const GRAPHIC_PAIRS: [string, string][] = [
  ["line-strong", "surface-ground"],
  ["line-strong", "surface-raised"],
  ["action", "surface-ground"],
  ["action", "surface-raised"],
  ["status-offline", "surface-ground"],
  ["status-offline", "surface-raised"],
  ["sticker-produce-ring", "sticker-produce"],
  ...PILLARS.flatMap((p): [string, string][] => [
    [`pillar-${p}-edge`, `pillar-${p}-track`],
    [`pillar-${p}-edge`, `pillar-${p}-fill`],
  ]),
];

const tokens = readTokens(readStyle("tokens.css"));

describe.each(["light", "dark"] as const)("%s mode contrast", (mode) => {
  const colour = (name: string) => {
    const value = tokens[mode][`--color-${name}`];
    if (!value) throw new Error(`--color-${name} is not defined`);
    return value;
  };

  it.each(TEXT_PAIRS)(`text: %s on %s is at least ${TEXT_MIN}:1`, (fg, bg) => {
    expect(contrast(colour(fg), colour(bg))).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it.each(GRAPHIC_PAIRS)(
    `outline or level line: %s against %s is at least ${GRAPHIC_MIN}:1`,
    (fg, bg) => {
      expect(contrast(colour(fg), colour(bg))).toBeGreaterThanOrEqual(
        GRAPHIC_MIN,
      );
    },
  );
});
