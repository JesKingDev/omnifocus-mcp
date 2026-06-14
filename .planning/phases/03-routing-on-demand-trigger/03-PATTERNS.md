# Phase 3: Routing & On-Demand Trigger — Pattern Map

**Mapped:** 2026-06-14 **Files analyzed:** 6 new/modified files **Analogs found:** 5 / 6 (1 agent-side skill has no
server-side analog — by design)

---

## File Classification

| New/Modified File                                       | Role                   | Data Flow        | Closest Analog                                                              | Match Quality     |
| ------------------------------------------------------- | ---------------------- | ---------------- | --------------------------------------------------------------------------- | ----------------- |
| `.claude/skills/route-inbox-to-projects/SKILL.md`       | skill (agent-side)     | request-response | `~/.claude/skills/sync-work-tasks-to-omnifocus/SKILL.md`                    | exact             |
| `src/tools/unified/OmniFocusReadTool.ts` (modify)       | tool / read projection | request-response | same file — add `note` to projects-with-notes projection                    | self-modification |
| `src/contracts/ast/mutation-script-builder.ts` (modify) | script builder         | CRUD             | same file — `moveTasks()` OmniJS block at lines 1441–1473                   | self-modification |
| `src/auth/operation-policy.ts` (confirm/modify)         | policy                 | request-response | same file — existing `move` dispatch confirm                                | self-modification |
| `src/tools/unified/verifier/WriteVerifier.ts` (reuse)   | verifier               | request-response | same file — `verify()` called on move/create results                        | reuse             |
| `src/contracts/ast/mutation-script-builder.ts` (modify) | script builder         | event-driven     | `src/contracts/ast/tag-mutation-script-builder.ts` — OmniJS `addTag` bridge | role-match        |

---

## Pattern Assignments

### `.claude/skills/route-inbox-to-projects/SKILL.md` (skill, request-response)

**Analog:** `~/.claude/skills/sync-work-tasks-to-omnifocus/SKILL.md`

This is the primary new artifact for Phase 3. The analog skill is the complete structural template.

**Frontmatter / registration pattern** (SKILL.md lines 1–3):

```markdown
---
name: route-inbox-to-projects
description:
  Use when Jess says "route my inbox", "process agent-okay items", "file inbox tasks", or "run routing" — triggers the
  on-demand routing loop that matches agent-okay inbox tasks to existing projects or creates new ones.
---
```

**Overview block structure** (analog lines 5–17): one-paragraph summary of direction + canonical account + constraint.
For Phase 3:

- Direction: `agent-okay` inbox items → matched/inferred project (or left with marker tag)
- No external account routing (pure OmniFocus + vault read)
- OmniFocus is canonical; JessOS vault provides the deterministic frontmatter signal

**Run shape — summarize-then-approve** (D-08). The analog has three linear passes (preflight → import → reconcile).
Phase 3 uses two:

- **Pass 1 — Plan:** read all `agent-okay` inbox items + active projects-with-notes + vault frontmatter map; produce a
  routing proposal table
- **Pass 2 — Execute (after user approval):** move matched/inferred items, create projects for infer branch, apply
  marker tag to left items

**Procedure section format** (analog lines 44–109): numbered passes with named substeps, idempotency notes, abort
conditions. Copy this shape for Pass 1 and Pass 2.

**Tool call reference table** (analog lines 135–145):

| Goal                               | Call shape                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Read `agent-okay` inbox items      | `omnifocus_read` `type:"tasks"`, `filters.tags.any:["agent-okay"]`, `filters.inInbox:true`, `details:true`  |
| Active projects with notes         | `omnifocus_read` `type:"projects"`, `filters.status:"active"`, `fields:["id","name","folderPath","note"]`   |
| File task to project (match/infer) | `omnifocus_write` `operation:"update"`, `target:"task"`, `data:{id:"<id>", project:"<project-name-or-id>"}` |
| Create project (infer branch)      | `omnifocus_write` `operation:"create"`, `target:"project"`, `data:{name:"<name>", folder:"<folder>"}`       |
| Apply marker tag (leave branch)    | `omnifocus_write` `operation:"update"`, `target:"task"`, `data:{id:"<id>", addTags:["routing-unplaced"]}`   |

