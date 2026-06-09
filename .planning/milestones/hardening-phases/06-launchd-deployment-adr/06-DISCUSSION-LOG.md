# Phase 6: launchd Deployment & ADR - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in
> CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09 **Phase:** 06-launchd-deployment-adr **Areas discussed:** Node path pinning + TCC survival,
Fail-fast permission probe, ADR location & format, launchd install & lifecycle **Mode:** advisor (research-backed
comparison tables; calibration tier `minimal_decisive` from vendor philosophy `opinionated`)

---

## Node Path Pinning + TCC Survival

| Option                        | Description                                                                                                                       | Selected |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Fixed-path binary copy        | Copy node to `~/.local/libexec/of-mcp-node`, overwrite in-place after upgrades; TCC grant survives because the path never changes | ✓        |
| Opt-symlink + accept re-grant | Pin plist to `/opt/homebrew/opt/node/bin/node`, re-grant Automation after major Node upgrades                                     |          |

**User's choice:** Fixed-path binary copy **Notes:** Research established the deciding fact — macOS TCC resolves
symlinks to the canonical `realpath`, so symlink strategies do not preserve the grant across `brew upgrade`. Under
launchd a lost grant fails silently (no consent UI), so eliminating that failure mode outweighs the one-line re-copy
step in the upgrade runbook.

---

## Fail-Fast Permission Probe

| Option                                                | Description                                                                                                                                         | Selected |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| JXA `osascript` probe, 5s timeout, inline             | Spawn `osascript` reading `OmniFocus.name()`, SIGKILL after 5s, exit 1 on `-1743` / exit 2 on timeout, runs in entrypoint before binding transports | ✓        |
| Native `AEDeterminePermissionToAutomateTarget` helper | Compiled Swift/native helper using the canonical non-prompting API                                                                                  |          |

**User's choice:** JXA `osascript` probe, inline, 5s timeout **Notes:** Matches the server's existing JXA execution
model with zero new dependencies. The native API is theoretically cleaner (distinguishes denied vs not-determined) but
has a documented hang bug that still requires a timeout wrapper, and adds a compiled artifact to rebuild/sign on macOS
upgrades — not worth it for a single-Mac deployment where the remediation message is identical in both cases.

---

## ADR Location & Format

| Option                                            | Description                                                                                                                                                                             | Selected |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| In-repo `docs/adr/`, ADR 005, Nygard + vault stub | Canonical ADR at `docs/adr/ADR-005-deployment-posture.md`, Nygard format, continues vault series at 005, supersedes ADR 001 via status header + back-reference stub in the JessOS vault | ✓        |
| Vault-only                                        | Keep the ADR series unified in the JessOS vault alongside 001/003/004                                                                                                                   |          |

**User's choice:** In-repo `docs/adr/`, ADR 005, Nygard, vault stub **Notes:** The ADR documents repo-resident
deployment artifacts (plist, probe), so co-locating it with the code wins on discoverability and version-control.
Continuing the vault numbering at 005 avoids two numbering schemes. Nygard over MADR because the decisions are already
locked — the ADR records rationale (incl. Cloudflare/Funnel declines), not open options.

---

## launchd Install & Lifecycle

| Option                                  | Description                                                                                                                 | Selected |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| In-repo plist template + `make install` | Versioned plist template, Makefile substitutes pinned Node path and `launchctl bootstrap`s it; `make uninstall` reverses it | ✓        |
| Documented manual steps only            | Runbook documents the plist and `launchctl` commands; no install tooling                                                    |          |

**User's choice:** In-repo plist template + `make install` **Notes:** Reviewable, git-tracked, one-command install —
fits the declarative-config preference and aversion to untracked hidden-dir scripts. Lifecycle is the long-running
HTTP-daemon pattern (`RunAtLoad`, `KeepAlive=Crashed-only`, `ThrottleInterval=10`) because this LaunchAgent hosts the
HTTP/Tailscale transport, not the stdio-per-session path. Least-privilege plist hygiene confirmed:
`ProcessType=Background`, `SessionCreate` unset, no FDA/network/UserName keys.

## Claude's Discretion

- Exact in-repo plist template directory, Makefile wiring, and probe module path under `src/` — follow existing repo
  layout.
- Whether the end-to-end write verification (Phase goal) ships as a `make verify` target or a documented manual runbook
  step.

## Deferred Ideas

- **Log rotation** — launchd appends forever; acceptable for a low-volume personal deployment, revisit only if size
  becomes a problem.
- **Runtime funnel-detection guard** — already declined in Phase 4 (D-17); the ADR records why, no code added.
