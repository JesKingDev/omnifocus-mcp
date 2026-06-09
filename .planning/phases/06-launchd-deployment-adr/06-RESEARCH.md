# Phase 6: launchd Deployment & ADR - Research

**Researched:** 2026-06-09 **Domain:** macOS TCC Automation (Apple Events) attribution, launchd LaunchAgent lifecycle,
osascript denial signaling, Nygard ADR **Confidence:** MEDIUM-HIGH (TCC attribution now host-verified; one
locked-decision rationale needs correction)

## Summary

Phase 6 packages the hardened MCP server as a least-privilege macOS LaunchAgent whose OmniFocus Automation grant
survives `brew upgrade`, with a fail-fast permission probe and a new ADR. The entire deployment strategy rests on the
macOS TCC Automation attribution model, which STATE.md correctly flagged as MEDIUM-confidence community-sourced. This
research moved most of that chain to HIGH confidence by reading the **live TCC database, the local `launchd.plist(5)`
man page, and the actual code signatures of node binaries on this host** — not forum posts.

Two findings change the plan. **(1) The TCC grant is NOT attributed to node or to osascript — it is attributed to the
"responsible process," which under a LaunchAgent is the binary at `ProgramArguments[0]` (node).** The live TCC.db proves
this: existing OmniFocus Automation grants are keyed to `com.googlecode.iterm2`, `com.jetbrains.WebStorm`, etc. (the
parent apps), not to `osascript`. So pinning node's path (D-01) targets the right binary — good — but for the right
reason, which D-01's stated rationale gets partly wrong. **(2) D-01/D-02's claim that "no code-signing is required; TCC
keys path-based" is incomplete and is actively wrong for a Homebrew-sourced node.** TCC stores a `csreq`
(designated-requirement blob) alongside the path and re-validates it on every access. Homebrew's `node` is **ad-hoc
signed**, so its designated requirement IS its cdhash (`designated => cdhash H"..."`) — content-derived. Re-copying a
_different_ (upgraded) brew node to the same fixed path changes the cdhash, breaks the stored csreq, and **revokes the
grant even though the path is identical**. This is exactly the "path-stable but content-changed" highest-risk unknown
from the objective, and the host evidence answers it: **yes, an in-place overwrite with different ad-hoc-signed content
breaks the grant.**

The fix is small and keeps every locked decision intact except the "no signing" rationale: pin a node whose designated
requirement is **content-independent** (Developer-ID signed, e.g. the nvm/official node —
`designated => identifier "node" and anchor apple generic ... leaf[subject.OU] = HX7739G8FX`), OR ad-hoc re-sign the
pinned copy after each overwrite so its cdhash is re-registered (which still forces a re-grant the first time). The
launchd lifecycle decisions (D-04, D-08) are confirmed correct by the authoritative man page: `KeepAlive={Crashed=true}`
restarts ONLY on signal-induced crashes (SIGILL/SIGSEGV), NOT on a clean `process.exit(1)`/`exit(2)` — so a
permission-denial exit will not spin in a restart loop, exactly as intended.

