---
phase: 02-operation-policy-deny-deletes-gating
verified: 2026-06-04T10:45:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 02: Operation Policy (Deny-Deletes & Gating) Verification Report

**Phase Goal:** The AGENT role cannot perform any content-destructive delete on single OR batch paths, structural
destructive ops are gated behind dry-run + owner approval, and OWNER retains the full surface — all enforced at the
single mutation funnel. **Verified:** 2026-06-04T10:45:00Z **Status:** passed **Re-verification:** No — initial
verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                            | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A hard-delete of a task, project, or folder by AGENT is rejected; recoverable substitute (complete/drop) succeeds                                                                | ✓ VERIFIED | Funnel guard in `executeValidated()` calls `decide(role, 'delete', target)` → 'deny', returns `POLICY_DENY_DELETE` before any dispatch. `buildDeleteScript` also re-asserts via `assertPolicyAllow`. Unit tests confirm all three targets.                                                                                                                                      |
| 2   | A delete embedded in batch/bulk payload is rejected with the same code as single-item path (batch-parity, OMN-119), enforced at single funnel AND re-asserted in script builders | ✓ VERIFIED | Funnel guard normalizes batch, bulk_delete, and single paths. `buildDeleteTaskScript` and `buildBulkDeleteTasksScript` both import `decide()` and re-assert as first statement. Test: `describe('batch-parity — OMN-119 lesson')` confirms all three payload forms produce `POLICY_DENY_DELETE`. CR-01 fix confirmed at lines 1043 and 1153 of OmniFocusWriteTool.ts.           |
| 3   | AGENT request for tag delete, tag merge, or perspective delete returns dry-run preview, NOT executed on first request; additive tag ops execute directly                         | ✓ VERIFIED | Funnel guard returns `POLICY_GATE_REQUIRES_OWNER` with `dryRun: true` + `ownerCommand` for `tag_manage/delete` and `tag_manage/merge`. `buildDeleteTagScript` and `buildMergeTagsScript` re-assert via `assertPolicyAllow`. `buildCreateTagScript`, `buildRenameTagScript`, etc. have no gate. Tests confirm `POLICY_GATE_REQUIRES_OWNER` for delete/merge, no gate for create. |
| 4   | OWNER role can execute the full tag_manage surface (including delete and merge) and perspective management directly, with no gating                                              | ✓ VERIFIED | `decide()` returns 'allow' unconditionally for `role === 'owner'`. `parseRole()` only resolves 'owner' from exact literal `OMNIFOCUS_MCP_ROLE === 'owner'` — any other value defaults to 'agent' (fail-closed). Tests: `owner + delete task → no POLICY_DENY_DELETE`, `owner + tag_manage/delete → no POLICY_GATE_REQUIRES_OWNER`.                                              |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                           | Expected                                                                     | Status     | Details                                                                                                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/contracts/roles.ts`                           | `PolicyOutcome` type exported                                                | ✓ VERIFIED | Line 40: `export type PolicyOutcome = 'allow' \| 'deny' \| 'gate';`                                                                                                                             |
| `src/auth/operation-policy.ts`                     | `decide()` function, fail-closed, no `\|\| 'allow'`                          | ✓ VERIFIED | `export function decide(role: Role, operation: string, target?: string): PolicyOutcome`. No executable `\|\| 'allow'` (only in block comment). Unknown op → 'deny' confirmed.                   |
| `src/tools/unified/OmniFocusWriteTool.ts`          | Policy guard at top of `executeValidated()`, both error codes present        | ✓ VERIFIED | Guard block at lines 336–419, before all routing branches. `POLICY_DENY_DELETE` (×2) and `POLICY_GATE_REQUIRES_OWNER` (×2) both present.                                                        |
| `src/contracts/ast/mutation-script-builder.ts`     | `assertPolicyAllow` re-assertion in `buildDeleteScript()`                    | ✓ VERIFIED | `assertPolicyAllow` at line 2032, before sandbox guard. Imports `decide` from `operation-policy.js`.                                                                                            |
| `src/contracts/ast/tag-mutation-script-builder.ts` | `assertPolicyAllow` in `buildDeleteTagScript()` and `buildMergeTagsScript()` | ✓ VERIFIED | `assertPolicyAllow` as first statement in both builders (lines 367 and 418). Imports `decide` from `operation-policy.js`. Count: 3 references.                                                  |
| `src/omnifocus/scripts/tasks/delete-task.ts`       | `role: Role` parameter, `decide()` re-assertion (CR-01 fix)                  | ✓ VERIFIED | Imports `decide` and `Role`. `buildDeleteTaskScript(role: Role, params)` re-asserts `decide(role, 'delete', 'task')` as first statement.                                                        |
| `src/omnifocus/scripts/tasks/delete-tasks-bulk.ts` | `role: Role` parameter, `decide()` re-assertion (CR-01 fix)                  | ✓ VERIFIED | Imports `decide` and `Role`. `buildBulkDeleteTasksScript(role: Role, params)` re-asserts `decide(role, 'bulk_delete', 'task')` as first statement.                                              |
| `tests/unit/auth/operation-policy.test.ts`         | Exhaustive matrix + defense-in-depth describe block                          | ✓ VERIFIED | Contains `unknown op → deny`, `describe('script-builder re-assertion — defense-in-depth (D-03)')` with agent-deny, agent-gate, and owner-pass-through assertions for task/bulk-delete builders. |
| `tests/unit/tools/write-tool-policy-guard.test.ts` | Batch-parity test + funnel guard unit tests                                  | ✓ VERIFIED | `describe('batch-parity — OMN-119 lesson')` with three assertions; gate tests with `dryRun: true` + `ownerCommand`; OWNER pass-through tests.                                                   |

### Key Link Verification

| From                              | To                             | Via                                                 | Status  | Details                                                                                                                                                               |
| --------------------------------- | ------------------------------ | --------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OmniFocusWriteTool.ts`           | `src/auth/operation-policy.ts` | `import { decide }`                                 | ✓ WIRED | Line 62: `import { decide } from '../../auth/operation-policy.js';`                                                                                                   |
| `OmniFocusWriteTool.ts`           | `src/auth/role-resolver.ts`    | `import { parseRole }`                              | ✓ WIRED | Line 63: `import { parseRole } from '../../auth/role-resolver.js';`                                                                                                   |
| `mutation-script-builder.ts`      | `src/auth/operation-policy.ts` | `import { decide }`                                 | ✓ WIRED | Line 27 confirmed by grep                                                                                                                                             |
| `tag-mutation-script-builder.ts`  | `src/auth/operation-policy.ts` | `import { decide }`                                 | ✓ WIRED | Line 15 confirmed by grep                                                                                                                                             |
| `delete-task.ts`                  | `src/auth/operation-policy.ts` | `import { decide }`                                 | ✓ WIRED | Line 2 confirmed                                                                                                                                                      |
| `delete-tasks-bulk.ts`            | `src/auth/operation-policy.ts` | `import { decide }`                                 | ✓ WIRED | Line 2 confirmed                                                                                                                                                      |
| Funnel guard                      | `createErrorResponseV2`        | `POLICY_DENY_DELETE` / `POLICY_GATE_REQUIRES_OWNER` | ✓ WIRED | Both codes confirmed in funnel block                                                                                                                                  |
| `handleTaskDelete` call site      | `buildDeleteTaskScript`        | `parseRole()` as first arg                          | ✓ WIRED | Line 1043: `buildDeleteTaskScript(parseRole(), { taskId })`                                                                                                           |
| `handleBulkDeleteTasks` call site | `buildBulkDeleteTasksScript`   | `parseRole()` as first arg                          | ✓ WIRED | Line 1153: `buildBulkDeleteTasksScript(parseRole(), { taskIds: … })`                                                                                                  |
| `handleTagManage` call site       | `buildDeleteTagScript`         | `parseRole()` as first arg                          | ✓ WIRED | Line 2304: `buildDeleteTagScript(parseRole(), { tagName })`                                                                                                           |
| `handleTagManage` call site       | `buildMergeTagsScript`         | `parseRole()` as first arg                          | ✓ WIRED | Line 2307: `buildMergeTagsScript(parseRole(), { tagName, targetTag })`                                                                                                |
| `rollbackBatchCreations`          | `buildDeleteScript`            | `'owner'` hardcoded (not `parseRole()`)             | ✓ WIRED | Line 2221: `buildDeleteScript('owner', item.type, item.realId)` with documented rationale — rollback is system-initiated cleanup, not a user delete. WR-01 addressed. |

