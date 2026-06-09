---
phase: 1
slug: role-model-resolver
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-03
validated: 2026-06-03
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                      |
| ---------------------- | ---------------------------------------------------------- |
| **Framework**          | Vitest (verified in `vitest.config.ts` and `package.json`) |
| **Config file**        | `vitest.config.ts` (project root — already present)        |
| **Quick run command**  | `npm run test:unit`                                        |
| **Full suite command** | `npm run test:unit && npm run test:integration`            |
| **Estimated runtime**  | ~30 seconds (unit)                                         |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm run test:unit && npm run test:integration`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds (unit)

---

## Per-Task Verification Map

| Task ID             | Plan  | Wave | Requirement | Threat Ref | Secure Behavior                                                                             | Test Type | Automated Command                                            | File Exists | Status   |
| ------------------- | ----- | ---- | ----------- | ---------- | ------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------ | ----------- | -------- |
| ROLE-01             | 01-03 | 2    | ROLE-01     | T-1-01     | Role resolved before `registerTools` is called (resolver upstream of dispatch)              | unit      | `npm run test:unit -- tests/unit/index.test.ts`              | ✅          | ✅ green |
| ROLE-02 (exact)     | 01-02 | 1    | ROLE-02     | T-1-01     | `OMNIFOCUS_MCP_ROLE=owner` → `role='owner'`, `roleSource='explicit-env'`                    | unit      | `npm run test:unit -- tests/unit/auth/role-resolver.test.ts` | ✅          | ✅ green |
| ROLE-02 (unset)     | 01-02 | 1    | ROLE-02     | T-1-01     | unset → `role='agent'`, `roleSource='fail-safe-default'`                                    | unit      | same file                                                    | ✅          | ✅ green |
| ROLE-02 (matrix)    | 01-02 | 1    | ROLE-02     | T-1-01     | All 14 parse input classes assert least-privilege on every non-`owner` value                | unit      | same file                                                    | ✅          | ✅ green |
| ROLE-03 (identity)  | 01-02 | 1    | ROLE-03     | T-1-02     | Identity step (`{transport, roleSource, principal}`) and role parse are separately callable | unit      | same file                                                    | ✅          | ✅ green |
| ROLE-03 (HTTP stub) | 01-02 | 1    | ROLE-03     | —          | HTTP resolver stub returns contract shape: `transport='http'`, `principal=null`             | unit      | same file                                                    | ✅          | ✅ green |
| D-09 (log line)     | 01-03 | 2    | ROLE-03     | —          | Startup emits grep-stable `resolved role=… source=…` line (both OWNER/AGENT branches)       | unit      | `npm run test:unit -- tests/unit/index.test.ts`              | ✅          | ✅ green |
| D-08 (redaction)    | 01-01 | 1    | ROLE-03     | T-1-03     | `principal` / `tokenId` appear as `[REDACTED]` in logged objects                            | unit      | `npm run test:unit -- tests/unit/utils/logger.test.ts`       | ✅          | ✅ green |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_ _ROLE-01 and D-09 are verified via the `runServer` harness in
`tests/unit/index.test.ts` (cache warmer mocked, so startup reaches the resolver and registration without an OmniFocus
dependency)._

---

## Wave 0 Requirements

- [x] `tests/unit/auth/role-resolver.test.ts` — all 14 parse input classes (ROLE-02), identity/authz separation
      (ROLE-03), HTTP stub contract shape (ROLE-03)
- [x] `src/auth/role-resolver.ts` — module under test (created in Wave 1 implementation)
- [x] `src/contracts/roles.ts` — contract types; pure types, no dedicated test file
- [x] `tests/unit/index.test.ts` — D-09 log-line format (both OWNER/AGENT branches) and ROLE-01
      resolver-before-`registerTools` ordering, via the existing `runServer` harness

Extension to existing file:

- [x] `tests/unit/utils/logger.test.ts` — `principal` and `tokenId` redaction assertions (D-08 follow-through)

_Test infra and Vitest config are already in place — no framework install needed._

---

## Manual-Only Verifications

| Behavior                                                                                         | Requirement | Why Manual                                                                                                                     | Test Instructions                                                                    |
| ------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Real launchd-launched stdio process resolves to OWNER when plist sets `OMNIFOCUS_MCP_ROLE=owner` | ROLE-02     | True launchd `EnvironmentVariables` injection is a Phase 6 host concern; unit tests cover the parse, not the OS injection path | Deferred to Phase 6 host spike — Phase 1 asserts the parse, not the launchd delivery |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-06-03

---

## Validation Audit 2026-06-03

| Metric     | Count |
| ---------- | ----- |
| Gaps found | 2     |
| Resolved   | 2     |
| Escalated  | 0     |

**Gaps closed (automated, no production-code change):**

- ROLE-01 — resolver-before-`registerTools` ordering invariant → `tests/unit/index.test.ts` (vitest
  `invocationCallOrder` assertion).
- D-09 — grep-stable startup log line, both OWNER and AGENT branches → `tests/unit/index.test.ts`.

Auditor also fixed a test-isolation defect: the module-level `loggerInstance.info` mock was not cleared in `beforeEach`,
letting role log lines accumulate across tests. Fixed in the harness; no `src/**` file touched.

**Result:** full unit suite green — 106 files, 2236 tests, 0 failures. Phase 1 is Nyquist-compliant.

**Manual-only carry-forward:** the real launchd `EnvironmentVariables` injection path (OS-level role delivery) remains
deferred to the Phase 6 host spike — Phase 1 asserts the parse and the in-process log line, not the OS injection.
