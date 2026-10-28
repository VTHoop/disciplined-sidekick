import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FRUIT_VEG_RULES } from "@disciplined-sidekick/core";
import { describe, expect, it } from "vitest";
import { AI_CONFIG } from "../config";
import { AiValidationError } from "../errors";
import { MODEL_PRICES } from "../pricing";
import { runAiFunction } from "../run";
import { fakeClient, memoryStore } from "../test-helpers";
import { parseFoodFunction } from "./parse-food";

const USER = {
  id: "4f1c1f0e-8f0b-4a53-9b0c-0d2b7d3f6a11",
  email: "patrick@example.com",
  name: "Patrick Hooper",
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
    },
    {
      name: "150 g blueberries",
      canonicalName: "blueberries, raw",
      usdaQuery: "blueberries raw",
      grams: 150,
      portionEstimated: false,
      countsFruitVeg: true,
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
    expect(payload).not.toContain("Hooper");
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
