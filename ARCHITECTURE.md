# Disciplined Sidekick architecture

Current state of the system. Decisions that are hard to reverse are recorded in [`docs/adr/`](docs/adr).

## Workspace layout

```
apps/web/        Vite 8 + React PWA (vite-plugin-pwa, generateSW); auth and routing in src/auth/
packages/core/   Shared TypeScript logic, consumed from source via the workspace protocol
api/index.ts     Vercel function entry: wires the Hono app to the Vercel runtime
server/          Hono app (routes, Supabase JWT verification); framework-agnostic and unit-tested
server/ai/       Typed AI call layer: runner, per-function config, prices, ai_runs store, functions/
supabase/        Local config, SQL migrations and the OTP email template
scripts/         CI checks (build verification, RLS check)
tests/           Repo-level tests for config, CI and docs conventions
.claude/skills/  Project skills (start-ticket, address-review)
```

`apps/web` imports `@disciplined-sidekick/core` as `workspace:*`; there are no relative paths across packages.

## Request path

client → Hono → Supabase
1. The browser signs in with Supabase Auth and holds an access token.
2. It calls `/api/*` with `Authorization: Bearer <token>`.
3. The Hono app on a Vercel Node 24 function (300 s max) verifies the token against the project's JWKS (issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`) and exposes the user id to handlers. Bad credentials get a 401; a failure to fetch the keys gets a 503, so an outage never looks like a bad login.
4. Handlers talk to Supabase (Postgres, Storage). Row level security keeps data per user.

Routes today: `GET /api/health` (status and deployed commit SHA, no dependency checks), `GET /api/me` (authenticated user id) and `POST /api/ai/demo` (authenticated; the demo AI function, 503 if the AI env is missing).

## AI calls

Every AI function is an `AiFunction` in `server/ai/functions/` (name, prompt and schema versions, a zod output schema, and a prompt builder that sees only the input, never the user) and runs through `runAiFunction` (`server/ai/run.ts`). It calls `client.messages.parse` with a `zodOutputFormat` whose parser reports bad output as data, so a failed validation is still priced and logged. Retries (two, on 408/409/429/5xx and connection errors) are done by the runner with the SDK's own retrying off, so attempts are counted. Failures surface as `AiApiError`, `AiValidationError`, `AiRefusalError` or `AiTruncatedError`.

Model, effort and max tokens come from the function's one entry in `server/ai/config.ts`; prices are in `server/ai/pricing.ts` and cost is computed from the model that answered. Functions take a plain user id (or none), so an HTTP route and a cron job call them the same way.

Each invocation writes exactly one `public.ai_runs` row (status, attempts, tokens, cost, stop reason and details, input, output, validation errors, prompt and schema versions) with the service-role key. If that write fails the caller still gets the result and the failure is logged with the run's details. Signed-in users can only `select` their own rows; a daily `pg_cron` job (`purge_ai_runs`) deletes rows older than 90 days. `pnpm check:ai-runs` proves both against the local database. The `pg_cron` extension must be enabled in the hosted project before this migration is applied.

## Sign-in

One pre-created user signs in with a 6-digit email code (Supabase Auth, signups disabled). The web app calls `signInWithOtp` with `shouldCreateUser: false`, then `verifyOtp`; an unknown email gets the same code screen as a real one (the signups-disabled error is swallowed), so account existence is not revealed. The session lives in `localStorage`, refreshes until sign-out, and has no idle timeout. `src/auth/` holds the Supabase client, `AuthProvider` (session state), route guards (react-router: signed out → `/sign-in`, signed in → `/`), the sign-in and Today screens, and `apiFetch`, which adds the bearer token to `/api/*` calls. `vercel.json` rewrites non-API paths to `index.html` so deep links work.

Hosted-only settings (not applied by `config.toml`): signups off, Resend SMTP, and the OTP email template (`supabase/templates/magic_link.html`, which shows the code and no link) are set in the Supabase dashboard.

## Environments

Preview and production deploys share one Supabase project, so preview branches run against production data and schema. Treat migrations accordingly.

## Secrets

Server-only, set as Vercel env vars: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `API_DATA_GOV_KEY`, `SUPABASE_URL`. The client bundle holds only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `pnpm verify:build` runs in CI and fails if any server secret appears in `apps/web/dist`.

## Quality gates

Biome (pre-commit via lefthook, and CI), TypeScript, Vitest, build, build verification, and a database job that applies all migrations to an empty Postgres and checks RLS. CI reports on PRs but does not block merging.
