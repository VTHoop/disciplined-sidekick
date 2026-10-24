import type { ModelPrice } from "./pricing.js";

export interface Usage {
  input_tokens: number;
  /** Inclusive of thinking tokens; this is what the API bills. */
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  /** Informational: already counted in output_tokens. */
  output_tokens_details?: unknown;
}

export function priceFor(
  prices: Record<string, ModelPrice>,
  model: string,
): ModelPrice {
  const price = prices[model];
  if (!price) throw new Error(`No price configured for model "${model}"`);
  return price;
}

export function computeCostUsd(usage: Usage, price: ModelPrice): number {
  return (
    (usage.input_tokens * price.inputPerMTok +
      usage.output_tokens * price.outputPerMTok +
      (usage.cache_read_input_tokens ?? 0) * price.cacheReadPerMTok +
      (usage.cache_creation_input_tokens ?? 0) * price.cacheWritePerMTok) /
    1_000_000
  );
}
