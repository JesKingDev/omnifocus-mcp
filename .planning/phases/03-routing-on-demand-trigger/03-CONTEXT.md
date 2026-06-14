# Phase 3: Routing & On-Demand Trigger - Context

**Gathered:** 2026-06-14 **Status:** Ready for planning

<domain>
## Phase Boundary

The agent takes `agent-okay`-tagged inbox items and **routes** each one through a fixed decision ladder:

1. **Match** an existing project → file the task there (ROUTE-01).
2. No match → **infer** from the vault: read a routing signal that says where the item belongs (ROUTE-02), and when the
   signal is present, **create** the project and file the task under it (ROUTE-03).
3. Nothing inferable → **leave** the item in the inbox rather than guess (ROUTE-04).

The whole loop is **runnable on-demand via a manual trigger** — the MVP path before any scheduler (TRIG-01).

**In scope:** the routing decision (match → infer → leave), the vault-signal reader, native filing via `moveTasks()`,
project creation for the infer branch, the on-demand trigger surface (a Claude Code skill), the summarize-then-approve
run UX, and a marker tag on left items.

**Out of scope (later phases):** the scheduled/n8n polling trigger (TRIG-02, deferred); review tags surfacing agent work
in a today view (Phase 4, REVIEW-*) — Phase 3 *writes* the marker tag for left items but does **not** build the
today-view surface; live real-time blocker capture (Phase 4, LIVE-01); session archaeology (Phase 5, ARCH-*);
perspective provisioning + vault-checkbox migration (Phase 6). The `agent-okay` predicate and capture stamp are
**consumed** here, not built (Phase 2 owns them, D-07).

</domain>

<decisions>
## Implementation Decisions

### Matching brain (ROUTE-01 + match/infer/leave threshold)

- **D-01:** **Agent semantic judgment, not a bespoke matcher.** Routing runs inside Claude Code (the agent _is_ the
  LLM), so the matcher is the agent reasoning over the enumerated project list — no deterministic token-matcher to
  build. The agent files only on high confidence and **abstains toward "leave"** (ROUTE-04 satisfied by construction).
  Deterministic token-matching and the deterministic+agent hybrid were both considered and rejected as bespoke code for
  a problem the agent already solves; revisit only if replayable/no-LLM routing becomes a hard requirement.
- **D-02:** **Candidate set = active projects only** (exclude done/dropped/on-hold), shown to the agent as **folder
  path + project name + project note text**. The project note is included as extra signal for ambiguous items.
  On-hold/someday projects are excluded to avoid filing into dormant work.
  - **Planning input:** this needs a projects read projection that includes **note text** for active projects. This is a
    _projects_ projection, distinct from the deferred by-id `read_path_gap` (which concerns `omnifocus_read` ignoring
    `filters.ids` and omitting tags on by-id task projections). Confirm the projects query can return notes; if not,
    that's a small read-layer addition this phase owns.

### Vault signal (ROUTE-02 / ROUTE-03)

- **D-03:** **A new explicit frontmatter map is the routing signal — not semantic inference over vault structure.**
  Curated vault notes carry frontmatter keys `omnifocus-project` (target project name) and `omnifocus-folder` (placement
  for ROUTE-03). The user deliberately chose the deterministic, curated map over a semantic read of
  `01-pointers/`/`02-projects/` to avoid the agent guessing and over-creating projects. Note → OF-project is therefore
  **deterministic**.
- **D-04:** **Item → note is semantic; note → project is deterministic.** The agent semantically matches an inbox item
  to the right frontmatter-tagged note by the note's topic/title, then reads the deterministic `omnifocus-project` /
  `omnifocus-folder` mapping. (Keyword-alias matching — a fully-deterministic `omnifocus-match:` field — was offered and
  not taken; item→note stays semantic for lower upkeep.)
- **D-05:** **The agent reads the vault directly.** Routing runs on the Mac, so the vault read is a direct `Read`/`Grep`
  over `~/vaults/jess-os/` — no MCP layer or new server surface. The reader greps for the `omnifocus-project`
  frontmatter key across the vault.
