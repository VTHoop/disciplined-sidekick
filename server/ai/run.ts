import type Anthropic from "@anthropic-ai/sdk";
import { APIConnectionError, APIError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { AiFunctionConfig } from "./config.js";
import { computeCostUsd, priceFor } from "./cost.js";
import {
  AiApiError,
  AiRefusalError,
  AiTruncatedError,
  AiValidationError,
  type ValidationIssue,
} from "./errors.js";
import type { ModelPrice } from "./pricing.js";
import type { AiRunRow, AiRunStore } from "./store.js";

/** The slice of the Anthropic client the runner uses. */
export interface AiClient {
  messages: Pick<Anthropic["messages"], "parse">;
}

export interface AiLogger {
  error(message: string, details?: unknown): void;
}

export interface AiFunction<I, O> {
  /** Key into the per-function config. */
  name: string;
  /** Bump when the prompt changes, so output changes can be traced to it. */
  promptVersion: string;
  /** Bump when the output schema changes. */
  schemaVersion: string;
  outputSchema: z.ZodType<O>;
  /** Builds the prompt from the input alone; never from who is asking. */
  buildRequest(input: I): {
    system: string;
    messages: Anthropic.MessageParam[];
  };
}

export interface RunDeps {
  client: AiClient;
  store: AiRunStore;
  config: Readonly<Record<string, Readonly<AiFunctionConfig>>>;
  prices: Readonly<Record<string, ModelPrice>>;
  logger?: AiLogger;
  sleep?: (ms: number) => Promise<void>;
}

export interface RunContext {
  /** Recorded on the row for per-user access; null for runs with no user (cron). */
  userId: string | null;
}

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 500;

type Checked<O> =
  | { ok: true; value: O }
  | { ok: false; issues: ValidationIssue[] };

/**
 * The SDK's own zod parser throws on bad output, which loses the message and
 * its token usage. This one reports the failure as data so the run is still
 * priced and logged.
 */
function checkedFormat<O>(schema: z.ZodType<O>) {
  return {
    ...zodOutputFormat(schema),
    parse(text: string): Checked<O> {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (e) {
        return {
          ok: false,
          issues: [
            {
              path: [],
              message: `Output is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
        };
      }
      const result = schema.safeParse(json);
      if (result.success) return { ok: true, value: result.data };
      return {
        ok: false,
        issues: result.error.issues.map((i) => ({
          path: i.path,
          message: i.message,
          code: i.code,
        })),
      };
    },
  };
}

function isRetryable(e: unknown): boolean {
  if (e instanceof APIConnectionError) return true;
  if (!(e instanceof APIError) || e.status === undefined) return false;
  return (
    e.status === 408 || e.status === 409 || e.status === 429 || e.status >= 500
  );
}

/**
 * Runs one typed AI function and writes exactly one `ai_runs` row for the
 * invocation, whatever the outcome. Retries are counted on that row, not
 * written as rows of their own.
 */
export async function runAiFunction<I, O>(
  deps: RunDeps,
  fn: AiFunction<I, O>,
  input: I,
  { userId }: RunContext,
): Promise<O> {
  const cfg = deps.config[fn.name];
  if (!cfg) throw new Error(`No AI config entry for function "${fn.name}"`);
  const logger = deps.logger ?? console;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const startedAt = new Date().toISOString();

  const base = {
    user_id: userId,
    function_name: fn.name,
    requested_model: cfg.model,
    effort: cfg.effort,
    prompt_version: fn.promptVersion,
    schema_version: fn.schemaVersion,
    input,
    started_at: startedAt,
  };
  const record = async (
    row: Omit<AiRunRow, keyof typeof base | "finished_at" | "attempts">,
    attempts: number,
  ) => {
    const full: AiRunRow = {
      ...base,
      ...row,
      attempts,
      finished_at: new Date().toISOString(),
    };
    try {
      await deps.store.insert(full);
    } catch (error) {
      logger.error("ai_runs insert failed; the run was not recorded", {
        error,
        run: full,
      });
    }
  };

  const request = fn.buildRequest(input);
  const format = checkedFormat(fn.outputSchema);
  // Retries are counted here, so the SDK's own retrying is switched off in the client.
  let attempts = 0;
  let message: (Anthropic.Message & { parsed_output?: unknown }) | undefined;
  let failure: unknown;
  while (!message) {
    attempts++;
    try {
      message = await deps.client.messages.parse({
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        system: request.system,
        messages: request.messages,
        output_config: { effort: cfg.effort, format },
      });
    } catch (e) {
      failure = e;
      if (!isRetryable(e) || attempts > MAX_RETRIES) break;
      await sleep(BASE_BACKOFF_MS * 2 ** (attempts - 1));
    }
  }

  if (!message) {
    const text = failure instanceof Error ? failure.message : String(failure);
    await record(
      {
        status: "api_error",
        model: null,
        input_tokens: null,
        output_tokens: null,
        cache_read_tokens: null,
        cache_write_tokens: null,
        cost_usd: null,
        stop_reason: null,
        stop_details: null,
        output: null,
        validation_errors: null,
        error_message: text,
      },
      attempts,
    );
    throw new AiApiError(text, attempts, { cause: failure });
  }

  let costUsd: number | null = null;
  try {
    costUsd = computeCostUsd(
      message.usage,
      priceFor(deps.prices, message.model),
    );
  } catch (error) {
    logger.error(
      `ai_runs cost not computed: no usable price (${message.model})`,
      {
        error,
        model: message.model,
      },
    );
  }
  const text = message.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("");
  const answered = {
    model: message.model,
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_read_tokens: message.usage.cache_read_input_tokens ?? null,
    cache_write_tokens: message.usage.cache_creation_input_tokens ?? null,
    cost_usd: costUsd,
    stop_reason: message.stop_reason,
    stop_details: message.stop_details ?? null,
  };

  if (message.stop_reason === "refusal") {
    await record(
      {
        ...answered,
        status: "refusal",
        output: null,
        validation_errors: null,
        error_message: null,
      },
      attempts,
    );
    throw new AiRefusalError(message.stop_details ?? null);
  }

  if (message.stop_reason === "max_tokens") {
    await record(
      {
        ...answered,
        status: "truncated",
        output: { raw_text: text },
        validation_errors: null,
        error_message: null,
      },
      attempts,
    );
    throw new AiTruncatedError();
  }

  const checked = message.parsed_output as Checked<O> | null | undefined;
  if (!checked?.ok) {
    const issues = checked?.issues ?? [
      { path: [], message: "The response held no structured output" },
    ];
    await record(
      {
        ...answered,
        status: "validation_error",
        output: { raw_text: text },
        validation_errors: issues,
        error_message: null,
      },
      attempts,
    );
    throw new AiValidationError(issues);
  }

  await record(
    {
      ...answered,
      status: "success",
      output: checked.value,
      validation_errors: null,
      error_message: null,
    },
    attempts,
  );
  return checked.value;
}
