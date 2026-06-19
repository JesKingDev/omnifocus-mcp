---
phase: 02-capture-permission-gating
plan: '03'
subsystem: lineage-stamp-gate-dispatch
tags:
  - wave-3
  - line-01
  - perm-02
  - d-06
  - d-09
  - d-10
  - d-11
  - dual-schema
dependency_graph:
  requires:
    - '02-02: Mode type + parseMode() + session-state singleton + grant bypass'
    - '02-01: Wave 0 RED test scaffolds'
  provides:
    - composeLineageStamp() helper with LINEAGE_RE (LINE-01, D-09/D-10)
    - LineageSchema Zod type + lineage field on CreateDataSchema (D-11)
    - lineage in OmniFocusWriteTool inputSchema override (dual-schema rule)
    - POLICY_GATE_CAPTURE_CONFIRM gate verdict for interactive agent creates (PERM-02)
    - POLICY_GATE_BACKGROUND_ONLY gate verdict for background agent creates (T-02-08)
    - agent-ok tag unconditionally stamped on agent creates with lineage (D-06)
    - Stamp composition before extractIntent() — Pitfall 4 guard closed
  affects:
    - '02-04: Wave 4 integration + predicate + human checkpoint'
tech_stack:
  added: []
  patterns:
    - 'Strip-before-reappend lineage block (dotAll regex, D-10 idempotency)'
    - 'Upstream field consumption pattern (lineage consumed before script builder, Pitfall 3)'
    - 'Mode-aware gate fork (interactive → CAPTURE_CONFIRM, background → BACKGROUND_ONLY, structural → REQUIRES_OWNER)'
    - 'SCHEMA_UPSTREAM_FIELDS exclusion in parity test (fields consumed before builder)'
    - 'Direct session-state manipulation in tests (setAllowAllThisSession vs. vi.doMock for ESM)'
key_files:
  created:
    - src/contracts/ast/lineage.ts
  modified:
    - src/tools/unified/schemas/write-schema.ts
    - src/tools/unified/OmniFocusWriteTool.ts
    - tests/unit/tools/unified/OmniFocusWriteTool.test.ts
    - tests/unit/tools/unified/verifier/WriteVerifier.test.ts
    - tests/unit/architecture/schema-impl-parity.test.ts
decisions:
  - 'LineageSchema advertised as bare { type: object } in inputSchema to stay under 4KB MCP advertisement limit'
  - 'SCHEMA_UPSTREAM_FIELDS exclusion added to schema-impl-parity test for fields intentionally consumed upstream of
    buildCreateTaskScript'
  - 'PERM-02 bypass test uses direct setAllowAllThisSession() — vi.doMock does not intercept ESM static bindings after
    module load'
  - 'WriteVerifier LINE-01 test passes empty intent to force extractIntent(compiledOp) extraction — fixes
    intent/readBack name mismatch in Wave 0 test design'
  - 'agent-ok tag appended unconditionally when role=agent + lineage present (both interactive and background paths,
    D-08b)'
metrics:
  duration: '~35 minutes'
  completed_date: '2026-06-12'
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 5
---

# Phase 02 Plan 03: Wave 3 — Lineage Stamp + Gate Dispatch Summary

Composes the write-path lineage stamp, adds the dual-schema wiring (Zod + inputSchema), and dispatches mode-aware gate
verdicts. LINE-01, PERM-02, and D-06 all land in a single executeValidated() pass.

## TL;DR

```mermaid
flowchart TD
    A["agent create (task)"] --> B{isAllowedAllThisSession?}
    B -- yes --> C[Execute]
    B -- no --> D{parseMode()}
    D -- interactive --> E[POLICY_GATE_CAPTURE_CONFIRM]
    D -- background --> F[POLICY_GATE_BACKGROUND_ONLY]
    C --> G{lineage in args?}
    G -- yes --> H[composeLineageStamp → data.note]
    H --> I[append agent-ok to data.tags]
    I --> J[handleTaskCreate]
    G -- no --> J

    classDef gate fill:#fff9c4,stroke:#f9a825
    classDef exec fill:#c8e6c9,stroke:#388e3c
    classDef new fill:#e3f2fd,stroke:#1565c0

    class E,F gate
    class C,J exec
    class H,I new
```

