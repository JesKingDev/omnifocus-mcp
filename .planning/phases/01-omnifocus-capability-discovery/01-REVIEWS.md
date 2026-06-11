---
phase: 1
reviewers: [gemini, codex]
reviewed_at: 2026-06-11T17:34:07Z
plans_reviewed: [01-01-PLAN.md, 01-02-PLAN.md, 01-03-PLAN.md, 01-04-PLAN.md]
note:
  opencode reviewer attempted but failed (its default model routes through a Google API key that is not configured);
  claude skipped (self — running inside Claude Code CLI)
---

# Cross-AI Plan Review — Phase 1

## Gemini Review

# Implementation Plan Review: Phase 1 — Capability Discovery

## 1. Summary

The implementation plans for Phase 1 are exceptionally well-structured, treating documentation not as a peripheral task
but as the critical architectural gate it is for the `agent-workflow` milestone. The sequencing is logical, moving from
infrastructure validation (Wave 1) to data-model findings (Wave 2) and complex automation assessments (Wave 3),
concluding with a rigorous consistency audit (Wave 4). The use of the `DISC-<AREA>-NN` citation contract ensures that
this phase provides a machine-readable "contract" that downstream agents can use to make authoritative build-vs-reuse
decisions.

---

## 2. Strengths

- **Rigorous Evidence Standard:** The tri-state evidence tagging (`verified` | `doc` | `unverified`) prevents
  speculative assumptions from being treated as fact, which is critical when dealing with the known quirks of the
  OmniFocus JXA/OmniJS bridge.
- **Safety-First Probe Design:** Probes that mutate the live store (e.g., `disc-persp-01`, `disc-tag-01`) include
  mandatory backup, read-back, and restore logic, minimizing the risk to user data.
- **Traceability focus:** Plan 04’s specific audit of "Downstream-phase citation coverage" ensures the report isn't just
  comprehensive in a vacuum, but specifically addresses the needs of Phases 2–6.
- **Pragmatic Handling of Version Risks:** The plans correctly prioritize `omni-automation.com` over the bundled PDF,
  acknowledging the version gap between the PDF's generation and the user's current 4.8.11 installation.
- **D-08 Fit Matrix:** The inclusion of a dedicated automation-surface fit assessment de-risks the most technically
  complex part of the milestone (Perspective provisioning and routing writes).

---

## 3. Concerns

- **Restart Persistence Limitation**  
  **Severity: MEDIUM**  
  Plan 03 acknowledges that `archivedFilterRules` persistence across app restarts will remain `unverified` because
  probes cannot easily restart the app. While this is a reasonable boundary for an automated probe, it leaves a
  significant "known unknown" for Phase 6 (PROV-01). If rules don't persist across restarts, the entire perspective
  repair strategy may fail.
- **Information Disclosure in Reports**  
  **Severity: LOW**  
  Probes like `disc-persp-02` (enumerate all custom perspectives) could inadvertently leak sensitive personal
  project/perspective names into the repository's git history if the agent pastes raw output. While Plan 03 includes a
  mitigation (redaction), the risk remains if the agent is not sufficiently "surgical" during execution.
- **Sequential Wave Overhead**  
  **Severity: LOW**  
  The 4-wave sequential dependency is conservative because all plans edit `docs/reference/omnifocus-capabilities.md`.
  This is correct for context efficiency and avoiding merge collisions, but it does mean the phase cannot be
  parallelized. (Acceptable given the documentation nature).

---

## 4. Suggestions

- **Manual Restart Verification:** In Plan 04, consider adding a specific manual instruction for the human reviewer to
  perform one "Write rules -> Quit OF -> Open OF -> Read rules" cycle to resolve the `DISC-PERSP-01` restart persistence
  question before final sign-off.
- **Tombstone Discipline:** Explicitly instruct the agent to use the "REMOVED" tombstone pattern mentioned in
  RESEARCH.md if they find a finding is invalid during the audit, rather than renumbering, to maintain the stability of
  the DISC IDs for downstream phases already being drafted.
- **JSON-Only Probe Output:** Mandate that all probe scripts output _only_ JSON to stdout (no console logs) to make the
  "Paste probe output" step cleaner and less prone to including incidental debug text.

---

## 5. Risk Assessment

**Overall Risk: LOW**

The phase is primarily documentation and "throwaway" code. The highest risk is data tampering during write probes, which
is mitigated by explicit cleanup and restore requirements. The architectural risk (making the wrong build-vs-reuse call)
is mitigated by the hybrid evidence standard and the final consistency audit. The "restart persistence" gap is the only
notable technical risk, but it is explicitly flagged and tracked, preventing it from becoming a silent failure.

**Verdict: Approved. Proceed to Wave 1.**

---

## Codex Review

## Summary

