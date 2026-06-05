---
phase: 03-rolegate-agent-read-paths
plan: '03'
subsystem: auth/system-tool
tags: [whoami, role-gate, dual-schema, tdd, redaction]
dependency_graph:
  requires:
    - 03-02-SUMMARY.md # SystemTool constructor _context seam, registerTools 5-arg signature
  provides:
    - SystemTool whoami op (Zod + inputSchema + description + executeValidated + getWhoami)
    - AGENT whoami: { role, roleSource } — identity structurally absent (D-13/D-15)
    - OWNER whoami: { role, identity: { transport, roleSource, principal } } — principal null
    - Dual-schema invariant satisfied: Zod enum, inputSchema getter, description all include 'whoami'
    - Activated SystemTool-whoami.test.ts (was 3 it.todo, now 3 real passing tests)
  affects:
    - src/tools/system/SystemTool.ts
    - tests/unit/tools/system/SystemTool-whoami.test.ts
    - tests/unit/tools/base.test.ts (regression fix)
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN cycle (test-first, then implement)
    - Structural key omission for AGENT path (not null/undefined, just absent)
    - Dual-schema invariant: Zod + inputSchema getter + description in one commit
    - ResolvedContext threaded via constructor _context field (Plan 02 seam)
key_files:
  created: []
  modified:
    - src/tools/system/SystemTool.ts
    - tests/unit/tools/system/SystemTool-whoami.test.ts
    - tests/unit/tools/base.test.ts
key_decisions:
  - 'getWhoami() uses this._context (protected readonly _context wired in Plan 02) — no constructor
    change needed; the seam was pre-wired'
  - 'AGENT path builds data object with only role+roleSource keys — identity key not set at all,
    satisfying D-15 structural-omission requirement; test asserts toBeUndefined()'
  - 'base.test.ts SystemTool inputSchema test had a hard-coded 4-value enum — updated to 5-value
    as a Rule 1 auto-fix; the test was asserting the correct invariant, just against a stale snapshot'
requirements-completed:
  - GATE-01
  - GATE-02
duration: 192s
completed: '2026-06-05'
---

# Phase 3 Plan 03: SystemTool whoami op — dual-schema + AGENT/OWNER redaction

**whoami op added to SystemTool with role-scoped redaction: AGENT path structurally omits identity; OWNER path returns
full identity block; Zod enum, inputSchema getter, and description all updated in one commit (dual-schema invariant)**

## Performance

- **Duration:** 192s (~3 min)
- **Started:** 2026-06-05T01:02:39Z
- **Completed:** 2026-06-05T01:05:51Z
- **Tasks:** 1 (TDD: RED → GREEN)
- **Files modified:** 3

## Accomplishments

- `SystemToolSchema` Zod enum: `'whoami'` added alongside `version`/`diagnostics`/`metrics`/`cache`
- `inputSchema` getter: `properties.operation.enum` and description updated — dual-schema invariant satisfied
- `description` string: mentions `whoami` and its purpose (confirms current connection role/identity)
- `executeValidated` switch: `case 'whoami': return this.getWhoami()`
- `getWhoami()` private method:
  - AGENT path: builds `{ role, roleSource }` — no `identity` key at all (D-13/D-15)
  - OWNER path: builds `{ role, identity: { transport, roleSource, principal } }` — `principal` null until Phase 4
- `SystemTool-whoami.test.ts`: 3 real tests activated (was 3 `it.todo`)
  - AGENT: `data.identity` is `undefined`
  - OWNER: `data.identity.principal` is `null`
  - Dual-schema: `inputSchema.properties.operation.enum` includes `'whoami'`

## Task Commits

1. **RED: add failing whoami tests** - `99377f2` (test)
2. **GREEN: add whoami op to SystemTool** - `cded520` (feat)

## Files Created/Modified

- `src/tools/system/SystemTool.ts` — Zod enum, inputSchema getter, description, case + getWhoami() method
- `tests/unit/tools/system/SystemTool-whoami.test.ts` — 3 real tests replacing it.todo stubs
- `tests/unit/tools/base.test.ts` — inputSchema snapshot updated (Rule 1 auto-fix)

## Decisions Made

- `getWhoami()` references `this._context` (the `protected readonly _context` field wired in Plan 02). No constructor
  change needed — the seam was pre-wired.
- Structural key omission on the AGENT path: the data object is `{ role, roleSource }` without any `identity` key.
  TypeScript does not require `undefined`-valued keys to be present, so this is clean.
- `base.test.ts` had a hard-coded 4-value enum snapshot — updated as a Rule 1 fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] base.test.ts SystemTool inputSchema snapshot had stale 4-value enum**

- **Found during:** Task 1 GREEN (full test suite run)
- **Issue:** `tests/unit/tools/base.test.ts` line 551 asserted `enum: ['version', 'diagnostics', 'metrics', 'cache']`.
  After adding `whoami`, the assertion failed.
- **Fix:** Updated the expected enum to include `'whoami'`.
- **Files modified:** `tests/unit/tools/base.test.ts`
- **Commit:** cded520

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug) **Impact on plan:** Required for correctness — test was asserting the
old 4-value enum. No scope creep.

## TDD Gate Compliance

RED gate commit: `99377f2` (test) GREEN gate commit: `cded520` (feat) Both gates satisfied.

## Known Stubs

Wave 0 stubs still carried forward (intentional — Plan 04 activation):

| File                                      | Stub                        | Reason                                     |
| ----------------------------------------- | --------------------------- | ------------------------------------------ |
| `tests/unit/tools/index-rolegate.test.ts` | 3 `it.todo` (READ-01/02/03) | Plan 04 implements agent read pass-through |

## Threat Flags

None. `whoami` is read-only; AGENT path structurally omits the `identity` key, closing T-3-leak. Dual-schema test
enforces T-3-dual-schema parity on every test run.

## Next Phase Readiness

- Plan 04 can implement READ-01/02/03 agent read pass-through — all infrastructure in place
- `whoami` provides a CallTool-based role assertion for future integration tests
- `principal` field is `null` as expected; Phase 4 will populate via bearer token resolution

## Self-Check: PASSED

- `src/tools/system/SystemTool.ts` — contains `whoami` (7 occurrences), `identity` (9 occurrences), `ResolvedContext` (3
  occurrences)
- `tests/unit/tools/system/SystemTool-whoami.test.ts` — 3 real tests (no more `it.todo`)
- Commits `99377f2`, `cded520` — both present in git log
- Full test suite: 2297 passed, 3 todo, 0 failures
- `npm run build` — exits 0

---

_Phase: 03-rolegate-agent-read-paths_ _Completed: 2026-06-05_
