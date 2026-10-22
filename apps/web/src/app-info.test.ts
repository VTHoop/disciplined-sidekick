import { appName } from "@health-agent/core";
import { describe, expect, it } from "vitest";
import { appTitle } from "./app-info";

describe("appTitle", () => {
  it("is built from the core package's appName via the workspace", () => {
    expect(appTitle()).toBe(appName());
  });
});
