# Architecture Research

**Domain:** Host-resident MCP server — role-gated agent access, HTTP auth, write-verification on a JXA/OmniJS bridge
**Researched:** 2026-06-03
**Confidence:** HIGH (verified against the live codebase + current MCP SDK behavior; one MEDIUM area flagged inline)

## Scope

This is a hardening milestone on an existing fork (`kip-d/omnifocus-mcp`). The fork already ships stdio + Streamable HTTP transports, a four-tool unified surface (`omnifocus_read`/`omnifocus_write`/`omnifocus_analyze`/`system`), Zod validation, a sandbox guard, and the JXA→OmniJS execution stack. This document covers **how to layer three new concerns on top without redesigning the bridge**:

1. Role-based tool/operation gating (least-privilege "agent" vs full "owner")
2. HTTP auth middleware placement for the SDK's Streamable HTTP transport
3. Post-mutation write-verification (read-back/confirm) wrapping every write

The recurring design constraint: **enforcement must live where it cannot be bypassed by an alternate code path.** OMN-119 was a sandbox-guard bypass on the batch-create path — the single-create path was guarded, the batch path was not. Every layer below is designed so the agent role, the deny-deletes rule, and write-verification each have exactly one choke point that all paths funnel through.

## Standard Architecture

### System Overview

The new layers slot into the existing request pipeline at three distinct choke points (marked ★). Nothing below the AST layer changes.

```
┌──────────────────────────────────────────────────────────────────────┐
│  MCP Client: localhost agent (stdio)  |  Jess's devices (HTTP/Tailscale)│
└───────────────┬───────────────────────────────────┬───────────────────┘
                │ stdio                               │ Streamable HTTP
                ▼                                     ▼
┌───────────────────────────┐   ┌────────────────────────────────────────┐
│   StdioServerTransport     │   │  HttpServerManager  (src/http-server.ts)│
│   role bound at startup    │   │  ★1a edge auth: token + host/origin     │
│   (env / launchd → OWNER   │   │      check BEFORE transport.handleReq   │
│    or AGENT)               │   │  SessionManager → per-session Server    │
└───────────────┬───────────┘   └───────────────┬────────────────────────┘
                │                                 │  authInfo.scopes → role
                └────────────────┬────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│              MCP Server (registerTools / registerPrompts)             │
│  ★1b RoleGate: filters ListTools + rejects CallTool per role          │
│      (single dispatch point in src/tools/index.ts)                    │
└───────────────┬──────────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Unified Tool Layer (BaseTool)                   │
│  Zod validate → compiler → script builder                            │
│  ★2 OperationPolicy: deny destructive ops for AGENT, applied in the  │
│     MutationCompiler — covers single AND batch (the OMN-119 lesson)  │
└───────────────┬──────────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│              AST / Script Builder  (src/contracts/ast/)              │
│  mutation-script-builder.ts  ← deny-deletes ALSO hard-asserted here  │
│  ★2b defense-in-depth: builder refuses to emit a delete op when      │
│      role=AGENT, even if a caller bypassed the compiler              │
└───────────────┬──────────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│         OmniAutomation  (spawn osascript -l JavaScript)             │
│  ★3 WriteVerifier wraps execute() for mutations:                     │
│     mutate → read-back the same record → assert persisted →         │
│     surface verified|unverified to caller                            │
└───────────────┬──────────────────────────────────────────────────────┘
                ▼
                JXA outer → app.evaluateJavascript(OmniJS) → OmniFocus.app
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Edge auth (★1a) | Reject unauthenticated/cross-origin HTTP **before** any MCP parsing; bind to the right interface | Token check + SDK `enableDnsRebindingProtection`/`allowedHosts`; runs in `HttpServerManager.handleRequest` ahead of `transport.handleRequest` |
| Role resolver | Map a connection to OWNER or AGENT | stdio: env/launchd label fixed at process start. HTTP: derive from `authInfo.scopes` (per-token), one role per token |
| RoleGate (★1b) | Filter advertised tools and reject disallowed `CallTool` requests | Allow-list keyed by role, applied in the single `ListTools`/`CallTool` dispatch in `src/tools/index.ts` |
| OperationPolicy (★2) | Deny destructive operations (hard delete) for AGENT across every write path | Predicate checked in `MutationCompiler` so single-op and batch-op share it |
| Builder assertion (★2b) | Refuse to emit a delete script under AGENT role | `assert` in `mutation-script-builder.ts`, mirroring the sandbox-guard pattern |
| WriteVerifier (★3) | Read back each mutated record and confirm the field actually persisted | Wrapper around mutation execution that issues a targeted follow-up read and compares |

## Recommended Project Structure

New code is additive. No existing file moves; new modules are small and single-purpose.

```
src/
├── auth/                          # NEW — connection identity & roles
│   ├── role.ts                    # Role enum (OWNER | AGENT), RoleContext type
│   ├── role-resolver.ts           # stdio env/launchd + HTTP authInfo.scopes → Role
│   └── token-store.ts             # token → { role, scopes } map (env/file-backed)
├── policy/                        # NEW — what each role may do
│   ├── tool-acl.ts                # role → allowed tool names (RoleGate source)
│   ├── operation-policy.ts        # role → allowed write operations (deny delete)
│   └── policy.test-vectors.ts     # shared allow/deny table for unit + integration
├── verification/                  # NEW — write-verification
│   ├── write-verifier.ts          # wrap(mutation) → { ...result, verification }
│   └── readback-builders.ts       # minimal targeted read scripts per record type
├── http-server.ts                 # EDIT — call edge auth + host/origin guard first
├── session-manager.ts             # EDIT — attach RoleContext to each session Server
├── tools/
│   └── index.ts                   # EDIT — RoleGate in ListTools + CallTool dispatch
├── tools/unified/compilers/
│   └── MutationCompiler.ts        # EDIT — consult OperationPolicy (single + batch)
└── contracts/ast/
    └── mutation-script-builder.ts # EDIT — defense-in-depth delete assertion
