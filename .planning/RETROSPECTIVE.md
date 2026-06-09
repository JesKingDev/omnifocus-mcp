# Project Retrospective

_A living document updated after each milestone. Lessons feed forward into future planning._

## Milestone: Hardening

**Shipped:** 2026-06-09 **Phases:** 6 | **Plans:** 23 | **Tag:** `jk/hardening`

### What Was Built

- Fail-safe role model (OWNER | AGENT) resolved before any dispatch, identity separated from authorization.
- Deny-deletes + gated structural ops enforced at the single mutation funnel, with a defense-in-depth re-assertion in
  the script builders.
- RoleGate: role-aware `ListTools` advertisement + dispatch-point enforcement, shipping a usable least-privilege stdio
  agent with its full read surface (including native OmniFocus perspectives).
- HTTP edge hardening: constant-time bearer auth, loopback-only fail-closed bind, DNS-rebinding protection, Tailscale
  `serve`-only, owner+agent token parity with stdio.
- Write-verifier: independent post-mutation read-back round-trip with a per-field-type diff and a
  `verified | unverified | skipped` status, verified live against real OmniFocus.
- Least-privilege launchd deployment: LaunchAgent on a pinned Developer-ID Node path, Automation-only grant, fail-fast
  probe, and ADR-005 superseding ADR 001.

### What Worked

- **Strict bottom-up phase order** (role → policy → gate → HTTP → verifier → deploy). Each layer was independently
  testable and shippable, and the dependency order held with no rework loops.
- **The single mutation funnel paid off twice.** Putting deny-delete enforcement and write-verification at the same
  normalization point (where single and batch ops converge) meant the batch-parity invariant and the verifier covered
  every agent mutation by construction, not by enumeration.
- **Decisions locked in discuss-phase** (the D-NN series) gave executors unambiguous contracts; downstream agents didn't
  re-litigate already-settled choices.
- **Live/human verify gate caught what units couldn't** — the `withCorrelation` constructor-collision that crashed
  `whoami` only surfaced through the Phase 3 end-to-end smoke test, then became a permanent regression test and a
  project memory.

### What Was Inefficient

- **REQUIREMENTS.md traceability drifted from reality — twice.** Phase 3 flagged the READ checkboxes as stale; Phase 5's
  VERIFY-01/02/03 stayed marked "Pending" all the way to the milestone audit despite a passing verification. The
  3-source cross-reference caught it, but the fix belonged at phase close.
- **GSD state counters were unreliable throughout** (`total_phases: 3` for a 6-phase milestone, "Phase 06 of 4",
  `milestone_name` parsed as a goal fragment). Cosmetic, but it made STATE.md untrustworthy at a glance.
- **Nyquist VALIDATION.md frontmatter never flipped to compliant** at phase close for Phases 3–6 (Phase 2 had none). The
  underlying tests passed, so this was pure bookkeeping debt that the audit had to reconcile.
- **OS-level verification can't be unit-tested**, so Phase 6's TCC/launchd behavior (host spikes S4/S5/S6) and Phase 4's
  Tailscale-Serve operational check shipped as deferred, risk-accepted debt rather than proven facts.

### Patterns Established

- **Single enforcement point** for destructive-op denial AND write-verification — the mutation funnel.
- **Verification = a fresh `osascript` spawn**, never an in-script read of the same context (stale-state defense).
- **Developer-ID Node pinning** for TCC-grant survival across `brew upgrade` (content-independent designated
  requirement).
- **`withCorrelation` override** is mandatory for any tool that repurposes `BaseTool` constructor arg 2; drive
  regression tests through the reconstruction path, not direct construction.

### Key Lessons

1. **Update REQUIREMENTS.md traceability at phase close, not at milestone audit.** The drift recurred (READ in P3,
   VERIFY in P5) — make checking off requirements part of the phase-completion gate, not a milestone-end sweep.
2. **For domains with OS-level behavior (TCC, launchd), plan an explicit "host verification" track from the start** and
   treat it as tracked-but-deferred debt, so the asterisk on "done" is deliberate rather than a close-time surprise.
3. **Keep the end-of-phase live/human verify gate.** It caught a real dispatch-path bug that the full unit suite missed;
   the cost is small relative to the class of failure it catches.

### Cost Observations

- Model profile: `quality` (Opus-weighted). Exact opus/sonnet/haiku mix not tracked this milestone.
- Sessions: roughly one focused session per phase across 2026-06-03 → 2026-06-09.
- Notable: the most expensive single plan was Phase 3 P04 (~2700s) — the read-path confirmation + live smoke test that
  surfaced the `withCorrelation` bug. Worth every second.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Key Change                                                                 |
| --------- | ------ | -------------------------------------------------------------------------- |
| Hardening | 6      | First GSD milestone on this fork; established discuss→plan→execute→verify. |

### Cumulative Quality

| Milestone | Tests | Live-Verified | Deferred Debt (risk-accepted) |
| --------- | ----- | ------------- | ----------------------------- |
| Hardening | 2375  | Phase 5 (OF)  | 3 (Phase 4 + Phase 6 on-host) |

### Top Lessons (Verified Across Milestones)

1. _(Pending a second milestone to cross-validate.)_ Candidate: requirement-traceability upkeep belongs at phase close,
   not milestone end — drifted twice within this milestone alone.
