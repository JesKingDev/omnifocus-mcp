---
phase: 04-http-edge-hardening
plan: '01'
subsystem: auth/http
tags:
  - tdd
  - wave-0
  - http-security
  - authentication
  - dns-rebinding
dependency_graph:
  requires: []
  provides:
    - tests/unit/auth/token-registry.test.ts
    - tests/unit/auth/role-resolver.test.ts
    - tests/unit/utils/cli.test.ts
    - tests/unit/http-server.test.ts
  affects:
    - src/auth/token-registry.ts (Wave 1 must satisfy these contracts)
    - src/auth/role-resolver.ts (Wave 1 must satisfy resolveHttpIdentity signature)
    - src/utils/cli.ts (Wave 1 must satisfy validateCLIConfig assertions)
    - src/http-server.ts (Wave 1 must export buildAllowedHostSet, isHostAllowed)
tech_stack:
  added: []
  patterns:
    - vitest it.each matrix for input-class coverage
    - standalone exported pure functions for unit-testable private methods
key_files:
  created:
    - tests/unit/auth/token-registry.test.ts
    - tests/unit/utils/cli.test.ts
    - tests/unit/http-server.test.ts
  modified:
    - tests/unit/auth/role-resolver.test.ts
decisions:
  - 'Wave 0 token-registry tests use fixed hex-like strings (a.repeat(64)) per plan — no Math.random'
  - 'http-server tests target buildAllowedHostSet/isHostAllowed pure function exports — Wave 1 must honour this shape'
  - '192.168.1.100 test case suppressed with eslint-disable sonarjs/no-hardcoded-ip (test fixture, not real infra)'
  - 'role-resolver stub test replaced entirely — no fail-safe-default assertions remain in resolveHttpIdentity describe
    block'
metrics:
  duration: 341s
  completed: '2026-06-05'
  tasks: 2
  files: 4
---

# Phase 4 Plan 1: Wave 0 RED Test Contracts Summary

Wave 0 Nyquist gate for Phase 4 HTTP edge hardening. Four test files establish the failing contract that implementation
waves must satisfy: constant-time token registry (HTTP-01/HTTP-05), startup loopback/token assertions (HTTP-02/HTTP-04),
and DNS-rebinding Host/Origin allowlist (HTTP-03).

## Tasks Completed

| Task | Name                                               | Commit  | Files                                                                         |
| ---- | -------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| 1    | token-registry.test.ts + role-resolver stub update | f39da87 | tests/unit/auth/token-registry.test.ts, tests/unit/auth/role-resolver.test.ts |
| 2    | cli.test.ts + http-server.test.ts                  | 90d1aa8 | tests/unit/utils/cli.test.ts, tests/unit/http-server.test.ts                  |

## Test Contracts Written

### tests/unit/auth/token-registry.test.ts (NEW — 9 tests, all RED)

Covers HTTP-01 and HTTP-05:

- `validateTokenSet` rejects empty candidate, wrong token, and empty registry (null returns)
- `validateTokenSet` matches agent token → `{ role: 'agent', principal: 'http-agent' }`
- `validateTokenSet` matches owner token → `{ role: 'owner', principal: 'http-owner' }`
- Length-mismatched candidate does not throw (SHA-256 hash normalization guard — D-04)
- Two-token registry: both entries reachable by calling validateTokenSet with each token
- `buildTokenRegistry` with MCP_AGENT_TOKEN, MCP_OWNER_TOKEN, MCP_AUTH_TOKEN alias, both, and empty env

RED signal: module `src/auth/token-registry.ts` does not exist — import fails at runtime.

### tests/unit/auth/role-resolver.test.ts (MODIFIED — 2 new tests RED, 19 passing)

Replaced the "Phase 4 stub contract" describe block with "Phase 4 implementation" block:

- `resolveHttpIdentity({ role: 'agent', principal: 'http-agent' })` → `roleSource: 'http-token'`,
  `principal: 'http-agent'`
- `resolveHttpIdentity({ role: 'owner', principal: 'http-owner' })` → `roleSource: 'http-token'`,
  `principal: 'http-owner'`

