# 1. Supabase for Postgres, Auth and Storage

Status: accepted

## Context

A single-user PWA needs a database, authentication and file storage with minimal operations work.

## Decision

Use one hosted Supabase project for Postgres, Auth (email OTP) and Storage. Schema lives in `supabase/migrations/`. Row level security is on by default for every `public` table, and the API verifies Supabase JWTs against the project JWKS.

Preview and production deploys share the same Supabase project.

## Consequences

- Moving off Supabase means replacing Auth and Storage, not just the database.
- Preview deploys run against production data and schema; migrations must be safe to apply while previews are live.
- The service role key bypasses RLS and is server-only.
