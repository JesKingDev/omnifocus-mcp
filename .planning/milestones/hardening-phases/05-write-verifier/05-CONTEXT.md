# Phase 5: Write-Verifier - Context

**Gathered:** 2026-06-06 **Status:** Ready for planning

<domain>
## Phase Boundary

After every AGENT mutation, an **independent post-mutation read-back round-trip** confirms the change persisted,
performs a **field-level diff** against the intended change, and reports a **verification status** so JessOS can trust
that writes actually landed. This is the phase that defends against the known silent-write-failure risk in the
JXA→OmniJS bridge (a write returns `success` but nothing persisted).

Locked by requirements **VERIFY-01, VERIFY-02, VERIFY-03** (see REQUIREMENTS.md). Discussion settled HOW to implement
these — not WHETHER.

**Carried forward (locked in prior phases / project decisions — do not re-litigate):**

- Verification is a **separate `osascript` round-trip**, never an in-script read of the same execution (cross-cutting
  project decision + VERIFY-01).
- Enforcement attaches at the **single mutation funnel** — `OmniFocusWriteTool.executeValidated()` — where single and
  batch ops are normalized, the same place the Phase 2 policy guard lives. A **batch-parity test is mandatory** (the
  OMN-119 lesson).
- READ-02 lookup-by-identifier is the read-back primitive and is already shipped.

</domain>

<decisions>
## Implementation Decisions

### Mismatch Behavior (status semantics + API contract)

- **D-01:** A **proven mismatch** (read-back confirms the intended field did NOT persist) returns the **`error`
  variant** of `StandardResponseV2` (`success: false`) — never a success-shaped envelope. A silent no-op write must
  surface as a failure the caller cannot mistake for success. This is the literal point of the phase.
- **D-02:** Use **two distinct error codes** so the agent can distinguish recoverable from non-recoverable:
  `WRITE_UNVERIFIED_MISMATCH` (write claimed success but read-back proves it did not persist — do NOT retry blindly) vs
  `VERIFY_READBACK_FAILED` (the read-back round-trip itself could not complete — transport/timeout, indeterminate,
  retryable).
- **D-03:** Reconcile VERIFY-02 and VERIFY-03 by **scope**: VERIFY-02's "fails explicitly on mismatch" governs the
  proven-mismatch case (hard error, D-01). VERIFY-03's status set is carried in response **metadata** for the
  non-failure cases.
- **D-04:** Status set semantics:
  - `verified` — read-back ran and confirmed the change (success envelope).
  - `skipped` — verification deliberately not run (closed, audited set — see D-09).
  - `unverified` — read-back round-trip could not complete (indeterminate). Pairs with the `VERIFY_READBACK_FAILED`
    error code. **Note:** this refines VERIFY-03's plain "unverified" to mean _indeterminate_, distinct from _proven
    mismatch_ (which is a hard error) — confirmed with owner during discussion.

### Diff Normalization

- **D-05:** Use a **per-field-type canonical comparator** (small registry), not a naive whole-entity `deepEqual`. Naive
  deepEqual guarantees false `unverified` on every date and multi-tag write.
- **D-06:** **Scope the diff to only the fields the mutation intended to set** (iterate the keys of the typed
  intended-change object, e.g. `createArgs`). Never diff app-derived fields (id, modified-date, computed status,
  inherited tags) — they manufacture spurious mismatches and are outside "did my write persist."
- **D-07:** Compare against **intent in the same canonical form the writer produced** — i.e. the post-`local→UTC` `Date`
  from `src/utils/timezone.ts`, not raw user input. Default-time rules (due 5pm, defer 8am, completion noon) are already
  applied upstream, so they are a non-issue at compare time.
- **D-08:** Per-field-type equality rules:
  - **Dates:** compare as epoch-ms with a **±60s tolerance** (absorbs OmniFocus second-level rounding + write/read-back
    skew; still catches a wrong hour/day).
  - **Tags:** compare as a **`Set` of names** after normalizing the read-back shape (map tag objects/ids back to names;
    order is not meaningful).
  - **Scalars:** type-appropriate normalization — `estimatedMinutes` rounded to integer, `flagged`/`sequential` coerced
    to bool, `note` trimmed of trailing whitespace, `null`/`undefined`/empty-string all treated as the same "unset".
  - **Absent field:** a field present in intent but **absent from the read-back is a hard fail** (the JXA-tag-assign /
    silent-no-op class — exactly what this verifier must catch).

### Verification Scope

- **D-09:** **Verify every mutating AGENT op** — create, update (including defer/reschedule and flag), complete, tag
  assignment, task move, project ops, folder create, and tag*manage. Move and tag-assign are the \_documented*
  silent-no-op offenders (SETTER-PATTERNS rows 6–7), so they are explicitly in scope and get a **relationship-shaped
  read-back extractor** rather than a scalar compare.
- **D-10:** **Batch verifies every item**, routed through the same per-item verifier the single path uses, at the
  `executeValidated()` funnel. No sampling — sampling reintroduces the OMN-119 single/batch divergence. The shared
  funnel is what makes the mandatory batch-parity test meaningful.
- **D-11:** **`skipped` is a deliberately tiny, closed, logged set:** dry-runs (no write happened) and the rare op whose
  effect has no cheap readable post-state. Nothing else. Log every `skipped` so the bucket stays auditable rather than
  becoming an escape hatch.
- **D-12:** **Owner-role mutations sit outside the verify mandate** (only AGENT must be verified). Report owner ops as
  `unverified` (verification not attempted) — NOT `skipped` (deliberately waived) — to keep the status set semantically
  honest.

### Batch & Latency

