# Phase 4: HTTP Edge Hardening — Research

**Researched:** 2026-06-05 **Domain:** Node.js HTTP security — bearer auth, timing-safe token comparison, DNS-rebinding
protection, loopback bind, per-session role wiring **Confidence:** HIGH (all claims grounded in current source code,
live SDK inspection, or verified Node.js stdlib behavior)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01/D-03:** Owner is reachable over HTTP with full parity including destructive deletes. Both `agent` and `owner`
  roles resolve from the bearer token.
- **D-02:** REQUIREMENTS.md HTTP-05 and ROADMAP SC#3 must be amended before/with planning to remove "agent-scoped"
  wording. HTTP-05 is already amended in REQUIREMENTS.md; ROADMAP SC#3 must be updated.
- **D-04:** Constant-time, no-early-exit compare across the WHOLE token set — validate against every configured token
  with `crypto.timingSafeEqual` (length-safe), accumulate per-token booleans, branch ONCE at the end. Never return on
  first match.
- **D-05:** Fail-closed on unknown/missing token → HTTP 401. Does NOT silently fall back to agent.
- **D-06:** Agent and owner tokens MUST be different. Startup assertion refuses to start if equal, or if owner-over-HTTP
  enabled with a weak/blank owner token.
- **D-07:** Auth is mandatory in HTTP mode. Server fails closed at startup if no agent token is configured.
- **D-08:** Bearer required per request regardless of tailnet reachability (defense-in-depth).
- **D-09:** `MCP_AGENT_TOKEN` → `agent`, `MCP_OWNER_TOKEN` → `owner`. Separate env vars, not a JSON map.
- **D-10:** Principal labels: agent-token → `principal: 'http-agent'`; owner-token → `principal: 'http-owner'`.
  `roleSource: 'http-token'` for both.
- **D-11:** `MCP_AUTH_TOKEN` backward-compat: planner decides alias or retire. New registry is source of truth; old
  single-string `===` path is removed.
- **D-12:** Role/principal resolved from the **request's** bearer token at session creation, passed into that session's
  `registerTools`. Dispatch gate reads closure-captured per-session role, never re-calls `parseRole()`.
- **D-13:** Default bind changes to `127.0.0.1`. Fail-closed startup assertion refuses to start on any non-loopback
  interface. No override escape hatch.
- **D-14:** DNS-rebinding protection as external middleware in `http-server.ts`'s `handleRequest`, NOT via SDK transport
  options (those are deprecated in SDK 1.26.0).
- **D-15:** Allowlist: loopback (`localhost`, `127.0.0.1[:port]`) always allowed plus env-configurable tailnet hostname
  (e.g. `MCP_ALLOWED_HOSTS`). Reject (not just CORS-block) foreign Host/Origin.
- **D-16:** Tailscale Serve for v1. Cloudflare evaluated and declined — posture conflict (public hostname, TLS at edge).
  Decision recorded in CONTEXT; do not re-litigate.
- **D-17:** Funnel prevention via structural combo only (loopback bind + mandatory bearer). Runtime funnel-detection
  guard deferred to Phase 6.

### Claude's Discretion

- Exact wording/placement of amended SC#3 + HTTP-05 text.
- Whether `MCP_AUTH_TOKEN` is aliased or retired (D-11).
- Exact env var name for the host allowlist (`MCP_ALLOWED_HOSTS` suggested) and parsing format.
- Structure of the bearer-extraction + token-lookup helper, as long as D-04 and D-05 hold.

### Deferred Ideas (OUT OF SCOPE)

- Runtime funnel-detection guard (boot-time `tailscale serve status --json`) → Phase 6.
- Cloudflare Tunnel / Access → declined for this milestone.
- Per-request Tailscale identity-header gate (`Tailscale-User-Login`) → future option.
- Write-verification of mutations → Phase 5.
- launchd deployment unit and Full-Disk-Access posture → Phase 6. </user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                                          | Research Support                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| HTTP-01 | Every HTTP request authenticated with bearer token using constant-time comparison before dispatch; unauthenticated requests rejected | D-04 pattern (accumulate-then-branch); `crypto.timingSafeEqual` with SHA-256 hash normalization for length safety |
| HTTP-02 | HTTP server binds to `127.0.0.1` with fail-closed startup assertion; never binds to open interface                                   | Change `DEFAULT_CLI_CONFIG.host` from `'0.0.0.0'` to `'127.0.0.1'`; add assertion in `validateCLIConfig`          |
| HTTP-03 | DNS-rebinding protection explicitly enabled with host/origin allowlists                                                              | External middleware in `handleRequest` — SDK options deprecated per D-14                                          |
| HTTP-04 | Remote access via Tailscale `serve` only; bearer token still required per request                                                    | Structural enforcement: loopback bind + mandatory bearer make Funnel harmless; documented in ADR                  |
| HTTP-05 | HTTP connection role derived from bearer token; both roles reachable; unknown/missing token rejected                                 | `resolveHttpIdentity()` filled with token→role lookup; two-token env registry; per-session `createSession`        |

</phase_requirements>

---

## Summary

This phase fills exactly five Phase 3 seams that were deliberately left inert. The code is already shaped for the fill —
the stub functions, the per-session `registerTools` signature, and the `ResolvedContext`/`RoleSource` types are all in
place. The work is surgical: replace stubs with real implementations, change one default, and add startup assertions.

The most security-sensitive piece is D-04's constant-time token comparison. `crypto.timingSafeEqual` throws on
unequal-length buffers, which would leak token length as a timing side-channel via the exception. The fix is to hash
both sides to fixed-length before comparing — SHA-256 produces a 32-byte `Buffer` regardless of input length, collapsing
all token comparisons to equal-length. See the Code Examples section for the exact pattern.

