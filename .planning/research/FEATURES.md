# Feature Research

**Domain:** Least-privilege AI-agent role over OmniFocus as a canonical personal task store (JessOS supervisory layer)
**Researched:** 2026-06-03
**Confidence:** HIGH

> Scope note: this is a *subsetting and hardening* milestone on an existing fork, not a greenfield build. The upstream
> `omnifocus_read` / `omnifocus_write` / `omnifocus_analyze` / `system` tools already implement nearly every read and
> write primitive (verified against `.planning/codebase/ARCHITECTURE.md` and `docs/skills/omnifocus-assistant/SKILL.md`).
> The features below are therefore framed as **what the agent role must expose, deny, or add**, not as things to invent.
> "Complexity" reflects the work to scope/gate/verify a capability for the agent role, not to build it from zero.

## Feature Landscape

### Table Stakes (the agent role is incomplete without these)

#### Read paths

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Today / forecast view | Core supervisory question "what's on my plate now" | LOW | `mode: "today"`; native forecast = due+defer+flagged for the day. Exists. |
| Overdue | Trust erodes if the agent can't see what's late | LOW | `mode: "overdue"`. Exists. |
| Flagged | GTD "engage" priority axis | LOW | `mode: "flagged"`. Exists. |
| Available vs blocked | Distinguish actionable now from waiting/deferred/sequenced | MEDIUM | `mode: "available"` and `mode: "blocked"`; availability is the single most load-bearing filter for an agent and the most error-prone (sequential projects, defer dates, on-hold). Exists; verify semantics under the agent role. |
| By-project | Scope work, ensure each active project has a next action | LOW | `filters: { project: "..." }`, `type: "projects"`. Exists. |
| By-tag (context) | GTD context filtering (@computer, @waiting-for, @errands) | LOW | `filters: { tags: { any: [...] } }` / `none` for exclusion. Exists. |
| Count-only | "How many" answers without paying for a full fetch | LOW | `countOnly: true`, ~33x faster. Cheap supervisory pings. Exists. |
| Inbox | Capture review — the whole point of OF-as-capture-store | LOW | `mode: "inbox"`. Exists. |
| Date-range queries (due/defer/planned between) | "This week", "next 7 days", reschedule candidates | LOW | `dueDate: { between: [...] }`, `mode: "upcoming"` w/ `daysAhead`. Exists. |
| ID lookup / read-back of a single task | **Prerequisite for write-verification** (see below) | LOW | `filters: { id: "..." }`. Exists; becomes load-bearing for the verify step. |
| Single-level AND/OR/NOT | Compose context + availability ("available AND not @waiting-for") | LOW | One level only, no nesting. Adequate for agent queries. Exists. |

#### Write paths (the least-privilege allow-list)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Create task | Capture is the root problem being solved | LOW | `operation: "create"`. Recoverable, non-destructive. Allow. |
| Complete | Mark done — the most common agent write | LOW | `operation: "complete"`; reversible in OF (uncheck). Allow. |
| Drop | Abandon without deleting — least-privilege replacement for delete | LOW | OF "dropped" status is recoverable; this is the deliberate substitute for hard delete. Confirm the agent role exposes drop and that it maps to OF drop, not delete. |
| Defer / reschedule | Move defer/due/planned dates — bulk of "tidy my system" work | LOW | `update` with `deferDate`/`dueDate`/`plannedDate` + the `clear*` variants. Allow. |
| Tag (add/remove/replace) | Context assignment, @waiting-for tracking | MEDIUM | `addTags`/`removeTags`/`tags`. Must go through OmniJS bridge (`addTag()`) — JXA tag assignment silently no-ops, which is itself a silent-write-failure vector. Allow, but verification is mandatory here. |
| Move (project / parent) | Inbox→project, re-parent subtasks | MEDIUM | `update` with `project` or `parentTaskId` (incl. `null` to inbox). Bridge-required (task movement). Allow. |
| Flag / unflag | Priority signal the agent acts on and sets | LOW | `update` with `flagged`. Allow. |
| Set estimate / planned date | Capacity planning, daily-plan enrichment | LOW | `estimatedMinutes`, `plannedDate`. Allow. |
| Create project / set review interval | Multi-step outcomes; keep review cycle current | MEDIUM | `create target: project`, `reviewInterval`. Allow; lower frequency. |

