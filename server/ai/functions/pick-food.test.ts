import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_CONFIG } from "../config";
import { AiValidationError } from "../errors";
import { MODEL_PRICES } from "../pricing";
import { runAiFunction } from "../run";
import { fakeClient, memoryStore } from "../test-helpers";
import { type PickFoodInput, pickFoodFunction } from "./pick-food";

const input: PickFoodInput = {
  canonicalName: "blueberries, raw",
  candidates: [
    { fdcId: 2346411, description: "Blueberries, raw", dataType: "Foundation" },
    {
      fdcId: 171711,
      description: "Blueberries, raw",
      dataType: "SR Legacy",
    },
    {
      fdcId: 2709251,
      description: "Blueberry pie",
      dataType: "Survey (FNDDS)",
    },
  ],
};

function run(text: string) {
  const { client, calls } = fakeClient([
    {
      model: AI_CONFIG.pickFood.model,
      stop_reason: "end_turn",
      text,
      usage: { input_tokens: 300, output_tokens: 20 },
    },
  ]);
  const { store, rows } = memoryStore();
  const deps = {
    client,
    store,
    config: AI_CONFIG,
    prices: MODEL_PRICES,
    sleep: async () => {},
  };
  const result = runAiFunction(deps, pickFoodFunction, input, {
    userId: "u1",
    entryId: "e1",
  });
  return { result, calls, rows };
}

describe("pickFood", () => {
  it("returns the chosen candidate's FDC id", async () => {
    await expect(run('{"fdcId":2346411}').result).resolves.toEqual({
      fdcId: 2346411,
    });
  });

  it("returns null when no candidate is suitable", async () => {
    await expect(run('{"fdcId":null}').result).resolves.toEqual({
      fdcId: null,
    });
  });

  it.each([
    ["not JSON", "the first one"],
    ["a string id", '{"fdcId":"2346411"}'],
    ["a fractional id", '{"fdcId":1.5}'],
    ["a missing field", "{}"],
  ])("rejects malformed output (%s) by schema validation", async (_, text) => {
    const { result, rows } = run(text);
    await expect(result).rejects.toBeInstanceOf(AiValidationError);
    expect(rows[0]?.status).toBe("validation_error");
  });

  it("shows the model the canonical name and every candidate", () => {
    const payload = JSON.stringify(pickFoodFunction.buildRequest(input));
    expect(payload).toContain("blueberries, raw");
    for (const c of input.candidates) {
      expect(payload).toContain(String(c.fdcId));
      expect(payload).toContain(c.description);
    }
  });

  it("has a new prompt version, so ai_runs can compare before and after", () => {
    expect(pickFoodFunction.promptVersion).toBe("pickFood@2");
  });

  describe("for a branded item", () => {
    const branded: PickFoodInput = {
      canonicalName: "plain greek yogurt",
      brand: "Chobani",
      candidates: [
        {
          fdcId: 2755534,
          description: "Plain Low- Fat Greek Yogurt",
          dataType: "Branded",
          brandOwner: "Chobani Global Holdings",
          brandName: "Chobani",
        },
        {
          fdcId: 1999001,
          description: "Plain Greek Yogurt",
          dataType: "Branded",
          brandOwner: "Kroger",
          brandName: "Simple Truth",
        },
      ],
    };

    it("shows the model the brand and each candidate's brand owner and brand name", () => {
      const payload = JSON.stringify(pickFoodFunction.buildRequest(branded));
      expect(payload).toContain("Chobani");
      expect(payload).toContain("Chobani Global Holdings");
      expect(payload).toContain("Kroger");
      expect(payload).toContain("Simple Truth");
    });

    it("tells the model to answer null unless a candidate is from the named brand, and that a store brand is no match", () => {
      const { system } = pickFoodFunction.buildRequest(branded);
      expect(String(system)).toMatch(/brand/i);
      expect(String(system)).toMatch(/null/);
      expect(String(system)).toMatch(/store brand/i);
    });
  });

  it("keeps the generic request free of brand wording", () => {
    const { system } = pickFoodFunction.buildRequest(input);
    expect(JSON.stringify(pickFoodFunction.buildRequest(input))).not.toMatch(
      /brandOwner|brandName/,
    );
    expect(String(system)).not.toMatch(/store brand/i);
  });

  it("names its model and effort nowhere in its own code (they live in the config entry)", () => {
    const source = readFileSync(
      join(import.meta.dirname, "pick-food.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/claude-/i);
    expect(source).not.toMatch(/effort/i);
    expect(MODEL_PRICES).toHaveProperty(AI_CONFIG.pickFood.model);
  });
});
