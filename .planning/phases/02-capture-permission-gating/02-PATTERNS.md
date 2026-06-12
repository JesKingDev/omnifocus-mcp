# Phase 2: Capture & Permission Gating — Pattern Map

**Mapped:** 2026-06-12 **Files analyzed:** 13 (6 new, 7 modified) **Analogs found:** 13 / 13

---

## File Classification

| New / Modified File                                                                             | Role       | Data Flow        | Closest Analog                                                                 | Match Quality |
| ----------------------------------------------------------------------------------------------- | ---------- | ---------------- | ------------------------------------------------------------------------------ | ------------- |
| `tests/unit/contracts/ast/lineage-stamp.test.ts`                                                | test       | transform        | `tests/unit/contracts/ast/mutation-script-builder.test.ts`                     | exact         |
| `tests/unit/auth/agent-okay-predicate.test.ts`                                                  | test       | request-response | `tests/unit/contracts/ast/filter-coverage.test.ts`                             | exact         |
| `src/contracts/ast/` — `composeLineageStamp()` helper                                           | utility    | transform        | existing `note` setter in `mutation-script-builder.ts`                         | role-match    |
| `src/contracts/filters.ts` — `agentOkayPredicate()`                                             | utility    | request-response | `normalizeFilter()` + `TaskFilter` composition in `filters.ts`                 | exact         |
| `src/auth/role-resolver.ts` — `parseMode()` addition                                            | utility    | request-response | `parseRole()` in `src/auth/role-resolver.ts` (lines 43–45)                     | exact         |
| `src/auth/session-state.ts` — stdio session grant singleton                                     | utility    | request-response | `SessionConfig` interface in `src/session-manager.ts` (lines 17–31)            | role-match    |
| `src/auth/operation-policy.ts` — `create: 'allow'` → `'gate'`                                   | config     | request-response | existing `tag_manage.delete: 'gate'` row (lines 62–63)                         | exact         |
| `src/auth/role-resolver.ts` — mode field threading                                              | utility    | request-response | `resolveStdioIdentity()` in `role-resolver.ts` (lines 56–63)                   | exact         |
| `src/session-manager.ts` — `allowAllThisSession` field                                          | model      | request-response | existing `SessionConfig` fields + `principal` field (lines 17–31)              | exact         |
| `src/contracts/roles.ts` — add `mode` to `ResolvedContext`                                      | model      | request-response | existing `role: Role` field in `ResolvedContext` (lines 82–84)                 | exact         |
| `src/tools/unified/OmniFocusWriteTool.ts` — gate verdict dispatch + `lineage` inputSchema       | controller | request-response | existing `gate` block (lines 438–460) + `createDataProperties` (lines 210–226) | exact         |
| `src/tools/unified/schemas/write-schema.ts` — `LineageSchema` + `lineage` on `CreateDataSchema` | model      | request-response | `RepetitionRuleSchema.optional()` pattern (lines 18–58, 159)                   | exact         |
| `src/contracts/ast/mutation-script-builder.ts` — note composition point                         | utility    | transform        | existing `data.note` assignment in `buildTaskDataObject` (lines 2375)          | exact         |

---

## Pattern Assignments

### `src/auth/role-resolver.ts` — `parseMode()` addition (utility, request-response)

**Analog:** `src/auth/role-resolver.ts` — `parseRole()` at lines 43–45

**Why closest:** `parseMode()` is an identical literal-only, default-deny env parse that follows the exact same
anti-pattern constraints documented in the file header. D-05 explicitly says "mirrors `parseRole`."

**Imports pattern** (lines 30–31 — extend existing imports):

```typescript
import type { Role, RoleSource, ResolvedIdentity } from '../contracts/roles.js';
// Add: import type { Mode } from '../contracts/roles.js';  (after roles.ts is extended)
```

**Core pattern to mirror exactly** (lines 43–45):

```typescript
export function parseRole(env: Record<string, string | undefined> = process.env): Role {
  return env.OMNIFOCUS_MCP_ROLE === 'owner' ? 'owner' : 'agent';
}
```

New function must follow this shape exactly:

```typescript
export function parseMode(env: Record<string, string | undefined> = process.env): 'interactive' | 'background' {
  return env.OMNIFOCUS_MCP_INTERACTIVE === 'true' ? 'interactive' : 'background';
}
```

