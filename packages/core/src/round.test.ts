import { describe, expect, it } from "vitest";
import * as core from "./index";
import { roundToTenth } from "./round";

describe("roundToTenth", () => {
  it("is exported from the package index", () => {
    expect(core.roundToTenth).toBe(roundToTenth);
  });

  it("rounds 1.24 down to 1.2", () => {
    expect(roundToTenth(1.24)).toBe(1.2);
  });

  it("rounds 1.26 up to 1.3", () => {
    expect(roundToTenth(1.26)).toBe(1.3);
  });
});
