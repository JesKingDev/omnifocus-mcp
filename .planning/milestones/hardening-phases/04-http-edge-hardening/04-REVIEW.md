---
phase: 04-http-edge-hardening
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/auth/token-registry.ts
  - src/auth/role-resolver.ts
  - src/utils/cli.ts
  - src/session-manager.ts
  - src/http-server.ts
  - src/index.ts
  - tests/integration/http-transport.test.ts
  - tests/integration/helpers/http-test-client.ts
  - scripts/smoke-http-auth.sh
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-06-05 **Depth:** standard **Status:** issues_found

## Summary

Re-review after the fix for the two blocking findings from the prior pass. Scope was the three changed files
(`src/http-server.ts`, `src/session-manager.ts`, `tests/integration/http-transport.test.ts`), with cross-checks against
`src/auth/role-resolver.ts` and `src/auth/token-registry.ts` to confirm principal semantics.

Both critical findings are closed. The session is now bound to its creating token's principal, and all three /mcp method
handlers enforce the principal check before any transport dispatch or session-state mutation. `/sessions` is gated to
the owner role. The two new regression tests are genuine — each would fail if its guard were removed. The fix introduced
no new bug: legitimate same-token reuse still works, the principal values are server-controlled literals (not
spoofable), and the null-principal edge case cannot arise on the HTTP path.

The remaining open warnings live in files outside this fix's scope (`token-registry.ts`, `cli.ts`, and a residual
ambiguity in `parseRequestBody`). They are carried forward unchanged.

## Resolved (was Critical)

### CR-01 — RESOLVED: cross-token session reuse / privilege escalation

The session now carries the creating token's `principal` on `SessionConfig` (`src/session-manager.ts:30`, set at
`src/session-manager.ts:135` from `context.identity.principal`). All three method handlers call
`rejectSessionPrincipalMismatch` before dispatch:

- POST — `src/http-server.ts:381`, before the create-or-dispatch branch.
- GET — `src/http-server.ts:435`, after lookup, before `transport.handleRequest`.
- DELETE — `src/http-server.ts:478`, after lookup, before `transport.handleRequest`.

No path reaches `session.transport.handleRequest` without the guard. The comparison
(`session.principal !== tokenEntry.principal`, `src/http-server.ts:310`) is against hardcoded literals (`http-agent` /
`http-owner`) sourced from the registry, so it is not spoofable by a client. WR-01 (the GET/DELETE corollary of CR-01)
is closed by the same change — `tokenEntry` is now plumbed through `handleMcpRequest` into all three handlers.

### CR-02 — RESOLVED: /sessions session-ID disclosure

`handleSessionsRequest` now takes `tokenEntry` and returns 403 unless `tokenEntry.role === 'owner'`
(`src/http-server.ts:533-537`) before reaching `getStats()`. An agent token resolves to role `agent` and is denied, so
the live session-ID list is no longer disclosed to a lower-privileged principal.

## Verification of the fix

1. **All session-by-id paths guarded.** Confirmed for POST/GET/DELETE (see CR-01 above). The guard precedes both
   transport dispatch and `updateSessionActivity`.
2. **No new regression.** Same-token reuse: identical token → identical principal → guard passes. Null-principal: the
   `principal` field is typed `string | null`, but HTTP sessions always set it from a non-null `TokenEntry.principal`,
   so a null can never reach the comparison on this path. Comparison is value-equality on server-side literals.
3. **Tests are genuine.**
   - CR-01 test (`tests/integration/http-transport.test.ts:415-439`) opens an owner session via raw `fetch`, captures
     the `mcp-session-id`, then POSTs `tools/list` with the agent token + owner SID and asserts 403. Removing the guard
     would let that request reuse the owner session and return 200 — the assertion would fail. Genuine.
   - CR-02 test (`tests/integration/http-transport.test.ts:443-453`) asserts agent → 403 and owner → 200 on `/sessions`.
     Removing the role gate would return 200 for the agent — the assertion would fail. Genuine.

## Warnings

### WR-02: `parseRequestBody` swallows JSON parse errors and reports them as "body required"

**File:** `src/http-server.ts:587-595` **Issue:** On `JSON.parse` failure the catch logs at debug and `resolve(null)`.
The caller hits `if (!body)` (`src/http-server.ts:372`) and returns `400 "Request body is required"`. A non-empty but
malformed body therefore produces the same 400 as an empty body, and the parse failure is invisible above debug level.
The new "rejects an authenticated POST with no body (400)" test cannot distinguish the two cases. **Fix:** Reject
malformed JSON with an explicit `400 "Invalid JSON"` (or a JSON-RPC parse error) instead of collapsing both to the
empty-body path.

### WR-03: `buildTokenRegistry` Map keying lets a duplicate token silently collapse to one entry

