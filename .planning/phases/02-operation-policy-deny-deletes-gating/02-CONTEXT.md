# Phase 2: Operation Policy (Deny-Deletes & Gating) - Context

**Gathered:** 2026-06-03 **Status:** Ready for planning

<domain>
## Phase Boundary

The role→permission **enforcement layer**. It turns the Phase 1 role (`owner | agent`) into per-operation outcomes at
the single mutation funnel: the AGENT role loses every content-destructive delete (removed, not gated), structural-
destructive ops (tag delete, tag merge, perspective delete) are gated behind a dry-run preview, and the OWNER role keeps
the full surface. Enforcement lives at the one funnel where single and batch operations are normalized
(`OmniFocusWriteTool.execute`), with a defense-in-depth re-assertion in the script builders, and a mandatory
batch-parity guarantee.

This phase delivers the policy _decision_ and its _enforcement_. It does **not** advertise role-scoped tools or reject
at `ListTools`/`CallTool` dispatch (that is Phase 3's RoleGate), and it does **not** verify that a write persisted
(Phase 5).

**Locked by ROADMAP/REQUIREMENTS/PROJECT (not re-litigated):**

- AGENT content deletes (task/project/folder hard delete + bulk*delete) are \_removed, not gated*; `drop`/`complete` are
  the recoverable substitutes (POLICY-01/02/05).
- tag delete/merge + perspective delete are _gated_; additive/structural tag ops (create, rename, nest, unnest,
  reparent) execute directly (POLICY-03).
- OWNER keeps the full `tag_manage` surface (incl. delete/merge) and perspective management, with no gating (POLICY-06).
- Enforcement lives at the single mutation funnel where single + batch normalize, with a script-builder re-assertion;
  batch-parity is mandatory (POLICY-04, the OMN-119 lesson).
- Role type & resolver from Phase 1 are reused as-is (`type Role = 'owner' | 'agent'`, fail-safe `agent`).

</domain>

<decisions>
## Implementation Decisions

### Owner-approval handshake (POLICY-07)

- **D-01:** A gated structural op (tag delete, tag merge, perspective delete) requested by the AGENT role returns a
  **dry-run preview only and never executes**. The preview includes a **copy-paste-ready OWNER command** so the human
  can run it from an owner connection (where the op is ungated per POLICY-06). "Owner approval" = the owner re-issuing
  the op from their own OWNER-role session. There is **no approval token and no shared server-side state**.
- **Why:** Phase 1 fixes role _per connection at startup_, so an AGENT connection can never self-approve — approval must
  originate from a separate OWNER connection by construction. This is the least-surface option (zero new state, no token
  lifecycle), it is unbypassable (the agent literally cannot execute a gated op), and it matches the project posture
  that "tag-taxonomy design runs in OWNER mode."
- **Reuse:** the existing `dryRun` preview path (`OmniFocusWriteTool` already implements `dryRun` for `batch` and
  `bulk_delete`) — extend the same preview shape to gated tag/perspective ops rather than inventing a new mechanism.
- **Rejected:** HMAC confirmation-token resubmit (first call returns a payload-bound token; execution requires
  resubmitting it from an OWNER connection). It adds token expiry/replay surface for a single-human-on-her-own-tailnet
  threat model, and the per-payload audit link it buys is largely covered by Phase 5 write-verification. Kept as the
  documented path _if_ agent-side execution + per-payload audit is ever needed (see Deferred Ideas).

### Policy representation & enforcement point (POLICY-04)

- **D-02:** A single declarative decision function — **`decide(role, operation, target) → 'allow' | 'deny' | 'gate'`** —
  over a data table is the **single source of truth**. The funnel (`OmniFocusWriteTool.execute`) normalizes the compiled
  mutation into a flat list of `(operation, target)` items — **walking `batch.operations[]` and the `bulk_delete` id
  list** — and calls `decide()` on each item _before any dispatch_. **Fail-closed default:** any `(role, op)` pair not
  explicitly allowed resolves to `deny` (unknown/new ops never fail open).
- **D-03:** **Defense-in-depth re-assertion** — the script builders (`src/contracts/ast/mutation-script-builder.ts`,
  `src/contracts/ast/tag-mutation-script-builder.ts`) call the **same** `decide()` before emitting a destructive or
  gated script, so a path that bypasses the funnel still fails closed. No duplicated policy logic — both layers consult
  one function.
- **D-04:** **Batch-parity is structural, not incidental** — because `decide()` runs over the normalized item list, a
  delete nested in a `batch` payload is denied identically to a single-item delete. A **mandatory batch-parity test**
  asserts the single-item path and the batch path produce the same deny outcome for the same op (the OMN-119 lesson).

### Deny response UX (POLICY-05)

- **D-05:** A denied content-destructive op returns a **structured failure that names the recoverable substitute** —
  e.g. `{ success: false, code: 'POLICY_DENY_DELETE', allowed: ['complete', 'drop'], message: ... }`. Nothing executes.
  - No silent transform: auto-substituting `delete → drop` is rejected — it cuts against the project's "no silent write
    failures" core value (the agent asked for X; it must not quietly get Y).
  - No opaque deny: the substitute is named so JessOS can self-correct programmatically.
- **D-06:** A gated op returns a **distinct code** (e.g. `POLICY_GATE_REQUIRES_OWNER`) carrying the dry-run preview and
  the copy-paste-ready owner command (D-01).

### Operation classification (POLICY-01/03)

- **D-07:** **Uniform deny** — the AGENT role has **no hard-delete path, ever**, including cleanup of already-completed
  or already-dropped items. No state-dependent carve-out, which keeps `decide()` pure/state-free and preserves the
  batch-parity guarantee (D-04).
- **D-08:** Canonical taxonomy table (AGENT perspective):
  - **deny:** task/project/folder hard `delete`, `bulk_delete`
  - **allow:** `complete`, `drop` (task & project); tag `create`/`rename`/`nest`/`unnest`/`reparent`; and the existing
    ungated hot path (`create`, `update`, defer/reschedule, add-tag, `move`, flag)
  - **gate:** tag `delete`, tag `merge`, perspective delete
  - Perspective delete is classified `gate` but **forward-declared / inert** — no perspective-delete operation exists in
    the write surface today. The table entry is ready for the op when it lands; nothing to enforce until then.
- **OWNER:** `allow` everything (full `tag_manage` incl. delete/merge, perspective management) — no gating (POLICY-06).

### Claude's Discretion

- Module layout — suggested home `src/auth/operation-policy.ts` (alongside Phase 1's `src/auth/role-resolver.ts`) for
  `decide()` + the policy table; final names/paths are the planner's call per existing conventions.
- Exact error `code` strings and the structured-result shape — must be stable enough for a grep/assert test.
- Exact preview + owner-command format — copy-paste-ready and stable enough for a test.
- Internal representation of the normalized `(operation, target)` item list, and whether the table is a `const` object,
  a `Map`, or a switch — as long as it is one source of truth consulted at both the funnel and the script builders.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (this phase)

- `.planning/REQUIREMENTS.md` — POLICY-01 through POLICY-07 (the seven requirements this phase satisfies).
- `.planning/ROADMAP.md` §"Phase 2: Operation Policy (Deny-Deletes & Gating)" — goal, depends-on (Phase 1), success
  criteria; plus the milestone overview's two cross-phase invariants (single mutation funnel; write-verification as a
  separate round-trip).
- `.planning/PROJECT.md` §Constraints, §Key Decisions — least-privilege posture, "agent role cannot hard-delete", and
  the explicit "gate (not remove) tag delete/merge + perspective delete via dry-run + owner approval" decision row.

### Phase 1 contracts (reused as-is)

- `.planning/phases/01-role-model-resolver/01-CONTEXT.md` — the locked role model (D-03 `type Role`, D-08 identity/authz
  split) this phase keys off.
- `src/contracts/roles.ts` — the `Role` union and role contract from Phase 1.
- `src/auth/role-resolver.ts` — the Phase 1 resolver; `decide()` is the authorization counterpart to this identity step.

### The single mutation funnel & script builders (touch points)

- `src/tools/unified/OmniFocusWriteTool.ts` — **the funnel.** `execute()` is the dispatch point where single, `batch`,
  and `bulk_delete` are routed; operations enum is
  `create, create_folder, update, complete, delete, batch, bulk_delete, tag_manage`; existing `dryRun` handling for
  `batch`/`bulk_delete` is the preview mechanism to extend (D-01).
- `src/tools/unified/schemas/write-schema.ts` — `tag_manage` action enum
  (`create, rename, delete, merge, nest, unnest, reparent`) — the gate targets delete/merge.
- `src/tools/unified/schemas/batch-schemas.ts`, `src/tools/unified/batch-response-flatten.ts` — batch payload shape; the
  normalization that must be walked for batch-parity (D-04).
- `src/contracts/ast/mutation-script-builder.ts`, `src/contracts/ast/tag-mutation-script-builder.ts` — the script
  builders that get the defense-in-depth `decide()` re-assertion (D-03).

### Codebase maps (mapped 2026-06-03)

- `.planning/codebase/ARCHITECTURE.md` — dispatch flow (`registerTools` → `BaseTool.execute`), execution patterns.
- `.planning/codebase/STRUCTURE.md` — where the write tool, schemas, and AST builders live.
- `.planning/codebase/CONVENTIONS.md` — contract-type and module idioms to match (string-literal unions, `contracts/*`).
- `docs/dev/LESSONS_LEARNED.md` — hard-won bridge/batch lessons (the OMN-119 batch-parity class of bug).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`dryRun` preview path** (`OmniFocusWriteTool.execute`, already wired for `batch` and `bulk_delete`): extend the same
  preview response shape to gated tag/perspective ops (D-01) instead of building a new preview mechanism.
- **Phase 1 role + resolver** (`src/contracts/roles.ts`, `src/auth/role-resolver.ts`): `decide()` is the authorization
  twin of the identity/role resolver — same single-source-of-truth, fail-closed ethos.
- **Structural fail-safe pattern** (Phase 1's default-deny parse, exhaustively unit-tested across 14 input classes):
  mirror it for `decide()` — unknown `(role, op)` → `deny`, with an exhaustive policy-matrix unit test.

### Established Patterns

- **Single funnel** — `OmniFocusWriteTool.execute()` already routes single vs `batch` vs `bulk_delete`; the policy guard
  must run _before_ that routing, over the normalized item list, so batch and single share one decision.
- **Contract-type idiom** (`src/contracts/*`, string-literal unions like `TagOperator`): `'allow' | 'deny' | 'gate'`
  fits this idiom directly.
- **Dual-schema invariant** (Zod + hand-crafted `inputSchema`): if any tool input/output shape changes for the deny/gate
  response, both schemas update together (see CLAUDE.md).

### Integration Points

- Policy guard call site: top of `OmniFocusWriteTool.execute`, before tag_manage/create_folder/dryRun/batch/bulk_delete
  routing.
- Re-assertion call site: inside `mutation-script-builder.ts` and `tag-mutation-script-builder.ts`, before emitting a
  destructive/gated script.

</code_context>

<specifics>
## Specific Ideas

- `decide()` should be **fail-closed and exhaustively tested**, mirroring Phase 1's structural fail-safe: every
  `(role, operation, target)` resolves explicitly, and anything unrecognized defaults to `deny` — a single mis-set
  default must not flip the agent fail-open.
- The two enforcement layers (funnel guard + script-builder re-assertion) must call the **same** `decide()` — duplicated
  policy logic is exactly how batch-parity drifts (OMN-119). One function, two call sites.
- Batch-parity gets a **dedicated, mandatory test**: the same destructive op denied on the single path is denied
  identically when nested inside a `batch` payload and inside a `bulk_delete` list.

</specifics>

<deferred>
## Deferred Ideas

- **HMAC confirmation-token approval flow** — payload-bound, single-use, time-bound token that lets an OWNER connection
  redeem an agent-initiated gated op so the _agent's_ run executes (and shows in agent logs). Documented alternative to
  D-01; revisit only if agent-side execution or a per-payload approval audit trail is ever required. Not this milestone.
- **Perspective-delete operation itself** — no write-side perspective delete exists today. When a perspective
  write/delete op is added (future work), it is already classified `gate` in the D-08 table; no policy change needed
  then.
- **`system` `whoami` / role-surfacing op** — already deferred to Phase 3 (from Phase 1), where the role-aware
  `ListTools`/`CallTool` layer exists. Out of scope here.

</deferred>

---

_Phase: 2-Operation Policy (Deny-Deletes & Gating)_ _Context gathered: 2026-06-03_
