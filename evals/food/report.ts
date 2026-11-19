import type { AiFunctionConfig } from "../../server/ai/config.js";
import {
  type CaseStatus,
  CHECKS,
  type CheckCount,
  type CheckName,
  type Checks,
  classifyError,
  type ErrorClass,
  type Failure,
  gradeCase,
  type Outcome,
  passRates,
} from "./grade.js";
import type { AiCall, CaseRun } from "./run.js";
import { type Category, isAnySplit, isUnconfirmed } from "./types.js";

/** Bump when the results file's shape changes, so runs are only compared like for like. */
export const RESULTS_VERSION = 1;

export interface RepeatResult {
  repeat: number;
  /** False for an unconfirmed case, or a repeat an infrastructure error left out. */
  scored: boolean;
  errorClass?: ErrorClass;
  /** The actual items and totals, or the error's type and message. */
  outcome: Outcome;
  checks: Checks;
  unmatched: string[];
  extras: string[];
  calls: AiCall[];
}

export interface CaseResult {
  id: string;
  category: Category;
  input: string;
  status: CaseStatus;
  counts: Partial<Record<CheckName, CheckCount>>;
  varied: boolean;
  /** Confirmed expected canonical names, for spotting names that drift between cases. */
  expectedCanonicalNames: string[];
  repeats: RepeatResult[];
}

export interface ModelUse {
  function: string;
  promptVersion: string;
  requestedModel: string;
  effort: string;
  /** The models that answered. */
  models: string[];
}

export interface CanonicalDrift {
  canonicalName: string;
  /** The cases that missed it, and the names they produced instead. */
  cases: { id: string; actual: string[] }[];
}

export interface Summary {
  passRates: Partial<Record<CheckName, CheckCount>>;
  varied: string[];
  unconfirmed: string[];
  notScored: string[];
  errors: Record<string, number>;
  canonicalDrift: CanonicalDrift[];
  models: ModelUse[];
  costUsd: number;
  /** Calls with no cost: no answer came back, or the model had no price. */
  unpricedCalls: number;
}

export interface ResultsFile {
  version: typeof RESULTS_VERSION;
  startedAt: string;
  finishedAt: string;
  repeats: number;
  filters: { ids: string[]; categories: string[] };
  config: Readonly<Record<string, Readonly<AiFunctionConfig>>>;
  promptVersions: Record<string, string>;
  cases: CaseResult[];
  summary: Summary;
}

export type ResultsMeta = Omit<ResultsFile, "version" | "cases" | "summary">;

function expectedNames(run: CaseRun): string[] {
  const { items } = run.case.expected;
  if (isUnconfirmed(items) || isAnySplit(items)) return [];
  return items.flatMap((i) =>
    isUnconfirmed(i.canonicalName) ? [] : [i.canonicalName],
  );
}

function canonicalDrift(cases: CaseResult[]): CanonicalDrift[] {
  const scored = cases.filter((c) => c.status === "scored");
  const names = new Map<string, CaseResult[]>();
  for (const c of scored) {
    for (const name of new Set(c.expectedCanonicalNames)) {
      names.set(name, [...(names.get(name) ?? []), c]);
    }
  }
  const drift: CanonicalDrift[] = [];
  for (const [canonicalName, shared] of names) {
    if (shared.length < 2) continue;
    const missed = shared.flatMap((c) => {
      const repeats = c.repeats.filter((r) =>
        r.unmatched.includes(canonicalName),
      );
      if (repeats.length === 0) return [];
      const actual = [...new Set(repeats.flatMap((r) => r.extras))].sort();
      return [{ id: c.id, actual }];
    });
    if (missed.length > 0) drift.push({ canonicalName, cases: missed });
  }
  return drift;
}

function modelUse(calls: AiCall[]): ModelUse[] {
  const uses = new Map<string, ModelUse>();
  for (const c of calls) {
    const key = [c.function, c.promptVersion, c.requestedModel, c.effort].join(
      "|",
    );
    const use = uses.get(key) ?? {
      function: c.function,
      promptVersion: c.promptVersion,
      requestedModel: c.requestedModel,
      effort: c.effort,
      models: [],
    };
    if (c.model !== null && !use.models.includes(c.model)) {
      use.models.push(c.model);
    }
    uses.set(key, use);
  }
  return [...uses.values()];
}

