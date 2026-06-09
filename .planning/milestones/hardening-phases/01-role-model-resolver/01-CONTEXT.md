# Phase 1: Role Model & Resolver - Context

**Gathered:** 2026-06-03 **Status:** Ready for planning

<domain>
## Phase Boundary

A resolver that turns a connection (transport + config) into exactly **one** role — `OWNER | AGENT` — before any tool
dispatch. It fails safe to AGENT, keeps **identity** ("who is connected") as a separate inspectable step from
**authorization** ("what they may do"), and leaves an HTTP resolver **stub** for Phase 4 to fill.

This phase delivers the seam the roadmap says "everything keys off." It defines the role _type_ and the _resolver_, and
surfaces the resolved role for inspection. It does **not** define the role→permission policy (that is Phase 2) or wire
the role into dispatch/advertisement (that is Phase 3).

**Locked by ROADMAP/REQUIREMENTS (not re-litigated):**

- AGENT is the least-privilege fail-safe default; no explicit config must never yield OWNER (ROLE-02).
- Identity is resolved separately from authorization (ROLE-03).
- stdio is implemented now; HTTP gets a stub, real impl in Phase 4.
- Milestone scope is closed at two roles; harden, don't rewrite.

</domain>

<decisions>
## Implementation Decisions

### OWNER opt-in mechanism

- **D-01:** OWNER is declared via an explicit **role enum env var** with a **default-deny** parse. Only the exact
  literal `owner` resolves to OWNER; unset, empty, whitespace, misspelled, or wrong-case (`OWNER`, `Owner`, `agent`,
  garbage) all fall to AGENT. The fail-safe lives structurally in the parse logic — every non-match is least-privilege.
- **D-02:** Env var name: **`OMNIFOCUS_MCP_ROLE`** (matches the codebase's `OMNIFOCUS_*` prefix idiom, e.g.
  `OMNIFOCUS_SCRIPT_TIMEOUT`). Planner may finalize the exact name per existing naming convention, but the default-deny
  enum semantics (D-01) are fixed.
- **Rejected:** owner-secret/token presence as the stdio OWNER signal — adds secret-at-rest with no local-threat-model
  gain, risks conflating with the _agent-scoped_ HTTP token (Phase 4 / HTTP-05), and muddies the ROLE-03 identity/authz
  separation. Credential→role inference belongs to Phase 4 (HTTP), where a token authenticates a remote party.

### Role model shape

- **D-03:** Role is a **bare string-literal union**: `type Role = 'owner' | 'agent'`, defined as a
  single-source-of-truth contract (suggested home `src/contracts/roles.ts`, alongside the existing `contracts/*.ts`
  idiom like `TagOperator`). Consumers `switch` on it with a `never` default for compile-time exhaustiveness.
- **D-04:** The role object carries **no capabilities** in Phase 1. The role→capability mapping is owned by Phase 2's
  policy layer. This keeps Phase 1 on the _identity/role_ side of the locked ROLE-03 split and avoids coupling Phase 1
  to not-yet-made Phase 2 policy decisions.
- **Rejected:** a structured capability descriptor (`{ id, capabilities, canHardDelete, ... }`) — gold-plates a closed
  2-role system and pulls authorization policy into the identity-side role model.

### Identity payload & provenance

- **D-05:** The identity step produces a transport-agnostic contract:
  **`{ transport: 'stdio' | 'http'; roleSource: RoleSource; principal: string | null }`**.
- **D-06:** `roleSource` is a closed provenance enum:
  **`'explicit-env' | 'launchd-label' | 'fail-safe-default' | 'http-token'`**. It records _why_ a role was chosen,
  satisfying ROLE-03's "separate inspectable step" and the audit/write-trust goal. (`launchd-label` and `http-token` are
  valid values now; `http-token` is populated in Phase 4. `launchd-label` covers the Phase 6 LaunchAgent path — in
  practice the LaunchAgent sets `OMNIFOCUS_MCP_ROLE` in its `EnvironmentVariables`, so that path may report as
  `explicit-env`; planner to confirm which provenance the launchd path emits.)
