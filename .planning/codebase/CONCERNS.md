# Codebase Concerns

**Analysis Date:** 2026-06-03

---

## Tech Debt

**Bridge nonce technique for task ID resolution (OMN-28/29):**
- Issue: JXA `.id()` returns a transient internal ID that `Task.byIdentifier()` cannot reliably resolve for freshly created objects. The workaround temporarily prepends a unique nonce string (`__BRIDGE_<timestamp>_<random>__`) to the task's note field, scans `flattenedTasks` from OmniJS to find the task by nonce, reads the real `primaryKey`, then restores the original note.
- Files: `src/contracts/ast/mutation-script-builder.ts` (~617–646)
- Impact: Every single-task creation involves an O(n) scan of all tasks in OmniJS. If the bridge call fails after writing the nonce but before cleanup, the nonce leaks into the task note. Two concurrent creates could theoretically both match the same nonce before cleanup.
- Fix approach: This is a JXA/OmniJS fundamental mismatch; no cleaner approach exists without Omni Group API changes. Add a test asserting nonce never appears in final note; add monitoring for failed cleanups.

**`reviewInterval` setter requires P4 read-modify-reassign (SETTER-PATTERNS row 1):**
- Issue: `Project.ReviewInterval` is not constructible from user code. If a project has no existing `ReviewInterval` instance, the OmniJS getter returns `null` and the update silently returns `{ success: false }` without error. The error is swallowed in a bare `catch (e) {}`.
- Files: `src/contracts/ast/mutation-script-builder.ts` (~1126–1148, ~1572), `src/omnifocus/scripts/reviews/set-review-schedule.ts` (~105)
- Impact: Setting a review interval on a newly created project silently no-ops. The caller sees success but the interval was never set. Requires `assertFieldPersisted` round-trip to detect.
- Fix approach: Detect the `null` case explicitly and surface a meaningful error rather than swallowing it; add integration test coverage on new projects.

**`plannedDate` set via JXA in task creation (potential persistence gap):**
- Issue: `task.plannedDate = new Date(taskData.plannedDate)` is set in JXA context immediately after the task is pushed to its container. `docs/dev/JXA-VS-OMNIJS-PATTERNS.md` documents `task.plannedDate = new Date()` as "Doesn't persist" in the property-setting section but SETTER-PATTERNS row 5 classifies dates as working in JXA context. This creates an ambiguous status.
- Files: `src/contracts/ast/mutation-script-builder.ts` (~600–602)
- Impact: `plannedDate` may silently fail to persist during task creation. The batch-create path (line ~909) has the same pattern.
- Fix approach: Add an `assertFieldPersisted` round-trip integration test for `plannedDate` on task creation. If it fails, move assignment to the OmniJS bridge block.

**`OR` logical operator parsed but falls through to pass-through:**
- Issue: The `transformLogicalOperator` in `QueryCompiler` transforms `OR` input to `orBranches` on the filter object. The AST builder handles `orBranches` at `src/contracts/ast/builder.ts:234–235`. However, `docs/dev/PATTERNS.md` still states "Logged but flattened: OR: [] (uses first condition only)" — this documentation may be stale. The schema comment at `read-schema.ts:38` also says "OR: uses first condition only (logs warning)".
- Files: `src/tools/unified/compilers/QueryCompiler.ts` (~164–168), `src/tools/unified/schemas/read-schema.ts` (~38), `src/contracts/ast/builder.ts` (~234)
- Impact: If the documentation is accurate and `orBranches` is not fully propagated through all query paths, multi-condition OR filters silently return wrong results. Callers receive no error.
- Fix approach: Write an integration test exercising `OR: [{status: 'active'}, {flagged: true}]`; verify result count matches manual count. Update PATTERNS.md to match actual behavior.

**Complex `NOT` operator is silently simplified:**
- Issue: `transformLogicalOperator` only handles `NOT: { status: 'completed' }` and `NOT: { status: 'active' }`. Any other `NOT` payload logs a console warning and returns `{}` (no filter), silently ignoring the intent.
- Files: `src/tools/unified/compilers/QueryCompiler.ts` (~171–176)
- Impact: `NOT: { tags: ['someday'] }` silently returns all tasks. The user gets no error — just incorrect results.
- Fix approach: Return a Zod validation error or surface the constraint in the `inputSchema` documentation; do not silently return empty filter.

