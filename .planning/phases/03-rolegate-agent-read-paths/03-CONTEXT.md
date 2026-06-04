# Phase 3: RoleGate & Agent Read Paths - Context

**Gathered:** 2026-06-04 **Status:** Ready for planning

<domain>
## Phase Boundary

Wire the Phase 1 resolved role into the **single `ListTools`/`CallTool` dispatch** so a least-privilege stdio AGENT
agent ships complete and usable. Three jobs:

1. **Advertise role-aware** (GATE-01) — an AGENT connection's `ListTools` advertises only its allowed operations; OWNER
   sees the full surface.
2. **Reject at the dispatch point** (GATE-02) — a disallowed AGENT operation is refused in the `CallTool` handler before
   `tool.execute()`, even when it was never advertised.
3. **Expose the agent's working surface** (GATE-03, READ-01/02/03) — the full write hot-path (create, complete, drop,
   defer/reschedule, tag, move, flag) and the core read surface (today/forecast, overdue, flagged, available vs blocked,
   by-project, by-tag, inbox, date-range, count-only), lookup by identifier, and list/read of native perspectives all
   work end-to-end over stdio.

This phase wires the role into **dispatch and advertisement**. It does **not** redefine policy (Phase 2 owns
`decide()`), build HTTP auth/per-token role (Phase 4), or verify writes persisted (Phase 5).

**Locked by ROADMAP/REQUIREMENTS/PROJECT (not re-litigated):**

- Two roles, fail-safe `agent` (Phase 1 D-01/D-03); role resolved once at startup, identity separate from authorization
  (Phase 1 D-08).
- `decide(role, operation, target) → 'allow' | 'deny' | 'gate'` is the **single policy source of truth** (Phase 2 D-02),
  already enforced at the mutation funnel and re-asserted in the script builders (Phase 2 D-03). Phase 3 adds dispatch +
  advertisement layers that consult the **same** `decide()`/policy table — it does not duplicate policy.
- AGENT allow/deny/gate taxonomy is fixed by Phase 2 D-08 (deny: hard delete + bulk_delete; gate: tag delete/merge,
  perspective delete; allow: the rest of the hot path + additive tag ops). OWNER allows everything.
- Coarse 4-tool surface (`omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system`); permissions are
  operation-level inside discriminated-union schemas. Dual-schema invariant: Zod + hand-crafted `inputSchema` change
  together (and the description string).
- Core read paths and perspective queries already exist in `OmniFocusReadTool` — this phase confirms they are
  agent-allowed and usable end-to-end, it does not build new query engines (READ-01/02/03 are largely verification +
  agent-allow, not new construction).

</domain>

<decisions>
## Implementation Decisions

### Role-aware advertisement (GATE-01)

- **D-01:** **Per-role `inputSchema` + description variants.** Thread the resolved `Role` into `registerTools`; the
  `ListTools` handler (which already rebuilds the `tools` array per request) closes over the role and emits a
  role-correct `inputSchema`/description per tool. For an AGENT connection, the advertised `operation` enum (and
  `tag_manage` action enum) on `omnifocus_write` — and the `system` op enum — are **trimmed to the allowed set**; OWNER
  sees the full schema. This is the only mechanism where what the agent is _shown_ matches what `decide()` _allows_.
- **D-02:** The trimmed agent enum is **derived from the policy table**, never hand-maintained as a second list (see
  D-03). The full Zod schema stays role-agnostic (server-side `decide()` is the real gate); only the advertised
  `inputSchema`/description is role-parameterized.
- **SDK basis (confirmed):** the low-level `Server`'s `tools/list` is a per-request `setRequestHandler` callback;
  closing it over the role needs no server forking and works identically for stdio (role fixed at startup) and HTTP
  per-session (Phase 4 — each session builds its own `Server` and calls `registerTools`).
- **Rejected:** a separate capability manifest advertised alongside the full tools — the agent would still see and could
  attempt denied ops, clients ignore side-channels, and it adds surface without delivering least-privilege
  advertisement.

