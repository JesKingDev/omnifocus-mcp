# `.feedback/` — OmniFocus-integration feedback channel

Durable store for bugs, feature ideas, and friction about the **OmniFocus-MCP + JessOS tooling** (the MCP server plus
the skills: capture-live-blocker, route-inbox-to-projects, session-archaeology, surface-work-for-review,
sync-work-tasks-to-omnifocus). Any session — Jess or an agent, in any repo — can log here; future omnifocus-mcp sessions
and Jess triage it into the GSD backlog.

This is feedback about the **tooling itself**, not task capture (tasks go to OmniFocus) and not work/personal task
routing.

## Flow

```
capture (/of-feedback or omnifocus-feedback skill)
   → .feedback/inbox/<id>.md  (status: new, written but NOT committed)
   → /of-feedback-review       (triage, in an omnifocus-mcp session)
       → accept  → GSD backlog item (+ optional GitHub issue) → archive/
       → reject  → archive/
       → dup     → archive/
```

Capture is **write-only** (an entry from another repo's session lands here uncommitted). Triage runs in-repo and
commits/pushes. Entries are abstractive — summarize; never paste raw transcript or secrets.

## Layout

- `inbox/<id>.md` — open entries (`status: new`), one file per entry.
- `archive/<id>.md` — triaged entries (`accepted` / `rejected` / `duplicate`).

`<id>` = `YYYY-MM-DD-HHMMSS-<kebab-slug-of-title>` (the timestamp prevents collisions when several sessions write at
once).

## Entry schema

```yaml
---
id: 2026-06-17-130500-archaeology-gate-uuid-only
type: bug # bug | feature | friction | idea
title: '' # one line
status: new # new | accepted | rejected | duplicate
severity: '' # blocker | major | minor (bugs only; else empty)
reporter: agent # agent | jess
source_repo: '' # absolute path where it was observed, or ?
source_session: '' # session id, or ?
created: 2026-06-17 # YYYY-MM-DD
gsd_ref: '' # backlog path / issue URL, set on accept
---
## What
## Why it matters
## Context
## Suggested fix (optional)
```

## Example entry

```markdown
---
id: 2026-06-17-130500-archaeology-gate-uuid-only
type: bug
title: 'Archaeology batch gate shows only session UUIDs, no source project'
status: new
severity: minor
reporter: agent
source_repo: /Users/jessicaking/projects/omnifocus-mcp
source_session: '019c7d2a-0046-4dce-8a9f-f6131ad57791'
created: 2026-06-17
gsd_ref: ''
---

## What

The per-batch approval table in session-archaeology lists each session by UUID only.

## Why it matters

With all-projects scope, a reviewer can't tell whether a session came from a work repo or a personal project, which is
exactly the work/personal consent decision the gate exists for.

## Context

Observed while reviewing the all-projects scan output.

## Suggested fix (optional)

Show the source project dir alongside the UUID in the batch table.
```

## How to use

- **File feedback:** `/of-feedback <freeform text>` (you), or the `omnifocus-feedback` skill fires automatically when an
  agent hits a tooling bug/limitation.
- **Triage:** `/of-feedback-review` in an omnifocus-mcp session.
