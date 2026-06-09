# Phase 2: Operation Policy (Deny-Deletes & Gating) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in
> CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03 **Phase:** 2-Operation Policy (Deny-Deletes & Gating) **Areas discussed:** Owner-approval
handshake, Policy representation, Deny response UX, Classification edge cases

---

## Owner-approval handshake (POLICY-07)

| Option                           | Description                                                                                                                                                                                           | Selected |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A. Preview-only + owner cmd      | Agent always gets a dry-run preview that includes a copy-paste-ready owner command, and never executes. Owner runs it from their OWNER session (ungated). Zero new state, unbypassable, low-friction. | ✓        |
| A-bare. Preview-only, no command | Same as A but the preview only describes the op; no copy-paste owner command.                                                                                                                         |          |
| B. Confirmation-token resubmit   | First call returns a payload-bound HMAC token; execution requires resubmitting it from an owner connection. Explicit per-payload audit link, but token expiry/replay surface.                         |          |

**User's choice:** A — Preview-only + copy-paste-ready owner command. **Notes:** User probed the real day-to-day flow
before deciding. Walked through a concrete scenario (JessOS morning agent proposes merging near-duplicate tags
`errand`/`errands`/`Errands`): under A the agent returns a preview + owner command, which surfaces in the daily
briefing, and the user runs it later from her OWNER-configured Claude session. Key clarifying point that settled it:
role is per-connection and fixed at startup (Phase 1), so the agent can never self-approve; "owner connection" = her own
interactive Claude (Desktop/Code) with `OMNIFOCUS_MCP_ROLE=owner`, while JessOS automation runs as AGENT. The token in B
does not save the context switch (she acts from the owner session either way), so its only benefit is a per-payload
audit link — largely covered by Phase 5 write-verification. The copy-paste owner command was added as the explicit
ergonomic lever. User: "got it — that's perfect."

---

## Policy representation (POLICY-04)

| Option                          | Description                                                                                                                                                                                  | Selected |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A. Declarative `decide()` table | One pure function over a data table returns `allow\|deny\|gate`; funnel normalizes single+batch+bulk into (op,target) items and checks each; script builder re-asserts; fail-closed default. | ✓        |
| B. Inline guards per branch     | Role checks in each `execute()` case + batch/bulk paths. Localized but batch-parity-fragile (the OMN-119 bug) and duplicated.                                                                |          |

**User's choice:** A — Declarative `decide(role, op, target)` table. **Notes:** Chosen because batch-parity becomes a
structural property (you can't normalize-then-check without covering nested ops) rather than a test you hope someone
wrote. Blended with a fail-closed default (unknown `(role, op)` → deny).

---

## Deny response UX (POLICY-05)

| Option                         | Description                                                                                                                            | Selected |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A. Reject with guidance        | Structured failure naming the substitute: `{success:false, code:'POLICY_DENY_DELETE', allowed:['complete','drop']}`. Nothing executes. | ✓        |
| B. Opaque hard reject          | Generic "not permitted" with no substitute named.                                                                                      |          |
| C. Auto-substitute delete→drop | Silently perform drop instead.                                                                                                         |          |

**User's choice:** A — Reject with guidance naming the recoverable substitute. **Notes:** C (silent auto-substitute)
cuts against the project's "no silent failures" core value; B costs the self-correction path. A gives JessOS a
programmatic way to recover (named `allowed` ops).

---

## Classification — housekeeping carve-out (POLICY-01/03)

| Option                             | Description                                                                                                             | Selected |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| A. Uniform deny                    | No agent hard-delete ever, including completed/dropped cleanup. Table stays state-free; drop/complete remain available. | ✓        |
| B. Carve-out for completed/dropped | Allow agent to hard-delete items already completed/dropped. Enables tidy but adds a state-dependent exception.          |          |

**User's choice:** A — Uniform deny, no carve-out. **Notes:** A state-dependent exception would complicate the pure
`decide()` function and the batch-parity guarantee. The full taxonomy table (deny / allow / gate) was presented and
accepted as the framing; perspective-delete is classified `gate` but forward-declared (no such op exists yet).

---

## Claude's Discretion

- Module layout / file paths for `decide()` + the policy table (suggested `src/auth/operation-policy.ts`).
- Exact error `code` strings and structured-result shape (stable enough for tests).
- Exact preview + owner-command format.
- Internal representation of the normalized `(operation, target)` item list and the table data structure.

## Deferred Ideas

- HMAC confirmation-token approval flow — documented alternative to D-01 if agent-side execution + per-payload audit is
  ever needed. Not this milestone.
- Perspective-delete operation itself — not implemented; already classified `gate` for when it lands.
- `system` `whoami` / role-surfacing op — already deferred to Phase 3 (from Phase 1).