**Primary recommendation:** Keep the fixed-path pin (D-01) but pin a **Developer-ID-signed node** (official pkg or nvm
build, not Homebrew's ad-hoc node) so the designated requirement is content-independent and survives in-place overwrite.
Then run a **verification spike under `launchctl` (not from a terminal)** to confirm the responsible-process attribution
and the brew-upgrade survival end to end, because terminal-run probes inherit the terminal's existing grant and give a
false pass.

## Architectural Responsibility Map

| Capability                         | Primary Tier                      | Secondary Tier  | Rationale                                                                   |
| ---------------------------------- | --------------------------------- | --------------- | --------------------------------------------------------------------------- |
| Automation permission grant        | macOS TCC (OS)                    | —               | TCC.db owns the grant; keyed to responsible process + csreq                 |
| Permission probe (fail-fast)       | Server entrypoint (node)          | osascript child | Probe runs in node before transport bind; spawns osascript as the requester |
| Process lifecycle / restart policy | launchd (OS)                      | plist KeepAlive | launchd supervises; plist declares restart-on-crash-only                    |
| Node runtime pinning               | Install/upgrade runbook (user)    | Makefile        | User owns the fixed-path copy; TCC validates its csreq                      |
| Remote reach                       | Tailscale Serve (already Phase 4) | loopback bind   | Documented by ADR, not re-decided here                                      |
| Deployment rationale record        | ADR (docs/adr)                    | —               | Nygard ADR, supersedes ADR 001                                              |

## Standard Stack

This phase adds no npm packages. The "stack" is macOS system tooling already present.

### Core

| Tool                 | Version (host)              | Purpose                                 | Why Standard                                                                        |
| -------------------- | --------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| `launchctl`          | Bootstrapper 7.0.0 (Darwin) | Load/unload the LaunchAgent             | The modern `bootstrap`/`bootout` API [VERIFIED: `launchctl version` on host]        |
| `osascript`          | system `/usr/bin/osascript` | Apple Events probe (JXA)                | Already the server's execution path; Apple-signed, stable [VERIFIED: codebase grep] |
| `codesign` / `csreq` | system                      | Inspect / set designated requirement    | Needed to reason about (and possibly fix) the csreq stability [VERIFIED: host]      |
| `node` (pinned)      | see note                    | Server runtime at `ProgramArguments[0]` | The TCC responsible process under launchd                                           |

### Node-source note (load-bearing)

| Source              | Signature                                                | Designated requirement                                                                                           | Grant survives in-place overwrite?                                    |
| ------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Homebrew `node`     | **ad-hoc** (`Signature=adhoc`, `TeamIdentifier=not set`) | `designated => cdhash H"1616…"` (content-derived)                                                                | **NO** — cdhash changes every version [VERIFIED: host codesign]       |
| nvm / official node | **Developer ID** (`Node.js Foundation HX7739G8FX`)       | `designated => identifier "node" and anchor apple generic … leaf[subject.OU] = HX7739G8FX` (content-independent) | **YES** — same signer satisfies the same DR [VERIFIED: host codesign] |

**No packages installed → Package Legitimacy Audit not applicable.** (Section omitted by design; this phase installs
nothing from a registry.)

## Architecture Patterns

### System Architecture Diagram

```mermaid
flowchart TD
    LA["launchd LaunchAgent<br/>(gui/501 domain)"] -->|RunAtLoad, spawns| NODE["node @ ~/.local/libexec/of-mcp-node<br/>(ProgramArguments[0])<br/>= TCC responsible process"]
    NODE -->|before transport bind| PROBE["Fail-fast probe<br/>spawn osascript -l JavaScript<br/>Application('OmniFocus').name()"]
    PROBE -->|requester| OSA["/usr/bin/osascript<br/>(Apple-signed)"]
    OSA -->|Apple Event| TCC{"tccd checks grant<br/>responsible=node csreq+path<br/>target=com.omnigroup.OmniFocus4"}
    TCC -->|auth_value=2 allowed| OF["OmniFocus<br/>returns name, exit 0"]
    TCC -->|denied / no grant<br/>-1743| DENY["probe sees -1743<br/>→ stderr remediation<br/>→ process.exit(1)"]
    OF -->|clean| BIND["bind MCP stdio + HTTP/Tailscale Serve"]
    DENY -.->|exit(1) is NOT a signal-crash| NORESTART["launchd KeepAlive=Crashed-only<br/>→ stays DOWN, no restart loop"]
    PROBE -->|5s timeout, SIGKILL| TO["exit(2) timeout remediation"]
    TO -.-> NORESTART
```

### Pattern 1: Probe-before-bind (fail-closed startup)

**What:** Run the Automation probe synchronously before any transport `bind`/`listen`. **When to use:** Always, per
D-03/D-04 and the project's existing fail-closed pattern. **Insertion point:** `src/index.ts` `runServer()`, immediately
before the `cliConfig.httpMode` branch (currently the existing non-blocking `PermissionChecker.checkPermissions()` block
lives there — see Pitfall 4). The probe must be **blocking and fail-fast**, unlike the current checker which only logs a
warning. **Example:**

```typescript
// Source: derived from existing src/utils/permissions.ts (host-verified -1743 detection)
import { spawn } from 'node:child_process';

async function probeAutomationOrExit(timeoutMs = 5000): Promise<void> {
  const stderr = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; err: string }>((resolve) => {
    const proc = spawn('osascript', ['-l', 'JavaScript', '-e', 'Application("OmniFocus").name()']);
    let err = '';
    proc.stderr.on('data', (d) => (err += d.toString()));
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs); // D-04 hard timeout
    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, err });
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ code: 1, signal: null, err: 'spawn failed' });
    });
  });

  if (stderr.signal === 'SIGKILL') {
    // timeout path
    process.stderr.write(
      'OmniFocus Automation probe timed out (possible suppressed consent dialog). ' +
        'Open System Settings → Privacy & Security → Automation, enable OmniFocus, then restart the LaunchAgent.\n',
    );
    process.exit(2);
  }
  if (stderr.code !== 0 || stderr.err.includes('-1743')) {
    // denial path (host-verified format)
    process.stderr.write(
      'OmniFocus Automation permission is not granted. ' +
        'Open System Settings → Privacy & Security → Automation, enable OmniFocus for this process, then restart the LaunchAgent.\n',
    );
    process.exit(1);
  }
  // clean exit → proceed to bind transports
}
```

### Pattern 2: LaunchAgent install via bootstrap/bootout

**What:** Modern replacement for the deprecated `launchctl load -w` / `unload -w`. **Example (host-verified syntax):**

```bash
# install (D-07)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.kip-d.omnifocus-mcp.plist
# uninstall
launchctl bootout gui/$(id -u)/com.kip-d.omnifocus-mcp
# or:  launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.kip-d.omnifocus-mcp.plist
```

`launchctl bootstrap <domain-target> [service-path...]` is confirmed by `launchctl bootstrap` usage output on this host
(Bootstrapper 7.0.0). [VERIFIED: host]

### Anti-Patterns to Avoid

- **Pinning Homebrew's ad-hoc node and overwriting in place.** [VERIFIED: host] Its designated requirement is the
  cdhash; every brew version is a different cdhash → grant breaks on the very upgrade D-01 is meant to survive.
- **Validating the probe from a terminal and declaring success.** The terminal (iTerm/Terminal) already holds its own
  OmniFocus grant; the probe inherits it and passes falsely. The LaunchAgent's responsible process is node, which has a
  _separate, initially-absent_ grant. Validate under `launchctl`.
- **Setting `SessionCreate=true`.** [VERIFIED: man 5 launchd.plist] It spawns the job into a new security audit session,
  which can break the Apple-Events/Automation responsibility chain. Leave unset (matches D-09).
- **Using both `SuccessfulExit` and `Crashed` in one KeepAlive dict.** Use only `Crashed=true` (D-08).

## Don't Hand-Roll

| Problem                          | Don't Build                     | Use Instead                                        | Why                                                      |
| -------------------------------- | ------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| Detecting Automation denial      | Custom AppleScript error parser | Reuse `src/utils/permissions.ts` `-1743` detection | Already host-verified; D-03 says reuse the existing path |
| Restart-on-crash supervision     | A wrapper/respawn script        | launchd `KeepAlive={Crashed=true}`                 | OS-native, signal-aware, throttled                       |
| Designated-requirement reasoning | Guessing about signatures       | `codesign -d -r-` + `csreq`                        | The DR is the actual csreq TCC stores                    |

**Key insight:** TCC attribution is OS-owned and subtle (responsible process + csreq re-validation). Do not try to
outsmart it in code — pin a binary whose DR is content-independent and let TCC validate normally.

## Common Pitfalls

### Pitfall 1: "Path-based grant survives in-place overwrite" — false for ad-hoc binaries

**What goes wrong:** D-01/D-02 assume overwriting the fixed-path node keeps the grant. For an ad-hoc node (Homebrew),
the cdhash-based designated requirement changes, so TCC's stored csreq no longer matches and the grant silently dies on
next access. **Why it happens:** TCC stores `(client_path, csreq)` and re-validates csreq every access; ad-hoc DR =
cdhash = content hash. **How to avoid:** Pin a Developer-ID-signed node (content-independent DR), or ad-hoc re-sign the
pinned copy after overwrite (still triggers one re-grant). Document the chosen path in the runbook + ADR. **Warning
signs:** Probe passes pre-upgrade, fails with `-1743` post-upgrade despite identical path.

### Pitfall 2: Terminal-inherited grant masks the real LaunchAgent attribution

**What goes wrong:** Manual `osascript … OmniFocus` from a terminal returns exit 0 (the terminal app is already
granted), so the engineer believes the LaunchAgent will work. Under launchd the responsible process is node, which is
ungranted, and the first run fails silently. **How to avoid:** Spike must run under `launchctl bootstrap` and observe
the _agent's_ stderr log, not a terminal probe. Expect a first-run denial that requires a one-time grant (which itself
cannot prompt under launchd — see Pitfall 3). **Warning signs:** Live `osascript` test passes;
`~/Library/Logs/omnifocus-mcp/server.err` shows `-1743`.

