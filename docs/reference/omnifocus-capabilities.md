---
target: 'OmniFocus 4.8.11 (build v185.15.0)'
generated: 2026-06-11
status: draft
phase: 1 — OmniFocus Capability Discovery
---

# OmniFocus Capability Discovery Report

> **Status:** Scaffold only. Findings are populated in Plans 02–03 and audited in Plan 04. Area-level verdicts shown in
> the TL;DR below are **provisional** until each finding lands.

## TL;DR

```mermaid
flowchart TD
    R["OmniFocus Capability<br/>Discovery (7 areas)"]
    R --> N["native<br/>use OF as-is"]
    R --> E["extend<br/>thin MCP wrapper"]
    R --> B["build<br/>custom logic"]

    N --> FIELD["FIELD · custom fields"]
    N --> MODEL["MODEL · data model"]
    N --> AUTO["AUTO · automation"]

    E --> TAG["TAG · tagging"]
    E --> FILTER["FILTER · filtering"]
    E --> CAPTURE["CAPTURE · capture"]

    B --> PERSP["PERSP · perspectives*"]

    classDef native fill:#cfe8d8,stroke:#6b9080,color:#23423a;
    classDef extend fill:#d6e4f0,stroke:#5a7d9a,color:#243a4a;
    classDef build fill:#f0e2cf,stroke:#b08968,color:#4a3a28;
    classDef root fill:#e8e8ea,stroke:#9a9aa0,color:#2a2a30;

    class R root;
    class N,FIELD,MODEL,AUTO native;
    class E,TAG,FILTER,CAPTURE extend;
    class B,PERSP build;
```

\* PERSP is mixed: list/read is `extend`, filter-rule write is `native` (pending probe), and perspective task-resolution
is `build`. The diagram places it under its most distinctive verdict; per-finding verdicts carry the real nuance. This
diagram is approximate and is refreshed in Plan 04 once all findings are recorded.

## Purpose and Scope

This report targets **OmniFocus 4.8.11 (build v185.15.0)** and documents OmniFocus native behavior across the seven
capability areas named in DISC-01: tagging, filtering, custom fields, perspectives, the project/task data model
(sequencing + dependencies, sequential vs. parallel), native capture (inbox, templates), and automation surfaces
(OmniAutomation / URL schemes / plug-ins). For each area it records a **3-way native-vs-build verdict** (DISC-02) so
downstream phases (2–6) can cite a specific finding when making a build-vs-reuse call. This phase produces
**documentation and evidence**, not feature code — the only scripts written are throwaway probes used to confirm
capability claims against the live app.

## Evidence Standard and Verdict Format

### Verdict values (D-04)

Each area's call is exactly one of:

| Verdict  | Meaning                                                               |
| -------- | --------------------------------------------------------------------- |
| `native` | Use OmniFocus as-is; no MCP logic needed beyond invoking the API.     |
| `extend` | Thin MCP wrapper over native behavior (CRUD glue, a permission gate). |
| `build`  | Genuine custom logic OmniFocus does not provide.                      |

**Single-value area-verdict rule:** each area-level verdict MUST be exactly one of `native` / `extend` / `build`. When
behavior genuinely differs across sub-claims within an area, express the nuance through separate **per-finding**
verdicts; the area-level verdict remains a single value.

### Evidence tags (D-05)

Every verdict carries a one-line rubric reason (tied to the "don't build what's already solved" principle) plus exactly
one evidence tag:

- `evidence: verified` — the claim was **LIVE-PROBED on OmniFocus 4.8.11** and the probe output is recorded in this
  report. This tag is **reserved for live probes on 4.8.11**. NEVER use it for codebase-doc citations, README
  references, or inference from existing scripts.
- `evidence: doc` — the claim is cited from official OF4 documentation, the Scripting Dictionary, or an identified
  codebase file (CLAUDE.md, SETTER-PATTERNS.md, etc.) that itself documents the behavior.
- `evidence: unverified` — the claim comes from a community post, an API omission, inference, or any other source that
  is neither a live probe nor official doc. Always accompanied by a follow-up note.

### Anchor-ID scheme (D-07)

Findings carry stable anchor IDs of the form `DISC-<AREA>-NN`, where `<AREA>` is one of **TAG / FILTER / FIELD / PERSP /
MODEL / CAPTURE / AUTO** and `NN` starts at `01` and increments sequentially within the area (one finding per distinct
capability claim). The `NN=00` slot is reserved for an area-level verdict summary if useful.

