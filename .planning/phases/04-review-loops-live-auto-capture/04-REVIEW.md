---
phase: 04-review-loops-live-auto-capture
reviewed: 2026-06-16T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/contracts/ast/mutation-script-builder.ts
  - tests/integration/tools/unified/review-tag.test.ts
  - tests/unit/contracts/ast/mutation-script-builder.test.ts
  - tests/integration/tools/unified/end-to-end.test.ts
  - .claude/skills/capture-live-blocker/SKILL.md
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-06-16T00:00:00Z **Depth:** standard **Files Reviewed:** 5 **Status:** issues_found

## Summary

Phase 4 ships a one-line production change — extending `FUNCTIONAL_TAG_ALLOWLIST` with `review-output`,
`review-capture`, and `capture-live` — plus three test/skill artifacts that exercise the review-tag round-trip
(REVIEW-01/02) and live-capture (LIVE-01) paths.

The production change itself is correct, minimal, and well-guarded: `isTestTagAllowed` keeps the `__test-` prefix path
intact, the new tags are documented with their decision IDs, and the unit tests cover each new entry plus regression
guards for the prior entries. No security or data-loss risk: the allowlist only relaxes the **test-mode** tag guard; it
has no effect in production (`isTestMode()` requires `SANDBOX_GUARD_ENABLED==='true'`), and the sandbox name/folder
guards on the task itself are untouched.

The defects are concentrated in the test and skill artifacts. The most consequential is a mismatch between what the
review-tag test _claims_ to do (create a task inside the sandbox folder) and what it _actually_ does (create an inbox
task) — the `folder` key it passes is silently dropped because `TaskCreateData` has no `folder` field. The test still
passes for the right _guard_ reason (the `__TEST__` name prefix), but its "active sandbox task" framing is false, which
weakens the proof and will mislead the next maintainer. The skill's PERM-02 section also documents a session-grant
bypass that the agent role cannot actually invoke.

No blockers. Three warnings worth fixing before this is treated as a durable contract, three info items.

## Warnings

### WR-01: review-tag test silently drops `folder` — "active sandbox task" is actually an inbox task

**File:** `tests/integration/tools/unified/review-tag.test.ts:176-177` (and `227`) **Issue:** Both test cases create
their fixture with `createTask(taskName, { folder: SANDBOX_FOLDER_NAME })` and the inline comment asserts "folder places
it in the sandbox, not inbox." That is not what happens. `TaskCreateData` (`src/contracts/mutations.ts:142-154`) has
**no `folder` field**, and `buildTaskDataObject` (`mutation-script-builder.ts:2380-2414`) has an exhaustiveness guard
that only copies the declared keys — `folder` is silently discarded. With no `project` and no `parentTaskId`, the create
falls into Case 3 of `validateTaskCreate` (inbox), which passes _only_ because `runScopedName` produces a `__TEST__-…`
name. So the task lands in the **inbox**, and the test's stated premise ("active sandbox task", "folder places it in the
sandbox") is false. The test happens to pass, but it is proving a different thing than it claims, and the comment will
actively mislead the next reader. **Fix:** Either drop the meaningless `folder` arg and correct the comment to say the
task is an inbox task scoped by the `__TEST__` name prefix:

```typescript
// Create an active __TEST__-prefixed inbox task (the name prefix satisfies the
// sandbox guard; TaskCreateData has no folder field).
const id = await createTask(taskName);
```

or, if a true in-folder task is intended, create a sandbox project first and pass `project: <sandboxProjectId>` (the
supported path), as the Phase 3 ROUTE-01 test does.

### WR-02: skill documents an "allow-all-this-session grant" the agent role cannot set

**File:** `.claude/skills/capture-live-blocker/SKILL.md:71-72` **Issue:** Step 3 of the PERM-02 rendering instructs the
agent to "re-invoke `omnifocus_write` with an allow-all-this-session grant already set, or the funnel will bypass the
gate for the current session on owner approval." This skill runs under `role=agent` (stated throughout, and confirmed by
the LIVE-01 harness spawning `OMNIFOCUS_MCP_ROLE=agent`). But `setSessionGrant` (`src/session-manager.ts:162`) throws
`Only owner-authenticated callers may set session grant (D-02)`. An agent cannot set the session grant; the grant is an
owner-only forge-resistant control. The real reason an agent create proceeds is the lineage capture-attestation path in
`OmniFocusWriteTool.ts` (the `lineage != null` branch bypasses the create gate), not a session grant the agent sets. As
written, this step points the agent at a dead end and conflates two distinct consent mechanisms. **Fix:** Reword step 3
to describe what the agent actually does — re-invoke the same create call after the owner answers yes; the funnel
proceeds because the owner approved (owner sets the session grant, or the gate verdict allows this one). Make explicit
that the agent does not set any grant itself:

```markdown
3. If yes — re-invoke `omnifocus_write` with the same payload. The funnel proceeds on the owner's approval (the owner —
   not the agent — may have granted allow-all-this-session; the agent never sets a grant). The lineage param on the
   create is the agent's self-attestation that lets the create through the gate.
```

### WR-03: LIVE-01 inbox-placement assertion is conditional and can pass without proving placement

**File:** `tests/integration/tools/unified/end-to-end.test.ts:1179-1182` **Issue:** The inbox-placement check is guarded
by `if ('project' in task) { expect(task.project) .toBeFalsy(); }`. If the read projection ever stops returning a
`project` key for inbox tasks (or returns it under a different name), the assertion is skipped entirely and the test
passes without verifying placement — the stated deliverable (d) "project is null / absent — inbox-only". The trailing
comment ("fallback: create response had no project key…") is not an executable assertion; it documents an assumption
rather than checking it. A genuinely misplaced task (e.g., a regression that defaults agent captures into a project)
would not be caught. **Fix:** Make placement unconditionally asserted. Either request the field explicitly and assert it
is present-and-falsy, or assert against the create-response contract directly:

```typescript
// Inbox placement must be proven, not skipped. The read projection requested 'project';
// assert the key exists and is falsy rather than guarding the assertion away.
expect('project' in task, 'read projection should surface project field for inbox check').toBe(true);
expect(task.project, 'live capture must land in inbox (no project)').toBeFalsy();
```

If the read path legitimately cannot surface `project` on inbox tasks, assert the negative on the create response
instead (which carries the authoritative placement), so something is always checked.

## Info

### IN-01: review-tag test typed as `any` throughout the client adapter

**File:** `tests/integration/tools/unified/review-tag.test.ts:47, 86-97, 99, 139` **Issue:** `sendRequest` returns
`Promise<any>`, `extractId(res: any)`, `findTask(r: any …)`, and the `client.callTool` return are untyped. This is
consistent with the sibling end-to-end test, so it is not a regression, but the `any` surface means a shape change in
`StandardResponseV2` would not be caught at compile time in these helpers. **Fix:** Optional — introduce a minimal
`interface ParsedResponse { success: boolean; data?: …; metadata?: … }` and type the adapter against it. Low priority
given the established pattern.

### IN-02: duplicated read-back query block in review-tag Case 2

**File:** `tests/integration/tools/unified/review-tag.test.ts:242-279` **Issue:** The two `assertFieldPersisted` calls
in Case 2 repeat an identical `readParams` query object (`type: 'tasks'`,
`filters: { tags: { any: ['review-output'] }, status: 'completed' }`, same `fields`, `limit: 200`) verbatim. Minor
duplication; a small drift between the two copies later would be easy to miss. **Fix:** Optional — hoist the shared
query to a local `const completedByTagQuery = { query: { … } }` and reference it in both calls.

### IN-03: SKILL.md cites a volatile anchor ("OmniFocusWriteTool.ts lineage block")

**File:** `.claude/skills/capture-live-blocker/SKILL.md:103` **Issue:** "verified against `OmniFocusWriteTool.ts`
lineage block" is a soft reference. Per the project's CLAUDE.md "Referencing code" rule, prefer stable grep targets over
prose pointers so the reference does not rot. The claim itself is accurate (the lineage/agent-ok behavior is in that
file), so this is a documentation-hygiene nit, not a correctness issue. **Fix:** Optional — change to a grep target,
e.g. "grep for `composeLineageStamp` in `src/tools/unified/`".

---

_Reviewed: 2026-06-16T00:00:00Z_ _Reviewer: Claude (gsd-code-reviewer)_ _Depth: standard_
