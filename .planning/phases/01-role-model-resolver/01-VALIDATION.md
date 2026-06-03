---
phase: 1
slug: role-model-resolver
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-03
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (verified in `vitest.config.ts` and `package.json`) |
| **Config file** | `vitest.config.ts` (project root — already present) |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm run test:unit && npm run test:integration` |
| **Estimated runtime** | ~30 seconds (unit) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm run test:unit && npm run test:integration`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds (unit)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| ROLE-01 | TBD | — | ROLE-01 | T-1-01 | Role resolved before `registerTools` is called (resolver upstream of dispatch) | unit | `npm run test:unit -- tests/unit/auth/role-resolver.test.ts` | ❌ W0 | ⬜ pending |
| ROLE-02 (exact) | TBD | — | ROLE-02 | T-1-01 | `OMNIFOCUS_MCP_ROLE=owner` → `role='owner'`, `roleSource='explicit-env'` | unit | same file | ❌ W0 | ⬜ pending |
| ROLE-02 (unset) | TBD | — | ROLE-02 | T-1-01 | unset → `role='agent'`, `roleSource='fail-safe-default'` | unit | same file | ❌ W0 | ⬜ pending |
| ROLE-02 (matrix) | TBD | — | ROLE-02 | T-1-01 | All 14 parse input classes assert least-privilege on every non-`owner` value | unit | same file | ❌ W0 | ⬜ pending |
| ROLE-03 (identity) | TBD | — | ROLE-03 | T-1-02 | Identity step (`{transport, roleSource, principal}`) and role parse are separately callable | unit | same file | ❌ W0 | ⬜ pending |
| ROLE-03 (HTTP stub) | TBD | — | ROLE-03 | — | HTTP resolver stub returns contract shape: `transport='http'`, `principal=null` | unit | same file | ❌ W0 | ⬜ pending |
| D-09 (log line) | TBD | — | ROLE-03 | — | Startup emits grep-stable `resolved role=… source=…` line | unit | same file | ❌ W0 | ⬜ pending |
| D-08 (redaction) | TBD | — | ROLE-03 | T-1-03 | `principal` / `tokenId` appear as `[REDACTED]` in logged objects | unit | `npm run test:unit -- tests/unit/utils/logger.test.ts` | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs finalize once the planner assigns plan/wave numbers; the requirement→behavior mapping above is fixed.*

---

## Wave 0 Requirements

- [ ] `tests/unit/auth/role-resolver.test.ts` — all 14 parse input classes (ROLE-02), identity/authz separation (ROLE-03), HTTP stub contract shape (ROLE-03), D-09 log-line format
- [ ] `src/auth/role-resolver.ts` — module under test (created in Wave 1 implementation)
- [ ] `src/contracts/roles.ts` — contract types; pure types, no dedicated test file

Extension to existing file:
- [ ] `tests/unit/utils/logger.test.ts` — add `principal` and `tokenId` redaction assertions (D-08 follow-through)

*Test infra and Vitest config are already in place — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real launchd-launched stdio process resolves to OWNER when plist sets `OMNIFOCUS_MCP_ROLE=owner` | ROLE-02 | True launchd `EnvironmentVariables` injection is a Phase 6 host concern; unit tests cover the parse, not the OS injection path | Deferred to Phase 6 host spike — Phase 1 asserts the parse, not the launchd delivery |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
