# SECURITY.md — Phase 01: Role Model & Resolver

**Audited:** 2026-06-03 **Disposition:** SECURED — 6/6 threats closed (4 mitigate verified in code, 2 accept verified
against code) **ASVS Level:** default **Block-on:** HIGH (no HIGH threats open)

Register authored at plan time (`register_authored_at_plan_time: true`). This audit verifies each declared mitigation
against the implementation by grep/read, not by documentation or intent. Implementation files were not modified.

## Threat Verification

| Threat ID | Category                      | Disposition | Status | Evidence (file:line)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | ----------------------------- | ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-1-01    | Elevation of Privilege (HIGH) | mitigate    | CLOSED | (a) `src/contracts/roles.ts:27` — `Role = 'owner' \| 'agent'`, closed union, no owner fallback. (b) `src/auth/role-resolver.ts:43` — `env.OMNIFOCUS_MCP_ROLE === 'owner' ? 'owner' : 'agent'`, single exact-equality whitelist, no toLowerCase/trim/truthy/`\|\|`. 14-class parse matrix all asserting in `tests/unit/auth/role-resolver.test.ts:14-42`. (c) Resolver call site `src/index.ts:144-145` is upstream of `registerTools` — stdio path `src/index.ts:182`, HTTP path via `SessionManager.createSession` `src/session-manager.ts:115` (reached only from `runHttpServer` started at `src/index.ts:150`). Both entry points register tools strictly after role resolution. |
| T-1-02    | Information Disclosure        | mitigate    | CLOSED | `resolveStdioIdentity` returns `ResolvedIdentity` (`src/auth/role-resolver.ts:55-63`); `parseRole` returns `Role` string (`src/auth/role-resolver.ts:42-44`). Separately exported, distinct return types, no single call returns both. Test `tests/unit/auth/role-resolver.test.ts:79-95` asserts `typeof identity === 'object'`, `typeof role === 'string'`, and role lacks `transport`.                                                                                                                                                                                                                                                                                            |
| T-1-03    | Information Disclosure        | mitigate    | CLOSED | `'principal'` and `'tokenId'` present in `SENSITIVE_KEYS` (`src/utils/logger.ts:51-52`). `redactArgs` rewrites matching keys to `[REDACTED]` recursively up to depth 6 (`src/utils/logger.ts:59-80`). Tests `tests/unit/utils/logger.test.ts:41-50` confirm top-level and nested redaction; non-sensitive `role` passes through.                                                                                                                                                                                                                                                                                                                                                     |
| T-1-04    | Elevation of Privilege        | mitigate    | CLOSED | `resolveHttpIdentity` stub returns `{ transport:'http', roleSource:'fail-safe-default', principal:null }` (`src/auth/role-resolver.ts:78-86`). Asserted with `toStrictEqual` in `tests/unit/auth/role-resolver.test.ts:107-114`. No token→role path wired; HTTP path fails safe to AGENT.                                                                                                                                                                                                                                                                                                                                                                                            |
| T-1-05    | Elevation of Privilege        | accept      | CLOSED | Accepted-risk rationale holds against code: D-09 log line uses `role.toUpperCase()` and `identity.roleSource`, no `principal` (`src/index.ts:146`). `principal` is `null` on stdio (`src/auth/role-resolver.ts:61`). Future accidental identity-object logging is covered by SENSITIVE_KEYS redaction (T-1-03).                                                                                                                                                                                                                                                                                                                                                                      |
| T-1-SC    | Tampering (supply chain)      | accept      | CLOSED | Accepted-risk rationale holds against code: `git diff --stat 3e1ed47~1 d7c444a -- package.json package-lock.json` returns empty — zero dependency changes across all Phase 1 commits. Pure TypeScript.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Accepted Risks Log

- **T-1-05 (Elevation of Privilege / Information Disclosure):** The D-09 startup log line could leak a principal in a
  future phase. Accepted for Phase 1 because `principal` is `null` on stdio and the log line references `roleSource`,
  never `principal`. SENSITIVE_KEYS redaction is the backstop for any future accidental identity-object log. Re-evaluate
  when Phase 4 populates `principal` over HTTP.
- **T-1-SC (Tampering / supply chain):** No new dependencies were added in Phase 1, so no new supply-chain surface was
  introduced. Verified by empty `package.json` / `package-lock.json` diff across the phase commit range. Re-evaluate in
  any phase that adds packages.

## Unregistered Flags

None. No SUMMARY.md contained a `## Threat Flags` section, and no new attack surface appeared during implementation that
lacks a threat mapping. All file changes (`src/contracts/roles.ts`, `src/contracts/index.ts`,
`src/auth/role-resolver.ts`, `src/utils/logger.ts`, `src/index.ts`, and tests) map to registered threats T-1-01 through
T-1-SC.

## Notes

- The live two-branch startup log check (`OMNIFOCUS_MCP_ROLE` unset vs `owner`) is deferred to a permissioned host per
  `01-VERIFICATION.md`. This is an environmental limitation, not a security gap — both branches are independently
  unit-tested and the D-09 log string is present in source and the compiled `dist/index.js`.
