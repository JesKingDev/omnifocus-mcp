# Roadmap: OmniFocus MCP — JessOS Task Integration Layer

## Milestones

- ✅ **Hardening** — Phases 1–6 (shipped 2026-06-09, tag `jk/hardening`) — full archive:
  [`milestones/hardening-ROADMAP.md`](milestones/hardening-ROADMAP.md)
- 📋 **Next milestone** — not yet defined. Run `/gsd-new-milestone` to scope it.

## Phases

<details>
<summary>✅ Hardening (Phases 1–6) — SHIPPED 2026-06-09</summary>

- [x] **Phase 1: Role Model & Resolver** (3 plans) — a connection resolves to exactly one fail-safe role (OWNER | AGENT)
      before any dispatch.
- [x] **Phase 2: Operation Policy (Deny-Deletes & Gating)** (3 plans) — the agent cannot hard- or bulk-delete;
      structural destructive ops are gated at the single mutation funnel.
- [x] **Phase 3: RoleGate & Agent Read Paths** (4 plans) — role-aware advertisement + dispatch ship a usable
      least-privilege stdio agent with its core read surface.
- [x] **Phase 4: HTTP Edge Hardening** (4 plans) — bearer auth, loopback bind, DNS-rebinding protection, Serve-only;
      owner+agent token parity with stdio.
- [x] **Phase 5: Write-Verifier** (5 plans) — every agent mutation confirmed by an independent post-mutation read-back
      with a field-level diff and verification status.
- [x] **Phase 6: launchd Deployment & ADR** (4 plans) — least-privilege LaunchAgent, Automation-only grant, fail-fast
      probe, ADR-005 superseding ADR 001.

**Deferred (risk-accepted 2026-06-09):** Phase 4 Tailscale-Serve operational check; Phase 6 on-host spikes S4/S5/S6. See
`.planning/STATE.md` → Deferred Items and `milestones/hardening-MILESTONE-AUDIT.md`.

</details>

### 📋 Next milestone (not yet planned)

Candidates carried forward (from the prior milestone's v2 requirements):

- [ ] Custom-perspective **contents** resolution through the read tool (READAS-01)
- [ ] **Provision/repair** the JessOS custom perspective via OmniJS `Perspective.Custom` (PROV-01)
- [ ] Markdown surface **regeneration** from OmniFocus, if native perspectives prove insufficient (SURF-01)
- [ ] One-time **vault-checkbox migration** into OmniFocus (MIG-01)
- [ ] Work-account **Google Tasks → OmniFocus** pull via Fantastical (WORK-01)

## Progress

| Milestone | Phases | Plans | Status   | Completed  |
| --------- | ------ | ----- | -------- | ---------- |
| Hardening | 1–6    | 23    | Complete | 2026-06-09 |
