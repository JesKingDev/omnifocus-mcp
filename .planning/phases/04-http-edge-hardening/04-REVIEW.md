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
  critical: 2
  warning: 6
  info: 4
  total: 12
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-06-05 **Depth:** standard **Files Reviewed:** 9 **Status:** issues_found

## Summary

Phase 4 builds the HTTP edge: a bearer-token registry with constant-time comparison, a DNS-rebinding Host/Origin
allowlist, a loopback-only fail-closed bind, and per-session role propagation from the token. The token-registry
constant-time logic, the loopback assertion in `validateCLIConfig`, and the auth-gate ordering in `handleRequest` are
all sound and well-tested.

The serious gap is in **session role binding**. The role is attached to a session at creation time and is never
re-checked against the authenticating token on later requests. Combined with the `/sessions` endpoint advertising every
live session ID to any authenticated caller, an agent-token holder can drive an owner-created session and execute
owner-only operations. The per-session role test passes because each test client only ever uses its own session — it
never crosses a session ID from one token to another, so it cannot catch this class of defect. That is the headline
finding.

## Critical Issues

### CR-01: Session role is not re-validated per request — agent can hijack an owner session for privilege escalation

**File:** `src/http-server.ts:356-369` (with `src/session-manager.ts:79-132`, `getSession` at `137-143`) **Issue:** A
session is created with a role derived from the token that first opened it:

```ts
const identity = resolveHttpIdentity(tokenEntry);
const context: ResolvedContext = { identity, role: tokenEntry.role };
session = await this.sessionManager.createSession(newSessionId, tokenEntry.role, context);
```

On every subsequent POST/GET/DELETE the session is resolved **only** by the `MCP-Session-Id` header:

```ts
let session = sessionId ? this.sessionManager.getSession(sessionId) : undefined;
...
await session.transport.handleRequest(_req, res, body);
```

The current request's `tokenEntry.role` is never compared to the role the session was created with, and the session is
not bound to the originating principal/token. An agent-token holder who knows an owner session's ID can send requests
with `Authorization: Bearer <agent-token>` plus `MCP-Session-Id: <owner-session>` and the request executes inside the
owner-privileged server instance — including `delete` / `bulk_delete`, which the agent role is explicitly meant to be
denied. This defeats the per-session role design (HTTP-05, D-12) entirely. CR-02 makes the owner session ID trivially
discoverable.

**Fix:** Bind each session to its creating principal/role and reject cross-token reuse. Store the owning token's
principal (or role) on `SessionConfig` and check it on every request before dispatching:

```ts
// when creating:
const session: SessionConfig = { ...rest, ownerPrincipal: tokenEntry.principal, role: tokenEntry.role };

// in handleMcpRequest / handleMcpPostRequest, after lookup:
if (session && session.ownerPrincipal !== tokenEntry.principal) {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Forbidden', message: 'Session does not belong to this principal' }));
  return;
}
```

Apply the same guard in `handleMcpGetRequest` and `handleMcpDeleteRequest` (both currently take no `tokenEntry` and
dispatch on session ID alone — see CR-01 corollary below).

### CR-02: `/sessions` discloses every live session ID to any authenticated caller

**File:** `src/http-server.ts:485-503` (data from `src/session-manager.ts:264-274`) **Issue:** `/sessions` returns
`getStats()`, which includes `sessionIds: Array.from(this.sessions.keys())`. The endpoint is gated by the unconditional
bearer auth, but it is not gated by role — an **agent** token can read it. That hands the agent every owner session ID,
which is exactly the secret needed to mount CR-01. Session IDs are bearer-grade capabilities here; exposing the full
list to a lower-privileged principal is an information-disclosure that directly enables privilege escalation.

**Fix:** Restrict `/sessions` to the owner role (pass `tokenEntry` into the handler and check
`tokenEntry.role === 'owner'`), and/or stop returning raw session IDs:

```ts
case '/sessions':
  if (tokenEntry.role !== 'owner') { res.writeHead(403, ...); res.end(...); return; }
  this.handleSessionsRequest(req, res);
  break;
```

At minimum drop `sessionIds` from the public payload and return only counts/timeouts.

## Warnings

### WR-01: GET/DELETE `/mcp` dispatch on session ID with no principal binding

**File:** `src/http-server.ts:300-318, 387-456` **Issue:** `handleMcpRequest` validated a token in `handleRequest`, but
only forwards `tokenEntry` to the POST handler. The GET and DELETE handlers receive only `sessionId` and call
`getSession(sessionId)` directly. Even after CR-01 is fixed for POST, an agent could terminate (DELETE) or attach to the
SSE stream (GET) of an owner session by ID. This is the same root cause as CR-01 and must be fixed in the same change —
plumbing `tokenEntry` through all three method handlers and enforcing the principal check uniformly. **Fix:** Pass
`tokenEntry` into `handleMcpGetRequest` and `handleMcpDeleteRequest` and apply the CR-01 principal/role guard before
`session.transport.handleRequest(...)`.

### WR-02: `parseRequestBody` swallows JSON parse errors and reports them as "body required"

**File:** `src/http-server.ts:540-549` **Issue:** On `JSON.parse` failure the catch logs at debug and `resolve(null)`.
The caller then hits `if (!body)` and returns `400 "Request body is required"`. A client that sent a non-empty but
malformed body gets a misleading error, and the actual parse failure is invisible above debug level. It also makes the
smoke/e2e "missing body -> 400" assertion ambiguous: a malformed body produces the same 400, so the test cannot
distinguish the two. **Fix:** Distinguish empty body from malformed JSON — reject malformed JSON with an explicit
`400 "Invalid JSON"` (or a JSON-RPC parse error) rather than collapsing both to the same path.

