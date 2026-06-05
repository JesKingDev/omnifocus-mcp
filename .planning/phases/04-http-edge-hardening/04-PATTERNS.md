# Phase 4: HTTP Edge Hardening — Pattern Map

**Mapped:** 2026-06-05 **Files analyzed:** 6 (1 new, 5 modified) **Analogs found:** 6 / 6

---

## File Classification

| New/Modified File            | Role               | Data Flow        | Closest Analog                                  | Match Quality                                                   |
| ---------------------------- | ------------------ | ---------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| `src/auth/token-registry.ts` | utility/auth       | request-response | `src/auth/role-resolver.ts`                     | role-match (same auth module, same env-input pattern)           |
| `src/auth/role-resolver.ts`  | utility/auth       | request-response | self — fill stub; mirror `resolveStdioIdentity` | exact (same file, same return type)                             |
| `src/session-manager.ts`     | service            | request-response | self — targeted surgery                         | exact (same file, Phase 3 seam comments mark the change points) |
| `src/http-server.ts`         | service/middleware | request-response | self — two additions                            | exact (same file)                                               |
| `src/utils/cli.ts`           | config/utility     | request-response | self — extend existing pattern                  | exact (same file)                                               |
| `src/index.ts`               | config/startup     | request-response | self — remove unused prefixes                   | exact (same file)                                               |

### Test files (new/modified)

| File                                     | Role          | Analog                                                                 |
| ---------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| `tests/unit/auth/token-registry.test.ts` | test          | `tests/unit/auth/role-resolver.test.ts`                                |
| `tests/unit/http-server.test.ts`         | test          | `tests/unit/utils/sandbox-guard.test.ts` (env-gated throw pattern)     |
| `tests/unit/utils/cli.test.ts`           | test          | `tests/unit/utils/sandbox-guard.test.ts` (throw-on-bad-config pattern) |
| `tests/unit/auth/role-resolver.test.ts`  | test (modify) | self — update stub test at lines 106-115                               |

---

## Pattern Assignments

### `src/auth/token-registry.ts` (NEW — utility, request-response)

**Analog:** `src/auth/role-resolver.ts`

**Imports pattern** — copy these exact import forms (`src/auth/role-resolver.ts` lines 30):

```typescript
import type { Role, RoleSource, ResolvedIdentity } from '../contracts/roles.js';
```

For the new file, the analogous import block is:

```typescript
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Role } from '../contracts/roles.js';
```

**Module header doc-comment pattern** (`src/auth/role-resolver.ts` lines 1-28) — the existing auth module uses a
multi-line JSDoc block naming the phase, the contracts it implements, and the anti-patterns it explicitly avoids. Copy
that structure for `token-registry.ts`, citing D-04, D-05, D-09, D-10 and listing the explicit anti-patterns
(early-return, `===` compare, `timingSafeEqual` without hash normalization).

**Export shape pattern** — `role-resolver.ts` exports plain functions and a type, no class. Match that style:

```typescript
// From src/auth/role-resolver.ts lines 42-43, 55, 78 — export shape to mirror:
export function parseRole(env: Record<string, string | undefined> = process.env): Role { ... }
export function resolveStdioIdentity(env: Record<string, string | undefined> = process.env): ResolvedIdentity { ... }
export function resolveHttpIdentity(): ResolvedIdentity { ... }
```

The new file exports:

- `TokenEntry` interface
- `buildTokenRegistry(env)` → `Map<string, TokenEntry>`
- `validateTokenSet(candidate, registry)` → `TokenEntry | null`

**Core constant-time compare pattern** (from RESEARCH.md Code Examples — verified against Node.js stdlib):

```typescript
// D-04: accumulate across ALL tokens, branch once
function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

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

  return anyMatch ? matched : null; // D-05: null on no match, never a default role
}
```

**Registry construction pattern** (from RESEARCH.md Code Examples):

```typescript
export function buildTokenRegistry(env: Record<string, string | undefined>): Map<string, TokenEntry> {
  const registry = new Map<string, TokenEntry>();
  const agentToken = env.MCP_AGENT_TOKEN ?? env.MCP_AUTH_TOKEN; // D-11 backward-compat alias
  const ownerToken = env.MCP_OWNER_TOKEN;
  if (agentToken) registry.set(agentToken, { role: 'agent', principal: 'http-agent' });
  if (ownerToken) registry.set(ownerToken, { role: 'owner', principal: 'http-owner' });
  return registry;
}
```

