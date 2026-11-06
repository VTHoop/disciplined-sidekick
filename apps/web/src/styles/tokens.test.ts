import { describe, expect, it } from "vitest";
import { px, readStyle, readTokens } from "./css-test-utils";

// Light and dark values from the design token table. The sticker tokens are
// the same in both modes. sticker-ink is not in the table: ink flips to a light
// colour in dark mode, which cannot be read on the fixed light stickers. scrim
// is not in the table either: the translucent backdrop behind a sheet.
const COLOURS: Record<string, [light: string, dark: string]> = {
  "surface-ground": ["#F3F4F0", "#18221B"],
  "surface-raised": ["#FFFFFF", "#213026"],
  ink: ["#1F3324", "#E4EBDA"],
  "ink-muted": ["#4E5F50", "#A9B8A6"],
  "ink-muted-on-pillar": ["#4E5F50", "#C9CFBD"],
  "line-strong": ["#1F3324", "#C9D6C0"],
  "line-subtle": ["#D5D9CF", "#34463A"],
  action: ["#A3245A", "#F07AA8"],
  "on-action": ["#FFFFFF", "#18221B"],
  "pillar-energy-track": ["#FBF0C4", "#2C2814"],
  "pillar-energy-fill": ["#F6DA72", "#54471A"],
  "pillar-energy-edge": ["#1F3324", "#F6DA72"],
  "pillar-protein-track": ["#E6EBFA", "#1F2438"],
  "pillar-protein-fill": ["#CCD6F5", "#33406E"],
  "pillar-protein-edge": ["#1F3324", "#B7C5F5"],
  "pillar-produce-track": ["#E9F3D2", "#1E2A17"],
  "pillar-produce-fill": ["#CFE6A0", "#36541F"],
  "pillar-produce-edge": ["#1F3324", "#B5DB7E"],
  "sticker-produce": ["#CFE6A0", "#CFE6A0"],
  "sticker-produce-ring": ["#2F6B3A", "#2F6B3A"],
  "sticker-estimated": ["#FFFFFF", "#FFFFFF"],
  "sticker-over": ["#F08C7C", "#F08C7C"],
  "sticker-reached": ["#8FD3C4", "#8FD3C4"],
  "sticker-ink": ["#1F3324", "#1F3324"],
  "status-offline": ["#7A5C00", "#F6DA72"],
  danger: ["#A11A1A", "#FF8A80"],
  scrim: ["rgb(31 51 36 / 0.5)", "rgb(0 0 0 / 0.6)"],
};

const tokens = readTokens(readStyle("tokens.css"));

describe("colour tokens", () => {
  it("declares the dark values under prefers-color-scheme: dark", () => {
    expect(tokens.hasDarkBlock).toBe(true);
  });

  it("declares the dark values for a chosen dark theme under :root[data-theme=dark]", () => {
    expect(tokens.hasExplicitDarkBlock).toBe(true);
  });

  it("gives a dark device the same values as a chosen dark theme, unless light is chosen", () => {
    expect(tokens.systemDark).toEqual(tokens.dark);
    expect(readStyle("tokens.css")).toMatch(
      /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/,
    );
  });

  it("sets color-scheme for each choice: both for System, one for Light or Dark", () => {
    const css = readStyle("tokens.css");
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light dark;/);
    expect(css).toMatch(
      /:root\[data-theme="light"\]\s*\{[^}]*color-scheme:\s*light;/,
    );
    expect(css).toMatch(
      /:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark;/,
    );
  });

  for (const [name, [light]] of Object.entries(COLOURS)) {
    it(`--color-${name} is ${light} in light mode (the default)`, () => {
      expect(tokens.light[`--color-${name}`]?.toLowerCase()).toBe(
        light.toLowerCase(),
      );
    });
  }

  for (const [name, [, dark]] of Object.entries(COLOURS)) {
    it(`--color-${name} is ${dark} in dark mode`, () => {
      expect(tokens.dark[`--color-${name}`]?.toLowerCase()).toBe(
        dark.toLowerCase(),
      );
    });
  }

  it("changes the surface and ink colours between modes", () => {
    for (const name of ["surface-ground", "surface-raised", "ink", "action"]) {
      expect(tokens.dark[`--color-${name}`]).not.toBe(
        tokens.light[`--color-${name}`],
      );
    }
  });
});

describe("type, shape, space and motion tokens", () => {
  const t = tokens.light;

  it("names the display and body families", () => {
    expect(t["--font-display"]).toMatch(/^["']?Big Shoulders["']?/);
    expect(t["--font-body"]).toMatch(/^["']?Atkinson Hyperlegible Next["']?/);
  });

  it("sets font sizes in rem so they follow the browser's default size", () => {
    const sizes = Object.entries(t).filter(([name]) =>
      name.startsWith("--font-size-"),
    );
    expect(sizes.length).toBeGreaterThan(0);
    for (const [name, value] of sizes) expect(value, name).toMatch(/rem$/);
  });

  it("sets the type sizes", () => {
    expect(px(t["--font-size-sticker"])).toBe(13);
    expect(px(t["--font-size-secondary"])).toBe(14);
    expect(px(t["--font-size-body"])).toBe(16);
    expect(px(t["--font-size-section"])).toBe(24);
    expect(px(t["--font-size-figure-min"])).toBe(32);
    expect(px(t["--font-size-figure-max"])).toBe(44);
    expect(px(t["--font-size-sheet-title"])).toBe(36);
    expect(px(t["--font-size-date"])).toBe(60);
  });

  it("sets the radii", () => {
    expect(px(t["--radius-control"])).toBe(4);
    expect(px(t["--radius-card"])).toBe(6);
    expect(px(t["--radius-sheet"])).toBe(14);
    expect(px(t["--radius-full"])).toBeGreaterThanOrEqual(999);
  });

  it("sets the border widths", () => {
    expect(px(t["--border-heavy"])).toBe(2);
    expect(px(t["--border-hairline"])).toBe(1);
  });

  it("sets the spacing scale, screen margin and touch target", () => {
    for (const step of [4, 8, 12, 16, 20, 24, 32, 48]) {
      expect(px(t[`--space-${step}`])).toBe(step);
    }
    expect(px(t["--screen-margin"])).toBe(20);
    expect(px(t["--touch-target"])).toBe(48);
  });

  it("sets the motion durations", () => {
    expect(t["--motion-press"]).toBe("160ms");
    expect(t["--motion-sheet"]).toBe("240ms");
  });
});