### WR-03: `buildTokenRegistry` Map keying lets a duplicate token silently collapse to one entry

**File:** `src/auth/token-registry.ts:110-124` **Issue:** The registry is a `Map` keyed by the raw token string. If
`MCP_AGENT_TOKEN === MCP_OWNER_TOKEN`, the owner `set()` overwrites the agent entry and a single token resolves to
`owner` — a privilege escalation. `validateCLIConfig` (D-06) blocks equal tokens in HTTP mode, so the live path is
currently safe, but `buildTokenRegistry` is an exported public function with no such guard of its own. The safety
property depends entirely on a check living in a different module that callers may forget. **Fix:** Defend in depth —
have `buildTokenRegistry` throw (or refuse to overwrite) if the same token maps to two roles, so the invariant holds
regardless of caller:

```ts
if (registry.has(ownerToken)) {
  throw new Error('Owner and agent tokens must be distinct');
}
```

### WR-04: Constant-time guarantee weakened by empty-registry / candidate fast-path and per-request rehash

**File:** `src/auth/token-registry.ts:75-94` **Issue:** Two timing channels remain despite the constant-time intent.
First, `if (!candidate || registry.size === 0) return null` returns before any hashing — an attacker probing a server
with an empty registry, or sending an empty token, gets a distinguishably faster response. Second,
`configuredHash = tokenHash(configuredToken)` is recomputed inside the loop on every request; the work scales with
registry size, so response time leaks the number of configured tokens. Neither is high-severity (the registry has at
most two entries and the token values are not the secret being probed by size), but both undercut the "no observable
timing difference" claim in the module header. **Fix:** Precompute the configured hashes once at registry-build time and
store them on the entry; keep the candidate-empty guard but document that it is an availability guard, not a secrecy
guard.

### WR-05: `validateCLIConfig` does not reject a blank/whitespace agent token

**File:** `src/utils/cli.ts:127-141` **Issue:** The owner token is checked for blank/whitespace
(`config.ownerToken.trim() === ''` → throw), but the agent token is only checked for falsiness
(`if (!config.agentToken)`). A value of `" "` (single space, e.g. `MCP_AGENT_TOKEN=" "`) is truthy, passes the
required-token gate, and becomes a live agent credential — a trivially guessable token. Given the agent token is
mandatory in HTTP mode, it deserves the stronger check the owner token already gets. **Fix:** Mirror the owner-token
check for the agent token:

```ts
if (!config.agentToken || config.agentToken.trim() === '') {
  throw new Error('MCP_AGENT_TOKEN is required and must not be empty or whitespace-only in HTTP mode.');
}
```

### WR-06: Per-session role e2e test cannot catch the CR-01 hijack — false sense of coverage

**File:** `tests/integration/http-transport.test.ts:368-400` **Issue:** The "applies per-session role" test initializes
an agent session and an owner session and asserts each one's advertised `omnifocus_write` enum. Each client only ever
uses its own session ID with its own token, so the test confirms the happy-path role trim but never crosses a token
against another session's ID. It therefore green-lights the role design while the actual enforcement gap (CR-01) goes
undetected. The smoke script (`scripts/smoke-http-auth.sh:60-85`) has the same blind spot. **Fix:** Add a negative test:
open an owner session, capture its `MCP-Session-Id`, then issue a `tools/call` with `operation: delete` using the
**agent** token and the **owner** session ID. Assert it is rejected (403/denied), not executed. This test should fail
against the current code and pass once CR-01/WR-01 are fixed.

## Info

### IN-01: `cli.ts` sets `config.authToken` even when `agentToken` already came from `MCP_AUTH_TOKEN`

**File:** `src/utils/cli.ts:80-91` **Issue:** Lines 80-84 map `MCP_AUTH_TOKEN` → `agentToken` (with a deprecation
warning), then line 91 unconditionally also sets `config.authToken = process.env.MCP_AUTH_TOKEN`. `authToken` is never
consumed downstream in HTTP mode (the registry is built from `agentToken`/`ownerToken` in `index.ts:266-269`), so it is
dead state that duplicates the alias and can drift. **Fix:** Drop the redundant `config.authToken` assignment, or
document why both fields are retained.

### IN-02: `buildCorsOriginHeader` default ignores configured port

**File:** `src/http-server.ts:178-192` **Issue:** The fallback origin is the literal `'http://localhost'` with no port,
while the server binds an arbitrary port. For loopback-only, non-credentialed use this is cosmetic, but the value is
inconsistent with the allowlist the function otherwise enforces. **Fix:** Either return a port-correct default
(`http://localhost:${this.port}`) or omit the header on the no-match fallback.

### IN-03: `index.ts` global handlers swallow all uncaught errors and keep serving

**File:** `src/index.ts:33-50` **Issue:** `uncaughtException`/`unhandledRejection` log and intentionally do not exit. In
long-lived HTTP mode this can leave the process serving from a corrupted state after a fatal error. This predates Phase
4 and the comment is deliberate, so it is informational, but the HTTP path raises the stakes versus stdio. **Fix:**
Consider a crash-only strategy for HTTP mode (log, then exit non-zero so a supervisor restarts cleanly), distinct from
the stdio leniency.

### IN-04: `initialize()` returns a hardcoded stale version in the cached-response branch

**File:** `tests/integration/helpers/http-test-client.ts:304-313` **Issue:** The idempotent early-return fabricates
`serverInfo.version: '3.0.0'`. No current test asserts on it, but a future version-parity test would silently read the
stale literal instead of the real server response. **Fix:** Return the captured real initialize response, or drop
`serverInfo` from the synthetic object so it cannot be mistaken for live data.

---

_Reviewed: 2026-06-05_ _Reviewer: Claude (gsd-code-reviewer)_ _Depth: standard_