### Pitfall 3: No consent UI under launchd — the grant must be pre-seeded

**What goes wrong:** A LaunchAgent background process gets no Automation consent dialog. [VERIFIED: multiple sources +
responsible-process model] If node has never been granted, the probe denies and there is no prompt to fix it in place.
**Why it happens:** TCC only prompts in interactive/UI-session contexts; a denied background request returns `-1743`
with no UI. **How to avoid:** The install runbook needs a **first-grant bootstrap step** — run the probe once
interactively _as the pinned node binary_ (e.g. `~/.local/libexec/of-mcp-node -e 'spawn osascript …'`) so node becomes
the responsible process and macOS prompts once; thereafter the grant persists (subject to Pitfall 1). This is the part
the verification spike must nail down. The existing remediation message (D-04) covers re-grant after revocation.

### Pitfall 4: Existing non-blocking PermissionChecker is not the fail-fast probe

**What goes wrong:** `src/index.ts` already calls `PermissionChecker.checkPermissions()` which only `logger.warn`s and
never exits (3s execFile timeout). Shipping that as "the probe" violates D-03/D-04's loud-exit contract. **How to
avoid:** Add the blocking fail-fast probe (Pattern 1) _before_ transport bind; either replace or precede the existing
soft check. Reuse its `-1743`/`not allowed` detection strings.

