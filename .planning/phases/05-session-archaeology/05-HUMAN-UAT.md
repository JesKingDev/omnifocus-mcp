---
status: partial
phase: 05-session-archaeology
source: [05-VERIFICATION.md]
started: 2026-06-16T23:10:57Z
updated: 2026-06-16T23:10:57Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Detection recall over a real 7-day scan (ARCH-01)

expected: Run a real session-archaeology scan and sample the surfaced loops against the source transcripts. No obvious
open loop is missed and no noise is surfaced; detection recall holds over live content. Pay extra attention to long
assistant turns — REVIEW WR-01 (first-text-block-only extraction) and WR-05 (200-char CLI truncation) can drop a
trailing `TODO`/`next:` marker. result: [pending]

### 2. Merged approval gate behavior (ARCH-02)

expected: Invoke the skill and walk the merged gate — the per-session summary table fires; `yes` / `edit` / `abort` all
work; a row-level `edit` applies and re-shows; and NOTHING is created before `yes`. Exactly one merged gate, plain-text
(not AskUserQuestion), zero `omnifocus_write` calls before approval. result: [pending]

### 3. Placement correctness — MATCH / INFER / LEAVE (ARCH-03)

expected: Approve loops with a mix of MATCH / INFER / LEAVE placements and confirm where they land in OmniFocus. Each
approved loop lands in the matched or inferred project (inbox as fallback), tagged `archaeology` with a lineage stamp.
result: [pending]

## Summary

total: 3 passed: 0 issues: 0 pending: 3 skipped: 0 blocked: 0

## Gaps
