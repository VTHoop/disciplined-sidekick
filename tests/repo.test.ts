import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tablesMissingAuthenticatedGrant } from "./migration-grants";

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

  // The Vercel function compiles api/ and the files it reaches by relative
  // path, one file at a time, and runs them as Node ESM. TypeScript behind a
  // node_modules link may not be compiled, and an import without an extension
  // does not resolve, so core is reached the way server/ already is.
  const tsFiles = (dir: string) =>
    readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => join(dir, f));

  it("has server code reach packages/core by relative path, not the package name", () => {
    for (const f of [...tsFiles("server"), ...tsFiles("api")]) {
      expect(read(f), f).not.toMatch(/from\s+["']@disciplined-sidekick\/core/);
    }
  });

  it("gives every relative import in packages/core a .js extension", () => {
    for (const f of tsFiles("packages/core/src")) {
      for (const m of read(f).matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
        expect(m[1], f).toMatch(/\.js$/);
      }
    }
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
    "pnpm check:targets",
    "pnpm check:food",
    "pnpm check:client-errors",
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

  // Opting a table out (`-- authenticated: none public.<table>`) is parsed
  // and tested in migration-grants.ts.
  it("grants explicitly on every public table it creates, and never to anon", () => {
    for (const f of files) {
      const sql = sqlOf(f);
      expect(
        tablesMissingAuthenticatedGrant(read(`supabase/migrations/${f}`)),
        `${f}: tables with no grant to authenticated`,
      ).toEqual([]);
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

describe("software-factory plugin", () => {
  it("declares the marketplace at the release tag and enables the plugin", () => {
    const settings = json(".claude/settings.json");
    expect(settings.extraKnownMarketplaces["software-factory"].source).toEqual({
      source: "github",
      repo: "VTHoop/software-factory",
      ref: "v0.2.0",
    });
    expect(settings.enabledPlugins["software-factory@software-factory"]).toBe(
      true,
    );
  });

  it.each(["start-ticket", "address-review"])(
    "no longer keeps %s as a project skill",
    (name) => {
      expect(existsSync(join(root, ".claude/skills", name))).toBe(false);
    },
  );

  it("ARCHITECTURE.md no longer refers to the removed skills", () => {
    expect(read("ARCHITECTURE.md")).not.toMatch(
      /\.claude\/skills|start-ticket|address-review/,
    );
  });
});

describe("AGENTS.md for the plugin's skills", () => {
  const agents = read("AGENTS.md");
  const verification = agents.slice(agents.indexOf("## Verification"));

  it.each([
    "pnpm lint",
    "pnpm typecheck",
    "pnpm test",
    "pnpm build",
    "pnpm verify:build",
    "supabase db reset",
    "pnpm check:rls",
    "pnpm check:ai-runs",
    "pnpm check:targets",
    "pnpm check:food",
    "pnpm check:client-errors",
  ])("lists %s under Verification", (command) => {
    expect(agents).toContain("## Verification");
    expect(verification).toContain(command);
  });

  it("says which checks run for which paths", () => {
    expect(verification).toContain("supabase/");
    expect(verification).toMatch(/changed paths/i);
  });

  it("says only the owner applies migrations", () => {
    expect(agents).toMatch(/only the owner applies migrations/i);
    expect(agents).toContain("supabase db push");
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
