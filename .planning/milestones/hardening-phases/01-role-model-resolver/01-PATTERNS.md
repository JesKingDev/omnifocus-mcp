# Phase 1: Role Model & Resolver - Pattern Map

**Mapped:** 2026-06-03 **Files analyzed:** 6 (3 new, 3 modified) **Analogs found:** 6 / 6

## File Classification

| New/Modified File                             | Role                        | Data Flow        | Closest Analog                                                                       | Match Quality           |
| --------------------------------------------- | --------------------------- | ---------------- | ------------------------------------------------------------------------------------ | ----------------------- |
| `src/contracts/roles.ts` (NEW)                | contract / type definitions | transform        | `src/contracts/filters.ts` (lines 36–47), `src/contracts/mutations.ts` (lines 21–26) | exact                   |
| `src/auth/role-resolver.ts` (NEW)             | utility / startup resolver  | request-response | `src/utils/sandbox-guard.ts` (env-var parse + fail-safe guard)                       | role-match              |
| `src/index.ts` (MODIFY)                       | entry point / startup       | request-response | `src/index.ts` lines 57–146 — existing `runServer()` body                            | self-analog (insertion) |
| `src/utils/logger.ts` (MODIFY)                | utility / cross-cutting     | transform        | `src/utils/logger.ts` line 42 — existing `SENSITIVE_KEYS` set                        | self-analog (extension) |
| `tests/unit/auth/role-resolver.test.ts` (NEW) | test / unit                 | —                | `tests/unit/utils/sandbox-guard.test.ts` (exhaustive env-var input-class matrix)     | exact                   |
| `tests/unit/utils/logger.test.ts` (MODIFY)    | test / unit                 | —                | `tests/unit/utils/logger.test.ts` lines 11–23 — existing `redactArgs` assertions     | self-analog (extension) |

---

## Pattern Assignments

### `src/contracts/roles.ts` (NEW — contract, transform)

**Analog:** `src/contracts/filters.ts` (lines 36–47) and `src/contracts/mutations.ts` (lines 21–26)

**Imports pattern** — no imports needed; pure type exports (mirrors both analogs):

```typescript
// src/contracts/filters.ts — no imports, pure type exports
// src/contracts/mutations.ts — no imports, pure type exports
```

**Core contract pattern** (filters.ts lines 36–47, mutations.ts lines 21–26):

```typescript
// filters.ts lines 36–47
export type TagOperator = 'AND' | 'OR' | 'NOT_IN';
export type TextOperator = 'CONTAINS' | 'MATCHES';
export type DateOperator = 'BETWEEN' | '<' | '<=' | '>' | '>=';

// mutations.ts lines 21–26
export type MutationOperation = 'create' | 'update' | 'complete' | 'delete' | 'batch' | 'bulk_delete';
export type MutationTarget = 'task' | 'project' | 'folder' | 'tag';
```

**New file should replicate this shape exactly:**

```typescript
// src/contracts/roles.ts — copy the bare-export, single-source-of-truth pattern
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

**Barrel export pattern** — after creating the file, add its exports to `src/contracts/index.ts` following the existing
pattern:

```typescript
// src/contracts/index.ts lines 13–24 (existing pattern)
export {
  type TaskFilter,
  type TagOperator,
  // ...
} from './filters.js';
// Add analogous block:
export { type Role, type RoleSource, type ResolvedIdentity, type ResolvedContext } from './roles.js';
```

**File header comment pattern** (mutations.ts lines 1–12):

```typescript
/**
 * MUTATION CONTRACTS
 *
 * This is the SINGLE SOURCE OF TRUTH for mutation types and validation.
 *
 * Used by:
 * - MutationCompiler (to validate and transform input)
 * ...
 */
```

---

### `src/auth/role-resolver.ts` (NEW — utility, request-response)

**Analog:** `src/utils/sandbox-guard.ts` (entire file, 53 lines)

**File-level JSDoc pattern** (sandbox-guard.ts lines 1–19):

```typescript
/**
 * Sandbox-guard startup assertion (OMN-46).
 *
 * The MCP server's in-process write guards ... only fire when BOTH
 * `NODE_ENV='test'` AND `SANDBOX_GUARD_ENABLED='true'`. ...
 *
 * This module's `assertSandboxGuardAtStartup()` is called from the server
 * entry point. ...
 */
