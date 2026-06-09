---
phase: '05-write-verifier'
plan: '02'
subsystem: 'verifier'
tags: ['write-verifier', 'field-comparator', 'intent-extractor', 'wave-1a']
dependency_graph:
  requires:
    - '05-01'
  provides:
    - 'src/tools/unified/verifier/field-comparator.ts'
    - 'src/tools/unified/verifier/intent-extractor.ts'
    - 'src/utils/response-format.ts (WRITE_UNVERIFIED_MISMATCH, VERIFY_READBACK_FAILED)'
  affects:
    - 'src/tools/unified/verifier/WriteVerifier.ts (Wave 1B imports compareField, extractIntent)'
tech_stack:
  added: []
  patterns:
    - 'per-field-type comparator registry (registry map dispatch)'
    - 'D-08 absent-field hard fail via Object.prototype.hasOwnProperty.call'
    - 'duck-typed op-class dispatch for intent and id extraction'
key_files:
  created: []
  modified:
    - 'src/tools/unified/verifier/field-comparator.ts'
    - 'src/tools/unified/verifier/intent-extractor.ts'
    - 'src/utils/response-format.ts'
decisions:
  - 'compareField receives full intent/readBack objects (not scalar values) — D-08 absent-field rule requires
    hasOwnProperty check on the container object'
  - 'isAbsentOrUndefined covers both missing key and present-but-undefined value — matches D-08 "absent from read-back"
    semantics'
  - 'extractIntent for batch returns {} — per-item dispatch is the batch verifier responsibility'
metrics:
  duration: '304s'
  completed_date: '2026-06-08'
  tasks_completed: 2
  files_modified: 3
---

# Phase 05 Plan 02: Field Comparator and Intent Extractor (Wave 1A) Summary

Per-field-type comparator registry and intent/id extractor implemented in pure TypeScript — the computational core of
the verifier, fully tested in isolation before WriteVerifier is wired.

## What Was Built

**Task 1: `src/tools/unified/verifier/field-comparator.ts`**

Replaces the `not-implemented` stub with a full comparator registry:

- DATE fields (`dueDate`, `deferDate`, `plannedDate`, `completionDate`): epoch-ms comparison with 60 000 ms tolerance
  (D-08); absent readBack key when intent is non-null produces `'mismatch'`.
- TAG field (`tags`): case-insensitive Set-of-names comparison; order-independent; absent readBack key produces
  `'mismatch'`.
- SCALAR fields (`name`, `note`, `flagged`, `sequential`, `estimatedMinutes`): null/undefined/empty-string unified as
  unset; `estimatedMinutes` rounded to integer; `flagged`/`sequential` coerced through `normalizeBooleanInput`; `note`
  trimmed before compare.
- TYPED-CLASS field (`reviewInterval`): JSON-structure comparison via `JSON.stringify` equality.
- UNKNOWN fallback: strict `===`; absent readBack key when intent is non-null produces `'mismatch'`.

The D-08 absent-field hard fail uses `Object.prototype.hasOwnProperty.call(readBackObj, key)` to distinguish a missing
key from a key present with `undefined` value — both produce `'mismatch'` when intent is non-null.

**Task 2: `src/tools/unified/verifier/intent-extractor.ts`**

Replaces both stubs with real implementations:

- `extractIntent`: duck-types `compiledOp.operation` + `compiledOp.target` to return only the fields the caller intended
  to set (D-06). Handles task create (picks non-nullish from `data`), task update (returns `changes` as-is), task
  complete (`{ completionDate, status: 'completed' }`), project create (`data` spread), folder create
  (`{ name, parentFolder }`), batch (returns `{}` for per-item dispatch). Unrecognized op returns `{}` (T-05-02-02
  safe).
- `extractAffectedIds`: duck-types mutation result to collect ids from `metadata.created_id`, `metadata.updated_id`,
  `metadata.completed_id`, `data.project.id`, `data.folder.folderId`, batch `data.tempIdMapping` values, and
  `data.results` item `id` fields.

**`src/utils/response-format.ts`**

Two exported string constants added (D-02):

- `WRITE_UNVERIFIED_MISMATCH` — write claimed success but read-back proves it did not persist.
- `VERIFY_READBACK_FAILED` — read-back round-trip could not complete (indeterminate/retryable).

## Verification Results

| Check                                                               | Result                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `field-comparator.test.ts` (16 tests)                               | PASS — all GREEN                                                    |
| `npm run test:unit` pre-existing tests                              | PASS — 2355 passing, 11 failing (WriteVerifier stubs, expected RED) |
| `npm run build`                                                     | PASS — zero TypeScript errors                                       |
| `grep -c 'WRITE_UNVERIFIED_MISMATCH' src/utils/response-format.ts`  | 1 (present)                                                         |
| `grep -c 'not implemented' field-comparator.ts intent-extractor.ts` | 0 (no stubs remain)                                                 |

## Deviations from Plan

None — plan executed exactly as written.

The 11 failing WriteVerifier tests are the intentional RED gate from Plan 05-01 (Wave 0). They remain RED until Plan
05-04 implements `WriteVerifier.verify()`.

## Commits

| Task   | Commit    | Description                                                                       |
| ------ | --------- | --------------------------------------------------------------------------------- |
| Task 1 | `6d7a546` | feat(05-02): implement field-comparator registry (D-05, D-08)                     |
| Task 2 | `15a6e6c` | feat(05-02): implement intent-extractor and add verification error code constants |

## Known Stubs

| File                                          | Stub                              | Reason                          |
| --------------------------------------------- | --------------------------------- | ------------------------------- |
| `src/tools/unified/verifier/WriteVerifier.ts` | `verify()` throws not-implemented | Wave 1B (Plan 05-04) implements |

No stubs remain in the files this plan owned. The WriteVerifier stub is from Plan 05-01 and is owned by Plan 05-04.

## Self-Check: PASSED

All files verified to exist. All commit hashes verified in git log.
