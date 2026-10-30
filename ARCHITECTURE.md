# Disciplined Sidekick architecture

Current state of the system. Decisions that are hard to reverse are recorded in [`docs/adr/`](docs/adr).

## Workspace layout

```
apps/web/        Vite 8 + React PWA (vite-plugin-pwa, generateSW); auth and routing in src/auth/, food logging in src/food/, targets in src/settings/, theme in src/styles/ and src/fonts/
packages/core/   Shared TypeScript logic (targets, nutrition math, the 800 g rules, the food preview type), consumed from source
api/index.ts     Vercel function entry: wires the Hono app to the Vercel runtime
server/          Hono app (routes, Supabase JWT verification); framework-agnostic and unit-tested
server/ai/       Typed AI call layer: runner, per-function config, prices, ai_runs store, functions/
server/food/     Food logging: USDA FDC client, food_cache store, the parse-and-look-up flow
supabase/        Local config, SQL migrations and the OTP email template
scripts/         CI checks (build verification, RLS, ai_runs and user_targets checks; lib/psql.sh is shared)
tests/           Repo-level tests for config, CI and docs conventions
.claude/skills/  Project skills (start-ticket, address-review)
```

`apps/web` imports `@disciplined-sidekick/core` as `workspace:*`. `server/` reaches it by relative path (`../../packages/core/src/index.js`), the way `api/` reaches `server/`, and core's own imports carry `.js` extensions: the Vercel function compiles the files it reaches and runs them as Node ESM, so TypeScript behind a `node_modules` link and extensionless imports are avoided. `tests/repo.test.ts` enforces both.

## Request path

client → Hono → Supabase
1. The browser signs in with Supabase Auth and holds an access token.
2. It calls `/api/*` with `Authorization: Bearer <token>`.
3. The Hono app on a Vercel Node 24 function (300 s max) verifies the token against the project's JWKS (issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`) and exposes the user id to handlers. Bad credentials get a 401; a failure to fetch the keys gets a 503, so an outage never looks like a bad login.
4. Handlers talk to Supabase (Postgres, Storage). Row level security keeps data per user.

Routes today: `GET /api/health` (status and deployed commit SHA, no dependency checks), `GET /api/me` (authenticated user id), `POST /api/ai/demo` (authenticated; the demo AI function, 503 if the AI env is missing) and `POST /api/food/parse` (authenticated; see _Food logging_, 503 if the AI or USDA env is missing).

## AI calls

Every AI function is an `AiFunction` in `server/ai/functions/` (name, prompt and schema versions, a zod output schema, and a prompt builder that sees only the input, never the user) and runs through `runAiFunction` (`server/ai/run.ts`). It calls `client.messages.parse` with a `zodOutputFormat` whose parser reports bad output as data, so a failed validation is still priced and logged. Retries (two, on 408/409/429/5xx and connection errors) are done by the runner with the SDK's own retrying off, so attempts are counted. Failures surface as `AiApiError`, `AiValidationError`, `AiRefusalError` or `AiTruncatedError`.

Model, effort and max tokens come from the function's one entry in `server/ai/config.ts`; prices are in `server/ai/pricing.ts` and cost is computed from the model that answered. Functions take a plain user id (or none), so an HTTP route and a cron job call them the same way.

Each invocation writes exactly one `public.ai_runs` row (status, attempts, tokens, cost, stop reason and details, input, output, validation errors, prompt and schema versions) with the service-role key. If that write fails the caller still gets the result and the failure is logged with the run's details. Signed-in users can only `select` their own rows; a daily `pg_cron` job (`purge_ai_runs`) deletes rows older than 90 days. `pnpm check:ai-runs` proves both against the local database. The `pg_cron` extension must be enabled in the hosted project before this migration is applied.

## Food logging

