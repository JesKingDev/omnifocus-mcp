# Phase 1: OmniFocus Capability Discovery - Context

**Gathered:** 2026-06-11 **Status:** Ready for planning

<domain>
## Phase Boundary

Produce a **capability-discovery report** mapping OmniFocus native behavior across the areas named in DISC-01 — tagging,
filtering, custom fields, perspectives, the project/task data model (sequencing + dependencies, sequential vs.
parallel), native capture (inbox, templates), and automation surfaces (OmniAutomation / URL schemes / plug-ins) — and
record an explicit **native-vs-build decision per area** (DISC-02). This report **gates every later phase**: each
downstream phase must be able to cite a discovery finding for its build-vs-reuse call.

This phase produces **documentation and evidence**, not feature code. The only "code" written is throwaway probes / POCs
used to confirm capability claims against the live app.

**In scope:** documenting native behavior, the native-vs-build call per area, and running confirmation probes. **Out of
scope:** building capture/routing/review/archaeology features (Phases 2–6), provisioning perspectives (PROV-01, Phase
6), migration (MIG-01, Phase 6). Findings here _inform_ those phases; they are not built here.

</domain>

<decisions>
## Implementation Decisions

### Target version (locked constraint)

- **D-01:** The report targets **OmniFocus 4.8.11 (build v185.15.0)** — the user's installed version. Capabilities of
  this and later OF4 versions are what matter.
- **D-02:** **No OmniFocus 3 features or limitations** enter the report. Any OF4 capability claim must be rooted in
  current OF4 documentation **or** empirically probed/confirmed against the running app. Any asserted OF4 _limitation_
  must likewise be doc-cited or proven by probe/POC — never assumed or carried over from OF3-era knowledge.

### Evidence standard

- **D-03:** **Hybrid: synthesize → probe-to-confirm.** Draft each area's native-behavior claims from OF4 official
  documentation + the existing repo code/scripts, then run a **live probe/POC against OmniFocus 4.8.11** (via the
  existing MCP tools / JXA / OmniJS) for any claim that **gates a build-vs-reuse decision**. Claims not live-confirmed
  are explicitly flagged `unverified`.

### Native-vs-build verdict format (DISC-02)

- **D-04:** Each area's call is recorded as a **3-way verdict**: `native` (use OF as-is) / `extend` (thin MCP wrapper
  over native behavior) / `build` (genuine custom logic the agent needs that OF does not provide).
- **D-05:** Every verdict carries a **one-line rubric reason** tied to the "don't build what's already solved"
  principle, plus an **evidence tag**: `evidence: verified | doc | unverified` (verified = live-probed on 4.8.11, doc =
  OF4-documentation-cited, unverified = neither — flagged for follow-up).

### Report artifact shape

- **D-06:** **Single consolidated report** living in the repo at `docs/reference/omnifocus-capabilities.md` (durable
  reference, consumed across all phases — not planning scaffolding).
- **D-07:** **Per-finding anchor IDs** so downstream PLAN/CONTEXT can cite a finding mechanically. Scheme:
  `DISC-<AREA>-NN`, where `<AREA>` is a short code per capability sub-area — suggested: `TAG`, `FILTER`, `FIELD`,
  `PERSP`, `MODEL`, `CAPTURE`, `AUTO`. Giving tagging / filtering / custom-fields their own codes also resolves the
  roadmap's "six areas" vs five-enumerated counting ambiguity (see Open Notes).

### Automation-surface depth

- **D-08:** Automation surfaces are **evaluated against this milestone's actual needs**, not merely inventoried. For
  each surface (OmniAutomation / Omni Automation plug-ins, URL schemes, AppleScript/JXA bridge), record a **fit note**
  for: agent capture, routing writes, perspective provisioning (PROV-01), and what the MCP server already relies on.
  This is a **fit assessment, not implementation design** — it stays inside the phase boundary while de-risking Phases
  2–6.

### Claude's Discretion

- Exact section ordering and headings within the report.
- Which specific claims rise to the "gates a build decision" bar and therefore require a live probe (apply judgment; err
  toward probing anything that, if wrong, would cause a later phase to build the wrong thing).
- Reconciliation of the area-code list above with the final report structure.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents (researcher, planner) MUST read these before planning or implementing.**

### Phase requirements & roadmap

- `.planning/REQUIREMENTS.md` — DISC-01, DISC-02 (full acceptance criteria); locked sequencing constraint (discovery
  gates everything).
- `.planning/ROADMAP.md` §"Phase 1: OmniFocus Capability Discovery" — goal + three success criteria.
- `.planning/PROJECT.md` — architecture stance (OmniFocus = single source of truth), constraints (macOS-only, least
  privilege), and the "don't build custom code for solved problems" rationale driving DISC-02.

