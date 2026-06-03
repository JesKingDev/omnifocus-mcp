# Testing Patterns

**Analysis Date:** 2026-06-03

## Test Framework

**Runner:**
- Vitest 3.x
- Config: `vitest.config.ts`

**Assertion Library:**
- Vitest built-in `expect` (Jest-compatible API)
- `satisfies` operator used on mock return values to enforce type correctness at compile time

**Run Commands:**
```bash
npm run test:unit          # Run all unit tests (fast, no OmniFocus)
npm run test:watch         # Unit tests in watch mode
npm run test:smoke         # Smoke tests (requires macOS + OmniFocus, ~2.5 min)
npm run test:integration   # Full integration suite (requires macOS + OmniFocus)
npm run test:coverage      # Unit tests with v8 coverage report
npm run test:pre-commit    # unit + smoke (pre-commit gate)
npm run test:pre-push      # typecheck + lint + unit (pre-push hook)
npm run test:ci            # unit + smoke + integration (full local CI)
npm run test:llm-simulation  # LLM simulation suite (ENABLE_LLM_SIMULATION_TESTS=true)
npm run test:real-llm      # Ollama real-model suite (ENABLE_REAL_LLM_TESTS=true)
```

**IMPORTANT:** Always use `npm`, not `bun`, to run integration tests.

## Test File Organization

**Location:**
- Unit tests: `tests/unit/` — mirrors `src/` directory structure
- Smoke tests: `tests/smoke/` — one file, quick OmniFocus sanity check
- Integration tests: `tests/integration/` — requires live OmniFocus on macOS
- Manual/exploratory scripts: `tests/manual/` — not part of automated runs
- Support/setup: `tests/support/` — shared setup files, factories, helpers

**Naming:**
- Automated test files: `*.test.ts`
- Manual exploration scripts: `test-*.ts` or `test-*.js` (not picked up by vitest)
- Snapshot files: `tests/unit/diagnostics/__snapshots__/` (golden output tests)

**Structure:**
```
tests/
├── unit/                          # No OmniFocus dependency
│   ├── analytics/                 # Analyzer unit tests
│   ├── architecture/              # Schema/impl parity tests (OMN-47)
│   ├── contracts/ast/             # AST builder and emitter tests
│   ├── diagnostics/               # Diagnostic tooling tests (incl. golden/snapshot)
│   ├── docs/                      # CLAUDE.md path validity test
│   ├── eslint-rules/              # Custom ESLint rule tests via RuleTester
│   ├── guards/                    # Escape/injection guard tests
│   ├── integration-helpers/       # Unit tests for integration helper code
│   ├── omnifocus/                 # OmniAutomation layer unit tests
│   ├── tools/                     # Tool layer tests (base, unified, system)
│   │   ├── normalization/         # Input normalization tests (OMN-122)
│   │   ├── unified/               # Per-tool + per-compiler tests
│   │   │   ├── compilers/
│   │   │   └── schemas/
│   │   └── batch/
│   └── utils/                     # Utility function tests
├── smoke/
│   └── omnifocus-sanity.test.ts   # Live OmniFocus connection check
├── integration/
│   ├── helpers/                   # MCPTestClient, SandboxManager, RunId, etc.
│   ├── tools/unified/             # End-to-end, field round-trip, review interval
│   └── validation/                # Analytics, filter, and update-operations tests
└── support/
    ├── setup-unit.ts              # Global mock for OmniAutomation (JXA block)
    ├── setup-integration.ts       # Global setup/teardown for integration runs
    └── test-factories.ts          # TestDataFactory for mock task/project data
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ComponentName', () => {
  let tool: OmniFocusReadTool;
  let execJsonSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Fresh instance + spy per test
    tool = new OmniFocusReadTool(mockCache);
    execJsonSpy = vi.fn();
    vi.spyOn(tool as any, 'execJson').mockImplementation(execJsonSpy);
  });

  describe('feature group', () => {
    it('describes the expected behavior precisely', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { tasks: [{ id: 'task-abc' }] },
      } satisfies ScriptResult);

      const result = await tool.execute({ query: { type: 'tasks' } }) as any;

      expect(result.success).toBe(true);
    });
  });
});
```

**Patterns:**
- `beforeEach` creates a fresh instance and clears mocks — never share mutable state between tests
- `vi.clearAllMocks()` at the top of every `beforeEach`
- `satisfies ScriptResult` on mock return values enforces compile-time type checking
- Integration tests use `beforeAll` / `afterAll` for server lifecycle (expensive to start/stop)

