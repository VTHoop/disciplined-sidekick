import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  declsFor,
  extractBlock,
  readStyle,
  srcDir,
  stripComments,
} from "./css-test-utils";

const css = readStyle("base.css");

describe("main.tsx", () => {
  const main = readFileSync(join(srcDir, "main.tsx"), "utf8");

  it("loads tokens, fonts and base styles, not the old style sheet", () => {
    expect(main).toContain('import "./styles/tokens.css"');
    expect(main).toContain('import "./styles/fonts.css"');
    expect(main).toContain('import "./styles/base.css"');
    expect(main).not.toContain('"./styles.css"');
  });
});

describe("base styles", () => {
  it("sets body text from tokens", () => {
    const body = declsFor(css, "body");
    expect(body["font-family"]).toContain("var(--font-body)");
    expect(body.color).toBe("var(--color-ink)");
    expect(body.background).toBe("var(--color-surface-ground)");
    expect(body["font-size"]).toBe("var(--font-size-body)");
  });

  it("sets headings in the display face", () => {
    for (const h of ["h1", "h2", "h3"]) {
      expect(declsFor(css, h)["font-family"]).toContain("var(--font-display)");
    }
  });

  it("keeps the screen margin on main", () => {
    expect(declsFor(css, "main").padding).toContain("var(--screen-margin)");
  });

  it("draws buttons with a 2 px outline, a control radius and a touch target", () => {
    const button = declsFor(css, "button");
    expect(button["font-family"]).toContain("var(--font-display)");
    expect(button.border).toContain("var(--border-heavy)");
    expect(button.border).toContain("var(--color-line-strong)");
    expect(button["border-radius"]).toBe("var(--radius-control)");
    expect(button["min-height"]).toBe("var(--touch-target)");
    expect(button.transition).toContain("var(--motion-press)");
  });

  it("draws inputs as an underline with no box", () => {
    const input = declsFor(css, "input");
    expect(input.border).toMatch(/^(0|none)$/);
    expect(input["border-bottom"]).toContain("var(--color-line-strong)");
    expect(input.background).toBe("var(--color-surface-raised)");
    expect(input["min-height"]).toBe("var(--touch-target)");
  });

  it("shows a visible focus ring in the action colour", () => {
    const focus = declsFor(css, ":focus-visible");
    expect(focus.outline).toContain("var(--color-action)");
    expect(focus.outline).not.toMatch(/none|0\b/);
  });

  it("gives standalone links a touch target", () => {
    expect(declsFor(css, "a")["min-height"]).toBe("var(--touch-target)");
  });

  it("fills the submit button with the action colour", () => {
    const submit = declsFor(css, 'button[type="submit"]');
    expect(submit.background).toBe("var(--color-action)");
    expect(submit.color).toBe("var(--color-on-action)");
  });

  it("draws an invalid input's underline in the danger colour", () => {
    expect(
      declsFor(css, 'input[aria-invalid="true"]')["border-bottom-color"],
    ).toBe("var(--color-danger)");
  });

  it("colours alerts as danger and the saved note as muted ink", () => {
    expect(declsFor(css, '[role="alert"]').color).toBe("var(--color-danger)");
    expect(declsFor(css, ".saved").color).toBe("var(--color-ink-muted)");
  });

  it("uses tabular figures", () => {
    expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});

describe("reduced motion", () => {
  it("turns off transitions and animations", () => {
    const block = extractBlock(
      stripComments(css),
      /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
    );
    expect(block).not.toBeNull();
    expect(block?.inner).toMatch(/(^|[\s,])\*\s*[,{]/);
    expect(block?.inner).toMatch(/transition(-duration)?:\s*(none|0s|0ms)/);
    expect(block?.inner).toMatch(/animation(-duration)?:\s*(none|0s|0ms)/);
  });
});
