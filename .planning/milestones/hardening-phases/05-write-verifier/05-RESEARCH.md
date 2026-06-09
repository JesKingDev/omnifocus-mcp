# Phase 5: Write-Verifier — Research

**Researched:** 2026-06-06 **Domain:** Post-mutation verification, field-level diff, osascript round-trip discipline
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Proven mismatch returns `error` variant of `StandardResponseV2` (`success: false`).
- **D-02:** Two distinct error codes: `WRITE_UNVERIFIED_MISMATCH` and `VERIFY_READBACK_FAILED`.
- **D-03:** VERIFY-02 governs proven-mismatch (hard error); VERIFY-03 status set lives in response metadata.
- **D-04:** Status semantics: `verified` = confirmed; `skipped` = deliberately not run (closed set); `unverified` =
  indeterminate read-back failure (not proven mismatch).
- **D-05:** Per-field-type canonical comparator registry, not naive deepEqual.
- **D-06:** Diff only the keys present in the intended-change object (e.g., `createArgs`). Never diff app-derived
  fields.
- **D-07:** Compare against intent in the same canonical form produced by `localToUTC`.
- **D-08:** Per-field equality rules — dates ±60s epoch-ms tolerance; tags as Set-of-names; scalars normalized; absent
  field = hard fail.
- **D-09:** Verify every mutating AGENT op including move and tag-assign; those get relationship-shaped read-back
  extractors.
- **D-10:** Batch verifies every item through the same per-item verifier as single path; no sampling.
- **D-11:** `skipped` set is tiny, closed, and logged: dry-runs only (no write happened) plus any op with no cheap
  readable post-state.
- **D-12:** Owner-role mutations report `unverified` (not attempted), NOT `skipped` (deliberately waived).
- **D-13:** One batched read-back spawn per batch — collect all affected ids, fetch in single filter-by-id-set query,
  diff in TypeScript.
- **D-14:** Verification mandatory and always-on for agent path; owner is the lone opt-out.
- **D-15:** No debounce, no cross-call batching; intra-batch only, synchronous within the funnel call.
- **D-16:** Chunk id set into sub-spawns above a safe id-count threshold (OmniJS 261KB / JXA 523KB ceiling).

### Claude's Discretion

- Exact module layout for the verifier and field-comparator registry.
- Precise id-count chunking threshold for D-16.
- Whether to generalize `tests/integration/helpers/assert-field-persisted.ts` into production or build fresh from its
  pattern.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. Atomic multi-write transactions are explicitly out of scope per
REQUIREMENTS.md.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID        | Description                                                                                                     | Research Support                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| VERIFY-01 | Every agent mutation confirmed by independent post-mutation read-back — separate round-trip, not in-script read | Confirmed: `executeValidated()` is the single funnel; independent `osascript` spawn discipline is established in `OmniAutomation.ts`. Section: Funnel Placement. |
| VERIFY-02 | Read-back performs field-level diff against intended change and fails explicitly on mismatch                    | Confirmed: diff scoped to intent keys (D-06), proven mismatch → `error` envelope with `WRITE_UNVERIFIED_MISMATCH`. Section: Comparator Registry.                 |
| VERIFY-03 | Each mutation response reports verification status `verified                                                    | unverified                                                                                                                                                       | skipped` | Confirmed: status added to `StandardMetadataV2` (open index signature). Section: Response Envelope Extension. |

</phase_requirements>

---

## Summary

Phase 5 adds a post-mutation read-back verifier that wraps every successful mutation at `executeValidated()`. The
mechanism is: (1) intercept the post-success return path, (2) issue an independent `osascript` spawn via the existing
read layer to fetch the affected entity by id, (3) run a per-field-type canonical comparator against the intent object,
(4) inject `verification_status` into the `StandardMetadataV2` metadata of the existing success response, or replace the
response with a `StandardResponseV2` error envelope if a mismatch is proven.

The codebase has clean attach points. The `executeValidated()` method is genuinely the single funnel — all op classes
(task CRUD, batch, project, folder, tag_manage) route through it and return. The policy-guard block from Phase 2 is the
exact structural precedent for where the verifier hooks in (after the mutation succeeds, before the return). The
`StandardResponseV2` metadata already uses an open index signature (`[key: string]: ...`) so adding
`verification_status` requires no type change. The two new error codes require adding string constants to
`response-format.ts` or a new `error-codes.ts` companion file.

The biggest design gap the planner must fill: a read-back-by-id-SET path does not exist in the read layer today. The
current `filters.id` in read-schema.ts accepts a single string. Building D-13's batched read-back requires adding an
`ids` array field to the filter schema (Zod + hand-crafted `inputSchema` override — dual-schema invariant applies) and a
corresponding script-level multi-id lookup. This is a non-trivial but bounded task.

**Primary recommendation:** Implement the verifier as `src/tools/unified/verifier/WriteVerifier.ts` with a companion
`src/tools/unified/verifier/field-comparator.ts`. Attach at the post-success return point of `executeValidated()`,
before `formatForCLI`. Use the existing `assert-field-persisted.ts` helper as a pattern reference (not code-reuse) since
it uses the naive `deepEqual` this phase is replacing.

---

## Architectural Responsibility Map

