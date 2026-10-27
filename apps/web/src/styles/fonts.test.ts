import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readStyle, srcDir, stripComments, webDir } from "./css-test-utils";

const FAMILIES: Record<string, number[]> = {
  "Big Shoulders": [700, 800, 900],
  "Atkinson Hyperlegible Next": [400, 600, 700],
};

const fontsCss = join(srcDir, "styles", "fonts.css");

interface Face {
  family: string;
  weight: number;
  display: string;
  url: string;
  format: string;
}

function readFaces(): Face[] {
  return [
    ...stripComments(readStyle("fonts.css")).matchAll(
      /@font-face\s*\{([^}]*)\}/g,
    ),
  ].map((m) => {
    const body = m[1] as string;
    const get = (re: RegExp) => re.exec(body)?.[1] ?? "";
    return {
      family: get(/font-family:\s*["']?([^"';]+?)["']?\s*;/),
      weight: Number(get(/font-weight:\s*(\d+)/)),
      display: get(/font-display:\s*(\w+)/),
      url: get(/src:\s*url\(["']?([^)"']+)["']?\)/),
      format: get(/format\(["']?([\w-]+)["']?\)/),
    };
  });
}

describe("fonts.css", () => {
  const faces = readFaces();

  it("declares one face per family and weight, and nothing else", () => {
    const wanted = Object.entries(FAMILIES).flatMap(([family, weights]) =>
      weights.map((weight) => `${family} ${weight}`),
    );
    expect(faces.map((f) => `${f.family} ${f.weight}`).sort()).toEqual(
      wanted.sort(),
    );
  });

  it("loads woff2 files from the app, never a remote host", () => {
    for (const face of faces) {
      expect(face.url, `${face.family} ${face.weight}`).toMatch(
        /^\.\.\/fonts\/[\w-]+\/[\w-]+-latin-\d{3}-normal\.woff2$/,
      );
      expect(face.format).toBe("woff2");
    }
  });

  it("swaps in the real font without blocking text", () => {
    for (const face of faces) expect(face.display).toBe("swap");
  });

  it("points at real woff2 files that are Latin subsets", () => {
    for (const face of faces) {
      const file = resolve(dirname(fontsCss), face.url);
      expect(existsSync(file), file).toBe(true);
      expect(readFileSync(file).subarray(0, 4).toString("latin1")).toBe("wOF2");
      expect(statSync(file).size).toBeLessThan(60_000);
    }
  });

  it("keeps an OFL licence file beside each family", () => {
    const dirs = new Set(
      readFaces().map((f) => dirname(resolve(dirname(fontsCss), f.url))),
    );
    expect(dirs.size).toBe(Object.keys(FAMILIES).length);
    for (const dir of dirs) {
      const licence = join(dir, "OFL.txt");
      expect(existsSync(licence), licence).toBe(true);
      expect(readFileSync(licence, "utf8")).toMatch(/SIL OPEN FONT LICENSE/i);
    }
  });
});

describe("no remote font requests", () => {
  const REMOTE =
    /fonts\.(googleapis|gstatic)\.com|@import\s+url\(\s*["']?https?:/i;

  function sourceFiles(): string[] {
    return readdirSync(srcDir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name))
      .filter((f) => /\.(css|tsx?)$/.test(f) && !/\.test\.tsx?$/.test(f));
  }

  it("keeps Google Fonts out of index.html and the source", () => {
    const files = [join(webDir, "index.html"), ...sourceFiles()];
    const offenders = files
      .filter((f) => REMOTE.test(readFileSync(f, "utf8")))
      .map((f) => relative(webDir, f));
    expect(offenders).toEqual([]);
  });
});

describe("service worker precache", () => {
  it("includes woff2 files in the workbox glob patterns", () => {
    const config = readFileSync(join(webDir, "vite.config.ts"), "utf8");
    expect(config).toMatch(/globPatterns:\s*\[[^\]]*woff2/);
  });
});
