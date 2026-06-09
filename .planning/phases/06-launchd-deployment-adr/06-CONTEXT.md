# Phase 6: launchd Deployment & ADR - Context

**Gathered:** 2026-06-09 **Status:** Ready for planning

<domain>
## Phase Boundary

Package the hardened MCP server as a least-privilege macOS **LaunchAgent**: a pinned, stable Node binary path that keeps
the TCC Automation grant alive across `brew upgrade`, an Automation-only permission posture (no Full Disk Access, no
open network), a fail-fast startup probe that errors loudly when the grant is missing, and a new **ADR** documenting the
deployment posture and security model, superseding ADR 001.

This phase clarifies HOW to deploy and document what Phases 1–5 hardened. It does **not** re-decide the network/security
posture — that was locked in Phase 4 and is carried forward below. New capabilities belong in other phases. </domain>

<decisions>
## Implementation Decisions

### Node Runtime Pinning — DEPLOY-01 (TCC grant survival)

- **D-01: Fixed-path binary copy.** Copy Homebrew's `node` to a user-owned stable path (`~/.local/libexec/of-mcp-node`)
  and overwrite it **in place** on deliberate upgrades. Rationale: macOS TCC resolves symlinks to the canonical
  `realpath` and keys the Automation grant to that resolved binary path — so _no_ symlink strategy
  (`/opt/homebrew/bin/node`, the `opt` path, or a hand-rolled link) survives a `brew upgrade` that moves the Cellar
  target. A path we own, overwritten in place, never changes from TCC's view, so the grant persists. Under launchd a
  lost grant fails **silently** (no UI to re-prompt), which is the exact failure this defends against.
- **D-02: plist points at the pinned copy; install + upgrade runbook owns the copy.** `ProgramArguments[0]` is the fixed
  path from D-01. The install script performs the initial copy; the `brew upgrade` runbook documents the one-line
  re-copy (`cp "$(brew --prefix)/bin/node" ~/.local/libexec/of-mcp-node`). No ad-hoc code-signing required — TCC keys
  path-based (unsigned) clients on path, not signature.

### Fail-Fast Permission Probe — DEPLOY-03

- **D-03: JXA `osascript` read probe, inline in the entrypoint.** Spawn
  `osascript -l JavaScript -e 'Application("OmniFocus").name()'` as a child process **before binding any MCP
  transport**. Reuses the exact JXA execution path the server already uses, so it probes the real grant — no native
  add-on, no new dependency. Inline (not a separate plist preflight script) keeps one process, one stderr log path.