| Capability                     | Primary Tier                                          | Secondary Tier          | Rationale                                                                                                |
| ------------------------------ | ----------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Mutation funnel attach         | API / Backend (`OmniFocusWriteTool.executeValidated`) | —                       | The single funnel is the established cross-cutting enforcement point (Phase 2 policy guard is precedent) |
| Read-back spawn                | API / Backend (`OmniAutomation.execute`)              | —                       | Must be a fresh osascript process — independent round-trip invariant                                     |
| id-set filter (new)            | API / Backend (read-schema + script-builder)          | —                       | Query layer owns filter compilation; dual-schema invariant requires Zod + inputSchema update             |
| Field comparator registry      | API / Backend (new `field-comparator.ts`)             | —                       | Pure TypeScript, no JXA/OmniJS involvement                                                               |
| Verification status surfacing  | API / Backend (`StandardMetadataV2`)                  | —                       | Response envelope owns metadata; no client-tier changes needed                                           |
| Relationship-shaped extractors | API / Backend (new extractor logic in verifier)       | OmniJS read-back script | Tags and parent/move post-states require OmniJS property syntax in read-back script                      |

---

## Standard Stack

### Core

No new external packages. This phase is pure TypeScript within the existing codebase. [VERIFIED: codebase inspection]

| Component                                      | Location                                 | Purpose                                     | Status                                                        |
| ---------------------------------------------- | ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `StandardResponseV2` / `createErrorResponseV2` | `src/utils/response-format.ts`           | Response envelope + error construction      | Already shipped                                               |
| `StandardMetadataV2`                           | `src/utils/response-format.ts`           | Metadata carrier for verification_status    | Already shipped; open index signature — no type change needed |
| `OmniAutomation`                               | `src/omnifocus/OmniAutomation.ts`        | Independent osascript spawn for read-back   | Already shipped                                               |
| `OmniFocusReadTool.executeIdLookup`            | `src/tools/unified/OmniFocusReadTool.ts` | Single-id read-back primitive               | Already shipped (READ-02)                                     |
| `localToUTC`                                   | `src/utils/timezone.ts`                  | Canonical date form for diff comparison     | Already shipped                                               |
| `assert-field-persisted.ts`                    | `tests/integration/helpers/`             | Pattern reference for round-trip discipline | Already shipped (test helper only)                            |

### New Modules Required

| Module                  | Location                                         | Purpose                                                           |
| ----------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `WriteVerifier`         | `src/tools/unified/verifier/WriteVerifier.ts`    | Orchestrates read-back + diff for each op class                   |
| `FieldComparator`       | `src/tools/unified/verifier/field-comparator.ts` | Per-field-type comparator registry (D-05, D-08)                   |
| id-set filter extension | `src/tools/unified/schemas/read-schema.ts`       | Add `ids: string[]` to filter schema for batched read-back (D-13) |
| id-set script builder   | `src/contracts/ast/script-builder.ts`            | Multi-id lookup script for batched read-back                      |

### Package Legitimacy Audit

This phase introduces **no new npm packages**. The verifier is implemented entirely within the existing TypeScript
codebase using already-installed dependencies.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
| ------- | -------- | --- | --------- | ----------- | --------- | ----------- |
| (none)  | —        | —   | —         | —           | N/A       | N/A         |

**Packages removed due to slopcheck [SLOP] verdict:** none **Packages flagged as suspicious [SUS]:** none

_slopcheck was unavailable at research time (auto-mode policy). No new packages are introduced in this phase, so no
slopcheck gate is required._

---

## Architecture Patterns

### System Architecture Diagram

```
Agent call → executeValidated()
               │
               ├── [policy guard] → deny/gate? → return error
               │
               ├── route to handler (task/project/folder/tag_manage/batch)
               │         │
               │         └── mutation script → osascript spawn #1
               │                   │
               │                   └── success result + affected id(s)
               │
               ├── [VERIFIER ATTACH POINT — new]
               │         │
               │         ├── agent role? NO → add unverified to metadata, return
               │         │
               │         ├── dry-run / skipped class? → log skip, add skipped to metadata, return
               │         │
               │         ├── collect affected id(s) from mutation result
               │         │
               │         ├── issue read-back query (osascript spawn #2, fresh process)
               │         │         ├── single op: filters.id = affectedId
               │         │         └── batch: filters.ids = [id1, id2, ...] (chunked if needed)
               │         │
               │         ├── read-back failed (transport/timeout)?
               │         │         └── return VERIFY_READBACK_FAILED error envelope (D-04 unverified)
               │         │
               │         ├── run per-field comparator (iterate intent keys only — D-06)
               │         │         ├── dates: epoch-ms ±60s
               │         │         ├── tags: Set-of-names (relationship extractor)
               │         │         ├── scalars: normalize + strict equal
               │         │         └── absent field: hard fail → mismatch
               │         │
               │         ├── mismatch found?
               │         │         └── return WRITE_UNVERIFIED_MISMATCH error envelope (D-01)
               │         │
               │         └── match → inject verification_status: "verified" into metadata
               │
               └── return (success with verified metadata, or error envelope)
```

### Recommended Project Structure