The four-wave sequence is appropriate because every plan modifies the same report and later work depends on earlier
probe evidence. Coverage is broad and the citation-oriented report structure should support downstream phases. However,
the plans currently violate their own evidence definition, perform autonomous writes against the live OmniFocus store
without sufficiently fail-safe cleanup, and allow critical gate claims to remain unverified while still marking
validation complete. These issues should be corrected before execution.

## Strengths

- All seven area codes are explicitly covered: `TAG`, `FILTER`, `FIELD`, `MODEL`, `PERSP`, `CAPTURE`, and `AUTO`.
- The `DISC-<AREA>-NN` contract is concrete and designed for downstream citation.
- The sequential waves are justified because all plans edit one report and consume prior probe results.
- The plans distinguish documentation/probe work from production feature implementation.
- Six probe scripts are planned, covering the required gate claims, with the capture probe covering both note
  persistence and inbox immediacy.
- Findings require verdict, rationale, evidence, source, and downstream usage.
- Unverified claims are intended to remain visible rather than being silently treated as facts.
- Plan 4 includes an explicit human review before final sign-off.
- D-08 receives a concrete fit matrix rather than a superficial automation inventory.

## Concerns

- **HIGH: Evidence tags conflict with D-05.**  
  D-05 defines `verified` as live-probed on OmniFocus 4.8.11. Plans 02–04 repeatedly use `evidence: verified` for
  codebase documents such as `CLAUDE.md`, `SETTER-PATTERNS.md`, and query notes. Plan 4 explicitly permits a codebase
  citation as sufficient for `verified`. Those should be `doc`, a separate `code` category if the decision is revised,
  or actually live-probed.

- **HIGH: Live-write probes are not fail-safe enough.**  
  Cleanup is required, but the plans do not mandate `try/finally`. Any exception after object creation could leave
  tasks, projects, or tags behind. Project cleanup even permits “drop or delete”; dropping leaves an artifact and
  deletion may bypass the hardened mutation policy.

- **HIGH: Perspective probing modifies real user configuration autonomously.**  
  Plan 03 writes to the JessOS or first available custom perspective before any human checkpoint. Writing the same value
  does not prove meaningful mutation, while adding whitespace may corrupt or normalize the archived representation.
  Restoration itself can also fail.

- **HIGH: A critical gate remains unresolved at phase completion.**  
  Cross-restart persistence of `archivedFilterRules` is identified as a Phase 6 gate claim, but Plan 03 deliberately
  leaves it unverified and Plan 04 still sets `nyquist_compliant: true`. A critical downstream gate should either be
  tested, supported by authoritative documentation, or explicitly prevent full validation.

- **HIGH: Several verdicts violate the locked three-value vocabulary.**  
  Examples include `native/limited`, `native/build`, and area summaries such as `extend + build`. D-04 permits only
  `native`, `extend`, or `build`. Mixed implications should be represented as separate findings while the area-level
  verdict remains one valid value.

- **MEDIUM: Negative claims do not consistently meet D-02’s evidence standard.**  
  “No custom fields” relies on a discourse post; “no dependencies” relies on a community plug-in; “no perspective.tasks”
  is inferred from API omission. These may be useful supporting evidence, but they are not equivalent to current
  official OF4 documentation or a probe.

- **MEDIUM: Probe output may disclose private OmniFocus metadata.**  
  The perspective enumeration probe returns all names, and the plan then says to paste its output into the committed
  report. The threat model says names must be redacted, but the task instructions do not enforce sanitized output. The
  warmup’s “first 20 lines” has the same risk.

- **MEDIUM: Collision handling is underspecified.**  
  Fixed names such as `disc-probe-sequential-test` can collide with leftovers from prior runs or real objects. Cleanup
  could then affect an object the probe did not create.

- **MEDIUM: Plan 04’s validation semantics are too permissive.**  
  It allows unresolved rows to be marked “flaky” while still setting `nyquist_compliant: true`. Compliance should
  distinguish accepted low-risk research gaps from unresolved build-decision gates.

- **LOW: Documentation scope contains unnecessary ceremony.**  
  Mermaid styling, minimum line counts, embedded raw probe output, and a large audit log add volume without directly
  improving the citation contract.

- **LOW: Verification commands are shallow.**  
  Most checks count matching lines but do not verify table completeness, valid verdict vocabulary, evidence-source
  consistency, cleanup success, or proximity of follow-up notes.

## Suggestions

- Enforce the evidence taxonomy mechanically:
  - `verified`: successful live probe on 4.8.11.
  - `doc`: current official OF4 documentation.
  - `unverified`: codebase inference, third-party source, API omission, or unresolved negative claim.
- Require every write probe to use `try/finally`, track created object IDs, and clean up only objects created during
  that run.
- Generate probe names with a UUID and abort if an unexpected pre-existing object matches.
- Add a human checkpoint before the first live-store write, especially before modifying perspective rules.
- Do not write to a real perspective autonomously. Prefer a disposable user-created test perspective or a manual,
  explicitly approved backup/write/restart/read/restore procedure.