The SDK situation is clean: `@modelcontextprotocol/sdk@1.26.0` is installed. The `allowedHosts`, `allowedOrigins`, and
`enableDnsRebindingProtection` options on `StreamableHTTPServerTransport` (and
`WebStandardStreamableHTTPServerTransport`) are explicitly marked `@deprecated` in the installed SDK source — the
deprecation message says "Use external middleware for host validation instead." D-14's decision to implement Host/Origin
validation as middleware in `http-server.ts` is already correct and confirmed against the installed source.

**Primary recommendation:** Three files carry the bulk of the work (`src/auth/role-resolver.ts`,
`src/session-manager.ts`, `src/utils/cli.ts`) with `src/http-server.ts` needing two additions (middleware guard +
pass-through of resolved role to `createSession`). A new `src/auth/token-registry.ts` module cleanly isolates the token
registry and constant-time compare per the "one table, two call sites" discipline.

---

## Architectural Responsibility Map

| Capability                           | Primary Tier                                     | Secondary Tier              | Rationale                                                                             |
| ------------------------------------ | ------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------- |
| Bearer token extraction              | HTTP middleware (`http-server.ts`)               | —                           | Earliest possible rejection before any session work                                   |
| Constant-time token set comparison   | Auth module (`src/auth/token-registry.ts`)       | —                           | Single source of truth for the registry; consumed by middleware and identity resolver |
| Role/principal resolution from token | Auth module (`src/auth/role-resolver.ts`)        | —                           | Extends existing identity/authz split (ROLE-03); fills the Phase 3 stub               |
| Per-session role wiring              | Session layer (`src/session-manager.ts`)         | —                           | `createSession` receives resolved role; threads into `registerTools` closure          |
| DNS-rebinding Host/Origin validation | HTTP middleware (`http-server.ts`)               | —                           | External middleware, not SDK option (deprecated)                                      |
| Loopback bind assertion              | Startup (`src/utils/cli.ts`)                     | `src/index.ts` startup path | Config-time; fail-closed before any socket open                                       |
| Startup invariant checks             | Startup (`src/utils/cli.ts` `validateCLIConfig`) | —                           | Token distinctness, mandatory agent token, loopback bind                              |
| Env-based token→role registry        | Config/startup (`src/utils/cli.ts`)              | Auth module                 | Env vars read once at startup; passed as frozen registry                              |

---

## Standard Stack

### Core

All implementation uses Node.js stdlib and the already-installed SDK. No new packages required.

| Library                         | Version              | Purpose                                            | Why Standard                                                   |
| ------------------------------- | -------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| `node:crypto` `timingSafeEqual` | Node.js built-in     | Constant-time buffer comparison for D-04           | Stdlib; purpose-built for this use case                        |
| `node:crypto` `createHash`      | Node.js built-in     | SHA-256 hash normalization for length-safe compare | Stdlib; makes both sides equal-length before `timingSafeEqual` |
| `@modelcontextprotocol/sdk`     | `1.26.0` (installed) | `StreamableHTTPServerTransport` — transport layer  | Already in use; no version change needed                       |

### No New Packages

This phase adds zero npm dependencies. All security primitives (`timingSafeEqual`, `createHash`) are Node.js stdlib
(`node:crypto`). The SDK is already installed at `1.26.0`.

**Package Legitimacy Audit:** Not applicable — no new packages.

---

## Architecture Patterns

### System Architecture Diagram

```
HTTP Request
    │
    ▼
handleRequest() ──── OPTIONS? ──→ CORS preflight (unchanged)
    │
    ├─ [NEW] Host/Origin middleware ──── reject 400 if not in allowlist
    │
    ├─ [NEW] Auth gate: resolveTokenFromHeader()
    │         │
    │         ├─ no/invalid bearer ──→ HTTP 401 (D-05 fail-closed)
    │         │
    │         └─ validateTokenSet(token) ──→ { role, principal } | null
    │                  │
    │                  └─ timingSafeEqual over ALL tokens (D-04)
    │
    ├─ route /mcp POST
    │         │
    │         └─ createSession(sessionId, role, context)  ← per-session role
    │                  │
    │                  └─ registerTools(server, cache, pending, role, context)
    │                           │
    │                           └─ dispatch gate reads closure-captured role
    │
    └─ /health, /sessions (unchanged)

Startup assertions (before any socket bind):
  validateCLIConfig():
    - host must be 127.0.0.1 (D-13)
    - MCP_AGENT_TOKEN required (D-07)
    - MCP_AGENT_TOKEN !== MCP_OWNER_TOKEN (D-06)
    - MCP_OWNER_TOKEN non-blank if set (D-06)
```

### Recommended Project Structure

No new directories. New file:

```
src/
├── auth/
│   ├── role-resolver.ts       # Fill resolveHttpIdentity() stub
│   ├── token-registry.ts      # NEW: token→role registry + constant-time compare
│   └── operation-policy.ts    # Unchanged
├── http-server.ts             # Add Host/Origin middleware + pass role to createSession
├── session-manager.ts         # createSession accepts (sessionId, role, context)
└── utils/
    └── cli.ts                 # Change default host; add new env vars; extend validateCLIConfig
```

### Pattern 1: Length-Safe Constant-Time Token Comparison (D-04)

**What:** Hash both the candidate token and each configured token to SHA-256 before calling `timingSafeEqual`. SHA-256
always produces a 32-byte `Buffer`, eliminating the unequal-length throw. Accumulate all per-token results into a
boolean with `|`, branch once at the end.

**Why SHA-256 normalization:** `crypto.timingSafeEqual` throws
`RangeError: Input buffers must have the same byte length` on unequal-length inputs. That throw is itself a timing
side-channel — it leaks whether the candidate length matches a configured token's length. Hashing both sides to a fixed
32-byte output before comparison prevents this entirely. [VERIFIED: live Node.js test in this session]

**Code pattern:**

