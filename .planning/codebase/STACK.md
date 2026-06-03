# Technology Stack

**Analysis Date:** 2026-06-03

## Languages

**Primary:**
- TypeScript 5.8.x — all source code in `src/`, targeting ES2022
- JavaScript (JXA / OmniJS) — generated at runtime as string templates injected into `osascript`; lives in `src/omnifocus/scripts/**/*.ts` as template strings, not compiled TS

**Secondary:**
- Shell — `.husky/pre-commit`, `.husky/pre-push`, `scripts/ci-local.sh`, `scripts/test-*.sh`

## Runtime

**Environment:**
- Node.js >=18.0.0 (required; `package.json` engines field)
- CI pin: Node 20 (`.github/workflows/ci.yml` `NODE_VERSION: '20'`)
- No `.nvmrc` — version is not locally pinned beyond the engines constraint

**Package Manager:**
- npm (lockfile: `package-lock.json` present)
- ESM-only project (`"type": "module"` in `package.json`)

## Frameworks

**Core:**
- `@modelcontextprotocol/sdk` ^1.25.1 — MCP server lifecycle, transport, tool/prompt registration
  - Uses the lower-level `Server` class (not `McpServer`) to support `inputSchema` overrides; guarded by `eslint-disable sonarjs/deprecation` comments
  - Transport modes: `StdioServerTransport` (default) and `StreamableHTTPServerTransport` (HTTP mode)

**Validation:**
- `zod` ^3.25.76 — runtime schema validation for all tool inputs, JXA envelope responses, and filter contracts

**Testing:**
- `vitest` ^3.2.4 — test runner for unit, integration, smoke, and performance suites
- `@vitest/coverage-v8` ^3.2.4 — V8 code coverage; thresholds: 75% branches, 80% functions, 85% lines/statements
- `chai` ^5.2.0 — assertion library (used alongside vitest's built-in expect)

**Build:**
- `tsc` (TypeScript compiler) — sole build tool; `npm run build` → `dist/`
  - `moduleResolution: NodeNext`, `module: NodeNext`
  - Strict mode fully enabled: `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `useUnknownInCatchVariables`
- `tsx` ^4.20.4 — runs maintenance scripts and setup scripts directly from TS without a build step (`npx tsx scripts/*.ts`)

**Linting / Formatting:**
- ESLint 9.29.0 with flat config (`eslint.config.js`)
  - Plugins: `@typescript-eslint`, `eslint-plugin-sonarjs`, `eslint-plugin-import`, local custom rules in `eslint-rules/`
- Prettier 3.3.3 — config in `.prettierrc.json` (120-char print width, single quotes, trailing commas, LF)
- `lint-staged` ^15.2.9 — runs prettier + eslint on staged files in pre-commit hook

**Local LLM testing (dev-only):**
- `ollama` ^0.6.0 — dev dependency; used in `tests/integration/real-llm-integration.test.ts` for local model conformance testing; not part of the production server

## Key Dependencies

**Critical:**
- `@modelcontextprotocol/sdk` ^1.25.1 — the entire server protocol surface; upgrading requires verifying `Server` class still supports manual `inputSchema` overrides
- `zod` ^3.25.76 — schema validation runs on every tool invocation; incompatible updates will break all Zod schemas in `src/tools/unified/schemas/`
- `@types/node` ^24.0.3 — Node type declarations; listed as a production dependency (not devDep) because `tsc` is run at production install time via `npm run build`

**Infrastructure (dev):**
- `husky` ^9.1.6 — git hooks (`pre-commit`: lint-staged; `pre-push`: typecheck + lint + unit tests). Note: `pre-commit` framework is NOT used here; hooks are plain shell scripts in `.husky/`
- `@typescript-eslint/eslint-plugin` ^8.34.1 and `@typescript-eslint/parser` ^8.34.1 — TypeScript-aware lint rules
- `eslint-plugin-sonarjs` ^4.0.2 — code smell and duplicate detection
- `ts-prune` ^0.10.3 — dead code detection utility

## Configuration

**Environment variables (runtime):**
- `NODE_ENV` — set to `test` in test environments; triggers sandbox guard enforcement
- `SANDBOX_GUARD_ENABLED` — must be `true` when `NODE_ENV=test` to allow server startup (OMN-46 guard in `src/utils/sandbox-guard.ts`)
- `OMNIFOCUS_MAX_SCRIPT_SIZE` — override max JXA script byte size (default: `Math.floor(523KB * 0.75)`)
- `OMNIFOCUS_SCRIPT_TIMEOUT` — override osascript timeout in ms (default: 120000)
- `ENABLE_CACHE_WARMING` — force cache warming on in test/CI environments
- `NO_CACHE_WARMING` — disable cache warming (benchmark mode)
- `CI` — set to `true` disables cache warming (no OmniFocus on Linux)
- `MCP_SKIP_AUTO_START` — prevent auto-start of server (used in test imports)
- `ENABLE_LLM_SIMULATION_TESTS` — gate for LLM simulation test suite
- `ENABLE_REAL_LLM_TESTS` — gate for live Ollama integration tests
- `VITEST_SAFE` — force sequential test execution

**Build:**
- `tsconfig.json` — production source compilation (`src/**`)
- `tsconfig.test.json` — test compilation (`tests/**`); both referenced by `eslint.config.js`
- `vitest.config.ts` — test runner configuration with adaptive timeouts and pool strategy

## Platform Requirements

**Development:**
- macOS required for all OmniFocus integration tests (osascript, JXA, OmniJS are macOS-only)
- OmniFocus 4.x must be installed and running for integration/smoke tests
- Automation permissions must be granted to the terminal/node process

**Production:**
- macOS with OmniFocus installed and running
- Distributed as an npm package: `omnifocus-mcp-cached` (bin entry: `dist/index.js`)
- Installed via `npm install -g omnifocus-mcp-cached` or referenced locally in Claude Desktop config
- Two runtime modes: stdio (default, for Claude Desktop) and HTTP (`--http` flag, for remote access)

---

*Stack analysis: 2026-06-03*