- **D-07:** `principal` is a **nullable** name/token-id slot — `null` on stdio today, populated by the Phase 4 HTTP
  per-token resolver. This single field converts Phase 4 from a contract _reshape_ into a value _fill-in_ (satisfies
  Success Criterion 3's "stub exists for Phase 4 to fill").
- **D-08:** Identity and authorization are produced as **two distinct, separately callable steps** — it must be possible
  to ask "who is connected" and get a different answer from "what may they do."
- **Follow-through (carry to implementation):** when `principal` may later hold a token-id, add the `principal` key (and
  any token-id field) to the logger's `SENSITIVE_KEYS` redaction set in `src/utils/logger.ts` so it is never logged raw.

### Role inspectability

- **D-09:** Surface the resolved role via a **startup stderr log line only** for Phase 1 — e.g.
  `resolved role=AGENT source=fail-safe-default`, emitted at resolve time through the existing redacting logger /
  StartupTimer. stderr is owner-only (the agent connection can't read it), so there is no leak surface, and no new MCP
  API has to be designed before Phase 3 builds the role-aware `system` surface.
- **Deferred (not rejected):** a queryable `system` `whoami` operation returning `{ role, identity, provenance }`. Defer
  to Phase 3, where the role-aware `ListTools`/`CallTool` layer (which must redact owner-only fields over an agent
  connection) actually exists. See Deferred Ideas.

### HTTP resolver stub

- **D-10:** Ship an **HTTP resolver stub** now that conforms to the same identity+role contract (D-05–D-08) so Phase 4
  fills in token→role/principal logic without reshaping the contract. The stub is the explicit Phase-1→Phase-4 seam
  (Success Criterion 3).

### Claude's Discretion

- Exact module/file layout (e.g. `src/auth/role-resolver.ts` + `src/contracts/roles.ts`), function signatures, and the
  precise resolver call site in `src/index.ts` startup ordering (before tool dispatch, after transport selection).
- Exact log-line format/wording (must be stable enough for a grep-based test).
- Whether the resolver is one function returning `{ identity, role }` or two composed functions — as long as identity
  and authorization are separately inspectable (D-08).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (this phase)

- `.planning/REQUIREMENTS.md` — ROLE-01, ROLE-02, ROLE-03 (the three requirements this phase satisfies).
- `.planning/ROADMAP.md` §"Phase 1: Role Model & Resolver" — goal, depends-on, success criteria; also the milestone
  overview's two cross-phase invariants (single mutation funnel; write-verification as a separate round-trip).
- `.planning/PROJECT.md` §Constraints, §Key Decisions — least-privilege posture, Mac-pin, localhost/stdio default +
  Tailscale+auth remote, agent role cannot hard-delete.

### Codebase maps (mapped 2026-06-03)

- `.planning/codebase/ARCHITECTURE.md` — entry points (`src/index.ts` `runServer`→`runStdioServer`/`runHttpServer`),
  dispatch flow (`registerTools` → `BaseTool.execute`), §"Cross-Cutting Concerns/Authentication" (HTTP bearer today,
  stdio has none).
- `.planning/codebase/INTEGRATIONS.md` §"MCP Protocol", §"Authentication & Identity" — current transports, the single
  static HTTP bearer token, env-var config conventions.
- `.planning/codebase/CONVENTIONS.md` — env-var and contract-type idioms to match (`OMNIFOCUS_*`, string-literal
  unions).

### Decision trail (external — JessOS vault)

- `~/vaults/jess-os/_ai-drafts/pointers/omnifocus-task-system.md` — the decision trail for the
  OmniFocus-as-canonical-store architecture.
- ADR 001 (obsidian-tasks-plugin — _to be superseded_ by the Phase 6 ADR), ADR 003 (integration-policy), ADR 004
  (integration-policy OAuth amendment). These live in the JessOS vault, not in-repo; resolve via the pointer above if
  their content is needed. No in-repo ADR files exist yet.

### Code touch points (for the resolver)

- `src/index.ts` — startup / transport selection; resolver must run before tool dispatch.
- `src/http-server.ts`, `src/session-manager.ts` — where the HTTP stub plugs in (Phase 4 fills it).
- `src/utils/logger.ts` — redacting structured logger + `SENSITIVE_KEYS`; reused for D-09 log line and the D-08
  follow-through.
- `src/contracts/` — home for the new `Role` / identity contract types.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Env-var parse idiom** (`CI === 'true'`, `MCP_SKIP_AUTO_START !== 'true'`): the established explicit-value pattern
  the default-deny role parse should mirror.
- **Contract type idiom** (`src/contracts/filters.ts`, `TagOperator = 'AND' | 'OR' | 'NOT_IN'`): the
  single-source-of-truth string-union pattern for `type Role`.
- **Redacting logger + StartupTimer** (`src/utils/logger.ts`): reuse for the resolve-time log line; already redacts
  sensitive fields and emits to stderr.
- **SystemTool** (`src/tools/system/SystemTool.ts`): string-enum `operation` discriminator — the natural home for a
  future `whoami` op (deferred to Phase 3).

### Established Patterns

- **No `.env` file** — all config via env vars / CLI flags at process start. The role var fits this directly and is set
  cleanly in a launchd `EnvironmentVariables` dict (Phase 6).
- **Dual-schema invariant** — if a `whoami` op is ever added, both the Zod schema and the hand-crafted `inputSchema`
  must change together. (Not triggered this phase; relevant only if inspectability is upgraded.)
- **Resolution before dispatch** — `registerTools`/`BaseTool.execute` is the dispatch point; role must be resolved
  upstream of it (at connection/startup) so it's available before any `CallTool`.

### Integration Points

- Resolver call site: `src/index.ts` startup, after transport selection, before tool registration/dispatch.
- HTTP stub: conforms to the same identity+role contract; lands near `src/http-server.ts` for Phase 4 to fill.

</code_context>

<specifics>
## Specific Ideas

- Fail-safe must be **structural**, not defensive: the resolver whitelists exactly `owner` and defaults _every_ other
  input to AGENT — a single mis-set default flips the system fail-open, so this is the one spot to unit-test
  exhaustively (set / unset / empty / whitespace / typo / wrong-case).
- The four decisions are intended to **compose into one minimal seam**: a dumb `Role` tag, a thin identity contract with
  provenance, a fail-safe resolver, and a log line — nothing more until Phase 2/3/4 need it.

</specifics>

<deferred>
## Deferred Ideas

- **`system` `whoami` operation** — queryable `{ role, identity, provenance }` over MCP so the agent can self-confirm
  its least-privilege role and tests can assert via `CallTool` instead of log scraping. Belongs in **Phase 3**, where
  the role-aware `ListTools`/`CallTool` layer (with owner-field redaction over agent connections) is built. Deferred,
  not rejected.
- **Credential/token → role inference** — using possession of a secret to determine role. Belongs in **Phase 4** (HTTP
  per-token role, HTTP-05), not the local stdio path.

</deferred>

---

_Phase: 1-Role Model & Resolver_ _Context gathered: 2026-06-03_
