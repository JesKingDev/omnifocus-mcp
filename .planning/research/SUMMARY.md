# Project Research Summary

**Project:** OmniFocus MCP — JessOS Task Integration Layer (fork-hardening milestone)
**Domain:** Brownfield, security-sensitive hardening of a host-resident MCP server (least-privilege agent role, write-verification, HTTP auth, macOS launchd deployment)
**Researched:** 2026-06-03
**Confidence:** HIGH

## Executive Summary

This is not a greenfield build. The fork of `kip-d/omnifocus-mcp` already ships the four-tool unified surface, stdio + Streamable HTTP transports, Zod validation, a sandbox guard, the JXA→OmniJS execution stack, and ~2,210 tests. The milestone layers three new concerns on top without redesigning the bridge: a least-privilege agent role, per-mutation write-verification, and a hardened HTTP/Tailscale remote path — plus a least-privilege launchd deployment. Every researcher converged on one design principle: **enforcement must live at a single choke point that no alternate code path can bypass.** That principle is the direct lesson of OMN-119 (a sandbox-guard bypass on the batch-create path), and it shapes the whole build.

The recommended approach is bottom-up and strictly dependency-ordered: build the role model first, then deny-deletes (the irreversible-damage guard) enforced where single and batch operations are already normalized into one list, then a RoleGate that ships a fully usable least-privilege stdio agent, then HTTP edge hardening, then the write-verifier last (highest runtime cost, benefits from the protected role already existing). On the deployment side, use a LaunchAgent (not a daemon — Apple Events need a GUI session), pin a stable Node binary path so TCC doesn't silently revoke the Automation grant on `brew upgrade`, request Automation permission only (never Full Disk Access), bind `127.0.0.1`, front it with `tailscale serve` (never `funnel`), and require a hardened static bearer token on every HTTP request. Full OAuth 2.1 is the wrong tool for one human on her own tailnet — keep it documented as a future path, unbuilt.

The dominant risk is silent write-failure: an OmniFocus bridge write returns `success: true` while nothing persisted (confirmed in at least four places — JXA tag assignment, `reviewInterval` on new projects, `plannedDate` on create, cross-context read-after-write). The mitigation is the milestone's headline trust property: write-verification done as an **independent post-mutation read-back round-trip**, never an in-script read of the same context that may have silently no-op'd. The second cross-cutting risk is guard bypass on batch/bulk paths — enforce deny-deletes at the one funnel where single and batch ops share a loop, and add a batch-parity test. Two pre-implementation checks must be carried into planning: confirm the installed `@modelcontextprotocol/sdk ^1.25.1` bearer-auth export surface, and that SDK DNS-rebinding protection is OFF by default and must be explicitly enabled.

## Key Findings

### Recommended Stack

This milestone adds nothing to the base runtime stack — the recommended auth/network/deployment path needs no new npm runtime dependency (`timingSafeEqual`, `child_process`, `http` are all Node core). The posture (single human, her own devices, Tailscale-only remote) makes the full OAuth 2.1 resource-server flow ceremony without benefit. Two layers do the job: network identity from Tailscale, request auth from a hardened static bearer token.

**Core technologies:**
- `@modelcontextprotocol/sdk` `^1.25.1` (stay on 1.x) — MCP server + Streamable HTTP transport — v2 is pre-alpha (Q3 2026) and would force a rewrite of the `Server`/`inputSchema` integration the fork relies on.
- Tailscale (`tailscale serve` + `tailscale whois`) — the only sanctioned remote path; Serve injects verified `Tailscale-User-*` identity headers and strips client spoofs (Funnel does not). Bind `127.0.0.1` so the headers stay trustworthy.
- macOS `launchd` **LaunchAgent** (not a daemon) — runs per-user in the Aqua session so Apple Events can drive OmniFocus; pin a **stable Node binary path** so a `brew upgrade` doesn't revoke the TCC Automation grant.
- `node:crypto` `timingSafeEqual` (length-guarded) — constant-time bearer-token compare; replace any `===` compare in `src/http-server.ts`.

**Carry-forward stack checks (pre-implementation):**
- Confirm the bearer-auth export path (`requireBearerAuth` / `mcpAuthRouter`) against the **installed** `^1.25.1` — the middleware has been migrating toward a separate `@modelcontextprotocol/express` package, and the fork uses plain `node:http`. Don't import from a blog-post path; `grep` the installed `node_modules`.
- Request **Automation** permission only — never Full Disk Access (forbidden by PROJECT.md, and the wrong TCC service anyway).

### Expected Features

This is a *subsetting and hardening* exercise — the read/write primitives already exist. Features are framed as what the agent role must **expose, deny, or add**, not invent.

