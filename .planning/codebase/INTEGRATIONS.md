# External Integrations

**Analysis Date:** 2026-06-03

## macOS Automation Bridge (Primary Integration)

This server's defining integration is not a network API — it talks to OmniFocus through macOS automation exclusively.

**JXA (JavaScript for Automation) — direct path:**
- Execution: `osascript -l JavaScript` spawned as a child process (`node:child_process` `spawn`)
- Entry point: `src/omnifocus/OmniAutomation.ts` (`OmniAutomation.execute()`)
- Scripts are TypeScript template strings compiled into JS strings and piped to osascript stdin
- Script sources: `src/omnifocus/scripts/**/*.ts` (not real TS — they export string constants or builder functions)
- Size limit: 523KB empirical JXA capacity; server enforces 75% margin (~392KB) by default
- Timeout: 120s default, configurable via `OMNIFOCUS_SCRIPT_TIMEOUT`
- **JXA property access:** method calls — `task.name()`, `folder.parent()`, `doc.defaultDocument()`

**OmniJS Bridge — via `app.evaluateJavascript()`:**
- Inner JavaScript executed inside OmniJS (OmniFocus's own JavaScript runtime) via a JXA outer call
- Required for: tag assignment (`addTag()`), repetition rules, task movement between projects
- Entry points: `src/contracts/ast/mutation-script-builder.ts`, `src/contracts/ast/tag-mutation-script-builder.ts`
- **OmniJS property access:** direct property reads — `task.name`, `folder.parent` (no parens)
- Size limit: 261KB for OmniJS bridge scripts
- Bridge URL scheme: `omnifocus:///omnijs-run?script=<encoded>` — used by `executeViaUrlScheme()` for operations requiring elevated permissions; invoked via macOS `open` command

**OmniFocus URL Scheme:**
- `omnifocus:///omnijs-run?script=<URLencoded-OmniJS>` — alternate execution path for permission-sensitive operations
- Invoked via `spawn('open', [url])` (not osascript)
- Returns `{ success: true }` only — no data back from URL scheme executions

**Permission Check:**
- On startup, `src/utils/permissions.ts` runs `osascript -e 'tell application "OmniFocus" to return name of default document'`
- Detects Apple event authorization errors (-1743), OmniFocus not running (-600), and permission dialogs
- TTL: 15 seconds (cached to avoid repeated prompts)

## OmniFocus Application

**What it provides:**
- Task management data: tasks, projects, folders, tags, perspectives, review schedules
- JXA API type definitions: `src/omnifocus/api/OmniFocus.d.ts` (official), `OmniFocus-4.8.3-d.ts`, `OmniFocus-4.8.6-d.ts`
- Version detection: `src/omnifocus/version-detection.ts` — lazy-loads OmniFocus version and exposes feature flags (e.g. `hasPlannedDates` for 4.7+, `hasEnhancedRepeats`)

**Version support:**
- Targets OmniFocus 4.x (type definitions for 4.8.3 and 4.8.6 present)
- Feature flags gate functionality by detected version (planned dates, mutually exclusive tags, enhanced repeats)

## MCP Protocol (Model Context Protocol)

**SDK:** `@modelcontextprotocol/sdk` ^1.25.1
- `Server` class from `@modelcontextprotocol/sdk/server/index.js` — lower-level class used to support hand-crafted `inputSchema` overrides on each tool class
- Transport: `StdioServerTransport` for stdio mode (Claude Desktop), `StreamableHTTPServerTransport` for HTTP mode
- Capabilities advertised: `tools`, `prompts`
- Protocol version: determined by installed SDK (see `package.json`)
- Spec: https://modelcontextprotocol.io/specification/

**Stdio mode (default):**
- Reads from `process.stdin`, writes to `process.stdout`
- Graceful exit on `stdin` close: waits for pending operations, calls `server.close()`, then `process.exit(0)`
- EPIPE handled on stdout/stderr for abrupt Claude Desktop disconnects

**HTTP mode (`--http` flag):**
- `src/http-server.ts` — plain `node:http` server (no external HTTP framework)
- `src/session-manager.ts` — manages multiple concurrent sessions, each with its own `Server` + `StreamableHTTPServerTransport`
- Optional Bearer token auth (`--auth-token` / `MCP_AUTH_TOKEN`)
- Default port: 3000, default host: 0.0.0.0 (configurable via `--port`, `--host`)
- Session timeout: 30 minutes (idle cleanup interval runs every minute)

## Local LLM Integration (Dev / Testing Only)

**Ollama:**
- Package: `ollama` ^0.6.0 (devDependency)
- Used in: `tests/integration/real-llm-integration.test.ts`
- Gated by: `ENABLE_REAL_LLM_TESTS=true` env var
- Purpose: conformance testing — verifies that local 7-8B models (e.g. llama3, mistral) can correctly emit tool call envelopes that the server accepts
- Related conformance probe: `scripts/llm-conformance-probe.ts` (run via `npm run conformance`)
- LLM simulation test suite: `tests/integration/llm-assistant-simulation.test.ts` (gated by `ENABLE_LLM_SIMULATION_TESTS=true`)
- NOT part of the production runtime

## Data Storage

**Databases:**
- None — OmniFocus is the exclusive data store; all reads/writes go through JXA/OmniJS scripts
- No SQL, no embedded DB, no file-based persistence owned by this server

**File Storage:**
- Local filesystem: tool failure logs in `.tmp-home/.omnifocus-mcp/tool-failures/`
- No cloud file storage

**Caching:**
- In-process `Map`-based cache: `src/cache/CacheManager.ts`
- TTLs: tasks 5min (cache-warmer only, ReadTool bypasses), projects 5min, tags 10min, folders 10min, analytics 1h, reviews 3min
- Data integrity: SHA-256 checksums on cached values
- Cache warming: `src/cache/CacheWarmer.ts` — warms projects, tags, tasks (today/overdue/upcoming), perspectives on startup; disabled in CI and test environments

## Authentication & Identity

**Auth Provider:**
- None for stdio mode (Claude Desktop handles auth at the MCP client level)
- Optional Bearer token for HTTP mode — static token set via `--auth-token` CLI flag or `MCP_AUTH_TOKEN` env var; validated on each HTTP request in `src/http-server.ts`
- No OAuth, no JWT, no external identity provider

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Datadog, etc.)
- Uncaught exceptions and unhandled rejections are caught by global handlers in `src/index.ts` — logged to stderr, server continues

