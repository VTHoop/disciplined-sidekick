import { readFileSync } from "node:fs";
import { join } from "node:path";

export const srcDir = join(import.meta.dirname, "..");
export const webDir = join(srcDir, "..");
export const stylesDir = join(srcDir, "styles");

export const readStyle = (name: string) =>
  readFileSync(join(stylesDir, name), "utf8");

export const stripComments = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The first `header { ... }` block (braces balanced), and the css without it. */
export function extractBlock(
  css: string,
  header: RegExp,
): { inner: string; rest: string } | null {
  const match = header.exec(css);
  if (!match) return null;
  const open = css.indexOf("{", match.index + match[0].length);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) {
      return {
        inner: css.slice(open + 1, i),
        rest: css.slice(0, match.index) + css.slice(i + 1),
      };
    }
  }
  return null;
}

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/([\w-]+)\s*:\s*([^;{}]+);?/g)) {
    out[m[1] as string] = (m[2] as string).trim();
  }
  return out;
}

const DARK = /@media\s*\(prefers-color-scheme:\s*dark\)/;

export interface Tokens {
  light: Record<string, string>;
  /** Light values with the dark overrides applied. */
  dark: Record<string, string>;
  hasDarkBlock: boolean;
}

/** Custom properties from `:root` (light, the default) and from the dark media query. */
export function readTokens(source: string): Tokens {
  const css = stripComments(source);
  const darkBlock = extractBlock(css, DARK);
  const lightCss = darkBlock ? darkBlock.rest : css;
  const light: Record<string, string> = {};
  for (const m of lightCss.matchAll(/:root\s*\{([^{}]*)\}/g)) {
    Object.assign(light, declarations(m[1] as string));
  }
  const overrides: Record<string, string> = {};
  if (darkBlock) {
    for (const m of darkBlock.inner.matchAll(/:root\s*\{([^{}]*)\}/g)) {
      Object.assign(overrides, declarations(m[1] as string));
    }
  }
  return {
    light,
    dark: { ...light, ...overrides },
    hasDarkBlock: darkBlock !== null,
  };
}

/** Declarations of every top-level rule (not inside an at-rule) that lists `selector`. */
export function declsFor(source: string, selector: string) {
  let css = stripComments(source);
  for (;;) {
    const at = extractBlock(css, /@[\w-]+[^{;]*(?=\{)/);
    if (!at) break;
    css = at.rest;
  }
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (m[1] as string).split(",").map((s) => s.trim());
    if (selectors.includes(selector)) {
      Object.assign(out, declarations(m[2] as string));
    }
  }
  return out;
}

/** A CSS length in px (`rem` counted as 16 px), or NaN. */
export function px(value: string | undefined): number {
  const m = /^(-?[\d.]+)(px|rem)$/.exec((value ?? "").trim());
  if (!m) return Number.NaN;
  return Number(m[1]) * (m[2] === "rem" ? 16 : 1);
}
