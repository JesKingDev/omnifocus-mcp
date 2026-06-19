---
phase: 05-session-archaeology
verified: 2026-06-16T19:10:00Z
status: human_needed
score: 5/5 mechanism truths verified (3 behavioral truths require human run-through)
overrides_applied: 0
human_verification:
  - test: 'Run a real 7-day session-archaeology scan and sample the surfaced loops against the source transcripts'
    expected: 'No obvious open loop is missed and no noise is surfaced; detection recall holds over live content'
    why_human:
      'Agent-behavioral; depends on live transcript content the codebase cannot exercise. ARCH-01. Aggravated by REVIEW
      WR-01/WR-05 (multi-text loss + 200-char CLI truncation can drop a trailing TODO/next:) — pay extra attention to
      long assistant turns during the recall check.'
  - test:
      'Invoke the skill and walk the merged approval gate: confirm the per-session summary table fires, that
      yes/edit/abort all work, that row-level edit applies, and that NOTHING is created before yes'
    expected: 'Exactly one merged gate; plain-text yes/edit/abort; zero omnifocus_write calls before approval'
    why_human:
      'Interactive plain-text gate behavior cannot be exercised without a live session. ARCH-02 (REQUIREMENTS still [ ]
      Pending).'
  - test: 'Approve loops with a mix of MATCH / INFER / LEAVE placements and confirm where the tasks land in OmniFocus'
    expected:
      'Approved loops land in the matched/inferred project, inbox as fallback, each tagged archaeology with a lineage
      stamp'
    why_human: 'Depends on live OmniFocus + vault state. ARCH-03.'
---

# Phase 5: Session Archaeology Verification Report

**Phase Goal:** A summarize-then-approve scan recovers buried open loops from recent Claude Code sessions before they
die at context-window boundaries, turning approved loops into well-placed, tagged tasks. **Verified:**
2026-06-16T19:10:00Z **Status:** human_needed **Re-verification:** No — initial verification

## Goal Achievement

The phase ships a complete, self-contained mechanism: an `archaeology` allowlist entry (server-side), a deterministic
transcript pre-filter probe with a unit-tested pure core, a proven lineage round-trip + dedup backbone, and a 289-line
agent skill that wires scan -> dedup -> detect -> ONE merged gate -> place. Every artifact exists, is substantive, and
is wired. The three behavioral guarantees (detection recall, single-gate-never-auto-create, placement correctness) are
agent-behavioral and explicitly designated Manual-Only in 05-VALIDATION.md — they require a live run-through, which puts
overall status at `human_needed` rather than `passed`.

### Observable Truths