## Mocking

**Framework:** Vitest's `vi` API — `vi.mock`, `vi.fn`, `vi.spyOn`

**Global mock (unit tests):**
`tests/support/setup-unit.ts` is loaded as `setupFiles` in vitest config. It globally spies on `OmniAutomation.prototype.executeJson` and `OmniAutomation.prototype.executeTyped`, replacing them with no-ops. This means every unit test suite automatically runs without touching JXA/OmniFocus.

Override the global mock for specific tests:
```typescript
// Opt out of the global mock for a specific suite
// (set VITEST_ALLOW_JXA=1 env, or re-spy within the test)
vi.spyOn(tool as any, 'execJson').mockImplementation(myCustomSpy);
```

**Module-level mocking:**
```typescript
vi.mock('../../../../src/cache/CacheManager');
vi.mock('../../../../src/omnifocus/OmniAutomation');
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
```

**Partial mock objects (CacheManager pattern):**
```typescript
function createMockCache(): CacheManager {
  return {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
    invalidateForTaskChange: vi.fn(),
    invalidateProject: vi.fn(),
    invalidateTag: vi.fn(),
    invalidateTaskQueries: vi.fn(),
    clear: vi.fn(),
  } as unknown as CacheManager;
}
```

**Spy on protected methods:**
```typescript
// Pattern for testing tool behavior without JXA execution
execJsonSpy = vi.fn();
vi.spyOn(tool as any, 'execJson').mockImplementation(execJsonSpy);
```

**What to mock in unit tests:**
- `OmniAutomation` (always — no JXA in unit tests)
- `CacheManager` (inject partial mock via constructor)
- `fs` module (for export path tests)
- External processes (`child_process.spawn` for integration protocol tests)

**What NOT to mock:**
- Zod schemas, AST builders, filter compilers, script builders — these are pure functions; test them directly
- `TestDataFactory` — use the real factory, it has no side effects
- Custom ESLint rules — tested via ESLint's `RuleTester` wired into vitest

## Fixtures and Factories

**Test Data:**
```typescript
// Static factory in tests/support/test-factories.ts
const task = TestDataFactory.createMockTask({ flagged: true, name: 'Important Task' });
const project = TestDataFactory.createMockProject({ status: 'onHold' });
const tasks = TestDataFactory.createMockTaskArray(5, { completed: false });
```

**Per-run scoped names (integration tests):**
```typescript
// tests/integration/helpers/run-id.ts
import { runScopedName, runScopedTag } from './helpers/run-id.js';

const TASK_NAME = runScopedName(`RT_${TS}`);  // prefixed with run ID
const TAG = runScopedTag('rt-tag');             // prefixed with __test- + run ID
```

**Location:**
- Mock/static fixtures: `tests/support/test-factories.ts`
- Per-run ID helpers: `tests/integration/helpers/run-id.ts`
- Snapshot fixtures: `tests/unit/diagnostics/__snapshots__/`
- Integration write operations land in the `__MCP_TEST_SANDBOX__` folder in OmniFocus

## Coverage

**Requirements:**
- Branches: 75%
- Functions: 80%
- Lines: 85%
- Statements: 85%

**Excluded from coverage:**
- `src/omnifocus/scripts/**` (template strings, not executable TypeScript logic)
- `src/prompts/**` (prompt content)
- `scripts/**` (maintenance scripts)
- `src/tools/analytics/PatternAnalysisTool.ts` (legacy v1, superseded)
- `src/omnifocus/plugins/PluginRegistry.ts` (registry shell)

**View Coverage:**
```bash
npm run test:coverage      # outputs text + HTML + json-summary
# HTML report: coverage/index.html
```

## Test Types

**Unit Tests (`tests/unit/`):**
- No I/O, no OmniFocus, no network
- Run in ~seconds; safe on any OS including Ubuntu CI
- Cover: AST builders, filter compilers, Zod schemas, tool routing logic, normalization, error taxonomy, caching, response formatting, custom ESLint rules
- Architecture parity tests (`tests/unit/architecture/schema-impl-parity.test.ts`) enumerate every declared field/enum member and assert it has a matching implementation — catches declaration↔implementation drift (OMN-47 pattern)