---

### `src/auth/role-resolver.ts` (modify — fill stub)

**Analog:** self — `resolveStdioIdentity` is the exact signature/return-shape mirror.

**Stub to replace** (`src/auth/role-resolver.ts` lines 78-86):

```typescript
// CURRENT STUB — lines 78-86:
export function resolveHttpIdentity(): ResolvedIdentity {
  return {
    transport: 'http',
    roleSource: 'fail-safe-default',
    principal: null,
  };
}
```

**Pattern to mirror** — `resolveStdioIdentity` signature (`src/auth/role-resolver.ts` lines 55-63):

```typescript
export function resolveStdioIdentity(env: Record<string, string | undefined> = process.env): ResolvedIdentity {
  const isExplicit = env.OMNIFOCUS_MCP_ROLE !== undefined && env.OMNIFOCUS_MCP_ROLE !== '';
  const roleSource: RoleSource = isExplicit ? 'explicit-env' : 'fail-safe-default';
  return {
    transport: 'stdio',
    roleSource,
    principal: null,
  };
}
```

**New signature** (Option A from RESEARCH.md — preferred, separation of concerns):

```typescript
// Phase 4 fill — accepts a TokenEntry already resolved by the caller
export function resolveHttpIdentity(entry: TokenEntry): ResolvedIdentity {
  return {
    transport: 'http',
    roleSource: 'http-token',
    principal: entry.principal,
  };
}
```

`TokenEntry` must be imported from `'./token-registry.js'`. `RoleSource` is already imported (line 30).

**Required import addition** at line 30:

```typescript
// Existing:
import type { Role, RoleSource, ResolvedIdentity } from '../contracts/roles.js';
// Add:
import type { TokenEntry } from './token-registry.js';
```

---

### `src/session-manager.ts` (modify — per-session role wiring)

**Change points** — all located within the existing file.

**Constructor fields to remove** (`src/session-manager.ts` lines 33-39):

```typescript
// REMOVE these Phase 3 seam fields:
private authToken?: string;           // line 33
private readonly role: Role;          // line 38
private readonly context: ResolvedContext;  // line 39
```

**Constructor body to remove** (`src/session-manager.ts` lines 45-51):

```typescript
// REMOVE from constructor:
this.authToken = authToken; // line 45
const identity = resolveStdioIdentity(); // line 49
this.role = parseRole(); // line 50
this.context = { identity, role: this.role }; // line 51
```

**Constructor signature to change** (`src/session-manager.ts` line 41):

```typescript
// FROM:
constructor(cacheManager: CacheManager, authToken?: string, sessionTimeout: number = 30 * 60 * 1000)
// TO:
constructor(cacheManager: CacheManager, sessionTimeout: number = 30 * 60 * 1000)
```

**`createSession` signature to change** (`src/session-manager.ts` line 91):

```typescript
// FROM:
async createSession(sessionId: string): Promise<SessionConfig>
// TO:
async createSession(sessionId: string, role: Role, context: ResolvedContext): Promise<SessionConfig>
```

**`registerTools` call to change** (`src/session-manager.ts` line 127):

```typescript
// FROM (Phase 3 seam — startup-resolved role):
await registerTools(server, this.cacheManager, this.pendingOperations, this.role, this.context);
// TO (Phase 4 — per-session role from caller):
await registerTools(server, this.cacheManager, this.pendingOperations, role, context);
```

**`validateAuthToken` method to delete** (`src/session-manager.ts` lines 277-289) — replaced entirely by
`validateTokenSet` in `token-registry.ts`. Remove the whole method.

**Logger pattern** (keep — `src/session-manager.ts` lines 56-59):

```typescript
logger.info('SessionManager initialized', {
  sessionTimeoutMinutes: this.sessionTimeout / 60000,
  authEnabled: !!this.authToken, // update field name after removing authToken
});
```

**Imports to remove**: `parseRole`, `resolveStdioIdentity` from `'./auth/role-resolver.js'` (line 10). Keep
`ResolvedContext` and `Role` type imports (line 11).

---

### `src/http-server.ts` (modify — two additions + auth overhaul)

**Constructor signature to change** (`src/http-server.ts` lines 17-22):

```typescript
// FROM:
constructor(sessionManager: SessionManager, port: number, host: string, authToken?: string)
// Remove private authToken?: string field (line 15) and constructor assignment (line 21).
// Add tokenRegistry and allowedHosts fields:
private tokenRegistry: ReadonlyMap<string, TokenEntry>;
private allowedHosts: string[];

constructor(
  sessionManager: SessionManager,
  port: number,
  host: string,
  tokenRegistry: ReadonlyMap<string, TokenEntry>,
  allowedHosts: string[] = [],
)
```