```typescript
// Source: node:crypto stdlib (verified behavior in this session)
import { createHash, timingSafeEqual } from 'node:crypto';

type TokenEntry = { role: Role; principal: string };

/** Normalize a token to a fixed-length Buffer for timingSafeEqual. */
function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/**
 * Validate the candidate token against the full registry.
 * D-04: accumulate booleans across ALL entries, branch once at end.
 * D-05: returns null (not a default role) on no match.
 */
export function validateTokenSet(candidate: string, registry: Map<string, TokenEntry>): TokenEntry | null {
  const candidateHash = tokenHash(candidate);
  let matched: TokenEntry | null = null;
  let anyMatch = false;

  for (const [configuredToken, entry] of registry.entries()) {
    const configuredHash = tokenHash(configuredToken);
    // timingSafeEqual: both buffers are 32 bytes (SHA-256), never throws
    const isMatch = timingSafeEqual(candidateHash, configuredHash);
    // Accumulate — never short-circuit (D-04: no return on first match)
    if (isMatch && !anyMatch) {
      anyMatch = true;
      matched = entry;
    }
  }

  // Single branch at end (D-04)
  return anyMatch ? matched : null;
}
```

**Why accumulate instead of `|=`:** The `|=` pattern (bitwise OR accumulate) over booleans prevents early-exit by not
short-circuiting `&&`. The code above uses a flag variable for the same effect while preserving the ability to capture
which entry matched. Both approaches satisfy D-04.

### Pattern 2: Token Registry Construction (D-09, D-11)

```typescript
// In src/utils/cli.ts or a new src/auth/token-registry.ts

export interface TokenEntry {
  role: Role;
  principal: string; // D-10: 'http-agent' or 'http-owner'
}

export function buildTokenRegistry(env: Record<string, string | undefined>): Map<string, TokenEntry> {
  const registry = new Map<string, TokenEntry>();

  const agentToken = env.MCP_AGENT_TOKEN ?? env.MCP_AUTH_TOKEN; // D-11 backward-compat (alias path)
  const ownerToken = env.MCP_OWNER_TOKEN;

  if (agentToken) {
    registry.set(agentToken, { role: 'agent', principal: 'http-agent' });
  }
  if (ownerToken) {
    registry.set(ownerToken, { role: 'owner', principal: 'http-owner' });
  }

  return registry;
}
```

### Pattern 3: Per-Session Role Wiring (D-12)

The existing `createSession(sessionId: string)` signature must be extended. The Phase 3 seam comment at
`session-manager.ts:126` already marks the exact location.

**Change:** `createSession(sessionId: string, role: Role, context: ResolvedContext)`

```typescript
// session-manager.ts — createSession signature change
async createSession(sessionId: string, role: Role, context: ResolvedContext): Promise<SessionConfig> {
  // ... transport/server setup unchanged ...

  // Phase 4: role and context come from the caller (per-request bearer lookup),
  // not from this.role / this.context (which were startup-time, Phase 3 seam).
  await registerTools(server, this.cacheManager, this.pendingOperations, role, context);
  // ...
}
```

The caller (`http-server.ts` `handleMcpPostRequest`) resolves role before calling `createSession`:

```typescript
// http-server.ts — POST handler (simplified)
const tokenEntry = this.tokenRegistry.validate(extractedBearer);
if (!tokenEntry) {
  res.writeHead(401, ...);
  return;
}
const identity: ResolvedIdentity = {
  transport: 'http',
  roleSource: 'http-token',
  principal: tokenEntry.principal,
};
const context: ResolvedContext = { identity, role: tokenEntry.role };
const session = await this.sessionManager.createSession(newSessionId, tokenEntry.role, context);
```

### Pattern 4: resolveHttpIdentity() Fill (D-10, D-12)

The stub in `src/auth/role-resolver.ts:78` is replaced. The new signature needs the bearer token (or a resolved
`TokenEntry`) passed in — the stub's zero-argument form cannot serve Phase 4. Two implementation options:

**Option A (preferred):** `resolveHttpIdentity` takes a `TokenEntry` already resolved by the caller (separation of
concerns — the caller already validated the token):

```typescript
export function resolveHttpIdentity(entry: TokenEntry): ResolvedIdentity {
  return {
    transport: 'http',
    roleSource: 'http-token',
    principal: entry.principal,
  };
}
```

**Option B:** Pass the raw bearer and re-validate. Not preferred — duplicates registry lookup.

The existing unit test at `tests/unit/auth/role-resolver.test.ts` ("Phase 4 stub contract") asserts the zero-argument
stub shape. That test must be updated to match the new signature when the stub is filled.

### Pattern 5: Host/Origin Middleware (D-14, D-15)

Added at the top of `handleRequest` in `http-server.ts`, before the OPTIONS check and auth gate.

```typescript
// http-server.ts — DNS-rebinding protection middleware
private validateHostOrigin(req: IncomingMessage): boolean {
  const host = req.headers['host'];
  const origin = req.headers['origin'];

  const allowed = this.buildAllowedHostSet(); // loopback + MCP_ALLOWED_HOSTS entries

  if (host && !allowed.has(this.normalizeHostHeader(host))) {
    return false;
  }
  if (origin) {
    // origin includes scheme — extract host portion
    try {
      const originHost = new URL(origin).host;
      if (!allowed.has(originHost)) {
        return false;
      }
    } catch {
      return false; // malformed Origin
    }
  }
  return true;
}
```

`allowed` set contents:

- Always: `localhost`, `127.0.0.1`, `localhost:<port>`, `127.0.0.1:<port>`
- From `MCP_ALLOWED_HOSTS`: comma-separated list, each entry treated as a hostname (no scheme)

### Anti-Patterns to Avoid

- **`token === configuredToken`** (current code): breaks under timing attack, removed per D-04.
- **`return true` on first match**: leaks which token matched (and whether owner token exists) through timing. The
  accumulate-then-branch pattern prevents this.
- **`timingSafeEqual` without hash normalization**: throws on unequal-length buffers, leaking token length. Always hash
  both sides to SHA-256 first.