**Anti-patterns absent** (document in JSDoc, per the file header at lines 22–28):

- No `.toLowerCase()`, no `.trim()`, no truthy check, no `|| 'background'` fallback
- Only the exact literal `'true'` resolves to interactive

**Identity threading pattern** (lines 56–63 — add `mode` alongside `roleSource`):

```typescript
export function resolveStdioIdentity(env: Record<string, string | undefined> = process.env): ResolvedIdentity {
  const isExplicit = env.OMNIFOCUS_MCP_ROLE !== undefined && env.OMNIFOCUS_MCP_ROLE !== '';
  const roleSource: RoleSource = isExplicit ? 'explicit-env' : 'fail-safe-default';
  return {
    transport: 'stdio',
    roleSource,
    principal: null,
    // Phase 2: add mode here after roles.ts is extended
  };
}
```

---

### `src/contracts/roles.ts` — add `mode` to `ResolvedContext` (model, request-response)

**Analog:** existing `role: Role` field in `ResolvedContext` at lines 81–84

**Why closest:** `mode` is a connection-bound property with the same lifecycle as `role` — both are resolved at startup
from env, not from call args.

**Core pattern to extend** (lines 81–84):

```typescript
export interface ResolvedContext {
  identity: ResolvedIdentity;
  role: Role;
  // Phase 2: add:
  // mode: 'interactive' | 'background';
}
```

Add the union type definition near `Role` (lines 27–28) per the file's "extend here FIRST" instruction at the top.

---

### `src/auth/operation-policy.ts` — `create: 'allow'` → `'gate'` (config, request-response)

**Analog:** `tag_manage.delete: 'gate'` at lines 62–63

**Why closest:** This is an existing `gate` outcome in the same policy table. The change is a one-word substitution in
the identical table structure.

**Existing `gate` rows to mirror** (lines 60–63):

```typescript
tag_manage: {
  // gated (dry-run + owner approval required)
  delete: 'gate',
  merge: 'gate',
```

**Target row to change** (line 49):

```typescript
create: 'allow',   // ← change to 'gate'
```

**Critical sequencing note from RESEARCH.md:** This change immediately blocks all agent creates. Ship the
`allowAllThisSession` session-grant bypass in the same wave — the funnel must short-circuit to `allow` when the grant is
set before this table change is committed.

---

### `src/session-manager.ts` — `allowAllThisSession` field (model, request-response)

**Analog:** `principal: string | null` field in `SessionConfig` (lines 24–30)

**Why closest:** `allowAllThisSession` is another per-session boolean flag with the same forge-resistance requirement:
it lives in `SessionConfig` and can only be mutated by owner-authenticated code.

**Field pattern to extend** (lines 17–31):

```typescript
export interface SessionConfig {
  sessionId: string;
  transport: StreamableHTTPServerTransport;
  server: Server;
  createdAt: Date;
  lastActivity: Date;
  /**
   * Principal of the bearer token... (CR-01 guard)
   */
  principal: string | null;
  // Phase 2: add:
  // allowAllThisSession?: boolean;  — only owner-auth call may set this (D-02)
}
```

**Important gap from RESEARCH.md:** `SessionManager` is HTTP-only. The stdio path (the current default) has no
`SessionConfig` object. Add a separate `src/auth/session-state.ts` singleton for the stdio path (see that file's section
below).

---

### `src/auth/session-state.ts` — stdio session grant singleton (new, utility, request-response)

**Analog:** `SessionConfig.principal` ownership pattern in `src/session-manager.ts` (lines 24–30), plus the module-level
singleton pattern implicit in how `parseRole()` reads `process.env`

**Why closest:** For stdio, the grant must be module-level (single connection per process). The ownership invariant
(owner-only can set it) mirrors `SessionConfig`'s `principal` field constraint.

**Shape to implement:**

```typescript
// src/auth/session-state.ts
// Stdio mode: single-session process — module-level grant state (Pitfall 2, RESEARCH.md)
let _allowAllThisSession = false;

export function isAllowedAllThisSession(): boolean {
  return _allowAllThisSession;
}

export function setAllowAllThisSession(role: Role): void {
  if (role !== 'owner') {
    throw new Error('Only owner-authenticated callers may set session grant (D-02)');
  }
  _allowAllThisSession = true;
}

export function resetSessionGrant(): void {
  _allowAllThisSession = false; // for tests
}
```

