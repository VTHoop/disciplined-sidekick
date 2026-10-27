import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { sourceFiles, srcDir } from "./css-test-utils";

const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const FUNCTIONAL =
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.%-]+|\bcolor\(\s*(?:srgb(?:-linear)?|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz(?:-d50|-d65)?|from)\b/gi;

/** Raw colour literals in a source file. `var(--color-x)` is not one. */
function findRawColours(source: string): string[] {
  return [...(source.match(HEX) ?? []), ...(source.match(FUNCTIONAL) ?? [])];
}

describe("findRawColours", () => {
  it("finds hex colours of every length", () => {
    expect(
      findRawColours("a{color:#fff;b:#1F3324;c:#12345678;d:#abcd}"),
    ).toEqual(["#fff", "#1F3324", "#12345678", "#abcd"]);
  });

  it("finds rgb, hsl and modern colour functions", () => {
    expect(findRawColours("rgb(0 0 0) rgba(0,0,0,.5) hsl(10 20% 30%)")).toEqual(
      ["rgb(0", "rgba(0", "hsl(10"],
    );
  });

  it("finds color() with a colour space", () => {
    expect(findRawColours("color(srgb 1 0 0) color(display-p3 1 0 0)")).toEqual(
      ["color(srgb", "color(display-p3"],
    );
  });

  it("ignores tokens, ids and fragments", () => {
    expect(
      findRawColours('color: var(--color-ink); <a href="#main"> #root {}'),
    ).toEqual([]);
  });
});

describe("apps/web/src", () => {
  const files = sourceFiles().map((f) => relative(srcDir, f));

  it("scans the screens and the style sheets", () => {
    expect(files).toContain("auth/sign-in.tsx");
    expect(files).toContain("settings/settings.tsx");
    expect(files).toContain("styles/tokens.css");
  });

  // Named colours (red, white) are not detected: that needs a parser, not a regex.
  it("has no hex, rgb/hsl/lab/lch or color() literal outside tokens.css", () => {
    const offenders = files
      .filter((f) => f !== join("styles", "tokens.css"))
      .flatMap((f) =>
        findRawColours(readFileSync(join(srcDir, f), "utf8")).map(
          (colour) => `${f}: ${colour}`,
        ),
      );
    expect(offenders).toEqual([]);
  });
});
