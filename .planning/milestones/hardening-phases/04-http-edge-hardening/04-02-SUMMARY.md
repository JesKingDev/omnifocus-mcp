---
phase: 04-http-edge-hardening
plan: '02'
subsystem: auth
tags: [auth, token-registry, http, constant-time, security]
dependency_graph:
  requires: [04-01]
  provides: [token-registry-module, resolveHttpIdentity-filled]
  affects: [src/auth/token-registry.ts, src/auth/role-resolver.ts]
tech_stack:
  added: []
  patterns: [accumulate-then-branch constant-time compare, SHA-256 hash normalization, env-based token registry]
key_files:
  created:
    - src/auth/token-registry.ts
  modified:
    - src/auth/role-resolver.ts
decisions:
  - 'validateTokenSet accumulates across ALL tokens with SHA-256 hash normalization before timingSafeEqual — no early
    exit (D-04)'
  - 'buildTokenRegistry aliasing MCP_AUTH_TOKEN to agent when MCP_AGENT_TOKEN absent — backward compat (D-11)'
  - 'resolveHttpIdentity now accepts TokenEntry parameter; old zero-argument form removed (TS error expected in
    src/index.ts until Plan 04)'
metrics:
  duration: 359s
  completed: '2026-06-05'
  tasks: 2
  files: 2
---

# Phase 4 Plan 02: Token Registry and resolveHttpIdentity Summary

Token registry module created and resolveHttpIdentity stub filled using constant-time SHA-256 accumulate-then-branch
validation and env-based TokenEntry registry.

## Tasks Completed

| Task | Name                                              | Commit  | Files                                |
| ---- | ------------------------------------------------- | ------- | ------------------------------------ |
| 1    | Create src/auth/token-registry.ts                 | f52474f | src/auth/token-registry.ts (new)     |
| 2    | Fill resolveHttpIdentity stub in role-resolver.ts | fab186d | src/auth/role-resolver.ts (modified) |

## What Was Built

**Task 1 — token-registry.ts (new)**

- `TokenEntry` interface: `{ role: Role; principal: string }`
- `buildTokenRegistry(env)`: reads `MCP_AGENT_TOKEN`/`MCP_OWNER_TOKEN`; aliases `MCP_AUTH_TOKEN` to agent when
  `MCP_AGENT_TOKEN` is absent (D-11)
- `validateTokenSet(candidate, registry)`: SHA-256 hash normalization collapses all token lengths to 32 bytes before
  `timingSafeEqual` (eliminates RangeError risk); accumulate-then-branch loop never returns early inside the for-loop
  body (D-04); returns `null` on no match — no default role (D-05)
- `tokenHash` is module-private (not exported); single `timingSafeEqual` call site in loop body

**Task 2 — role-resolver.ts (stub filled)**

- Added `import type { TokenEntry } from './token-registry.js'`
- `resolveHttpIdentity(entry: TokenEntry): ResolvedIdentity` — returns `transport: 'http'`, `roleSource: 'http-token'`,
  `principal: entry.principal`
- Old zero-argument stub form removed; expected TS2554 error in `src/index.ts` is isolated to that file (fixed in
  Plan 04)

## Verification

- `tests/unit/auth/token-registry.test.ts` — **12/12 GREEN**
  - All `validateTokenSet` matrix cases pass (empty candidate, wrong token, agent match, owner match, empty registry)
  - Length-mismatched candidate does not throw (SHA-256 normalization confirmed)
  - Two-token registry: both entries reachable (D-04 accumulate proof)
  - All `buildTokenRegistry` construction cases pass (MCP_AGENT_TOKEN, MCP_OWNER_TOKEN, MCP_AUTH_TOKEN alias, both,
    neither)
- `tests/unit/auth/role-resolver.test.ts` — **21/21 GREEN**
  - All pre-existing `parseRole` matrix cases pass (14 input classes)
  - All `resolveStdioIdentity` cases pass (5 cases)
  - New Phase 4 implementation cases pass: agent TokenEntry → `http-token`/`http-agent`, owner TokenEntry →
    `http-token`/`http-owner`
- Build: single TS2554 error in `src/index.ts` old call site only (expected; no errors in `src/auth/`)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Both modules are fully implemented. The `src/index.ts` TS2554 error is an expected pre-condition for Plan 04 (not
a stub).

## Threat Flags

None beyond what the plan's threat model already covers.

## Self-Check

- [x] `src/auth/token-registry.ts` exists and passes all 12 tests
- [x] `src/auth/role-resolver.ts` modified; all 21 tests GREEN
- [x] Commits f52474f and fab186d verified in git log
- [x] No early returns inside validateTokenSet for-loop body
- [x] Single timingSafeEqual call site in token-registry.ts
- [x] MCP_AUTH_TOKEN alias logic present

## Self-Check: PASSED