```

### Structure Rationale

- **`auth/` separate from `policy/`:** identity ("who is this") is a different axis from authorization ("what may they do"). Keeping them apart lets the token store evolve (static token → OAuth later, per ADR 004) without touching the ACL tables.
- **`policy/` holds plain data tables, not logic:** the allow/deny decision should be a lookup, auditable at a glance, with one shared test-vector table feeding both unit and integration tests. This is the direct countermeasure to OMN-119 — a divergent second path can't silently skip a table that every path reads.
- **`verification/` wraps execution rather than living inside scripts:** the read-back must be a *separate* OmniFocus round-trip. Verifying inside the same script that did the write would trust the same context that may have silently no-op'd (the known `reviewInterval`/`plannedDate` swallow-the-error failures in CONCERNS).

## Architectural Patterns

### Pattern 1: Two-axis authorization (identity × operation), single choke point per axis

**What:** Separate "which connection/role" (resolved once) from "which operation is allowed" (checked at dispatch and at compile). Each axis has exactly one enforcement point that all paths pass through.

**When to use:** Any time a restricted principal shares a tool surface with a privileged one — here, the agent and the owner both speak to the same four tools.

**Trade-offs:** Two checks instead of one (RoleGate at the tool boundary, OperationPolicy at the compiler) is mild redundancy. That redundancy is deliberate defense-in-depth: ★1b stops a disallowed *tool*, ★2 stops a disallowed *operation within an allowed tool* (e.g. AGENT may call `omnifocus_write` for `complete` but not `delete`).

**Example:**
```typescript
// src/policy/operation-policy.ts — data, not control flow
const DENY: Record<Role, ReadonlySet<WriteOperation>> = {
  OWNER: new Set(),
  AGENT: new Set(['delete', 'deleteProject', 'purge']), // complete/drop allowed
};