Call `isAllowedAllThisSession()` from `OmniFocusWriteTool.executeValidated()` in the gate check path. No
`SessionManager` dependency.

---

### `src/tools/unified/OmniFocusWriteTool.ts` — gate verdict dispatch + `lineage` inputSchema (controller, request-response)

**Analog (gate handling):** existing `gate` block at lines 438–460

**Analog (inputSchema):** `createDataProperties` object at lines 210–226

**Why closest:** Phase 2 adds a new gate code (`POLICY_GATE_CAPTURE_CONFIRM`) that is a distinct branch from the
existing `POLICY_GATE_REQUIRES_OWNER` code in the same `if (outcome === 'gate')` block, and adds a `lineage` property to
`createDataProperties` in the existing inline object.

**Existing gate response to fork** (lines 438–460):

```typescript
if (outcome === 'gate') {
  return createErrorResponseV2(
    'omnifocus_write',
    'POLICY_GATE_REQUIRES_OWNER',
    'This structural operation requires owner approval before execution.',
    'Re-run from an owner connection using the ownerCommand below, or ask the owner to execute it.',
    {
      dryRun: true,
      preview: {
        wouldAffect: {
          operation: item.operation,
          target: item.target,
          note: 'Scope not computed in gate preview; merge/delete may affect many items.',
        },
      },
      ownerCommand: { mutation: args.mutation },
    },
    new OperationTimerV2().toMetadata(),
  );
}
```

New fork logic (insert before existing `gate` block, or replace it with mode-aware dispatch):

```typescript
if (outcome === 'gate') {
  // Check session grant first (covers both interactive and background modes)
  if (isAllowedAllThisSession()) {
    // Grant set — fall through to execution
  } else if (parseMode() === 'interactive' && item.operation === 'create') {
    // Interactive create gate — return structured verdict for agent UX prompt (PERM-02)
    return createErrorResponseV2(
      'omnifocus_write',
      'POLICY_GATE_CAPTURE_CONFIRM',
      'Creating a task requires confirmation in interactive mode.',
      'Call omnifocus_write again with the same args after the user confirms, or call the owner-grant endpoint first.',
      { dryRun: true, preview: { wouldAffect: { operation: item.operation, target: item.target } }, ownerCommand: { mutation: args.mutation } },
      new OperationTimerV2().toMetadata(),
    );
  } else {
    // Existing structural gate (tag_manage/delete, tag_manage/merge) or background create
    return createErrorResponseV2(
      'omnifocus_write',
      item.operation === 'create' ? 'POLICY_DENY' : 'POLICY_GATE_REQUIRES_OWNER',
      ...  // existing messages
    );
  }
}
```

**`lineage` inputSchema addition** — add to `createDataProperties` at line 226 (after `reviewInterval`):

```typescript
const createDataProperties: Record<string, unknown> = {
  // ... existing fields (lines 211–225) ...
  reviewInterval: { description: 'project-only: days or {steps,unit}' },
  // Phase 2: add:
  lineage: {
    type: 'object',
    description: 'Agent-origin provenance stamp (LINE-01). Server composes the note block.',
    properties: {
      sessionId: { type: 'string', description: 'Originating Claude Code session ID' },
      agent: { type: 'string', description: 'Agent identifier; defaults to "claude-code"' },
      createdAt: { type: 'string', description: 'ISO-8601 timestamp; defaults to server time' },
    },
    required: ['sessionId'],
  },
};
```

**Dual-schema rule:** Every `inputSchema` addition requires a matching Zod addition in `write-schema.ts`. See that
file's section below.

---

### `src/tools/unified/schemas/write-schema.ts` — `LineageSchema` + `lineage` on `CreateDataSchema` (model, request-response)

**Analog:** `RepetitionRuleSchema` optional nested object pattern (lines 18–58, used at line 159)

**Why closest:** `LineageSchema` is another optional nested object on `CreateDataSchema`, following the same
`strictObj()` + `.optional()` chain. The `SameKeys` guard at lines 12–13 documents how to add cross-schema sync guards.

**Pattern to replicate** (lines 18–53 for the schema shape; line 159 for the attachment):

```typescript
// RepetitionRuleSchema pattern (lines 18–53) — mirror this structure:
const RepetitionRuleSchema = z
  .object({ ... })
  .strict() satisfies z.ZodType<RepetitionRule, z.ZodTypeDef, unknown>;

// Applied as (line 159):
repetitionRule: RepetitionRuleSchema.optional(),
```

