# OmniFocus MCP — JessOS Task Integration Layer

## What This Is

A hardened fork of [kip-d/omnifocus-mcp](https://github.com/kip-d/omnifocus-mcp) that makes OmniFocus the
**canonical task store** for JessOS (the Obsidian supervisory vault). It exposes a least-privilege agent role to a
host-resident MCP server on the Mac, so an AI agent can read and write OmniFocus tasks safely while JessOS stays
supervisory on top. This supersedes the prior Obsidian Tasks plugin store (ADR 001).

## Core Value

The agent can read and **write** OmniFocus tasks safely — no silent write failures, no destructive deletes — so JessOS
can trust OmniFocus as the source of truth. If everything else fails, write-safety and least-privilege must hold.

## Requirements

### Validated

<!-- Inherited from the kip-d fork — shipped, tested (~2,210 tests), relied upon. -->

- ✓ Unified MCP tool surface (`omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system`) — existing
- ✓ JXA outer-script + OmniJS bridge execution for live OmniFocus automation — existing
- ✓ Dual-schema validation (Zod server-side + `inputSchema` MCP advertisement) — existing
- ✓ Injection-hardened input validation / normalize-then-strict input layer — existing
- ✓ TTL caching layer (tasks/projects/tags/analytics) — existing
- ✓ stdio transport over the MCP SDK with graceful lifecycle/close — existing
- ✓ HTTP transport present in the fork base (to be hardened, not built from scratch) — existing

### Active

<!-- This milestone. Building toward these. Hypotheses until shipped + validated. -->

- [ ] Define and enforce a least-privilege **agent role** distinct from the full owner tool surface
- [ ] **Remove destructive deletes** from the agent role — complete/drop only, recoverable in OmniFocus
- [ ] Add **HTTP authentication** to the HTTP transport (agent isolation)
- [ ] **launchd deployment** with least privilege — Automation permission only, no Full Disk Access, no open network
- [ ] **Write-verification step** that confirms each mutation persisted (defends against silent-write-failure)
- [ ] **Native OmniFocus perspectives** as the JessOS working surface (today / daily-briefing equivalents)
- [ ] New **ADR** stating the deployment posture and security model, superseding ADR 001

### Out of Scope

<!-- Explicit boundaries with reasoning, to prevent re-adding. -->

- Vault-checkbox migration into OmniFocus — **later milestone**; trust writes before migrating real data
- `[TKWW]` Action Tracker work bridge → OmniFocus — **later/follow-up**; depends on Gemini, which has been unreliable;
  its eventual deprecation/replacement is a separate effort
  - *Idea to revisit when addressed:* the tracker exists only because of limited corporate Google Workspace integration.
    Before rebuilding it, check whether **Fantastical** already surfaces the work account's **Google Tasks**. If so, use
    Gmail's built-in Google Tasks to capture a task (with the email link + due date) on the work side, and have this
    OmniFocus integration **pull new work Google Tasks into OmniFocus** as the canonical store — no Gemini, no custom
    work bridge.
- Markdown surface **regeneration** (regenerating `today.md` / `daily-briefing.md` from OF) — **deferred**; start with
  native OF perspectives and only add markdown regeneration if still needed
- **Cloud hosting** (Railway, containers, etc.) — ruled out; the server is Mac-pinned via `osascript` / Apple Events
  and cannot run in a Linux container
- General-purpose feature expansion of the upstream tool — not this milestone; focus is hardening for the agent role

## Context

- **Origin:** fork of `kip-d/omnifocus-mcp`, chosen over 7 alternatives for its test rigor (~2,210 tests),
  injection-hardened Zod validation, and built-in HTTP transport. Tools ruled out:
  jqlts1/omnifocus-mcp-enhanced (open undisclosed security issue), vitalyrodnenko (correctness bugs, quiet),
  BjoernSchotte (mock SDK, abandoned).
- **Root problem being solved:** JessOS task capture friction — markdown-in-a-vault doesn't stick on phone,
  voice/hands-busy, or from-message moments. OmniFocus as canonical store fixes capture; JessOS supervises.
- **Architecture A:** OmniFocus = canonical store (capture + home + working surface); JessOS = supervisory layer.
- **Transport reality:** OmniFocus has no cloud API. The live app is driven host-only via `osascript`/JXA/AppleScript,
  which cannot run in a Linux container. This is why the server is Mac-resident.
- **Codebase map:** see `.planning/codebase/` (STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, INTEGRATIONS,
  CONCERNS) — mapped 2026-06-03.
- **Decision trail:** `~/vaults/jess-os/_ai-drafts/pointers/omnifocus-task-system.md`.
- **Related decisions:** ADR 001 (obsidian-tasks-plugin, to be superseded), ADR 003 (integration-policy), ADR 004
  (integration-policy OAuth amendment — security/maintainability bar).

## Constraints

- **Platform**: macOS-only — the server drives OmniFocus via `osascript`/Apple Events; no containerizing, no cloud.
- **Deployment posture**: localhost/stdio is the default (agent on the Mac); Tailscale tailnet is the *only* remote
  path, for Jess's own devices; cloud is excluded — because the server is Mac-pinned.
- **Security**: least privilege — Automation permission only, no Full Disk Access, no open network; agent role cannot
  hard-delete; HTTP transport requires auth.
- **Tech stack**: TypeScript only (never create `.js` files); MCP SDK over stdio/HTTP; JXA + OmniJS bridge.
- **Reliability**: every agent mutation must be write-verified — silent-write-failure is a known OmniFocus-bridge risk.
- **Compatibility**: preserve the upstream fork's test rig and validation; harden, don't rewrite.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork kip-d/omnifocus-mcp | Strongest test rigor, hardened validation, built-in HTTP transport | — Pending |
| OmniFocus as canonical store (Architecture A) | Fixes JessOS capture friction; JessOS stays supervisory | — Pending |
| Host-resident server, Mac-pinned | `osascript`/Apple Events can't be containerized or cloud-hosted | — Pending |
| localhost/stdio default; Tailscale+auth for remote; no cloud | Least privilege + Mac pin; minimal attack surface | — Pending |
| Agent role: remove content deletes (task/project/folder hard + bulk delete) | Least privilege; protects real data from silent-write-failure damage | — Pending |
| Agent role: gate (not remove) tag delete/merge + perspective delete via dry-run + owner approval | Structural ops don't destroy task content and are valued setup hygiene (analyze tool recommends merges); OWNER keeps full `tag_manage` | — Pending |
| Evaluate Cloudflare options at HTTP-edge phase | jessicaking.com is on Cloudflare; Tunnel/Access may help, but must not violate Mac-pin / Tailscale-default posture | — Pending |
| Native OF perspectives first; markdown regeneration deferred | Less bespoke code; add regeneration only if still needed | — Pending |
| [TKWW] work bridge out of this milestone | Smaller blast radius; Gemini dependency unreliable | — Pending |
| Vault-checkbox migration deferred to later milestone | Trust verified writes before migrating real data | — Pending |
| GSD as the build engine | Multi-phase build; verify gates catch silent-write-failure; persistent state | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-03 after initialization*