### Single source for advertise + enforce (GATE-01/02 no-drift)

- **D-03:** **One capability map drives both advertisement and enforcement.** Add a companion enumerator beside
  `decide()` — `allowedOperations(role)` (and, for `tag_manage`, allowed targets) — that iterates the **same** Phase 2
  `AGENT_POLICY` data table. `ListTools` trims its advertised enum from this enumerator; `CallTool` rejects via
  `decide()`. Both consume one table, so the advertised surface **provably cannot drift** from the enforced surface.
  This extends the project's hard-won OMN-119 lesson ("one function, two call sites"; the batch-parity guarantee) to
  advertise-vs-enforce.
- **D-04:** The enumerator is a forward read over the closed-world table (e.g.
  `Object.entries(AGENT_POLICY).filter(…)`), **not** an inverse of the opaque `decide()` function — this avoids the
  inverse-enumeration footgun and preserves fail-closed defaults (the table is the closed world).
- **D-05:** **Gated ops are advertised-but-guarded, not hidden.** Tag delete/merge stay visible in the AGENT
  advertisement so the agent can attempt them and hit the Phase 2 dry-run / owner-approval gate (POLICY-07). Hiding them
  would collapse the three-state `allow|deny|gate` reality into a two-state advertisement that lies about what the agent
  can attempt. (Perspective delete remains forward-declared/inert per Phase 2 D-08 — no write op exists yet.)
- **D-06:** A **mandatory advertise⟺enforce parity test** pins GATE-01 to GATE-02: every operation advertised to AGENT
  resolves to `decide() ≠ 'deny'`, and every non-denied operation is advertised (gated ops advertised per D-05). Mirrors
  the Phase 2 batch-parity discipline.

### Dispatch-point gate (GATE-02)

- **D-07:** **Thin pre-dispatch gate in the `CallTool` handler, layered ON TOP of the Phase 2 funnel**
  (defense-in-depth, not a replacement). The gate inspects the operation in `args` and calls `decide()` **before**
  `tool.execute()`, so a disallowed op is rejected at the dispatch point even if it was never advertised (the literal
  GATE-02 requirement). The Phase 2 in-tool funnel guard and script-builder re-assertion remain as the second and third
  layers — all three call the **same** `decide()`.
- **D-08:** **Universal mechanism, write-scoped effect.** The gate loops over every CallTool dispatch and calls
  `decide()`; it is a no-op for ops that resolve to `allow` (all of `omnifocus_read`/`omnifocus_analyze`/`system` and
  the non-destructive writes). In practice it only ever rejects `omnifocus_write` ops, but the mechanism has **no
  `if (name === 'omnifocus_write')` special-case** — a future destructive tool is covered by construction (fail-closed).
- **D-09:** **Reuse Phase 2's structured error data — do not throw `McpError` at dispatch.** The gate returns the
  existing `POLICY_DENY_*` / `POLICY_GATE_REQUIRES_OWNER` structured payload via `createErrorResponseV2` (with the named
  recoverable substitute / dry-run preview + owner command). Throwing would be coerced by the CallTool handler to
  `McpError InternalError`, mangling the structured `code`/`allowed`/`ownerCommand` payload and breaking the
  client-facing contract. A deny looks identical whether it short-circuits at dispatch or at the funnel. No new `GATE_*`
  code.
- **D-10:** **Role threads in as a `registerTools` parameter, captured in the handler closure** —
  `registerTools(server, cache, pendingOperations, role)`. stdio passes the startup-resolved `parseRole()` result; the
  per-session HTTP path (`session-manager.ts`) is where Phase 4 passes each session's per-token role. The dispatch gate
  must read the **closure-captured** role, not re-call `parseRole()` (which reads global `process.env` and can't
  distinguish sessions) — this is what makes the Phase 4 per-session seam work.
- **D-11:** Extract the compiled-mutation → normalized `(operation, target)` item list into a **shared helper** so the
  pre-dispatch gate and the Phase 2 funnel feed identical items into `decide()` — prevents normalization drift between
  the two layers (the OMN-119 failure class again).