New `LineageSchema` to add before `CreateDataSchema`:

```typescript
// LineageSchema — provenance stamp for agent-created tasks (D-11, LINE-01)
// Uses strictObj() to reject unknown keys (OMN-97/98/99 pattern).
// Does NOT appear in TaskCreateData — consumed upstream in the funnel/compiler layer.
const LineageSchema = strictObj({
  sessionId: z.string(),
  agent: z.string().optional(),
  createdAt: z.string().optional(),
});

export type LineageInput = z.infer<typeof LineageSchema>;
```

Attach to `CreateDataSchema` as the last field (after `reviewInterval` at line 165):

```typescript
lineage: LineageSchema.optional(),
```

**Critical from RESEARCH.md Pitfall 3:** Do NOT add `lineage` to `TaskCreateData` in `mutations.ts`. The
`buildTaskDataObject()` exhaustiveness guard at line 2356 of `mutation-script-builder.ts` will produce a compile error
and silently embed `lineage` in the OmniJS script JSON. Process `lineage` upstream in the funnel and strip it before
passing `data` to `buildCreateTaskScript`.

---

### `src/contracts/ast/mutation-script-builder.ts` — note composition point (utility, transform)

**Analog:** `data.note` assignment in `buildTaskDataObject` at lines 2375, and `note: taskData.note || ''` embed at line
609

**Why closest:** The composition point is the moment `data.note` is finalized — right before `buildTaskDataObject(data)`
is called in `buildCreateTaskScript` at line 573. The verifier reads `op.data.note` from the compiled op's intent
snapshot; `composeLineageStamp()` must run before that snapshot is taken.

**Where `note` flows** (lines 569–609):

```typescript
export async function buildCreateTaskScript(data: TaskCreateData): Promise<GeneratedMutationScript> {
  await validateTaskCreate(data);
  const taskData = buildTaskDataObject(data);  // ← line 573: data.note consumed here
  const script = `...
    note: taskData.note || '',   // ← line 609: embedded in OmniJS script
  ...`;
```

**Composition rule (RESEARCH.md Pitfall 4):** Call `composeLineageStamp()` in `OmniFocusWriteTool.executeValidated()` or
the `MutationCompiler` _before_ the compiled `op.data.note` is set. The intent snapshot from `intent-extractor.ts:110`
reads from `op['data']['note']` — so `data.note` must already contain the full composed string (including the lineage
block) when the compiled op is handed to the verifier.

Do NOT compose inside `buildCreateTaskScript` — the verifier extracts intent before the script builder runs.

**`buildTaskDataObject` exhaustiveness guard** (lines 2353–2368 — the guard that must not include `lineage`):

```typescript
function buildTaskDataObject(data: TaskCreateData): Record<string, unknown> {
  // Exhaustiveness guard: compile error if TaskCreateData gains a field not listed here.
  const _allKeys: Record<keyof TaskCreateData, true> = {
    name: true,
    note: true,
    project: true,
    parentTaskId: true,
    tags: true,
    dueDate: true,
    deferDate: true,
    plannedDate: true,
    flagged: true,
    estimatedMinutes: true,
    repetitionRule: true,
  };
  void _allKeys;
  // ...
}
```

`lineage` must NOT appear in this guard object. Process it upstream and strip before calling
`buildCreateTaskScript(data)`.

---

### `composeLineageStamp()` helper — location: new module or `src/contracts/ast/mutation-script-builder.ts` (utility, transform)

**Analog:** the `note` setter pattern in `buildUpdateTaskScript` at line 1400
(`if (changes.note !== undefined) task.note = changes.note`) and the bridge nonce note manipulation at lines 639–642

**Why closest:** Both involve string mutation of the `note` field before embedding in the OmniJS script. The lineage
stamp follows the same composition-before-embed invariant.

**Canonical form from D-09/D-10** (RESEARCH.md Pattern 3):

