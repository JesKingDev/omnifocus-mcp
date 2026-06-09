# Phase 1: Role Model & Resolver — Research

**Researched:** 2026-06-03 **Domain:** TypeScript identity/role seam — env-var parse, contract types, startup ordering,
HTTP stub **Confidence:** HIGH (all findings verified directly from source files)

## Summary

This is a greenfield addition of a thin identity seam into an existing brownfield codebase. The implementation decisions
are fully locked (D-01 through D-10 in CONTEXT.md). The research task is to confirm the codebase facts those decisions
assume, resolve the four open questions (resolver call-site, launchd-label provenance, logger redaction shape, HTTP stub
seam), and produce the Validation Architecture.

The codebase is TypeScript-strict with named exports throughout, string-literal unions as the contract-type idiom,
`SCREAMING_SNAKE_CASE` env-var names matching the `OMNIFOCUS_*` prefix, and a structured redacting logger that writes to
`stderr`. All of these directly support the locked decisions. No external package is needed for this phase — the role
resolver is pure TypeScript with no dependencies beyond what already exists.

The most important finding for the planner: the resolver must run inside `runServer()` after
`assertSandboxGuardAtStartup()` and before the `cliConfig.httpMode` branch that calls either `runStdioServer` or
`runHttpServer`. This is the only point where transport mode is known and tools have not yet been registered. The
resolver produces `{ identity, role }` before either branch runs, so both transport paths receive it.

**Primary recommendation:** Implement `src/auth/role-resolver.ts` + `src/contracts/roles.ts`. Call the resolver in
`runServer()` at line ~142 of `src/index.ts`, pass resolved context into `runStdioServer` / `runHttpServer` signatures.
Add `principal` to `SENSITIVE_KEYS` in `src/utils/logger.ts`. Unit-test the parse matrix exhaustively in
`tests/unit/auth/role-resolver.test.ts`.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** OWNER is declared via an explicit role enum env var with a default-deny parse. Only the exact literal
  `owner` resolves to OWNER; unset, empty, whitespace, misspelled, or wrong-case all fall to AGENT. The fail-safe is
  structural — every non-match is least-privilege.
- **D-02:** Env var name: `OMNIFOCUS_MCP_ROLE`. Default-deny enum semantics are fixed; planner may finalize exact name
  per existing convention.
- **D-03:** Role is a bare string-literal union: `type Role = 'owner' | 'agent'`, defined as single-source-of-truth
  contract in `src/contracts/roles.ts`. Consumers `switch` with a `never` default.
- **D-04:** The role object carries no capabilities in Phase 1. Role→capability mapping is owned by Phase 2's policy
  layer.
- **D-05:** Identity step produces: `{ transport: 'stdio' | 'http'; roleSource: RoleSource; principal: string | null }`.
- **D-06:** `roleSource` is a closed provenance enum:
  `'explicit-env' | 'launchd-label' | 'fail-safe-default' | 'http-token'`. `http-token` populated in Phase 4. (Planner
  to confirm launchd provenance per open question below.)
- **D-07:** `principal` is nullable — `null` on stdio today, populated by Phase 4 HTTP per-token resolver.
- **D-08:** Identity and authorization are two distinct, separately callable steps.
- **D-08 follow-through:** Add `principal` (and any token-id field) to `SENSITIVE_KEYS` in `src/utils/logger.ts` so it
  is never logged raw.
- **D-09:** Surface resolved role via startup stderr log line only — e.g.
  `resolved role=AGENT source=fail-safe-default`. Emitted at resolve time through the existing redacting logger.
- **D-10:** Ship an HTTP resolver stub now that conforms to the same identity+role contract so Phase 4 fills in
  token→role/principal without reshaping.

### Claude's Discretion

- Exact module/file layout (e.g. `src/auth/role-resolver.ts` + `src/contracts/roles.ts`)
- Function signatures and exact resolver call site in `src/index.ts` startup ordering
- Exact log-line format/wording (must be stable enough for grep-based test)
- Whether resolver is one function returning `{ identity, role }` or two composed functions — as long as identity and
  authorization are separately inspectable (D-08)

### Deferred Ideas (OUT OF SCOPE)

- `system` `whoami` operation — queryable `{ role, identity, provenance }` over MCP. Belongs in Phase 3.
- Credential/token → role inference — belongs in Phase 4 (HTTP per-token role, HTTP-05). </user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                      | Research Support                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ROLE-01 | A connection resolves to exactly one role — OWNER or AGENT — before any tool dispatch.                           | Resolver runs in `runServer()` before `registerTools()` is called in either transport branch.    |
| ROLE-02 | A stdio connection resolves its role from explicit configuration; absent explicit config it fails safe to AGENT. | `OMNIFOCUS_MCP_ROLE` env var with default-deny parse; structural whitelist of exactly `'owner'`. |
| ROLE-03 | Identity ("who is connected") is resolved separately from authorization ("what they may do").                    | Two distinct callable steps; HTTP stub seam keeps the contract extensible for Phase 4.           |

</phase_requirements>

---

## Architectural Responsibility Map

