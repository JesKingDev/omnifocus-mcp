# Phase 2: Operation Policy (Deny-Deletes & Gating) - Pattern Map

**Mapped:** 2026-06-03 **Files analyzed:** 4 new/modified files **Analogs found:** 4 / 4

## File Classification

| New/Modified File                                  | Role              | Data Flow        | Closest Analog                                                                        | Match Quality                                 |
| -------------------------------------------------- | ----------------- | ---------------- | ------------------------------------------------------------------------------------- | --------------------------------------------- |
| `src/auth/operation-policy.ts`                     | policy/utility    | request-response | `src/auth/role-resolver.ts`                                                           | exact (same module family, fail-closed idiom) |
| `src/tools/unified/OmniFocusWriteTool.ts`          | funnel/controller | request-response | self (existing `executeValidated` routing block + `previewBatch`/`previewBulkDelete`) | self-modification                             |
| `src/contracts/ast/mutation-script-builder.ts`     | script-builder    | transform        | self (existing sandbox guard pattern — `isTestMode()` / `validateTaskInSandbox`)      | self-modification                             |
| `src/contracts/ast/tag-mutation-script-builder.ts` | script-builder    | transform        | self (existing `validateTagMutation` guard at top of each exported builder)           | self-modification                             |

Test files mirror the Phase 1 pattern:

| New Test File                                      | Role                     | Analog                                                 |
| -------------------------------------------------- | ------------------------ | ------------------------------------------------------ |
| `tests/unit/auth/operation-policy.test.ts`         | unit test                | `tests/unit/auth/role-resolver.test.ts`                |
| `tests/unit/tools/write-tool-policy-guard.test.ts` | unit test (batch-parity) | `tests/unit/auth/role-resolver.test.ts` (matrix style) |

---

## Pattern Assignments

### `src/auth/operation-policy.ts` (policy utility, request-response)

**Analog:** `src/auth/role-resolver.ts`

**Imports pattern** (`src/auth/role-resolver.ts` lines 30–31):

```typescript
import type { Role, RoleSource, ResolvedIdentity } from '../contracts/roles.js';
```

For the policy module, extend with:

```typescript
import type { Role } from '../contracts/roles.js';
```

The `Role` union is the only upstream contract dependency. The output type `'allow' | 'deny' | 'gate'` is a new
string-literal union defined in this module (same idiom as `Role` in `src/contracts/roles.ts`).

**Contract-type idiom** (`src/contracts/roles.ts` lines 27, 39):

```typescript
export type Role = 'owner' | 'agent';
export type RoleSource = 'explicit-env' | 'fail-safe-default' | 'http-token';
```

Define the policy outcome type the same way — inline in the module or exported from `src/contracts/roles.ts` (which
already names `PolicyEngine (Phase 2)` as a consumer at line 9):

```typescript
export type PolicyOutcome = 'allow' | 'deny' | 'gate';
```

**Fail-closed function pattern** (`src/auth/role-resolver.ts` lines 42–44):

```typescript
export function parseRole(env: Record<string, string | undefined> = process.env): Role {
  return env.OMNIFOCUS_MCP_ROLE === 'owner' ? 'owner' : 'agent';
}
```

Mirror this for `decide()`: one pure function, explicit default, no side effects.

```typescript
export function decide(role: Role, operation: string, target?: string): PolicyOutcome {
  // explicit table lookup → if no match → 'deny'
}
```

The function must be **synchronous and pure** (D-07: no state-dependent carve-outs). Any `(role, op)` pair not
explicitly listed in the table must return `'deny'`.

**JSDoc / anti-patterns comment** (`src/auth/role-resolver.ts` lines 1–28): Copy the block comment style listing what
the function deliberately does NOT do. For `decide()`, the equivalent anti-patterns are:

- No state-dependent carve-outs (e.g. no `if task.isCompleted` checks)
- No async lookups
- No `|| 'allow'` fallback — unknown ops fail closed

---

### `src/tools/unified/OmniFocusWriteTool.ts` — policy guard insertion (funnel)

**Analog:** self — existing `executeValidated` routing block + `previewBatch`/`previewBulkDelete`

**Current routing structure** (`OmniFocusWriteTool.ts` lines 325–396):

```typescript
async executeValidated(args: WriteInput): Promise<unknown> {
  const compiled = this.compiler.compile(args);

  // Tag management operations
  if (compiled.operation === 'tag_manage') {
    return this.handleTagManage(compiled);
  }

  // Folder creation
  if (compiled.operation === 'create_folder') {
    return this.handleFolderCreate(compiled);
  }

  // Handle dry-run for batch operations
  if (compiled.operation === 'batch' && compiled.dryRun) {
    return this.previewBatch(compiled);
  }

  // Handle dry-run for bulk_delete
  if (compiled.operation === 'bulk_delete' && compiled.dryRun) {
    return this.previewBulkDelete(compiled);
  }

  // Route to batch tool if batch operation
  if (compiled.operation === 'batch') {
    return this.routeToBatch(compiled);
  }

  // Route bulk_delete
  if (compiled.operation === 'bulk_delete') {
    return this.handleBulkDelete(compiled);
  }

  // Route based on target: task vs project
  if (compiled.target === 'project') {
    return this.handleProjectOperation(compiled);
  }

  // Route task operations
  switch (compiled.operation) {
    case 'delete':
      taskResult = await this.handleTaskDelete(compiled);
      ...
  }
}
```

