# Requirements: OmniFocus MCP — JessOS Task Integration Layer

**Defined:** 2026-06-03 **Core Value:** The agent can read and write OmniFocus tasks safely — no silent write failures,
no destructive deletes — so JessOS can trust OmniFocus as the source of truth.

## v1 Requirements

Requirements for this hardening milestone. Each maps to a roadmap phase.

### Agent Role & Identity

- [x] **ROLE-01**: A connection resolves to exactly one role — OWNER or AGENT — before any tool dispatch.
- [x] **ROLE-02**: A stdio connection resolves its role from explicit configuration (env / launchd label); absent
      explicit config it fails safe to the least-privileged role (AGENT).
- [x] **ROLE-03**: Identity ("who is connected") is resolved separately from authorization ("what they may do").

### Operation Policy (Deny-Deletes & Gating)

- [x] **POLICY-01**: The AGENT role cannot hard-delete any task, project, or folder (content-destructive operations are
      removed, not gated).
- [x] **POLICY-02**: The AGENT role cannot execute bulk/batch destructive deletes of tasks/projects — the deny is
      enforced on batch paths, not only single-item paths.
- [x] **POLICY-03**: The AGENT role may perform additive/structural tag operations directly (create, rename, nest,
      unnest, reparent), but tag **delete**, tag **merge**, and **perspective delete** are gated (see POLICY-07) — never
      executed silently.
- [x] **POLICY-04**: Destructive-operation enforcement (deny + gate) lives at the single mutation funnel where single
      and batch operations are normalized, with a defense-in-depth re-assertion in the script builder.
- [x] **POLICY-05**: For the AGENT role, task "done" is expressed as complete or drop (recoverable in OmniFocus), never
      destructive delete.
- [x] **POLICY-06**: The OWNER role retains the full `tag_manage` surface (create, rename, delete, merge, nest, unnest,
      reparent) and perspective management — interactive setup design with Claude runs in OWNER mode.
- [x] **POLICY-07**: A gated structural operation requested by the AGENT role (tag delete, tag merge, perspective
      delete) returns a dry-run preview and requires explicit owner approval before execution; it is never performed on
      first request.

### Role Gate

- [x] **GATE-01**: Tool/operation advertisement (`ListTools`) reflects the connection's role — the agent is shown only
      its allowed operations.
- [x] **GATE-02**: A disallowed operation requested by the AGENT role is rejected at the dispatch point with a clear
      error, even if it was never advertised.
- [x] **GATE-03**: The AGENT role can create, complete, drop, defer/reschedule, tag, move, and flag tasks.

### HTTP Edge & Remote Access

- [x] **HTTP-01**: Every HTTP request is authenticated with a bearer token using a constant-time comparison before
      dispatch; unauthenticated requests are rejected.
- [x] **HTTP-02**: The HTTP server binds to `127.0.0.1` with a fail-closed startup assertion; it never binds to an open
      interface.
- [x] **HTTP-03**: DNS-rebinding protection is explicitly enabled with host/origin allowlists.
- [x] **HTTP-04**: Remote access is reachable only via Tailscale `serve` (never `funnel`); a bearer token is still
      required per request, in addition to tailnet reachability.
- [x] **HTTP-05**: An HTTP connection's role is derived from its bearer token; both `agent` and `owner` are reachable
      over HTTP, each producing the same allow/deny outcomes as the matching stdio role (owner-token → owner,
      agent-token → agent). Distinct per-role tokens; unknown/missing token is rejected (does not fall back to a role).
      _(Amended Phase 4: was "agent-scoped" — superseded by Phase 4 CONTEXT D-01/D-02, owner-over-HTTP with full
      parity.)_

> **Consideration (not a committed v1 requirement):** `jessicaking.com` is hosted on Cloudflare. When Phase 4 (HTTP
> edge) is planned, evaluate whether any Cloudflare capabilities (Tunnel, Access / Zero Trust) could simplify or
> strengthen remote access — provided they don't violate the Mac-pin or the Tailscale-default / no-open-network posture.
> Tailscale remains the default remote path unless a Cloudflare option is demonstrably better.

### Write Verification

- [x] **VERIFY-01**: Every agent mutation is confirmed by an independent post-mutation read-back — a separate
      round-trip, not an in-script read of the same context.
- [x] **VERIFY-02**: The read-back performs a field-level diff against the intended change and fails explicitly on
      mismatch.
- [x] **VERIFY-03**: Each mutation response reports a verification status of `verified | unverified | skipped`.

### Read & Surfacing

- [x] **READ-01**: The AGENT role can access core read paths — today/forecast, overdue, flagged, available vs blocked,
      by-project, by-tag, inbox, date-range, and count-only.
- [x] **READ-02**: The AGENT role can look up a task/project by identifier (prerequisite for write-verification).
- [x] **READ-03**: The AGENT role can list and read native OmniFocus perspectives as the JessOS working surface.

### Deployment

- [x] **DEPLOY-01**: The server runs as a macOS LaunchAgent with a pinned, stable Node binary path (survives
      `brew upgrade` without losing the TCC grant).
