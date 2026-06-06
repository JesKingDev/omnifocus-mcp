---
phase: 04-http-edge-hardening
plan: '04'
subsystem: http
tags: [http, auth, bearer-token, dns-rebinding, role, session, loopback, security]

requires:
  - phase: 04-02
    provides: token-registry (buildTokenRegistry, validateTokenSet), resolveHttpIdentity(TokenEntry)
  - phase: 04-03
    provides: CLIConfig.agentToken/ownerToken/allowedHosts, loopback default, validateCLIConfig

provides:
  - SessionManager.createSession(sessionId, role, context) — per-session role, no constructor-time auth
  - HttpServerManager unconditional bearer auth on every request (D-07)
  - Host/Origin allowlist DNS-rebinding protection (buildAllowedHostSet, isHostAllowed, D-14/D-15)
  - resolveTokenFromHeader constant-time bearer validation (replaces validateAuthentication)
  - per-session role wired from validated TokenEntry into createSession (D-10, D-12)
  - token registry built in src/index.ts from cliConfig.agentToken/ownerToken
  - HTTP edge-hardening e2e suite + scripts/smoke-http-auth.sh

affects:
  - src/session-manager.ts (createSession signature change)
  - src/http-server.ts (constructor takes tokenRegistry + allowedHosts)
  - src/index.ts (registry construction + call sites)

tech-stack:
  added: []
  patterns:
    - 'Unconditional auth before routing: resolveTokenFromHeader gates every /mcp request'
    - 'DNS-rebinding guard runs before OPTIONS and routing (Pitfall 4)'
    - 'Per-session role: createSession(id, role, ctx) -> registerTools(server, ..., role, ctx)'
    - 'MCP Streamable-HTTP requires Accept: application/json, text/event-stream (else 406)'

key-files:
  created:
    - scripts/smoke-http-auth.sh
  modified:
    - src/session-manager.ts
    - src/http-server.ts
    - src/index.ts
    - tests/integration/http-transport.test.ts
    - tests/integration/helpers/http-test-client.ts

key-decisions:
  - 'SessionManager no longer takes authToken in constructor; role flows per-session from the validated token'
  - 'Auth is unconditional (D-07) and runs before routing — /health and /sessions also require a valid token'
  - 'Host/Origin allowlist always permits loopback (localhost, 127.0.0.1, with/without port); extra hosts via
    MCP_ALLOWED_HOSTS'
  - 'Role parity is enforced via role-aware schema trimming + handler-time decide(), not by hiding tools (all 4 tools
    always listed)'

patterns-established:
  - 'E2E HTTP hardening tests gated to macOS+OmniFocus via the shared `d` describe switch'
  - 'HTTPTestClient gains ownerToken option + listToolsRaw() for role-parity assertions'

requirements-completed: [HTTP-01, HTTP-02, HTTP-03, HTTP-04, HTTP-05]

duration: ~22min (incl. checkpoint debugging)
completed: 2026-06-05
---

# Phase 4 Plan 04: HTTP Server Wiring + Edge Hardening Summary

**Wired the token registry and per-session role into the session and HTTP layers, closing the `resolveHttpIdentity`
call-site seam. Full build green, 2339 unit tests green, and the human-verify smoke test passed (live + persisted as CI
e2e tests).**

## Accomplishments

- `SessionManager`: removed constructor-time `authToken`/role; `createSession(id, role, context)` registers role-aware
  tools per session via `registerTools(server, …, role, context)` (D-10, D-12). `validateAuthToken` deleted.
- `HttpServerManager`: constructor now takes `tokenRegistry` + `allowedHosts`. Added:
  - `validateHostOrigin` DNS-rebinding guard (runs before OPTIONS and routing), backed by exported pure
    `buildAllowedHostSet` / `isHostAllowed` (D-14/D-15).
  - `resolveTokenFromHeader` — constant-time bearer validation on **every** request (D-07); replaces the old
    `validateAuthentication`.
  - per-session role threaded from the validated `TokenEntry` into `createSession`.
- `src/index.ts`: builds the token registry from `cliConfig.agentToken`/`ownerToken`, constructs `SessionManager`
  without a token and `HttpServerManager` with `tokenRegistry` + `allowedHosts`; removed startup-time identity/role
  resolution. This resolved the expected cross-wave `TS2554` at the old `resolveHttpIdentity(144)` call site.

## Task Commits

1. **Task 1: SessionManager per-session role** — `f4544fe` (feat)
2. **Task 2: HTTP server Host/Origin + unconditional auth + per-session role** — `6f35104` (feat)
3. **Task 3: Wire registry in src/index.ts; update call sites** — `eac497c` (feat)
4. **Deviation [Rule 1 — Bug]: http-test-client supplies MCP_AGENT_TOKEN** — `1668ecd` (fix)
5. **Verification persistence: e2e hardening suite** — `3688a6a` (test)
6. **Verification persistence: smoke-http-auth.sh** — `82436b6` (chore)

## Human-Verify Checkpoint (Task 4) — PASSED

The checkpoint smoke test was run live against a running server and every property passed:

| Property                                                                                           | Result |
| -------------------------------------------------------------------------------------------------- | ------ |
| Unauthenticated / wrong token → 401                                                                | ✓      |
| Agent token + owner token → 200 (JSON-RPC result)                                                  | ✓      |
| Missing request body → 400                                                                         | ✓      |
| `--host 0.0.0.0` → fail-closed, exit 1                                                             | ✓      |
| Per-session role parity: agent `omnifocus_write` omits `delete`/`bulk_delete`; owner includes them | ✓      |

### Verification-instructions defect found and fixed

The original `04-04-PLAN.md` smoke-test curl was flawed (not the implementation):

- It omitted the `Accept: application/json, text/event-stream` header that the MCP Streamable-HTTP transport requires →
  returns **406** without it.
- The multi-line curl was paste-hostile; a dropped `-d` payload produced the misleading `Request body is required` (400)
  — which is in fact the server correctly rejecting an empty body.

Both are now permanently addressed:

- `scripts/smoke-http-auth.sh` — self-contained, single-command smoke test (generates tokens, starts/stops the server,
  prints a PASS/FAIL table). 8/8 pass.
- `tests/integration/http-transport.test.ts` → new `HTTP Transport Phase 4 Hardening` block runs the same checks in CI
  (missing-body 400, agent+owner 200, role parity, fail-closed bind). `HTTPTestClient` gained an `ownerToken` option and
  `listToolsRaw()`.

## Issues Encountered

During Wave 1 merge, plan 04-03's worktree had been created from a stale base (a pre-phase-3 commit); merging its branch
would have reverted phase-3 + planning. The orchestrator cherry-picked only the real cli.ts/cli.test.ts commits onto
`main` instead. This plan (04-04) was executed sequentially on `main` (no worktree) to keep the checkpoint/continuation
flow clean.

## Next Phase Readiness

- HTTP edge is hardened end-to-end: unconditional bearer auth, loopback-only bind (fail-closed), DNS-rebinding
  allowlist, per-session role parity with stdio. All five requirements (HTTP-01..HTTP-05) implemented and verified.
- Verification is reproducible: `bash scripts/smoke-http-auth.sh` (manual) and the CI e2e suite (automated).

---

_Phase: 04-http-edge-hardening_ _Completed: 2026-06-05_
