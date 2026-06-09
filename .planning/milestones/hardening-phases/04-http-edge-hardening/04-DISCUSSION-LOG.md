# Phase 4: HTTP Edge Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in
> CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05 **Phase:** 4-http-edge-hardening **Areas discussed:** Remote role scope, Token→role model,
Cloudflare vs Tailscale, Funnel-prevention enforcement

Mode: advisor (research-backed comparison tables; calibration tier `standard`; technical owner — no plain-language
reframing). Four parallel research agents produced the comparison tables below.

---

## Remote role scope

| Option                | Description                                                                                                                         | Selected |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Agent-only remote     | HTTP path always agent-scoped; OWNER via local stdio only. Recommended by research (least privilege, reads HTTP-05/SC#3 literally). |          |
| Allow OWNER over HTTP | Token can resolve to owner remotely; enables remote destructive ops.                                                                | ✓        |

**User's choice:** Allow OWNER over HTTP. **Notes:** Diverged from the agent-only recommendation. This contradicts
ROADMAP SC#3 and HTTP-05 ("agent-scoped"). The conflict was flagged explicitly; user chose to **amend the requirements**
(reword to "role derived from token; both roles reachable") rather than honor them as written. Captured as CONTEXT
D-01/D-02.

## Remote deletes (follow-up to owner-over-HTTP)

| Option                                        | Description                                                                        | Selected |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| Full owner parity (incl. deletes)             | Owner-over-HTTP == owner-over-stdio; remote hard/bulk delete allowed.              | ✓        |
| Owner over HTTP, deletes still denied on HTTP | Owner gets structural/gating powers remotely but deletes denied on HTTP transport. |          |

**User's choice:** Full owner parity, including hard-delete and bulk-delete over HTTP. **Notes:** "The role is the role,
regardless of transport." Security mitigations (constant-time accumulate-then-branch compare, fail-closed reject,
distinct high-entropy tokens, startup distinctness assertion) locked as the price of this surface. Captured as CONTEXT
D-03..D-08.

## Token → role model

| Option                      | Description                                                        | Selected |
| --------------------------- | ------------------------------------------------------------------ | -------- |
| Single agent token + seam   | Extend MCP_AUTH_TOKEN; one role. Fit only if remote is agent-only. |          |
| Env token→role registry now | Map tokens→roles this phase; constant-time across candidates.      | ✓        |
| Hashed token file           | Hashes at rest; over-engineered for user-only tailnet-only host.   |          |

**User's choice:** Env token→role registry now — **separate env vars** (`MCP_AGENT_TOKEN` / `MCP_OWNER_TOKEN`) over a
JSON map. Consistent with owner-over-HTTP needing two roles. Captured as CONTEXT D-09/D-10.

## Cloudflare vs Tailscale

| Option                              | Description                                                                                     | Selected |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| Tailscale Serve, decline Cloudflare | Commit to Serve for v1; record Cloudflare evaluated + declined (posture conflict). Recommended. | ✓        |
| Evaluate Cloudflare further         | Spend more research before committing.                                                          |          |

**User's choice:** Tailscale Serve, decline Cloudflare. Cloudflare Tunnel publishes a public hostname + decrypts TLS at
the edge → conflicts with the locked no-open-network posture. Captured as CONTEXT D-16.

## Funnel-prevention enforcement

| Option                                       | Description                                                                                       | Selected |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| Structural combo, defer detection to Phase 6 | Loopback bind + mandatory bearer make funnel harmless; ADR/runbook prescribes serve. Recommended. | ✓        |
| Runtime funnel-detection guard now           | Boot-time `tailscale serve status --json` check; adds fragile tailscaled dependency.              |          |

**User's choice:** Structural combo; defer any runtime funnel-detection guard to the Phase 6 launchd ADR. Serve and
Funnel share the same loopback port (server can't distinguish at runtime). Captured as CONTEXT D-13/D-17.

## Claude's Discretion

- Exact reworded text for SC#3 + HTTP-05 (intent locked in D-02).
- Alias vs retire `MCP_AUTH_TOKEN` (D-11).
- Host-allowlist env var name/format (`MCP_ALLOWED_HOSTS` suggested) (D-15).
- Token-lookup helper structure, provided D-04 (accumulate-then-branch) and D-05 (fail-closed) hold.

## Deferred Ideas

- Runtime funnel-detection guard → Phase 6 (launchd deployment ADR).
- Cloudflare Tunnel / Access → declined this milestone; revisit only on a real public-hostname need.
- Per-request Tailscale identity-header gate (`Tailscale-User-Login`) → not adopted; future option for multi-user/audit.
