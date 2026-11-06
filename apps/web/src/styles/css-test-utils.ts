import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const srcDir = join(import.meta.dirname, "..");
export const webDir = join(srcDir, "..");
export const stylesDir = join(srcDir, "styles");

export const readStyle = (name: string) =>
  readFileSync(join(stylesDir, name), "utf8");

/** A file under apps/web, e.g. `index.html` or `src/main.tsx`. */
export const readWeb = (file: string) =>
  readFileSync(join(webDir, file), "utf8");

const NOT_SOURCE = [/\.test\.tsx?$/, /test-utils\.tsx?$/, /test-setup\.ts$/];

/** Absolute paths of the app's css, ts and tsx source, tests and test support excluded. */
export function sourceFiles(): string[] {
  return readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name))
    .filter(
      (f) => /\.(css|tsx?)$/.test(f) && !NOT_SOURCE.some((re) => re.test(f)),
    );
}

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

export interface Tokens {
  /** Custom properties as they resolve under `color-scheme: light` (the default). */
  light: Record<string, string>;
  /** Custom properties as they resolve under `color-scheme: dark`. */
  dark: Record<string, string>;
}

/** `[light, dark]` from `light-dark(<light>, <dark>)`, or null for any other value. */
export function lightDark(value: string): [string, string] | null {
  const m = /^light-dark\(([\s\S]*)\)$/.exec(value.trim());
  if (!m) return null;
  const args = m[1] as string;
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "(") depth++;
    else if (args[i] === ")") depth--;
    else if (args[i] === "," && depth === 0) {
      return [args.slice(0, i).trim(), args.slice(i + 1).trim()];
    }
  }
  return null;
}

/**
 * Custom properties from the plain `:root` rule, resolved for each mode: a
 * `light-dark(a, b)` value is `a` in light and `b` in dark, any other value is
 * the same in both.
 */
export function readTokens(source: string): Tokens {
  const root = declsFor(source, ":root");
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  for (const [name, value] of Object.entries(root)) {
    const pair = lightDark(value);
    light[name] = pair ? pair[0] : value;
    dark[name] = pair ? pair[1] : value;
  }
  return { light, dark };
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
