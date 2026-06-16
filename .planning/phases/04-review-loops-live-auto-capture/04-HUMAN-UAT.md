---
status: partial
phase: 04-review-loops-live-auto-capture
source: [04-VERIFICATION.md]
started: 2026-06-16T14:39:42Z
updated: 2026-06-16T14:39:42Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Today perspective rendering

expected: After a live `review-capture` write (flagged=true + plannedDate=today + `review-capture` tag), open OmniFocus
and confirm the task appears in the Today / Forecast view. result: [pending]

### 2. PERM-02 interactive gate

expected: In a real Claude Desktop session, an agent live-capture renders the prompt "Capture this to OmniFocus? (yes /
no)" before any inbox write. (The automated end-to-end test uses the D-08b lineage-attestation bypass, which
intentionally skips this gate, so the interactive prompt path is unproven by automation.) result: [pending]

### 3. Tag browser naming

expected: After first use, `review-output` and `review-capture` appear as distinct, correctly-named functional tags in
the OmniFocus Tags pane (not merged, not mis-cased). result: [pending]

## Summary

total: 3 passed: 0 issues: 0 pending: 3 skipped: 0 blocked: 0

## Gaps