### OmniFocus capability sources (primary evidence)

- `docs/OmniFocus Scripting Dictionary.pdf` — native scripting model (classes, properties, commands); a primary
  doc-evidence source. **Verify it reflects OF 4.8.11**; treat as `doc` evidence, confirm version-sensitive claims by
  probe.
- `docs/dev/JXA-VS-OMNIJS-PATTERNS.md` — JXA (outer) vs OmniJS (bridge) syntax differences; needed to write correct
  probes.
- `docs/dev/OMNIJS-FIRST-PATTERN.md` — preferred execution pattern for new probe scripts.
- `docs/dev/SETTER-PATTERNS.md` — OmniJS/JXA property-setter behavior (silent-write-failure risk) — relevant when a
  probe writes.
- `docs/OMNIFOCUS_QUERY_ALTERNATIVES.md` — filtering/query capability notes (e.g., why `.whose()/.where()` is avoided).

### Existing native-capability coverage in the codebase (reuse / `extend` candidates)

- `src/omnifocus/scripts/perspectives.ts` + `src/omnifocus/scripts/perspectives/` — perspectives list/read already
  implemented; primary input to the perspectives finding (and READAS-01 / PROV-01 downstream).
- `src/omnifocus/scripts/reviews.ts`, `src/omnifocus/scripts/recurring.ts`, `src/omnifocus/scripts/tasks.ts`,
  `src/omnifocus/scripts/analytics/` — existing coverage of review, repetition, task, and analytics surfaces; evidence
  of what's already `native`/`extend` vs. genuinely needs `build`.
- `tests/manual/perspectives/` — existing manual perspective probes; reusable harness for the live-probe step.

### External (to fetch during research)

- OmniFocus 4 official documentation + Omni Automation API reference (`omni-automation.com` / Omni's OF4 help) — the
  authoritative `doc` source for version-specific OF4 claims. Use Context7/web during research; cite versioned pages.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `src/omnifocus/scripts/` (perspectives, reviews, recurring, tasks, analytics, export, system): this fork already
  exercises a large slice of OmniFocus' native surface through working scripts — the fastest ground-truth for what OF
  does natively and what the MCP already wraps. Most areas will resolve to `native` or `extend`, not `build`.
- `tests/manual/perspectives/*` and `docs/jxa-test-utilities.js`: ready harnesses for live probes against 4.8.11.
- The unified MCP tool surface (`omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system`) is itself a live
  probe instrument — capability claims can be confirmed by issuing real tool calls.

### Established Patterns

- OmniJS-first for new scripts; JXA outer + OmniJS bridge for parent/relationship reads (per CLAUDE.md + dev docs).
- Silent-write-failure is a known bridge risk — any write-probe must read back to confirm (mirrors the Phase 5
  write-verifier shipped in the hardening milestone).

### Integration Points

- The report is consumed by downstream phase CONTEXT/PLAN docs via the `DISC-<AREA>-NN` finding IDs — that citation
  contract is the integration surface this phase exposes.

</code_context>

<specifics>
## Specific Ideas

- User runs OmniFocus **4.8.11 (v185.15.0)** and was explicit: anything speculative about OF4 must be confirmed by
  documentation or by probe/POC. Treat "unverified" as a real, visible status in the report, not a silent gap.
- The report's value is gating: a finding is only useful if a later phase can point at it and say "we reuse X / we build
  Y because DISC-…". Optimize the report for that citation use, not for completeness theater.

</specifics>

<deferred>
## Deferred Ideas

None raised — discussion stayed within the phase boundary. Carried-but-not-this-phase requirements (READAS-01, PROV-01,
MIG-01) are already roadmapped to Phase 6 and are _informed by_ this phase's findings, not built here.

## Open Notes (for researcher / planner)

- **"Six areas" count ambiguity:** ROADMAP success criterion 1 says "all six named areas" but enumerates five
  comma-separated clusters (tagging/filtering/custom-fields, perspectives, data-model, capture, automation). Not a user
  decision — the per-finding area codes (`TAG`/`FILTER`/`FIELD`/…) make granularity explicit regardless of count.
  Planner: reconcile section structure against the literal DISC-01 wording; ensure every named sub-area appears.
- **Scripting Dictionary version:** confirm the bundled PDF reflects OF 4.8.11 before relying on it as `doc` evidence;
  if stale, downgrade affected claims to `unverified` pending probe.

</deferred>

---

_Phase: 1-OmniFocus Capability Discovery_ _Context gathered: 2026-06-11_
