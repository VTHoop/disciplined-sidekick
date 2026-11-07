import { describe, expect, it } from "vitest";
import {
  declsFor,
  readStyle,
  readWeb,
  stripComments,
} from "../styles/css-test-utils";

const css = () => stripComments(readWeb("src/settings/settings.css"));

function rules(source: string) {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] as string).trim(),
    body: m[2] as string,
  }));
}

const bodyOf = (selector: RegExp) =>
  rules(css())
    .filter((r) => selector.test(r.selector))
    .map((r) => r.body)
    .join(";");

describe("settings.css", () => {
  it("is loaded by the settings screen", () => {
    expect(readWeb("src/settings/theme-switcher.tsx")).toMatch(
      /import\s+["']\.\/settings\.css["']/,
    );
  });

  it("lays the three options side by side", () => {
    expect(bodyOf(/\.theme-options$/)).toMatch(/display:\s*(flex|grid)/);
  });

  it("keeps the 48 px tap target on each option", () => {
    expect(bodyOf(/\.theme-option$/)).toMatch(
      /min-height:\s*var\(--touch-target\)/,
    );
  });

  it("marks the selected option with tokens, not just the radio dot", () => {
    const selected = bodyOf(/:checked/);
    expect(selected).toContain("var(--color-action)");
    expect(selected).toContain("var(--color-on-action)");
  });

  it("draws the app's focus outline (base.css :focus-visible) around an option when its radio has keyboard focus", () => {
    const app = declsFor(readStyle("base.css"), ":focus-visible");
    const option = declsFor(
      readWeb("src/settings/settings.css"),
      ".theme-option:has(input:focus-visible)",
    );
    expect(app.outline).toBeTruthy();
    expect(option.outline).toBe(app.outline);
    expect(option["outline-offset"]).toBe(app["outline-offset"]);
  });

  describe("Home icon", () => {
    const today = () => readWeb("src/today/today.css");
    const settings = () => readWeb("src/settings/settings.css");

    it("matches Today's header icons: size, border, colours, touch target", () => {
      const gear = declsFor(today(), ".today-settings");
      const home = declsFor(settings(), ".settings-home");
      expect(gear.width).toBe("var(--touch-target)");
      expect(home).toEqual(gear);
    });

    it("strokes the house like Today's icons", () => {
      const gear = declsFor(today(), ".today-settings svg");
      const home = declsFor(settings(), ".settings-home svg");
      expect(gear["stroke-width"]).toBeTruthy();
      expect(home).toEqual(gear);
    });

    it("keeps the app's focus ring: no outline override", () => {
      const home = declsFor(settings(), ".settings-home");
      const focus = declsFor(settings(), ".settings-home:focus-visible");
      expect(home.outline).toBeUndefined();
      expect(focus).toEqual({});
      expect(css()).not.toMatch(/\.settings-home[^{]*\{[^}]*outline/);
    });

    it("keeps the heading and icon on one row at 320 px", () => {
      const header = declsFor(settings(), ".settings-header");
      expect(header.display).toBe("flex");
      expect(header["flex-wrap"]).toBeUndefined();
      expect(header["align-items"]).toBe("flex-start");
      const heading = declsFor(settings(), ".settings-header h1");
      expect(heading.flex).toBe("1");
      expect(heading["min-width"]).toBe("0");
      expect(declsFor(settings(), ".settings-home").flex).toBe("none");
    });
  });

  it("keeps the radio itself focusable (not display:none or visibility:hidden)", () => {
    expect(css()).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });
});
