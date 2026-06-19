---
name: route-inbox-to-projects
description:
  Use when Jess says "route my inbox", "process agent-ok items", "file inbox tasks", "run routing", or "route inbox
  items" — runs the on-demand routing loop that files agent-ok inbox tasks into matching projects, creates projects for
  vault-inferred items, or leaves the rest marked for later review.
---

# Route Inbox → Projects

## Overview

On-demand routing of **agent-ok** OmniFocus inbox items into their proper home. Each item is matched to an existing
active project (ROUTE-01), inferred from the JessOS vault and filed into a newly-created project (ROUTE-02 / ROUTE-03),
or left in the inbox with a durable `routing-unplaced` marker tag (ROUTE-04). OmniFocus is canonical. The JessOS vault
(`~/vaults/jess-os/`) supplies deterministic routing signals through `omnifocus-project` / `omnifocus-folder`
frontmatter (D-03). The agent is the routing brain (D-01); the server-side write funnel and write-verifier enforce
safety (D-10). This skill runs live and interactive (D-09): the Pass 1 summarize-then-approve gate is the human consent
layer (D-08), so no task is written before you approve the plan.

The skill is the manual trigger (TRIG-01). It adds no server code — it drives the established `omnifocus_read` /
`omnifocus_write` tool surfaces plus direct vault reads.

## Idempotency

- Already-filed items are excluded automatically by the `inInbox:true` filter — a re-run does not re-touch them.
- Items already tagged `routing-unplaced` are not re-tagged. Check for the tag before applying (D-12).
- A later run may re-evaluate `routing-unplaced` items if the vault map gained an `omnifocus-project` signal since last
  time. That is intended: seeding the vault is how a left item later gets routed.

## Procedure

Two passes, in order. Pass 1 plans and shows you a proposal; Pass 2 executes only after you approve.

### Pass 1 — Plan (read-only)

1. **Read agent-ok inbox items.** `omnifocus_read` `type:"tasks"`, `filters.tags.all:["agent-ok"]`,
   `filters.inInbox:true`, `details:true`. If zero items come back, report "Inbox has no agent-ok items. Nothing to
   route." and stop.
2. **Read active projects with notes.** `omnifocus_read` `type:"projects"`, `filters.status:"active"`,
   `fields:["id","name","folderPath","note"]`. Build a candidate set of `(id, name, folderPath, note)` tuples — this is
   the match space and the existence check for the infer branch.
3. **Read the vault frontmatter map.** Grep `~/vaults/jess-os/` for the `omnifocus-project:` key across `.md` files,
   then read each match's frontmatter (see **Vault Signal Read**). Build a map of `{topic, project, folder}` entries.
4. **Classify each inbox item** through the routing ladder (see **Routing Decision Rules**): assign MATCH (target
   project name + id), INFER (vault topic + `omnifocus-project` + `omnifocus-folder`), or LEAVE (with a reason).
5. **Show a routing proposal table.** Three columns — Item | Decision (MATCH / INFER+CREATE / LEAVE) | Target or Reason.
   Group by decision type and show a count per group. If the empty-vault case applies, say so here (see Routing Decision
   Rules).
6. **Ask for approval:** "Approve this plan? (yes / edit / abort)". Wait. On **abort**, stop with no writes. On
   **edit**, accept row-level corrections, then re-show the table. On **yes**, proceed to Pass 2.

### Pass 2 — Execute (after approval)

Process decisions in this order: MATCH first, INFER second, LEAVE last.

- **MATCH items.** File each via `omnifocus_write` update + `project` (use the project id or name from the Pass 1
  candidate set).
- **INFER items.** First check whether the `omnifocus-project` name already exists in the Pass 1 active-projects list.
  If it exists, treat it as a MATCH and file directly — do not create a duplicate. If it does not exist, create it via
  `omnifocus_write` create/project (`name` = `omnifocus-project`, `folder` = `omnifocus-folder`, or omit the folder key
  when absent so it lands at root), then file the task into the new project.
- **LEAVE items.** Check whether the task already carries `routing-unplaced` (use Pass 1 data or a read-back). If
  already tagged, skip and note it as "already marked". Otherwise apply the marker via `omnifocus_write` update +
  `addTags:["routing-unplaced"]`.

Collect a per-item result and capture any MCP errors without aborting the whole run.

### Pass 3 — Report

Print one summary line: **N filed · M created+filed · K left (J newly marked, L already marked) · E errors**. List each
error with the item name and the MCP error message. Remind the user: "`routing-unplaced` items will surface in a today
view in Phase 4."

## Routing Decision Rules

For each agent-ok inbox item, apply this ladder in order:

1. **MATCH** — A project name clearly identifies the item's home (high confidence). File it there. Do not guess on
   ambiguous names.
