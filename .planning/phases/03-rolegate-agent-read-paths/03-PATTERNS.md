# Phase 3: RoleGate & Agent Read Paths - Pattern Map

**Mapped:** 2026-06-04 **Files analyzed:** 9 new/modified files **Analogs found:** 9 / 9

---

## File Classification

| New/Modified File                                                                                  | Role                | Data Flow        | Closest Analog                                                                                   | Match Quality |
| -------------------------------------------------------------------------------------------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------------ | ------------- |
| `src/auth/operation-policy.ts` (add `allowedOperations`)                                           | utility             | request-response | `src/auth/operation-policy.ts` — existing `decide()` + `AGENT_POLICY`                            | exact         |
| `src/tools/index.ts` (add `role` param, ListTools trim, CallTool gate)                             | middleware/dispatch | request-response | `src/tools/index.ts` — existing `ListTools`/`CallTool` handler structure                         | exact         |
| `src/index.ts` (pass role into `registerTools`)                                                    | config/wiring       | request-response | `src/index.ts` line 182 — existing `registerTools` call                                          | exact         |
| `src/session-manager.ts` (pass role into `registerTools`)                                          | config/wiring       | request-response | `src/session-manager.ts` line 115 — existing `registerTools` call                                | exact         |
| `src/tools/unified/OmniFocusWriteTool.ts` (extract normalization helper, role-aware `inputSchema`) | service             | CRUD             | `src/tools/unified/OmniFocusWriteTool.ts` — Phase 2 funnel block + existing `inputSchema` getter | exact         |
| `src/tools/system/SystemTool.ts` (add `whoami` op)                                                 | service             | request-response | `src/tools/system/SystemTool.ts` — existing `version`/`diagnostics`/`metrics`/`cache` op pattern | exact         |
| `tests/unit/tools/index-rolegate.test.ts` (NEW)                                                    | test                | request-response | `tests/unit/tools/write-tool-policy-guard.test.ts`                                               | role-match    |
| `tests/unit/tools/system/SystemTool-whoami.test.ts` (NEW)                                          | test                | request-response | `tests/unit/tools/write-tool-policy-guard.test.ts`                                               | role-match    |
| `tests/unit/auth/operation-policy.test.ts` (extend)                                                | test                | request-response | `tests/unit/auth/operation-policy.test.ts` — existing `decide()` matrix                          | exact         |

---

## Pattern Assignments

### `src/auth/operation-policy.ts` — `allowedOperations(role)` enumerator (NEW function)

**Analog:** Same file — the existing `decide()` function and `AGENT_POLICY` table.

**Core pattern — existing `AGENT_POLICY` table** (lines 32–73):

```typescript
const AGENT_POLICY: Record<string, PolicyOutcome | Record<string, PolicyOutcome>> = {
  delete: 'deny',
  bulk_delete: 'deny',
  complete: 'allow',
  drop: 'allow',
  create: 'allow',
  update: 'allow',
  batch: 'allow',
  create_folder: 'allow',
  tag_manage: {
    delete: 'gate',
    merge: 'gate',
    perspective_delete: 'gate',
    create: 'allow',
    rename: 'allow',
    nest: 'allow',
    unnest: 'allow',
    reparent: 'allow',
  },
};
```

**Core pattern — existing `decide()` for reference on fail-closed logic** (lines 94–122):

```typescript
export function decide(role: Role, operation: string, target?: string): PolicyOutcome {
  if (role === 'owner') {
    return 'allow';
  }
  const entry = AGENT_POLICY[operation];
  if (entry === undefined) {
    return 'deny';
  } // fail-closed
  if (typeof entry === 'string') {
    return entry;
  }
  const targetOutcome = entry[target ?? ''];
  if (targetOutcome === undefined) {
    return 'deny';
  } // fail-closed
  return targetOutcome;
}
```

**New function to add** (D-03/D-04/D-05) — forward read over `AGENT_POLICY`, never inverse of `decide()`:

```typescript
// Add after decide() — same file, same AGENT_POLICY table
export function allowedOperations(role: Role): {
  operations: string[];
  tagManageActions: string[];
} {
  if (role === 'owner') {
    return {
      operations: Object.keys(AGENT_POLICY),
      tagManageActions: Object.keys(AGENT_POLICY['tag_manage'] as Record<string, PolicyOutcome>),
    };
  }
  // AGENT: include 'allow' AND 'gate' (D-05: gated ops are advertised-but-guarded, not hidden)
  const operations: string[] = [];
  const tagManageActions: string[] = [];
  for (const [op, entry] of Object.entries(AGENT_POLICY)) {
    if (typeof entry === 'string') {
      if (entry !== 'deny') operations.push(op);
    } else {
      operations.push(op); // tag_manage itself is advertised (D-05)
      for (const [action, outcome] of Object.entries(entry)) {
        if (outcome !== 'deny') tagManageActions.push(action);
      }
    }
  }
  return { operations, tagManageActions };
}
```

**Import needed:** No new imports — `Role` and `PolicyOutcome` are already imported at line 16.

---

### `src/tools/index.ts` — `registerTools` signature + ListTools trim + CallTool gate

**Analog:** Same file, all existing patterns. No external analog needed.

**Imports pattern** (lines 1–12) — add `Role` and `ResolvedContext` from contracts, and `decide`/`allowedOperations`
from policy, and `createErrorResponseV2` from response-format:

```typescript
// ADD to existing imports:
import type { Role, ResolvedContext } from '../contracts/roles.js';
import { decide, allowedOperations } from '../auth/operation-policy.js';
import { createErrorResponseV2 } from '../utils/response-format.js';
```

**Current signature** (line 36 — confirmed):

```typescript
export function registerTools(server: Server, cache: CacheManager, pendingOperations?: Set<Promise<unknown>>): void {
```

**Target signature** (D-10):

```typescript
export function registerTools(
  server: Server,
  cache: CacheManager,
  pendingOperations?: Set<Promise<unknown>>,
  role: Role = 'agent',       // fail-safe default; both call sites pass explicit value
  context?: ResolvedContext,  // threaded for whoami; optional so signature stays backward-compat
): void {
```

**ListTools handler pattern** (lines 50–69 — existing, modify the `tools.map` to emit role-aware schemas):

```typescript
// CURRENT (lines 50-69):
server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools: tools.map((t) => {
      const toolDef: Record<string, unknown> = {
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema, // ← THIS becomes role-aware
      };
      // ...meta/annotations...
      return toolDef;
    }),
  };
});

// TARGET PATTERN — close over `role`; build new objects, never mutate in place:
server.setRequestHandler(ListToolsRequestSchema, () => {
  const { operations, tagManageActions } = allowedOperations(role);
  return {
    tools: tools.map((t) => {
      // Build role-trimmed schema for each tool (new object per request — Pitfall 5)
      const schema = t.getRoleAwareSchema?.(role, operations, tagManageActions) ?? t.inputSchema;
      const toolDef: Record<string, unknown> = {
        name: t.name,
        description: t.getRoleAwareDescription?.(role) ?? t.description,
        inputSchema: schema,
      };
      if ('meta' in t && t.meta) {
        toolDef.meta = (t as Record<string, unknown>).meta;
      }
      if ('annotations' in t && t.annotations) {
        toolDef.annotations = (t as Record<string, unknown>).annotations;
      }
      return toolDef;
    }),
  };
});
```

**CallTool gate pattern** (insert after line 89, before `executionPromise` at line 103 — D-07/D-08/D-09):

```typescript
// EXISTING: tool lookup (lines 85-89)
const tool = tools.find((t) => t.name === name);
if (!tool) {
  throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
}

// ADD: pre-dispatch gate (after tool-not-found, before executionPromise)
{
  const items = normalizeArgsToPolicy(args || {}); // shared helper (D-11)
  for (const item of items) {
    const outcome = decide(role, item.operation, item.target);
    if (outcome === 'deny' || outcome === 'gate') {
      const isKnownDelete = item.operation === 'delete' || item.operation === 'bulk_delete';
      const errorPayload =
        outcome === 'deny'
          ? createErrorResponseV2(
              name,
              isKnownDelete ? 'POLICY_DENY_DELETE' : 'POLICY_DENY',
              isKnownDelete
                ? 'Delete operations are not permitted for the agent role.'
                : `Operation '${item.operation}' is not permitted for the agent role.`,
              isKnownDelete
                ? "Use 'complete', or update the task with status 'dropped', instead of delete."
                : 'Re-run from an owner connection.',
              { role, operation: item.operation, target: item.target },
            )
          : createErrorResponseV2(
              name,
              'POLICY_GATE_REQUIRES_OWNER',
              'This structural operation requires owner approval before execution.',
              'Re-run from an owner connection using the ownerCommand below.',
              { dryRun: true, ownerCommand: { mutation: args || {} } },
            );
      // Wrap in MCP content envelope — same shape as the executionPromise success path (Pitfall 2)
      return {
        content: [{ type: 'text', text: JSON.stringify(errorPayload, null, 2) }],
      };
    }
  }
}

// EXISTING: executionPromise = (async () => { ... })() continues unchanged
```

