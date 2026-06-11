# Phase 1: OmniFocus Capability Discovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in
> CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-11 **Phase:** 1-OmniFocus Capability Discovery **Areas discussed:** Evidence standard, Native-vs-build
verdict format, Report artifact shape, Automation-surface depth (all four selected)

---

## Target version (user-introduced constraint)

Not a pre-presented option — the user added it during area selection:

> "I am running OmniFocus 4.8.11 (v185.15.0), so the capabilities available in this and later versions are critical. We
> should NOT consider any features or limitations in OmniFocus 3. For any limitations or speculation regarding OmniFocus
> 4, those should be rooted in actual documentation for the latest version or we should probe / proof-of-concept /
> confirm."

**Outcome:** Locked as D-01/D-02. Drove the evidence-standard recommendation toward the hybrid (probe-to-confirm)
option.

---

## Evidence standard

| Option                        | Description                                                                                                                     | Selected |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Hybrid: synthesize then probe | Draft from OF4 docs + repo code; live-probe 4.8.11 for any claim gating a build decision; flag unconfirmed claims `unverified`. | ✓        |
| Doc/code synthesis only       | Faster desk research, no live probing. Risks unverified version-specific claims.                                                |          |

**User's choice:** Hybrid: synthesize then probe **Notes:** Directly aligned with the OF 4.8.11 constraint the user
introduced — speculation must be proven.

---

## Native-vs-build verdict format

| Option                        | Description                                                                                                        | Selected |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| 3-way + rubric + evidence tag | `native` / `extend` / `build`, one-line rubric reason, `evidence: verified\|doc\|unverified`. Citable finding IDs. | ✓        |
| Binary native/build           | Simpler two-way call; loses the thin-wrapper middle ground.                                                        |          |

**User's choice:** 3-way + rubric + evidence tag **Notes:** Captures the common "OF does it, agent needs a thin wrapper"
case that binary would collapse.

---

## Report artifact shape

| Option                              | Description                                                                             | Selected |
| ----------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| Single doc in docs/reference/ + IDs | One consolidated report with per-finding anchor IDs for mechanical downstream citation. | ✓        |
| One doc per area                    | Folder of six docs; easier to grow, fragments citation.                                 |          |

**User's choice:** Single doc in docs/reference/ + IDs **Notes:** Lives at `docs/reference/omnifocus-capabilities.md`;
finding-ID scheme `DISC-<AREA>-NN`.

---

## Automation-surface depth

| Option                            | Description                                                                                            | Selected |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| Evaluated against milestone needs | Per surface: fit note for capture, routing, perspective provisioning (PROV-01). De-risks later phases. | ✓        |
| Inventory-only                    | List surfaces without workflow-fit evaluation. Keeps Phase 1 tight.                                    |          |

**User's choice:** Evaluated against milestone needs **Notes:** Fit assessment, not implementation design — stays inside
the phase boundary.

---

## Claude's Discretion

- Section ordering/headings within the report.
- Which claims meet the "gates a build decision" bar and require a live probe.
- Reconciling the area-code list with the final report structure / the roadmap "six areas" count ambiguity.

## Deferred Ideas

None — discussion stayed within phase scope. Carried requirements READAS-01 / PROV-01 / MIG-01 remain roadmapped to
Phase 6 and are informed by, not built in, this phase.
