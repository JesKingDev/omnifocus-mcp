---
phase: 3
slug: rolegate-agent-read-paths
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-04
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from `03-RESEARCH.md` § Validation
> Architecture. Per-task IDs are filled in once `03-*-PLAN.md` exists; rows below are keyed by requirement until then.

---

## Test Infrastructure

| Property               | Value                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **Framework**          | vitest 3.2.4                                                                        |
| **Config file**        | `vitest.config.ts` (repo runs via `npm run test:unit` / `npm run test:integration`) |
| **Quick run command**  | `npm run test:unit`                                                                 |
| **Full suite command** | `npm run test:unit && npm run test:integration`                                     |
| **Estimated runtime**  | ~unit fast; integration requires OmniFocus running                                  |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm run test:unit && npm run test:integration`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** unit suite (seconds); integration gated by OmniFocus availability

---

## Per-Task Verification Map

> Task IDs (`03-NN-MM`) are assigned by the planner. Until plans exist, rows are keyed by requirement. The planner MUST
> attach each task to the matching row(s).

| Task ID | Plan | Wave | Requirement        | Threat Ref  | Secure Behavior                                                                                              | Test Type   | Automated Command                                                        | File Exists | Status     |
| ------- | ---- | ---- | ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------ | ----------- | ---------- |
| TBD     | —    | —    | GATE-01            | T-3-drift   | AGENT `ListTools` `operation` enum trimmed to non-deny set                                                   | unit        | `npm run test:unit -- tests/unit/tools/index-rolegate.test.ts`           | ❌ W0       | ⬜ pending |
| TBD     | —    | —    | GATE-01            | T-3-drift   | OWNER `ListTools` shows full operation enum                                                                  | unit        | same file                                                                | ❌ W0       | ⬜ pending |
| TBD     | —    | —    | GATE-01 / D-06     | T-3-drift   | Advertised enum ⟺ enforced set parity (`decide(agent,op)≠'deny'` ⟺ advertised)                               | unit        | `npm run test:unit -- tests/unit/auth/operation-policy.test.ts`          | ❌ extend   | ⬜ pending |
| TBD     | —    | —    | GATE-02            | T-3-mangle  | AGENT `delete` rejected at dispatch with `POLICY_DENY_DELETE` (not `InternalError`)                          | unit        | `npm run test:unit -- tests/unit/tools/index-rolegate.test.ts`           | ❌ W0       | ⬜ pending |
| TBD     | —    | —    | GATE-02            | T-3-mangle  | AGENT `bulk_delete` rejected at dispatch                                                                     | unit        | same file                                                                | ❌ W0       | ⬜ pending |
| TBD     | —    | —    | GATE-02            | T-3-mangle  | AGENT `tag_manage/merge` returns `POLICY_GATE_REQUIRES_OWNER` at dispatch                                    | unit        | same file                                                                | ❌ W0       | ⬜ pending |
| TBD     | —    | —    | GATE-02            | T-3-session | OWNER passes all ops through dispatch (no pre-dispatch rejection)                                            | unit        | same file                                                                | ❌ W0       | ⬜ pending |
| TBD     | —    | —    | GATE-03            | —           | AGENT `create`/`update`/`complete`/`tag_manage:create` allowed                                               | unit        | `npm run test:unit -- tests/unit/tools/write-tool-policy-guard.test.ts`  | ✅ existing | ⬜ pending |
| TBD     | —    | —    | READ-01            | —           | AGENT read modes (today/overdue/flagged/available/blocked/inbox/date-range/count-only) never hit policy gate | unit        | `npm run test:unit -- tests/unit/tools/index-rolegate.test.ts`           | ❌ W0       | ⬜ pending |
| TBD     | —    | —    | READ-02            | —           | AGENT `omnifocus_read` with `filters.id` succeeds                                                            | unit        | same file                                                                | ❌ W0       | ⬜ pending |
| TBD     | —    | —    | READ-03            | —           | AGENT `omnifocus_read` type=perspectives (list + read) succeeds                                              | unit        | same file                                                                | ❌ W0       | ⬜ pending |
| TBD     | —    | —    | D-12/D-13          | T-3-leak    | `whoami` AGENT payload has `role`+`roleSource`, omits `identity`/`principal`                                 | unit        | `npm run test:unit -- tests/unit/tools/system/SystemTool-whoami.test.ts` | ❌ W0       | ⬜ pending |
| TBD     | —    | —    | D-12/D-13          | T-3-leak    | `whoami` OWNER payload has `role`+`identity{transport,roleSource,principal}`                                 | unit        | same file                                                                | ❌ W0       | ⬜ pending |
| TBD     | —    | —    | D-15               | —           | `SystemToolSchema` Zod enum and `inputSchema` getter both enumerate `whoami`                                 | unit        | same file (or extend SystemTool test)                                    | ❌ W0       | ⬜ pending |
| TBD     | —    | —    | GATE-01/02/READ-\* | —           | End-to-end MCP: AGENT vs OWNER `tools/list` + `tools/call` over stdio                                        | integration | `npm run test:integration -- tests/integration/mcp-protocol.test.ts`     | ⚠️ extend   | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `tests/unit/tools/index-rolegate.test.ts` — GATE-01 (ListTools trim AGENT vs OWNER), GATE-02 (CallTool dispatch
      gate: deny/gate codes), READ-01/02/03 (read ops pass through gate, no policy fire)
- [ ] `tests/unit/tools/system/SystemTool-whoami.test.ts` — D-12/D-13 (whoami AGENT vs OWNER redaction), D-15
      (dual-schema parity for `whoami`)
- [ ] Extend `tests/unit/auth/operation-policy.test.ts` — add D-06 advertise⟺enforce parity test block (over
      `allowedOperations(role)`)
- [ ] Extend `tests/integration/mcp-protocol.test.ts` — parameterize for AGENT-trimmed vs OWNER-full tool surface

_Existing vitest + mock-cache pattern from `write-tool-policy-guard.test.ts` applies — no new framework or fixtures._

---

## Manual-Only Verifications

| Behavior                                                                                   | Requirement   | Why Manual                                                                                  | Test Instructions                                                                                                    |
| ------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| AGENT write hot-path persists in real OmniFocus (create/complete/drop/defer/tag/move/flag) | GATE-03       | Requires live OmniFocus app; persistence is Phase 5's verifier scope but smoke-checked here | Start server with `OMNIFOCUS_MCP_ROLE=agent`, run each write op via MCP, confirm change in OmniFocus UI              |
| AGENT read paths return real data end-to-end                                               | READ-01/02/03 | Requires live OmniFocus database                                                            | Start agent server, run `tools/call omnifocus_read` for each mode + perspectives, confirm non-empty/expected results |

_Unit + integration suites cover gate/advertisement/redaction logic; only live-DB persistence is manual (and is Phase
5's formal scope)._

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency acceptable (unit seconds)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