**Smoke Tests (`tests/smoke/`):**
- Tier 2: quick live OmniFocus round-trip (~2.5 min total)
- Creates one task, verifies it, deletes it, verifies deletion
- Requires macOS + running OmniFocus with Automation permission
- Run via `npm run test:smoke` or as part of `test:pre-commit`

**Integration Tests (`tests/integration/`):**
- Full MCP protocol compliance, field round-trip persistence, batch operations, LLM simulation
- Require macOS + OmniFocus; auto-skip on non-darwin via `process.platform === 'darwin'` check
- All write operations are sandbox-guarded: importing `sandbox-manager.ts` sets `SANDBOX_GUARD_ENABLED=true`, blocking writes outside `__MCP_TEST_SANDBOX__`
- Run sequentially (`pool: 'forks', singleFork: true`) to prevent concurrent `osascript` contention
- Timeout: 180s per test, 300s for hooks

**LLM Simulation Tests (`tests/integration/llm-assistant-simulation.test.ts`):**
- Gated: only runs when `ENABLE_LLM_SIMULATION_TESTS=true`
- Simulates multi-step LLM assistant workflows (no real model) by hand-coding the call sequence a Claude instance would make, then asserting deterministic server responses
- Uses `LLMAssistantSimulator` class that spawns the MCP server as a child process and communicates over stdin/stdout

**Real LLM / Ollama Tests (`tests/integration/real-llm-integration.test.ts`):**
- Gated: only runs when `ENABLE_REAL_LLM_TESTS=true`
- Requires Ollama installed and running with a ≥7B model (default: `llama3.1:8b`, override with `REAL_LLM_MODEL`)
- Sub-7B models frequently emit malformed request envelopes and exercise the normalizer fallbacks rather than genuine model reasoning
- Run via `npm run test:real-llm`

**Conformance Probe (`scripts/llm-conformance-probe.ts`):**
- Standalone script (not a vitest suite) for evaluating local Ollama model capability before running the real-LLM suite
- Run via `npm run conformance`

## Common Patterns

**Async Testing:**
```typescript
it('returns task data on success', async () => {
  execJsonSpy.mockResolvedValueOnce(createScriptSuccess({ tasks: [] }));
  const result = await tool.execute({ query: { type: 'tasks' } });
  expect(result.success).toBe(true);
});
```

**Error Testing:**
```typescript
it('returns error response when script fails', async () => {
  execJsonSpy.mockResolvedValueOnce(createScriptError('OmniFocus unavailable'));
  const result = await tool.execute({ query: { type: 'tasks' } }) as any;
  expect(result.success).toBe(false);
  expect(result.error.code).toBe('SCRIPT_ERROR');
});
```

**Sandbox guard testing (unit):**
```typescript
it('throws SandboxGuardMisconfiguration when NODE_ENV=test and guard unset', () => {
  expect(() => assertSandboxGuardAtStartup({ NODE_ENV: 'test' }))
    .toThrow(SandboxGuardMisconfiguration);
});
```

**Platform-gated integration tests:**
```typescript
const RUN_INTEGRATION_TESTS =
  process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

d('Suite Name', () => { /* ... */ });
```

**Golden/snapshot tests:**
```typescript
// tests/unit/diagnostics/analyze-cli-golden.test.ts
it('produces identical output before/after refactor', () => {
  const output = runCli(fixtureHome);
  expect(output).toMatchSnapshot();
});
// Snapshot stored in tests/unit/diagnostics/__snapshots__/
```

**CLAUDE.md path integrity test:**
- `tests/unit/docs/claude-md-paths.test.ts` parses `CLAUDE.md` and asserts every `src/` or `docs/` path reference resolves to an actual file on disk. This gates against stale path references in documentation. It does NOT check line numbers (those are considered volatile).

## CI Behavior

**GitHub Actions (`.github/workflows/ci.yml`):**
- Runs on Ubuntu (no OmniFocus available)
- Jobs: `quick-check` (typecheck + lint), `test-functionality` (build + unit tests + server startup + tool registration count)
- Integration tests cannot run in CI without macOS + OmniFocus; the CI job notes this and runs startup verification only
- Expected tool count assertion: `4` (omnifocus_read, omnifocus_write, omnifocus_analyze, system)
- Lint error threshold: ≤ 50 errors (CI fails above this)
- Full test: run `npm run ci:local` on macOS with OmniFocus

---

*Testing analysis: 2026-06-03*