## What Was Built

| Artifact                               | File                                        | What it provides                                                                                                             |
| -------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `composeLineageStamp()` + `LINEAGE_RE` | `src/contracts/ast/lineage.ts`              | Strip-before-reappend stamp (D-09/D-10); dotAll regex for Phase 5 archaeology                                                |
| `LineageSchema` + `LineageInput`       | `src/tools/unified/schemas/write-schema.ts` | Strict Zod schema; `lineage.optional()` on CreateDataSchema (D-11)                                                           |
| `lineage` in `inputSchema`             | `src/tools/unified/OmniFocusWriteTool.ts`   | MCP advertisement — bare `{ type: 'object' }` to stay under 4KB limit                                                        |
| Mode-aware gate fork                   | `src/tools/unified/OmniFocusWriteTool.ts`   | POLICY_GATE_CAPTURE_CONFIRM (interactive), POLICY_GATE_BACKGROUND_ONLY (background), POLICY_GATE_REQUIRES_OWNER (structural) |
| Stamp composition + agent-ok tag       | `src/tools/unified/OmniFocusWriteTool.ts`   | composeLineageStamp before extractIntent; agent-ok tag appended (D-06)                                                       |

## Test State After Wave 3

| Test location                              | Before | After | Notes                                             |
| ------------------------------------------ | ------ | ----- | ------------------------------------------------- |
| `lineage-stamp.test.ts` (4 tests)          | RED    | GREEN | All 4 stamp/idempotency tests pass                |
| `OmniFocusWriteTool.test.ts` PERM-02 block | RED    | GREEN | POLICY_GATE_CAPTURE_CONFIRM + grant bypass        |
| `WriteVerifier.test.ts` LINE-01 round-trip | RED    | GREEN | Note comparison passes; Pitfall 4 guard confirmed |
| `agent-ok-predicate.test.ts` (4 tests)     | RED    | RED   | Expected — Wave 4 (PERM-01 predicate)             |
| All previously passing tests               | GREEN  | GREEN | No regression (2392 passed)                       |

## Commits

| Hash       | Message                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------- |
| `feccc463` | feat(02-03): create lineage.ts with composeLineageStamp() and LINEAGE_RE (LINE-01, D-09/D-10) |
| `1a5ae9e8` | feat(02-03): add LineageSchema, gate dispatch (PERM-02), agent-ok stamp (D-06/D-11)           |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] schema-impl-parity test failed for lineage field**

- **Found during:** Task 2 (test run)
- **Issue:** The parity test `tests/unit/architecture/schema-impl-parity.test.ts` iterates over all CreateDataSchema
  fields and asserts each is referenced in mutation-script-builder.ts. `lineage` was added to CreateDataSchema but
  intentionally NOT passed to the script builder (Pitfall 3). The test failed with "CreateDataSchema accepts 'lineage'
  but mutation-script-builder never reads it."
- **Fix:** Added `SCHEMA_UPSTREAM_FIELDS = ['lineage']` exclusion array and a guard in the forward parity loop — fields
  in this array are skipped because they are consumed upstream, not silently dropped. Documented the exclusion with
  Pitfall 3 citation.
- **Files modified:** `tests/unit/architecture/schema-impl-parity.test.ts`
- **Commit:** `1a5ae9e8`

**2. [Rule 1 - Bug] inputSchema exceeded 4KB size limit**

- **Found during:** Task 2 (test run)
- **Issue:** Adding a fully-described lineage object (with property descriptions for sessionId/agent/createdAt and
  required array) pushed the minified inputSchema to 4143 bytes, failing the `< 4000` constraint.
