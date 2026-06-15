# Phase 4: Review Loops & Live Auto-Capture - Context

**Gathered:** 2026-06-15 **Status:** Ready for planning

<domain>
## Phase Boundary

Agent activity becomes **visible and reviewable**, and live sessions can capture blockers in real time. Two halves:

1. **Review loops (REVIEW-01/02):** agent-created or completed work carries a **review tag** and surfaces in the user's
   today view. The tag distinguishes **review-output** (verify work the agent actually did) from **review-capture**
   (verify a task the agent decided should exist).
2. **Live auto-capture (LIVE-01):** during a live Claude Code session, the agent turns a concrete blocker or open
   question into an OmniFocus task in real time, with permission, **without** the `archaeology` tag.

**In scope:** the review-tag vocabulary + assignment; the today-view surfacing mechanism (native task properties only);
the live-capture judgment rule, permission flow, and placement; the live-capture marker tag.

**Out of scope (later phases):** custom-perspective **provisioning** and **contents resolution** — Phase 4 sets native
task properties only and rides OmniFocus's built-in Flagged/Forecast surfaces; building the JessOS perspective or a
filter-rule interpreter is Phase 6 (PROV-01, READAS-01, DISC-PERSP-03 `build`). Session archaeology — the retrospective
summarize-then-approve scan — is Phase 5 (ARCH-\*); live capture must stay distinct (no `archaeology` tag). The Phase 3
routing loop is **consumed** here (live captures route later), not rebuilt.

</domain>

<decisions>
## Implementation Decisions

### Review-tag vocabulary (REVIEW-01/02)

- **D-01:** **Two flat sibling tags — `review-output` and `review-capture`.** The output-vs-capture distinction
  (REVIEW-02) is carried by which of the two tags is assigned. Flat sibling tags were chosen over a hierarchical
  `review` parent+children and over a full `agent/*` namespace rewrite. Rationale: surfacing rides on the native flag +
  planned date (D-04), so the review tag's only job is **classification** — it does not need a structural parent to be
  "the one filter that surfaces everything." Flat siblings cost a single `addTag` find-or-create per item (the same path
  as `agent-okay` / `routing-unplaced`), add no parent-before-child ordering, and **rename nothing already shipped**.
- **D-02 (namespace coherence — answers Phase 3 D-13):** The `review-*` tags sit **alongside** the shipped flat family
  (`agent-okay`, `routing-unplaced`, future `archaeology`), coherent by prefix. The full `agent/*` hierarchical rewrite
  was explicitly rejected because it would rename the shipped Phase 3 `routing-unplaced` tag and its
  `FUNCTIONAL_TAG_ALLOWLIST` entry and migrate live tagged data — heavy for a single user. `routing-unplaced` keeps its
  shipped name; `review-output` / `review-capture` are new siblings.
- **D-03 (assignment path):** Tags are assigned via the OmniJS `addTag` find-or-create path — a `Tag` object is required
  (a string throws, DISC-TAG-02); JXA assignment silently no-ops (DISC-TAG-01). Reuse the existing
  `tag-mutation-script-builder.ts` find-or-create pattern; no new tag engine (DISC-TAG-03). New `review-*` tag names
  must be added to `FUNCTIONAL_TAG_ALLOWLIST` (the Phase 3 `routing-unplaced` precedent).

### Today-view surfacing (REVIEW-01)

- **D-04:** **Surface via `flagged: true` + `plannedDate` = today + the review tag.** Three native task-property writes,
  no perspective machinery:
  - **Flag** → the item appears in OmniFocus's stock **Flagged** perspective with **zero user setup** — the durable
    fallback surface on a vault that has not yet provisioned the JessOS perspective (DISC-PERSP-02 confirmed none exists
    yet).
  - **`plannedDate` = today** → the item lands on **Forecast "Today"** without fabricating a deadline. `plannedDate` (OF
    4.7+, available on target 4.8.11) is purpose-built as "scheduled for work, no constraint" — the correct
    non-committal "look at this today" signal.
  - **review tag** → carries the REVIEW-02 classification and is left as inert native data that **Phase 6's** JessOS
    perspective can later filter on (Phase 4 produces the input, builds none of the machinery).
