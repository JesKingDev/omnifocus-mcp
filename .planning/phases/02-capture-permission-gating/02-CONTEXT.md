# Phase 2: Capture & Permission Gating - Context

**Gathered:** 2026-06-12 **Status:** Ready for planning

<domain>
## Phase Boundary

The agent can dump a messy item straight into the OmniFocus **inbox** (no project, tags, or dates required — CAP-01),
but only under explicit **permission gates**, and every agent-created task carries its originating **Claude Code session
ID** in the notes (LINE-01).

Two runtime modes are gated differently:

- **Async/background runs** — the agent acts only on `agent-okay`-tagged tasks (PERM-01).
- **Sync/live sessions** — the agent prompts before creating, with an "allow all this session" option mirroring the
  Jira-creation flow (PERM-02).

**In scope:** the capture write path (extend existing inbox create), the gate-enforcement plumbing for create, the
sync/async mode signal, the `agent-okay` read-side predicate + capture-time stamping, and the lineage stamp in task
notes.

**Out of scope (later phases):** routing/project inference and routing-time _action_ gating (Phase 3, ROUTE-_/TRIG-01);
review tags + today-view surfacing (Phase 4, REVIEW-_); live real-time blocker capture (Phase 4, LIVE-01); session
archaeology read-back of the lineage stamp (Phase 5, ARCH-*); perspective provisioning + migration (Phase 6). Findings
here *inform\* those phases; they are not built here.

</domain>

<decisions>
## Implementation Decisions

### Gate enforcement locus (PERM-02)

- **D-01:** **Hybrid — server owns the verdict + grant; the agent renders the prompt.** Agent create-task runs through
  the existing single mutation funnel; `PolicyEngine.decide()` returns a `gate` outcome for `agent` + create-task; the
  server checks a per-session "allow all this session" grant and either allows or returns the structured `gate` verdict
  that the agent-side skill surfaces conversationally (mirroring the Jira-creation flow). This honors the milestone's
  "funnel, not advisory" invariant — enforcement stays server-side; only the _prompt UX_ is agent-rendered.
- **D-02:** The **"allow all this session" grant lives in `SessionConfig`** (where per-principal session state already
  lives and is forge-resistant), and is set **only by an owner-authenticated call** — never by the agent asserting it.
- **D-03 (decisive constraint):** MCP `elicitation/create` is **not** used to drive the prompt. It only works when the
  client declared the `elicitation` capability at init, so a background/async run has no one to prompt. The funnel
  therefore owns the verdict in **both** modes: tag-check for async, session-grant for sync. "Mirror Jira" is a UX
  requirement, not an enforcement-location requirement.

### Sync vs async mode signal (PERM-01 / PERM-02)

- **D-04:** **Mode is connection-bound, derived at the identity seam — not a per-call parameter.** Derive an
  `interactive` (live) vs background mode into `ResolvedContext`/`ResolvedIdentity` from an explicit
  `OMNIFOCUS_MCP_INTERACTIVE` env marker, resolved at the same seam that already resolves `role`
  (`src/auth/role-resolver.ts`). An interactive stdio launch sets the marker to opt into PERM-02 prompting; launchd/n8n
  scheduled runs leave it unset.
- **D-05:** **Literal-only, default-deny parse** (mirrors `parseRole`): only the exact literal resolves to live;
  undefined/empty/typo/garbage → **`background`** (the restrictive mode — act only on `agent-okay`, never auto-prompt).
  The agent **cannot self-elevate** because mode binds to how the connection authenticated, not to call arguments. A
  per-call `mode` param was rejected as the authoritative signal (self-elevation hole); it is acceptable _only_ as an
  owner-only _downgrade_ hint (live→background), never as an upgrade.

### `agent-okay` scope in Phase 2 (PERM-01)

- **D-06:** **Phase 2 builds the read-side `agent-okay` predicate + capture-time stamping; defers routing-time _action_
  gating to Phase 3.** The predicate is a thin composition over the existing `tags` + `inInbox` filters
  (`src/contracts/filters.ts` / `task-query-pipeline.ts`). Every agent-captured inbox item is born carrying the
  agent-origin marker via the existing OmniJS `addTag` path.
- **D-07 (boundary rule):** Phase 2 owns the **write-side stamp** and the **read-side predicate**; Phase 3 owns
  **consuming** that predicate to decide which existing tasks routing may touch.