/** Grades every case and gathers the run into the results file's shape. */
export function buildResults(runs: CaseRun[], meta: ResultsMeta): ResultsFile {
  const grades = runs.map((r) =>
    gradeCase(
      r.case,
      r.repeats.map((x) => x.outcome),
    ),
  );
  const cases: CaseResult[] = runs.map((r, i) => {
    const g = grades[i] as (typeof grades)[number];
    return {
      id: r.case.id,
      category: r.case.category,
      input: r.case.input,
      status: g.status,
      counts: g.counts,
      varied: g.varied,
      expectedCanonicalNames: expectedNames(r),
      repeats: r.repeats.map((x, j) => {
        const rg = g.repeats[j];
        return {
          repeat: x.repeat,
          scored: rg?.scored ?? false,
          ...(x.outcome.kind === "error"
            ? { errorClass: classifyError(x.outcome.type) }
            : {}),
          outcome: x.outcome,
          checks: rg?.checks ?? {},
          unmatched: rg?.unmatched ?? [],
          extras: rg?.extras ?? [],
          calls: x.calls,
        };
      }),
    };
  });
  const calls = runs.flatMap((r) => r.repeats.flatMap((x) => x.calls));
  const errors: Record<string, number> = {};
  for (const r of runs) {
    for (const { outcome } of r.repeats) {
      if (outcome.kind === "error") {
        errors[outcome.type] = (errors[outcome.type] ?? 0) + 1;
      }
    }
  }
  const ids = (status: CaseStatus) =>
    cases.filter((c) => c.status === status).map((c) => c.id);
  return {
    version: RESULTS_VERSION,
    ...meta,
    cases,
    summary: {
      passRates: passRates(grades),
      varied: cases.filter((c) => c.varied).map((c) => c.id),
      unconfirmed: ids("unconfirmed"),
      notScored: ids("not-scored"),
      errors,
      canonicalDrift: canonicalDrift(cases),
      models: modelUse(calls),
      costUsd: calls.reduce((sum, c) => sum + (c.costUsd ?? 0), 0),
      unpricedCalls: calls.filter((c) => c.costUsd === null).length,
    },
  };
}

const show = (value: unknown): string => {
  if (value === null || value === undefined) return "none";
  if (typeof value === "number") return String(Number(value.toFixed(1)));
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    "min" in value &&
    "max" in value &&
    !Array.isArray(value)
  ) {
    return `${show(value.min)}–${show(value.max)}`;
  }
  return JSON.stringify(value);
};

const showFailure = (f: Failure) =>
  `${f.item ? `${f.item} · ` : ""}${f.field}: expected ${show(f.expected)}, got ${show(f.actual)}`;

const rate = ({ passed, scored }: CheckCount) =>
  `${passed}/${scored} (${Math.round((passed / scored) * 100)}%)`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function caseLines(c: CaseResult): string[] {
  const head = `${c.id} (${c.category})`;
  if (c.status === "unconfirmed") {
    return [
      `${head}: unconfirmed, not scored (${plural(c.repeats.length, "repeat")} ran)`,
    ];
  }
  const lines =
    c.status === "not-scored"
      ? [`${head}: not scored (every repeat hit an infrastructure error)`]
      : [
          head,
          `  ${CHECKS.flatMap((k) => {
            const n = c.counts[k];
            return n ? [`${k} ${n.passed}/${n.scored}`] : [];
          }).join(" · ")}`,
        ];
  for (const r of c.repeats) {
    if (r.outcome.kind === "error") {
      lines.push(
        `  ✗ repeat ${r.repeat} ${r.outcome.type}: ${r.outcome.message}`,
      );
      continue;
    }
    for (const k of CHECKS) {
      const res = r.checks[k];
      if (!res || res.pass) continue;
      for (const f of res.failures) {
        lines.push(`  ✗ repeat ${r.repeat} ${k} · ${showFailure(f)}`);
      }
    }
  }
  return lines;
}

/** The console report: per case, then the summary. */
export function formatReport(results: ResultsFile): string[] {
  const s = results.summary;
  const list = (ids: string[]) => (ids.length ? ids.join(", ") : "none");
  const width = Math.max(...CHECKS.map((k) => k.length));
  return [
    "",
    ...results.cases.flatMap(caseLines),
    "",
    "Summary",
    "Pass rate per check:",
    ...CHECKS.flatMap((k) => {
      const n = s.passRates[k];
      return n ? [`  ${k.padEnd(width)} ${rate(n)}`] : [];
    }),
    `Varied between repeats: ${list(s.varied)}`,
    `Unconfirmed (ran, not scored): ${list(s.unconfirmed)}`,
    `Not scored: ${list(s.notScored)}`,
    `Errors: ${
      Object.entries(s.errors)
        .map(([type, n]) => `${type} ${n}`)
        .join(", ") || "none"
    }`,
    "Canonical names that differ between cases expected to share one:",
    ...(s.canonicalDrift.length
      ? s.canonicalDrift.flatMap((d) =>
          d.cases.map(
            (c) =>
              `  "${d.canonicalName}": ${c.id} → ${
                c.actual.map((a) => `"${a}"`).join(", ") || "no item"
              }`,
          ),
        )
      : ["  none"]),
    "Prompt versions and models:",
    ...s.models.map(
      (m) =>
        `  ${m.promptVersion} ${m.requestedModel} (${m.effort} effort) → ${
          m.models.join(", ") || "no answer"
        }`,
    ),
    `Total cost: $${s.costUsd.toFixed(4)}${
      s.unpricedCalls
        ? ` (${plural(s.unpricedCalls, "call")} without a cost)`
        : ""
    }`,
  ];
}

/** `evals/results/<start time>.json`, with the time made safe for a file name. */
export const resultsPath = (startedAt: Date) =>
  `evals/results/${startedAt.toISOString().replace(/[:.]/g, "-")}.json`;