**Auth gate to replace** (`src/http-server.ts` lines 119-124):

```typescript
// FROM (conditional — D-07 violation):
if (this.authToken && !this.validateAuthentication(req)) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }));
  return;
}

// TO (unconditional — mandatory auth per D-07):
const tokenEntry = this.resolveTokenFromHeader(req);
if (!tokenEntry) {
  logger.warn('Unauthorized request', { requestId });
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized', message: 'Valid bearer token required' }));
  return;
}
```

**New middleware to add before OPTIONS check** — DNS-rebinding guard (D-14, D-15). Insert at `handleRequest` lines
100-113, before the OPTIONS block:

```typescript
// Pattern from RESEARCH.md Pattern 5 — add before OPTIONS handling:
if (!this.validateHostOrigin(req)) {
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Bad Request', message: 'Host/Origin not in allowlist' }));
  return;
}
```

**`validateAuthentication` to replace** (`src/http-server.ts` lines 181-199) — swap the whole method for
`resolveTokenFromHeader`:

```typescript
// FROM:
private validateAuthentication(_req: IncomingMessage): boolean {
  // ...
  return this.sessionManager.validateAuthToken(token); // === compare
}

// TO:
private resolveTokenFromHeader(req: IncomingMessage): TokenEntry | null {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
  if (!match?.[1]) return null;
  return validateTokenSet(match[1], this.tokenRegistry); // constant-time
}
```

**`handleMcpPostRequest` session creation to change** (`src/http-server.ts` line 259):

```typescript
// FROM:
session = await this.sessionManager.createSession(newSessionId);
// TO (pass per-session role and context resolved from tokenEntry):
const identity = resolveHttpIdentity(tokenEntry);
const context: ResolvedContext = { identity, role: tokenEntry.role };
session = await this.sessionManager.createSession(newSessionId, tokenEntry.role, context);
```

`tokenEntry` must be threaded from `handleRequest` into `handleMcpPostRequest`. The cleanest approach: pass it as a
parameter since `handleMcpRequest` and `handleMcpPostRequest` are already chained.

**`handleOptionsRequest` CORS wildcard to tighten** (`src/http-server.ts` lines 168-176):

```typescript
// FROM:
'Access-Control-Allow-Origin': '*',
// TO: reflect the allowlist (loopback + MCP_ALLOWED_HOSTS):
'Access-Control-Allow-Origin': this.buildCorsOriginHeader(req),
```

**Error handling pattern** (established, keep) — every handler follows the try/catch + `writeHead(500)` shape at lines
154-162. New methods must match.

**Imports to add**:

```typescript
import { validateTokenSet, buildTokenRegistry } from './auth/token-registry.js';
import type { TokenEntry } from './auth/token-registry.js';
import { resolveHttpIdentity } from './auth/role-resolver.js';
import type { ResolvedContext } from './contracts/roles.js';
```

---

### `src/utils/cli.ts` (modify — default change + new env vars + new assertions)

**Default to change** (`src/utils/cli.ts` line 21):

```typescript
// FROM:
host: '0.0.0.0',
// TO (D-13):
host: '127.0.0.1',
```

**`CLIConfig` interface to extend** (`src/utils/cli.ts` lines 8-13):

```typescript
// FROM:
export interface CLIConfig {
  httpMode: boolean;
  port: number;
  host: string;
  authToken?: string;
}
// TO — add D-09 token fields and D-15 allowlist:
export interface CLIConfig {
  httpMode: boolean;
  port: number;
  host: string;
  authToken?: string; // D-11: retained for backward-compat; treated as agentToken alias
  agentToken?: string; // D-09: MCP_AGENT_TOKEN
  ownerToken?: string; // D-09: MCP_OWNER_TOKEN
  allowedHosts?: string[]; // D-15: MCP_ALLOWED_HOSTS (parsed comma-separated)
}
```

**`parseCLIArgs` env block to extend** (`src/utils/cli.ts` lines 74-77):

