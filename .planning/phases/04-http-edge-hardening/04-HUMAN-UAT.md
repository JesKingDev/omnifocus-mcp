---
status: partial
phase: 04-http-edge-hardening
source: [04-VERIFICATION.md]
started: 2026-06-06
updated: 2026-06-06
---

## Current Test

[awaiting human testing on the deployment machine]

## Tests

### 1. Tailscale Serve operational setup (HTTP-04)

expected: On the deployment machine, the MCP HTTP port is exposed via `tailscale serve` (tailnet-private), NOT
`tailscale funnel` (public). A tailnet peer can connect with a valid bearer token; the endpoint is unreachable from the
public internet.

how-to-verify:

- `tailscale serve status` shows the MCP port served over the tailnet (no funnel entry).
- From a tailnet peer: an authenticated request with `MCP_AGENT_TOKEN` succeeds.
- From the public internet: the endpoint does not resolve / is not reachable.

result: [pending]

note: Code-side enforcement is already complete and verified — loopback-only bind (`127.0.0.1`) plus unconditional
bearer auth make Funnel exposure ineffective regardless of config. This item is a deploy-time confirmation and overlaps
Phase 6 (launchd Deployment & ADR).

## Summary

total: 1 passed: 0 issues: 0 pending: 1 skipped: 0 blocked: 0

## Gaps
