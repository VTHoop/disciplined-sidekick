import Anthropic from "@anthropic-ai/sdk";

/**
 * The one place the Anthropic client is built. Retrying is done by the runner
 * so each invocation's attempts are counted, hence maxRetries 0 here.
 */
export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 0 });
}
