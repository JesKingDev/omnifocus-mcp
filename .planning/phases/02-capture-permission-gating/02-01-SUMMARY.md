---
phase: 02-capture-permission-gating
plan: '01'
subsystem: test-scaffolds
tags:
  - wave-0
  - tdd
  - red-state
  - perm-01
  - perm-02
  - line-01
  - cap-01
dependency_graph:
  requires: []
  provides:
    - LINE-01 stamp composition + idempotency test cases
    - PERM-01 predicate compilation test cases
    - parseMode default-deny parse matrix
    - create→gate policy row
    - PERM-02 gate verdict + session-grant bypass tests
    - LINE-01 stamped note round-trip tests
  affects:
    - '02-02: parseMode + session-state implementation (these tests go GREEN)'
    - '02-03: gate dispatch wiring (PERM-02 tests go GREEN)'
    - '02-03: lineage stamp implementation (LINE-01 tests go GREEN)'
tech_stack:
  added: []
  patterns:
    - 'vitest describe/it.each for parse matrix tests (mirrors parseRole pattern)'
    - 'vi.doMock for session-state module replacement in PERM-02 bypass test'
key_files:
  created:
    - tests/unit/contracts/ast/lineage-stamp.test.ts
    - tests/unit/auth/agent-ok-predicate.test.ts
  modified:
    - tests/unit/auth/role-resolver.test.ts
    - tests/unit/auth/operation-policy.test.ts
    - tests/unit/tools/unified/OmniFocusWriteTool.test.ts
    - tests/unit/tools/unified/verifier/WriteVerifier.test.ts
decisions:
  - 'Wave 0 tests remain RED intentionally — no production code modified'
  - 'parseMode import added to role-resolver.test.ts even though function not yet exported — causes clean TypeError on
    all 8 rows'
  - 'agent/create/task → gate row changed from allow to reflect D-01 policy intent — RED until Wave 1 policy flip'
  - 'PERM-02 session-grant bypass test uses vi.doMock (not vi.mock hoisting) to allow conditional mocking in afterEach'
  - 'WriteVerifier.test.ts imports composeLineageStamp at module level — whole file goes RED with Cannot find module'
metrics:
  duration: '~5 minutes'
  completed_date: '2026-06-12'
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 4
---

# Phase 02 Plan 01: Wave 0 Test Scaffolds Summary

Wave 0 acceptance contracts for Phase 2 (Capture & Permission Gating). Six test locations define the acceptance shape
for every new behavior before production code lands. All tests run RED.

## TL;DR

```mermaid
flowchart LR
    W0["Wave 0\n02-01-PLAN\nTest scaffolds (RED)"] --> W1["Wave 1\n02-02-PLAN\nparseMode + policy flip\n+ session-state"]
    W1 --> W2["Wave 2\n02-03-PLAN\nGate dispatch + lineage\n+ schema wiring"]
    W2 --> W3["Wave 3\n02-04-PLAN\nPredicate + integration\n+ human checkpoint"]

    classDef done fill:#c8e6c9,stroke:#388e3c
    classDef active fill:#fff9c4,stroke:#f9a825
    classDef future fill:#e8eaf6,stroke:#5c6bc0

    class W0 done
    class W1 active
    class W2,W3 future
```

## What Was Built

Six test locations in RED state, covering all Phase 2 requirements:

| File                                                      | Status         | Covers                                                                |
| --------------------------------------------------------- | -------------- | --------------------------------------------------------------------- |
| `tests/unit/contracts/ast/lineage-stamp.test.ts`          | NEW — RED      | LINE-01: stamp append, idempotency, undefined-note, overrides         |
| `tests/unit/auth/agent-ok-predicate.test.ts`              | NEW — RED      | PERM-01: predicate structure, AST compile, OmniJS emit, negative case |
| `tests/unit/auth/role-resolver.test.ts`                   | EXTENDED — RED | D-05: parseMode 8-row it.each matrix                                  |
| `tests/unit/auth/operation-policy.test.ts`                | EXTENDED — RED | D-01: agent/create/task → gate (was allow)                            |
| `tests/unit/tools/unified/OmniFocusWriteTool.test.ts`     | EXTENDED — RED | PERM-02: POLICY_GATE_CAPTURE_CONFIRM + session-grant bypass           |
| `tests/unit/tools/unified/verifier/WriteVerifier.test.ts` | EXTENDED — RED | LINE-01: stamped note round-trip, Pitfall 4 guard                     |

## RED State Evidence

`npm run test:unit` exits non-zero: **6 test files failing, 14 tests failing**.

Failure modes:

- `lineage-stamp.test.ts`: `Cannot find module 'src/contracts/ast/lineage.js'` (import error — file does not exist)
- `WriteVerifier.test.ts`: `Cannot find module 'src/contracts/ast/lineage.js'` (same — whole file RED)
- `agent-ok-predicate.test.ts`: `agentOkayPredicate is not a function` (export not yet in filters.ts)
- `role-resolver.test.ts` parseMode block: `parseMode is not a function` (export not yet in role-resolver.ts)
- `operation-policy.test.ts` create row: expected `gate`, received `allow` (policy not yet flipped)
- `OmniFocusWriteTool.test.ts` PERM-02 block: `result.error.code` is not `POLICY_GATE_CAPTURE_CONFIRM` (gate dispatch
  not yet wired)

## Commits

| Hash       | Message                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------- |
| `6132561c` | test(02-01): add Wave 0 scaffold — lineage-stamp + agent-ok-predicate (RED)                 |
| `48058475` | test(02-01): extend role-resolver, operation-policy, and WriteTool with Phase 2 cases (RED) |
| `fd7745dd` | test(02-01): extend WriteVerifier.test.ts with LINE-01 lineage stamp round-trip (RED)       |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan creates test files only. No production code was touched.

## Threat Flags

None — Wave 0 introduces no new trust surfaces (test-only code).

## Self-Check: PASSED

Files exist:

- `tests/unit/contracts/ast/lineage-stamp.test.ts` — FOUND
- `tests/unit/auth/agent-ok-predicate.test.ts` — FOUND
- `tests/unit/auth/role-resolver.test.ts` — FOUND (extended)
- `tests/unit/auth/operation-policy.test.ts` — FOUND (extended)
- `tests/unit/tools/unified/OmniFocusWriteTool.test.ts` — FOUND (extended)
- `tests/unit/tools/unified/verifier/WriteVerifier.test.ts` — FOUND (extended)

Commits exist:

- `6132561c` — FOUND
- `48058475` — FOUND
- `fd7745dd` — FOUND
