import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FRUIT_VEG_RULES } from "../../../packages/core/src/index.js";
import { AI_CONFIG } from "../config";
import { AiValidationError } from "../errors";
import { MODEL_PRICES } from "../pricing";
import { runAiFunction } from "../run";
import { fakeClient, memoryStore } from "../test-helpers";
import { parseFoodFunction } from "./parse-food";

const USER = {
  id: "4f1c1f0e-8f0b-4a53-9b0c-0d2b7d3f6a11",
  email: "sam.tester@example.com",
  name: "Sam Tester",
};

const twoItems = {
  items: [
    {
      name: "2 eggs",
      canonicalName: "egg, whole, raw",
      usdaQuery: "egg whole raw",
      grams: 100,
      portionEstimated: true,
      countsFruitVeg: false,
      brand: null,
      path: "generic",
      servings: null,
      measure: null,
    },
    {
      name: "150 g blueberries",
      canonicalName: "blueberries, raw",
      usdaQuery: "blueberries raw",
      grams: 150,
      portionEstimated: false,
      countsFruitVeg: true,
      brand: null,
      path: "generic",
      servings: null,
      measure: null,
    },
  ],
};

function run(text: string) {
  const { client, calls } = fakeClient([
    {
      model: AI_CONFIG.parseFood.model,
      stop_reason: "end_turn",
      text,
      usage: { input_tokens: 500, output_tokens: 120 },
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
    parseFoodFunction,
    { text: "2 eggs and 150 g blueberries" },
    { userId: USER.id, entryId: "e1" },
  );
  return { result, calls, rows };
}

const system = () =>
  String(parseFoodFunction.buildRequest({ text: "x" }).system);

describe("parseFood", () => {
  it("has a new schema version, since the output schema gained measure", () => {
    expect(parseFoodFunction.schemaVersion).toBe("3");
  });

  it("returns typed items with grams, a canonical name, a USDA query and both flags", async () => {
    await expect(run(JSON.stringify(twoItems)).result).resolves.toEqual(
      twoItems,
    );
  });

  it("accepts an entry with no food as an empty item list", async () => {
    await expect(run('{"items":[]}').result).resolves.toEqual({ items: [] });
  });

  it.each([
    ["not JSON", "eggs, blueberries"],
    ["a missing field", '{"items":[{"name":"egg","grams":50}]}'],
    [
      "zero grams",
      JSON.stringify({ items: [{ ...twoItems.items[0], grams: 0 }] }),
    ],
    [
      "negative grams",
      JSON.stringify({ items: [{ ...twoItems.items[0], grams: -5 }] }),
    ],
    [
      "a blank canonical name",
      JSON.stringify({ items: [{ ...twoItems.items[0], canonicalName: " " }] }),
    ],
    [
      "a non-boolean flag",
      JSON.stringify({
        items: [{ ...twoItems.items[0], countsFruitVeg: "yes" }],
      }),
    ],
    ["no items array", '{"foods":[]}'],
  ])("rejects malformed output (%s) by schema validation", async (_, text) => {
    const { result, rows } = run(text);
    await expect(result).rejects.toBeInstanceOf(AiValidationError);
    expect(rows[0]?.status).toBe("validation_error");
  });

  it("has a new prompt version, so ai_runs can compare before and after", () => {
    expect(parseFoodFunction.promptVersion).toBe("parseFood@4");
  });

  it("records the new prompt version on the ai_runs row", async () => {
    const { result, rows } = run(JSON.stringify(twoItems));
    await result;
    expect(rows[0]?.prompt_version).toBe("parseFood@4");
  });

  it("treats each line as a separate food unless the line names several", () => {
    const prompt = system();
    expect(prompt).toMatch(/each line/i);
    expect(prompt).toMatch(/separate food/i);
    expect(prompt).toContain("2 eggs and toast");
    expect(prompt).toMatch(/comma/i);
  });

  it("passes a multi-line entry to the model with its line breaks", () => {
    const text = "2 eggs\n150 g blueberries\ntoast, butter";
    const { messages } = parseFoodFunction.buildRequest({ text });
    expect(messages[0]?.content).toBe(text);
  });

  it("returns the brand, the path and the label servings of a branded item", async () => {
    const chobani = {
      ...twoItems.items[0],
      name: "Chobani plain greek yogurt",
      canonicalName: "plain greek yogurt",
      usdaQuery: "plain greek yogurt",
      brand: "Chobani",
      path: "branded",
      servings: 2,
    };
    await expect(
      run(JSON.stringify({ items: [chobani] })).result,
    ).resolves.toEqual({ items: [chobani] });
  });

  it("returns the household measure the entry gave, apart from servings", async () => {
    const rana = {
      ...twoItems.items[0],
      name: "Rana lobster ravioli",
      canonicalName: "lobster ravioli",
      brand: "Rana",
      path: "branded",
      measure: { amount: 1, unit: "cup" },
    };
    await expect(
      run(JSON.stringify({ items: [rana] })).result,
    ).resolves.toEqual({ items: [rana] });
  });

  it("explains measure to the model, with cups and the cases that give null", () => {
    const prompt = system();
    expect(prompt).toMatch(/measure/);
    expect(prompt).toMatch(/1 cup/);
    expect(prompt).toMatch(/null[^.]*(grams|ounces|weight)/i);
  });

  it("returns restaurant items with the restaurant as the brand", async () => {
    const items = ["chicken", "white rice", "black beans"].map((canonical) => ({
      ...twoItems.items[0],
      name: `Chipotle ${canonical}`,
      canonicalName: canonical,
      brand: "Chipotle",
      path: "restaurant",
    }));
    await expect(run(JSON.stringify({ items })).result).resolves.toEqual({
      items,
    });
  });

  it.each([
    ["a branded item with no brand", { path: "branded", brand: null }],
    ["a restaurant item with no brand", { path: "restaurant", brand: null }],
    ["a branded item with a blank brand", { path: "branded", brand: " " }],
    ["a generic item with a brand", { path: "generic", brand: "Chobani" }],
    ["an unknown path", { path: "store", brand: "Chobani" }],
    ["missing brand", { brand: undefined }],
    ["missing path", { path: undefined }],
    ["missing servings", { servings: undefined }],
    ["missing measure", { measure: undefined }],
    ["a measure of zero", { measure: { amount: 0, unit: "cup" } }],
    ["a negative measure", { measure: { amount: -1, unit: "cup" } }],
    ["a measure with no unit", { measure: { amount: 1, unit: " " } }],
    ["a measure with no amount", { measure: { unit: "cup" } }],
    ["zero servings", { servings: 0 }],
    ["negative servings", { servings: -1 }],
  ])(
    "rejects %s, recorded as a validation error in ai_runs",
    async (_, patch) => {
      const item = { ...twoItems.items[0], ...patch };
      const { result, rows } = run(JSON.stringify({ items: [item] }));
      await expect(result).rejects.toBeInstanceOf(AiValidationError);
      expect(rows[0]?.status).toBe("validation_error");
      expect(rows[0]?.validation_errors).toBeTruthy();
    },
  );

  it("tells the model to keep brands out of canonicalName and to pick a path per item", () => {
    const prompt = system();
    expect(prompt).toMatch(/brand/);
    expect(prompt).toMatch(/generic/);
    expect(prompt).toMatch(/branded/);
    expect(prompt).toMatch(/restaurant/);
    expect(prompt).toMatch(/canonicalName[^.]*(no|never|without)[^.]*brand/i);
  });

  it("shows the model the Chobani, Chipotle and servings cases", () => {
    const prompt = system();
    expect(prompt).toContain("Chobani");
    expect(prompt).toContain("Chipotle");
    expect(prompt).toMatch(/servings/);
    expect(prompt).toMatch(/1 bar/);
  });

  it("puts the entry text in the user message", () => {
    const { messages } = parseFoodFunction.buildRequest({
      text: "2 eggs and 150 g blueberries",
    });
    expect(JSON.stringify(messages)).toContain("2 eggs and 150 g blueberries");
  });

  it("gives the model every 800 g rule from packages/core", () => {
    const prompt = system();
    for (const rule of [
      ...FRUIT_VEG_RULES.counts,
      ...FRUIT_VEG_RULES.doesNotCount,
      FRUIT_VEG_RULES.whenInDoubt,
    ]) {
      expect(prompt).toContain(rule);
    }
  });

  it("asks for mixed dishes without weights to be split into components with estimated grams", () => {
    const prompt = system();
    expect(prompt).toMatch(/mixed dish/i);
    expect(prompt).toMatch(/component/i);
    expect(prompt).toMatch(/listed with (their )?weights/i);
    expect(prompt).toMatch(/portionEstimated/);
  });

  it("sends a prompt payload with no user name, email or id", async () => {
    const { result, calls } = run(JSON.stringify(twoItems));
    await result;
    const payload = JSON.stringify(calls[0]);
    expect(payload).not.toContain(USER.id);
    expect(payload).not.toContain(USER.email);
    expect(payload).not.toContain("Tester");
  });

  it("names its model and effort nowhere in its own code (they live in the config entry)", () => {
    const source = readFileSync(
      join(import.meta.dirname, "parse-food.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/claude-/i);
    expect(source).not.toMatch(/effort/i);
    expect(AI_CONFIG).toHaveProperty(parseFoodFunction.name);
    expect(MODEL_PRICES).toHaveProperty(AI_CONFIG.parseFood.model);
  });
});
