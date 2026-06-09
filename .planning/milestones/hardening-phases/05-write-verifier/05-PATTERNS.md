# Phase 5: Write-Verifier — Pattern Map

**Mapped:** 2026-06-06 **Files analyzed:** 9 (3 new production modules + 3 modified production files + 3 new test files)
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File                                                  | Role       | Data Flow        | Closest Analog                                                                                   | Match Quality |
| ------------------------------------------------------------------ | ---------- | ---------------- | ------------------------------------------------------------------------------------------------ | ------------- |
| `src/tools/unified/verifier/WriteVerifier.ts`                      | service    | request-response | `src/tools/unified/OmniFocusWriteTool.ts` policy-guard block (lines 395–459)                     | role-match    |
| `src/tools/unified/verifier/field-comparator.ts`                   | utility    | transform        | `tests/integration/helpers/assert-field-persisted.ts` `deepEqual` + `show` (lines 59–83)         | partial-match |
| `src/tools/unified/verifier/intent-extractor.ts`                   | utility    | transform        | `src/tools/unified/OmniFocusWriteTool.ts` `handleTaskCreate` intent construction (lines 539–551) | partial-match |
| `src/tools/unified/OmniFocusWriteTool.ts` (MODIFIED)               | controller | request-response | Same file — policy-guard attach-point precedent (lines 395–459, 522–529)                         | exact         |
| `src/tools/unified/schemas/read-schema.ts` (MODIFIED)              | config     | transform        | Same file — existing `filterFields.id` pattern (lines 43–44)                                     | exact         |
| `src/tools/unified/OmniFocusReadTool.ts` (MODIFIED)                | controller | request-response | Same file — `executeIdLookup` + `inputSchema` override (lines 228–292, 472–529)                  | exact         |
| `src/utils/response-format.ts` (MODIFIED)                          | utility    | transform        | Same file — `createErrorResponseV2` + `StandardMetadataV2` (lines 93–113, 488–512)               | exact         |
| `tests/unit/tools/unified/verifier/WriteVerifier.test.ts` (NEW)    | test       | request-response | `tests/unit/tools/write-tool-policy-guard.test.ts`                                               | exact         |
| `tests/unit/tools/unified/verifier/field-comparator.test.ts` (NEW) | test       | transform        | `tests/unit/tools/unified/OmniFocusWriteTool.test.ts`                                            | role-match    |
| `tests/integration/tools/write-verifier.test.ts` (NEW)             | test       | request-response | `tests/integration/tools/unified/field-roundtrip.test.ts`                                        | exact         |

---

## Pattern Assignments

### `src/tools/unified/verifier/WriteVerifier.ts` (service, request-response)

**Analog:** `src/tools/unified/OmniFocusWriteTool.ts` — policy-guard block + post-handler dispatch pattern

**Imports pattern** (from OmniFocusWriteTool.ts lines 1–65):

```typescript
import {
  createErrorResponseV2,
  OperationTimerV2,
  type StandardResponseV2,
  type StandardMetadataV2,
} from '../../../utils/response-format.js';
import { isScriptSuccess, isScriptError } from '../../../omnifocus/script-result-types.js';
import { parseRole } from '../../../auth/role-resolver.js';
```

**Role guard pattern** (from OmniFocusWriteTool.ts lines 400–401):

```typescript
const role = parseRole();
// owner path: add unverified to metadata and return early (D-12)
if (role !== 'agent') {
  mutationResult.metadata['verification_status'] = 'unverified';
  return mutationResult;
}
```

**Verifier attach point** (from OmniFocusWriteTool.ts lines 522–529 — the post-handler return path the verifier wraps):

```typescript
// Current code at lines 522–529 of OmniFocusWriteTool.ts — this is WHERE the verifier inserts:
const isSuccess = taskResult && typeof taskResult === 'object' && (taskResult as { success?: boolean }).success;
return this.formatForCLI(taskResult, compiled.operation, isSuccess ? 'success' : 'error');

// The verifier runs between the raw taskResult and this formatForCLI call:
// const verifiedResult = await this.verifier.verify(taskResult, intent, compiledOperation);
// return this.formatForCLI(verifiedResult, compiled.operation, ...);
```

