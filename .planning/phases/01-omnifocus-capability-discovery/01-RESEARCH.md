# Phase 1: OmniFocus Capability Discovery — Research

**Researched:** 2026-06-11 **Domain:** OmniFocus 4 native capabilities, OmniJS automation API, capability-discovery
report planning **Confidence:** HIGH (codebase + Context7 + official docs); MEDIUM for PDF version claim (PDF
unreadable, metadata from git only)

---

## Summary

Phase 1 produces a single capability-discovery report at `docs/reference/omnifocus-capabilities.md`. The deliverable is
a documentation artifact — not feature code. The planner's job is to sequence: (1) synthesize each area from the
existing codebase and official docs, (2) identify which claims gate a build decision, (3) run throwaway OmniJS probes
for those claims against 4.8.11, and (4) write the report with DISC-<AREA>-NN anchors and 3-way verdicts.

The existing codebase is the strongest starting evidence. Scripts in `src/omnifocus/scripts/` already exercise a wide
slice of OmniFocus' surface — tags, tasks, projects, reviews, recurring, perspectives, analytics, export. Most areas
will land at `native` or `extend`. Genuine `build` verdicts will be narrow: primarily the agent-specific logic
(permission gating, session lineage, routing intelligence) that sits above OF's data layer.

The main planning challenge is sequencing per-area synthesis correctly: the "six areas" wording in the roadmap maps to
seven area codes when split granularly. The resolution is already locked in CONTEXT.md (D-07): use DISC-<AREA>-NN codes
explicitly and ensure every sub-area named in DISC-01 appears — the count ambiguity dissolves at the code level.

**Primary recommendation:** Plan this phase as a single wave: one task per area (TAG, FILTER, FIELD, PERSP, MODEL,
CAPTURE, AUTO), each following the synthesize→identify-gate-claims→probe→write-finding pattern. The report section for
each area is the artifact, not a separate deliverable.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Target OmniFocus **4.8.11 (build v185.15.0)**. Capabilities of this and later OF4 versions are what matter.
- **D-02:** No OF3 features or limitations. Any OF4 capability claim must be rooted in current OF4 documentation or
  empirically probed/confirmed against the running app. Any asserted OF4 limitation must likewise be doc-cited or proven
  — never assumed or carried over from OF3-era knowledge.
- **D-03:** **Hybrid: synthesize → probe-to-confirm.** Draft from OF4 docs + repo code; run a live probe against 4.8.11
  for any claim that gates a build-vs-reuse decision. Unconfirmed claims are flagged `unverified`.
- **D-04:** 3-way verdict: `native` / `extend` / `build` per area.
- **D-05:** Every verdict carries a one-line rubric reason + evidence tag: `evidence: verified | doc | unverified`.
- **D-06:** Single consolidated report at `docs/reference/omnifocus-capabilities.md`.
- **D-07:** Per-finding anchor IDs: `DISC-<AREA>-NN` scheme with area codes TAG / FILTER / FIELD / PERSP / MODEL /
  CAPTURE / AUTO.
- **D-08:** Automation surfaces evaluated against milestone needs (capture, routing, PROV-01, MCP reliance) — fit
  assessment, not implementation design.

### Claude's Discretion

- Exact section ordering and headings within the report.
- Which specific claims rise to the "gates a build decision" bar and therefore require a live probe.
- Reconciliation of the area-code list with the final report structure.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. READAS-01, PROV-01, MIG-01 are Phase 6 and are informed by, not built in,
this phase. </user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                                                                                                              | Research Support                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| DISC-01 | Capability-discovery report covering tagging, filtering, custom fields, perspectives, project/task data model (sequencing + dependencies, sequential vs. parallel), native capture, automation surfaces. | Seven area codes (TAG/FILTER/FIELD/PERSP/MODEL/CAPTURE/AUTO) map each to a report section. Existing scripts give ground-truth for most. |
| DISC-02 | For each capability area, the report states where OmniFocus handles it natively vs. where MCP adds value — explicit native-vs-build decision per area.                                                   | 3-way verdict format (native/extend/build) + evidence tag. Rubric: "don't build what OF already solves."                                |

</phase_requirements>

---

## Architectural Responsibility Map

This phase produces documentation, not feature code. The architecture map captures which tier owns each discovery area —
so findings feed the right layer in later phases.

| Capability Area       | Primary Tier          | Secondary Tier    | Rationale                                                                     |
| --------------------- | --------------------- | ----------------- | ----------------------------------------------------------------------------- |
| Tagging (TAG)         | OmniFocus (app)       | OmniJS bridge     | Tags are native OF data; MCP is a thin read/write wrapper                     |
| Filtering (FILTER)    | OmniJS / API layer    | —                 | No server-side query API; filtering happens in-process via OmniJS             |
| Custom Fields (FIELD) | OmniFocus (app)       | —                 | OF has no first-class custom fields; notes/tags are the native extension      |
| Perspectives (PERSP)  | OmniFocus (app / Pro) | OmniJS bridge     | Perspective provisioning and filter rules require OF Pro + OmniJS             |
| Data Model (MODEL)    | OmniFocus (app)       | OmniJS bridge     | Sequential/parallel is a native OF project property; read/write via OmniJS    |
| Capture (CAPTURE)     | OmniFocus (app + URL) | MCP / agent layer | Inbox write is native; permission gating and lineage are agent-layer concerns |
| Automation (AUTO)     | OmniJS (in-process)   | URL schemes       | OmniJS is the primary automation surface; URL schemes add capture path        |

---

## Existing Probe Harnesses (Reuse, Don't Rebuild)

The executor does not need to build new probe infrastructure from scratch. All of these exist and are validated:

### Live-Probe Instruments

| Harness                             | Location                                                           | What it probes                                                                       | Reuse as                                        |
| ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Manual perspective tests            | `tests/manual/perspectives/`                                       | `Perspective.Custom.all`, `archivedFilterRules`, `archivedTopLevelFilterAggregation` | PERSP area probes                               |
| `test-perspective-rules.js`         | `tests/manual/perspectives/test-perspective-rules.js`              | Custom perspective filter rule read/write                                            | PERSP verification                              |
| `test-perspective-comprehensive.ts` | `tests/manual/perspectives/test-perspective-comprehensive.ts`      | Full perspective API surface                                                         | PERSP evidence                                  |
| `jxa-test-utilities.js`             | `docs/jxa-test-utilities.js`                                       | Property discovery, `whose()` perf, general OmniJS probing                           | Any area — discovery script template            |
| `LIST_PERSPECTIVES_SCRIPT`          | `src/omnifocus/scripts/perspectives.ts`                            | `Perspective.BuiltIn.all`, `Perspective.Custom.all`, filter rules                    | PERSP doc-evidence + extend verdict             |
| MCP unified tools                   | `omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system` | Live capability probing via tool calls                                               | All areas — confirms what the MCP already wraps |

### Existing Script Coverage by Area

These scripts are primary evidence that a capability is already `native` or `extend` — not needing `build`:

| Area Code | Script(s)                                                                                         | Coverage                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| TAG       | `mutation-script-builder.ts` (tag assign via OmniJS `addTag()`), `tag-mutation-script-builder.ts` | Tag read, write, assignment; `Tag.byName()`, `flattenedTags`, `task.addTag()`                                     |
| FILTER    | `OMNIFOCUS_QUERY_ALTERNATIVES.md`, `list-tasks-ast.ts`                                            | `inbox`, `tag.remainingTasks`, `project.flattenedTasks`, date/flag filter patterns; `.whose()` explicitly avoided |
| FIELD     | `list-tasks-ast.ts`, notes field in mutation builder                                              | `task.note` as the unstructured field extension point                                                             |
| PERSP     | `perspectives.ts`, `perspectives/list-perspectives.ts`                                            | `Perspective.BuiltIn.all`, `Perspective.Custom.all`, `archivedFilterRules`                                        |
| MODEL     | `mutation-script-builder.ts` (`sequential` property), `SETTER-PATTERNS.md`                        | `project.sequential`, `task.sequential`, `task.taskStatus`, status enum                                           |
| CAPTURE   | `mutation-script-builder.ts` (create task → inbox)                                                | Inbox push via `new Task(name, inbox)` in OmniJS                                                                  |
| AUTO      | All scripts use OmniJS-first pattern; `JXA-VS-OMNIJS-PATTERNS.md`, `OMNIJS-FIRST-PATTERN.md`      | OmniJS as primary surface; JXA as minimal wrapper; URL schemes for external capture                               |

---

## Standard Stack (Probe Execution)

No new packages needed — this phase uses only existing repo tooling.

| Tool                                             | Purpose                                                | Already in Repo |
| ------------------------------------------------ | ------------------------------------------------------ | --------------- |
| `osascript -l JavaScript`                        | Execute JXA/OmniJS scripts directly against live OF    | Yes             |
| OmniJS `evaluateJavascript()`                    | In-process OF automation — primary probe surface       | Yes             |
| MCP tools via `echo '...' \| node dist/index.js` | Live capability confirmation via the MCP server itself | Yes             |
| `npm run build`                                  | Required before running MCP-based probes               | Yes             |

## Package Legitimacy Audit

No external packages are installed in this phase. All probe execution uses existing `osascript`, `node`, and
`npm run build`. Section not applicable.

---

## Key Documentation Sources

### Authoritative OF4 Sources (ordered by reliability)

**Source 1: Omni Automation reference (`omni-automation.com`)**

- Context7 library ID: `/websites/omni-automation_omnifocus` (1,523 code snippets, High reputation, score 83)
- `[CITED: omni-automation.com/omnifocus/]` — canonical OmniJS API reference for OF4
- **Use for:** OmniJS class/property/method signatures, `Perspective.Custom` API, tag API, task/project model
- **Version sensitivity:** The site tracks current OF versions; the `archivedFilterRules` /
  `archivedTopLevelFilterAggregation` API is documented as introduced in **OmniFocus v4.2**
  `[CITED: omni-automation.com/omnifocus/perspective.html]`. Since the target is 4.8.11, this API is available.

**Source 2: Official Omni support documentation**

- `support.omnigroup.com/documentation/omnifocus/universal/4.3.3/en/` — reference manual for 4.3.3
- `[CITED: support.omnigroup.com]` — covers capture methods, user-facing features
- **Version gap:** Documentation is for 4.3.3; 4.8.11 may have additions. Use for stable features (capture methods, data
  model); probe anything that looks version-sensitive.

**Source 3: Inside OmniFocus — URL Schemes**

- `[CITED: inside.omnifocus.com/url-schemes]` — official URL scheme documentation
- Stable across OF4; `/add`, `/paste`, navigation URLs, `x-callback-url` patterns are well-established.

**Source 4: Bundled scripting dictionary PDF**

- `docs/OmniFocus Scripting Dictionary.pdf` — added 2025-07-25 per `git log`
- **Version risk:** Added ~10 months before OF 4.8.11 (current June 2026). OF4 has had multiple releases since mid-2025
  (4.5 December 2024, likely 4.8 sometime in 2025–2026). `[ASSUMED]` that the PDF reflects OF4 but may not include API
  additions after its generation date.