### `system whoami` op (build now)

- **D-12:** **Build the `system` `whoami` operation this phase.** Both Phase 1 (D-09 deferral) and Phase 2 deferred it
  to "the phase where the role-aware `ListTools`/`CallTool` layer with owner-only redaction exists" — that precondition
  lands in this phase, so the deferral rationale is spent. It gives tests a **CallTool-based role assertion** (replacing
  brittle startup-stderr log-scraping) and is GATE-01's first redaction consumer, at zero destructive risk (read-only
  op).
- **D-13:** **Role-scoped payload with owner-only redaction.** AGENT receives `{ role, roleSource }` (safe self-confirm
  of its own least-privilege standing); OWNER receives the full
  `{ role, identity: { transport, roleSource, principal } }`. `principal` is OWNER-only and is structurally `null` on
  stdio until Phase 4 fills it, so the redaction split is fail-safe by construction (no sensitive value can exist on the
  agent path yet). `principal` stays in the logger `SENSITIVE_KEYS` set.
- **D-14:** `roleSource` is the real 3-value enum `'explicit-env' | 'fail-safe-default' | 'http-token'` — **no
  `launchd-label`** (the launchd path emits `explicit-env` per Phase 1 D-06).
- **D-15:** Adding the op updates **both** the Zod schema and the hand-crafted `inputSchema` for `SystemTool`, plus the
  description (dual-schema invariant). The agent-path test asserts the payload **omits** `identity`/`principal`, not
  merely that `role` is present.

### Claude's Discretion

- Exact module layout and function names (suggested: `allowedOperations(role)` beside `decide()` in
  `src/auth/operation-policy.ts`; the shared `(operation, target)` normalization helper's home; the role-aware
  `inputSchema` factory shape per tool).
- Whether the trimmed advertised enum is computed by filtering a base enum or assembled from the policy table directly —
  as long as it derives from the one table (D-03) and a parity test enforces it (D-06).
- Exact `whoami` field names and response envelope, provided the AGENT/OWNER redaction split (D-13) and the 3-value
  `roleSource` (D-14) hold and are grep/assert-stable.
- The precise call-site ordering inside the `CallTool` handler (gate before correlation logging vs after), provided the
  gate runs before `tool.execute()`.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (this phase)

- `.planning/REQUIREMENTS.md` — GATE-01, GATE-02, GATE-03, READ-01, READ-02, READ-03 (the six requirements this phase
  satisfies).
- `.planning/ROADMAP.md` §"Phase 3: RoleGate & Agent Read Paths" — goal, depends-on (Phase 2), success criteria; plus
  the milestone overview's two cross-phase invariants (single mutation funnel; write-verification as a separate
  round-trip).
- `.planning/PROJECT.md` §Constraints, §Key Decisions — least-privilege posture, "agent role cannot hard-delete", the
  gate-not-remove decision row.

### Phase 1 + Phase 2 contracts (reused as-is — the seams this phase keys off)

- `.planning/phases/01-role-model-resolver/01-CONTEXT.md` — locked role model (D-03 `type Role`, D-05–D-08 identity
  contract `{ transport, roleSource, principal }`, D-09 startup log line) and the twice-deferred `whoami` op (now built,
  D-12).
- `.planning/phases/02-operation-policy-deny-deletes-gating/02-CONTEXT.md` — `decide()` single source (D-02), the
  `'allow'|'deny'|'gate'` taxonomy table (D-08), the structured deny/gate codes + dry-run/owner-command preview
  (D-05/D-06), and the OMN-119 "one function, two call sites" batch-parity discipline this phase extends to
  advertise-vs-enforce.
- `src/contracts/roles.ts` — the `Role` union + identity contract from Phase 1.
- `src/auth/role-resolver.ts` — `parseRole`, `resolveStdioIdentity`, `resolveHttpIdentity` (stub); the closure-captured
  role for the dispatch gate (D-10) comes from `parseRole` at startup.
