# Phase 3: RoleGate & Agent Read Paths - Research

**Researched:** 2026-06-04 **Domain:** MCP dispatch layer — role-aware advertisement, pre-dispatch authorization,
`whoami` op, agent read-path confirmation **Confidence:** HIGH — all key source files read directly; all signatures
confirmed against actual code.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Role-aware advertisement (GATE-01)**

- D-01: Per-role `inputSchema` + description variants. `ListTools` closes over the role; AGENT gets trimmed operation
  enums; OWNER sees full schema.
- D-02: Trimmed agent enum derived from the policy table, never hand-maintained.
- D-03: `allowedOperations(role)` enumerator beside `decide()` in `src/auth/operation-policy.ts` — one table drives both
  advertisement and enforcement.
- D-04: Enumerator is a forward read over AGENT_POLICY (`Object.entries(AGENT_POLICY).filter(…)`), not an inverse of
  `decide()`.
- D-05: Gated ops (`tag_manage/delete`, `tag_manage/merge`, `tag_manage/perspective_delete`) advertised-but-guarded, not
  hidden.
- D-06: Mandatory advertise⟺enforce parity test: every AGENT-advertised op resolves to `decide() ≠ 'deny'`, and every
  non-denied op is advertised.

**Dispatch-point gate (GATE-02)**

- D-07: Thin pre-dispatch gate in `CallTool` handler BEFORE `tool.execute()`, layered on top of Phase 2 funnel
  (defense-in-depth).
- D-08: Universal gate — no `if (name === 'omnifocus_write')` special-case; loops over every CallTool dispatch.
- D-09: Reuse Phase 2 structured error data via `createErrorResponseV2` — do NOT throw `McpError` at dispatch.
- D-10: Role threads in as `registerTools(server, cache, pendingOperations, role)` parameter, captured in the handler
  closure. Never re-call `parseRole()` inside the handler.
- D-11: Extract compiled-mutation → normalized `(operation, target)` item list into a shared helper so dispatch gate and
  Phase 2 funnel feed identical items into `decide()`.

**`system whoami` op**

- D-12: Build `whoami` op in `SystemTool` this phase.
- D-13: Role-scoped payload with owner-only redaction: AGENT gets `{ role, roleSource }`; OWNER gets
  `{ role, identity: { transport, roleSource, principal } }`.
- D-14: `roleSource` is the real 3-value enum `'explicit-env' | 'fail-safe-default' | 'http-token'` — no
  `launchd-label`.
- D-15: Dual-schema invariant: both Zod schema and hand-crafted `inputSchema` for `SystemTool` gain the `whoami` op,
  plus the description string.

### Claude's Discretion

- Exact module layout and function names (suggested: `allowedOperations(role)` beside `decide()` in
  `src/auth/operation-policy.ts`).
- Whether the trimmed advertised enum is computed by filtering a base enum or assembled from the policy table directly —
  as long as it derives from one table (D-03) and a parity test enforces it (D-06).
- Exact `whoami` field names and response envelope, provided the AGENT/OWNER redaction split (D-13) and the 3-value
  `roleSource` (D-14) hold and are grep/assert-stable.
- Precise call-site ordering inside `CallTool` handler (gate before vs after correlation logging), provided the gate
  runs before `tool.execute()`.

### Deferred Ideas (OUT OF SCOPE)

- HTTP per-token role / per-session role threading — Phase 4 (HTTP-05).
- Threading role into the tools themselves (Phase 2 funnel re-derives role via `parseRole()`) — Phase 4.
- `whoami` with a populated `principal` — Phase 4.
- Markdown surface regeneration (`today.md` / `daily-briefing.md`) — SURF-01.
- HMAC confirmation-token approval flow — deferred from Phase 2.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                                                  | Research Support                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GATE-01 | `ListTools` reflects the connection's role — agent sees only allowed operations                                                              | D-01/D-02/D-03: close `ListTools` handler over role; trim `inputSchema` from `allowedOperations(role)` derived from `AGENT_POLICY`  |
| GATE-02 | Disallowed operation requested by AGENT is rejected at dispatch, even if never advertised                                                    | D-07/D-08/D-09: pre-dispatch `decide()` gate in `CallTool` handler, returns `createErrorResponseV2` not `McpError`                  |
| GATE-03 | AGENT can create, complete, drop, defer/reschedule, tag, move, and flag tasks                                                                | All these map to `create`, `update`, `complete`, `tag_manage/additive` — all `allow` in `AGENT_POLICY`                              |
| READ-01 | AGENT can access core read paths — today/forecast, overdue, flagged, available vs blocked, by-project, by-tag, inbox, date-range, count-only | Already implemented in `OmniFocusReadTool`; confirm no policy gate on read ops                                                      |
| READ-02 | AGENT can look up a task/project by identifier                                                                                               | Already implemented via `omnifocus_read` with `filters.id`/`filters.projectId`; confirm agent-allowed                               |
| READ-03 | AGENT can list and read native OmniFocus perspectives                                                                                        | `LIST_PERSPECTIVES_SCRIPT` path in `OmniFocusReadTool.executeValidated` case `'perspectives'` already exists; confirm agent-allowed |

