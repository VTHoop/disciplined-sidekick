import { describe, expect, it } from "vitest";
import { computeCostUsd, priceFor } from "./cost";
import type { ModelPrice } from "./pricing";

const price: ModelPrice = {
  inputPerMTok: 5,
  outputPerMTok: 25,
  cacheReadPerMTok: 0.5,
  cacheWritePerMTok: 6.25,
};

describe("computeCostUsd", () => {
  it("prices input, output, cache-read and cache-write tokens separately", () => {
    const cost = computeCostUsd(
      {
        input_tokens: 1_000_000,
        output_tokens: 2_000_000,
        cache_read_input_tokens: 4_000_000,
        cache_creation_input_tokens: 1_000_000,
      },
      price,
    );
    // 5 + 50 + 2 + 6.25
    expect(cost).toBeCloseTo(63.25, 6);
  });

  it("treats missing cache counts as zero", () => {
    const cost = computeCostUsd(
      {
        input_tokens: 1000,
        output_tokens: 200,
        cache_read_input_tokens: null,
        cache_creation_input_tokens: null,
      },
      price,
    );
    expect(cost).toBeCloseTo(0.005 + 0.005, 9);
  });

  it("bills output_tokens as the inclusive total, so thinking tokens are not added twice", () => {
    const cost = computeCostUsd(
      {
        input_tokens: 0,
        output_tokens: 1_000_000,
        output_tokens_details: { thinking_tokens: 400_000 },
      },
      price,
    );
    expect(cost).toBeCloseTo(25, 6);
  });
});

describe("priceFor", () => {
  it("returns the price of the model that answered", () => {
    const prices = { a: price, b: { ...price, inputPerMTok: 1 } };
    expect(priceFor(prices, "b").inputPerMTok).toBe(1);
  });

  it("throws for a model with no configured price", () => {
    expect(() => priceFor({ a: price }, "mystery")).toThrow(/mystery/);
  });
});
