import { describe, expect, it } from "vitest";
import { clampPercent } from "./index";

describe("clampPercent", () => {
  it("is exported from the package index", () => {
    expect(clampPercent).toBeTypeOf("function");
  });

  it.each([0, 42.5, 100])("returns %d unchanged", (value) => {
    expect(clampPercent(value)).toBe(value);
  });

  it.each([-0.1, -50, Number.NEGATIVE_INFINITY])(
    "returns 0 for %d",
    (value) => {
      expect(clampPercent(value)).toBe(0);
    },
  );

  it.each([100.1, 250, Number.POSITIVE_INFINITY])(
    "returns 100 for %d",
    (value) => {
      expect(clampPercent(value)).toBe(100);
    },
  );

  it("returns 0 for NaN", () => {
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});
