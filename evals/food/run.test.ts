import { beforeEach, describe, expect, it, vi } from "vitest";
import { AI_CONFIG } from "../../server/ai/config";
import { estimateFoodFunction } from "../../server/ai/functions/estimate-food";
import { parseFoodFunction } from "../../server/ai/functions/parse-food";
import { pickFoodFunction } from "../../server/ai/functions/pick-food";
import { MODEL_PRICES } from "../../server/ai/pricing";
import type { AiClient } from "../../server/ai/run";
import { UsdaError, type UsdaFood } from "../../server/food/usda";
import { type EvalDeps, type MainIo, main, runCases, selectCases } from "./run";
import { type EvalCase, UNCONFIRMED } from "./types";

const createClient = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("the eval must not build a Supabase client");
  }),
);
vi.mock("@supabase/supabase-js", () => ({ createClient }));

type Fn = "parseFood" | "pickFood" | "estimateFood";
type Reply = { model?: string; stop_reason?: string; text: string } | Error;

const SYSTEMS: Record<Fn, string> = {
  parseFood: parseFoodFunction.buildRequest({ text: "x" }).system,
  pickFood: pickFoodFunction.buildRequest({
    canonicalName: "x",
    candidates: [],
  }).system,
  estimateFood: estimateFoodFunction.buildRequest({ canonicalName: "x" })
    .system,
};

/** A fake Anthropic client that answers each AI function from its own handler. */
function routedClient(handlers: Partial<Record<Fn, () => Reply>>) {
  const calls: { fn: Fn; params: Record<string, unknown> }[] = [];
  const client = {
    messages: {
      async parse(params: Record<string, unknown>) {
        const fn = (Object.keys(SYSTEMS) as Fn[]).find(
          (f) => SYSTEMS[f] === params.system,
        );
        if (!fn) throw new Error("unrouted request");
        calls.push({ fn, params });
        const reply = handlers[fn]?.();
        if (!reply) throw new Error(`no handler for ${fn}`);
        if (reply instanceof Error) throw reply;
        const stop = reply.stop_reason ?? "end_turn";
        const format = (
          params.output_config as {
            format: { parse: (t: string) => unknown };
          }
        ).format;
        return {
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: reply.model ?? (params.model as string),
          stop_reason: stop,
          stop_details: null,
          content: [{ type: "text", text: reply.text }],
          usage: {
            input_tokens: 1000,
            output_tokens: 100,
            cache_read_input_tokens: null,
            cache_creation_input_tokens: null,
          },
          parsed_output:
            stop === "end_turn" ? format.parse(reply.text) : undefined,
        };
      },
    },
  } as unknown as AiClient;
  return { client, calls };
}

const json = (body: unknown): Reply => ({ text: JSON.stringify(body) });

const parsedEggs = json({
  items: [
    {
      name: "Eggs",
      canonicalName: "egg, whole, cooked",
      usdaQuery: "egg whole cooked",
      grams: 100,
      portionEstimated: false,
      countsFruitVeg: false,
      brand: null,
      path: "generic",
      servings: null,
      measure: null,
    },
  ],
});

const usdaEgg: UsdaFood = {
  fdcId: 171287,
  description: "Egg, whole, cooked",
  dataType: "SR Legacy",
  foodNutrients: [
    { nutrientId: 1008, value: 143 },
    { nutrientId: 1003, value: 12.6 },
  ],
};

function fakeUsda(search: () => Promise<UsdaFood[]> = async () => [usdaEgg]) {
  const fn = vi.fn(search);
  return { usda: { search: fn }, search: fn };
}

const eggsCase: EvalCase = {
  id: "two-eggs",
  category: "count",
  input: "2 eggs",
  expected: {
    items: [
      {
        name: "Eggs",
        canonicalName: "egg, whole, cooked",
        grams: 100,
        portionEstimated: false,
        countsFruitVeg: false,
        brand: null,
        path: "generic",
        source: "usda",
        fdcIds: [171287],
        answerSource: "usda-entry",
      },
    ],
    kcal: 143,
    protein: 12.6,
  },
};

const unconfirmedCase: EvalCase = {
  id: "mezeh-bowl",
  category: "mixed-dish",
  input: "Mezeh bowl",
  expected: { items: UNCONFIRMED, kcal: UNCONFIRMED, protein: UNCONFIRMED },
};

const deps = (
  client: AiClient,
  usda = fakeUsda().usda,
  config: EvalDeps["config"] = AI_CONFIG,
): EvalDeps => ({ client, usda, config, prices: MODEL_PRICES });

