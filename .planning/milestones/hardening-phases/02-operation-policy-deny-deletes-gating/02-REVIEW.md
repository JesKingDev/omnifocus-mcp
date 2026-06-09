---
phase: 02-operation-policy-deny-deletes-gating
reviewed: 2026-06-04T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/auth/operation-policy.ts
  - src/contracts/ast/mutation-script-builder.ts
  - src/contracts/ast/tag-mutation-script-builder.ts
  - src/contracts/roles.ts
  - src/tools/unified/OmniFocusWriteTool.ts
  - tests/unit/auth/operation-policy.test.ts
  - tests/unit/contracts/ast/mutation-script-builder.test.ts
  - tests/unit/tag-conversion.test.ts
  - tests/unit/tag-operations.test.ts
  - tests/unit/tools/batch/batch-mixed-operations.test.ts
  - tests/unit/tools/unified/OmniFocusWriteTool.test.ts
  - tests/unit/tools/unified/write-dry-run.test.ts
  - tests/unit/tools/write-tool-policy-guard.test.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-06-04 **Depth:** standard **Files Reviewed:** 13 **Status:** issues_found

## Summary

The phase ships a single-source-of-truth `decide()` policy function with a fail-closed default-deny posture.
`parseRole()` is correct: only the exact literal `'owner'` resolves to OWNER, so unknown/missing/wrong-case/whitespace
values all fall through to `'agent'`. The funnel guard in `OmniFocusWriteTool.executeValidated()` runs before every
routing branch (including before the dry-run and batch branches), normalizes the compiled mutation into
`(operation, target)` items, and short-circuits on the first deny/gate. Batch/bulk parity holds at the funnel: single
delete, batch-wrapped delete, and bulk_delete all return `POLICY_DENY_DELETE`, confirmed by
`write-tool-policy-guard.test.ts`.

The defense-in-depth re-assertion layer, however, is incomplete and asymmetric. The two builders that carry
`assertPolicyAllow()` are `buildDeleteScript` (project/folder/task via the AST builder) and the tag delete/merge
builders. But the **task** delete and **bulk-delete-task** paths the funnel actually routes to do NOT pass through those
builders — they call un-guarded builders in `src/omnifocus/scripts/tasks/`. So the most security-sensitive operation in
the phase (content task deletion) has exactly one enforcement layer, not the two the plan claims. This is the headline
finding. A secondary correctness defect: agent atomic-batch rollback now throws inside `buildDeleteScript` and silently
leaves partial creates behind.

The OWNER pass-through is unconditional and correct. The pre-existing tests that were given `OMNIFOCUS_MCP_ROLE='owner'`
(batch-mixed-operations, write-dry-run, OmniFocusWriteTool) are legitimately adapting to the new default-deny behavior —
their subjects are dispatch ordering, dry run shaping, and schema coercion, not authorization, and they set owner to
exercise that subject past the new guard. No masked regression found there.

## Critical Issues

### CR-01: Task delete and bulk-delete-task paths have no defense-in-depth re-assertion

**File:** `src/tools/unified/OmniFocusWriteTool.ts:1029`, `:1139`; `src/omnifocus/scripts/tasks/delete-task.ts`,
`delete-tasks-bulk.ts` **Issue:** The phase's stated contract is that BOTH enforcement layers — the funnel guard and the
script-builder re-assertion — gate every content-destructive delete. That holds for project/folder deletes
(`handleProjectDelete` → `buildDeleteScript(parseRole(), 'project', …)`, which calls `assertPolicyAllow` as its first
statement) and for tag delete/merge. It does NOT hold for the two highest-traffic destructive paths:

- `handleTaskDelete` (line 1029) calls `buildDeleteTaskScript({ taskId })` imported from
  `src/omnifocus/scripts/tasks.js`.
- `handleBulkDeleteTasks` (line 1139) calls `buildBulkDeleteTasksScript({ taskIds })` from the same module.

Both of those builders contain zero policy references (verified: `grep -n "decide\|parseRole\|assertPolicy\|Role"`
returns nothing). They do not receive a `role` argument and cannot re-assert. So for a single task delete or a bulk task
delete, the funnel guard in `executeValidated` is the _only_ thing standing between an agent and permanent data loss.
Any future refactor that adds a code path reaching `handleTaskDelete`/`handleBulkDeleteTasks` without first traversing
the funnel block (e.g. a new internal caller, a batch fast-path, a retry helper) would emit destructive JXA with no
second check — which is precisely the failure mode the D-03 re-assertion exists to prevent.

