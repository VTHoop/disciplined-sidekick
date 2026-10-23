import type { RefusalStopDetails } from "@anthropic-ai/sdk/resources/messages/messages";

export interface ValidationIssue {
  path: PropertyKey[];
  message: string;
  code?: string;
}

/** Base for every error a typed AI function can surface to its caller. */
export abstract class AiError extends Error {
  abstract readonly kind: string;
}

/** The API call failed, or kept failing after retries. */
export class AiApiError extends AiError {
  readonly kind = "api_error";
  constructor(
    message: string,
    readonly attempts: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** The model answered, but its output did not match the function's schema. */
export class AiValidationError extends AiError {
  readonly kind = "validation_error";
  constructor(readonly issues: ValidationIssue[]) {
    super(`AI output failed validation (${issues.length} issue(s))`);
  }
}

export class AiRefusalError extends AiError {
  readonly kind = "refusal";
  constructor(readonly stopDetails: RefusalStopDetails | null) {
    super("The model refused the request");
  }
}

/** The output hit max_tokens before it was complete. */
export class AiTruncatedError extends AiError {
  readonly kind = "truncated";
  constructor() {
    super("The model's output was cut off at max_tokens");
  }
}