- **D-08 (verification wording):** The success criterion "the agent acts only on `agent-okay` tasks" is proven in Phase
  2 by **(a)** a unit test asserting the predicate compiles to a filter that returns only `agent-okay`-tagged tasks and
  excludes untagged ones (the filter-generator unit layer runs with no live OmniFocus), **plus (b)** a capture-path test
  asserting newly-created items are stamped. Word the Phase 2 verification to match this — predicate + stamp, **not** a
  routing demo.

### Lineage stamp format & source (LINE-01)

- **D-09:** **Format — fenced HTML-comment block with a JSON payload, appended after any user note text** (blank-line
  separated). Searchable start/end sentinels survive arbitrary user edits; a single `JSON.parse` (not N fragile regexes)
  for Phase 5; carries session + timestamp + agent marker in one struct. Canonical form:

  ```
  <existing user note text, untouched>

  <!-- of-mcp:lineage
  {"v":1,"agent":"claude-code","session":"<uuid>","created_at":"<iso8601>"}
  -->
  ```

  Phase 5 parses via `/<!-- of-mcp:lineage\n(.*?)\n-->/s` + `JSON.parse`. The `agent` field lets archaeology filter
  agent-created tasks; `session` reconnects to the originating CC session; `created_at` enables time correlation.

- **D-10:** **Compose the stamp server-side into the final `note` string** in
  `src/contracts/ast/mutation-script-builder.ts`, so the write-verifier's intent matches read-back exactly (it diffs the
  `note` field the caller intended to set). On note **update**, strip any existing `of-mcp:lineage` block before
  re-appending so stamps never duplicate.
- **D-11:** **Source — the agent supplies its session ID as a write-call parameter.** The server's only session concept
  is its own transport `sessionId` (the wrong ID); no env var exposes the CC host session today. Trusting the caller is
  correct here because the stamp is **provenance, not authorization**. Add an optional
  `lineage: { sessionId, agent?, createdAt? }` object to the write tool's **Zod schema AND its hand-crafted
  `inputSchema` override** (dual-schema rule, per CLAUDE.md); default `agent` to `"claude-code"` and `createdAt` to
  server time when omitted.

### Claude's Discretion

- Exact field names/casing inside the JSON payload (keep `v`/`session`/`agent`/`created_at` intent stable for Phase 5;
  minor naming is flexible).
- The exact env-marker literal value (e.g. `interactive` vs `live`) — pick one, parse literal-only.
- Where in `PolicyEngine`/funnel the create `gate` rule is expressed, and the precise owner-auth call shape that sets
  the session grant.
- Whether the agent-origin tag and the `agent-okay` gate tag are the same tag or two tags — resolve during planning
  against the PERM-01 wording and Phase 3's routing needs.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents (researcher, planner) MUST read these before planning or implementing.**

### Phase requirements & roadmap

- `.planning/REQUIREMENTS.md` — CAP-01, PERM-01, PERM-02, LINE-01 (full acceptance criteria) + locked sequencing/folding
  rationale (gating lands _with_ the first write).
- `.planning/ROADMAP.md` §"Phase 2: Capture & Permission Gating" — goal + four success criteria + the "Why gating lands
  here" note.
- `.planning/PROJECT.md` — architecture stance (OmniFocus = single source of truth), least-privilege
  - write-verification constraints, and the Key Decisions table (role model, funnel, verifier).

### Phase 1 discovery findings (build-vs-reuse evidence — cite these)

- `docs/reference/omnifocus-capabilities.md` §CAPTURE — **DISC-CAPTURE-01** (inbox create is native OmniJS `new Task`;
  gate + lineage are the `extend` layer; verified live), DISC-CAPTURE-02 (URL scheme `omnifocus:///add`, one-way),
  DISC-CAPTURE-04 (no native template system). §TAG — tag auto-create + OmniJS `addTag` assignment.
- `probes/disc-capture-01-inbox-note-roundtrip.js` — verified probe: `new Task` + `task.note` round-trips and the inbox
  reflects immediately (the CAP-01 / LINE-01 gate proof).

### Existing machinery to reuse (hardening milestone)

- `src/contracts/roles.ts` — `Role` (owner|agent), `PolicyOutcome` (allow|deny|**gate**), `ResolvedContext`/`source` —
  the seam D-04 extends with an `interactive` mode.
- `src/auth/role-resolver.ts` — fail-safe role resolution + `parseRole` (the literal-only, default-deny pattern D-05
  mirrors for the mode marker).
- `src/auth/operation-policy.ts` — `PolicyEngine.decide()` (add the create-task `gate` rule, D-01).
- `src/session-manager.ts` — per-principal `SessionConfig` (holds the "allow all this session" grant, D-02).
- the single mutation funnel + `src/tools/unified/OmniFocusWriteTool.ts` — where create dispatches through enforcement;
  dual-schema (`inputSchema` override) for the new `lineage` param (D-11).
