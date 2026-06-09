---
phase: 06-launchd-deployment-adr
plan: '02'
subsystem: docs/adr
tags: [adr, deployment, security, launchd, tcc, macos]
dependency_graph:
  requires: []
  provides: [ADR-005-deployment-posture]
  affects: [docs/adr/]
tech_stack:
  added: []
  patterns: [Nygard ADR format, Mermaid deployment diagram]
key_files:
  created:
    - docs/adr/ADR-005-deployment-posture.md
  modified: []
decisions:
  - 'ADR-005 is the first in-repo ADR; vault ADRs 001/003/004 are not duplicated in-repo'
  - 'Developer-ID node (not Homebrew ad-hoc) required for TCC csreq/DR stability on upgrade'
  - 'Manual vault back-reference to ADR 001 flagged as follow-up (not a code task)'
metrics:
  duration: 130s
  completed: '2026-06-09T14:29:13Z'
  tasks_completed: 1
  files_changed: 1
---

# Phase 06 Plan 02: ADR-005 Deployment Posture and Security Model Summary

ADR-005 in Nygard format documenting the launchd deployment posture, TCC responsible-process/csreq finding, Developer-ID
node pin rationale, and Phase 4 network posture — superseding ADR 001.

## Tasks Completed

| Task | Name                                 | Commit  | Files                                            |
| ---- | ------------------------------------ | ------- | ------------------------------------------------ |
| 1    | Author ADR-005-deployment-posture.md | a3995a1 | docs/adr/ADR-005-deployment-posture.md (created) |

## Decisions Made

- **First in-repo ADR at docs/adr/.** ADR-001/003/004 live in the JessOS vault; continuing at 005 avoids a second
  numbering scheme.
- **Developer-ID node is required for grant survival.** Host-verified via `codesign -d -r-` and TCC.db inspection:
  Homebrew's ad-hoc node has a cdhash-based designated requirement that changes on every version, breaking the stored
  `csreq` on in-place overwrite. A Developer-ID node's DR is identity-based and survives.
- **Manual vault back-reference is a follow-up, not a code task.** The `Status: Accepted — Supersedes ADR 001` line in
  the ADR is the in-repo supersede marker. A one-line stub should be added to ADR 001 in the JessOS vault
  (`Superseded by ADR-005 — omnifocus-mcp repo, docs/adr/ADR-005-deployment-posture.md`).

## Deviations from Plan

None — plan executed exactly as written. The ADR includes all required sections (Status/Context/Decision/Consequences),
the supersede line, Developer-ID/cdhash/csreq rationale, Phase 4 network posture (loopback bind, Tailscale Serve,
Cloudflare declined, cloud ruled out by Mac pin), and a Mermaid TL;DR diagram.

## Requirements Closed

- **DEPLOY-04**: ADR documenting deployment posture and security model, explicitly superseding ADR 001 — CLOSED.

## Known Stubs

None. This is a documentation-only plan; no stubs exist.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes were introduced. The ADR documents
existing security decisions — it does not introduce new attack surface.

## Self-Check: PASSED

- [x] `docs/adr/ADR-005-deployment-posture.md` exists: FOUND
- [x] Commit `a3995a1` exists in git log: FOUND
- [x] `Supersedes ADR 001` literal string present in file
- [x] `Developer-ID` present in file
- [x] `Tailscale Serve` present in file
- [x] `cdhash` and `csreq` present in file
- [x] Mermaid block present (1 fenced block)
- [x] No hardcoded version strings in prose
- [x] Line count 224 (above 60-line minimum)
