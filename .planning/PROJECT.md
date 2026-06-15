# OmniFocus MCP — JessOS Task Integration Layer

## What This Is

A hardened fork of [kip-d/omnifocus-mcp](https://github.com/kip-d/omnifocus-mcp) that makes OmniFocus the **canonical
task store** for JessOS (the Obsidian supervisory vault). It exposes a least-privilege agent role to a host-resident MCP
server on the Mac, so an AI agent can read and write OmniFocus tasks safely while JessOS stays supervisory on top. This
supersedes the prior Obsidian Tasks plugin store (ADR 001).

## Core Value

The agent can read and **write** OmniFocus tasks safely — no silent write failures, no destructive deletes — so JessOS
can trust OmniFocus as the source of truth. If everything else fails, write-safety and least-privilege must hold.

## Current Milestone: agent-workflow — Agent Workflow System

**Goal:** Make OmniFocus the single source of truth for tasks and give agents a safe capture → route → execute → review
loop on top of it — with session archaeology so buried open loops stop dying at context-window boundaries.

**Target features:**

- **OmniFocus capability discovery (Phase 1, gates everything else)** — learn what OmniFocus does natively (tagging,
  filtering, custom fields, perspectives, data model, capture, automation) before designing any workflow, so we don't
  build custom code for solved problems.
- **Frictionless capture** — dump messy items into the inbox; the agent routes them later.
- **Task routing / project inference** — match an existing project, else infer from the vault, else leave in inbox.
- **Permission gating** — async runs act only on `agent-okay`-tagged tasks; sync sessions prompt before creating, with
  an allow-all-this-session option (mirrors the Jira-creation flow).
- **Review loops** — agent flags work into a today view, distinguishing review-output (verify work done) from
  review-capture/archaeology (verify a task the agent decided should exist).
- **Session archaeology** — summarize-then-approve scan of the last 7 days of active Claude Code sessions; approved open
  loops become tasks in the right project, tagged `archaeology`.
- **Auto-capture in live sessions** — capture concrete blockers in real time (with permission), no archaeology tag.
- **Session lineage** — store the originating Claude Code session ID in task notes so context travels with the task.

**Architecture stance:** OmniFocus = single source of truth (Obsidian tasks retired entirely); Obsidian = work-artifact
layer only (research, drafts, specs); no bidirectional sync — agents read OmniFocus directly. MVP runs on-demand (manual
trigger) to prove gating + routing; the hardened version polls every 15 min via n8n.

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
- ✓ **Remove destructive deletes** from the agent role — deny single/batch/bulk deletes, gate structural tag/perspective
  ops behind owner approval, all at the single mutation funnel plus a defense-in-depth re-assertion in the script
  builders (POLICY-01…07) — _Validated in Phase 2: Operation Policy (Deny-Deletes & Gating)_

<!-- hardening milestone — shipped 2026-06-09. -->

- ✓ **Least-privilege agent role** — a connection fail-safe-resolves to exactly one role (OWNER | AGENT) before any
  dispatch, identity separated from authorization (ROLE-01…03) — _Phase 1: Role Model & Resolver (hardening)_
- ✓ **RoleGate** — role-aware tool advertisement + dispatch-point enforcement ship a usable least-privilege stdio agent
  with its full core read surface, including native OmniFocus perspectives (GATE-01…03, READ-01…03) — _Phase 3: RoleGate
  & Agent Read Paths (hardening)_
- ✓ **HTTP edge hardening** — per-request bearer auth (constant-time), loopback-only fail-closed bind, DNS-rebinding
  protection, Tailscale `serve`-only, owner+agent token parity with stdio (HTTP-01…05) — _Phase 4: HTTP Edge Hardening
  (hardening)_
- ✓ **Write-verification** — every agent mutation confirmed by an independent post-mutation read-back round-trip with a
  field-level diff and a reported `verified | unverified | skipped` status (VERIFY-01…03) — _Phase 5: Write-Verifier
  (hardening)_
- ✓ **Least-privilege launchd deployment + ADR** — LaunchAgent on a pinned Developer-ID Node path, Automation-only
  grant, fail-fast Automation probe, and ADR-005 superseding ADR 001 (DEPLOY-01…04) — _Phase 6: launchd Deployment & ADR
  (hardening); on-host spikes S4/S5/S6 + Phase 4 Tailscale-Serve check deferred, risk-accepted (see STATE.md Deferred
  Items)_

<!-- agent-workflow milestone — in progress. -->

- ✓ **On-demand inbox routing** — the `route-inbox-to-projects` skill runs a two-pass summarize-then-approve loop that
  matches an agent-okay inbox item to an existing project, else infers + creates from vault `omnifocus-project`
  frontmatter, else leaves it stamped with the durable `routing-unplaced` marker; runnable on demand via a manual
  trigger (ROUTE-01…04, TRIG-01) — _Validated in Phase 3: Routing & On-Demand Trigger (spec + live write-path proofs;
  end-to-end UAT tracked in 03-HUMAN-UAT.md)_

### Active

<!-- agent-workflow milestone — started 2026-06-11. Full REQ-IDs + acceptance criteria in REQUIREMENTS.md. -->

**Capability discovery (gates the rest):**

- [ ] Capability-discovery report documenting OmniFocus native behavior (tagging/filtering/custom fields, perspectives,
      data model + sequencing/dependencies, capture, automation) with a native-vs-MCP-value call per area (DISC-01…02)

**Capture & routing:**

- [ ] Frictionless inbox capture — dump items without deciding anything (CAP-01)
- [x] Agent routes inbox items: match existing project, else infer from the vault, else create project+task, else leave
      in inbox (ROUTE-01…04) — _validated in Phase 3 (see Validated above)_

**Permission gating:**

- [ ] Async runs act only on `agent-okay`-tagged tasks; sync sessions prompt before creating with allow-all-this-session
      (PERM-01…02)

**Review & archaeology:**

- [ ] Review-loop flagging into a today view, distinguishing review-output from review-capture (REVIEW-01…02)
- [ ] Session archaeology — summarize-then-approve scan of last 7 days of active CC sessions; approved loops become
      `archaeology`-tagged tasks in the right project (ARCH-01…03)
- [ ] Auto-capture concrete blockers mid-session with permission, no archaeology tag (LIVE-01)
- [ ] Session lineage — originating CC session ID stored in task notes (LINE-01)

**Surfaces & migration (carried from hardening):**

- [ ] Resolve a named custom perspective's **contents** through the read tool (READAS-01)
- [ ] **Provision/repair** the JessOS custom perspective via OmniJS `Perspective.Custom` (PROV-01, OmniFocus Pro)
- [ ] One-time **migration** of existing Obsidian vault checkboxes into OmniFocus, now that writes are
      verified-trustworthy (MIG-01)

<!-- Deferred out of this milestone: SURF-01 (markdown regen — OF is the surface now) and WORK-01 (Google Tasks pull —
not in scope; sync-work-tasks skill already exists). Both remain candidates for a later milestone. -->

**n8n 15-min polling** is the hardened follow-up to the on-demand MVP — likely a later phase or its own milestone.

### Out of Scope

<!-- Explicit boundaries with reasoning, to prevent re-adding. -->

- Vault-checkbox migration into OmniFocus — **later milestone**; trust writes before migrating real data
- `[TKWW]` Action Tracker work bridge → OmniFocus — **later/follow-up**; depends on Gemini, which has been unreliable;
  its eventual deprecation/replacement is a separate effort
  - _Idea to revisit when addressed:_ the tracker exists only because of limited corporate Google Workspace integration.
    Before rebuilding it, check whether **Fantastical** already surfaces the work account's **Google Tasks**. If so, use
    Gmail's built-in Google Tasks to capture a task (with the email link + due date) on the work side, and have this
    OmniFocus integration **pull new work Google Tasks into OmniFocus** as the canonical store — no Gemini, no custom
    work bridge.
- Markdown surface **regeneration** (regenerating `today.md` / `daily-briefing.md` from OF) — **deferred**; start with
  native OF perspectives and only add markdown regeneration if still needed
- **Cloud hosting** (Railway, containers, etc.) — ruled out; the server is Mac-pinned via `osascript` / Apple Events and
  cannot run in a Linux container
- General-purpose feature expansion of the upstream tool — not this milestone; focus is hardening for the agent role

## Context

- **Origin:** fork of `kip-d/omnifocus-mcp`, chosen over 7 alternatives for its test rigor (~2,210 tests),
  injection-hardened Zod validation, and built-in HTTP transport. Tools ruled out: jqlts1/omnifocus-mcp-enhanced (open
  undisclosed security issue), vitalyrodnenko (correctness bugs, quiet), BjoernSchotte (mock SDK, abandoned).
- **Root problem being solved:** JessOS task capture friction — markdown-in-a-vault doesn't stick on phone,
  voice/hands-busy, or from-message moments. OmniFocus as canonical store fixes capture; JessOS supervises.
- **Architecture A:** OmniFocus = canonical store (capture + home + working surface); JessOS = supervisory layer.
- **Transport reality:** OmniFocus has no cloud API. The live app is driven host-only via `osascript`/JXA/AppleScript,
  which cannot run in a Linux container. This is why the server is Mac-resident.
- **Shipped state (hardening, 2026-06-09):** 6 phases, 23 plans. Full unit suite at 2375 tests green; Phase 5 verified
  live against real OmniFocus. New artifacts: `src/auth/role-resolver.ts`, `src/auth/token-registry.ts`,
  `src/tools/unified/verifier/`, `src/utils/automation-probe.ts`, `deploy/launchd/` (plist + Makefile + RUNBOOK),
  `docs/adr/ADR-005-deployment-posture.md`. Deferred verification debt tracked in STATE.md.
- **Codebase map:** see `.planning/codebase/` (STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, INTEGRATIONS,
  CONCERNS) — mapped 2026-06-03.
- **Decision trail:** `~/vaults/jess-os/_ai-drafts/pointers/omnifocus-task-system.md`.
- **Related decisions:** ADR 001 (obsidian-tasks-plugin, to be superseded), ADR 003 (integration-policy), ADR 004
  (integration-policy OAuth amendment — security/maintainability bar).

## Constraints

- **Platform**: macOS-only — the server drives OmniFocus via `osascript`/Apple Events; no containerizing, no cloud.
- **Deployment posture**: localhost/stdio is the default (agent on the Mac); Tailscale tailnet is the _only_ remote
  path, for Jess's own devices; cloud is excluded — because the server is Mac-pinned.
- **Security**: least privilege — Automation permission only, no Full Disk Access, no open network; agent role cannot
  hard-delete; HTTP transport requires auth.
- **Tech stack**: TypeScript only (never create `.js` files); MCP SDK over stdio/HTTP; JXA + OmniJS bridge.
- **Reliability**: every agent mutation must be write-verified — silent-write-failure is a known OmniFocus-bridge risk.
- **Compatibility**: preserve the upstream fork's test rig and validation; harden, don't rewrite.

## Key Decisions

| Decision                                                                                                    | Rationale                                                                                                                                                                                                                                | Outcome                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Fork kip-d/omnifocus-mcp                                                                                    | Strongest test rigor, hardened validation, built-in HTTP transport                                                                                                                                                                       | ✓ Good — relied on the test rig throughout (2375 tests)                 |
| OmniFocus as canonical store (Architecture A)                                                               | Fixes JessOS capture friction; JessOS stays supervisory                                                                                                                                                                                  | ✓ Built — agent read+write path shipped                                 |
| Host-resident server, Mac-pinned                                                                            | `osascript`/Apple Events can't be containerized or cloud-hosted                                                                                                                                                                          | ✓ Shipped — Phase 6 LaunchAgent                                         |
| localhost/stdio default; Tailscale+auth for remote; no cloud                                                | Least privilege + Mac pin; minimal attack surface                                                                                                                                                                                        | ✓ Shipped — Phase 4 (HTTP host-verify deferred)                         |
| Agent role: remove content deletes (task/project/folder hard + bulk delete)                                 | Least privilege; protects real data from silent-write-failure damage                                                                                                                                                                     | ✓ Validated — Phase 2                                                   |
| Agent role: gate (not remove) tag delete/merge + perspective delete via dry-run + owner approval            | Structural ops don't destroy task content and are valued setup hygiene (analyze tool recommends merges); OWNER keeps full `tag_manage`                                                                                                   | ✓ Validated — Phase 2                                                   |
| Cloudflare evaluated at HTTP-edge phase — DECLINED; Tailscale Serve adopted                                 | Tunnel publishes a public hostname + decrypts TLS at the edge (violates no-open-network even behind Access); private-network mode duplicates the tailnet via WARP. No demonstrable win for one user reaching her own Mac (Phase 4 D-16). | ✓ Resolved                                                              |
| Write-verification = independent post-mutation read-back (separate `osascript` spawn), never in-script read | Silent-write-failure is a known OmniFocus-bridge risk; an in-script read could pass on stale state                                                                                                                                       | ✓ Shipped — Phase 5 (live-verified)                                     |
| Developer-ID Node pinning for TCC grant survival (vs Homebrew node)                                         | Content-independent designated requirement keeps the Automation grant across `brew upgrade`; Homebrew node breaks the grant on version bump                                                                                              | ✓ Adopted — Phase 6 (host spike S4 deferred)                            |
| ADR-005 supersedes ADR 001 (OmniFocus, not Obsidian Tasks plugin, is canonical)                             | Records the deployment posture + security model; bidirectional supersede link in the vault                                                                                                                                               | ✓ Shipped — Phase 6                                                     |
| Native OF perspectives first; markdown regeneration deferred                                                | Less bespoke code; add regeneration only if still needed                                                                                                                                                                                 | ✓ Good — perspectives list/read shipped (Phase 3); regen still deferred |
| [TKWW] work bridge out of this milestone                                                                    | Smaller blast radius; Gemini dependency unreliable                                                                                                                                                                                       | — Deferred to next milestone (WORK-01)                                  |
| Vault-checkbox migration deferred to later milestone                                                        | Trust verified writes before migrating real data                                                                                                                                                                                         | — Deferred; writes now verified, candidate for next milestone (MIG-01)  |
| GSD as the build engine                                                                                     | Multi-phase build; verify gates catch silent-write-failure; persistent state                                                                                                                                                             | ✓ Good — 6 phases shipped through GSD gates                             |

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

_Last updated: 2026-06-15 — Phase 3 (Routing & On-Demand Trigger) complete: the `route-inbox-to-projects` skill plus the
proven routing write paths deliver the MVP match→infer→create→leave loop (ROUTE-01…04, TRIG-01); end-to-end UAT tracked
in 03-HUMAN-UAT.md. Started the `agent-workflow` milestone 2026-06-11 (OmniFocus as single source of truth + agent
capture/route/execute/review loop + session archaeology). Carried in: READAS-01, PROV-01, MIG-01. Deferred: SURF-01,
WORK-01. Prior `hardening` milestone shipped 2026-06-09 (6 phases)._