</phase_requirements>

---

## Summary

Phase 3 wires the Phase 1 resolved role into the MCP dispatch layer. Three concrete jobs: (1) trim `ListTools`
advertisement by role, (2) add a pre-dispatch `decide()` gate in `CallTool`, and (3) confirm the read surface is
agent-accessible and add `system whoami`. READ-01/02/03 are largely verification rather than new construction —
`OmniFocusReadTool` already implements all the query modes and the perspectives list; the phase's job is confirming they
are correctly agent-allowed (they are — `decide()` only gates write ops) and exercising them end-to-end via stdio.

The most mechanically novel work is: (a) the `allowedOperations(role)` enumerator in `operation-policy.ts`, (b) the role
parameter threading through `registerTools` and both call sites (`src/index.ts` stdio path and `src/session-manager.ts`
HTTP path), and (c) the `whoami` op in `SystemTool` with its role-scoped redaction split.

A key risk is normalization drift between the dispatch gate and the Phase 2 funnel: both must normalize
`CompiledMutation` → `(operation, target)` items identically before calling `decide()`. D-11 mandates extracting that
normalization into a shared helper — this is the OMN-119 mitigation applied to a third call site.

**Primary recommendation:** Implement in dependency order — `allowedOperations(role)` enumerator first, then
`registerTools` role threading, then `ListTools` trim, then `CallTool` pre-dispatch gate with shared normalization
helper, then `whoami` op, then parity test.

---

## Architectural Responsibility Map

| Capability                           | Primary Tier                                                              | Secondary Tier                              | Rationale                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| Role-aware `ListTools` advertisement | MCP dispatch (`src/tools/index.ts`)                                       | Policy (`src/auth/operation-policy.ts`)     | `ListTools` handler owns schema emission; policy table owns the allowed set     |
| Pre-dispatch `CallTool` gate         | MCP dispatch (`src/tools/index.ts`)                                       | Policy (`src/auth/operation-policy.ts`)     | Gate fires before `tool.execute()`; policy `decide()` provides the outcome      |
| `allowedOperations(role)` enumerator | Policy (`src/auth/operation-policy.ts`)                                   | —                                           | Sits beside `decide()`, reads same `AGENT_POLICY` table                         |
| Shared mutation normalization helper | Policy or dispatch (new helper, D-11)                                     | Write tool (`OmniFocusWriteTool`)           | Shared so gate and funnel feed identical `(op, target)` items to `decide()`     |
| `whoami` op                          | System tool (`src/tools/system/SystemTool.ts`)                            | Role resolver (`src/auth/role-resolver.ts`) | Adds to existing op-enum discriminator; identity context threaded from dispatch |
| AGENT read paths (READ-01/02/03)     | Read tool (`src/tools/unified/OmniFocusReadTool.ts`)                      | —                                           | Already implemented; no new query engine needed                                 |
| Role plumbing at startup             | Entry point (`src/index.ts`) + session manager (`src/session-manager.ts`) | —                                           | Two call sites that pass role into `registerTools`                              |

---

## Standard Stack

Phase 3 adds no new packages. All implementation uses existing dependencies.

### Core (already in repo)

| Module                                           | Location          | Purpose in Phase 3                                                                                                        |
| ------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@modelcontextprotocol/sdk` (low-level `Server`) | `node_modules`    | `setRequestHandler` for `ListToolsRequestSchema` and `CallToolRequestSchema` — the per-request closure that gets the role |
| `zod`                                            | `node_modules`    | Schema validation unchanged; only `inputSchema` getter changes                                                            |
| `vitest`                                         | `devDependencies` | Test framework for parity tests and unit coverage                                                                         |

### No New Packages

The `## Package Legitimacy Audit` section is omitted — this phase installs nothing.

---

## Architecture Patterns

### System Architecture Diagram

