# Phase 4: Review Loops & Live Auto-Capture - Pattern Map

**Mapped:** 2026-06-15 **Files analyzed:** 5 (1 modify, 1-2 create skill, 3 create test) **Analogs found:** 5 / 5 (all
exact — this is a reuse-heavy phase; every artifact has a shipped precedent)

This phase adds zero new server capability. The change set is: register tag names in one allowlist constant, author one
skill, and add three test specs. Every analog below is a real shipped file in this repo.

## File Classification

| New/Modified File                                                                              | Role                        | Data Flow                             | Closest Analog                                                                                                                     | Match Quality                                                            |
| ---------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/contracts/ast/mutation-script-builder.ts` (MODIFY: extend `FUNCTIONAL_TAG_ALLOWLIST`)     | config / allowlist constant | transform (write-guard)               | itself — the `routing-unplaced` add in Phase 3 (same file, same const)                                                             | exact                                                                    |
| `.claude/skills/capture-live-blocker/SKILL.md` (CREATE)                                        | skill prompt                | event-driven (in-session trigger)     | `.claude/skills/route-inbox-to-projects/SKILL.md`                                                                                  | exact (structure); role-match (trigger model differs — passive vs batch) |
| `tests/unit/contracts/ast/mutation-script-builder.test.ts` (MODIFY: extend allowlist describe) | unit test                   | request-response (pure fn)            | itself — `describe('FUNCTIONAL_TAG_ALLOWLIST / isTestTagAllowed (Phase 3 routing-unplaced — D-12)')`                               | exact                                                                    |
| `tests/integration/tools/unified/<review-tag>.test.ts` (CREATE)                                | integration test            | CRUD round-trip                       | `tests/integration/tools/unified/field-roundtrip.test.ts`                                                                          | exact                                                                    |
| `tests/integration/tools/unified/<live-capture>.test.ts` (CREATE, or extend end-to-end)        | integration test            | event-driven (agent create + lineage) | `tests/integration/tools/unified/end-to-end.test.ts` → `describe('Phase 2 D-08b — agent create with lineage stamps agent-ok tag')` | exact                                                                    |

## Pattern Assignments

### `src/contracts/ast/mutation-script-builder.ts` — extend `FUNCTIONAL_TAG_ALLOWLIST` (config, transform)

**Analog:** itself. This is the exact constant Phase 3 extended to add `routing-unplaced`. Follow that precedent: add
the three new names to the array literal, do NOT touch `isTestTagAllowed` (it already reads the array).

**Current allowlist literal + guard (stable anchors `FUNCTIONAL_TAG_ALLOWLIST`, `isTestTagAllowed`,
`TEST_TAG_PREFIX`):**

```typescript
export const FUNCTIONAL_TAG_ALLOWLIST: readonly string[] = ['agent-ok', 'routing-unplaced'];

