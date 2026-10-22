# Disciplined Sidekick architecture

Current state of the system. Decisions that are hard to reverse are recorded in [`docs/adr/`](docs/adr).

## Workspace layout

```
apps/web/        Vite 8 + React PWA (vite-plugin-pwa, generateSW)
packages/core/   Shared TypeScript logic, consumed from source via the workspace protocol
api/index.ts     Vercel function entry: wires the Hono app to the Vercel runtime
server/          Hono app (routes, Supabase JWT verification); framework-agnostic and unit-tested
supabase/        Local config and SQL migrations
scripts/         CI checks (build verification, RLS check)
```

`apps/web` imports `@disciplined-sidekick/core` as `workspace:*`; there are no relative paths across packages.

## Request path

client → Hono → Supabase
1. The browser signs in with Supabase Auth and holds an access token.
2. It calls `/api/*` with `Authorization: Bearer <token>`.
3. The Hono app on a Vercel Node 24 function (300 s max) verifies the token against the project's JWKS (issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`) and exposes the user id to handlers.
4. Handlers talk to Supabase (Postgres, Storage). Row level security keeps data per user.

Routes today: `GET /api/health` (status and deployed commit SHA, no dependency checks) and `GET /api/me` (authenticated user id).

## Environments

Preview and production deploys share one Supabase project, so preview branches run against production data and schema. Treat migrations accordingly.

## Secrets

Server-only, set as Vercel env vars: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `API_DATA_GOV_KEY`, `SUPABASE_URL`. The client bundle holds only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `pnpm verify:build` runs in CI and fails if any server secret appears in `apps/web/dist`.

## Quality gates

Biome (pre-commit via lefthook, and CI), TypeScript, Vitest, build, build verification, and a database job that applies all migrations to an empty Postgres and checks RLS. CI reports on PRs but does not block merging.
