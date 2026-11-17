import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_CONFIG } from "../server/ai/config";
import { MAX_RETRIES } from "../server/ai/run";
import { REQUEST_TIMEOUT_MS } from "../server/ai/timeouts";

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** The body of one `## heading` section of a Markdown file. */
function section(md: string, heading: string): string {
  const start = md.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`No "## ${heading}" section`);
  const rest = md.slice(start + heading.length + 5);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

// The README restates the AI pipeline for readers who skim; these keep it in
// step with the code it describes.
describe("README: Where the AI is", () => {
  const ai = section(read("README.md"), "Where the AI is");
  const rows = ai.split("\n").filter((l) => l.startsWith("|"));

  it.each(Object.entries(AI_CONFIG).filter(([name]) => name !== "demo"))(
    "names %s with its configured model and effort",
    (name, cfg) => {
      const row = rows.find((r) => r.includes(`\`${name}\``));
      expect(row, `no table row for ${name}`).toBeDefined();
      expect(row).toContain(`\`${cfg.model}\``);
      expect(row).toContain(`${cfg.effort} effort`);
    },
  );

  it("mentions every AI function", () => {
    for (const name of Object.keys(AI_CONFIG)) expect(ai).toContain(name);
  });

  it("states the runner's retry count and per-attempt timeout", () => {
    expect(ai).toContain(`Up to ${MAX_RETRIES} retries`);
    expect(ai).toContain(`${REQUEST_TIMEOUT_MS / 1000} s`);
  });

  it("states the ai_runs retention from its migration", () => {
    const days = read("supabase/migrations/20261023000000_ai_runs.sql").match(
      /interval '(\d+) days'/,
    )?.[1];
    expect(days).toBeDefined();
    expect(ai).toContain(`after ${days} days`);
  });
});
