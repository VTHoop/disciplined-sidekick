import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, readTheme, saveTheme, THEME_KEY } from "./theme";

const LIGHT_MEDIA = "(prefers-color-scheme: light)";
const DARK_MEDIA = "(prefers-color-scheme: dark)";

function setUpHead() {
  document.head.innerHTML = `
    <meta name="theme-color" content="#f3f4f0" media="${LIGHT_MEDIA}" data-scheme="light" />
    <meta name="theme-color" content="#18221b" media="${DARK_MEDIA}" data-scheme="dark" />`;
}

const metaMedia = (scheme: string) =>
  document.head
    .querySelector(`meta[data-scheme="${scheme}"]`)
    ?.getAttribute("media");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  setUpHead();
});

afterEach(() => {
  document.head.innerHTML = "";
});

describe("readTheme", () => {
  it("is System when nothing is stored", () => {
    expect(readTheme()).toBe("system");
  });

  it.each(["light", "dark", "system"] as const)("reads %s back", (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    expect(readTheme()).toBe(theme);
  });

  it("is System for a value it does not know", () => {
    localStorage.setItem(THEME_KEY, "sepia");
    expect(readTheme()).toBe("system");
  });

  it("is System when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readTheme()).toBe("system");
  });
});

describe("saveTheme", () => {
  it("stores the choice on this device", () => {
    saveTheme("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(readTheme()).toBe("dark");
  });

  it("does not throw when storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(() => saveTheme("dark")).not.toThrow();
  });
});

describe("applyTheme", () => {
  it.each(["light", "dark"] as const)("pins the page to %s", (theme) => {
    applyTheme(theme);
    expect(document.documentElement.dataset.theme).toBe(theme);
  });

  it("leaves the page to the device for System", () => {
    applyTheme("dark");
    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("makes only the dark status-bar colour apply when Dark is chosen", () => {
    applyTheme("dark");
    expect(metaMedia("dark")).toBe("all");
    expect(metaMedia("light")).toBe("not all");
  });

  it("makes only the light status-bar colour apply when Light is chosen", () => {
    applyTheme("light");
    expect(metaMedia("light")).toBe("all");
    expect(metaMedia("dark")).toBe("not all");
  });

  it("gives the status-bar colours back to the device for System", () => {
    applyTheme("dark");
    applyTheme("system");
    expect(metaMedia("light")).toBe(LIGHT_MEDIA);
    expect(metaMedia("dark")).toBe(DARK_MEDIA);
  });
});
