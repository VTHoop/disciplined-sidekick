import { describe, expect, it } from "vitest";
import { readWeb, stripComments } from "../styles/css-test-utils";

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

  it("draws the app's focus outline around an option when its radio has keyboard focus", () => {
    const focus = bodyOf(/:focus-visible/);
    expect(focus).toMatch(/outline:\s*3px solid var\(--color-action\)/);
  });

  it("keeps the radio itself focusable (not display:none or visibility:hidden)", () => {
    expect(css()).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });
});
