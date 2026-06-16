# Phase 5: Session Archaeology - Context

**Gathered:** 2026-06-16 **Status:** Ready for planning

<domain>
## Phase Boundary

A retrospective, **summarize-then-approve** scan that reads the last 7 days of active (non-archived) Claude Code
sessions, surfaces _unresolved open loops_ per session, lets the user approve which to extract, and turns approved loops
into `archaeology`-tagged OmniFocus tasks placed in the right project (inbox only as fallback). ARCH-01, ARCH-02,
ARCH-03.

**In scope:** the session source + 7-day/active windowing; the open-loop detection rule; the per-session
summarize-then-approve interaction; the placement path (reuse Phase 3 routing logic); re-scan/dedup safety; registering
the `archaeology` tag.

**Out of scope (other phases / later):** the JessOS custom perspective that filters on `archaeology` (Phase 6,
PROV-01/READAS-01); real-time single-item live capture (Phase 4 LIVE-01, which must **never** use the `archaeology`
tag); n8n 15-min polling (later — this phase stays on-demand, manual trigger); building a new routing engine (Phase 3
routing is **consumed**, not rebuilt).

</domain>

<decisions>
## Implementation Decisions

### Detection: source + rule (ARCH-01)

- **D-01 (source — raw transcripts):** The scan reads the **raw Claude Code session transcripts**
  (`~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`). The `.remember/` derived files were **rejected as the scan
  target** — they record _completed wins_ (wrong polarity for finding things left undone) and are lossy by design;
  anything that died mid-session never reaches them. `.remember/` may serve only as an optional cheap triage _index_ to
  pick which days are worth a transcript dive, never as the source of loops.