- **Recommendation:** Use as a secondary reference for stable JXA AppleScript properties. For any typed-class or newer
  OmniJS API, prefer `omni-automation.com` + live probe. Do not treat PDF as authoritative for OF 4.8.11 specifics
  without a probe.
- **Fallback:** If the scripting dictionary PDF is for OF3 or early OF4, downgrade all PDF-sourced claims to
  `unverified` and confirm by probe.

### How to Cite in the Report

Each finding in `docs/reference/omnifocus-capabilities.md` must carry exactly one evidence tag:

| Tag                    | Meaning                                                                     | When to use                                                                        |
| ---------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `evidence: verified`   | Live-probed against 4.8.11                                                  | Any claim gating a build decision                                                  |
| `evidence: doc`        | Found in OF4 official documentation (`omni-automation.com` or Omni support) | Stable documented behavior not yet probed                                          |
| `evidence: unverified` | Asserted but neither probed nor found in current OF4 docs                   | Placeholder — must be resolved before the phase completes or flagged for follow-up |

---

## Area-Specific Research Findings

### TAG — Tagging

**What OF does natively `[CITED: omni-automation.com/omnifocus/tag.html]`:**

- Tags are first-class objects (`Tag` class with `name`, `id`, `parent`, `children`, `tasks`, `availableTasks`,
  `remainingTasks`)
- Tags are hierarchical (nested tags supported)
- Multiple tags per task/project
- `Tag.byName()`, `flattenedTags.byName()` for lookup
- `task.addTag(tag)` / `task.tags = [...]` for assignment (OmniJS only — JXA silent no-ops documented in
  SETTER-PATTERNS.md row 6)
- `tag.availableTasks` / `tag.remainingTasks` for filtered task collections — no full scan needed for tag-based queries
  `[VERIFIED: codebase OMNIFOCUS_QUERY_ALTERNATIVES.md]`

**Agent-workflow-specific tags:** `agent-okay`, `agent-review`, `review-output`, `review-capture`, `archaeology` — these
are conventional tags, no OF extension required

**Build-decision gate claim (requires probe):** Does `task.addTag(tagName)` auto-create a tag that doesn't exist, or
does it require a pre-existing `Tag` object? `[ASSUMED]` from docs; probe to confirm before Phase 2 planning.

**Likely verdict:** `extend` — OF handles tags natively; MCP needs a thin wrapper for tag CRUD and the agent-okay
permission check.

---

### FILTER — Filtering

**What OF does natively `[VERIFIED: codebase OMNIFOCUS_QUERY_ALTERNATIVES.md]`:**

- `inbox` (OmniJS global) — direct inbox collection, no scan
- `tag.availableTasks` / `tag.remainingTasks` — tag-scoped task collection
- `project.flattenedTasks` — project-scoped tasks
- `flattenedTasks` — full scan (unavoidable for date/flag/combined queries)
- No server-side date-range query API; date filtering requires linear scan `[VERIFIED: codebase]`
- `.whose()` / `.where()` explicitly forbidden — slow, unreliable `[VERIFIED: codebase CLAUDE.md]`

**No custom filter language exists** — OF's filtering is imperative (write JavaScript predicates in OmniJS).
`[CITED: omni-automation.com/omnifocus/]`

**Likely verdict:** `extend` — filtering is native OmniJS iteration; MCP wraps it with a query compiler (AST-based).

---

### FIELD — Custom Fields

**What OF does natively:**

- No first-class "custom fields" in OmniFocus `[CITED: discourse.omnigroup.com/t/custom-fields-for-email…/66627]` —
  confirmed by search result
- The note field (`task.note`, `project.note`) is the primary extension point for structured data — free-form text or
  JSON blobs
- Estimated minutes (`task.estimatedMinutes`) is a native numeric field
- Deferred/due/completion dates, flagged status, sequential — all native
- Display fields (Pro): users can customize which fields show per-perspective, but these are UI display settings, not
  data schema additions `[CITED: search result, standard OF4 field customization]`
- `plannedDate` — added in OF 4.7+ `[CITED: omni-automation.com/omnifocus/task.html]`

**Agent-workflow need:** Session lineage (LINE-01) stores Claude Code session ID → use `task.note` or a structured
prefix in note field. No OF custom field needed.

**Likely verdict:** `native` — use `task.note` as the custom-data extension point; no build needed.

---

### PERSP — Perspectives

**What OF does natively (OmniFocus Pro) `[CITED: omni-automation.com/omnifocus/perspective.html]`:**

- `Perspective.BuiltIn.all` — list of built-in perspectives (Inbox, Projects, Tags, Forecast, Flagged, Review, Nearby)
- `Perspective.Custom.all` — list of user-created custom perspectives; `byName()`, `byIdentifier()`
- `archivedFilterRules` (read/write) — JSON archive of perspective rules. Available since **OF 4.2**
  `[CITED: omni-automation.com/omnifocus/perspective.html]`
- `archivedTopLevelFilterAggregation` (read/write) — "all" / "any" / "none"
- `document.windows[0].perspective` — currently active perspective
- `perspective.fileWrapper()` — export perspective; `writeFileRepresentationIntoDirectory()` — save to disk

**Key limitation for READAS-01:** There is **no** `perspective.tasks` or `perspective.matchingTasks` property in the
OmniJS API. Reading the tasks currently shown in a custom perspective is not directly supported.
`[CITED: omni-automation.com/omnifocus/perspective.html — no such property found]` The workaround is to replicate the
perspective's filter rules as OmniJS predicates and run them against `flattenedTasks`. This is a known gap driving
READAS-01 to Phase 6.