| #   | Truth                                                                                                         | Status                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Skill scans last 7 days of active (non-archived) CC sessions for unresolved open loops (SC1 / ARCH-01)        | ✓ VERIFIED (mechanism) | SKILL Pass-1 Step 1 invokes `node probes/archaeology-prefilter.js`; probe resolves `~/.claude/projects/<encoded-cwd>` + `--claude-worktrees-agent-*` siblings, excludes `isSidechain`, windows by per-message ISO `timestamp` to `nowMs − 7d`. Behavioral spot-check: pure fn over fixture returns 3 survivors, sidechain excluded, window parameterized (4 vs 3 with earlier nowMs). Detection _recall_ over real content is human-verified. |
| 2   | First pass summarizes per session and waits for user approval — never bulk auto-creates (SC2 / ARCH-02)       | ✓ VERIFIED (mechanism) | SKILL Pass-1 Step 5 renders one merged table (`Session \| What it was about \| Open loops? \| Count`); Step 6 is a single plain-text `yes / edit / abort` gate; Pass-2 writes occur "after approval only". Exactly ONE "Approve this plan" occurrence in the file. Out-of-scope + Common-mistakes both forbid bulk auto-create and a second gate. Live "never auto-creates" behavior is human-verified.                                       |
| 3   | Approved loops become OmniFocus tasks in correct project (inbox fallback), tagged archaeology (SC3 / ARCH-03) | ✓ VERIFIED (mechanism) | SKILL Pass-2 `omnifocus_write` create with `tags:["archaeology"]`, `lineage:{ sessionId }`, conditional `project` (omit -> inbox fallback). `archaeology` is in `FUNCTIONAL_TAG_ALLOWLIST` (source + compiled dist). MATCH/INFER/LEAVE ladder followed inline (route skill not chained). Live placement correctness is human-verified.                                                                                                        |
| 4   | Lineage stamp round-trips and dedup suppresses already-extracted sessions incl. completed (LINE-01 / D-07)    | ✓ VERIFIED             | `lineage-dedup.test.ts` (9 specs) proves round-trip (`.session` === input), idempotency (one block), dedup-skip, and completed-task union inclusion. SKILL Pass-1 Step 2 unions active + completed reads, `details:true` mandatory, parses via `LINEAGE_RE`. Full suite green.                                                                                                                                                                |
| 5   | archaeology is allowlisted so an archaeology create passes the test-mode tag guard (ARCH-03 / D-05)           | ✓ VERIFIED             | `FUNCTIONAL_TAG_ALLOWLIST` contains `'archaeology'` (source line + dist compiled). `mutation-script-builder.test.ts` asserts membership + `isTestTagAllowed('archaeology')`. `npm run build` regenerated; compiled array carries the entry.                                                                                                                                                                                                   |

**Score:** 5/5 mechanism truths verified. 3 behavioral truths (recall, single-gate-never-auto-create, placement)
deferred to human run-through per 05-VALIDATION.md Manual-Only.

### Required Artifacts

| Artifact                                                   | Expected                                                                                              | Status     | Details                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `src/contracts/ast/mutation-script-builder.ts`             | archaeology in FUNCTIONAL_TAG_ALLOWLIST                                                               | ✓ VERIFIED | Entry present + doc comment updated; compiled to `dist/`.                                        |
| `tests/unit/contracts/ast/mutation-script-builder.test.ts` | allowlist membership assertion                                                                        | ✓ VERIFIED | Per-tag `it` asserts `toContain('archaeology')` + `isTestTagAllowed`.                            |
| `tests/unit/contracts/ast/lineage-dedup.test.ts`           | round-trip + dedup-skip + completed-inclusion specs (≥40 lines)                                       | ✓ VERIFIED | 9 specs, ~159 lines; imports `LINEAGE_RE` + `composeLineageStamp`.                               |
| `probes/archaeology-prefilter.js`                          | noise-strip + 7-day window pure core + CLI (≥30 lines)                                                | ✓ VERIFIED | 247 lines; exports pure `filterTranscriptLines(lines, nowMs)`; CLI guarded by `import.meta.url`. |
| `tests/unit/probes/archaeology-prefilter.test.ts`          | noise-strip + isSidechain + window spec (≥30 lines)                                                   | ✓ VERIFIED | 9 `it` blocks; reference nowMs fixed; asserts 3 survive / 10 drop.                               |
| `tests/fixtures/archaeology/sample-transcript.jsonl`       | one line per branch incl. tool_result-only, isSidechain, out-of-window                                | ✓ VERIFIED | 13 lines, all valid JSON, every filter branch covered.                                           |
| `.claude/skills/session-archaeology/SKILL.md`              | skill: rubric, merged gate, routing ladder, dedup, create (≥100 lines, contains "yes / edit / abort") | ✓ VERIFIED | 289 lines; gate primitive present; full three-pass procedure.                                    |

### Key Link Verification