**Must have (table stakes):**
- **Agent role allow-list** — create, complete, drop, defer/reschedule, tag, move, flag. This *is* the milestone.
- **Deny-list enforcement** — delete, bulk_delete, tag delete/merge, perspective delete refused for the agent role (the locked least-privilege guarantee).
- **Per-mutation write-verification** — read-back + field-level diff + explicit failure on mismatch. The Core Value: "no silent write failures."
- **Core read paths** — today/forecast, overdue, flagged, available vs blocked, by-project, by-tag, inbox, count-only, date-range, and **id lookup** (load-bearing prerequisite for verification).
- **List + read native OmniFocus perspectives** — the locked JessOS working-surface decision.

**Should have (competitive differentiators):**
- **Mandatory verify-on-write as a role guarantee** — most task-MCP forks fire-and-report-success; a role that *cannot* silently fail is the trust property that lets JessOS treat OF as canonical.
- **Native-perspective-driven working surface** — read the same surface Jess curates by hand; no bespoke markdown regeneration, no drift.
- **Dry-run / preview as a first-class agent affordance** — supervisory checkpoint before commit (`dryRun` already exists).

**Defer (v1.x / v2+):**
- Read-as-named-perspective evaluation (after writes are trusted).
- Provision/repair the JessOS perspective via OmniJS `Perspective.Custom` (Pro-only).
- Markdown regeneration of today/daily-briefing (deferred by decision).
- Repetition-rule authoring in the agent hot path (bridge-heavy, high error rate).

**Deliberate anti-features:** hard delete and bulk delete (drop is the recoverable substitute), destructive tag `delete`/`merge`, agent-initiated perspective deletion, unbounded "fetch all then filter" scans, and over-promised atomic multi-write transactions (OF has no real transaction boundary across osascript spawns).

### Architecture Approach

Three new concerns slot into the existing request pipeline at distinct, transport-agnostic choke points; nothing below the AST layer changes. New code is additive (`src/auth/`, `src/policy/`, `src/verification/`) — identity ("who is this") kept separate from authorization ("what may they do"), with the policy layer holding plain lookup tables (auditable at a glance) rather than logic scattered across handlers.

**Major components:**
1. **Role model + resolver** (`auth/`) — maps a connection to OWNER or AGENT; stdio binds role at process start (env/launchd label), HTTP derives it from the per-token store.
2. **OperationPolicy + builder assertion** (`policy/`, ★2/★2b) — denies destructive ops for AGENT in the `MutationCompiler`, at the one point where single and batch ops are already normalized into the same operation list; re-asserted in `mutation-script-builder.ts` for defense-in-depth.
3. **RoleGate** (★1b) — filters `ListTools` and rejects disallowed `CallTool` at the single dispatch in `src/tools/index.ts`. Ships a fully usable least-privilege stdio agent on its own.
4. **HTTP edge auth** (★1a) — token + host/origin check *before* `transport.handleRequest`, with `enableDnsRebindingProtection` + `allowedHosts`/`allowedOrigins`.
5. **WriteVerifier** (★3) — wraps mutation execution; issues a **second, independent** read-back round-trip by identifier and annotates the response envelope `verified | unverified | skipped`.

### Critical Pitfalls

1. **Silent write-failure** — a mutation reports `success: true` but nothing persisted (tags via JXA, `reviewInterval` on new projects, `plannedDate` on create, cross-context read-after-write). Avoid by making write-verification a non-optional independent read-back round-trip; treat any swallowed `catch` on a setter as a defect; route all error detection through `isScriptError()`/`unwrapScriptOutput()`.
2. **Guard bypass on batch/bulk ops (the OMN-119 class)** — a protection on the single path is silently absent on the batch path. Avoid by defining the capability check as a single choke point every path calls, plus an explicit batch-parity test with a delete-inside-a-batch-payload vector.
3. **launchd Node denied Automation / hangs on a headless prompt** — works from Terminal, fails under `launchctl` with `-1743`, or a `brew upgrade node` silently revokes the grant. Avoid by pinning a stable Node path, pre-authorizing interactively once from the launchd context, and probing permission with a short timeout that fails loud rather than hanging.
4. **HTTP open on the network / DNS rebinding (CVE-2025-66414)** — binding `0.0.0.0`, or relying on SDK defaults where DNS-rebinding protection ships OFF. Avoid by binding `127.0.0.1` with a fail-closed startup assertion, and explicitly setting `enableDnsRebindingProtection: true` + allowlists (verify SDK >= 1.24.0).
5. **Trusting the tailnet as authentication** — "it's only reachable over Tailscale, so it's safe." Network reachability is not caller identity. Avoid by requiring a per-request bearer token validated before dispatch, scoped to the agent role, in addition to (never instead of) Tailscale. Use `serve` only, never `funnel`.

