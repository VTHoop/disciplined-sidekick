import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodePng, pngSize } from "../../../scripts/png";
import {
  readStyle,
  readTokens,
  readWeb,
  webDir,
} from "./styles/css-test-utils";

const { light, dark } = readTokens(readStyle("tokens.css"));
const groundLight = light["--color-surface-ground"]?.toLowerCase();
const groundDark = dark["--color-surface-ground"]?.toLowerCase();

function metas(html: string) {
  return [...html.matchAll(/<meta\s+([^>]*?)\/?>/g)].map((m) =>
    Object.fromEntries(
      [...(m[1] as string).matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [
        a[1],
        a[2],
      ]),
    ),
  );
}

describe("index.html", () => {
  const tags = metas(readWeb("index.html"));
  const themeColors = tags.filter((t) => t.name === "theme-color");

  it("has a light and a dark theme-color that match surface.ground", () => {
    const byMedia = Object.fromEntries(
      themeColors.map((t) => [t.media, t.content?.toLowerCase()]),
    );
    expect(byMedia["(prefers-color-scheme: light)"]).toBe(groundLight);
    expect(byMedia["(prefers-color-scheme: dark)"]).toBe(groundDark);
    expect(themeColors).toHaveLength(2);
  });

  it("tags each theme-color with the scheme it belongs to, for the theme switcher", () => {
    const byMedia = Object.fromEntries(
      themeColors.map((t) => [t.media, t["data-scheme"]]),
    );
    expect(byMedia["(prefers-color-scheme: light)"]).toBe("light");
    expect(byMedia["(prefers-color-scheme: dark)"]).toBe("dark");
  });

  it("extends under the system bars and resizes content for the keyboard", () => {
    const viewport = tags.find((t) => t.name === "viewport")?.content ?? "";
    expect(viewport).toContain("width=device-width");
    expect(viewport).toContain("viewport-fit=cover");
    expect(viewport).toContain("interactive-widget=resizes-content");
  });
});

describe("manifest", () => {
  const config = readWeb("vite.config.ts");
  const value = (key: string) =>
    new RegExp(`${key}:\\s*"(#[0-9a-fA-F]{6})"`)
      .exec(config)?.[1]
      ?.toLowerCase();

  it("uses surface.ground for theme_color and background_color", () => {
    expect(value("theme_color")).toBe(groundLight);
    expect(value("background_color")).toBe(groundLight);
  });
});

describe("manifest install requirements", () => {
  const config = readWeb("vite.config.ts");
  const png = (name: string) => readFileSync(join(webDir, "public", name));
  const entry = (src: string) =>
    new RegExp(`\\{[^{}]*src:\\s*"${src}"[^{}]*\\}`).exec(config)?.[0] ?? "";

  it("is standalone with the home-screen label Sidekick", () => {
    expect(config).toMatch(/display:\s*"standalone"/);
    expect(config).toMatch(/short_name:\s*"Sidekick"/);
  });

  it.each([
    ["icon-192.png", 192, "any"],
    ["icon-512.png", 512, "any"],
    ["icon-maskable-512.png", 512, "maskable"],
  ])(
    "lists %s as a %i px PNG for purpose %s, and the file has that size",
    (name, size, purpose) => {
      const e = entry(name);
      expect(e).toContain(`sizes: "${size}x${size}"`);
      expect(e).toContain('type: "image/png"');
      expect(e).toContain(`purpose: "${purpose}"`);
      expect(pngSize(png(name))).toEqual({ width: size, height: size });
    },
  );

  it("keeps the SVG icon beside the PNGs", () => {
    expect(entry("icon.svg")).toContain("image/svg+xml");
  });

  it("keeps the maskable artwork inside the central 80% safe zone and fills the rest", () => {
    const { width, height, pixel } = decodePng(png("icon-maskable-512.png"));
    const background = pixel(0, 0);
    expect(background[3]).toBe(255);
    for (const [x, y] of [
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ] as const)
      expect(pixel(x, y)).toEqual(background);
    const radius = 0.4 * width;
    let artwork = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const p = pixel(x, y);
        if (p.every((c, i) => Math.abs(c - (background[i] as number)) < 8))
          continue;
        artwork++;
        const dist = Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2);
        expect(dist).toBeLessThanOrEqual(radius);
      }
    expect(artwork).toBeGreaterThan(1000);
  });
});

describe("old brand green", () => {
  it.each(["index.html", "vite.config.ts", "public/icon.svg"])(
    "is gone from %s",
    (file) => {
      expect(readWeb(file).toLowerCase()).not.toContain("#2f7d4f");
    },
  );

  it("leaves the app icon on the ground colours", () => {
    const svg = readWeb("public/icon.svg").toLowerCase();
    expect(svg).toContain(`fill="${groundDark}"`);
    expect(svg).toContain(`fill="${groundLight}"`);
  });
});
