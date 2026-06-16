---
phase: 5
slug: session-archaeology
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-16
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `05-RESEARCH.md` §Validation
> Architecture. Detailed per-task rows are filled by the planner.

---

## Test Infrastructure

| Property               | Value                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| **Framework**          | Vitest (existing)                                                 |
| **Config file**        | `vitest.config.ts` (existing)                                     |
| **Quick run command**  | `npm run test:unit`                                               |
| **Full suite command** | `npm run test:integration` (use **npm**, not bun — sandbox guard) |
| **Estimated runtime**  | unit ~seconds; integration depends on live OmniFocus              |

> ⚠ Bare `npx vitest run` trips the sandbox guard (~96 phantom failures). Always use `npm run test:unit` (project
> memory: `post-merge-gate-use-test-unit`).

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm run test:unit` (full unit); `npm run test:integration` when OmniFocus available
- **Before `/gsd-verify-work`:** Unit suite must be green
- **Max feedback latency:** ~seconds (unit)

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Threat Ref | Secure Behavior                                          | Test Type | Automated Command                              | File Exists | Status     |
| -------- | ---- | ---- | ----------- | ---------- | -------------------------------------------------------- | --------- | ---------------------------------------------- | ----------- | ---------- |
| 05-01-T1 | 01   | 1    | ARCH-03     | T-05-01    | `archaeology` only via allowlisted tag (sandbox-bounded) | unit      | `npm run test:unit -- mutation-script-builder` | ❌ W0       | ⬜ pending |
| 05-01-T2 | 01   | 1    | LINE-01     | —          | lineage round-trips session ID; dedup unions completed   | unit      | `npm run test:unit -- lineage-dedup`           | ❌ W0       | ⬜ pending |
| 05-02-T2 | 02   | 1    | ARCH-01     | T-05-03    | pre-filter strips tool_result + noise + isSidechain      | unit      | `npm run test:unit -- archaeology-prefilter`   | ❌ W0       | ⬜ pending |
| 05-03-T1 | 03   | 2    | ARCH-02     | T-05-07    | merged gate; no `omnifocus_write` before `yes`           | human     | structural grep + live run-through             | ❌          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Deterministic (automated) vs Agent-Behavioral (human-verified)

| What                                                                                                                                  | Type                     | Verification                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| `archaeology` ∈ `FUNCTIONAL_TAG_ALLOWLIST` (+ `isTestTagAllowed('archaeology')`)                                                      | Deterministic unit       | Assertion in `tests/unit/contracts/ast/mutation-script-builder.test.ts`     |
| `LINEAGE_RE` round-trips a session ID (`composeLineageStamp` → parse → `.session` matches)                                            | Deterministic unit       | Lineage/dedup spec                                                          |
| Dedup skips an already-extracted session                                                                                              | Deterministic unit       | Fixture note with lineage block → session ID in dedup set, session excluded |
| Pre-filter strips noise (`tool_use`/`tool_result`/`attachment`/`file-history-snapshot`, tool_result-only `user` lines, `isSidechain`) | Deterministic unit       | Committed helper + fixture JSONL → only prose/text survives                 |
| Completed-task dedup behavior (chosen polarity)                                                                                       | Deterministic unit       | Assert selected behavior against a completed-task fixture                   |
| Detection recall/precision (finds the right loops)                                                                                    | Agent-behavioral         | Human review of a real 7-day scan                                           |
| Summary table quality ("What it was about" accuracy)                                                                                  | Agent-behavioral         | Human spot-check rows vs transcripts                                        |
| Merged-gate UX (one decision surface, `edit` verb works, never auto-creates)                                                          | Agent-behavioral         | Human run-through: single `yes/edit/abort`, row-level edit                  |
| Routing proposal correctness (right project / inbox fallback)                                                                         | Agent-behavioral + reuse | Leans on already-validated Phase-3 routing; spot-check placements           |

---

## Requirement → Verification Map

| Req     | Sampling approach                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| ARCH-01 | Unit: windowing + pre-filter on fixtures. Human: detection recall on a live scan                                                                   |
| ARCH-02 | Human: confirm summarize-then-approve gate fires, never auto-creates. Unit: assert no `omnifocus_write` before approval token in any scripted path |
| ARCH-03 | Unit: allowlist + lineage + tag on created task. Human: placement lands in correct project / inbox fallback                                        |
| LINE-01 | Unit: lineage round-trip + dedup skip                                                                                                              |

---

## Wave 0 Requirements

- [x] `archaeology` assertion added to `tests/unit/contracts/ast/mutation-script-builder.test.ts` _(planned: 05-01
      Task 1)_
- [x] New unit spec: lineage round-trip + dedup-skip over fixture notes _(planned: 05-01 Task 2 →
      `lineage-dedup.test.ts`)_
- [x] Unit spec: pre-filter noise-strip over a fixture JSONL (committed helper) _(planned: 05-02 →
      `archaeology-prefilter.test.ts`; Open Q2 resolved = committed `.js` probe)_
- [x] Decide + test the completed-task dedup polarity (Open Question 1) _(resolved: union-completed into dedup set;
      tested in 05-01 Task 2)_

_Existing Vitest infrastructure covers the framework; the above are the new test stubs this phase introduces._

---

## Manual-Only Verifications

| Behavior                          | Requirement | Why Manual                                           | Test Instructions                                                                                            |
| --------------------------------- | ----------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Detection recall over a real scan | ARCH-01     | Agent-behavioral; depends on live transcript content | Run a 7-day scan, sample sessions, confirm no obvious loop missed / no noise surfaced                        |
| Summarize-then-approve gate UX    | ARCH-02     | Interactive plain-text gate                          | Confirm per-session summary fires, `yes/edit/abort` works, row-level `edit`, nothing created before approval |
| Placement correctness             | ARCH-03     | Depends on live OmniFocus + vault                    | Confirm approved loops land in matched project, inbox fallback otherwise, tagged `archaeology`               |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < ~30s (unit)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-approved 2026-06-16 (Wave-0 stubs assigned; nyquist_compliant)
