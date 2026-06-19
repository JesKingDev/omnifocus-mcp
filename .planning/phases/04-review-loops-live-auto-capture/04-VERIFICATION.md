---
phase: 04-review-loops-live-auto-capture
verified: 2026-06-16T14:30:00Z
status: human_needed
score: 3/3 must-haves code-verified; live OmniFocus UI behaviors need human confirmation
re_verification: false
human_verification:
  - test:
      'With OmniFocus open, trigger a review-capture write (flagged=true, plannedDate=today, tag=review-capture) and
      confirm the task appears in the OmniFocus Today perspective.'
    expected:
      "The flagged + plannedDate=today combination surfaces the task in the built-in 'Today' view without any custom
      perspective machinery."
    why_human:
      'Today-view surfacing is a native OmniFocus UI rendering behavior — grep cannot confirm that the Today perspective
      actually shows the task. The integration test proves the field values persist round-trip; it cannot prove
      OmniFocus renders them in the Today view.'
  - test:
      "Run a real interactive Claude Code session, let the agent notice a concrete blocker, and confirm the PERM-02
      prompt fires ('Capture this to OmniFocus? yes / no') before any task is created."
    expected:
      "omnifocus_write returns POLICY_GATE_CAPTURE_CONFIRM, the agent renders the yes/no prompt, and only on 'yes' does
      the inbox task appear with capture-live + agent-ok + of-mcp:lineage."
    why_human:
      'The integration test runs with OMNIFOCUS_MCP_ROLE=agent and a lineage param, which activates the D-08b
      lineage-attestation bypass that admits the create without prompting. The live-session path (interactive mode, no
      pre-supplied sessionId) triggers POLICY_GATE_CAPTURE_CONFIRM instead. That branch cannot be exercised in automated
      tests without a running interactive session.'
  - test:
      'Confirm the review-output and review-capture tags appear as distinct, human-readable labels in the OmniFocus tag
      browser (not misrouted, not duplicated).'
    expected:
      "Two separate tag entries — 'review-output' and 'review-capture' — exist in OmniFocus after at least one live
      round-trip, with no collision with existing tags."
    why_human:
      'OmniFocus tag creation is idempotent and name-based. The integration tests prove the tags can be applied; they do
      not confirm how the tags render in the OmniFocus UI or whether the tag browser shows them cleanly.'
---

# Phase 4: Review Loops & Live Auto-Capture — Verification Report

**Phase Goal:** Agent activity surfaces in the user's today view through review tags that distinguish work the agent did
(review-output) from tasks the agent decided should exist (review-capture), AND live sessions can capture concrete
blockers in real time (with permission), without the `archaeology` tag.

**Verified:** 2026-06-16T14:30:00Z **Status:** human_needed **Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                 | Status                                                 | Evidence                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Agent-created or completed work carries a review tag and surfaces in the user's today view                                                            | ✓ VERIFIED (code) / ? HUMAN (UI)                       | `flagged=true + plannedDate=today + review-capture` round-trips via `review-tag.test.ts` Case 1; `review-output` round-trips in Case 2. Today-perspective rendering is native OmniFocus UI — needs human confirmation.   |
| 2   | Review flags distinguish review-output (verify work the agent did) from review-capture (verify a task the agent decided should exist)                 | ✓ VERIFIED                                             | Both tags exist in `FUNCTIONAL_TAG_ALLOWLIST`; unit test asserts both; integration test applies each to distinct task states (active vs completed) with independent read-backs.                                          |
| 3   | During a live session, the agent captures a concrete blocker as an OmniFocus inbox task in real time (with permission), without the `archaeology` tag | ✓ VERIFIED (code) / ? HUMAN (PERM-02 interactive gate) | `end-to-end.test.ts` Phase 4 LIVE-01 case proves: `capture-live + agent-ok + of-mcp:lineage` stamps, no `archaeology`, inbox placement (`task.project` falsy). Interactive PERM-02 prompt path needs human confirmation. |

**Score:** 3/3 truths code-verified. 2 of 3 have live-UI aspects requiring human confirmation.

---

### Required Artifacts

