---
phase: 01-omnifocus-capability-discovery
plan: 02
subsystem: documentation
tags: [omnifocus, capability-discovery, omnijs, probes, tags, filtering, data-model, custom-fields]

requires:
  - phase: 01-01
    provides: 'Report scaffold + DISC-<AREA>-NN anchor scheme + evidence/verdict standard'
provides:
  - 'TAG section: DISC-TAG-01/02/03 (area verdict extend, OmniJS tag path verified)'
  - 'FILTER section: DISC-FILTER-01/02/03 (area verdict extend, doc-cited)'
  - 'FIELD section: DISC-FIELD-01/02/03 (area verdict native)'
  - 'MODEL section: DISC-MODEL-01..06 (area verdict native; sequential write-back verified)'
  - 'Four reusable gate-claim probes under probes/ with safety contract (UUID names, abort-on-collision, try/finally)'
  - 'disc-capture-01 evidence (inbox immediacy + note round-trip) staged for Plan 03 CAPTURE'
affects: [01-03, 01-04, 'Phase 2 Capture', 'Phase 3 Routing']

tech-stack:
  added: []
  patterns:
    - 'Safe live write-probe: UUID-suffixed names, abort-on-collision, try/finally cleanup, write-then-read-back,
      cleanedUp flag'
    - 'Non-destructive project teardown via Project.Status.Dropped (not hard delete)'

key-files:
  created:
    - probes/disc-tag-01-auto-create.js
    - probes/disc-tag-02-addtag-omni.js
    - probes/disc-model-01-sequential-write.js
    - probes/disc-capture-01-inbox-note-roundtrip.js
  modified:
    - docs/reference/omnifocus-capabilities.md
    - eslint.config.js

key-decisions:
  - 'TAG/FILTER = extend, FIELD/MODEL = native; MODEL-05 (typed-class setters) carries a per-finding extend verdict
    while MODEL area stays native'
  - 'evidence: verified reserved for the three live-probed claims (tag OmniJS assignment, sequential write-back, note
    round-trip); all other findings are evidence: doc'
  - 'Added probes/**/*.js to eslint ignores (JXA osascript files, CLAUDE.md .js exception)'

patterns-established:
  - 'Sanitized probe evidence appendix: command | timestamp | counts/booleans | cleanup | OF build — no live-DB names'

requirements-completed: [] # DISC-01/DISC-02 still phase-spanning; PERSP/CAPTURE/AUTO remain (Plan 03) and sign-off is Plan 04.

duration: 15min
completed: 2026-06-11
---

# Phase 1 Plan 02: TAG/FILTER/FIELD/MODEL Findings + Gate-Claim Probes Summary

**Populated four capability areas with DISC-`<AREA>`-NN findings and ran four self-cleaning live probes on OmniFocus
4.8.11: confirmed OmniJS `addTag(Tag)` works (string throws → no auto-create, resolving A3), `project.sequential`
write-back persists, and `new Task()`+`note` round-trips with immediate inbox reflection.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-11T20:18Z
- **Completed:** 2026-06-11T20:32Z
- **Tasks:** 2
- **Files modified:** 6 (4 probes created, report + eslint config modified)

## Accomplishments

- **TAG (extend):** DISC-TAG-01/02/03. Live-probed the OmniJS tag-assignment path (`evidence: verified`); the JXA silent
  no-op is doc-cited.
- **FILTER (extend):** DISC-FILTER-01/02/03 — targeted collections, the `.whose()` ban, and date/flag linear-scan, all
  `evidence: doc`.
- **FIELD (native):** DISC-FIELD-01/02/03 — `task.note` as the custom-data surface; OF has no first-class custom fields.
- **MODEL (native):** DISC-MODEL-01..06 — `project.sequential` (verified), `taskStatus` enum,
  sequential-as-only-dependency, no cross-task dependencies (build if ever needed), setter-pattern wrappers (per-finding
  extend), `moveTasks`.
- **Four gate-claim probes** in `probes/`, all returning `cleanedUp: true`, with sanitized evidence appendices recorded
  in the report.

## Task Commits

1. **Task 1: TAG/FILTER findings + tag probes** — `fba8df3` (feat; includes eslint-ignore fix)
2. **Task 2: FIELD/MODEL findings + model/capture probes** — `16924a2` (feat)

## Files Created/Modified

- `docs/reference/omnifocus-capabilities.md` — TAG/FILTER/FIELD/MODEL sections fully populated with findings + sanitized
  probe evidence.
- `probes/disc-tag-01-auto-create.js` — tag string-vs-object auto-create gate claim.
- `probes/disc-tag-02-addtag-omni.js` — OmniJS `addTag(Tag)` assignment + read-back.
- `probes/disc-model-01-sequential-write.js` — `project.sequential` write-back persistence.
- `probes/disc-capture-01-inbox-note-roundtrip.js` — `new Task()`+`note` round-trip + inbox immediacy (LINE-01 + CAP-01
  gates).
- `eslint.config.js` — added `probes/**/*.js` to ignores.

## Decisions Made

- **Evidence discipline held strictly.** Only the three claims actually live-probed carry `evidence: verified`;
  everything cited from codebase docs or omni-automation.com is `evidence: doc`. No `evidence: unverified` in these four
  areas.
- **MODEL stays native despite MODEL-05.** Typed-class setter wrappers are a thin, already-existing concern (per-finding
  `extend`); the area-level verdict is a single value (`native`) per D-04.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `probes/**/\*.js` to eslint ignores\*\*

- **Found during:** Task 1 (committing the first two probes)
- **Issue:** The pre-commit hook's `eslint --fix` flagged `'Application' is not defined` (no-undef) in the new `probes/`
  directory — these are JXA `osascript` files using OmniFocus globals, not Node JS. The eslint config ignored
  `tests/**/*.js` but not the new `probes/` dir.
- **Fix:** Added `'probes/**/*.js'` to the `ignores` array in `eslint.config.js`, mirroring the existing `tests/**/*.js`
  entry. Matches the CLAUDE.md `.js` exception for throwaway osascript probes.
- **Files modified:** eslint.config.js
- **Verification:** `npx eslint probes/*.js` → exit 0 (files ignored); commit succeeded.
- **Committed in:** fba8df3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking) **Impact on plan:** Config-only fix enabling the planned probe directory
to pass the commit hook. No scope creep; also covers Plan 03's probes.

## Issues Encountered

None blocking. Note: `disc-model-01` uses non-destructive teardown (`Project.Status.Dropped`), so one dropped probe
project (`disc-probe-sequential-<ts>`) remains per run, hidden from active views — purgeable manually. This was the
planned teardown choice (avoid hard delete).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TAG/FILTER/FIELD/MODEL locked; the heavier PERSP/CAPTURE/AUTO areas remain for Plan 03 (a checkpoint plan).
- `disc-capture-01` already supplies CAPTURE evidence (inbox immediacy + note round-trip) for Plan 03's DISC-CAPTURE-01.
- The probe safety pattern and `probes/` eslint exemption are in place, so Plan 03's two PERSP probes can follow the
  same template.

---

_Phase: 01-omnifocus-capability-discovery_ _Completed: 2026-06-11_
