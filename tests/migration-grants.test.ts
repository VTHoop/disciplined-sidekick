import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tablesMissingServiceRoleGrant } from "./migration-grants";

describe("tablesMissingServiceRoleGrant", () => {
  it("flags a table with no service_role grant", () => {
    const sql = `create table public.notes (id int);
      grant select on public.notes to authenticated;`;
    expect(tablesMissingServiceRoleGrant([sql])).toEqual(["notes"]);
  });

  it("accepts a grant made in a later migration", () => {
    const create = "create table public.notes (id int);";
    const grant = "grant select, insert on public.notes to service_role;";
    expect(tablesMissingServiceRoleGrant([create, grant])).toEqual([]);
  });

  it("does not count a grant that only appears in a comment or string", () => {
    const sql = `create table public.notes (id int);
      -- grant select on public.notes to service_role;
      select 'grant select on public.notes to service_role';`;
    expect(tablesMissingServiceRoleGrant([sql])).toEqual(["notes"]);
  });

  it("accepts a table that opts out with a documented comment", () => {
    const sql = `-- service_role: none public.notes (read by users only)
      create table public.notes (id int);`;
    expect(tablesMissingServiceRoleGrant([sql])).toEqual([]);
  });
});

describe("repo migrations", () => {
  it("grant service_role on every table they create, or opt out", () => {
    const dir = join(import.meta.dirname, "../supabase/migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(join(dir, f), "utf8"));
    expect(tablesMissingServiceRoleGrant(sql)).toEqual([]);
  });
});
