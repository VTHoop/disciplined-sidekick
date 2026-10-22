# 2. Vercel for hosting and API

Status: accepted

## Context

The web app is static and the API is a thin Hono layer that includes long-running AI calls.

## Decision

Deploy to Vercel: the Vite build is served statically and `api/index.ts` runs as a Node 24 function with a 300 s max duration. Every branch gets a preview deploy; `main` deploys to production. Hono keeps the server code portable.

## Consequences

- The 300 s function limit bounds any single AI call.
- Server code in `server/` stays free of Vercel APIs so it can move to another Node host.
- Secrets are Vercel environment variables.