/** A tag is allowed in test mode if it is sandbox-prefixed OR a known functional tag. */
export function isTestTagAllowed(tag: string): boolean {
  return tag.startsWith(TEST_TAG_PREFIX) || FUNCTIONAL_TAG_ALLOWLIST.includes(tag);
}
```

**Change to make (the only source edit in the phase):**

```typescript
export const FUNCTIONAL_TAG_ALLOWLIST: readonly string[] = [
  'agent-ok',
  'routing-unplaced',
  'review-output', // Phase 4 D-01/D-02
  'review-capture', // Phase 4 D-01/D-02
  'capture-live', // Phase 4 D-10 live-capture marker — planner's final name (research recommends `capture-live`; `review-live` is the alternative)
];
```

**Doc-comment convention:** the JSDoc block above the const explains why each functional tag is exempt (cites the
phase + decision it serves). Extend it with one sentence per new tag, mirroring the existing `agent-ok` /
`routing-unplaced` sentences. Stable anchor: the block begins `Functional/system tags the product legitimately applies`.

**`isTestTagAllowed` usage sites (no change needed — confirms the allowlist is the single control point):** the guard is
called at three places in this file when validating create/update/batch tag mutations
(`data.tags.filter((t) => !isTestTagAllowed(t))` and `allTags.filter((t) => !isTestTagAllowed(t))`). Adding a name to
the array is sufficient; no call-site edits.

**Dual-schema note (Pitfall 3):** no Zod / `inputSchema` change is required — `flagged`, `plannedDate`, `addTags`,
`tags`, `note`, `lineage` already exist in the write schema. Adding allowlist strings is not a schema change.

---

### `.claude/skills/capture-live-blocker/SKILL.md` (skill prompt, event-driven)

**Analog:** `.claude/skills/route-inbox-to-projects/SKILL.md` (full structure). Secondary:
`~/.claude/skills/sync-work-tasks-to-omnifocus/SKILL.md` (frontmatter shape only — it lives in the user-level home dir;
the new skill goes in the repo at `.claude/skills/`).

**Frontmatter shape** (from `route-inbox-to-projects/SKILL.md` — kebab-case `name` matching the dir; `description`
starts "Use when Jess…" and enumerates trigger phrases):

```yaml
---
name: capture-live-blocker
description:
  Use when, mid live Claude Code session, the agent hits a concrete blocker, an unresolvable open
  question, or a "TODO later" it should not lose — captures that single item into the OmniFocus inbox
  in real time, with permission. Conservative: fires rarely, single-item, in the moment.
