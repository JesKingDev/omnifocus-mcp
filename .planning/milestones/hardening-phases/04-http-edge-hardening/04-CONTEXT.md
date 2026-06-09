# Phase 4: HTTP Edge Hardening - Context

**Gathered:** 2026-06-05 **Status:** Ready for planning

<domain>
## Phase Boundary

Make the HTTP/Tailscale remote path enforce the same guarantees as the stdio path: per-request bearer auth with
constant-time comparison, loopback-only bind with a fail-closed startup assertion, DNS-rebinding protection with
host/origin allowlists, **per-token role resolution**, and Tailscale Serve (never Funnel) as the remote reach.

This phase fills the Phase 3 HTTP seams that were deliberately left inert:

- `resolveHttpIdentity()` (`src/auth/role-resolver.ts`) — currently a stub returning `fail-safe-default` / `null`
  principal. Phase 4 fills it with bearer-token → role/principal lookup, setting `roleSource: 'http-token'`.
- `SessionManager` (`src/session-manager.ts`) — currently resolves role **once at construction** (the Phase 3 seam,
  D-10). Phase 4 moves role/context resolution to **per-session / per-token**, derived from the request's bearer token,
  threaded into `registerTools(server, cache, pending, role, context)` per session.

**Out of scope (other phases):**

- Write-verification of mutations (Phase 5, VERIFY-01..03).
- launchd deployment unit, Full-Disk-Access posture, and any **runtime funnel-detection guard** (Phase 6 ADR — see
  Deferred).
- Redefining policy. `decide(role, operation, target)` (Phase 2) stays the single source of truth; Phase 4 only changes
  **how the role is resolved** on the HTTP transport, not what each role may do.

</domain>

<decisions>
## Implementation Decisions

### Remote role scope (HTTP-05, SC#3) — REQUIREMENTS AMENDMENT REQUIRED

- **D-01: Owner is reachable over HTTP.** The HTTP/Tailscale path resolves **either** role from the bearer token — both
  `agent` and `owner` are reachable remotely. This is a deliberate divergence from the recommended agent-only remote.
- **D-02: This contradicts locked requirement text and MUST be amended before/with planning.** Both of the following say
  "agent-scoped" and must be reworded to "role is derived from the token; both `agent` and `owner` are reachable":
  - ROADMAP Phase 4 **Success Criterion #3** ("…agent-scoped — the same allow/deny outcomes as the stdio agent apply").
  - **HTTP-05** in `.planning/REQUIREMENTS.md` ("An HTTP connection's role is derived from its token (agent-scoped)").
    The reworded intent: the HTTP role is derived from the token and produces **the same allow/deny outcomes as the
    matching stdio role** (owner-token → owner outcomes, agent-token → agent outcomes). The planner must update
    REQUIREMENTS.md + ROADMAP.md to match this CONTEXT, or flag back if it disagrees.
- **D-03: Full owner parity over HTTP, including destructive deletes.** An owner-token HTTP connection gets the
  **complete** owner surface — hard-delete and bulk-delete included. No HTTP-transport-specific delete suppression. The
  role is the role, regardless of transport. (User chose this over "owner-over-HTTP but deletes still denied on HTTP".)

### Security obligations that follow from D-01/D-03 (destructive credential on the tailnet surface)

A destructive-capable owner token now exists on the only remotely-reachable surface. These mitigations are **locked**,
not optional, and the planner must build them:

- **D-04: Constant-time, no-early-exit compare across the whole token set.** Validate the presented bearer against every
  configured token using `crypto.timingSafeEqual` (length-safe), **accumulate** the per-token boolean results, and
  branch **once** at the end. Never `return` on first match and never short-circuit — neither _which_ token matched nor
  _whether owner vs agent exists_ may leak through timing. Replaces today's `token === this.authToken` in
  `session-manager.ts` / `http-server.ts`.
- **D-05: Fail-closed on unknown/missing token.** A request whose token matches no configured token is **rejected**
  (HTTP 401), per HTTP-01 — it does **not** silently fall back to `agent`. The fail-safe-agent default applies to _role
  ambiguity within a valid identity_, not to _authentication failure_.
- **D-06: Distinct high-entropy tokens, asserted at startup.** Agent and owner tokens MUST be different. A fail-closed
  startup assertion refuses to start if the two configured tokens are equal (or if owner-over-HTTP is enabled with a
  weak/blank owner token). Tokens are generated like `openssl rand -hex 32`.
- **D-07: Auth is mandatory in HTTP mode.** Today auth is optional (only enforced when `authToken` is set). In HTTP mode
  the server fails closed at startup if no agent token is configured — there is no unauthenticated HTTP mode.
- **D-08: Bearer required per request regardless of tailnet reachability** (HTTP-04 defense-in-depth). Tailnet
  membership is necessary but never sufficient; every request still carries and is checked for a valid bearer.

### Token → role model (HTTP-05)

