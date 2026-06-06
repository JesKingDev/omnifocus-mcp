---
phase: 05
slug: write-verifier
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-06
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `05-RESEARCH.md` §Validation
> Architecture.

---

## Test Infrastructure

| Property               | Value                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| **Framework**          | Vitest                                                                |
| **Config file**        | existing project config (`vitest.config.ts` / root config)            |
| **Quick run command**  | `npm run test:unit`                                                   |
| **Full suite command** | `npm run test:unit && npm run test:integration`                       |
| **Estimated runtime**  | unit ~tens of seconds; integration requires a live OmniFocus instance |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm run test:unit && npm run test:integration`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** unit suite (seconds); integration gated to wave merge

---

## Per-Task Verification Map

| Req ID       | Behavior                                                                                                              | Wave | Test Type   | Automated Command                                                                 | File Exists |
| ------------ | --------------------------------------------------------------------------------------------------------------------- | ---- | ----------- | --------------------------------------------------------------------------------- | ----------- |
| VERIFY-01    | Verifier issues an independent osascript spawn (not in-script read)                                                   | —    | unit        | `npm run test:unit -- tests/unit/tools/unified/verifier/WriteVerifier.test.ts`    | ❌ W0       |
| VERIFY-01    | Owner-role mutations report `unverified` (not `skipped`) — D-12                                                       | —    | unit        | `npm run test:unit -- tests/unit/tools/unified/verifier/WriteVerifier.test.ts`    | ❌ W0       |
| VERIFY-02    | Proven mismatch returns `error` envelope with `WRITE_UNVERIFIED_MISMATCH` — D-01/D-02                                 | —    | unit        | `npm run test:unit -- tests/unit/tools/unified/verifier/WriteVerifier.test.ts`    | ❌ W0       |
| VERIFY-02    | Absent field in read-back is a hard fail — D-08                                                                       | —    | unit        | `npm run test:unit -- tests/unit/tools/unified/verifier/field-comparator.test.ts` | ❌ W0       |
| VERIFY-02    | Date comparison with ±60s tolerance — D-08                                                                            | —    | unit        | `npm run test:unit -- tests/unit/tools/unified/verifier/field-comparator.test.ts` | ❌ W0       |
| VERIFY-02    | Tags compared as Set-of-names — D-08                                                                                  | —    | unit        | `npm run test:unit -- tests/unit/tools/unified/verifier/field-comparator.test.ts` | ❌ W0       |
| VERIFY-02    | Scalars normalized (estimatedMinutes int-round, flagged/sequential bool, note trim, null/undefined/'' unified) — D-08 | —    | unit        | `npm run test:unit -- tests/unit/tools/unified/verifier/field-comparator.test.ts` | ❌ W0       |
| VERIFY-02    | Read-back failure returns `VERIFY_READBACK_FAILED` error envelope — D-04                                              | —    | unit        | `npm run test:unit -- tests/unit/tools/unified/verifier/WriteVerifier.test.ts`    | ❌ W0       |
| VERIFY-03    | Success response metadata includes `verification_status: "verified"` on match                                         | —    | unit        | `npm run test:unit -- tests/unit/tools/unified/verifier/WriteVerifier.test.ts`    | ❌ W0       |
| VERIFY-03    | Dry-run ops get `verification_status: "skipped"` + audit log entry — D-11                                             | —    | unit        | `npm run test:unit -- tests/unit/tools/unified/verifier/WriteVerifier.test.ts`    | ❌ W0       |
| OMN-119      | Batch route uses same per-item verifier as single route (parity) — D-10                                               | —    | unit        | `npm run test:unit -- tests/unit/tools/unified/verifier/WriteVerifier.test.ts`    | ❌ W0       |
| VERIFY-01+02 | Task create → live read-back confirms field persisted                                                                 | —    | integration | `npm run test:integration -- tests/integration/tools/write-verifier.test.ts`      | ❌ W0       |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — wave/task IDs filled in by the planner._

---

## Key Test Obligations

- **Mandatory batch-parity test (OMN-119):** create a task via single op and via batch op; assert both responses carry
  `verification_status: "verified"` in metadata. Guards the single/batch enforcement-funnel drift this lesson exists to
  prevent.
- **Per-field-type comparator unit tests:** each rule independently — dates (exact / within-60s / outside-60s fail /
  missing fail); tags (same-set-diff-order pass / subset fail / extra fail / absent fail); scalars
  (`null`/`undefined`/`''` unify, `60.9`→`61`, string `'true'`→bool); absent-field hard fail (intent `flagged:true`,
  read-back missing key → mismatch, never `undefined==undefined`).
- **Proven-mismatch → error (D-01):** mock `execJson` at the read-back call to return a task with the field
  missing/wrong; assert full `createErrorResponseV2` shape — `WRITE_UNVERIFIED_MISMATCH`, `success:false`, non-null
  `error.details`.
- **Skipped-set audit (D-11):** assert `dryRun:true` returns `skipped` AND emits a logger call
  (`vi.spyOn(logger,'info')`); confirm no other path returns `skipped`.
- **Owner-role unverified-not-skipped (D-12):** role `owner` mutation completes with `verification_status:'unverified'`.

---

## Wave 0 Requirements

- [ ] `tests/unit/tools/unified/verifier/WriteVerifier.test.ts` — VERIFY-01, VERIFY-02 (mismatch + failure), VERIFY-03,
      OMN-119 parity, D-11 skipped audit, D-12 owner unverified
- [ ] `tests/unit/tools/unified/verifier/field-comparator.test.ts` — D-05, D-08 (all field types + absent-field hard
      fail)
- [ ] `tests/integration/tools/write-verifier.test.ts` — live round-trip: create task, confirm `verified`
- [ ] `src/tools/unified/verifier/WriteVerifier.ts` — new production module (stub in W0)
- [ ] `src/tools/unified/verifier/field-comparator.ts` — new production module (stub in W0)
- [ ] `src/tools/unified/verifier/intent-extractor.ts` — new production module (stub in W0)

_No new framework install — Vitest is already the test runner._

---

## Manual-Only Verifications

| Behavior                                                                                        | Requirement | Why Manual                                                                                                                            | Test Instructions                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| True silent-no-op caught end-to-end against a real bridge write that genuinely fails to persist | VERIFY-02   | A genuinely silent JXA write (e.g. a real tag-assign no-op) cannot be reliably forced in CI; unit tests cover it via mocked read-back | In OmniFocus, run an agent tag-assign known to no-op historically (SETTER-PATTERNS row 6); confirm the response is the `WRITE_UNVERIFIED_MISMATCH` error envelope, not success |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (3 test files + 3 module stubs)
- [ ] No watch-mode flags
- [ ] Feedback latency: unit suite per-commit
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