#### Write-verification (the milestone's defining table stake)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Read-back confirmation per mutation | Core value: "no silent write failures." OF bridge is a known silent-no-op surface (tags via JXA, typed-value setters). | MEDIUM-HIGH | After each mutation, re-read the target by id and assert the change landed. Already a documented pattern for typed setters (`docs/dev/SETTER-PATTERNS.md`); generalize it to every agent mutation. |
| ID confirmation on create | Caller must learn the new id to verify and to chain operations | LOW | Mutation responses already return ids; assert non-empty before reporting success. |
| Field-level diff (intended vs persisted) | Distinguish "wrote" from "wrote what I meant" — partial-apply detection (e.g. batch project-assign known to silently skip) | MEDIUM | Compare requested `changes` against post-write read-back; report mismatches as failures, not successes. |
| Explicit failure on verification mismatch | An agent that reports false success is worse than one that errors | MEDIUM | Verification failure must surface as a tool error (categorized, like the existing taxonomy), never a success envelope. This is the whole point. |

#### Surfacing via native OmniFocus perspectives

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| List existing perspectives | JessOS working surface = native OF perspectives; must enumerate them | LOW | `type: "perspectives"` exists (cached). |
| Read tasks *as seen through* a named perspective | "Today" / "daily-briefing" surfaces must match what OF shows the user | MEDIUM | Confirm the agent can resolve a custom perspective's contents. Custom-perspective rule trees (All/Any/None over availability, flagged, tags, dates, status) are Pro-only and expressible via OmniJS `Perspective.Custom`. Verify the read tool can evaluate or mirror a named perspective, not just list names. |

### Differentiators (align with Core Value: trustworthy safe writes)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Mandatory verify-on-write as a role guarantee | Most task-MCP servers fire-and-report-success. A role that *cannot* silently fail is the headline trust property for canonical-store use. | MEDIUM-HIGH | This is the differentiator, not just a table stake — it's what lets JessOS trust OF as source of truth. Builds on the read-back primitive above. |
| Native-perspective–driven working surface | Zero bespoke markdown regeneration; the agent reads the same surface Jess curates by hand. Less code, no drift. | MEDIUM | Locked decision. Differentiates against forks that reinvent "today" logic and diverge from the user's real OF setup. |
| Provision/repair a JessOS perspective via OmniJS | Agent can create or correct the custom perspective definition (rule tree) that backs the working surface, idempotently. | MEDIUM | `Perspective.Custom` supports create / edit-rules / delete (Pro). Optional: keeps the surface self-healing. Gate carefully — perspective edits are a write. |
| Dry-run / preview on agent writes | Let JessOS preview an agent's intended mutation before committing — supervisory checkpoint. | LOW | `dryRun: "true"` already exists on batch/create/update. Expose it as a first-class agent affordance. |
| Smart-suggest / engage narrowing | "What should I do now" via context→time→energy→priority. Higher-value than raw lists for a supervisor. | LOW | `mode: "smart_suggest"` exists. Read-only, safe, high signal. |
| Count-only health pings | Cheap, frequent "is the system healthy" checks (inbox size, overdue count) for proactive supervision. | LOW | Composes count-only reads with the SKILL.md health thresholds. |