const happy = () =>
  routedClient({
    parseFood: () => parsedEggs,
    pickFood: () => json({ fdcId: 171287 }),
  });

describe("runCases", () => {
  it("runs each case through logFood with the AI functions bound by runAiFunction", async () => {
    const { client, calls } = happy();
    const [run] = await runCases([eggsCase], { repeats: 1 }, deps(client));
    expect(calls.map((c) => c.fn)).toEqual(["parseFood", "pickFood"]);
    expect(calls[0]?.params.messages).toEqual(
      parseFoodFunction.buildRequest({ text: "2 eggs" }).messages,
    );
    const repeat = run?.repeats[0];
    expect(repeat?.outcome).toMatchObject({
      kind: "ok",
      preview: {
        items: [{ canonicalName: "egg, whole, cooked", fdcId: 171287 }],
      },
    });
    expect(repeat?.calls).toEqual([
      expect.objectContaining({
        function: "parseFood",
        promptVersion: parseFoodFunction.promptVersion,
        requestedModel: AI_CONFIG.parseFood.model,
        model: AI_CONFIG.parseFood.model,
        effort: AI_CONFIG.parseFood.effort,
        status: "success",
        costUsd: expect.any(Number),
        durationMs: expect.any(Number),
      }),
      expect.objectContaining({
        function: "pickFood",
        promptVersion: pickFoodFunction.promptVersion,
      }),
    ]);
  });

  it("uses a fresh cache for each repeat, so every repeat looks its food up", async () => {
    const { client, calls } = happy();
    const { usda, search } = fakeUsda();
    const [run] = await runCases(
      [eggsCase],
      { repeats: 3 },
      deps(client, usda),
    );
    expect(run?.repeats).toHaveLength(3);
    expect(search).toHaveBeenCalledTimes(3);
    expect(calls.filter((c) => c.fn === "pickFood")).toHaveLength(3);
  });

  it("keeps each repeat's AI calls in an in-memory store, apart from other repeats", async () => {
    const { client } = happy();
    const [run] = await runCases([eggsCase], { repeats: 2 }, deps(client));
    expect(run?.repeats.map((r) => r.calls.length)).toEqual([2, 2]);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("a config override reaches the request's model and effort", async () => {
    const { client, calls } = happy();
    await runCases(
      [eggsCase],
      { repeats: 1 },
      deps(client, undefined, {
        ...AI_CONFIG,
        parseFood: {
          model: "claude-opus-5-5",
          effort: "high",
          maxTokens: 2048,
        },
      }),
    );
    expect(calls[0]?.params).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 2048,
      output_config: { effort: "high" },
    });
  });

  it("records the error type and message, then runs the next repeat", async () => {
    let parses = 0;
    const { client } = routedClient({
      parseFood: () => (++parses === 1 ? { text: "not json" } : parsedEggs),
      pickFood: () => json({ fdcId: 171287 }),
    });
    const [run] = await runCases([eggsCase], { repeats: 2 }, deps(client));
    expect(run?.repeats[0]?.outcome).toEqual({
      kind: "error",
      type: "AiValidationError",
      message: expect.stringContaining("validation"),
    });
    expect(run?.repeats[1]?.outcome.kind).toBe("ok");
  });

  it("records an infrastructure error from USDA", async () => {
    const { client } = happy();
    const { usda } = fakeUsda(async () => {
      throw new UsdaError("USDA search failed: 503");
    });
    const [run] = await runCases(
      [eggsCase],
      { repeats: 1 },
      deps(client, usda),
    );
    expect(run?.repeats[0]?.outcome).toEqual({
      kind: "error",
      type: "UsdaError",
      message: "USDA search failed: 503",
    });
  });
});

describe("selectCases", () => {
  const cases = [eggsCase, unconfirmedCase];

  it("keeps every case with no filter", () => {
    expect(selectCases(cases, { ids: [], categories: [] })).toEqual({
      ok: true,
      cases,
    });
  });

  it("keeps cases named by id or in a named category", () => {
    expect(selectCases(cases, { ids: ["two-eggs"], categories: [] })).toEqual({
      ok: true,
      cases: [eggsCase],
    });
    expect(selectCases(cases, { ids: [], categories: ["mixed-dish"] })).toEqual(
      { ok: true, cases: [unconfirmedCase] },
    );
  });

  it("names every id or category that doesn't exist", () => {
    expect(
      selectCases(cases, { ids: ["nope"], categories: ["breakfast"] }),
    ).toEqual({ ok: false, unknown: ["nope", "breakfast"] });
  });
});