**Common mistakes section** (analog lines 161–172): copy the table format; add Phase 3-specific pitfalls:

- Using `moveTasks()` API directly — the write tool `update` with `project` field is the correct MCP surface
- Skipping `details:true` when reading inbox items — note field gets truncated and vault-match context is lost
- Applying marker tag via JXA — must go through `omnifocus_write` `addTags` (JXA `task.addTags()` silently no-ops)
- Re-tagging already-marked items — check for existing `routing-unplaced` tag before applying (D-12: do not re-tag)

**Vault read section** (no analog — new pattern for D-03/D-05):

```markdown
## Vault Signal Read

The agent reads `~/vaults/jess-os/` directly using the `Read`/`Grep` tools (no MCP layer).

Grep for the `omnifocus-project` frontmatter key across the vault:

- Pattern: `grep -r "omnifocus-project:" ~/vaults/jess-os/ --include="*.md" -l`
- For each matching file, read its frontmatter to extract:
  - `omnifocus-project:` → target project name (deterministic)
  - `omnifocus-folder:` → folder for project-create (deterministic, optional)

If no vault notes carry `omnifocus-project`, all unmatched items fall to ROUTE-04 (leave). This is expected until the
user seeds the map.
```

**Confidence rules section** (D-01, Claude's Discretion — confidence wording):

```markdown
## Routing Decision Rules

For each `agent-okay` inbox item, apply this ladder in order:

1. **MATCH** — Project name clearly identifies this item's home (high confidence). File it there. Do not guess on
   ambiguous names.
2. **INFER** — No obvious project match, but a vault note's `omnifocus-project` field deterministically names the
   target. Create the project (if missing) and file there.
3. **LEAVE** — Cannot match and cannot infer. Leave the item in the inbox. Apply the `routing-unplaced` tag so skips are
   queryable (D-12). Do not tag if `routing-unplaced` already present (idempotent).

**Bias to leave.** When in doubt between MATCH and LEAVE, choose LEAVE. A misplaced task is harder to find than an inbox
item. The plan surface (Pass 1) lets the user correct a proposed routing before execution.
```

---

### `src/tools/unified/OmniFocusReadTool.ts` — projects-with-notes projection (D-02)

**Analog:** Same file. The `buildFilteredProjectsScript` call at line 665 + `projectFieldsOnResult` post-hoc projection
at line 698.

**Key finding:** `note` is already a supported project field. `DEFAULT_PROJECT_FIELDS` in `script-builder.ts` includes
`'note'` (line 1062). The projects query already returns notes when `fields` includes `'note'`, or when `details:true`
is passed through `buildFilteredProjectsScript`.

**No server-side code change needed for the basic projection.** The skill calls:

```
omnifocus_read({
  query: {
    type: "projects",
    filters: { status: "active" },
    fields: ["id", "name", "folderPath", "note"]
  }
})
```

**If a server-side projection is needed** (e.g., a dedicated `active_with_notes` mode), copy the existing
`buildFilteredProjectsScript` call pattern (lines 664–698):

```typescript
// Execute query using AST-powered script builder
const generatedScript = buildFilteredProjectsScript(projectFilter, {
  limit,
  includeStats,
  performanceMode: includeStats ? 'normal' : 'lite',
});

const result = await this.execJson(generatedScript.script);

// Post-hoc field projection (always applied for thin-by-default)
return projectFieldsOnResult(listResult, effectiveFields);
```

**Filters pattern** — `status: "active"` maps through `generateProjectFilterCode` in `script-builder.ts`. The generated
OmniJS checks `project.status === Project.Status.Active`.

---

### `src/contracts/ast/mutation-script-builder.ts` — `moveTasks()` for filing (D-11)

**Analog:** Same file, existing `moveTasks()` call in the `update` path (lines 1441–1473).

**The existing `update` operation with `project` field already dispatches `moveTasks()` via OmniJS bridge.** Phase 3
uses the existing `omnifocus_write` `update` surface — no new script builder function is needed for filing.

**Core moveTasks pattern** (lines 1452–1473) — this is what the write tool already executes when `changes.project` is
set:

```javascript
// Try by ID first, then by name
let project = Project.byIdentifier(changes.project);
if (!project) {
  project = flattenedProjects.find((p) => p.name === changes.project);
}
if (!project) {
  return JSON.stringify({
    error: true,
    message: 'Project not found: ' + changes.project,
  });
}
try {
  moveTasks([task], project.beginning);
} catch (e) {
  return JSON.stringify({
    error: true,
    message: 'Failed to move task to project: ' + String(e),
  });
}
```

**Policy confirmation for `update`:** `operation-policy.ts` line 64 — `update: 'allow'` — the funnel passes `moveTasks`
dispatch through without a gate. No policy change needed.

**Project create pattern** (policy already allows it — `create.project: 'allow'` at line 61):

```typescript
omnifocus_write({
  mutation: {
    operation: 'create',
    target: 'project',
    data: { name: '<project-name>', folder: '<folder-name>' },
  },
});
```

---

### `src/contracts/ast/mutation-script-builder.ts` — marker tag via OmniJS `addTag` (D-12)

**Analog:** `src/contracts/ast/tag-mutation-script-builder.ts` (OmniJS `addTag` bridge pattern) +
`mutation-script-builder.ts` lines 710–740 (capture-stamp tag assignment via `update` + `addTags`).

**Critical constraint:** JXA `task.addTags()` silently no-ops. Tag assignment MUST go through OmniJS `addTag()` inside
the bridge. The existing `update` path with `addTags` already does this correctly (lines 1538–1541):

```javascript
if (changes.addTags) {
  for (const tagName of changes.addTags) {
    const tag = flattenedTags.find((t) => t.name === tagName) || new Tag(tagName, null);
    if (tag) task.addTag(tag);
  }
}
```

**Phase 3 applies the marker tag via:**

```typescript
omnifocus_write({
  mutation: {
    operation: 'update',
    target: 'task',
    data: { id: '<task-id>', addTags: ['routing-unplaced'] },
  },
});
```

**Tag name decision (Claude's Discretion, D-12/D-13):** Use `routing-unplaced`. Rationale:

- Namespace `routing-*` is coherent with Phase 4's likely `review-*` namespace — they don't collide
- `unplaced` is descriptive (inbox item routing looked and couldn't place it)
- The tag is queryable: `omnifocus_read` `filters.tags.any:["routing-unplaced"]`
- Phase 4 REVIEW-_ tags will surface routed/unplaced items in a today view — the `routing-_` namespace lets Phase 4
  query it distinctly

**Sandbox guard:** `FUNCTIONAL_TAG_ALLOWLIST` (mutation-script-builder.ts line 71) currently contains `['agent-okay']`.
Add `'routing-unplaced'` to this list so integration tests can apply the marker tag without triggering the `__test-`
prefix guard.

---

### `src/tools/unified/verifier/WriteVerifier.ts` — write-verifier for move/create (D-10)

**Analog:** Same file. `WriteVerifier.verify()` (lines 98–160) is already called for all `omnifocus_write` mutations via
the funnel.

**No code change needed.** The verifier already handles `update` (which is the `moveTasks` path) and `create/project`.
The key pattern for Phase 3 awareness:

```typescript
// Step 4 — Collect affected ids.
let ids = extractAffectedIds(mutationResult);

// Step 5 — Batched read-back: chunk ids at VERIFY_READBACK_CHUNK_SIZE (200).
const chunks = chunkArray(ids, VERIFY_READBACK_CHUNK_SIZE);
for (const chunk of chunks) {
  const generated = buildTasksByIdSetScript(chunk);
  const raw = await this.execJson(generated.script);
  // ... diff fields against intent
}
```

**Verification applies automatically** when the skill calls `omnifocus_write` through the agent connection — the funnel
calls `WriteVerifier.verify()` on every mutation result. The agent skill does not need to invoke verification
explicitly.

**Owner role guard** (line 110): verification is skipped for `owner` role, applied for `agent` role. Phase 3's routing
runs as the agent role — verification is active.

---

## Shared Patterns

### Policy funnel — all write operations

**Source:** `src/tools/unified/OmniFocusWriteTool.ts` lines 399–528 (`executeValidated`) **Apply to:** All
`omnifocus_write` calls in the routing skill

The funnel pattern: `args → normalizeArgsToPolicy → decide(role, op, target) → allow | gate | deny`. All routing writes
(`update` for filing, `create/project`, `update` for marker tag) resolve to `allow` for the agent role. The skill calls
`omnifocus_write` normally — the funnel enforces policy server-side.

```typescript
// Funnel entry (called automatically for every omnifocus_write):
const outcome = decide(role, item.operation, item.target);
// update → 'allow'
// create/project → 'allow'
// create/task → 'gate' (not used in routing)
```

### OmniJS bridge pattern — all `moveTasks` and `addTag` calls

**Source:** `src/contracts/ast/mutation-script-builder.ts` (OmniJS bridge in `update` path) **Source:**
`src/contracts/ast/tag-mutation-script-builder.ts` (OmniJS `addTag` / `moveTags`) **Apply to:** Any new script builder
functions in Phase 3

Template: JXA outer script invokes `app.evaluateJavascript(omniJsSource)`. OmniJS has property access (not method
calls). `moveTasks([task], container)` and `task.addTag(tag)` are OmniJS-only.

```javascript
// JXA outer (method calls):
const result = app.evaluateJavascript(`
  (() => {
    // OmniJS inner (property access):
    const task = Task.byIdentifier('${taskId}');
    moveTasks([task], project.beginning);
    return JSON.stringify({ success: true });
  })()
`);
```

### Policy re-assertion in script builders (defense-in-depth)

**Source:** `src/contracts/ast/mutation-script-builder.ts` lines 43–48 **Source:**
`src/contracts/ast/tag-mutation-script-builder.ts` lines 30–35 **Apply to:** Any new script builder functions added for
Phase 3

```typescript
function assertPolicyAllow(role: Role, operation: string, target: string): void {
  const outcome = decide(role, operation, target);
  if (outcome !== 'allow') {
    throw new Error(`POLICY: ${outcome.toUpperCase()} ${operation}/${target} for role '${role}'`);
  }
}
```

### Test sandbox guard for functional tags

**Source:** `src/contracts/ast/mutation-script-builder.ts` lines 60–76 **Apply to:** When adding `routing-unplaced` to
`FUNCTIONAL_TAG_ALLOWLIST`

```typescript
export const FUNCTIONAL_TAG_ALLOWLIST: readonly string[] = ['agent-okay'];
// Phase 3: extend to ['agent-okay', 'routing-unplaced']

export function isTestTagAllowed(tag: string): boolean {
  return tag.startsWith(TEST_TAG_PREFIX) || FUNCTIONAL_TAG_ALLOWLIST.includes(tag);
}
```

---

## No Analog Found

| File                                                | Role    | Data Flow | Reason                                                                                                                                                                                  |
| --------------------------------------------------- | ------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vault frontmatter reader (agent-side, inside skill) | utility | file-I/O  | No existing vault-grep utility; agent reads `~/vaults/jess-os/` directly via `Grep` / `Read` tools — no MCP layer (D-05). Pure agent-side reads have no server analog in this codebase. |

---

## Metadata

**Analog search scope:** `src/tools/unified/`, `src/contracts/ast/`, `src/auth/`,
`~/.claude/skills/sync-work-tasks-to-omnifocus/` **Files scanned:** 7 source files + 1 skill file **Pattern extraction
date:** 2026-06-14