**`OmniFocus Forecast "Past"` mode not implementable as single query:**
- Issue: The overdue mode uses `dueDate < now` (due dates only). The OmniFocus Forecast "Past" bucket requires `(dueDate < start_of_today OR plannedDate < start_of_today) AND NOT blocked` — an OR across different date fields. The AST filter system is AND-only for top-level fields; OR across date fields requires two separate queries and a merge.
- Files: None currently — this is a missing feature documented in `docs/dev/LESSONS_LEARNED.md` (~458–489)
- Impact: Users querying for "past" tasks get different results from OmniFocus UI's "Past" section.
- Fix approach: Add a `mode: 'forecast_past'` that runs two queries (overdue + past-planned), merges by ID, and excludes blocked tasks.

**Module-level mutable sandbox cache:**
- Issue: Three module-level variables in `mutation-script-builder.ts` hold test-mode sandbox state: `cachedSandboxFolderId`, `validatedProjectIds`, `validatedTaskIds`. These persist across test cases unless `clearSandboxCache()` is explicitly called.
- Files: `src/contracts/ast/mutation-script-builder.ts` (~42, ~105, ~158)
- Impact: If a test creates a task/project and validates it, later tests inherit those validated IDs without re-checking. A moved or deleted sandbox item would pass guard checks after the cache is warm.
- Fix approach: Call `clearSandboxCache()` in test `beforeEach`; consider instance-scoped caching rather than module-level globals.

**`globalPendingOperations` module-level singleton:**
- Issue: `src/omnifocus/OmniAutomation.ts` exports a mutable `let globalPendingOperations` and a setter `setPendingOperationsTracker`. Both `index.ts` and `session-manager.ts` call the setter; if HTTP mode is used alongside stdio the set is called twice and only the last tracker wins.
- Files: `src/omnifocus/OmniAutomation.ts` (~27–30), `src/index.ts` (~60), `src/session-manager.ts` (~43)
- Impact: In HTTP mode, operations tracked before the second `setPendingOperationsTracker` call may be orphaned.
- Fix approach: Inject the tracker through the constructor rather than using a module-level global.

---

## Known Bugs

**Test data leaks into live OmniFocus (OMN-46, partially fixed by OMN-119):**
- Symptoms: Tasks/projects named with test prefixes (`__MCP_TEST_SANDBOX__`, `__test-*`, `__TEST__`) appear in live OmniFocus during integration test runs.
- Files: `src/contracts/ast/mutation-script-builder.ts`, `src/utils/sandbox-guard.ts`, `tests/integration/helpers/sandbox-manager.ts`
- Trigger: Historically triggered when `NODE_ENV=test` was set without `SANDBOX_GUARD_ENABLED=true`. OMN-119 fixed the batch-create bypass. The startup assertion in `sandbox-guard.ts` now prevents silent bypasses at server startup.
- Workaround: `assertSandboxGuardAtStartup()` now throws if misconfigured. Verified by `tests/unit/utils/sandbox-guard.test.ts`.

**Untracked test task creation in integration tests:**
- Symptoms: Tasks with tags like `['test', 'planned-dates']` accumulate in OmniFocus after test runs.
- Files: `tests/integration/` (tests referencing `manage_task` directly rather than `client.createTestTask()`)
- Trigger: Any test run on macOS with OmniFocus running. Documented in `docs/dev/SKIPPED_TESTS.md` (~114–148).
- Workaround: Manual cleanup required. Fix: convert all direct `callTool('manage_task', ...)` calls to `client.createTestTask()`.

**Analytics validation test crashes on undefined access:**
- Symptoms: `TypeError: Cannot read properties of undefined (reading 'length')` in `tests/integration/validation/analytics-validation.test.ts`.
- Files: `tests/integration/validation/analytics-validation.test.ts`
- Trigger: When the tasks query returns an unexpected structure.
- Workaround: Test is known-broken; documented in `docs/bugs/analytics-validation-test-bug.md`. Fix: add null guards before `.length` access.