- **D-09: Env-based token→role registry, separate env vars.** `MCP_AGENT_TOKEN` → `agent`, `MCP_OWNER_TOKEN` → `owner`.
  Each maps to a fixed role and a stable principal label. Simple to set in a launchd plist (Phase 6). Chosen over a
  single token (insufficient for two roles) and over a JSON map in one env var (parse surface, hand-edit friction).
- **D-10: Principal labels.** Agent-token → `principal: 'http-agent'`; owner-token → `principal: 'http-owner'`.
  `roleSource: 'http-token'` for both (the real enum value reserved in Phase 3 D-14). `principal` remains OWNER-only in
  the `system whoami` payload (Phase 3 D-13) and stays in the logger `SENSITIVE_KEYS` set.
- **D-11: Backward-compat note.** `MCP_AUTH_TOKEN` is the existing single-token env var. The planner decides whether to
  alias it to `MCP_AGENT_TOKEN` or retire it; either way the new registry is the source of truth and the old single-
  string `===` path is removed.
- **D-12: Per-session resolution seam.** Role/principal are resolved from the **request's** bearer token at session
  creation and passed into that session's `registerTools`. The dispatch gate (Phase 3 D-10) must read the
  **closure-captured** per-session role, never re-call `parseRole()` (which reads global `process.env` and cannot
  distinguish sessions/tokens).

### Loopback bind + fail-closed assertion (HTTP-02) — locked mechanism, captured for completeness

- **D-13: Default bind changes to `127.0.0.1`.** `DEFAULT_CLI_CONFIG.host` is currently `0.0.0.0` (an open-interface
  default — a direct HTTP-02 violation). Change the default to `127.0.0.1` and add a fail-closed startup assertion that
  **refuses to start** if the resolved host is any non-loopback interface. No "advanced override" escape hatch — Serve
  proxies tailnet→loopback, so loopback-only is sufficient for the remote case.

### DNS-rebinding protection (HTTP-03) — locked mechanism, implementation note

- **D-14: Implement as external middleware, not via the SDK transport options.** In `@modelcontextprotocol/sdk@1.26.0`
  the `StreamableHTTPServerTransport` options `allowedHosts` / `allowedOrigins` / `enableDnsRebindingProtection` are
  **deprecated** ("use external middleware for host/origin validation instead"). Validate `Host` and `Origin` against an
  allowlist in `http-server.ts`'s `handleRequest` before dispatch. Today CORS is `*` with no Host/Origin check.
- **D-15: Allowlist contents.** Loopback (`localhost`, `127.0.0.1[:port]`) plus the Tailscale MagicDNS hostname /
  tailnet address used by Serve. The tailnet hostname is **env-configurable** (e.g. `MCP_ALLOWED_HOSTS`) so it isn't
  hardcoded to one machine; loopback entries are always allowed. Reject (not just CORS-block) foreign Host/Origin.

### Remote access path (HTTP-04)

- **D-16: Tailscale Serve for v1; Cloudflare explicitly evaluated and DECLINED.** Commit to `tailscale serve`
  (tailnet-only, no public ingress, on-device TLS termination, identity headers layered atop the bearer). Cloudflare
  Tunnel/Access was evaluated against the locked "no open network" posture and rejected: Tunnel publishes a public
  hostname at Cloudflare's edge and decrypts TLS there (posture conflict, even behind Access); private-network mode
  bolts a second VPN client (WARP) beside the tailnet to recreate what Tailscale already provides. Record the decline
  reason so it is not re-litigated.

### Funnel prevention (HTTP-04)

- **D-17: Structural combo now; runtime funnel-detection deferred to Phase 6.** "Serve never Funnel" is enforced
  structurally — **loopback-only bind (D-13) + mandatory per-request bearer (D-07/D-08)** make a Funnel misconfiguration
  _harmless_ (a public request still needs the secret). The serve-only deployment posture is documented in the
  ADR/runbook + launchd config in Phase 6. Rationale: Serve and Funnel forward to the **same** loopback port (last
  command wins), so the server cannot reliably distinguish them at runtime; a boot-time `tailscale serve status --json`
  guard adds a fragile `tailscaled` CLI/LocalAPI dependency for little gain over the structural guarantee.

### Claude's Discretion

- Exact wording/placement of the amended SC#3 + HTTP-05 text (planner applies; intent is locked in D-02).
- Whether `MCP_AUTH_TOKEN` is aliased or retired (D-11).
- Exact env var name for the host allowlist (`MCP_ALLOWED_HOSTS` suggested) and parsing format.
- Structure of the bearer-extraction + token-lookup helper, as long as D-04 (accumulate-then-branch constant-time) and
  D-05 (fail-closed) hold.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (amendment targets)

- `.planning/REQUIREMENTS.md` §"HTTP Edge & Remote Access" — HTTP-01..05; **HTTP-05 must be amended per D-02**. Also the
  Cloudflare "Consideration" note (resolved by D-16) and VERIFY-01..03 (Phase 5, out of scope here).
