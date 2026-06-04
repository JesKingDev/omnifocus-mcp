# Phase 3: RoleGate & Agent Read Paths - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in
> CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04 **Phase:** 3-RoleGate & Agent Read Paths **Mode:** advisor (research-backed comparison tables;
calibration tier `minimal_decisive`) **Areas discussed:** Advertisement mechanism, One source (advertise+enforce),
Dispatch-point gate, system whoami op

---

## GA-1 — Advertisement mechanism (GATE-01)

| Option                           | Description                                                                                                                                                                                              | Selected |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Per-role inputSchema variants    | Thread role into registerTools; agent's omnifocus_write/system inputSchema trim disallowed enum values, derived from the policy table; full surface for owner. Only option where advertised == enforced. | ✓        |
| Capability manifest side-channel | Advertise full schema to all; expose allowed ops via a separate manifest. Agent still sees/attempts denied ops; clients ignore side-channels.                                                            |          |

**User's choice:** Per-role inputSchema variants (recommended). **Notes:** SDK confirmed via context7 — the low-level
`Server`'s `tools/list` is a per-request callback that the repo already rebuilds; closing it over the role needs no
server forking and is forward-compatible with per-session HTTP (Phase 4). → CONTEXT D-01/D-02.

---

## GA-2 — Single source for advertise + enforce (no-drift)

| Option                                                   | Description                                                                                                                                                                                                                       | Selected |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Derived from policy table, gate = advertised-but-guarded | `allowedOperations(role)` enumerates the same AGENT_POLICY table for advertisement; `decide()` enforces. Gated ops stay visible so the agent attempts them and hits the dry-run/owner gate. One parity test pins GATE-01⟺GATE-02. | ✓        |
| Derived from table, but HIDE gated ops                   | Same enumerator, but tag delete/merge omitted from agent advertisement entirely (gate invisible until attempted).                                                                                                                 |          |
| Independent per-role schema variants                     | Hand-maintain the agent enum separately; `decide()` only enforces. Reintroduces OMN-119 drift risk at a new seam.                                                                                                                 |          |

**User's choice:** Derived from policy table, gate = advertised-but-guarded (recommended). **Notes:** Forward
enumeration over the closed-world table (not an inverse of `decide()`) avoids the inverse-enumeration footgun. Mandatory
advertise⟺enforce parity test extends the OMN-119 batch-parity discipline. → CONTEXT D-03/D-04/D-05/D-06.

---

## GA-3 — Dispatch-point gate (GATE-02)

| Option                                                        | Description                                                                                                                                                                                                                                                                   | Selected |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Pre-dispatch gate + keep Phase 2 funnel, reuse POLICY\_ codes | Thin gate in CallTool calls `decide()` before `tool.execute()` (satisfies "rejected at dispatch, even if unadvertised"), layered on the Phase 2 funnel for defense-in-depth. Shared normalization helper. Returns structured POLICY*DENY*\*/GATE data, not a thrown McpError. | ✓        |
| Rely solely on Phase 2 funnel                                 | No new dispatch layer; enforcement stays inside OmniFocusWriteTool.execute. Simpler but fails GATE-02's "at the dispatch point" wording and is single-layer.                                                                                                                  |          |

**User's choice:** Pre-dispatch gate + keep Phase 2 funnel, reuse POLICY\_ codes (recommended). **Notes:** Universal
mechanism / write-scoped effect (no `if name==='omnifocus_write'` special-case — fail-closed for future tools). Role
threads in as a registerTools param captured in the handler closure (the Phase 4 per-session seam); shared
`(operation,target)` normalization helper prevents drift between the two layers. → CONTEXT D-07–D-11.

---

## GA-4 — system whoami op

| Option                         | Description                                                                                                                                                                                                                                       | Selected |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Build now, role-scoped payload | agent → { role, roleSource }; owner → { role, identity:{transport,roleSource,principal} }. principal null on stdio. CallTool role assertion (replaces log-scraping); GATE-01's first redaction consumer. Dual-schema + agent-omits-identity test. | ✓        |
| Defer to Phase 4               | Keep role surfaced via startup stderr line only; tests keep log-scraping. Cited precondition now met → third deferral.                                                                                                                            |          |

**User's choice:** Build now, role-scoped payload (recommended). **Notes:** Both Phase 1 (D-09) and Phase 2 deferred
whoami _to_ this phase; the precondition (role-aware dispatch + owner-only redaction) now lands here. `roleSource` is
the real 3-value enum (no `launchd-label`). Redaction is fail-safe by construction (principal null on stdio) but the
agent-path test must assert the field is absent. → CONTEXT D-12–D-15.

---

## Claude's Discretion

- Module layout / function names (`allowedOperations(role)` placement, normalization-helper home, role-aware
  `inputSchema` factory shape).
- Whether the advertised enum is built by filtering a base enum or assembled from the table directly (as long as it
  derives from the one table and the parity test enforces it).
- Exact `whoami` field names / envelope (provided the AGENT/OWNER split and 3-value `roleSource` hold).
- Call-site ordering inside the CallTool handler (provided the gate runs before `tool.execute()`).

## Deferred Ideas

- HTTP per-token / per-session role threading → Phase 4 (HTTP-05); the closure-captured-role design is the seam.
- Threading role into the tools themselves (in-tool funnel currently re-derives role) → Phase 4.
- `whoami` with a populated `principal` → once Phase 4 fills the token-id slot; redaction shape already accommodates it.
- Markdown surface regeneration → v2 / SURF-01; native perspectives first.
- HMAC confirmation-token approval flow (Phase 2 deferred) → only if agent-side gated-op execution / per-payload audit
  is ever needed.
