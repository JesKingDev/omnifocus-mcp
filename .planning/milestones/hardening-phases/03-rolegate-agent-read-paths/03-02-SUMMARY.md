---
phase: 03-rolegate-agent-read-paths
plan: '02'
subsystem: auth/gate
tags: [role-gate, policy, dispatch, listools-trim, calltool-gate, tdd]
dependency_graph:
  requires:
    - 03-01-SUMMARY.md # allowedOperations, normalizeArgsToPolicy, PolicyItem from operation-policy.ts
  provides:
    - registerTools with role+context params (5-arg signature)
    - ListTools role-aware advertisement via getRoleAwareSchema on OmniFocusWriteTool
    - CallTool pre-dispatch gate: normalizeArgsToPolicy → decide(role) → structured return
    - src/index.ts passes role and context into registerTools
    - src/session-manager.ts passes this.role and this.context (Phase 4 seam wired)
    - OmniFocusWriteTool uses normalizeArgsToPolicy shared helper (D-11)
    - SystemTool constructor accepts optional context (whoami seam for Plan 03)
    - GATE-01/02 unit tests active and passing
  affects:
    - src/tools/index.ts (consumers of registerTools must pass role now)
    - tests/unit/index.test.ts (mock updated for 5-arg signature)
tech_stack:
  added: []
  patterns:
    - closure-captured role in CallTool handler (D-10 anti-re-read pattern)
    - getRoleAwareSchema per-request new object (Pitfall 5 — never mutate inputSchema in place)
    - MCP content envelope wrapping for structured error return (Pitfall 2 — no McpError throw)
    - FakeServer test pattern for handler-level dispatch gate testing
key_files:
  created: []
  modified:
    - src/tools/index.ts
    - src/tools/unified/OmniFocusWriteTool.ts
    - src/tools/system/SystemTool.ts
    - src/index.ts
    - src/session-manager.ts
    - tests/unit/tools/index-rolegate.test.ts
    - tests/unit/index.test.ts
key_decisions:
  - 'OWNER test required OMNIFOCUS_MCP_ROLE=owner env var: dispatch gate passes via closure-captured owner role, but
    Write tool funnel still calls parseRole() from env (Phase 4 deferred D-10). Test sets env var to align both layers.'
  - 'normalizeArgsToPolicy works on args.mutation (WriteInput has a mutation key) — equivalent to inline compiled path
    because compiler operation discriminator mirrors args.mutation.operation exactly'
  - 'getRoleAwareSchema uses void role to suppress unused-param warning; role is implied by the allowedOps/tagActions
    arrays derived from allowedOperations(role) at the call site'
  - 'index.test.ts mock updated to 5-arg signature with expect.any(String) + expect.any(Object) for role + context args'
requirements-completed:
  - GATE-01
  - GATE-02
  - GATE-03
duration: 523s
completed: '2026-06-05'
---

# Phase 3 Plan 02: RoleGate Dispatch — registerTools role threading + ListTools trim + CallTool gate

**Role-aware registerTools: AGENT ListTools omits delete/bulk_delete from the operation enum; CallTool gate returns
POLICY_DENY_DELETE before tool.execute() fires**

## Performance

- **Duration:** 523s (~9 min)
- **Started:** 2026-06-05T00:49:31Z
- **Completed:** 2026-06-05T01:07:54Z
- **Tasks:** 2 (Task 1: signature+schema+normalization; Task 2: CallTool gate + call sites, TDD)
- **Files modified:** 7

## Accomplishments

- `registerTools(server, cache, pendingOps, role, context)` — 5-arg signature, fail-safe default `'agent'`
- `OmniFocusWriteTool.getRoleAwareSchema()` trims operation and action enums per role; new object per call, base
  inputSchema unchanged (D-01/D-02)
- Inline normalization block in `OmniFocusWriteTool.executeValidated` replaced with `normalizeArgsToPolicy(args)` shared
  helper (D-11 OMN-119 drift guard)
- Pre-dispatch CallTool gate in `registerTools`:
  `normalizeArgsToPolicy → decide(role) → structured content envelope return` — never throws McpError (D-09)
- Both call sites updated: `src/index.ts` and `src/session-manager.ts` pass explicit `role` and `context`
- `SystemTool` constructor accepts optional `context` (whoami seam for Plan 03)
- All GATE-01 and GATE-02 tests active and passing; Phase 2 regression suite unaffected

## Task Commits

1. **Task 1: registerTools signature + ListTools + D-11 normalization** - `c5eff3c` (feat)
2. **Task 2 RED: activate GATE-01/02 tests** - `e12b2fa` (test)
3. **Task 2 GREEN: CallTool gate + call sites** - `7b7ab72` (feat)