**Batch result duck-typing** (from OmniFocusWriteTool.ts lines 1626–1645 — the hand-constructed batch shape):

```typescript
// routeToBatch returns a plain object — NOT createSuccessResponseV2:
return {
  success: results.errors.length === 0,
  data: {
    operation: 'batch',
    summary: { created: ..., updated: ..., completed: ..., deleted: ..., errors: ... },
    results: flattenBatchResults(results),
    ...(Object.keys(tempIdMapping).length > 0 ? { tempIdMapping } : {}),
  },
  metadata: {
    operation: 'batch',
    timestamp: new Date().toISOString(),
    ...batchTimer.toMetadata(),
  },
};
// Verifier MUST duck-type metadata, not assume StandardResponseV2 instance shape:
// const meta = (result as { metadata?: StandardMetadataV2 }).metadata;
// if (meta) meta['verification_status'] = status;
```

**Mismatch error pattern** (from response-format.ts lines 488–512):

```typescript
return createErrorResponseV2(
  'omnifocus_write',
  'WRITE_UNVERIFIED_MISMATCH',
  `Write claimed success but read-back proves field(s) did not persist: ${mismatchedFields.join(', ')}`,
  'Do NOT retry blindly — the write did not persist. Re-read the entity state before retrying.',
  { mismatchedFields, intent: intentSnapshot, readBack: readBackSnapshot },
  originalMetadata, // preserve timing from the mutation
);
// For VERIFY_READBACK_FAILED (read-back transport/timeout):
return createErrorResponseV2(
  'omnifocus_write',
  'VERIFY_READBACK_FAILED',
  'Post-mutation read-back could not complete — write result is indeterminate.',
  'Retrying may be safe — the verification failure was in the read, not the write.',
  { cause: String(err) },
  originalMetadata,
);
```

**Read-back spawn pattern** (from OmniFocusReadTool.ts lines 472–529 — `executeIdLookup` is the cache-bypass primitive):

```typescript
// executeIdLookup calls execJson directly — no cache.get(), from_cache always false:
private async executeIdLookup(filter: TaskFilter, fields: string[] | undefined, timer: OperationTimerV2): Promise<unknown> {
  const idFields = resolveEffectiveTaskFields(fields, true);
  const script = buildListTasksScriptV4({ filter, fields: idFields, limit: 1 });
  const result = await this.execJson(script);    // <-- direct, no cache
  // ...
  return createTaskResponseV2('tasks', projectedTasks, { ...timer.toMetadata(), from_cache: false, mode: 'id_lookup' });
}
// WriteVerifier should inject execJson (or a thin adapter) as a dependency.
// Never call OmniFocusReadTool through the full tool dispatch — that path may cache.
```

---

### `src/tools/unified/verifier/field-comparator.ts` (utility, transform)

**Analog:** `tests/integration/helpers/assert-field-persisted.ts` — the `deepEqual` it uses is the naive comparator this
module replaces.

**What to replace** (from assert-field-persisted.ts lines 59–72 — the naive deepEqual):

```typescript
// THIS IS THE PATTERN TO REPLACE — naive deepEqual fails on dates (JS Date vs ISO string)
// and on tags (order-sensitive array equality):
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const ak = Object.keys(a as Record<string, unknown>);
  const bk = Object.keys(b as Record<string, unknown>);
  if (ak.length !== bk.length) return false;
  return ak.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}
```

**Date comparator pattern** (from RESEARCH.md code examples — D-08):

```typescript
// Both sides are UTC ISO strings from localToUTC; compare as epoch-ms with ±60s tolerance
function compareDates(intent: string | undefined, readBack: string | null | undefined): boolean {
  if (!intent && !readBack) return true;
  if (!intent || !readBack) return false; // absent-field hard fail (D-08)
  const intentMs = new Date(intent).getTime();
  const readBackMs = new Date(readBack).getTime();
  return Math.abs(intentMs - readBackMs) <= 60_000;
}
```

**Tag comparator pattern** (from RESEARCH.md code examples — D-08):