**Perspective provisioning (PROV-01):** `Perspective.Custom` cannot be **created** programmatically via OmniJS API — the
class has no constructor for creating new perspectives. `[CITED: omni-automation.com]` However, existing custom
perspectives can have their `archivedFilterRules` written to configure/repair them. PROV-01's "provision or repair"
language maps to this: repair (write filter rules) is possible; create-from-scratch is not.

**Build-decision gate claim (requires probe):** Does writing `perspective.archivedFilterRules` on the JessOS perspective
persist correctly across OmniFocus restarts on 4.8.11? The API doc confirms the property is writable since 4.2, but
persistence behavior must be live-probed before Phase 6 planning.

**Likely verdict:** `extend` for list/read (already implemented); `build` for perspective-task resolution (replicate
filter logic in code); `native` for filter rule write once confirmed by probe.

---

### MODEL — Project/Task Data Model

**What OF does natively `[CITED: omni-automation.com/omnifocus/project.html + task.html, SETTER-PATTERNS.md]`:**

- **Sequential vs. Parallel:** `project.sequential` (Boolean) — if `true`, only the first incomplete task is available;
  if `false` (parallel), all incomplete tasks are available `[CITED: omni-automation.com/omnifocus/project.html]`
- `task.sequential` — action groups within a task can also be sequential
- **Task status:** `task.taskStatus` → `Task.Status` enum: Available, Blocked, Completed, Dropped, DueSoon, Next,
  Overdue `[CITED: omni-automation.com/omnifocus/task.html]`
- **Dependencies:** OmniFocus has **no native cross-project task dependency system**
  `[CITED: github.com/ksalzke/dependency-omnifocus-plugin — the community plug-in exists specifically because OF lacks native dependencies]`.
  Sequential project ordering is the only built-in dependency mechanism.
- `task.parent` / `task.containingProject` / `project.folder` — hierarchy relationships
- `moveTasks([task], destination)` — move tasks between projects (OmniJS only)
- `task.repetitionRule` — recurrence (P2 setter pattern — `new Task.RepetitionRule(...)`)
  `[VERIFIED: SETTER-PATTERNS.md row 2]`
- `project.reviewInterval` — P4 setter pattern (read-modify-reassign) `[VERIFIED: SETTER-PATTERNS.md row 1]`
- `project.status` — P1 with enum constant `[VERIFIED: SETTER-PATTERNS.md row 3]`

**Likely verdict:** `native` for reading/writing project and task data; `extend` for status-aware queries.

---

### CAPTURE — Native Capture

**What OF does natively `[CITED: support.omnigroup.com/documentation/omnifocus/universal/4.3.3/en/capture-methods/]`:**

- **Quick Entry** — system-wide keyboard shortcut, opens mini-inbox panel (not scriptable / MCP-accessible)
- **Clippings** — macOS Services integration (not MCP-accessible)
- **Mail Drop** — email → inbox (external; not MCP-relevant)
- **Share sheet** — iOS/macOS Share extension (not MCP-relevant)
- **URL scheme `omnifocus:///add`** — adds task to inbox with parameters: `name`, `note`, `project`, `context`
  (deprecated), `tags`, `defer`, `due`, `flag`, `repeat-rule` `[CITED: inside.omnifocus.com/url-schemes]`
- **URL scheme `omnifocus:///paste`** — TaskPaper-formatted text; `target` (inbox/project), `content`
- **OmniJS `new Task(name, inbox)`** — programmatic inbox creation with all OmniJS properties settable
  `[VERIFIED: OMNIJS-FIRST-PATTERN.md pattern 2, existing mutation-script-builder.ts]`

**MCP server's current path:** `new Task(name, inbox)` via OmniJS — already implemented in `mutation-script-builder.ts`.
Tags, dates, notes, flagged all settable in the same script `[VERIFIED: codebase]`.

**Template feature:** OmniFocus has no built-in template system accessible via OmniJS. Community workarounds (TaskPaper
paste, `omnifocus:///paste`) exist but are not native. `[ASSUMED — no template API found in docs or Context7]`

**Agent-workflow needs:**

- CAP-01 (inbox dump) — already native via OmniJS `new Task(name, inbox)`; MCP tool call suffices
- Permission gating (PERM-01/02) — agent-layer logic; not an OF capability
- Session lineage (LINE-01) — write session ID to `task.note`; native via OmniJS

**Likely verdict:** `extend` — inbox creation is native; the permission gate and lineage stamping are thin agent-layer
additions.

---

### AUTO — Automation Surfaces

**OmniJS (primary surface) `[VERIFIED: codebase + CITED: omni-automation.com]`:**

- Runs inside OmniFocus via `app.evaluateJavascript()` from JXA
- Direct object access, no Apple Events overhead
- Full read/write access to entire OF data model
- **Fit for:** all MCP operations (capture, routing writes, tag management, perspective rule writes)
- **MCP server already relies on this exclusively** for all mutations and complex reads

**JXA / AppleScript (legacy wrapper) `[VERIFIED: codebase JXA-VS-OMNIJS-PATTERNS.md]`:**

- `osascript -l JavaScript` — outer executor only; all logic delegated to OmniJS via `evaluateJavascript()`
- JXA is described as "legacy/sunset mode" by Omni Group `[CITED: omni-automation.com/jxa-applescript.html]`
- **Fit for:** launching OmniJS scripts only; never for direct property access
- **JXA-only failures:** `folder.parent()` "Can't convert types" — use OmniJS bridge
  `[VERIFIED: codebase JXA-VS-OMNIJS-PATTERNS.md]`

**URL Schemes `[CITED: inside.omnifocus.com/url-schemes]`:**

