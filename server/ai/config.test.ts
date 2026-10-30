import { describe, expect, it } from "vitest";
import { AI_CONFIG } from "./config";
import { MODEL_PRICES } from "./pricing";

describe("per-function AI config", () => {
  it("has a model, effort and token limit for the demo function", () => {
    expect(AI_CONFIG.demo).toEqual({
      model: expect.any(String),
      effort: expect.stringMatching(/^(low|medium|high|xhigh|max)$/),
      maxTokens: expect.any(Number),
    });
  });

  // ai_runs showed pickFood on Haiku at 256 tokens stop at max_tokens with empty
  // text on a Rana candidate list, so the pick never came back.
  it.each(["pickFood", "estimateFood"] as const)(
    "gives %s room beyond a bare JSON answer, so reasoning cannot truncate it",
    (name) => {
      expect(AI_CONFIG[name].maxTokens).toBeGreaterThanOrEqual(1024);
    },
  );

  it("has a configured price for every model the config names", () => {
    for (const [name, entry] of Object.entries(AI_CONFIG)) {
      expect(MODEL_PRICES[entry.model], `${name}: ${entry.model}`).toEqual({
        inputPerMTok: expect.any(Number),
        outputPerMTok: expect.any(Number),
        cacheReadPerMTok: expect.any(Number),
        cacheWritePerMTok: expect.any(Number),
      });
    }
  });
});