Type what you ate on Today; a sheet previews the items; **Done** saves them as one entry. Nothing is saved before Done, so Undo, Escape, the back button, a swipe down or closing the app all just close the sheet with the text kept.
1. `POST /api/food/parse` (body `{ text }`, trimmed, 1 to 2000 characters) issues a fresh entry id and runs `logFood` (`server/food/log-food.ts`). `parseFood` splits the text into items (grams, display and canonical names, a USDA query, `portionEstimated`, `countsFruitVeg` from the 800 g rules in `packages/core/src/fruit-veg.ts`, and the `brand` and `path` the item takes: `generic`, `branded` or `restaurant`; a branded or restaurant item always has a brand, a generic one never does, and `servings` when the text gives a quantity in label servings).
2. Items are looked up in parallel, once per brand and canonical name (a food named twice in one entry shares one lookup): `food_cache` by `lookupKey(brand, canonicalName, path)` (a generic item's key is still `canonicalKey(canonicalName)`, so older rows hit; a branded or restaurant key adds the brand and the path, so "Chobani plain greek yogurt" and "plain greek yogurt" are separate rows, and so are a chain's "queso" and a packaged "queso" of the same brand). On a miss, by `path`:
   - **generic:** a USDA FoodData Central search (Foundation, SR Legacy, FNDDS; top 5; the `API_DATA_GOV_KEY` goes in the `X-Api-Key` header, server-side only), then `pickFood` chooses one or none.
   - **branded:** the same search against the Branded dataset only, with the brand in the query. The brand is only a search term, so the search fetches 50 results and code keeps those whose brand passes `brandMatches` (`server/food/brand.ts`: case and punctuation ignored, one name contains the other), at most 5. `pickFood` chooses among those, seeing the brand and each candidate's `brandOwner` and `brandName`. With none from the brand, `pickFood` is not called and the item is an AI estimate. It never falls back to a generic USDA food. When the entry gave label `servings` and the pick's label serving size is in grams, grams are `servings` × serving size and the portion is no longer a guess; otherwise grams come from `parseFood`. The serving size is cached, so a cache hit converts too.
   - **restaurant:** no USDA call; `estimateFood` gets the restaurant and the item.

   No results, no pick, a failed brand check, or a pick with no energy (1008, then 2048, then 2047) or no protein (1003) falls back to `estimateFood` (given the brand on the branded and restaurant paths), marked estimated. The result is cached, picks and estimates alike. Every item records its source: `usda`, `branded` or `estimated` (`estimate` in `food_cache`).
3. The preview carries per-100 g values and unrounded kcal, protein and fruit/veg grams per item and in total (`packages/core/src/nutrition.ts`); display rounds. A branded or restaurant item is titled with its brand then its capitalised canonical name (`foodLabel` in `packages/core/src/food.ts`), a generic one by its display name. An estimated item's reason line ("No USDA match…", "No {brand} match in USDA…", "Restaurant item…") is shown in the preview only; the saved item keeps the Estimated mark and its brand.

Any failure fails the whole entry and caches nothing for that lookup, once every other lookup has finished (so no AI call is still running when the response goes out and its `ai_runs` row is lost): malformed AI output (schema validation), a refusal or truncation, a USDA network error or non-2xx (429 included), or a pick that was not a candidate. An error on the branded or restaurant path is never treated as "no match". The route answers 502 `food_lookup_failed`, or 422 `no_food` when parseFood finds no food; the sheet shows a retry message and keeps the text.

Every AI call is one `ai_runs` row carrying `entry_id`, for undone and failed entries too; a saved entry's id is the same id, so `ai_runs.entry_id = food_entries.id` traces it (no foreign key, since most ids never become entries).

Done calls `save_food_entry(entry_id, text, local_date, items)` with supabase-js and the user's JWT: security invoker, one transaction, and a repeat with the same id changes nothing. `local_date` is the device's calendar day when Done is pressed. `food_items` also records each item's `brand` and `source`; a payload without a `source` (code from before they existed) gets one from `estimated`, so a migration applied ahead of a deploy breaks nothing. `food_cache` records `brand`, the label `serving_size_g` and the source, and `fdc_id` is set exactly for `usda` and `branded` rows. `food_entries` and `food_items` allow own-row select and insert to `authenticated` only (no update or delete yet; deleting is HEA-11; `service_role` is revoked). `food_cache` is global (USDA data is not personal), readable and insertable only by `service_role`, never updated or deleted, so an undone entry's lookups stay cached. `pnpm check:food` proves these rules against the local database.

Each entry makes up to three AI calls in sequence per item (parse, pick, estimate), each allowed three attempts at `REQUEST_TIMEOUT_MS`, so a long outage can outlast the function's 300 s limit (`timeouts.test.ts` records this exception); the browser then shows the retry message, but the in-flight call's `ai_runs` row is lost.

## Targets

Daily calorie, protein and fruit/veg targets live in `public.user_targets`, one row per user, edited on the `/settings` screen. This is the one place the browser skips Hono: `src/settings/targets-store.ts` reads and upserts the row with supabase-js and the user's own JWT, so row level security (own-row select, insert, update and delete; grants to `authenticated` only; `service_role` is revoked so local matches hosted) is the only guard and the server needs no `service_role` access. `user_id` defaults to `auth.uid()`, so the client never sends it.

The 800 g fruit/veg default is code, not data: `packages/core/src/targets.ts` (`DEFAULT_FRUIT_VEG_G`, `resolveTargets`, `parseTarget`). The table stores fruit/veg only once the user has edited it (`fruit_veg_edited`); until then they follow whatever the current default is, and a cleared value (`fruit_veg_g` null with `fruit_veg_edited` true) stays unset. Calories and protein have no default. Values are whole numbers greater than 0, enforced in `parseTarget` and by check constraints (`bigint`; `parseTarget` caps at `Number.MAX_SAFE_INTEGER`, with its own message). Each field saves on blur; a failed save keeps the typed value and retries on the next blur, and only the newest save per field updates the screen. `pnpm check:targets` proves the RLS rules and constraints against the local database.