- `src/auth/operation-policy.ts` (Phase 2 home) — `decide()` + the `AGENT_POLICY` table; the home for the new
  `allowedOperations(role)` enumerator (D-03).

### Dispatch + tool surface (touch points)

- `src/tools/index.ts` — **the dispatch point.** `registerTools(server, cache, pendingOperations)` wires the `ListTools`
  and `CallTool` handlers; `ListTools` rebuilds the `tools` array per request (D-01 closure), `CallTool` finds the tool
  by name and runs `tool.execute` (D-07 pre-dispatch gate site). Signature gains a `role` param (D-10).
- `src/index.ts` — stdio startup; already resolves role via `parseRole`/`resolveStdioIdentity`; passes role into
  `registerTools` (D-10). Phase 1's D-09 log line lives here.
- `src/session-manager.ts` — per-session HTTP `Server` + `registerTools` call site; the Phase 4 per-session-role seam
  (D-10) — out of Phase 3 scope to fill, but the closure-captured-role design must be forward-compatible with it.
- `src/tools/unified/OmniFocusWriteTool.ts` — the Phase 2 funnel guard (second enforcement layer, D-07); source of the
  compiled-mutation normalization to extract into the shared helper (D-11); its `inputSchema` getter gains the
  role-aware enum trim (D-01).
- `src/tools/unified/OmniFocusReadTool.ts` — the existing read + perspective query surface (READ-01/02/03) confirmed
  agent-allowed and usable end-to-end.
- `src/tools/system/SystemTool.ts` — home for the new `whoami` op (D-12–D-15); string-enum `operation` discriminator +
  Zod
  - hand-crafted `inputSchema` (dual-schema, D-15).
- `src/utils/response-format.ts` — `createErrorResponseV2` / `StandardResponseV2`; the structured deny/gate response
  shape reused at dispatch (D-09).
- `src/utils/logger.ts` — `SENSITIVE_KEYS` (must keep redacting `principal`, D-13).

### Codebase maps (mapped 2026-06-03)

- `.planning/codebase/ARCHITECTURE.md` — dispatch flow (`registerTools` → `BaseTool.execute`), the four-tool layer,
  dual-schema invariant, error taxonomy (`McpError` vs structured response — D-09).
- `.planning/codebase/INTEGRATIONS.md` §"MCP Protocol" — `Server` (low-level) class, per-session HTTP `Server`
  instances, capabilities advertised.
- `.planning/codebase/CONVENTIONS.md` — contract-type and module idioms (string-literal unions, `src/contracts/*`,
  `src/auth/*`).
- `docs/dev/LESSONS_LEARNED.md` — the OMN-119 batch-parity / one-source class of bug (D-03/D-06/D-11 extend its lesson).

### Decision trail (external — JessOS vault)

- `~/vaults/jess-os/_ai-drafts/pointers/omnifocus-task-system.md` — the OmniFocus-as-canonical-store decision trail.
- ADR 001 (to be superseded in Phase 6), ADR 003, ADR 004 — in the JessOS vault, not in-repo; resolve via the pointer if
  needed.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Per-request `ListTools` handler** (`src/tools/index.ts`): already rebuilds the `tools` array on each request — close
  it over the role to emit role-correct schemas (D-01) with no server forking.
- **Phase 2 `decide()` + `AGENT_POLICY` table** (`src/auth/operation-policy.ts`): the single policy source; add a
  forward enumerator `allowedOperations(role)` beside it (D-03) — a one-line filter over the table, no inverse logic.
- **Phase 2 structured deny/gate response** (`createErrorResponseV2`, `POLICY_DENY_*` / `POLICY_GATE_REQUIRES_OWNER`):
  the exact payload the dispatch gate returns (D-09) — identical shape whether it short-circuits at dispatch or the
  funnel.
- **Phase 1 role + resolver** (`src/contracts/roles.ts`, `src/auth/role-resolver.ts`): the closure-captured role for the
  dispatch gate and advertisement.
