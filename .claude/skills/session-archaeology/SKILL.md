---
name: session-archaeology
description:
  Use ONLY when Jess explicitly uses the word "archaeology" — e.g. "archaeology", "session archaeology", "run
  archaeology", "archaeology scan", "dig up open loops (archaeology)". The trigger word is deliberately distinctive so it
  never collides with conversational phrases. Do NOT trigger on generic phrasing like "scan my sessions", "find open
  loops", or "what did I forget" — those collide with other skills (e.g. remember) and must NOT route here unless the
  word "archaeology" is present. Scans the last 7 days of active Claude Code transcripts for unresolved open loops via the
  pre-filter probe, presents resumable per-batch (5-session) summarize-then-approve gates, and on approval creates
  archaeology-tagged OmniFocus tasks in the right project (or inbox fallback). Deterministic alias: Jess can also type
  the slash invocation `/session-archaeology`.
---

# Session Archaeology

## Install (one-time, global)

This skill is global via symlink from the omnifocus-mcp repo (single source of truth):

```bash
ln -sfn "$HOME/projects/omnifocus-mcp/.claude/skills/session-archaeology" "$HOME/.claude/skills/session-archaeology"
mkdir -p "$HOME/.claude/commands"
ln -sfn "$HOME/projects/omnifocus-mcp/.claude/commands/archaeology.md" "$HOME/.claude/commands/archaeology.md"
```

The probe is invoked by absolute path so the skill works from any cwd:
`$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js`.

## Overview

Retrospective batch scan of the last 7 days of Claude Code transcripts to surface unresolved open loops before they die
at context-window boundaries. OmniFocus is canonical — every approved loop becomes a real task. Adds no server code
beyond the Phase-01 `archaeology` allowlist entry; drives the existing `omnifocus_read` / `omnifocus_write` surfaces and
the pre-filter probe committed in Phase 02.

The skill is on-demand only (TRIG-01). It is the **inverse** of `capture-live-blocker` in polarity: capture-live fires
in the moment for a single concrete item; archaeology fires retrospectively for a batch of sessions. The merged approval
gate (D-04/D-06) is the consent layer — no task is written before `yes`.

Key design decisions embedded:

- **D-01 source** — raw `.jsonl` transcripts, not `.remember/` (wins-only files have wrong polarity for finding undone
  work).
- **D-02 windowing** — content-date `timestamp` per message, NOT file mtime; exclude `isSidechain` subagent threads.
- **D-03 rubric** — semantic four-category detection with a guaranteed-catch floor.
- **D-04/D-04a gate** — plain-text `yes / edit / abort`; NOT `AskUserQuestion`.
- **D-05 placement** — `archaeology` + `agent-okay` (auto-stamped by funnel) + `of-mcp:lineage` lineage stamp.
- **D-06 per-batch gate** — one merged table (session + loops + proposed placement) per batch of 5 sessions; one
  `yes / edit / abort` per batch (revises the original single-gate D-06 for the all-projects scope so a large scan stays
  digestible and resumable); routing proposal computed inline without chaining `route-inbox-to-projects`.
- **D-07 dedup** — `omnifocus_read` archaeology-tagged tasks (active + completed), parse session IDs via `LINEAGE_RE`,
  skip already-extracted sessions.

## Procedure

Three passes in order. Pass 1 is read-only — it scans, deduplicates, detects, and computes placements. Pass 2 executes
only after you approve. Pass 3 reports results.

> **EXECUTION GUARD — read before doing anything.** This skill's knowledge of past sessions comes EXCLUSIVELY from the
> probe in Pass 1 Step 1. You have NO knowledge of past sessions from your own context.
>
> - The FIRST action of Pass 1 is to run `node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js"` via the
>   Bash tool. No exceptions.
> - NEVER answer from the current conversation. The session you are in right now is not the subject — the probe output
>   over the last 7 days of transcripts is. Introspecting the live chat is the #1 failure mode for this skill.
> - If you have not run the probe, no scan has happened. Do not present a table, claim "no open loops", or report
>   results before the probe output is in hand.
> - If the probe errors or returns zero records, say so explicitly and stop — do not silently fall back to summarizing
>   the current conversation.

### Pass 1 — Scan, Dedup, Detect, Propose (read-only)

**Step 1: Resolve active dirs + pre-filter (D-01, D-02, D-03) — MANDATORY FIRST ACTION**

Run the pre-filter probe (scan mode) by absolute path. It enumerates ALL `~/.claude/projects/*` transcript dirs, reads
each session's `.jsonl`, applies the D-03 strip rule and the D-02 7-day content-date window, AND drops any message at or
before that session's stored watermark (`~/.claude/session-archaeology/state.json`). It emits only NEW records, grouped
by session, newest-first, and writes a `pending` watermark for this run. The trailing summary line reports how many new
records and sessions were found. If it reports zero sessions, there is nothing new since the last run — say so and stop.