```typescript
// Tags: Set-of-names comparison; order is not meaningful.
// OmniJS read scripts project tags as array of name strings (from tag.name) — no id resolution needed.
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

**Scalar normalization pattern** (from response-format.ts lines 751–767 — existing normalizers as reference):

```typescript
// Existing: normalizeBooleanInput and normalizeStringInput in response-format.ts
export function normalizeBooleanInput(input: string | boolean | null | undefined): boolean | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'boolean') return input;
  const lowerInput = String(input).toLowerCase().trim();
  if (lowerInput === 'true' || lowerInput === 'yes' || lowerInput === '1') return true;
  if (lowerInput === 'false' || lowerInput === 'no' || lowerInput === '0') return false;
  return null;
}
// Field comparator scalars use the same null/undefined/'' unification:
// null === undefined === '' === "unset"; estimatedMinutes rounds to int; note trimmed.
```

**Absent-field hard-fail rule** (D-08 — pattern from RESEARCH.md):

```typescript
// A field present in the intent object but absent (undefined/missing key) from read-back is a hard fail.
// This is the JXA-tag-assign / silent-no-op class the verifier must catch.
// Pattern: use Object.prototype.hasOwnProperty.call(readBack, key) to distinguish
// "key is absent" from "key is present with undefined value":
function fieldAbsentInReadBack(readBack: Record<string, unknown>, key: string): boolean {
  return !Object.prototype.hasOwnProperty.call(readBack, key);
}
```

---

### `src/tools/unified/verifier/intent-extractor.ts` (utility, transform)

**Analog:** `src/tools/unified/OmniFocusWriteTool.ts` — intent construction inside each handler.

**Task create intent shape** (from OmniFocusWriteTool.ts lines 539–551):

```typescript
// createArgs is the canonical intent object for task create (D-06).
// The verifier iterates its keys — only fields explicitly set appear here.
const createArgs: Partial<TaskCreationArgs> = { name: data.name };
if (data.note) createArgs.note = data.note;
if (data.project !== undefined && data.project !== null) createArgs.projectId = data.project;
if (data.parentTaskId) createArgs.parentTaskId = data.parentTaskId;
if (data.dueDate) createArgs.dueDate = data.dueDate;
if (data.deferDate) createArgs.deferDate = data.deferDate;
if (data.plannedDate) createArgs.plannedDate = data.plannedDate;
if (data.flagged !== undefined) createArgs.flagged = data.flagged;
if (data.estimatedMinutes !== undefined) createArgs.estimatedMinutes = data.estimatedMinutes;
if (data.tags) createArgs.tags = data.tags;
if (data.sequential !== undefined) createArgs.sequential = data.sequential;
// Note: after convertTaskDates(), dueDate/deferDate/plannedDate become UTC ISO strings.
// The verifier compares against the UTC-converted form (D-07), not raw user input.
```

**Task update intent shape** (from OmniFocusWriteTool.ts lines 839 area — `safeUpdates`):

```typescript
// safeUpdates is the post-sanitize intent for task update.
// All keys present in safeUpdates are fields the caller intended to set.
const safeUpdates = sanitizeTaskUpdates(compiled.changes);
// intent-extractor returns safeUpdates directly for 'update' ops.
```

**Id extraction per op class** (pattern from RESEARCH.md Pattern 3):

```typescript
// For task create: metadata.created_id in the success response
const createdId = (result as { metadata?: { created_id?: string } }).metadata?.created_id;

// For task update/complete: compiled.taskId (passed to handler)
const affectedId = compiled.taskId;