**Guard insertion point:** immediately after `this.compiler.compile(args)`, before the first `if` branch. The guard
normalizes the compiled payload into a flat list of `(operation, target)` items — walking `batch.operations[]` and
`bulk_delete.ids` — and calls `decide()` on each before any routing.

**Deny response shape** — use `createErrorResponseV2` (lines 488–512 of `src/utils/response-format.ts`):

```typescript
return createErrorResponseV2(
  'omnifocus_write',
  'POLICY_DENY_DELETE', // D-05: stable code, greppable
  'Delete operations are not permitted for the agent role.',
  "Use 'complete' or 'drop' instead of delete.",
  { allowed: ['complete', 'drop'], role, operation, target },
  timer.toMetadata(),
);
```

Shape: `{ success: false, data: {}, error: { code, message, suggestion, details }, metadata }`.

**Gate response shape** — same `createErrorResponseV2`, different code (D-06):

```typescript
return createErrorResponseV2(
  'omnifocus_write',
  'POLICY_GATE_REQUIRES_OWNER', // D-06: distinct code
  'This operation requires owner approval.',
  'Re-run from an owner connection, or use the command below.',
  {
    dryRun: true,
    preview: {
      /* what would execute */
    },
    ownerCommand: {
      /* copy-paste-ready payload */
    },
  },
  timer.toMetadata(),
);
```

The `details.dryRun: true` and `details.preview` fields match the existing `previewBatch`/`previewBulkDelete` shape
(lines 2354–2378, 2404–2425):

```typescript
// Existing shape to mirror:
return createSuccessResponseV2(
  'omnifocus_write',
  {
    dryRun: true,
    operation: 'bulk_delete',
    wouldAffect: { count: ..., items: [...] },
    validation: { passed: true, ... },
  },
  undefined,
  { ...timer.toMetadata(), message: 'DRY RUN: ...' },
);
```

For gate responses, embed this same `wouldAffect` structure inside `details`.

**Batch normalization — existing pattern** (`routeToBatch` lines 1431–1434 and `handleBulkDelete` line 1007–1011):

```typescript
// batch: partition by sub-operation type
const deleteOps = compiled.operations.filter((op) => op.operation === 'delete');

// bulk_delete: the ids array is the item list
if (compiled.target === 'project') { ... }
```

The policy guard must walk these same structures to extract `(operation, target)` pairs before routing diverges.

---

### `src/contracts/ast/mutation-script-builder.ts` — defense-in-depth re-assertion (D-03)

**Analog:** self — existing sandbox guard pattern

**Existing guard shape** (lines 330–340):

```typescript
async function validateTaskInSandbox(taskId: string, operation: string): Promise<void> {
  if (!isTestMode()) return;

  const inSandbox = await isTaskInSandbox(taskId);
  if (!inSandbox) {
    throw new Error(`TEST GUARD: Cannot ${operation} task "${taskId}" outside sandbox. ...`);
  }
}
```

**Policy re-assertion pattern to mirror:** a synchronous guard at the top of `buildDeleteScript` (and the equivalent
delete-emitting path) that calls `decide()` before generating any JXA:

```typescript
// Re-assertion: same decide() called at funnel; belt-and-suspenders (D-03).
// Throws rather than returning a response — script builders are not
// request handlers, so an error propagates to the funnel's catch block.
function assertPolicyAllow(role: Role, operation: string, target: string): void {
  const outcome = decide(role, operation, target);
  if (outcome !== 'allow') {
    throw new Error(`POLICY: ${outcome.toUpperCase()} ${operation}/${target} for role '${role}'`);
  }
}
```

This mirrors how `validateTagMutation` throws synchronously (`tag-mutation-script-builder.ts` lines 22–27):

```typescript
function validateTagMutation(tagName: string): void {
  if (!isTestMode()) return;
  if (!tagName.startsWith(TEST_TAG_PREFIX)) {
    throw new Error(`TEST GUARD: Tag mutations must target "${TEST_TAG_PREFIX}"-prefixed tags. Got: "${tagName}"`);
  }
}
```

The re-assertion needs the caller's `Role`. The builders currently receive only operation-specific data objects
(`TaskCreateData`, etc.). The role must be threaded in — either as an added parameter or via a module-level accessor
that reads the same resolved context used by the funnel. The planner should decide the injection mechanism; the guard
body pattern is fixed (call `decide()`, throw on non-allow).

---

### `src/contracts/ast/tag-mutation-script-builder.ts` — defense-in-depth re-assertion (D-03)

**Analog:** self — existing `validateTagMutation` at lines 22–27

**Existing guard** (lines 22–27):