- **D-05 (rejected — due/defer dates):** A **due** date was rejected for agent-asserted "should-exist" work: the agent
  has no authority to invent a deadline, and a fake due date corrupts the user's real GTD horizon. It is the least
  reversible option. Genuine dates are reserved for genuinely dated items. (Defer-only gates availability and does not
  assert "today.")
- **D-06 (flag-dilution accepted):** Setting `flagged` mixes agent items into the user's existing Flagged view. This was
  surfaced and **accepted** — the zero-setup guarantee is worth it; the review tag + `plannedDate` provide the finer
  signal, and Phase 6's perspective will give a dedicated view later.
- **D-07 (Phase 6 boundary, hard):** Phase 4 writes only native task **properties** (flag, planned date, tag
  membership). It must **never** enumerate `Perspective.Custom`, read/write `archivedFilterRules`, build the filter-rule
  interpreter (DISC-PERSP-03 / READAS-01), or provision the JessOS perspective (PROV-01). All surfacing rides
  OmniFocus's **built-in** Flagged and Forecast perspectives.

### Live auto-capture (LIVE-01)

- **D-08 (trigger):** **Named-signal rule, conservative.** The agent captures only on an explicit blocker / follow-up /
  "TODO later" / unresolvable-open-question signal in the session — expressed as a tight enumerated judgment rule in the
  skill prompt. This keeps live capture **rare, trusted, single-item**, mirroring routing's "bias to leave" (Phase 3
  D-01) and staying clearly distinct from Phase 5's retrospective batch scan (live capture fires once, in the moment).
  The broad-heuristic and owner-uttered-only options were rejected (noisy / defeats real-time noticing).
- **D-09 (permission):** **Reuse PERM-02 verbatim** — prompt-before-create, honoring the owner-set "allow all this
  session" grant (`SessionConfig`, owner-auth only). A manual live session runs in **live/interactive mode** (Phase 2
  D-04, reaffirmed Phase 3 D-09), so the gate is natural; the funnel owns the verdict, the agent renders the prompt. No
  second permission mechanism is built. The allow-all grant keeps a focused session from being interrupted on every
  blocker.
- **D-10 (placement):** **Inbox + `agent-okay` + a live-capture marker tag + LINE-01 lineage stamp; route later.** The
  captured blocker lands in the inbox (CAP-01 shape — messy item, no project decision required), tagged `agent-okay` so
  the **existing Phase 3 routing loop** can place it on a later run, with the session-lineage note (LINE-01) so context
  travels with it. **No `archaeology` tag.** Routing immediately (couples capture to the heavy routing brain mid-focus)
  and filing into the current project (misfiling risk — the agent rarely knows the live OF project confidently) were
  both rejected.
- **D-11 (capture path reuse):** Live capture reuses Phase 2's native OmniJS `new Task(name, inbox)` capture path
  (DISC-CAPTURE-01), the server-side lineage stamp, and the funnel/verifier — no new capture mechanism.

### Claude's Discretion

- **Live-capture marker tag name** (D-10) — pick during planning against the `review-*` / `routing-*` family so the
  namespaces stay coherent (e.g. `capture-live` or a `review-*`-adjacent name). Apply the same discipline Phase 3 D-13
  applied to `routing-unplaced`. Add it to `FUNCTIONAL_TAG_ALLOWLIST`.
- **Review-flag lifecycle** (skipped area, deferred to planning) — when/how a review flag clears so the today view does
  not accumulate (agent clears on next run vs. user manually unflags vs. completion auto-clears). Left as a
  planning-time decision; bias toward not building a custom clearing mechanism if a native behavior (e.g. completion
  clearing the flag/plannedDate, or the user reviewing-then-unflagging) suffices.
- **Whether "completed work" (REVIEW-01) is flagged the same as created work** — REVIEW-01 says agent-created _or
  completed_ work surfaces. Resolve during planning whether a completed task gets the same flag+plannedDate+review tag
  treatment (a completed task may not want a future `plannedDate`); keep the surfacing native and reversible.
- **Exact judgment-rule wording** for the named-signal trigger (D-08) — the enumerated "what counts as a concrete
  blocker" phrasing in the skill prompt; keep it conservative.
- **Whether live capture is its own skill or folded into an existing skill** — resolve during planning against the
  established skill pattern (`sync-work-tasks-to-omnifocus`, `route-inbox-to-projects`).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents (researcher, planner) MUST read these before planning or implementing.**

