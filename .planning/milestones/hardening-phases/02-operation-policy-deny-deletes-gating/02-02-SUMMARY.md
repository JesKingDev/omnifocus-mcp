---
phase: 02-operation-policy-deny-deletes-gating
plan: '02'
subsystem: tools/policy-enforcement
tags: [policy, guard, batch-parity, tdd, funnel]
dependency_graph:
  requires: [02-01-decide-function]
  provides: [policy-guard-funnel, batch-parity-test, POLICY_DENY_DELETE, POLICY_GATE_REQUIRES_OWNER]
  affects: [02-03-script-builder-assertion]
tech_stack:
  added: []
  patterns: [fail-closed-guard, normalize-and-walk, structured-error-response, batch-parity-test]
key_files:
  created:
    - tests/unit/tools/write-tool-policy-guard.test.ts
  modified:
    - src/tools/unified/OmniFocusWriteTool.ts
    - tests/unit/tools/unified/OmniFocusWriteTool.test.ts
    - tests/unit/tools/unified/write-dry-run.test.ts
    - tests/unit/tools/batch/batch-mixed-operations.test.ts
decisions:
  - 'Policy guard block scoped in its own block immediately after compile(); no new method needed'
  - 'batch normalization walks compiled.operations[]; bulk_delete is a single op-level check (not per-ID); tag_manage
    uses action as target'
  - 'Pre-existing tests that dispatch delete/bulk_delete/tag-merge set OMNIFOCUS_MCP_ROLE=owner so they test JXA
    dispatch, not policy (policy guard tests are in dedicated file)'
metrics:
  duration: 480s
  completed: '2026-06-04'
  tasks: 2
  files: 5
---

# Phase 02 Plan 02: Policy Guard in executeValidated() Funnel Summary

Policy enforcement wired at the single mutation funnel: `decide()` runs before every routing branch in
`executeValidated()`, blocking agent-role deletes with `POLICY_DENY_DELETE` and gating structural tag ops with
`POLICY_GATE_REQUIRES_OWNER`. Mandatory batch-parity test confirms all three surfaces (single / batch / bulk_delete)
produce the same deny code.

## What Was Built

**`src/tools/unified/OmniFocusWriteTool.ts`** — Policy guard block added immediately after
`this.compiler.compile(args)`, before every routing branch:

- Imports `decide()` from `src/auth/operation-policy.js` and `parseRole()` from `src/auth/role-resolver.js`
- Normalizes compiled mutation into flat `(operation, target)` item list:
  - `batch` → walks `compiled.operations[]`, each item becomes `{ operation, target }`
  - `bulk_delete` → single `{ operation: 'bulk_delete', target: compiled.target }` (op-level, not per-ID)
  - `tag_manage` → `{ operation: 'tag_manage', target: compiled.action }` (action-as-target for per-target table lookup)
  - single op → `{ operation: compiled.operation, target: compiled.target }`
- First `deny` → `createErrorResponseV2('omnifocus_write', 'POLICY_DENY_DELETE', ...)` with
  `{ allowed: ['complete','drop'], role, operation, target }`
- First `gate` → `createErrorResponseV2('omnifocus_write', 'POLICY_GATE_REQUIRES_OWNER', ...)` with
  `{ dryRun: true, preview: { wouldAffect: { count, operation, target } }, ownerCommand: { mutation: args.mutation } }`
- OWNER role: `decide()` returns `allow` for everything — guard is a pass-through
- Tool description string updated to document agent role restrictions (dual-schema rule)

**`tests/unit/tools/write-tool-policy-guard.test.ts`** — Dedicated policy guard test file:

- `describe('batch-parity — OMN-119 lesson')`: three `it()` assertions (single delete / batch [delete] / bulk_delete)
  all producing `POLICY_DENY_DELETE` for agent role
- Gate tests: `tag_manage/delete` and `tag_manage/merge` → `POLICY_GATE_REQUIRES_OWNER` with `dryRun: true` and
  `ownerCommand`
- OWNER pass-through: delete and tag_manage/delete are NOT blocked for owner
- Allow-path: complete and tag_manage/create produce no policy error for agent

**Pre-existing test fixes** — Three test files updated to set `OMNIFOCUS_MCP_ROLE='owner'` in `beforeEach/afterEach`:

- `tests/unit/tools/unified/OmniFocusWriteTool.test.ts` — task/project delete, bulk_delete, tag merge tests
- `tests/unit/tools/unified/write-dry-run.test.ts` — bulk_delete dryRun tests
- `tests/unit/tools/batch/batch-mixed-operations.test.ts` — batch-with-delete and previewBatch tests