---

## Security Considerations

**Shell escaping in `executeGuardJXA` uses single-quote replacement:**
- Risk: The sandbox guard's internal JXA runner wraps scripts with `.replace(/'/g, "'\"'\"'")` for `osascript -e`. This is the standard shell single-quote escape, but if the script content contains a sequence that isn't properly handled, it could break out of the shell quoting or cause unexpected behavior.
- Files: `src/contracts/ast/mutation-script-builder.ts` (~71)
- Current mitigation: This function only runs in test mode (`isTestMode()` guard). Script content is generated code, not user input.
- Recommendations: Long-term, write guard scripts to temp files (the documented lesson from `LESSONS_LEARNED.md`) rather than passing via `-e`.

**OmniJS injection via task/project names:**
- Risk: User-supplied strings (task names, notes, tags) are embedded into OmniJS bridge scripts via `JSON.stringify` and template literals. `escapeTemplateLiteralHazards` and `escapeTemplateString` in `src/contracts/ast/bridge-escape.ts` handle backtick and `${` hazards. However, injection through other channels (e.g., a control character in a tag path segment causing a JS parse error) could surface.
- Files: `src/contracts/ast/bridge-escape.ts`, `src/contracts/ast/mutation-script-builder.ts`
- Current mitigation: `sanitizeForScriptComment` strips C0 control chars. Most data paths use `JSON.stringify` for embedding. Tests in `tests/unit/contracts/ast/bridge-injection.test.ts` and `tests/unit/edge-case-escaping.test.ts` cover known vectors.
- Recommendations: Fuzz the tag-path parser (`parseTagPath`) with malformed inputs including Unicode direction characters and zero-width spaces, which `JSON.stringify` does not strip.

**Automation permission caching has 15-second TTL:**
- Risk: The `PermissionChecker` caches the last permission status for 15 seconds. If OmniFocus is killed and relaunched between checks, the stale `hasPermission: true` result could produce confusing script failures that look like bugs, not permission errors.
- Files: `src/utils/permissions.ts` (~16–31)
- Current mitigation: 15s is intentionally short to reduce prompts. The fix is surfaced in error messages.
- Recommendations: Low priority; document the TTL behavior in operational docs.

---

## Performance Bottlenecks

**MCP cold-start: ~10 seconds before first response:**
- Problem: Each MCP session starts a new Node.js process with full module graph loading. Benchmarks in `docs/dev/LESSONS_LEARNED.md` show ~10–11s startup before the first script execution.
- Files: `src/index.ts`, `src/utils/startup-timer.ts`
- Cause: Node.js ESM module graph load + permission check + cache warm. The startup timer reports phases: `load / init / perms / warm / register / ready`.
- Improvement path: Profile with `--inspect` to identify heaviest imports; consider lazy-loading analytics modules. HTTP transport (`src/http-server.ts`) avoids per-request cold-start.

**Each OmniJS script execution: 6–8 seconds for typical task queries:**
- Problem: Script execution via `osascript` involves IPC to OmniFocus. Even OmniJS bridge calls take ~6–8s for a 2000-task database (benchmarked in `docs/dev/LESSONS_LEARNED.md`).
- Files: `src/omnifocus/OmniAutomation.ts`
- Cause: Apple Events IPC overhead is fundamental; JXA is described as "legacy / sunset mode" by Omni Group.
- Improvement path: Cache warming (`src/cache/CacheWarmer.ts`) mitigates repeated reads. Count-only queries (33x faster) available for "how many" questions.

**`whose()` / `where()` causes 25+ second timeouts:**
- Problem: Using `.where()` or `.whose()` on `flattenedTasks` serializes each predicate as an Apple Event round-trip, causing 25+ second hangs on large databases.
- Files: Any script using JXA `.whose()` — banned codebase-wide per `docs/dev/LESSONS_LEARNED.md`.
- Cause: O(n) Apple Event round-trips, one per task.
- Improvement path: All production scripts use direct iteration; this is a pitfall for future contributors. The ESLint rules in `eslint-rules/` do not currently catch `.whose()` usage automatically.

---

## Fragile Areas

**Dual-schema synchronization (Zod vs `inputSchema`):**
- Files: `src/tools/unified/OmniFocusReadTool.ts`, `src/tools/unified/OmniFocusWriteTool.ts`, `src/tools/unified/OmniFocusAnalyzeTool.ts`, `src/tools/system/SystemTool.ts`
- Why fragile: Every tool has two schemas that must stay in sync manually: the Zod schema for server-side validation and the hand-crafted `inputSchema` override for MCP advertisement. `BaseTool.inputSchema` throws if a subclass forgets to override it, but there is no compile-time or test-time check that the two schemas are equivalent. Schema drift causes Claude Desktop to send malformed inputs that pass `inputSchema` but fail Zod validation.
- Safe modification: After any Zod schema change, update the corresponding `get inputSchema()`. The `tests/unit/architecture/schema-impl-parity.test.ts` test provides some parity coverage.
- Test coverage: `tests/unit/architecture/schema-impl-parity.test.ts` — limited to structural checks, not semantic equivalence.

**OmniJS `evaluateJavascript` error surface:**
- Files: `src/omnifocus/OmniAutomation.ts`, `src/contracts/ast/mutation-script-builder.ts`
- Why fragile: OmniJS errors propagate as stringified JSON inside a successful `osascript` exit. The detection chain in `OmniAutomation.executeJson` must recognize multiple legacy and modern error shapes. A new error shape from a future OmniFocus version could be silently treated as success with `{ ok: true, data: '<error string>' }`.
- Safe modification: Use `isScriptError()` from `src/omnifocus/script-result-types.ts`; never inspect raw script output directly.
- Test coverage: `tests/unit/omnifocus/OmniAutomation.test.ts` covers known error shapes.

**Bridge nonce cleanup on concurrent creates:**
- Files: `src/contracts/ast/mutation-script-builder.ts` (~617–646)
- Why fragile: The nonce cleanup block (`try { if (curNote.startsWith(bridgeNonce)) task.note = ... }`) is best-effort only. If OmniJS returns a parse error or a concurrent script mutates the note between write and cleanup, the nonce string leaks into the task note permanently.
- Safe modification: Always verify task notes after programmatic creation in integration tests.
- Test coverage: `tests/integration/tools/unified/field-roundtrip.test.ts` covers field round-trips but may not specifically check note field after creation.

**`husky` hooks instead of `pre-commit` framework:**
- Files: `.husky/pre-commit`, `.husky/pre-push`, `.husky.disabled/pre-commit`
- Why fragile: The repo uses `husky` (npm-only hook manager) rather than the `pre-commit` Python framework. A previous incident (documented in `docs/dev/LESSONS_LEARNED.md` ~266–290) wiped `CLAUDE.md` (1138 lines) because `lint-staged` failed on a symlink, created a stash backup, and the restore failed silently. The stash was dropped and the corrupted state was committed.
- Safe modification: Add `.prettierignore` entries for symlinks; never run `git stash drop` after a failed `stash apply` without first recovering individual files.
- Test coverage: None for hook behavior.

---

## Scaling Limits

**`flattenedTasks` O(n) iteration:**
- Current capacity: Works acceptably for ~2000 tasks (~6–8s per query).
- Limit: Observed timeouts at 2000+ tasks when using per-task JXA method calls. Pure OmniJS bridge is ~10x faster but still O(n) linear scan.
- Scaling path: Pagination via `limit`/`offset` is supported; `countOnly` mode is 33x faster for count queries. No indexed or server-side filtering available through OmniJS API.

**Script size limits:**
- JXA direct: 523KB empirical limit. Current largest script: ~31KB (6% of limit).
- OmniJS bridge: 261KB empirical limit. Current largest: ~16KB (6% of limit).
- Scaling path: Well within current limits. If the unified helpers grow significantly, consider lazy-loading helper blocks rather than always including all functions.

---

## Dependencies at Risk

**JXA ("legacy / sunset mode"):**
- Risk: Omni Group describes JXA/osascript as "legacy / sunset mode." No deprecation timeline has been announced, but long-term support is uncertain.
- Impact: If JXA is removed from macOS or future OmniFocus versions, the entire execution model breaks.
- Migration plan: The codebase already uses OmniJS bridge for complex operations. A full migration to pure OmniJS (via URL scheme or plugin) would require a new execution transport but the script logic would survive largely intact.

**`@modelcontextprotocol/sdk` at `^1.25.1`:**
- Risk: The MCP protocol is evolving rapidly. The `protocolVersion` in test helpers (`2025-06-18`) and the SDK version must stay aligned. The `docs/dev/SDK_UPGRADE_RECOMMENDATION.md` documents a pending upgrade recommendation.
- Impact: Drift between the advertised protocol version and the client's expected version causes MCP initialization failures.
- Migration plan: Check `docs/dev/SDK_UPGRADE_RECOMMENDATION.md` before upgrading; test with `echo '...' | node dist/index.js` after upgrade.

---

## Missing Critical Features

**No single-query `forecast_past` mode:**
- Problem: The OmniFocus Forecast "Past" view requires OR logic across `dueDate` and `plannedDate` fields — not expressible in the current AND-only AST filter system.
- Blocks: Accurate overdue reporting; matching OmniFocus UI task counts.
- See: `docs/dev/LESSONS_LEARNED.md` (~458–489).

**No ESLint rule for `.whose()` / `.where()` usage:**
- Problem: The `.whose()` / `.where()` timeout footgun is documented but not lint-enforced. A contributor writing a new script could inadvertently reintroduce a 25+ second timeout.
- Blocks: Reliable performance; the next script author to reach for `.whose()` will hit it.
- Fix: Add a custom ESLint rule (see `eslint-rules/` for examples) that flags `.whose(` and `.where(` in any file under `src/omnifocus/scripts/`.

---

## Test Coverage Gaps

**Combined filter result validation (no integration tests):**
- What's not tested: Simultaneous `text + date + tag` filter combinations returning correct results (not just correct parameters).
- Files: `src/omnifocus/scripts/tasks/list-tasks-ast.ts`, `src/contracts/ast/builder.ts`
- Risk: Filter regression (as happened in the v3.0.0 refactor) goes undetected until user testing.
- Priority: High

**Tag filter OR/AND/NOT_IN result correctness:**
- What's not tested: Integration test asserting that `tags: { any: ['A', 'B'] }` returns tasks with either tag (not both).
- Files: `src/contracts/ast/builder.ts` (`buildTagsNode`), `src/contracts/ast/emitters/omnijs.ts`
- Risk: A regression in `buildTagsNode` would silently return wrong task sets. Schema tests pass; behavior tests don't exist.
- Priority: High

**`reviewInterval` on projects with no existing interval:**
- What's not tested: Setting `reviewInterval` on a brand-new project where `proj.reviewInterval` returns `null`.
- Files: `src/contracts/ast/mutation-script-builder.ts` (~1126–1148), `src/omnifocus/scripts/reviews/set-review-schedule.ts`
- Risk: Silent no-op; user believes interval was set but it wasn't.
- Priority: High

**`plannedDate` round-trip on task creation:**
- What's not tested: Whether `plannedDate` set during `create` task actually persists in OmniFocus (JXA vs OmniJS ambiguity).
- Files: `src/contracts/ast/mutation-script-builder.ts` (~600–602), `tests/integration/tools/unified/field-roundtrip.test.ts`
- Risk: Silent data loss on a commonly used field.
- Priority: Medium

**Complex `NOT` and `OR` filter behavior:**
- What's not tested: Callers using `NOT: { tags: ['someday'] }` receive no results (silent empty filter, no error).
- Files: `src/tools/unified/compilers/QueryCompiler.ts` (~171–176)
- Risk: Incorrect results with no diagnostic feedback.
- Priority: Medium

**Untracked test task cleanup (`omnifocus-4.7-features.test.ts`):**
- What's not tested: That tests leave OmniFocus clean after each run.
- Files: `tests/integration/` (tests using direct `callTool('manage_task', ...)`)
- Risk: Accumulated test pollution in live OmniFocus database.
- Priority: Medium

---

*Concerns audit: 2026-06-03*