```
MCP Client (stdio, AGENT role)
    │
    ▼ tools/list
┌──────────────────────────────────────────────────────────────────┐
│  src/tools/index.ts  registerTools(server, cache, ops, role)     │
│                                                                  │
│  ListTools handler (per-request, closes over `role`)             │
│    → allowedOperations(role)          [operation-policy.ts]      │
│    → trim inputSchema/description for each tool                  │
│    → return role-correct tools[] array                           │
└──────────────────────────────────────────────────────────────────┘
    │
    ▼ tools/call (omnifocus_write/delete — DENIED)
┌──────────────────────────────────────────────────────────────────┐
│  CallTool handler                                                │
│    → normalizeItems(args)   [shared helper, D-11]               │
│    → decide(role, op, target) for each item  [operation-policy] │
│    → outcome === 'deny'? return createErrorResponseV2(POLICY_DENY_*)│
│    → outcome === 'gate'? return createErrorResponseV2(POLICY_GATE_*)│
│    → outcome === 'allow' for all? → tool.execute(args)          │
└───────────────────┬──────────────────────────────────────────────┘
                    │
         ┌──────────┴───────────────────────────────┐
         ▼  (allow path)                            ▼  (deny already returned)
┌────────────────────────┐
│  tool.execute(args)    │  Phase 2 funnel in OmniFocusWriteTool  │
│  (second enforcement   │  (defense-in-depth, unchanged)         │
│   layer unchanged)     │                                        │
└────────────────────────┘

MCP Client (stdio, AGENT role)
    │
    ▼ tools/call system whoami
┌──────────────────────────────────────────────────────────────────┐
│  SystemTool.executeValidated → case 'whoami'                     │
│    AGENT path: { role, roleSource }                              │
│    OWNER path: { role, identity: { transport, roleSource, principal: null } }│
└──────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

No new directories. New/modified files only:

```
src/
├── auth/
│   └── operation-policy.ts          # ADD: allowedOperations(role) enumerator + shared normalization helper
├── tools/
│   ├── index.ts                     # MODIFY: add `role` param, ListTools trim, CallTool gate
│   ├── system/
│   │   └── SystemTool.ts            # MODIFY: add whoami op (Zod + inputSchema + executeValidated branch)
│   └── unified/
│       └── OmniFocusWriteTool.ts    # MODIFY: replace inline normalize block with shared helper import
src/
└── index.ts                         # MODIFY: pass `role` into registerTools(...)
    session-manager.ts               # MODIFY: pass `role` into registerTools(...) [Phase 4 seam]

tests/unit/
├── auth/
│   └── operation-policy.test.ts     # EXTEND: parity test D-06
├── tools/
│   ├── index-rolegate.test.ts       # NEW: ListTools trim, CallTool gate unit tests
│   └── system/
│       └── SystemTool-whoami.test.ts # NEW: whoami AGENT vs OWNER redaction tests
tests/integration/
└── mcp-protocol.test.ts             # EXTEND: role-aware ListTools integration assertion
```

### Pattern 1: `allowedOperations(role)` Enumerator

**What:** A forward read over `AGENT_POLICY` that enumerates operations (and for `tag_manage`, targets) that are
non-deny for the given role.

**When to use:** Called from `ListTools` handler to trim the advertised `operation` enum; called from the parity test to
verify advertise⟺enforce consistency.

**Current AGENT_POLICY shape** (confirmed from `src/auth/operation-policy.ts`):

```typescript
// Top-level flat outcomes
delete: 'deny', bulk_delete: 'deny',
complete: 'allow', drop: 'allow', create: 'allow', update: 'allow',
batch: 'allow', create_folder: 'allow',
// Per-target subtable for tag_manage
tag_manage: {
  delete: 'gate', merge: 'gate', perspective_delete: 'gate',
  create: 'allow', rename: 'allow', nest: 'allow',
  unnest: 'allow', reparent: 'allow',
}
```

**Proposed implementation sketch** (discretionary — Claude's call on exact names):

```typescript
// Source: src/auth/operation-policy.ts — beside decide()
export function allowedOperations(role: Role): {
  operations: string[];
  tagManageActions: string[];
} {
  if (role === 'owner') {
    // OWNER: all ops allowed — return full surface
    return {
      operations: Object.keys(AGENT_POLICY),
      tagManageActions: Object.keys(AGENT_POLICY['tag_manage'] as Record<string, PolicyOutcome>),
    };
  }
  // AGENT: forward read over the table; include 'allow' and 'gate' (D-05)
  const operations: string[] = [];
  const tagManageActions: string[] = [];
  for (const [op, entry] of Object.entries(AGENT_POLICY)) {
    if (typeof entry === 'string') {
      if (entry !== 'deny') operations.push(op);
    } else {
      // tag_manage per-target subtable
      operations.push(op); // tag_manage itself is advertised (D-05)
      for (const [action, outcome] of Object.entries(entry)) {
        if (outcome !== 'deny') tagManageActions.push(action);
      }
    }
  }
  return { operations, tagManageActions };
}
```

### Pattern 2: `registerTools` Signature Extension (D-10)

**What:** Add `role: Role` as the 4th parameter; close over it in both `ListTools` and `CallTool` handlers.

**Current signature** (confirmed from `src/tools/index.ts` line 36):

```typescript
export function registerTools(server: Server, cache: CacheManager, pendingOperations?: Set<Promise<unknown>>): void;
```

**Target signature:**

```typescript
export function registerTools(
  server: Server,
  cache: CacheManager,
  pendingOperations?: Set<Promise<unknown>>,
  role: Role = 'agent', // fail-safe default; stdio and session-manager pass explicit value
): void;
```

Two call sites to update:

1. `src/index.ts` line 182: `await registerTools(stdioServer, cacheManager, pendingOperations)` → pass `role`
2. `src/session-manager.ts` line 115: `await registerTools(server, this.cacheManager, this.pendingOperations)` → pass
   role (Phase 4 fills in per-session role here)

### Pattern 3: Pre-Dispatch Gate in `CallTool` Handler (D-07/D-08/D-09)

**What:** Before calling `tool.execute()`, inspect `args` and call `decide(role, op, target)` for each normalized item.
Return `createErrorResponseV2(...)` structured payload if denied or gated — do NOT throw `McpError`.

**Why not McpError:** Confirmed in `src/tools/index.ts` lines 143-147: any non-`McpError` exception is wrapped as
`McpError InternalError`. Returning a structured response from the gate (not throwing) preserves the `POLICY_DENY_*` /
`POLICY_GATE_REQUIRES_OWNER` code and `ownerCommand` payload that the client-facing contract requires (D-09).

**Gate placement:** After `const tool = tools.find(...)` (so `tool not found → McpError` still fires), before the
`executionPromise = (async () => { ... tool.execute() })()` block.

**createErrorResponseV2 signature** (confirmed from `src/utils/response-format.ts` line 488):

```typescript
export function createErrorResponseV2<T = unknown>(
  operation: string,
  errorCode: string,
  message: string,
  suggestion?: string,
  details?: unknown,
  metadata: Partial<StandardMetadataV2> = {},
): StandardResponseV2<T>;
```

The gate must wrap its return in the same MCP content envelope the `executionPromise` produces:

```typescript
// Gate fires before executionPromise is created
const gateResult = checkPolicyGate(role, name, args);
if (gateResult) {
  return {
    content: [{ type: 'text', text: JSON.stringify(gateResult, null, 2) }],
  };
}
```

### Pattern 4: Shared Normalization Helper (D-11)

**What:** Extract the compiled-mutation → `PolicyItem[]` normalization from `OmniFocusWriteTool.executeValidated` lines
344–367 into a shared helper. The dispatch gate must call the same normalization to guarantee it feeds identical
`(operation, target)` pairs to `decide()`.

**Current normalization logic** (confirmed, `src/tools/unified/OmniFocusWriteTool.ts` lines 344–367):

```typescript
// Existing inline block inside OmniFocusWriteTool.executeValidated
type PolicyItem = { operation: string; target: string };
let policyItems: PolicyItem[];