```typescript
// FROM:
if (process.env.MCP_AUTH_TOKEN) config.authToken = process.env.MCP_AUTH_TOKEN;
if (process.env.MCP_PORT) config.port = parsePort(process.env.MCP_PORT, 'MCP_PORT', config.port);
if (process.env.MCP_HOST) config.host = process.env.MCP_HOST;

// TO — add D-09, D-11 alias, D-15:
if (process.env.MCP_AGENT_TOKEN) config.agentToken = process.env.MCP_AGENT_TOKEN;
if (process.env.MCP_OWNER_TOKEN) config.ownerToken = process.env.MCP_OWNER_TOKEN;
if (process.env.MCP_AUTH_TOKEN && !config.agentToken) {
  // D-11 backward-compat alias — emit deprecation warning
  logger.warn('MCP_AUTH_TOKEN is deprecated. Set MCP_AGENT_TOKEN instead.');
  config.agentToken = process.env.MCP_AUTH_TOKEN;
}
if (process.env.MCP_ALLOWED_HOSTS) {
  config.allowedHosts = process.env.MCP_ALLOWED_HOSTS.split(',')
    .map((h) => h.trim())
    .filter(Boolean);
}
```

**`validateCLIConfig` assertions to add** (`src/utils/cli.ts` lines 92-102) — extend the existing `if (config.httpMode)`
block. Existing pattern for error messages (note the specific wording style):

```typescript
// Existing pattern to copy:
if (config.port <= 0 || config.port >= 65536) {
  throw new Error(`Invalid port: ${config.port}. Port must be between 1 and 65535.`);
}
```

New assertions follow the same `throw new Error(...)` shape:

```typescript
// D-13: loopback-only bind
if (config.host !== '127.0.0.1' && config.host !== 'localhost') {
  throw new Error(
    `HTTP mode requires loopback bind. Got host="${config.host}". ` +
      `Set to 127.0.0.1 (default). Remote access is via Tailscale Serve proxying to loopback.`,
  );
}
// D-07: mandatory agent token
if (!config.agentToken) {
  throw new Error('MCP_AGENT_TOKEN is required in HTTP mode. Generate one with: openssl rand -hex 32');
}
// D-06: distinct tokens
if (config.ownerToken && config.agentToken === config.ownerToken) {
  throw new Error(
    'MCP_AGENT_TOKEN and MCP_OWNER_TOKEN must be different. ' + 'Generate distinct tokens with: openssl rand -hex 32',
  );
}
// D-06: non-blank owner token
if (config.ownerToken !== undefined && config.ownerToken.trim() === '') {
  throw new Error('MCP_OWNER_TOKEN must not be empty or whitespace-only.');
}
```

**`printHelp` to update** (`src/utils/cli.ts` lines 107-136) — add `MCP_AGENT_TOKEN`, `MCP_OWNER_TOKEN`,
`MCP_ALLOWED_HOSTS` to the env vars section; mark `MCP_AUTH_TOKEN` as deprecated.

**Logger redaction pattern** — existing at line 84, keep same shape for new token fields:

```typescript
// Existing pattern:
authToken: config.authToken ? '[REDACTED]' : undefined,
// Apply same to new fields:
agentToken: config.agentToken ? '[REDACTED]' : undefined,
ownerToken: config.ownerToken ? '[REDACTED]' : undefined,
```

---

### `src/index.ts` (modify — remove unused prefixed params)

**`runHttpServer` function signature** (`src/index.ts` lines 249-254):

```typescript
// FROM — _identity and _role are unused (Phase 3 stubs):
async function runHttpServer(
  cacheManager: CacheManager,
  cliConfig: CLIConfig,
  _identity: ResolvedIdentity,
  _role: Role,
);

// TO — remove prefixed unused params; build registry from config:
async function runHttpServer(cacheManager: CacheManager, cliConfig: CLIConfig);
```

**Call site at line 150-151**:

```typescript
// FROM:
const identity = cliConfig.httpMode ? resolveHttpIdentity() : resolveStdioIdentity();
const role = parseRole();
// ...
await runHttpServer(cacheManager, cliConfig, identity, role);

// TO — identity/role for stdio unchanged; HTTP mode resolves per-request:
if (cliConfig.httpMode) {
  await runHttpServer(cacheManager, cliConfig);
} else {
  const identity = resolveStdioIdentity();
  const role = parseRole();
  await runStdioServer(cacheManager, identity, role);
}
```

**`runHttpServer` body — registry construction** (add after `validateCLIConfig`):

