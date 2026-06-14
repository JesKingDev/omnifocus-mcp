---
phase: 03-routing-on-demand-trigger
verified: 2026-06-14T20:05:00Z
status: human_needed
score: 4/4 success criteria specified-and-enabled (live execution pending)
overrides_applied: 0
human_verification:
  - test:
      'Invoke the route-inbox-to-projects skill and confirm Pass 1 produces a proposal table before any write, then
      approve and confirm Pass 2 files a matching item under its existing project.'
    expected:
      'An agent-okay inbox item whose name matches an active project is filed under that project (ROUTE-01). No write
      happens before approval (D-08).'
    why_human:
      "ROUTE-01 is agent-resident behavior executed live against OmniFocus. The server write path (update+project →
      moveTasks) is proven by integration test, but the skill's semantic match judgment and the propose-then-approve
      gate run only at agent execution time."
  - test:
      'Seed a ~/vaults/jess-os/ note with omnifocus-project (and optionally omnifocus-folder) frontmatter for an
      unmatched inbox item, then run routing.'
    expected:
      'The skill greps the vault, reads the frontmatter, proposes INFER+CREATE, and on approval creates the project and
      files the task under it (ROUTE-02 vault signal + ROUTE-03 create).'
    why_human:
      'ROUTE-02 vault inference and ROUTE-03 create are agent-resident: the skill specifies the grep/read/extract
      procedure and the create+file path is proven server-side, but the live vault read and semantic item→note match
      execute only at runtime.'
  - test: 'Run routing with an item that has no project match and no vault signal.'
    expected:
      'The item is left in the inbox and stamped with the durable routing-unplaced marker tag (idempotent — not
      re-tagged on a second run) (ROUTE-04).'
    why_human:
      'ROUTE-04 leave-and-mark and the bias-to-leave judgment are exercised only when the skill runs live. The marker
      write path (update+addTags via OmniJS bridge) is proven by integration test.'
  - test: "Trigger the skill by saying one of its phrases (e.g. 'route my inbox')."
    expected: 'The route-inbox-to-projects skill activates and runs the two-pass loop (TRIG-01 manual trigger).'
    why_human:
      'Skill discoverability/activation from a natural-language trigger is a Claude Code runtime behavior that cannot be
      unit-tested.'
---

# Phase 3: Routing & On-Demand Trigger Verification Report

**Phase Goal:** The agent routes inbox items to the right home — match an existing project, else infer from the vault,
else create a project, else leave in the inbox — and the whole loop is runnable on demand via a manual trigger.
**Verified:** 2026-06-14T20:05:00Z **Status:** human_needed **Re-verification:** No — initial verification

## Goal Achievement

This phase splits into two cooperating layers, and both are present and correct:

1. **Server-side enablement (Plan 01)** — the three routing write paths (file via update+project/moveTasks, marker via
   update+addTags/OmniJS bridge, project create) route through the policy funnel + write-verifier. Proven by live
   integration tests and a unit-tested allowlist change.
2. **Agent-resident routing brain (Plan 02)** — the `route-inbox-to-projects` skill specifies the full match→infer→leave
   ladder and the on-demand trigger. ROUTE-02 (vault inference) and TRIG-01 (trigger) live entirely in this skill.

The specification is complete and correct, and the write infrastructure is proven. What remains is live execution of the
skill against live OmniFocus + the JessOS vault — inherently a human-verification step.

### Observable Truths

| #   | Truth (Success Criterion)                                                          | Status             | Evidence                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Matching inbox item → filed under that existing project (ROUTE-01)                 | ✓ ENABLED / ? live | Skill Pass 2 MATCH branch (SKILL.md:57) drives `update` + `changes:{project}`; live integration test "ROUTE-01 — file task to existing project" passes the moveTasks dispatch through the funnel with independent read-back (end-to-end.test.ts:1140-1166). Semantic match + live filing → human.                                               |
| 2   | No match → check vault for signal; if present, create project + file (ROUTE-02/03) | ✓ ENABLED / ? live | Skill Vault Signal Read (SKILL.md:94-104) specifies grep `omnifocus-project:`, frontmatter extraction, empty-vault fallback; INFER branch checks existence then create+file (SKILL.md:59-62). Create path proven by "ROUTE-03 — create project for infer branch" test (end-to-end.test.ts:1196-1212). Live vault read + semantic match → human. |
| 3   | No project inferred → leave in inbox, don't guess (ROUTE-04)                       | ✓ ENABLED / ? live | Skill LEAVE branch + bias-to-leave + empty-vault rule (SKILL.md:63-65, 84-92); marker write proven by "ROUTE-04 — apply routing-unplaced marker" test with tag-filtered read-back asserting persistence (end-to-end.test.ts:1169-1193). Live judgment → human.                                                                                  |
| 4   | Routing loop invocable on demand via manual trigger (TRIG-01)                      | ✓ ENABLED / ? live | Skill frontmatter declares 5 trigger phrases (SKILL.md:3-6); two-pass on-demand procedure (SKILL.md:31-73); out-of-scope correctly defers TRIG-02 scheduler. Live activation → human.                                                                                                                                                           |