- `src/contracts/ast/mutation-script-builder.ts` — OmniJS note/tag setters; server-side stamp composition (D-10).
- `src/contracts/filters.ts`, `src/tools/tasks/task-query-pipeline.ts`, `filter-types.ts` — the `tags` + `inInbox`
  filters the `agent-okay` predicate composes over (D-06).
- `src/tools/unified/verifier/` — independent write-verifier; the stamped `note` must round-trip through it unchanged
  (D-10).

### Patterns / lore

- `docs/dev/SETTER-PATTERNS.md` — OmniJS/JXA setter behavior + silent-write-failure risk (note set).
- `docs/dev/JXA-VS-OMNIJS-PATTERNS.md`, `docs/dev/OMNIJS-FIRST-PATTERN.md` — bridge syntax for the capture/stamp script.
- The **Jira-creation permission flow** being mirrored for PERM-02 is a Claude Code _skill_ that confirms
  conversationally before calling the create tool (agent-driven UX, server-enforced verdict) — reference for the
  prompt/allow-all-this-session UX, not for enforcement location.

### External (to fetch during research)

- MCP specification — `elicitation/create` semantics + client capability declaration at init (confirms D-03: elicitation
  cannot serve the async path). https://modelcontextprotocol.io/specification/

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Inbox create is already native/`extend`** (DISC-CAPTURE-01): OmniJS `new Task(name)` defaults to inbox and
  round-trips `note`/tags/dates in one creation script. CAP-01 reuses the existing `omnifocus_write` create path (inbox
  = no project), not a new capture surface.
- **Gate vocabulary already exists** — `PolicyOutcome` includes `gate`; the funnel + PolicyEngine enforce destructive
  ops server-side. The create gate plugs into this, not a new mechanism.
- **Filter pipeline** already supports `tags` + `inInbox` filters at the unit/codegen layer — the `agent-okay` predicate
  is a thin composition, unit-testable without live OmniFocus.
- **Per-principal `SessionConfig`** is the natural, forge-resistant home for the session grant.

### Established Patterns

- Trust boundaries bind to the **connection**, enforced **server-side** (role resolver, single funnel) — never to
  agent-supplied call args. D-04/D-05 follow this; the rejected per-call-`mode` alternative violates it
  (self-elevation).
- `parseRole`'s literal-only, default-deny parse is the template for the mode-marker parse.
- Write-verification is an independent post-mutation read-back — the lineage stamp must compose into the same `note`
  string the verifier diffs (D-10).
- Dual-schema: any new write field (`lineage`) needs the Zod schema **and** the `inputSchema` override updated together.

### Integration Points

- The **lineage stamp format** (D-09) is the contract Phase 5 archaeology reads back — the `of-mcp:lineage` JSON block
  is this phase's downstream-facing integration surface.
- The **`agent-okay` predicate** (D-06) is the contract Phase 3 routing consumes to decide which tasks it may act on.
- The **session-grant + mode signal** are the contracts Phase 3's on-demand trigger and the deferred n8n scheduler will
  run under (background mode, no prompt).

</code_context>

<specifics>
## Specific Ideas

- The ecosystem is Obsidian-adjacent (JessOS), so a Dataview-style `key:: value` stamp was on the table — explicitly
  rejected in favor of the fenced HTML-comment JSON block for durable, unambiguous machine-parsing across later user
  edits (D-09).
- Owner is a Principal Engineer: least-privilege, security-over-novelty, no dead/unused mechanism, reuse existing
  machinery. Every Phase 2 gate decision plugs into hardening-milestone seams rather than adding bespoke parallel
  machinery.

</specifics>

<deferred>
## Deferred Ideas

- **Routing-time action gating** — applying the `agent-okay` predicate to _decide which existing tasks routing may
  touch_ is Phase 3 (ROUTE-\*), not Phase 2. Phase 2 only builds the predicate + capture stamp.
- **n8n 15-min polling under background mode** — the scheduled path that exercises the fail-safe `background` default is
  TRIG-02, a deferred follow-up to the Phase 3 on-demand MVP (TRIG-01).
- **Owner-only per-call `background` downgrade hint** — noted as acceptable (live→background only), but not required for
  Phase 2; implement only if a concrete need surfaces.

### Reviewed Todos (not folded)

None — no pending todos matched this phase (`Pending Todos: None` in STATE.md).

</deferred>

---

_Phase: 2-Capture & Permission Gating_ _Context gathered: 2026-06-12_