- **D-13:** For a batch, do **one batched read-back spawn per batch**: collect all affected ids, fetch them in a
  **single filter-by-id-set query**, and diff in TypeScript. Per-item spawns turn a 50-item batch into a serial latency
  cliff (each `osascript` spawn carries hundreds of ms fixed overhead) for zero correctness gain. The single-item path
  is the N=1 degenerate case of this.
- **D-14:** Verification is **mandatory and always-on for the agent path** — no agent opt-out. The "every agent mutation
  verified" constraint permits relaxation **only for the owner role**, so the lone opt-out flag belongs there and
  nowhere else.
- **D-15:** **No debounce, no cross-call (inter-batch) batching** of the read-back — there is no transaction boundary
  across spawns, so deferring verification past the mutation's own funnel call would let an unverified write escape.
  Batching is **intra-batch only** (one query for the whole batch), synchronous within the funnel call.
- **D-16:** A very large id list can push the read-back filter script toward the **OmniJS 261KB / JXA 523KB** ceiling.
  The funnel must **chunk the id set into sub-spawns above a safe id-count threshold** — still O(batches) spawns, not
  O(items).

### Claude's Discretion

- Exact module layout for the verifier and the field-comparator registry (planner/researcher to decide), provided it
  attaches at `executeValidated()` and is shared by single + batch paths.
- The precise id-count chunking threshold for D-16 (measure against the script-size guard).
- Whether to generalize the existing `tests/integration/helpers/assert-field-persisted.ts` round-trip into the
  production verifier or build fresh from its pattern.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap

- `.planning/REQUIREMENTS.md` §"Write Verification" — VERIFY-01/02/03, the locked requirements for this phase.
- `.planning/ROADMAP.md` §"Phase 5: Write-Verifier" — goal + success criteria.
- `.planning/PROJECT.md` §Constraints — "every agent mutation must be write-verified — silent-write-failure is a known
  bridge risk."

### Mutation funnel & response envelope (attach points)

- `src/tools/unified/OmniFocusWriteTool.ts` — `executeValidated()` is the single funnel; the Phase 2 policy guard block
  at its top is the placement precedent. Single-op handlers
  (`handleTaskCreate`/`handleTaskUpdate`/`handleTaskComplete`), batch router, and project handler all return through
  here.
- `src/utils/response-format.ts` — `StandardResponseV2` success|error envelope + `StandardMetadataV2`; add the
  verification status to metadata and the new error codes here.
- `src/tools/response-types-v2.ts` — operation response types.

### Diff normalization

- `src/utils/timezone.ts` — the `local→UTC` conversion that defines the canonical date form both sides must share
  (D-07).
- `docs/dev/SETTER-PATTERNS.md` — rows defining which field-types take which write path; the silent-no-op rows (1, 6–7)
  are the cases the absent-field hard-fail rule (D-08) and relationship extractors (D-09) must catch.
- `tests/integration/helpers/assert-field-persisted.ts` — existing round-trip read-back helper; its `deepEqual` is the
  naive comparator to replace with the per-field-type registry. Proof that a generic read-back is viable.

### Read-back primitive

- `src/tools/unified/schemas/read-schema.ts` — single-`id` filter exists today; a read-back-by-id-**set** path (D-13)
  needs wiring.
- `src/tools/unified/OmniFocusReadTool.ts` — lookup-by-identifier (READ-02), the read-back query.
- `src/omnifocus/OmniAutomation.ts` — `spawn('osascript')` round-trip whose fixed cost drives the batched-read-back
  decision (D-13); script-size guard for D-16.

### Batch

- `src/tools/unified/schemas/batch-schemas.ts` + the batch router in `OmniFocusWriteTool.ts` — where the single batched
  read-back and the mandatory parity test attach (D-10).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `tests/integration/helpers/assert-field-persisted.ts` — proven independent read-back round-trip pattern; generalize
  into the production verifier (or build from its shape).
- `src/utils/timezone.ts` `local→UTC` conversion — already produces the canonical date form for diff comparison.
- READ-02 lookup-by-identifier (`OmniFocusReadTool`) — the read-back query primitive, already shipped and role-allowed
  for the agent.
- Phase 2 policy-guard block in `executeValidated()` — the placement + single/batch-normalization precedent the verifier
  mirrors.

### Established Patterns

- **Single mutation funnel:** all mutations (single, batch, project) normalize through `executeValidated()`; both
  deny-deletes (Phase 2) and now write-verification attach here. Batch-parity test is the mandatory guard against
  single/batch drift (OMN-119).
- **Discriminated response envelope:** `StandardResponseV2` success|error; errors are returned (not thrown) with a
  code + recovery text. New verification statuses/codes extend this.
- **Independent round-trip discipline:** verification reads must be a fresh `osascript` spawn, never an in-script read —
  non-negotiable project invariant.
- **Dual-schema invariant:** if the read-back-by-id-set work touches a tool's Zod schema, the hand-crafted `inputSchema`
  override must change in the same commit (see CLAUDE.md).

### Integration Points

- Verifier wraps the post-success return path of each handler at the `executeValidated()` funnel.
- Read-back issues an independent query via the read layer (new by-id-set filter path).
- Status surfaces in `StandardMetadataV2`; mismatch surfaces as the `error` envelope with the new codes.

</code_context>

<specifics>
## Specific Ideas

- Date tolerance fixed at **±60s** (D-08) — owner accepted the default after it was offered as a tunable.
- Status vocabulary refinement (D-04): `unverified` = _indeterminate read-back failure_, proven mismatch = _hard error_.
  Owner explicitly confirmed this reinterpretation of VERIFY-03's plain "unverified."

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Atomic multi-write transactions remain explicitly Out of Scope per
REQUIREMENTS.md; the verifier reports per-item outcomes, it does not roll back a batch.)

</deferred>

---

_Phase: 5-write-verifier_ _Context gathered: 2026-06-06_ </content> </invoke>