| Capability                         | Primary Tier                           | Secondary Tier                 | Rationale                                                                                         |
| ---------------------------------- | -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| Role resolution (env-var parse)    | Startup / entry point                  | —                              | Must run before any tool dispatch; belongs at process init, not inside a tool handler             |
| Identity contract type             | Contract layer (`src/contracts/`)      | —                              | Same tier as `TagOperator`, `MutationOperation` — single source of truth for downstream consumers |
| Provenance tracking (`roleSource`) | Identity module (`src/auth/`)          | Contract layer                 | Produced by the resolver, typed in contracts                                                      |
| Startup log line (D-09)            | Startup / entry point                  | Logger (`src/utils/logger.ts`) | Emitted once at resolve time via existing structured stderr logger                                |
| HTTP resolver stub                 | HTTP layer (`src/http-server.ts` seam) | Auth module (`src/auth/`)      | Stub lives near `handleRequest` auth path; Phase 4 fills the implementation                       |
| Sensitive-key redaction            | Logger (`src/utils/logger.ts`)         | —                              | `SENSITIVE_KEYS` set in logger — the one place that enforces redaction for all log calls          |

---

## Standard Stack

### Core

No external packages are required or added by this phase.

| What                            | Where                                   | Notes                                                                                        |
| ------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| TypeScript string-literal union | `src/contracts/roles.ts` (new)          | Pattern: `type Role = 'owner' \| 'agent'` — matches `TagOperator`, `MutationOperation` idiom |
| Node.js `process.env`           | `src/auth/role-resolver.ts` (new)       | No import needed; existing parse idiom in `src/index.ts` lines 94–98                         |
| `createLogger`                  | `src/utils/logger.ts` (existing)        | Reuse for D-09 startup log line                                                              |
| `StartupTimer`                  | `src/utils/startup-timer.ts` (existing) | Already in `runServer()` startup sequence                                                    |

### No Packages to Install

This phase adds no npm dependencies. All building blocks exist in the codebase.

---

## Package Legitimacy Audit

No packages are installed in this phase.

**Packages removed due to slopcheck [SLOP] verdict:** none **Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
process.env.OMNIFOCUS_MCP_ROLE
          │
          ▼
   ┌─────────────────────────────────────────────────────────┐
   │  runServer()  [src/index.ts]                            │
   │                                                         │
   │  assertSandboxGuardAtStartup()   ← existing            │
   │  setPendingOperationsTracker()   ← existing            │
   │  new CacheManager()              ← existing            │
   │                                                         │
   │  resolveIdentity(transport, env) ← NEW ─────────────┐  │
   │    → { transport, roleSource, principal }            │  │
   │  resolveRole(identity)           ← NEW              │  │
   │    → 'owner' | 'agent'                              │  │
   │  logger.info("resolved role=...")  ← D-09           │  │
   │                                    (to stderr)      │  │
   │                                                     │  │
   │  if (cliConfig.httpMode)                            │  │
   │    runHttpServer(cacheManager, cliConfig, identity, role) │
   │  else                                               │  │
   │    runStdioServer(cacheManager, identity, role)     │  │
   └─────────────────────────────────────────────────────────┘
            │                              │
            ▼                              ▼
   ┌─────────────────┐           ┌──────────────────────────┐
   │ runStdioServer  │           │ runHttpServer             │
   │                 │           │                           │
   │ registerTools() │           │ HTTP stub resolver        │
   │  (dispatch pt)  │           │ resolveHttpIdentity()     │
   └─────────────────┘           │  → stub: transport='http' │
                                 │    roleSource='fail-safe' │
                                 │    principal=null         │
                                 │    role='agent'           │
                                 │ (Phase 4 fills this)      │
                                 └──────────────────────────┘
```

### Recommended Project Structure

```
src/
├── auth/
│   └── role-resolver.ts     # parseRole(), resolveIdentity(), resolveHttpIdentity() stub
├── contracts/
│   ├── roles.ts             # type Role, type RoleSource, type ResolvedIdentity
│   └── filters.ts           # existing — reference for pattern
└── utils/
    └── logger.ts            # add 'principal' (and 'tokenId') to SENSITIVE_KEYS
tests/
└── unit/
    └── auth/
        └── role-resolver.test.ts  # exhaustive parse matrix (Wave 0 gap)
```

### Pattern 1: Default-Deny String-Literal Parse

**What:** Parse `process.env.OMNIFOCUS_MCP_ROLE` with a structural whitelist — only the exact string `'owner'` yields
OWNER; all other values (including `undefined`, `''`, `'OWNER'`, `'Owner'`, `'agent'`, garbage) yield AGENT. This is the
same idiom used throughout `src/index.ts`.

**When to use:** Every env-var that gates a security-sensitive mode.

**Example (verified from codebase — lines 94, 96, 97, 309 of `src/index.ts`):**

```typescript
// [VERIFIED: src/index.ts lines 94-98, 309]
// Existing idioms in the codebase — exact same pattern to follow:
const isCIEnvironment = process.env.CI === 'true'; // explicit-value match
const benchmarkMode = process.env.NO_CACHE_WARMING === 'true'; // explicit-value match
const shouldAutoStart = process.env.MCP_SKIP_AUTO_START !== 'true'; // negation match