### Data-Flow Trace (Level 4)

Not applicable. Phase delivers authorization enforcement logic, not data-rendering components.

### Behavioral Spot-Checks

| Behavior                                                       | Command                                       | Result          | Status |
| -------------------------------------------------------------- | --------------------------------------------- | --------------- | ------ |
| decide('agent', 'delete', 'task') === 'deny'                   | `npm run test:unit` (operation-policy matrix) | 2285 tests pass | ✓ PASS |
| decide('agent', 'bulk_delete', 'task') === 'deny'              | Same suite                                    | 2285 tests pass | ✓ PASS |
| decide('agent', 'tag_manage', 'delete') === 'gate'             | Same suite                                    | 2285 tests pass | ✓ PASS |
| decide('owner', 'delete', 'task') === 'allow'                  | Same suite                                    | 2285 tests pass | ✓ PASS |
| decide('agent', 'unknown_op', 'task') === 'deny' (fail-closed) | Same suite                                    | 2285 tests pass | ✓ PASS |
| buildDeleteTaskScript('agent', …) throws POLICY: DENY          | Same suite (CR-01 test)                       | confirmed       | ✓ PASS |
| buildBulkDeleteTasksScript('agent', …) throws POLICY: DENY     | Same suite (CR-01 test)                       | confirmed       | ✓ PASS |
| Batch-parity: single/batch/bulk all produce POLICY_DENY_DELETE | `describe('batch-parity — OMN-119 lesson')`   | confirmed       | ✓ PASS |
| npm run build                                                  | TypeScript compile                            | 0 errors        | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan         | Description                                                                   | Status      | Evidence                                                                                                                                                                              |
| ----------- | ------------------- | ----------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POLICY-01   | 02-01, 02-02        | AGENT cannot hard-delete task, project, or folder                             | ✓ SATISFIED | Funnel guard + `buildDeleteScript` assertPolicyAllow; single test row confirms `delete/task`, `delete/project`, `delete/folder` all deny for agent                                    |
| POLICY-02   | 02-01, 02-02        | AGENT cannot bulk/batch destructive delete                                    | ✓ SATISFIED | Batch-parity describe block (OMN-119 lesson) asserts single/batch/bulk_delete all return `POLICY_DENY_DELETE`; funnel walks `compiled.operations[]`                                   |
| POLICY-03   | 02-01, 02-02        | AGENT additive tag ops direct; tag delete/merge/perspective delete gated      | ✓ SATISFIED | Policy table: `create/rename/nest/unnest/reparent → allow`, `delete/merge/perspective_delete → gate`; tested in write-tool-policy-guard                                               |
| POLICY-04   | 02-01, 02-02, 02-03 | Enforcement at single funnel + re-assertion in script builders                | ✓ SATISFIED | Two-layer enforcement: funnel guard in `executeValidated()` + `assertPolicyAllow`/`decide()` re-assertions in all 5 destructive builders. Both layers call the same `decide()`.       |
| POLICY-05   | 02-01, 02-02        | AGENT "done" expressed as complete or drop, not delete                        | ✓ SATISFIED | `complete → allow`, `drop → allow` in policy table; deny message says "Use 'complete', or update with status 'dropped'"                                                               |
| POLICY-06   | 02-01, 02-02        | OWNER retains full tag_manage surface and perspective management              | ✓ SATISFIED | `decide()` returns 'allow' for all ops when `role === 'owner'`; unconditional pass-through with no per-target gating                                                                  |
| POLICY-07   | 02-01, 02-02        | Gated structural ops return dry-run preview + require explicit owner approval | ✓ SATISFIED | Funnel returns `POLICY_GATE_REQUIRES_OWNER` with `dryRun: true`, `preview.wouldAffect`, and `ownerCommand` (copy-paste-ready re-submission payload). Gate fires before any execution. |