### Phase requirements & roadmap

- `.planning/REQUIREMENTS.md` — REVIEW-01, REVIEW-02, LIVE-01 (full acceptance criteria); also `archaeology` (ARCH-03,
  Phase 5) which live capture must NOT use, and PERM-02 (the prompt + allow-all-session contract D-09 reuses).
- `.planning/ROADMAP.md` §"Phase 4: Review Loops & Live Auto-Capture" — goal + success criteria + dependency on Phase 3.
- `.planning/PROJECT.md` — "capture → route → execute → **review**" arc; the review-loop one-liner ("agent flags work
  into a today view, distinguishing review-output from review-capture/archaeology"); architecture stance (OmniFocus =
  single source of truth, native-first, reuse-over-invention).

### Phase 1 discovery findings (build-vs-reuse evidence — cite these)

- `docs/reference/omnifocus-capabilities.md` §Tagging — **DISC-TAG-01** (JXA tag assignment no-ops; OmniJS `addTag`
  required), **DISC-TAG-02** (`addTag` needs a `Tag` object, find-or-create), **DISC-TAG-03** (tags are conventions over
  the native model — the basis for D-01/D-03; explicitly cites Phase 4 REVIEW-01/02).
- `docs/reference/omnifocus-capabilities.md` §Perspectives — **DISC-PERSP-02** (no JessOS perspective exists yet),
  **DISC-PERSP-03** (no `perspective.tasks` API — task resolution is `build`, scoped Phase 6), **DISC-PERSP-04**
  (`Perspective.Custom` has no constructor) — together the basis for the D-07 Phase-6 boundary.
- `docs/reference/omnifocus-capabilities.md` §Capture — **DISC-CAPTURE-01** (native OmniJS `new Task(name, inbox)` inbox
  path — the reuse basis for D-11).
- `docs/reference/omnifocus-capabilities.md` §Filtering / §Custom Fields — `flagged` / `plannedDate` / date fields are
  native and writable (the surfacing properties D-04 sets).

### Prior-phase contracts this phase consumes

- `.planning/phases/02-capture-permission-gating/02-CONTEXT.md` — **PERM-02** (prompt-before-create + allow-all-session
  grant in `SessionConfig`, the D-09 reuse), **LINE-01** (lineage stamp, D-10/D-11), the native capture path (D-11), and
  the single-funnel "funnel, not advisory" invariant.
- `.planning/phases/03-routing-on-demand-trigger/03-CONTEXT.md` — **D-12/D-13** (the `routing-unplaced` marker tag and
  the namespace-coordination ask that D-02 answers), **D-07/D-08/D-09** (the trigger-skill pattern + live-mode UX live
  capture stays consistent with), the `FUNCTIONAL_TAG_ALLOWLIST` precedent for adding new functional tags.

### Existing machinery to reuse

- `src/contracts/ast/tag-mutation-script-builder.ts` — OmniJS `addTag` find-or-create for the `review-*` and
  live-capture marker tags (D-03, D-10).
- `src/contracts/ast/mutation-script-builder.ts` — existing `flagged` / `plannedDate` setters (D-04) and the
  `new Task(name, inbox)` capture path (D-11).
- `src/tools/unified/OmniFocusWriteTool.ts` + the single mutation funnel + `src/tools/unified/verifier/` — every tag /
  flag / date / create write dispatches through the funnel and is confirmed by the independent write-verifier.
- `src/auth/operation-policy.ts` — the create/tag verdicts and the PERM-02 session grant (D-09).
- The `FUNCTIONAL_TAG_ALLOWLIST` (where `routing-unplaced` was added in Phase 3 03-01) — extend with the new
  `review-*` + live-capture marker tag names.

### Patterns / lore

- `docs/dev/JXA-VS-OMNIJS-PATTERNS.md`, `docs/dev/OMNIJS-FIRST-PATTERN.md` — bridge syntax for the tag/flag/date/create
  scripts.
- `docs/dev/SETTER-PATTERNS.md` — silent-write-failure risk (why the write-verifier round-trip matters here too).
- The `sync-work-tasks-to-omnifocus` and `route-inbox-to-projects` Claude Code skills — the established
  user-invoked-skill-calls-MCP-tools pattern any Phase 4 skill mirrors.

### External vault (read directly — not a repo path)