### Anti-Features (deliberately NOT built / NOT exposed to the agent role)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Hard delete (`delete`) | "Clean up" / symmetry with create | Irreversible loss of canonical data; a silent-write or a bad agent inference becomes unrecoverable. Violates the locked least-privilege rule. | **Drop** (recoverable) for tasks; on-hold/drop for projects. Never expose delete in the agent role. |
| Bulk delete (`bulk_delete`) | "Delete these 5" | Same as delete, multiplied; one bad id set wipes a swath. The upstream `bulk_delete` exists for the owner surface, not the agent. | Bulk **complete** or bulk **drop** if a destructive-looking batch is genuinely needed; otherwise deny. |
| Tag delete / destructive tag_manage (delete/merge) | "Tidy my tags" | `delete`/`merge` are lossy across the whole database, not scoped to one task; high blast radius from a single agent call. | Allow non-destructive tag ops (create, nest, reparent, add/remove on a task). Deny tag `delete`/`merge` in the agent role. |
| Markdown regeneration of today.md / daily-briefing.md | "Mirror OF back into the vault" | Re-introduces a second source of truth and drift; explicitly deferred in PROJECT.md. Native perspectives are the surface. | Native OF perspectives first; add regeneration only if a concrete need survives. |
| Unbounded / unfiltered "fetch all then filter" | Simpler agent prompts | `whose()`/`where()` and full scans are 25s+ on 1000+ tasks; also defeats least-privilege by pulling the whole DB. | Server-side filters, `countOnly`, sort-before-limit, pagination. Already the established pattern. |
| Atomic multi-write transactions across the DB | "All-or-nothing safety" | OF has no real transaction boundary across osascript spawns; `atomicOperation` is best-effort within one batch, not a DB transaction. Over-promising atomicity is its own silent-failure trap. | Per-mutation verify + explicit failure reporting; keep batches small and `stopOnError`. |
| Agent-initiated perspective *deletion* | Symmetry with provision | Deleting a user's curated perspective is destructive to the working surface itself. | Allow create/edit-rules for the JessOS-owned perspective only; never delete user perspectives. |
| Repetition-rule authoring as a core agent path | "Make this repeat" | Recurrence is bridge-heavy and easy to mis-set (fixed vs from-completion); low-frequency, high-error. | Keep available but out of the hot path; require verify + read-back when used. |

## Feature Dependencies

```
ID lookup / read-back (read primitive)
    └──required by──> Write-verification (read-back confirmation)
                           └──required by──> Mandatory verify-on-write role guarantee  [differentiator]
                                                 └──required by──> "OF as trusted canonical store"

Least-privilege write allow-list (create/complete/drop/defer/tag/move/flag)
    └──depends on──> Agent role definition (allow-list distinct from owner surface)
    └──depends on──> Deny-list enforcement (delete / bulk_delete / tag delete+merge)

Tag write  ──requires──> OmniJS bridge (addTag) ──because──> JXA tag assignment silently no-ops
Move write ──requires──> OmniJS bridge (task movement)
   (both ──require──> per-mutation verification, since bridge ops are the main silent-no-op surface)

List perspectives ──enhances──> Read-as-perspective (named working surface)
                                     └──enhances──> Native-perspective working surface  [differentiator]
Provision/repair perspective ──requires──> OmniJS Perspective.Custom (Pro) + write gating

Drop  ──replaces──> Hard delete   (least-privilege substitution; conflict is intentional)
```

### Dependency Notes

- **Write-verification requires the ID-lookup read primitive:** you cannot confirm persistence without re-reading the
  target. This makes a humble read filter load-bearing for the whole trust story — sequence it before the verify work.
- **Tag and move writes require the OmniJS bridge:** JXA `task.tags = …` / `addTags()` silently no-op
  (CLAUDE.md, ARCHITECTURE.md). These are exactly where silent-write-failure bites, so verification is non-optional for
  them, not a nice-to-have.
- **Drop deliberately conflicts with (replaces) hard delete:** the agent role gains drop *and* loses delete in the same
  decision. Don't expose both; the recoverable path supersedes the destructive one.
- **Native-perspective surfacing enhances, then depends on, perspective enumeration:** listing exists; reading tasks
  *as a named perspective sees them* is the gap to confirm. Provisioning the perspective definition is a further,
  optional, write-gated step.
- **Custom perspectives are Pro-only:** the rule tree (All/Any/None over availability, flagged, tags, dates, status)
  is an OmniFocus Pro feature, authored via OmniJS `Perspective.Custom`. Confirm the target install is Pro before
  relying on a custom-perspective working surface.

## MVP Definition

### Launch With (v1) — the agent role itself

- [ ] **Agent role allow-list** — create, complete, drop, defer/reschedule, tag (add/remove/replace), move, flag — essential; this *is* the milestone.
- [ ] **Deny-list enforcement** — delete, bulk_delete, tag delete/merge, perspective delete refused for the agent role — essential; the locked least-privilege guarantee.
- [ ] **Per-mutation write-verification** — read-back + field diff + explicit failure on mismatch — essential; the Core Value ("no silent write failures").
- [ ] **Core read paths** — today/forecast, overdue, flagged, available vs blocked, by-project, by-tag, inbox, count-only, date-range, id lookup — essential; an agent that can't see can't supervise.
- [ ] **List + read native perspectives** — surface JessOS's working perspectives — essential; locked surfacing decision.

