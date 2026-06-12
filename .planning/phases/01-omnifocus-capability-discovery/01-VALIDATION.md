---
phase: 1
slug: omnifocus-capability-discovery
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-11
updated: 2026-06-12
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

| Req ID  | Behavior                                                                                                  | Test Type         | Automated Command                    | Verified By                                                                                 | Status   |
| ------- | --------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------- | -------- |
| DISC-01 | Report covers all seven area codes (TAG, FILTER, FIELD, PERSP, MODEL, CAPTURE, AUTO) with ≥1 finding each | Manual doc review | —                                    | 28 findings across 7 areas (TAG 3, FILTER 3, FIELD 3, PERSP 4, MODEL 6, CAPTURE 4, AUTO 5)  | ✅ green |
| DISC-01 | Claims tagged `evidence: verified` have a corresponding probe that produced matching output               | Manual trace      | `osascript -l JavaScript <probe>.js` | 6 live probes in `probes/`; each verified finding has a sanitized in-report appendix        | ✅ green |
| DISC-02 | Each area section records a 3-way verdict (native / extend / build)                                       | Manual doc review | —                                    | 7 single-value area verdicts; 0 slash-combined values                                       | ✅ green |
| DISC-02 | Each verdict carries a one-line rubric reason + evidence tag (`verified` \| `doc` \| `unverified`)        | Manual doc review | —                                    | Every finding has Verdict + Rubric + Evidence + Source + Downstream cite per D-04/D-05      | ✅ green |
| DISC-02 | No `evidence: unverified` finding remains without an explicit follow-up note                              | Manual doc review | —                                    | 2 accepted research gaps (CAPTURE-04, AUTO-04), each with a follow-up note — no silent gaps | ⚠️ flaky |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Probe harnesses already exist — no test-file gaps. The executor must, before relying on any probe as evidence:

- [x] Confirm `tests/manual/perspectives/` scripts run cleanly against OmniFocus 4.8.11 (WAVE-0-HARNESS-CHECK)
- [x] Verify `docs/jxa-test-utilities.js` executes without error on the current machine (exit 0, 7 collections)
- [x] Run `npm run build` before any MCP-based probe (required by CLAUDE.md) (build passed)

---

## Manual-Only Verifications

| Behavior                                                          | Requirement | Why Manual                                                                                 | Test Instructions                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Six gate-claim probes confirm version-sensitive capability claims | DISC-01     | Requires the live OmniFocus 4.8.11 app; no headless harness                                | Run each probe (tag auto-creation, `archivedFilterRules` persistence across restart, `new Task(name, inbox)` + note round-trip, `project.sequential` write-back, `Perspective.Custom.all` enumerates JessOS, inbox collection immediacy); record output in the matching finding |
| Report citation contract is usable downstream                     | DISC-02     | Judgment call — does each area's verdict give a later phase a concrete build-vs-reuse hook | Reviewer spot-checks that Phases 2–6 can each cite ≥1 `DISC-<AREA>-NN` finding                                                                                                                                                                                                  |

---

## Validation Sign-Off

- [x] All capability areas have probe evidence or an explicit `doc`/`unverified` tag
- [x] Sampling continuity: every `evidence: verified` finding traces to a probe run
- [x] Wave 0 harness checks pass against 4.8.11
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter once the above hold

**Approval:** Approved 2026-06-12 — Phase 1 report complete. Restart persistence result: **confirmed persistent**
(`archivedFilterRules` change survived Cmd-Q + reopen on 4.8.11). The one BUILD-DECISION gate (DISC-PERSP-01
cross-restart, gating Phase 6 PROV-01) is resolved with full evidence. Two accepted low-risk research gaps remain
flagged (DISC-CAPTURE-04 templates, DISC-AUTO-04 plug-ins) — neither is a build-decision gate. Report gates Phases 2–6.
