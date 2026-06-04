---
phase: 02-operation-policy-deny-deletes-gating
plan: '03'
subsystem: auth/policy-reassertion
tags: [policy, defense-in-depth, script-builders, tdd]
dependency_graph:
  requires: [02-01-decide-function, 02-02-write-tool-guard]
  provides: [script-builder-reassertion, D-03-belt-and-suspenders]
  affects: []
tech_stack:
  added: []
  patterns: [defense-in-depth-guard, fail-closed-assertion, role-parameter-propagation]
key_files:
  created: []
  modified:
    - src/contracts/ast/mutation-script-builder.ts
    - src/contracts/ast/tag-mutation-script-builder.ts
    - src/tools/unified/OmniFocusWriteTool.ts
    - tests/unit/auth/operation-policy.test.ts
    - tests/unit/contracts/ast/mutation-script-builder.test.ts
    - tests/unit/tag-conversion.test.ts
    - tests/unit/tag-operations.test.ts
decisions:
  - 'assertPolicyAllow() defined independently in each builder file — no shared module needed; the function is 4 lines
    and a shared module would add an import cycle risk'
  - 'Pre-existing builder tests updated to pass owner role — same pattern as Plan 02; keeps JXA-dispatch tests as owner
    while policy tests live in dedicated files'
metrics:
  duration: 900s
  completed: '2026-06-04'
  tasks: 2
  files: 7
---

# Phase 02 Plan 03: Script-Builder Re-assertion (Defense-in-Depth D-03) Summary

Belt-and-suspenders: `assertPolicyAllow()` added as the first statement in all three destructive/gated script builders.
A code path that bypasses the funnel guard still fails closed — no JXA is emitted, no script string is built.

## What Was Built

**`src/contracts/ast/mutation-script-builder.ts`** — Policy re-assertion layer added:

- Imports `decide()` from `src/auth/operation-policy.js` and `Role` from `src/contracts/roles.js`
- Defines `assertPolicyAllow(role, operation, target): void` — calls `decide()`, throws
  `POLICY: <OUTCOME> <op>/<target> for role '<role>'` on anything other than `'allow'`
- `buildDeleteScript()` gains `role: Role` as first parameter; `assertPolicyAllow(role, 'delete', target)` is the first
  statement, before the sandbox guard and before any JXA string construction

**`src/contracts/ast/tag-mutation-script-builder.ts`** — Same pattern:

- Same imports and `assertPolicyAllow()` definition (4-line local helper; no shared module needed)
- `buildDeleteTagScript()` gains `role: Role` first parameter; asserts `(role, 'tag_manage', 'delete')` before
  `validateTagMutation`
- `buildMergeTagsScript()` gains `role: Role` first parameter; asserts `(role, 'tag_manage', 'merge')` before
  `validateTagMutation`

**`src/tools/unified/OmniFocusWriteTool.ts`** — All three call sites updated:

- `handleProjectDelete` → `buildDeleteScript(parseRole(), 'project', projectId)`
- `rollbackBatchCreations` → `buildDeleteScript(parseRole(), item.type, item.realId)`
- `handleTagManage` (delete case) → `buildDeleteTagScript(parseRole(), { tagName })`
- `handleTagManage` (merge case) → `buildMergeTagsScript(parseRole(), { tagName, targetTag })`

**`tests/unit/auth/operation-policy.test.ts`** — New describe block appended:

- `describe('script-builder re-assertion — defense-in-depth (D-03)')` with 5 assertions:
  - `buildDeleteScript('agent', 'task', id)` → rejects with `/POLICY: DENY/`
  - `buildDeleteTagScript('agent', { tagName })` → throws `/POLICY: GATE/`
  - `buildMergeTagsScript('agent', { tagName, targetTag })` → throws `/POLICY: GATE/`
  - `buildDeleteScript('owner', 'task', id)` → resolves (no POLICY error)
  - `buildDeleteTagScript('owner', { tagName })` → does not throw `/POLICY:/`