### Pitfall 5: macOS version is 26.x, not Sequoia 15.x

**What goes wrong:** The objective assumed Sequoia 15.x / Sonoma 14.x. This host is **macOS 26.4.1 (build 25E253)**
[VERIFIED: `sw_vers`]. TCC.db schema and `launchctl` API are consistent with the research (verified live on 26.x), but
any spike findings are specifically a macOS-26 result; note the version in the ADR so a future OS upgrade re-opens the
question.

## Code Examples

### Live denial-format reference (host-observed)

```text
# granted (run from iTerm, which holds the grant):
$ osascript -l JavaScript -e 'Application("OmniFocus").name()'   → stdout "OmniFocus", EXIT=0
# app not found (shape of a -NNNN AppleEvent error on stderr):
$ osascript -l JavaScript -e 'Application("Nonexistent").name()' → stderr "execution error: ... (-2700)", EXIT=1
# denial (-1743) appears as: stderr "execution error: Not authorized to send Apple events ... (-1743)", non-zero exit
```

[VERIFIED: host for granted/-2700; -1743 format CITED from src/utils/permissions.ts + scriptingosx.com]

### Live TCC.db evidence (responsible-process model)

```sql
-- query run against ~/Library/Application Support/com.apple.TCC/TCC.db (host had FDA via iTerm)
SELECT client, indirect_object_identifier, auth_value FROM access
WHERE service='kTCCServiceAppleEvents' AND indirect_object_identifier LIKE '%OmniFocus%';
-- com.googlecode.iterm2  | com.omnigroup.OmniFocus4 | 2   ← grant keyed to the PARENT app, not node/osascript
-- com.jetbrains.WebStorm | com.omnigroup.OmniFocus4 | 2
-- com.cogsciapps.hook-setapp | com.omnigroup.OmniFocus4 | 2
-- /usr/bin/osascript     | com.runningwithcrayons.Alfred | 2  (client_type=1 path; unrelated target)
```

[VERIFIED: host TCC.db] This is the single most important evidence: **the Automation grant is attributed to the
responsible parent process** (`com.googlecode.iterm2` when I ran from iTerm). Under launchd that parent is the pinned
**node** binary.

## launchd Lifecycle — verified key semantics

[VERIFIED: `man 5 launchd.plist` on host, macOS 26.4.1]

| Key                        | Authoritative meaning                                                                                          | Plan impact                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `KeepAlive={Crashed=true}` | "Restarted as long as it exited **due to a signal typically associated with a crash (SIGILL, SIGSEGV, etc.)**" | **D-08 CONFIRMED CORRECT.** `process.exit(1)`/`exit(2)` is a clean exit, NOT a signal-crash → **no restart loop** on permission denial. |
| `SuccessfulExit`           | Restart while exit status is zero (or inverse) — **exit-code based**                                           | Do NOT combine with `Crashed`; `Crashed`-only is right for the no-loop intent.                                                          |
| `ThrottleInterval`         | Default already 10s minimum between spawns                                                                     | D-08's `ThrottleInterval=10` matches the default; explicit is fine.                                                                     |
| `RunAtLoad=true`           | Launch once at load                                                                                            | D-08 confirmed.                                                                                                                         |
| `ProcessType=Background`   | "work not directly requested by the user"; applies background resource limits                                  | D-09 confirmed; correct for a daemon.                                                                                                   |
| `SessionCreate` (unset)    | Set=spawn into a new security audit session                                                                    | D-09 confirmed — leaving unset preserves the Apple-Events responsibility chain.                                                         |