```typescript
function validateTagMutation(tagName: string): void {
  if (!isTestMode()) return;
  if (!tagName.startsWith(TEST_TAG_PREFIX)) {
    throw new Error(`TEST GUARD: ...`);
  }
}
```

Each exported builder calls `validateTagMutation(data.tagName)` as its first line (e.g. `buildCreateTagScript` line 80,
`buildDeleteTagScript` line ~345).

**Policy re-assertion placement:** `buildDeleteTagScript` and `buildMergeTagsScript` are the two gate-classified
builders. Insert `assertPolicyAllow(role, 'tag_manage', 'delete')` and `assertPolicyAllow(role, 'tag_manage', 'merge')`
at the same position where `validateTagMutation` is called — the very first line of each builder, before any script
generation.

---

## Shared Patterns

### Fail-closed function pattern

**Source:** `src/auth/role-resolver.ts` lines 42–44 **Apply to:** `src/auth/operation-policy.ts` — `decide()` function

The canonical shape is: one exported function, pure, synchronous, exhaustive explicit cases, unknown input resolves to
the restrictive default (`'agent'` for `parseRole`; `'deny'` for `decide()`). No helper branches, no fallthrough.

### String-literal union contract type

**Source:** `src/contracts/roles.ts` lines 27, 39 **Apply to:** `PolicyOutcome` type in `src/auth/operation-policy.ts`
(or promoted to `src/contracts/roles.ts` given that file already names Phase 2 as a consumer)

Pattern: `export type Foo = 'a' | 'b' | 'c';` — no enum, no object, string literals only.

### `createErrorResponseV2` structured failure

**Source:** `src/utils/response-format.ts` lines 488–512 **Apply to:** Policy guard in
`OmniFocusWriteTool.executeValidated` for both deny and gate paths

Signature: `createErrorResponseV2(operation, errorCode, message, suggestion?, details?, metadata?)`. Returns
`{ success: false, data: {}, error: { code, message, suggestion, details }, metadata }`. The `errorCode` is a greppable
string constant — `POLICY_DENY_DELETE` and `POLICY_GATE_REQUIRES_OWNER` must be used consistently in tests and the
guard.

### `previewBatch` / `previewBulkDelete` dry-run shape

**Source:** `src/tools/unified/OmniFocusWriteTool.ts` lines 2354–2378 and 2404–2425 **Apply to:** gate response details
in `OmniFocusWriteTool` (D-01/D-06)

The `dryRun: true` + `wouldAffect: { count, items }` + `validation: { passed, warnings }` structure is already
established for batch and bulk_delete previews. The gate response embeds this same shape inside `details` of the error
response rather than returning a success response.

### `it.each` policy matrix test pattern

**Source:** `tests/unit/auth/role-resolver.test.ts` lines 14–43 **Apply to:** `tests/unit/auth/operation-policy.test.ts`

Pattern:

```typescript
it.each<{ label: string; role: Role; operation: string; target: string; expected: PolicyOutcome }>([
  { label: 'owner/delete/task → allow', role: 'owner', operation: 'delete', target: 'task', expected: 'allow' },
  { label: 'agent/delete/task → deny', role: 'agent', operation: 'delete', target: 'task', expected: 'deny' },
  {
    label: 'agent/tag_manage/delete → gate',
    role: 'agent',
    operation: 'tag_manage',
    target: 'delete',
    expected: 'gate',
  },
  // ... one row per D-08 cell + unknown-op fail-closed row
])('$label', ({ role, operation, target, expected }) => {
  expect(decide(role, operation, target)).toBe(expected);
});
```

Each row in the D-08 table becomes a test row. Add a mandatory "unknown op → deny" row at the end to assert fail-closed
default.

### Batch-parity test pattern (OMN-119 lesson)

**Source:** `tests/unit/auth/role-resolver.test.ts` (matrix style) + OMN-119 batch-parity lesson **Apply to:**
`tests/unit/tools/write-tool-policy-guard.test.ts`

The batch-parity test must assert that the same destructive op produces the same `POLICY_DENY_DELETE` code whether
submitted as:

1. `{ mutation: { operation: 'delete', target: 'task', id: '...' } }`
2. `{ mutation: { operation: 'batch', operations: [{ operation: 'delete', target: 'task', id: '...' }] } }`
3. `{ mutation: { operation: 'bulk_delete', target: 'task', ids: ['...'] } }`

All three must return `error.code === 'POLICY_DENY_DELETE'` for an agent role. This is a dedicated, named test — not
covered by the matrix test.

---

## No Analog Found

None — all four files have clear analogs in the existing codebase. The `decide()` function pattern, the
structured-failure shape, the dry-run preview shape, and the guard-at-builder-entry-point pattern all have direct
precedent.

---

## Metadata

**Analog search scope:** `src/auth/`, `src/contracts/`, `src/tools/unified/`, `src/utils/`, `tests/unit/auth/` **Files
scanned:** 8 source files read in full or targeted excerpts **Pattern extraction date:** 2026-06-03