- `omnifocus:///add?name=...` — adds to inbox; supports name, note, project, tags, defer, due, flag
- `omnifocus:///paste?content=...` — TaskPaper paste
- Navigation: `omnifocus:///inbox`, `/flagged`, `/projects`, `/tags`, `/forecast`, `/perspective/[name]`
- `x-callback-url` — `/parse-date`, `/paste` with callbacks
- **Fit for:** external capture triggers (e.g., from a webhook or Shortcuts), navigation; NOT for reads or complex
  mutations
- **Limitation:** URL schemes cannot read data back — one-way write only

**Omni Automation Plug-ins `[CITED: omni-automation.com/omnifocus/plug-in.html (content accessed via Context7)]`:**

- JavaScript bundles with a manifest (`.omnifocusjs` package)
- Can be invoked via `omnifocus:///run-plug-in?identifier=...` URL scheme (OF Pro)
- Types: Action plug-ins (run against selection), Form plug-ins
- **MCP cannot invoke plug-ins** — plug-in invocation requires the OF app to be in the foreground with a selection;
  MCP's osascript path does not maintain a persistent foreground session `[ASSUMED — based on plug-in invocation model]`
- **Fit for:** user-facing automation add-ons; not for agent background operations

**Apple Shortcuts `[CITED: search result, OF4 docs mention Shortcuts integration]`:**

- OF4.5 added `Get Action`, `Get Folder`, `Get Perspective`, `Get Project`, `Get Tag` Shortcuts actions
  `[CITED: mjtsai.com/blog/2024/12/11/omnifocus-4-5/]`
- Not directly relevant to the MCP server's execution path (macOS MCP uses osascript, not Shortcuts)
- **Fit for:** user-facing automation; not for agent-layer MCP operations

**Fit matrix for milestone needs:**

| Surface                | Agent Capture (CAP-01)          | Routing Writes (ROUTE-01..04) | Perspective Provisioning (PROV-01) | MCP Server Basis       |
| ---------------------- | ------------------------------- | ----------------------------- | ---------------------------------- | ---------------------- |
| OmniJS (via osascript) | Primary path                    | Primary path                  | Required (archivedFilterRules)     | All current operations |
| URL schemes            | Possible alternate              | Not suitable (no reads)       | Not suitable                       | Not currently used     |
| Plug-ins               | Not suitable (needs foreground) | Not suitable                  | Not suitable                       | Not used               |
| Shortcuts              | Not suitable (MCP context)      | Not suitable                  | Not suitable                       | Not used               |

**Likely verdict:** `native` for OmniJS surface; `extend` for URL scheme capture path; `build` is not warranted for any
automation surface area.

---

## Area Code Resolution ("Six Areas" Ambiguity)

ROADMAP success criterion 1 says "all six named areas" but the DISC-01 text enumerates sub-areas that split across seven
distinct codes per CONTEXT.md D-07. The resolution:

| DISC-01 Text                                                                 | Area Code(s) | Report Section               |
| ---------------------------------------------------------------------------- | ------------ | ---------------------------- |
| tagging                                                                      | TAG          | § Tagging (TAG)              |
| filtering                                                                    | FILTER       | § Filtering (FILTER)         |
| custom fields                                                                | FIELD        | § Custom Fields (FIELD)      |
| perspectives                                                                 | PERSP        | § Perspectives (PERSP)       |
| project/task data model (sequencing + dependencies, sequential vs. parallel) | MODEL        | § Data Model (MODEL)         |
| native capture (inbox, templates)                                            | CAPTURE      | § Capture (CAPTURE)          |
| automation surfaces (OmniAutomation / URL schemes / plug-ins)                | AUTO         | § Automation Surfaces (AUTO) |

The "six" in ROADMAP's success criterion is a counting artifact from clustering tagging/filtering/custom-fields into one
cluster. Using seven codes (matching the DISC-01 literal wording) is strictly more complete and satisfies the criterion.
The planner must ensure the report has all seven sections.

---

## DISC-<AREA>-NN Finding Anchor Scheme

### Format

```
DISC-TAG-01, DISC-TAG-02, ...
DISC-FILTER-01, ...
DISC-FIELD-01, ...
DISC-PERSP-01, DISC-PERSP-02, ...
DISC-MODEL-01, DISC-MODEL-02, ...
DISC-CAPTURE-01, ...
DISC-AUTO-01, DISC-AUTO-02, ...
```

### Finding Entry Template (for each finding in the report)

```markdown
#### DISC-TAG-01 — Tag assignment requires OmniJS bridge

| Field           | Value                                                                  |
| --------------- | ---------------------------------------------------------------------- |
| Verdict         | extend                                                                 |
| Rubric          | JXA tag assignment silently no-ops; thin OmniJS wrapper already exists |
| Evidence        | evidence: verified                                                     |
| Source          | SETTER-PATTERNS.md row 6; codebase mutation-script-builder.ts          |
| Downstream cite | Phase 2 (CAP-01), Phase 4 (REVIEW-01)                                  |
```

### Numbering Convention

- Start each area at `01`
- Increment sequentially within the area (one finding per distinct capability claim)
- Reserve the `NN=00` slot for the area-level verdict summary if useful
- No gaps — if a finding is removed, add a `REMOVED` tombstone rather than renumber

---

## Don't Hand-Roll

