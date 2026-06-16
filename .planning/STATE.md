---
gsd_state_version: 1.0
milestone: agent-workflow
milestone_name: Agent Workflow System
status: ready_to_execute
last_updated: '2026-06-16T17:04:28.339Z'
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 15
  completed_plans: 14
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-11)

**Core value:** The agent can read and write OmniFocus tasks safely — no silent write failures, no destructive deletes —
so JessOS can trust OmniFocus as the source of truth. **Current focus:** Phase 05 — session-archaeology capability
discovery, which gates all workflow design.

## Current Position

Phase: 05 (session-archaeology) — EXECUTING Plan: 3 of 3

Phase 4 (Review Loops & Live Auto-Capture) complete: server allowlist extended with `review-output` / `review-capture` /
`capture-live`; live-capture skill (`capture-live-blocker`) + review-surfacing skill (`surface-work-for-review`)
authored; REVIEW-01/02 + LIVE-01 met. 2405/2405 unit tests green; code review clean after WR-01/02/03 fixes.

**Open from Phase 4 (non-blocking):**

- 3 human-eyeball items parked in `04-HUMAN-UAT.md` (today-view rendering, PERM-02 interactive prompt, tag-browser
  naming) — surface in `/gsd-audit-uat`.

- Follow-up todo: reconcile `review-tag.test.ts` Case 2 with the locked open-flagged `review-output` convention
  (`.planning/todos/pending/reconcile-review-output-test-with-locked-convention.md`).

## Roadmap Summary (agent-workflow)

| Phase                               | Goal                                                                      | Requirements                      |
| ----------------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| 1. OmniFocus Capability Discovery   | Map native OF behavior + native-vs-build call per area; gates everything  | DISC-01, DISC-02                  |
| 2. Capture & Permission Gating      | Inbox dump under permission gates, session lineage on every created task  | CAP-01, PERM-01, PERM-02, LINE-01 |
| 3. Routing & On-Demand Trigger      | Route inbox items (match→infer→create→leave), runnable on-demand          | ROUTE-01…04, TRIG-01              |
| 4. Review Loops & Live Auto-Capture | Review tags in today view (output vs. capture); real-time blocker capture | REVIEW-01, REVIEW-02, LIVE-01     |
| 5. Session Archaeology              | Summarize-then-approve scan of last 7 days; `archaeology`-tagged tasks    | ARCH-01, ARCH-02, ARCH-03         |
| 6. Surfaces & Migration             | Resolve/provision JessOS perspective; one-time vault-checkbox migration   | READAS-01, PROV-01, MIG-01        |

## Performance Metrics

**Velocity:**

- Total plans completed: 23
- Average duration: —
- Total execution time: —

**By Phase (hardening, shipped):**

| Phase | Plans | Total | Avg/Plan |
| ----- | ----- | ----- | -------- |
| 02    | 3     | -     | -        |
| 03    | 2     | -     | -        |
| 04    | 2     | -     | -        |
| 06    | 4     | -     | -        |
| 01    | 4     | -     | -        |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

| Phase 02-capture-permission-gating P01 | 5m | 3 tasks | 6 files | | Phase 02-capture-permission-gating P02 | 25m | 2
tasks | 11 files | | Phase 02-capture-permission-gating P03 | 35m | 2 tasks | 6 files | | Phase 05-session-archaeology
P01 | 3m | 2 tasks | 3 files | | Phase 05-session-archaeology P02 | 25m | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- [Roadmap, agent-workflow]: Phase 1 (capability discovery) gates everything — no workflow design or build precedes it,
  because we refuse to build custom code for capabilities OmniFocus provides natively.

- [Roadmap, agent-workflow]: Permission gating (PERM-01/02) and session lineage (LINE-01) fold into Phase 2 (Capture)
  rather than a standalone phase — Capture is the first agent _write_ surface, so the gates and lineage stamping land
  _with_ the first mutation, honoring "gating must land before/with the first write."

- [Roadmap, agent-workflow]: On-demand manual trigger (TRIG-01) lands in Phase 3 with routing so the route loop is
  exercisable as the MVP path before any scheduler (TRIG-02/n8n is deferred).

- [Roadmap, agent-workflow]: Surfaces & migration (READAS-01, PROV-01, MIG-01) are Phase 6 — independent of the core
  loop; depend on routing (Phase 3) only so migrated items can be placed.

- [Roadmap, hardening]: Strict bottom-up build order — role model → policy → gate → HTTP → verifier → deployment.
- [Phase 2, hardening]: Agent loses content deletes (removed, not gated); tag delete/merge + perspective delete are
  GATED (dry-run + owner approval); OWNER keeps full `tag_manage`.

- [Cross-cutting]: Destructive-op enforcement lives at the single mutation funnel (single+batch normalized) —
  batch-parity test is mandatory (OMN-119 lesson).