// For batch: collect from data.results + data.tempIdMapping
const tempIdMapping = (result as { data?: { tempIdMapping?: Record<string, string> } }).data?.tempIdMapping ?? {};
// All real ids from results; map any tempIds through tempIdMapping
```

---

### `src/tools/unified/OmniFocusWriteTool.ts` (MODIFIED — controller, request-response)

**Analog:** Same file — the Phase 2 policy-guard block is the structural precedent.

**Policy-guard placement precedent** (lines 395–459):

```typescript
// ─── Policy guard (Phase 2 — POLICY-01 through POLICY-07) ───────────────
// Runs before every routing branch. Normalizes compiled mutation into a flat
// list of (operation, target) items and calls decide() on each. First
// denied/gated item short-circuits and returns a structured error; nothing
// executes past this block unless every item is 'allow'.
{
  const role = parseRole();
  const policyItems = normalizeArgsToPolicy(args as unknown as Record<string, unknown>);
  for (const item of policyItems) {
    const outcome = decide(role, item.operation, item.target);
    if (outcome === 'deny') {
      return createErrorResponseV2('omnifocus_write', 'POLICY_DENY_DELETE', ...);
    }
    if (outcome === 'gate') {
      return createErrorResponseV2('omnifocus_write', 'POLICY_GATE_REQUIRES_OWNER', ...);
    }
  }
}
// ─────────────────────────────────────────────────────────────────────────
```

**Verifier attach point** — wrap lines 522–529 in the task-op dispatch block:

```typescript
// BEFORE modification (lines 522–529):
const isSuccess = taskResult && typeof taskResult === 'object' && (taskResult as { success?: boolean }).success;
return this.formatForCLI(taskResult, compiled.operation, isSuccess ? 'success' : 'error');

// AFTER modification — verifier runs between raw result and formatForCLI:
// (same pattern mirrors the policy guard: intercept before the return path)
const verifiedResult = await this.verifier.verify(taskResult, intent, compiled);
const isVerifiedSuccess =
  verifiedResult && typeof verifiedResult === 'object' && (verifiedResult as { success?: boolean }).success;
