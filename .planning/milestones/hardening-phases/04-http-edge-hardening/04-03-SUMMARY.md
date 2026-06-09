---
phase: 04-http-edge-hardening
plan: '03'
subsystem: auth
tags: [cli, config, validation, startup, security, loopback, bearer-token]

requires:
  - phase: 04-01
    provides: Wave 0 RED tests for cli.test.ts (validateCLIConfig contract)

provides:
  - CLIConfig interface with agentToken, ownerToken, allowedHosts fields
  - DEFAULT_CLI_CONFIG.host = '127.0.0.1' (loopback bind by default, D-13)
  - parseCLIArgs reads MCP_AGENT_TOKEN, MCP_OWNER_TOKEN, MCP_ALLOWED_HOSTS
  - MCP_AUTH_TOKEN deprecation alias with logger.warn (D-11)
  - validateCLIConfig fail-closed startup assertions (D-06, D-07, D-13)
  - agentToken and ownerToken redacted in logger output

affects:
  - 04-04 (plan 04 depends on CLIConfig.agentToken/ownerToken fields being present)
  - src/index.ts (caller of validateCLIConfig and parseCLIArgs)

tech-stack:
  added: []
  patterns:
    - 'Fail-closed startup: validateCLIConfig throws before any socket bind in HTTP mode'
    - 'MCP_AUTH_TOKEN → agentToken alias pattern with deprecation warning (D-11)'
    - "MCP_ALLOWED_HOSTS comma-split: split(',').map(h => h.trim()).filter(Boolean)"

key-files:
  created:
    - tests/unit/utils/cli.test.ts
  modified:
    - src/utils/cli.ts

key-decisions:
  - 'All four new assertions are gated inside if (config.httpMode) — stdio mode unaffected (Pitfall 5 guard)'
  - 'Assertion order: host → mandatory token → distinct tokens → blank check (most actionable error first)'
  - 'authToken field retained for backward-compat; only the distinct=agentToken alias path changed'

patterns-established:
  - 'Startup throw pattern: same shape as existing port-range check (throw new Error with message containing the key
    term the test regex matches)'

requirements-completed: [HTTP-02, HTTP-04, HTTP-05]

duration: 12min
completed: 2026-06-05
---

# Phase 4 Plan 03: CLI Config Hardening Summary

**Loopback-only bind default, agentToken/ownerToken/allowedHosts env vars, and four fail-closed startup assertions in
validateCLIConfig — cli.test.ts 7/7 GREEN**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-05T21:25:00Z
- **Completed:** 2026-06-05T21:37:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Changed `DEFAULT_CLI_CONFIG.host` from `'0.0.0.0'` to `'127.0.0.1'` (D-13)
- Extended `CLIConfig` with `agentToken`, `ownerToken`, and `allowedHosts` fields; `authToken` retained for
  backward-compat
- `parseCLIArgs` reads `MCP_AGENT_TOKEN`, `MCP_OWNER_TOKEN`, `MCP_ALLOWED_HOSTS`; `MCP_AUTH_TOKEN` emits deprecation
  warning and aliases to `agentToken` (D-11)
- `validateCLIConfig` gains four fail-closed assertions (loopback host, mandatory agentToken, distinct tokens, non-blank
  ownerToken) — all gated inside `if (config.httpMode)`
- `printHelp` updated to document new env vars; `MCP_AUTH_TOKEN` marked deprecated
- Logger redaction extended to cover `agentToken` and `ownerToken`

## Task Commits

1. **Task 1: CLIConfig extension + parseCLIArgs env reading** — `d85d8ae` (feat)
2. **Task 2: validateCLIConfig startup assertions** — `97f53de` (feat)

## Files Created/Modified

- `src/utils/cli.ts` — default host changed, interface extended, env reading + alias logic added, four startup
  assertions added, printHelp updated, logger redaction extended
- `tests/unit/utils/cli.test.ts` — Wave 0 RED tests copied to worktree so vitest resolves against worktree source (7
  tests, all GREEN)

## Decisions Made

- All new `validateCLIConfig` assertions are strictly inside `if (config.httpMode)` — the stdio test case with
  `host: '0.0.0.0'` and no tokens must not throw (Pitfall 5 guard from the plan).
- `authToken` field kept in `CLIConfig` for backward-compat; the old `===` comparison path is removed in Plan 04, not
  here.
- The Wave 0 `cli.test.ts` exists in the main repo but not in the worktree (worktrees are created from a branch snapshot
  before that file was written). Copied it to the worktree so the test suite runs correctly from the worktree context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Copied cli.test.ts to worktree tests directory**

- **Found during:** Task 2 verification
- **Issue:** `tests/unit/utils/cli.test.ts` was written to the main repo as a Wave 0 RED test but was not present in the
  worktree's `tests/` directory. Vitest running from the worktree did not find it, so the GREEN gate could not be
  verified.
- **Fix:** Copied the file from the main repo into the worktree's `tests/unit/utils/` directory and staged it with the
  Task 2 commit.
- **Files modified:** `tests/unit/utils/cli.test.ts` (created in worktree)
- **Verification:** `npm run test:unit -- tests/unit/utils/cli.test.ts` ran 7 tests, all passed; full
  `npm run test:unit` 109 files / 2292 tests, all passed.
- **Committed in:** `97f53de` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking worktree path resolution issue) **Impact on plan:** The fix is a
necessary worktree bookkeeping step. The test file content is unchanged from the Wave 0 version written by Plan 01.

## Issues Encountered

The vitest config in the main repo has `exclude: ['.claude/worktrees/**']`, which means tests run from the main repo
context against the main repo source. Running `npm run test:unit` from the worktree directory resolves imports to the
worktree's `src/`, which is the correct behavior for parallel-worktree execution.

## Next Phase Readiness

- `CLIConfig.agentToken`, `ownerToken`, and `allowedHosts` are fully populated and validated — Plan 04 (HTTP server
  wiring) can consume these fields immediately.
- `validateCLIConfig` is fail-closed: any misconfigured HTTP mode start will throw before any socket is bound.
- Threat mitigations T-04-03-01 through T-04-03-05 are implemented and verified.

---

_Phase: 04-http-edge-hardening_ _Completed: 2026-06-05_