**Key invariant (D-08):** No `if (name === 'omnifocus_write')` check. The gate is universal — `normalizeArgsToPolicy`
returns `[]` for read ops, so the loop is a no-op for them. The gate only ever fires for args that contain a `mutation`
with a denied operation.

---

### Shared normalization helper — `normalizeArgsToPolicy`

**Analog:** `src/tools/unified/OmniFocusWriteTool.ts` lines 344–367 — the existing inline normalization block (to be
extracted per D-11).

**Existing inline block** (lines 344–367, confirmed):

```typescript
// Currently inline in OmniFocusWriteTool.executeValidated
type PolicyItem = { operation: string; target: string };
let policyItems: PolicyItem[];

if (compiled.operation === 'batch') {
  policyItems = (compiled.operations as Array<{ operation: string; target?: string }>).map((op) => ({
    operation: op.operation,
    target: op.target ?? 'task',
  }));
} else if (compiled.operation === 'bulk_delete') {
  policyItems = [{ operation: 'bulk_delete', target: (compiled as { target?: string }).target ?? 'task' }];
} else if (compiled.operation === 'tag_manage') {
  policyItems = [{ operation: 'tag_manage', target: (compiled as { action?: string }).action ?? '' }];
} else {
  policyItems = [{ operation: compiled.operation, target: (compiled as { target?: string }).target ?? 'task' }];
}
```

**Shared helper to extract** (operates on raw `args.mutation` — pre-compile — so the dispatch gate can call it without
importing `MutationCompiler`):

```typescript
// Location: src/auth/operation-policy.ts (or a new src/tools/policy-normalization.ts)
// Called by BOTH the dispatch gate in index.ts AND the Write tool funnel (replaces inline block).

export type PolicyItem = { operation: string; target: string };

/**
 * Normalize raw MCP args into a flat list of (operation, target) pairs
 * for decide() evaluation. Operates on the raw args.mutation shape
 * (pre-Zod-compile) so it can be called at dispatch time.
 *
 * Returns [] for args that have no mutation field (read ops, system ops).
 */
export function normalizeArgsToPolicy(args: Record<string, unknown>): PolicyItem[] {
  const mutation = args['mutation'] as Record<string, unknown> | undefined;
  if (!mutation) return [];

  const op = mutation['operation'] as string | undefined;
  if (!op) return [];

  if (op === 'batch') {
    const operations = (mutation['operations'] as Array<Record<string, unknown>>) ?? [];
    return operations.map((sub) => ({
      operation: sub['operation'] as string,
      target: (sub['target'] as string | undefined) ?? 'task',
    }));
  }
  if (op === 'bulk_delete') {
    return [{ operation: 'bulk_delete', target: (mutation['target'] as string | undefined) ?? 'task' }];
  }
  if (op === 'tag_manage') {
    return [{ operation: 'tag_manage', target: (mutation['action'] as string | undefined) ?? '' }];
  }
  return [{ operation: op, target: (mutation['target'] as string | undefined) ?? 'task' }];
}
```

**Write tool migration:** Replace the inline block in `OmniFocusWriteTool.executeValidated` with a call to
`normalizeArgsToPolicy(args)` (note: the funnel operates on the compiled mutation post-parse; the helper operating on
raw args is equivalent because the compiler's discriminator (`compiled.operation`) mirrors `args.mutation.operation`
exactly).

---

### `src/index.ts` — pass `role` into `registerTools`

**Analog:** Same file, line 182 (confirmed).

**Current call** (line 182):

```typescript
await registerTools(stdioServer, cacheManager, pendingOperations);
```

**Target call** (D-10):

```typescript
// `identity` and `role` are already resolved at lines 144-146:
//   const identity = cliConfig.httpMode ? resolveHttpIdentity() : resolveStdioIdentity();
//   const role = parseRole();
// Pass both into registerTools — role for gate/advertisement, context for whoami:
const context: ResolvedContext = { identity, role };
await registerTools(stdioServer, cacheManager, pendingOperations, role, context);
```