- **D-02 (windowing — content date, not mtime):** "Last 7 days" keys off each message's **per-message ISO `timestamp`
  (content date)**, not file mtime — the two drift hours-to-days in practice (a session first written 06-14 can carry an
  mtime of 06-15). "Active (non-archived)" resolves to **this repo's encoded-cwd dir plus its
  `…--claude-worktrees-agent-*` sibling dirs**, filtered to messages within 7 days. **Exclude `isSidechain` subagent
  transcripts in v1** (agent-internal threads, rarely the user's own loop).
- **D-03 (rule — broad inference with an enumerated floor):** The detection rule is **broad semantic inference of
  incomplete intent** — categories: open question, deferred work, stated-but-unfiled intent, unfinished edit — with the
  Phase 4 **D-08 enumerated markers** (`TODO`, `blocker`, `next:`, unanswered question) kept as a **guaranteed-catch
  floor**. This is the inverse of Phase 4 live-capture's conservative net: that net was tuned for _real-time
  single-item_ firing where false positives are costly and unreviewed; archaeology is a **retrospective batch the user
  approves before anything is created (ARCH-02)**, and that approval gate is exactly what licenses trading precision for
  **recall** (the phase exists to recover _buried_ loops). A deterministic **pre-filter** strips `tool_use` /
  `tool_result` / `attachment` / `file-history-snapshot` lines before the model reads the transcript (token budget;
  transcripts run to ~2.6 MB each, ~76 files over 7 days for this repo).

### Approval: granularity + summary shape (ARCH-02)

- **D-04 (per-session approve + lazy per-loop edit):** First pass is a **read-only plain-text summary table** — columns
  `Session | What it was about | Open loops? | Count` — and the user approves **which sessions** to extract from. An
  approved session extracts all its loops, but a **row-level `edit` verb** lets the user drop or trim loops before any
  write. This gives **one decision surface (sessions, not loops)**, satisfies ARCH-02's mandatory per-session summary,
  and mirrors the shipped `route-inbox-to-projects` Pass 1 `yes / edit / abort` gate exactly. The per-session **loop
  count** is shown so volume is visible before approval (mitigates rubber-stamping a high-loop session). **Two-tier
  mandatory per-loop triage was rejected** — a week's scan surfaces dozens of loops, and a flat per-loop list is the
  overwhelm/shutdown pattern the owner's executive-function profile flags.
- **D-04a (interaction primitive):** Approval is a **plain-text reply** (`yes / edit / abort`), **not**
  `AskUserQuestion` — the analogous shipped routing skill uses plain text, and `AskUserQuestion` caps poorly when a
  week's scan spans many sessions.

### Placement: reuse Phase 3 routing (ARCH-03)

- **D-05 (reuse routing logic, placement is a deliverable):** Approved loops are placed via the **Phase 3 routing
  logic** (`match → infer → create → leave`) carrying the `archaeology` tag — **placement is an actual deliverable of
  the archaeology run**, not deferred. ARCH-03's "in the correct project (inbox only as fallback)" makes eventual
  placement insufficient, so **route-later (the Phase 4 D-10 live-capture mirror) was rejected** — that deferral was
  justified by a single item captured _mid-focus_ when the user isn't in a routing headspace, which does not transfer to
  a deliberate, already-supervised batch. Each created task carries **`agent-okay` + `archaeology` + the LINE-01 lineage
  stamp**. The `archaeology` tag is **added to `FUNCTIONAL_TAG_ALLOWLIST`**
  (`src/contracts/ast/mutation-script-builder.ts`) per the Phase 3 `routing-unplaced` precedent — it is the one
  milestone functional tag not yet registered.
- **D-06 (ONE merged approval gate):** The extraction approval (which loops) and the placement approval (which project)
  are presented as a **single merged gate**, not two sequential ones. Archaeology **pre-computes the routing proposal**
  (matched project / vault-inferred / inbox fallback) for each candidate loop and shows **loop + proposed placement in
  one table**; a single `yes / edit / abort` covers both extraction and placement. Chosen over two back-to-back gates to
  minimize decision surfaces (context-switching cost). **Planning implication / the cost this buys:** archaeology must
  be able to run routing's `match → infer` steps to produce a _proposal_ **without** triggering the routing skill's own
  separate approval pass. The `route-inbox-to-projects` matching procedure should be factored or documented so it is
  invocable as a proposal step; this is the one added-complexity item the merged gate introduces — resolve the exact
  reuse mechanism (call/chain vs. shared documented procedure) during planning.

### Re-scan / dedup safety

- **D-07 (lineage-match, session granularity):** Repeated 7-day scans overlap; before surfacing a loop the skill does an
  **`omnifocus_read` for `archaeology`-tagged tasks and parses the originating session ID from the `of-mcp:lineage` note
  block (`LINEAGE_RE`)**, then **skips sessions already extracted**. This **reuses `src/contracts/ast/lineage.ts`** —
  built explicitly "so Phase 5 archaeology can extract the metadata" — for **near-zero new code and no new persistent
  state**; dedup state lives in OmniFocus itself (cross-machine, self-healing — a deleted task legitimately re-surfaces
  its loop). A **scanned-marker file was rejected** (the new persistent state the least-machinery bias avoids);
  **approval-gate-only was rejected** (re-reviewing already-handled loops on every weekly scan is precisely the
  friction/overwhelm trigger to design out, not to push onto the human). Start at **session granularity**; promote to
  the hybrid per-loop key (D-08 below) only if real usage shows multi-loop sessions re-surfacing their un-extracted
  siblings.

### Claude's Discretion

- **Exact loop-category rubric wording** in the skill prompt (D-03) — keep tight so "incomplete intent" does not balloon
  into every passing remark; the four categories (open question / deferred work / stated-but-unfiled intent / unfinished
  edit) are the frame.
- **Skill composition** — whether archaeology is its own skill that _reuses_ routing's matching procedure, or composes
  the `route-inbox-to-projects` skill directly. Resolve against the established skill pattern
  (`route-inbox-to-projects`, `capture-live-blocker`, `sync-work-tasks-to-omnifocus`); the **merged-gate** constraint
  (D-06) biases toward archaeology owning the gate and reusing routing's `match→infer` logic as a proposal step.
- **Pre-filter implementation** (D-03) — how transcript tool-noise is stripped before the model reads (inline vs. a
  small `jq`/python helper). `osascript`/TS-only repo conventions apply to anything that lands in `src/`; a throwaway
  probe may be `.js`.
- **Hybrid per-loop dedup key (D-08, deferred):** if multi-loop sessions re-surface un-extracted siblings, stamp a
  per-loop discriminator (hash/ordinal) into the lineage payload (schema `v` bump) so partially-extracted sessions
  resolve cleanly. Not built now.
- **Summary table exact columns/wording** (D-04) — the `Session | What it was about | Open loops? | Count` shape is the
  frame; refine during planning.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents (researcher, planner) MUST read these before planning or implementing.**

### Phase requirements & roadmap

- `.planning/REQUIREMENTS.md` — **ARCH-01** (scan last 7 days of active sessions for unresolved open loops), **ARCH-02**
  (per-session summarize-then-approve, never bulk auto-create), **ARCH-03** (approved loops → tasks in correct project,
  inbox fallback, tagged `archaeology`). Also **LINE-01** (lineage stamp this phase reads back for dedup).
- `.planning/ROADMAP.md` §"Phase 5: Session Archaeology" — goal + success criteria + dependency on Phase 3 (routing) and
  Phase 4 (review/tagging conventions).
- `.planning/PROJECT.md` — the `capture → route → execute → review` arc + the session-archaeology one-liner ("summarize-
  then-approve scan… approved loops become tasks in the right project, tagged `archaeology`"); architecture stance
  (OmniFocus = single source of truth, native-first, reuse-over-invention, intelligence agent-side in skill prompts).

### Phase 1 discovery findings (build-vs-reuse evidence — cite these)

- `docs/reference/omnifocus-capabilities.md` §Tagging — agent tags (`agent-okay`, `review-*`, `archaeology`) are
  **conventions over the native model**; OmniJS `addTag` find-or-create required (JXA no-ops). The basis for adding
  `archaeology` to the allowlist (D-05).
- `docs/reference/omnifocus-capabilities.md` §Capture — native OmniJS `new Task(name, inbox)` inbox path (the create
  path archaeology reuses).

### Prior-phase contracts this phase consumes

- `.planning/phases/03-routing-on-demand-trigger/03-CONTEXT.md` — the `match → infer → create → leave` routing loop, its
  `routing-unplaced` marker + `FUNCTIONAL_TAG_ALLOWLIST` precedent (D-05), and the two-pass summarize-then-approve gate
  shape (D-04/D-06).
- `.planning/phases/04-review-loops-live-auto-capture/04-CONTEXT.md` — the **D-08 conservative named-signal trigger**
  (the floor D-03 inverts/extends), the **D-10 route-later live-capture decision** (the placement choice D-05 explicitly
  _diverges_ from), and the `archaeology`-must-stay-distinct boundary.
- `.planning/phases/02-capture-permission-gating/02-CONTEXT.md` — **LINE-01** lineage stamp + native capture path + the
  single mutation funnel/verifier all writes pass through.

### Existing machinery to reuse

- `src/contracts/ast/lineage.ts` — `LINEAGE_RE` + the idempotent `composeLineageStamp` (strip-before-reappend); the
  `of-mcp:lineage` note block stores the originating session ID — **the dedup backbone (D-07)**, written for this phase.
- `src/contracts/ast/mutation-script-builder.ts` — `FUNCTIONAL_TAG_ALLOWLIST` (add `archaeology`, D-05); the
  `new Task(name, inbox)` create path and tag/flag setters.
- `src/contracts/ast/tag-mutation-script-builder.ts` — OmniJS `addTag` find-or-create for the `archaeology` tag.
- `.claude/skills/route-inbox-to-projects/SKILL.md` — the `match → infer → create → leave` procedure + the
  `yes / edit / abort` Pass-1 gate; **reused for placement (D-05) and the merged-gate proposal step (D-06)**.
- `.claude/skills/capture-live-blocker/SKILL.md`, `sync-work-tasks-to-omnifocus` — the
  user-invoked-skill-calls-MCP-tools pattern any archaeology skill mirrors.
- `src/tools/unified/OmniFocusReadTool.ts` — the `tags` + `note` filters the dedup read (D-07) queries.

### Session store (read directly — not a repo path)

- `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` — the raw transcripts (D-01). Per-message ISO `timestamp`
  (windowing, D-02), `isSidechain` flag (subagent exclusion, D-02). Include this repo's encoded-cwd dir + its
  `…--claude-worktrees-agent-*` sibling dirs.
- `./.remember/` (now.md, today-\*.md, recent.md, archive.md, core-memories.md) — optional triage index only, **not**
  the scan target (D-01).

### Patterns / lore

- `docs/dev/JXA-VS-OMNIJS-PATTERNS.md`, `docs/dev/OMNIJS-FIRST-PATTERN.md` — bridge syntax for the tag/create scripts.
- `docs/dev/SETTER-PATTERNS.md` — silent-write-failure risk (the write-verifier round-trip still applies to archaeology
  creates).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`lineage.ts` (`LINEAGE_RE`, `composeLineageStamp`)** — already idempotent and explicitly written for archaeology
  metadata extraction; the dedup mechanism (D-07) is a read + regex over infra that already exists, ~0 new code.
- **`route-inbox-to-projects` skill** — the entire `match → infer → create → leave` placement brain; archaeology reuses
  it for placement (D-05) and as the merged-gate proposal source (D-06) rather than duplicating routing logic.
- **`FUNCTIONAL_TAG_ALLOWLIST`** — `routing-unplaced` precedent for registering `archaeology` (D-05).
- **Native `new Task(name, inbox)` + tag setters + the funnel/verifier** — every archaeology create dispatches through
  the same single funnel and is write-verified.

### Established Patterns

- Tags are conventional names over the native model; intelligence (detection rule, summary, proposal) lives **agent-side
  in the skill prompt**, server stays plumbing.
- The two-pass summarize-then-approve gate (`yes / edit / abort`, plain text) is the shipped routing-skill shape — D-04
  reuses it, D-06 merges extraction + placement into one gate.

### Integration Points

- **Upstream (read):** Claude Code transcripts in `~/.claude/projects/` (raw source) + OmniFocus (dedup read against
  existing `archaeology` tasks).
- **Phase 3 reuse:** archaeology reuses routing's `match→infer` logic to pre-compute placement proposals (merged gate).
- **Phase 6 handoff (data, not machinery):** the `archaeology` tag + placement + lineage are native predicates Phase 6's
  JessOS perspective will filter on — Phase 5 produces the input, builds no perspective code.
- **Namespace contract:** `archaeology` joins `agent-okay` / `routing-unplaced` / `review-*` / `capture-live` —
  collision-free, allowlisted.

</code_context>

<specifics>
## Specific Ideas

- The owner deliberately maintains the `.remember/` session-memory layer, but it was correctly ruled out as the scan
  _source_ — it records completed wins, the wrong polarity for finding undone work. The raw transcript is where buried
  loops live verbatim.
- The asymmetry that drives D-03: live capture (Phase 4) bias-to-leave/conservative because it fires unreviewed in real
  time; archaeology bias-to-recall because a human approves the whole batch first. Same owner, opposite tuning, same
  reason — the approval gate is the safety mechanism.
- The merged gate (D-06) is the owner's overwhelm-avoidance profile expressed in UX: collapse two decision surfaces into
  one, at the cost of pre-computing routing proposals before the gate.

</specifics>

<deferred>
## Deferred Ideas

- **Hybrid per-loop dedup key** (D-08) — a per-loop discriminator in the lineage payload for partially-extracted
  multi-loop sessions. Build only if session-granularity dedup proves insufficient in practice.
- **n8n 15-min polling of archaeology** — the on-demand scan is the MVP; scheduled polling is a later phase/milestone.
- **Phase 6 JessOS custom perspective** filtering on `archaeology` — Phase 5 produces the tag/placement data, builds no
  perspective machinery.

### Reviewed Todos (not folded)

- `reconcile-review-output-test-with-locked-convention` (pending) — a **Phase 4** review-tag test reconciliation, not
  archaeology scope. Left for `/gsd-audit-uat`, not folded here.

</deferred>

---

_Phase: 5-Session Archaeology_ _Context gathered: 2026-06-16_
