# Disciplined Sidekick — agent guide

Disciplined Sidekick is a single-user PWA for food and health tracking. Scope for every change comes from its Linear issue (team **Health Agent**, key `HEA-n`); read the issue and all its comments first.

## Commands

| Task          | Command                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Install       | `pnpm install` (Node 24, pnpm version pinned in `package.json`)                                                                   |
| Dev server    | `pnpm dev`                                                                                                                        |
| Build         | `pnpm build`                                                                                                                      |
| Tests         | `pnpm test` (Vitest, all workspaces)                                                                                              |
| Lint / format | `pnpm lint` (Biome; `pnpm exec biome check --write .` to fix)                                                                     |
| Typecheck     | `pnpm typecheck`                                                                                                                  |
| Build checks  | `pnpm verify:build` (PWA files, six precached fonts and no Google Fonts requests present, no server secrets in the client bundle) |
| RLS check     | `pnpm check:rls` (needs `supabase db start && supabase db reset`)                                                                 |
| AI runs check | `pnpm check:ai-runs` (needs `supabase db start && supabase db reset`)                                                             |
| Targets check | `pnpm check:targets` (needs `supabase db start && supabase db reset`)                                                             |
| Food check    | `pnpm check:food` (needs `supabase db start && supabase db reset`)                                                                |
| Client errors | `pnpm check:client-errors` (needs `supabase db start && supabase db reset`)                                                       |
| Food eval     | `pnpm eval` (paid Anthropic and USDA calls; keys in a root `.env`; run by hand, never in tests or CI)                             |

## Working agreements

- **TDD.** Agree an AC → test map, write the failing tests first and commit them, then implement.
- **Branches.** Use the issue's Linear branch name (`<linear-user>/hea-n-slug`). Branch from `main`; push with `git push -u origin HEAD`.
- **Dependencies** are pinned exactly (`save-exact=true`). `@anthropic-ai/sdk` in particular must never use a `^`/`~` range.
- **Secrets** live only in server env vars (see `.env.example`). The client gets the Supabase URL and anon key, nothing else. CI fails the build if a secret reaches `apps/web/dist`.
- **Database.** Schema changes are migrations in `supabase/migrations/`; how they are tested and applied to the hosted project is in `ARCHITECTURE.md` → _Migrations_. Every `public` table has RLS enabled (new tables get it automatically) and per-user policies. Only the owner applies migrations to the hosted project: an agent may add a migration file and reset the local database, but never runs `supabase db push`.
- **Grants.** The Supabase project has "automatically expose new tables" turned off, so a new table is not reachable through the Data API until its migration grants access explicitly, e.g. `grant select, insert, update, delete on public.<table> to authenticated;`. Grant only what the table needs, and never to `anon` unless the table is meant to be public. A table the server reads or writes with the service-role key also needs an explicit grant to `service_role` (hosted Supabase does not add it, local does, so a missing grant only fails after deploy); revoke first so local matches hosted.
- **Hooks.** lefthook runs Biome on staged files. Tests run in CI, not in git hooks. A ruleset on `main` requires a PR and passing `checks` and `database` CI jobs to merge, and blocks force pushes and deletion; nobody can bypass it.
- Update `ARCHITECTURE.md` when structure changes, and README's _Where the AI is_ when an AI function, model or guard changes (`tests/readme.test.ts` checks part of it). Write an ADR in `docs/adr/` only for hard-to-reverse platform choices.

## Verification

Before opening a PR, run every command whose row matches the changed paths. CI runs all of them. If a command fails, fix the cause and run it again, at most three rounds per command; after that, stop and report what still fails.

| Changed paths                                                                  | Commands                                                                                                                                                              |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any code change                                                                | `pnpm lint`, `pnpm typecheck`, `pnpm test`                                                                                                                            |
| `apps/web/`, build config (`vite.config.ts`, `tsconfig*.json`) or dependencies | also `pnpm build`, `pnpm verify:build`                                                                                                                                |
| `supabase/`, `scripts/check-*.sh`, `scripts/lib/`                              | also `supabase db start && supabase db reset` first, then `pnpm check:rls`, `pnpm check:ai-runs`, `pnpm check:targets`, `pnpm check:food`, `pnpm check:client-errors` |
| Docs only (`*.md`, `docs/`)                                                    | `pnpm lint`, `pnpm typecheck`, `pnpm test` only; no build, no migration checks                                                                                        |
