---
phase: 05-session-archaeology
plan: 03
subsystem: skills
tags: [skill, session-archaeology, archaeology, open-loops, dedup, routing, lineage]

requires:
  - phase: 05-session-archaeology-01
    provides: archaeology in FUNCTIONAL_TAG_ALLOWLIST + lineage-dedup spec
  - phase: 05-session-archaeology-02
    provides: probes/archaeology-prefilter.js — inline pre-filter probe

provides:
  - .claude/skills/session-archaeology/SKILL.md — user-invoked retrospective open-loop scan skill

affects:
  - Phase 6 (JessOS perspective filtering will surface archaeology-tagged tasks this skill produces)

tech-stack:
  added: []
  patterns:
    - 'Skill is a prompt-only agent procedure; no server code added (allowlist entry landed in Plan 01)'
    - 'Inverse-polarity skill pairing: session-archaeology (retrospective batch) mirrors capture-live-blocker
      (in-the-moment single)'
    - 'Routing ladder (MATCH/INFER/LEAVE) followed inline rather than chaining route-inbox-to-projects, to keep a single
      merged gate'

key-files:
  created:
    - .claude/skills/session-archaeology/SKILL.md
  modified: []

key-decisions:
  - 'Closed out via safe-resume manual close-out: the SKILL.md draft survived the prior quota-failed executor run
    uncommitted; verified against all acceptance criteria + the plan verify gate, then committed rather than regenerated
    (would have orphaned verified-good work and re-spent quota)'
  - 'LINEAGE_RE hard-coded in the skill verified byte-identical to src/contracts/ast/lineage.ts'
  - 'agent-okay auto-stamp claim verified against OmniFocusWriteTool.ts (create+task+lineage+role=agent) — skill
    instructs passing only archaeology'

patterns-established:
  - 'Three-pass skill shape (read-only scan/dedup/detect/propose → execute-after-approval → report) mirroring
    route-inbox-to-projects'
  - 'Dedup read MUST set details:true and union active+completed reads (lineage block lives at note-end, truncates at
    200 chars)'

requirements-completed: [ARCH-01, ARCH-02, ARCH-03, LINE-01]

duration: 5min
completed: 2026-06-16
---

# Phase 05 Plan 03: Session Archaeology Skill Summary

**The user-invoked `session-archaeology` skill (`.claude/skills/session-archaeology/SKILL.md`) — a three-pass
retrospective scan that pre-filters 7 days of active transcripts, dedups by lineage, detects open loops via the D-03
rubric, presents ONE merged summarize-then-approve gate, and on `yes` creates archaeology-tagged, lineage-stamped,
well-placed OmniFocus tasks. No server code added.**

## Performance

- **Duration:** ~5 min (close-out only — authoring happened in the prior parked session)
- **Completed:** 2026-06-16
- **Tasks:** 1 (Task 1: author SKILL.md)
- **Files modified:** 1 created, 0 modified

## Accomplishments

- `.claude/skills/session-archaeology/SKILL.md` (289 lines) — complete, self-contained agent procedure:
  - **Pass 1 (read-only):** resolve active dirs + run `probes/archaeology-prefilter.js` inline (D-01/D-02/D-03); dedup
    read of archaeology tasks (active + completed union, `details:true`, `LINEAGE_RE` parse → session Set, D-07);
    four-category detection rubric + guaranteed-catch floor (D-03); inline routing ladder MATCH→INFER→LEAVE (D-06); ONE
    merged table; ONE `yes / edit / abort` gate (D-04/D-04a).
  - **Pass 2 (after approval):** `omnifocus_write` create with `tags:["archaeology"]` + `lineage:{ sessionId }`, relying
    on the funnel's `agent-okay` auto-stamp (D-05); INFER project-existence check before create.
  - **Pass 3 (report):** one summary line (created / matched / inferred / inbox / skipped / errors).
- Tool call reference, Vault Signal Read, Out of scope, and Common mistakes tables included.

## Task Commits

1. **Task 1: Author session-archaeology SKILL.md** - `274d2ffe` (feat)

## Files Created/Modified

- `.claude/skills/session-archaeology/SKILL.md` — the skill; drives the Wave-1 probe and the
  `omnifocus_read`/`omnifocus_write` surfaces; adds no server code (allowlist entry landed in Plan 01).

## Decisions Made

- **Safe-resume manual close-out.** The prior `/gsd-execute-phase 5` Wave-2 executor hit the monthly spend limit after
  writing the SKILL.md draft to disk but before committing it or writing this SUMMARY. On resume, the draft was verified
  against the plan's automated verify gate and every acceptance criterion (all passed), then committed — rather than
  spawning a fresh executor, which in worktree mode forks from HEAD, never sees the uncommitted draft, and would
  regenerate the file from scratch (orphaning verified-good work and re-spending the recovered quota).
- **Correctness verified against source before commit.** The skill's hard-coded `LINEAGE_RE`
  (`/\n\n<!-- of-mcp:lineage\n.*?\n-->/s`) is byte-identical to `src/contracts/ast/lineage.ts`. The `agent-okay`
  auto-stamp behavior (skill says "pass only archaeology") matches `OmniFocusWriteTool.ts`: the funnel appends
  `agent-okay` on `create + task + lineage present + role=agent`.

## Deviations from Plan

None to the deliverable. The only process deviation is the close-out path (manual safe-resume close-out instead of a
fresh executor run), forced by the prior session's quota exhaustion — no scope change.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes. The skill is a prompt file:

- T-05-06 (secrets/PII in tasks) — mitigated: abstractive extraction rule + the Plan-02 probe strips `tool_result`
  before the model reads.
- T-05-07 (bulk create without consent) — mitigated: single mandatory `yes / edit / abort` gate; no write before `yes`.
- T-05-08 (write path bypassing funnel) — mitigated: all creates go through `omnifocus_write`; no JXA/direct write.

No new threat flags beyond the plan's STRIDE register.

## Known Stubs

None — the skill is a complete procedure. Live behavioral verification (detection recall, single-gate behavior,
placement correctness) is human-verified per 05-VALIDATION.md Manual-Only, confirmed during `/gsd-verify-work`.

## User Setup Required

None — the skill is invoked on demand ("scan my sessions" / "session archaeology" / "find open loops").

## Next Phase Readiness

- The phase's three plans are complete: allowlist + lineage-dedup (01), pre-filter probe (02), skill (03).
- Archaeology-tagged tasks this skill produces are the input to Phase 6's JessOS perspective filtering.

---

_Phase: 05-session-archaeology_ _Completed: 2026-06-16_
