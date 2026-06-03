# Stack Research

**Domain:** Hardening a host-resident MCP server (TypeScript / `@modelcontextprotocol/sdk`) on macOS — HTTP auth, tailnet-only exposure, launchd least-privilege deployment
**Researched:** 2026-06-03
**Confidence:** HIGH on the deployment/network layer (Tailscale + launchd are official, documented, stable); MEDIUM on the MCP auth layer (the SDK auth API surface is real but the spec is moving and v2 is pre-alpha — pin to what the installed v1 SDK actually exports)

> **Scope note.** This milestone hardens an *existing* fork. The SDK, transports, Zod, cache, and tests already exist (see `.planning/codebase/STACK.md`). This document covers only the additions: (1) HTTP transport authentication, (2) tailnet-only serving, (3) launchd deployment + macOS Automation permission. It does not re-recommend the base stack.

---

## TL;DR (prescriptive)

The deployment posture in `PROJECT.md` — single human (Jess), her own devices, Tailscale-only remote path, host-pinned Mac — makes the full OAuth 2.1 resource-server flow the wrong tool. Two layers, both already half-present in the fork:

1. **Network identity = Tailscale.** Bind the HTTP transport to `127.0.0.1` only. Put `tailscale serve` in front for TLS termination and identity-header injection. Verify identity in-process with `tailscale whois`. Never use Funnel.
2. **Request auth = static bearer token + (optional) Tailscale identity check.** The fork already has bearer-token auth on the HTTP transport. Keep it, harden it (constant-time compare, mandatory when not stdio), and layer the Tailscale identity header on top. Do **not** stand up an OAuth 2.1 authorization server for a one-person tailnet — it adds a moving part with no security gain here.