return this.formatForCLI(verifiedResult, compiled.operation, isVerifiedSuccess ? 'success' : 'error');
```

**Import pattern for new verifier dependency** (mirror existing import style at lines 1–65):

```typescript
import { WriteVerifier } from './verifier/WriteVerifier.js';
// Add to constructor body:
// this.verifier = new WriteVerifier(this.execJson.bind(this));
```

---

### `src/tools/unified/schemas/read-schema.ts` (MODIFIED — config, transform)

**Analog:** Same file — existing `filterFields.id` single-string pattern (lines 43–44).

**Existing single-id filter** (lines 43–44):

```typescript
const filterFields = {
  id: z.string().optional(), // Exact task ID lookup
  // ... (no ids[] array field exists today — confirmed gap)
```

**New ids[] addition pattern** (D-13 — mirrors the existing `id` entry):

```typescript
const filterFields = {
  id: z.string().optional(),       // Existing — single-id lookup
  ids: z.array(z.string()).min(1).max(200).optional(), // NEW — batch read-back (D-13, D-16)
  // ... rest of filterFields unchanged
```

**FILTER_FIELD_NAMES auto-update** (line 107 — no manual change needed):

```typescript
// This line auto-picks up the new 'ids' key from filterFields — no edit needed:
export const FILTER_FIELD_NAMES = Object.keys(filterFields) as readonly string[];
```

---

### `src/tools/unified/OmniFocusReadTool.ts` (MODIFIED — controller, request-response)

**Analog:** Same file — `inputSchema` override at lines 228–292 and `executeIdLookup` at lines 472–529.

**inputSchema override structure** (lines 228–292 — the hand-crafted MCP advertisement):

```typescript
override get inputSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      query: {
        type: 'object',
        properties: {
          // ... existing fields ...
          filters: { type: 'object' },  // <-- currently just 'object', no properties advertised
          // dual-schema invariant: add ids under filters in the inputSchema override
        },
        required: ['type'],
      },
    },
    required: ['query'],
  };
}
```

**ids[] inputSchema addition** (D-13 — mirrors the existing compact object description):

```typescript
// The filters property in inputSchema expands to advertise ids[]:
filters: {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Exact single task ID lookup' },
    ids: {
      type: 'array',
      items: { type: 'string' },
      description: 'Fetch multiple tasks by id (for write verification batch read-back). Max 200 per call.',
    },
  },
},
```

**executeIdLookup cache-bypass confirmation** (lines 472–529 — no cache.get() call; from_cache always false):

```typescript
private async executeIdLookup(filter: TaskFilter, fields: string[] | undefined, timer: OperationTimerV2): Promise<unknown> {
  const idFields = resolveEffectiveTaskFields(fields, true);
  const script = buildListTasksScriptV4({ filter, fields: idFields, limit: 1 });
  const result = await this.execJson(script);   // direct — no cache
  // ...
  return createTaskResponseV2('tasks', projectedTasks, {
    ...timer.toMetadata(),
    from_cache: false,  // always false for id lookups
    mode: 'id_lookup',
  });
}
// WriteVerifier must call execJson directly (injected dependency), not route through
// the full OmniFocusReadTool.executeValidated() — that path is cached for list queries.
```

---

### `src/utils/response-format.ts` (MODIFIED — utility, transform)

**Analog:** Same file — `StandardMetadataV2`, `createErrorResponseV2`, `createSuccessResponseV2`.

**StandardMetadataV2 open index signature** (lines 93–113 — no type change needed for verification_status):

```typescript
export interface StandardMetadataV2 {
  operation: string;
  timestamp: string;
  from_cache: boolean;
  query_time_ms?: number;
  total_count?: number;
  returned_count?: number;
  has_more?: boolean;
  query_type?: string;
  filters_applied?: Record<string, unknown>;
  // Open index — new fields like verification_status write directly without type change:
  [key: string]: string | number | boolean | undefined | null | Record<string, unknown> | unknown[];
}
// Pattern to add verification_status to any existing metadata object:
// (metadata as StandardMetadataV2)['verification_status'] = 'verified'; // | 'unverified' | 'skipped'
```

**createErrorResponseV2 signature** (lines 488–512 — the exact function to call for WRITE_UNVERIFIED_MISMATCH):

```typescript
export function createErrorResponseV2<T = unknown>(
  operation: string, // 'omnifocus_write'
  errorCode: string, // 'WRITE_UNVERIFIED_MISMATCH' | 'VERIFY_READBACK_FAILED'
  message: string,
  suggestion?: string,
  details?: unknown,
  metadata: Partial<StandardMetadataV2> = {},
): StandardResponseV2<T> {
  return {
    success: false,
    data: {} as T,
    metadata: { operation, timestamp: new Date().toISOString(), from_cache: false, ...metadata },
    error: { code: errorCode, message, suggestion, details },
  };
}
```

**New error code constants to add** (D-02 — pattern mirrors existing code strings used inline):

```typescript
// Add as exported string constants (or to a companion error-codes.ts):
export const ERROR_CODE_WRITE_UNVERIFIED_MISMATCH = 'WRITE_UNVERIFIED_MISMATCH';
export const ERROR_CODE_VERIFY_READBACK_FAILED = 'VERIFY_READBACK_FAILED';
// These are used as the errorCode argument to createErrorResponseV2.
// Existing codes like 'POLICY_DENY_DELETE' are currently passed as inline strings —
// this phase can either follow that inline convention or introduce named constants; both work.
```

---

### `tests/unit/tools/unified/verifier/WriteVerifier.test.ts` (NEW — test)

**Analog:** `tests/unit/tools/write-tool-policy-guard.test.ts` — the Phase 2 policy-guard unit tests.

**Test structure pattern** (from write-tool-policy-guard.test.ts lines 1–98):

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OmniFocusWriteTool } from '../../../src/tools/unified/OmniFocusWriteTool.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';

function createMockCache(): CacheManager {
  return {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
    invalidateForTaskChange: vi.fn(),
    invalidateProject: vi.fn(),
    invalidateTag: vi.fn(),
    invalidateTaskQueries: vi.fn(),
    clear: vi.fn(),
  } as unknown as CacheManager;
}

function makeTool(): OmniFocusWriteTool {
  const cache = createMockCache();
  const tool = new OmniFocusWriteTool(cache);
  // Mock execJson so no JXA dispatch happens (policy guard / verifier fires before any real execJson call)
  vi.spyOn(tool as unknown as Record<string, unknown>, 'execJson').mockResolvedValue(undefined);
  return tool;
}
```

