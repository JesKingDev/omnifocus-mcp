---
phase: 4
slug: review-loops-live-auto-capture
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **Framework**          | Vitest                                                                                 |
| **Config file**        | `vitest.config.ts` (unit) + integration project; integration excluded from `test:unit` |
| **Quick run command**  | `npm run test:unit`                                                                    |
| **Full suite command** | `npm run test:integration`                                                             |
| **Estimated runtime**  | unit ~seconds; integration runs against live OmniFocus                                 |

> **Use `npm`, not `bun`.** A bare `npx vitest run` trips the sandbox guard (~96 phantom failures); see project memory
> `post-merge-gate-use-test-unit`.

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm run test:integration` (allowlist + round-trip rows green; tolerate OMN-55 `clear*`
  re-run flake — but Phase 4 must NOT add `clear*` dependencies)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** unit < 30s

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement           | Threat Ref                            | Secure Behavior                                                                                        | Test Type   | Automated Command                                                      | File Exists                   | Status     |
| -------- | ---- | ---- | --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------- | ----------------------------- | ---------- |
| 04-01-xx | 01   | 0    | REVIEW-02             | —                                     | `review-output` / `review-capture` accepted as functional tags; arbitrary tags still rejected          | unit        | `npm run test:unit -- mutation-script-builder`                         | ❌ W0 (extend allowlist test) | ⬜ pending |
| 04-01-xx | 01   | 1    | REVIEW-01             | —                                     | update task with `flagged+plannedDate(today)+addTags:[review-capture]` round-trips on live active task | integration | `npm run test:integration -- field-roundtrip` (or new review-tag spec) | ❌ W0                         | ⬜ pending |
| 04-01-xx | 01   | 1    | REVIEW-01 (completed) | —                                     | completed task accepts `addTags:[review-output]`; tag reads back; no future `plannedDate` written      | integration | new spec under `tests/integration/tools/unified/`                      | ❌ W0                         | ⬜ pending |
| 04-02-xx | 02   | 1    | LIVE-01               | T-04 (over-capture / wrong-placement) | inbox create with lineage + live-marker tag stamps `agent-okay`, NO `archaeology`, lands in inbox      | integration | extend agent-capture harness (`create-with-lineage` test)              | ❌ W0 (extend)                | ⬜ pending |
| 04-02-xx | 02   | 1    | LIVE-01 (gate)        | T-04                                  | interactive-mode agent create returns `POLICY_GATE_CAPTURE_CONFIRM`; owner session grant bypasses      | unit        | existing policy/gate tests — add live-marker case                      | ✅ (pattern exists, extend)   | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] Extend the `FUNCTIONAL_TAG_ALLOWLIST` unit test to assert `review-output`, `review-capture`, and the live-capture
      marker tag are allowed (and that unrelated arbitrary tags remain rejected).
- [ ] Integration spec: review-capture update (flag + plannedDate + tag) round-trips on an active task.
- [ ] Integration spec: review-output tag on a completed task reads back (and no future `plannedDate` is written).
- [ ] Integration spec: live capture (inbox + lineage + live-marker), assert `agent-okay` present, `archaeology` absent,
      item in inbox.
- [ ] No new conftest/fixtures needed — reuse `sandbox-manager`, `run-id`, `assert-field-persisted` helpers.

---

## Manual-Only Verifications

| Behavior                                                                                                     | Requirement | Why Manual                                                                    | Test Instructions                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Completed task drops out of the active today view (Flagged + Forecast) on OF 4.8.11 (research assumption A1) | REVIEW-01   | Stock OmniFocus perspective rendering is not scriptable end-to-end            | After an integration run that completes a review-tagged task, open OmniFocus Forecast "Today" + Flagged and confirm the completed item no longer shows |
| Live-capture permission prompt renders + owner allow-all-session grant suppresses subsequent prompts         | LIVE-01     | Interactive prompt rendering happens agent-side in a real Claude Code session | Run the live-capture skill in an interactive session; confirm prompt-before-create, then grant allow-all and confirm no re-prompt                      |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (unit)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