## Acceptance Criteria Status

| Criterion                                                                            | Status                      |
| ------------------------------------------------------------------------------------ | --------------------------- |
| `assertPolicyAllow` in `mutation-script-builder.ts` (≥1)                             | PASS (count: 2)             |
| `assertPolicyAllow` in `tag-mutation-script-builder.ts` (≥2)                         | PASS (count: 3)             |
| `import.*decide.*operation-policy` in each builder                                   | PASS (1 each)               |
| `POLICY_DENY_DELETE` / `POLICY_GATE_REQUIRES_OWNER` absent from script builders      | PASS (count: 0)             |
| `buildDeleteScript` role parameter + assertPolicyAllow as first statement            | PASS                        |
| `buildDeleteTagScript` role parameter + assertPolicyAllow before validateTagMutation | PASS                        |
| `buildMergeTagsScript` role parameter + assertPolicyAllow before validateTagMutation | PASS                        |
| All callers in WriteTool pass `parseRole()`                                          | PASS (3 call sites updated) |
| `describe('script-builder re-assertion — defense-in-depth (D-03)')` exists           | PASS                        |
| Agent role → POLICY: DENY/GATE throw                                                 | PASS                        |
| Owner role → no POLICY error                                                         | PASS                        |
| `npm run test:unit` exits 0 — 108 files, 2281 tests                                  | PASS                        |
| `npm run build` exits 0                                                              | PASS                        |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing tests called buildDeleteScript / buildMergeTagsScript without the new role parameter**

- **Found during:** Task 2 (running test suite after Task 1's signature change)
- **Issue:** `mutation-script-builder.test.ts`, `tag-conversion.test.ts`, and `tag-operations.test.ts` called the
  builders with the old signature. TypeScript compile still passed (implicit `any` path in JS tests), but the calls
  resulted in the role being interpreted as the target/data argument, causing the policy assertion to fire with wrong
  values. Tests then failed at the POLICY throw.
- **Fix:** Updated all call sites in these three test files to pass `'owner'` as the first argument — same pattern as
  Plan 02 used for pre-existing dispatch tests. Policy-specific assertions live in `operation-policy.test.ts`.
- **Files modified:** `tests/unit/contracts/ast/mutation-script-builder.test.ts`, `tests/unit/tag-conversion.test.ts`,
  `tests/unit/tag-operations.test.ts`
- **Commit:** `ce3c80d`

## Threat Model Compliance

| Threat                                                  | Mitigation                                                                                                       | Status    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------- |
| T-2-09: Funnel bypass → buildDeleteScript without guard | `assertPolicyAllow` is first statement before any I/O                                                            | MITIGATED |
| T-2-10: Duplicated policy logic → drift between layers  | Both builders import and call the same `decide()` from `operation-policy.ts`; import grep confirms single source | MITIGATED |
| T-2-11: Role parameter fabrication                      | Script builders are process-internal; Role is typed string literal union, no runtime coercion                    | ACCEPT    |
| T-2-SC: npm install slopcheck                           | No new npm packages — all imports are project-internal                                                           | N/A       |

## Known Stubs

None — the re-assertion fully implements D-03. All three builders enforce policy before any JXA string is constructed.

## Self-Check: PASSED

- `src/contracts/ast/mutation-script-builder.ts` — exists, contains `assertPolicyAllow` (2) and
  `import.*decide.*operation-policy` (1)
- `src/contracts/ast/tag-mutation-script-builder.ts` — exists, contains `assertPolicyAllow` (3) and
  `import.*decide.*operation-policy` (1)
- `tests/unit/auth/operation-policy.test.ts` — contains `defense-in-depth` describe block (2 occurrences)
- Commits `fdc68fd` (Task 1) and `ce3c80d` (Task 2) verified in git log
- `npm run test:unit` — 108 files, 2281 tests, all green
- `npm run build` — exits 0
