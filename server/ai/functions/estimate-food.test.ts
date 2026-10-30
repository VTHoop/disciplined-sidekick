import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_CONFIG } from "../config";
import { AiValidationError } from "../errors";
import { MODEL_PRICES } from "../pricing";
import { runAiFunction } from "../run";
import { fakeClient, memoryStore } from "../test-helpers";
import { estimateFoodFunction } from "./estimate-food";

function run(text: string) {
  const { client } = fakeClient([
    {
      model: AI_CONFIG.estimateFood.model,
      stop_reason: "end_turn",
      text,
      usage: { input_tokens: 200, output_tokens: 20 },
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
  const result = runAiFunction(
    deps,
    estimateFoodFunction,
    { canonicalName: "mezeh harissa chicken" },
    { userId: "u1", entryId: "e1" },
  );
  return { result, rows };
}

describe("estimateFood", () => {
  it("returns per-100 g kcal and protein", async () => {
    await expect(
      run('{"kcalPer100g":165,"proteinPer100g":24.5}').result,
    ).resolves.toEqual({ kcalPer100g: 165, proteinPer100g: 24.5 });
  });

  it.each([
    ["not JSON", "about 165 kcal"],
    ["negative kcal", '{"kcalPer100g":-1,"proteinPer100g":2}'],
    ["negative protein", '{"kcalPer100g":10,"proteinPer100g":-2}'],
    [
      "protein over 100 g per 100 g",
      '{"kcalPer100g":400,"proteinPer100g":101}',
    ],
    ["a missing field", '{"kcalPer100g":165}'],
  ])("rejects malformed output (%s) by schema validation", async (_, text) => {
    const { result, rows } = run(text);
    await expect(result).rejects.toBeInstanceOf(AiValidationError);
    expect(rows[0]?.status).toBe("validation_error");
  });

  it("asks about the canonical name, per 100 g", () => {
    const payload = JSON.stringify(
      estimateFoodFunction.buildRequest({
        canonicalName: "mezeh harissa chicken",
      }),
    );
    expect(payload).toContain("mezeh harissa chicken");
    expect(payload).toMatch(/100 ?g/);
  });

  it("has a new prompt version, so ai_runs can compare before and after", () => {
    expect(estimateFoodFunction.promptVersion).toBe("estimateFood@2");
  });

  it("gives a branded item's brand to the model and says it is that brand's product", () => {
    const request = estimateFoodFunction.buildRequest({
      canonicalName: "plain greek yogurt",
      brand: "Chobani",
      path: "branded",
    });
    const payload = JSON.stringify(request);
    expect(payload).toContain("Chobani");
    expect(payload).toContain("plain greek yogurt");
    expect(String(request.system)).toMatch(/brand/i);
  });

  it("gives a restaurant item's restaurant and item to the model", () => {
    const request = estimateFoodFunction.buildRequest({
      canonicalName: "white rice",
      brand: "Chipotle",
      path: "restaurant",
    });
    const payload = JSON.stringify(request);
    expect(payload).toContain("Chipotle");
    expect(payload).toContain("white rice");
    expect(String(request.system)).toMatch(/restaurant/i);
  });

  it("keeps the generic request free of brand and restaurant wording", () => {
    const request = estimateFoodFunction.buildRequest({
      canonicalName: "mezeh harissa chicken",
    });
    expect(String(request.system)).not.toMatch(/brand|restaurant/i);
  });

  it("names its model and effort nowhere in its own code (they live in the config entry)", () => {
    const source = readFileSync(
      join(import.meta.dirname, "estimate-food.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/claude-/i);
    expect(source).not.toMatch(/effort/i);
    expect(MODEL_PRICES).toHaveProperty(AI_CONFIG.estimateFood.model);
  });
});