This is also an internal inconsistency: `buildDeleteScript` _does_ support tasks (`target: MutationTarget`,
`isTask = target === 'task'`), so the codebase has a guarded task-delete builder, but the task funnel paths route to the
un-guarded `tasks/` builders instead. The asymmetry is almost certainly an oversight rather than intent.

**Fix:** Either route task deletes through the guarded builder, or push the re-assertion into the `tasks/` builders.
Minimal, consistent fix — thread the role into the task-delete builders and re-assert, mirroring `buildDeleteScript`:

```typescript
// src/omnifocus/scripts/tasks/delete-task.ts
import { decide } from '../../../auth/operation-policy.js';
import type { Role } from '../../../contracts/roles.js';

export function buildDeleteTaskScript(role: Role, args: { taskId: string }): GeneratedScript {
  const outcome = decide(role, 'delete', 'task');
  if (outcome !== 'allow') {
    throw new Error(`POLICY: ${outcome.toUpperCase()} delete/task for role '${role}'`);
  }
  // …existing body…
}
// delete-tasks-bulk.ts: re-assert decide(role, 'bulk_delete', 'task') the same way.
```

Then update the two call sites:

```typescript
const deleteScript = buildDeleteTaskScript(parseRole(), { taskId });           // line 1029
const script = buildBulkDeleteTasksScript(parseRole(), { taskIds: … });        // line 1139
```

Add a unit test parallel to `mutation-script-builder.test.ts`'s re-assertion block asserting
`buildDeleteTaskScript('agent', …)` and `buildBulkDeleteTasksScript('agent', …)` throw `POLICY: DENY`.

## Warnings

### WR-01: Agent atomic-batch rollback throws and silently leaves partial creates

**File:** `src/tools/unified/OmniFocusWriteTool.ts:2199` **Issue:** `rollbackBatchCreations` is invoked when an
`atomicOperation: true` batch create partially fails. It calls `buildDeleteScript(parseRole(), item.type, item.realId)`.
Under the new default, an agent's `parseRole()` returns `'agent'`, and `buildDeleteScript('agent', …)` now throws
`POLICY: DENY` as its first statement. That throw is swallowed by the surrounding `try/catch` (line 2202), which logs an
error and moves on. Net effect: an agent's atomic batch that fails midway can no longer roll back — the already-created
tasks/projects are orphaned, and the caller is told the operation rolled back. This breaks the atomicity guarantee
precisely for the role that most needs guardrails, and it does so silently. Rollback is an internally-initiated cleanup
of items the system itself just created, so it is not the destructive-user-action the policy is meant to block.

**Fix:** Roll back with owner authority, since this is system-initiated cleanup of system-created objects, not a user
delete:

```typescript
const generatedScript = await buildDeleteScript('owner', item.type, item.realId);
```

Add a comment explaining that rollback is a trusted internal compensating action, distinct from a user-requested delete,
so the choice is auditable. Alternatively, gate atomic batches for agents at the funnel so this path is never reached —
but that is a larger behavior change.

### WR-02: Gate preview always reports `count: 1` regardless of actual scope

**File:** `src/tools/unified/OmniFocusWriteTool.ts:393` **Issue:** The `POLICY_GATE_REQUIRES_OWNER` response hardcodes
`preview.wouldAffect.count = 1`. For `tag_manage/merge` this is misleading: a merge can retag and then delete a tag that
is attached to many tasks (see `buildMergeTagsScript`, which counts and re-tags every affected task). The owner reading
the gate preview to decide whether to approve sees "count: 1" for an operation that may touch hundreds of tasks. The
preview is the only signal the gated party gets, so an inaccurate count undermines the approval decision the gate exists
to enable.

**Fix:** Drop the misleading scalar or label it honestly. Since the funnel cannot cheaply compute the true blast radius
without a lookup, either omit `count` for gated ops or annotate it:

```typescript
preview: {
  wouldAffect: {
    operation: item.operation,
    target: item.target,
    note: 'Scope not computed in gate preview; merge/delete may affect many items.',
  },
},
```

### WR-03: Funnel deny message is delete-specific but fires for any deny outcome

**File:** `src/tools/unified/OmniFocusWriteTool.ts:373-381` **Issue:** `decide()` returns `'deny'` for any unknown
operation (fail-closed, by design) and for `tag_manage` with an unrecognized target. The funnel maps _every_ `'deny'` to
the fixed message "Delete operations are not permitted for the agent role." and a recovery of "Use 'complete' or 'drop'
instead of delete." For a fail-closed deny on, say, a future operation or an unrecognized tag action, that message is
wrong and the recovery advice is nonsensical (you cannot "complete" an unknown operation). This degrades the
developer-experience contract this project values and could mislead an agent into a retry loop.