**File:** `src/auth/token-registry.ts:110-124` **Issue:** The registry is a `Map` keyed by the raw token string. If
`MCP_AGENT_TOKEN === MCP_OWNER_TOKEN`, the owner `set()` overwrites the agent entry and a single token resolves to
`owner` — a privilege escalation. `validateCLIConfig` (D-06) blocks equal tokens in HTTP mode, so the live path is
currently safe, but `buildTokenRegistry` is an exported public function with no guard of its own; the safety property
lives in a different module callers may forget. **Fix:** Defend in depth — have `buildTokenRegistry` throw (or refuse to
overwrite) when the same token maps to two roles:

```ts
if (registry.has(ownerToken)) {
  throw new Error('Owner and agent tokens must be distinct');
}
```

### WR-04: Constant-time guarantee weakened by empty-registry / candidate fast-path and per-request rehash

**File:** `src/auth/token-registry.ts:75-94` **Issue:** Two timing channels remain.
`if (!candidate || registry.size === 0) return null` returns before any hashing — an empty registry or empty token
yields a distinguishably faster response. And `configuredHash = tokenHash(configuredToken)` is recomputed inside the
loop on every request, so response time scales with registry size. Neither is high-severity (≤2 entries; token values
are not the secret being size-probed), but both undercut the module's "no observable timing difference" claim. **Fix:**
Precompute the configured hashes once at registry-build time; keep the candidate-empty guard but document it as an
availability guard, not a secrecy guard.

### WR-05: `validateCLIConfig` does not reject a blank/whitespace agent token

**File:** `src/utils/cli.ts:127-141` **Issue:** The owner token is checked for blank/whitespace
(`config.ownerToken.trim() === ''` → throw), but the agent token is only checked for falsiness
(`if (!config.agentToken)`). A value of `" "` is truthy, passes the required-token gate, and becomes a live, trivially
guessable agent credential. Given the agent token is mandatory in HTTP mode, it deserves the stronger check. **Fix:**
Mirror the owner-token check:

```ts
if (!config.agentToken || config.agentToken.trim() === '') {
  throw new Error('MCP_AGENT_TOKEN is required and must not be empty or whitespace-only in HTTP mode.');
}
```

### WR-06: Per-session role parity e2e test still does not cross a token against another session

**File:** `tests/integration/http-transport.test.ts:368-400` **Issue:** The "applies per-session role" test still uses
each client only against its own session/token, so it confirms the happy-path role trim but does not itself exercise
cross-token reuse. This is no longer a _coverage gap_ for CR-01 — the new dedicated test at lines 415-439 now covers the
hijack case directly — but this older test's name still implies enforcement it does not assert. **Fix:** Rename it to
reflect that it verifies advertised-schema parity only, and treat the lines 415-439 test as the enforcement test.
Downgraded from the prior pass: the enforcement gap is closed; this is now a naming/clarity nit, kept as a warning only
because the test title overstates what it checks.

## Info

### IN-01: `cli.ts` sets `config.authToken` even when `agentToken` already came from `MCP_AUTH_TOKEN`

**File:** `src/utils/cli.ts:80-91` **Issue:** `MCP_AUTH_TOKEN` is mapped to `agentToken` (with a deprecation warning),
then `config.authToken` is also set unconditionally. `authToken` is not consumed downstream in HTTP mode (the registry
is built from `agentToken`/`ownerToken`), so it is dead state that can drift. **Fix:** Drop the redundant assignment, or
document why both fields are retained.

### IN-02: `buildCorsOriginHeader` default ignores configured port

**File:** `src/http-server.ts:179-193` **Issue:** The fallback origin is the literal `'http://localhost'` with no port,
while the server binds an arbitrary port. Cosmetic for loopback-only, non-credentialed use, but inconsistent with the
allowlist the function otherwise enforces. **Fix:** Return a port-correct default (`http://localhost:${this.port}`) or
omit the header on the no-match fallback.

### IN-03: `index.ts` global handlers swallow all uncaught errors and keep serving

**File:** `src/index.ts:33-50` **Issue:** `uncaughtException`/`unhandledRejection` log and intentionally do not exit. In
long-lived HTTP mode this can leave the process serving from a corrupted state after a fatal error. Predates Phase 4 and
the comment is deliberate, so informational. **Fix:** Consider a crash-only strategy for HTTP mode (log, then exit
non-zero so a supervisor restarts cleanly), distinct from the stdio leniency.

### IN-04: `initialize()` returns a hardcoded stale version in the cached-response branch

**File:** `tests/integration/helpers/http-test-client.ts:304-313` **Issue:** The idempotent early-return fabricates
`serverInfo.version: '3.0.0'`. No current test asserts on it, but a future version-parity test would silently read the
stale literal. **Fix:** Return the captured real initialize response, or drop `serverInfo` from the synthetic object.

---

_Reviewed: 2026-06-05_ _Reviewer: Claude (gsd-code-reviewer)_ _Depth: standard_