**Existing resolution block** (lines 143–146 — read-only, no change):

```typescript
const identity = cliConfig.httpMode ? resolveHttpIdentity() : resolveStdioIdentity();
const role = parseRole();
logger.info(`resolved role=${role.toUpperCase()} source=${identity.roleSource}`);
```

---

### `src/session-manager.ts` — pass `role` into `registerTools` (Phase 4 seam)

**Analog:** Same file, line 115 (confirmed).

**Current call** (line 115):

```typescript
await registerTools(server, this.cacheManager, this.pendingOperations);
```

**Target call** (forward-compatible Phase 4 seam — D-10):

```typescript
// For Phase 3: pass the startup-resolved role (parseRole() result stored on the session manager).
// For Phase 4: replace with the per-token role resolved from the bearer token.
await registerTools(server, this.cacheManager, this.pendingOperations, this.role, this.context);
```

The session manager will need `this.role` and `this.context` populated — likely passed through the existing session
constructor path. This is the forward-compatible seam D-10 requires; Phase 4 fills per-session values here.

---

### `src/tools/unified/OmniFocusWriteTool.ts` — role-aware `inputSchema` trim + extract normalization

**Analog:** Same file — existing `inputSchema` getter (lines 202–301+) and inline normalization block (lines 344–367).

**Existing `inputSchema` operation enum** (line 243):

```typescript
operation: {
  type: 'string',
  enum: ['create', 'create_folder', 'update', 'complete', 'delete', 'batch', 'bulk_delete', 'tag_manage'],
},
```

**Target pattern — role-aware getter or factory method** (D-01/D-02):

```typescript
// Option A: add getRoleAwareSchema() method that the ListTools handler calls.
// The base inputSchema getter is unchanged (server-side Zod stays role-agnostic).
getRoleAwareSchema(role: Role, allowedOps: string[], allowedTagActions: string[]): Record<string, unknown> {
  const base = this.inputSchema as { properties: { mutation: { properties: Record<string, unknown> } } };
  const mutationProps = { ...base.properties.mutation.properties };

  // Trim operation enum to allowed set (new object — do not mutate base)
  mutationProps['operation'] = {
    type: 'string',
    enum: allowedOps,  // derived from allowedOperations(role).operations
  };

  // Trim tag_manage action enum to allowed tag actions
  if (mutationProps['action']) {
    mutationProps['action'] = {
      type: 'string',
      enum: allowedTagActions,
    };
  }

  return {
    ...base,
    properties: {
      mutation: {
        ...base.properties.mutation,
        properties: mutationProps,
      },
    },
  };
}
```

**Existing `createErrorResponseV2` call shape** (lines 381–392 — reuse exactly for dispatch gate):

```typescript
return createErrorResponseV2(
  'omnifocus_write', // operation (tool name at dispatch gate)
  'POLICY_DENY_DELETE', // errorCode
  'Delete operations are not permitted for the agent role.',
  "Use 'complete', or update the task with status 'dropped', instead of delete.",
  { role, operation: item.operation, target: item.target },
  new OperationTimerV2().toMetadata(),
);
```

---

### `src/tools/system/SystemTool.ts` — add `whoami` op (D-12–D-15)

**Analog:** Same file — the entire existing op pattern (`version`/`diagnostics`/`metrics`/`cache`).

**Step 1 — Zod schema** (lines 23–52 — dual-schema invariant, both changes in one commit):

```typescript
// CURRENT (line 25):
operation: z.enum(['version', 'diagnostics', 'metrics', 'cache']);

// TARGET:
operation: z.enum(['version', 'diagnostics', 'metrics', 'cache', 'whoami']);
```

**Step 2 — `inputSchema` getter** (lines 137–163):

```typescript
// CURRENT (line 143):
enum: ['version', 'diagnostics', 'metrics', 'cache'],

// TARGET:
enum: ['version', 'diagnostics', 'metrics', 'cache', 'whoami'],
```

**Step 3 — description string** (lines 100–102):

```typescript
// ADD mention of whoami to the description string:
description =
  'System utilities for OmniFocus MCP: ... or get role/identity information. ' +
  'Use operation="whoami" to confirm the current role and identity context.';
```

