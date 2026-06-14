---
status: partial
phase: 03-routing-on-demand-trigger
source: [03-VERIFICATION.md]
started: 2026-06-14T20:05:00Z
updated: 2026-06-14T20:05:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. ROUTE-01 — file a matching item under its existing project

expected: Invoke the route-inbox-to-projects skill. Pass 1 produces a proposal table before any write; after approval,
an agent-okay inbox item whose name matches an active project is filed under that project. No write happens before
approval (D-08). result: [pending]

### 2. ROUTE-02 / ROUTE-03 — vault-inferred create + file

expected: Seed a `~/vaults/jess-os/` note with `omnifocus-project` (and optionally `omnifocus-folder`) frontmatter for
an unmatched inbox item, then run routing. The skill greps the vault, reads the frontmatter, proposes INFER+CREATE, and
on approval creates the project and files the task under it. result: [pending]

### 3. ROUTE-04 — leave-and-mark

expected: Run routing with an item that has no project match and no vault signal. The item is left in the inbox and
stamped with the durable `routing-unplaced` marker tag — idempotent (not re-tagged on a second run). result: [pending]

### 4. TRIG-01 — manual trigger

expected: Say a trigger phrase (e.g. "route my inbox"). The route-inbox-to-projects skill activates and runs the
two-pass loop. result: [pending]

## Summary

total: 4 passed: 0 issues: 0 pending: 4 skipped: 0 blocked: 0

## Gaps