| Problem                    | Don't Build               | Use Instead                                                                              | Why                                                                                     |
| -------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Tag read/write             | Custom tag manager        | `task.addTag(tag)` / `flattenedTags.byName()` in OmniJS                                  | Native API; fully covered in existing `mutation-script-builder.ts`                      |
| Inbox task creation        | Custom capture queue      | `new Task(name, inbox)` in OmniJS                                                        | Native; already in `mutation-script-builder.ts`                                         |
| Sequential/parallel status | Custom dependency tracker | `project.sequential` + `task.taskStatus`                                                 | Native OF data model properties                                                         |
| Perspective filter rules   | Custom perspective store  | `archivedFilterRules` on `Perspective.Custom`                                            | OF Pro API since 4.2; existing harness in `tests/manual/perspectives/`                  |
| Task status queries        | Scan-and-classify         | `task.taskStatus` enum (Available/Blocked/Overdue/etc.)                                  | Native; already read in analytics scripts                                               |
| Cross-task dependencies    | Custom dependency graph   | Third-party plug-in (ksalzke/dependency-omnifocus-plugin) OR sequential project ordering | OF has no native cross-task dependency beyond sequential; build only if strictly needed |

**Key insight:** For this phase, "don't hand-roll" means don't build probes from scratch — reuse `jxa-test-utilities.js`
and the existing `tests/manual/perspectives/` harnesses. The probe work is documentation, not production code.

---

## Probe Design Patterns

### Standard Discovery Probe (OmniJS-first)

All new probes in this phase follow the OmniJS-first pattern from `docs/dev/OMNIJS-FIRST-PATTERN.md`:

```javascript
// Run with: osascript -l JavaScript probe-name.js
(() => {
  const app = Application('OmniFocus');
  try {
    const result = app.evaluateJavascript(`
      (() => {
        // All discovery logic here — OmniJS property access (no parentheses)
        return JSON.stringify({ capability: "...", result: "..." });
      })()
    `);
    return result;
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
})();
```

### Write-Then-Read-Back Pattern (mandatory for write probes)

Per SETTER-PATTERNS.md: `success: true` from a write is not proof of persistence. All write probes must read back:

```javascript
// Write
task.someProperty = newValue;
// Read back before returning
const readBack = task.someProperty;
return JSON.stringify({ written: newValue, readBack: readBack, persisted: readBack === newValue });
```

### Gate-Claim Probe Targets

The executor must run live probes for these specific claims before writing the finding with `evidence: verified`:

| Claim                                                        | Gate                             | Probe Action                                                  |
| ------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------- |
| `task.addTag(tagName)` auto-creates if absent                | Phase 2 routing — tag management | Create a test tag, verify, clean up                           |
| `archivedFilterRules` write persists on restart              | Phase 6 PROV-01                  | Write rules, restart OF simulation (or restart OF), read back |
| `new Task(name, inbox)` + `task.note = sessionId` round-trip | Phase 2 LINE-01                  | Create task with note, read back note field                   |
| `project.sequential = true` persists                         | Phase 3 routing project creation | Write, read back                                              |
| `Perspective.Custom.all` returns JessOS perspective          | Phase 6 READAS-01                | Enumerate and confirm presence                                |
| `inbox` collection reflects newly created task immediately   | Phase 2 CAP-01                   | Create task, immediately read inbox                           |

---

## Common Pitfalls for the Executor

### Pitfall 1: JXA Property Access in Probes

**What goes wrong:** Writing a probe in the JXA outer context and getting "Can't convert types" or method-not-a-function
errors. **Why it happens:** Property access without `()` in JXA throws; `()` access in OmniJS throws. Mixed context is
the #1 source of probe failures. **How to avoid:** Put all probe logic inside `evaluateJavascript()`. Use `task.name`
(no parens) in OmniJS. The OMNIJS-FIRST-PATTERN.md template is the correct starting point. **Warning signs:** Error
messages "X is not a function" or "Can't convert types".

### Pitfall 2: Silent Write Failures on Tag Assignment

**What goes wrong:** Writing tags via JXA `task.tags = [...]` appears to succeed (no error) but tags don't appear in
OmniFocus. **Why it happens:** JXA tag assignment is a silent no-op — documented in SETTER-PATTERNS.md row 6. **How to
avoid:** All tag assignment must go through OmniJS `addTag()` or `task.tags = [...]` inside `evaluateJavascript()`. Read
back to confirm.

### Pitfall 3: Trusting the PDF Scripting Dictionary for Version-Specific Claims

**What goes wrong:** Citing the bundled PDF as `doc` evidence for OF 4.8.11 features when the PDF may predate them.
**Why it happens:** The PDF was added to the repo on 2025-07-25; OF 4.8.11 is current June 2026 — a gap of ~11 months
during which OF 4.5 (Dec 2024) and subsequent releases occurred. **How to avoid:** Cross-reference PDF claims against
`omni-automation.com`. For any API introduced after mid-2025 (e.g., `plannedDate` was added in OF 4.7), use
`omni-automation.com` as the cite source, not the PDF. Default to probing if uncertain.

### Pitfall 4: Assuming Plug-in Invocation Works from MCP

**What goes wrong:** Planning to invoke an Omni Automation plug-in from the MCP server's background osascript path.
**Why it happens:** The `omnifocus:///run-plug-in` URL exists, but plug-in execution requires OmniFocus to be in the
foreground with a selection — assumptions carried from foreground-app scripting context. **How to avoid:** Flag any
plug-in use case as `unverified` until probed. The MCP server's use case is background automation; probe whether
`run-plug-in` URL scheme works from osascript without foreground context.

### Pitfall 5: Misidentifying "No Direct Perspective.tasks" as a Framework Gap

**What goes wrong:** Concluding that perspective task resolution is impossible. **Why it happens:** There is no
`perspective.tasks` API. But the `archivedFilterRules` are readable, and the filter logic can be replicated as OmniJS
predicates. **How to avoid:** The finding is: "no direct API; workaround is to replicate filter rules." That's an
`extend` verdict (thin build on top of native data), not a `build` verdict implying a complex new system.