// New role parse — structural whitelist:
export function parseRole(env = process.env): Role {
  return env.OMNIFOCUS_MCP_ROLE === 'owner' ? 'owner' : 'agent';
}
```

**Source:** [VERIFIED: `src/index.ts` lines 94–98, 309]

### Pattern 2: String-Literal Union Contract Type

**What:** Export a bare `type` alias from `src/contracts/` as the single source of truth. Consumers use `switch` with a
`never` exhaustiveness guard.

**When to use:** Any closed enumeration of role/state values.

**Example (verified from codebase):**

```typescript
// [VERIFIED: src/contracts/filters.ts line 36]
// Existing pattern:
export type TagOperator = 'AND' | 'OR' | 'NOT_IN';
export type MutationOperation = 'create' | 'update' | 'complete' | 'delete' | 'batch' | 'bulk_delete';

// New role contract — same pattern:
// src/contracts/roles.ts
export type Role = 'owner' | 'agent';
export type RoleSource = 'explicit-env' | 'launchd-label' | 'fail-safe-default' | 'http-token';
export interface ResolvedIdentity {
  transport: 'stdio' | 'http';
  roleSource: RoleSource;
  principal: string | null;
}
```

**Source:** [VERIFIED: `src/contracts/filters.ts` lines 36–47, `src/contracts/mutations.ts` line 21]

### Pattern 3: Redacting Logger

**What:** `createLogger(context)` from `src/utils/logger.ts` writes structured JSON to `stderr`. Fields listed in
`SENSITIVE_KEYS` are replaced with `'[REDACTED]'` by `redactArgs()` before any log output.

**Current `SENSITIVE_KEYS`:**
`new Set(['name', 'note', 'notes', 'taskName', 'projectName', 'tagName', 'title', 'script'])` — verified at
`src/utils/logger.ts` line 42.

**D-08 follow-through:** Add `'principal'` and `'tokenId'` to this set.

**Source:** [VERIFIED: `src/utils/logger.ts` line 42]

### Anti-Patterns to Avoid

- **Using `process.env.OMNIFOCUS_MCP_ROLE?.toLowerCase() === 'owner'`:** Case-folding silently accepts `OWNER` or
  `Owner` as OWNER — violates D-01's default-deny requirement. Use only the exact-string comparison `=== 'owner'`.
- **Checking for truthy env var (`if (process.env.OMNIFOCUS_MCP_ROLE)`):** The presence of any non-empty value (e.g.,
  `'garbage'`) would resolve to OWNER. Always use the strict equality whitelist.
- **Resolving role inside `registerTools` or `BaseTool.execute`:** The role must be resolved before tool registration,
  not during dispatch.
- **Creating a `.js` file:** CLAUDE.md rule — TypeScript only; never create `.js` files in `src/`.
- **Skipping `inputSchema` override:** Not triggered this phase (no new MCP tool), but if a `whoami` op is ever added
  (Phase 3), both Zod schema and `inputSchema` must change together.

---

## Open Questions — Resolved

### OQ-1: Resolver call-site in `src/index.ts` (D-04 discretion)

**Verified from `src/index.ts`:**

The resolver must run inside `runServer()` after line 60 (`setPendingOperationsTracker`) and before line 142
(`if (cliConfig.httpMode)`). The exact insertion point is after the cache warmer completes (line 139,
`startupTimer.mark('warmEnd')`) and before the `httpMode` branch. At this point transport mode is known from `cliConfig`
(parsed at line 26) but neither `runStdioServer` nor `runHttpServer` has been called yet, so no tools have been
registered and no dispatch has occurred.

`registerTools` is called at line 175 inside `runStdioServer` and at line 115 of `src/session-manager.ts` inside
`createSession()`. Both are clearly downstream of the proposed resolver insertion point.

**Recommended call-site:**

```
line 139: startupTimer.mark('warmEnd');
          ← INSERT: resolveIdentity + resolveRole + D-09 log line
