---
phase: 03-rolegate-agent-read-paths
plan: '01'
subsystem: auth/policy
tags: [policy, role-gate, tdd, wave-0]
dependency_graph:
  requires:
    - 02-03-SUMMARY.md # operation-policy.ts with decide() + AGENT_POLICY
  provides:
    - allowedOperations(role) export from src/auth/operation-policy.ts
    - normalizeArgsToPolicy export from src/auth/operation-policy.ts
    - PolicyItem type export
    - D-06 parity test block in operation-policy.test.ts
    - Wave 0 stub files for GATE-01/02 and READ-01/02/03 and whoami tests
  affects:
    - src/tools/index.ts (Wave 2 — consumes allowedOperations, normalizeArgsToPolicy)
    - tests/unit/auth/operation-policy.test.ts (extended)
tech_stack:
  added: []
  patterns:
    - forward-read over AGENT_POLICY for capability enumeration (D-04)
    - shared normalization helper at raw-args level for drift prevention (D-11)
    - D-06 parity test: advertise-enforce symmetry via allowedOperations + decide()
key_files:
  created:
    - tests/unit/tools/index-rolegate.test.ts
    - tests/unit/tools/system/SystemTool-whoami.test.ts
  modified:
    - src/auth/operation-policy.ts
    - tests/unit/auth/operation-policy.test.ts
decisions:
  - 'PolicyItem type placed before new functions in operation-policy.ts; no export of AGENT_POLICY needed — parity test
    uses allowedOperations() + decide() without direct table access'
  - 'D-06 parity test uses known-ops list for flat non-deny assertion; tag_manage excluded from flat-op decide() check
    (subtable requires a valid action target)'
  - 'Wave 0 stubs use it.todo markers (vitest pending); sonarjs/todo-tag fires as warning only — pre-commit hooks pass'
metrics:
  duration: '350s'
  completed: '2026-06-05'
  tasks: 2
  files: 4
---

# Phase 3 Plan 01: Policy Foundation — allowedOperations, normalizeArgsToPolicy, Wave 0 Stubs

Policy foundation for the RoleGate layer: `allowedOperations(role)` capability enumerator and `normalizeArgsToPolicy`
shared normalization helper exported from `src/auth/operation-policy.ts`, plus D-06 parity test block and Wave 0 test
stub files for all GATE/READ/whoami requirements.

## What Was Built

### Task 1 — allowedOperations and normalizeArgsToPolicy (commit 546a48d)

Two new exports added after `decide()` in `src/auth/operation-policy.ts`:

**`allowedOperations(role)`** — forward-read over `AGENT_POLICY` (D-04). Returns `{ operations, tagManageActions }`. For
OWNER: all keys. For AGENT: all non-deny entries (allow + gate both included per D-05 — gated ops are
advertised-but-guarded, not hidden). `tag_manage` itself is always included in operations for AGENT; all tag_manage
subtable entries that are not `'deny'` go into `tagManageActions`.

**`normalizeArgsToPolicy(args)`** — flattens raw `args.mutation` into `PolicyItem[]` for `decide()` evaluation. Operates
pre-Zod-compile so the dispatch gate in `index.ts` can call it without importing `MutationCompiler` (D-11 — OMN-119
normalization drift guard). Returns `[]` for args without a mutation field (read ops, system ops). Handles batch,
bulk_delete, tag_manage, and simple mutations.

**`PolicyItem` type** — `{ operation: string; target: string }` — exported for use by both the dispatch gate and the
Write tool funnel.

No new imports needed; `Role` and `PolicyOutcome` were already imported.

### Task 2 — D-06 parity tests and Wave 0 stubs (commit bf65291)

**Extended `tests/unit/auth/operation-policy.test.ts`:** Added `describe('advertise⟺enforce parity (D-06)')` block with
three tests:

