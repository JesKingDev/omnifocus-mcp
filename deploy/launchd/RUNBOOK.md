# OmniFocus MCP — LaunchAgent Deployment Runbook

Pin a Developer-ID Node, seed the one-time Automation grant, install the LaunchAgent, and survive Node upgrades without
a re-grant. This is the operational companion to [ADR-005](../../docs/adr/ADR-005-deployment-posture.md), which records
_why_ each step is shaped the way it is.

> **The one rule that makes this work:** pin a **Developer-ID-signed** Node (official `nodejs.org` pkg or an nvm build),
> **never** Homebrew's Node. Homebrew's Node is ad-hoc signed — its TCC designated requirement is a content hash
> (`cdhash`), so every upgrade is a different identity and the Automation grant breaks on the exact upgrade pinning is
> meant to survive. A Developer-ID Node's designated requirement is identity-based and content-independent, so an
> in-place overwrite keeps the grant.

## TL;DR

```mermaid
flowchart TD
    subgraph INSTALL["First install (one-time)"]
        S0["Pin Developer-ID node →<br/>~/.local/libexec/of-mcp-node"]
        DR["codesign -d -r-<br/>verify identity-based DR"]
        SEED["Seed grant: run pinned node<br/>interactively, approve prompt once"]
        INST["set tokens + make install<br/>(launchctl bootstrap)"]
        S0 --> DR --> SEED --> INST
    end
    subgraph UPGRADE["Node upgrade (recurring)"]
        RECOPY["Re-copy SAME Developer-ID node<br/>in place (same path)"]
        KICK["launchctl kickstart -k<br/>gui/$(id -u)/com.kip-d.omnifocus-mcp"]
        RECOPY --> KICK
    end
    INST -. "grant persists (identity DR)" .-> RECOPY
    KICK --> RUN["Clean start, no -1743,<br/>no re-prompt"]

    classDef install fill:#dbe9f4,stroke:#5a7fa3,color:#1f3a4d;
    classDef upgrade fill:#dcefe4,stroke:#5a9b78,color:#1f4d38;
    classDef ok fill:#e8f0e0,stroke:#7a9b5a,color:#33401f;
    class S0,DR,SEED,INST install;
    class RECOPY,KICK upgrade;
    class RUN ok;
```

## Prerequisites

- A Developer-ID-signed Node binary. The official `nodejs.org` `.pkg` and nvm builds are signed by
  `Node.js Foundation (HX7739G8FX)`. Homebrew's Node is **not** suitable (ad-hoc signed).
- `MCP_AGENT_TOKEN` and `MCP_OWNER_TOKEN` values ready (the install step needs them).
- A built server: `npm run build` (produces `dist/index.js`).
- For the optional TCC.db inspection step (S2), a terminal with Full Disk Access.

## 1. Pin the Developer-ID Node

Copy your Developer-ID Node to the fixed path the plist points at, then confirm its designated requirement is
identity-based, not a cdhash:

```bash
mkdir -p ~/.local/libexec
cp /usr/local/bin/node ~/.local/libexec/of-mcp-node    # official pkg / nvm node — NOT Homebrew's node
codesign -d -r- ~/.local/libexec/of-mcp-node
# EXPECT: designated => identifier "node" and anchor apple generic ... leaf[subject.OU] = HX7739G8FX
# REJECT: designated => cdhash H"..."   ← that is an ad-hoc (Homebrew) node; do not pin it
```

If `codesign` shows a `cdhash` designated requirement, stop — that Node will lose its grant on the next upgrade. Source
a Developer-ID Node instead.

## 2. Seed the first-run Automation grant

`launchd` has **no consent UI** — a denied grant under launchd fails silently rather than prompting. So the grant must
be seeded interactively _as the pinned Node binary_, which makes Node the TCC responsible process. Run it once and
approve the single prompt:

```bash
~/.local/libexec/of-mcp-node -e 'require("child_process").spawnSync("osascript",["-l","JavaScript","-e","Application(\"OmniFocus\").name()"],{stdio:"inherit"})'
# → macOS prompts ONCE, naming node, to control OmniFocus. Approve it.
```

After approval the grant persists for that Node identity, including across in-place overwrites by the same Developer-ID
signer (Section 4).

## 3. Install the LaunchAgent

Provide the tokens and run the Makefile install target. It substitutes the pinned Node path and token placeholders into
the plist template, writes it to `~/Library/LaunchAgents/`, and `launchctl bootstrap`s it into the `gui/$(id -u)`
domain:

```bash
make install MCP_AGENT_TOKEN='…' MCP_OWNER_TOKEN='…'
tail -f ~/Library/Logs/omnifocus-mcp/server.err
# → expect a clean start: no -1743, the fail-fast Automation probe passes and the transport binds.
```

`make uninstall` reverses this (`launchctl bootout` + removes the installed plist).

## 4. Surviving a Node upgrade (the DEPLOY-01 guarantee)

When you upgrade Node, re-copy the Developer-ID binary **in place** to the same path, then kick the service. Because the
designated requirement is identity-based, TCC re-validates the new content against the same signer and the grant holds —
**no re-grant, no prompt**:

```bash
cp /usr/local/bin/node ~/.local/libexec/of-mcp-node    # same Developer-ID signer, new version, same path
launchctl kickstart -k gui/$(id -u)/com.kip-d.omnifocus-mcp
tail -f ~/Library/Logs/omnifocus-mcp/server.err        # → clean restart, no -1743
```

**Contrast (why not Homebrew):** repeating this with Homebrew's ad-hoc Node changes the `cdhash`, breaks the stored
`csreq`, and produces a `-1743` denial on the next access — even though the path is identical. That is the failure mode
this runbook exists to avoid.

## 5. Permission-denial behavior

If the grant is ever revoked, the fail-fast probe writes a remediation message to `server.err` and exits non-zero
(`exit(1)` on denial, `exit(2)` on a 5s probe timeout). The plist's `KeepAlive = { Crashed = true }` restarts **only**
on signal-induced crashes, so a clean denial exit does **not** restart-loop — the agent stays down until you re-grant
and `kickstart` it. Re-grant via **System Settings → Privacy & Security → Automation**, re-enable OmniFocus for Node,
then:

```bash
launchctl kickstart -k gui/$(id -u)/com.kip-d.omnifocus-mcp
```

---

## Spike Results

> Filled by the on-host TCC verification spike (Plan 06-04 Task 2). Each step is run on the target Mac **under
> `launchctl`** — a terminal-run probe inherits the terminal's grant and gives a false pass, so it does not count.
> Record pass/fail, any `-1743` observations, the S2 TCC.db row if captured, and the S6 created-task id / read-back
> confirmation.

_Run 2026-06-09 by the host operator. S0–S3 executed under `launchctl`; S4/S5/S6 deferred by operator decision (risk
accepted — see notes)._

| Step                                 | What it proves                                                                                                                          | Result     | Notes                                                                                                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S0**                               | Pinned Node has an identity-based DR (`codesign -d -r-` shows `identifier "node" and anchor apple generic …`, not a cdhash)             | ✅ PASS    | Clean.                                                                                                                                                                                            |
| **S1**                               | One-time interactive prompt names Node; grant seeded as responsible process                                                             | ✅ PASS    | Prompt appeared and was approved.                                                                                                                                                                 |
| **S2**                               | TCC.db row for `kTCCServiceAppleEvents` / OmniFocus keyed to the pinned Node, `auth_value=2` (optional; needs FDA)                      | — not run  | Optional inspection step; skipped.                                                                                                                                                                |
| **S3**                               | `make install` → clean LaunchAgent start, no `-1743`, no prompt                                                                         | ✅ PASS    | Clean start under `launchctl`, no `-1743`.                                                                                                                                                        |
| **S4 (Developer-ID)**                | In-place overwrite with a different Developer-ID Node version → grant survives, **no re-prompt** (core survival test)                   | ⏸ DEFERRED | Risk accepted by operator; to verify on the first real Node upgrade. The identity-based DR (S0) is the mechanism that makes survival expected.                                                    |
| **S4 (Homebrew contrast, optional)** | In-place overwrite with Homebrew's ad-hoc Node → `-1743` failure reproduced                                                             | — not run  | Optional contrast; skipped.                                                                                                                                                                       |
| **S5**                               | Revoke grant + kickstart → ONE `exit(1)` with remediation, agent stays **down** (no restart loop)                                       | ⏸ DEFERRED | Risk accepted. NOTE: under `launchd` there is **no** re-grant prompt — a lost grant surfaces as a loud `-1743` line in `server.err` + a down agent; re-grant via System Settings, then kickstart. |
| **S6**                               | Real `omnifocus_write` create + `omnifocus_read` read-back under `launchctl`, **no interactive prompt** (the verified end-to-end write) | ⏸ DEFERRED | The end-to-end write round-trip was not exercised on-host. S0–S3 prove the LaunchAgent's read probe passes under the grant; the write round-trip remains to be confirmed.                         |

**Spike S0–S6 commands:** see [`06-RESEARCH.md`](../../.planning/phases/06-launchd-deployment-adr/06-RESEARCH.md)
(Verification Spike section). S6 extends the read-only S0–S5 sequence with a live write round-trip to satisfy success
criterion 1 (a verified end-to-end write under `launchctl`).

> **Deferred verification debt (DEPLOY-01 / DEPLOY-04):** S4 (upgrade survival), S5 (no restart loop), and S6 (write
> round-trip) are the host-only proofs of DEPLOY-01's "verified" clause. They are recorded as deferred by operator
> decision, not failed. The reciprocal ADR 001 back-reference (Task 3, DEPLOY-04) is also deferred — ADR 001 was not
> located as a discrete file in the JessOS vault; add
> `Superseded by ADR 005 — omnifocus-mcp repo, docs/adr/ADR-005-deployment-posture.md` if/when it surfaces. ADR-005
> already carries the forward `Supersedes ADR 001`.

---

_Related: [ADR-005 — Deployment Posture & Security Model](../../docs/adr/ADR-005-deployment-posture.md) · plist
template: [`com.kip-d.omnifocus-mcp.plist`](./com.kip-d.omnifocus-mcp.plist) · install/upgrade targets:
[`Makefile`](../../Makefile)_