if (compiled.operation === 'batch') {
  policyItems = (compiled.operations as Array<{...}>).map((op) => ({
    operation: op.operation, target: op.target ?? 'task',
  }));
} else if (compiled.operation === 'bulk_delete') {
  policyItems = [{ operation: 'bulk_delete', target: (compiled as {...}).target ?? 'task' }];
} else if (compiled.operation === 'tag_manage') {
  policyItems = [{ operation: 'tag_manage', target: (compiled as {...}).action ?? '' }];
} else {
  policyItems = [{ operation: compiled.operation, target: (compiled as {...}).target ?? 'task' }];
}
```

The dispatch gate receives raw MCP `args` (before Zod parsing + compilation). It must operate on the raw `args.mutation`
shape to extract `(operation, target)`. The shared helper operates at the **raw args level** (pre-compile), not at
`CompiledMutation` level, so it can be called at dispatch time. This is simpler than sharing the compiler output path
and avoids threading compilation into the dispatch layer.

### Pattern 5: `whoami` Op in SystemTool (D-12/D-13/D-14/D-15)

**Current SystemTool** (confirmed):

- Zod schema: `z.object({ operation: z.enum(['version', 'diagnostics', 'metrics', 'cache']), ... }).strict()`
- `inputSchema` getter: returns
  `{ type: 'object', properties: { operation: { enum: ['version', 'diagnostics', 'metrics', 'cache'] }, ... } }`
- `executeValidated` switch: cases for `'version'`, `'diagnostics'`, `'metrics'`, `'cache'`

**Changes required (dual-schema invariant, D-15):**

1. Zod schema: add `'whoami'` to the `z.enum([...])` in `SystemToolSchema`
2. `inputSchema` getter: add `'whoami'` to the `operation.enum` array
3. Description string: mention `whoami` returns role and identity info
4. `executeValidated`: add `case 'whoami': return this.getWhoami(role, identity);`
5. `SystemTool` needs `role` and `identity` (or at minimum the `ResolvedContext`) threaded from the dispatch closure

**ResolvedContext threading:** `SystemTool` currently takes only `cache: CacheManager` in its constructor. Options
(Claude's discretion):

- Pass `ResolvedContext` into `SystemTool` constructor alongside `cache`
- OR pass it through `executeValidated` via an extended args shape
- The cleanest approach given existing patterns: add optional `context?: ResolvedContext` to the `SystemTool`
  constructor, set in `registerTools` when building the tools array

### Anti-Patterns to Avoid

- **Re-calling `parseRole()` inside `CallTool` handler:** Reads `process.env` globally — cannot distinguish sessions in
  Phase 4. Use the closure-captured `role` (D-10).
- **Throwing `McpError` from the policy gate:** The SDK's `try/catch` in the executor wraps all non-`McpError` as
  `InternalError`; even a `McpError` thrown from the gate loses the structured `POLICY_DENY_*` payload the client
  contract requires. Return the structured response instead (D-09).
- **Adding `if (name === 'omnifocus_write')` to the gate:** Means a future destructive tool bypasses the gate. The gate
  must be universal (D-08).
- **Hand-maintaining a second allowed-ops list:** Policy drift between advertisement and enforcement. Use
  `allowedOperations(role)` derived from the same `AGENT_POLICY` table that `decide()` reads (D-02/D-03).
- **Updating only the Zod schema or only the `inputSchema` getter:** Dual-schema invariant — both change together, plus
  the description string (CLAUDE.md).

---

## Don't Hand-Roll

| Problem                   | Don't Build                           | Use Instead                                                      | Why                                                                               |
| ------------------------- | ------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Policy decision           | Custom allow/deny logic in `CallTool` | `decide(role, op, target)` from `src/auth/operation-policy.ts`   | Existing single source of truth; three call sites (funnel, builder, now dispatch) |
| Structured error response | Custom error shape at dispatch        | `createErrorResponseV2(...)` from `src/utils/response-format.ts` | Preserves `POLICY_DENY_*` code and `ownerCommand` payload; client contract        |
| Allowed-ops enumeration   | Second hardcoded list                 | `allowedOperations(role)` derived from `AGENT_POLICY`            | One table, no drift                                                               |
| Tool schema advertisement | Custom schema builder                 | Extend existing hand-crafted `inputSchema` getter per tool       | Already per-tool; just add role-param and trim                                    |

---

## Common Pitfalls

### Pitfall 1: Normalization Mismatch (OMN-119 Class)

**What goes wrong:** The dispatch gate extracts `(operation, target)` from raw MCP `args` differently than the Phase 2
funnel extracts them from `CompiledMutation`. A request slips through the gate (different normalization) and hits the
funnel. **Why it happens:** `tag_manage` uses `action` as target in `args.mutation` but `compiled.action` in
`CompiledMutation`. Batch ops have different access patterns. Subtle shape differences. **How to avoid:** D-11 — shared
extraction helper operating on raw `args.mutation`. Write a test asserting the dispatch gate rejects the same inputs the
funnel would reject. **Warning signs:** `POLICY_DENY_DELETE` appears from the funnel but not from the gate for the same
payload.

### Pitfall 2: Gate Return Not Wrapped in MCP Content Envelope

**What goes wrong:** Gate returns a `StandardResponseV2` object directly from the `CallTool` handler, but the handler's
normal success path wraps results in `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`. The SDK rejects
the unwrapped shape. **Why it happens:** The existing `tool.execute()` return is already wrapped by the promise; the
gate return is outside that flow. **How to avoid:** Wrap the gate result in the same content envelope before returning
from the `CallTool` handler. **Warning signs:** MCP protocol test fails with schema/type error on a denied operation.

### Pitfall 3: `session-manager.ts` Not Updated (Phase 4 Seam Breakage)

**What goes wrong:** `registerTools` gains a `role` parameter, but `src/session-manager.ts` line 115 is not updated.
TypeScript catches this only if the parameter is non-optional; if defaulted to `'agent'`, the HTTP path silently
regresses to hardcoded agent role. **Why it happens:** Two call sites (`src/index.ts` and `src/session-manager.ts`).
Easy to miss the second one. **How to avoid:** Update both call sites. Add a compile-time assertion or test that
exercises the session-manager path. **Warning signs:** HTTP mode always shows AGENT in `whoami` regardless of configured
role.

### Pitfall 4: Dual-Schema Drift on `whoami`

**What goes wrong:** `whoami` added to Zod schema but not to hand-crafted `inputSchema` getter (or vice versa), or
description string not updated. MCP client doesn't see the new op in `tools/list`. **Why it happens:** Dual-schema
invariant is easy to miss when focused on the Zod change. **How to avoid:** CLAUDE.md is explicit: "When changing a Zod
schema, you MUST also update the corresponding `inputSchema` override." Treat as a unit — Zod + `inputSchema` +
description in one commit. **Warning signs:** Existing `tests/unit/docs/claude-md-paths.test.ts` may catch path
references; write a schema parity test for `SystemTool`.

### Pitfall 5: `ListTools` Handler Mutable State

**What goes wrong:** The `tools` array or `inputSchema` objects are mutated in-place during the `ListTools` handler
instead of producing new objects per request. Concurrency or second-request side effects. **Why it happens:** JavaScript
`filter()` on the enum array produces a new array, but if the handler modifies the existing `tool.inputSchema` object
reference, it corrupts the base object. **How to avoid:** Build role-trimmed schema variants as new objects (spread or
factory), not in-place mutations of the base tool's schema property.

---

## Code Examples

### `createErrorResponseV2` call shape (from Phase 2 — reuse exactly)

```typescript
// Source: src/tools/unified/OmniFocusWriteTool.ts lines 381-392 (confirmed)
return createErrorResponseV2(
  'omnifocus_write', // operation
  'POLICY_DENY_DELETE', // errorCode
  'Delete operations are not permitted for the agent role.',
  "Use 'complete', or update the task with status 'dropped', instead of delete.",
  { role, operation: item.operation, target: item.target },
  new OperationTimerV2().toMetadata(),
);
```

The dispatch gate uses the same codes (`POLICY_DENY_DELETE`, `POLICY_DENY`, `POLICY_GATE_REQUIRES_OWNER`) with the same
payload shape (D-09). No new `GATE_*` codes.

### `whoami` response shapes (D-13)

```typescript
// AGENT path — identity and principal structurally absent
{ role: 'agent', roleSource: 'fail-safe-default' }