- **D-06 (adoption caveat):** Routing **infers nothing** until at least one vault note carries the `omnifocus-project`
  field. Until the map is seeded, unmatched items fall straight to ROUTE-04 (leave). Seeding the frontmatter is the
  user's curation task, **out of scope** for Phase 3 — Phase 3 builds the reader, not the map content.

### Trigger & run shape (TRIG-01)

- **D-07:** **The on-demand trigger is a Claude Code skill**, mirroring the existing `sync-work-tasks-to-omnifocus`
  skill pattern. The routing brain (semantic judgment, D-01) and the vault read (D-05) both live agent-side, so the
  trigger cannot be a server-side MCP operation (the server is plumbing with no LLM). The skill calls the existing
  `omnifocus_read` / `omnifocus_write` tools. A CLI/Makefile target is the right shape for the **deferred** scheduled
  path (TRIG-02), not this MVP.
- **D-08:** **Run shape = summarize-then-approve, one-pass batch.** A run reads all `agent-okay` inbox items, proposes a
  full plan (each item → match / infer / leave + target), waits for the user to **approve or edit**, then executes the
  moves/creates. This mirrors the locked ARCH-02 pattern so the two agent workflows feel consistent, gives one approval
  instead of N, and makes the pre-execution plan the audit trail. Interactive-per-item (too tedious / high
  context-switch cost) and autonomous file-and-report (that is the deferred TRIG-02 shape) were rejected.
- **D-09 (mode reconciliation):** A **manual** trigger is user-initiated and interactive, so it runs in **live** mode
  (Phase 2 D-04), where the summarize-then-approve gate is natural and consistent with PERM-02. The **background /
  no-prompt** mode applies only to the deferred scheduled path (TRIG-02). Earlier framing that "on-demand runs in
  background mode" was corrected during discussion.

### Write posture & gating (ROUTE-01/03 actions)

- **D-10:** **Allow + funnel + verify** for routing's writes (`moveTasks()` filing and project-create). Both dispatch
  through the **single mutation funnel** with an `allow` verdict and are confirmed by the **write-verifier** read-back.
  The summarize-then-approve plan (D-08) is the human consent layer; the funnel + verifier are the safety layer. No
  additional server-side `gate` is stacked on these reversible, agent-okay-scoped, pre-approved ops.
  Advisory/agent-side-only writes were rejected (violates the milestone "funnel, not advisory" invariant); server-side
  gating was rejected as redundant with the batch approval.
- **D-11:** Filing a matched/inferred item uses native **`moveTasks()`** (DISC-MODEL-06) — no custom mover. Project
  creation uses the existing `omnifocus_write` create/project path, which Phase 2 policy already resolves to **allow**
  for the agent.

### Leave record (ROUTE-04)

- **D-12:** **Left items get a durable marker tag**, so skips are queryable and visible rather than ephemeral. The run
  summary still lists what was left and why, but a marker tag (not just a report) is the chosen record. Re-runs **do not
  re-tag** an already-marked item, and **may still re-evaluate** a marked item if the vault map (D-03) has since changed
  — the marker means "routing looked and couldn't place it," not "never look again."
- **D-13 (boundary):** The marker **tag** lands in Phase 3. Surfacing it in a **today view** is Phase 4 (REVIEW-\*) —
  Phase 3 must not build the today-view surface. Resolve the exact tag name during planning against Phase 4's review-tag
  vocabulary so the two don't collide or duplicate (see Claude's Discretion).

### Claude's Discretion

- **Exact marker-tag name** for left items (D-12/D-13) — pick during planning, checking Phase 4's REVIEW-_ tag plan so
  the names are coherent (e.g., a `routing-_` namespace) and don't pre-empt review tags.
