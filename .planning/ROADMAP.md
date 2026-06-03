# Roadmap: OmniFocus MCP — JessOS Task Integration Layer

## Overview

This brownfield hardening milestone layers a least-privilege agent role, write-verification, and a hardened
HTTP/Tailscale remote path onto the existing kip-d/omnifocus-mcp fork — without redesigning the JXA→OmniJS bridge. The
build runs strictly bottom-up: a role model that everything keys off, then deny-deletes enforced at the single mutation
funnel where single and batch ops are normalized, then a RoleGate that ships a complete least-privilege stdio agent,
then HTTP edge hardening, then per-mutation write-verification as an independent read-back, and finally a
least-privilege launchd deployment with a superseding ADR. Each layer is independently testable and shippable. Two
invariants hold across every phase: destructive-op enforcement lives at the one funnel (with a batch-parity check), and
write-verification is always a separate post-mutation round-trip, never an in-script read.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Role Model & Resolver** - A connection resolves to exactly one fail-safe role (OWNER | AGENT) before
      (completed 2026-06-03) any dispatch.
- [ ] **Phase 2: Operation Policy (Deny-Deletes & Gating)** - The agent cannot hard-delete or bulk-delete; structural
      destructive ops are gated, enforced at the single mutation funnel.
- [ ] **Phase 3: RoleGate & Agent Read Paths** - Role-aware tool advertisement and dispatch ship a fully usable
      least-privilege stdio agent with its core read surface.
- [ ] **Phase 4: HTTP Edge Hardening** - The HTTP/Tailscale remote path matches the stdio path's guarantees: bearer
      auth, loopback bind, DNS-rebinding protection, Serve-only.
- [ ] **Phase 5: Write-Verifier** - Every agent mutation is confirmed by an independent post-mutation read-back with a
      field-level diff and a reported verification status.
- [ ] **Phase 6: launchd Deployment & ADR** - The hardened server runs as a least-privilege LaunchAgent with an
      Automation-only grant, a fail-fast probe, and a superseding ADR.

## Phase Details

### Phase 1: Role Model & Resolver

**Goal**: A connection resolves to exactly one role before any tool dispatch, failing safe to the least-privileged role,
with identity kept separate from authorization. **Depends on**: Nothing (first phase) **Requirements**: ROLE-01,
ROLE-02, ROLE-03 **Success Criteria** (what must be TRUE):

1. A stdio connection started with explicit OWNER configuration (env / launchd label) resolves to OWNER; the same
   connection started with AGENT config resolves to AGENT.
2. A stdio connection with no explicit role configuration resolves to AGENT (fail-safe to least privilege), never to
   OWNER.
3. Resolving "who is connected" (identity) returns a distinct result from "what they may do" (authorization) — the two
   are separate, inspectable steps, and an HTTP resolver stub exists for Phase 4 to fill. **Plans**: 3 plans

Plans:

- [x] 01-01-PLAN.md — Role contract types (roles.ts) + logger SENSITIVE_KEYS extension (D-08)
- [x] 01-02-PLAN.md — Role resolver module + exhaustive 14-class parse matrix unit test
- [x] 01-03-PLAN.md — Wire resolver into src/index.ts startup + D-09 log line + human verify

### Phase 2: Operation Policy (Deny-Deletes & Gating)

**Goal**: The AGENT role cannot perform any content-destructive delete on single OR batch paths, structural destructive
ops are gated behind dry-run + owner approval, and OWNER retains the full surface — all enforced at the single mutation
funnel. **Depends on**: Phase 1 **Requirements**: POLICY-01, POLICY-02, POLICY-03, POLICY-04, POLICY-05, POLICY-06,
POLICY-07 **Success Criteria** (what must be TRUE):

1. A hard-delete of a task, project, or folder requested by the AGENT role is rejected; the recoverable substitute
   (complete or drop) succeeds.
2. A delete embedded inside a batch/bulk payload is rejected for the AGENT role with the same outcome as the single-item
   path (batch-parity check — the OMN-119 lesson), because the deny is enforced at the single funnel where single and
   batch ops are normalized, with a re-assertion in the script builder.
3. An AGENT request for tag delete, tag merge, or perspective delete returns a dry-run preview and is NOT executed on
   first request; it requires explicit owner approval before execution — while additive/structural tag ops (create,
   rename, nest, unnest, reparent) execute directly.
4. The OWNER role can execute the full `tag_manage` surface (including delete and merge) and perspective management
   directly, with no gating. **Plans**: TBD

### Phase 3: RoleGate & Agent Read Paths

