import { describe, expect, it } from "vitest";
import type { PreviewItem } from "../../packages/core/src/index.js";
import { AI_CONFIG } from "../../server/ai/config";
import type { Outcome } from "./grade";
import {
  buildResults,
  formatReport,
  RESULTS_VERSION,
  type ResultsFile,
  resultsPath,
} from "./report";
import type { AiCall, CaseRun } from "./run";
import {
  anySplit,
  type EvalCase,
  type ExpectedItem,
  UNCONFIRMED,
} from "./types";

const yogurt = (canonicalName: string): ExpectedItem => ({
  name: "Yogurt",
  canonicalName,
  grams: 170,
  portionEstimated: false,
  countsFruitVeg: false,
  brand: "Chobani",
  path: "branded",
  source: "branded",
  fdcIds: [2000001],
  answerSource: "package-label",
});

const caseA: EvalCase = {
  id: "chobani-plain-greek-yogurt",
  category: "branded",
  input: "Chobani plain Greek yogurt",
  expected: { items: [yogurt("plain greek yogurt")], kcal: 90, protein: 16 },
};

const caseB: EvalCase = {
  id: "yogurt-and-berries",
  category: "multi-food",
  input: "Chobani plain greek yogurt",
  expected: { items: [yogurt("plain greek yogurt")], kcal: 90, protein: 16 },
};

const caseUnconfirmed: EvalCase = {
  id: "mezeh-bowl",
  category: "mixed-dish",
  input: "Mezeh bowl",
  expected: { items: UNCONFIRMED, kcal: UNCONFIRMED, protein: UNCONFIRMED },
};

const caseDown: EvalCase = { ...caseA, id: "usda-down" };

const item = (over: Partial<PreviewItem> = {}): PreviewItem => ({
  name: "Yogurt",
  canonicalName: "plain greek yogurt",
  grams: 170,
  kcal: 90,
  protein: 16,
  fruitVegG: 0,
  kcalPer100g: 53,
  proteinPer100g: 9.4,
  estimated: false,
  portionEstimated: false,
  fdcId: 2000001,
  brand: "Chobani",
  path: "branded",
  source: "branded",
  ...over,
});

const ok = (items: PreviewItem[]): Outcome => ({
  kind: "ok",
  preview: {
    items,
    totals: {
      kcal: items.reduce((s, i) => s + i.kcal, 0),
      protein: items.reduce((s, i) => s + i.protein, 0),
      fruitVegG: 0,
    },
  },
});

const call = (over: Partial<AiCall> = {}): AiCall => ({
  function: "parseFood",
  promptVersion: "parseFood@4",
  requestedModel: "claude-sonnet-5-5",
  model: "claude-sonnet-5-5",
  effort: "medium",
  status: "success",
  costUsd: 0.01,
  durationMs: 1200,
  ...over,
});

const runs: CaseRun[] = [
  {
    case: caseA,
    repeats: [
      {
        repeat: 1,
        outcome: ok([item()]),
        calls: [
          call(),
          call({
            function: "pickFood",
            promptVersion: "pickFood@2",
            requestedModel: "claude-haiku-5-5",
            model: "claude-haiku-5-5",
            effort: "low",
            costUsd: 0.001,
          }),
        ],
      },
      {
        repeat: 2,
        outcome: ok([item({ grams: 250, kcal: 132 })]),
        calls: [call()],
      },
      {
        repeat: 3,
        outcome: {
          kind: "error",
          type: "AiValidationError",
          message: "AI output failed validation (1 issue(s))",
        },
        calls: [call({ status: "validation_error", costUsd: null })],
      },
    ],
  },
  {
    case: caseB,
    repeats: [
      {
        repeat: 1,
        outcome: ok([item({ canonicalName: "greek yogurt, plain" })]),
        calls: [call()],
      },
    ],
  },
  {
    case: caseUnconfirmed,
    repeats: [{ repeat: 1, outcome: ok([item()]), calls: [call()] }],
  },
  {
    case: caseDown,
    repeats: [
      {
        repeat: 1,
        outcome: {
          kind: "error",
          type: "UsdaError",
          message: "USDA search failed: 503",
        },
        calls: [call()],
      },
    ],
  },
];

const results: ResultsFile = buildResults(runs, {
  startedAt: "2026-11-17T21:50:03.123Z",
  finishedAt: "2026-11-17T21:52:00.000Z",
  repeats: 3,
  filters: { ids: [], categories: [] },
  config: AI_CONFIG,
  promptVersions: {
    parseFood: "parseFood@4",
    pickFood: "pickFood@2",
    estimateFood: "estimateFood@2",
  },
});