- **Re-calling `parseRole()` inside session dispatch**: `parseRole()` reads `process.env.OMNIFOCUS_MCP_ROLE` which
  cannot distinguish HTTP sessions. Use the closure-captured role from `createSession` (D-12).
- **Using SDK `enableDnsRebindingProtection`**: marked `@deprecated` in SDK 1.26.0; implement as external middleware
  (D-14).
- **Conditionally applying auth**: current code has `if (this.authToken && !this.validateAuthentication(req))` — the
  `if (this.authToken)` guard is removed in HTTP mode (D-07 mandatory auth).
- **Keeping `private readonly role`/`context` in `SessionManager` constructor**: these are the Phase 3 seam values.
  Phase 4 removes them from the class fields; role/context come per-session from the bearer.

---

## Current Code State — Exact Change Points

This section maps each locked decision to the exact file:function that changes.

### `src/utils/cli.ts`

| What changes                                                                                                                                                                                                             | Why                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `DEFAULT_CLI_CONFIG.host: '0.0.0.0'` → `'127.0.0.1'`                                                                                                                                                                     | D-13 loopback-only default          |
| `CLIConfig` interface: add `agentToken?: string`, `ownerToken?: string`, `allowedHosts?: string[]`                                                                                                                       | D-09 token registry; D-15 allowlist |
| `parseCLIArgs()`: read `MCP_AGENT_TOKEN`, `MCP_OWNER_TOKEN`, `MCP_ALLOWED_HOSTS` from env                                                                                                                                | D-09, D-15                          |
| `parseCLIArgs()`: backward-compat alias — if `MCP_AUTH_TOKEN` set and `MCP_AGENT_TOKEN` not set, treat as agent token (D-11 alias path) OR emit a deprecation warning and ignore it (D-11 retire path — planner chooses) | D-11                                |
| `validateCLIConfig()` in HTTP mode: assert `host === '127.0.0.1'`, assert `agentToken` non-empty, assert `agentToken !== ownerToken`, assert `ownerToken` non-blank if set                                               | D-06, D-07, D-13                    |
| `printHelp()`: update env var documentation                                                                                                                                                                              | Docs consistency                    |

### `src/auth/token-registry.ts` (NEW FILE)

| What changes                                                    | Why              |
| --------------------------------------------------------------- | ---------------- | ---------- |
| `TokenEntry` interface `{ role: Role; principal: string }`      | D-10             |
| `buildTokenRegistry(env)` → `Map<string, TokenEntry>`           | D-09             |
| `validateTokenSet(candidate, registry)` → `TokenEntry           | null`            | D-04, D-05 |
| Uses `createHash('sha256')` + `timingSafeEqual` (see Pattern 1) | D-04 length-safe |

### `src/auth/role-resolver.ts`

| What changes                                                                              | Why                                 |
| ----------------------------------------------------------------------------------------- | ----------------------------------- |
| `resolveHttpIdentity()` stub → `resolveHttpIdentity(entry: TokenEntry): ResolvedIdentity` | D-10, D-12 — fills the Phase 3 seam |
| Returns `{ transport: 'http', roleSource: 'http-token', principal: entry.principal }`     | D-10                                |

The existing unit test for the stub (`resolveHttpIdentity — Phase 4 stub contract`) must be updated to pass a
`TokenEntry`. The new test covers the filled implementation.

### `src/session-manager.ts`

| What changes                                                                                                    | Why                                                  |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Remove `private readonly role: Role` and `private readonly context: ResolvedContext` class fields               | D-12 — role is now per-session, not constructor-time |
| Remove `resolveStdioIdentity()` / `parseRole()` calls from constructor                                          | D-12                                                 |
| Remove `private authToken?: string` field                                                                       | Replaced by token registry                           |
| `createSession(sessionId: string)` → `createSession(sessionId: string, role: Role, context: ResolvedContext)`   | D-12                                                 |
| `validateAuthToken(token?: string): boolean` → delete entirely (replaced by token registry in `http-server.ts`) | D-04 — removes the `===` compare                     |
| Constructor `authToken` param: remove or make unused stub for backward-compat                                   | D-09 — registry is source of truth                   |

Note: `setPendingOperationsTracker` called from constructor remains; CONCERNS.md flags the "double-call wins" risk in
HTTP mode — that pre-existing issue is noted but Phase 4 scope does not require fixing it.

### `src/http-server.ts`

| What changes                                                                                                                                                                               | Why                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------- |
| Constructor: accept `tokenRegistry: Map<string, TokenEntry>` (or `allowedHosts: string[]`)                                                                                                 | D-09, D-15                 |
| `handleRequest()`: add `validateHostOrigin()` check before OPTIONS and auth (D-14, D-15)                                                                                                   | DNS-rebinding middleware   |
| `handleRequest()`: replace `if (this.authToken && !...)` with unconditional `resolveTokenFromHeader(req)` → fail 401 if null (D-07 mandatory auth)                                         | D-07, D-05                 |
| `validateAuthentication()`: replace with `resolveTokenFromHeader(req)` that returns `TokenEntry                                                                                            | null`                      | D-04 — calls `validateTokenSet` |
| `handleMcpPostRequest()`: receive `TokenEntry` from auth gate, build `identity`/`context`, pass to `createSession(sessionId, role, context)`                                               | D-12                       |
| `handleMcpGetRequest()` / `handleMcpDeleteRequest()`: the session was already created with a role at POST time; GET/DELETE operate on the existing session — no new role resolution needed | D-12 session lifecycle     |
| `handleOptionsRequest()`: update CORS headers — `Access-Control-Allow-Origin: *` should be tightened to known origins for DNS-rebinding protection                                         | D-14, D-15                 |
| Remove `private authToken?: string` field                                                                                                                                                  | Replaced by token registry |

### `src/index.ts`

