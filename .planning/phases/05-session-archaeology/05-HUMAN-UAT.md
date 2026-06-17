---
status: partial
phase: 05-session-archaeology
source: [05-VERIFICATION.md]
started: 2026-06-16T23:10:57Z
updated: 2026-06-16T23:45:00Z
---

## Current Test

[testing paused — 1 issue, 2 blocked on the Test 1 fix]

## Tests

### 1. Detection recall over a real 7-day scan (ARCH-01)

expected: Run a real session-archaeology scan and sample the surfaced loops against the source transcripts. No obvious
open loop is missed and no noise is surfaced; detection recall holds over live content. Pay extra attention to long
assistant turns — REVIEW WR-01 (first-text-block-only extraction) and WR-05 (200-char CLI truncation) can drop a
trailing `TODO`/`next:` marker. result: issue reported: "I tried each of the skill invocation keywords and each time it
ran only for that session. In a brand new session, it actually did nothing." severity: major

### 2. Merged approval gate behavior (ARCH-02)

expected: Invoke the skill and walk the merged gate — the per-session summary table fires; `yes` / `edit` / `abort` all
work; a row-level `edit` applies and re-shows; and NOTHING is created before `yes`. Exactly one merged gate, plain-text
(not AskUserQuestion), zero `omnifocus_write` calls before approval. result: blocked blocked_by: prior-phase reason:
"Gate cannot be exercised until the Test 1 scope bug is fixed — the scan surfaces nothing cross-session, so no merged
table to walk."

### 3. Placement correctness — MATCH / INFER / LEAVE (ARCH-03)

expected: Approve loops with a mix of MATCH / INFER / LEAVE placements and confirm where they land in OmniFocus. Each
approved loop lands in the matched or inferred project (inbox as fallback), tagged `archaeology` with a lineage stamp.
result: blocked blocked_by: prior-phase reason: "Placement cannot be verified until the Test 1 scope bug is fixed — no
loops surface to approve and place."

## Summary

total: 3 passed: 0 issues: 1 pending: 0 skipped: 0 blocked: 2

## Gaps

- truth: "Saying 'scan my sessions' / 'find open loops' invokes the session-archaeology skill, which runs the pre-filter
  probe across the last 7 days of ALL transcripts." status: failed reason: "User reported: each keyword ran only for
  that session; a brand-new session did nothing. Actual transcript output shows 'scan my sessions' invoked the
  remember:remember skill, NOT session-archaeology — the skill never ran and no probe executed." severity: major test: 1
  root_cause: "Skill-routing collision (primary): the trigger phrase 'scan my sessions' was intercepted by
  remember:remember (a plugin skill whose SessionStart hook injects a salient REMEMBER block every session), so
  session-archaeology was never selected and probes/archaeology-prefilter.js never ran. The probe itself is correct —
  verified returning 40 distinct sessions across 97 transcripts in the 7-day window. Secondary defense-in-depth gap:
  even when the right skill triggers, Pass 1 Step 1 instructs but does not ENFORCE probe execution, and has no guard
  against answering from the current conversation." artifacts:
  - path: ".claude/skills/session-archaeology/SKILL.md" issue: "description front-loads the same phrases (scan my
    sessions / find open loops) but loses routing to remember:remember; no disambiguation. Pass 1 does not hard-enforce
    probe execution or prohibit answering from current-conversation context."
  - path: "(routing layer)" issue: "'scan my sessions' deterministically should map to session-archaeology but the model
    picked remember:remember. No deterministic trigger (slash command or UserPromptSubmit hook) guarantees the right
    skill." missing:
  - "Make natural-language triggering reliable: either a deterministic trigger (slash command / UserPromptSubmit hook
    for 'scan my sessions' etc.) or sharpen session-archaeology's description to win against remember:remember, with a
    disambiguation note."
  - "Enforce probe-first execution inside Pass 1 and add an explicit anti-introspection guard (never answer from the
    current conversation; no probe run = no scan)."
  - "Re-run UAT Test 1 from a brand-new session to confirm the correct skill fires and the cross-session scan surfaces
    loops." debug_session: "" fix_applied: "Direct-invocation + enforcement fix (committed). (1) Added
    .claude/commands/archaeology.md → /archaeology slash command for deterministic direct invocation (no NL inference).
    (2) Rewrote SKILL.md description to anchor on the distinctive word 'archaeology' and explicitly NOT route on
    collision-prone phrases ('scan my sessions' etc.). (3) Added an EXECUTION GUARD to Pass 1: running the probe is the
    mandatory first action; answering from the current conversation is prohibited. Re-test required from a BRAND-NEW
    session via /archaeology." fix_applied_phase2: "Token-efficient + global redesign implemented on branch
    05-archaeology-token-efficient-scan (spec/plan under docs/superpowers/). Probe now: per-session watermark dedup
    (only NEW content re-emitted), scans ALL ~/.claude/projects/\* dirs, newest-first, source-dir shown at the gate, CLI
    modes scan/--commit/--reset backed by ~/.claude/session-archaeology/state.json. Skill drives a per-batch (5-session)
    resumable approval gate that commits each batch's watermark only after yes/reviewed-empty (never on abort). Skill +
    /archaeology installed globally via symlink. 2444 unit tests green; final code review issues fixed. VERIFICATION
    STILL PENDING: brand-new-session /archaeology run (UAT Test 1) — unblocks Tests 2 and 3."