**Role environment variable pattern** (from write-tool-policy-guard.test.ts lines 52–68):

```typescript
describe('...', () => {
  let tool: OmniFocusWriteTool;
  const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];

  beforeEach(() => {
    delete process.env['OMNIFOCUS_MCP_ROLE']; // agent (fail-safe default)
    tool = makeTool();
  });

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env['OMNIFOCUS_MCP_ROLE'];
    } else {
      process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
    }
  });
```

**Batch-parity test pattern** (from write-tool-policy-guard.test.ts lines 52–98 — the OMN-119 lesson):

```typescript
// The existing batch-parity test confirms single/batch/bulk_delete all produce POLICY_DENY_DELETE.
// The verifier's batch-parity test mirrors this: single create and batch create both get
// verification_status: 'verified' in response metadata. Copy the three-variant structure:
describe('batch-parity — OMN-119 lesson (verifier)', () => {
  it('single task create → verification_status: verified', async () => { ... });
  it('batch [task create] → all items have verification_status: verified', async () => { ... });
});
```

**execJson mock for read-back** (from OmniFocusWriteTool.test.ts lines 43–44):

```typescript
// To simulate a successful read-back in WriteVerifier tests:
execJsonSpy = vi.fn();
vi.spyOn(tool as any, 'execJson').mockImplementation(execJsonSpy);
// First call → mutation success; second call → read-back success (or failure, for VERIFY_READBACK_FAILED test)
execJsonSpy
  .mockResolvedValueOnce(createScriptSuccess({ ok: true, v: '3', data: { id: 'task-abc', name: 'Buy milk' } }))
  .mockResolvedValueOnce(createScriptSuccess({ tasks: [{ id: 'task-abc', name: 'Buy milk', flagged: true }] }));
```

---

### `tests/unit/tools/unified/verifier/field-comparator.test.ts` (NEW — test)

**Analog:** `tests/unit/tools/unified/OmniFocusWriteTool.test.ts` — pure unit test structure with no OmniFocus
connection.

**Test structure pattern** (from OmniFocusWriteTool.test.ts lines 1–26):

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// No OmniFocus connection needed — field-comparator.ts is pure TypeScript.
// Import the comparator registry directly:
import { compareField, ComparatorRegistry } from '../../../../src/tools/unified/verifier/field-comparator.js';
```

**Per-field test coverage required** (from RESEARCH.md Validation Architecture):

```typescript
// Each comparator variant needs its own test:
describe('date comparator', () => {
  it('exact match passes', ...);
  it('within 60s passes', ...);
  it('outside 60s fails', ...);
  it('missing-field (absent in read-back) fails', ...);  // D-08 absent-field hard fail
});
describe('tag comparator', () => {
  it('same set different order passes', ...);
  it('subset fails', ...);
  it('absent tags key fails', ...);       // distinct from empty array
});
describe('scalar comparator', () => {
  it('null/undefined/"" all unify as unset', ...);
  it('estimatedMinutes 60.9 rounds to 61 for comparison', ...);
  it('flagged "true" (string from bridge coercion) coerces to true', ...);
  it('note trailing whitespace trimmed before compare', ...);
});
```

---

### `tests/integration/tools/write-verifier.test.ts` (NEW — test)

**Analog:** `tests/integration/tools/unified/field-roundtrip.test.ts` — live OmniFocus round-trip test structure.

**Server spawn + MCP client pattern** (from field-roundtrip.test.ts lines 33–90):

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { expectOk } from '../../helpers/expect-ok.js';
import { assertFieldPersisted } from '../../helpers/assert-field-persisted.js';
import { SANDBOX_FOLDER_NAME, ensureSandboxFolder, fullCleanup } from '../../helpers/sandbox-manager.js';

describe('WriteVerifier integration', () => {
  let serverProcess: ChildProcess;

  async function sendRequest(request: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestStr = JSON.stringify(request) + '\n';
      // ... stdio MCP client pattern (copy from field-roundtrip.test.ts lines 66–90)
    });
  }
```

**Sandbox discipline** (from field-roundtrip.test.ts — fixture naming and cleanup):