## Implications for Roadmap

Based on combined research, the suggested phase structure follows the architecture doc's strict bottom-up build order. Each layer is independently testable and shippable.

### Phase 1: Role Model + Resolver
**Rationale:** Everything else keys off a `Role`. Pure unit-testable, no dependencies.
**Delivers:** `Role` enum (OWNER | AGENT), the stdio env/launchd resolution path, and a stub HTTP resolver.
**Addresses:** Foundation for the agent-role allow-list.
**Avoids:** Sets up the single-choke-point discipline that prevents Pitfall 2.

### Phase 2: Deny-Deletes (OperationPolicy + Builder Assertion)
**Rationale:** The highest-value, lowest-surface guarantee and the irreversible-damage guard — must land before the agent role is exposed at all.
**Delivers:** A policy table consumed by the `MutationCompiler` at the single+batch normalization funnel, re-asserted in `mutation-script-builder.ts`.
**Implements:** Architecture ★2/★2b.
**Avoids:** Pitfall 2 (OMN-119 batch-bypass class) — deliverable includes the batch-parity test with a delete-inside-batch vector.

### Phase 3: RoleGate
**Rationale:** Wires role into the single `ListTools`/`CallTool` dispatch; this is the point where a fully usable least-privilege **stdio** agent ships, before any HTTP work.
**Delivers:** Role-aware tool advertisement + CallTool rejection.
**Implements:** Architecture ★1b.
**Addresses:** Agent role allow-list + deny-list enforcement (table stakes).

### Phase 4: HTTP Edge Hardening
**Rationale:** Only matters once a remote path is opened; brings the HTTP/Tailscale path up to the stdio path's guarantees.
**Delivers:** Hardened bearer token (`timingSafeEqual`), `127.0.0.1` bind with fail-closed assertion, `enableDnsRebindingProtection` + host/origin allowlists, per-token role; then `tailscale serve` (never funnel) + `whois` allowlist.
**Uses:** `@modelcontextprotocol/sdk` HTTP transport config, Tailscale, `node:crypto`.
**Avoids:** Pitfalls 4, 5, 6 — never expose remotely before auth exists.

### Phase 5: Write-Verifier
**Rationale:** The reliability promise layered on an already-safe surface; highest runtime cost (~doubles write round-trips), so build and tune last. Sequenced after the protected role exists so verified writes are promised end-to-end.
**Delivers:** An execution wrapper that performs an **independent** post-mutation read-back by identifier, field-level diff, and surfaces `verification: verified | unverified | skipped` in the response envelope.
**Implements:** Architecture ★3.
**Avoids:** Pitfall 1 (silent write-failure) — verification is a separate round-trip, never in-script.

### Phase 6: launchd Deployment + ADR
**Rationale:** Operational packaging of the hardened server; depends on the auth/role/verify stack being in place.
**Delivers:** LaunchAgent plist (stable Node path, Automation-only grant, loopback bind), pre-authorization runbook, fail-fast permission probe, and the new ADR stating the deployment posture (superseding ADR 001).
**Uses:** launchd LaunchAgent, stable Node symlink, `tccutil`/`launchctl bootstrap`.
**Avoids:** Pitfall 3 (TCC Automation denial / headless hang / Node-path revocation).

### Phase Ordering Rationale

- Dependencies run strictly bottom-up: role model → policy → gate → HTTP → verifier → deployment. Each layer is independently testable.
- Deny-deletes (Phases 2–3) is the irreversible-damage guard and lands before the agent role is exposed anywhere. Phases 1–3 ship a complete least-privilege stdio agent before any HTTP work.
- HTTP hardening precedes Tailscale exposure; never expose remotely before auth exists (Pitfall 6).
- Write-verification is sequenced after the protected role so the trust guarantee is promised end-to-end, and last because it carries the highest runtime cost.
- Two cross-cutting invariants the roadmap MUST honor regardless of phase boundaries: (1) deny-deletes/operation policy enforced at the single funnel where single+batch ops are normalized; (2) write-verification as an independent post-mutation read-back, not in-script.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (HTTP edge hardening):** confirm the installed `@modelcontextprotocol/sdk ^1.25.1` bearer-auth export surface (`requireBearerAuth`/`mcpAuthRouter` path) and the exact `enableDnsRebindingProtection`/`allowedHosts`/`allowedOrigins` config shape against the pinned version — `/gsd-plan-phase --research-phase 4`.
- **Phase 6 (launchd deployment):** TCC attribution chain for a launchd-spawned Node process is documented across community sources (MEDIUM), not one authoritative Apple doc; the pre-authorization flow and stable-path pin warrant a verification spike.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 1 (role model), Phase 2 (deny-deletes), Phase 3 (RoleGate):** verified directly against the live codebase; the choke-point pattern mirrors the existing `assertSandboxGuardAtStartup`.
- **Phase 5 (write-verifier):** the read-back pattern is already documented for typed setters (`docs/dev/SETTER-PATTERNS.md`); generalize it.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH on Tailscale/launchd (official, stable); MEDIUM on the SDK auth surface | SDK auth middleware is migrating packages; pin to what `^1.25.1` actually exports. |
| Features | HIGH | Verified against codebase ARCHITECTURE, SKILL.md, and locked PROJECT.md decisions. |
| Architecture | HIGH (one MEDIUM flagged inline) | Mapped against the live codebase; `authInfo.scopes` propagation confirmed; verify exact SDK API names before coding. |
| Pitfalls | HIGH for OmniFocus/JXA + MCP HTTP/Tailscale (codebase history + CVE); MEDIUM for launchd/TCC attribution | TCC attribution drawn from Apple Developer Forums + community write-ups, not a single authoritative doc. |