- `~/vaults/jess-os/` — the JessOS Obsidian supervisory vault. Live captures route into it via the Phase 3 loop later;
  Phase 4 itself does not read the vault.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **OmniJS `addTag` find-or-create** (`tag-mutation-script-builder.ts`) — assigns the `review-*` and live-capture marker
  tags (JXA assignment no-ops; bridge required — DISC-TAG-01/02).
- **`flagged` / `plannedDate` setters** (`mutation-script-builder.ts`) — already present; D-04 reuses them, 0 new
  builder code.
- **Native `new Task(name, inbox)` capture path** (Phase 2, DISC-CAPTURE-01) — live capture reuses it (D-11).
- **PERM-02 prompt + allow-all-session grant** (Phase 2) — live capture's consent flow reuses it verbatim (D-09); no new
  permission mechanism.
- **Phase 3 routing loop** (`route-inbox-to-projects` skill) — places live captures later; Phase 4 emits `agent-okay`
  inbox items and does not route (D-10).
- **`FUNCTIONAL_TAG_ALLOWLIST`** — `routing-unplaced` precedent for registering new functional tag names.

### Established Patterns

- Tags are conventional names over the native model; surfacing rides built-in OF perspectives — no perspective machinery
  in Phase 4 (D-07).
- Mutations dispatch through the single funnel and are confirmed by the independent write-verifier — flag/date/tag
  writes are no exception.
- Intelligence (the live-capture judgment rule) lives **agent-side in a skill prompt**, not server-side (D-08); the
  server stays plumbing.

### Integration Points

- **Upstream:** REVIEW tags flag agent work done by the routing/capture loops (Phase 2/3) and by live capture (this
  phase).
- **Phase 3 handoff:** live captures are `agent-okay` inbox items the Phase 3 routing loop consumes on a later run.
- **Phase 6 handoff (data, not machinery):** the `review-*` tags + flag + `plannedDate` are the native predicate Phase
  6's JessOS perspective will filter on — Phase 4 produces the input, builds none of the perspective code.
- **Namespace contract:** new tag names (`review-output`, `review-capture`, live-capture marker) coexist with
  `routing-unplaced` / `agent-okay` / future `archaeology` — keep them collision-free and allowlisted.

</code_context>

<specifics>
## Specific Ideas

- The owner is a Principal Engineer with a least-privilege, reuse-over-invention, least-disruption stance — visible in
  three places this discussion: choosing **flat sibling tags** over a hierarchical rewrite that would touch shipped
  Phase 3 data (D-01/D-02), reusing **PERM-02 verbatim** rather than a second permission path (D-09), and **inbox +
  route-later** over coupling capture to the routing brain mid-session (D-10).
- The `plannedDate` insight matters: the agent asserts "look at this today" **without fabricating a deadline**, keeping
  the user's real GTD horizon clean. Due dates are reserved for genuinely dated work (D-05).
- Flag-dilution into the existing Flagged view was surfaced and accepted as the price of a zero-setup surface (D-06).

</specifics>

<deferred>
## Deferred Ideas

- **Review-flag lifecycle / clearing** — when a review flag clears so the today view stays clean. Surfaced as a fourth
  area; the user chose to leave it to planning as a discretion item (see Claude's Discretion). Bias toward a native
  behavior over a custom clearing mechanism.
- **Hierarchical `agent/*` tag namespace** — the full tree (`agent/okay`, `agent/routing-unplaced`,
  `agent/review/output`, …) was considered for maximum coherence and rejected for this phase because it would rewrite
  shipped Phase 3 tags + allowlist on live data. Revisit only if the flat family becomes unwieldy.
- **Phase 6 — JessOS custom perspective** (PROV-01 / READAS-01): the dedicated today view that filters on the `review-*`
  tags. Phase 4 deliberately produces the tag/flag data but builds no perspective machinery (D-07).
- **Phase 5 — session archaeology** (ARCH-\*): the retrospective summarize-then-approve scan. Live capture (LIVE-01) is
  the real-time, single-item counterpart and stays distinct (no `archaeology` tag, D-08/D-10).

### Reviewed Todos (not folded)

None — no pending todos in STATE.md (`Pending Todos: None`).

</deferred>

---

_Phase: 4-Review Loops & Live Auto-Capture_ _Context gathered: 2026-06-15_