- Resolve `archivedFilterRules` restart persistence before sign-off, or mark Phase 1 partially complete with Phase 6
  still gated.
- Require exactly one valid area verdict. Put differing behavior into separate finding verdicts.
- Sanitize probe output before committing it. Record counts, booleans, target IDs, and hashes rather than user-visible
  names or task data.
- Replace raw output blocks with a compact evidence appendix containing command, timestamp, sanitized result, cleanup
  result, and app version.
- Move probes under an established manual-test location, or state whether `probes/` is intentionally retained as
  reproducible evidence.
- Add a validation script that checks all findings for valid verdicts, evidence tags, required fields, and follow-up
  notes.
- Remove minimum line-count gates; validate required content instead.

## Risk Assessment

**Overall risk: HIGH**

The report structure and dependency ordering are strong, but the current plans can mutate live user data without
guaranteed restoration and can label non-probed claims as verified. They also permit a known Phase 6 gate to remain
unresolved while declaring validation complete. Correcting evidence semantics, write-probe safety, and final sign-off
rules would reduce the risk to LOW–MEDIUM.

---

## Consensus Summary

Two independent reviewers (gemini, codex) reviewed the four Phase-1 plans. They **agree the structure is strong** and
**disagree sharply on overall risk** (gemini LOW / "approved"; codex HIGH / "correct before execution"). The
disagreement is informative: codex did a closer read of the locked CONTEXT decisions (D-02/D-04/D-05) and the live-write
probe mechanics and found concrete violations that gemini treated as acceptable boundaries.

### Agreed Strengths

- The `DISC-<AREA>-NN` citation contract is concrete and built for downstream (Phase 2–6) consumption.
- All seven area codes (TAG/FILTER/FIELD/PERSP/MODEL/CAPTURE/AUTO) are covered; six gate-claim probes are planned.
- Sequential 4-wave ordering is justified — every plan edits the single report file and consumes prior probe evidence.
- The tri-state evidence discipline and the Plan-04 human checkpoint + downstream-citation audit are good design.
- D-08 gets a real automation fit matrix, not a superficial inventory.

### Agreed Concerns (highest priority — both reviewers)

- **`archivedFilterRules` cross-restart persistence stays `unverified`** but Plan 04 still flips
  `nyquist_compliant: true`. Both flag this; codex rates it HIGH (a critical Phase-6/PROV-01 gate declared "validated"
  while unproven), gemini MEDIUM. → Plan 04 should either resolve it (manual write→quit→reopen→read cycle at the human
  checkpoint, per gemini's suggestion) or mark Phase 1 partially complete with Phase 6 still gated.
- **Probe output may leak private OmniFocus data** (perspective names from `disc-persp-02`, warmup's "first 20 lines")
  into committed git history. Redaction is mentioned but not mechanically enforced. → Mandate sanitized output
  (counts/booleans/IDs/hashes, not user-visible names).

### Codex-only HIGH concerns (worth acting on — gemini did not surface these)

- **Evidence-tag misuse vs D-05.** Plans use `evidence: verified` for codebase docs (CLAUDE.md, SETTER-PATTERNS.md).
  D-05 reserves `verified` for live-probed-on-4.8.11. Should be `doc` (or a revised `code` category).
- **Verdicts violate the locked 3-value vocabulary (D-04).** Examples: `native/limited`, `native/build`,
  `extend + build`. D-04 permits only `native | extend | build`. Split mixed behavior into separate findings; keep one
  valid area-level verdict.
- **Live-write probes are not fail-safe.** No mandated `try/finally`; an exception after object creation leaves orphaned
  tasks/projects/tags. Project cleanup even permits "drop or delete" (drop leaves an artifact; delete may bypass the
  hardened mutation policy from the shipped milestone).
- **Perspective probe writes real user config autonomously** before any human checkpoint, and writing the same value
  doesn't prove mutation while whitespace edits risk normalization/corruption. → Add a checkpoint before the first
  live-store write; prefer a disposable test perspective over the real JessOS one.

### Divergent Views

- **Overall risk: LOW (gemini) vs HIGH (codex).** The gap is entirely about whether the live-write-probe safety and
  evidence-tag discipline are "adequate as written" (gemini) or "must be tightened first" (codex). Given this repo's own
  history — the hardening milestone existed specifically to stop silent write failures and gate destructive ops —
  codex's stricter line is well-aligned with project values and worth heeding.

### Recommended disposition

The structural design is sound; no replan-from-scratch needed. The codex HIGH items are targeted, mechanical fixes
(evidence-tag taxonomy, single-valued verdicts, `try/finally` + UUID-named objects + abort-on-collision, a pre-write
human checkpoint, and honest `nyquist_compliant` semantics). Folding them in via `/gsd-plan-phase 1 --reviews` before
execution is the high-value move.
