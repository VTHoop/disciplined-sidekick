import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readWeb } from "./styles/css-test-utils";
import { THEME_KEY } from "./theme";

const html = readWeb("index.html");

/** The inline (non-module, no src) script that runs before the app loads. */
function inlineScript(): string {
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1] as string;
    if (!/\bsrc=|type="module"/.test(attrs)) return m[2] as string;
  }
  throw new Error("index.html has no inline script");
}

const run = () => new Function(inlineScript())();
const media = (scheme: string) =>
  document.head
    .querySelector(`meta[data-scheme="${scheme}"]`)
    ?.getAttribute("media");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.head.innerHTML = [...html.matchAll(/<meta[^>]*theme-color[^>]*>/g)]
    .map((m) => m[0])
    .join("");
});

afterEach(() => {
  document.head.innerHTML = "";
});

describe("index.html inline theme script", () => {
  it("runs in <head> before the stylesheet-bearing module script, so the first paint is in the right theme", () => {
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    expect(head).toMatch(/<script(?![^>]*\b(?:src|type="module"))/);
    expect(html.indexOf("<script>")).toBeLessThan(
      html.indexOf('type="module"'),
    );
  });

  it.each(["light", "dark"])("pins the page to a stored %s", (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    run();
    expect(document.documentElement.dataset.theme).toBe(theme);
  });

  it("applies the stored theme's status-bar colour", () => {
    localStorage.setItem(THEME_KEY, "dark");
    run();
    expect(media("dark")).toBe("all");
    expect(media("light")).toBe("not all");
  });

  it.each([
    ["nothing stored", null],
    ["System", "system"],
    ["an unknown value", "sepia"],
  ])("leaves the page to the device for %s", (_label, stored) => {
    if (stored) localStorage.setItem(THEME_KEY, stored);
    run();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(media("light")).toBe("(prefers-color-scheme: light)");
    expect(media("dark")).toBe("(prefers-color-scheme: dark)");
  });

  it("does not throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run).not.toThrow();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
