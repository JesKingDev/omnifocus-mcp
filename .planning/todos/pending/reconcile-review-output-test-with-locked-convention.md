---
title: Reconcile review-tag.test.ts Case 2 with the locked review-output convention
status: pending
created: 2026-06-16
type: followup
area: phase-04-review-loops-live-auto-capture
---

# Reconcile `review-output` integration test with the locked review-surfacing convention

## Why

Phase 4 locked the review-surfacing convention in `.claude/skills/surface-work-for-review/SKILL.md` (commit `dc382fb4`):
a `review-output` item is an **OPEN, flagged** task the user completes to mark reviewed; agents never auto-complete work
awaiting review.

This **supersedes** the phase's original "Discretion #2" interpretation, where `review-output` was applied to a
**completed** task (tag-only, no flag). The integration test still encodes the old model:

- `tests/integration/tools/unified/review-tag.test.ts` **Case 2** — creates a task, **completes it**, then
  `addTags: ['review-output']` and asserts the tag reads back.

The test is not broken (it proves a true server mechanic: a completed task can carry the tag). But its framing now says
the opposite of the active convention, which is exactly the kind of drift that misleads a future reader.

## What to do

1. Update Case 2 to assert the **open + flagged** `review-output` shape: an open task with `flagged: true` +
   `plannedDate: today` + `addTags: ['review-output']`, reading back all three — mirroring Case 1's `review-capture`
   shape. Drop (or repurpose) the "complete then tag" framing.
2. Keep one assertion, if useful, that the tag is _mechanically_ allowed on a completed task — but label it as a
   mechanic check, not the REVIEW-01 convention.
3. This touches a **live-OmniFocus integration test** — it must be re-run against live OmniFocus to confirm green (the
   unit suite does not exercise it). Run as its own focused change, not folded into unrelated work.
4. RESEARCH.md "Discretion #2" is a point-in-time planning artifact — leave it as history; the skill is the active
   source of truth.

## Acceptance

- `review-tag.test.ts` Case 2 reflects the open-flagged `review-output` convention.
- Test passes against live OmniFocus.
- No remaining doc/test that frames `review-output` as a completed-task-only tag.