### Add After Validation (v1.x)

- [ ] **Read-as-named-perspective evaluation** — once writes are trusted, make the perspective surface exact — trigger: working surface drifts from what OF shows.
- [ ] **Dry-run as first-class agent affordance** — supervisory preview before commit — trigger: JessOS wants a confirm step on bulk-ish writes.
- [ ] **Provision/repair the JessOS perspective via OmniJS** — self-healing surface — trigger: manual perspective setup proves fragile.
- [ ] **Count-only health pings** — proactive supervision against SKILL.md thresholds — trigger: reactive-only feels insufficient.

### Future Consideration (v2+)

- [ ] **Markdown regeneration of today/daily-briefing** — deferred by decision; only if native perspectives prove insufficient.
- [ ] **Repetition-rule authoring in the agent hot path** — high error rate; defer until verify is battle-tested.
- [ ] **Project-review automation by the agent** — `manage_reviews` driving review state — defer past initial trust window.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Agent role allow-list (create/complete/drop/defer/tag/move/flag) | HIGH | MEDIUM | P1 |
| Deny-list (delete / bulk_delete / tag delete+merge / perspective delete) | HIGH | LOW | P1 |
| Per-mutation write-verification (read-back + diff + explicit failure) | HIGH | MEDIUM | P1 |
| Core read paths (today/overdue/flagged/available/blocked/by-project/by-tag/count/inbox) | HIGH | LOW | P1 |
| List + read native perspectives | HIGH | LOW | P1 |
| Read-as-named-perspective evaluation | MEDIUM | MEDIUM | P2 |
| Dry-run as first-class agent affordance | MEDIUM | LOW | P2 |
| Provision/repair JessOS perspective via OmniJS | MEDIUM | MEDIUM | P2 |
| Count-only health pings | MEDIUM | LOW | P2 |
| Smart-suggest / engage narrowing | MEDIUM | LOW | P2 |
| Markdown regeneration | LOW | MEDIUM | P3 |
| Repetition-rule authoring (agent hot path) | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Typical OF-MCP fork (e.g. jqlts1 enhanced) | Upstream kip-d (owner surface) | Our agent role |
|---------|--------------------------------------------|--------------------------------|----------------|
| Destructive delete | Exposed | Exposed (owner) | **Denied** — drop only, recoverable |
| Write-verification | None / fire-and-report | Read-back for typed setters only | **Mandatory on every mutation** (read-back + diff + explicit failure) |
| Perspective access | List + a few built-ins (Inbox/Flagged/Forecast/Tags), some custom | List + cached perspectives | **List + read native, incl. custom JessOS surface** |
| Privilege model | Full surface to caller | Full surface | **Least-privilege allow-list distinct from owner** |
| Security posture | One had an undisclosed security issue (ruled out in PROJECT.md) | Injection-hardened Zod validation | Inherit hardening + role gating + HTTP auth (separate milestone item) |

## Sources

- `.planning/PROJECT.md` — locked decisions: drop-only, write-verification, native perspectives (HIGH)
- `.planning/codebase/ARCHITECTURE.md` — existing tool/compiler/bridge surface, silent-no-op anti-patterns (HIGH)
- `docs/skills/omnifocus-assistant/SKILL.md` — read modes, write operations, tag/move/repeat semantics, health thresholds (HIGH)
- [Custom Perspectives (Pro) — OmniFocus 4 Reference Manual](https://support.omnigroup.com/documentation/omnifocus/universal/4.8.10/en/custom-perspectives/) — All/Any/None rule tree, availability/flagged/tag rules, Pro-only (HIGH)
- [OmniFocus: Perspective (Omni Automation)](https://omni-automation.com/omnifocus/perspective.html) — `Perspective.Custom` create/edit-rules/delete, programmatic switching (MEDIUM — fetch blocked, corroborated by search snippets)
- [Custom Perspectives for OmniFocus — Learn OmniFocus](https://learnomnifocus.com/custom-perspectives/) — perspective rule capabilities and tag filtering (MEDIUM)

---
*Feature research for: least-privilege AI-agent role over OmniFocus as canonical task store*
*Researched: 2026-06-03*
