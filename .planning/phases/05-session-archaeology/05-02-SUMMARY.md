---
phase: 05-session-archaeology
plan: 02
subsystem: testing
tags: [transcript, pre-filter, jsonl, probe, vitest, archaeology, session-archaeology]

requires:
  - phase: 05-session-archaeology-01
    provides: archaeology in FUNCTIONAL_TAG_ALLOWLIST + lineage-dedup spec

provides:
  - probes/archaeology-prefilter.js — pure filterTranscriptLines(lines, nowMs) + CLI wrapper
  - tests/fixtures/archaeology/sample-transcript.jsonl — one-line-per-branch fixture
  - tests/unit/probes/archaeology-prefilter.test.ts — noise-strip + isSidechain + window spec

affects:
  - 05-session-archaeology-03 (skill invokes the pre-filter probe inline)

tech-stack:
  added: []
  patterns:
    - 'ESM probe under probes/ with export + import.meta.url CLI guard (no module.exports for type:module projects)'
    - 'Parameterized nowMs in pure filter functions so tests are fixture-deterministic'
    - 'createRequire avoided in favor of direct ESM import for probes in a type:module project'

key-files:
  created:
    - probes/archaeology-prefilter.js
    - tests/fixtures/archaeology/sample-transcript.jsonl
    - tests/unit/probes/archaeology-prefilter.test.ts
  modified: []

key-decisions:
  - "ESM export chosen over CommonJS (project is type:module; CommonJS module.exports fails under Vitest's ESM runtime)"
  - 'import.meta.url guard used instead of require.main === module for the CLI wrapper'
  - 'nowMs as a parameter (not Date.now() inside the function) keeps the filter deterministic for unit tests'
  - 'Purity test uses earlyNowMs = 2026-06-07 to bring the 2026-06-01 out-of-window line back in-window, proving
    parameterization'

patterns-established:
  - 'Probe files under probes/ use ESM (export + import.meta.url) to work with both node direct-run and Vitest import'
  - 'Fixture JSONL with one line per branch: each branch labeled by sessionId so assertions can use
    .toContain(sessionId)'

requirements-completed: [ARCH-01]

duration: 25min
completed: 2026-06-16
---

# Phase 05 Plan 02: Session Archaeology Pre-Filter Summary

**Deterministic transcript pre-filter probe (`probes/archaeology-prefilter.js`) reducing 87%-noise JSONL to user-prose +
assistant-text records, with isSidechain exclusion and 7-day content-date windowing, backed by fixture-driven unit
tests.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-16T12:57:00Z
- **Completed:** 2026-06-16T13:03:00Z
- **Tasks:** 2 (Task 1: fixture; Task 2: TDD probe)
- **Files modified:** 3 created, 0 modified

## Accomplishments

- Fixture transcript covering every filter branch (13 lines, 3 KEEP / 10 DROP) with synthetic prose only
- Pure `filterTranscriptLines(lines, nowMs)` function implementing the D-03 strip rule and D-02 content-date window
- CLI wrapper that resolves active transcript dirs and groups output by session; guarded by `import.meta.url`
- Full noise-strip spec: 9 `it` blocks asserting exact KEEP/DROP behavior + purity invariant; 2426 unit tests green

## Task Commits

1. **Task 1: Fixture transcript** - `20cd2085` (feat)
2. **Task 2: TDD RED — failing spec** - `8c3c94cb` (test)
3. **Task 2: TDD GREEN — probe implementation** - `57491b4e` (feat)

## Files Created/Modified

- `tests/fixtures/archaeology/sample-transcript.jsonl` — 13-line synthetic fixture; one JSON object per filter branch
  (KEEP-prose, DROP-tool_result-only, KEEP-text-array, KEEP-assistant-text, DROP-assistant-no-text, DROP-attachment,
  DROP-file-history-snapshot, DROP-system, DROP-mode, DROP-queue-op, DROP-ai-title, DROP-isSidechain,
  DROP-out-of-window)
- `probes/archaeology-prefilter.js` — ESM probe; exports `filterTranscriptLines(lines, nowMs)`; CLI wrapper guarded by
  `import.meta.url`; mitigates T-05-03 (tool_result dropped), T-05-04 (scoped dir resolution), T-05-05 (skip malformed
  JSON)
- `tests/unit/probes/archaeology-prefilter.test.ts` — 9 `it` blocks; reference nowMs = 1781611200000
  (2026-06-16T12:00:00.000Z); asserts 3 survivors and 10 drops; purity test uses earlyNowMs to shift window

## Decisions Made

- **ESM over CommonJS** — the project has `"type":"module"` in `package.json`; `require.main === module` throws
  `ReferenceError: module is not defined` under Vitest's ESM runtime. Used `export function` + `import.meta.url` guard
  instead.
- **`nowMs` as parameter** — keeps the filter deterministic for unit tests; the CLI wrapper calls `Date.now()` and
  passes it in, so the live window is wall-clock-relative while tests use a fixed reference.
- **Purity test via earlyNowMs** — passes a `nowMs` of 2026-06-07 to make the "out-of-window" 2026-06-01 line re-enter
  the window, proving no hidden `Date.now()` inside the function.
- **Fixture path** — `../../fixtures/archaeology/` relative to `tests/unit/probes/` (not `../../../tests/fixtures/`);
  resolved via `fileURLToPath(import.meta.url)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reference timestamp incorrect (2025 vs 2026)**

- **Found during:** Task 2 (TDD GREEN, first test run)
- **Issue:** Initial `REFERENCE_NOW_MS = 1750075200000` maps to 2025-06-16, not 2026-06-16; the fixture timestamps are
  2026, so the out-of-window 2026-06-01 line appeared IN-window and the 2026-06-15 KEEP lines had valid timestamps but
  the window check resolved against 2025 cutoff
- **Fix:** Recalculated to `1781611200000` = `Date.UTC(2026, 5, 16, 12, 0, 0, 0)`; corrected purity test from farFuture
  year 2199 (impossible to bring 2026 date in-window by 7d) to earlyNowMs = 2026-06-07
- **Files modified:** `tests/unit/probes/archaeology-prefilter.test.ts`
- **Verification:** All 9 `it` blocks pass
- **Committed in:** `57491b4e` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - timestamp off-by-one-year bug)  
**Impact on plan:** Correctness fix only; no scope change.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. The probe reads only:

- `~/.claude/projects/<encoded-cwd>` and `…--claude-worktrees-agent-*` sibling dirs (T-05-04)
- All tool_result content is dropped before any text reaches the model (T-05-03)
- Malformed JSON lines are skipped, not thrown (T-05-05)

No new threat flags beyond the plan's existing STRIDE register.

## Known Stubs

None — the probe is fully wired. The CLI wrapper resolves real dirs; the pure function is complete. The skill (05-03)
will invoke the probe inline.

## Issues Encountered

ESM/CJS mismatch: initial test used `createRequire` to import a CommonJS-style probe, but the project's
`"type":"module"` causes Node to treat `.js` files as ESM. Rewrote the probe as ESM (`export function`) and the test as
a standard ESM import. Resolved before the GREEN commit.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `probes/archaeology-prefilter.js` is ready for the skill (05-03) to invoke inline via
  `node probes/archaeology-prefilter.js`
- Pure function available for any additional callers via ESM import
- 2426 unit tests green; no regressions

---

_Phase: 05-session-archaeology_  
_Completed: 2026-06-16_