- **D-04: 5s hard timeout; loud non-zero exit contract.** Enforce a 5-second timeout via `setTimeout` +
  `proc.kill('SIGKILL')` so the probe can never hang on a suppressed TCC consent dialog. Failure behavior:
  - Denial (`-1743` / `errAEEventNotPermitted` in stderr, or non-zero exit): write a human-readable remediation message
    to stderr ("OmniFocus Automation permission is not granted. Open System Settings → Privacy & Security → Automation,
    enable OmniFocus for this process, then restart the LaunchAgent."), `process.exit(1)`.
  - Timeout: write a timeout/remediation message to stderr, `process.exit(2)`.
  - Clean exit: proceed to bind transports. launchd routes stderr to the plist `StandardErrorPath`; the non-zero exit +
    `KeepAlive=Crashed-only` (D-08) means a permission failure does **not** spin in a restart loop.

### Deployment ADR — DEPLOY-04

- **D-05: ADR lives in-repo at `docs/adr/ADR-005-deployment-posture.md`, Nygard format.** Co-located with the plist and
  probe it governs, version-controlled with the deployment artifacts, discoverable by anyone reading the code. Nygard
  (Status / Context / Decision / Consequences) over MADR — the decisions are already locked, so the job is recording
  rationale (including the Cloudflare and Funnel declines), not weighing open options.
- **D-06: Continue the series at ADR 005; cross-store supersede of ADR 001.** ADR 001/003/004 live in the JessOS vault
  (not in-repo); continuing at 005 beats a second in-repo numbering scheme. Supersede via
  `Status: Accepted — Supersedes ADR 001` in the new ADR, plus a one-line back-reference added to ADR 001 in the vault
  (`Superseded by ADR 005 — omnifocus-mcp repo, docs/adr/ADR-005-deployment-posture.md`). The vault edit is a manual
  step outside this repo; the plan should flag it as a follow-up, not a code task.

### launchd Install & Lifecycle — DEPLOY-01 / DEPLOY-02

- **D-07: In-repo plist template + `make install` / `make uninstall`.** Versioned plist template under source control;
  the Makefile target substitutes the pinned Node path (D-01) and `launchctl bootstrap gui/$(id -u)`s it into
  `~/Library/LaunchAgents/`; `make uninstall` `launchctl bootout`s and removes it. Reviewable, git-tracked, one-command
  install — no untracked scripts in hidden dirs.
- **D-08: Long-running HTTP-daemon lifecycle.** This LaunchAgent hosts the long-running HTTP/Tailscale-Serve transport
  (the stdio-per-session path is spawned by Claude Desktop itself, not by launchd). Keys: `RunAtLoad=true`,
  `KeepAlive={ Crashed=true }` (restart only on abnormal exit, so a clean shutdown or a permission-denial exit stays
  down), `ThrottleInterval=10` for crash backoff.
- **D-09: Least-privilege plist hygiene.** `Label=com.kip-d.omnifocus-mcp`, `ProcessType=Background`, logs to
  `~/Library/Logs/omnifocus-mcp/server.log` and `server.err` (install creates the dir). Leave `SessionCreate` **unset**
  (setting it spawns a new security session that can break the Automation/Apple-Events flow). No `UserName`/`GroupName`
  (those are for system LaunchDaemons), no `Sockets`, no entitlement/FDA keys — a LaunchAgent grants no privilege by
  itself; Automation is the only grant requested, at runtime.

### Claude's Discretion

- Exact plist template directory in-repo (e.g. `deploy/launchd/` vs `.config/launchd/`), Makefile target wiring, and the
  precise probe module path under `src/` — planner/executor choose, following existing repo layout conventions.
- Whether the install script also performs a one-shot end-to-end write verification (the Phase goal's "verified
  end-to-end write under launchctl") as a `make verify` target or a documented manual runbook step. </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements

- `.planning/ROADMAP.md` — Phase 6 section (goal, success criteria 1–4).
- `.planning/REQUIREMENTS.md` — DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04 (the four requirements this phase closes).
- `.planning/PROJECT.md` — Mac-pin / Tailscale-default / no-open-network posture; the ADR-001-supersede obligation.

### Locked network/security posture the ADR DOCUMENTS (do not re-decide)

- `.planning/phases/04-http-edge-hardening/04-CONTEXT.md` — **MUST read.** D-13 (loopback-only `127.0.0.1` bind +
  fail-closed assertion), D-16 (Tailscale Serve, never Funnel; Cloudflare evaluated and declined), D-17 (runtime
  funnel-detection guard declined — loopback bind + mandatory bearer make Funnel harmless). The ADR records these and
  their rationale; it does not change them.

### External ADRs (not in-repo)

- ADR 001 (obsidian-tasks-plugin — to be superseded), ADR 003 (integration-policy), ADR 004 (OAuth amendment) live in
  the **JessOS Obsidian vault**, not in this repo. No in-repo ADR files exist yet. Resolve via the JessOS pointer if
  their content is needed; the back-reference stub edit to ADR 001 (D-06) happens there.

### Platform docs

- Tailscale Serve — https://tailscale.com/docs/features/tailscale-serve (Serve vs Funnel, same loopback-port behavior).
- macOS TCC Automation grant behavior (TCC resolves to binary `realpath`; launchd has no consent UI) — see D-01
  rationale; relevant for the pinning and probe decisions.
- `@modelcontextprotocol/sdk` (see `package.json`) — the server entrypoint where transports bind; the probe (D-03) runs
  before transport binding. </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Existing JXA / `osascript` execution path in `src/omnifocus/` — the permission probe (D-03) reuses this exact code
  path rather than introducing a parallel mechanism.
- Phase 1/4 fail-closed startup assertions (loopback bind, auth-required, distinct tokens) in the server startup /
  `cli.ts` path — the probe follows the same "assert loudly at startup, refuse to start otherwise" pattern.

### Established Patterns

- Fail-closed by default (project-wide since Phase 1). The probe's exit-on-denial and the plist's
  `KeepAlive=Crashed-only` both honor this: a missing grant is a loud refusal to run, not a degraded silent state.

### Integration Points

- Server entrypoint (where MCP stdio/HTTP transports bind) — insert the probe before any `bind`/`listen`.
- New `docs/adr/` directory (first in-repo ADR).
- New in-repo plist template + Makefile install/uninstall targets.
- `~/.local/libexec/of-mcp-node` (pinned runtime), `~/Library/LaunchAgents/com.kip-d.omnifocus-mcp.plist` (installed
  unit), `~/Library/Logs/omnifocus-mcp/` (logs). </code_context>

<specifics>
## Specific Ideas

- Pinned Node path: `~/.local/libexec/of-mcp-node`
- LaunchAgent label: `com.kip-d.omnifocus-mcp`
- Installed plist: `~/Library/LaunchAgents/com.kip-d.omnifocus-mcp.plist`
- Logs: `~/Library/Logs/omnifocus-mcp/{server.log,server.err}`
- ADR file: `docs/adr/ADR-005-deployment-posture.md` (Nygard format)
- Probe timeout: 5000 ms; exit codes — `1` = Automation denied (`-1743`), `2` = probe timeout
- Lifecycle: `RunAtLoad=true`, `KeepAlive={ Crashed=true }`, `ThrottleInterval=10`, `ProcessType=Background`,
  `SessionCreate` unset </specifics>

<deferred>
## Deferred Ideas

- **Log rotation.** launchd appends forever and `newsyslog` does not rotate per-user `~/Library/Logs/` by default.
  Acceptable for a low-volume personal deployment; revisit (simple periodic truncate / logrotate) only if size becomes a
  problem.
- **Runtime funnel-detection guard.** Already declined in Phase 4 (D-17) — loopback bind + mandatory bearer make a
  Funnel misconfiguration harmless, and a boot-time `tailscale serve status --json` check adds a fragile CLI/LocalAPI
  dependency. The Phase 6 ADR records _why_ it was declined; no code is added.

### Reviewed Todos (not folded)

None — no pending todos matched this phase. </deferred>

---

_Phase: 06-launchd-deployment-adr_ _Context gathered: 2026-06-09_
