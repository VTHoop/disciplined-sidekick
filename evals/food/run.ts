import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createAnthropicClient } from "../../server/ai/client.js";
import { AI_CONFIG, type AiFunctionConfig } from "../../server/ai/config.js";
import { MODEL_PRICES, type ModelPrice } from "../../server/ai/pricing.js";
import type { AiClient, RunDeps } from "../../server/ai/run.js";
import type { AiRunRow, AiRunStore } from "../../server/ai/store.js";
import { fetchWithTimeout, USDA_TIMEOUT_MS } from "../../server/ai/timeouts.js";
import type { CachedFood, FoodCache } from "../../server/food/cache.js";
import { logFood } from "../../server/food/log-food.js";
import { createFoodAi, FOOD_AI_FUNCTIONS } from "../../server/food/service.js";
import { createUsdaClient, type UsdaClient } from "../../server/food/usda.js";
import { parseEvalArgs } from "./args.js";
import { CASES } from "./cases.js";
import { classifyError, type Outcome } from "./grade.js";
import { buildResults, formatReport, resultsPath } from "./report.js";
import type { EvalCase } from "./types.js";

/** What a run calls: the passed-in config is how a model is overridden. */
export interface EvalDeps {
  client: AiClient;
  usda: UsdaClient;
  config: Readonly<Record<string, Readonly<AiFunctionConfig>>>;
  prices: Readonly<Record<string, ModelPrice>>;
}

/** One AI call a repeat made, from its in-memory ai_runs row. */
export interface AiCall {
  function: string;
  promptVersion: string;
  requestedModel: string;
  /** The model that answered; null when none did. */
  model: string | null;
  effort: string;
  status: string;
  costUsd: number | null;
  durationMs: number;
}

export interface RepeatRun {
  /** 1-based. */
  repeat: number;
  outcome: Outcome;
  calls: AiCall[];
}

export interface CaseRun {
  case: EvalCase;
  repeats: RepeatRun[];
}

/** How many case repeats run at once. */
const CONCURRENCY = 4;

function memoryCache(): FoodCache {
  const rows = new Map<string, CachedFood>();
  return {
    async get(key) {
      return rows.get(key) ?? null;
    },
    async put(key, food) {
      if (!rows.has(key)) rows.set(key, food);
    },
  };
}

function memoryStore() {
  const rows: AiRunRow[] = [];
  const store: AiRunStore = {
    async insert(row) {
      rows.push(row);
    },
  };
  return { store, rows };
}

const toCall = (row: AiRunRow): AiCall => ({
  function: row.function_name,
  promptVersion: row.prompt_version,
  requestedModel: row.requested_model,
  model: row.model,
  effort: row.effort,
  status: row.status,
  costUsd: row.cost_usd,
  durationMs: Date.parse(row.finished_at) - Date.parse(row.started_at),
});

/** The error's class name, as the results file records it and classifyError reads it. */
export const errorType = (error: unknown) =>
  error instanceof Error ? error.constructor.name : "unknown";

/**
 * One repeat of one case through the real logFood. A fresh cache per repeat
 * means every repeat parses, searches, picks and estimates, and an in-memory
 * store means nothing reaches the hosted ai_runs or food_cache.
 */
