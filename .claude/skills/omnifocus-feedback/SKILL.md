---
name: omnifocus-feedback
description:
  Use to log a bug, feature idea, or friction about the OmniFocus-MCP / JessOS task tooling (the MCP server and the
  skills capture-live-blocker, route-inbox-to-projects, session-archaeology, surface-work-for-review,
  sync-work-tasks-to-omnifocus). TWO triggers — (a) Jess explicitly reports a problem or idea about that tooling
  ("/of-feedback", "log a bug about the archaeology skill", "feature idea for the capture tool"); (b) an AGENT,
  mid-task, hits a bug, limitation, or gap in that tooling and should record it for later triage. Writes one abstractive
  entry to the omnifocus-mcp `.feedback/inbox/`. This is feedback about the TOOLING — NOT task capture (tasks go to
  OmniFocus) and NOT generic project feedback. Do NOT trigger on the bare word "feedback" unrelated to the
  OmniFocus/JessOS tooling.
---

# OmniFocus Feedback

Log a tooling bug/feature/friction as one entry in the omnifocus-mcp `.feedback/inbox/`, so future omnifocus-mcp
sessions and Jess can triage it (`/of-feedback-review`). Capture is **write-only** — write the entry, confirm the path,
and do not commit (triage commits in-repo).

## When this fires

- **Jess reports** a bug/idea/friction about the OmniFocus-MCP/JessOS tooling (often via `/of-feedback`).
- **An agent** notices, mid-task, that the tooling is broken, missing something, or awkward — log it and carry on with
  the original task. Don't derail; one entry, then continue.

If the thing isn't about this tooling (it's a task, a code bug in some other repo, a general idea), this skill does not
apply.

## Procedure

**Step 1 — Resolve the store path (absolute, works from any cwd).** The store lives in the omnifocus-mcp repo:
`$HOME/projects/omnifocus-mcp/.feedback/inbox/`. Ensure it exists
(`mkdir -p "$HOME/projects/omnifocus-mcp/.feedback/inbox"`). If the repo root (`$HOME/projects/omnifocus-mcp`) does not
exist on this machine, report that and stop — do not invent a location.

**Step 2 — Classify and summarize (abstractive).**

- `type`: `bug` | `feature` | `friction` | `idea`.
- `title`: one concise line.
- `severity` (bugs only): `blocker` | `major` | `minor`; leave empty otherwise.
- Summarize in your own words. NEVER paste raw transcript, secrets, tokens, or PII. Capture enough context to act on
  later, no more.

**Step 3 — Build the id.** `id` = `$(date +%Y-%m-%d-%H%M%S)` + `-` + a kebab-case slug of the title (lowercase, hyphens,
no punctuation). The timestamp prevents collisions when several sessions write at once.

**Step 4 — Fill the remaining fields.**

- `reporter`: `jess` when she's reporting; `agent` when an agent self-reports.
- `source_repo`: the absolute path of the repo/cwd where this was observed (run `git rev-parse --show-toplevel` or use
  `pwd`); `?` if none.
- `source_session`: the current session id if known, else `?`.
- `created`: `$(date +%Y-%m-%d)`.
- `status`: `new`. `gsd_ref`: empty (set at triage).

**Step 5 — Write the entry** to `$HOME/projects/omnifocus-mcp/.feedback/inbox/<id>.md` using the Write tool, from this
exact template (all frontmatter fields present):

```markdown
---
id: <id>
type: <bug|feature|friction|idea>
title: '<one line>'
status: new
severity: <blocker|major|minor or empty>
reporter: <jess|agent>
source_repo: <absolute path or ?>
source_session: <session id or ?>
created: <YYYY-MM-DD>
gsd_ref: ''
---

## What

<what the bug/idea is, in one short paragraph>

## Why it matters

<impact — who/what it affects, why it's worth acting on>

## Context

<where/when observed; the minimum needed to reproduce or understand>

## Suggested fix (optional)

<only if you have one>
```

**Step 6 — Confirm and stop.** Tell the user the entry path (`.feedback/inbox/<id>.md`). Do NOT commit — capture is
write-only; triage (`/of-feedback-review`, run in an omnifocus-mcp session) commits. If you were an agent mid-task,
return to the original task.

## Common mistakes

| Mistake                                          | Fix                                                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Treating this as task capture                    | Tasks go to OmniFocus (capture-live-blocker / route-inbox). This store is for feedback about the tooling itself. |
| Pasting raw transcript or secrets into the entry | Summarize abstractively; never paste raw content (T-05-06 spirit).                                               |
| Committing the entry                             | Capture is write-only. Triage commits in-repo.                                                                   |
| Writing to a relative `.feedback/` path          | Always use the absolute repo path `$HOME/projects/omnifocus-mcp/.feedback/inbox/` so it works from any session.  |
| Deriving the id without a timestamp              | Use `date +%Y-%m-%d-%H%M%S` — avoids filename collisions across concurrent sessions.                             |