**Goal**: Role wired into the single ListTools/CallTool dispatch ships a complete, usable least-privilege stdio agent —
advertising only allowed operations, rejecting disallowed ones, and exposing the agent's core read and perspective
surface. **Depends on**: Phase 2 **Requirements**: GATE-01, GATE-02, GATE-03, READ-01, READ-02, READ-03 **Success
Criteria** (what must be TRUE):

1. `ListTools` over an AGENT connection advertises only the operations the agent is allowed to perform; an OWNER
   connection sees the full surface.
2. A disallowed operation requested by the AGENT role is rejected at the dispatch point with a clear error, even when it
   was never advertised.
3. The AGENT role can create, complete, drop, defer/reschedule, tag, move, and flag tasks end-to-end over stdio.
4. The AGENT role can run the core read paths (today/forecast, overdue, flagged, available vs blocked, by-project,
   by-tag, inbox, date-range, count-only), look up a task/project by identifier, and list/read native OmniFocus
   perspectives. **Plans**: TBD **UI hint**: yes

### Phase 4: HTTP Edge Hardening

**Goal**: The HTTP/Tailscale remote path enforces the same guarantees as stdio — per-request bearer auth with
constant-time compare, loopback-only bind, DNS-rebinding protection with allowlists, per-token role, and Tailscale Serve
(never Funnel). **Depends on**: Phase 3 **Requirements**: HTTP-01, HTTP-02, HTTP-03, HTTP-04, HTTP-05 **Success
Criteria** (what must be TRUE):

1. An HTTP request without a valid bearer token is rejected before dispatch; a valid token is accepted via a
   constant-time comparison.
2. The HTTP server binds to `127.0.0.1` and a startup assertion fails closed (refuses to start) if it would bind to any
   open interface; a foreign Origin/Host is refused via DNS-rebinding protection with explicit allowlists.
3. An authenticated HTTP connection's role is derived from its token and is agent-scoped — the same allow/deny outcomes
   as the stdio agent apply.
4. Remote reachability works only via `tailscale serve` (never `funnel`), and a bearer token is still required per
   request in addition to tailnet reachability. **Plans**: TBD **UI hint**: yes

### Phase 5: Write-Verifier

**Goal**: Every agent mutation is confirmed by an independent post-mutation read-back round-trip with a field-level
diff, surfacing a verification status so JessOS can trust that writes persisted. **Depends on**: Phase 4
**Requirements**: VERIFY-01, VERIFY-02, VERIFY-03 **Success Criteria** (what must be TRUE):

1. After an agent mutation, a separate read-back round-trip (by identifier) runs against a fresh context — never an
   in-script read of the same execution — confirming the change.
2. The read-back performs a field-level diff against the intended change and fails explicitly on mismatch (a silent
   no-op write surfaces as a failure, not a false success).
3. Each mutation response reports a verification status of `verified | unverified | skipped`. **Plans**: TBD

### Phase 6: launchd Deployment & ADR

**Goal**: The hardened server is packaged as a least-privilege macOS LaunchAgent with an Automation-only grant that
survives `brew upgrade`, a fail-fast permission probe, and a new ADR documenting the deployment posture and security
model. **Depends on**: Phase 5 **Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04 **Success Criteria** (what
must be TRUE):

1. The server runs as a macOS LaunchAgent with a pinned, stable Node binary path, and a verified end-to-end write
   succeeds under `launchctl` with no interactive prompt — surviving a `brew upgrade` without losing the TCC Automation
   grant.
2. The deployment requests Automation (Apple Events) permission only — no Full Disk Access, no open network.
3. Startup runs a fail-fast Automation-permission probe that errors loudly (with a short timeout, never hangs) when the
   grant is missing or revoked.
4. A new ADR documents the deployment posture (localhost default / Tailscale optional / cloud ruled out by the Mac pin)
   and the security model, explicitly superseding ADR 001. **Plans**: TBD

## Progress

**Execution Order:** Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase                                       | Plans Complete | Status      | Completed  |
| ------------------------------------------- | -------------- | ----------- | ---------- |
| 1. Role Model & Resolver                    | 3/3            | Complete    | 2026-06-03 |
| 2. Operation Policy (Deny-Deletes & Gating) | 0/TBD          | Not started | -          |
| 3. RoleGate & Agent Read Paths              | 0/TBD          | Not started | -          |
| 4. HTTP Edge Hardening                      | 0/TBD          | Not started | -          |
| 5. Write-Verifier                           | 0/TBD          | Not started | -          |
| 6. launchd Deployment & ADR                 | 0/TBD          | Not started | -          |