1. Every AGENT-advertised op resolves to `decide() !== 'deny'`
2. Every non-denied AGENT flat op is in `allowedOperations('agent').operations`
3. OWNER `allowedOperations` includes `delete` and `bulk_delete` All three tests pass.

**Created `tests/unit/tools/index-rolegate.test.ts`:** Wave 0 stub file with `it.todo` markers for GATE-01 (ListTools
trim), GATE-02 (CallTool dispatch deny/gate codes), READ-01/02/03 (read ops pass through without policy fire). Mock
cache helper copied from `write-tool-policy-guard.test.ts` ready for Wave 2 activation.

**Created `tests/unit/tools/system/SystemTool-whoami.test.ts`:** Wave 0 stub file with `it.todo` markers for whoami
AGENT redaction (D-15), whoami OWNER full identity block, and dual-schema parity for `whoami`. Mock cache helper
included ready for Wave 3 activation.

## Verification

- `npm run build` — exits 0 (TypeScript clean)
- `npm run test:unit` — 2288 tests pass, 12 pending (all `it.todo` stubs), 0 failures
- `grep "export function allowedOperations" src/auth/operation-policy.ts` — present
- `grep "export function normalizeArgsToPolicy" src/auth/operation-policy.ts` — present
- `grep "export type PolicyItem" src/auth/operation-policy.ts` — present
- `grep "advertise" tests/unit/auth/operation-policy.test.ts` — present (≥1)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tag_manage fails decide() check with target='task'**

- **Found during:** Task 2 first test run
- **Issue:** The parity test iterated `knownNonDenyOps` including `tag_manage` and called
  `decide('agent', 'tag_manage', 'task')` — but `'task'` is not a valid tag_manage subtable key, so `decide()` correctly
  returns `'deny'` (fail-closed). The test expectation was wrong.
- **Fix:** Excluded `tag_manage` from the flat-op loop; added a separate assertion that `tag_manage` appears in
  `operations` (D-05 advertise guarantee).
- **Files modified:** `tests/unit/auth/operation-policy.test.ts`
- **Commit:** bf65291

**2. [Rule 3 - Blocking] sonarjs/unused-import errors on stub file imports**

- **Found during:** Task 2 first commit attempt
- **Issue:** `eslint.config.js` includes `sonarjs.configs.recommended` which flags unused imports as errors (even in
  test files). The initial `allowedOperations` and `SystemTool` imports in stub files were flagged.
- **Fix:** Moved those imports to commented-out lines (Wave 2/3 activation markers). The `vi` and `CacheManager` imports
  remain active since `createMockCache()` uses them.
- **Files modified:** `tests/unit/tools/index-rolegate.test.ts`, `tests/unit/tools/system/SystemTool-whoami.test.ts`
- **Commit:** bf65291

## Known Stubs

Wave 0 stubs are intentional — not data-wiring gaps:

| File                                                | Stub              | Reason                                                                 |
| --------------------------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| `tests/unit/tools/index-rolegate.test.ts`           | 9 `it.todo` tests | Wave 2 implements `registerTools` role param + ListTools/CallTool gate |
| `tests/unit/tools/system/SystemTool-whoami.test.ts` | 3 `it.todo` tests | Wave 3 implements `whoami` op + role-aware redaction in SystemTool     |

## Threat Flags

None. This plan adds pure utility exports and test infrastructure with no new network endpoints, auth paths, or trust
boundaries.

## Self-Check: PASSED

- `src/auth/operation-policy.ts` — exists and contains `export function allowedOperations`
- `src/auth/operation-policy.ts` — contains `export function normalizeArgsToPolicy`
- `src/auth/operation-policy.ts` — contains `export type PolicyItem`
- `tests/unit/auth/operation-policy.test.ts` — contains string `advertise`
- `tests/unit/tools/index-rolegate.test.ts` — exists
- `tests/unit/tools/system/SystemTool-whoami.test.ts` — exists
- Commit 546a48d — present in git log
- Commit bf65291 — present in git log
