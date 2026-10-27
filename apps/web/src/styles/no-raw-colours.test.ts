import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { srcDir } from "./css-test-utils";

const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const FUNCTIONAL =
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(\s*[\d.%-]+/gi;

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

  it("ignores tokens, ids and fragments", () => {
    expect(
      findRawColours('color: var(--color-ink); <a href="#main"> #root {}'),
    ).toEqual([]);
  });
});

const SKIP = [/\.test\.tsx?$/, /test-utils\.ts$/, /test-setup\.ts$/];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name))
    .filter((f) => /\.(css|tsx?)$/.test(f) && !SKIP.some((re) => re.test(f)));
}

describe("apps/web/src", () => {
  const files = sourceFiles(srcDir).map((f) => relative(srcDir, f));

  it("scans the screens and the style sheets", () => {
    expect(files).toContain("auth/sign-in.tsx");
    expect(files).toContain("settings/settings.tsx");
    expect(files).toContain("styles/tokens.css");
  });

  it("has no raw colour outside tokens.css", () => {
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
