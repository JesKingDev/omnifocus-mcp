---
phase: 01-role-model-resolver
plan: '01'
subsystem: contracts
tags: [role-model, type-contracts, logging, security]
dependency_graph:
  requires: []
  provides:
    - src/contracts/roles.ts — Role, RoleSource, ResolvedIdentity, ResolvedContext
    - src/contracts/index.ts — barrel re-export of all four role types
    - src/utils/logger.ts — SENSITIVE_KEYS extended with principal and tokenId
  affects:
    - All Phase 1+ consumers that import role types from src/contracts
tech_stack:
  added: []
  patterns:
    - Pure TypeScript type module (no runtime code in roles.ts)
    - Barrel export pattern matching existing filters.js / mutations.js
    - SENSITIVE_KEYS Set extension for identity field redaction
key_files:
  created:
    - src/contracts/roles.ts
  modified:
    - src/contracts/index.ts
    - src/utils/logger.ts
    - tests/unit/utils/logger.test.ts
decisions:
  - "Role is 'owner'|'agent' — closed 2-value literal union; fail-safe default is 'agent' (T-1-01)"
  - "RoleSource has 3 values — no 'launchd-label'; launchd path emits 'explicit-env' (D-06)"
  - 'ResolvedIdentity and ResolvedContext are distinct types — consumers cannot derive Role from identity struct
    (T-1-02)'
  - 'principal and tokenId added to SENSITIVE_KEYS as D-08 follow-through; redactArgs handles nested objects'
metrics:
  duration: '190s'
  completed: '2026-06-03'
  tasks_completed: 2
  tasks_total: 2
---

# Phase 01 Plan 01: Role Contract Types and Logger Redaction Summary

Role and identity type contracts created as the single source of truth for all downstream Phase 1+ consumers, with
logger redaction extended to cover principal and tokenId (D-08 follow-through).

## What Was Built

**src/contracts/roles.ts** — new pure-type module exporting:

- `Role = 'owner' | 'agent'` — closed 2-value literal union
- `RoleSource = 'explicit-env' | 'fail-safe-default' | 'http-token'` — 3-value enum, no launchd-label (D-06)
- `ResolvedIdentity` — transport, roleSource, principal (null for stdio until Phase 4)
- `ResolvedContext` — combines identity + role as intentionally separate fields (T-1-02)

**src/contracts/index.ts** — new `// Role contracts` barrel block re-exporting all four types from `./roles.js`,
following the existing filter/mutation block pattern.

**src/utils/logger.ts** — `SENSITIVE_KEYS` extended with `'principal'` and `'tokenId'` (D-08 follow-through). The
`redactArgs` function already handles nested objects, so no further changes were needed.

**tests/unit/utils/logger.test.ts** — two new `it()` blocks verifying:

1. `principal` and `tokenId` redact to `'[REDACTED]'`; non-sensitive `role` passes through
2. `principal` nested inside an `identity` object is also redacted

## Verification Evidence

- `grep "export type Role = 'owner' | 'agent'" src/contracts/roles.ts` → 1 match
- `grep "launchd-label" src/contracts/roles.ts` → comment only (intentional absence note)
- `grep "from './roles.js'" src/contracts/index.ts` → 1 match
- `grep "principal" src/utils/logger.ts` → present in SENSITIVE_KEYS
- `npx tsc --noEmit` → exits 0 (no errors)
- `npm run test:unit` → 2213 tests pass (all existing + 2 new D-08 assertions)

## Deviations from Plan

None — plan executed exactly as written.

The `launchd-label` grep check in the plan's `<verify>` block would return 1 (comment mention), not 0. The comment
explicitly documents the intentional absence of `launchd-label` from the type union. The type definition itself has no
`launchd-label` value. This is correct behavior consistent with the plan objective ("No launchd-label in RoleSource per
D-06").

## Threat Model Coverage

| Threat ID | Mitigation Applied                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| T-1-01    | Role is a closed 2-value literal union; no default that emits 'owner' at the type layer                              |
| T-1-02    | ResolvedIdentity and Role are separate fields in ResolvedContext — consumers cannot derive Role from identity struct |
| T-1-03    | 'principal' and 'tokenId' added to SENSITIVE_KEYS; redactArgs rewrites them to '[REDACTED]' at all log depths ≤ 6    |
| T-1-SC    | No new packages installed; zero new dependencies                                                                     |

## Commits

| Task | Commit  | Description                                                          |
| ---- | ------- | -------------------------------------------------------------------- |
| 1    | d34de78 | feat(01-01): add role contract types and barrel re-export            |
| 2    | addc6b5 | feat(01-01): extend SENSITIVE_KEYS with principal and tokenId (D-08) |

## Self-Check: PASSED