## Files Created/Modified

- `src/tools/index.ts` — registerTools 5-arg signature; role-aware ListTools handler; CallTool pre-dispatch gate
- `src/tools/unified/OmniFocusWriteTool.ts` — getRoleAwareSchema method; normalizeArgsToPolicy replaces inline block
- `src/tools/system/SystemTool.ts` — optional context param in constructor (Plan 03 whoami seam)
- `src/index.ts` — constructs ResolvedContext; passes role+context into registerTools
- `src/session-manager.ts` — resolves role+identity at construction; this.role/this.context passed to registerTools
  (Phase 4 seam)
- `tests/unit/tools/index-rolegate.test.ts` — GATE-01/02 tests activated (was all it.todo in Wave 0)
- `tests/unit/index.test.ts` — mock updated for 5-arg registerTools signature

## Decisions Made

- OWNER test sets `OMNIFOCUS_MCP_ROLE=owner` env var: the dispatch gate uses the closure-captured owner role, but the
  Write tool's funnel still calls `parseRole()` from env (Phase 4 deferred D-10 item). Both layers need the same role
  signal for owner pass-through to work end-to-end until Phase 4 wires per-token resolution.
- `getRoleAwareSchema` receives `role` but uses `void role` to suppress the unused-param linter. The role-filtering work
  is done upstream by `allowedOperations(role)` at the call site in ListTools; the method only needs the
  already-filtered arrays. This is clean — the method signature documents intent without duplicating logic.
- `normalizeArgsToPolicy(args as Record<string, unknown>)` works on `WriteInput` because `WriteInput.mutation.operation`
  mirrors `compiled.operation` exactly — the compiler's discriminator doesn't change the operation string.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] index.test.ts mock signature mismatch after registerTools signature change**

- **Found during:** Task 2 GREEN (full test suite run)
- **Issue:** `tests/unit/index.test.ts` mock and assertion used the 3-arg signature; after changing to 5 args the
  `toHaveBeenCalledWith` assertion failed with "Number of calls: 1" mismatch.
- **Fix:** Updated 3 locations in index.test.ts: the top-level mock `vi.fn()` signature, the `beforeEach`
  `mockImplementation`, and the `waitForPendingOps` `mockImplementation` to accept `_role?` and `_context?` params.
  Updated the `toHaveBeenCalledWith` assertion to use `expect.any(String)` and `expect.any(Object)` for the new args.
- **Files modified:** `tests/unit/index.test.ts`
- **Commit:** 7b7ab72

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug) **Impact on plan:** Required for correctness — the test was asserting
the old 3-arg signature after the change. No scope creep.

## Issues Encountered

None — plan executed as written with one auto-fix for test mock signature drift.

## Known Stubs

Wave 0 stubs carried forward (intentional — Plan 04 activation):

| File                                                | Stub                        | Reason                                     |
| --------------------------------------------------- | --------------------------- | ------------------------------------------ |
| `tests/unit/tools/index-rolegate.test.ts`           | 3 `it.todo` (READ-01/02/03) | Plan 04 implements agent read pass-through |
| `tests/unit/tools/system/SystemTool-whoami.test.ts` | 3 `it.todo`                 | Plan 03 implements whoami op               |

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries introduced. The dispatch gate closes the T-3-mangle and
T-3-noenvelope threats from the plan's STRIDE register.

## Next Phase Readiness

- RegisterTools role threading complete — both stdio and HTTP session paths pass role
- GATE-01 (ListTools trim) and GATE-02 (CallTool dispatch deny/gate) verified by unit tests
- Phase 4 seam: `session-manager.ts` has `this.role` + `this.context` ready for per-token replacement
- Plan 03 can implement `whoami` in SystemTool — `_context` field is wired

## Self-Check: PASSED

Verified after writing:

- `src/tools/index.ts` — contains `allowedOperations`, `decide`, `normalizeArgsToPolicy` imports
- `src/tools/unified/OmniFocusWriteTool.ts` — contains `getRoleAwareSchema` and `normalizeArgsToPolicy`
- `src/index.ts` — contains `registerTools(stdioServer, cacheManager, pendingOperations, role`
- `src/session-manager.ts` — contains `this.role`
- `tests/unit/tools/index-rolegate.test.ts` — GATE-01/02 tests active (was all it.todo)
- Commits c5eff3c, e12b2fa, 7b7ab72 — all present in git log
- Full test suite: 2294 passed, 6 todo, 0 failures

---

_Phase: 03-rolegate-agent-read-paths_ _Completed: 2026-06-05_
