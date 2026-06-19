---
phase: 03-routing-on-demand-trigger
plan: 01
subsystem: testing

# Dependency graph
requires:
  - phase: 02-capture-permission-gating
    provides:
      agent-ok capture stamp, FUNCTIONAL_TAG_ALLOWLIST guard, operation policy (update/create_project = allow, agent
      task-create gated via lineage)
provides:
  - routing-unplaced added to FUNCTIONAL_TAG_ALLOWLIST (D-12 marker tag passes the test-mode sandbox guard)
  - Unit tests for isTestTagAllowed covering routing-unplaced + regression guards
  - Live integration proof for the three Phase 3 routing write paths (file, marker-tag, project-create)
affects: [03-02 route-inbox-to-projects skill, 04 review/today-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Functional-tag allowlist extension (test-mode-only escape hatch; production bypasses via isTestMode gate)'
    - 'Agent-role routing integration test: lineage-bypass create + funnel writes + fullCleanup teardown (agent cannot
      delete)'

key-files:
  created:
    - .planning/phases/03-routing-on-demand-trigger/03-01-SUMMARY.md
  modified:
    - src/contracts/ast/mutation-script-builder.ts
    - tests/unit/contracts/ast/mutation-script-builder.test.ts
    - tests/integration/tools/unified/end-to-end.test.ts

key-decisions:
  - "Allowlist extended to exactly ['agent-ok', 'routing-unplaced'] — no over-widening (T-03-01)"
  - "Integration tests run under AGENT role (the real routing path), not owner — proves the skill's actual write surface"
  - 'Fixture teardown via fullCleanup() osascript sweep because agent role cannot delete (policy: deny)'

patterns-established:
  - 'routing-unplaced is a shared functional tag (like agent-ok): swept-by-containing-task, the tag definition persists
    harmlessly'
  - 'Independent read-back proves persistence, not the write echo (OMN-60 discipline) — tag-filtered read-back proves
    the OmniJS addTag bridge fired'

requirements-completed: [ROUTE-01, ROUTE-03, ROUTE-04]

# Metrics
duration: ~50min
completed: 2026-06-14
---

# Phase 03 / Plan 01: Routing mutation infrastructure Summary

**`routing-unplaced` added to the functional-tag allowlist, with unit coverage for the guard and live integration proof
of all three Phase 3 routing write paths (file-to-project, marker-tag, project-create) under the agent role + write
funnel.**

## Performance

- **Duration:** ~50 min (inline execution; initial worktree-subagent dispatch was blocked by a background-agent
  permission denial and switched to inline)
- **Completed:** 2026-06-14
- **Tasks:** 2 (both TDD-framed)
- **Files modified:** 3

## Accomplishments

- `FUNCTIONAL_TAG_ALLOWLIST` now contains `routing-unplaced` (D-12) so integration tests can apply and read the marker
  in test mode — production writes are unaffected (they bypass `isTestTagAllowed` behind the `isTestMode()` gate).
- Four unit assertions: `routing-unplaced` allowed, `agent-ok` still allowed, arbitrary tag rejected, `__test-` prefix
  path intact.
- Three live integration tests prove ROUTE-01 (moveTasks filing via update+project), ROUTE-04 (routing-unplaced marker
  via update+addTags / OmniJS bridge), and ROUTE-03 (infer-branch project create), all under the agent role with
  independent read-backs and clean sandbox teardown.

## Task Commits

1. **Task 1 (RED): allowlist unit tests** — `c78f2043` (test)
2. **Task 1 (GREEN): extend FUNCTIONAL_TAG_ALLOWLIST** — `446b3f63` (feat)
3. **Task 2: routing write-path integration tests** — `d0b09755` (test)

_TDD task 1 split into RED → GREEN per discipline._

## Files Created/Modified

- `src/contracts/ast/mutation-script-builder.ts` — added `routing-unplaced` to `FUNCTIONAL_TAG_ALLOWLIST`; comment cites
  D-12.
- `tests/unit/contracts/ast/mutation-script-builder.test.ts` — new `FUNCTIONAL_TAG_ALLOWLIST / isTestTagAllowed`
  describe block (4 tests).
- `tests/integration/tools/unified/end-to-end.test.ts` — new `Phase 3 Routing — write operations` describe
  (ROUTE-01/03/04), agent-role server, fullCleanup teardown + residue assertion.

## Decisions Made

- Ran the integration block as **agent** role (lineage-bypass for task creates) rather than owner, to exercise the real
  routing write surface the skill uses.
- Teardown via `fullCleanup()` rather than per-id server deletes, because the agent policy denies delete.

## Deviations from Plan

The plan's `<interfaces>` shorthand wrote the update call as `data:{id, project}`. The live API (per
`field-roundtrip.test.ts`, the source of truth) is `{operation:'update', target:'task', id, changes:{...}}`. Tests use
the real shape. No behavior change — a documentation/shorthand mismatch only.

The integration tests (Task 2) were GREEN on first run rather than RED-then-GREEN: ROUTE-01/03 paths do not depend on
the allowlist, and ROUTE-04's dependency (Task 1) was already merged. Task 2 proves existing funnel infrastructure
rather than driving new code, so a meaningful failing-first state was not available. Captured as a single `test(...)`
commit.

## Issues Encountered

- Background worktree-isolated executor subagents had Write/Bash auto-denied (cannot prompt for permission in
  background), producing no work. Resolved by switching to inline orchestrator execution; empty worktrees were cleaned
  up before proceeding.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Server-side routing write paths are proven. Plan 03-02 (the `route-inbox-to-projects` skill) can rely on
  update+project filing, update+addTags marking, and create/project — all verified live.

---

_Phase: 03-routing-on-demand-trigger_ _Completed: 2026-06-14_
