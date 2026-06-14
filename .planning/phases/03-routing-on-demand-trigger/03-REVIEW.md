---
phase: 03-routing-on-demand-trigger
reviewed: 2026-06-14T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/contracts/ast/mutation-script-builder.ts
  - tests/unit/contracts/ast/mutation-script-builder.test.ts
  - tests/integration/tools/unified/end-to-end.test.ts
  - .claude/skills/route-inbox-to-projects/SKILL.md
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-06-14 **Depth:** standard **Files Reviewed:** 4 **Status:** issues_found

## Summary

Phase 3 adds an on-demand inbox-routing skill plus the server-side enablement it depends on. The in-scope source change
to `mutation-script-builder.ts` is a one-line addition of `routing-unplaced` to `FUNCTIONAL_TAG_ALLOWLIST` — correct,
well-documented, and unit-tested. The new integration test block (ROUTE-01/03/04) and its unit tests are sound: they
exercise the real AGENT role through the write funnel, use per-run scoped fixture names, do independent read-backs, and
clean up via the sandbox sweep with a loud residue assertion.

The significant defect is a contract mismatch between `SKILL.md` and the actual `omnifocus_write` update schema. The
skill is the operational artifact an agent executes verbatim; its documented update/tag tool-call shapes place `id`
inside `data` and use `data` as the changes container in a way the strict Zod schema rejects. The proven-correct shape
lives in the integration test in the same phase, so the skill and its own test disagree on the wire format.

## Critical Issues

### CR-01: SKILL.md documents an update tool-call shape the write schema rejects

**File:** `.claude/skills/route-inbox-to-projects/SKILL.md:112,114` (and prose at `:57`, `:64`) **Issue:** The "Tool
call reference" table tells the agent to file a task and apply the marker tag with the `id` nested inside `data`:

```
File task to project   → omnifocus_write operation:"update" target:"task" data:{id:"<id>", project:"<...>"}
Apply marker tag       → omnifocus_write operation:"update" target:"task" data:{id:"<id>", addTags:["routing-unplaced"]}
```

The actual update member of `MutationSchema` (`src/tools/unified/schemas/write-schema.ts:301-308`) requires `id` as a
**top-level sibling** of `data`/`changes`, and the changes container is validated by `UpdateChangesSchema`, which is
`.strict()` and has **no `id` field** (`write-schema.ts:192-226`). An agent that copies the documented shape produces a
payload that fails validation two ways at once: top-level `id` is missing (superRefine still passes because `data` is
present, but the update member's `id: z.string()` is unsatisfied → hard parse error), and `id` inside `data` is an
unknown key rejected by `.strict()`. Every MATCH, INFER-file, and LEAVE write the skill drives would error.

The integration test in this same phase uses the correct shape
(`mutation: { operation:'update', target:'task', id: taskId, changes: { project } }` and `changes: { addTags: [...] }`),
so the skill contradicts its own proof.

**Fix:** Correct the table and the Pass 2 prose to put `id` at the top level and use `changes` (or its accepted `data`
alias) as the changes container without `id` inside it:

```
File task to project   → omnifocus_write operation:"update" target:"task" id:"<id>" changes:{project:"<project-name-or-id>"}
Apply marker tag       → omnifocus_write operation:"update" target:"task" id:"<id>" changes:{addTags:["routing-unplaced"]}
```

Note: `data` is accepted as an alias for `changes` (OMN-75), so `changes` may be written as `data` — but `id` must move
out of it to the top level regardless.

## Warnings

### WR-01: SKILL.md create-project tool shape omits the required `target`/`data` nesting verification

**File:** `.claude/skills/route-inbox-to-projects/SKILL.md:62,113` **Issue:** The create-project shape is documented as
`data:{name:"<name>", folder:"<folder-name>"}`. This is valid against `CreateDataSchema` (folder is an optional string,
`write-schema.ts:174`), so the shape itself works. The risk is the adjacent guidance "omit the `folder` key when there
is no `omnifocus-folder` so it lands at root" — confirm the create path treats absent `folder` as root rather than
erroring. This is a documentation-correctness check: since CR-01 proves the skill shapes were not validated end-to-end
against the schema, the create shape deserves the same live confirmation the update shapes failed. **Fix:** Add an
integration assertion (or confirm via existing coverage) that `create/project` with `folder` omitted lands the project
at root, matching the skill's claim. The ROUTE-03 test always passes `folder: SANDBOX_FOLDER_NAME`, so the "omit folder
→ root" path the skill documents is currently unproven.

### WR-02: ROUTE-04 read-back scans the entire live database with a fixed limit:200

**File:** `tests/integration/tools/unified/end-to-end.test.ts:1192-1200` **Issue:** The marker-tag read-back queries all
tasks carrying `routing-unplaced` with `limit: 200` and then finds the fixture by exact name. This tag is a durable,
user-facing marker by design (D-12) and Phase 4 will surface accumulated `routing-unplaced` items. Once the live
database holds more than 200 such tasks, the fixture can fall outside the page and the test fails for an environmental
reason unrelated to the code under test — a latent flake. **Fix:** Scope the assertion so it cannot be starved by
unrelated data. Either combine the tag filter with the per-run scoped name/id
(`filters: { id: taskId, tags: { all: ['routing-unplaced'] } }`) or read the single task back by id and assert `tags`
contains `routing-unplaced`, rather than paging the global tag set.

### WR-03: Request-handling helper duplicated verbatim across test blocks

**File:** `tests/integration/tools/unified/end-to-end.test.ts:1019-1050` (new `sendAgentRequest`) **Issue:** The new
Phase 3 `sendAgentRequest`/`callTool`/`extractId` trio is a near-verbatim copy of the D-08b block helpers earlier in the
same file (around `:856`) and the top-of-file `sendRequest` (`:33`). Three copies of the same chunked-stdout JSON parser
now drift independently; a fix to the line-buffering logic (e.g. handling a JSON object split across two stdout chunks,
which the current re-scan-on-every-chunk approach handles only incidentally) must be applied in three places. **Fix:**
Extract the spawn + request/response plumbing into a shared test helper (e.g.
`tests/integration/helpers/mcp-stdio-client.ts`) parameterized by role, and have all three blocks consume it. Not
blocking — the duplicated logic mirrors established passing patterns — but it raises maintenance cost as routing tests
grow.

## Info

### IN-01: `extractId` swallows entity-shape ambiguity behind a long fallback chain

**File:** `tests/integration/tools/unified/end-to-end.test.ts:1064` **Issue:** `extractId` probes seven possible id
locations (`d.task?.id`, `d.task?.taskId`, `d.taskId`, `d.project?.id`, `d.project?.projectId`, `d.projectId`, `d.id`).
The breadth is defensive but hides which response contract is actually returned; if the write response shape changes,
the test keeps passing as long as any one path resolves, masking a contract regression the test should catch. **Fix:**
Once the StandardResponseV2 create-response shape is settled, narrow `extractId` to the canonical field(s) so a shape
change surfaces as a test failure rather than silently resolving through a fallback.

---

_Reviewed: 2026-06-14_ _Reviewer: Claude (gsd-code-reviewer)_ _Depth: standard_