| What changes                                                                                                                                                          | Why                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `runHttpServer(...)`: build `tokenRegistry` from `cliConfig`, pass to `SessionManager` and/or `HttpServerManager`                                                     | D-09                                                                   |
| Remove `identity` / `role` resolution at top of `runHttpServer` for HTTP mode (currently computed but never used — `_identity`, `_role` prefixed params confirm this) | D-12 — per-session resolution replaces startup resolution in HTTP mode |

---

## Don't Hand-Roll

| Problem                      | Don't Build                        | Use Instead                                                   | Why                                                      |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| Constant-time string compare | Custom character-by-character loop | `crypto.timingSafeEqual` + SHA-256 hash                       | Compiler/runtime optimizations can eliminate naive loops |
| Cryptographic randomness     | `Math.random()` tokens             | `openssl rand -hex 32` (already in help text) / `randomBytes` | `Math.random` is not cryptographically secure            |
| Token hashing                | Custom hash                        | `createHash('sha256')` from `node:crypto`                     | Stdlib; SHA-256 is fixed-output-length, widely audited   |

---

## Common Pitfalls

### Pitfall 1: timingSafeEqual Throws on Unequal-Length Buffers

**What goes wrong:** Call `timingSafeEqual(Buffer.from(candidate), Buffer.from(configured))` where lengths differ.
Node.js throws `RangeError: Input buffers must have the same byte length`. The throw itself is a timing side-channel
that leaks whether the candidate length matches any token.

**Why it happens:** `timingSafeEqual` is designed for fixed-length secrets (MACs, hashed passwords). Token strings are
variable length.

**How to avoid:** Hash both sides with `createHash('sha256').update(token).digest()` before comparing. SHA-256 always
produces 32 bytes regardless of input length.

**Warning signs:** Any test that passes tokens of different lengths and checks for a boolean `false` (not a throw) will
fail.

**Verified:** Live test in this session confirmed the throw:
`crypto.timingSafeEqual(Buffer.from('a'), Buffer.from('bb'))` →
`RangeError: Input buffers must have the same byte length`. [VERIFIED: live Node.js test]

### Pitfall 2: Short-Circuit Evaluation Leaks Token Set Membership

**What goes wrong:** Loop over tokens with an early `return true` on first match. An observer timing thousands of
requests can detect how many tokens exist and which position the matching token is at.

**Why it happens:** Natural coding instinct — "why compare the rest once I have a match?"

**How to avoid:** Accumulate per-token booleans across ALL tokens; branch exactly once at the end (D-04).

### Pitfall 3: `parseRole()` Still Called Inside Session Dispatch

**What goes wrong:** `parseRole()` reads `process.env.OMNIFOCUS_MCP_ROLE`. In HTTP mode with multiple concurrent
sessions (one agent, one owner), all sessions see the same env var — the first-established role bleeds into all
sessions.

**Why it happens:** Phase 3's `parseRole()` is wired into the dispatch path at `src/tools/index.ts` (via `registerTools`
→ closure). The issue doesn't manifest when roles are resolved per-session and passed as a closure.

**How to avoid:** Never call `parseRole()` from session dispatch in HTTP mode. Role is closure-captured in
`registerTools` from the `role` param passed to `createSession`. D-12 explicitly forbids re-calling `parseRole()` from
session context.

**Warning sign:** Any new code in `session-manager.ts` that imports `parseRole` from `role-resolver.ts`.

### Pitfall 4: CORS `*` Wildcard With DNS-Rebinding Middleware

**What goes wrong:** The current `handleOptionsRequest` sends `Access-Control-Allow-Origin: *`. A DNS-rebinding
middleware that validates `Host` and `Origin` on POST/GET but not on OPTIONS lets an attacker use the preflight to
discover allowed origins.

**Why it happens:** OPTIONS handling is separate from the main request path.

**How to avoid:** Tighten the CORS `Allow-Origin` header on OPTIONS to reflect the same allowlist used by the
Host/Origin middleware. Alternatively, reject OPTIONS from unknown origins too.

### Pitfall 5: Startup Assertions Not Run in stdio Mode

**What goes wrong:** `validateCLIConfig()` assertions (loopback bind, mandatory token, distinct tokens) run in HTTP mode
— but in stdio mode (`httpMode: false`) the new assertions must not reject a valid stdio startup that has no auth tokens
set.

**How to avoid:** Gate the new assertions behind `if (config.httpMode)` in `validateCLIConfig()`. The existing port/host
validations already do this.

### Pitfall 6: `setPendingOperationsTracker` Double-Call

**What it is:** CONCERNS.md §HTTP flags that `index.ts` and `session-manager.ts` both call
`setPendingOperationsTracker`. In HTTP mode the second call wins, orphaning operations tracked by the first.

**Phase 4 scope:** This pre-existing issue is NOT fixed in Phase 4 — fixing requires constructor injection refactor.
However, Phase 4 must not make it worse. If the constructor removes `authToken` but retains the
`setPendingOperationsTracker` call, behavior is unchanged from Phase 3.

---

## SDK API Surface — Verified

**Installed version:** `@modelcontextprotocol/sdk@1.26.0` [VERIFIED:
`node_modules/@modelcontextprotocol/sdk/package.json`]

**`StreamableHTTPServerTransport` (the class used in `session-manager.ts`):**

Located at `@modelcontextprotocol/sdk/server/streamableHttp.js` (current import in `session-manager.ts`).

This is a thin Node.js wrapper around `WebStandardStreamableHTTPServerTransport`. Options are aliased via
`StreamableHTTPServerTransportOptions = WebStandardStreamableHTTPServerTransportOptions`.

**Available options (from installed `.d.ts`):**

