import { appName } from "@disciplined-sidekick/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appTitle, appVersion } from "./app-info";

describe("appTitle", () => {
  it("is built from the core package's appName via the workspace", () => {
    expect(appTitle()).toBe(appName());
  });
});

describe("appVersion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is the version injected at build time", () => {
    vi.stubGlobal("__APP_VERSION__", "abc1234");
    expect(appVersion()).toBe("abc1234");
  });

  it("is 'dev' when nothing was injected", () => {
    expect(appVersion()).toBe("dev");
  });
});