All 7 POLICY requirements satisfied.

### Anti-Patterns Found

| File                           | Line | Pattern                                            | Severity | Impact                                                                                         |
| ------------------------------ | ---- | -------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `src/auth/operation-policy.ts` | 12   | `\|\| 'allow'` in block comment anti-patterns list | ℹ️ Info  | Not executable — listed as a banned anti-pattern in the module's own header comment. No issue. |

No `TBD`, `FIXME`, or `XXX` markers found in phase-modified files. No stubs, no empty implementations in the policy
path.

**CR-01 status (from 02-REVIEW.md):** FIXED. `buildDeleteTaskScript` and `buildBulkDeleteTasksScript` in
`src/omnifocus/scripts/tasks/` now both take a `role: Role` parameter, import and call `decide()` as their first
statement, and their call sites in `OmniFocusWriteTool.ts` (lines 1043, 1153) pass `parseRole()`. The defense-in-depth
re-assertion test block (`operation-policy.test.ts` lines 235–281) covers both builders for agent-deny and
owner-pass-through.

**WR-01 status (from 02-REVIEW.md):** FIXED. `rollbackBatchCreations` now calls `buildDeleteScript('owner', …)` with
documented rationale (line 2221). Agent atomic-batch rollback no longer silently orphans partial creates.

**WR-02, WR-03, WR-04:** All three warnings from the code review are addressed in the current implementation. WR-02:
gate preview omits misleading `count: 1` scalar and uses a `note` instead. WR-03: deny response branches on
`isKnownDelete` to produce the correct message. WR-04: `drop` entry annotated as forward-declared; recovery text updated
to reference `update with status 'dropped'`.

### Human Verification Required

None. All success criteria are verifiable programmatically and all checks passed.

### Gaps Summary

No gaps. All 4 observable truths are VERIFIED. All 7 POLICY requirement IDs are SATISFIED. The CR-01 fix
(defense-in-depth re-assertion for task-delete paths) landed correctly: both task-delete builders now carry the
re-assertion, their call sites pass `parseRole()`, and dedicated unit tests confirm the behavior for both the agent-deny
and owner-pass-through cases. The test suite runs clean at 2285 tests, zero failures. Build is clean.

---

_Verified: 2026-06-04T10:45:00Z_ _Verifier: Claude (gsd-verifier)_