| Artifact                                                   | Expected                                                                           | Status                          | Details                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/contracts/ast/mutation-script-builder.ts`             | FUNCTIONAL_TAG_ALLOWLIST extended with review-output, review-capture, capture-live | ✓ VERIFIED                      | Lines 77–84: all three tags present in the array with JSDoc rationale citing D-01/D-02 and D-10. `isTestTagAllowed` unchanged — array membership is the only change.                                                                                                                                                                                                                                                                                     |
| `tests/unit/contracts/ast/mutation-script-builder.test.ts` | Allowlist unit assertions for the 3 new functional tags                            | ✓ VERIFIED                      | Lines 1236–1248: three `it(...)` cases asserting `FUNCTIONAL_TAG_ALLOWLIST.toContain()` and `isTestTagAllowed()` for each new tag. Arbitrary-tag rejection case confirmed present from prior phase.                                                                                                                                                                                                                                                      |
| `tests/integration/tools/unified/review-tag.test.ts`       | review-capture active round-trip + review-output completed round-trip              | ✓ VERIFIED (substantive, wired) | 285-line spec. Case 1: `flagged=true + plannedDate=today + addTags:['review-capture']` via single update; 3 `assertFieldPersisted` reads (flagged, plannedDate date-slice, tags). Case 2: create → complete → `addTags:['review-output']`; tag read-back asserts `review-output` present and `plannedDate` is null. No `clear*` calls. Live execution: executor-reported PASS (2/2).                                                                     |
| `.claude/skills/capture-live-blocker/SKILL.md`             | Standalone live-capture skill (LIVE-01), ≥40 lines                                 | ✓ VERIFIED                      | 143 lines. Contains: frontmatter `name: capture-live-blocker`, `capture-live` tag, `POLICY_GATE_CAPTURE_CONFIRM`, `lineage.sessionId`, Out-of-scope section forbidding `archaeology` / `review-*` / dates. `archaeology` appears 5 times — all in do-NOT/out-of-scope context.                                                                                                                                                                           |
| `tests/integration/tools/unified/end-to-end.test.ts`       | Live-capture integration case extending D-08b harness                              | ✓ VERIFIED (substantive, wired) | Lines 1036–1197. `describe('Phase 4 LIVE-01 ...')`. Agent-role spawn with `OMNIFOCUS_MCP_ROLE: 'agent'`. Create with `tags: ['capture-live']` + `lineage`. Read-back asserts: `tags.toContain('agent-ok')`, `tags.toContain('capture-live')`, `note.toContain('of-mcp:lineage')`, `tags.not.toContain('archaeology')`, `task.project.toBeFalsy()` (unconditional). Self-cleans via finally-block delete. Live execution: executor-reported PASS (26/26). |

---

### Key Link Verification

| From                                                 | To                                                | Via                                                            | Status               | Details                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review-tag.test.ts`                                 | `omnifocus_write update + omnifocus_read`         | `assertFieldPersisted` round-trip                              | ✓ WIRED              | `grep -c "assertFieldPersisted" review-tag.test.ts` = 8 (8 usages). Imports confirmed: `expectOk`, `assertFieldPersisted`, `ensureSandboxFolder`, `fullCleanup`, `runScopedName`.                                                             |
| `isTestTagAllowed`                                   | `FUNCTIONAL_TAG_ALLOWLIST`                        | array membership (`FUNCTIONAL_TAG_ALLOWLIST.includes(tag)`)    | ✓ WIRED              | `isTestTagAllowed` unchanged; guard already reads array. All three new tags (`review-output`, `review-capture`, `capture-live`) in the array at lines 80–82.                                                                                  |
| `.claude/skills/capture-live-blocker/SKILL.md`       | `omnifocus_write create (inbox)`                  | mutation.data with `tags:['capture-live'] + lineage.sessionId` | ✓ WIRED (documented) | Skill tool-call reference table shows correct JSON shape: no `project` key, no `dueDate`/`deferDate`, `tags: ['capture-live']`, `lineage: { sessionId: ... }`. Server behaviors section accurately describes funnel auto-stamping `agent-ok`. |
| `tests/integration/tools/unified/end-to-end.test.ts` | agent-role server + agent-ok tag filter read-back | `create-with-lineage` round-trip                               | ✓ WIRED              | `OMNIFOCUS_MCP_ROLE: 'agent'` in spawn env; `grep -c "capture-live"` = 11; `grep -c "OMNIFOCUS_MCP_ROLE"` pattern present; `not.toContain('archaeology')` assertion at line 1173.                                                             |

---

### Data-Flow Trace (Level 4)

The production change (mutation-script-builder.ts) is a string-array constant — not a component rendering dynamic data.
No data-flow trace applies to the allowlist extension itself.

