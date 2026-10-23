import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_CONFIG } from "../config";
import { MODEL_PRICES } from "../pricing";
import { runAiFunction } from "../run";
import { fakeClient, memoryStore } from "../test-helpers";
import { demoFunction } from "./demo";

const USER = {
  id: "4f1c1f0e-8f0b-4a53-9b0c-0d2b7d3f6a11",
  email: "patrick@example.com",
  name: "Patrick Hooper",
};

const answer = {
  model: AI_CONFIG.demo.model,
  stop_reason: "end_turn",
  text: '{"category":"breakfast"}',
  usage: { input_tokens: 50, output_tokens: 10 },
};

function setup() {
  const { client, calls } = fakeClient([answer]);
  const { store, rows } = memoryStore();
  const deps = {
    client,
    store,
    config: AI_CONFIG,
    prices: MODEL_PRICES,
    sleep: async () => {},
  };
  return { deps, calls, rows };
}

describe("demo function", () => {
  it("classifies a meal description into a typed result", async () => {
    const { deps } = setup();
    await expect(
      runAiFunction(
        deps,
        demoFunction,
        { text: "porridge with berries" },
        {
          userId: USER.id,
        },
      ),
    ).resolves.toEqual({ category: "breakfast" });
  });

  it("sends a prompt payload with no user name, email or id", async () => {
    const { deps, calls } = setup();
    await runAiFunction(
      deps,
      demoFunction,
      { text: "porridge with berries" },
      {
        userId: USER.id,
      },
    );
    const payload = JSON.stringify(calls[0]);
    expect(payload).toContain("porridge with berries");
    expect(payload).not.toContain(USER.id);
    expect(payload).not.toContain(USER.email);
    expect(payload).not.toContain(USER.name);
    expect(payload).not.toContain("Hooper");
    expect(calls[0]).not.toHaveProperty("metadata");
  });

  it("runs outside any HTTP request and still writes its row", async () => {
    // No Hono app, request or auth middleware anywhere in this test.
    const { deps, rows } = setup();
    await runAiFunction(
      deps,
      demoFunction,
      { text: "toast" },
      {
        userId: null,
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      function_name: demoFunction.name,
      status: "success",
      user_id: null,
      input: { text: "toast" },
    });
  });

  it("names its model and effort nowhere in its own code (they live in the config entry)", () => {
    const source = readFileSync(join(import.meta.dirname, "demo.ts"), "utf8");
    expect(source).not.toMatch(/claude-/i);
    expect(source).not.toMatch(/effort/i);
    expect(AI_CONFIG).toHaveProperty(demoFunction.name);
  });
});