- `.planning/ROADMAP.md` §"Phase 4: HTTP Edge Hardening" — goal + success criteria; **SC#3 must be amended per D-02**.
- `.planning/PROJECT.md` §Constraints / §Key Decisions — Mac-pin, Tailscale-default, no-open-network posture; "Evaluate
  Cloudflare options at HTTP-edge phase" decision (resolved by D-16).

### Prior phase decisions this phase fills/extends

- `.planning/phases/03-rolegate-agent-read-paths/03-CONTEXT.md` — D-10 (role as `registerTools` param, per-session HTTP
  seam), D-13 (owner-only `principal` redaction in `whoami`), D-14 (`roleSource` enum incl. `http-token`).
- `.planning/phases/02-operation-policy-deny-deletes-gating/02-CONTEXT.md` — `decide()` policy table; owner allows
  deletes, agent denies (relevant because D-03 gives owner-over-HTTP full delete powers).
- `.planning/phases/01-role-model-resolver/01-CONTEXT.md` — fail-safe-agent default; identity vs authorization split.

### Code map

- `.planning/codebase/CONCERNS.md` §HTTP — note: `setPendingOperationsTracker` is called by both `index.ts` and
  `session-manager.ts`; in HTTP mode the second call wins (orphaned-operation risk). Relevant if Phase 4 touches
  session/transport wiring.

### External / library

- `@modelcontextprotocol/sdk@1.26.0` `server/webStandardStreamableHttp.d.ts` — DNS-rebinding options are **deprecated**
  (D-14); use external middleware.
- `node:crypto` `timingSafeEqual` — constant-time compare primitive (D-04).
- Tailscale Serve docs (https://tailscale.com/docs/features/tailscale-serve) — Serve vs Funnel, same-port behavior
  (D-16/D-17).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `src/auth/role-resolver.ts`: `resolveHttpIdentity()` stub + `parseRole()` + `ResolvedIdentity`/`RoleSource` contracts
  are shaped for exactly this fill — extract token → role + principal, set `roleSource: 'http-token'`.
- `src/session-manager.ts`: per-session `Server` is already rebuilt per request and `registerTools(..., role, context)`
  already accepts role/context (Phase 3 D-10). The change is _moving role resolution from constructor-time to
  per-session/per-token_, not adding the parameter.
- `src/http-server.ts`: `validateAuthentication()` already extracts the `Bearer` token via regex — swap its
  `sessionManager.validateAuthToken()` (`===`) body for the constant-time registry lookup (D-04) returning role.
- `src/utils/cli.ts`: `CLIConfig` + `parseCLIArgs()` is where `host` default and token env wiring live (D-13, D-09).

### Established Patterns

- Dual-schema invariant (Zod + hand-crafted `inputSchema` + description change together) — relevant if `whoami` /
  identity surface changes shape for the now-populated HTTP `principal`.
- "One table, two call sites" / no-drift discipline (OMN-119, Phase 3 D-03/D-11) — the token→role registry should be a
  single map consumed by both auth validation and identity resolution; don't maintain two lists.
- Fail-closed defaults everywhere (Phase 1) — D-05/D-06/D-07 follow the project's existing default-deny posture.

### Integration Points

- `http-server.ts` `handleRequest` → add Host/Origin allowlist middleware (D-14) before routing.
- `http-server.ts` POST path → resolve role from token, pass to `sessionManager.createSession(sessionId, role, context)`
  (new params) → `registerTools`.
- `cli.ts` / startup → fail-closed assertions: loopback bind (D-13), auth-required (D-07), distinct tokens (D-06).

</code_context>

<specifics>
## Specific Ideas

- User explicitly chose the higher-surface option (owner-over-HTTP, full delete parity) over the safer agent-only
  recommendation, and explicitly chose to amend the conflicting requirements rather than honor them as written. The
  security mitigations (D-04..D-08) are the agreed price of that surface and are non-negotiable for the planner.
- Tokens generated via `openssl rand -hex 32` (already in the existing CLI help examples).

</specifics>

<deferred>
## Deferred Ideas

- **Runtime funnel-detection guard** (boot-time `tailscale serve status --json` check that refuses to start if the MCP
  port is Funnel-exposed) → **Phase 6 (launchd deployment ADR)**, where the launchd unit and boot preconditions live.
  Deferred because loopback bind + mandatory bearer already make Funnel harmless (D-17).
- **Cloudflare Tunnel / Access** → declined for this milestone (D-16); revisit only if a public-hostname need ever
  arises that the tailnet cannot serve. Posture conflict is the pinned reason.
- **Per-request Tailscale identity-header gate** (`Tailscale-User-Login`) → not adopted; the per-request bearer already
  proves identity for a single user. Note as a future option if multi-user or richer audit is ever needed.

</deferred>

---

_Phase: 04-http-edge-hardening_ _Context gathered: 2026-06-05_