The integration tests (`review-tag.test.ts`, `end-to-end.test.ts`) drive the existing `flagged`, `plannedDate`,
`addTags`, and `lineage` setters through the existing write funnel. These setters were verified in prior phases; Phase 4
only adds three tag names to the allowlist guard. The round-trip path is: MCP JSON-RPC → `OmniFocusWriteTool` →
`mutation-script-builder` → OmniJS bridge → live OmniFocus → read-back via `omnifocus_read`. Data flows through this
chain — executor-reported live run confirms real OmniFocus writes.

---

### Behavioral Spot-Checks

| Behavior                                                                            | Command                                                                | Result                                                                                                                                                                                           | Status |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `review-output` in allowlist array                                                  | `grep "'review-output'" src/contracts/ast/mutation-script-builder.ts`  | line 80: `'review-output', // Phase 4 D-01/D-02`                                                                                                                                                 | ✓ PASS |
| `review-capture` in allowlist array                                                 | `grep "'review-capture'" src/contracts/ast/mutation-script-builder.ts` | line 81: `'review-capture', // Phase 4 D-01/D-02`                                                                                                                                                | ✓ PASS |
| `capture-live` in allowlist array                                                   | `grep "'capture-live'" src/contracts/ast/mutation-script-builder.ts`   | line 82: `'capture-live', // Phase 4 D-10 live-capture marker`                                                                                                                                   | ✓ PASS |
| SKILL.md min_lines ≥ 40                                                             | `wc -l .claude/skills/capture-live-blocker/SKILL.md`                   | 143 lines                                                                                                                                                                                        | ✓ PASS |
| No debt markers in Phase 4 files                                                    | `grep -rn "TBD\|FIXME\|XXX" <5 modified files>`                        | (no output)                                                                                                                                                                                      | ✓ PASS |
| assertFieldPersisted used in review-tag test                                        | `grep -c "assertFieldPersisted" review-tag.test.ts`                    | 8                                                                                                                                                                                                | ✓ PASS |
| No `clear*` OF ops in review-tag test                                               | `grep -c "clear" review-tag.test.ts`                                   | 3 (all `clearTimeout` — JS timer, not OmniFocus clear\*)                                                                                                                                         | ✓ PASS |
| `end-to-end.test.ts capture-live` references                                        | `grep -c "capture-live" end-to-end.test.ts`                            | 11                                                                                                                                                                                               | ✓ PASS |
| Inbox assertion is unconditional (WR-03 fix)                                        | lines 1175–1181 of end-to-end.test.ts                                  | `expect(task.project, '...').toBeFalsy()` with no `if ('project' in task)` guard                                                                                                                 | ✓ PASS |
| Folder arg removed from review-tag creates (WR-01 fix)                              | `grep -n "createTask(taskName," review-tag.test.ts`                    | Lines 179 and 230: `createTask(taskName)` — no second arg                                                                                                                                        | ✓ PASS |
| SKILL.md step 3 references lineage attestation, not owner session grant (WR-02 fix) | lines 70–72 of SKILL.md                                                | "re-invoke `omnifocus_write` … The lineage param is a self-attested agent capture (D-08b) … Do NOT try to set a session grant yourself — that endpoint is owner-only and rejects agent callers." | ✓ PASS |