async function runRepeat(
  c: EvalCase,
  repeat: number,
  deps: EvalDeps,
): Promise<RepeatRun> {
  const { store, rows } = memoryStore();
  const run: RunDeps = {
    client: deps.client,
    store,
    config: deps.config,
    prices: deps.prices,
    // The runner's own console logging would interleave with the report.
    logger: { error: () => {} },
  };
  const entryId = `${c.id}#${repeat}`;
  // The same binding the app's food service uses, so the eval tests what ships.
  const ai = createFoodAi(run, { userId: null, entryId });
  let outcome: Outcome;
  try {
    const preview = await logFood(
      { ai, usda: deps.usda, cache: memoryCache(), logger: run.logger },
      { entryId, text: c.input },
    );
    outcome = {
      kind: "ok",
      preview: { items: preview.items, totals: preview.totals },
    };
  } catch (error) {
    outcome = {
      kind: "error",
      type: errorType(error),
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return { repeat, outcome, calls: rows.map(toCall) };
}

/** Runs every case `repeats` times, a few repeats at a time, in case order. */
export async function runCases(
  cases: readonly EvalCase[],
  { repeats, onRepeat }: { repeats: number; onRepeat?: (line: string) => void },
  deps: EvalDeps,
): Promise<CaseRun[]> {
  const runs: CaseRun[] = cases.map((c) => ({ case: c, repeats: [] }));
  const jobs = runs.flatMap((r) =>
    Array.from({ length: repeats }, (_, i) => ({ run: r, repeat: i + 1 })),
  );
  let next = 0;
  const worker = async () => {
    for (let job = jobs[next++]; job; job = jobs[next++]) {
      const result = await runRepeat(job.run.case, job.repeat, deps);
      job.run.repeats.push(result);
      onRepeat?.(
        `  ${job.run.case.id} #${job.repeat}: ${
          result.outcome.kind === "ok" ? "ok" : result.outcome.type
        }`,
      );
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker),
  );
  for (const r of runs) r.repeats.sort((a, b) => a.repeat - b.repeat);
  return runs;
}

export type Selection =
  | { ok: true; cases: readonly EvalCase[] }
  | { ok: false; unknown: string[] };

/** The cases named by id or category (all of them with no filter); names any that don't exist. */
export function selectCases(
  cases: readonly EvalCase[],
  { ids, categories }: { ids: string[]; categories: string[] },
): Selection {
  const unknown = [
    ...ids.filter((id) => !cases.some((c) => c.id === id)),
    ...categories.filter((cat) => !cases.some((c) => c.category === cat)),
  ];
  if (unknown.length > 0) return { ok: false, unknown };
  if (ids.length === 0 && categories.length === 0) return { ok: true, cases };
  return {
    ok: true,
    cases: cases.filter(
      (c) => ids.includes(c.id) || categories.includes(c.category),
    ),
  };
}

export const REQUIRED_ENV = ["ANTHROPIC_API_KEY", "API_DATA_GOV_KEY"] as const;

/** The real Anthropic and USDA clients with the app's config and prices. No Supabase. */
export function realEvalDeps(keys: {
  anthropicApiKey: string;
  usdaApiKey: string;
}): EvalDeps {
  return {
    client: createAnthropicClient(keys.anthropicApiKey),
    usda: createUsdaClient({
      apiKey: keys.usdaApiKey,
      fetch: fetchWithTimeout(USDA_TIMEOUT_MS),
    }),
    config: AI_CONFIG,
    prices: MODEL_PRICES,
  };
}

export interface MainIo {
  argv: string[];
  env: Readonly<Record<string, string | undefined>>;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  cases?: readonly EvalCase[];
  createDeps?: typeof realEvalDeps;
  writeResults?: (path: string, contents: string) => Promise<void>;
  now?: () => Date;
}

/**
 * `pnpm eval`. Returns the exit code: 0 whenever the run finishes, however
 * many checks fail; 1 on a bad flag or filter, a missing key, or a run in
 * which every repeat hit an infrastructure error.
 */
export async function main(io: MainIo): Promise<number> {
  const args = parseEvalArgs(io.argv);
  if (!args.ok) {
    io.stderr(args.message);
    return 1;
  }
  const selection = selectCases(io.cases ?? CASES, args);
  if (!selection.ok) {
    io.stderr(`No case or category named: ${selection.unknown.join(", ")}`);
    return 1;
  }
  const missing = REQUIRED_ENV.filter((name) => !io.env[name]);
  if (missing.length > 0) {
    io.stderr(`Missing env: ${missing.join(", ")} (see .env.example)`);
    return 1;
  }
  const deps = (io.createDeps ?? realEvalDeps)({
    anthropicApiKey: io.env.ANTHROPIC_API_KEY as string,
    usdaApiKey: io.env.API_DATA_GOV_KEY as string,
  });
  const now = io.now ?? (() => new Date());
  const started = now();
  io.stdout(
    `Running ${selection.cases.length} case(s) × ${args.repeats} repeat(s)…`,
  );
  const runs = await runCases(
    selection.cases,
    { repeats: args.repeats, onRepeat: io.stdout },
    deps,
  );
  const results = buildResults(runs, {
    startedAt: started.toISOString(),
    finishedAt: now().toISOString(),
    repeats: args.repeats,
    filters: { ids: args.ids, categories: args.categories },
    config: deps.config,
    promptVersions: Object.fromEntries(
      FOOD_AI_FUNCTIONS.map((f) => [f.name, f.promptVersion]),
    ),
  });
  for (const line of formatReport(results)) io.stdout(line);
  const path = resultsPath(started);
  await (io.writeResults ?? writeFileCreatingDir)(
    path,
    `${JSON.stringify(results, null, 2)}\n`,
  );
  io.stdout(`Results: ${path}`);

  const outcomes = runs.flatMap((r) => r.repeats.map((x) => x.outcome));
  const allInfrastructure =
    outcomes.length > 0 &&
    outcomes.every(
      (o) => o.kind === "error" && classifyError(o.type) === "infrastructure",
    );
  if (allInfrastructure) {
    io.stderr("Every repeat hit an infrastructure error; nothing was scored.");
    return 1;
  }
  return 0;
}

/** Writes the results file, creating its folder the first time. */
export async function writeFileCreatingDir(path: string, contents: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}
