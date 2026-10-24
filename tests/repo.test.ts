import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const json = (p: string) => JSON.parse(read(p));

describe("toolchain pins", () => {
  const pkg = json("package.json");

  it("declares Node 24 and an exact pnpm version", () => {
    expect(pkg.engines.node).toMatch(/^24(\.|$)/);
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(read(".nvmrc").trim()).toBe("24");
  });

  it("pins @anthropic-ai/sdk to an exact version", () => {
    expect(pkg.dependencies["@anthropic-ai/sdk"]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("consumes packages/core through the workspace protocol", () => {
    const web = json("apps/web/package.json");
    expect(web.dependencies["@disciplined-sidekick/core"]).toBe("workspace:*");
    expect(json("packages/core/package.json").name).toBe(
      "@disciplined-sidekick/core",
    );
  });
});

describe("vercel config", () => {
  it("runs /api on a 300 s max duration", () => {
    const vercel = json("vercel.json");
    expect(vercel.functions["api/index.ts"].maxDuration).toBe(300);
  });

  it("sends /api to the function and every other path to the SPA shell", () => {
    const { rewrites } = json("vercel.json");
    expect(rewrites[0]).toEqual({ source: "/api/(.*)", destination: "/api" });
    expect(rewrites.at(-1)).toEqual({
      source: "/(.*)",
      destination: "/index.html",
    });
  });
});

describe("lefthook", () => {
  const cfg = read("lefthook.yml");

  it("runs Biome on staged files pre-commit", () => {
    expect(cfg).toContain("pre-commit");
    expect(cfg).toContain("biome");
    expect(cfg).toContain("{staged_files}");
  });

  it("does not run tests in git hooks", () => {
    expect(cfg).not.toMatch(/vitest|pnpm test/);
  });
});

describe("CI workflow", () => {
  const ci = read(".github/workflows/ci.yml");

  it("runs on every push, not also on pull_request (that would run twice)", () => {
    expect(ci).toMatch(/push:/);
    expect(ci).not.toMatch(/pull_request:/);
  });

  it.each([
    "pnpm lint",
    "pnpm typecheck",
    "pnpm test",
    "pnpm build",
    "pnpm verify:build",
    "pnpm check:rls",
    "pnpm check:ai-runs",
    "supabase db reset",
  ])("runs %s", (step) => {
    expect(ci).toContain(step);
  });
});

describe("supabase migrations", () => {
  const dir = join(root, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const uncommented = (f: string) =>
    read(`supabase/migrations/${f}`).replace(/--[^\n]*/g, "");
  const sqlOf = (f: string) => uncommented(f).replace(/'[^']*'/g, "''");

  it("has migrations", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("grants explicitly on every public table it creates, and never to anon", () => {
    for (const f of files) {
      const sql = sqlOf(f);
      const created = [
        ...sql.matchAll(
          /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi,
        ),
      ].map((m) => m[1]);
      for (const table of created) {
        expect(sql, `${f}: grant for public.${table}`).toMatch(
          new RegExp(
            `grant\\s+[^;]*\\bon\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+authenticated`,
            "i",
          ),
        );
      }
      expect(sql, `${f}: no grant to anon`).not.toMatch(
        /grant\s[^;]*\bto\s+[^;]*\banon\b/i,
      );
    }
  });

  it("creates ai_runs with a daily pg_cron purge of the retention job", () => {
    const sql = files.map(uncommented).join("\n").toLowerCase();
    expect(sql).toMatch(/create\s+table\s+public\.ai_runs/);
    expect(sql).toContain("create extension if not exists pg_cron");
    expect(sql).toMatch(/cron\.schedule\([^)]*purge_ai_runs/);
  });
});

describe("docs", () => {
  it.each(["CLAUDE.md", "AGENTS.md", "ARCHITECTURE.md"])("has %s", (f) => {
    expect(existsSync(join(root, f))).toBe(true);
  });

  it("ARCHITECTURE.md covers layout, request path and secrets", () => {
    const arch = read("ARCHITECTURE.md");
    expect(arch).toContain("packages/core");
    expect(arch).toMatch(/client\s*→\s*Hono\s*→\s*Supabase/);
    expect(arch).toMatch(/secrets/i);
  });

  it("has ADRs for the Supabase and Vercel choices", () => {
    const adrs = readdirSync(join(root, "docs/adr")).join(" ").toLowerCase();
    expect(adrs).toContain("supabase");
    expect(adrs).toContain("vercel");
  });
});
