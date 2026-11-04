---
name: manual-test
description: Manually test a PR's UI and data rules against the local Supabase stack with the built-in browser. Use when the owner asks to "test PR n", "verify it locally" or "visually test" a change. Covers setup, driving each acceptance criterion in the UI and checking it with SQL, isolation checks and teardown.
---

# Manual test against the local stack

Run this when the owner asks for a hands-on check of a PR. It complements CI and the `pnpm check:*` scripts; it does not replace them. Read the PR's Linear issue first and turn every acceptance criterion (AC) into a row in a test table before touching anything.

Never run `supabase db push`. The owner applies migrations to production (AGENTS.md).

## Principles

- **Cover what CI doesn't.** The `check:*` scripts and unit tests already prove the SQL and logic. The manual test asks whether the real app, signed in as a real user against a real database, does what the AC say. Re-running CI adds nothing.
- **Verify every AC in two places.** Act in the UI, then confirm with SQL. Reload after each mutation so you see what was stored, not what React remembered.
- **Choose scenarios by risk, not count.** Each should target a different way the change could break: the common case, a boundary case, persistence after reload, a degraded state (offline), and a hostile actor (another user, `anon`).
- **Seed the minimum, with distinctive values.** Use different, readable numbers per row so totals can be checked by arithmetic, which catches wrong values as well as missing ones.
- **Test the security boundary through the real API**, not only in SQL. RLS filters silently, so expect 0 rows affected for another user's rows and a permission error for `anon`.
- **Simulate what you can't produce, and say so** in the report.
- **Treat environment snags as findings.** Note them for a ticket, keep workarounds temporary, revert them, and confirm with `git status`.
- **Hard limits:** local throwaway users only; never `supabase db push`; no keys or passwords in messages or committed files; don't merge or close tickets without an explicit yes from the owner.

## 0. Plan (stop for the owner's go-ahead)

Before starting any service:

1. Read the PR's Linear issue and every comment, the PR description and the diff. Note which tables, policies, screens and server routes it touches.
2. Write a test plan table with one row per scenario: AC (or risk it covers), steps in the UI, the SQL or API check that confirms it, the seed data it needs, and the expected result. Include for each AC the common case, a boundary case and persistence after reload; add a degraded case (offline) and a hostile-user case (another user, `anon`) when the change touches data access or the network.
3. List what the plan cannot cover and why (for example flows that need API keys).
4. Show the plan and stop. Do not run setup until the owner says go. If they change the plan, update the table first.

Then run the plan exactly; if you add or drop a scenario while testing, say so in the report.

## 1. Setup

1. Check out the PR (`gh pr checkout <n>`). Docker must be running; Docker Desktop allows one instance per Mac, so "lingering processes detected" means another macOS account has it open. Ask the owner to quit it there.
2. `supabase stop && supabase start`. `supabase db start` runs Postgres only, so auth, API and mail stay down. Note the publishable key and secret key from the output.
3. Email OTP works locally because `supabase/config.toml` sets `enabled = true` under `[auth.email]` (CLI 3.0.0 reads `enable_signup = false` alone as "email provider off"). Signups stay blocked: an unknown email gets `signup_disabled`. If OTP fails with `422 email_provider_disabled`, check that line.
   **Known snag (seen on PR 20, CLI 3.0.0, cause not yet found; CI's `db start` + `db reset` pass on the same migrations):** when migrations are present, `supabase start`, `db start` and `db reset` can all fail on the first migration with `event trigger "enforce_rls_on_new_tables" already exists`, as if it were applied twice. Applying the same files with `psql` works. Workaround: `supabase stop --no-backup`, move `supabase/migrations/*.sql` to the scratchpad, `supabase start`, move them back, then apply each in order with `docker exec -i <db container> psql -U postgres -v ON_ERROR_STOP=1 -1 < file`. If you see it, mention it in the report.
4. Apply the migrations (`supabase db reset` when it works), then the SQL-level proof: `pnpm check:rls` plus whichever of `check:ai-runs`, `check:targets`, `check:food` the PR touches.
5. Create users with the auth admin API: `POST http://127.0.0.1:54421/auth/v1/admin/users` with the secret key and `{"email": "tester-a@example.test", "email_confirm": true}`. Sign-in uses `shouldCreateUser: false`, so users must exist first. Create `tester-b@example.test` too when the PR touches access control.
6. Seed rows with SQL, since the real food-logging flow needs API keys the local stack lacks:
   `docker exec -i $(docker ps --filter name=supabase_db_disciplined-sidekick -q) psql -U postgres`
   (the host has no `psql`).
7. Write `apps/web/.env.local` (git-ignored) with `VITE_SUPABASE_URL=http://127.0.0.1:54421` and `VITE_SUPABASE_ANON_KEY=<local publishable key>`.
8. Create a temporary `.claude/launch.json` that runs vite on `127.0.0.1:5173`, then `preview_start`.

## 2. Execute

1. Open the app in the built-in browser. Request the sign-in code in the UI and read it from Mailpit (`http://127.0.0.1:54424`, or `curl /api/v1/messages` and `/api/v1/message/<id>`).
2. Walk the AC table one row at a time. For each: do it in the UI, check the page (use `read_page` / `get_page_text`, screenshots only for layout), and confirm in the database with SQL. Reload and confirm the data persists.
3. Cover the edges the AC implies: empty state, boundary values (for caps, test the value just under, at and just over), invalid input messages, save-on-blur and retry after a failed save, delete of a middle item and of the last item.
4. Check mobile width too (`resize_window` preset `mobile`); this is a phone-first PWA. Reset to `desktop` after.
5. Offline: override `navigator.onLine` to `false` and dispatch an `offline` event with the javascript tool; remove the override and dispatch `online` to restore. This simulates, it is not a real network drop.
6. Isolation (when RLS or ownership is involved): mint a token for user A (admin `generate_link`, then `POST /auth/v1/verify`) and call the REST API against user B's rows. Expect 0 rows affected, and a permission error for `anon`.
7. Check the browser console for errors (`read_console_messages`) before declaring a row passed.

## 3. Report

Post back to the owner (and the PR, if asked): a table of AC → result (pass / fail / not covered) with the evidence (SQL output, observed text). Say plainly what failed. List what this method does not cover: true network loss, the real food-logging flow (needs API keys), push/service-worker behaviour on a real device, and anything only production data would show.

Also list follow-up findings (such as the `enable_signup` defect) for the owner to ticket.

## 4. Teardown

Ask whether to keep the stack running; tear down only what you created.

1. `preview_stop`; delete the temporary `.claude/launch.json`.
2. Confirm `git status` is clean apart from intended changes (no stray `.env.local`, `launch.json` or edited migrations).
3. Delete `apps/web/.env.local`.
4. `supabase stop`. Data stays in a Docker volume; the next `db reset` wipes it. Test users and seeded rows are local-only.