**Caveat (LOW-MEDIUM):** The man page defines `Crashed` purely in signal terms, but a `SIGKILL`-on-timeout (the probe's
own `proc.kill('SIGKILL')` targets the _child_ osascript, not the node parent, so it does not affect node's exit).
Confirm in the spike that the _node_ process exits via `process.exit(2)` (clean) and is not itself signalled.

## Nygard ADR format (light — decisions already locked)

[VERIFIED: WebSearch, joelparkerhenderson/architecture-decision-record canonical template]

Canonical sections: **Title** (sequential number + short noun phrase, numbers never reused) · **Status** (Proposed /
Accepted / Deprecated / Superseded by ADR-NNNN) · **Context** (forces at play, in tension) · **Decision** ·
**Consequences** (positive AND negative, honestly). For D-06: ADR-005 carries `Status: Accepted — Supersedes ADR 001`;
the back-reference stub on ADR 001 (`Superseded by ADR 005…`) is a manual JessOS-vault edit, flagged as a follow-up, not
a code task.

## Runtime State Inventory

> Rename/migration categories — included because the install writes OS-registered state, even though this is not a
> rename phase.

| Category            | Items Found                                                                                                                                                 | Action Required                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Stored data         | None — no datastore keys involved                                                                                                                           | None                                                                    |
| Live service config | **TCC.db grant for `com.omnigroup.OmniFocus4` keyed to responsible process.** First-run grant for the pinned node must be seeded interactively (Pitfall 3). | Manual one-time grant + spike                                           |
| OS-registered state | LaunchAgent `~/Library/LaunchAgents/com.kip-d.omnifocus-mcp.plist`; logs dir `~/Library/Logs/omnifocus-mcp/`; pinned binary `~/.local/libexec/of-mcp-node`  | `make install` creates; `make uninstall` `bootout`s + removes plist     |
| Secrets/env vars    | `MCP_AGENT_TOKEN` / `MCP_OWNER_TOKEN` injected via plist `EnvironmentVariables` (Phase 4 D-09)                                                              | plist must carry tokens; never commit them — template uses placeholders |
| Build artifacts     | Pinned node copy is a build/install artifact; stale after a brew upgrade unless re-copied (Pitfall 1)                                                       | Runbook one-line re-copy + (per fix) re-sign or use Developer-ID node   |

## State of the Art

| Old approach                         | Current approach                                                                               | When changed                                  | Impact                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------- |
| `launchctl load -w` / `unload -w`    | `launchctl bootstrap gui/$(id -u)` / `bootout`                                                 | macOS 10.10+ (legacy still works, deprecated) | Use bootstrap/bootout (D-07)            |
| "TCC keys Apple Events by path only" | TCC keys by **responsible process + csreq (designated requirement)**, re-validated each access | always true; widely misunderstood             | Ad-hoc binaries break on content change |

**Deprecated/outdated:**

- The D-01/D-02 rationale string "TCC keys path-based (unsigned) clients on path, not signature" — **partially
  incorrect**; csreq is co-validated. The _decision_ (fixed-path pin) stays; the _rationale_ and the _node source_ need
  the correction above.

## Assumptions Log

| #   | Claim                                                                                                       | Section                    | Risk if wrong                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A1  | The pinned node's Developer-ID designated requirement is content-independent across the versions you'll pin | Standard Stack / Pitfall 1 | If you pin ad-hoc node anyway, grant breaks on upgrade (the exact failure mode) — spike must confirm                           |
| A2  | Under launchd the responsible process resolves to `ProgramArguments[0]` (node), not a higher ancestor       | Code Examples / diagram    | If TCC resolves to a different ancestor, the grant must be seeded against that — spike confirms via TCC.db row after first run |
| A3  | First-run grant for node can be seeded by an interactive run that prompts once                              | Pitfall 3                  | If macOS 26 refuses to prompt for a path-based responsible process, an alternative seeding (e.g. tccutil/MDM PPPC) is needed   |
| A4  | `process.exit(1/2)` from node is a clean exit launchd will not treat as a crash                             | launchd table              | Confirmed by man page for signal-defined "Crashed"; spike still observes node exit isn't signalled                             |

## Open Questions

1. **Does macOS 26 prompt at all for a path-based, Developer-ID node as responsible process under interactive
   first-run?**
   - Know: TCC attributes to the responsible process; interactive contexts prompt; background contexts do not.
   - Unclear: whether a bare pinned node binary (not an .app bundle) reliably triggers the one-time prompt on 26.x.
   - Recommendation: spike step S3 below.

2. **Ad-hoc re-sign vs Developer-ID node as the chosen fix.**
   - Know: Developer-ID node = stable DR; ad-hoc requires re-sign + one re-grant per overwrite.
   - Recommendation: prefer Developer-ID node (official pkg/nvm). Let the planner present both as a comparison; the user
     (backend/infra, opinionated toward stability) will likely pick the Developer-ID path.

## Verification Spike (the host spike STATE.md anticipated)

Run on the target Mac, under launchctl, in order. Capture `~/Library/Logs/omnifocus-mcp/server.err` at each step.

```bash
# S0  Pin a Developer-ID node (NOT brew's ad-hoc node):
cp /usr/local/bin/node ~/.local/libexec/of-mcp-node    # or nvm/official build
codesign -d -r- ~/.local/libexec/of-mcp-node           # expect: identifier "node" and anchor apple generic ... (NOT "cdhash H...")

# S1  Confirm responsible-process attribution: run the probe AS the pinned node, interactively, once
~/.local/libexec/of-mcp-node -e 'require("child_process").spawnSync("osascript",["-l","JavaScript","-e","Application(\"OmniFocus\").name()"],{stdio:"inherit"})'
#   → expect a ONE-TIME Automation prompt naming node; approve it.

# S2  Inspect TCC.db for the new grant (needs FDA on the inspecting terminal):
sqlite3 "$HOME/Library/Application Support/com.apple.TCC/TCC.db" \
  "select client,client_type,indirect_object_identifier,auth_value from access \
   where service='kTCCServiceAppleEvents' and indirect_object_identifier like '%OmniFocus%';"
#   → expect a row whose client is the pinned node path (client_type=1) OR the responsible bundle, auth_value=2.

# S3  Install + load the LaunchAgent and confirm the probe passes with NO prompt (background):
make install   # bootstrap gui/$(id -u) ...
tail -f ~/Library/Logs/omnifocus-mcp/server.err   # → expect clean start, no -1743

# S4  Simulate a node upgrade IN PLACE and re-test (the core survival test):
cp /usr/local/bin/node ~/.local/libexec/of-mcp-node    # overwrite with a DIFFERENT version, same Developer-ID signer
launchctl kickstart -k gui/$(id -u)/com.kip-d.omnifocus-mcp
tail -f ~/Library/Logs/omnifocus-mcp/server.err   # → PASS expected (DR unchanged). Repeat S4 with brew's ad-hoc node to OBSERVE the failure (-1743) and document the contrast in the ADR.

# S5  Confirm no restart loop on denial: revoke the grant (System Settings → Automation, uncheck), kickstart, watch logs:
#   → expect ONE exit(1) with remediation, process stays DOWN (KeepAlive=Crashed-only). No rapid respawn.
```

Pass criteria: S4 (Developer-ID) survives in-place overwrite; S4 (brew ad-hoc) reproduces the `-1743` failure; S5 shows
no restart loop.

## Project Constraints (from CLAUDE.md)

- TypeScript only — no `.js` files; probe module lives under `src/`, follow existing layout (Claude's discretion per
  D-09).
- JXA outer-script syntax for the probe (`Application("OmniFocus").name()` — method-call form), matching
  `src/omnifocus/OmniAutomation.ts` which already `spawn`s `osascript -l JavaScript`.
- `npm run build` before running; integration tests via `npm` (not bun).
- Dual-schema invariant does not apply (no tool-surface change). No new MCP tool added.
- Don't hardcode versions in prose — the ADR should describe posture, not pin a version string.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** Fixed-path binary copy `~/.local/libexec/of-mcp-node`, overwritten in place on upgrade. _(Research note: keep
  the decision; correct the rationale — pin a Developer-ID node, not brew's ad-hoc node, so the csreq is
  content-independent.)_
