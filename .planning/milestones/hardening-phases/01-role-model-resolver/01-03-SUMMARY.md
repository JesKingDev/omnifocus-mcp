---
phase: 01-role-model-resolver
plan: '03'
subsystem: startup
tags: [role-resolver, startup-wiring, d-09-log-line, identity, security]
dependency_graph:
  requires:
    - src/contracts/roles.ts — Role, RoleSource, ResolvedIdentity (plan 01-01)
    - src/auth/role-resolver.ts — parseRole, resolveStdioIdentity, resolveHttpIdentity (plan 01-02)
  provides:
    - src/index.ts — resolver wired into startup before tool dispatch (ROLE-01)
    - src/index.ts — D-09 log line emitted at resolve time
    - src/index.ts — runStdioServer and runHttpServer accept identity and role (Phase 3 seam)
  affects:
    - Phase 3 (MutationGate will consume role parameter from runStdioServer/runHttpServer)
    - Phase 4 (resolveHttpIdentity stub already threaded through HTTP path)
tech_stack:
  added: []
  patterns:
    - Insertion-point pattern — resolver called between startupTimer.mark('warmEnd') and httpMode branch
    - Underscore prefix convention for pass-through parameters (_identity, _role) per TypeScript strict mode
    - logger.info template literal for structured D-09 log line
key_files:
  created: []
  modified:
    - src/index.ts
decisions:
  - '_identity/_role underscore prefix used for pass-through params — TypeScript noUnusedParameters would flag unused
    names; Phase 3 replaces _ prefix when it wires these into tool dispatch'
metrics:
  duration: '180s'
  completed: '2026-06-03'
  tasks_completed: 2
  tasks_total: 2
---

# Phase 01 Plan 03: Resolver Wired into Startup Summary

Role resolver imported and called in `runServer()` between cache warm-up and transport selection, satisfying ROLE-01
(role resolved before tool dispatch) and emitting the D-09 grep-stable log line. Identity and role are threaded as
parameters into `runStdioServer` and `runHttpServer` as the Phase 3 seam.

## What Was Built

**src/index.ts** (modified) — three changes:

1. **Imports** added at the end of the existing import block:
   - `import { parseRole, resolveStdioIdentity, resolveHttpIdentity } from './auth/role-resolver.js'`
   - `import type { ResolvedIdentity, Role } from './contracts/roles.js'`

2. **Resolver call site** inserted between `startupTimer.mark('warmEnd')` (line 141) and the `httpMode` branch (line
   148), annotated with `// Phase 1: resolve identity and role before any tool dispatch (ROLE-01, ROLE-02, ROLE-03)`:

   ```
   const identity = cliConfig.httpMode ? resolveHttpIdentity() : resolveStdioIdentity();
   const role = parseRole();
   logger.info(`resolved role=${role.toUpperCase()} source=${identity.roleSource}`);
   ```

3. **Function signatures** updated:
   - `runStdioServer(cacheManager, _identity, _role)` — underscore prefix marks Phase 3 pass-through
   - `runHttpServer(cacheManager, cliConfig, _identity, _role)` — same convention
   - Both call sites inside the `httpMode` branch pass `identity` and `role` as last two arguments

All other startup behavior (sandbox guard, permission check, cache warming, transport lifecycle) is preserved exactly.

## Verification Evidence

- `grep -c "resolved role=" src/index.ts` → 1
- `grep -c "resolveStdioIdentity\|resolveHttpIdentity" src/index.ts` → 2 (import + call)
- `npx tsc --noEmit` → exits 0 (no errors)
- `npm run test:unit` → 2233 tests pass (all 2233 existing tests, 0 regressions)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript TS6133 'declared but never read' on unused parameters**

- **Found during:** Task 1 — `npx tsc --noEmit` after first edit pass
- **Issue:** `runStdioServer` and `runHttpServer` parameters named `identity` and `role` triggered TS6133 because the
  bodies don't consume them yet (Phase 3 wires them into tool dispatch).
- **Fix:** Renamed to `_identity` and `_role` per TypeScript's underscore-prefix convention for intentionally unused
  parameters. The plan's `<action>` explicitly anticipated this: "leave them as named params... or add
  `const _identity = identity`". The underscore-on-param approach is cleaner than an intermediate `const`.
- **Files modified:** `src/index.ts`
- **Commit:** 040cffe (fixed in the same commit)

## Threat Model Coverage

| Threat ID | Mitigation Applied                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| T-1-01    | Resolver is called upstream of both transport entry points; registerTools is downstream of both                    |
| T-1-05    | Log line uses `role.toUpperCase()` and `identity.roleSource` — no principal in the log; principal is null on stdio |
| T-1-SC    | No new packages — single-file modification with zero new dependencies                                              |

## Task 2 — Human-Verify Checkpoint: CLOSED (verified by inspection, live-run deferred)

**Disposition:** Approved by the orchestrator/human. Closed as human-verified by source-and-build inspection. Live
stderr confirmation is **deferred to a permissioned host** — this build host has no OmniFocus permissions, so cache
warming stalls and `runServer()` never reaches the `startupTimer.mark('warmEnd')` / resolver call site (the log line
sits immediately after it). That is an environmental limitation, not a code defect.

**Evidence used to close the checkpoint:**

- `src/index.ts` lines 143–146 — resolver call site sits between `startupTimer.mark('warmEnd')` (line 141) and the
  `cliConfig.httpMode` branch (line 149), matching the locked plan spec exactly:
  `const identity = cliConfig.httpMode ? resolveHttpIdentity() : resolveStdioIdentity();` `const role = parseRole();`
  `logger.info(`resolved role=${role.toUpperCase()} source=${identity.roleSource}`);`
- The log string produces the grep-stable pattern
  `/resolved role=(OWNER|AGENT) source=(explicit-env|fail-safe-default)/`.
- `npm run build` → exit 0; compiled `dist/index.js` contains the D-09 log string
  (`grep -c "resolved role=" dist/index.js` → 1) and both resolver call sites
  (`grep -c "resolveStdioIdentity\|resolveHttpIdentity" dist/index.js` → 2).
- Plan 01-02 unit tests already prove `resolveStdioIdentity()` returns `AGENT` / `fail-safe-default` with no env, and
  `OWNER` / `explicit-env` with `OMNIFOCUS_MCP_ROLE=owner` — so the two branches the checkpoint exercises are
  independently covered.

**Verification commands to run on a permissioned (OmniFocus-authorized) host to record the live confirmation:**

```bash
cd /Users/jessicaking/projects/omnifocus-mcp
npm run build
# AGENT / fail-safe-default path
OMNIFOCUS_MCP_ROLE='' node dist/index.js 2>&1 | head -20   # expect: resolved role=AGENT source=fail-safe-default
# OWNER / explicit-env path
OMNIFOCUS_MCP_ROLE=owner node dist/index.js 2>&1 | head -20 # expect: resolved role=OWNER source=explicit-env
# Ctrl-C to stop the server after each check
```

## Commits

| Task | Commit       | Description                                                               |
| ---- | ------------ | ------------------------------------------------------------------------- |
| 1    | 040cffe      | feat(01-03): wire role resolver into startup, emit D-09 log line          |
| 2    | (checkpoint) | Human-verify closed by inspection; live-run deferred to permissioned host |

## Self-Check: PASSED