```typescript
const LINEAGE_RE = /\n\n<!-- of-mcp:lineage\n.*?\n-->/s;

export function composeLineageStamp(
  userNote: string | undefined,
  lineage: { sessionId: string; agent?: string; createdAt?: string },
): string {
  const base = (userNote ?? '').replace(LINEAGE_RE, '').trimEnd();
  const payload = JSON.stringify({
    v: 1,
    agent: lineage.agent ?? 'claude-code',
    session: lineage.sessionId,
    created_at: lineage.createdAt ?? new Date().toISOString(),
  });
  const stamp = `\n\n<!-- of-mcp:lineage\n${payload}\n-->`;
  return base + stamp;
}
```

**Location decision for planner:** If added to `mutation-script-builder.ts`, place it in the `HELPERS` section near
line 2349. Alternatively, export from a new `src/contracts/ast/lineage.ts` and import in both the script builder and the
funnel. Either is fine; the planner should pick one and use it consistently.

**Idempotency requirement:** The `LINEAGE_RE` replace must strip any existing block before re-appending — this is the
on-update path (D-10). Test both the append case (create) and the strip-and-re-append case (update with lineage).

---

### `src/contracts/filters.ts` — `agentOkayPredicate()` helper (utility, request-response)

**Analog:** `normalizeFilter()` at lines 472–487 + `TaskFilter` interface fields `tags` (line 76), `tagsOperator` (line
77), `inInbox` (line 113)

**Why closest:** The predicate is a thin `TaskFilter` literal composition, directly using these three existing fields.
`normalizeFilter()` is the mandatory downstream consumer.

**Fields to compose** (lines 76–77, 113):

```typescript
export interface TaskFilter {
  tags?: string[];           // line 76
  tagsOperator?: TagOperator; // line 77: 'AND' | 'OR' | 'NOT_IN'
  inInbox?: boolean;         // line 113
```

**Pattern to implement:**

```typescript
// src/contracts/filters.ts — add after normalizeFilter()
// OR in a new src/contracts/agent-filters.ts

import { normalizeFilter, type NormalizedTaskFilter } from './filters.js';

/**
 * Returns a normalized filter that matches only agent-okay-tagged tasks.
 * Phase 2 scope: read-side predicate for PERM-01. Phase 3 routing consumes this.
 *
 * inInbox is omitted here so Phase 3 routing can apply the predicate to
 * non-inbox tasks too. Add inInbox: true only if Phase 2 tests need inbox-only
 * scope (planner's discretion per D-08).
 */
export function agentOkayPredicate(): NormalizedTaskFilter {
  return normalizeFilter({
    tags: ['agent-okay'],
    tagsOperator: 'AND',
  });
}
```

**Unit testability:** Because this returns a `NormalizedTaskFilter` (a plain object), tests can assert its shape without
any live OmniFocus connection. The filter-coverage test pattern at `tests/unit/contracts/ast/filter-coverage.test.ts` is
the model.

---

### `tests/unit/contracts/ast/lineage-stamp.test.ts` (new, test, transform)

**Analog:** `tests/unit/contracts/ast/mutation-script-builder.test.ts` (lines 1–16, 28–36)

**Why closest:** Same directory, same import style (`../../../../src/contracts/ast/...`), same `describe/it/expect`
structure for testing script builder helpers. The `note` inclusion test at lines 28–36 is the most direct predecessor.

**Imports pattern to mirror** (lines 1–15 of mutation-script-builder.test.ts):

```typescript
import { describe, it, expect } from 'vitest';
import { buildCreateTaskScript } from '../../../../src/contracts/ast/mutation-script-builder.js';
// Phase 2: also import composeLineageStamp from wherever it lands
```

**Test structure to mirror** (lines 28–36):

```typescript
it('includes note in task creation', async () => {
  const result = await buildCreateTaskScript({
    name: 'Task with Note',
    note: 'This is a detailed note',
  });
  expect(result.script).toContain('This is a detailed note');
});
```

New tests must cover per RESEARCH.md D-08 / validation table:

- `composeLineageStamp()` appends block after existing note with blank-line separator (LINE-01)
- `composeLineageStamp()` strips existing block before re-appending (idempotency, LINE-01)
- `composeLineageStamp()` with no user note produces just the stamp block
- The composed note round-trips through `buildCreateTaskScript` (script contains the stamp)

---

### `tests/unit/auth/agent-okay-predicate.test.ts` (new, test, request-response)

**Analog:** `tests/unit/contracts/ast/filter-coverage.test.ts` (lines 1–50)

