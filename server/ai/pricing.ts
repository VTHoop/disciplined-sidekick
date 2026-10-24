/** USD per million tokens. */
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  /** 5-minute cache writes, the SDK default. */
  cacheWritePerMTok: number;
}

/**
 * Prices of every model a function may be configured on, or fall back to.
 * Source: https://platform.claude.com/docs/en/about-claude/pricing
 * Add a row here before pointing a function's config entry at a new model.
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  // Haiku 5.5 is tiered by prompt size; this is the tier for prompts up to
  // 100,000 tokens (over that: 0.50 / 2.50 / 0.05 / 0.625). Revisit if a
  // Haiku function ever sends larger prompts.
  "claude-haiku-5-5": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    cacheReadPerMTok: 0.01,
    cacheWritePerMTok: 0.125,
  },
  "claude-fable-5-1": {
    inputPerMTok: 10,
    outputPerMTok: 50,
    cacheReadPerMTok: 0.25,
    cacheWritePerMTok: 12.5,
  },
  "claude-opus-5-5": {
    inputPerMTok: 4,
    outputPerMTok: 20,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 5,
  },
  "claude-sonnet-5-5": {
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadPerMTok: 0.1,
    cacheWritePerMTok: 2.5,
  },
};
