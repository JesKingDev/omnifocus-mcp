---
phase: 1
slug: omnifocus-capability-discovery
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **Nature of this phase:** the deliverable is a documentation artifact (`docs/reference/omnifocus-capabilities.md`),
> not feature code. Validation = confirming that capability claims tagged `evidence: verified` were genuinely
> live-probed against OmniFocus 4.8.11, and that every area's native-vs-build verdict is present and concrete. There are
> no new unit/integration tests to author — the validation layer is the probe-execution evidence itself.

---

## Test Infrastructure

| Property               | Value                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| **Framework**          | Manual live-probe execution (`osascript -l JavaScript`) + existing MCP integration smoke tests |
| **Config file**        | none new — reuses `tests/manual/perspectives/` harnesses + `docs/jxa-test-utilities.js`        |
| **Quick run command**  | `osascript -l JavaScript <probe-script>.js`                                                    |
| **Full suite command** | `npm run build && npm run test:unit && npm run test:integration`                               |
| **Estimated runtime**  | ~per-probe seconds; full suite per existing repo timings                                       |

---

## Sampling Rate

- **After every probe (per capability area):** Run the area's gate-claim probe(s) before writing the
  `evidence: verified` finding; paste probe output into the finding as evidence.
- **After every plan wave:** Confirm the area sections produced so far each carry a 3-way verdict.
- **Before `/gsd-verify-work`:** Full pass — (a) all seven area sections exist, (b) every build-decision finding has
  `evidence: verified` or an explicit `unverified` flag with a follow-up note, (c) downstream phases can cite ≥1
  `DISC-<AREA>-NN` ID.
- **Max feedback latency:** probe turnaround (seconds), live against the running app.

---

## Per-Task Verification Map

| Req ID  | Behavior                                                                                                  | Test Type         | Automated Command                    | Verified By                                                | Status     |
| ------- | --------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------ | ---------------------------------------------------------- | ---------- |
| DISC-01 | Report covers all seven area codes (TAG, FILTER, FIELD, PERSP, MODEL, CAPTURE, AUTO) with ≥1 finding each | Manual doc review | —                                    | Reviewer confirms each area section exists                 | ⬜ pending |
| DISC-01 | Claims tagged `evidence: verified` have a corresponding probe that produced matching output               | Manual trace      | `osascript -l JavaScript <probe>.js` | Probe script exists and output matches the claim           | ⬜ pending |
| DISC-02 | Each area section records a 3-way verdict (native / extend / build)                                       | Manual doc review | —                                    | Reviewer reads each area's verdict block                   | ⬜ pending |
| DISC-02 | Each verdict carries a one-line rubric reason + evidence tag (`verified` \| `doc` \| `unverified`)        | Manual doc review | —                                    | Reviewer confirms verdict format per D-04/D-05             | ⬜ pending |
| DISC-02 | No `evidence: unverified` finding remains without an explicit follow-up note                              | Manual doc review | —                                    | Reviewer confirms each `unverified` is flagged, not silent | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Probe harnesses already exist — no test-file gaps. The executor must, before relying on any probe as evidence:

- [ ] Confirm `tests/manual/perspectives/` scripts run cleanly against OmniFocus 4.8.11
- [ ] Verify `docs/jxa-test-utilities.js` executes without error on the current machine
- [ ] Run `npm run build` before any MCP-based probe (required by CLAUDE.md)

---

## Manual-Only Verifications

| Behavior                                                          | Requirement | Why Manual                                                                                 | Test Instructions                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Six gate-claim probes confirm version-sensitive capability claims | DISC-01     | Requires the live OmniFocus 4.8.11 app; no headless harness                                | Run each probe (tag auto-creation, `archivedFilterRules` persistence across restart, `new Task(name, inbox)` + note round-trip, `project.sequential` write-back, `Perspective.Custom.all` enumerates JessOS, inbox collection immediacy); record output in the matching finding |
| Report citation contract is usable downstream                     | DISC-02     | Judgment call — does each area's verdict give a later phase a concrete build-vs-reuse hook | Reviewer spot-checks that Phases 2–6 can each cite ≥1 `DISC-<AREA>-NN` finding                                                                                                                                                                                                  |

---

## Validation Sign-Off

- [ ] All capability areas have probe evidence or an explicit `doc`/`unverified` tag
- [ ] Sampling continuity: every `evidence: verified` finding traces to a probe run
- [ ] Wave 0 harness checks pass against 4.8.11
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter once the above hold

**Approval:** pending