- **Confidence wording** for the abstain rule (D-01) — the precise "file vs check-vault vs leave" bar is the agent's
  judgment rule expressed in the skill prompt; keep it conservative (bias to leave) but the exact phrasing is flexible.
- **Plan/report format** of the summarize-then-approve output (D-08) — table vs list, grouping by decision — choose what
  reads cleanly in the skill.
- **Where the projects-with-notes read projection lives** (D-02) — reuse the existing projects query if it can return
  notes; add a minimal projection field if it cannot.
- **Whether `omnifocus-folder` accepts a folder path vs a folder name**, and how a missing/!existing folder is handled
  on project-create (D-03) — resolve during planning.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents (researcher, planner) MUST read these before planning or implementing.**

### Phase requirements & roadmap

- `.planning/REQUIREMENTS.md` — ROUTE-01…04, TRIG-01 (full acceptance criteria); also PERM-01 (the `agent-okay` scope
  routing consumes) and TRIG-02 (the deferred scheduled trigger this MVP precedes).
- `.planning/ROADMAP.md` §"Phase 3: Routing & On-Demand Trigger" — goal + dependency on Phase 2; Phase 3 is also the
  dependency gate for Phase 6.
- `.planning/PROJECT.md` — "capture → route → execute → review" arc; architecture stance (OmniFocus = single source of
  truth, JessOS = supervisory vault); the routing one-liner "match existing project, else infer from the vault, else
  create project+task, else leave in inbox."

### Phase 2 context (the contracts Phase 3 consumes)

- `.planning/phases/02-capture-permission-gating/02-CONTEXT.md` — **D-06/D-07** (the `agent-okay` read-side predicate
  Phase 3 consumes to decide which tasks routing may touch), **D-04/D-05** (interactive vs background mode signal;
  routing's live-mode reconciliation D-09 builds on this), **D-01/D-03** (the single-funnel "funnel, not advisory"
  enforcement invariant D-10 honors).

### Phase 1 discovery findings (build-vs-reuse evidence — cite these)

- `docs/reference/omnifocus-capabilities.md` §MODEL — **DISC-MODEL-06** (`moveTasks()` relocates tasks between projects
  natively — the reuse basis for D-11), DISC-MODEL-01 (`project.sequential` persists on write-back). §FILTER —
  DISC-FILTER-01/02 (targeted collections; `.whose()`/`.where()` forbidden) for the active-projects candidate read
  (D-02). §FIELD — DISC-FIELD-01 (`task.note` extension point).

### Existing machinery to reuse (hardening + Phase 2)

- `src/tools/unified/OmniFocusReadTool.ts` + `src/tools/tasks/task-query-pipeline.ts` + `src/contracts/filters.ts` — the
  read path for enumerating active projects with notes (D-02) and the `agent-okay` predicate (Phase 2 D-06).
- `src/tools/unified/OmniFocusWriteTool.ts` + the single mutation funnel — where `moveTasks()` and project-create
  dispatch with policy verdicts (D-10/D-11).
- `src/auth/operation-policy.ts` — `PolicyEngine.decide()`; create/project already resolves to `allow`; confirm `move`
  dispatches through the funnel with an `allow` verdict (D-10).
- `src/tools/unified/verifier/` — the independent write-verifier that must confirm each move/create read-back (D-10).
- `src/contracts/ast/mutation-script-builder.ts` + `src/contracts/ast/tag-mutation-script-builder.ts` — OmniJS
  `moveTasks`/`addTag` script construction (D-11, D-12 marker tag via the bridge — JXA tag assignment silently no-ops).

### Patterns / lore

- `docs/dev/JXA-VS-OMNIJS-PATTERNS.md`, `docs/dev/OMNIJS-FIRST-PATTERN.md` — bridge syntax for the move/create/tag
  script.
