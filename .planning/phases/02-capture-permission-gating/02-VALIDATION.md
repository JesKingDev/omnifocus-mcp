---
phase: 02
slug: capture-permission-gating
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-12
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Detailed test map derived from `02-RESEARCH.md`
> → "## Validation Architecture".

---

## Test Infrastructure

| Property               | Value                                           |
| ---------------------- | ----------------------------------------------- |
| **Framework**          | vitest                                          |
| **Config file**        | `vitest.config.ts` (project root)               |
| **Quick run command**  | `npm run test:unit`                             |
| **Full suite command** | `npm run test:unit && npm run test:integration` |
| **Estimated runtime**  | ~30 seconds (unit)                              |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm run test:unit && npm run test:smoke`
- **Before `/gsd-verify-work`:** `npm run test:unit && npm run test:integration` must be green
- **Max feedback latency:** 30 seconds (unit)

---

## Per-Task Verification Map

> Populated by the planner from `02-RESEARCH.md` "Phase Requirements → Test Map". D-08 compliance: PERM-01 is proven by
> (a) predicate-compiles unit test + (b) capture-stamp test — NOT a routing demo.

| Task ID | Plan | Wave | Requirement | Threat Ref    | Secure Behavior                                                                     | Test Type   | Automated Command          | File Exists | Status     |
| ------- | ---- | ---- | ----------- | ------------- | ----------------------------------------------------------------------------------- | ----------- | -------------------------- | ----------- | ---------- |
| TBD     | TBD  | TBD  | CAP-01      | —             | Inbox create with no project lands in inbox                                         | integration | `npm run test:integration` | ✅ existing | ⬜ pending |
| TBD     | TBD  | TBD  | LINE-01     | T-2 Tampering | `of-mcp:lineage` block composed + idempotent strip-and-reappend                     | unit        | `npm run test:unit`        | ❌ W0       | ⬜ pending |
| TBD     | TBD  | TBD  | PERM-01     | —             | `agentOkayPredicate()` compiles to filter returning only `agent-okay` tasks (D-08a) | unit        | `npm run test:unit`        | ❌ W0       | ⬜ pending |
| TBD     | TBD  | TBD  | PERM-01     | —             | New capture task stamped with `agent-okay` tag (D-08b)                              | integration | `npm run test:integration` | ❌ W0       | ⬜ pending |
| TBD     | TBD  | TBD  | PERM-02     | T-2 EoP       | `parseMode()` literal-only default-deny → `background`                              | unit        | `npm run test:unit`        | ✅ extend   | ⬜ pending |
| TBD     | TBD  | TBD  | PERM-02     | T-2 Access    | `decide('agent','create','task')` returns `gate`; grant bypass allows               | unit        | `npm run test:unit`        | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `tests/unit/contracts/ast/lineage-stamp.test.ts` — LINE-01 stamp composition + idempotency
- [ ] `tests/unit/auth/agent-okay-predicate.test.ts` — PERM-01 predicate compilation (D-08a)
- [ ] Extend `tests/unit/auth/role-resolver.test.ts` — `parseMode()` cases (PERM-02)
- [ ] Extend `tests/unit/auth/operation-policy.test.ts` — `create → gate` row in policy matrix (PERM-02)
- [ ] New write-tool unit test — gate verdict dispatch + session-grant bypass (PERM-02)

---

## Manual-Only Verifications

| Behavior                                                   | Requirement | Why Manual               | Test Instructions                                                          |
| ---------------------------------------------------------- | ----------- | ------------------------ | -------------------------------------------------------------------------- |
| Live inbox round-trip reflects immediately in OmniFocus UI | CAP-01      | Needs live OmniFocus app | Run capture via `omnifocus_write`, confirm task appears in OmniFocus inbox |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