// MutationCompiler.compile() — the ONE place every write (single + batch) funnels through
for (const op of operations) {                 // batch = N ops; single = 1 op
  if (DENY[ctx.role].has(op.operation)) {
    throw new McpError(ErrorCode.InvalidRequest,
      `Operation '${op.operation}' is not permitted for role ${ctx.role}`);
  }
}
```

### Pattern 2: Edge auth before transport, in-handler scope enforcement

**What:** Reject the request at the HTTP edge (token + host/origin) *before* `StreamableHTTPServerTransport.handleRequest` ever sees it. Then, because the authorization server cannot know which tool a client is about to call, enforce role/scope a second time inside the MCP dispatch.

**When to use:** The current `HttpServerManager` already checks the bearer token before routing to `/mcp` — keep that. Add the SDK's DNS-rebinding protection and pass the resolved role down to the session's `Server`.

**Trade-offs:** Edge auth is coarse (authenticated yes/no); it cannot express per-tool rules, which is exactly why the in-handler RoleGate exists. The MCP SDK surfaces `authInfo` (and its `scopes`) to every tool handler via the handler's `extra` argument, so per-tool enforcement has the data it needs without re-parsing headers. *Confirmed against current SDK behavior — `authInfo.scopes` is available in tool handlers and scope enforcement is documented as a server-side responsibility.*

**Example:**
```typescript
// HttpServerManager.handleRequest — order matters
if (req.method === 'OPTIONS') return this.handleOptions(req, res);
if (!this.checkHostAndOrigin(req)) return res.writeHead(403).end();   // DNS-rebind guard
if (this.authToken && !this.validateAuthentication(req)) return res.writeHead(401).end();
// only now hand off to the MCP transport

// StreamableHTTPServerTransport construction (session-manager.ts)
new StreamableHTTPServerTransport({
  sessionIdGenerator: () => sessionId,
  enableDnsRebindingProtection: true,
  allowedHosts: ['127.0.0.1', 'localhost', /* tailnet name */],
});
```

### Pattern 3: Read-back write-verification as an execution wrapper

**What:** Every mutation runs as `mutate → targeted read-back → compare → annotate`. The verifier sits in/around `OmniAutomation` so it wraps the actual osascript round-trip, and it issues a **second, independent** query for just the affected record(s).

**When to use:** Every agent write. This is the milestone's core-value guarantee — "no silent write failures." It directly defends the documented swallow-the-error gaps (`reviewInterval` null no-op, `plannedDate` JXA persistence ambiguity).

**Trade-offs:** Doubles the OmniFocus round-trips for writes (each round-trip is ~6–8s on a 2000-task DB). Mitigations: verify only the fields that were actually written (not a full re-fetch); use `countOnly`/by-identifier reads which are far cheaper than filtered scans; make verification depth configurable (strict for agent, optional for owner bulk ops). The cost is acceptable because agent writes are low-volume capture events, not bulk imports.

**Example:**
```typescript
// verification/write-verifier.ts
async function verifyWrite(result, expected): Promise<VerifiedResult> {
  if (!result.success) return { ...result, verification: 'skipped' };
  const actual = await readBackById(result.data.id, Object.keys(expected.fields));
  const mismatches = diffFields(expected.fields, actual);
  return mismatches.length === 0
    ? { ...result, verification: 'verified' }
    : { ...result, verification: 'unverified', mismatches }; // surfaced, not thrown-away
}
```
Surface the verification status in `StandardResponseV2.metadata` so the agent (and JessOS) can see `verified` vs `unverified` rather than a bare `success: true`.

## Data Flow

### Agent write request flow (the protected path)

```
agent → omnifocus_write { delete }            agent → omnifocus_write { create }
        ↓                                              ↓
  edge auth (HTTP) ✓                            edge auth ✓
        ↓                                              ↓
  RoleGate: tool allowed? ✓ (write is allowed)  RoleGate ✓
        ↓                                              ↓
  MutationCompiler + OperationPolicy            MutationCompiler ✓
        ↓                                              ↓
  DENY[AGENT].has('delete') → REJECT 4xx        script-builder → osascript
   (no script ever built; batch path same)             ↓
                                                 WriteVerifier: read-back create
                                                        ↓
                                                 verified → response.metadata.verification