```

**Env-var parse pattern — default-deny** (sandbox-guard.ts lines 40–43 + index.ts lines 94–97):

```typescript
// sandbox-guard.ts lines 40–43 — optional env override, exact-value guard
export function assertSandboxGuardAtStartup(env: Record<string, string | undefined> = process.env): void {
  if (env.NODE_ENV !== 'test') return;
  if (env.SANDBOX_GUARD_ENABLED === 'true') return;
  // ...throws
}

// index.ts lines 94–97 — affirmative exact-match idiom (replicate for parseRole)
const isCIEnvironment = process.env.CI === 'true';
const isTestEnvironment = process.env.NODE_ENV === 'test';
const benchmarkMode = process.env.NO_CACHE_WARMING === 'true';
const forceCacheWarming = process.env.ENABLE_CACHE_WARMING === 'true';
```

**Fail-safe function signature pattern** (sandbox-guard.ts lines 40–43):

```typescript
// Optional env override allows unit tests to inject arbitrary values
// without touching process.env. Use NodeJS.ProcessEnv for role-resolver:
export function assertSandboxGuardAtStartup(env: Record<string, string | undefined> = process.env): void {
```

**New module functions to produce** (copy structural pattern from sandbox-guard.ts):

```typescript
// src/auth/role-resolver.ts
import type { Role, RoleSource, ResolvedIdentity } from '../contracts/roles.js';

export function parseRole(env: NodeJS.ProcessEnv = process.env): Role {
  return env.OMNIFOCUS_MCP_ROLE === 'owner' ? 'owner' : 'agent';
}

export function resolveStdioIdentity(env: NodeJS.ProcessEnv = process.env): ResolvedIdentity {
  const isExplicit = env.OMNIFOCUS_MCP_ROLE !== undefined && env.OMNIFOCUS_MCP_ROLE !== '';
  const roleSource: RoleSource = isExplicit ? 'explicit-env' : 'fail-safe-default';
  return { transport: 'stdio', roleSource, principal: null };
}

// HTTP stub — Phase 4 fills the body
export function resolveHttpIdentity(): ResolvedIdentity {
  return { transport: 'http', roleSource: 'fail-safe-default', principal: null };
}
```

**Import path convention** — `.js` extension on all relative imports (matches every existing file in `src/`):

```typescript
import type { Role, RoleSource, ResolvedIdentity } from '../contracts/roles.js';
```

---

### `src/index.ts` (MODIFY — insertion at line 139)

**Analog:** `src/index.ts` lines 57–146 — the existing `runServer()` startup sequence

**Exact insertion point** (lines 138–146):

```typescript
// lines 138–139 — warmEnd mark, then immediately the httpMode branch
    }
  }
  startupTimer.mark('warmEnd');

  // Check if we're running in HTTP mode          ← INSERT RESOLVER CALLS HERE
  if (cliConfig.httpMode) {
    await runHttpServer(cacheManager, cliConfig);
  } else {
    await runStdioServer(cacheManager);
  }