- `docs/dev/SETTER-PATTERNS.md` — silent-write-failure risk (why D-10's write-verify matters).
- The existing **`sync-work-tasks-to-omnifocus`** Claude Code skill — the established trigger-skill pattern D-07 mirrors
  (a user-invoked skill that calls the MCP tools).

### External vault (read directly during routing — not a repo path)

- `~/vaults/jess-os/` — the JessOS Obsidian vault. PARA layout: `01-pointers/`, `02-projects/`, `03-areas/`,
  `03-resources/`, `04-archive/`, `07-decisions/`. The routing reader greps for the `omnifocus-project` frontmatter key
  across this tree (D-03/D-05). No `omnifocus-project` convention exists in the vault today (D-06 adoption caveat).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Native `moveTasks()`** (DISC-MODEL-06) files a matched/inferred item — no custom mover (D-11).
- **`agent-okay` predicate** (Phase 2 D-06) already composes `tags` + `inInbox` filters at the unit/codegen layer —
  routing's input set is `agent-okay` inbox items, reusing this predicate.
- **Single mutation funnel + write-verifier** already enforce + verify mutations server-side — move/create plug in with
  `allow` verdicts (D-10), not a new mechanism.
- **Trigger-skill pattern** — `sync-work-tasks-to-omnifocus` shows the user-invoked-skill-calls-MCP-tools shape D-07
  reuses.
- **OmniJS `addTag`** path (Phase 2 capture stamp) is reused for the D-12 marker tag (JXA assignment no-ops — bridge
  required).

### Established Patterns

- Trust boundaries bind to the **connection**, enforced **server-side** (funnel) — D-10 keeps move/create inside the
  funnel rather than going advisory.
- Write-verification is an independent post-mutation read-back — routing's moves/creates must round-trip through it
  (D-10).
- The agent (Claude Code) is the LLM; intelligence (semantic match, vault read) lives **agent-side in a skill**, not
  server-side (D-01/D-05/D-07).

### Integration Points

- **Input contract:** the `agent-okay` predicate (Phase 2) defines routing's input set.
- **Vault contract:** the `omnifocus-project` / `omnifocus-folder` frontmatter (D-03) is the new external contract
  between the JessOS vault and routing.
- **Downstream:** the marker tag on left items (D-12) is the surface Phase 4 review tags build on; routing-created
  projects + filed tasks are what Phase 6 migration eventually places into.

</code_context>

<specifics>
## Specific Ideas

- Owner is a Principal Engineer with a least-privilege, reuse-over-invention, no-bespoke-mechanism stance — visible in
  the two places the user overrode the "lighter" recommendation: choosing the **explicit deterministic frontmatter map**
  over semantic vault inference (D-03, avoids over-creating projects), and choosing a **durable marker tag** over an
  ephemeral report for left items (D-12, wants skips queryable). Both trade a little upkeep/write-churn for control and
  visibility.
- The vault is Obsidian/PARA (JessOS); the frontmatter map deliberately rides on the structure the user already curates
  rather than introducing a parallel database — but as an explicit opt-in field, not an inferred convention.

</specifics>

<deferred>
## Deferred Ideas

- **TRIG-02 — scheduled/n8n polling trigger** under background mode (no prompt). The fail-safe background default exists
  (Phase 2 D-05); the scheduled path that exercises it is a deferred follow-up to this on-demand MVP. CLI/Makefile
  target is its natural surface (D-07).
- **`omnifocus-match:` keyword-alias frontmatter** — a fully-deterministic item→note step. Offered and not taken (D-04
  keeps item→note semantic); reintroduce only if semantic item→note proves too loose.
- **Today-view surfacing of the leave marker** — Phase 4 (REVIEW-\*). Phase 3 writes the tag only (D-13).
- **Keyword-anchored / pointers-only vault read** — the semantic-structure-read and pointers-only options for ROUTE-02
  were rejected in favor of the explicit frontmatter map (D-03); noted in case the map proves too high-upkeep.

### Reviewed Todos (not folded)

None — no pending todos in STATE.md (`Pending Todos: None`).

</deferred>

---

_Phase: 3-Routing & On-Demand Trigger_ _Context gathered: 2026-06-14_