line 142: if (cliConfig.httpMode) { ...
```

**Resolved role/identity is then threaded as parameters into `runStdioServer` and `runHttpServer`** so it is available
before any `CallTool` arrives.

[VERIFIED: `src/index.ts` lines 139–147, 175; `src/session-manager.ts` line 115]

### OQ-2: launchd-label provenance (D-06)

**Recommendation:** The `launchd-label` value should be **removed from the closed `RoleSource` enum for Phase 1** and
the path should emit `'explicit-env'` instead.

**Reasoning:** The Phase 6 LaunchAgent sets `OMNIFOCUS_MCP_ROLE` in its `EnvironmentVariables` plist dict. From the
resolver's perspective this is indistinguishable from any other explicit env-var — the resolver reads
`process.env.OMNIFOCUS_MCP_ROLE` regardless of how it was injected. There is no reliable runtime signal that
distinguishes a launchd-injected env var from one set by any other means. Emitting `'launchd-label'` would require a
secondary heuristic (e.g., checking `$XPC_SERVICE_NAME` or a separate `OMNIFOCUS_LAUNCH_CONTEXT` var) that does not
exist and would add complexity for no security gain.

**Practical impact on Phase 6:** Phase 6 documents in the LaunchAgent plist that `OMNIFOCUS_MCP_ROLE=owner` should be
set in `EnvironmentVariables`. When the server starts, provenance will correctly read `explicit-env`. The audit log
truthfully records that the env var was set explicitly (which it was — in the plist). `launchd-label` as a distinct
value is more confusing than useful because there is no behavioral difference.

**Suggested `RoleSource` for Phase 1:**

```typescript
export type RoleSource = 'explicit-env' | 'fail-safe-default' | 'http-token';
// 'launchd-label' — removed; launchd path emits 'explicit-env'
// 'http-token' — reserved for Phase 4; resolver stub emits 'fail-safe-default'
```

If it is ever important to distinguish launchd from interactive shell, Phase 6 can introduce a separate
`OMNIFOCUS_LAUNCH_CONTEXT=launchd` env var and re-expand the enum then. Adding it now would lock an unverified value
into the Phase 1 contract.

[ASSUMED: Based on macOS launchd process environment mechanics and the Phase 6 plist design described in CONTEXT.md. The
reasoning is sound but the exact launchd runtime behavior has not been verified against a real plist invocation — Phase
6 should confirm.]

### OQ-3: Logger redaction — SENSITIVE_KEYS shape

**Verified from `src/utils/logger.ts` line 42:**

```typescript
const SENSITIVE_KEYS = new Set(['name', 'note', 'notes', 'taskName', 'projectName', 'tagName', 'title', 'script']);
```

`redactArgs(value)` walks the object graph (depth ≤ 6) and replaces any key in this `Set` with `'[REDACTED]'`. The
function is exported and has a unit test at `tests/unit/utils/logger.test.ts`.

**D-08 follow-through — what to add:**

- `'principal'` — holds a nullable token-id in Phase 4; redact now so Phase 4 never logs it raw
- `'tokenId'` — anticipated Phase 4 field name; add proactively

The set is a module-level constant. Adding two keys is a one-line edit:

```typescript
const SENSITIVE_KEYS = new Set([
  'name',
  'note',
  'notes',
  'taskName',
  'projectName',
  'tagName',
  'title',
  'script',
  'principal',
  'tokenId', // D-08 follow-through — Phase 1/4 identity fields
]);
```

[VERIFIED: `src/utils/logger.ts` line 42]

### OQ-4: Existing env-var parse idiom

**Verified from `src/index.ts` lines 94–98, 309:**

The established idiom is **exact string equality comparison** against the env var value:

```typescript
const isCIEnvironment = process.env.CI === 'true'; // line 94
const isTestEnvironment = process.env.NODE_ENV === 'test'; // line 95
const benchmarkMode = process.env.NO_CACHE_WARMING === 'true'; // line 96
const forceCacheWarming = process.env.ENABLE_CACHE_WARMING === 'true'; // line 97
const shouldAutoStart = process.env.MCP_SKIP_AUTO_START !== 'true'; // line 309
```

The role parse should mirror the affirmative-equality form (`=== 'owner'`) for the OWNER whitelist and default the rest:

```typescript
export function parseRole(env = process.env): Role {
  return env.OMNIFOCUS_MCP_ROLE === 'owner' ? 'owner' : 'agent';
}
```

This is the most minimal correct implementation: structurally safe because every non-`'owner'` value — including
`undefined`, `''`, `'OWNER'`, `'Owner'`, `'agent'`, `'garbage'` — resolves to `'agent'`.

[VERIFIED: `src/index.ts` lines 94–98, 309]

### OQ-5: Contract-type idiom

**Verified from `src/contracts/filters.ts` lines 36–47 and `src/contracts/mutations.ts` line 21:**

All domain contract types are exported bare string-literal unions from files inside `src/contracts/`:

```typescript
// filters.ts
export type TagOperator = 'AND' | 'OR' | 'NOT_IN';
export type TextOperator = 'CONTAINS' | 'MATCHES';

// mutations.ts
export type MutationOperation = 'create' | 'update' | 'complete' | 'delete' | 'batch' | 'bulk_delete';
export type MutationTarget = 'task' | 'project' | 'folder' | 'tag';
```

`type Role = 'owner' | 'agent'` should be defined the same way in a new `src/contracts/roles.ts` and exported from
`src/contracts/index.ts`.

[VERIFIED: `src/contracts/filters.ts`, `src/contracts/mutations.ts`]

### OQ-6: HTTP stub seam

**Verified from `src/http-server.ts` and `src/session-manager.ts`:**

The HTTP auth path today lives in `HttpServerManager.validateAuthentication()` (`src/http-server.ts` lines 181–199) and
`SessionManager.validateAuthToken()`. Authentication (bearer token check) happens at line 119–124 of `handleRequest`,
before the request is routed to `/mcp`.

The HTTP resolver stub should be a function called at the same point — after authentication passes but before the
request is handed to `SessionManager.handleRequest`. The stub's signature matches the locked contract (D-05–D-07) and
returns `{ transport: 'http', roleSource: 'fail-safe-default', principal: null }` with `role: 'agent'`. Phase 4 replaces
the body of this function with token→role lookup.

**Plug-in point:** Inside `HttpServerManager.handleRequest()` or as a method on `HttpServerManager` itself, called after
`validateAuthentication` passes. The resolved identity/role is passed into `SessionManager.createSession()` or stored on
the session config so `registerTools` can receive it.

The current `SessionManager.createSession()` at `src/session-manager.ts` lines 80–133 calls
`registerTools(server, cacheManager, pendingOperations)` — this signature needs an extra parameter when Phase 3 wires
role into tool advertisement. For Phase 1, the stub only needs to exist and return the correct contract shape; no change
to `registerTools` is needed yet.

[VERIFIED: `src/http-server.ts` lines 100–199; `src/session-manager.ts` lines 80–133]

---

## Don't Hand-Roll

| Problem                                                            | Don't Build         | Use Instead                                      | Why                                                                  |
| ------------------------------------------------------------------ | ------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| Constant-time string comparison (bearer token validation, Phase 4) | Custom `===` loop   | `node:crypto` `timingSafeEqual`                  | Timing attacks are real; `===` short-circuits on first mismatch      |
| Sensitive field redaction                                          | New redaction logic | Extend `SENSITIVE_KEYS` in `src/utils/logger.ts` | Already handles deep object walks, recursion limits, array traversal |
| Exhaustiveness check on `Role`                                     | Runtime `if` chains | TypeScript `switch` with `never` default         | Compile-time proof; catches missed cases when enum grows             |

**Key insight:** The codebase already has the redacting logger, the contract-type idiom, and the env-var parse pattern.
The role resolver is wiring these together — not building new infrastructure.

---

## Common Pitfalls

### Pitfall 1: Fail-Open Default

**What goes wrong:** The `parseRole` function has a default case that resolves to OWNER — e.g., if a refactor
accidentally returns `'owner'` on `undefined` input instead of `'agent'`. **Why it happens:** Inattention to the
semantics of the ternary; a swapped comparison like `env.OMNIFOCUS_MCP_ROLE !== 'owner' ? 'owner' : 'agent'` passes most
tests but is inverted. **How to avoid:** The parse matrix unit test must include the `undefined`/unset case as the first
and highest-priority assertion. The structural whitelist (`=== 'owner'` → OWNER, everything else → AGENT) makes this
impossible by construction — but the test must verify it explicitly. **Warning signs:** Any parse path that returns
`'owner'` without an explicit `=== 'owner'` comparison.

### Pitfall 2: Resolver Placement After registerTools

**What goes wrong:** Role is resolved inside a tool handler or after `registerTools()` is called, so the first
`CallTool` can arrive before role is resolved. **Why it happens:** Placing resolver logic inside `BaseTool.execute` or
inside `registerTools`. **How to avoid:** Resolver runs in `runServer()` at line ~140 of `src/index.ts`, before either
`runStdioServer` or `runHttpServer` is called. `registerTools` is called inside both functions, never before. **Warning
signs:** Any resolver call inside `src/tools/`.

### Pitfall 3: Mutable SENSITIVE_KEYS

**What goes wrong:** Adding keys to `SENSITIVE_KEYS` after the logger module has been loaded has no effect — the `Set`
is captured by `redactArgs` at module load time. **Why it happens:** Trying to extend the set from a different module at
runtime. **How to avoid:** Edit `SENSITIVE_KEYS` directly in `src/utils/logger.ts`. The set is a module-level constant;
changes take effect at the next import. **Warning signs:** Any code that calls `SENSITIVE_KEYS.add()` outside
`src/utils/logger.ts`.

### Pitfall 4: Wrong `roleSource` for launchd path

**What goes wrong:** Using `'launchd-label'` in the enum causes Phase 6 to emit a value that no actual code path
produces (since `process.env` does not distinguish injection sources). **Why it happens:** Optimistic assumption that
launchd provides a detectable signal. **How to avoid:** Use `'explicit-env'` for the launchd path. Remove
`'launchd-label'` from the enum in Phase 1. If Phase 6 discovers a reliable detection mechanism, the enum can be
expanded then. **Warning signs:** Any code that tries to detect `XPC_SERVICE_NAME` or similar to set
`roleSource = 'launchd-label'`.

---

## Code Examples

### The Complete Role Resolver Module

```typescript
// src/auth/role-resolver.ts
// [VERIFIED: pattern matches src/index.ts lines 94-98 env-var idiom]
import type { Role, RoleSource, ResolvedIdentity } from '../contracts/roles.js';

/**
 * Parses OMNIFOCUS_MCP_ROLE with default-deny semantics.
 * Only the exact literal 'owner' resolves to OWNER; every other value
 * (undefined, '', 'OWNER', 'agent', garbage) resolves to AGENT.
 */
export function parseRole(env: NodeJS.ProcessEnv = process.env): Role {
  return env.OMNIFOCUS_MCP_ROLE === 'owner' ? 'owner' : 'agent';
}

/**
 * Resolves identity for a stdio connection.
 * Role is derived from the env var; principal is always null for stdio.
 */
export function resolveStdioIdentity(env: NodeJS.ProcessEnv = process.env): ResolvedIdentity {
  const isExplicit = env.OMNIFOCUS_MCP_ROLE !== undefined && env.OMNIFOCUS_MCP_ROLE !== '';
  const roleSource: RoleSource = isExplicit ? 'explicit-env' : 'fail-safe-default';
  return {
    transport: 'stdio',
    roleSource,
    principal: null,
  };
}

/**
 * HTTP resolver stub — Phase 4 fills this.
 * Always returns fail-safe-default / AGENT / null principal until
 * Phase 4 implements token→role/principal lookup.
 */
export function resolveHttpIdentity(): ResolvedIdentity {
  return {
    transport: 'http',
    roleSource: 'fail-safe-default',
    principal: null,
  };
}
```

### Role Contract Types

```typescript
// src/contracts/roles.ts
// [VERIFIED: pattern matches src/contracts/filters.ts lines 36-47]
export type Role = 'owner' | 'agent';
export type RoleSource = 'explicit-env' | 'fail-safe-default' | 'http-token';

export interface ResolvedIdentity {
  transport: 'stdio' | 'http';
  roleSource: RoleSource;
  principal: string | null;
}

export interface ResolvedContext {
  identity: ResolvedIdentity;
  role: Role;
}
```

### D-09 Startup Log Line

```typescript
// Inside runServer() in src/index.ts, after resolve calls
// [VERIFIED: logger writes to stderr via src/utils/logger.ts line 124]
const identity = resolveStdioIdentity();
const role = parseRole();
logger.info(`resolved role=${role.toUpperCase()} source=${identity.roleSource}`);
// Example output to stderr:
// [2026-06-03T...] [INFO] [server] resolved role=AGENT source=fail-safe-default
// [2026-06-03T...] [INFO] [server] resolved role=OWNER source=explicit-env
```

### Exhaustiveness Guard (Consumer Pattern)

```typescript
// [VERIFIED: TypeScript strict mode enforced — noImplicitReturns, strict]
import type { Role } from '../contracts/roles.js';

function assertNever(x: never): never {
  throw new Error(`Unhandled role: ${x as string}`);
}

export function describeRole(role: Role): string {
  switch (role) {
    case 'owner':
      return 'Full owner surface';
    case 'agent':
      return 'Least-privilege agent surface';
    default:
      return assertNever(role);
  }
}
```

### SENSITIVE_KEYS Extension

```typescript
// src/utils/logger.ts — edit existing line 42
// [VERIFIED: src/utils/logger.ts line 42]
const SENSITIVE_KEYS = new Set([
  'name',
  'note',
  'notes',
  'taskName',
  'projectName',
  'tagName',
  'title',
  'script',
  'principal',
  'tokenId', // D-08 follow-through: identity fields never logged raw
]);
```

---

## State of the Art

| Old Approach                     | Current Approach                    | When Changed | Impact                                                          |
| -------------------------------- | ----------------------------------- | ------------ | --------------------------------------------------------------- |
| No role concept                  | OWNER/AGENT with default-deny parse | This phase   | All downstream phases can key off `role` without re-reading env |
| Static bearer token for all HTTP | Per-token role in Phase 4           | Phase 4      | Phase 1 stub is the seam                                        |
| No provenance tracking           | `roleSource` on `ResolvedIdentity`  | This phase   | Audit-friendly; can distinguish explicit config from fail-safe  |

---

## Assumptions Log

| #   | Claim                                                                                                                                            | Section                         | Risk if Wrong                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | The Phase 6 LaunchAgent sets `OMNIFOCUS_MCP_ROLE` in `EnvironmentVariables` plist dict, making it indistinguishable from explicit env at runtime | OQ-2 (launchd-label provenance) | If Phase 6 uses a different signal, `'launchd-label'` may need to be added back to `RoleSource`; low risk since enum can be expanded                   |
| A2  | `'tokenId'` is the anticipated Phase 4 field name for a per-token identifier                                                                     | SENSITIVE_KEYS extension        | If Phase 4 uses a different field name (e.g., `'tokenRef'`), that field would not be redacted automatically; medium risk — resolve at Phase 4 planning |

**If this table is empty for your path:** All other claims were verified directly from source files.

---

## Open Questions

1. **`tokenId` field name for Phase 4**
   - What we know: Phase 4 will add per-token role derivation with a token identifier in `principal` or a separate
     field.
   - What's unclear: Whether the field will be called `tokenId`, `tokenRef`, or stored only in `principal`.
   - Recommendation: Add `'tokenId'` to `SENSITIVE_KEYS` now as a proactive hedge; Phase 4 research will confirm or
     extend.

---

## Environment Availability

This phase has no external dependencies beyond the existing codebase. Step 2.6: SKIPPED (no external dependencies
identified).

---

## Validation Architecture

> Nyquist validation is ENABLED for this phase.

### Test Framework

| Property           | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| Framework          | Vitest (verified in `vitest.config.ts` and `package.json`) |
| Config file        | `vitest.config.ts` (project root)                          |
| Quick run command  | `npm run test:unit`                                        |
| Full suite command | `npm run test:unit && npm run test:integration`            |

### Phase Requirements → Test Map

| Req ID                      | Behavior                                                                                                                          | Test Type                                                                     | Automated Command                                                               | File Exists?                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------- |
| ROLE-01                     | Role is resolved before `registerTools` is called                                                                                 | Unit — verify resolver is called before tool registration in startup sequence | `npm run test:unit -- --reporter=verbose tests/unit/auth/role-resolver.test.ts` | ❌ Wave 0                   |
| ROLE-02 (set)               | `OMNIFOCUS_MCP_ROLE=owner` → `role='owner'`, `roleSource='explicit-env'`                                                          | Unit — parse matrix                                                           | Same file                                                                       | ❌ Wave 0                   |
| ROLE-02 (unset)             | `OMNIFOCUS_MCP_ROLE` unset → `role='agent'`, `roleSource='fail-safe-default'`                                                     | Unit — parse matrix                                                           | Same file                                                                       | ❌ Wave 0                   |
| ROLE-02 (empty)             | `OMNIFOCUS_MCP_ROLE=''` → `role='agent'`                                                                                          | Unit — parse matrix                                                           | Same file                                                                       | ❌ Wave 0                   |
| ROLE-02 (whitespace)        | `OMNIFOCUS_MCP_ROLE='  '` → `role='agent'`                                                                                        | Unit — parse matrix                                                           | Same file                                                                       | ❌ Wave 0                   |
| ROLE-02 (wrong-case)        | `OMNIFOCUS_MCP_ROLE=OWNER` → `role='agent'`                                                                                       | Unit — parse matrix                                                           | Same file                                                                       | ❌ Wave 0                   |
| ROLE-02 (wrong-case 2)      | `OMNIFOCUS_MCP_ROLE=Owner` → `role='agent'`                                                                                       | Unit — parse matrix                                                           | Same file                                                                       | ❌ Wave 0                   |
| ROLE-02 (typo)              | `OMNIFOCUS_MCP_ROLE=ownerr` → `role='agent'`                                                                                      | Unit — parse matrix                                                           | Same file                                                                       | ❌ Wave 0                   |
| ROLE-02 (agent explicit)    | `OMNIFOCUS_MCP_ROLE=agent` → `role='agent'`                                                                                       | Unit — parse matrix                                                           | Same file                                                                       | ❌ Wave 0                   |
| ROLE-02 (garbage)           | `OMNIFOCUS_MCP_ROLE=garbage123` → `role='agent'`                                                                                  | Unit — parse matrix                                                           | Same file                                                                       | ❌ Wave 0                   |
| ROLE-03 (identity separate) | `resolveStdioIdentity()` returns `ResolvedIdentity`; `parseRole()` returns `Role`; both independently callable                    | Unit — function signatures and return types                                   | Same file                                                                       | ❌ Wave 0                   |
| ROLE-03 (HTTP stub)         | `resolveHttpIdentity()` returns correct contract shape — `transport='http'`, `roleSource='fail-safe-default'`, `principal=null`   | Unit — contract conformance                                                   | Same file                                                                       | ❌ Wave 0                   |
| D-09 (log line)             | Startup emits a grep-stable log line: `resolved role=AGENT source=fail-safe-default` or `resolved role=OWNER source=explicit-env` | Unit — log line format (spy on `logger.info`)                                 | `npm run test:unit -- tests/unit/auth/role-resolver.test.ts`                    | ❌ Wave 0                   |
| D-08 (redaction)            | `principal` field in any logged object appears as `[REDACTED]`                                                                    | Unit — extend existing `tests/unit/utils/logger.test.ts`                      | `npm run test:unit -- tests/unit/utils/logger.test.ts`                          | ✅ exists (needs extension) |

### Parse Input Classes — Exhaustive Enumeration

The `parseRole` function must be tested against all of these input classes before the phase is considered complete. No
subset is sufficient — a fail-safe parse must prove correctness against every non-`'owner'` case:

| Input class                 | Value          | Expected `role` |
| --------------------------- | -------------- | --------------- |
| Exact match                 | `'owner'`      | `'owner'`       |
| Wrong case — all caps       | `'OWNER'`      | `'agent'`       |
| Wrong case — title          | `'Owner'`      | `'agent'`       |
| Wrong case — mixed          | `'owNer'`      | `'agent'`       |
| Explicit agent              | `'agent'`      | `'agent'`       |
| Explicit agent — all caps   | `'AGENT'`      | `'agent'`       |
| Empty string                | `''`           | `'agent'`       |
| Whitespace only             | `'   '`        | `'agent'`       |
| Leading/trailing whitespace | `' owner '`    | `'agent'`       |
| Typo                        | `'ownerr'`     | `'agent'`       |
| Typo                        | `'ownr'`       | `'agent'`       |
| Garbage string              | `'garbage123'` | `'agent'`       |
| Numeric string              | `'1'`          | `'agent'`       |
| Unset (undefined)           | `undefined`    | `'agent'`       |

**Coverage requirement:** All 14 classes must be explicitly asserted. This is the "structural fail-safe" that D-01
describes — no shortcut with `expect(result).toBe('agent')` for a slice; each input class must be its own `it()` or row
in a parameterized test.

### Sampling Rate

- **Per task commit:** `npm run test:unit` (fast, ~30 s)
- **Per wave merge:** `npm run test:unit && npm run test:integration`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/auth/role-resolver.test.ts` — covers all 14 parse input classes (ROLE-02), identity/authz separation
      (ROLE-03), HTTP stub contract shape (ROLE-03), D-09 log line format
- [ ] `src/auth/role-resolver.ts` — the module under test
- [ ] `src/contracts/roles.ts` — contract types; no test file needed (pure types)

Extension to existing file:

- [ ] `tests/unit/utils/logger.test.ts` — add assertions for `principal` and `tokenId` redaction (D-08 follow-through)

_(Test infra and Vitest config are already in place — no framework install needed.)_

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies                                | Standard Control                                                      |
| --------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| V2 Authentication     | Partial — identity only, not full auth | Env-var parse with default-deny; no credentials in Phase 1            |
| V3 Session Management | No                                     | Sessions are Phase 4 (HTTP)                                           |
| V4 Access Control     | Yes — role assignment                  | Default-deny parse; AGENT is least privilege                          |
| V5 Input Validation   | Yes                                    | Whitelist-only parse; `process.env` is trusted but validated          |
| V6 Cryptography       | No                                     | No crypto in Phase 1; Phase 4 adds `timingSafeEqual` for bearer token |

### Known Threat Patterns for this Phase

| Pattern                                                                            | STRIDE                 | Standard Mitigation                                                                                                                              |
| ---------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fail-open default (mis-set parse returns OWNER on non-match)                       | Elevation of privilege | Structural whitelist — only `=== 'owner'` returns OWNER; verified by exhaustive parse matrix test                                                |
| Identity/authz conflation (role determines both "who" and "what" from one call)    | Information disclosure | Two separate callable functions per D-08; confirmed by ROLE-03 test                                                                              |
| `principal` logged raw (Phase 4 token-id leaks into log files)                     | Information disclosure | `'principal'` and `'tokenId'` added to `SENSITIVE_KEYS` in Phase 1 before Phase 4 populates the field                                            |
| launchd env-var injection (plist sets OWNER; compromised plist → OWNER escalation) | Elevation of privilege | The plist itself is the authorization artifact; no more protected than the binary it launches. Documented threat, not mitigated by the resolver. |

**Threat to highlight for planner's `<threat_model>` block:** The dominant Phase 1 threat is **fail-open by
mis-implementation**: any parse logic that does not structurally default to AGENT (e.g., returning the env var value
with `|| 'owner'` fallback, or case-insensitive matching) would make the system grant OWNER role on misconfiguration.
The mitigation is structural — the whitelist is a single exact-match comparison — and the exhaustive unit test matrix is
the verification gate. Without that test, the fail-safe is trust-based, not evidence-based.

---

## Sources

### Primary (HIGH confidence)

- `src/index.ts` — verified `runServer()` startup ordering, env-var parse idioms, `runStdioServer`/`runHttpServer` call
  sites, `registerTools` placement
- `src/utils/logger.ts` — verified `SENSITIVE_KEYS` set shape (line 42), `redactArgs` function, `stderr` output path
- `src/contracts/filters.ts` — verified `TagOperator` string-literal union pattern (lines 36–47)
- `src/contracts/mutations.ts` — verified `MutationOperation`, `MutationTarget` string-literal union pattern (line 21)
- `src/http-server.ts` — verified `validateAuthentication` and `handleRequest` structure for HTTP stub seam
- `src/session-manager.ts` — verified `createSession` calling `registerTools` (lines 80–133)
- `src/utils/sandbox-guard.ts` — verified assertion pattern used as template for fail-fast startup guards
- `tests/unit/utils/sandbox-guard.test.ts` — verified test structure for exhaustive env-var input-class testing
- `vitest.config.ts` — verified test framework, run commands, and timeouts

### Secondary (MEDIUM confidence — reasoning from verified facts)

- launchd-label provenance recommendation (OQ-2) — derived from verified macOS env-var mechanics; specific plist
  behavior not directly executed in this session

### Tertiary (LOW confidence)

- None — all claims are grounded in verified source files or explicit assumptions logged above

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no external packages; all patterns verified from source
- Architecture: HIGH — resolver call-site and HTTP stub seam verified from source
- Pitfalls: HIGH — derived from existing patterns and verified source structure
- Validation architecture: HIGH — test framework and idioms verified from source

**Research date:** 2026-06-03 **Valid until:** 2026-12-03 (stable codebase; re-verify if `src/index.ts` startup sequence
changes)
