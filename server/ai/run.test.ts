import {
  APIConnectionError,
  BadRequestError,
  InternalServerError,
} from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AiApiError,
  AiRefusalError,
  AiTruncatedError,
  AiValidationError,
} from "./errors";
import { type AiFunction, type RunDeps, runAiFunction } from "./run";
import {
  type FakeMessage,
  fakeClient,
  memoryStore,
  type Scripted,
} from "./test-helpers";

const echoFn: AiFunction<{ text: string }, { answer: string }> = {
  name: "echo",
  promptVersion: "echo@3",
  schemaVersion: "2",
  outputSchema: z.object({ answer: z.string() }),
  buildRequest: ({ text }) => ({
    system: "Answer briefly.",
    messages: [{ role: "user", content: text }],
  }),
};

const prices = {
  "model-strong": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheReadPerMTok: 0.5,
    cacheWritePerMTok: 6.25,
  },
  "model-fallback": {
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheReadPerMTok: 0.1,
    cacheWritePerMTok: 1.25,
  },
};

const config = {
  echo: { model: "model-strong", effort: "medium", maxTokens: 512 },
} as const;

const ok = (overrides: Partial<FakeMessage> = {}): FakeMessage => ({
  model: "model-strong",
  stop_reason: "end_turn",
  text: '{"answer":"42"}',
  usage: {
    input_tokens: 1000,
    output_tokens: 200,
    cache_read_input_tokens: 4000,
    cache_creation_input_tokens: 500,
  },
  ...overrides,
});

const serverError = () =>
  new InternalServerError(500, {}, "boom", new Headers());

function setup(
  script: Scripted[],
  extra: Partial<RunDeps> = {},
  storeOptions: { failWith?: Error } = {},
) {
  const { client, calls } = fakeClient(script);
  const { store, rows } = memoryStore(storeOptions);
  const logger = { error: vi.fn() };
  const deps: RunDeps = {
    client,
    store,
    config,
    prices,
    logger,
    sleep: async () => {},
    ...extra,
  };
  const run = (
    input = { text: "what is 6 x 7?" },
    userId: string | null = "u1",
  ) => runAiFunction(deps, echoFn, input, { userId });
  return { run, rows, calls, logger };
}

describe("runAiFunction: success", () => {
  it("returns the parsed output and writes one row with the full run record", async () => {
    const { run, rows } = setup([ok()]);
    await expect(run()).resolves.toEqual({ answer: "42" });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: "u1",
      function_name: "echo",
      status: "success",
      model: "model-strong",
      requested_model: "model-strong",
      effort: "medium",
      prompt_version: "echo@3",
      schema_version: "2",
      attempts: 1,
      input_tokens: 1000,
      output_tokens: 200,
      cache_read_tokens: 4000,
      cache_write_tokens: 500,
      stop_reason: "end_turn",
      stop_details: null,
      input: { text: "what is 6 x 7?" },
      output: { answer: "42" },
      validation_errors: null,
      error_message: null,
    });
    // 1000*5 + 200*25 + 4000*0.5 + 500*6.25 per million
    expect(rows[0]?.cost_usd).toBeCloseTo(0.015125, 9);
    expect(Date.parse(rows[0]?.started_at ?? "")).not.toBeNaN();
    expect(Date.parse(rows[0]?.finished_at ?? "")).toBeGreaterThanOrEqual(
      Date.parse(rows[0]?.started_at ?? ""),
    );
  });

  it("sends the configured model, effort and token limit through messages.parse", async () => {
    const { run, calls } = setup([ok()]);
    await run();
    expect(calls[0]).toMatchObject({
      model: "model-strong",
      max_tokens: 512,
      system: "Answer briefly.",
      messages: [{ role: "user", content: "what is 6 x 7?" }],
      output_config: { effort: "medium" },
    });
  });

  it("records a null user when run without one (e.g. from a cron job)", async () => {
    const { run, rows } = setup([ok()]);
    await run({ text: "hi" }, null);
    expect(rows[0]?.user_id).toBeNull();
  });
});

describe("runAiFunction: configuration", () => {
  it("takes model and effort from the function's config entry only", async () => {
    const edited = {
      echo: { model: "model-fallback", effort: "high", maxTokens: 512 },
    } as const;
    const { client, calls } = fakeClient([ok({ model: "model-fallback" })]);
    const { store, rows } = memoryStore();
    await runAiFunction(
      { client, store, config: edited, prices, sleep: async () => {} },
      echoFn,
      { text: "x" },
      { userId: "u1" },
    );
    expect(calls[0]).toMatchObject({
      model: "model-fallback",
      output_config: { effort: "high" },
    });
    expect(rows[0]).toMatchObject({
      requested_model: "model-fallback",
      effort: "high",
    });
  });

  it("prices the model that actually answered, not the configured one", async () => {
    const { run, rows } = setup([ok({ model: "model-fallback" })]);
    await run();
    expect(rows[0]).toMatchObject({
      model: "model-fallback",
      requested_model: "model-strong",
    });
    // 1000*1 + 200*5 + 4000*0.1 + 500*1.25 per million
    expect(rows[0]?.cost_usd).toBeCloseTo(0.003025, 9);
  });

  it("leaves cost null and logs when the answering model has no price", async () => {
    const { run, rows, logger } = setup([ok({ model: "model-unpriced" })]);
    await expect(run()).resolves.toEqual({ answer: "42" });
    expect(rows[0]?.cost_usd).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("price"),
      expect.anything(),
    );
  });
});

