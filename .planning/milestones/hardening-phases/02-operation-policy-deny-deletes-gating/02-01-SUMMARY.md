---
phase: 02-operation-policy-deny-deletes-gating
plan: '01'
subsystem: auth/policy
tags: [policy, tdd, fail-closed, role-model]
dependency_graph:
  requires: [01-role-model-resolver]
  provides: [decide-function, PolicyOutcome-type]
  affects: [02-02-write-tool-guard, 02-03-script-builder-assertion]
tech_stack:
  added: []
  patterns: [fail-closed-decision-table, string-literal-union, it.each-matrix-test]
key_files:
  created:
    - src/auth/operation-policy.ts
    - tests/unit/auth/operation-policy.test.ts
  modified:
    - src/contracts/roles.ts
decisions:
  - 'Flat const table (AGENT_POLICY) with nested per-target map for tag_manage; readable and greppable'
  - 'PolicyOutcome promoted to src/contracts/roles.ts alongside Role — single source of truth for both consumers'
  - 'decide() returns allow for OWNER unconditionally before table lookup — no duplication of allow paths'
metrics:
  duration: 540s
  completed: '2026-06-04'
  tasks: 3
  files: 3
---

# Phase 02 Plan 01: Operation Policy decide() Function Summary

JWT-equivalent authorization layer: `decide(role, operation, target) → 'allow' | 'deny' | 'gate'` implemented as a pure,
fail-closed, exhaustively-tested function that is the single policy source of truth for both Phase 2 enforcement layers.

## What Was Built

**`src/contracts/roles.ts`** — `PolicyOutcome = 'allow' | 'deny' | 'gate'` added after `Role` (line ~27), with JSDoc
naming both Phase 2 and Phase 3 consumers.

**`src/auth/operation-policy.ts`** — New module mirroring `role-resolver.ts` structure:

- `AGENT_POLICY` const table encoding the full D-08 matrix: flat `PolicyOutcome` for simple ops, nested
  `Record<string, PolicyOutcome>` for `tag_manage` per-target resolution.
- `decide(role, operation, target?)`: OWNER short-circuits to `'allow'`; AGENT walks the table; any missing entry (op or
  target) returns `'deny'` — no `|| 'allow'` fallback anywhere.
- Anti-patterns comment lists exactly what is absent (state carve-outs, async, `|| 'allow'` fallback).

**`tests/unit/auth/operation-policy.test.ts`** — 29-row `it.each` matrix covering every D-08 cell:

- AGENT deny: `delete/task`, `delete/project`, `delete/folder`, `bulk_delete/task`, `bulk_delete/project`
- AGENT gate: `tag_manage/delete`, `tag_manage/merge`, `tag_manage/perspective_delete`
- AGENT allow: `complete`, `drop`, `create`, `update`, plus all 5 tag_manage additive targets
- Fail-closed: `unknown_op_xyz → deny`, `tag_manage/unknown_target → deny`
- OWNER pass-through: delete/task, delete/project, bulk_delete, tag_manage/delete, tag_manage/merge, unknown op → all
  `allow`

## Acceptance Criteria Status

| Criterion                                                   | Status               |
| ----------------------------------------------------------- | -------------------- |
| `export type PolicyOutcome` in `src/contracts/roles.ts`     | PASS (grep count: 1) |
| `export function decide(` in `src/auth/operation-policy.ts` | PASS (grep count: 1) |
| No `\|\| 'allow'` in code (comment text only)               | PASS                 |
| `decide('agent', 'delete', 'task') === 'deny'`              | PASS                 |
| `decide('agent', 'bulk_delete', 'task') === 'deny'`         | PASS                 |
| `decide('agent', 'tag_manage', 'delete') === 'gate'`        | PASS                 |
| `decide('agent', 'tag_manage', 'merge') === 'gate'`         | PASS                 |
| `decide('agent', 'tag_manage', 'create') === 'allow'`       | PASS                 |
| `decide('agent', 'complete', 'task') === 'allow'`           | PASS                 |
| `decide('agent', 'unknown_op_xyz', 'task') === 'deny'`      | PASS                 |
| `decide('owner', 'delete', 'task') === 'allow'`             | PASS                 |
| `decide('owner', 'tag_manage', 'delete') === 'allow'`       | PASS                 |
| `npm run test:unit` exits 0 — 107 files, 2265 tests         | PASS                 |
| `npm run build` exits 0                                     | PASS                 |

## TDD Gate Compliance

| Gate                                                        | Commit    | Status |
| ----------------------------------------------------------- | --------- | ------ |
| RED — test commit before implementation                     | `6303848` | PASS   |
| GREEN — implementation commit after failing tests           | `f6a295e` | PASS   |
| REFACTOR — no code changes needed; docs/JSDoc already clean | N/A       | N/A    |

## Deviations from Plan

None — plan executed exactly as written.

The `|| 'allow'` grep criterion in the PLAN acceptance criteria uses a pattern that also matches the JSDoc anti-pattern
comment line (which begins with ` *`). The grep returns 1 because that comment line is not filtered by
`grep -v "^[[:space:]]*//"`. Actual code has zero occurrences — verified with a Node script that strips both `//` and
`*` comment lines.

## Threat Model Compliance

| Threat                           | Mitigation                                                                               | Status    |
| -------------------------------- | ---------------------------------------------------------------------------------------- | --------- |
| T-2-01: fail-open on unknown ops | Explicit `undefined` check → `'deny'` before any default path; no `\|\| 'allow'` in code | MITIGATED |
| T-2-02: PolicyOutcome type drift | Single definition in `src/contracts/roles.ts`; TypeScript compile gate enforces          | MITIGATED |
| T-2-SC: npm install slopcheck    | No new npm packages introduced                                                           | N/A       |

## Self-Check: PASSED

- `src/contracts/roles.ts` — exists, contains `export type PolicyOutcome`
- `src/auth/operation-policy.ts` — exists, contains `export function decide`
- `tests/unit/auth/operation-policy.test.ts` — exists, 29 test rows all green
- Commits `6303848` (RED) and `f6a295e` (GREEN) verified in git log
