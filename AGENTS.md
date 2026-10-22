# Health Agent — agent guide

Single-user PWA for food and health tracking. Scope for every change comes from its Linear issue (team **Health Agent**, key `HEA-n`); read the issue and all its comments first.

## Commands

| Task          | Command                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| Install       | `pnpm install` (Node 24, pnpm version pinned in `package.json`)                 |
| Dev server    | `pnpm dev`                                                                      |
| Build         | `pnpm build`                                                                    |
| Tests         | `pnpm test` (Vitest, all workspaces)                                            |
| Lint / format | `pnpm lint` (Biome; `pnpm exec biome check --write .` to fix)                   |
| Typecheck     | `pnpm typecheck`                                                                |
| Build checks  | `pnpm verify:build` (PWA files present, no server secrets in the client bundle) |
| RLS check     | `pnpm check:rls` (needs `supabase db start && supabase db reset`)               |

## Working agreements

- **TDD.** Agree an AC → test map, write the failing tests first and commit them, then implement.
- **Branches.** Use the Linear branch name (`pathooper83/hea-n-slug`). Branch from `main`; push with `git push -u origin HEAD`.
- **Dependencies** are pinned exactly (`save-exact=true`). `@anthropic-ai/sdk` in particular must never use a `^`/`~` range.
- **Secrets** live only in server env vars (see `.env.example`). The client gets the Supabase URL and anon key, nothing else. CI fails the build if a secret reaches `apps/web/dist`.
- **Database.** Schema changes are migrations in `supabase/migrations/`. Every `public` table has RLS enabled (new tables get it automatically) and per-user policies.
- **Hooks.** lefthook runs Biome on staged files. Tests run in CI, not in git hooks. CI reports status but does not block merges (GitHub Free, private repo).
- Update `ARCHITECTURE.md` when structure changes. Write an ADR in `docs/adr/` only for hard-to-reverse platform choices.