```
src/
├── tools/unified/
│   ├── verifier/
│   │   ├── WriteVerifier.ts          # Orchestrator: attach point, read-back, diff dispatch
│   │   ├── field-comparator.ts       # Per-field-type comparator registry
│   │   └── intent-extractor.ts       # Extract typed intent objects per op class
│   ├── OmniFocusWriteTool.ts         # Modified: call verifier before final return
│   └── schemas/
│       └── read-schema.ts            # Modified: add ids[] to filter (D-13)
├── contracts/ast/
│   └── script-builder.ts             # Modified: add multi-id lookup script builder
└── utils/
    └── response-format.ts            # Modified: add WRITE_UNVERIFIED_MISMATCH, VERIFY_READBACK_FAILED constants
```

### Pattern 1: Verifier Attach Point (post-success return intercept)

The Phase 2 policy guard attaches at the TOP of `executeValidated()` (lines 396–459). The verifier attaches at the
BOTTOM — after a successful mutation result is in hand but before `formatForCLI` and the final `return`. The structural
precedent in the file is the `formatForCLI` wrapper already applied to task operations at lines 524–525:

```typescript
// Existing pattern (task operations only):
const isSuccess = taskResult && typeof taskResult === 'object' && (taskResult as { success?: boolean }).success;
return this.formatForCLI(taskResult, compiled.operation, isSuccess ? 'success' : 'error');
```

The verifier wraps this same result — not by modifying `formatForCLI`, but by running between the raw result and that
final wrapper:

```typescript
// Proposed pattern (for task ops; same shape for project/batch/tag_manage):
const verifiedResult = await this.verifier.verify(taskResult, compiledIntent, role);
return this.formatForCLI(verifiedResult, compiled.operation, ...);
```

**Critical observation:** The batch path (`routeToBatch`) returns a raw object literal (not `createSuccessResponseV2`)
at lines 1626–1646. The verifier must handle both shapes:

- `StandardResponseV2` (task/project ops via `createSuccessResponseV2`)
- Raw batch result (`{ success, data, metadata }` hand-constructed object)

Both share the `metadata` field. The verifier adds `verification_status` to `metadata` in either case.

### Pattern 2: Intent Object per Op Class

Each op handler constructs a typed intent object from the incoming args. The verifier needs a reference to that object
to scope the diff (D-06). The intent shapes per op class are:

| Op Class                    | Intent Object                                               | Where Constructed        | Keys the Verifier Iterates                                                                         |
| --------------------------- | ----------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `handleTaskCreate`          | `createArgs: Partial<TaskCreationArgs>`                     | lines 539–550            | name, note, project (→projectId), dueDate, deferDate, plannedDate, flagged, estimatedMinutes, tags |
| `handleTaskUpdate`          | `safeUpdates: Record<string, unknown>`                      | line 839 (post-sanitize) | all keys in safeUpdates (already filtered)                                                         |
| `handleTaskComplete`        | `{ taskId, completionDate }`                                | lines 1011–1015          | completionDate (if set), status='completed'                                                        |
| `handleProjectCreate`       | `projectData: ProjectCreateData`                            | lines 1322–1334          | all set fields                                                                                     |
| `handleProjectUpdateDirect` | `convertedChanges: ProjectUpdateData`                       | lines 1494–1498          | all set fields                                                                                     |
| `handleFolderCreate`        | `folderData: FolderCreateData`                              | lines 1453–1456          | name, parentFolder                                                                                 |
| Batch creates               | per-item `taskData`/`projectData`                           | lines 2127–2137          | same as single create                                                                              |
| `handleTagManage`           | `{ action, tagName, newName?, targetTag?, parentTagName? }` | lines 2321–2331          | depends on action                                                                                  |

