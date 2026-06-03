# Pitfalls Research

**Domain:** Hardening a host-resident OmniFocus MCP server for least-privilege agent access (silent-write-safety, macOS TCC deployment, MCP HTTP auth, Tailscale remote)
**Researched:** 2026-06-03
**Confidence:** HIGH for OmniFocus/JXA pitfalls (drawn from this codebase's own `CONCERNS.md`, `LESSONS_LEARNED.md`, and shipped OMN-119/OMN-28 history); HIGH for MCP HTTP and Tailscale (official docs + CVE-2025-66414); MEDIUM for launchd/TCC attribution (Apple Developer Forums + community write-ups, not a single authoritative Apple doc).

> Scope note: this is a *hardening* milestone on an existing fork, not a greenfield build. The pitfalls below are the ones specific to THIS work — write-safety, least-privilege macOS deployment, HTTP auth exposure, and Tailscale. Generic web-security advice is omitted; the fork already has injection-hardened Zod validation and ~2,210 tests.

## Critical Pitfalls

### Pitfall 1: Silent write-failure — the mutation reports success but nothing persisted

**What goes wrong:**
A write returns `{ success: true }` to the agent, JessOS marks the task done/updated, but OmniFocus never changed. This is the single highest-severity risk for this milestone because the whole premise (Core Value in `PROJECT.md`) is that OmniFocus can be *trusted* as the canonical store. A silent failure corrupts trust invisibly. The codebase already has at least four confirmed instances of this class:

- **JXA tag assignment** (`task.tags = [...]`, `task.addTags()`) no-ops silently — must go through OmniJS `addTag()`. Documented in `JXA-VS-OMNIJS-PATTERNS.md` and `LESSONS_LEARNED.md`.
- **`reviewInterval` on a project with no existing interval** — OmniJS getter returns `null`, the setter no-ops, and the error is swallowed in a bare `catch (e) {}` (`CONCERNS.md`, SETTER-PATTERNS row 1).
- **`plannedDate` set via JXA during create** — ambiguous JXA-vs-OmniJS persistence; docs contradict each other (`CONCERNS.md`).
- **Bridge-context read-after-write across contexts** — writing tags via `evaluateJavascript` then reading via JXA `task.tags()` shows stale data; the write may be fine but the *verification* is wrong, which is equally dangerous because it can mask a real failure or invent a false one (`LESSONS_LEARNED.md`, "Bridge Context Consistency").

**Why it happens:**
JXA is RPC-over-Apple-Events; many property setters either silently drop the assignment (complex types don't marshal) or succeed in a different interpreter instance than the one you read back from. OmniFocus does not raise on a no-op assignment. The error surface is also fragile: OmniJS errors arrive as stringified JSON *inside a successful `osascript` exit*, so a new error shape from a future OmniFocus version can be treated as `{ ok: true, data: '<error string>' }` (`CONCERNS.md`, "OmniJS `evaluateJavascript` error surface").

**How to avoid:**
Make write-verification a first-class, non-optional layer for the agent role — this is already an Active requirement in `PROJECT.md` ("Write-verification step that confirms each mutation persisted"). Specifically:
1. Every agent mutation does a **read-back round-trip in the same OmniJS context** that performed the write, and asserts the field equals the intended value (an `assertFieldPersisted` helper) — never read back via JXA after writing via the bridge.
2. Treat a swallowed `catch` on any setter as a defect — surface `{ success: false, reason }` instead of `{}`.
3. Route all error detection through `isScriptError()` / `unwrapScriptOutput()`; never inspect raw `osascript` output.
4. Add integration round-trip tests for the known-fragile fields (tags, `plannedDate` on create, `reviewInterval` on new projects) — these are explicitly flagged as High/Medium priority test gaps in `CONCERNS.md`.

**Warning signs:**
- A setter wrapped in `catch (e) {}` returning `{}` or `{ success: false }` with no reason.
- Read-back done in a different context (JXA) than the write (OmniJS).
- A "success" path that never re-reads the mutated field.
- Tests that assert on the *input parameters* rather than on the *persisted result* (the v3.0.0 filter regression and the tag-OR gaps in `CONCERNS.md` are exactly this).

**Phase to address:**
Earliest implementation phase — the write-verification layer is a prerequisite for trusting any agent write, and `PROJECT.md` defers real-data migration until writes are trusted. Build verification before exposing the write surface to the agent.

---

### Pitfall 2: Guard bypass on batch/bulk operations (the OMN-119 class)

**What goes wrong:**
A protection enforced on the single-item path is silently absent on the batch path. OMN-119 was exactly this: the sandbox guard covered single creates but the batch-create path bypassed it, leaking `__MCP_TEST_SANDBOX__` data into live OmniFocus. For the agent role, the analogous risk is: the least-privilege role correctly blocks `delete` on single-task operations, but a batch/bulk mutation or an export-then-reimport path slips a destructive operation through unguarded.

**Why it happens:**
Batch handlers are usually written *after* single-item handlers and copy only part of the guard logic, or they assemble one big OmniJS script that loops internally — so the per-item guard never runs. The codebase also carries **module-level mutable sandbox cache** (`validatedTaskIds`, `cachedSandboxFolderId`) that persists across calls; a warm cache can let a moved or deleted item pass a guard it should fail (`CONCERNS.md`, "Module-level mutable sandbox cache").

**How to avoid:**
1. Define the agent-role capability check (no hard-delete; complete/drop only) as a **single chokepoint** that every mutation path — single, batch, and any future bulk/import operation — must call. Don't re-implement per handler.
2. Add an explicit test that the batch path enforces the same capability set as the single path (parity test), mirroring how `assertSandboxGuardAtStartup()` now throws on misconfiguration.
3. Prefer instance-scoped state over the module-level globals so a warm cache can't carry stale validation across requests (especially relevant once HTTP mode serves multiple sessions — see Pitfall 6).

**Warning signs:**
- A new `operation: 'batch'` / bulk branch that builds its own OmniJS loop instead of delegating to the guarded single-item path.
- Capability checks living inside individual handlers rather than at one boundary.
- The startup guard assertion missing from any new entry point (HTTP transport is a new entry point).

**Phase to address:**
Same phase as defining the agent role / removing destructive deletes. The capability chokepoint and its batch-parity test are the deliverable.

---

### Pitfall 3: launchd-spawned Node gets denied Automation (Apple Events / TCC) and there's no one to click the prompt

**What goes wrong:**
The server runs fine when launched from Terminal but, once installed as a `launchd` LaunchAgent, every OmniFocus script fails with a `-1743` "not authorized to send Apple events" error — or worse, hangs forever because `AEDeterminePermissionToAutomateTarget` raised a permission dialog on a headless/locked machine with no one to click "Allow."

**Why it happens:**
TCC attributes the `kTCCServiceAppleEvents` (Automation) grant to the **responsible process**, not necessarily the binary doing the work. When a process is a direct child of `launchd`, attribution can land on the launching context rather than the Node binary, so a grant you approved interactively in Terminal does not carry over. Two compounding traps:
- **Node binary path identity:** TCC keys the grant to the exact binary path. A Homebrew Node upgrade moves the binary from one Cellar path to another, and TCC silently revokes the grant — the agent breaks on a routine `brew upgrade` with no error you'd notice until a write fails.
- **Headless prompt:** the first Apple Event triggers an interactive dialog. On a login-less or locked Mac, the dialog appears with no operator, and the call blocks. The codebase's `PermissionChecker` caches a positive result for 15s, which can mask a permission that was actually lost mid-session (`CONCERNS.md`).

**How to avoid:**
1. Pin the LaunchAgent's `ProgramArguments` to a **stable Node path** (e.g. a managed symlink like `/opt/homebrew/bin/node` or a version-pinned path under your control), not the volatile Cellar path. Re-grant after any Node major upgrade and document it as a known maintenance step.
2. **Pre-authorize Automation interactively once**, from the same responsible-process context launchd will use, before relying on headless operation. Trigger `AEDeterminePermissionToAutomateTarget` deliberately during a supervised first run so the dialog is answered by a human, then the grant persists.
3. Make the permission check **fail loud, not hang**: probe permission with a short timeout and return a clear "Automation permission missing — re-grant in System Settings > Privacy & Security > Automation" error rather than blocking on a dialog. Surface it through the MCP error path.
4. Treat the 15s permission cache as a **convenience, not a source of truth** for the deployment posture — on a hard script failure, invalidate and re-probe rather than trusting the cached `true`.
5. **Do NOT reach for Full Disk Access as a workaround.** `PROJECT.md` forbids it, and it wouldn't help: this is an Automation (Apple Events) grant, a different TCC service. FDA also famously does not propagate to LaunchAgent-spawned children, so it's both wrong and ineffective here.

**Warning signs:**
- Server works from Terminal, fails or hangs under `launchctl`.
- Error code `-1743` / `errAEEventNotPermitted` in logs.
- A write or read that hangs indefinitely on first call after a reboot (headless dialog).
- Automation grant present in System Settings for "Terminal" or "osascript" but not for the Node binary launchd actually runs.
- The agent breaks right after a `brew upgrade node`.

**Phase to address:**
The launchd-deployment phase. Acceptance criteria must include: server starts under `launchctl`, performs a verified write end-to-end with no interactive prompt, and fails fast (not hangs) when Automation is revoked. Pre-authorization and the stable-node-path pin are deliverables of this phase.

---

### Pitfall 4: HTTP transport accidentally open on the network (bind address + DNS rebinding)

**What goes wrong:**
The HTTP transport binds `0.0.0.0` instead of `127.0.0.1`, exposing the agent's full write surface to anything that can route to the Mac (LAN, and via the tailnet, every device on it). Even bound to loopback, a malicious web page the user visits can mount a **DNS-rebinding attack** to reach the localhost MCP server from the browser and drive authenticated-looking writes.

**Why it happens:**
- Express/Node `app.listen(port)` with no host argument binds all interfaces by default; `0.0.0.0` is the path of least resistance and easy to copy from a tutorial.
- The MCP TypeScript SDK historically shipped **DNS-rebinding protection OFF by default** (CVE-2025-66414). The mitigation landed in `@modelcontextprotocol/sdk` 1.24.0 as Host-header validation, but it is **opt-in** unless you use the `createMcpExpressApp()` helper. This repo pins `@modelcontextprotocol/sdk ^1.25.1` (per `CONCERNS.md`), so the fix is *available but not automatically active* — a real, current footgun for this exact codebase.
- Per the MCP spec, servers MUST validate the `Origin` header and SHOULD bind localhost for local servers; it's easy to skip both.

**How to avoid:**
1. **Bind `127.0.0.1` explicitly**, never `0.0.0.0`. Remote access comes only via Tailscale (see Pitfall 5), which terminates and forwards to loopback — the listener itself never needs a public interface.
2. **Enable the SDK's DNS-rebinding protection explicitly** on `StreamableHTTPServerTransport`: `enableDnsRebindingProtection: true`, with `allowedHosts: ['127.0.0.1:<port>', 'localhost:<port>', '<machine>.<tailnet>.ts.net']` and a matching `allowedOrigins` allowlist. Reject mismatched `Origin` with 403.
3. Add a startup assertion (mirroring `assertSandboxGuardAtStartup()`) that **refuses to start if the bind host is not loopback** unless an explicit, documented override is set — fail closed.
4. Verify the SDK version actually carries the mitigation (>= 1.24.0) and that the config is wired; pin-and-forget is how CVE-2025-66414 bites.

**Warning signs:**
- `app.listen(PORT)` or `listen(PORT, '0.0.0.0')` anywhere in `src/http-server.ts`.
- `StreamableHTTPServerTransport` constructed without `enableDnsRebindingProtection`.
- `lsof -iTCP -sTCP:LISTEN` showing the port on `*:PORT` rather than `127.0.0.1:PORT`.
- No `Origin`/`Host` allowlist in the transport config.

**Phase to address:**
The HTTP-authentication / transport-hardening phase. Acceptance: `lsof` confirms loopback-only bind; a request with a foreign `Origin`/`Host` returns 403; SDK version verified >= 1.24.0 with protection enabled.

---

### Pitfall 5: Tailscale funnel-vs-serve confusion — accidentally publishing to the entire internet

**What goes wrong:**
`tailscale funnel` is run where `tailscale serve` was intended, exposing the OmniFocus write surface to the **public internet** rather than just Jess's tailnet. The two commands look nearly identical but differ in blast radius by everything.

**Why it happens:**
`serve` = tailnet-only (authenticated WireGuard peers). `funnel` = public, routed through Tailscale relay servers to anyone with the URL. The same port can't be both at once, and **whichever command ran last wins** — a stray `funnel` invocation silently flips a previously-private port public. Funnel is enabled for all tailnet members by default unless an admin restricts the `funnel` node attribute in the ACL policy. `PROJECT.md` is explicit: Tailscale tailnet is the *only* remote path, for Jess's own devices — funnel violates that posture outright.

**How to avoid:**
1. **Use `tailscale serve` only. Never `funnel`** for this service. Document it in the deployment ADR.
2. **Disable the `funnel` node attribute** for this machine in the tailnet ACL policy so funnel cannot be enabled even by mistake — defense in depth at the policy layer, not just the command line.
3. Tighten **ACLs to least privilege**: grant only Jess's own devices access to the MCP port, rather than the whole tailnet. Trusting "anyone on the tailnet" is itself a gap if the tailnet ever includes shared nodes or other people's devices.
4. Verify exposure after setup: `tailscale serve status` should show the port as tailnet-private; confirm the port is not reachable from a non-tailnet network.

**Warning signs:**
- `funnel` appearing in any setup script, README, or shell history for this service.
- `tailscale serve status` reporting a port as public/funnel.
- ACLs granting `*` or the whole tailnet to the MCP port.
- The service URL resolving/responding from a device that is not on the tailnet.

**Phase to address:**
The remote-access / Tailscale phase (after HTTP auth exists — never expose remotely before auth). Acceptance: `serve` only, funnel disabled at ACL level, port reachable only from authorized tailnet devices.

---

### Pitfall 6: Trusting the tailnet as authentication — no per-request auth behind the tunnel

**What goes wrong:**
The team concludes "it's only reachable over Tailscale, so it's safe" and ships the HTTP transport with no application-level auth. Any device or process on the tailnet — including a compromised app on Jess's own laptop, or a shared/other-person node — can then drive the agent's write surface against the live OmniFocus database.

**Why it happens:**
Network reachability gets mistaken for identity. Tailscale authenticates *devices onto the tailnet*; it does not authenticate *which caller may use this specific service*. `PROJECT.md` lists "Add HTTP authentication to the HTTP transport (agent isolation)" as an explicit Active requirement precisely to close this gap.

**How to avoid:**
1. Require a **bearer token / shared secret on every HTTP request**, validated before any tool dispatch — independent of, and in addition to, Tailscale. Reject unauthenticated requests with 401 before they reach the write surface.
2. Scope the token to the **least-privilege agent role**, not the full owner tool surface, so even a valid-but-compromised token can't hard-delete.
3. Keep the token out of source/logs; load from env or a file with tight perms. Note the codebase's caution: Claude Desktop coerces all params to strings — don't let token handling get tangled in that coercion path.
4. Combine with Pitfall 4's loopback bind + Tailscale `serve`: layered controls, none of which is trusted alone.

**Warning signs:**
- HTTP routes that dispatch tools without an auth middleware in front.
- Comments or docs reasoning "Tailscale handles auth."
- The same surface served to the agent and to a human owner with no role distinction.
- Tokens echoed into logs or committed to config.

**Phase to address:**
The HTTP-authentication phase, before the Tailscale phase. Acceptance: an unauthenticated tailnet request gets 401; an authenticated request runs only agent-role-permitted operations.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Bare `catch (e) {}` around a setter returning `{}` | Fewer error branches; "it works on the happy path" | Silent write-failure indistinguishable from success; corrupts canonical-store trust | Never for the agent write path |
| Read-back via JXA after writing via OmniJS bridge | Simpler-looking verification code | Stale read masks real failures or invents false ones | Never — verify in the same context as the write |
| `app.listen(0.0.0.0)` / no host arg | One fewer arg; "just works" on every interface | Network-exposed write surface; LAN + tailnet reachable | Never — bind loopback, remote via Tailscale only |
| Pinning SDK and assuming defaults are safe | No config to write | CVE-2025-66414: DNS-rebinding protection off by default | Never — enable protection explicitly, verify >= 1.24.0 |
| Module-level mutable validation cache | Avoids re-checking; faster | Warm cache passes guards a moved/deleted item should fail; worse under multi-session HTTP | Test-only, with `clearSandboxCache()` in `beforeEach`; instance-scope for production |
| Funnel "just to test remote access quickly" | Instant public URL | Public exposure of write surface; violates `PROJECT.md` posture | Never for this service |
| Trusting tailnet membership as auth | Skips writing auth middleware | Any tailnet device drives writes | Never — per-request token required |
| Versioned Node path in LaunchAgent plist | Copy-paste from `which node` | TCC revokes Automation on every `brew upgrade node` | Never — use a stable symlink path |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OmniFocus (JXA) | `task.tags = [...]` / `addTags()` to set tags | OmniJS `addTag()` inside the mutation script; verify in same context |
| OmniFocus (JXA) | `.whose()` / `.where()` for filtering | Direct iteration over `flattenedTasks()`; `.whose()` = 25s+ timeout |
| OmniFocus (OmniJS) | Reading mutated field via JXA after bridge write | Read back inside the same `evaluateJavascript` call |
| macOS TCC | Granting Automation from Terminal, expecting launchd to inherit it | Pre-authorize from the launchd responsible-process context; pin stable Node path |
| macOS TCC | Reaching for Full Disk Access when Apple Events is denied | FDA is the wrong service and doesn't propagate to LaunchAgent children; fix the Automation grant |
| MCP SDK HTTP | Assuming DNS-rebinding protection is on | Set `enableDnsRebindingProtection: true` + `allowedHosts`/`allowedOrigins` explicitly (CVE-2025-66414) |
| MCP SDK HTTP | Binding all interfaces | Bind `127.0.0.1`; remote via Tailscale `serve` |
| Tailscale | `funnel` instead of `serve` | `serve` only; disable `funnel` node attribute in ACLs |
| Tailscale | Tailnet membership = auth | Per-request bearer token in addition to the tunnel |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `.whose()` / `.where()` in JXA | Query hangs 25s+ | Direct iteration only; no ESLint rule catches it yet (`CONCERNS.md`) | ~2,000+ tasks |
| Per-task JXA method calls (`.dueDate()`, `.name()`) in a loop | 60s timeout (see Upcoming-mode migration) | Use OmniJS bridge / AST builder for bulk reads | 2,000+ tasks |
| Write-verification round-trip on every mutation | Added latency per write (~6–8s script cost) | Acceptable cost for trust; batch verifications where possible; don't re-warm cache needlessly | Noticeable on bulk writes; verify cost vs. trust tradeoff |
| O(n) bridge-nonce scan on every single create (OMN-28/29) | Each create scans all tasks | Inherent JXA/OmniJS limitation; monitor for nonce-cleanup failures leaking into notes | 2,000+ tasks, every create |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Bind `0.0.0.0` | Write surface on LAN + tailnet | Bind `127.0.0.1`; startup assertion fails closed on non-loopback |
| DNS-rebinding protection off (SDK default) | Malicious web page drives localhost MCP writes (CVE-2025-66414) | `enableDnsRebindingProtection: true` + allowlists; verify SDK >= 1.24.0 |
| `tailscale funnel` | Public-internet exposure of agent writes | `serve` only; disable funnel node attribute in ACL |
| Tailnet = auth | Any tailnet device writes to live OmniFocus | Per-request bearer token, validated before dispatch |
| Full owner surface exposed to agent | Compromised token can hard-delete real data | Least-privilege agent role; complete/drop only, no hard-delete |
| Token in logs/source | Credential leak | Env/file with tight perms; never log; keep out of string-coercion path |
| FDA as Automation workaround | Over-broad grant, still doesn't work | Fix the Apple Events (Automation) grant; FDA forbidden by `PROJECT.md` |
| Guard only on single-item path | Batch op bypasses capability check (OMN-119 class) | Single capability chokepoint all paths call; batch-parity test |

## "Looks Done But Isn't" Checklist

- [ ] **Write operation:** Often missing the persisted read-back — verify the mutated field re-reads as the intended value *in the same OmniJS context*.
- [ ] **Tag/date/reviewInterval setters:** Often no-op silently — verify each via an `assertFieldPersisted` integration round-trip, especially on freshly created objects.
- [ ] **Agent role:** Often enforced only on single-item ops — verify the batch/bulk path enforces the identical capability set (no hard-delete).
- [ ] **launchd deployment:** Often works from Terminal but not under `launchctl` — verify an end-to-end verified write completes under `launchctl` with no interactive prompt, and fails fast (not hangs) when Automation is revoked.
- [ ] **HTTP bind:** Often `0.0.0.0` — verify `lsof -iTCP -sTCP:LISTEN` shows `127.0.0.1:PORT` only.
- [ ] **DNS-rebinding protection:** Often relying on SDK defaults — verify `enableDnsRebindingProtection: true` is set and SDK >= 1.24.0; a foreign-`Origin` request returns 403.
- [ ] **HTTP auth:** Often absent behind the tunnel — verify an unauthenticated request returns 401 before any tool dispatch.
- [ ] **Tailscale exposure:** Often assumed private — verify `tailscale serve status` shows tailnet-only and the port is unreachable off-tailnet; funnel attribute disabled in ACL.
- [ ] **Node path in plist:** Often the versioned Cellar path — verify a stable symlink path so `brew upgrade node` doesn't revoke Automation.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Silent write-failure reached real data | HIGH | Tasks complete/drop are recoverable in OmniFocus (that's why the agent role forbids hard-delete); audit affected tasks, re-apply intended state, add the missing round-trip test. Defer real-data migration until verification is trusted (per `PROJECT.md`). |
| Guard bypass leaked test/destructive data | MEDIUM | Identify by sandbox prefixes (`__MCP_TEST_SANDBOX__`); clean up; add batch-parity guard test (as OMN-119 did with the startup assertion). |
| launchd Automation denied / hanging | LOW–MEDIUM | Re-grant Automation interactively from the launchd context; pin stable Node path; add fail-fast permission probe. |
| HTTP bound to 0.0.0.0 / rebinding open | LOW | Switch bind to loopback, enable rebinding protection, restart; rotate the auth token if exposure window existed. |
| Funnel left public | LOW (act fast) | `tailscale serve reset` / reconfigure as `serve`; disable funnel node attribute; rotate token; check access logs for the exposure window. |
| Tailnet-trust, no per-request auth | LOW | Add auth middleware (401 before dispatch); rotate token; scope to agent role. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Silent write-failure | Write-verification layer (earliest impl) | Round-trip integration tests on tags, `plannedDate`-on-create, `reviewInterval`-on-new-project all assert persisted value |
| Guard bypass on batch ops | Agent-role / remove-deletes phase | Batch path enforces identical capability set as single path (parity test); startup assertion present on every entry point |
| launchd / TCC Automation denial | launchd-deployment phase | Verified write completes under `launchctl`, no prompt; fail-fast on revoked Automation; stable Node path in plist |
| HTTP open / DNS rebinding (CVE-2025-66414) | HTTP-auth / transport-hardening phase | `lsof` shows loopback-only; foreign `Origin`/`Host` → 403; SDK >= 1.24.0 with protection enabled |
| Funnel-vs-serve public exposure | Tailscale remote-access phase (after auth) | `serve` only; funnel disabled in ACL; port unreachable off-tailnet |
| Tailnet-trust without per-request auth | HTTP-auth phase (before Tailscale) | Unauthenticated tailnet request → 401; authenticated request limited to agent-role ops |

**Phase-ordering implication:** verification before write-exposure; agent role + guard chokepoint before remote exposure; HTTP auth before Tailscale `serve`; never expose remotely before auth exists. Migration of real vault data stays gated behind trusted writes (`PROJECT.md` Out of Scope).

## Sources

- This repo's own `.planning/codebase/CONCERNS.md` — OMN-119 batch-guard bypass, OMN-28/29 bridge nonce, `reviewInterval`/`plannedDate` silent no-ops, module-level cache, error-surface fragility, 15s permission cache (HIGH).
- This repo's `docs/dev/LESSONS_LEARNED.md` and `docs/dev/JXA-VS-OMNIJS-PATTERNS.md` — tag/date setter no-ops, bridge-context consistency, `.whose()` timeout (HIGH).
- This repo's `.planning/PROJECT.md` — constraints: no FDA, no open network, Tailscale-only remote, least-privilege agent role, write-verification requirement (HIGH).
- MCP spec, Transports — Origin-header validation MUST, bind-localhost SHOULD: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports (HIGH).
- CVE-2025-66414 / GHSA-w48q-cv73-mx4w — DNS-rebinding protection off by default in MCP TypeScript SDK, fixed in 1.24.0 (opt-in): https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-w48q-cv73-mx4w and https://advisories.gitlab.com/pkg/npm/@modelcontextprotocol/sdk/CVE-2025-66414/ (HIGH).
- MCP TypeScript SDK server docs — `enableDnsRebindingProtection`, `allowedHosts`, `allowedOrigins`, `createMcpExpressApp()`: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md (HIGH).
- Tailscale docs — Serve (tailnet-only) vs Funnel (public), port exclusivity, funnel node attribute / ACLs: https://tailscale.com/docs/features/tailscale-funnel and https://tailscale.com/docs/reference/funnel-vs-sharing (HIGH).
- macOS TCC / Automation attribution — responsible process, `AEDeterminePermissionToAutomateTarget`, `kTCCServiceAppleEvents`: https://developer.apple.com/forums/thread/666528 and https://mjtsai.com/blog/2025/07/07/the-curious-case-of-the-responsible-process/ (MEDIUM).
- launchd/TCC headless + Node-path-revocation gotchas — daemon blocked by TCC dialogs, FDA not propagating to LaunchAgent children, Node path changes revoking grants: https://chrispaynter.medium.com/what-to-do-when-your-macos-daemon-gets-blocked-by-tcc-dialogues-d3a1b991151f (MEDIUM).

---
*Pitfalls research for: host-resident OmniFocus MCP server hardening (write-safety, macOS TCC, MCP HTTP auth, Tailscale)*
*Researched: 2026-06-03*