| Option                         | Type                          | Status                                      |
| ------------------------------ | ----------------------------- | ------------------------------------------- |
| `sessionIdGenerator`           | `() => string`                | Active — used today                         |
| `onsessioninitialized`         | `(sessionId: string) => void` | Active — used today                         |
| `onsessionclosed`              | `(sessionId: string) => void` | Active — used today                         |
| `enableJsonResponse`           | `boolean`                     | Active — not used                           |
| `eventStore`                   | `EventStore`                  | Active — not used                           |
| `allowedHosts`                 | `string[]`                    | **`@deprecated`** "Use external middleware" |
| `allowedOrigins`               | `string[]`                    | **`@deprecated`** "Use external middleware" |
| `enableDnsRebindingProtection` | `boolean`                     | **`@deprecated`** "Use external middleware" |
| `retryInterval`                | `number`                      | Active — not used                           |

[VERIFIED: read installed `node_modules/.../webStandardStreamableHttp.d.ts` in this session]

**`handleRequest` signature on `StreamableHTTPServerTransport`:**

```typescript
handleRequest(
  req: IncomingMessage & { auth?: AuthInfo },
  res: ServerResponse,
  parsedBody?: unknown
): Promise<void>
```

The `auth?: AuthInfo` slot on `req` is a hook for MCP's own OAuth 2.1 middleware (`src/server/auth/`). Phase 4 does NOT
use this — the OAuth middleware is not in the project stack and would be over-engineering. The bearer auth is handled
before `transport.handleRequest()` is called. [VERIFIED: installed `streamableHttp.d.ts`]

**DNS-rebinding options are deprecated — confirmed.** D-14's decision to use external middleware is correct and required
by the SDK's own guidance. [VERIFIED: installed `webStandardStreamableHttp.d.ts`]

---

## Env Vars — Complete Registry After Phase 4

| Var                 | Purpose                                                       | Required in HTTP mode                                                                                   | Notes                                     |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `MCP_AGENT_TOKEN`   | Bearer token for `agent` role                                 | YES (startup fails without it)                                                                          | High-entropy; `openssl rand -hex 32`      |
| `MCP_OWNER_TOKEN`   | Bearer token for `owner` role                                 | NO (owner-over-HTTP is opt-in)                                                                          | Required distinct from agent token if set |
| `MCP_AUTH_TOKEN`    | Legacy single-token (Phase 3)                                 | Treated as `MCP_AGENT_TOKEN` alias (if D-11 alias) or ignored with deprecation warning (if D-11 retire) | Planner chooses                           |
| `MCP_ALLOWED_HOSTS` | Comma-separated tailnet hostnames for DNS-rebinding allowlist | NO                                                                                                      | Defaults to loopback only if absent       |
| `MCP_PORT`          | Bind port                                                     | NO                                                                                                      | Default 3000                              |
| `MCP_HOST`          | Bind address                                                  | NO                                                                                                      | Default changes to `127.0.0.1`            |

---

## Code Examples

### Length-Safe Constant-Time Token Set Validation (complete)

```typescript
// src/auth/token-registry.ts
// Source: node:crypto stdlib — timingSafeEqual + createHash verified in this session
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Role } from '../contracts/roles.js';

export interface TokenEntry {
  role: Role;
  principal: string; // 'http-agent' or 'http-owner' per D-10
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

/**
 * Validate candidate token against the full registry.
 * D-04: accumulates booleans across ALL entries; never short-circuits.
 * D-05: returns null on no match — never a default role.
 */
export function validateTokenSet(candidate: string, registry: ReadonlyMap<string, TokenEntry>): TokenEntry | null {
  if (!candidate || registry.size === 0) return null;

  const candidateHash = tokenHash(candidate);
  let matched: TokenEntry | null = null;
  let anyMatch = false;

  for (const [configuredToken, entry] of registry) {
    const configuredHash = tokenHash(configuredToken);
    // Both hashes are 32 bytes (SHA-256) — timingSafeEqual never throws
    const isMatch = timingSafeEqual(candidateHash, configuredHash);
    // Accumulate — no early exit (D-04)
    if (isMatch && !anyMatch) {
      anyMatch = true;
      matched = entry;
    }
  }

  return anyMatch ? matched : null;
}

export function buildTokenRegistry(env: Record<string, string | undefined>): Map<string, TokenEntry> {
  const registry = new Map<string, TokenEntry>();
  const agentToken = env.MCP_AGENT_TOKEN ?? env.MCP_AUTH_TOKEN; // D-11 backward-compat
  const ownerToken = env.MCP_OWNER_TOKEN;
  if (agentToken) registry.set(agentToken, { role: 'agent', principal: 'http-agent' });
  if (ownerToken) registry.set(ownerToken, { role: 'owner', principal: 'http-owner' });
  return registry;
}
```

### Startup Assertions in `validateCLIConfig`

```typescript
// src/utils/cli.ts — extend existing validateCLIConfig
export function validateCLIConfig(config: CLIConfig): void {
  if (config.httpMode) {
    // Existing
    if (config.port <= 0 || config.port >= 65536) {
      throw new Error(`Invalid port: ${config.port}. Port must be between 1 and 65535.`);
    }

    // D-13: loopback-only bind
    if (config.host !== '127.0.0.1' && config.host !== 'localhost') {
      throw new Error(
        `HTTP mode requires loopback bind. Got host="${config.host}". ` +
          `Set to 127.0.0.1 (default). Remote access is via Tailscale Serve proxying to loopback.`,
      );
    }

    // D-07: mandatory agent token in HTTP mode
    if (!config.agentToken) {
      throw new Error('MCP_AGENT_TOKEN is required in HTTP mode. ' + 'Generate one with: openssl rand -hex 32');
    }

    // D-06: distinct tokens
    if (config.ownerToken && config.agentToken === config.ownerToken) {
      throw new Error(
        'MCP_AGENT_TOKEN and MCP_OWNER_TOKEN must be different. ' +
          'Generate distinct tokens with: openssl rand -hex 32',
      );
    }

    // D-06: owner token non-blank if set (blank string bypasses auth)
    if (config.ownerToken !== undefined && config.ownerToken.trim() === '') {
      throw new Error('MCP_OWNER_TOKEN must not be empty or whitespace-only.');
    }
  }
}
```

---

## Validation Architecture