- [x] **DEPLOY-02**: The deployment requests Automation (Apple Events) permission only — no Full Disk Access, no open
      network.
- [x] **DEPLOY-03**: Startup includes a fail-fast Automation-permission probe that errors loudly (does not hang) when
      the grant is missing or revoked.
- [x] **DEPLOY-04**: A new ADR documents the deployment posture (localhost default / Tailscale optional / cloud ruled
      out by the Mac pin) and the security model, superseding ADR 001.

## v2 Requirements

Deferred to future milestones. Tracked, not in this roadmap.

### Surfacing

- **SURF-01**: Regenerate JessOS markdown surfaces (`today.md` / `daily-briefing.md`) from OmniFocus — added only if
  native perspectives prove insufficient.
- **READAS-01**: Resolve a named custom perspective's _contents_ (not just list names) through the read tool.
- **PROV-01**: Provision/repair the JessOS custom perspective via OmniJS `Perspective.Custom` (OmniFocus Pro only).

### Migration

- **MIG-01**: One-time migration of existing Obsidian vault checkboxes into OmniFocus (after writes are
  verified-trustworthy).

### Work Bridge

- **WORK-01**: Pull new work-account Google Tasks into OmniFocus (revisit via Fantastical→Google Tasks path; replaces
  the Gemini-dependent `[TKWW]` Action Tracker).

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                                         | Reason                                                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud hosting (Railway, containers)             | Server is Mac-pinned via `osascript`/Apple Events — cannot run in a Linux container                                                                      |
| Full OAuth 2.1 resource-server flow             | Ceremony without benefit for one human on her own tailnet; static bearer token over loopback + Tailscale is sufficient. Keep documented as a future path |
| Hard delete / bulk delete for the AGENT role    | Irreversible-damage risk; drop is the recoverable substitute (anti-feature)                                                                              |
| Repetition-rule authoring in the agent hot path | Bridge-heavy, high error rate; defer                                                                                                                     |
| Atomic multi-write transactions                 | OmniFocus has no real transaction boundary across `osascript` spawns — would over-promise                                                                |

## Traceability

Final phase mapping (roadmapper finalized 2026-06-03). Each requirement maps to exactly one phase. Phase mapping
confirms the research's strict bottom-up dependency order; no coverage gap found.

| Requirement | Phase                                              | Status   |
| ----------- | -------------------------------------------------- | -------- |
| ROLE-01     | Phase 1 — Role Model & Resolver                    | Complete |
| ROLE-02     | Phase 1 — Role Model & Resolver                    | Complete |
| ROLE-03     | Phase 1 — Role Model & Resolver                    | Complete |
| POLICY-01   | Phase 2 — Operation Policy (Deny-Deletes & Gating) | Complete |
| POLICY-02   | Phase 2 — Operation Policy (Deny-Deletes & Gating) | Complete |
| POLICY-03   | Phase 2 — Operation Policy (Deny-Deletes & Gating) | Complete |
| POLICY-04   | Phase 2 — Operation Policy (Deny-Deletes & Gating) | Complete |
| POLICY-05   | Phase 2 — Operation Policy (Deny-Deletes & Gating) | Complete |
| POLICY-06   | Phase 2 — Operation Policy (Deny-Deletes & Gating) | Complete |
| POLICY-07   | Phase 2 — Operation Policy (Deny-Deletes & Gating) | Complete |
| GATE-01     | Phase 3 — RoleGate & Agent Read Paths              | Complete |
| GATE-02     | Phase 3 — RoleGate & Agent Read Paths              | Complete |
| GATE-03     | Phase 3 — RoleGate & Agent Read Paths              | Complete |
| READ-01     | Phase 3 — RoleGate & Agent Read Paths              | Complete |
| READ-02     | Phase 3 — RoleGate & Agent Read Paths              | Complete |
| READ-03     | Phase 3 — RoleGate & Agent Read Paths              | Complete |
| HTTP-01     | Phase 4 — HTTP Edge Hardening                      | Complete |
| HTTP-02     | Phase 4 — HTTP Edge Hardening                      | Complete |
| HTTP-03     | Phase 4 — HTTP Edge Hardening                      | Complete |
| HTTP-04     | Phase 4 — HTTP Edge Hardening                      | Complete |
| HTTP-05     | Phase 4 — HTTP Edge Hardening                      | Complete |
| VERIFY-01   | Phase 5 — Write-Verifier                           | Complete |
| VERIFY-02   | Phase 5 — Write-Verifier                           | Complete |
| VERIFY-03   | Phase 5 — Write-Verifier                           | Complete |
| DEPLOY-01   | Phase 6 — launchd Deployment & ADR                 | Complete |
| DEPLOY-02   | Phase 6 — launchd Deployment & ADR                 | Complete |
| DEPLOY-03   | Phase 6 — launchd Deployment & ADR                 | Complete |
| DEPLOY-04   | Phase 6 — launchd Deployment & ADR                 | Complete |

**Coverage:**

- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---

_Requirements defined: 2026-06-03_ _Last updated: 2026-06-09 — VERIFY-01/02/03 marked Complete per Phase 5 verification
(milestone audit doc-sync)._
