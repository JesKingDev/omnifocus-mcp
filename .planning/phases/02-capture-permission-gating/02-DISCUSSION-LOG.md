# Phase 2: Capture & Permission Gating - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in
> CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12 **Phase:** 2-Capture & Permission Gating **Mode:** advisor (research-backed comparison tables;
calibration tier `minimal_decisive`) **Areas discussed:** Gate enforcement locus, Sync vs async mode signal, agent-ok
scope in Phase 2, Lineage stamp format & source

---

## Gate enforcement locus (PERM-02)

| Option                         | Description                                                                                                                                                                                                       | Selected |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Hybrid: server verdict + grant | Create runs through the mutation funnel; PolicyEngine returns `gate`; server holds the per-session "allow all" grant in `SessionConfig` (owner-auth only); agent skill renders the prompt off the server verdict. | ✓        |
| Pure agent-side protocol       | Skill confirms conversationally, holds "allow all" in conversation memory; create tool ungated server-side.                                                                                                       |          |

**User's choice:** Hybrid — server verdict + grant. **Notes:** Decisive constraint — MCP `elicitation/create` requires
the client to declare the `elicitation` capability at init, so a background run has no one to prompt; the funnel must
own the verdict for both modes regardless. "Mirror Jira" is a UX requirement, not an enforcement-location one. Preserves
the hardening milestone's server-side single-funnel invariant.

---

## Sync vs async mode signal (PERM-01 / PERM-02)

| Option                                         | Description                                                                                                                                                                         | Selected |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Connection-bound marker (fail-safe background) | Derive `interactive` into ResolvedContext from an explicit `OMNIFOCUS_MCP_INTERACTIVE` env marker at the role-resolver seam; literal-only default-deny; launchd/n8n leave it unset. | ✓        |
| Per-call mode parameter                        | `mode: "live"\|"background"` arg on the write call.                                                                                                                                 |          |

**User's choice:** Connection-bound marker; fail-safe default `background`. **Notes:** Per-call param rejected — a
background agent could pass `mode:"live"` to dodge the `agent-ok` gate (self-elevation). Mode binds to how the
connection authenticated, mirroring the existing `parseRole` literal-only default-deny pattern. Absent/garbled marker →
background.

---

## agent-ok scope in Phase 2 (PERM-01)

| Option                              | Description                                                                                                                                                                   | Selected |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Read-side predicate + capture stamp | Build the reusable `agent-ok` filter predicate (thin compose over existing tags+inInbox filters) AND stamp agent-captured items; defer routing-time action gating to Phase 3. | ✓        |
| Mechanism only (apply to nothing)   | Establish the tag convention/predicate but wire it to no caller in Phase 2.                                                                                                   |          |

**User's choice:** Read-side predicate + capture stamp. **Notes:** "Mechanism only" rejected — ships dead code (violates
the no-unused-mechanism rule) and leaves the success criterion only assertable, not demonstrable. Boundary: Phase 2 owns
the write-side stamp + read-side predicate; Phase 3 owns consuming it. Proof = predicate unit test + capture-stamp test;
Phase 2 verification must be worded as predicate + stamp, not a routing demo.

---

## Lineage stamp format & source (LINE-01)

| Option                     | Description                                                                                                                                                      | Selected |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Fenced HTML-comment + JSON | `<!-- of-mcp:lineage {json} -->` appended after user text; searchable sentinels, one `JSON.parse`, composes server-side, round-trips through the write-verifier. | ✓        |
| Dataview inline fields     | Trailing `session:: <uuid>` / `created-by::` / `created-at::` lines; vault-queryable but no enclosing fence (brittle re-stamp/parse).                            |          |

**User's choice:** Fenced HTML-comment + JSON. **Source (locked, effectively forced):** the agent supplies its session
ID as a write-call param — the server's only session concept is its own transport `sessionId` (wrong ID) and no env var
exposes the CC host session today. Acceptable because the stamp is provenance, not authorization. **Notes:**
Strip-and-re-append the `of-mcp:lineage` block on note update to avoid duplicates; add the `lineage` param to both the
Zod schema and the `inputSchema` override (dual-schema rule).

---

## Claude's Discretion

- Exact JSON field naming/casing (keep `v`/`session`/`agent`/`created_at` intent stable for Phase 5).
- The exact env-marker literal (`interactive` vs `live`) — parse literal-only.
- Where in PolicyEngine/funnel the create `gate` rule lives + the owner-auth call that sets the grant.
- Whether the agent-origin tag and the `agent-ok` gate tag are one tag or two — resolve in planning.

## Deferred Ideas

- Routing-time action gating (apply predicate to existing tasks) — Phase 3 (ROUTE-\*).
- n8n 15-min polling under background mode — TRIG-02 (deferred follow-up to Phase 3 MVP).
- Owner-only per-call `background` downgrade hint (live→background only) — implement only if needed.