describe("runAiFunction: retries and API failures", () => {
  it("counts attempts, not rows: a retry that succeeds writes one row with attempts 2", async () => {
    const { run, rows, calls } = setup([serverError(), ok()]);
    await expect(run()).resolves.toEqual({ answer: "42" });
    expect(calls).toHaveLength(2);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "success", attempts: 2 });
  });

  it("retries connection errors", async () => {
    const { run, rows } = setup([
      new APIConnectionError({ message: "reset" }),
      ok(),
    ]);
    await run();
    expect(rows[0]?.attempts).toBe(2);
  });

  it("surfaces AiApiError after retries are exhausted, with one api_error row", async () => {
    const { run, rows, calls } = setup([serverError()]);
    const err = await run().catch((e) => e);
    expect(err).toBeInstanceOf(AiApiError);
    expect(calls).toHaveLength(3); // first try + two retries
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "api_error",
      attempts: 3,
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      output: null,
    });
    expect(rows[0]?.error_message).toContain("500");
  });

  it("does not retry a non-retryable error", async () => {
    const { run, rows, calls } = setup([
      new BadRequestError(400, {}, "bad request", new Headers()),
    ]);
    await expect(run()).rejects.toBeInstanceOf(AiApiError);
    expect(calls).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "api_error", attempts: 1 });
  });
});

describe("runAiFunction: output validation", () => {
  it("surfaces AiValidationError and logs the validation errors in one row", async () => {
    const { run, rows } = setup([ok({ text: '{"wrong":1}' })]);
    const err = await run().catch((e) => e);
    expect(err).toBeInstanceOf(AiValidationError);
    expect(err.issues.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "validation_error",
      attempts: 1,
      stop_reason: "end_turn",
      output: { raw_text: '{"wrong":1}' },
      input_tokens: 1000,
    });
    expect(rows[0]?.validation_errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ["answer"] })]),
    );
    expect(rows[0]?.cost_usd).toBeGreaterThan(0);
  });

  it("treats text that is not JSON as a validation failure too", async () => {
    const { run, rows } = setup([ok({ text: "sorry, no" })]);
    await expect(run()).rejects.toBeInstanceOf(AiValidationError);
    expect(rows[0]).toMatchObject({
      status: "validation_error",
      output: { raw_text: "sorry, no" },
    });
    expect(rows[0]?.validation_errors).toHaveLength(1);
  });
});

describe("runAiFunction: refusals and truncation", () => {
  it("surfaces AiRefusalError and records stop_reason and stop_details", async () => {
    const stop_details = { type: "refusal" as const, category: "cyber" };
    const { run, rows } = setup([
      ok({ stop_reason: "refusal", stop_details, text: "" }),
    ]);
    const err = await run().catch((e) => e);
    expect(err).toBeInstanceOf(AiRefusalError);
    expect(err.stopDetails).toEqual(stop_details);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "refusal",
      stop_reason: "refusal",
      stop_details,
    });
  });

  it("surfaces AiTruncatedError for max_tokens and records stop_reason", async () => {
    const { run, rows } = setup([
      ok({ stop_reason: "max_tokens", text: '{"answer":"cut' }),
    ]);
    await expect(run()).rejects.toBeInstanceOf(AiTruncatedError);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "truncated",
      stop_reason: "max_tokens",
      stop_details: null,
      output: { raw_text: '{"answer":"cut' },
    });
  });
});

describe("runAiFunction: when the row write fails", () => {
  it("still returns the result and logs the run's details", async () => {
    const { run, logger } = setup(
      [ok()],
      {},
      {
        failWith: new Error("db down"),
      },
    );
    await expect(run()).resolves.toEqual({ answer: "42" });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("ai_runs"),
      expect.objectContaining({
        error: expect.any(Error),
        run: expect.objectContaining({
          function_name: "echo",
          status: "success",
          input: { text: "what is 6 x 7?" },
          output: { answer: "42" },
        }),
      }),
    );
  });

  it("still throws the typed error on a failed call", async () => {
    const { run, logger } = setup(
      [ok({ stop_reason: "max_tokens", text: "{" })],
      {},
      { failWith: new Error("db down") },
    );
    await expect(run()).rejects.toBeInstanceOf(AiTruncatedError);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