- **`SystemTool` op-enum discriminator** (`src/tools/system/SystemTool.ts`): the natural home for `whoami` (D-12);
  follow the existing `version`/`diagnostics`/`metrics` op pattern.
- **Existing read + perspective query surface** (`OmniFocusReadTool`): READ-01/02/03 already implemented; confirm
  agent-allowed and exercise end-to-end (mostly verification, not new build).

### Established Patterns

- **One source, multiple call sites** (Phase 2 funnel + script-builder re-assertion both call `decide()`): extend to a
  third call site — the dispatch gate — and to advertisement via `allowedOperations(role)` (D-03/D-07).
- **Dual-schema invariant** (Zod + hand-crafted `inputSchema` + description change together): triggered by both the
  role-aware advertisement trim (D-01) and the new `whoami` op (D-15).
- **Fail-closed / structural fail-safe** (Phase 1 default-deny parse, Phase 2 unknown-op→deny, exhaustively tested): the
  advertise⟺enforce parity test (D-06) and the no-special-case universal gate (D-08) follow the same ethos.
- **`McpError` reserved for protocol faults; tool/authorization failures returned as structured data** (per
  ARCHITECTURE.md error handling): drives D-09.

### Integration Points

- Dispatch gate call site: top of the `CallTool` handler in `src/tools/index.ts`, before `tool.execute()`.
- Advertisement trim call site: inside the `ListTools` handler's per-tool `inputSchema`/description build, keyed off the
  closure-captured role.
- Role plumbing: `src/index.ts` (stdio, startup role) → `registerTools(…, role)`; `src/session-manager.ts` is the Phase
  4 per-session seam (forward-compatible, not filled this phase).
- `whoami` wire-up: the `ResolvedContext`/identity that the dispatch now closes over is passed into `SystemTool` for the
  role-scoped payload (D-13).

</code_context>

<specifics>
## Specific Ideas

- The four decisions compose into **one coherent RoleGate layer**: advertisement (D-01) and enforcement (D-07) both
  derive from the same policy table (D-03), pinned together by one parity test (D-06); `whoami` (D-12) is the first
  consumer/test of the owner-only-redaction-over-agent capability that advertisement introduces.
- Treat advertise⟺enforce drift the way Phase 2 treated batch-parity drift: it is the **named failure mode** (OMN-119),
  and the parity test (D-06) plus the shared normalization helper (D-11) are the structural defenses, not vigilance.
- The dispatch gate must read the **closure-captured** role, never re-call `parseRole()` — that single choice is what
  makes Phase 4's per-session HTTP role drop in as a value fill-in rather than a redesign (D-10).
- `whoami` redaction is fail-safe **by construction**, not by careful coding: `principal` is `null` on stdio until Phase
  4, so there is no sensitive value to leak on the agent path yet — but the agent-path test must still assert the field
  is _absent_ (D-15), so the contract is enforced before Phase 4 populates it.

</specifics>

<deferred>
## Deferred Ideas

- **HTTP per-token role / per-session role threading** — Phase 4 (HTTP-05). The D-10 closure-captured-role design is the
  forward-compatible seam; `session-manager.ts` is where Phase 4 passes each session's role into `registerTools`.
- **Threading role into the tools themselves** — the Phase 2 in-tool funnel guard currently re-derives role via
  `parseRole()`; Phase 4 will need per-session role inside the tools too. Out of Phase 3 scope; the dispatch gate's
  closure-captured role is forward-compatible.
- **`whoami` with a populated `principal`** — richer identity output once Phase 4 fills the token-id slot. The
  role-scoped redaction shape (D-13) already accommodates it without reshaping the contract.
- **Markdown surface regeneration** (`today.md` / `daily-briefing.md` from OF) — v2 / SURF-01; native perspectives
  (READ-03) come first.
- **HMAC confirmation-token approval flow** (Phase 2 deferred) — only if agent-side execution of gated ops or a
  per-payload audit trail is ever needed. Not this milestone.

</deferred>

---

_Phase: 3-RoleGate & Agent Read Paths_ _Context gathered: 2026-06-04_