```typescript
// Build token registry from config (D-09) — passed to HttpServerManager
const tokenRegistry = buildTokenRegistry({
  MCP_AGENT_TOKEN: cliConfig.agentToken,
  MCP_OWNER_TOKEN: cliConfig.ownerToken,
});

// SessionManager no longer takes authToken
const sessionManager = new SessionManager(cacheManager);

// HttpServerManager takes tokenRegistry instead of authToken
const httpServerManager = new HttpServerManager(
  sessionManager,
  cliConfig.port,
  cliConfig.host,
  tokenRegistry,
  cliConfig.allowedHosts ?? [],
);
```

**Lines to update** (`src/index.ts` lines 272-276):

```typescript
// FROM:
const sessionManager = new SessionManager(cacheManager, cliConfig.authToken);
const httpServerManager = new HttpServerManager(sessionManager, cliConfig.port, cliConfig.host, cliConfig.authToken);
```

---

## Shared Patterns

### Bearer token extraction (regex)

**Source:** `src/http-server.ts` lines 192-194 — keep this exact regex, it's established:

```typescript
const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
if (!match?.[1]) return null;
const token = match[1];
```

Apply to: `resolveTokenFromHeader` in `http-server.ts`.

### Error response shape

**Source:** `src/http-server.ts` lines 121-123 — all HTTP error responses use this shape:

```typescript
res.writeHead(401, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }));
```

Apply to: every new rejection path in `handleRequest` (Host/Origin check returns 400; missing token returns 401).

### Startup fail-closed throw

**Source:** `src/utils/cli.ts` lines 94-96 — existing `validateCLIConfig` pattern:

```typescript
if (config.port <= 0 || config.port >= 65536) {
  throw new Error(`Invalid port: ${config.port}. Port must be between 1 and 65535.`);
}
```

Apply to: all new D-06/D-07/D-13 assertions in `validateCLIConfig`.

### Sensitive-value redaction in logs

**Source:** `src/utils/cli.ts` line 84:

```typescript
authToken: config.authToken ? '[REDACTED]' : undefined,
```

Apply to: `agentToken` and `ownerToken` in the debug log block.

### `getSafeHeaders` redaction

**Source:** `src/http-server.ts` lines 455-474 — `authorization` is already in `sensitiveHeaders`. No change needed; the
new token fields never appear in headers by name.

---

## Test File Patterns

### `tests/unit/auth/token-registry.test.ts` (NEW)

**Analog:** `tests/unit/auth/role-resolver.test.ts`

**Import pattern** (`role-resolver.test.ts` lines 1-3):

```typescript
import { describe, it, expect } from 'vitest';
import { parseRole, resolveStdioIdentity, resolveHttpIdentity } from '../../../src/auth/role-resolver.js';
import type { ResolvedIdentity } from '../../../src/contracts/roles.js';
```

Mirror for `token-registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildTokenRegistry, validateTokenSet } from '../../../src/auth/token-registry.js';
import type { TokenEntry } from '../../../src/auth/token-registry.js';
```

**Test structure pattern** (`role-resolver.test.ts` lines 13-43) — uses `it.each` with a labeled matrix for exhaustive
input classes. Apply same to `validateTokenSet`:

```typescript
describe('validateTokenSet — token set validation matrix', () => {
  it.each<{ label: string; ... }>([
    // ...
  ])('$label', (...) => { ... });
});
```

**Sections to cover** (from RESEARCH.md Phase Requirements → Test Map):

- `validateTokenSet` rejects missing/empty candidate → null
- `validateTokenSet` rejects wrong token → null
- `validateTokenSet` matches agent token → `{ role: 'agent', principal: 'http-agent' }`
- `validateTokenSet` matches owner token → `{ role: 'owner', principal: 'http-owner' }`
- Length-mismatched tokens do not throw (SHA-256 hash normalization)
- `buildTokenRegistry` with `MCP_AUTH_TOKEN` alias (no `MCP_AGENT_TOKEN`) maps to agent role
- `buildTokenRegistry` with both tokens creates two-entry map

### `tests/unit/utils/cli.test.ts` (NEW — does not exist yet)

**Analog:** `tests/unit/utils/sandbox-guard.test.ts`

**Import + structure pattern** (`sandbox-guard.test.ts` lines 1-7):

```typescript
import { describe, it, expect } from 'vitest';
import { assertSandboxGuardAtStartup, SandboxGuardMisconfiguration } from '../../../src/utils/sandbox-guard.js';

describe('assertSandboxGuardAtStartup (OMN-46)', () => {
  it('returns silently when NODE_ENV is undefined (production-shape spawn)', () => {
    expect(() => assertSandboxGuardAtStartup({})).not.toThrow();
  });
  it('THROWS SandboxGuardMisconfiguration when ...', () => {
    expect(() => assertSandboxGuardAtStartup({ NODE_ENV: 'test' })).toThrow(SandboxGuardMisconfiguration);
  });
```