| From                  | To                                             | Via                                    | Status  | Details                                                                                                        |
| --------------------- | ---------------------------------------------- | -------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| SKILL.md              | probes/archaeology-prefilter.js                | inline CLI invocation                  | ✓ WIRED | `node probes/archaeology-prefilter.js` in Pass-1 Step 1 + Tool call reference.                                 |
| SKILL.md              | omnifocus_read archaeology + details:true      | dedup read step                        | ✓ WIRED | Pass-1 Step 2 + Tool reference: active + completed reads, `details:true` mandatory, `LINEAGE_RE` parse.        |
| SKILL.md              | omnifocus_write create + archaeology + lineage | Pass-2 create step                     | ✓ WIRED | Pass-2 create payload: `tags:["archaeology"]` + `lineage:{ sessionId }`; relies on funnel agent-ok auto-stamp. |
| lineage-dedup.test.ts | src/contracts/ast/lineage.ts                   | import LINEAGE_RE, composeLineageStamp | ✓ WIRED | Import + 9 passing specs.                                                                                      |
| probe test            | probes/archaeology-prefilter.js                | ESM import of pure fn                  | ✓ WIRED | Imports `filterTranscriptLines`; 9 specs green.                                                                |

### Behavioral Spot-Checks

| Behavior                                     | Command                                    | Result                                | Status |
| -------------------------------------------- | ------------------------------------------ | ------------------------------------- | ------ |
| Pure filter survives only KEEP records       | `filterTranscriptLines(fixture, nowMs)`    | 3 survivors (user, user, assistant)   | ✓ PASS |
| Every survivor has full record shape         | inspect `{session_id,timestamp,role,text}` | all non-empty                         | ✓ PASS |
| isSidechain excluded                         | check survivor text                        | no sidechain line                     | ✓ PASS |
| Window is parameterized (no hidden Date.now) | run with earlier nowMs                     | 4 vs 3 (out-of-window line re-enters) | ✓ PASS |
| Fixture is valid JSONL                       | `JSON.parse` each line                     | 13 lines parse                        | ✓ PASS |
| Phase-5 unit specs green                     | `npm run test:unit`                        | 2426 passed / 0 failed                | ✓ PASS |
| Compiled allowlist carries archaeology       | grep `dist/.../mutation-script-builder.js` | found                                 | ✓ PASS |
| Structural grep gate (Plan 03)               | gate + probe + details + lineage greps     | all OK; exactly 1 gate                | ✓ PASS |

### Probe Execution

| Probe  | Command | Result                                                                                                                                                                                                | Status  |
| ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| (none) | —       | No conventional `scripts/*/tests/probe-*.sh`; phase declares no shell probes. The `probes/archaeology-prefilter.js` is a node filter exercised via unit specs (above), not a PASS-marker shell probe. | SKIPPED |

### Requirements Coverage

| Requirement | Source Plan  | Description                                                                     | Status                                      | Evidence                                                                                                                                 |
| ----------- | ------------ | ------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| ARCH-01     | 05-02, 05-03 | Scan last 7 days of active CC sessions for unresolved open loops                | ✓ SATISFIED (mechanism) / ? recall human    | Probe windows + scans; SKILL drives it. Recall is Manual-Only (VALIDATION). REQUIREMENTS marks Complete.                                 |
| ARCH-02     | 05-03        | First pass summarizes per session, waits for approval, never bulk auto-creates  | ? NEEDS HUMAN                               | Mechanism present (single merged gate, writes after `yes`). REQUIREMENTS still `[ ]` Pending; gate UX/never-auto-create is Manual-Only.  |
| ARCH-03     | 05-01, 05-03 | Approved loops -> tasks in correct project (inbox fallback), tagged archaeology | ✓ SATISFIED (mechanism) / ? placement human | Allowlist + create payload + ladder verified. Live placement is Manual-Only. REQUIREMENTS marks Complete.                                |
| LINE-01     | 05-01, 05-03 | Every agent-created task stores originating session ID in notes                 | ✓ SATISFIED                                 | Lineage round-trip + dedup specs green; SKILL passes `lineage:{ sessionId }`. (Primary phase = Phase 2; reused here for dedup backbone.) |