---
```

Note the trigger model difference (Discretion #3): the route skill activates on a user utterance ("route my inbox");
this skill activates on the agent _noticing_ a blocker. Keep the `description` keyed on that noticing surface — that is
why it is a standalone skill, not folded into a batch loop.

**Section skeleton to copy from the route skill (same order):** Overview (cite D-08/D-09/D-10/D-11 + "OmniFocus is
canonical" + "adds no server code, drives `omnifocus_write`") → Idempotency note (re-noticing the same blocker must not
double-create — agent judgment, not server dedup) → Permission rendering (PERM-02) → Tool call reference table → Out of
scope → Common mistakes table.

**MCP `omnifocus_write` invocation for the live inbox create with lineage + tags (D-10/D-11)** — mirrors the route
skill's tool-shape table and the verified create call in the D-08b integration test:

```jsonc
{
  "mutation": {
    "operation": "create",
    "target": "task",
    "data": {
      "name": "<concise blocker statement>",
      "note": "<context>",
      "tags": ["capture-live"], // live-capture marker; do NOT add archaeology, do NOT add review-*
      "lineage": { "sessionId": "<cc-session-uuid>" },
    },
  },
}
```

Key facts to state in the skill (verified against `OmniFocusWriteTool.ts` lineage block):

- No `project` key → defaults to inbox (DISC-CAPTURE-01).
- No `dueDate` / `deferDate` — a captured blocker is undated (D-05).
- The `lineage` param triggers two server behaviors automatically: the note gets the `of-mcp:lineage` stamp, AND when
  `role=agent` the funnel appends `agent-ok` to `data.tags`. The skill need not pass `agent-ok` itself; research Open
  Question #1 recommends passing `capture-live` explicitly and letting the funnel auto-stamp `agent-ok`.
- The write-verifier fires automatically — do not call it explicitly.

**PERM-02 prompt-rendering convention (D-09)** — from the route skill's live/interactive consent pattern and the
research gate excerpt. On a `POLICY_GATE_CAPTURE_CONFIRM` response from the funnel, present the proposed task to the
user (yes/no), honoring an existing owner allow-all-session grant. The funnel owns the verdict; the skill only renders
the prompt. Convention text to mirror (from the route skill's "always runs live and interactive (D-09)…
summarize-then-approve gate is the human consent layer"):

> On a `POLICY_GATE_CAPTURE_CONFIRM` response, show the proposed inbox task and ask "Capture this? (yes / no)". If the
> owner has already granted allow-all-this-session, skip the prompt and proceed. Never build a second permission
> mechanism.

**Common-mistakes table rows to carry over (from the route skill, adapted):** JXA `task.addTags()` no-op → use
`omnifocus_write`; adding `archaeology` (Phase 5 — never on a live capture); inventing a date (use no date, not a due
date); skipping the permission prompt; treating a 10+ second OmniFocus response as an error.

---

### `tests/unit/contracts/ast/mutation-script-builder.test.ts` — extend allowlist describe (unit, request-response)

**Analog:** itself — the existing `FUNCTIONAL_TAG_ALLOWLIST / isTestTagAllowed` describe block (Phase 3 D-12). Add cases
for the three new tags in the same shape.

**Exact existing block to extend (stable anchor:
`describe('FUNCTIONAL_TAG_ALLOWLIST / isTestTagAllowed (Phase 3 routing-unplaced — D-12)')`):**

```typescript
describe('FUNCTIONAL_TAG_ALLOWLIST / isTestTagAllowed (Phase 3 routing-unplaced — D-12)', () => {
  it('allows routing-unplaced (Phase 3 marker tag) in test mode', () => {
    expect(FUNCTIONAL_TAG_ALLOWLIST).toContain('routing-unplaced');
    expect(isTestTagAllowed('routing-unplaced')).toBe(true);
  });

  it('still allows agent-ok (Phase 2 capture tag — regression guard)', () => {
    expect(FUNCTIONAL_TAG_ALLOWLIST).toContain('agent-ok');
    expect(isTestTagAllowed('agent-ok')).toBe(true);
  });

  it('rejects an arbitrary non-allowlisted tag', () => {
    expect(isTestTagAllowed('some-random-tag')).toBe(false);
  });
  // ... __test- prefix case ...
});
```

**Imports already present** (top of file): `FUNCTIONAL_TAG_ALLOWLIST`, `isTestTagAllowed` are imported alongside the
builders — no new import needed.

**New cases to add (one per tag, copying the `routing-unplaced` row verbatim with the new name):**

```typescript
it('allows review-output (Phase 4 review tag) in test mode', () => {
  expect(FUNCTIONAL_TAG_ALLOWLIST).toContain('review-output');
  expect(isTestTagAllowed('review-output')).toBe(true);
});
it('allows review-capture (Phase 4 review tag) in test mode', () => {
  expect(FUNCTIONAL_TAG_ALLOWLIST).toContain('review-capture');
  expect(isTestTagAllowed('review-capture')).toBe(true);
});
it('allows the live-capture marker (Phase 4 D-10) in test mode', () => {
  expect(FUNCTIONAL_TAG_ALLOWLIST).toContain('capture-live');
  expect(isTestTagAllowed('capture-live')).toBe(true);
});
```

---

### `tests/integration/tools/unified/<review-tag>.test.ts` (integration, CRUD round-trip)

**Analog:** `tests/integration/tools/unified/field-roundtrip.test.ts`. Reuse its harness exactly — no new
conftest/fixtures (research Wave 0 note).

**Harness imports (stable anchors — copy verbatim):**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { expectOk } from '../../helpers/expect-ok.js';
import { assertFieldPersisted } from '../../helpers/assert-field-persisted.js';
import { SANDBOX_FOLDER_NAME, ensureSandboxFolder, fullCleanup } from '../../helpers/sandbox-manager.js';
import { runScopedName, runScopedTag } from '../../helpers/run-id.js';
```

**Core round-trip pattern (`assertFieldPersisted` driver, from the `task scalar fields` describe):**

```typescript
await assertFieldPersisted(client, {
  readTool: 'omnifocus_read',
  readParams: taskQuery(id, row.readFields),
  extract: (r) => row.extract(findTask(r, id)),
  expected: row.expected,
  context: `task.${row.field} (${row.op})`,
});
```

**Row shapes to copy for the REVIEW-01 (review-capture, active) case** — combine the existing `flagged`, `plannedDate`,
and `tags` rows into one update on an active task (D-04: flag + plannedDate=today + `review-capture`):

