# Phase 5: Session Archaeology - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in
> CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-16 **Phase:** 5-Session Archaeology **Areas discussed:** Detection (source + rule), Approval
granularity, Placement path, Re-scan / dedup safety, Gate shape **Mode:** advisor (research-backed comparison tables;
calibration tier = minimal_decisive, opinionated owner)

---

## Detection: source + rule (ARCH-01)

| Option                              | Description                                                                                                                                                                                 | Selected |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Transcripts + broad inference       | Raw `.jsonl` transcripts, content-date 7d window, exclude sidechains; broad semantic inference with Phase 4 enumerated markers as a guaranteed floor; approval gate absorbs false positives | ✓        |
| Transcripts + conservative only     | Same source, only enumerated marker signals; precision over recall                                                                                                                          |          |
| `.remember` index → transcript dive | Use `.remember/` daily files as a triage index, transcripts for detail                                                                                                                      |          |

**User's choice:** Transcripts + broad inference. **Notes:** Research established source is decisively raw transcripts —
`.remember/` records completed wins (wrong polarity) and is lossy. Broad net is licensed by the ARCH-02 approval gate
(recall > precision); enumerated markers kept as a floor. Window on per-message content date (not mtime — they drift);
exclude `isSidechain`; include `…--claude-worktrees-agent-*` sibling dirs; pre-filter strips tool noise.

---

## Approval granularity (ARCH-02)

| Option                            | Description                                                                                                                                                               | Selected |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Per-session + lazy per-loop edit  | Approve which sessions; approved session extracts all loops, row-level `edit` drops/trims first; plain-text table + yes/edit/abort, mirrors route-inbox; loop count shown | ✓        |
| Two-tier (session then each loop) | Approve sessions, then mandatory per-loop approval pass; maximum precision                                                                                                |          |

**User's choice:** Per-session + lazy edit. **Notes:** One decision surface honors the overwhelm-avoidance profile;
two-tier flat per-loop triage rejected. Plain-text reply, not AskUserQuestion (caps poorly across many sessions; matches
shipped routing skill).

---

## Placement path (ARCH-03)

| Option                            | Description                                                                                                      | Selected |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| Chain / reuse route-inbox routing | Reuse Phase 3 `match→infer→create→leave`; placement is a deliverable of the run; add `archaeology` to allowlist  | ✓        |
| Route-later (inbox, defer)        | Create in inbox with marker tags only; placement deferred to a separate later routing run (mirrors Phase 4 D-10) |          |

**User's choice:** Chain route-inbox skill. **Notes:** ARCH-03 "correct project" makes placement a deliverable, so
route-later fails the plain reading. Phase 4's defer rationale (single item mid-focus) doesn't transfer to a supervised
batch. Routing is chainable — keys on `agent-okay` + `inInbox:true`; only new server work is the allowlist entry.

---

## Gate shape (follow-up on Placement)

| Option               | Description                                                                             | Selected |
| -------------------- | --------------------------------------------------------------------------------------- | -------- |
| Two sequential gates | Approve extraction → create in inbox → routing's own approve-placements pass runs after |          |
| One merged gate      | Single table shows each loop + its proposed placement; one yes/edit/abort covers both   | ✓        |
| Defer to planning    | Lock chain-routing; leave gate UX to plan-phase                                         |          |

**User's choice:** One merged gate. **Notes:** Minimizes decision surfaces (context-switching cost). Cost: archaeology
must run routing's `match→infer` as a _proposal_ without triggering routing's own approval pass — flag for planning to
factor/reuse the matching procedure.

---

## Re-scan / dedup safety

| Option                         | Description                                                                                                                       | Selected |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Lineage-match (session-grain)  | Read `archaeology` tasks, parse session ID from the lineage note block, skip already-extracted; reuses `lineage.ts`, no new state | ✓        |
| Hybrid: lineage + per-loop key | Same query plus a per-loop discriminator in the payload (v bump) for partially-extracted multi-loop sessions                      |          |

**User's choice:** Lineage-match (session granularity). **Notes:** Reuses purpose-built `lineage.ts`; state lives in
OmniFocus (cross-machine, self-healing). Scanned-marker rejected (new state); approval-gate-only rejected (re-reviewing
handled loops = overwhelm trigger). Hybrid deferred until multi-loop re-surfacing proves real.

## Claude's Discretion

- Exact loop-category rubric wording in the skill prompt (keep tight).
- Skill composition — own skill reusing routing's matching procedure vs. composing route-inbox directly.
- Pre-filter implementation (inline vs. helper) for stripping transcript tool-noise.
- Hybrid per-loop dedup key (deferred build).
- Summary table exact columns/wording.

## Deferred Ideas

- Hybrid per-loop dedup key (D-08) — only if session-grain dedup proves insufficient.
- n8n 15-min polling of archaeology — later phase/milestone; this phase stays on-demand.
- Phase 6 JessOS perspective filtering on `archaeology`.
- Reviewed-not-folded todo: `reconcile-review-output-test-with-locked-convention` (Phase 4 scope).