- [Cross-cutting]: Write-verification is an independent post-mutation read-back round-trip, never an in-script read.
- [Phase 03-04, hardening]: withCorrelation override required for any tool that repurposes BaseTool constructor arg 2
  (e.g. for context: ResolvedContext); base reconstruction silently drops the context slot — override must thread both
  args in the correct positions.

- [Phase 2, Wave 2]: create policy uses per-target table (task→gate, project/folder→allow) rather than flat 'gate' —
  required to satisfy both test rows from Wave 0 (create/task→gate AND create/project→allow).

- [Phase 2, Wave 2]: isAllowedAllThisSession() bypass wired into OmniFocusWriteTool in Task 2 (not deferred to Wave 3)
  per atomicity requirement: policy flip and grant bypass must ship together.

- [Phase 2, Wave 3]: LineageSchema advertised as bare { type: object } in inputSchema to stay under 4KB MCP
  advertisement limit; Zod schema still enforces strict shape server-side.

- [Phase 2, Wave 3]: SCHEMA_UPSTREAM_FIELDS exclusion added to schema-impl-parity test — lineage consumed upstream of
  buildCreateTaskScript, not silently dropped (Pitfall 3 guard).

- [Phase 2, Wave 3]: PERM-02 bypass test fixed to use direct setAllowAllThisSession() — vi.doMock cannot intercept ESM
  static bindings after module load.

- [Phase ?]: D-07 Open Q1 resolved: dedup Set built from UNION of active + completed archaeology-task notes; completed
  sessions stay suppressed

- [Phase 05-02]: ESM over CommonJS for probes under probes/ — project has "type":"module"; require.main === module
  throws in Vitest's ESM runtime. Use `export function` + `import.meta.url` CLI guard instead.

- [Phase 05-02]: nowMs as a parameter to filterTranscriptLines() keeps the 7-day window deterministic for unit tests;
  the CLI wrapper calls Date.now() and passes it in.

### Pending Todos

None yet.

### Blockers/Concerns

- [agent-workflow, Phase 1]: Discovery findings constrain Phases 2–6 — keep the native-vs-build decisions concrete
  enough that each downstream phase can cite one for build-vs-reuse.

- [Phase 1, planning override 2026-06-11]: Decision-coverage gate flagged D-02/D-03/D-06 as uncited (no literal `D-NN`
  token in plan `must_haves`). Reviewed and accepted — all three are substantively enforced (D-06 = the single
  `files_modified` report path; D-03 = the synthesize→probe method of plans 01-02/01-03; D-02 = the no-OF3 evidence
  standard). Proceeded to execute. Verify-phase should confirm each landed in
  `docs/reference/omnifocus-capabilities.md`.

## Deferred Items

Items acknowledged and deferred at the `hardening` milestone close on 2026-06-09 (risk-accepted; documented in
`milestones/hardening-MILESTONE-AUDIT.md`):

| Category         | Item                                                                                                                                                                                               | Status  | Deferred At |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------- |
| uat_gap          | Phase 04 — Tailscale `serve` (not `funnel`) operational verification on the host (HTTP-04)                                                                                                         | partial | 2026-06-09  |
| verification_gap | Phase 04 — 04-VERIFICATION.md `human_needed` (same Tailscale-Serve operational check)                                                                                                              | open    | 2026-06-09  |
| uat_gap          | Phase 06 — host spikes S4/S5/S6 under `launchctl` (node-overwrite grant survival, no restart-loop, write round-trip)                                                                               | partial | 2026-06-09  |
| read_path_gap    | `omnifocus_read` ignores the `filters.ids` (plural) filter — only singular `filter.id` is routed, and by-id projections omit tags. Surfaced fixing D-08b; pre-existing.                            | open    | 2026-06-12  |
| http_role_gap    | D-10 — the WriteTool funnel resolves role via `parseRole()` (env), not the per-request HTTP token, so non-env roles can't write over HTTP without a lineage/env workaround.                        | open    | 2026-06-12  |
| flake            | `field-roundtrip` two-phase `clear*` tests (clearPlannedDate/clearEstimatedMinutes) intermittently race the clear-write vs verify-null read against live OmniFocus (OMN-55 class); pass on re-run. | open    | 2026-06-12  |

**Trigger to close:** Phase 06 S4 becomes free to verify on the first real Node upgrade on the host. Phase 04 + S5/S6
need a deliberate on-Mac session per `deploy/launchd/RUNBOOK.md`. The read_path_gap and http_role_gap (D-10) are
candidates for a future read-layer / HTTP-role-plumbing phase.

## Session Continuity

Last session: 2026-06-16T17:04:28.334Z

## Operator Next Steps

- Execute Phase 2 Wave 4 (02-04-PLAN.md): agent-okay predicate (PERM-01) + integration tests + human checkpoint. PERM-01
  predicate tests (agent-okay-predicate.test.ts) go GREEN in Wave 4.
