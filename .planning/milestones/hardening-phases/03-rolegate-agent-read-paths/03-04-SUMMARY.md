---
phase: 03-rolegate-agent-read-paths
plan: '04'
subsystem: auth/role-gate
tags: [role-gate, read-paths, integration-test, smoke-test, withCorrelation, bug-fix]
dependency_graph:
  requires:
    - 03-03-SUMMARY.md # SystemTool whoami op, ResolvedContext threaded via _context field
  provides:
    - READ-01/02/03 unit tests activated (dispatch gate is a no-op for read ops)
    - Role-aware ListTools integration test (AGENT-trimmed + OWNER-full assertions)
    - withCorrelation constructor-collision fix (SystemTool context slot vs correlationId)
    - Regression test for whoami through withCorrelation on both AGENT and OWNER paths
    - End-to-end smoke test confirmation: all 6 steps PASS in live OmniFocus
  affects:
    - src/tools/system/SystemTool.ts
    - tests/unit/tools/index-rolegate.test.ts
    - tests/integration/mcp-protocol.test.ts
    - tests/integration/helpers/mcp-test-client.ts
    - tests/unit/tools/system/SystemTool-whoami.test.ts
tech_stack:
  added: []
  patterns:
    - withCorrelation override pattern for tools with extra constructor args (context slot)
    - Optional-chain hardening on whoami identity fields for null-safety
    - Role-parameterized integration tests via env-based server spawn (OMNIFOCUS_MCP_ROLE)
key_files:
  created:
    - tests/integration/helpers/mcp-test-client.ts
  modified:
    - tests/unit/tools/index-rolegate.test.ts
    - tests/integration/mcp-protocol.test.ts
    - src/tools/system/SystemTool.ts
    - tests/unit/tools/system/SystemTool-whoami.test.ts
key_decisions:
  - 'withCorrelation override in SystemTool: BaseTool.withCorrelation reconstructs the tool via new ctor(cache,
    correlationId); SystemTool repurposed arg 2 as context, causing the real ResolvedContext to be dropped. Override
    threads both args correctly: new SystemTool(cache, this._context, correlationId)'
  - 'Optional-chain hardening on identity fields in getWhoami(): identity?.roleSource etc. — prevents crash if context
    is undefined when whoami is called through reconstruction paths'
  - 'Regression test strategy: drive whoami through withCorrelation (not direct construction) to catch
    reconstruction-path failures that unit tests would otherwise miss'
requirements-completed:
  - GATE-03
  - READ-01
  - READ-02
  - READ-03
duration: ~45min
completed: '2026-06-05'
---

# Phase 3 Plan 04: READ-01/02/03 read-path confirmation + integration test + end-to-end human verify

**READ-01/02/03 unit stubs activated, role-aware ListTools integration test added, live smoke test confirmed all 6 AGENT
ops; live smoke test caught and fixed a withCorrelation constructor-collision that crashed whoami through the BaseTool
reconstruction path**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-06-05T01:05:51Z (directly after Plan 03)
- **Completed:** 2026-06-05
- **Tasks:** 2 (Task 1 auto + Task 2 human-verify checkpoint with fix)
- **Files modified:** 5

## Accomplishments

- `tests/unit/tools/index-rolegate.test.ts`: 3 `vi.todo()` stubs for READ-01/02/03 replaced with real tests confirming
  `normalizeArgsToPolicy({ query: ... })` returns `[]` — dispatch gate is a no-op for all read ops
- `tests/integration/mcp-protocol.test.ts` + helper `tests/integration/helpers/mcp-test-client.ts`: role-aware ListTools
  assertions added — AGENT spawn confirms `delete`/`bulk_delete` absent from enum; OWNER spawn confirms `delete` present
- Live end-to-end smoke test (all 6 steps PASS): whoami, ListTools AGENT, AGENT delete rejection, AGENT create, AGENT
  count read, AGENT perspectives read
- `src/tools/system/SystemTool.ts`: withCorrelation override added + optional-chain hardening on identity fields;
  prevents the whoami reconstruction crash discovered during the smoke test
- `tests/unit/tools/system/SystemTool-whoami.test.ts`: regression test added driving whoami through `withCorrelation`
  for both AGENT and OWNER roles
- Full suite: 2302 tests passing, 0 todos, build clean

## Task Commits

1. **Task 1: Activate READ-01/02/03 unit stubs + role-aware integration ListTools** - `4b71f82` (feat)
2. **Task 2 fix: Preserve ResolvedContext across withCorrelation (whoami crash)** - `91ed4c8` (fix)

## Human-Verify Checkpoint Results

All 6 steps PASS in live OmniFocus with OmniFocus running and `node dist/index.js` (no `OMNIFOCUS_MCP_ROLE` set):

| Step                        | What was tested                                                                                                                                  | Result |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1 — whoami AGENT            | `{ role: "agent", roleSource: "fail-safe-default" }`, identity key absent (D-15)                                                                 | PASS   |
| 2 — ListTools AGENT         | `omnifocus_write` operation enum = `[complete, drop, create, update, batch, create_folder, tag_manage]`; `delete`/`bulk_delete` absent (GATE-01) | PASS   |
| 3 — AGENT delete            | Returns `POLICY_DENY_DELETE` structured error, no crash (GATE-02)                                                                                | PASS   |
| 4 — AGENT create            | Task appeared in OmniFocus inbox (GATE-03 write hot-path)                                                                                        | PASS   |
| 5 — AGENT count read        | `total_count: 568`, not policy-gated (READ-01)                                                                                                   | PASS   |
| 6 — AGENT perspectives read | 23 perspectives returned (READ-02/03)                                                                                                            | PASS   |