```

### Role resolution flow

1. **stdio (default, on-Mac agent):** role fixed at process start from launchd label / env var. No per-request resolution; the whole process is one role.
2. **HTTP (Tailscale, owner devices):** token → `token-store` → `{ role, scopes }`; the role is attached to the session's `Server` once at `createSession`, then read by RoleGate and OperationPolicy on each call via the handler `extra.authInfo`.

### Key Data Flows

1. **Tool advertisement is role-aware:** `ListTools` returns only the tools the connection's role may call, so a restricted agent never even sees `delete`-capable surfaces it isn't allowed to drive. Enforcement still repeats at `CallTool` (a client can call an unadvertised tool).
2. **Verification status rides the response envelope:** write results carry `verification: verified | unverified | skipped` in metadata, giving JessOS a machine-readable trust signal instead of inferring success from absence of error.

## Suggested Build Order

Dependencies run strictly bottom-up; each layer is independently testable and shippable.

| Order | Layer | Depends on | Why this order |
|-------|-------|-----------|----------------|
| 1 | **Role model + resolver** (`auth/`) | nothing | Everything else keys off a `Role`. Build the type, the stdio env/launchd path, and a stub HTTP resolver first. Pure unit-testable. |
| 2 | **OperationPolicy + builder assertion** (★2/★2b) | role model | The highest-value, lowest-surface guarantee (deny-deletes). Lands the OMN-119 countermeasure early: one policy table consumed by the compiler, asserted again in the builder. Testable without any HTTP. |
| 3 | **RoleGate** (★1b) | role model, policy | Wires role into the single `ListTools`/`CallTool` dispatch. Now the agent role is fully enforced over stdio — shippable on its own. |
| 4 | **HTTP edge auth hardening** (★1a) | role resolver | Add DNS-rebind protection + host/origin guard + per-token role to the existing token check. Brings the HTTP/Tailscale path up to the stdio path's guarantees. |
| 5 | **WriteVerifier** (★3) | nothing structural; benefits from role | Independent of the auth/policy stack — could even go first — but sequenced here so the protected role exists before we promise verified writes end-to-end. Highest runtime cost, so build last and tune. |

Rationale for ordering: deny-deletes (steps 2–3) is the irreversible-damage guard and must land before the agent role is exposed at all. HTTP hardening (step 4) only matters once a remote path is opened. Write-verification (step 5) is the reliability promise layered on top of an already-safe surface. Steps 1–3 ship a fully usable least-privilege stdio agent before any HTTP work begins.

## Scaling Considerations

This is a single-user, single-host server; "scale" means request volume and database size, not users.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Normal agent use (capture events, low volume) | Verify every write fully; the doubled round-trip is invisible at this volume |
| Bulk operations (owner batch imports) | Make verification depth configurable; verify by sampling or by post-batch count reconciliation rather than per-record read-back |
| Large DB (2000+ tasks) | Read-back must be by-identifier / `countOnly`, never a filtered `flattenedTasks` scan (which costs 6–8s and risks the `.whose()` footgun) |

### Scaling Priorities

1. **First bottleneck — verification round-trips on batch writes.** Fix by scoping read-back to written fields and using identifier lookups; offer a batch-level reconciliation mode.
2. **Second bottleneck — none structural.** Role/policy checks are in-memory table lookups with negligible cost.

## Anti-Patterns

### Anti-Pattern 1: Enforcing the agent role only in the HTTP transport

**What people do:** Put the deny-deletes / role check in `HttpServerManager` because that's where auth already lives.
**Why it's wrong:** The default and primary transport is stdio. A check that lives only in the HTTP path leaves the on-Mac agent unguarded — and is the same shape of mistake as OMN-119 (one path guarded, another not).
**Do this instead:** Enforce at transport-agnostic choke points (RoleGate in tool dispatch, OperationPolicy in the compiler). Transports only resolve *identity*; they never decide *authorization*.

### Anti-Pattern 2: Guarding the single-operation path and forgetting batch

**What people do:** Add the deny check where single-task delete is built, assuming batch reuses it.
**Why it's wrong:** This is literally OMN-119. Batch create/delete went through a parallel builder path that skipped the guard.
**Do this instead:** Put the policy check at the point where single and batch operations have already been normalized into the same list of operations (the compiler), so one loop covers both. Add a test vector that exercises a delete inside a batch payload, not just a standalone delete.

### Anti-Pattern 3: Verifying a write inside the same script that performed it

**What people do:** Append a read of the just-set property to the end of the mutation script and trust its return.
**Why it's wrong:** The documented failures (`reviewInterval` returns `null` and silently no-ops; `plannedDate` JXA-vs-OmniJS persistence ambiguity) happen *within* that same execution context. An in-script read can report the in-memory value that never committed to the database.
**Do this instead:** Issue an independent follow-up query (separate osascript round-trip) that re-reads the record by identifier and compares against the intended values.

### Anti-Pattern 4: Treating `success: true` as "the write persisted"

**What people do:** Return the mutation's own success flag as the final word.
**Why it's wrong:** OmniFocus bridge writes can return success while silently not persisting. `success` means "the script ran," not "the data is in the database."
**Do this instead:** Add a distinct `verification` signal to the response envelope so callers distinguish "ran" from "confirmed persisted."

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| OmniFocus.app | `osascript -l JavaScript` child process (JXA → OmniJS bridge), unchanged | All new layers sit *above* this; the bridge itself is not modified |
| Tailscale | Network path only; server binds to the tailnet interface or localhost | Auth is independent of Tailscale — never rely on the network being private; the token + host guard still apply |
| launchd | Sets the process role (OWNER/AGENT) via env/label; enforces least privilege at the OS layer (Automation permission only, no Full Disk Access) | OS-level least privilege complements, does not replace, the in-process role gate |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Transport ↔ Server | SDK `server.connect(transport)`; role attached to session at create | Transport resolves identity; Server enforces authorization |
| RoleGate ↔ OperationPolicy | Both read `policy/` tables; share one test-vector source | Two axes (tool-level, operation-level), one source of truth each |
| WriteVerifier ↔ OmniAutomation | Verifier wraps mutation execution and issues a second read via the same executor | Keep verifier outside the script string; it orchestrates two executions |
| MutationCompiler ↔ mutation-script-builder | Policy denied at compile; asserted again at build | Defense-in-depth mirrors the existing `assertSandboxGuardAtStartup` pattern |

## Sources

- Live codebase: `src/http-server.ts`, `src/session-manager.ts`, `src/tools/index.ts`, `src/tools/unified/schemas/write-schema.ts`, `.planning/codebase/{ARCHITECTURE,STRUCTURE,CONCERNS}.md` (mapped 2026-06-03) — HIGH
- [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) — Streamable HTTP transport, `enableDnsRebindingProtection`/`allowedHosts`, `authInfo` in handlers — HIGH
- [Include Authorization Info in Tool Calls (SDK issue #350)](https://github.com/modelcontextprotocol/typescript-sdk/issues/350) — confirms `authInfo` propagation to tool handlers for Streamable HTTP — HIGH
- [requireBearerAuth — MCP TS SDK](https://ts.sdk.modelcontextprotocol.io/v2/functions/_modelcontextprotocol_express.auth_bearerAuth.requireBearerAuth.html) — bearer middleware attaches `req.auth`, surfaced as handler auth context — MEDIUM (verify exact API names against installed `^1.25.1` before coding)
- [Understanding Authorization in MCP](https://modelcontextprotocol.io/docs/tutorials/security/authorization) — scope enforcement is a server-side responsibility; localhost DNS-rebinding risk — HIGH
- [MCP Server in TypeScript: OAuth 2.1 + Streamable HTTP (2026)](https://nerdleveltech.com/mcp-server-typescript-oauth-streamable-http-production-tutorial) — DNS-rebinding mitigation in SDK 1.24.0; per-tool scope checks in handlers — MEDIUM

---
*Architecture research for: host-resident MCP server hardening (role gating, HTTP auth, write-verification)*
*Researched: 2026-06-03*
