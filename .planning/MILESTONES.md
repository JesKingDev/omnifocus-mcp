# Milestones

## Hardening (Shipped: 2026-06-09)

**Tag:** `jk/hardening` · **Phases:** 6 (Phases 1–6) · **Plans:** 23 · **Tests:** 2375 unit green + Phase 5 live
OmniFocus integration

**Delivered:** A brownfield hardening of the kip-d/omnifocus-mcp fork that makes OmniFocus a trustworthy canonical task
store for a least-privilege AI agent — fail-safe roles, deny-deletes, write-verification, a hardened HTTP edge, and a
least-privilege launchd deployment.

**Key accomplishments:**

- **Fail-safe role model** (Phase 1) — every connection resolves to exactly one role (OWNER | AGENT) before any
  dispatch; identity is resolved separately from authorization; absent config fails safe to AGENT.
- **Deny-deletes at the single mutation funnel** (Phase 2) — the AGENT role cannot hard- or bulk-delete; structural tag
  delete/merge and perspective delete are gated behind a dry-run + owner approval, enforced where single and batch ops
  normalize, with a defense-in-depth re-assertion in the script builders.
- **RoleGate + agent read surface** (Phase 3) — role-aware `ListTools` advertisement and dispatch-point enforcement ship
  a usable least-privilege stdio agent with its full core read surface, including native OmniFocus perspectives.
- **HTTP edge hardening** (Phase 4) — per-request bearer auth (constant-time), loopback-only fail-closed bind,
  DNS-rebinding protection, Tailscale `serve`-only, and owner+agent token parity with the stdio path.
- **Write-verifier** (Phase 5) — every agent mutation is confirmed by an independent post-mutation read-back round-trip
  with a per-field-type diff and a reported `verified | unverified | skipped` status; verified live against real
  OmniFocus.
- **Least-privilege launchd deployment + ADR-005** (Phase 6) — LaunchAgent on a pinned Developer-ID Node path,
  Automation-only TCC grant, a fail-fast Automation probe, and an in-repo ADR superseding ADR 001.

**Known deferred items at close:** 3 (risk-accepted 2026-06-09) — Phase 4 Tailscale-Serve operational verification +
Phase 6 on-host spikes S4/S5/S6. See STATE.md → Deferred Items and `milestones/hardening-MILESTONE-AUDIT.md`.

---