**Step 4 — constructor update** (line 167):

```typescript
// CURRENT:
constructor(cache: import('../../cache/CacheManager.js').CacheManager) {
  super(cache);
  this.diagnosticOmni = new DiagnosticOmniAutomation();
}

// TARGET (add optional context for whoami, D-13):
constructor(
  cache: import('../../cache/CacheManager.js').CacheManager,
  private readonly context?: ResolvedContext,
) {
  super(cache);
  this.diagnosticOmni = new DiagnosticOmniAutomation();
}
```

**Step 5 — `executeValidated` switch case** (lines 175–193):

```typescript
// ADD case before default:
case 'whoami':
  return this.getWhoami();

// NEW private method (role-scoped redaction per D-13):
private getWhoami(): Promise<SystemResponse> {
  const role = this.context?.role ?? 'agent';
  const source = this.context?.identity.roleSource ?? 'fail-safe-default';

  if (role === 'agent') {
    // AGENT path: omit identity and principal entirely (D-13/D-15)
    return Promise.resolve(
      createSuccessResponseV2('system', { role, roleSource: source }, undefined, {
        operation: 'whoami',
      }),
    );
  }

  // OWNER path: full identity block (principal null until Phase 4)
  return Promise.resolve(
    createSuccessResponseV2(
      'system',
      {
        role,
        identity: {
          transport: this.context?.identity.transport ?? 'stdio',
          roleSource: source,
          principal: this.context?.identity.principal ?? null,
        },
      },
      undefined,
      { operation: 'whoami' },
    ),
  );
}
```

**`createSuccessResponseV2` call shape analog** (lines 204–215 — copy this pattern):

```typescript
return createSuccessResponseV2('system', versionInfo, undefined, {
  ...timer.toMetadata(),
  operation: 'version',
  omnifocus_version: omniFocusVersion.version.version,
});
```

**SystemTool construction in `registerTools`** — when building the `tools` array, pass context:

```typescript
// CURRENT (src/tools/index.ts line 46):
new SystemTool(cache),

// TARGET:
new SystemTool(cache, context),
```

---

## Tests

### `tests/unit/tools/index-rolegate.test.ts` (NEW)

**Analog:** `tests/unit/tools/write-tool-policy-guard.test.ts` — the complete pattern to follow.

**Mock cache pattern** (lines 18–29 — copy verbatim):

```typescript
function createMockCache(): CacheManager {
  return {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
    invalidateForTaskChange: vi.fn(),
    invalidateProject: vi.fn(),
    invalidateTag: vi.fn(),
    invalidateTaskQueries: vi.fn(),
    clear: vi.fn(),
  } as unknown as CacheManager;
}
```

**Role control pattern** (lines 54–68 — env-var based, copy for new tests):

```typescript
const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];
beforeEach(() => {
  delete process.env['OMNIFOCUS_MCP_ROLE'];
}); // agent
afterEach(() => {
  if (originalRole === undefined) delete process.env['OMNIFOCUS_MCP_ROLE'];
  else process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
});
```

**Note for dispatch gate tests:** The new tests will construct a `registerTools`-wired `Server` instance and call the
`CallTool` handler directly (via `server.request()` or by capturing the handler). The existing write-tool tests call
`tool.execute()` directly — dispatch gate tests must go one layer up to exercise `index.ts` gate firing before
`tool.execute()`.

**Error code assertion pattern** (lines 76–97 — copy):

```typescript
expect((result.error as Record<string, unknown>).code).toBe('POLICY_DENY_DELETE');
```

**ListTools trim assertion pattern** (NEW — no existing analog):

```typescript
// Assert AGENT sees trimmed enum (delete and bulk_delete absent)
const toolsDef = listToolsResult.tools.find((t) => t.name === 'omnifocus_write');
const opEnum = (toolsDef.inputSchema as { properties: { mutation: { properties: { operation: { enum: string[] } } } } })
  .properties.mutation.properties.operation.enum;
expect(opEnum).not.toContain('delete');
expect(opEnum).not.toContain('bulk_delete');
expect(opEnum).toContain('create');

// Assert OWNER sees full enum
// (run same assertion with OMNIFOCUS_MCP_ROLE=owner)
```

### `tests/unit/tools/system/SystemTool-whoami.test.ts` (NEW)