### Test Framework

| Property           | Value                              |
| ------------------ | ---------------------------------- |
| Framework          | Vitest (already installed)         |
| Config file        | `vitest.config.ts` at project root |
| Quick run command  | `npm run test:unit`                |
| Full suite command | `npm test`                         |

### Phase Requirements → Test Map

| Req ID  | Behavior                                                                 | Test Type                | Automated Command                                             | File Exists?                        |
| ------- | ------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------- | ----------------------------------- |
| HTTP-01 | `validateTokenSet` rejects missing token                                 | unit                     | `npm run test:unit -- tests/unit/auth/token-registry.test.ts` | No — Wave 0                         |
| HTTP-01 | `validateTokenSet` rejects wrong token                                   | unit                     | same                                                          | No — Wave 0                         |
| HTTP-01 | `validateTokenSet` matches agent token → agent role                      | unit                     | same                                                          | No — Wave 0                         |
| HTTP-01 | `validateTokenSet` matches owner token → owner role                      | unit                     | same                                                          | No — Wave 0                         |
| HTTP-01 | Constant-time: accumulates across ALL tokens (no early exit)             | unit                     | same                                                          | No — Wave 0                         |
| HTTP-01 | Length-mismatched tokens do not throw (SHA-256 hash)                     | unit                     | same                                                          | No — Wave 0                         |
| HTTP-02 | `validateCLIConfig` throws on non-loopback host in HTTP mode             | unit                     | `npm run test:unit -- tests/unit/utils/cli.test.ts`           | Check existing                      |
| HTTP-02 | `validateCLIConfig` passes on `127.0.0.1`                                | unit                     | same                                                          | Check existing                      |
| HTTP-03 | `validateHostOrigin` rejects unknown Host                                | unit                     | `npm run test:unit -- tests/unit/http-server.test.ts`         | No — Wave 0                         |
| HTTP-03 | `validateHostOrigin` allows loopback hosts                               | unit                     | same                                                          | No — Wave 0                         |
| HTTP-03 | `validateHostOrigin` allows configured tailnet host                      | unit                     | same                                                          | No — Wave 0                         |
| HTTP-04 | Startup asserts auth mandatory; no unauthenticated HTTP mode             | unit (validateCLIConfig) | `npm run test:unit -- tests/unit/utils/cli.test.ts`           | Check existing                      |
| HTTP-05 | `resolveHttpIdentity` returns `roleSource: 'http-token'` for agent entry | unit                     | `npm run test:unit -- tests/unit/auth/role-resolver.test.ts`  | Partial — stub test must be updated |
| HTTP-05 | `resolveHttpIdentity` returns `roleSource: 'http-token'` for owner entry | unit                     | same                                                          | No — Wave 0                         |
| HTTP-05 | `buildTokenRegistry` with `MCP_AUTH_TOKEN` alias maps to agent role      | unit                     | `npm run test:unit -- tests/unit/auth/token-registry.test.ts` | No — Wave 0                         |
| HTTP-05 | Distinct-token startup assertion fires when agent == owner               | unit                     | `npm run test:unit -- tests/unit/utils/cli.test.ts`           | No — Wave 0                         |

### Sampling Rate

- Per task commit: `npm run test:unit`
- Per wave merge: `npm test`
- Phase gate: full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- `tests/unit/auth/token-registry.test.ts` — covers HTTP-01 constant-time compare, registry construction, D-04/D-05
- `tests/unit/http-server.test.ts` — covers HTTP-03 Host/Origin middleware (or extend existing if file exists)
- Update `tests/unit/auth/role-resolver.test.ts` — the "Phase 4 stub contract" test asserts the old zero-argument
  signature; must be updated when `resolveHttpIdentity(entry: TokenEntry)` is filled

Check whether `tests/unit/utils/cli.test.ts` exists and already covers `validateCLIConfig`; if not, add it as a Wave 0
gap.

---

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category         | Applies | Standard Control                                                                                            |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | YES     | Per-request bearer token; constant-time compare; fail-closed                                                |
| V3 Session Management | YES     | Per-session role; session cleanup interval; DELETE terminates session                                       |
| V4 Access Control     | YES     | Role derived from token; `decide()` policy unchanged; owner parity explicit                                 |
| V5 Input Validation   | YES     | Host/Origin header validation; bearer header regex; body size limit already in place                        |
| V6 Cryptography       | YES     | `crypto.timingSafeEqual` + SHA-256 (stdlib); `openssl rand -hex 32` for token generation; never roll custom |

### Known Threat Patterns

| Pattern                                         | STRIDE                 | Standard Mitigation                                                                              |
| ----------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| Timing attack on token compare                  | Information Disclosure | `timingSafeEqual` + SHA-256 hash normalization (Pattern 1)                                       |
| Token length oracle (exception leak)            | Information Disclosure | SHA-256 normalization collapses all lengths to 32 bytes                                          |
| DNS rebinding                                   | Spoofing               | Host/Origin allowlist middleware; reject (not just CORS-block)                                   |
| Funnel exposure (public internet reach)         | Elevation of Privilege | Loopback-only bind + mandatory bearer (D-17); structural — public requests still need the secret |
| Weak/blank token accepted                       | Authentication Bypass  | Startup assertion: `trim() === ''` check (D-06)                                                  |
| Agent and owner tokens equal                    | Privilege Escalation   | Startup assertion: `agentToken !== ownerToken` (D-06)                                            |
| Single-role session bleeds across HTTP sessions | Broken Access Control  | Per-session `createSession(role)` pattern; no shared `this.role` in SessionManager (D-12)        |
| Unauthenticated HTTP mode (no token set)        | Authentication Bypass  | `validateCLIConfig` throws if `agentToken` absent in HTTP mode (D-07)                            |

---

## Open Questions

