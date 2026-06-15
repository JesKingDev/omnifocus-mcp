# Phase 4: Review Loops & Live Auto-Capture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in
> CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15 **Phase:** 4-Review Loops & Live Auto-Capture **Areas discussed:** Review-tag vocabulary,
Today-view surfacing, Live-capture trigger & flow **Mode:** advisor (research-backed comparison tables; calibration tier
`standard`)

---

## Review-tag vocabulary (REVIEW-01/02)

| Option                                             | Description                                                                                                                                               | Selected |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Flat siblings (`review-output` / `review-capture`) | Single addTag per item; tag is pure classification since surfacing rides on the flag; coherent-by-prefix with shipped `routing-unplaced`; renames nothing | ✓        |
| Hierarchical `review` parent + children            | Native nested tags; structural distinction; parent-before-child ordering; grouping benefit moot once surfacing uses the flag                              |          |
| Full `agent/*` namespace tree                      | Rename whole family under `agent/`; most coherent but rewrites shipped Phase 3 tags + allowlist on live data                                              |          |

**User's choice:** Flat siblings (`review-output` / `review-capture`) **Notes:** Cross-cutting finding from the
surfacing research reframed this — the review tag's job is classification, not surfacing, so a structural parent buys
little. Answers Phase 3 D-13: `routing-unplaced` keeps its shipped name; the new `review-*` tags sit alongside it,
coherent by prefix.

---

## Today-view surfacing (REVIEW-01)

| Option                                  | Description                                                                                                                                                        | Selected |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Flag + plannedDate + review tag         | Flag (zero-setup Flagged perspective) + plannedDate=today (Forecast Today, no fake deadline) + review tag for classification; all native, reversible, Phase-6-safe | ✓        |
| plannedDate + review tag only (no flag) | Skip flag to avoid mixing into existing Flagged view; no zero-setup fallback surface                                                                               |          |
| Flag + review tag only (no plannedDate) | Flagged perspective only; no Forecast tile                                                                                                                         |          |
| (Considered, rejected) Due/defer date   | Fabricates a deadline the agent has no authority to invent; corrupts real GTD horizon; least reversible                                                            |          |

**User's choice:** Flag + plannedDate + review tag **Notes:** `plannedDate` (OF 4.7+) is purpose-built as "scheduled for
work, no constraint" — lets the agent say "look at this today" without a fake due date. Flag-dilution into the existing
Flagged view was surfaced and accepted as the price of a zero-setup surface. Phase 4 sets native properties only;
perspective provisioning/resolution stays in Phase 6.

---

## Live auto-capture — Trigger (LIVE-01)

| Option                           | Description                                                                                                                       | Selected |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Named-signal rule (conservative) | Capture only on explicit blocker/follow-up/TODO/open-question signal; rare, trusted, single-item; mirrors routing's bias-to-leave | ✓        |
| Broad heuristic                  | Capture any inferred unresolved action; noisy; blurs into Phase 5 archaeology                                                     |          |
| Owner-uttered only               | Capture only on "capture that"; zero false positives but defeats real-time noticing                                               |          |

**User's choice:** Named-signal rule (conservative)

## Live auto-capture — Permission (LIVE-01)

| Option                                  | Description                                                                                                    | Selected |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- |
| Reuse PERM-02 verbatim                  | Prompt-before-create honoring the owner-set allow-all-session grant; no new mechanism; funnel owns the verdict | ✓        |
| Lighter per-item confirm (no allow-all) | Confirm every capture; friction mid-focus                                                                      |          |
| Auto-capture-then-notify (no gate)      | Capture without prompting; only legitimate when the session grant is already active                            |          |

**User's choice:** Reuse PERM-02 verbatim

## Live auto-capture — Placement (LIVE-01)

| Option                                        | Description                                                                                                         | Selected |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| Inbox + agent-okay + live marker, route later | Lands in inbox with lineage + live-capture marker; Phase 3 routing places it later; fast, distinct from archaeology | ✓        |
| Route immediately into a project              | Run Phase 3 routing brain at capture time; heavy, slow, duplicates Phase 3                                          |          |
| File into current work's project              | Contextually obvious but agent rarely knows the live OF project confidently — misfiling risk                        |          |

**User's choice:** Inbox + agent-okay + live marker, route later **Notes:** Live capture stays distinct from Phase 5
archaeology (no `archaeology` tag) and reuses the Phase 2 native capture path + lineage stamp. The live-capture marker
tag name is pinned during planning against the `review-*` / `routing-*` family.

---

## Claude's Discretion

- Live-capture marker tag name — pick during planning, coherent with the `review-*` / `routing-*` family; add to
  `FUNCTIONAL_TAG_ALLOWLIST`.
- Review-flag lifecycle / clearing — user chose to leave to planning (the fourth, unselected area); bias toward a native
  behavior over a custom clearing mechanism.
- Whether "completed work" gets the same flag+plannedDate+review-tag treatment as created work (a completed task may not
  want a future `plannedDate`).
- Exact judgment-rule wording for the named-signal trigger.
- Whether live capture is its own skill or folded into an existing skill.

## Deferred Ideas

- Review-flag lifecycle / clearing (deferred to planning).
- Hierarchical `agent/*` tag namespace (rejected for this phase — would rewrite shipped Phase 3 data).
- Phase 6 JessOS custom perspective (the dedicated tag-filtered today view) — Phase 4 produces the tag/flag data, builds
  no perspective machinery.
- Phase 5 session archaeology — the retrospective counterpart to live capture.