```

**Resolver call site pattern to insert between lines 139 and 141:**

```typescript
  startupTimer.mark('warmEnd');

  // Phase 1: Resolve identity and role before any tool dispatch (ROLE-01, ROLE-02, ROLE-03)
  const transport = cliConfig.httpMode ? 'http' : 'stdio';
  const identity = transport === 'stdio' ? resolveStdioIdentity() : resolveHttpIdentity();
  const role = parseRole();
  logger.info(`resolved role=${role.toUpperCase()} source=${identity.roleSource}`);

  if (cliConfig.httpMode) {
```

**Import additions to existing import block** (lines 1–18, match style):

```typescript
// Add after existing imports — match the pattern of other src/utils and src/contracts imports
import { parseRole, resolveStdioIdentity, resolveHttpIdentity } from './auth/role-resolver.js';
```

**`runStdioServer` / `runHttpServer` signature change** (lines 152, 241 — add `identity` and `role` params):

```typescript
// Current signatures:
async function runStdioServer(cacheManager: CacheManager) { ... }
async function runHttpServer(cacheManager: CacheManager, cliConfig: CLIConfig) { ... }

// Updated signatures (thread resolved context through):
async function runStdioServer(cacheManager: CacheManager, identity: ResolvedIdentity, role: Role) { ... }
async function runHttpServer(cacheManager: CacheManager, cliConfig: CLIConfig, identity: ResolvedIdentity, role: Role) { ... }
```

**Call-site update** (lines 143–146):

```typescript
// Current:
    await runHttpServer(cacheManager, cliConfig);
  } else {
    await runStdioServer(cacheManager);

// Updated:
    await runHttpServer(cacheManager, cliConfig, identity, role);
  } else {
    await runStdioServer(cacheManager, identity, role);
```

---

### `src/utils/logger.ts` (MODIFY — one-line edit at line 42)

**Analog:** `src/utils/logger.ts` line 42 (self-analog — extend the existing set)

**Current line 42:**

```typescript
const SENSITIVE_KEYS = new Set(['name', 'note', 'notes', 'taskName', 'projectName', 'tagName', 'title', 'script']);
```

**Modified line 42** (D-08 follow-through — add two keys, preserve existing order):

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
  'tokenId', // D-08 follow-through: identity fields — never log raw
]);
```

**No other changes to this file.** `redactArgs` and `createLogger` are unchanged.

---

### `tests/unit/auth/role-resolver.test.ts` (NEW — test, unit)

**Analog:** `tests/unit/utils/sandbox-guard.test.ts` (entire file, 59 lines)

**File structure pattern** (sandbox-guard.test.ts lines 1–59):

```typescript
import { describe, it, expect } from 'vitest';
import { assertSandboxGuardAtStartup, SandboxGuardMisconfiguration } from '../../../src/utils/sandbox-guard.js';

describe('assertSandboxGuardAtStartup (OMN-46)', () => {
  it('returns silently when NODE_ENV is undefined (production-shape spawn)', () => {
    expect(() => assertSandboxGuardAtStartup({})).not.toThrow();
  });

  it('returns silently when NODE_ENV !== "test" (production)', () => {
    expect(() => assertSandboxGuardAtStartup({ NODE_ENV: 'production' })).not.toThrow();
  });
  // ...
});
```

**Key patterns from sandbox-guard.test.ts to replicate:**

- Import from `'vitest'` — no `vi` import needed unless using spies
- Import path uses `../../../src/` prefix (unit tests are three levels deep)
- Import path ends in `.js` extension
- Each input class gets its own `it()` — no grouping of unrelated cases
- Env override passed as plain object literal `{ KEY: 'value' }` — not `process.env` mutation
- `expect(() => fn({})).not.toThrow()` for success cases
- `expect(() => fn({ KEY: 'val' })).toThrow(ErrorClass)` for failure cases

**Parameterized matrix pattern** — for the 14-row parse matrix, use `it.each`:

```typescript
// Vitest it.each table syntax (preferred over 14 separate its)
it.each([
  ['exact match', { OMNIFOCUS_MCP_ROLE: 'owner' }, 'owner'],
  ['unset (undefined)', {}, 'agent'],
  ['empty string', { OMNIFOCUS_MCP_ROLE: '' }, 'agent'],
  ['whitespace only', { OMNIFOCUS_MCP_ROLE: '   ' }, 'agent'],
  // ...all 14 rows
])('parseRole: %s → %s', (_label, env, expected) => {
  expect(parseRole(env as NodeJS.ProcessEnv)).toBe(expected);
});
```

**Import pattern for new test file:**

```typescript
import { describe, it, expect } from 'vitest';
import { parseRole, resolveStdioIdentity, resolveHttpIdentity } from '../../../src/auth/role-resolver.js';
import type { ResolvedIdentity } from '../../../src/contracts/roles.js';
```

---

### `tests/unit/utils/logger.test.ts` (MODIFY — add redaction assertions)

**Analog:** `tests/unit/utils/logger.test.ts` lines 11–23 — existing `redactArgs` test (self-analog)

**Existing redaction test pattern** (lines 11–23):

```typescript
it('redacts sensitive keys deeply and limits recursion', () => {
  const input: any = { name: 'A', nested: { note: 'B', deep: {} } };
  // ...
  const out = redactArgs(input);
  expect((out as any).name).toBe('[REDACTED]');
  expect((out as any).nested.note).toBe('[REDACTED]');
  expect((out as any).nested.deep).toBeTypeOf('object');
});
```

**New assertions to add** (copy pattern, new `it()` block after existing ones, before `afterAll`):

```typescript
it('redacts principal and tokenId (D-08 follow-through)', () => {
  const out = redactArgs({ principal: 'tok_abc123', tokenId: 'id_xyz', role: 'owner' });
  expect((out as any).principal).toBe('[REDACTED]');
  expect((out as any).tokenId).toBe('[REDACTED]');
  expect((out as any).role).toBe('owner'); // non-sensitive key passes through
});

it('redacts principal nested inside an identity object', () => {
  const out = redactArgs({ identity: { principal: 'tok_abc', roleSource: 'explicit-env' } });
  expect((out as any).identity.principal).toBe('[REDACTED]');
  expect((out as any).identity.roleSource).toBe('explicit-env');
});
```

---

## Shared Patterns

### Env-var Parse (Default-Deny)

**Source:** `src/index.ts` lines 94–97, `src/utils/sandbox-guard.ts` lines 40–43 **Apply to:**
`src/auth/role-resolver.ts` `parseRole()` and `resolveStdioIdentity()`

```typescript
// Exact-value equality — every non-match is the safe default
const isCIEnvironment = process.env.CI === 'true'; // affirmative form
const shouldAutoStart = process.env.MCP_SKIP_AUTO_START !== 'true'; // negation form

// Role resolver uses affirmative form with structural whitelist:
return env.OMNIFOCUS_MCP_ROLE === 'owner' ? 'owner' : 'agent';
```

### Optional Env Override (Testability)

**Source:** `src/utils/sandbox-guard.ts` line 40 **Apply to:** `src/auth/role-resolver.ts` all exported functions

```typescript
export function assertSandboxGuardAtStartup(env: Record<string, string | undefined> = process.env): void {
// Role resolver mirrors this: env: NodeJS.ProcessEnv = process.env
```

### String-Literal Union Contract

**Source:** `src/contracts/filters.ts` lines 36–47, `src/contracts/mutations.ts` lines 21–26 **Apply to:**
`src/contracts/roles.ts` (all type definitions)

```typescript
export type TagOperator = 'AND' | 'OR' | 'NOT_IN';
export type MutationOperation = 'create' | 'update' | 'complete' | 'delete' | 'batch' | 'bulk_delete';
// Role: same bare export pattern, no classes, no enums
```

### Sensitive Key Redaction

**Source:** `src/utils/logger.ts` line 42 **Apply to:** extend the `SENSITIVE_KEYS` set (one-line edit only)

```typescript
const SENSITIVE_KEYS = new Set(['name', 'note', 'notes', 'taskName', 'projectName', 'tagName', 'title', 'script']);
// D-08: add 'principal', 'tokenId' to this set
```

### Logger Startup Info Line

**Source:** `src/index.ts` lines 119–121, 152–153 (existing `logger.info(...)` calls in startup sequence) **Apply to:**
D-09 log line in `src/index.ts` resolver call site

```typescript
logger.info('OmniFocus permissions verified'); // existing pattern
logger.info('Starting server in stdio mode'); // existing pattern
logger.info(`resolved role=${role.toUpperCase()} source=${identity.roleSource}`); // new — same style
```

### Import Extension Convention

**Source:** Every file in `src/` uses `.js` extensions on relative imports **Apply to:** All new files

```typescript
import { assertSandboxGuardAtStartup } from './utils/sandbox-guard.js'; // existing
import { parseRole, resolveStdioIdentity } from './auth/role-resolver.js'; // new
```

---

## Line Number Verification Notes

All line numbers cited in RESEARCH.md were verified against the live source files during this mapping session
(2026-06-03):

| Claim                                                      | Verified? | Current state                                                                    |
| ---------------------------------------------------------- | --------- | -------------------------------------------------------------------------------- | ------------------------- |
| `SENSITIVE_KEYS` at `logger.ts` line 42                    | YES       | Confirmed exactly — `new Set([...8 keys...])`                                    |
| Env-var parse idioms at `index.ts` lines 94–97             | YES       | Lines 94–97 match (`CI`, `NODE_ENV`, `NO_CACHE_WARMING`, `ENABLE_CACHE_WARMING`) |
| `shouldAutoStart` at `index.ts` line 309                   | YES       | Line 309 — `process.env.MCP_SKIP_AUTO_START !== 'true'`                          |
| `startupTimer.mark('warmEnd')` at line 139                 | YES       | Confirmed; `if (cliConfig.httpMode)` branch follows immediately at line 142      |
| `registerTools` called at line 175 inside `runStdioServer` | YES       | Line 175 confirmed                                                               |
| `TagOperator` at `filters.ts` line 36                      | YES       | Confirmed                                                                        |
| `MutationOperation` at `mutations.ts` line 21              | YES       | Confirmed                                                                        |
| `assertSandboxGuardAtStartup` signature                    | YES       | `env: Record<string, string                                                      | undefined> = process.env` |

---

## No Analog Found

No files in this phase are without analogs. All 6 files have direct or self-analogs.

---

## Metadata

**Analog search scope:** `src/contracts/`, `src/utils/`, `src/index.ts`, `tests/unit/utils/` **Files scanned:** 8 source
files read in full **Pattern extraction date:** 2026-06-03