1. **`MCP_AUTH_TOKEN` alias vs retire (D-11 — Claude's discretion)**
   - What we know: `MCP_AUTH_TOKEN` is read in `cli.ts:75`. Aliasing it to agent preserves backward-compat for existing
     users. Retiring it removes a potential confusion source.
   - What's unclear: Whether any external documentation, README, or integration depends on `MCP_AUTH_TOKEN` being the
     sole token var.
   - Recommendation: Alias — emit a `logger.warn` when `MCP_AUTH_TOKEN` is used without `MCP_AGENT_TOKEN`, telling users
     to migrate. Remove the alias in Phase 6 (launchd plist migration).

2. **SessionManager constructor signature after removing `authToken` param**
   - What we know: `SessionManager` constructor takes `authToken?: string` and passes it to `validateAuthToken()`. Both
     will be removed.
   - What's unclear: Whether `index.ts` or any test directly instantiates `SessionManager` with `authToken`.
   - Recommendation: Check usages with `grep -rn "new SessionManager"` before planning; the planner should include a
     task to update all call sites.

3. **`resolveHttpIdentity` signature change breaks existing test**
   - The existing unit test (`role-resolver.test.ts`, "Phase 4 stub contract") asserts the zero-argument form. When the
     stub is filled with `(entry: TokenEntry)`, that test errors on call site.
   - Recommendation: Wave 0 task must update that test as part of filling the stub.

---

## Environment Availability

| Dependency                           | Required By                | Available                    | Version            | Fallback                                         |
| ------------------------------------ | -------------------------- | ---------------------------- | ------------------ | ------------------------------------------------ |
| `node:crypto` `timingSafeEqual`      | D-04 constant-time compare | Yes                          | Node.js built-in   | None needed                                      |
| `node:crypto` `createHash`           | SHA-256 hash normalization | Yes                          | Node.js built-in   | None needed                                      |
| `@modelcontextprotocol/sdk` `1.26.0` | Transport                  | Yes                          | 1.26.0 (installed) | —                                                |
| Tailscale `serve`                    | HTTP-04 remote access      | Not verified in this session | —                  | Out of scope for Phase 4 code; documented in ADR |

---

## State of the Art

| Old Approach                              | Current Approach                                   | When Changed                     | Impact                                                   |
| ----------------------------------------- | -------------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| SDK `enableDnsRebindingProtection`        | External middleware                                | SDK 1.12+ (deprecated by 1.26.0) | Must implement in `handleRequest`, not transport options |
| Single `MCP_AUTH_TOKEN`                   | `MCP_AGENT_TOKEN` + `MCP_OWNER_TOKEN` registry     | Phase 4                          | Two-role HTTP surface                                    |
| `token === this.authToken`                | `timingSafeEqual` + SHA-256 accumulate-then-branch | Phase 4                          | Timing-safe, set-safe                                    |
| Startup-resolved role in `SessionManager` | Per-session role from bearer token                 | Phase 4                          | Concurrent multi-role sessions possible                  |

---

## Assumptions Log

| #   | Claim                                                                                            | Section                  | Risk if Wrong                                                             |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------- |
| A1  | Aliasing `MCP_AUTH_TOKEN` to `MCP_AGENT_TOKEN` is the correct D-11 path                          | Env Vars; Open Questions | Planner may choose retire instead — affects `parseCLIArgs` impl           |
| A2  | SHA-256 hash normalization is the idiomatic Node.js pattern for variable-length token comparison | Pattern 1                | Alternative (HMAC) also works; difference is negligible for this use case |

All other claims in this research are VERIFIED against current source code or the installed SDK.

---

## Sources

### Primary (HIGH confidence)

- `node_modules/@modelcontextprotocol/sdk/dist/cjs/server/webStandardStreamableHttp.d.ts` — verified
  `allowedHosts`/`allowedOrigins`/`enableDnsRebindingProtection` are `@deprecated`
- `node_modules/@modelcontextprotocol/sdk/dist/cjs/server/streamableHttp.d.ts` — verified `handleRequest` signature and
  `StreamableHTTPServerTransportOptions` alias
- `node_modules/@modelcontextprotocol/sdk/package.json` — verified version `1.26.0`
- `src/auth/role-resolver.ts` — stub shape, Phase 3 seam, `RoleSource` enum including `'http-token'`
- `src/session-manager.ts` — `createSession` signature, Phase 3 seam comments, `validateAuthToken` `===` compare
- `src/http-server.ts` — `validateAuthentication` regex, `this.authToken` single-string check, CORS `*` wildcard
- `src/utils/cli.ts` — `DEFAULT_CLI_CONFIG.host: '0.0.0.0'`, `MCP_AUTH_TOKEN` read, `validateCLIConfig` current
  assertions
- `src/contracts/roles.ts` — `Role`, `RoleSource`, `ResolvedIdentity`, `ResolvedContext` types
- `src/tools/index.ts` — `registerTools(server, cache, pending, role, context)` signature
- `src/index.ts` — `runHttpServer` receives `_identity`, `_role` (unused), confirming per-session resolution not yet
  wired
- `tests/unit/auth/role-resolver.test.ts` — "Phase 4 stub contract" test that must be updated
- Node.js `crypto.timingSafeEqual` live behavior verified: throws
  `RangeError: Input buffers must have the same byte length` on unequal-length inputs

### Secondary (MEDIUM confidence)

- `.planning/phases/04-http-edge-hardening/04-CONTEXT.md` — locked decisions D-01 through D-17
- `.planning/codebase/CONCERNS.md` — `setPendingOperationsTracker` double-call note (HTTP section)

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new packages; all stdlib and installed SDK verified against files
- Architecture: HIGH — every change point cited to current file:function; Phase 3 seams confirmed present
- Pitfalls: HIGH — timing behavior verified live; SDK deprecation verified in installed source
- Token model: HIGH — env vars and registry shape derived directly from CONTEXT locked decisions

**Research date:** 2026-06-05 **Valid until:** 2026-07-05 (SDK is stable; Node.js stdlib does not change
`timingSafeEqual` behavior)