```
node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js"
```

**Step 2: Dedup read (D-07, LINE-01)**

Read `archaeology`-tagged tasks from OmniFocus, both active and completed, to build the set of already-extracted
sessions. Run two reads and union their results:

- Active: `omnifocus_read` `type:"tasks"`, `filters.tags.all:["archaeology"]`, `details:true`
- Completed: `omnifocus_read` `type:"tasks"`, `filters.tags.all:["archaeology"]`, `filters.status:"completed"`,
  `details:true`

`details:true` is **mandatory** on both reads. Without it, notes truncate to 200 characters — the `of-mcp:lineage` block
lives at the end of the note and is silently dropped, causing the dedup set to be empty and every session to re-surface
each scan (Pitfall 3).

For each returned task, parse its `note` with `LINEAGE_RE` (`/\n\n<!-- of-mcp:lineage\n.*?\n-->/s`), then `JSON.parse`
the matched block and read `.session`. Collect all session IDs into a `Set<string>` (the extracted-session set). Skip
any session from the probe output whose `session_id` is already in this set (D-07). Only deleted archaeology tasks
re-surface their sessions — completed ones stay suppressed.

**Step 3: Detect open loops (D-03)**

For each remaining session (not in the dedup set), read the probe output for that session and apply the four-category
detection rubric:

> **An open loop is a concrete, still-unresolved intent the session left behind.** Surface a candidate only if it fits
> one of these four categories AND is actionable (could become an OmniFocus task), not a general musing:
>
> 1. **Open question** — a question the user or agent raised that the session never answered, where the answer needs
>    information or a decision not yet made.
> 2. **Deferred work** — work explicitly postponed ("later", "next time", "follow-up", "circle back", "out of scope for
>    now").
> 3. **Stated-but-unfiled intent** — the user said they want/need/should do something and no task was created for it.
> 4. **Unfinished edit** — a code/doc change started or planned in the session but left incomplete (a stubbed function,
>    a TODO left in, a half-applied refactor).
>
> **Guaranteed-catch floor (always surface, even if borderline):** any line containing `TODO`, the word `blocker`, a
> `next:` marker, or an explicitly unanswered question.
>
> **Bias to recall, but exclude:** resolved items (the session handled them), pure observations/opinions with no action,
> speculative "we could maybe someday" ideas with no commitment, and anything already turned into a task during the
> session. When two phrasings describe the same loop, merge them into one.

Loop extraction is **abstractive** — describe the loop in your own words; never paste raw transcript text verbatim into
a task name or note (T-05-06: transcripts may carry secrets or PII; the probe already strips `tool_result` content, the
most likely secret carrier, but abstracting the description adds a second layer).

Record the session's "What it was about" from the transcript's `ai-title` line when present (prefer this over an
agent-authored summary); fall back to a one-line agent summary of the session's prose.

**Step 4: Compute routing placement per loop (D-06)**

For each detected loop, compute its proposed OmniFocus placement by following the routing ladder inline (do NOT invoke
the `route-inbox-to-projects` skill — it would fire its own `yes / edit / abort` gate, violating D-06; see Common
mistakes).

First, read the active project list:

`omnifocus_read` `type:"projects"`, `filters.status:"active"`, `fields:["id","name","folderPath","note"]`

Then read the vault frontmatter map (Vault Signal Read below) for INFER candidates.

Apply the ladder in order for each loop:

1. **MATCH** — An existing active project name clearly identifies the loop's home (high confidence). Assign it there. Do
   not guess on ambiguous names.
2. **INFER** — No obvious project match, but a vault note's `omnifocus-project` field deterministically names the
   target. The semantic step is matching the loop's topic to the right vault note; once identified, the
   `omnifocus-project` mapping is deterministic. Check whether the project already exists before create (avoid
   duplicates). Assign INFER + the `omnifocus-project` name.
3. **LEAVE** — Cannot match and cannot infer. Leave the loop to fall into the inbox (ARCH-03 fallback). No
   `routing-unplaced` tag — these are new task creates, not existing inbox items.

**Bias to leave.** When in doubt between MATCH and LEAVE, choose LEAVE. A misplaced task is harder to find than an inbox
item.

**Step 5: Process in batches of 5 sessions, newest-first (resumable gate)**

Group the new sessions (probe output is already newest-first) into batches of **5**. For EACH batch, in order:

1. Read the active project list ONCE for the whole run (Step 4) and reuse it for every batch and session — do NOT
   re-read it per session (OmniFocus queries take 10+ seconds). Then, for each session in the batch, detect loops
   (Step 3) and compute placement against that already-loaded project list (Step 4 ladder) + the OF lineage dedup
   backstop.
2. Show ONE merged table for this batch (session rows + per-loop placement rows, as below). Include a per-placement
   count and a batch task total.
3. Ask, in plain text (NOT `AskUserQuestion`): `Approve this batch? (yes / edit / abort)`
   - **abort** — stop the entire run. Do NOT commit this batch. Report what was done so far. Uncommitted batches
     re-surface next run.
   - **edit** — apply row-level corrections (drop/trim loops, override placement, remove a session row), re-show the
     batch table, ask again.
   - **yes** — create the approved loops (Pass 2), THEN commit this batch's watermark:
     ```
     node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js" --commit <sid1>,<sid2>,...
     ```
     Use the FULL session UUIDs from the `=== Session: <uuid> [<project>] ===` probe output headers — never the
     shortened prefix shown in the table (a prefix is absent from the pending watermark and `--commit` will reject it).
     Pass the session IDs of EVERY session in this batch (including sessions that yielded no loops — "reviewed-empty"
     still advances their watermark so they don't re-surface).
4. Continue to the next batch until all batches are processed.

Session-level rows (per batch):

| Session               | What it was about             | Open loops? | Count |
| --------------------- | ----------------------------- | ----------- | ----- |
| `<session_id_prefix>` | `<ai-title or agent summary>` | yes / no    | N     |

Per-loop rows (per batch, for sessions with loops):

| Loop                             | Proposed placement                                                |
| -------------------------------- | ----------------------------------------------------------------- |
| `<abstractive loop description>` | MATCH: `<project>` / INFER+CREATE: `<project>` / Inbox (fallback) |

If the probe returned zero new sessions, report "Nothing new since the last run." and stop.

### Pass 2 — Execute (after approval only)

For each approved loop, create the task via `omnifocus_write`:

```jsonc
{
  "mutation": {
    "operation": "create",
    "target": "task",
    "data": {
      "name": "<abstractive loop description — one line>",
      "note": "<context: originating session, what was left unresolved, relevant detail>",
      "tags": ["archaeology"],
      // Do NOT add: agent-okay, capture-live, review-output, review-capture, or any other tag.
      // The funnel auto-stamps agent-okay when role=agent and lineage is present.
      "lineage": { "sessionId": "<originating session_id from the probe output>" },
      // Include "project" only for MATCH and INFER placements.
      // Omit "project" entirely for LEAVE/inbox-fallback (no project key → inbox, ARCH-03).
    },
  },
}
```

Key server behaviors triggered (verified against `OmniFocusWriteTool.ts`):

- The `lineage` param auto-appends `of-mcp:lineage` to the task note (the dedup backbone for future scans, LINE-01).
- When `role=agent`, the funnel auto-appends `agent-okay` to `data.tags`. Pass only `archaeology`; do NOT pass
  `agent-okay` explicitly (D-05).
- No `project` key → inbox fallback (ARCH-03, DISC-CAPTURE-01).
- The write-verifier fires automatically; do not call it.
- The `archaeology` tag is auto-created if absent (OmniJS `addTag` find-or-create via the tag builder).

**INFER placement:** before creating the task, check whether the `omnifocus-project` target already exists in the
active-projects list from Step 4. If it does, treat it as MATCH and file directly (no duplicate project). If it does
not, first create the project:

```jsonc
{
  "mutation": {
    "operation": "create",
    "target": "project",
    "data": {
      "name": "<omnifocus-project value>",
      "folder": "<omnifocus-folder value>", // omit if no omnifocus-folder
    },
  },
}
```

Then file the task into the newly created project.

Collect a per-loop result. Capture errors without aborting the batch — if one create fails, continue with the remaining
loops and report the failure.

### Pass 3 — Report

Print one summary line:

**N created · M matched · K inferred+created · J inbox (fallback) · S sessions skipped as already-extracted · E errors**

List each error with the loop name and the MCP error message. If any INFER project creates occurred, list them by name.

## Vault Signal Read

The agent reads `~/vaults/jess-os/` directly with `Grep` / `Read` — no MCP layer.

- Grep the vault: `grep -r "omnifocus-project:" ~/vaults/jess-os/ --include="*.md" -l`
- For each matching file, read its YAML frontmatter (the block between the leading `---` delimiters) and extract:
  - `omnifocus-project:` — the target project name in OmniFocus (required).
  - `omnifocus-folder:` — the folder for project-create (optional; a leaf name or colon-separated path like
    `Work : Projects`; omit means root).
- The note's title (first H1 or the filename) is the **topic** used for the semantic loop → note match.
- If a file's frontmatter is malformed or has no `omnifocus-project`, skip it and continue.

If no vault notes carry `omnifocus-project`, every loop without a direct project match falls to LEAVE/inbox. State this
plainly in the Step 5 table.

## Tool call reference

| Goal                                                    | Call shape                                                                                                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-filter + group by session                           | `node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js"` (scan; absolute path) — emits NEW `{ session_id, timestamp, role, text }` records grouped by session, newest-first |
| Commit a batch's watermark (after `yes`/reviewed-empty) | `node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js" --commit <sid,sid,…>`                                                                                               |
| Dedup read — active archaeology tasks                   | `omnifocus_read` `type:"tasks"`, `filters.tags.all:["archaeology"]`, `details:true`                                                                                                      |
| Dedup read — completed archaeology tasks                | `omnifocus_read` `type:"tasks"`, `filters.tags.all:["archaeology"]`, `filters.status:"completed"`, `details:true`                                                                        |
| Active projects with notes                              | `omnifocus_read` `type:"projects"`, `filters.status:"active"`, `fields:["id","name","folderPath","note"]`                                                                                |
| Create task (MATCH / INFER / LEAVE)                     | `omnifocus_write` `operation:"create"`, `target:"task"`, `data:{ name, note, tags:["archaeology"], lineage:{ sessionId }, project?:<name> }`                                             |
| Create project (INFER branch only)                      | `omnifocus_write` `operation:"create"`, `target:"project"`, `data:{ name:<omnifocus-project>, folder?:<omnifocus-folder> }`                                                              |

Notes that matter:

- `omnifocus_read` takes `{ query: {…} }`; `omnifocus_write` takes `{ mutation: {…} }`.
- Mind the write shape: **create** has no `id` and puts the new entity's fields in `data`.
- `details:true` is mandatory on both dedup reads — notes truncate to 200 chars without it, losing the lineage block at
  note-end.
- The write-verifier fires automatically for every agent write. Do not call it explicitly.
- OmniFocus queries can take 10+ seconds. Expect latency; do not retry on slowness alone.
- The `lineage` param is the dedup backbone. Every task must carry it so future scans can suppress its session.

## Out of scope

- **Phase 6 JessOS perspective filtering on `archaeology`** — producing `archaeology`-tagged tasks is this phase's goal;
  surfacing them in a dedicated perspective is Phase 6.
- **n8n 15-minute polling (TRIG-02)** — this skill is on-demand only. Scheduled polling is deferred.
- **Hybrid per-loop dedup key (D-08)** — dedup granularity is session-level in v1. A per-loop key (checking whether this
  specific loop was already extracted even if the session had others) is deferred.
- **`archaeology` tag on live captures** — the boundary is absolute: `capture-live-blocker` never adds `archaeology`;
  this skill never adds `capture-live`. They are inverse paths over the same write funnel.
- **Background / no-prompt mode** — this skill requires a live interactive session. The gate cannot render in background
  mode.
- **Bulk auto-create without consent** — ARCH-02 forbids it. The gate is mandatory; the skill never writes before `yes`.

## Common mistakes

| Mistake                                                        | Fix                                                                                                                                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chaining `route-inbox-to-projects` for placement proposals     | That skill fires its own `yes / edit / abort` gate (Pitfall 1 — double gate, violates D-06). Follow the routing ladder inline as documented above.                         |
| Keeping all `user` lines from the transcript                   | 87% of `user` lines are `tool_result`-only echoes. Use `node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js"` — do not re-implement the filter rule inline. |
| Dedup read without `details:true`                              | The `of-mcp:lineage` block lives at note-end; a 200-char truncated note silently drops it. The dedup set becomes empty and every session re-surfaces (Pitfall 3).          |
| Passing `agent-okay` explicitly in `data.tags`                 | The funnel auto-stamps `agent-okay` when `role=agent` and `lineage` is present. Pass only `["archaeology"]`.                                                               |
| Pasting raw transcript text verbatim into task name or note    | Transcripts may carry secrets or PII (T-05-06). Loop extraction is abstractive — describe in your own words.                                                               |
| Filtering transcripts by file mtime                            | D-02 forbids it — mtime drifts hours-to-days from content date. The probe uses per-message ISO `timestamp` only.                                                           |
| Using `AskUserQuestion` for the approval gate                  | D-04a mandates plain-text reply (`yes / edit / abort`). No `AskUserQuestion`.                                                                                              |
| Creating a project without checking existence                  | The INFER branch must check the active-projects list from Step 4 before calling create, or it will make duplicate projects.                                                |
| Applying a second approval gate                                | There is exactly one gate per batch (Step 5). Do not add a second "Are you sure?" after `yes`.                                                                             |
| Committing the watermark on abort, or before tasks are created | Only `--commit` a batch AFTER `yes` (tasks created) or reviewed-empty. Never on abort/stop — uncommitted batches must re-surface.                                          |
| Assigning tags via JXA `task.addTags()`                        | JXA tag assignment silently no-ops. Use `omnifocus_write` with the `tags` field in `data` — the funnel routes through OmniJS `addTag` find-or-create.                      |