Keep `ProxyOAuthServerProvider` / `mcpAuthRouter` / `requireBearerAuth` (the SDK's OAuth machinery) on the shelf as a *documented future path* if the agent role is ever exposed to a third-party MCP client that speaks the OAuth discovery flow. It is not needed for the JessOS agent on the tailnet.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@modelcontextprotocol/sdk` | `^1.25.1` (already pinned) — stay on **1.x**, do not jump to v2 | MCP server + `StreamableHTTPServerTransport` | v1.x is the production line. v2 is pre-alpha (anticipated Q3 2026 with the next spec). The fork already depends on the lower-level `Server` class for `inputSchema` overrides; v2 would force a rewrite. No upgrade this milestone. |
| Tailscale (`tailscaled` + `tailscale` CLI) | current stable (2026; whatever `brew install tailscale` / the Mac App Store build ships) | Tailnet membership, TLS termination via `tailscale serve`, identity headers, `tailscale whois` | The *only* sanctioned remote path per `PROJECT.md`. Serve injects verified `Tailscale-User-Login` / `Tailscale-User-Name` headers and strips client-supplied spoofs. WireGuard underneath; no inbound port on the public internet. |
| macOS `launchd` (LaunchAgent) | OS-native (macOS 14/15-era TCC behavior) | Run the Node service per-user with `RunAtLoad` + `KeepAlive`, scoped logging, env | A **LaunchAgent** (per-user, runs in the GUI/Aqua session) is required — not a LaunchDaemon — because Apple Events / Automation only work from within a user's login session. Daemons run in a session with no GUI and cannot drive OmniFocus. |
| Node.js | `>=18` (fork engines); pin a **stable binary path** in the plist | Runtime | TCC attributes Automation permission to the responsible binary path. A versioned path (`.../v20.11.0/bin/node`) loses the grant on every Node upgrade. Use a stable symlink (`/opt/homebrew/bin/node` or a dedicated `~/bin/node-of-mcp`). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` `timingSafeEqual` | built-in | Constant-time bearer-token comparison | Always. Replace any `token === expected` string compare in `src/http-server.ts` — naive compare is timing-attack-able even on a tailnet. Guard length first (`timingSafeEqual` throws on length mismatch). |
| `node:child_process` `execFile('tailscale', ['whois', '--json', addr])` | built-in | Resolve the peer's tailnet identity from the connection's remote address | When you want defense-in-depth beyond the bearer token — confirm the request actually came from Jess's tailnet node, not just that *a* token was presented. Parse JSON; match against an allowlist of node names / login. |
| `@modelcontextprotocol/sdk` auth exports (`requireBearerAuth`, `mcpAuthRouter`, `ProxyOAuthServerProvider`, `mcpAuthMetadataRouter`) | ships with `^1.25.1` | Full OAuth 2.1 resource-server flow (RFC 9728 protected-resource metadata, `WWW-Authenticate` discovery, token verification) | **Not this milestone.** Reach for these only if/when the server must accept a generic OAuth-speaking MCP client. They are Express-coupled; the fork's HTTP server is plain `node:http`, so adopting them means adding Express. Document as the future path, don't build it now. |

> **Note on `@modelcontextprotocol/express`.** The SDK has split Express middleware (`requireBearerAuth`, `mcpAuthRouter`) toward a separate `@modelcontextprotocol/express` package in newer lines. Confirm which package actually exports these against the **installed** `1.25.1` before importing — do not assume the import path from a blog post. (`grep` the installed `node_modules/@modelcontextprotocol/sdk/dist` for `requireBearerAuth`.)

### Development / Ops Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `launchctl bootstrap gui/$(id -u) <plist>` / `bootout` | Load/unload the LaunchAgent | Modern replacement for `launchctl load/unload`. Use `gui/<uid>` domain for a LaunchAgent so it lands in the Aqua session. |
| `tailscale serve --bg --https=443 127.0.0.1:3000` | Front the localhost HTTP server with TLS + identity headers | `--bg` persists across reboots via the Tailscale state. Serve, **not** Funnel. |
| `tccutil reset AppleEvents` | Reset a stuck Automation grant during dev | The Automation grant is keyed (source app → target app). Reset when the binary path moves and the grant goes stale. |
| `log stream --predicate 'subsystem == "com.apple.TCC"'` | Watch TCC decisions live | Diagnose silent Automation denials from the launchd-spawned process. |

---

## Installation

```bash
# No new npm runtime deps required for the recommended (token + Tailscale) path —
# timingSafeEqual, child_process, http are all in node core.

# Tailscale (host):
brew install tailscale            # or the Mac App Store / standalone build
sudo tailscale up                 # join the tailnet

# Put TLS + identity headers in front of the localhost-bound server:
tailscale serve --bg --https=443 127.0.0.1:3000

# Only if you later adopt the full OAuth resource-server flow (NOT this milestone):
# npm install express @modelcontextprotocol/express
```

---

## How each requirement maps

### 1. Authenticating the HTTP / Streamable-HTTP transport

**Current spec model (2025-06-18, verified):** a *protected* MCP server is an **OAuth 2.1 resource server**. It MUST publish **Protected Resource Metadata** (RFC 9728) advertising its authorization server(s), and on an unauthenticated request return **HTTP 401 + `WWW-Authenticate: Bearer ... resource_metadata=<url>`** so the client can discover where to get a token. The client obtains a token from the authorization server and presents it as a bearer token. The SDK models this with `mcpAuthMetadataRouter` (serves the PRM doc), `requireBearerAuth` (validates the token, attaches `AuthInfo` to `req.auth`, emits the discovery challenge on failure), and `ProxyOAuthServerProvider` (delegates to an upstream IdP).

**What to actually do here (prescriptive):** the spec flow assumes a third-party authorization server and a client that performs OAuth discovery. For a single human on her own tailnet, that is ceremony without benefit. Use the **static bearer token the fork already supports** (`--auth-token` / `MCP_AUTH_TOKEN`), hardened:

- Make auth **mandatory** whenever the transport is not stdio/loopback-only. Refuse to start an externally reachable HTTP transport with no token.
- Compare with `crypto.timingSafeEqual` (length-guard first), never `===`.
- Generate the token with `openssl rand -hex 32` (or `crypto.randomBytes(32).toString('hex')`); store it only in the launchd plist env / a `chmod 600` file, never in the repo.
- The agent client passes it as `Authorization: Bearer <token>` on every HTTP request. (MCP clients send the `Authorization` header on the Streamable-HTTP POST/GET.)

Layer the **Tailscale identity check** (below) on top for defense-in-depth. Keep the OAuth path documented but unbuilt.

**What NOT to do:** do not implement a homegrown OAuth authorization server, and do not adopt the SDK's `mcpAuthRouter` + Express stack for this one-user case — it pulls in Express alongside the fork's plain `node:http` server and gives a one-person tailnet no security it didn't already have from a strong bearer token over WireGuard.

### 2. Tailnet-only serving

- **Bind `127.0.0.1`, not `0.0.0.0`.** The fork currently defaults host to `0.0.0.0` (per `INTEGRATIONS.md`) — change the default to loopback. Binding loopback is what makes the Tailscale identity headers trustworthy: if the process also listened on the LAN/tailnet directly, anyone reaching it could forge `Tailscale-User-Login`.
- **Front it with `tailscale serve`** for HTTPS termination on the tailnet. Serve **injects** `Tailscale-User-Login` and `Tailscale-User-Name` and **strips** any client-supplied copies (anti-spoofing). Funnel does **not** inject identity headers.
- **Verify in-process** for the strongest guarantee: resolve the connection's remote address with `tailscale whois --json <addr>` and match it to an allowlist of Jess's node(s)/login before honoring the request. The bearer token proves "knows the secret"; `whois` proves "is on the tailnet as an expected node."
- **Never enable Funnel.** Funnel exposes the service to the public internet and drops identity headers — the opposite of the `PROJECT.md` posture (Tailscale-only, no open network).

### 3. launchd deployment with least privilege

- **LaunchAgent, not LaunchDaemon.** Automation / Apple Events require a user login (Aqua) session; daemons can't drive OmniFocus. Place at `~/Library/LaunchAgents/com.jessos.omnifocus-mcp.plist`.
- **Plist keys:** `Label`, `ProgramArguments` (`[<stable-node-path>, <abs path>/dist/index.js, --http, --host, 127.0.0.1, --port, 3000]`), `RunAtLoad` = true, `KeepAlive` = true (or `{ "SuccessfulExit": false }` to avoid respawning on clean exit), `EnvironmentVariables` (`MCP_AUTH_TOKEN`, `NODE_ENV=production`, `PATH` including the Tailscale CLI dir), `StandardOutPath` / `StandardErrorPath` to a writable user log dir (e.g. `~/Library/Logs/omnifocus-mcp/`), `ProcessType` = `Interactive` or `Standard`.
- **Stable binary path is load-bearing for TCC.** Automation grants are attributed to the responsible binary path. A versioned Node path loses the Automation grant on every `node` upgrade (a real, documented failure mode). Point `ProgramArguments[0]` at a stable symlink (`/opt/homebrew/bin/node` or a pinned `~/bin/node-of-mcp`).
- **Automation permission only, no Full Disk Access (verified achievable).** Sending Apple Events to OmniFocus is gated by the **Automation** TCC category (System Settings → Privacy & Security → Automation), *not* Full Disk Access. The grant is per source→target app pair. The first event from the launchd-spawned process triggers the consent dialog; once approved, no FDA is needed. Reading OmniFocus data through the documented JXA/OmniJS bridge does not touch FDA-protected paths.
- **Granting the permission to a launchd-spawned process:** the consent prompt only appears with a GUI session present (hence LaunchAgent). Trigger it once interactively (a single read), approve, and the grant persists for that binary path. If the prompt never appears or events fail with `-1743`, the attribution chain is wrong — usually a moved/unstable binary path. Reset with `tccutil reset AppleEvents` and re-trigger.
- **Load/manage with the modern API:** `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jessos.omnifocus-mcp.plist` and `launchctl bootout gui/$(id -u)/com.jessos.omnifocus-mcp` (prefer over deprecated `load`/`unload`).

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Static bearer token + Tailscale identity | Full SDK OAuth 2.1 resource-server flow (`requireBearerAuth` + `mcpAuthRouter` + `ProxyOAuthServerProvider`) | When a third-party / multi-user MCP client that performs OAuth discovery must connect, or when tokens must be short-lived and centrally revocable. Overkill for one human on a tailnet. |
| `tailscale serve` (identity headers) | `caddy-tailscale` / Caddy reverse proxy with `tsnet` | When you already run Caddy for other services and want one proxy. Adds a dependency; Serve is zero-extra-process. |
| `tailscale whois` in-process verification | Trust the Serve-injected headers alone (no whois) | Acceptable if the server binds strictly to loopback and only Serve can reach it. `whois` is belt-and-suspenders; add it for the agent-write path. |
| LaunchAgent | LaunchDaemon | Never for this app — daemons can't send Apple Events to a GUI app. Daemons are for root/system services with no UI/Automation needs. |
| `KeepAlive: { SuccessfulExit: false }` | `KeepAlive: true` | Plain `true` respawns even on intentional clean exit; the `SuccessfulExit:false` form lets a graceful `process.exit(0)` (MCP lifecycle close) stay down if you want manual control. Use plain `true` if you want it always running. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@modelcontextprotocol/sdk` **v2** | Pre-alpha (Q3 2026 target). Breaking API churn; would force rewriting the `Server`/`inputSchema` integration the fork relies on. | Stay on `1.25.1` (1.x). |
| Tailscale **Funnel** | Exposes the service to the public internet and does **not** inject identity headers — directly violates the tailnet-only / no-open-network constraint. | `tailscale serve` (tailnet-internal, identity headers injected, spoofs stripped). |
| Binding `0.0.0.0` | Makes the Serve-injected identity headers forgeable by anyone on the LAN/tailnet who reaches the port directly; current fork default. | Bind `127.0.0.1`; let `tailscale serve` be the only external reachability. |
| Plain `token === expected` compare | Timing side-channel; trivial to harden. | `crypto.timingSafeEqual` with a length guard. |
| **LaunchDaemon** for this service | No GUI/login session → Apple Events to OmniFocus fail. | LaunchAgent in `gui/<uid>`. |
| Versioned Node path in `ProgramArguments` | TCC Automation grant is attributed to the binary path; a Node upgrade silently revokes it (documented real-world breakage). | Stable symlink (`/opt/homebrew/bin/node` or pinned `~/bin/...`). |
| Granting **Full Disk Access** to node/osascript | Far broader than needed; Automation alone suffices to drive OmniFocus. Violates least-privilege constraint. | Grant only **Automation** (Privacy & Security → Automation), target OmniFocus. |
| Homegrown OAuth authorization server | Maintenance + security surface with no benefit for a single tailnet user. | Static token over WireGuard + Tailscale identity. |
| Storing the auth token in the repo / a tracked file | Secret leak. | Plist `EnvironmentVariables` or a `chmod 600` file outside the repo. |

---

## Stack Patterns by Variant

**If the only client is the JessOS agent on Jess's tailnet (the actual case):**
- Static bearer token (hardened) + bind `127.0.0.1` + `tailscale serve` + `tailscale whois` allowlist.
- Because it is the minimum moving parts that satisfies "HTTP transport requires auth" and "tailnet-only" with no new runtime dependency.

**If a third-party OAuth-speaking MCP client must ever connect:**
- Adopt the SDK OAuth path: add Express + `@modelcontextprotocol/express`, wire `mcpAuthMetadataRouter` (RFC 9728 PRM) + `requireBearerAuth` + `ProxyOAuthServerProvider` against an IdP.
- Because the spec's discovery flow (`401` → `WWW-Authenticate` → PRM → token) only matters when the client isn't pre-configured with a shared secret.

**If you ever drop HTTP entirely and run the agent co-resident on the Mac:**
- stdio transport, no network auth at all (already supported); rely on launchd + Automation scoping for least privilege.
- Because no listening socket means no transport to authenticate.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@modelcontextprotocol/sdk@^1.25.1` | spec **2025-06-18** | Auth = OAuth 2.1 resource server + RFC 9728 PRM. v2 (Q3 2026) will track a newer spec — out of scope. |
| `requireBearerAuth` / `mcpAuthRouter` | Express + possibly `@modelcontextprotocol/express` | Verify the export path against the **installed** `1.25.1` before importing (the middleware has been migrating to a separate package). Fork uses plain `node:http`, so these require adding Express. |
| `tailscale serve` identity headers | Serve only (not Funnel) | Funnel strips/omits identity headers. |
| Automation TCC grant | stable binary path | Grant is keyed to the responsible binary path + target app; breaks on path change. |

---

## Sources

- https://modelcontextprotocol.io/specification/draft/basic/authorization — current MCP authorization model (OAuth 2.1 resource server, RFC 9728) — HIGH
- https://datatracker.ietf.org/doc/html/rfc9728 — OAuth 2.0 Protected Resource Metadata — HIGH
- https://blog.logto.io/mcp-auth-implementation-guide-2025-06-18 — 2025-06-18 spec auth changes — MEDIUM
- https://ts.sdk.modelcontextprotocol.io/v2/functions/_modelcontextprotocol_express.auth_bearerAuth.requireBearerAuth.html — `requireBearerAuth` semantics, `@modelcontextprotocol/express` package split — MEDIUM
- https://www.npmjs.com/package/@modelcontextprotocol/sdk — v1.x is production line; v2 pre-alpha (Q3 2026) — MEDIUM
- https://github.com/modelcontextprotocol/typescript-sdk/releases — SDK release verification — MEDIUM
- https://tailscale.com/docs/features/tailscale-serve — Serve injects/strips identity headers; bind localhost guidance — HIGH
- https://tailscale.com/docs/concepts/tailscale-identity — `Tailscale-User-Login` / `Tailscale-User-Name` headers, `tailscale whois` — HIGH
- https://tailscale.com/blog/model-for-mcp-connectivity-lee-briggs — MCP-over-Tailscale, bind 127.0.0.1 + bearer token pattern — MEDIUM
- https://scriptingosx.com/2020/09/avoiding-applescript-security-and-privacy-requests/ — Automation TCC vs FDA, attribution chain — MEDIUM
- https://github.com/openclaw/openclaw/issues/22179 — Node binary path change silently revokes macOS TCC/Automation grant — MEDIUM
- https://eclecticlight.co/2018/08/28/mojaves-privacy-protection-command-tools-and-scripts/ — Automation permission category for scripted Apple Events — MEDIUM

---
*Stack research for: host-resident MCP server hardening (HTTP auth, Tailscale, launchd) on macOS*
*Researched: 2026-06-03*