2. **INFER** — No obvious project match, but a vault note's `omnifocus-project` field deterministically names the
   target. Create the project (if missing) and file there. Matching the item to the right vault note is the semantic
   step (by the note's topic/title); once the note is identified, the `omnifocus-project` mapping is deterministic.
3. **LEAVE** — Cannot match and cannot infer. Leave the item in the inbox and apply `routing-unplaced` (idempotent — do
   not re-tag).

**Bias to leave.** When in doubt between MATCH and LEAVE, choose LEAVE. A misplaced task is harder to find than an inbox
item, and the Pass 1 proposal lets you correct a routing before it executes.

**Empty-vault case (D-06).** If no vault notes carry `omnifocus-project`, every item without a direct project match
falls to LEAVE. This is expected until the vault map is seeded — state it plainly in the Pass 1 proposal when it
happens.

## Vault Signal Read

The agent reads `~/vaults/jess-os/` directly with `Grep` / `Read` — no MCP layer (D-05).

- Grep the vault: `grep -r "omnifocus-project:" ~/vaults/jess-os/ --include="*.md" -l`.
- For each matching file, read its YAML frontmatter (the block between the leading `---` delimiters) and extract:
  - `omnifocus-project:` — the target project name in OmniFocus (required).
  - `omnifocus-folder:` — the folder for project-create (optional; a leaf name or a colon-separated path like
    `Work : Projects`; omit means root).
- The note's title (first H1 or the filename) is the **topic** used for the semantic item → note match (D-04).
- If a file's frontmatter is malformed or has no `omnifocus-project`, skip it and continue.

## Tool call reference

| Goal                                 | Call shape                                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read agent-ok inbox items            | `omnifocus_read` `type:"tasks"`, `filters.tags.all:["agent-ok"]`, `filters.inInbox:true`, `details:true`                                                               |
| Active projects with notes           | `omnifocus_read` `type:"projects"`, `filters.status:"active"`, `fields:["id","name","folderPath","note"]`                                                              |
| File task to project (MATCH / INFER) | `omnifocus_write` `operation:"update"`, `target:"task"`, `id:"<id>"`, `changes:{project:"<project-name-or-id>"}`                                                       |
| Create project (INFER branch)        | `omnifocus_write` `operation:"create"`, `target:"project"`, `data:{name:"<name>", folder:"<folder-name>"}` — omit the `folder` key when there is no `omnifocus-folder` |
| Apply marker tag (LEAVE branch)      | `omnifocus_write` `operation:"update"`, `target:"task"`, `id:"<id>"`, `changes:{addTags:["routing-unplaced"]}`                                                         |

Notes that matter:

- `omnifocus_read` takes `{query:{…}}`; `omnifocus_write` takes `{mutation:{…}}`.
- Mind the write shapes: **update** puts `id` at the top level of the mutation with the fields to change in a `changes`
  object (`{operation:"update", target:"task", id:"<id>", changes:{…}}`); **create** has no `id` and puts the new
  entity's fields in `data`. Do not nest `id` inside `changes`/`data` — the changes container is strict and rejects it.
- Default reads truncate task notes to 200 chars — pass `details:true` to get full notes for vault-match context.
- Project notes come back in full through the `fields:["note"]` projection — no truncation on the projects query.
- The write-verifier fires automatically for every agent-role write through the funnel. Do not call it explicitly.
- OmniFocus queries can take 10+ seconds. Expect latency; do not retry on slowness alone.
- Prefer filing by project name over id when both are known — the name survives a project being recreated.
- The agent cannot hard-delete. If a project-create fails with a policy error, report it and leave the task in the
  inbox.

## Out of scope

- Scheduled / automatic triggering (TRIG-02, deferred). This skill is on-demand only.
- Surfacing `routing-unplaced` items in a today view (Phase 4, REVIEW-\*).
- Seeding the vault frontmatter map — the user curates `omnifocus-project` / `omnifocus-folder` (D-06).
- Background / no-prompt mode — this skill always runs live and interactive (D-09).

## Common mistakes

| Mistake                                              | Fix                                                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Filing a task with JXA `moveTasks()` directly        | Use `omnifocus_write` update + `project` — it routes through the OmniJS bridge inside the funnel. Direct JXA bypasses the write-verifier. |
| Applying `routing-unplaced` via JXA `task.addTags()` | JXA tag assignment silently no-ops. Use `omnifocus_write` update + `addTags:["routing-unplaced"]`.                                        |
| Re-tagging an already-marked item                    | Check for an existing `routing-unplaced` tag first (Pass 1 data or a read-back). D-12: do not re-tag.                                     |
| Skipping `details:true` on the inbox read            | Task notes truncate to 200 chars without it, losing vault-match context.                                                                  |
| Treating a slow OmniFocus response as an error       | Queries can take 10+ seconds. Wait for the response; do not retry or abort on latency alone.                                              |
| Running in background mode                           | This skill requires live/interactive mode (D-09). The Pass 1 summarize-then-approve gate is the consent layer — do not skip it.           |
| Creating a project without checking existence        | The INFER branch must check the Pass 1 active-projects list before calling create, or it will make duplicate projects.                    |
| Treating `omnifocus-folder` as a full path/URL       | It is a leaf folder name or a colon-separated path (e.g. `Work` or `Work : Projects`), not a task/project URL.                            |

## Reporting tooling problems

If you hit a bug or limitation in this tooling, log it with the `omnifocus-feedback` skill (`/of-feedback`).