// OWNER path — full identity, principal null until Phase 4
{
  role: 'owner',
  identity: {
    transport: 'stdio',
    roleSource: 'explicit-env',
    principal: null,         // null until Phase 4 populates it
  }
}
```

The agent-path test MUST assert `identity` is absent (not just `role` present) — D-15.

### Parity test shape (D-06)

```typescript
// Source: New test, derives from AGENT_POLICY structure
describe('advertise⟺enforce parity (D-06)', () => {
  it('every AGENT-advertised op resolves to decide() !== deny', () => {
    const { operations, tagManageActions } = allowedOperations('agent');
    for (const op of operations) {
      if (op === 'tag_manage') continue; // subtable handled separately
      expect(decide('agent', op, 'task')).not.toBe('deny');
    }
    for (const action of tagManageActions) {
      expect(decide('agent', 'tag_manage', action)).not.toBe('deny');
    }
  });
  it('every non-denied AGENT op is advertised', () => {
    const { operations } = allowedOperations('agent');
    for (const [op, entry] of Object.entries(AGENT_POLICY)) {
      if (typeof entry === 'string' && entry !== 'deny') {
        expect(operations).toContain(op);
      }
    }
  });
});
```

---

## State of the Art

| Old Approach                                | Current Approach                                       | When Changed | Impact                                                            |
| ------------------------------------------- | ------------------------------------------------------ | ------------ | ----------------------------------------------------------------- |
| Single `registerTools` call with no role    | Phase 3: role threaded via parameter, closure-captured | Phase 3      | Makes Phase 4 per-session role a value fill-in, not redesign      |
| Role inspection via stderr startup log only | Phase 3: `whoami` op exposes role via CallTool         | Phase 3      | Tests can assert role without log-scraping                        |
| Policy only at funnel + builder             | Phase 3: adds dispatch gate (3rd layer)                | Phase 3      | Defense-in-depth; disallowed op rejected even if never advertised |

---

## Runtime State Inventory

Not applicable — this is a code-only change. No stored data, live service config, OS-registered state, secrets, or build
artifacts carry any "role" string that would require migration.

---

## Open Questions

1. **D-11 exact helper scope**
   - What we know: the Phase 2 inline normalization operates on `CompiledMutation` (post-compile); the dispatch gate
     receives raw MCP `args` (pre-compile).
   - What's unclear: should the shared helper normalize raw `args.mutation` (simpler for dispatch gate) or
     `CompiledMutation` (closer to current funnel)?
   - Recommendation: normalize at `args.mutation` (raw) level in the dispatch gate, leaving the funnel's
     `CompiledMutation` path in place. The shared "helper" in this context is a function that extracts
     `(operation, target)` from `args.mutation` directly — both the gate and a unit test call this function. The
     funnel's in-tool path stays on `CompiledMutation` but is validated by the parity test to produce consistent
     outcomes. This avoids introducing the `MutationCompiler` into the dispatch layer.

2. **`SystemTool` context threading**
   - What we know: `SystemTool` currently takes `CacheManager` only; `whoami` needs `role` and `identity`.
   - What's unclear: constructor injection vs. closure from `registerTools`.
   - Recommendation: pass `ResolvedContext` (already constructed in `registerTools` closure) into `SystemTool`
     constructor as an optional second argument. This mirrors how `role` is closure-captured; keeps `SystemTool`
     testable with a stub `ResolvedContext`.

3. **Integration test for role-aware `ListTools`**
   - What we know: `tests/integration/mcp-protocol.test.ts` currently asserts exactly 4 tools with all operations
     visible.
   - What's unclear: whether the integration test should be parameterized for AGENT vs OWNER or updated to reflect
     AGENT-trimmed schema.
   - Recommendation: add a parallel AGENT integration test that spawns the server without `OMNIFOCUS_MCP_ROLE=owner` and
     asserts the trimmed `operation` enum on `omnifocus_write`. Existing OWNER test updates to pass
     `OMNIFOCUS_MCP_ROLE=owner`.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 3 is a pure code change with no new external dependencies. All tooling (`vitest`,
`@modelcontextprotocol/sdk`, `zod`) is already installed.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework

| Property           | Value                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- |
| Framework          | vitest 3.2.4                                                                            |
| Config file        | `vitest.config.ts` (inferred from standard vitest setup; repo uses `npm run test:unit`) |
| Quick run command  | `npm run test:unit`                                                                     |
| Full suite command | `npm run test:unit && npm run test:integration`                                         |

### Phase Requirements → Test Map

| Req ID           | Behavior                                                                                                                                 | Test Type | Automated Command                                                        | File Exists?                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------ | ------------------------------------------------ |
| GATE-01          | `ListTools` AGENT response has `operation` enum trimmed to non-deny set                                                                  | unit      | `npm run test:unit -- tests/unit/tools/index-rolegate.test.ts`           | ❌ Wave 0                                        |
| GATE-01          | `ListTools` OWNER response has full operation enum                                                                                       | unit      | same file                                                                | ❌ Wave 0                                        |
| GATE-01          | Advertised enum ⟺ enforced set match (D-06 parity test)                                                                                  | unit      | `npm run test:unit -- tests/unit/auth/operation-policy.test.ts`          | ❌ extend existing                               |
| GATE-02          | `delete` op via AGENT CallTool rejected at dispatch with `POLICY_DENY_DELETE`, not `InternalError`                                       | unit      | `npm run test:unit -- tests/unit/tools/index-rolegate.test.ts`           | ❌ Wave 0                                        |
| GATE-02          | `bulk_delete` via AGENT rejected at dispatch                                                                                             | unit      | same file                                                                | ❌ Wave 0                                        |
| GATE-02          | `tag_manage/merge` via AGENT returns `POLICY_GATE_REQUIRES_OWNER` at dispatch                                                            | unit      | same file                                                                | ❌ Wave 0                                        |
| GATE-02          | OWNER passes all ops through dispatch (no pre-dispatch rejection)                                                                        | unit      | same file                                                                | ❌ Wave 0                                        |
| GATE-03          | `create`, `update`, `complete`, `tag_manage/create` pass for AGENT                                                                       | unit      | `npm run test:unit -- tests/unit/tools/write-tool-policy-guard.test.ts`  | ✅ (existing allow-path tests)                   |
| READ-01          | `OmniFocusReadTool` type=tasks with modes today/overdue/flagged/available/blocked/inbox returns success for AGENT (no policy gate fires) | unit      | `npm run test:unit -- tests/unit/tools/index-rolegate.test.ts`           | ❌ Wave 0 — assert read dispatch never hits gate |
| READ-02          | `omnifocus_read` with `filters.id` succeeds for AGENT                                                                                    | unit      | same                                                                     | ❌ Wave 0                                        |
| READ-03          | `omnifocus_read` type=perspectives returns success for AGENT                                                                             | unit      | same                                                                     | ❌ Wave 0                                        |
| D-06 parity      | Every AGENT-advertised op: `decide(agent, op, target) !== 'deny'`                                                                        | unit      | `npm run test:unit -- tests/unit/auth/operation-policy.test.ts`          | ❌ extend existing                               |
| D-12/D-13        | `whoami` op: AGENT payload has `role` and `roleSource`, omits `identity`                                                                 | unit      | `npm run test:unit -- tests/unit/tools/system/SystemTool-whoami.test.ts` | ❌ Wave 0                                        |
| D-12/D-13        | `whoami` op: OWNER payload has `role`, `identity.transport`, `identity.roleSource`, `identity.principal`                                 | unit      | same                                                                     | ❌ Wave 0                                        |
| D-15 dual-schema | `SystemToolSchema` and `inputSchema` getter both enumerate `whoami`                                                                      | unit      | extend existing or `tests/unit/tools/system/SystemTool-whoami.test.ts`   | ❌ Wave 0                                        |

### Sampling Rate

- **Per task commit:** `npm run test:unit`
- **Per wave merge:** `npm run test:unit && npm run test:integration`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/tools/index-rolegate.test.ts` — covers GATE-01 (ListTools trim), GATE-02 (CallTool dispatch gate), and
      READ-01/02/03 (read ops pass through gate)
