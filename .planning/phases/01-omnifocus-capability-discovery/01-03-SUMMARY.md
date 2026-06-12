---
phase: 01-omnifocus-capability-discovery
plan: 03
subsystem: documentation
tags: [omnifocus, capability-discovery, perspectives, capture, automation, omnijs, url-schemes]

requires:
  - phase: 01-02
    provides: 'TAG/FILTER/FIELD/MODEL findings + disc-capture-01 evidence + probe safety pattern'
provides:
  - 'PERSP section: DISC-PERSP-01..04 (area verdict extend; archivedFilterRules in-session write verified, cross-restart
    unverified)'
  - 'CAPTURE section: DISC-CAPTURE-01..04 (area verdict extend; inbox path verified via Plan 02 probe)'
  - 'AUTO section: DISC-AUTO-01..05 + D-08 automation-surface fit matrix (area verdict native)'
  - 'Two perspective probes (disc-persp-01 write, disc-persp-02 read-only)'
  - 'All seven report areas now populated — report ready for Plan 04 consistency audit'
affects: [01-04, 'Phase 3 Routing', 'Phase 6 Surfaces & Migration (PROV-01, READAS-01)']

tech-stack:
  added: []
  patterns:
    - 'Human-gated live write: checkpoint decides disposable-target vs real-target before the probe writes'
    - 'backup→write-same→read-back→restore for non-mutating write-path confirmation'

key-files:
  created:
    - probes/disc-persp-01-filter-rules-persist.js
    - probes/disc-persp-02-custom-all-enumerate.js
  modified:
    - docs/reference/omnifocus-capabilities.md

key-decisions:
  - "Checkpoint resolved Option A: user created a disposable 'disc-probe-test-perspective'; the write-probe never
    touched a real perspective"
  - 'PERSP=extend, CAPTURE=extend, AUTO=native; PERSP-03 build (no task-resolution API), PERSP-04 native (repair-only)'
  - 'Three findings left explicitly unverified with follow-up notes: PERSP-01 cross-restart (Plan 04), CAPTURE-04
    templates, AUTO-04 plug-ins'

patterns-established:
  - 'D-08 automation fit matrix: every milestone op routes through OmniJS; URL schemes are the only viable alternate'

requirements-completed: [] # DISC-01/DISC-02 complete only at Plan 04 sign-off (consistency audit + cross-restart + downstream-citation check)

duration: 25min
completed: 2026-06-12
---

# Phase 1 Plan 03: PERSP / CAPTURE / AUTO Findings + D-08 Fit Matrix Summary

**Completed all seven report areas: live-probed `Perspective.Custom.all` (18 customs, no JessOS yet) and
`archivedFilterRules` in-session write on a user-created disposable perspective (write accepted + restored), then wrote
CAPTURE/AUTO findings and the D-08 automation-surface fit matrix showing every milestone operation routes through
OmniJS.**

## Performance

- **Duration:** ~25 min active (plus checkpoint wait while the test perspective was created)
- **Started:** 2026-06-11T20:33Z
- **Completed:** 2026-06-12T00:14Z
- **Tasks:** 4 (1 checkpoint)
- **Files modified:** 3 (2 probes created, report modified)

## Accomplishments

- **PERSP (extend):** DISC-PERSP-01..04. `Perspective.Custom.all` enumeration verified; `archivedFilterRules` in-session
  write + read-back + restore verified on a disposable perspective. No-`perspective.tasks` gap recorded as `build`
  (READAS-01); create-from-scratch absence recorded as `native` repair-only (PROV-01).
- **CAPTURE (extend):** DISC-CAPTURE-01..04. Inbox `new Task()` path cross-referenced to the Plan 02 verified probe;
  URL-scheme, native-surface, and template findings recorded.
- **AUTO (native):** DISC-AUTO-01..05 plus the **D-08 fit matrix** (Agent Capture / Routing Writes / PROV-01 / MCP
  Basis) — the cross-cutting answer that every milestone operation belongs on OmniJS.
- **Human checkpoint** resolved Option A: a disposable `disc-probe-test-perspective` was the write target, so the user's
  18 real perspectives were never touched.

## Task Commits

1. **Task 1: disc-persp-02 read-only enumeration probe** — `d3a8928` (feat)
2. **Task 2: human-verify checkpoint** — resolved Option A (no commit; decision recorded here)
3. **Task 3: disc-persp-01 write probe + PERSP section** — `34d4b30` (feat)
4. **Task 4: CAPTURE/AUTO findings + D-08 fit matrix** — `cf172b3` (feat)

## Files Created/Modified

- `docs/reference/omnifocus-capabilities.md` — PERSP/CAPTURE/AUTO sections + D-08 fit matrix; all seven areas complete.
- `probes/disc-persp-01-filter-rules-persist.js` — `archivedFilterRules` backup→write→read-back→restore (Option A
  target).
- `probes/disc-persp-02-custom-all-enumerate.js` — read-only `Perspective.Custom.all` count + JessOS presence.

## Decisions Made

- **Option A (disposable target).** Because no JessOS perspective exists yet and OmniFocus has no perspective-create API
  (DISC-PERSP-04), the user manually created `disc-probe-test-perspective` for the write probe — isolating the live
  write from real configuration.
- **Honest cross-restart status.** `archivedFilterRules` in-session write is `verified`; cross-restart persistence stays
  `unverified` because a same-value write-back can't prove durable mutation. Resolution is the Plan 04 manual
  write→quit→reopen→read cycle.

## Deviations from Plan

None - plan executed exactly as written. (The `probes/**/*.js` eslint exemption added in Plan 02 already covered this
plan's two probes — no new config change needed.)

## Issues Encountered

None. The `disc-probe-test-perspective` remains in OmniFocus by design (the user can delete it now that the probe is
done).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All seven areas are populated; the report is ready for **Plan 04** (the final consistency audit + downstream-citation
  check + sign-off).
- **Plan 04 must run the cross-restart cycle** for DISC-PERSP-01 (write `archivedFilterRules` → quit OmniFocus → reopen
  → read back) — this is the one remaining `unverified` gate that a downstream phase (PROV-01) depends on.
- Two other `unverified` findings (CAPTURE-04 templates, AUTO-04 plug-ins) are low-priority and flagged for later
  phases, not Plan 04 blockers.

---

_Phase: 01-omnifocus-capability-discovery_ _Completed: 2026-06-12_