## Styles

The Crate theme lives in `apps/web/src/styles/`: `tokens.css` (every colour, type, radius, space and motion token as a CSS custom property; light by default, dark under `prefers-color-scheme: dark`), `fonts.css` and `base.css` (element styles, focus ring, reduced motion), loaded in that order by `main.tsx`. Components use semantic tokens only: a test fails on any raw hex or `rgb()` colour in `src` outside `tokens.css`, and a contrast test measures every text and outline pair in both modes (`line-subtle` is a decorative hairline and is excluded). `scrim` dims the screen behind a sheet and is not a text pair. Many tokens (pillars, `status-offline`, several sizes, radii and spaces) have no consumer yet; they are the foundation for the Today, logging and offline tickets. `sticker-ink` is a fixed dark ink for the stickers, whose fills do not change in dark mode.

Big Shoulders (700, 800, 900) and Atkinson Hyperlegible Next (400, 600, 700) are self-hosted as Latin woff2 in `src/fonts/<family>/`, each beside its `OFL.txt` (SIL OFL 1.1), copied from `@fontsource` 5.3.0. Vite hashes them into `dist/assets` and `workbox.globPatterns` precaches them, so a cold start offline uses the real fonts. `pnpm verify:build` fails if dist does not hold all six fonts, if one is missing from `sw.js`, or if any built file names Google Fonts. The manifest `theme_color` and `background_color` are the light `surface-ground` value, repeated in `vite.config.ts` and the `theme-color` metas in `index.html` because neither can read the CSS; `shell.test.ts` keeps them in step.

## Sign-in

One pre-created user signs in with a 6-digit email code (Supabase Auth, signups disabled). The web app calls `signInWithOtp` with `shouldCreateUser: false`, then `verifyOtp`; an unknown email gets the same code screen as a real one (the signups-disabled error is swallowed), so account existence is not revealed. The session lives in `localStorage`, refreshes until sign-out, and has no idle timeout. `src/auth/` holds the Supabase client, `AuthProvider` (session state), route guards (react-router: signed out → `/sign-in`, signed in → `/`), the sign-in and Today screens, and `apiFetch`, which adds the bearer token to `/api/*` calls. `vercel.json` rewrites non-API paths to `index.html` so deep links work.

Hosted-only settings (not applied by `config.toml`): signups off, Resend SMTP, and the OTP email template (`supabase/templates/magic_link.html`, which shows the code and no link) are set in the Supabase dashboard.

## Environments

Preview and production deploys share one Supabase project, so preview branches run against production data and schema. Treat migrations accordingly.

## Migrations

Schema changes are SQL files in `supabase/migrations/`, applied to the hosted project with the Supabase CLI. The repo is linked to the hosted project (`supabase/.temp/linked-project.json`, git-ignored; run `supabase link --project-ref <ref>` on a new machine).
1. **Write it.** `supabase migration new <name>` creates a timestamped file. New tables need an explicit `grant` (see AGENTS.md); RLS is on by default. Hosted extensions such as `pg_cron` are enabled in the Supabase dashboard first.
2. **Prove it locally.** `supabase db start && supabase db reset` applies every migration to an empty database, then run `pnpm check:rls` and any table-specific check (for example `pnpm check:ai-runs`). CI's `database` job does the same.
3. **Make it additive.** Preview and production deploys share one database, so a migration must not break the code on `main`. Add tables and columns first; remove or rename in a later migration once nothing uses them.
4. **Apply it to the hosted project.** Check with `supabase migration list --linked` (local and remote columns should match), preview with `supabase db push --dry-run`, then `supabase db push`. Do this before a preview that needs the change can work, and no later than merging the PR. Only the owner pushes; an agent does not run `db push` unless asked.
5. **Confirm.** `supabase migration list --linked` shows the new version on both sides.

Never edit a migration that has been applied to the hosted project; add a new one.

## Secrets

Server-only, set as Vercel env vars: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `API_DATA_GOV_KEY`, `SUPABASE_URL`. The client bundle holds only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `pnpm verify:build` runs in CI and fails if any server secret appears in `apps/web/dist`.

## Quality gates

Biome (pre-commit via lefthook, and CI), TypeScript, Vitest, build, build verification, and a database job that applies all migrations to an empty Postgres, checks RLS and checks the `ai_runs` access rules and retention (`pnpm check:ai-runs`), the `user_targets` access rules (`pnpm check:targets`) and the food logging rules (`pnpm check:food`). CI reports on PRs but does not block merging.
