import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readStyle, readTokens } from "./styles/css-test-utils";

const webDir = join(import.meta.dirname, "..");
const read = (file: string) => readFileSync(join(webDir, file), "utf8");

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
  const tags = metas(read("index.html"));
  const themeColors = tags.filter((t) => t.name === "theme-color");

  it("has a light and a dark theme-color that match surface.ground", () => {
    const byMedia = Object.fromEntries(
      themeColors.map((t) => [t.media, t.content?.toLowerCase()]),
    );
    expect(byMedia["(prefers-color-scheme: light)"]).toBe(groundLight);
    expect(byMedia["(prefers-color-scheme: dark)"]).toBe(groundDark);
    expect(themeColors).toHaveLength(2);
  });

  it("extends under the system bars and resizes content for the keyboard", () => {
    const viewport = tags.find((t) => t.name === "viewport")?.content ?? "";
    expect(viewport).toContain("width=device-width");
    expect(viewport).toContain("viewport-fit=cover");
    expect(viewport).toContain("interactive-widget=resizes-content");
  });
});

describe("manifest", () => {
  const config = read("vite.config.ts");
  const value = (key: string) =>
    new RegExp(`${key}:\\s*"(#[0-9a-fA-F]{6})"`)
      .exec(config)?.[1]
      ?.toLowerCase();

  it("uses surface.ground for theme_color and background_color", () => {
    expect(value("theme_color")).toBe(groundLight);
    expect(value("background_color")).toBe(groundLight);
  });
});

describe("old brand green", () => {
  it.each(["index.html", "vite.config.ts", "public/icon.svg"])(
    "is gone from %s",
    (file) => {
      expect(read(file).toLowerCase()).not.toContain("#2f7d4f");
    },
  );

  it("leaves the app icon on the ground colours", () => {
    const svg = read("public/icon.svg").toLowerCase();
    expect(svg).toContain(`fill="${groundDark}"`);
    expect(svg).toContain(`fill="${groundLight}"`);
  });
});
