import { describe, expect, it } from "vitest";
import { cleanLines } from "./entry-text.js";

describe("cleanLines", () => {
  it("trims each line and drops blank lines", () => {
    expect(cleanLines("  2 eggs \n\n  \r\n toast\t\n")).toBe("2 eggs\ntoast");
  });

  it("leaves a one-line entry as it was, commas included", () => {
    expect(cleanLines("eggs, toast and butter")).toBe("eggs, toast and butter");
  });

  it("returns an empty string for blank text", () => {
    expect(cleanLines(" \n\t\n ")).toBe("");
  });
});