Mirror for `cli.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateCLIConfig } from '../../../src/utils/cli.js';
import type { CLIConfig } from '../../../src/utils/cli.js';

describe('validateCLIConfig — HTTP mode assertions', () => {
  const base: CLIConfig = { httpMode: true, port: 3000, host: '127.0.0.1', agentToken: 'x'.repeat(64) };

  it('does not throw for a valid HTTP config', () => {
    expect(() => validateCLIConfig(base)).not.toThrow();
  });
  it('throws on non-loopback host (D-13)', () => {
    expect(() => validateCLIConfig({ ...base, host: '0.0.0.0' })).toThrow(/loopback/);
  });
  it('throws when agentToken absent in HTTP mode (D-07)', () => {
    expect(() => validateCLIConfig({ ...base, agentToken: undefined })).toThrow(/MCP_AGENT_TOKEN/);
  });
  it('throws when agentToken === ownerToken (D-06)', () => {
    expect(() => validateCLIConfig({ ...base, ownerToken: base.agentToken })).toThrow(/different/);
  });
  it('throws on blank ownerToken (D-06)', () => {
    expect(() => validateCLIConfig({ ...base, ownerToken: '   ' })).toThrow(/empty/);
  });
  it('does not apply HTTP assertions in stdio mode', () => {
    expect(() => validateCLIConfig({ httpMode: false, port: 3000, host: '0.0.0.0' })).not.toThrow();
  });
});
```

### `tests/unit/http-server.test.ts` (NEW)

**Analog:** `tests/unit/utils/sandbox-guard.test.ts` (isolated unit, function-level, no live server)

Test `validateHostOrigin` as a pure function by extracting it or testing via a minimal `HttpServerManager` stub. Key
cases:

- Unknown `Host` header → returns false / `handleRequest` yields 400
- `localhost` and `127.0.0.1` always allowed
- `MCP_ALLOWED_HOSTS` entry allowed
- Malformed `Origin` → false

### `tests/unit/auth/role-resolver.test.ts` (MODIFY — update stub test)

**Existing stub test to replace** (lines 106-115):

```typescript
// CURRENT — asserts zero-argument form (must be replaced):
describe('resolveHttpIdentity — Phase 4 stub contract', () => {
  it('returns the Phase 4 stub shape: transport=http, roleSource=fail-safe-default, principal=null', () => {
    const identity: ResolvedIdentity = resolveHttpIdentity();
    expect(identity).toStrictEqual({
      transport: 'http',
      roleSource: 'fail-safe-default',
      principal: null,
    });
  });
});
```

**Replacement** — update describe block to cover the filled implementation:

```typescript
describe('resolveHttpIdentity — Phase 4 implementation', () => {
  it('returns transport=http, roleSource=http-token, principal from agent TokenEntry', () => {
    const entry: TokenEntry = { role: 'agent', principal: 'http-agent' };
    const identity = resolveHttpIdentity(entry);
    expect(identity).toStrictEqual({
      transport: 'http',
      roleSource: 'http-token',
      principal: 'http-agent',
    });
  });
  it('returns roleSource=http-token, principal=http-owner for owner TokenEntry', () => {
    const entry: TokenEntry = { role: 'owner', principal: 'http-owner' };
    const identity = resolveHttpIdentity(entry);
    expect(identity.roleSource).toBe('http-token');
    expect(identity.principal).toBe('http-owner');
  });
});
```

Add `TokenEntry` import from `'../../../src/auth/token-registry.js'`.

---

## No Analog Found

None. All six files have clear existing analogs or are self-modifications with seam comments already in place.

---

## Metadata

**Analog search scope:** `src/auth/`, `src/utils/`, `src/`, `tests/unit/auth/`, `tests/unit/utils/` **Files read:**
`role-resolver.ts`, `session-manager.ts`, `http-server.ts`, `cli.ts`, `index.ts`, `contracts/roles.ts`,
`tests/unit/auth/role-resolver.test.ts`, `tests/unit/auth/operation-policy.test.ts`,
`tests/unit/utils/sandbox-guard.test.ts` **Pattern extraction date:** 2026-06-05

---

## PATTERN MAPPING COMPLETE