**Implementation note for tag_manage:** Tag create/rename/nest/unnest/reparent are relationship mutations
(SETTER-PATTERNS rows 6–7). The verifier needs a relationship-shaped extractor that reads the tag hierarchy
post-mutation and checks the expected relationship (e.g., after `nest`, the tag's parent should equal `parentTagName`).
Tag `delete` and `merge` are OWNER-only (policy-gated for agent); the agent cannot trigger them, so they fall in the
owner `unverified` category (D-12).

### Pattern 3: id Extraction per Op Class

The verifier needs the affected id(s) to issue the read-back query. These are available from mutation results:

| Op Class       | How to Get Affected id                                                                    |
| -------------- | ----------------------------------------------------------------------------------------- |
| Task create    | `metadata.created_id` in the success response (or `data.task.taskId`)                     |
| Task update    | `metadata.updated_id` in the success response (or `compiled.taskId`)                      |
| Task complete  | `metadata.completed_id` (or `compiled.taskId`)                                            |
| Project create | `result.data.project.id` (from script result)                                             |
| Project update | `compiled.projectId` (passed directly to handler)                                         |
| Batch          | Collect all created/updated/completed real ids from `data.results` + `data.tempIdMapping` |
| Tag manage     | Tag read-back by tag name (no numeric id — tag operations use names as identifiers)       |

### Pattern 4: Read-back-by-id-set Gap (D-13)

**CONFIRMED GAP:** The read schema today accepts `filters.id: string` (single) but not `filters.ids: string[]`.
[VERIFIED: codebase inspection — read-schema.ts `filterFields` object, line 44 — no `ids` array field exists]

Bridging D-13 requires:

1. Add `ids: z.array(z.string()).optional()` to `filterFields` in `read-schema.ts`. Export `FILTER_FIELD_NAMES` is
   downstream of this — no manual update needed (it uses `Object.keys(filterFields)`).
2. Update the hand-crafted `inputSchema` override in `OmniFocusReadTool.ts` to advertise `ids` (dual-schema invariant).
3. Add `ids` handling in `QueryCompiler.transformFilters()` — emit a filter that resolves each id in the set.
4. Add a multi-id script builder that uses `Task.byIdentifier()` for each id and returns an array of task objects.

**Alternative (discretion item):** The verifier can issue N single-id `execJson` calls for small batches (N ≤ some
threshold) and defer the id-set schema work. This avoids the dual-schema invariant work but reintroduces the per-spawn
latency cliff for batch ops. Given D-13's explicit decision to batch, the planner should prefer the id-set path.

### Pattern 5: Caching Safety for Read-back

**Critical: the existing id-lookup path (`executeIdLookup`) does NOT use the cache.** [VERIFIED: OmniFocusReadTool.ts —
`executeIdLookup` calls `this.execJson(script)` directly, returns `from_cache: false`, and does not call
`this.cache.get()`]

The verifier can call `executeIdLookup` (or the equivalent script path) directly via `execJson` without routing through
the full `OmniFocusReadTool.executeValidated`. This is correct — the verifier needs a raw script execution, not a full
tool dispatch, to avoid caching (and circular dependency). The pattern from `assert-field-persisted.ts` uses
`client.callTool` (a full round-trip through the MCP client) because it runs from integration tests. The production
verifier should call the script builder + `execJson` directly, never the cached tool layer.

**Action for planner:** The verifier module should inject `execJson` (or a thin adapter) as a dependency, not call
`OmniFocusReadTool` through the tool dispatch layer.

### Anti-Patterns to Avoid

- **In-script read-back:** Never verify by reading within the same `evaluateJavascript` call that did the mutation. The
  OmniAutomation layer always spawns a new `osascript` process — the separation is architectural, not optional.
- **Naive `deepEqual` on full entity:** The `assertFieldPersisted` helper uses `deepEqual(actual, expected)` where
  caller supplies `expected`. The production verifier must use the per-field-type registry instead — `deepEqual` on
  dates will always fail (JS Date vs ISO string), and deepEqual on tags will fail on ordering.
- **Verifying app-derived fields:** Never diff `id`, `modified`, `effectivelyCompleted`, `numberOfAvailableTasks`,
  `blocked`. Only diff fields that appear as keys in the intent object.
- **Caching the read-back result:** The verifier read-back must bypass the `CacheManager` entirely. A cached read-back
  defeats the purpose.
- **Owner ops silently skipped:** Owner mutations must report `unverified` (not `skipped`). The distinction is
  semantically important for auditing the `skipped` bucket.

---

## Don't Hand-Roll

| Problem               | Don't Build                       | Use Instead                                                                                              | Why                                                                    |
| --------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| osascript spawning    | Custom process spawn              | `this.execJson(script)` via `OmniAutomation`                                                             | Already handles timeout, stdout parsing, error normalization           |
| Date canonicalization | Custom date parsing in comparator | `localToUTC` output — the canonical form is already a UTC ISO string; compare as `new Date(s).getTime()` | localToUTC is the single source of canonical dates                     |
| Script size checking  | Custom byte-count check           | `monitorScriptSize` + `EMPIRICAL_LIMITS` from `script-size-monitor.ts`                                   | Empirical limits are already measured and documented                   |
| Script structure      | Custom OmniJS                     | Extend existing `buildListTasksScriptV4` / `buildProjectByIdScript` patterns                             | Reuse established script envelope patterns to avoid JXA-vs-OmniJS bugs |

---

## Runtime State Inventory

Not applicable — this is a greenfield addition of new behavior at an existing funnel. No stored data, OS registrations,
or renamed strings are involved.

---

## Common Pitfalls

### Pitfall 1: JXA vs OmniJS Syntax in Read-back Scripts

**What goes wrong:** The read-back extractor script for tags reads `task.tags()` (JXA method call) instead of
`task.tags` (OmniJS property access) inside an `evaluateJavascript` block, returning a function object instead of the
tag array.

**Why it happens:** Existing scripts mix both contexts. The QUICK SYMPTOM INDEX in CLAUDE.md is the canonical reference:
"Property returns function not value → You're in JXA - add `()`"; "X is not a function → You're in OmniJS - remove
`()`".

**How to avoid:** Read-back scripts that need tag names or parent relationships MUST use OmniJS inside
`evaluateJavascript`. Scalar read-backs can use either context. Cross-reference SETTER-PATTERNS row 6 (tags) and row 7
(parent/move) — both require OmniJS.

**Warning signs:** Read-back returns `[Function]` or empty array for tags; parent returns `null` for a moved task.

### Pitfall 2: Batch Response Shape is Not StandardResponseV2

**What goes wrong:** The verifier assumes every result from `executeValidated()` is a `StandardResponseV2<T>` object
with the factory-standard shape, then fails to find `metadata` on the batch result.

**Why it happens:** `routeToBatch()` (lines 1626–1646) hand-constructs a plain `{ success, data, metadata }` object
rather than calling `createSuccessResponseV2`. The shape is compatible but not identical — no `summary` field, and
`metadata` is assembled inline.

**How to avoid:** The verifier must handle both shapes — check for `metadata` by duck-typing, not by instanceof or exact
type match.

**Warning signs:** `TypeError: Cannot set property 'verification_status' of undefined` when a batch completes
successfully.

### Pitfall 3: The Fast-Path Batch Creates Different id Shape

**What goes wrong:** The batch fast-path (`executeBatchCreatesFastPath` — OMN-113) returns
`{ results: [{ tempId, taskId, success }] }` inside the data. The slow path returns `BatchItemCreationResult[]`. The id
extractor must handle both.

**Why it happens:** OMN-113 inlined the batch-create into a single script invocation with a different result shape from
per-item creation.

**How to avoid:** In the id collector for batch verification, always look at `data.tempIdMapping` (the resolver's
output) as the canonical tempId→realId mapping, regardless of which creation path ran. `tempIdMapping` is present in the
batch response when `returnMapping: true` (default).

### Pitfall 4: ReviewInterval is Not a Verifiable Scalar (Row 1)

**What goes wrong:** The verifier tries to compare `task.reviewInterval` (or `project.reviewInterval`) as a scalar and
fails because the read-back returns `{ unit: 'weeks', steps: 2 }` while the intent has the pre-`localToUTC` form.

**Why it happens:** `reviewInterval` is a P4 typed-class setter (SETTER-PATTERNS row 1) with a complex read shape.

**How to avoid:** The field comparator registry must include a `reviewInterval` comparator that normalizes both sides to
`{ unit, steps }` before comparing. This is a known "Recommended: read-back required" field per SETTER-PATTERNS.

### Pitfall 5: Completion Status Read-back

**What goes wrong:** Verifying a `complete` operation by reading `task.completed` works for tasks, but the read-back
script may return the task in a completed filter that excludes it (filters default to `completed: false`).

**Why it happens:** The default task query filter excludes completed tasks. A post-completion read-back must explicitly
include `filters: { completed: true }` or use the id-lookup path (which bypasses mode filters).

**How to avoid:** The read-back for `complete` ops must use the id-lookup path directly (`filters.id = taskId` with no
status filter), not a list query with default filters. The existing `executeIdLookup` passes `details: true` which uses
`resolveEffectiveTaskFields(fields, true)` — this path does not apply status filtering.

### Pitfall 6: Tag-assign Verification Requires Tag Name Not Tag ID

**What goes wrong:** After assigning a tag to a task, the verifier looks up the task by id and tries to find `tagId` in
`task.tags`, but the read layer returns tag names (strings), not tag ids.

**Why it happens:** The OmniJS read scripts project tags as an array of name strings (from `tag.name`). Tag objects in
OmniJS have both `.name` and `.id.primaryKey`, but the script builders return only names.

**How to avoid:** The intent object for tag ops uses tag names (from `compiled.data.tags`, `addTags`, `removeTags`). The
comparator compares Sets of names. No id resolution needed — name-to-name is the correct comparison.

### Pitfall 7: Chunking Threshold Calculation (D-16)

**What goes wrong:** The verifier builds a read-back filter script with 200 ids, pushing it over the OmniJS bridge limit
(261KB) and causing a script-too-large error.

**Why it happens:** Each `Task.byIdentifier()` call in the script adds ~40–60 characters. At the OmniJS 261KB limit:
floor(261,124 / 50) ≈ 5,222 ids theoretically, but the script boilerplate is ~2KB, and `byIdentifier` calls include
surrounding loop structure. Conservative safe threshold: 500 ids per chunk (well within both JXA and OmniJS limits). The
`monitorScriptSize` function can validate this empirically during Wave 0.

---

## Code Examples

### Metadata Extension (no type change needed)

```typescript
// Source: src/utils/response-format.ts — StandardMetadataV2 already has open index
// verification_status can be added directly to any metadata object:
const metadata = timer.toMetadata();
(metadata as StandardMetadataV2)['verification_status'] = 'verified'; // or 'unverified' | 'skipped'
```

### Mismatch Error Envelope (D-01, D-02)

```typescript
// Source: pattern from createErrorResponseV2 in response-format.ts
return createErrorResponseV2(
  'omnifocus_write',
  'WRITE_UNVERIFIED_MISMATCH',
  `Write claimed success but read-back proves field(s) did not persist: ${mismatchedFields.join(', ')}`,
  'Do NOT retry blindly — the write did not persist. Re-read the entity state before retrying.',
  { mismatchedFields, intent: intentSnapshot, readBack: readBackSnapshot },
  originalMetadata, // preserve timing from the mutation
);
```

### Date Comparator (D-08)

```typescript
// Canonical form: both sides are UTC ISO strings from localToUTC
// Compare as epoch-ms with ±60s tolerance
function compareDates(intent: string | undefined, readBack: string | null | undefined): boolean {
  if (!intent && !readBack) return true;
  if (!intent || !readBack) return false; // absent-field rule
  const intentMs = new Date(intent).getTime();
  const readBackMs = new Date(readBack).getTime();
  return Math.abs(intentMs - readBackMs) <= 60_000;
}
```

### Tag Comparator (D-08)

```typescript
// Tags: Set-of-names comparison; order is not meaningful
function compareTags(intentTags: string[], readBackTags: string[]): boolean {
  const intentSet = new Set(intentTags.map((t) => t.toLowerCase()));
  const readSet = new Set(readBackTags.map((t) => t.toLowerCase()));
  if (intentSet.size !== readSet.size) return false;
  for (const t of intentSet) {
    if (!readSet.has(t)) return false;
  }
  return true;
}
```

### id-set Filter Shape (new — for D-13)

```typescript
// Proposed addition to read-schema.ts filterFields:
ids: z.array(z.string()).min(1).max(200).optional(),  // Batch read-back; max 200 per chunk

// Corresponding inputSchema addition in OmniFocusReadTool.ts inputSchema override:
ids: { type: 'array', items: { type: 'string' }, description: 'Fetch multiple tasks by id (for write verification)' },
```

### Multi-id Script Builder (for D-13)

```typescript
// OmniJS pattern — must run inside evaluateJavascript (not JXA outer)
// Source pattern: buildProjectByIdScript uses Project.byIdentifier() — mirror for tasks
function buildTasksByIdSetScript(ids: string[]): string {
  const idsJson = JSON.stringify(ids);
  // OmniJS property access (no parens), not JXA method calls
  return `
    const ids = ${idsJson};
    const results = ids.map(id => {
      const task = Task.byIdentifier(id);
      if (!task) return null;
      return {
        id: task.id.primaryKey,
        name: task.name,
        // ... required fields for verification
        tags: task.tags.map(t => t.name),
        flagged: task.flagged,
        // etc.
      };
    }).filter(Boolean);
    JSON.stringify({ tasks: results });
  `;
}
```

---

## State of the Art

| Old Approach                       | Current Approach                                 | When Changed | Impact                                          |
| ---------------------------------- | ------------------------------------------------ | ------------ | ----------------------------------------------- |
| `deepEqual` round-trip (test only) | Per-field-type canonical comparator (production) | Phase 5      | Eliminates false `unverified` on dates/tags     |
| No verification on write           | Independent osascript read-back                  | Phase 5      | Catches silent-no-op JXA/OmniJS bridge failures |
| Single-id filter only              | id-set filter for batch read-back                | Phase 5      | Avoids O(N) spawns for batch ops (D-13)         |

**Deprecated/outdated:**

- `assert-field-persisted.ts` naive `deepEqual`: fine for test assertions where caller controls `expected`, but not
  suitable for production because the production verifier doesn't have a pre-diff expected object — it computes intent
  from the mutation args.

---

## Assumptions Log

| #   | Claim                                                                                                                       | Section                 | Risk if Wrong                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| A1  | The OmniJS multi-id lookup via `Task.byIdentifier()` in a loop is safe for up to ~500 ids before hitting script-size limits | Pitfall 7 / D-16        | If the threshold is lower, chunking must start earlier; measure in Wave 0                 |
| A2  | `executeIdLookup` in `OmniFocusReadTool` bypasses the cache unconditionally                                                 | Section: Caching Safety | If caching was added since inspection, read-backs may return stale data; verify in Wave 0 |
| A3  | The batch response `metadata` field is always present and writable regardless of whether `createSuccessResponseV2` was used | Pitfall 2               | If `metadata` is absent on some path, the verifier will throw; audit all return paths     |

---

## Open Questions (RESOLVED)

1. **Should `tag_manage create/rename/nest/unnest/reparent` be in the skipped set or verifiable?**
   - What we know: tag-assign to tasks is verifiable (relationship extractor). tag_manage ops (creating/renaming a tag
     itself) produce a different post-state — the tag now exists with a new name or parent.
   - What's unclear: is there a cheap `tags { type: "tags" }` read that can confirm the tag hierarchy post-mutation?
   - Recommendation: include a simple name-existence check for `tag_manage create` and `tag_manage rename`; mark
     `tag_manage nest/unnest/reparent` as having relationship-shaped extractors like task move. If the tag read-back is
     too expensive, fall back to `skipped` for `tag_manage` with a logged audit entry.
   - **RESOLVED:** tag_manage create, rename, nest, and reparent are ALL verifiable via relationship-shaped read-backs
     and are NOT in the skipped set (per D-09 and the plan revision). create/rename: verify tag name existence in the
     tag list. nest/reparent: verify tag parent in the tag hierarchy. tag_manage delete and merge are OWNER-only
     (policy-gated for agent) and fall under D-12 owner `unverified`, not `skipped`. The closed-skip set does not
     include any tag_manage action.

2. **For `folder create`, what does the read-back verify?**
   - What we know: `handleFolderCreate` does not return a folder id in a predictable metadata field (it returns
     `result.data` from the script raw).
   - What's unclear: what id format the create-folder script returns.
   - Recommendation: inspect `buildCreateFolderScript` result shape in Wave 0. If no stable id is returned,
     `folder create` goes in the logged-`skipped` set.
   - **RESOLVED:** determination deferred to Wave 0 inspection (Plan 05-01 Task 1). The executor reads
     `buildCreateFolderScript` and `handleFolderCreate` return path and records a one-line finding in the
     WriteVerifier.ts stub comment (`FOLDER_CREATE_ID_FINDING`). If a stable id is returned, folder_create is verified
     via id lookup. If no stable id is returned, folder_create is placed in the logged-skipped set per D-11. The Plan
     05-04 executor reads this comment before making the skip-vs-verify decision.

3. **Chunking threshold: should it be a config value or a constant?**
   - What we know: 500 ids is conservatively safe based on script-size estimates.
   - Recommendation: start as a named constant `VERIFY_READBACK_CHUNK_SIZE = 500` in `WriteVerifier.ts`. Make it a
     config value only if integration tests reveal the threshold needs tuning.
   - **RESOLVED:** implemented as the constant `VERIFY_READBACK_CHUNK_SIZE = 200` in `WriteVerifier.ts`, aligned with
     the Zod `ids` array max bound of 200 already adopted in read-schema.ts (Plan 05-03). The value 200 is more
     conservative than the 500 estimate and stays well within both the OmniJS 261KB and JXA 523KB script-size limits.
     Promote to a config value only if integration tests show the threshold needs tuning.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is code-only changes. No external tools, services, runtimes, or CLIs beyond what is
already in the project are required.

---

## Validation Architecture

> `nyquist_validation: true` in `.planning/config.json` — this section is required.

### Test Framework

| Property           | Value                                                |
| ------------------ | ---------------------------------------------------- |
| Framework          | Vitest                                               |
| Config file        | `vite.config.ts` (or project root — existing config) |
| Quick run command  | `npm run test:unit`                                  |
| Full suite command | `npm run test:unit && npm run test:integration`      |

### Phase Requirements → Test Map

| Req ID           | Behavior                                                                                            | Test Type   | Automated Command                                                            | File Exists? |
| ---------------- | --------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------- | ------------ |
| VERIFY-01        | Verifier issues an independent osascript spawn (not in-script read)                                 | unit        | `npm run test:unit -- tests/unit/tools/unified/WriteVerifier.test.ts`        | ❌ Wave 0    |
| VERIFY-01        | Owner-role mutations report `unverified` (not skipped)                                              | unit        | `npm run test:unit -- tests/unit/tools/unified/WriteVerifier.test.ts`        | ❌ Wave 0    |
| VERIFY-02        | Proven mismatch returns `error` envelope with `WRITE_UNVERIFIED_MISMATCH`                           | unit        | `npm run test:unit -- tests/unit/tools/unified/WriteVerifier.test.ts`        | ❌ Wave 0    |
| VERIFY-02        | Absent field in read-back is a hard fail (D-08)                                                     | unit        | `npm run test:unit -- tests/unit/tools/unified/field-comparator.test.ts`     | ❌ Wave 0    |
| VERIFY-02        | Date comparison with ±60s tolerance (D-08)                                                          | unit        | `npm run test:unit -- tests/unit/tools/unified/field-comparator.test.ts`     | ❌ Wave 0    |
| VERIFY-02        | Tags compared as Set-of-names (D-08)                                                                | unit        | `npm run test:unit -- tests/unit/tools/unified/field-comparator.test.ts`     | ❌ Wave 0    |
| VERIFY-02        | Scalars normalized (estimatedMinutes int-round, flagged bool, note trim, null/undefined/'' unified) | unit        | `npm run test:unit -- tests/unit/tools/unified/field-comparator.test.ts`     | ❌ Wave 0    |
| VERIFY-02        | Read-back failure returns VERIFY_READBACK_FAILED error envelope (D-04)                              | unit        | `npm run test:unit -- tests/unit/tools/unified/WriteVerifier.test.ts`        | ❌ Wave 0    |
| VERIFY-03        | Success response metadata includes `verification_status: "verified"` on match                       | unit        | `npm run test:unit -- tests/unit/tools/unified/WriteVerifier.test.ts`        | ❌ Wave 0    |
| VERIFY-03        | Dry-run operations get `verification_status: "skipped"` with audit log entry                        | unit        | `npm run test:unit -- tests/unit/tools/unified/WriteVerifier.test.ts`        | ❌ Wave 0    |
| OMN-119 (parity) | Batch route uses same per-item verifier as single route                                             | unit        | `npm run test:unit -- tests/unit/tools/unified/WriteVerifier.test.ts`        | ❌ Wave 0    |
| VERIFY-01+02     | Task create → read-back confirms field persisted (live OmniFocus)                                   | integration | `npm run test:integration -- tests/integration/tools/write-verifier.test.ts` | ❌ Wave 0    |
| VERIFY-02        | Simulated silent-no-op (mock read-back returns missing field) → WRITE_UNVERIFIED_MISMATCH           | unit        | (in WriteVerifier.test.ts via mock)                                          | ❌ Wave 0    |

### Key Test Obligations

**Mandatory batch-parity test (OMN-119 lesson):** A test that creates a task via single op and via batch op, asserting
both receive `verification_status: "verified"` in their response metadata. This is the specific regression the OMN-119
lesson exists to prevent — single/batch drift at the enforcement funnel.

**Per-field-type comparator unit tests (field-comparator.test.ts):** Each comparator rule needs its own test(s):

- Dates: exact match, within-60s match, outside-60s fails, missing-field fails
- Tags: same set different order passes, subset fails, missing tag fails, extra tag fails, absent field fails
- Scalars: `null`/`undefined`/`''` unify; `estimatedMinutes: 60.9` rounds to 61 for comparison; `flagged: 'true'`
  (string from bridge) coerces to bool
- Absent-field hard fail: intent has `flagged: true`, read-back returns object with no `flagged` key → mismatch (not
  undefined == undefined)

**Proved-mismatch → error integration test (D-01):** Cannot be done purely in unit tests without a live OmniFocus
instance where a write actually fails silently. The integration test strategy: mock `execJson` at the verifier's
read-back call to return a task object with the field missing/wrong, confirm the full `createErrorResponseV2` output
shape (including `WRITE_UNVERIFIED_MISMATCH` code, `success: false`, non-null `error.details`).

**Skipped-set audit (D-11):** Unit test asserts that `dryRun: true` batches return `skipped` status, and that the skip
is accompanied by a logger call (verify via `vi.spyOn(logger, 'info')`). Confirm no other path returns `skipped` except
the closed set.

**Owner-role unverified-not-skipped (D-12):** Unit test with role = 'owner': mutation completes, response has
`verification_status: 'unverified'` (not `'skipped'`).

### Sampling Rate

- **Per task commit:** `npm run test:unit`
- **Per wave merge:** `npm run test:unit && npm run test:integration`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/tools/unified/verifier/WriteVerifier.test.ts` — covers VERIFY-01, VERIFY-02 (mismatch + failure
      paths), VERIFY-03, OMN-119 batch parity, D-11 skipped audit, D-12 owner unverified
- [ ] `tests/unit/tools/unified/verifier/field-comparator.test.ts` — covers D-05, D-08 (all field types + absent-field
      hard fail)
- [ ] `tests/integration/tools/write-verifier.test.ts` — live round-trip: create task, confirm `verified` in response
- [ ] `src/tools/unified/verifier/WriteVerifier.ts` — new production module
- [ ] `src/tools/unified/verifier/field-comparator.ts` — new production module
- [ ] `src/tools/unified/verifier/intent-extractor.ts` — new production module

_(No new framework install needed — Vitest is already the test runner.)_

---

## Security Domain

> `security_enforcement: true` in `.planning/config.json`.

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                 |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | no      | Not applicable — no new auth surface                                                                             |
| V3 Session Management | no      | Not applicable                                                                                                   |
| V4 Access Control     | yes     | Verifier is agent-role-mandatory; owner-role opt-out via D-12; closed `skipped` set with audit log enforces D-11 |
| V5 Input Validation   | yes     | The id-set filter addition must validate ids (max 200 per chunk, string format); Zod schema handles this         |
| V6 Cryptography       | no      | No cryptographic operations                                                                                      |

### Known Threat Patterns for this Stack

| Pattern                                           | STRIDE                               | Standard Mitigation                                                                                                                                      |
| ------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verification bypass via `skipped` inflation       | Tampering                            | Closed `skipped` set (D-11); every `skipped` is logged; code review gate on adding new skipped cases                                                     |
| Read-back from stale cache returning old state    | Information Disclosure / Repudiation | Verifier bypasses `CacheManager` entirely; calls `execJson` directly (not the cached read tool layer)                                                    |
| id-set injection in filter                        | Tampering                            | Ids come from the mutation result (server-internal), not from user input; still, Zod validates `ids: z.array(z.string()).max(200)` to bound blast radius |
| Agent claiming `skipped` for a proven-mismatch op | Elevation of Privilege               | `skipped` is only set inside the verifier's closed-set logic path; mismatch path always returns `error` envelope regardless                              |

---

## Sources

### Primary (HIGH confidence)

- Codebase inspection: `src/tools/unified/OmniFocusWriteTool.ts` (2645 lines) — confirmed `executeValidated()` funnel,
  all handler return paths, batch router shape [VERIFIED: codebase inspection]
- Codebase inspection: `src/utils/response-format.ts` — `StandardResponseV2`, `StandardMetadataV2` open index signature,
  `createErrorResponseV2` / `createSuccessResponseV2` factory functions [VERIFIED: codebase inspection]
- Codebase inspection: `src/tools/unified/schemas/read-schema.ts` — confirmed no `ids[]` filter field exists today
  [VERIFIED: codebase inspection]
- Codebase inspection: `src/tools/unified/OmniFocusReadTool.ts` — confirmed `executeIdLookup` bypasses cache
  (`from_cache: false`, no `this.cache.get()` call) [VERIFIED: codebase inspection]
- Codebase inspection: `src/omnifocus/OmniAutomation.ts` — spawn pattern, `EMPIRICAL_LIMITS` (JXA 523,266 chars / OmniJS
  261,124 chars) [VERIFIED: codebase inspection]
- Codebase inspection: `docs/dev/SETTER-PATTERNS.md` — rows 1 (reviewInterval P4), 6 (tags silent no-op), 7 (parent/move
  OmniJS-only) [VERIFIED: codebase inspection]
- Codebase inspection: `tests/integration/helpers/assert-field-persisted.ts` — pattern reference for independent
  round-trip [VERIFIED: codebase inspection]

### Secondary (MEDIUM confidence)

- `.planning/phases/05-write-verifier/05-CONTEXT.md` — locked decisions D-01..D-16, all confirmed implementable against
  the live codebase [CITED: project context file]
- `.planning/config.json` — `nyquist_validation: true`, `security_enforcement: true` [CITED: project config]

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all proposed modules are pure TypeScript within the existing codebase; no new external deps
- Architecture: HIGH — funnel attach point, return path shapes, and caching behavior confirmed by direct codebase
  inspection
- Pitfalls: HIGH — JXA/OmniJS syntax rules are project-documented (SETTER-PATTERNS, CLAUDE.md); batch shape difference
  confirmed by reading `routeToBatch` to completion
- id-set filter gap: HIGH — confirmed by reading `filterFields` object in `read-schema.ts`; no `ids[]` key present

**Research date:** 2026-06-06 **Valid until:** 2026-07-06 (stable codebase; re-verify if OmniFocusWriteTool or
read-schema.ts are modified before Phase 5 executes)