**Score:** 4/4 success criteria specified-and-enabled; live end-to-end execution routed to human verification.

### Required Artifacts

| Artifact                                                   | Expected                                                | Status            | Details                                                                                                                                                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/contracts/ast/mutation-script-builder.ts`             | FUNCTIONAL_TAG_ALLOWLIST includes routing-unplaced      | ✓ VERIFIED        | Line 74: `['agent-okay', 'routing-unplaced']` — exactly two entries, no over-widening. `isTestTagAllowed` (line 77) wires the array. Comment cites D-12 (line 68).                                                                              |
| `tests/unit/contracts/ast/mutation-script-builder.test.ts` | Unit test: routing-unplaced passes, regressions guarded | ✓ VERIFIED        | Describe block at line 1217; 4 assertions. Ran directly: 4 passed.                                                                                                                                                                              |
| `tests/integration/tools/unified/end-to-end.test.ts`       | Live proof of file/marker/create paths                  | ✓ VERIFIED (code) | "Phase 3 Routing — write operations" describe (line 1039) with ROUTE-01/03/04 sub-blocks, agent role, independent read-backs, sandbox sweep teardown. Correct wire shape used throughout.                                                       |
| `.claude/skills/route-inbox-to-projects/SKILL.md`          | Complete executable routing skill                       | ✓ VERIFIED        | Frontmatter + 5 triggers, Overview, Idempotency, two-pass Procedure, Routing Decision Rules, Vault Signal Read, 5-shape tool-call table, Out of scope, 8-row Common mistakes. Zero implementation code fences. A cold read suffices to execute. |

### Key Link Verification

| From                     | To                                   | Via                             | Status      | Details                                                                                                                                   |
| ------------------------ | ------------------------------------ | ------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| FUNCTIONAL_TAG_ALLOWLIST | isTestTagAllowed()                   | `.includes(tag)`                | ✓ WIRED     | Line 78 references the array; 3 call sites (274, 339, 361) gate tags through it.                                                          |
| skill update+project     | moveTasks([task], project.beginning) | OmniJS bridge                   | ✓ WIRED     | Skill table line 112 emits `update` + `changes:{project}`; integration test 1154 exercises the dispatch; read-back asserts project field. |
| skill update+addTags     | task.addTag(tag)                     | OmniJS addTag bridge            | ✓ WIRED     | Skill table line 114; integration test 1175 + tag-filtered read-back (1184-1192) proves persistence, not the write echo.                  |
| skill trigger phrases    | Pass 1 → approval → Pass 2           | skill invocation                | ✓ SPECIFIED | Description lists 5 phrases; procedure enforces the gate. Runtime activation → human.                                                     |
| skill INFER              | create/project then update+project   | omnifocus-folder → folder param | ✓ SPECIFIED | SKILL.md:59-62; create proven by ROUTE-03 test.                                                                                           |

### CR-01 Resolution (critical review finding)

The code review (03-REVIEW.md) flagged CR-01 as **critical**: the skill's tool-call table nested `id` inside `data`,
which `MutationSchema` rejects (id required at top level; `UpdateChangesSchema` is `.strict()` with no id field).
Verified the fix is present and correct:

- Commit `0836b289` ("fix(03-02): correct update mutation shape... (CR-01)") hoists `id` to top level.
- Current SKILL.md table (lines 112, 114) uses `id:"<id>"` + `changes:{...}` — matches the schema.
- Line 121 adds an explicit warning: "Do not nest `id` inside `changes`/`data` — the changes container is strict and
  rejects it."
- Cross-checked against `write-schema.ts`: update member requires `id: z.string()` top-level (line 304),
  `changes`/`data` containers (305-306) both `UpdateChangesSchema.strict()` (225) with no `id` key. Skill now agrees
  with both the schema and its own integration test.

### Behavioral Spot-Checks

| Behavior                                 | Command                                                                     | Result              | Status                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Project builds clean                     | `npm run build` (tsc)                                                       | exit 0, no output   | ✓ PASS                                                                                                       |
| routing-unplaced allowlist + regressions | `vitest run ...mutation-script-builder.test.ts -t FUNCTIONAL_TAG_ALLOWLIST` | 4 passed            | ✓ PASS                                                                                                       |
| Skill has no impl code fences            | `grep -c '```' SKILL.md`                                                    | 0                   | ✓ PASS                                                                                                       |
| Live routing write paths (3)             | `npm run test:integration` (Phase 3 block)                                  | not run by verifier | ? SKIP — mutates live OmniFocus; routed to human. Test code verified correct; orchestrator reports 3/3 live. |

### Requirements Coverage

| Requirement | Source Plan  | Description                                      | Status                                 | Evidence                                                      |
| ----------- | ------------ | ------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------- |
| ROUTE-01    | 03-01, 03-02 | Match inbox item to existing project, file there | ✓ SATISFIED (spec+proof); live → human | Skill MATCH branch + proven moveTasks path                    |
| ROUTE-02    | 03-02        | No match → check vault for a signal              | ✓ SATISFIED (spec); live → human       | Skill Vault Signal Read; agent-resident, cold-read-executable |
| ROUTE-03    | 03-01, 03-02 | Vault signal → create project + file             | ✓ SATISFIED (spec+proof); live → human | Skill INFER branch + proven create/project test               |
| ROUTE-04    | 03-01, 03-02 | No inference → leave in inbox, don't guess       | ✓ SATISFIED (spec+proof); live → human | Skill LEAVE + bias-to-leave; proven marker-tag path           |
| TRIG-01     | 03-02        | On-demand manual trigger                         | ✓ SATISFIED (spec); live → human       | Skill frontmatter trigger phrases + two-pass on-demand loop   |

All 5 declared requirement IDs are accounted for. REQUIREMENTS.md maps exactly ROUTE-01..04 + TRIG-01 to Phase 3 — no
orphaned requirements.

### Anti-Patterns Found

| File   | Line | Pattern                                     | Severity | Impact |
| ------ | ---- | ------------------------------------------- | -------- | ------ |
| (none) | —    | No TBD/FIXME/XXX/PLACEHOLDER in phase files | —        | Clean  |

Non-blocking notes carried from the code review (WR-01..03, IN-01) remain open but are test-hygiene/robustness items,
not goal blockers: WR-01 (the "omit folder → root" create path is documented but not directly asserted), WR-02 (ROUTE-04
read-back pages the global tag set with limit:200 — latent flake once >200 routing-unplaced tasks exist), WR-03/IN-01
(duplicated test helpers, broad extractId). None affect Phase 3 goal achievement.

### Human Verification Required

The four routing behaviors are agent-resident — the skill is an executable prompt run live against OmniFocus and the
JessOS vault. The specification is complete and correct and the server write paths are proven, so these are genuine
live-execution checks, not specification gaps. See frontmatter `human_verification` for the four items (ROUTE-01
match+file, ROUTE-02/03 vault infer+create, ROUTE-04 leave+mark, TRIG-01 trigger activation).

### Gaps Summary

No gaps. The phase goal is fully specified and the supporting infrastructure is proven:

- Allowlist change is correct, minimal, and unit-tested (4/4).
- Build is clean.
- The critical review finding (CR-01) is resolved in commit 0836b289 and verified against the live schema.
- The skill is a complete, cold-read-executable routing brain covering ROUTE-01..04 + TRIG-01.
- The three server write paths are proven by live integration tests (code verified correct; live run reported 3/3 by
  orchestrator).

Status is `human_needed` rather than `passed` because the match→infer→leave ladder and on-demand trigger execute only
when the skill runs live against OmniFocus + the vault — these cannot be confirmed programmatically and require a human
to drive one real routing pass.

---

_Verified: 2026-06-14T20:05:00Z_ _Verifier: Claude (gsd-verifier)_
