---
status: testing
phase: 05-session-archaeology
source: [05-VERIFICATION.md]
started: 2026-06-16T23:10:57Z
updated: 2026-06-19T03:30:00Z
---

## Current Test

number: 1 name: Detection recall over a real 7-day scan (ARCH-01) — RE-TEST after fix expected: | From a BRAND-NEW
session, run /archaeology. The skill must: (1) immediately run the probe (no answering from current context), (2)
surface open loops from the last 7 days across ALL ~/.claude/projects/\* dirs, (3) show a per-batch approval gate (not
just this session's work). No routing to remember:remember. Loops are real cross-session items. awaiting: user response

## Tests

### 1. Detection recall over a real 7-day scan (ARCH-01)

expected: From a BRAND-NEW session, run /archaeology. The skill must (1) immediately run the probe (no answering from
current context), (2) surface open loops from the last 7 days across ALL ~/.claude/projects/\* dirs, (3) show a
per-batch approval gate (not just this session's work). No routing to remember:remember. Loops are real cross-session
items. result: [pending] fix_applied_phase3: "Signal manifest format implemented (commit e9de4f6e).
filterToOpenLoopRecords now picks ONE best signal per session (Tier-1 park markers beat Tier-2 GTD), extracts keyword
context (50 before + 100 after) instead of tail-truncating. formatProbeOutput emits one compact line per session.
Result: 263 sessions → 263 lines (~59KB) vs 880+ records → ~165KB before. 2496 tests pass. Re-test required from
BRAND-NEW session via /archaeology."

### 2. Merged approval gate behavior (ARCH-02)

expected: Invoke the skill and walk the merged gate — the per-session summary table fires; AskUserQuestion with Approve
first fires at the gate; a row-level edit applies and re-shows; NOTHING is created before approval. Zero omnifocus_write
calls before yes. result: [pending]

### 3. Placement correctness — MATCH / INFER / LEAVE (ARCH-03)

expected: Approve loops with a mix of MATCH / INFER / LEAVE placements and confirm where they land in OmniFocus. Each
approved loop lands in the matched or inferred project (inbox as fallback), tagged `archaeology` with a lineage stamp.
result: [pending]

## Summary

total: 3 passed: 0 issues: 0 pending: 3 skipped: 0 blocked: 0

## Gaps

- truth: "Probe output fits in a single Bash response; model reads it directly without scripting." status: failed
  reason: "User reported: probe output (165KB after keyword filter + truncation) still too large for inline Bash tool
  response. Model falls back to reading scan-output.txt with Read tool, then writes ad-hoc awk scripts to parse it —
  violating SKILL.md NEVER-write-scripts guard." severity: major test: 1 root_cause: "Probe emits raw transcript lines
  (one record per keyword-matching message). Volume is irreducible under this format regardless of truncation. Fix
  requires output format change: probe should emit a signal manifest (one line per match, keyword context extraction
  rather than tail-truncation). Target: ~10KB for ~100 signals, fits inline in Bash response." artifacts:
  - path: "probes/archaeology-prefilter.js" issue: "formatProbeOutput emits transcript-style lines. Needs to emit
    compact signal manifest: [session-id | date age] keyword-context-snippet, one line per signal."
  - path: ".claude/skills/session-archaeology/SKILL.md" issue: "Step 1 output format description must be updated to
    match manifest format. Step 3 detection logic can simplify since signals are pre-extracted." missing:
  - "Change filterToOpenLoopRecords to extract keyword context (50 chars before + 100 after match) instead of
    tail-truncating"
  - "Rewrite formatProbeOutput to emit one line per signal with [session-id | date age] prefix"
  - "Update SKILL.md Step 1 output format description"
  - "Re-run UAT Test 1 from brand-new session to confirm output fits inline"

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
