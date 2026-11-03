---

name: next-up
description: Level-set the Disciplined Sidekick project and recommend the next 2–3 pieces of work to refine, with reasons. Reads the Health Agent team's Linear projects, documents and issues, open and merged PRs, main's history, ARCHITECTURE.md and the ADR filenames, reports what shipped, is in flight and is blocked, and recommends what to refine next. Read-only — never creates, edits or reorders issues. Owner-run, never unattended. Use every few tickets, e.g. /next-up.
argument-hint: [optional focus: a Linear project name or an area of the product]
---

# Purpose

Every few tickets the owner steps back and asks where the project is and what should come next. This skill is that question, asked the same way each time from a fresh session, so the answer comes from the current state of Linear and the repo rather than from whatever the last session remembered. It recommends; the owner decides. Its answer feeds `/refine-ticket`. It is owner-run: never run it from the orchestrator or headless.

# Inputs

`$ARGUMENTS` — optional focus: a Linear project name or an area of the product. Without one, consider every project of the Health Agent team. If the focus matches no project and no area of the product, say so and ask. Do not fall back to the whole team.

# Linear tools

Use the Linear MCP server's `list_teams`, `list_projects`, `get_project`, `list_milestones`, `list_documents`, `get_document`, `list_issues`, `get_issue`, `list_comments` and `list_issue_statuses`. The server may be registered under any name (`mcp__linear__…` or `mcp__<uuid>__…`) — match on the suffix. Load them first if they are deferred.

**Never call `save_issue`, `save_comment`, `save_document`, or any other write tool** (`save_*`, `create_*`, `delete_*`, `share_issue`, `unshare_issue`, `mark_notification`). This skill is read-only. If Linear is unreachable, say so and stop.

# Workflow

## 1. Gather

1. **Linear.** For the team with key `HEA` (Health Agent):
   - Its projects and milestones, with status and target dates, and each project's description.
   - For each in-scope project, **list** its documents (`list_documents` with the project) and read (`get_document`) the decision records, PRD and specs. Do not search: search matches titles only.
   - Open issues (Backlog, Todo, Ready, In Progress, In Review) with status, priority, estimate, project, milestone and blocked-by relations.
   - Issues completed in the last 21 days.
   - For each Ready issue and each issue labelled `needs-owner`, read its comments.
2. **GitHub and git.** `git fetch origin` is the only git write. Then:
   - `gh pr list --state open --json number,title,headRefName,updatedAt,isDraft`
   - `gh pr list --state merged --limit 15 --json number,title,mergedAt`
   - `git log origin/main --oneline -20`
3. **Docs.** `ARCHITECTURE.md`, and the filenames in `docs/adr/`. Decisions live mainly in the Linear project documents; `docs/adr/` holds only hard-to-reverse platform choices.

If the Health Agent team, or the projects in scope, can't be found, say what is missing and ask. Do not guess.

## 2. Recommend

Pick **2–3 next pieces of work**. Each is an existing Backlog or Todo issue, or a proposed issue for work that is not in Linear. Rank them together on merit: being in Linear earns no preference.

Rank by what moves the project's stated goal most now. The goal comes from the Linear project description and the decision records. Break ties by:
1. **De-risking early** — work that retires an unknown before more is built on it.
2. **Fitting one small PR.** If it is too large for one reviewable PR, say where to split it.

An existing issue must be unblocked: every blocked-by issue is Done. A blocked issue can be named as "next after X", never recommended.

Status handling:
- **Ready** means the factory will pick the ticket up almost immediately. Report it as in flight, with the date it became Ready. Never recommend it.
- **`needs-owner`** means the factory stopped. Report it as blocked, with its escalation comment as the reason.

For each recommendation give:
- The issue key and title, or a proposed title.
- **Why now.**
- **What it unblocks.**
- **The strongest case against doing it now.**
- **What happens if it waits.**
- **AC readiness:** ready to start, or needs `/refine-ticket` with the gap named. A proposed issue always needs refining.

A recommendation without the case against and the cost of waiting is incomplete.

Each recommendation cites evidence: an issue relation, a doc line, a merged PR, or the project's stated goal. Where merged work contradicts a doc line, propose an issue that cites both.

Name Backlog or Todo issues you would cut, defer or rewrite, each with a reason. Never edit them.

## 3. Report

```markdown
## Disciplined Sidekick — where we are (<date>)

**Shipped (last 21 days):** <issues/PRs, one line each>
**In flight:** <open PRs, started issues, Ready issues with the date they became Ready>
**Blocked:** <issue — blocked by — on what; `needs-owner` issues with the escalation reason>
**Open decisions:** <decisions a doc marks as open or deferred, or "none">

### Recommended next

1. **HEA-n — <title>** (or **Proposed: <title>**)
   - Why now: …
   - Unblocks: …
   - Case against: …
   - If it waits: …
   - Evidence: …
   - AC: ready | needs /refine-ticket (<gap>)
2. …

### Work to cut or defer

- HEA-n — cut | defer | rewrite — <reason> (or "none")

**Next:** `/refine-ticket HEA-n` for the top recommendation; for a proposal, "create it as an issue, then `/refine-ticket` it".
```

# Constraints

- **Read-only.** No Linear writes, no git writes beyond `git fetch`, no PRs.
- **Never create an issue and never widen an existing one.** Work you think is missing is a proposed issue for the owner. Scope stays in Linear.
- **Recommend from evidence.** Every "why now" cites an issue relation, a doc line, a merged PR or the project's stated goal, not a general sense of what products need.
- **The owner decides.** End with the pointer to `/refine-ticket`; do not start refining.