---

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` probes exist for this phase. Integration tests require a live OmniFocus
connection and were run by the executor during the phase. The executor-reported results are:

- `npm run test:unit -- mutation-script-builder`: PASS (2405/2405) — reported in 04-01-SUMMARY.md
- `npm run test:integration -- review-tag`: PASS (2/2) — reported in 04-01-SUMMARY.md
- `npm run test:integration -- end-to-end`: PASS (26/26, including Phase 4 LIVE-01 case at 7114ms) — reported in
  04-02-SUMMARY.md

These cannot be re-run here without a live OmniFocus connection. Treat as executor-reported, not re-verified.

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                       | Status                                                               | Evidence                                                                                                                                                                                                             |
| ----------- | ----------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REVIEW-01   | 04-01       | Agent flags created/completed work with a review tag so it surfaces in today view | ✓ SATISFIED (code-verified; today-view rendering is human-check)     | `review-tag.test.ts` Case 1 (active: flag+plannedDate+review-capture) and Case 2 (completed: review-output tag) both round-trip. `flagged + plannedDate=today` is the native OmniFocus signal for Today perspective. |
| REVIEW-02   | 04-01       | Review flags distinguish review-output from review-capture                        | ✓ SATISFIED                                                          | Both tags in `FUNCTIONAL_TAG_ALLOWLIST` with distinct JSDoc rationale (D-01/D-02). Integration test applies each to semantically appropriate task states. SKILL.md and end-to-end test forbid mixing them.           |
| LIVE-01     | 04-02       | Live session captures a concrete blocker without archaeology tag                  | ✓ SATISFIED (code-verified; interactive PERM-02 gate is human-check) | `end-to-end.test.ts` Phase 4 describe block proves: `capture-live + agent-ok + of-mcp:lineage`, no `archaeology`, inbox placement. SKILL.md documents the full PERM-02 rendering flow.                               |

All three requirements assigned to Phase 4 in REQUIREMENTS.md are marked `[x]` Complete. No orphaned requirements found
for this phase.

---

### Anti-Patterns Found

| File              | Line | Pattern | Severity | Impact |
| ----------------- | ---- | ------- | -------- | ------ |
| No blockers found | —    | —       | —        | —      |

No `TBD`, `FIXME`, or `XXX` markers found in any of the five Phase 4 modified files. No placeholder implementations,
empty handlers, or disconnected data paths detected.

The three warnings from 04-REVIEW.md (WR-01, WR-02, WR-03) were all fixed in commit `b5b74cc4` and confirmed present in
the current codebase:

- WR-01: no-op `folder` arg removed; comment corrected to "inbox task scoped by **TEST** name prefix"
- WR-02: SKILL.md step 3 re-points to lineage attestation path, not owner-only session grant
- WR-03: inbox-placement assertion is now unconditional (`expect(task.project).toBeFalsy()` with no `if` guard)

---

### Human Verification Required

**1. Today Perspective — task surfaces in OmniFocus Today view**

**Test:** After running `npm run test:integration -- review-tag` (requires live OmniFocus), or via a real
omnifocus_write call with `flagged=true + plannedDate=today + addTags:['review-capture']`, open OmniFocus and check the
built-in Today perspective. **Expected:** The review-tagged task appears in Today. The combination of `flagged=true` +
`plannedDate=today` is the native OmniFocus surfacing signal — no custom perspective machinery was built. **Why human:**
Today-perspective rendering is a native OmniFocus UI behavior. The integration test proves field values round-trip; it
cannot open the OmniFocus window and confirm visual rendering.

**2. PERM-02 interactive gate — agent prompts before live capture**

**Test:** In a real interactive Claude Code session where the agent is running under `role=agent` (Claude Desktop), let
the agent recognize a concrete blocker mid-task and invoke the `capture-live-blocker` skill. **Expected:**
`omnifocus_write` returns `POLICY_GATE_CAPTURE_CONFIRM`, the agent renders "Capture this to OmniFocus? (yes / no)" with
the proposed task name/note shown, and only on 'yes' does the task appear in the OmniFocus inbox tagged
`capture-live + agent-ok` with `of-mcp:lineage` in the note. On 'no', no task is created. **Why human:** The automated
integration test uses the D-08b lineage-attestation path (`lineage.sessionId` present), which admits the inbox create
without triggering `POLICY_GATE_CAPTURE_CONFIRM`. The interactive-mode gate fires when no lineage bypass is active. This
path cannot be tested without a real interactive session.

**3. Tag browser — review-output and review-capture appear as distinct OmniFocus tags**

**Test:** After at least one live round-trip write for each tag, open OmniFocus > Tags pane and confirm both
`review-output` and `review-capture` exist as separate tag entries. **Expected:** Two distinct tags visible, correctly
named, not duplicated, not conflated with existing tags like `agent-ok` or `routing-unplaced`. **Why human:** OmniFocus
tag creation is triggered on first use via `resolveTag(name, true)` (find-or-create). The integration test confirms the
tag appears on the task; it cannot confirm the tag browser renders it correctly.

---

### Gaps Summary

No gaps. All three must-haves are code-verified: the allowlist is extended, the tags are distinct and documented, the
integration tests assert the correct round-trips, the SKILL.md documents the correct permission and inbox-create flow,
and all three WR-0x code-review warnings are confirmed fixed. Status is `human_needed` solely because live OmniFocus UI
behaviors (Today perspective rendering and interactive PERM-02 gate) require a human with a running OmniFocus instance
to confirm.

---

_Verified: 2026-06-16T14:30:00Z_ _Verifier: Claude (gsd-verifier)_
