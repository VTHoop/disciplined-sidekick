---

name: next-up
description: Level-set the Disciplined Sidekick project and recommend the next 2–3 pieces of work to refine, with reasons. Reads the Health Agent team's Linear projects, documents and issues, recent and open PRs, main's history and the architecture docs, reports what shipped, is in flight and is blocked, and recommends what to refine next. Read-only — never creates, edits or reorders issues. Use every few tickets, e.g. /next-up.
argument-hint: [optional focus, e.g. "M1 Food & Pillars" or "food lookup"]
---

# Purpose

Every few tickets the owner steps back and asks where the project is and what should come next. This skill asks that the same way each time from a fresh session, so the answer comes from the current state of Linear and the repo, not from what the last session remembered. It recommends; the owner decides. Its output feeds `/refine-ticket` (a user-level skill, not stored in this repo). It is owner-run only: it needs the owner's judgement, and it never runs headless or from the orchestrator.

# Inputs

`$ARGUMENTS` — optional focus: a Linear project name or an area of the product. Without one, consider every project of the Health Agent team.

If a focus is given and matches no project and no area of the product, say so, list the projects you found, ask which was meant, and stop. Do not fall back to the whole team.

# Linear tools

Use the Linear MCP server's read tools only: `list_teams`, `list_projects`, `get_project`, `list_milestones`, `list_documents`, `get_document`, `list_issues`, `get_issue` and `list_comments`. The server may be registered under any name (`mcp__linear__…` or `mcp__<uuid>__…`) — match on the suffix, and load the tools first if they are deferred.

**Never call `save_issue`, `save_comment`, `save_document`, or any other write tool** (`save_*`, `create_*`, `delete_*`, `share_*`, `retire_*`, `restore_*`, `mark_*`). This skill is read-only. If Linear is unreachable, say so and stop.

# Workflow

## 1. Gather

1. **Linear.** For the team **Health Agent** (issue key `HEA`):
   - Its projects, with status and target dates, and their milestones.
   - For each in-scope project, its documents: `list_documents` with the project id, then `get_document` on each decision record, PRD or spec. List them; do not search, since search matches titles only. The project description and these decision records state the project's goal.
   - Open issues (backlog, unstarted, started, in review) with status, priority, estimate, project, milestone and relations — blocked-by matters most. Read the comments of any issue labelled `needs-owner`.
   - Issues completed in the last 21 days.
2. **GitHub and git.** `git fetch origin`, then:
   - `gh pr list --state open --json number,title,headRefName,updatedAt,isDraft`
   - `gh pr list --state merged --limit 15 --json number,title,mergedAt`
   - `git log origin/main --oneline -20`
3. **Docs.** `ARCHITECTURE.md` in full, and the filenames in `docs/adr/` (ADRs hold only hard-to-reverse platform choices; decisions live in the Linear project documents).

If the Health Agent team or the projects in scope can't be found, say what is missing and ask. Do not guess.

## 2. Recommend

Pick **2–3 next pieces of work**. Each is either an existing Backlog or Todo issue, or a _proposed issue_ for work that is not in Linear. Rank them together on merit; being in Linear earns no preference.

Rank by **what moves the project's stated goal most now**. The goal comes from the project description and the decision records, not from a general sense of what products need. Break ties by:
1. **De-risking early.** Work that retires an unknown (a platform limit, a data source, an unproven integration) before more is built on it.
2. **Fitting one small PR.** If too large to land as one reviewable PR, say where to split it.

An existing issue must be **unblocked**: every blocked-by issue is Done. A blocked issue can be named as "next after X", never recommended.

Statuses change what you may do with an issue:
- **Ready** is brief by design: the factory picks a Ready ticket up almost immediately. Report it as **in flight** with the date it became Ready (from the issue's state history). Never recommend it.
- **`needs-owner`** means the factory stopped and needs the owner. Report it as **blocked**, with its escalation comment as the reason.

For each recommendation give:
- the issue key and title (or a proposed title);
- **why now**, citing evidence: an issue relation, a doc line, a merged PR, or the project's stated goal;
- **what it unblocks**;
- **the strongest case against doing it now**;
- **what happens if it waits**;
- **AC readiness**: _ready to start_, or _needs `/refine-ticket`_ with the gap named. A proposed issue always needs refining.

A recommendation without the case against and the cost of waiting is incomplete.

Where merged work contradicts a line in a doc (`ARCHITECTURE.md` or a decision record), propose an issue that cites both.

Name any Backlog or Todo issue you would **cut, defer or rewrite**, with a reason. Never edit it.

## 3. Report

```markdown
## Disciplined Sidekick — where we are (<date>)

**Shipped (last 21 days):** <issues/PRs, one line each>
**In flight:** <open PRs, started issues, and Ready issues with the date they became Ready>
**Blocked:** <issue — blocked by — on what; `needs-owner` issues with their escalation reason>
**Open decisions:** <decisions a project document marks as open or deferred, or "none">

### Recommended next

1. **HEA-n — <title>** (or **Proposed: <title>**)
   Why now: … (evidence)
   Unblocks: …
   Against doing it now: …
   If it waits: …
   AC: ready | needs /refine-ticket (<gap>)
2. …

### Cut, defer or rewrite

- HEA-n — <action> — <reason> (or "none")

**Next:** `/refine-ticket HEA-n`
```

The closing line points to the top recommendation by key. If the top recommendation is a proposal, say instead that it should be created as an issue and then refined.

# Constraints

- **Read-only.** No Linear writes, no git writes beyond `git fetch`, no PRs.
- **Never create an issue** and **never widen an existing one.** Missing work is a _proposed issue_ for the owner.
- **Recommend from evidence.** Every "why now" cites an issue relation, a doc line, a merged PR, or the project's stated goal.
- **Ready tickets are never recommended.** They are in flight.