---

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json` — this section is required.

### Test Framework

| Property           | Value                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| Framework          | Manual live-probe execution (osascript) + MCP integration smoke tests |
| Config file        | `npm run test:integration` (existing integration test suite)          |
| Quick run command  | `osascript -l JavaScript <probe-script.js>`                           |
| Full suite command | `npm run test:unit && npm run test:integration`                       |

This phase produces **documentation**, not feature code. Nyquist validation for Phase 1 means verifying that capability
claims tagged `evidence: verified` were genuinely live-probed, and that the report's DISC-<AREA>-NN findings are
correctly populated. There are no new unit or integration tests to write — the validation layer is the probe execution
evidence itself.

### Phase Requirements → Test Map

| Req ID  | Behavior                                                                 | Test Type         | Automated Command                    | Verified By                                              |
| ------- | ------------------------------------------------------------------------ | ----------------- | ------------------------------------ | -------------------------------------------------------- |
| DISC-01 | Report covers all seven area codes with at least one finding each        | Manual doc review | —                                    | Reviewer reads report, confirms each area section exists |
| DISC-01 | Capability claims tagged `evidence: verified` have a corresponding probe | Manual trace      | `osascript -l JavaScript <probe>.js` | Probe script exists and produces output matching claim   |
| DISC-02 | Each area section contains a 3-way verdict (native/extend/build)         | Manual doc review | —                                    | Reviewer reads each area's verdict block                 |
| DISC-02 | `evidence: unverified` findings are resolved or explicitly flagged       | Manual doc review | —                                    | No `unverified` findings remain without a follow-up note |

### Sampling Rate

- **Per task (per area):** Run the area's gate-claim probes before writing the finding. Paste probe output into the
  finding as evidence.
- **Phase gate:** Before marking Phase 1 complete, do a full pass: confirm (a) all seven area sections exist, (b) all
  build-decision findings have `evidence: verified` or an explicit `unverified` flag with a plan, and (c) downstream
  phases can cite at least one DISC-<AREA>-NN ID per phase dependency.

### Wave 0 Gaps

There are no test file gaps for this phase — the probe harnesses already exist. The executor must:

- [ ] Confirm `tests/manual/perspectives/` scripts run cleanly against 4.8.11 before using as evidence
- [ ] Verify `docs/jxa-test-utilities.js` executes without error on the current machine (last run documented as
      2025-11-27)
- [ ] Run `npm run build` before any MCP-based probe (required by CLAUDE.md)

---

## Security Domain

> `workflow.security_enforcement: true`, `security_asvs_level: 1` in `.planning/config.json`.

Phase 1 produces documentation only — no new code ships. Security domain is minimal.

### Applicable ASVS Categories

| ASVS Category         | Applies  | Control                                                                                                                                                                                |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | No       | —                                                                                                                                                                                      |
| V3 Session Management | No       | —                                                                                                                                                                                      |
| V4 Access Control     | No       | —                                                                                                                                                                                      |
| V5 Input Validation   | Marginal | Probe scripts must not inject user-supplied strings into `evaluateJavascript()` without sanitization — but Phase 1 probes are throwaway scripts with hardcoded values, not user inputs |
| V6 Cryptography       | No       | —                                                                                                                                                                                      |

### Threat Patterns

| Pattern                                                             | STRIDE      | Mitigation                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Script injection in OmniJS                                          | Tampering   | Throwaway probes use hardcoded values; no user input. Not applicable in Phase 1. If probes accept parameters, use `JSON.stringify()` for safe serialization (per existing codebase pattern). |
| PDF as authoritative source for security-relevant capability claims | Repudiation | Downgrade PDF-sourced claims; probe anything security-adjacent (permission tags, data access scopes).                                                                                        |

---

## Environment Availability

| Dependency                   | Required By           | Available                       | Version                              | Fallback                                   |
| ---------------------------- | --------------------- | ------------------------------- | ------------------------------------ | ------------------------------------------ |
| OmniFocus 4.8.11             | All probes            | Required (user's installed app) | 4.8.11 v185.15.0 (confirmed by user) | —                                          |
| osascript                    | Probe execution       | macOS built-in                  | macOS 25.4.0                         | —                                          |
| Node.js                      | MCP-based probes      | `node` in PATH                  | (check `node --version`)             | Run osascript-only probes                  |
| `npm run build`              | MCP probes            | Requires project build          | Latest dist                          | Skip MCP probes; use osascript-only        |
| OmniFocus running + unlocked | All JXA/OmniJS probes | Requires user action            | —                                    | Probes fail with "application not running" |

**Missing dependencies with no fallback:** OmniFocus must be running and not blocked by a dialog. Probe failures will
manifest as timeout or "not responding" errors.

**Note on OmniAutomation access:** `app.evaluateJavascript()` requires OmniFocus to be running. The MCP server handles
this via the existing `OmniAutomation` class (see `src/omnifocus/OmniAutomation.ts`). Probes can use either `osascript`
directly or the MCP tool surface.

---

## Open Questions

1. **Scripting Dictionary PDF version**
   - What we know: Added 2025-07-25. OF 4.5 shipped December 2024. OF 4.8.11 is current June 2026.
   - What's unclear: Which OF version generated the PDF. If it predates 4.7, `plannedDate` and other newer properties
     are absent.
   - Recommendation: Use `omni-automation.com` as the primary cite source. Use the PDF only for corroboration, not as
     the sole evidence source.

2. **Plug-in invocability from background osascript**
   - What we know: `omnifocus:///run-plug-in?identifier=...` URL scheme exists. Plug-ins require OmniFocus to be
     foregrounded and have a selection.
   - What's unclear: Whether osascript can trigger a URL scheme that invokes a plug-in without OmniFocus being the
     frontmost app.
   - Recommendation: Probe this specifically if any downstream phase (Phase 6) needs plug-in invocation. For Phase 1,
     record as `[ASSUMED]` limitation until probed.