- [ ] `tests/unit/tools/system/SystemTool-whoami.test.ts` — covers D-12/D-13 (whoami AGENT vs OWNER redaction), D-15
      (dual-schema parity for whoami)
- [ ] Extend `tests/unit/auth/operation-policy.test.ts` — add D-06 parity test block

_(No new test framework or fixtures needed — existing vitest + mock cache pattern from `write-tool-policy-guard.test.ts`
applies to all new tests.)_

---

## Security Domain

`security_enforcement` is enabled (`true` default), ASVS level 1.

### Applicable ASVS Categories

| ASVS Category         | Applies                                                                                        | Standard Control                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| V2 Authentication     | No — stdio only; no HTTP credential exchange in this phase                                     | —                                                                                                     |
| V3 Session Management | Partial — role is "session-scoped" for stdio but fixed at startup; HTTP per-session is Phase 4 | Closure-captured role (D-10) prevents cross-session bleed                                             |
| V4 Access Control     | Yes — core of this phase                                                                       | `decide()` + `allowedOperations(role)` from `AGENT_POLICY`; defense-in-depth dispatch + funnel layers |
| V5 Input Validation   | Existing — Zod on all tool inputs                                                              | `WriteSchema`, `ReadSchema`, `SystemToolSchema` unchanged                                             |
| V6 Cryptography       | No                                                                                             | —                                                                                                     |