## Files Created/Modified

- `tests/unit/tools/index-rolegate.test.ts` — READ-01/02/03 stubs replaced with real dispatch-gate assertions
- `tests/integration/mcp-protocol.test.ts` — AGENT-trimmed and OWNER-full ListTools role-aware assertions
- `tests/integration/helpers/mcp-test-client.ts` — new: shared MCP stdio client helper for integration tests
- `src/tools/system/SystemTool.ts` — `withCorrelation` override + optional-chain hardening on identity fields
- `tests/unit/tools/system/SystemTool-whoami.test.ts` — regression test: whoami through withCorrelation path

## Decisions Made

- **withCorrelation override pattern:** When a tool repurposes BaseTool constructor arg 2 for something other than
  `correlationId` (SystemTool uses it for `context: ResolvedContext`), the tool must override `withCorrelation` to
  thread both the context and the correlationId correctly. The base class reconstruction
  `new ctor(cache, correlationId)` fails silently when the arg ordering differs.
- **Optional-chain hardening on getWhoami():** `identity?.roleSource` etc. prevents a crash if `_context` is undefined.
  This is defensive — the reconstruction fix already prevents the undefined context — but it guards the surface against
  future callers who might not go through `withCorrelation`.
- **Regression test through withCorrelation:** Unit tests that construct SystemTool directly never exercise the
  reconstruction path. The new regression test calls `tool.withCorrelation('corr-1').call(...)` to catch this class of
  failure before smoke test.

## Deviations from Plan

### Checkpoint-Discovered Production Bug (Critical)

**[Rule 1 - Bug] withCorrelation constructor-collision crashed whoami on every real CallTool**

- **Found during:** Task 2 (human-verify smoke test — Step 1 whoami)
- **Issue:** `BaseTool.withCorrelation` reconstructs the tool via `new ctor(cache, correlationId)`, treating positional
  arg 2 as the correlationId. `SystemTool` (added in Plan 03-03) repurposed arg 2 as `context: ResolvedContext`. When
  `withCorrelation` rebuilt the tool it placed the correlationId STRING in the context slot and dropped the real
  `ResolvedContext`. On the first `getWhoami()` call, `this._context` was a string, and accessing `this._context.role`
  threw `Cannot read properties of undefined (reading 'roleSource')`.
- **Why tests missed it:** All 2297 unit tests construct SystemTool directly and never route whoami through the
  `withCorrelation` reconstruction path. Integration tests also construct tools directly in their server setup. The
  crash only surfaces via the live MCP stdio dispatch path used by real clients.
- **Fix:** `SystemTool` overrides `withCorrelation(correlationId)` to call
  `new SystemTool(this.cache, this._context, correlationId)` — threading both args in the correct positions.
  `getWhoami()` gains optional-chain hardening (`identity?.roleSource` etc.) as defense-in-depth. Regression test added
  to `SystemTool-whoami.test.ts` driving whoami through `withCorrelation` for both roles.
- **Files modified:** `src/tools/system/SystemTool.ts`, `tests/unit/tools/system/SystemTool-whoami.test.ts`
- **Commit:** `91ed4c8`

---

**Total deviations:** 1 (1 Rule 1 critical bug, checkpoint-discovered) **Impact on plan:** The fix was necessary for
correctness — whoami was broken on every real MCP connection. No scope creep. Full suite 2302 passing after fix.

## Issues Encountered

The withCorrelation collision is documented as a deviation above. It is the only issue encountered and was resolved
within the same plan. The root cause pattern — tool subclasses that repurpose positional constructor args require a
`withCorrelation` override — should be applied to any future tool that deviates from the `(cache, correlationId)` base
constructor signature.

## Known Stubs

None. All Wave 0 READ stubs activated. No `it.todo()` or `vi.todo()` stubs remain in the rolegate test file.

## Threat Flags

None. READ op pass-through is now both unit-tested and live-confirmed. OWNER `delete` enforcement confirmed present
(OWNER ListTools integration assertion). No new network endpoints or auth paths introduced.

## Next Phase Readiness

Phase 3 is complete. All 6 requirements (GATE-01, GATE-02, GATE-03, READ-01, READ-02, READ-03) have at least one passing
automated test, and the full end-to-end AGENT path is live-confirmed in OmniFocus.

Phase 4 (HTTP Edge Hardening) can begin. Pre-research items to confirm before planning:

- Installed `@modelcontextprotocol/sdk ^1.25.1` bearer-auth export surface
- Exact `enableDnsRebindingProtection` / `allowedHosts` / `allowedOrigins` config shape
- (These were flagged as research items in STATE.md blockers)

## Self-Check: PASSED

- `src/tools/system/SystemTool.ts` — contains `withCorrelation` override
- `tests/unit/tools/system/SystemTool-whoami.test.ts` — regression test for withCorrelation path exists
- `tests/integration/helpers/mcp-test-client.ts` — file created
- Commits `4b71f82` and `91ed4c8` — verified present in git log
- Full suite: 2302 passed, 0 todo, 0 failures
- `npm run build` — exits 0

---

_Phase: 03-rolegate-agent-read-paths_ _Completed: 2026-06-05_