3. **`archivedFilterRules` persistence across OmniFocus restarts**
   - What we know: The API is documented as read/write since OF 4.2 `[CITED: omni-automation.com]`.
   - What's unclear: Whether writes persist through app restart (vs. in-memory only during a session).
   - Recommendation: This is a gate-claim for Phase 6 PROV-01. The executor must include a probe that writes rules,
     quits/reopens OF, and reads back — or at minimum, writes and re-reads in a fresh osascript invocation.

4. **`plannedDate` availability in OF 4.8.11**
   - What we know: `plannedDate` is referenced in `omni-automation.com/omnifocus/task.html` as "v4.7+"
     `[CITED: Context7 fetch]`.
   - What's unclear: Exact version it was introduced.
   - Recommendation: If `plannedDate` is relevant to any agent workflow (session-day planning), probe its availability.
     Low priority for Phase 1 scope.

---

## Assumptions Log

| #   | Claim                                                                              | Section                   | Risk if Wrong                                                             |
| --- | ---------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------- |
| A1  | Scripting Dictionary PDF reflects OF4 (not OF3)                                    | Key Documentation Sources | PDF-sourced evidence would need to be downgraded to `unverified` entirely |
| A2  | Plug-in invocation from background osascript is not possible                       | AUTO area findings        | If wrong, Phase 6 could use plug-ins for perspective provisioning         |
| A3  | `task.addTag(tagName)` requires a pre-existing `Tag` object (does not auto-create) | TAG area                  | If auto-create works, Phase 2 tag management is simpler                   |
| A4  | `archivedFilterRules` writes persist across OmniFocus restarts                     | PERSP area                | If writes are session-only, PROV-01 cannot be implemented as planned      |
| A5  | OmniFocus has no built-in template system accessible via OmniJS                    | CAPTURE area              | If wrong, capture templates could simplify Phase 2 task creation          |

---

## State of the Art

| Old Approach                                       | Current Approach                                                                                    | When Changed                           | Impact                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| JXA direct property access                         | OmniJS-first (all logic in `evaluateJavascript()`)                                                  | 2025-11-27 (repo decision)             | Eliminates "Can't convert types" errors; faster performance    |
| Template string script building                    | AST script builder (`mutation-script-builder.ts`)                                                   | 2025-12-18 (Phase 4 hardening)         | Smaller script size, composable mutations                      |
| `doc.flattenedTasks()` linear scan for all queries | Targeted collections (`inbox`, `tag.remainingTasks`, `project.flattenedTasks`) for specific queries | 2025 (OMNIFOCUS_QUERY_ALTERNATIVES.md) | Significant perf improvement for inbox and tag/project queries |
| Perspective tasks via custom perspective API       | No direct API — replicate filter rules                                                              | Current (OF 4.8.11)                    | READAS-01 requires custom filter replication logic             |
| `archivedFilterRules` unavailable                  | `archivedFilterRules` read/write available                                                          | OF 4.2                                 | Perspective provisioning/repair now possible                   |

**Deprecated/outdated:**

- JXA direct tag assignment (`task.tags = [...]` in JXA): silently no-ops — replaced by OmniJS `addTag()`
- `doc.flattenedTasks.whose({})` / `.where()`: forbidden — too slow, use OmniJS iteration
- `osascript` with JXA-direct scripts for complex operations: legacy/sunset — use OmniJS-first pattern

---

## Sources

### Primary (HIGH confidence)

- `/websites/omni-automation_omnifocus` (Context7) — OmniJS API reference: tag, task, project, perspective classes
- `docs/dev/JXA-VS-OMNIJS-PATTERNS.md` — empirically verified JXA vs OmniJS patterns (2025-11-27)
- `docs/dev/OMNIJS-FIRST-PATTERN.md` — standard probe/script pattern
- `docs/dev/SETTER-PATTERNS.md` — property setter decision matrix (verified, cited row numbers)
- `docs/OMNIFOCUS_QUERY_ALTERNATIVES.md` — filtering patterns and API limitations
- `src/omnifocus/scripts/` — existing scripts as ground truth for what MCP already wraps
- `tests/manual/perspectives/` — existing live probe harnesses

### Secondary (MEDIUM confidence)

- `support.omnigroup.com/documentation/omnifocus/universal/4.3.3/en/` — Omni's official user-facing docs (4.3.3, not
  4.8.11)
- `inside.omnifocus.com/url-schemes` — URL scheme documentation (stable, multiple OF versions)
- `omni-automation.com/omnifocus/perspective.html` — perspective API including `archivedFilterRules` (OF 4.2+ note
  confirmed)

### Tertiary (LOW confidence / [ASSUMED])

- `docs/OmniFocus Scripting Dictionary.pdf` — version uncertain; use as corroboration only
- WebSearch results about plug-in invocability from background context
- Template system absence (no docs found = likely absent, not confirmed absent)

---

## Metadata

**Confidence breakdown:**

- Standard stack (probe tooling): HIGH — all tools are in the repo and working
- Architecture (capability mapping): HIGH — codebase provides direct evidence for most areas
- Pitfalls: HIGH — most are documented from actual prior bugs (SETTER-PATTERNS.md, JXA-VS-OMNIJS)
- PDF version status: MEDIUM — best estimate is OF4, but version not confirmable without PDF reader
- Plug-in invocability: LOW — no probe has confirmed or denied

**Research date:** 2026-06-11 **Valid until:** 2026-09-11 (90 days — stable OmniJS API; re-verify if OF5 releases)