```typescript
// All test entities must use sandbox prefixes to avoid cross-run contamination.
// See: SANDBOX_FOLDER_NAME, ensureSandboxFolder, fullCleanup, runScopedName.
const VERIFY_TASK_NAME = runScopedName(`VERIFY_${Date.now()}`);
// afterAll must call fullCleanup() — leaking fixtures fails loudly (OMN-46).
```

---

## Shared Patterns

### Independent osascript Spawn (VERIFY-01)

**Source:** `src/omnifocus/OmniAutomation.ts` — the `execute()`/`execJson()` method **Apply to:** `WriteVerifier.ts`
read-back calls

```typescript
// execJson is the project-standard primitive for independent osascript spawns.
// It handles timeout, stdout parsing, and error normalization.
// WriteVerifier receives execJson as an injected dependency (never the cached tool layer):
// constructor(private readonly execJson: (script: string) => Promise<ScriptExecutionResult>) {}
```

### Error Code + Suggestion Pattern

**Source:** `src/utils/response-format.ts` lines 488–512 (`createErrorResponseV2`) **Apply to:** `WriteVerifier.ts`
mismatch and readback-failure returns

```typescript
// All error returns use createErrorResponseV2(operation, code, message, suggestion, details, metadata).
// The suggestion field is the LLM-facing recovery text — make it actionable.
// Pass originalMetadata (from the mutation response) to preserve timing context.
```

### OmniJS Property Syntax in Read-back Scripts (CRITICAL)

**Source:** `docs/dev/SETTER-PATTERNS.md` rows 6–7 + `CLAUDE.md` Quick Symptom Index **Apply to:** Any read-back script
that reads tags or parent/move relationships

```
NEVER inside evaluateJavascript: task.tags() [JXA method call syntax]
ALWAYS inside evaluateJavascript: task.tags [OmniJS property syntax]
NEVER inside evaluateJavascript: folder.parent() [JXA method call syntax]
ALWAYS inside evaluateJavascript: task.containingProject [OmniJS property syntax]
```

### Dual-Schema Invariant

**Source:** `CLAUDE.md` §"Dual-Schema Architecture" **Apply to:** Any change to `read-schema.ts` filterFields → must
also update `OmniFocusReadTool.ts` `inputSchema` override

```
Rule: if filterFields in read-schema.ts changes, the get inputSchema() override in
OmniFocusReadTool.ts MUST change in the same commit. No auto-conversion exists.
```

### Cache Bypass for Verification

**Source:** `src/tools/unified/OmniFocusReadTool.ts` lines 484 — `executeIdLookup` calls `this.execJson(script)`
directly **Apply to:** `WriteVerifier.ts` — the verifier must never route through `CacheManager.get()`

```typescript
// The read-back primitive for the verifier is execJson (injected), not
// OmniFocusReadTool.executeValidated(). The latter may serve cached task
// list results. The id-lookup path bypasses cache, but the full tool dispatch
// does not guarantee this — inject execJson directly.
```

### Timer Metadata Preservation

**Source:** `src/utils/response-format.ts` `OperationTimerV2` + all handler patterns **Apply to:** `WriteVerifier.ts` —
pass mutation's originalMetadata to error responses

```typescript
// All handlers create a timer and pass timer.toMetadata() to response factories.
// When the verifier replaces the success response with an error, it must pass
// the original mutation metadata so callers see the total timing, not just the
// verification overhead:
return createErrorResponseV2('omnifocus_write', 'WRITE_UNVERIFIED_MISMATCH', ..., originalMetadata);
```

---

## No Analog Found

No files in this phase lack a codebase analog. All new modules have either exact or role-match analogs above.

| File   | Role | Data Flow | Reason                                    |
| ------ | ---- | --------- | ----------------------------------------- |
| (none) | —    | —         | All files have sufficient analog coverage |

---

## Metadata

**Analog search scope:** `src/tools/unified/`, `src/utils/`, `tests/unit/tools/`, `tests/integration/tools/`,
`tests/integration/helpers/` **Files scanned:** 10 source + test files read in full; 4 searched via grep **Pattern
extraction date:** 2026-06-06
