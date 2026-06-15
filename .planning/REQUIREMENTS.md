# Requirements: agent-workflow — Agent Workflow System

**Defined:** 2026-06-11 **Core Value:** The agent can read and write OmniFocus tasks safely so JessOS can trust
OmniFocus as the source of truth — now extended with a safe capture → route → execute → review loop and session
archaeology.

## Milestone Requirements

Requirements for the `agent-workflow` milestone. Each maps to exactly one roadmap phase.

> **Sequencing constraint (locked):** Capability discovery (DISC-\*) gates everything else. No workflow design or build
> proceeds until OmniFocus' native capabilities are understood — so we don't build custom code for what OmniFocus
> already does.

### Capability Discovery

- [x] **DISC-01**: A capability-discovery report documents OmniFocus native behavior across tagging, filtering, custom
      fields, perspectives, the project/task data model (sequencing + dependencies — sequential vs. parallel), native
      capture workflows (inbox, templates), and automation surfaces (OmniAutomation / URL schemes / plug-ins).
- [x] **DISC-02**: For each capability area, the report states where OmniFocus handles it natively vs. where the MCP
      integration genuinely adds value — an explicit native-vs-build decision per area.

### Capture

- [x] **CAP-01**: User can dump a messy item straight into the OmniFocus inbox without deciding project, tags, or dates.

### Routing

- [x] **ROUTE-01**: Agent matches an inbox item to an existing project and files the task there.
- [x] **ROUTE-02**: When no project matches, agent checks the vault for a signal on where the item belongs.
- [x] **ROUTE-03**: When the vault gives a signal, agent creates the project and files the task under it.
- [ ] **ROUTE-04**: When no project can be inferred, agent leaves the item in the inbox rather than guessing.

### Permission Gating

- [x] **PERM-01**: In async/background runs, agent acts only on tasks explicitly tagged `agent-okay`; untagged tasks are
      left untouched.
- [x] **PERM-02**: In sync/live sessions, agent prompts before creating a task, offering an "allow all this session"
      option (mirrors the existing Jira-creation permission flow).

### Review Loops

- [ ] **REVIEW-01**: Agent flags created/completed work with a review tag so it surfaces in the user's today view.
- [ ] **REVIEW-02**: Review flags distinguish **review-output** (verify work the agent did) from
      **review-capture/archaeology** (verify a task the agent decided should exist).

### Session Archaeology

- [ ] **ARCH-01**: Agent scans the last 7 days of active (non-archived) Claude Code sessions for unresolved open loops.
- [ ] **ARCH-02**: The first pass summarizes per session (what it was about + whether open loops exist) and waits for
      the user to approve which sessions to extract from — it never bulk auto-creates tasks.
- [ ] **ARCH-03**: Approved open loops become OmniFocus tasks in the correct project (inbox only as fallback), tagged
      `archaeology`.

### Live Auto-Capture

- [ ] **LIVE-01**: During a live session, agent captures a concrete blocker or open question as an OmniFocus task in
      real time (with permission), without the `archaeology` tag.

### Session Lineage

- [x] **LINE-01**: Every agent-created task stores its originating Claude Code session ID in the task notes, so context
      travels with the task across context-window boundaries.

### Trigger

- [ ] **TRIG-01**: Agent workflows (routing, archaeology) can be run on-demand via a manual trigger — the MVP path that
      proves gating + routing before any scheduler is added.

### Surfaces & Migration (carried from hardening)

- [ ] **READAS-01**: User can resolve a named custom perspective's contents (not just list names) through the read tool.
- [ ] **PROV-01**: Agent can provision/repair the JessOS custom perspective via OmniJS `Perspective.Custom` (OmniFocus
      Pro).
- [ ] **MIG-01**: One-time migration of existing Obsidian vault checkboxes into OmniFocus, now that writes are
      verified-trustworthy.

## Deferred (Future Milestones)

Acknowledged but not in this roadmap.

### Scheduling

- **TRIG-02**: Hardened n8n trigger polls every 15 min to run routing + archaeology automatically (follow-up to the
  on-demand MVP).

### Surfaces

- **SURF-01**: Regenerate JessOS markdown surfaces (`today.md` / `daily-briefing.md`) from OmniFocus — OmniFocus is now
  the surface, so this only revives if native perspectives prove insufficient.

### Work integration

- **WORK-01**: Pull work-account Google Tasks into OmniFocus via the Fantastical → Google Tasks path — not in this
  milestone's brief; a `sync-work-tasks-to-omnifocus` skill already covers the immediate need.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                                      | Reason                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Bidirectional OmniFocus ↔ Obsidian task sync | By design — agents read OmniFocus directly; a sync layer is unnecessary complexity.     |
| Silent bulk archaeology auto-create          | Archaeology must stay summarize-then-approve; never create tasks without user sign-off. |
| Obsidian Tasks plugin as a task store        | Retired — OmniFocus is the single source of truth (ADR-005 supersedes ADR 001).         |
| Cloud hosting / containerizing the server    | Mac-pinned via `osascript`/Apple Events; cannot run in a Linux container.               |
| `[TKWW]` work bridge → OmniFocus             | Separate effort; depends on unreliable Gemini; its replacement is its own initiative.   |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase                                      | Status   |
| ----------- | ------------------------------------------ | -------- |
| DISC-01     | Phase 1 — Capability Discovery             | Complete |
| DISC-02     | Phase 1 — Capability Discovery             | Complete |
| CAP-01      | Phase 2 — Capture & Permission Gating      | Complete |
| PERM-01     | Phase 2 — Capture & Permission Gating      | Complete |
| PERM-02     | Phase 2 — Capture & Permission Gating      | Complete |
| LINE-01     | Phase 2 — Capture & Permission Gating      | Complete |
| ROUTE-01    | Phase 3 — Routing & On-Demand Trigger      | Complete |
| ROUTE-02    | Phase 3 — Routing & On-Demand Trigger      | Complete |
| ROUTE-03    | Phase 3 — Routing & On-Demand Trigger      | Complete |
| ROUTE-04    | Phase 3 — Routing & On-Demand Trigger      | Pending  |
| TRIG-01     | Phase 3 — Routing & On-Demand Trigger      | Pending  |
| REVIEW-01   | Phase 4 — Review Loops & Live Auto-Capture | Pending  |
| REVIEW-02   | Phase 4 — Review Loops & Live Auto-Capture | Pending  |
| LIVE-01     | Phase 4 — Review Loops & Live Auto-Capture | Pending  |
| ARCH-01     | Phase 5 — Session Archaeology              | Pending  |
| ARCH-02     | Phase 5 — Session Archaeology              | Pending  |
| ARCH-03     | Phase 5 — Session Archaeology              | Pending  |
| READAS-01   | Phase 6 — Surfaces & Migration             | Pending  |
| PROV-01     | Phase 6 — Surfaces & Migration             | Pending  |
| MIG-01      | Phase 6 — Surfaces & Migration             | Pending  |

**Coverage:**

- Milestone requirements: 20 total
- Mapped to phases: 20 ✓ (100% — every requirement in exactly one phase)
- Unmapped: 0

---

_Requirements defined: 2026-06-11_ _Last updated: 2026-06-11 — roadmap created, traceability populated (agent-workflow,
Phases 1–6)_