### Known Threat Patterns for This Stack

| Pattern                                                           | STRIDE                                                                   | Standard Mitigation                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Advertised ops differ from enforced ops (drift)                   | Elevation of Privilege                                                   | D-06 parity test + `allowedOperations(role)` from same table as `decide()`              |
| Role re-read from env inside CallTool handler (session confusion) | Elevation of Privilege                                                   | D-10: closure-captured `role` only; never call `parseRole()` inside handlers            |
| Structured policy response mangled to `McpError InternalError`    | Tampering (information destruction)                                      | D-09: return `createErrorResponseV2`, never throw from gate                             |
| `principal` logged in `whoami` response                           | Information Disclosure                                                   | `SENSITIVE_KEYS` already contains `principal`; AGENT path omits `identity` structurally |
| `session-manager.ts` not updated → HTTP path hardcoded AGENT      | Elevation of Privilege (incorrect — becomes least-privilege by accident) | Update both `registerTools` call sites; Phase 4 seam test                               |

---

## Sources

### Primary (HIGH confidence)

- `src/tools/index.ts` — confirmed `registerTools` signature (3 params, no role), `ListTools`/`CallTool` handler
  structure, `tool.execute()` call site
- `src/auth/operation-policy.ts` — confirmed `AGENT_POLICY` table shape, `decide()` signature, no `allowedOperations`
  yet
