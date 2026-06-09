---
phase: 04-http-edge-hardening
verified: 2026-06-05T23:00:00Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
human_verification:
  - test:
      'Tailscale Serve operational setup: confirm the server is or can be exposed via `tailscale serve` (not `funnel`)'
    expected:
      'Running `tailscale serve status` shows the port is tailnet-private, not public/funnel. The server is accessible
      from other tailnet devices with a valid bearer token but not from the public internet.'
    why_human:
      'HTTP-04 is an operational/deployment requirement. The code enforces loopback-only bind (which makes Funnel
      effectively harmless), and Tailscale Serve is documented in ROADMAP.md, 04-04-PLAN.md user_setup, and
      validateCLIConfig error messages. But there is no code assertion that verifies `tailscale serve` was configured
      and `funnel` was not — this requires the actual Tailscale configuration to be checked on the machine.'
---

# Phase 4: HTTP Edge Hardening — Verification Report

**Phase Goal:** The HTTP/Tailscale remote path enforces the same guarantees as stdio — per-request bearer auth with
constant-time compare, loopback-only bind, DNS-rebinding protection with allowlists, per-token role, and Tailscale Serve
(never Funnel). **Verified:** 2026-06-05T23:00:00Z **Status:** human_needed **Re-verification:** No — initial
verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                           | Status                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Every HTTP request is authenticated with a bearer token using constant-time compare before dispatch; unauthenticated requests return 401        | VERIFIED                  | `resolveTokenFromHeader` in `src/http-server.ts:290-296` is called unconditionally in `handleRequest` (line 225); no `if (this.authToken &&` guard present; `validateTokenSet` uses SHA-256+`timingSafeEqual` accumulate-then-branch (token-registry.ts:75-93)                                                                                                                                                                |
| 2   | HTTP server binds to `127.0.0.1` with fail-closed startup assertion; never binds to an open interface                                           | VERIFIED                  | `DEFAULT_CLI_CONFIG.host = '127.0.0.1'` (cli.ts:24); `validateCLIConfig` throws with "loopback" message when host is not `127.0.0.1` or `localhost` (cli.ts:121-125); e2e test at http-transport.test.ts:402-411 confirms process exits non-zero with `--host 0.0.0.0`                                                                                                                                                        |
| 3   | DNS-rebinding protection is explicitly enabled with host/origin allowlists                                                                      | VERIFIED                  | `buildAllowedHostSet` and `isHostAllowed` exported from `src/http-server.ts:24-45`; `validateHostOrigin` private method called as first statement in `handleRequest` before OPTIONS check (lines 212-216); 400 returned on unknown Host/Origin                                                                                                                                                                                |
| 4   | Remote access is reachable only via Tailscale Serve (never Funnel); bearer token still required per request                                     | VERIFIED (code side only) | Loopback-only bind + unconditional auth enforced in code. Tailscale Serve documented in ROADMAP.md success criterion #4, 04-04-PLAN.md `user_setup`, and the loopback assertion error message ("Remote access is via Tailscale Serve proxying to loopback"). Operational setup requires human verification — see Human Verification section.                                                                                  |
| 5   | An HTTP connection's role is derived from its bearer token; both agent and owner are reachable; unknown/missing token is rejected (no fallback) | VERIFIED                  | `buildTokenRegistry` maps `MCP_AGENT_TOKEN` → `{role:'agent', principal:'http-agent'}` and `MCP_OWNER_TOKEN` → `{role:'owner', principal:'http-owner'}` (token-registry.ts:110-124); `validateTokenSet` returns null on no match → unconditional 401 (D-05); per-session role threaded from `tokenEntry.role` into `createSession(id, role, context)` (session-manager.ts:87); registerTools called with that role (line 122) |
| 6   | Per-session role matches stdio parity: agent omits delete/bulk_delete; owner includes them                                                      | VERIFIED                  | E2e test at http-transport.test.ts:368-400 asserts `agentOps` contains `create` but not `delete`/`bulk_delete`; `ownerOps` contains both. Human smoke test confirmed per 04-04-SUMMARY.md checkpoint table.                                                                                                                                                                                                                   |
| 7   | CR-01 (privilege escalation via session reuse) is fixed: session is bound to creating token's principal                                         | VERIFIED                  | `SessionConfig.principal` field added at session-manager.ts:30; set from `context.identity.principal` at line 135; `rejectSessionPrincipalMismatch` called in POST (http-server.ts:381), GET (line 435), DELETE (line 478) before any dispatch                                                                                                                                                                                |
| 8   | CR-02 (/sessions ID leak) is fixed: /sessions is gated to owner role                                                                            | VERIFIED                  | `handleSessionsRequest` checks `tokenEntry.role !== 'owner'` at http-server.ts:533 and returns 403 before `getStats()`; e2e test at http-transport.test.ts:443-453 asserts agent→403, owner→200                                                                                                                                                                                                                               |
| 9   | Full unit test suite (2339 tests) passes GREEN                                                                                                  | VERIFIED                  | `npm run test:unit` result: 113 test files, 2339 tests all passing; build exits 0 with no TypeScript errors                                                                                                                                                                                                                                                                                                                   |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact                                   | Expected                                                                                                                                      | Status   | Details                                                                                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/auth/token-registry.ts`               | TokenEntry interface, buildTokenRegistry, validateTokenSet                                                                                    | VERIFIED | Exists, 125 lines, exports all three; SHA-256+timingSafeEqual accumulate-then-branch present                                                                                     |
| `src/auth/role-resolver.ts`                | resolveHttpIdentity(entry: TokenEntry): ResolvedIdentity                                                                                      | VERIFIED | Zero-arg stub replaced; returns `{transport:'http', roleSource:'http-token', principal: entry.principal}`                                                                        |
| `src/utils/cli.ts`                         | CLIConfig with agentToken/ownerToken/allowedHosts + validateCLIConfig assertions + loopback default                                           | VERIFIED | Default host is `127.0.0.1`; all four assertions present inside `if (config.httpMode)`                                                                                           |
| `src/session-manager.ts`                   | createSession(sessionId, role, context) per-session role; SessionConfig.principal                                                             | VERIFIED | Constructor-time authToken/role/context fields removed; new signature confirmed; principal field set from context                                                                |
| `src/http-server.ts`                       | validateHostOrigin, resolveTokenFromHeader, unconditional auth, per-session role wiring, rejectSessionPrincipalMismatch, CR-02 /sessions gate | VERIFIED | All functions present; old conditional auth (`if (this.authToken &&`) absent; tokenRegistry constructor field confirmed                                                          |
| `src/index.ts`                             | buildTokenRegistry call + SessionManager without authToken + HttpServerManager with tokenRegistry                                             | VERIFIED | `buildTokenRegistry` imported and called at line 266; `new SessionManager(cacheManager)` (no authToken); `new HttpServerManager(…, tokenRegistry, allowedHosts)` at line 276     |
| `tests/integration/http-transport.test.ts` | HTTP edge hardening e2e suite                                                                                                                 | VERIFIED | "HTTP Transport Phase 4 Hardening" block present (lines 305-454); covers 401, 400, 200 for agent+owner, role parity, fail-closed bind, CR-01 hijack 403, CR-02 /sessions 403/200 |
| `scripts/smoke-http-auth.sh`               | Self-contained smoke test script                                                                                                              | VERIFIED | File exists; confirmed via 04-04-SUMMARY.md that 8/8 checks passed in live run                                                                                                   |

### Key Link Verification

| From                        | To                           | Via                                                    | Status   | Details                                                                                    |
| --------------------------- | ---------------------------- | ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `src/http-server.ts`        | `src/auth/token-registry.ts` | `import { validateTokenSet }`                          | VERIFIED | Line 8 imports validateTokenSet; called at http-server.ts:295 from resolveTokenFromHeader  |
| `src/http-server.ts`        | `src/session-manager.ts`     | `createSession(sessionId, role, context)`              | VERIFIED | Called at http-server.ts:391 with three arguments                                          |
| `src/session-manager.ts`    | `src/tools/index.ts`         | `registerTools(server, cache, pending, role, context)` | VERIFIED | Called at session-manager.ts:122 with role and context params (not this.role/this.context) |
| `src/index.ts`              | `src/auth/token-registry.ts` | `buildTokenRegistry(cliConfig)`                        | VERIFIED | Imported at index.ts:19; called at line 266 with cliConfig.agentToken/ownerToken           |
| `src/auth/role-resolver.ts` | `src/auth/token-registry.ts` | `import type { TokenEntry }`                           | VERIFIED | role-resolver.ts:31 imports TokenEntry; resolveHttpIdentity consumes it                    |
| `src/http-server.ts`        | `src/auth/role-resolver.ts`  | `import { resolveHttpIdentity }`                       | VERIFIED | http-server.ts:10 imports resolveHttpIdentity; called at line 389 before createSession     |

### Data-Flow Trace (Level 4)

| Artifact                                         | Data Variable                | Source                                                                        | Produces Real Data                                             | Status  |
| ------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- | ------- |
| `src/http-server.ts` handleMcpPostRequest        | `tokenEntry`                 | `resolveTokenFromHeader` → `validateTokenSet` → bearer token from HTTP header | Yes — token matched against env-seeded registry                | FLOWING |
| `src/session-manager.ts` createSession           | `role`, `context`            | `tokenEntry.role` / `resolveHttpIdentity(tokenEntry)` from http-server.ts     | Yes — role is the actual token's role, not a hardcoded default | FLOWING |
| `src/http-server.ts` handleSessionsRequest       | `tokenEntry.role`            | same unconditional auth gate                                                  | Yes — role gates /sessions to owner                            | FLOWING |
| `src/session-manager.ts` SessionConfig.principal | `context.identity.principal` | entry.principal from token-registry ('http-agent'/'http-owner')               | Yes — server-side literals set at registry build time          | FLOWING |

### Behavioral Spot-Checks

| Behavior                                                   | Command                                          | Result                                                   | Status |
| ---------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- | ------ |
| Build compiles clean                                       | `npm run build`                                  | exit 0, no errors                                        | PASS   |
| All 2339 unit tests pass                                   | `npm run test:unit`                              | 113 files, 2339 tests passed                             | PASS   |
| No old conditional auth guard                              | `grep "if.*authToken &&" src/http-server.ts`     | 0 results                                                | PASS   |
| `rejectSessionPrincipalMismatch` called in POST/GET/DELETE | grep on http-server.ts                           | Lines 381, 435, 478 confirmed                            | PASS   |
| /sessions gated to owner                                   | `grep "role !== 'owner'" src/http-server.ts`     | Line 533 confirmed                                       | PASS   |
| validateCLIConfig loopback assertion                       | grep on cli.ts                                   | Line 121-125 confirmed, message contains "loopback"      | PASS   |
| `fail-safe-default` absent from resolveHttpIdentity        | grep role-resolver.ts                            | Only in resolveStdioIdentity, not in resolveHttpIdentity | PASS   |
| No debt markers                                            | grep TODO/FIXME/TBD/XXX across all phase-4 files | 0 results                                                | PASS   |

### Probe Execution

No `probe-*.sh` scripts found in `scripts/*/tests/`. `scripts/smoke-http-auth.sh` is a manual smoke tool (starts its own
server); it cannot run in the verifier process without a live Node environment. Deferred to human verification.

### Requirements Coverage

| Requirement | Source Plan         | Description                                                                                              | Status                                                 | Evidence                                                                                                                                                                                                |
| ----------- | ------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP-01     | 04-02, 04-04        | Every HTTP request authenticated with constant-time bearer compare before dispatch                       | SATISFIED                                              | `validateTokenSet` SHA-256+timingSafeEqual accumulate-then-branch; unconditional auth gate in `handleRequest`; tests in token-registry.test.ts + http-transport.test.ts                                 |
| HTTP-02     | 04-03, 04-04        | HTTP server binds to `127.0.0.1` with fail-closed assertion                                              | SATISFIED                                              | `DEFAULT_CLI_CONFIG.host='127.0.0.1'`; loopback assertion in `validateCLIConfig`; e2e fail-closed test                                                                                                  |
| HTTP-03     | 04-04               | DNS-rebinding protection with host/origin allowlists                                                     | SATISFIED                                              | `buildAllowedHostSet`/`isHostAllowed` exported; `validateHostOrigin` gates all requests before OPTIONS; allowlist includes loopback always + `MCP_ALLOWED_HOSTS` extras                                 |
| HTTP-04     | 04-04 (operational) | Remote access via Tailscale Serve (never Funnel); bearer token still required per request                | SATISFIED (code side) / NEEDS HUMAN (operational side) | Loopback bind makes Funnel ineffective; bearer token unconditional; Tailscale Serve documented in ROADMAP.md, plan user_setup, and error messages. Actual Tailscale configuration requires human check. |
| HTTP-05     | 04-02, 04-03, 04-04 | HTTP connection's role derived from bearer token; both agent and owner reachable; unknown token rejected | SATISFIED                                              | `buildTokenRegistry` maps both tokens; `validateTokenSet` returns null on miss → 401; per-session role flows to registerTools; e2e role-parity test                                                     |

### Anti-Patterns Found

| File                           | Line | Pattern | Severity | Impact |
| ------------------------------ | ---- | ------- | -------- | ------ |
| None in phase-4 modified files | —    | —       | —        | —      |

No `TODO`, `FIXME`, `TBD`, or `XXX` markers found in any of the five phase-4 source files.

**Open warnings from 04-REVIEW.md (code review — not blockers for this verification):**

- WR-02: `parseRequestBody` collapses malformed JSON to "body required" 400 rather than a distinct error
- WR-03: `buildTokenRegistry` Map-keying lets equal tokens collapse (startup assertion in `validateCLIConfig` is the
  current guard)
- WR-04: Timing channels from empty-registry fast-path and per-request rehash
- WR-05: Blank/whitespace agent token passes the required-token gate
- WR-06: Older per-session role test name overstates what it asserts

These are non-blocking warnings carried forward from the code review. They do not prevent the phase goal from being
achieved.

### Human Verification Required

#### 1. Tailscale Serve operational setup (HTTP-04)

**Test:** On the deployment machine, run `tailscale serve status`. Confirm the OmniFocus MCP port (e.g. 3000) is listed
as tailnet-private (serve), not as a funnel/public endpoint. Then verify from another tailnet device that connecting to
the MagicDNS hostname with a valid bearer token succeeds (200), while connecting from a non-tailnet network fails at the
network layer.

**Expected:** Port shows as tailnet-private in `tailscale serve status`. Bearer auth still required over the tailnet
path. No public internet exposure.

**Why human:** HTTP-04 is an operational/deployment requirement. The codebase enforces its complementary code properties
(loopback-only bind, unconditional bearer auth) so Funnel would be ineffective even if misconfigured — but the
requirement specifically calls out using Serve rather than Funnel, and Serve is the documented remote path. Whether
`tailscale serve` has actually been configured on this machine cannot be verified programmatically without running
`tailscale` CLI commands that may not be available in the verifier context and depend on the live network configuration.

---

### Gaps Summary

No gaps. All nine must-have truths are verified in the codebase. The only item requiring human action is the operational
Tailscale Serve configuration check for HTTP-04 — which is explicitly an operational/deployment requirement, not a code
requirement. The code-side enforcement for HTTP-04 (loopback-only bind + unconditional bearer auth) is fully verified.

---

_Verified: 2026-06-05T23:00:00Z_ _Verifier: Claude (gsd-verifier)_