**Logs:**
- Structured JSON logging to `stderr` via `src/utils/logger.ts` (`createLogger(context)`)
- Log levels: debug, info, warn, error
- Sensitive field redaction: task names, notes, script content are redacted in log output
- Correlation ID support via `withCorrelation(id)` on logger instances
- Startup timing via `StartupTimer` marks: initEnd, permsEnd, warmEnd, registerEnd, ready

## CI/CD & Deployment

**Hosting:**
- Published to npm as `omnifocus-mcp-cached`
- Installed locally on macOS by end users; no server hosting involved

**CI Pipeline:**
- GitHub Actions: `.github/workflows/ci.yml`
- Runs on: ubuntu-latest (quick validation only — no OmniFocus access on Linux)
- CI jobs: TypeScript compilation, type checking, lint (error count ≤50 threshold), unit tests
- Full integration tests require macOS + OmniFocus; run locally via `npm run ci:local`
- Local CI script: `scripts/ci-local.sh`

## Webhooks & Callbacks

**Incoming:** None

**Outgoing:** None — all communication is initiated by the MCP client (Claude Desktop or HTTP client)

## Environment Configuration

**Required for production:**
- macOS with OmniFocus 4.x installed and running
- Automation permissions granted (System Preferences → Privacy & Security → Automation)
- No `.env` file — all configuration via env vars or CLI args at process startup

**Key env vars:**
- `NODE_ENV` — `test` triggers sandbox guard check
- `SANDBOX_GUARD_ENABLED` — must be `true` if `NODE_ENV=test` (prevents test writes to live DB)
- `OMNIFOCUS_SCRIPT_TIMEOUT` — script execution timeout in ms (default: 120000)
- `OMNIFOCUS_MAX_SCRIPT_SIZE` — max JXA script size in bytes
- `ENABLE_CACHE_WARMING` — override to force cache warming in non-production environments
- `NO_CACHE_WARMING` — disable cache warming entirely
- `MCP_SKIP_AUTO_START` — prevent server auto-start on import (used in tests)

**Secrets location:**
- No secrets stored at rest — Bearer token (HTTP mode) is passed at process invocation time

---

*Integration audit: 2026-06-03*