describe("main", () => {
  const ENV = { ANTHROPIC_API_KEY: "sk-test", API_DATA_GOV_KEY: "usda-test" };
  let out: string[];
  let err: string[];
  let written: { path: string; contents: string }[];

  beforeEach(() => {
    out = [];
    err = [];
    written = [];
  });

  const io = (over: Partial<MainIo> = {}): MainIo => ({
    argv: [],
    env: ENV,
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
    cases: [eggsCase, unconfirmedCase],
    createDeps: () => deps(happy().client),
    writeResults: async (path, contents) => {
      written.push({ path, contents });
    },
    now: () => new Date("2026-11-17T21:50:03.123Z"),
    ...over,
  });

  it.each(["ANTHROPIC_API_KEY", "API_DATA_GOV_KEY"])(
    "exits non-zero naming a missing %s, and makes no calls",
    async (name) => {
      const createDeps = vi.fn();
      const code = await main(io({ env: { ...ENV, [name]: "" }, createDeps }));
      expect(code).not.toBe(0);
      expect(err.join("\n")).toContain(name);
      expect(createDeps).not.toHaveBeenCalled();
    },
  );

  it("an unknown id or category exits non-zero with its name and makes no calls", async () => {
    const createDeps = vi.fn();
    const code = await main(
      io({ argv: ["--case", "nope", "--category", "breakfast"], createDeps }),
    );
    expect(code).not.toBe(0);
    expect(err.join("\n")).toContain("nope");
    expect(err.join("\n")).toContain("breakfast");
    expect(createDeps).not.toHaveBeenCalled();
  });

  it("a bad flag exits non-zero and makes no calls", async () => {
    const createDeps = vi.fn();
    expect(await main(io({ argv: ["--repeats", "0"], createDeps }))).not.toBe(
      0,
    );
    expect(createDeps).not.toHaveBeenCalled();
  });

  it("exits 0 when checks fail, and writes the results file", async () => {
    const wrong = routedClient({
      parseFood: () => parsedEggs,
      pickFood: () => json({ fdcId: null }),
      estimateFood: () => json({ kcalPer100g: 500, proteinPer100g: 1 }),
    });
    const code = await main(
      io({ argv: ["--repeats", "2"], createDeps: () => deps(wrong.client) }),
    );
    expect(code).toBe(0);
    expect(written.map((w) => w.path)).toEqual([
      "evals/results/2026-11-17T21-50-03-123Z.json",
    ]);
    const results = JSON.parse(written[0]?.contents ?? "{}");
    expect(results.version).toBe(1);
    expect(results.cases[0].counts.pick).toEqual({ passed: 0, scored: 2 });
  });

  it("unconfirmed cases run but aren't scored, and are reported separately", async () => {
    const { client, calls } = routedClient({
      parseFood: () => parsedEggs,
      pickFood: () => json({ fdcId: 171287 }),
    });
    await main(io({ createDeps: () => deps(client) }));
    // 3 repeats of each of the two cases.
    expect(calls.filter((c) => c.fn === "parseFood")).toHaveLength(6);
    const results = JSON.parse(written[0]?.contents ?? "{}");
    expect(results.cases[1]).toMatchObject({
      id: "mezeh-bowl",
      status: "unconfirmed",
      counts: {},
    });
    expect(results.summary.unconfirmed).toEqual(["mezeh-bowl"]);
    expect(out.join("\n")).toMatch(/unconfirmed[^\n]*mezeh-bowl/i);
  });

  it("exits non-zero when every repeat hit an infrastructure error", async () => {
    const down = routedClient({
      parseFood: () => new Error("socket hang up"),
    });
    const code = await main(io({ createDeps: () => deps(down.client) }));
    expect(code).not.toBe(0);
    expect(written).toHaveLength(1);
  });

  it("exits 0 when only some repeats hit an infrastructure error", async () => {
    let n = 0;
    const flaky = routedClient({
      parseFood: () =>
        ++n % 2 === 0 ? new Error("socket hang up") : parsedEggs,
      pickFood: () => json({ fdcId: 171287 }),
    });
    expect(await main(io({ createDeps: () => deps(flaky.client) }))).toBe(0);
  });

  it("builds the real deps from the keys without a Supabase client", async () => {
    const { realEvalDeps } = await import("./run");
    const built = realEvalDeps({
      anthropicApiKey: "sk-test",
      usdaApiKey: "usda-test",
    });
    expect(built.config).toBe(AI_CONFIG);
    expect(built.prices).toBe(MODEL_PRICES);
    expect(createClient).not.toHaveBeenCalled();
  });
});