Added `TokenEntry` type import from `src/auth/token-registry.js`.

RED signal: source still has zero-argument stub signature returning `fail-safe-default`; `token-registry.js` does not
exist.

### tests/unit/utils/cli.test.ts (NEW — 7 tests, 5 RED, 2 passing)

Covers HTTP-02, HTTP-04, HTTP-05:

- Valid HTTP config → does not throw (passing — existing behavior)
- Non-loopback host (`0.0.0.0`) → throws `/loopback/` (RED — assertion not yet in source)
- External host → throws `/loopback/` (RED)
- Missing `agentToken` in HTTP mode → throws `/MCP_AGENT_TOKEN/` (RED)
- `agentToken === ownerToken` → throws `/different/` (RED)
- Blank `ownerToken` → throws `/empty/` (RED)
- stdio mode with `0.0.0.0` → does not throw (passing — Pitfall 5 guard)

RED signal: `CLIConfig` interface lacks `agentToken`/`ownerToken` fields; `validateCLIConfig` lacks the new assertions.

### tests/unit/http-server.test.ts (NEW — 10 tests, all RED)

Covers HTTP-03:

- `buildAllowedHostSet(3000, [])` always includes `localhost`, `127.0.0.1`, `localhost:3000`, `127.0.0.1:3000`
- `buildAllowedHostSet(3000, ['my-mac.tail.ts.net'])` includes the tailnet hostname
- Empty `allowedHosts` → exactly 4 entries
- `isHostAllowed('localhost', set)` → true
- `isHostAllowed('127.0.0.1', set)` → true
- `isHostAllowed('127.0.0.1:3000', set)` → true
- `isHostAllowed('evil.attacker.com', set)` → false
- `isHostAllowed('my-mac.tail.ts.net', set)` → true (with MCP_ALLOWED_HOSTS entry)
- `isHostAllowed(undefined, set)` → false (no Host header → deny)

RED signal: `http-server.ts` does not export `buildAllowedHostSet` or `isHostAllowed`.

## Verification Results

| Check                                                       | Result                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| npm run test:unit — overall                                 | 4 failed, 109 passed (113 total)                            |
| New/modified test files fail RED                            | Yes — all 4 files fail as expected                          |
| Failing tests traceable to missing source                   | Yes — module not found / assertions absent                  |
| Pre-existing 109 test files pass                            | Yes — unmodified, all green                                 |
| No .js files created                                        | Confirmed                                                   |
| "fail-safe-default" not in resolveHttpIdentity expectations | Confirmed — 4 occurrences all in resolveStdioIdentity tests |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint sonarjs/no-hardcoded-ip rejection on test fixture IP**

- **Found during:** Task 2 commit hook
- **Issue:** `192.168.1.100` in cli.test.ts triggered `sonarjs/no-hardcoded-ip` error, blocking commit
- **Fix:** Added `// eslint-disable-next-line sonarjs/no-hardcoded-ip` with an explanatory comment confirming it is a
  test fixture, not real infrastructure
- **Files modified:** `tests/unit/utils/cli.test.ts`
- **Commit:** 90d1aa8

No other deviations. Plan executed as written.

## Known Stubs

None in these test files — they are the contract stubs awaiting Wave 1 implementation.

## Threat Flags

None. This plan creates test files only; no new network endpoints, auth paths, file access patterns, or schema changes
were introduced.

## Self-Check: PASSED

- [x] tests/unit/auth/token-registry.test.ts exists (9 tests)
- [x] tests/unit/auth/role-resolver.test.ts modified (stub block replaced)
- [x] tests/unit/utils/cli.test.ts exists (7 tests)
- [x] tests/unit/http-server.test.ts exists (10 tests)
- [x] Commit f39da87 exists: `git log --oneline | grep f39da87` ✓
- [x] Commit 90d1aa8 exists: `git log --oneline | grep 90d1aa8` ✓
- [x] npm run test:unit: 4 failed, 109 passed — RED confirmed
- [x] Pre-existing test suite unaffected