**Tombstone discipline:** if a finding is invalidated during the consistency audit (Plan 04), mark it `REMOVED` in place
— do **not** renumber. Downstream phases may already cite a DISC ID, so ID stability is the contract; renumbering would
silently break those citations.

### Finding entry template

Each finding is recorded as a header plus a five-field table:

```markdown
#### DISC-TAG-01 — <short claim title>

| Field           | Value                                              |
| --------------- | -------------------------------------------------- |
| Verdict         | native \| extend \| build                          |
| Rubric          | one-line reason tied to "don't rebuild solved"     |
| Evidence        | evidence: verified \| doc \| unverified            |
| Source          | probe script path, doc URL, or codebase file:line  |
| Downstream cite | which phase(s)/requirement(s) consume this finding |
```

---

## Tagging (TAG)

DISC-01 coverage: "tagging"

### Area Verdict

- Verdict: _to be determined in Plan 02_
- Evidence: _pending_
- Rubric: _pending_

### Findings

— to be populated in Plan 02 or Plan 03 —

---

## Filtering (FILTER)

DISC-01 coverage: "filtering"

### Area Verdict

- Verdict: _to be determined in Plan 02_
- Evidence: _pending_
- Rubric: _pending_

### Findings

— to be populated in Plan 02 or Plan 03 —

---

## Custom Fields (FIELD)

DISC-01 coverage: "custom fields"

### Area Verdict

- Verdict: _to be determined in Plan 02_
- Evidence: _pending_
- Rubric: _pending_

### Findings

— to be populated in Plan 02 or Plan 03 —

---

## Data Model (MODEL)

DISC-01 coverage: "the project/task data model (sequencing + dependencies — sequential vs. parallel)"

### Area Verdict

- Verdict: _to be determined in Plan 02_
- Evidence: _pending_
- Rubric: _pending_

### Findings

— to be populated in Plan 02 or Plan 03 —

---

## Perspectives (PERSP)

DISC-01 coverage: "perspectives"

### Area Verdict

- Verdict: _to be determined in Plan 03_
- Evidence: _pending_
- Rubric: _pending_

### Findings

— to be populated in Plan 02 or Plan 03 —

---

## Capture (CAPTURE)

DISC-01 coverage: "native capture workflows (inbox, templates)"

### Area Verdict

- Verdict: _to be determined in Plan 03_
- Evidence: _pending_
- Rubric: _pending_

### Findings

— to be populated in Plan 02 or Plan 03 —

---

## Automation Surfaces (AUTO)

DISC-01 coverage: "automation surfaces (OmniAutomation / URL schemes / plug-ins)"

### Area Verdict

- Verdict: _to be determined in Plan 03_
- Evidence: _pending_
- Rubric: _pending_

### Findings

— to be populated in Plan 02 or Plan 03 —

<!-- WAVE-0-HARNESS-CHECK -->
<!--
Wave 0 probe-harness warmup — sanitized evidence (counts / booleans / exit status only; NO task,
project, or perspective names per threat T-01-03). Confirms probes produce valid evidence before
any finding is marked `evidence: verified`.

| Check               | Command                                                                        | Result                                                                  |
| ------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Build               | npm run build (tsc)                                                             | pass — dist/index.js present, no type errors                            |
| Discovery utilities | osascript -l JavaScript docs/jxa-test-utilities.js                             | exit 0 — 7 collections enumerated, no exception thrown                   |
| Perspective harness | osascript -l JavaScript tests/manual/perspectives/test-perspectives-simple.js  | exit 0 — OmniJS Perspective.all returned 25 perspectives (count only)   |

Run timestamp (UTC): 2026-06-11T20:15Z
OmniFocus version: 4.8.11 (build v185.15.0) — user-declared target per D-01; not emitted by these probes.

Notes:
- jxa-test-utilities.js: exit 0; structured output present (7 collection-count lines); zero exceptions.
- test-perspectives-simple.js: exit 0. The OmniJS path (Perspective.all via evaluateJavascript) returned
  25 perspectives cleanly. The JXA fallback sub-path window.perspective() raised a non-fatal
  "Can't convert types" error (expected JXA limitation per docs/dev/JXA-VS-OMNIJS-PATTERNS.md), which
  reinforces OmniJS-first: evidence:verified probes in Plans 02-03 must use the OmniJS bridge, not JXA
  direct property access.
- No user-visible names, task content, or perspective names appear in this block.
-->