## Acceptance Criteria Status

| Criterion                                                        | Status         |
| ---------------------------------------------------------------- | -------------- |
| Policy guard in `executeValidated()` before all routing branches | PASS           |
| AGENT delete (single) → `POLICY_DENY_DELETE`                     | PASS           |
| AGENT delete (batch) → `POLICY_DENY_DELETE`                      | PASS           |
| AGENT delete (bulk_delete) → `POLICY_DENY_DELETE`                | PASS           |
| AGENT tag_manage/delete → `POLICY_GATE_REQUIRES_OWNER`           | PASS           |
| AGENT tag_manage/merge → `POLICY_GATE_REQUIRES_OWNER`            | PASS           |
| Gate details: `dryRun: true`                                     | PASS           |
| Gate details: `ownerCommand` non-null                            | PASS           |
| OWNER all ops → no deny/gate                                     | PASS           |
| `describe('batch-parity — OMN-119 lesson')` block exists         | PASS           |
| `import.*decide.*operation-policy` count = 1                     | PASS (grep: 1) |
| `POLICY_DENY_DELETE` in WriteTool                                | PASS (grep: 2) |
| `POLICY_GATE_REQUIRES_OWNER` in WriteTool                        | PASS (grep: 2) |
| `batch-parity` in test file                                      | PASS (grep: 4) |
| `npm run test:unit` exits 0 — 108 files, 2276 tests              | PASS           |
| `npm run build` exits 0                                          | PASS           |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing tests expected agent-role dispatch of delete/bulk_delete/tag-merge**

- **Found during:** Task 2 (running test suite after guard implementation)
- **Issue:** `OmniFocusWriteTool.test.ts`, `write-dry-run.test.ts`, and `batch-mixed-operations.test.ts` contained tests
  that dispatched delete, bulk_delete, and tag-merge operations under the default agent role. These tests are designed
  to verify JXA dispatch behavior, not policy. After the guard landed, the policy correctly blocked them before they
  reached JXA — causing 11 pre-existing test failures.
- **Fix:** Added `OMNIFOCUS_MCP_ROLE='owner'` in `beforeEach` (with `afterEach` restore) for all affected describe
  blocks. Policy guard tests live exclusively in the new `write-tool-policy-guard.test.ts` file.
- **Files modified:** `tests/unit/tools/unified/OmniFocusWriteTool.test.ts`,
  `tests/unit/tools/unified/write-dry-run.test.ts`, `tests/unit/tools/batch/batch-mixed-operations.test.ts`
- **Commit:** `ad9f4b2`

## Threat Model Compliance

| Threat                                                             | Mitigation                                                                                                        | Status                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------- |
| T-2-04: Funnel bypass — routing before guard                       | Guard is the first statement after compile(); all routing branches follow it                                      | MITIGATED               |
| T-2-05: Batch-parity escape — delete smuggled in batch/bulk_delete | Guard walks compiled.operations[]; bulk_delete is an op-level check; batch-parity test asserts all three surfaces | MITIGATED               |
| T-2-06: Self-approval — AGENT fabricates gate bypass               | ownerCommand is instructional; role fixed at startup by parseRole()                                               | ACCEPT (no bypass path) |
| T-2-07: Role from process.env test pollution                       | Tests use beforeEach/afterEach to set/restore OMNIFOCUS_MCP_ROLE                                                  | MITIGATED               |
| T-2-08: Large batch walks all items before deny                    | Short-circuit on first deny; all items are O(n) string lookups with no I/O                                        | ACCEPT                  |
| T-2-SC: npm install slopcheck                                      | No new npm packages — all imports are project-internal                                                            | N/A                     |

## Known Stubs

None — the guard fully implements the specified behavior. The `ownerCommand` in the gate response serializes
`args.mutation` (the original WriteInput mutation object), which is copy-paste-ready for re-submission from an owner
connection.

## Self-Check: PASSED

- `src/tools/unified/OmniFocusWriteTool.ts` — exists, contains `import { decide }` and both policy codes
- `tests/unit/tools/write-tool-policy-guard.test.ts` — exists, contains `batch-parity — OMN-119 lesson` describe
- `npm run test:unit` — 108 files, 2276 tests, all green
- `npm run build` — exits 0
- Commits `dcdf09a` (Task 1) and `ad9f4b2` (Task 2) verified in git log