**Overall confidence:** HIGH

### Gaps to Address

- **SDK bearer-auth export path:** resolve during Phase 4 planning by `grep`-ing the installed `node_modules/@modelcontextprotocol/sdk/dist` rather than trusting documentation; decide whether adopting Express is even warranted (likely not — static token over plain `node:http` is sufficient).
- **DNS-rebinding protection default:** confirm OFF-by-default behavior in the pinned `^1.25.1` and that `enableDnsRebindingProtection` + allowlists are wired and verified (`lsof` + foreign-Origin 403 test), so CVE-2025-66414 doesn't bite via pin-and-forget.
- **launchd TCC attribution:** verify the pre-authorization flow on the actual host during Phase 6; acceptance must include a verified end-to-end write under `launchctl` with no interactive prompt, and fail-fast (not hang) when Automation is revoked.
- **Native custom-perspective evaluation:** confirm the read tool can resolve a named custom perspective's contents (not just list names), and that the target install is OmniFocus Pro, before relying on it as the working surface.

## Sources

### Primary (HIGH confidence)
- This repo's `.planning/codebase/{ARCHITECTURE,STRUCTURE,CONCERNS}.md`, `docs/dev/{LESSONS_LEARNED,JXA-VS-OMNIJS-PATTERNS,SETTER-PATTERNS}.md`, `.planning/PROJECT.md` — OMN-119 batch bypass, silent-no-op setters, error-surface fragility, locked decisions.
- [MCP authorization spec](https://modelcontextprotocol.io/specification/draft/basic/authorization) + [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) — OAuth 2.1 resource-server model, Protected Resource Metadata.
- [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) — Streamable HTTP transport, `enableDnsRebindingProtection`/`allowedHosts`, `authInfo` in handlers.
- [CVE-2025-66414 / GHSA-w48q-cv73-mx4w](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-w48q-cv73-mx4w) — DNS-rebinding protection off by default, fixed (opt-in) in 1.24.0.
- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) + [Tailscale identity](https://tailscale.com/docs/concepts/tailscale-identity) — Serve injects/strips identity headers, `tailscale whois`, Serve-vs-Funnel blast radius.
- [OmniFocus 4 Custom Perspectives (Pro)](https://support.omnigroup.com/documentation/omnifocus/universal/4.8.10/en/custom-perspectives/) — All/Any/None rule tree, Pro-only.

### Secondary (MEDIUM confidence)
- [requireBearerAuth — MCP TS SDK](https://ts.sdk.modelcontextprotocol.io/v2/functions/_modelcontextprotocol_express.auth_bearerAuth.requireBearerAuth.html) — bearer middleware semantics + `@modelcontextprotocol/express` package split (verify against installed version).
- [MCP-over-Tailscale pattern (Lee Briggs)](https://tailscale.com/blog/model-for-mcp-connectivity-lee-briggs) — bind 127.0.0.1 + bearer token.
- [Omni Automation: Perspective](https://omni-automation.com/omnifocus/perspective.html) — `Perspective.Custom` create/edit-rules/delete.

### Tertiary (LOW confidence — needs validation)
- [Apple Developer Forums #666528](https://developer.apple.com/forums/thread/666528) + [mjtsai responsible-process](https://mjtsai.com/blog/2025/07/07/the-curious-case-of-the-responsible-process/) — TCC Automation attribution to the responsible process (validate on the actual host).
- [launchd/TCC headless gotchas](https://chrispaynter.medium.com/what-to-do-when-your-macos-daemon-gets-blocked-by-tcc-dialogues-d3a1b991151f) — Node-path-change revocation, FDA not propagating to LaunchAgent children.

---
*Research completed: 2026-06-03*
*Ready for roadmap: yes*