- `src/contracts/roles.ts` — confirmed `Role`, `PolicyOutcome`, `RoleSource`, `ResolvedIdentity`, `ResolvedContext`
  types
- `src/auth/role-resolver.ts` — confirmed `parseRole()`, `resolveStdioIdentity()`, `resolveHttpIdentity()` signatures
- `src/tools/system/SystemTool.ts` — confirmed existing op enum `['version','diagnostics','metrics','cache']`, Zod
  schema, `inputSchema` getter, `executeValidated` switch pattern
- `src/tools/unified/OmniFocusWriteTool.ts` — confirmed Phase 2 funnel normalization block (lines 344–418),
  `inputSchema` getter shape, `createErrorResponseV2` call shape with exact codes
- `src/tools/unified/OmniFocusReadTool.ts` — confirmed `type:'perspectives'` case, modes enum, `inputSchema` getter
- `src/utils/response-format.ts` — confirmed `createErrorResponseV2` signature and `StandardResponseV2` shape
- `src/utils/logger.ts` — confirmed `SENSITIVE_KEYS` set includes `principal` and `tokenId`
- `src/index.ts` — confirmed Phase 1 role resolution at lines 144-146, `registerTools` call at line 182 (no role param
  yet), `_identity` and `_role` prefixed (unused by tools)
- `src/session-manager.ts` — confirmed second `registerTools` call at line 115 (no role param), Phase 4 seam location

### Secondary (MEDIUM confidence)

- `tests/unit/tools/write-tool-policy-guard.test.ts` — confirmed existing test patterns for mocking `CacheManager`,
  env-based role control, `createErrorResponseV2` assertions
- `tests/integration/mcp-protocol.test.ts` — confirmed integration test asserts exactly 4 tools and full tool surface
  (will need extension for AGENT-trimmed view)
- `tests/unit/auth/operation-policy.test.ts` — confirmed exhaustive D-08 matrix test exists; no parity test yet

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new packages; all existing
- Architecture patterns: HIGH — all signatures and shapes confirmed from actual source
- Pitfalls: HIGH — drawn directly from code structure (normalization block, `throw McpError` catch, two call sites)
- Validation architecture: HIGH — vitest confirmed at 3.2.4; existing test patterns confirmed

**Research date:** 2026-06-04 **Valid until:** 2026-07-04 (stable codebase; only risk is upstream MCP SDK changes)

---

## Assumptions Log

| #   | Claim                                                                                                                                                            | Section                               | Risk if Wrong                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A1  | `src/index.ts` passes `_role` (unused) into `runStdioServer` but NOT into `registerTools` — the threading is the Phase 3 work                                    | Architecture Patterns — role plumbing | LOW: confirmed by reading both files; `_role` prefix is explicit TypeScript unused-param convention |
| A2  | `session-manager.ts` `registerTools` call at line 115 has no `role` param (same gap as stdio path)                                                               | Architecture Patterns                 | LOW: confirmed by grep + file read                                                                  |
| A3  | The `ListTools` handler currently rebuilds the `tools` array on every request by calling `tools.map(...)` — this makes role-trimming via closure straightforward | Architecture Patterns                 | LOW: confirmed by reading the handler at lines 50-69                                                |

**If this table is nearly empty:** All claims in this research were verified directly against source — no user
confirmation needed.