```typescript
// flagged row (existing analog)
{ field: 'flagged', op: 'create', setValue: true, readFields: ['flagged'], extract: (t) => t?.flagged, expected: true },
// plannedDate row (existing analog — epoch comparison via field-comparator ±60s tolerance)
{ field: 'plannedDate', op: 'create', setValue: TEST_DATETIME, readFields: ['plannedDate'],
  extract: (t) => (t?.plannedDate ? new Date(t.plannedDate).getTime() : t?.plannedDate), expected: TEST_DATETIME_EPOCH },
// tags row (existing analog — bridge-applied, the silent-fail class OMN-61 guards)
{ field: 'tags', op: 'create', setValue: ['review-capture'], readFields: ['tags'], extract: (t) => t?.tags, expected: ['review-capture'] },
```

**REVIEW-01 completed branch (review-output tag only):** create a task, complete it, then `addTags: ['review-output']`,
and assert the tag reads back (per Discretion #2 — completed work gets the tag, not flag/plannedDate). Use the same
`assertFieldPersisted` shape with `readFields: ['tags']`, `extract: (t) => t?.tags`, `expected: ['review-output']`.

**Cleanup:** the harness `afterAll` calls `fullCleanup` and asserts zero errors
(`expect(report.errors, ...).toHaveLength(0)`). Reuse it; self-clean every created task.

---

### `tests/integration/tools/unified/<live-capture>.test.ts` (integration, event-driven) — or extend end-to-end

**Analog:** `tests/integration/tools/unified/end-to-end.test.ts` →
`describe('Phase 2 D-08b — agent create with lineage stamps agent-ok tag')`. This is the live-capture harness: it spawns
an **agent-role** server, creates with `lineage`, and reads back through the `agent-ok` tag filter. Extend it (add a
`capture-live` case asserting `agent-ok` present + `archaeology` absent) rather than rebuild.

**Agent-role server spawn (stable anchor — the key difference from the round-trip harness; forces real capture path):**

```typescript
agentServerProcess = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, OMNIFOCUS_MCP_ROLE: 'agent' }, // exercises lineage-attestation bypass + agent-ok stamp
});
```

**Run-id scoped name (stable anchor `runScopedName`):**

```typescript
const lineageTaskName = runScopedName('phase2-lineage-tag'); // Phase 4: runScopedName('phase4-live-capture')
```

**Create-with-lineage call (verified shape — add `tags: ['capture-live']` for the Phase 4 case):**

```typescript
params: {
  name: 'omnifocus_write',
  arguments: {
    mutation: {
      operation: 'create', target: 'task',
      data: {
        name: lineageTaskName,
        tags: ['capture-live'],                       // Phase 4 LIVE-01 marker
        lineage: { sessionId: 'integration-test-session' },
      },
    },
  },
}
```

**Read-back + assertions (the D-08b proof, extended for Phase 4):**

```typescript
// read back through the agent-ok tag filter
filters: { tags: { all: ['agent-ok'] } }, fields: ['name', 'tags', 'note'], limit: 200,
// ...
const task = (readParsed.data?.tasks ?? []).find((t) => t.name === lineageTaskName);
expect(task.tags).toContain('agent-ok');           // funnel auto-stamp fired
expect(task.note).toContain('of-mcp:lineage');       // lineage stamp persisted
// Phase 4 additions:
expect(task.tags).toContain('capture-live');         // live marker applied
expect(task.tags).not.toContain('archaeology');      // D-08/D-10: live capture stays distinct from Phase 5
// inbox placement: assert no project — the create passed no `project`, so it lands in inbox (DISC-CAPTURE-01)
```

**Self-cleaning:** the analog deletes the created task in a `finally` block via an `omnifocus_write` delete. Copy that
pattern.

## Shared Patterns

### Tag assignment — OmniJS `addTag` find-or-create (D-03)

**Source:** `src/contracts/ast/mutation-script-builder.ts` (update-task tag block) and
`src/contracts/ast/tag-mutation-script-builder.ts`. **Apply to:** every `review-*` and live-marker tag write. The skill
and tests apply tags via `omnifocus_write` `addTags` / `tags` — never JXA. The server resolves the Tag object
internally:

```javascript
function resolveTag(tagName, create) {
  var found = flattenedTags.find((t) => t.name === tagName);
  if (!found && create) found = new Tag(tagName, null); // find-or-create
  return found;
}
if (changes.addTags) {
  for (const tagName of changes.addTags) {
    var tag = resolveTag(tagName, true);
    if (tag) task.addTag(tag); // OmniJS addTag (DISC-TAG-01/02)
  }
}
```

### Surfacing setters — flagged + plannedDate (D-04)

**Source:** `src/contracts/ast/mutation-script-builder.ts` (update-task). **Apply to:** the review-capture update path.
Both already exist; Phase 4 adds zero builder code:

```javascript
if (changes.flagged !== undefined) task.flagged = changes.flagged;
if (changes.plannedDate !== undefined) {
  task.plannedDate = changes.plannedDate ? new Date(changes.plannedDate) : null;
}
```

### Lineage stamp + agent-ok auto-stamp (D-10/D-11)

**Source:** `src/tools/unified/OmniFocusWriteTool.ts` (lineage block). **Apply to:** the live-capture create (the skill
passes `lineage`; the funnel does the rest):

```typescript
if (compiled.operation === 'create' && compiled.target === 'task' && args.mutation.operation === 'create') {
  const lineage = (args.mutation.data as { lineage?: LineageInput }).lineage;
  if (lineage) {
    compiled.data.note = composeLineageStamp(compiled.data.note, lineage);
    if (parseRole() === 'agent') {
      compiled.data.tags = [...(compiled.data.tags ?? []), 'agent-ok']; // auto-stamp
    }
  }
}
```

### PERM-02 gate + session-grant bypass (D-09)

**Source:** `src/tools/unified/OmniFocusWriteTool.ts` (gate handling), `src/auth/session-state.ts`
(`isAllowedAllThisSession` / owner-only `setAllowAllThisSession`), `src/auth/role-resolver.ts` (`parseMode`). **Apply
to:** the live-capture skill's prompt rendering. The funnel owns the verdict; the skill only renders. A live session
(`OMNIFOCUS_MCP_INTERACTIVE=true`) makes `parseMode()` return `interactive`, so an agent create returns
`POLICY_GATE_CAPTURE_CONFIRM`:

```typescript
if (outcome === 'gate') {
  if (isAllowedAllThisSession()) {
    continue;
  } // owner allow-all-session bypass
  const mode = parseMode(); // 'interactive' | 'background'
  if (item.operation === 'create' && mode === 'interactive') {
    return /* POLICY_GATE_CAPTURE_CONFIRM — agent renders the yes/no prompt */;
  }
}
```

### Write-verifier round-trip confirmation

**Source:** `src/tools/unified/verifier/` (`field-comparator.ts` has the ±60s date tolerance; `plannedDate` is in
`DATE_FIELDS`). **Apply to:** all Phase 4 writes — fires automatically through the funnel for every agent-role write.
Tests confirm persistence with `assertFieldPersisted`; neither the skill nor the tests call the verifier explicitly.

## No Analog Found

None. Every Phase 4 artifact maps to a shipped precedent. This is the most reuse-heavy phase in the milestone.

## Metadata

**Analog search scope:** `src/contracts/ast/`, `src/tools/unified/` (+ verifier), `src/auth/`, `.claude/skills/`,
`~/.claude/skills/`, `tests/unit/contracts/ast/`, `tests/integration/tools/unified/`, `tests/integration/tools/`.
**Files scanned:** ~12 (read in full or targeted ranges). **Pattern extraction date:** 2026-06-15