- **D-02** plist `ProgramArguments[0]` = fixed path; install + upgrade runbook owns the copy. _(Research note: the "no
  code-signing required" clause is wrong for ad-hoc node; csreq is co-validated.)_
- **D-03** JXA `osascript` read probe, inline in entrypoint, before transport bind; reuses existing JXA path.
- **D-04** 5s hard timeout via `setTimeout`+`SIGKILL`; exit(1) on `-1743`/non-zero with remediation; exit(2) on timeout;
  clean exit → bind.
- **D-05** ADR at `docs/adr/ADR-005-deployment-posture.md`, Nygard format.
- **D-06** Continue at ADR 005; supersede ADR 001 via Status line + manual vault back-reference (follow-up, not code).
- **D-07** In-repo plist template + `make install`/`make uninstall` using `launchctl bootstrap`/`bootout`.
- **D-08** `RunAtLoad=true`, `KeepAlive={Crashed=true}`, `ThrottleInterval=10`. _(Research note: CONFIRMED correct —
  Crashed=signal-only, exit(1/2) won't loop.)_
- **D-09** `Label=com.kip-d.omnifocus-mcp`, `ProcessType=Background`, logs to
  `~/Library/Logs/omnifocus-mcp/{server.log,server.err}`, `SessionCreate` unset, no UserName/GroupName/Sockets/FDA keys.
  _(Research note: SessionCreate-unset and ProcessType=Background CONFIRMED by man page.)_

### Claude's Discretion

- Plist template directory (`deploy/launchd/` vs `.config/launchd/`), Makefile wiring, probe module path under `src/`.
- Whether install does a one-shot end-to-end write verify (`make verify`) or documents it as a manual runbook step.

### Deferred Ideas (OUT OF SCOPE)

- Log rotation (launchd appends forever; acceptable for low-volume personal use).
- Runtime funnel-detection guard (declined Phase 4 D-17; ADR records _why_, no code).

## Phase Requirements

| ID        | Description                                                        | Research Support                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEPLOY-01 | LaunchAgent with pinned, stable Node path surviving `brew upgrade` | Pinning works IF the pinned node has a content-independent DR (Developer-ID). Host-verified that brew's ad-hoc node does NOT survive; spike S4 proves the contrast.                |
| DEPLOY-02 | Automation only — no FDA, no open network                          | plist carries no FDA/entitlement keys (D-09); loopback bind + Tailscale Serve carried from Phase 4; Automation is the only grant requested at runtime.                             |
| DEPLOY-03 | Fail-fast Automation probe that errors loudly, doesn't hang        | Pattern 1 probe with 5s SIGKILL timeout, reusing host-verified `-1743` detection from `src/utils/permissions.ts`; replaces/precedes the existing non-blocking checker (Pitfall 4). |
| DEPLOY-04 | New ADR documenting deployment posture, superseding ADR 001        | Nygard format confirmed; supersede mechanics per D-06; ADR records TCC posture, the brew-vs-Developer-ID node finding, Tailscale Serve, and the Cloudflare/Funnel declines.        |

## Environment Availability

| Dependency              | Required by             | Available | Version                                       | Fallback                                              |
| ----------------------- | ----------------------- | --------- | --------------------------------------------- | ----------------------------------------------------- |
| `launchctl`             | install/lifecycle       | ✓         | Bootstrapper 7.0.0                            | —                                                     |
| `osascript`             | probe                   | ✓         | system                                        | —                                                     |
| `codesign`/`csreq`      | DR inspection/fix       | ✓         | system                                        | —                                                     |
| Developer-ID `node`     | pinned runtime          | ⚠ partial | nvm node IS Developer-ID; brew node is ad-hoc | Use official pkg or nvm node; ad-hoc requires re-sign |
| OmniFocus               | probe target            | ✓         | OmniFocus4 (`com.omnigroup.OmniFocus4`)       | —                                                     |
| FDA on inspecting shell | reading TCC.db in spike | ⚠         | available on this host (via iTerm)            | spike S2 needs an FDA-granted terminal                |

**Missing with no fallback:** none blocking. **Missing with fallback:** a guaranteed Developer-ID node — if only brew's
ad-hoc node is available, ad-hoc re-sign after each overwrite (accepts one re-grant) or install the official node pkg.

## Validation Architecture

> `.planning/config.json` not inspected for `nyquist_validation`; included by default. Most validation here is the host
> spike (above), not unit tests — TCC behavior cannot be unit-tested.

### Test Framework

| Property   | Value                                                     |
| ---------- | --------------------------------------------------------- |
| Framework  | vitest (existing)                                         |
| Quick run  | `npm run test:unit`                                       |
| Full suite | `npm run test:integration` (npm, not bun — per CLAUDE.md) |

### Phase requirements → test map

| Req       | Behavior                                    | Test type           | Command                              | Exists?       |
| --------- | ------------------------------------------- | ------------------- | ------------------------------------ | ------------- |
| DEPLOY-03 | probe exits 1 on `-1743` in stderr          | unit (mock spawn)   | `npm run test:unit` (new probe test) | ❌ Wave 0     |
| DEPLOY-03 | probe exits 2 on timeout (SIGKILL child)    | unit (fake timers)  | `npm run test:unit`                  | ❌ Wave 0     |
| DEPLOY-03 | clean probe → proceeds to bind              | unit                | `npm run test:unit`                  | ❌ Wave 0     |
| DEPLOY-01 | grant survives in-place overwrite           | **manual spike S4** | host, under launchctl                | n/a automated |
| DEPLOY-01 | no restart loop on denial                   | **manual spike S5** | host, under launchctl                | n/a automated |
| DEPLOY-04 | ADR exists, Nygard sections, supersede line | doc check           | grep `Supersedes ADR 001`            | ❌ Wave 0     |

### Wave 0 gaps

- [ ] `tests/unit/.../automation-probe.test.ts` — mock `node:child_process` spawn; assert exit codes 1/2/clean and
      remediation strings (mirror existing `permissions.ts` mock pattern).
- [ ] Probe module under `src/` (discretion path).
- [ ] No framework install needed — vitest present.

## Security Domain

> `security_enforcement` assumed enabled.

### Applicable ASVS categories

| ASVS                | Applies                   | Standard control                                                              |
| ------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| V2 Authentication   | no (carried from Phase 4) | bearer tokens already done                                                    |
| V4 Access Control   | yes                       | TCC Automation-only grant; least-privilege plist (no FDA/entitlements) — D-09 |
| V5 Input Validation | minimal                   | probe sends a fixed literal JXA string; no user input in the probe            |
| V6 Cryptography     | no                        | none added here                                                               |
| V14 Config          | yes                       | plist hygiene, env-injected tokens, loopback bind asserted (Phase 4)          |

### Threat patterns for this deployment

| Pattern                                        | STRIDE                 | Mitigation                                                                                          |
| ---------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| Privilege creep via over-broad TCC grant       | Elevation              | Request Automation only; no FDA, no entitlements (D-09)                                             |
| Silent permission loss → silent server failure | Denial of Service      | Fail-fast probe + loud stderr remediation (D-03/D-04)                                               |
| Restart-loop DoS on denial                     | Denial of Service      | `KeepAlive=Crashed-only` (signal-only) — CONFIRMED won't loop on exit(1/2)                          |
| Binary substitution at the pinned path         | Tampering              | TCC csreq re-validation rejects a different-signer binary; Developer-ID DR ties to a known signer   |
| Token leakage in plist                         | Information Disclosure | plist template uses placeholders; real tokens never committed; tokens stay in logger SENSITIVE_KEYS |

## Sources

### Primary (HIGH confidence — host-verified)

- Live `~/Library/Application Support/com.apple.TCC/TCC.db` — Automation grants keyed to responsible parent process;
  osascript/node signatures.
- `man 5 launchd.plist` (host, macOS 26.4.1) — `Crashed`=signal-only, `SuccessfulExit`, `SessionCreate`,
  `ThrottleInterval`, `ProcessType`.
- `codesign -dvvv` / `codesign -d -r-` on nvm node (Developer-ID, stable DR) vs brew node (ad-hoc, cdhash DR).
- `launchctl version` / `launchctl bootstrap` usage (host) — Bootstrapper 7.0.0 syntax.
- Host probes: `osascript -l JavaScript` exit/stderr formats; `sw_vers` (macOS 26.4.1).
- Codebase: `src/index.ts`, `src/utils/permissions.ts` (existing `-1743` detection), `src/omnifocus/OmniAutomation.ts`
  (spawn path).

### Secondary (MEDIUM — verified against primary)

- scriptingosx.com — responsible-process / Apple Events TCC attribution.
- Apple Developer Forums thread 751802 — "TCC finds the nearest known parent" (Quinn).
- joelparkerhenderson/architecture-decision-record — canonical Nygard template.
- rainforestqa TCC.db deep-dive — `client`/`client_type`/`csreq` columns.

### Tertiary (LOW — flagged, NOT relied on for HIGH claims)

- HackTricks macOS TCC, various forum posts on `KeepAlive` exit-code behavior (contradicted by the man page — man page
  wins).

## Metadata

**Confidence breakdown:**

- TCC attribution model (responsible process + csreq): **HIGH** — live TCC.db + codesign evidence on host.
- "Ad-hoc node breaks on overwrite": **HIGH** — designated requirement = cdhash proven on host; the only residual is
  confirming the _negative_ end-to-end in spike S4.
- launchd lifecycle (Crashed/SessionCreate/etc.): **HIGH** — authoritative local man page.
- First-run grant seeding under launchd on macOS 26: **MEDIUM** — model is clear; exact prompt behavior for a bare
  path-based node needs spike S1/S3.
- osascript `-1743` exact stderr: **MEDIUM-HIGH** — granted/-2700 host-verified; -1743 from existing code + docs
  (couldn't revoke the live grant non-destructively to capture it).
- Nygard ADR: **HIGH**.

**Research date:** 2026-06-09 **Valid until:** ~2026-07-09 for the OS-behavior claims (re-verify on any macOS major
upgrade past 26.4); ADR/launchd syntax stable longer.
