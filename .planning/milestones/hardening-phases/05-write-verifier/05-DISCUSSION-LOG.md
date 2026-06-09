# Phase 5: Write-Verifier - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in
> CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-06 **Phase:** 5-write-verifier **Areas discussed:** Mismatch behavior, Diff normalization,
Verification scope, Batch & latency

Mode: advisor (research-backed comparison tables), calibration tier `minimal_decisive` (vendor philosophy =
opinionated). Four parallel `gsd-advisor-researcher` agents researched the selected areas; tables synthesized with
codebase specifics.

---

## Mismatch behavior

| Option                     | Description                                                                                                                                                                                                      | Selected |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A: mismatch=hard error     | Proven non-persisted write → `success:false` with code `WRITE_UNVERIFIED_MISMATCH`; status field carries verified/skipped; `unverified` = indeterminate read-back failure (`VERIFY_READBACK_FAILED`, retryable). | ✓        |
| B: always success + status | Never error on mismatch; report status in metadata, let JessOS decide. A proven lost write still returns `success:true`.                                                                                         |          |

**User's choice:** A **Notes:** Reconciles VERIFY-02 (fail explicitly) with VERIFY-03 (status) by scope. Owner confirmed
the refinement that `unverified` means _indeterminate_, distinct from a proven mismatch (hard error) and from `skipped`
(deliberately not run).

---

## Diff normalization

| Option                   | Description                                                                                                                                                                            | Selected |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A: canonical comparator  | Per-field-type equality (date epoch-ms ±60s, tag name-Set, normalized scalars), diff only fields the mutation set, compare against post-UTC intent; absent intended field = hard fail. | ✓        |
| A but tune tolerance     | Same approach, different date tolerance.                                                                                                                                               |          |
| B: full-entity deepEqual | Reuse existing helper as-is; guarantees false `unverified` on dates and multi-tag writes.                                                                                              |          |

**User's choice:** A (accepted ±60s default tolerance) **Notes:** Compare against the writer's post-`local→UTC`
canonical form, not raw input, so default-time rules are already baked in. Absent-field hard-fail catches the JXA
silent-no-op class.

---

## Verification scope

| Option                           | Description                                                                                                                                                                                    | Selected |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A: verify all, full batch parity | Verify every mutating agent op (incl. move + tag-assign via relationship extractors); batch verifies every item through one funnel verifier; `skipped` = closed set; owner ops → `unverified`. | ✓        |
| B: ops-only, sample batches      | Verify scalar ops, sample batches, exempt structural ops to `skipped`. Reintroduces OMN-119 divergence.                                                                                        |          |

**User's choice:** A **Notes:** Move + tag-assign are the documented silent-no-op offenders (SETTER-PATTERNS), so they
must be in scope. `skipped` kept a tiny, logged, closed set to avoid an escape hatch.

---

## Batch & latency

| Option                   | Description                                                                                                                                                               | Selected |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A: one batched read-back | Single read-back spawn per batch (fetch all affected ids in one filter query, diff in TS, chunk under script-size ceiling); mandatory for agent; owner-only opt-out flag. | ✓        |
| B: per-item spawn        | One read-back spawn per item; 50-item batch becomes a serial latency cliff.                                                                                               |          |

**User's choice:** A **Notes:** Needs a read-back-by-id-set read path (single-id filter exists today). No debounce / no
inter-batch batching — no transaction boundary across spawns. Chunk huge id lists under the 261KB OmniJS / 523KB JXA
ceiling.

---

## Claude's Discretion

- Exact module layout for the verifier + field-comparator registry (must attach at `executeValidated()`, shared by
  single + batch).
- Precise id-count chunking threshold for the batched read-back (measure against the script-size guard).
- Whether to generalize `tests/integration/helpers/assert-field-persisted.ts` into the production verifier or build
  fresh from its pattern.

## Deferred Ideas

None — discussion stayed within phase scope. Atomic multi-write transactions remain Out of Scope; the verifier reports
per-item outcomes, it does not roll back a batch. </content>
