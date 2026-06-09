---
phase: 6
slug: launchd-deployment-adr
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-09
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **Nature of this phase:** Most Phase 6 validation is a **host spike run under `launchctl`**, not unit tests — TCC
> Automation-grant behavior cannot be unit-tested (a terminal-run probe inherits the terminal's grant and gives a false
> pass). The automatable surface is the fail-fast probe's exit-code logic (mockable) and the ADR doc check. See
> `06-RESEARCH.md` → Validation Architecture and the S0–S5 spike for the manual half.

---

## Test Infrastructure

| Property               | Value                                                     |
| ---------------------- | --------------------------------------------------------- |
| **Framework**          | vitest (existing)                                         |
| **Config file**        | `vitest.config.ts` (existing)                             |
| **Quick run command**  | `npm run test:unit`                                       |
| **Full suite command** | `npm run test:integration` (npm, not bun — per CLAUDE.md) |
| **Estimated runtime**  | ~unit fast; integration variable                          |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm run test:integration`
- **Before `/gsd-verify-work`:** Full unit suite green; host spike S0–S5 executed and recorded
- **Max feedback latency:** unit seconds; spike is one-time manual

---

## Per-Task Verification Map

| Task ID           | Plan    | Wave | Requirement | Threat Ref | Secure Behavior                                                                                        | Test Type           | Automated Command                                                     | File Exists | Status     |
| ----------------- | ------- | ---- | ----------- | ---------- | ------------------------------------------------------------------------------------------------------ | ------------------- | --------------------------------------------------------------------- | ----------- | ---------- |
| 6-probe-deny      | probe   | 1    | DEPLOY-03   | —          | Probe exits 1 + remediation msg on `-1743`/`errAEEventNotPermitted` in stderr; no transport binds      | unit (mock spawn)   | `npm run test:unit`                                                   | ❌ W0       | ⬜ pending |
| 6-probe-timeout   | probe   | 1    | DEPLOY-03   | —          | Probe exits 2 + timeout msg when child exceeds 5s (SIGKILL child); never hangs                         | unit (fake timers)  | `npm run test:unit`                                                   | ❌ W0       | ⬜ pending |
| 6-probe-clean     | probe   | 1    | DEPLOY-03   | —          | Clean probe (exit 0) proceeds to bind transports                                                       | unit                | `npm run test:unit`                                                   | ❌ W0       | ⬜ pending |
| 6-probe-precede   | probe   | 1    | DEPLOY-03   | —          | Probe runs BEFORE any transport bind/listen and supersedes the non-blocking `permissions.ts` warn path | unit/source         | `npm run test:unit`                                                   | ❌ W0       | ⬜ pending |
| 6-adr-supersede   | adr     | 1    | DEPLOY-04   | —          | ADR-005 exists, has Nygard sections (Status/Context/Decision/Consequences), contains supersede line    | doc check           | `grep -q "Supersedes ADR 001" docs/adr/ADR-005-deployment-posture.md` | ❌ W0       | ⬜ pending |
| 6-grant-survives  | install | 2    | DEPLOY-01   | —          | TCC grant survives in-place Developer-ID node overwrite (no re-prompt)                                 | **manual spike S4** | host, under `launchctl`                                               | n/a         | ⬜ pending |
| 6-no-restart-loop | install | 2    | DEPLOY-01   | —          | Permission-denial exit (1/2) does NOT restart-loop under `KeepAlive={Crashed=true}`                    | **manual spike S5** | host, under `launchctl`                                               | n/a         | ⬜ pending |
| 6-least-priv      | plist   | 2    | DEPLOY-02   | —          | plist requests Automation only — no FDA key, no `Sockets`, no entitlement keys, `SessionCreate` unset  | source/doc check    | `npm run test:unit` or grep                                           | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `tests/unit/.../automation-probe.test.ts` — mock `node:child_process` spawn; assert exit codes 1 (deny `-1743`) /
      2 (timeout) / 0 (clean) and the remediation strings. Mirror the existing `src/utils/permissions.ts` mock pattern.
- [ ] Probe module under `src/` (exact path is planner/executor discretion).
- [ ] No framework install needed — vitest present.

---

## Manual-Only Verifications

| Behavior                                            | Requirement | Why Manual                                                                                     | Test Instructions                                                                                                                                                                 |
| --------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grant survives in-place Developer-ID node overwrite | DEPLOY-01   | TCC behavior is OS-level; not unit-testable; terminal run inherits terminal grant (false pass) | Run spike S0–S5 from `06-RESEARCH.md` under `launchctl`: seed grant against pinned Developer-ID node, overwrite binary in place, confirm end-to-end write succeeds with no prompt |
| No restart loop on permission-denial exit           | DEPLOY-01   | launchd lifecycle behavior; observed via `launchctl`/log inspection                            | Spike S5: revoke/deny grant, load agent, confirm probe exits non-zero and agent stays down (not throttled-restart-looping) under `KeepAlive={Crashed=true}`                       |
| First-run interactive grant seeding on macOS 26     | DEPLOY-01   | Exact prompt behavior on macOS 26 needs host observation (research MEDIUM-confidence)          | Spike S1/S3: run pinned binary interactively, confirm the Automation consent prompt names the pinned node as responsible process and the grant lands in `TCC.db`                  |

---

## Validation Sign-Off

- [ ] All automatable tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive automatable tasks without automated verify
- [ ] Wave 0 covers all MISSING references (probe test scaffold)
- [ ] No watch-mode flags
- [ ] Host spike S0–S5 recorded before `/gsd-verify-work`
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
