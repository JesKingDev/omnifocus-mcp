---
status: partial
phase: 05-session-archaeology
source: [05-VERIFICATION.md]
started: 2026-06-16T23:10:57Z
updated: 2026-06-16T23:45:00Z
---

## Current Test

[testing paused — 1 issue, 2 blocked on the Test 1 fix]

## Tests

### 1. Detection recall over a real 7-day scan (ARCH-01)

expected: Run a real session-archaeology scan and sample the surfaced loops against the source transcripts. No obvious
open loop is missed and no noise is surfaced; detection recall holds over live content. Pay extra attention to long
assistant turns — REVIEW WR-01 (first-text-block-only extraction) and WR-05 (200-char CLI truncation) can drop a
trailing `TODO`/`next:` marker. result: issue reported: "I tried each of the skill invocation keywords and each time it
ran only for that session. In a brand new session, it actually did nothing." severity: major

### 2. Merged approval gate behavior (ARCH-02)

expected: Invoke the skill and walk the merged gate — the per-session summary table fires; `yes` / `edit` / `abort` all
work; a row-level `edit` applies and re-shows; and NOTHING is created before `yes`. Exactly one merged gate, plain-text
(not AskUserQuestion), zero `omnifocus_write` calls before approval. result: blocked blocked_by: prior-phase reason:
"Gate cannot be exercised until the Test 1 scope bug is fixed — the scan surfaces nothing cross-session, so no merged
table to walk."

### 3. Placement correctness — MATCH / INFER / LEAVE (ARCH-03)

expected: Approve loops with a mix of MATCH / INFER / LEAVE placements and confirm where they land in OmniFocus. Each
approved loop lands in the matched or inferred project (inbox as fallback), tagged `archaeology` with a lineage stamp.
result: blocked blocked_by: prior-phase reason: "Placement cannot be verified until the Test 1 scope bug is fixed — no
loops surface to approve and place."

## Summary

total: 3 passed: 0 issues: 1 pending: 0 skipped: 0 blocked: 2

## Gaps

- truth: "A session-archaeology scan reads the last 7 days of ALL active transcripts (cross-session), not just the
  current session" status: failed reason: "User reported: I tried each of the skill invocation keywords and each time it
  ran only for that session. In a brand new session, it actually did nothing." severity: major test: 1 root_cause: "" #
  Filled by diagnosis artifacts: [] # Filled by diagnosis missing: [] # Filled by diagnosis debug_session: "" # Filled
  by diagnosis