All four declared requirement IDs are accounted for in REQUIREMENTS.md. No orphaned requirements: the REQUIREMENTS
traceability table maps exactly ARCH-01/02/03 to Phase 5; LINE-01 maps to Phase 2 and is legitimately reused by this
phase's dedup backbone (declared in 05-01 and 05-03 frontmatter).

### Anti-Patterns Found

| File                            | Line     | Pattern                                                             | Severity   | Impact                                                                                                                                           |
| ------------------------------- | -------- | ------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| probes/archaeology-prefilter.js | ~219     | CLI `rec.text.slice(0, 200)` truncation (REVIEW WR-05)              | ⚠️ Warning | Can clip a trailing TODO/next: from the CLI output the skill reads; weakens recall. Pure fn returns full text. Quality debt, not goal-defeating. |
| probes/archaeology-prefilter.js | ~58-65   | `extractText` returns first text block only (REVIEW WR-01)          | ⚠️ Warning | Multi-block assistant turns lose trailing text; weakens recall. Quality debt.                                                                    |
| probes/archaeology-prefilter.js | ~106-111 | Missing/unparseable timestamp kept (fail-open window, REVIEW WR-02) | ⚠️ Warning | Edge case; valid timestamps window correctly. Quality debt.                                                                                      |
| src/contracts/ast/lineage.ts    | 30,48    | Non-global LINEAGE_RE strip (REVIEW WR-03)                          | ⚠️ Warning | Only matters for duplicate-block notes the create path never produces. Quality debt.                                                             |

No `TODO`/`FIXME`/`XXX`/`HACK` debt markers found in phase-modified files. No blocker-tier anti-patterns. The four
REVIEW warnings are advisory recall/edge-case quality debt — none structurally defeats a success criterion (each leaves
the mechanism present and functioning for normal data; the affected guarantees are recall-quality, which is itself
human-verified).

### Human Verification Required

Per 05-VALIDATION.md Manual-Only, three agent-behavioral guarantees can only be confirmed by a live run-through:

#### 1. Detection recall over a real 7-day scan (ARCH-01)

**Test:** Run a real session-archaeology scan and sample surfaced loops against source transcripts. **Expected:** No
obvious open loop missed, no noise surfaced. **Why human:** Depends on live transcript content. Watch long assistant
turns closely — REVIEW WR-01/WR-05 can drop trailing TODO/next: text.

#### 2. Summarize-then-approve gate UX (ARCH-02)

**Test:** Invoke the skill; confirm the per-session summary fires, `yes/edit/abort` all work, row-level `edit` applies,
and nothing is created before `yes`. **Expected:** Exactly one merged gate; plain-text reply; zero writes before
approval. **Why human:** Interactive gate behavior cannot be exercised without a live session. ARCH-02 is still `[ ]`
Pending in REQUIREMENTS.

#### 3. Placement correctness (ARCH-03)

**Test:** Approve a MATCH/INFER/LEAVE mix; confirm where tasks land in OmniFocus. **Expected:** Matched/inferred
project, inbox fallback otherwise, each tagged `archaeology` with a lineage stamp. **Why human:** Depends on live
OmniFocus + vault state.

### Gaps Summary

No gaps. Every must-have artifact exists, is substantive, and is wired; both deterministic backbones (allowlist +
lineage dedup) are unit-proven and the full suite is green (2426/0). All four requirement IDs are traced. The mechanism
for all three success criteria is present and verified at the code level.

Status is `human_needed` (not `passed`) because the three behavioral guarantees at the heart of the success criteria —
detection recall, single-gate-never-auto-create, and live placement — are agent-behavioral, explicitly Manual-Only per
05-VALIDATION.md, and confirmed during `/gsd-verify-work`. The four REVIEW warnings are advisory recall/edge-case
quality debt suitable for a follow-up; none blocks the goal.

---

_Verified: 2026-06-16T19:10:00Z_ _Verifier: Claude (gsd-verifier)_
