# Phase 1: Role Model & Resolver - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in
> CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03 **Phase:** 1-Role Model & Resolver **Areas discussed:** OWNER opt-in mechanism, Role model shape,
Identity payload & provenance, Role inspectability **Mode:** advisor (research-backed, calibration tier
`minimal_decisive` — vendor philosophy "opinionated"; NON_TECHNICAL_OWNER = false)

---

## OWNER opt-in mechanism

| Option                      | Description                                                                                                                                         | Selected |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Role enum env var           | `OMNIFOCUS_MCP_ROLE=owner`, default-deny parse: only exact `owner`→OWNER; unset/empty/typo/wrong-case→AGENT. Fail-safe structural in parse logic.   | ✓        |
| Owner secret/token presence | Role inferred from possessing an owner token. Adds secret-at-rest, risks conflating with the agent-scoped HTTP token, muddies identity/authz split. |          |

**User's choice:** Role enum env var (recommended) **Notes:** Research confirmed the codebase's dominant idiom is
explicit-value env vars (`CI === 'true'`, `MCP_SKIP_AUTO_START !== 'true'`). Env var name `OMNIFOCUS_MCP_ROLE` recorded
to match `OMNIFOCUS_*` prefix; planner may finalize exact name, default-deny semantics fixed. Credential→role inference
reserved for Phase 4 (HTTP).

---

## Role model shape

| Option                           | Description                                                                                                                                               | Selected |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Bare string union                | `type Role = 'owner' \| 'agent'` in `contracts/roles.ts`. Matches `TagOperator` idiom, `never`-exhaustiveness, Phase 2 owns role→capability.              | ✓        |
| Structured capability descriptor | `{ id, capabilities, canHardDelete, ... }` on the role object. Self-describing but pulls Phase 2 policy into Phase 1; gold-plates a closed 2-role system. |          |

**User's choice:** Bare string union (recommended) **Notes:** Honors the locked ROLE-03 identity/authz separation — role
stays a dumb tag; capabilities are Phase 2's concern.

---

## Identity payload & provenance

| Option                    | Description                                                                                                                                                                                            | Selected |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Lean + principal slot     | `{ transport, roleSource, principal: string\|null }`. `roleSource` = provenance enum (explicit-env \| launchd-label \| fail-safe-default \| http-token); `principal` null on stdio, filled by Phase 4. | ✓        |
| Minimal (defer principal) | `{ transport, roleSource }` only. Zero unused fields, but Phase 4 must widen the contract and touch every site.                                                                                        |          |

**User's choice:** Lean + principal slot (recommended) **Notes:** The single nullable `principal` field turns Phase 4
from a contract reshape into a value fill-in (Success Criterion 3). Follow-through: add `principal`/token-id to logger
`SENSITIVE_KEYS` when it may hold a token-id.

---

## Role inspectability

| Option                 | Description                                                                                                                                           | Selected |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Startup log line only  | `resolved role=<R> source=<provenance>` via existing redacting stderr logger at resolve time. Owner-only channel, no leak, no new API before Phase 3. | ✓        |
| Log + system whoami op | Add a queryable whoami operation now. Agent self-confirms, but Phase 3 must make it role-aware anyway; risks rework + leak surface.                   |          |

**User's choice:** Startup log line only (recommended) **Notes:** Minimum that makes the two steps inspectable. `whoami`
op deferred to Phase 3 where the role-aware CallTool layer (with owner-field redaction) exists.

---

## Claude's Discretion

- Exact module/file layout, function signatures, and precise resolver call site in `src/index.ts` startup ordering.
- Exact log-line format/wording (stable enough for a grep-based test).
- Whether the resolver is one function returning `{ identity, role }` or two composed functions, provided identity and
  authorization stay separately inspectable.

## Deferred Ideas

- **`system` `whoami` operation** → Phase 3 (role-aware `ListTools`/`CallTool` with owner-field redaction).
- **Credential/token → role inference** → Phase 4 (HTTP per-token role, HTTP-05).