**Analog:** `tests/unit/tools/write-tool-policy-guard.test.ts` — same setup shape; simpler because `whoami` is
read-only.

**Key assertions (D-15)**:

```typescript
// AGENT path — identity field MUST be absent (D-15: assert omission, not just role presence)
it('whoami AGENT: returns role and roleSource, omits identity', async () => {
  const result = await tool.execute({ operation: 'whoami' });
  const data = (result as { data: Record<string, unknown> }).data;
  expect(data.role).toBe('agent');
  expect(data.roleSource).toBeDefined();
  expect(data.identity).toBeUndefined(); // structurally absent — D-15
});

// OWNER path — full identity block present
it('whoami OWNER: returns role and identity block', async () => {
  const result = await tool.execute({ operation: 'whoami' });
  const data = (result as { data: Record<string, unknown> }).data;
  expect(data.role).toBe('owner');
  expect((data.identity as Record<string, unknown>).transport).toBeDefined();
  expect((data.identity as Record<string, unknown>).roleSource).toBeDefined();
  // principal is null on stdio until Phase 4:
  expect((data.identity as Record<string, unknown>).principal).toBeNull();
});
```

### `tests/unit/auth/operation-policy.test.ts` — extend with D-06 parity test

**Analog:** Same file, lines 1–60+ (existing `describe('decide() — D-08 policy matrix')` block).

**Import to add:**

```typescript
import { allowedOperations } from '../../../src/auth/operation-policy.js';
```

**Parity test block to add** (D-06):

```typescript
describe('advertise⟺enforce parity (D-06)', () => {
  it('every AGENT-advertised op resolves to decide() !== deny', () => {
    const { operations, tagManageActions } = allowedOperations('agent');
    for (const op of operations) {
      if (op === 'tag_manage') continue;
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

  it('OWNER allowedOperations returns all ops (no trimming)', () => {
    const { operations } = allowedOperations('owner');
    expect(operations).toContain('delete');
    expect(operations).toContain('bulk_delete');
  });
});
```

Note: `AGENT_POLICY` is not currently exported from `operation-policy.ts`. Either export it for the parity test or
restructure the test to rely solely on `allowedOperations()` + `decide()` without direct table access.

---

## Shared Patterns

### Error response — `createErrorResponseV2`

**Source:** `src/utils/response-format.ts` line 488 (confirmed signature); `src/tools/unified/OmniFocusWriteTool.ts`
lines 381–416 (confirmed usage).

**Apply to:** Dispatch gate in `src/tools/index.ts` (D-09). Use the **same** `POLICY_DENY_DELETE` / `POLICY_DENY` /
`POLICY_GATE_REQUIRES_OWNER` codes. No new `GATE_*` codes.

**Confirmed signature:**

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

**MCP content envelope (Pitfall 2 — wrap before returning from `CallTool`):**

```typescript
return {
  content: [{ type: 'text', text: JSON.stringify(errorPayload, null, 2) }],
};
```

### Success response — `createSuccessResponseV2`

**Source:** `src/tools/system/SystemTool.ts` lines 204–215 (confirmed usage).

**Apply to:** `SystemTool.getWhoami()` method.

### Dual-schema invariant

**Source:** `CLAUDE.md` "When changing a Zod schema, you MUST also update the corresponding `inputSchema` override."

**Apply to:** `SystemTool.ts` (`whoami` — D-15) and `OmniFocusWriteTool.ts` (role-aware enum trim — D-01). Both changes
must update Zod schema + `inputSchema` getter + description string in a single commit unit.

### Role resolution (never re-call `parseRole()` inside handlers)

**Source:** `src/auth/role-resolver.ts` — `parseRole()` reads `process.env` globally (D-10 anti-pattern).

**Apply to:** All code inside `registerTools` handlers — use the closure-captured `role` parameter exclusively. The
existing write tool funnel (lines 343–344) currently calls `parseRole()` — this is the Phase 4 deferred item; the
dispatch gate must NOT follow that pattern.

---

## No Analog Found

All files have close or exact analogs in the codebase. No file requires RESEARCH.md patterns as primary reference.

---

## Metadata

**Analog search scope:** `src/auth/`, `src/tools/`, `src/contracts/`, `src/index.ts`, `src/session-manager.ts`,
`tests/unit/` **Files scanned:** 10 source files + 2 test files read directly **Pattern extraction date:** 2026-06-04
