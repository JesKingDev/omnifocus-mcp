# Phase 3: Routing & On-Demand Trigger - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in
> CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14 **Phase:** 3-Routing & On-Demand Trigger **Mode:** advisor (full_maturity calibration; technical
owner — technical framing kept) **Areas discussed:** Matching brain, Vault signal, Trigger & run shape, Write posture,
Leave record

---

## Matching brain (ROUTE-01 + match/infer/leave threshold)

| Option                         | Description                                                                                                        | Selected |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------- |
| Agent semantic judgment        | Agent reasons over enumerated project list, files on high confidence, abstains toward "leave." No bespoke matcher. | ✓        |
| Deterministic token match      | Normalize + match item tokens against project names/tags; auditable, lower recall, more code.                      |          |
| Hybrid (deterministic + agent) | Strong token match first, agent fallback. Two code paths to build/test.                                            |          |

**User's choice:** Agent semantic judgment. **Follow-up — match signal:** Candidate set + signal richness.

| Option                         | Description                                                                  | Selected |
| ------------------------------ | ---------------------------------------------------------------------------- | -------- |
| Active projects, name + folder | Active (non-done/dropped/on-hold) projects as folder path + name. Lean read. |          |
| Active projects + project note | Also include each project's note text. Richer signal, heavier read.          | ✓        |
| All projects incl. on-hold     | Include on-hold/someday. Broader recall, risks filing into dormant projects. |          |

**Notes:** Requires a projects read projection that includes note text (distinct from the deferred by-id
`read_path_gap`).

---

## Vault signal (ROUTE-02 / ROUTE-03)

| Option                                  | Description                                                                                                                               | Selected |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Semantic read, pointer/project-anchored | Search 01-pointers/ + 02-projects/; create only when a vault note clearly corresponds. Reuses structure, no new convention. (Recommended) |          |
| Pointers-only canonical signal          | Read only 01-pointers/. Tightest/auditable, misses un-promoted work.                                                                      |          |
| New frontmatter map                     | Add omnifocus-project:: frontmatter; grep for a deterministic map. Explicit, new convention to seed/maintain.                             | ✓        |

**User's choice:** New frontmatter map (overrode the semantic-read recommendation — wants explicit, curated, no
over-creation). **Follow-up — frontmatter shape:**

| Option                               | Description                                                                                                  | Selected |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------- |
| project + folder, semantic item→note | omnifocus-project + omnifocus-folder; agent semantically finds the tagged note, reads deterministic mapping. | ✓        |
| project + folder + match aliases     | Also omnifocus-match: keywords — fully deterministic item→note, more upkeep.                                 |          |
| project only                         | Just omnifocus-project; folder inferred/flat, ROUTE-03 placement underspecified.                             |          |

**Notes:** Item→note stays semantic; note→project is deterministic. Routing infers nothing until notes carry the field
(adoption caveat); seeding is the user's task, out of scope.

---

## Trigger & run shape (TRIG-01)

Invocation surface locked to **Claude Code skill** (routing brain + vault read live agent-side; server is plumbing).
CLI/Makefile is the deferred TRIG-02 shape.

| Option                       | Description                                                                                                  | Selected |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| Summarize-then-approve batch | One pass; agent proposes plan, user approves/edits, then executes. Auditable, one approval, mirrors ARCH-02. | ✓        |
| Interactive per-item         | Asks per item. Max control, tedious, high context-switch cost.                                               |          |
| Autonomous file-and-report   | Routes everything, reports after. Lowest friction, no pre-approval — really the deferred TRIG-02 shape.      |          |

**User's choice:** Summarize-then-approve batch. **Notes:** Corrected earlier framing — manual trigger runs in _live_
mode (Phase 2 D-04); background/no-prompt is the deferred scheduled path.

---

## Write posture (ROUTE-01/03 actions)

| Option                           | Description                                                                                                                      | Selected |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Allow + funnel + verify          | move + project-create dispatch through the single funnel (allow verdict), confirmed by write-verifier. Batch approval = consent. | ✓        |
| Gate move/create server-side too | PolicyEngine returns gate; separate grant on top of batch approval. Redundant, adds friction.                                    |          |
| Advisory / agent-side only       | Skill calls tools directly, no funnel/verify. Breaks "funnel, not advisory" invariant.                                           |          |

**User's choice:** Allow + funnel + verify.

---

## Leave record (ROUTE-04)

| Option                     | Description                                                                                               | Selected |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | -------- |
| Report-only in run summary | Left items truly untouched; report lists them + why. Durable surfacing deferred to Phase 4. (Recommended) |          |
| Marker tag on left items   | Tag skipped items so they're queryable; durable, some write-churn, overlaps Phase 4.                      | ✓        |
| Both report + marker tag   | Run summary plus durable marker. Most visibility, most churn.                                             |          |

**User's choice:** Marker tag on left items (overrode report-only recommendation — wants skips durable/queryable).
**Notes:** Tag lands in Phase 3; today-view surfacing is Phase 4 (REVIEW-\*). Re-runs don't re-tag; may re-evaluate if
vault map changed. Exact tag name resolved during planning against Phase 4 vocabulary.

---

## Claude's Discretion

- Exact marker-tag name for left items (coordinate with Phase 4 REVIEW-\* namespace).
- Confidence-rule wording for the abstain bias.
- Plan/report format of the summarize-then-approve output.
- Where the projects-with-notes read projection lives.
- `omnifocus-folder` path-vs-name semantics and missing-folder handling on create.

## Deferred Ideas

- TRIG-02 scheduled/n8n polling trigger (background mode).
- `omnifocus-match:` keyword-alias frontmatter (fully-deterministic item→note).
- Today-view surfacing of the leave marker (Phase 4).
- Semantic-structure-read / pointers-only vault signal (rejected alternatives, kept in case the map proves high-upkeep).