- **Fix:** Simplified lineage advertisement to bare `{ type: 'object' }` with a comment. The Zod schema (server-side)
  still enforces the full strict shape with required sessionId.
- **Files modified:** `src/tools/unified/OmniFocusWriteTool.ts`
- **Commit:** `1a5ae9e8`

**3. [Rule 1 - Bug] PERM-02 bypass test used vi.doMock which does not intercept ESM static bindings**

- **Found during:** Task 2 (test run)
- **Issue:** The Wave 0 test used `vi.doMock('...session-state.js', factory)` to mock `isAllowedAllThisSession`. In
  Vitest with ESM, `vi.doMock` cannot intercept already-loaded module bindings — the static import in
  OmniFocusWriteTool.ts is already resolved at module load time.
- **Fix:** Replaced the `vi.doMock` approach with direct `setAllowAllThisSession('owner')` / `resetSessionGrant()`
  calls, which mutate the actual module-level singleton that the production code reads.
- **Files modified:** `tests/unit/tools/unified/OmniFocusWriteTool.test.ts`
- **Commit:** `1a5ae9e8`

**4. [Rule 1 - Bug] WriteVerifier LINE-01 test had mismatched intent/readBack names**

- **Found during:** Task 2 (test run)
- **Issue:** The Wave 0 test passed `makeIntent({ note: composedNote })` =
  `{ name: 'Buy milk', flagged: true, note: composedNote }` as the intent, but the readBack task had `name: 'T'`. This
  triggered WRITE_UNVERIFIED_MISMATCH on `name` and `flagged` — not from the note comparison the test was guarding.
- **Fix:** Changed the intent param to `{}` so `verifier.verify()` falls back to `extractIntent(compiledOp)`, which
  extracts `{ name: 'T', note: composedNote }` from the compiled op. Both name and note now match the readBack.
- **Files modified:** `tests/unit/tools/unified/verifier/WriteVerifier.test.ts`
- **Commit:** `1a5ae9e8`

## Known Stubs

None — all lineage and gate logic is wired. The `agent-ok` predicate (PERM-01) remains unimplemented in
`src/contracts/filters.ts` — intentionally deferred to Wave 4 (02-04).

## Threat Flags

No new trust surfaces introduced beyond what the threat model in 02-03-PLAN.md covers.

| Flag                                | File                                        | Description                                                                                   |
| ----------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| threat_flag: strict-schema-upstream | `src/tools/unified/schemas/write-schema.ts` | LineageSchema.strict() prevents unknown key injection into the note block (T-02-04 mitigated) |

## Self-Check: PASSED

Files exist:

- `src/contracts/ast/lineage.ts` — FOUND (exports LINEAGE_RE, composeLineageStamp)
- `src/tools/unified/schemas/write-schema.ts` — FOUND (LineageSchema + lineage on CreateDataSchema)
- `src/tools/unified/OmniFocusWriteTool.ts` — FOUND (POLICY_GATE_CAPTURE_CONFIRM, POLICY_GATE_BACKGROUND_ONLY, agent-ok,
  composeLineageStamp wiring)

Commits exist:

- `feccc463` — FOUND
- `1a5ae9e8` — FOUND

Key grep checks passed:

- `grep "LINEAGE_RE" src/contracts/ast/lineage.ts | grep "/s"` — FOUND
- `grep "POLICY_GATE_CAPTURE_CONFIRM" src/tools/unified/OmniFocusWriteTool.ts` — FOUND
- `grep "POLICY_GATE_BACKGROUND_ONLY" src/tools/unified/OmniFocusWriteTool.ts` — FOUND
- `grep "agent-ok" src/tools/unified/OmniFocusWriteTool.ts` — FOUND
- `grep "lineage" src/contracts/ast/mutation-script-builder.ts` — 0 results (correct)
- `grep "LineageSchema" src/tools/unified/schemas/write-schema.ts` — FOUND