**Why closest:** Same test pattern — imports a filter/compiler function, asserts the output shape without live
OmniFocus. The `TaskFilter` compilation tests in filter-coverage.test.ts are exactly the right model for asserting that
`agentOkayPredicate()` compiles correctly.

**Imports pattern to mirror** (lines 12–18 of filter-coverage.test.ts):

```typescript
import { describe, it, expect } from 'vitest';
import { buildAST } from '../../../../src/contracts/ast/builder.js';
import { emitOmniJS } from '../../../../src/contracts/ast/emitters/omnijs.js';
import type { TaskFilter } from '../../../../src/contracts/filters.js';
```

**Test structure to mirror** (lines 23–43):

```typescript
describe('QueryCompiler.transformFilters', () => {
  it('transforms dueDate.before to dueBefore', () => {
    const result = compiler.transformFilters({ ... });
    expect(result.dueBefore).toBe('2025-12-31');
  });
```

New tests must cover per RESEARCH.md D-08a:

- `agentOkayPredicate()` returns a filter with `tags: ['agent-okay']` and `tagsOperator: 'AND'`
- The predicate compiles via `buildAST()` to a valid AST (no throws)
- `emitOmniJS()` on that AST produces a script containing the tag name (no live OF)
- A task WITHOUT `agent-okay` tag does NOT match the compiled filter (test the negative)

---

## Shared Patterns

### Literal-only default-deny env parse

**Source:** `src/auth/role-resolver.ts` lines 43–45 **Apply to:** `parseMode()` in `role-resolver.ts`

```typescript
export function parseRole(env: Record<string, string | undefined> = process.env): Role {
  return env.OMNIFOCUS_MCP_ROLE === 'owner' ? 'owner' : 'agent';
}
// Anti-patterns absent: no toLowerCase, trim, truthy check, || fallback
```

### Gate response structure

**Source:** `src/tools/unified/OmniFocusWriteTool.ts` lines 438–460 **Apply to:** new `POLICY_GATE_CAPTURE_CONFIRM`
branch in `executeValidated()`

```typescript
return createErrorResponseV2(
  'omnifocus_write',
  'POLICY_GATE_REQUIRES_OWNER',
  'This structural operation requires owner approval before execution.',
  'Re-run from an owner connection using the ownerCommand below, or ask the owner to execute it.',
  {
    dryRun: true,
    preview: { wouldAffect: { operation, target, note: '...' } },
    ownerCommand: { mutation: args.mutation },
  },
  new OperationTimerV2().toMetadata(),
);
```

### Optional nested object in Zod schema (dual-schema rule)

**Source:** `src/tools/unified/schemas/write-schema.ts` lines 18–58 (`RepetitionRuleSchema`) + line 159
(`repetitionRule: RepetitionRuleSchema.optional()`) **Apply to:** `LineageSchema` + `lineage: LineageSchema.optional()`
in `CreateDataSchema` Always use `strictObj()` (line 130) for inner objects to reject unknown keys, and always update
the `inputSchema` override in `OmniFocusWriteTool.ts` in the same change.

### `describe/it.each` test matrix for parse functions

**Source:** `tests/unit/auth/role-resolver.test.ts` lines 14–43 **Apply to:** `parseMode()` tests added to
`role-resolver.test.ts`

```typescript
it.each<{ label: string; env: Record<string, string | undefined>; expected: 'interactive' | 'background' }>([
  { label: 'exact match: true', env: { OMNIFOCUS_MCP_INTERACTIVE: 'true' }, expected: 'interactive' },
  { label: 'undefined', env: {}, expected: 'background' },
  // ... all failure classes
])('$label → $expected', ({ env, expected }) => {
  expect(parseMode(env)).toBe(expected);
});
```

### Policy table extension

**Source:** `src/auth/operation-policy.ts` lines 32–73 **Apply to:** `create: 'allow'` → `create: 'gate'` change. Follow
the comment style (lines 35–43) when documenting the intent of each row group.

---

## No Analog Found

All 13 files have analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively — though
`composeLineageStamp()` and `src/auth/session-state.ts` are net-new capabilities with no direct analog; they follow the
structural patterns documented above.

---

## Metadata

**Analog search scope:** `src/auth/`, `src/contracts/`, `src/tools/unified/`, `tests/unit/auth/`,
`tests/unit/contracts/ast/` **Files scanned:** 12 source files, 4 test files **Pattern extraction date:** 2026-06-12
