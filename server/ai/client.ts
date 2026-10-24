import Anthropic from "@anthropic-ai/sdk";
import { REQUEST_TIMEOUT_MS } from "./timeouts.js";

/**
 * The one place the Anthropic client is built. Retrying is done by the runner
 * so each invocation's attempts are counted, hence maxRetries 0 here; the
 * timeout is per attempt.
 */
export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    maxRetries: 0,
    timeout: REQUEST_TIMEOUT_MS,
  });
}