**Fix:** Branch the message on whether the operation is a known destructive op vs a fail-closed unknown:

```typescript
const isKnownDelete = item.operation === 'delete' || item.operation === 'bulk_delete';
return createErrorResponseV2(
  'omnifocus_write',
  isKnownDelete ? 'POLICY_DENY_DELETE' : 'POLICY_DENY',
  isKnownDelete
    ? 'Delete operations are not permitted for the agent role.'
    : `Operation '${item.operation}' is not permitted for the agent role.`,
  isKnownDelete ? "Use 'complete' or 'drop' instead of delete." : 'Re-run from an owner connection.',
  { role, operation: item.operation, target: item.target },
  new OperationTimerV2().toMetadata(),
);
```

### WR-04: `'drop'` is in the policy allow-table but is not a reachable write operation

**File:** `src/auth/operation-policy.ts:43`; `src/tools/unified/schemas/write-schema.ts` **Issue:** `AGENT_POLICY` lists
`drop: 'allow'`, and the deny-path recovery text tells agents to "Use 'complete' or 'drop' instead of delete." But the
write schema's operation literals are
`create | create_folder | update | complete | delete | batch | bulk_delete | tag_manage` — there is no `drop` operation
(verified: no `'drop'` in compilers or schemas). Drop is reached only as an `update` with `status: 'dropped'`. So the
policy entry is dead with respect to the funnel, and the recovery advice points agents at an operation that will fail
schema validation with a confusing error. This is a correctness gap in the user-facing guidance, not just dead code.

**Fix:** Either remove the `drop` entry and fix the recovery text to say "Use 'complete', or update the task with status
'dropped', instead of delete," or document explicitly in the policy table that `drop` is forward-declared for a future
operation and is intentionally unreachable today (mirroring the `perspective_delete` comment). Keep the recovery string
in sync with what the schema actually accepts.

## Info

### IN-01: Empty-string fallback for tag target conflates "missing action" with "action named empty string"

**File:** `src/tools/unified/OmniFocusWriteTool.ts:359`; `src/auth/operation-policy.ts:109` **Issue:** The funnel builds
the tag policy item as `target: (compiled as { action?: string }).action ?? ''`, and `decide()` does
`entry[target ?? '']`. Both coalesce a missing action to `''`, which is absent from the tag table and therefore denies —
correct outcome, but by accident of two independent `?? ''` coalescings rather than an explicit "missing action → deny"
rule. The Zod schema requires `action`, so the empty case should be unreachable in practice; still, the
double-defaulting is fragile if a caller ever reaches `decide()` without schema validation. **Fix:** Add a one-line
comment at `decide()` noting that an empty/missing tag target is intentionally absent from the table and resolves to
fail-closed deny, so the behavior is documented rather than emergent.

### IN-02: `buildDeleteScript` doc comment lists `'folder'` target but body only branches task/project

**File:** `src/contracts/ast/mutation-script-builder.ts:2023, 2041` **Issue:** The JSDoc says
`@param target The mutation target ('task' | 'project' | 'folder')`, but the body is `const isTask = target === 'task'`,
so any non-task target (including `'folder'`) is treated as a project — `flattenedProjects`, `projectId` field,
`delete_project` context. A folder delete would generate a project-shaped script. No folder-delete path currently
reaches this builder, so it is latent, but the comment overstates support. **Fix:** Either drop `'folder'` from the doc
comment or add an explicit folder branch. At minimum align the comment with the two-way task/project branching that
actually exists.

### IN-03: Defense-in-depth `assertPolicyAllow` is duplicated verbatim across two builder files

**File:** `src/contracts/ast/mutation-script-builder.ts:43`; `src/contracts/ast/tag-mutation-script-builder.ts:30`
**Issue:** The `assertPolicyAllow(role, operation, target)` helper is copy-pasted identically into both builder modules.
The module headers explicitly claim "no policy logic is duplicated," which is true for `decide()` but not for this
throw-wrapper. Two copies can drift (error message format, future behavior). **Fix:** Extract `assertPolicyAllow` into
`src/auth/operation-policy.ts` (next to `decide`) and import it in both builders. Keeps the single-source-of-truth claim
literally accurate and centralizes the POLICY error string.

---

_Reviewed: 2026-06-04_ _Reviewer: Claude (gsd-code-reviewer)_ _Depth: standard_