describe("buildResults", () => {
  it("writes a versioned results file with per-call function, prompt version, model, effort, cost and duration", () => {
    expect(results.version).toBe(RESULTS_VERSION);
    expect(RESULTS_VERSION).toBe(1);
    expect(results.cases.map((c) => c.id)).toEqual([
      "chobani-plain-greek-yogurt",
      "yogurt-and-berries",
      "mezeh-bowl",
      "usda-down",
    ]);
    const [first] = results.cases;
    expect(first?.repeats[0]?.calls[1]).toEqual({
      function: "pickFood",
      promptVersion: "pickFood@2",
      requestedModel: "claude-haiku-5-5",
      model: "claude-haiku-5-5",
      effort: "low",
      status: "success",
      costUsd: 0.001,
      durationMs: 1200,
    });
  });

  it("holds each repeat's check results and actual output, or its error", () => {
    const [first] = results.cases;
    expect(first?.repeats[0]).toMatchObject({
      repeat: 1,
      scored: true,
      outcome: { kind: "ok", preview: { items: [{ grams: 170 }] } },
      checks: { grams: { pass: true } },
    });
    expect(first?.repeats[1]?.checks.grams).toEqual({
      pass: false,
      failures: [
        {
          item: "plain greek yogurt",
          field: "grams",
          expected: 170,
          actual: 250,
        },
      ],
    });
    expect(first?.repeats[2]).toMatchObject({
      outcome: {
        kind: "error",
        type: "AiValidationError",
        message: "AI output failed validation (1 issue(s))",
      },
      errorClass: "ai",
    });
  });

  it("summarises pass rates, varied, unconfirmed and not-scored cases, errors, models and cost", () => {
    expect(results.summary.passRates.grams).toEqual({ passed: 1, scored: 3 });
    expect(results.summary.varied).toEqual(["chobani-plain-greek-yogurt"]);
    expect(results.summary.unconfirmed).toEqual(["mezeh-bowl"]);
    expect(results.summary.notScored).toEqual(["usda-down"]);
    expect(results.summary.errors).toEqual({
      AiValidationError: 1,
      UsdaError: 1,
    });
    expect(results.summary.models).toContainEqual({
      function: "pickFood",
      promptVersion: "pickFood@2",
      requestedModel: "claude-haiku-5-5",
      effort: "low",
      models: ["claude-haiku-5-5"],
    });
    expect(results.summary.costUsd).toBeCloseTo(0.051);
    expect(results.summary.unpricedCalls).toBe(1);
  });

  it("lists canonical names that differ between cases expected to share one", () => {
    expect(results.summary.canonicalDrift).toEqual([
      {
        canonicalName: "plain greek yogurt",
        cases: [{ id: "yogurt-and-berries", actual: ["greek yogurt, plain"] }],
      },
    ]);
  });
});

describe("formatReport", () => {
  const text = formatReport(results).join("\n");

  it("shows each check's passes out of its scored repeats per case", () => {
    expect(text).toContain("chobani-plain-greek-yogurt");
    expect(text).toMatch(/grams 1\/3/);
    expect(text).toMatch(/split 2\/3/);
  });

  it("shows expected vs actual for every failing repeat", () => {
    expect(text).toMatch(
      /repeat 2[^\n]*grams[^\n]*plain greek yogurt[^\n]*expected 170[^\n]*got 250/,
    );
    expect(text).toMatch(/repeat 3[^\n]*AiValidationError/);
  });

  it("shows the summary", () => {
    expect(text).toMatch(/grams\s+1\/3 \(33%\)/);
    expect(text).toMatch(/varied[^\n]*chobani-plain-greek-yogurt/i);
    expect(text).toMatch(/unconfirmed[^\n]*mezeh-bowl/i);
    expect(text).toMatch(/not scored[^\n]*usda-down/i);
    expect(text).toMatch(/AiValidationError[^\n]*1/);
    expect(text).toMatch(
      /plain greek yogurt[^\n]*yogurt-and-berries[^\n]*greek yogurt, plain/,
    );
    expect(text).toMatch(/pickFood@2[^\n]*claude-haiku-5-5[^\n]*low/);
    expect(text).toMatch(/\$0\.05/);
  });
});

describe("resultsPath", () => {
  it("names the file by the run's start time", () => {
    expect(resultsPath(new Date("2026-11-17T21:50:03.123Z"))).toBe(
      "evals/results/2026-11-17T21-50-03-123Z.json",
    );
  });
});

describe("buildResults with any split", () => {
  it("expects no canonical names for a case that accepts any split", () => {
    const bowl: EvalCase = {
      id: "mezeh-bowl",
      category: "mixed-dish",
      input: "Mezeh bowl",
      expected: { items: anySplit(), kcal: 90, protein: 16 },
    };
    const results = buildResults(
      [
        {
          case: bowl,
          repeats: [{ repeat: 1, outcome: ok([item()]), calls: [] }],
        },
      ],
      {
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:01.000Z",
        repeats: 1,
        filters: { ids: [], categories: [] },
        config: AI_CONFIG,
        promptVersions: {},
      },
    );
    expect(results.cases[0]?.expectedCanonicalNames).toEqual([]);
    expect(results.cases[0]?.status).toBe("scored");
  });
});
