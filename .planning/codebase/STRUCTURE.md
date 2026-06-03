# Codebase Structure

**Analysis Date:** 2026-06-03

## Directory Layout

```
omnifocus-mcp/
├── src/                         # All TypeScript source
│   ├── index.ts                 # Server entry point (stdio + HTTP modes)
│   ├── http-server.ts           # HTTP transport manager
│   ├── session-manager.ts       # Per-session MCP Server (HTTP mode)
│   ├── tools/                   # MCP tool implementations
│   │   ├── index.ts             # registerTools() — wires tools to SDK Server
│   │   ├── base.ts              # BaseTool abstract class
│   │   ├── unified/             # The four primary tools
│   │   │   ├── OmniFocusReadTool.ts
│   │   │   ├── OmniFocusWriteTool.ts
│   │   │   ├── OmniFocusAnalyzeTool.ts
│   │   │   ├── batch-response-flatten.ts
│   │   │   ├── compilers/       # Input → CompiledQuery/Mutation/Analysis
│   │   │   │   ├── QueryCompiler.ts
│   │   │   │   ├── MutationCompiler.ts
│   │   │   │   └── AnalysisCompiler.ts
│   │   │   ├── schemas/         # Zod schemas per tool
│   │   │   │   ├── read-schema.ts
│   │   │   │   ├── write-schema.ts
│   │   │   │   ├── analyze-schema.ts
│   │   │   │   └── batch-schemas.ts
│   │   │   └── utils/           # Tool-level utilities
│   │   │       ├── tempid-resolver.ts
│   │   │       ├── dependency-graph.ts
│   │   │       └── task-sanitizer.ts
│   │   ├── system/
│   │   │   └── SystemTool.ts    # system tool (version, diagnostics)
│   │   ├── tasks/               # Task query pipeline helpers
│   │   │   ├── task-query-pipeline.ts
│   │   │   └── filter-types.ts
│   │   ├── capture/             # Context tag detection, date extraction
│   │   │   ├── context-detection.ts
│   │   │   └── date-extraction.ts
│   │   ├── normalization/       # Input repair for local LLMs (OMN-122)
│   │   │   └── normalize-input.ts
│   │   ├── schemas/             # Shared schema helpers
│   │   │   └── coercion-helpers.ts
│   │   └── response-types-v2.ts # Shared response type definitions
│   ├── omnifocus/               # OmniAutomation / JXA execution layer
│   │   ├── OmniAutomation.ts    # osascript subprocess executor
│   │   ├── types.ts             # OmniFocusTask, OmniFocusProject, etc.
│   │   ├── script-result-types.ts # ScriptResult<T> discriminated union
│   │   ├── script-response-types.ts # Per-operation response shapes
│   │   ├── api/                 # TypeScript types for OmniJS API
│   │   │   └── OmniFocus.d.ts
│   │   ├── plugins/             # OmniFocus plugin utilities
│   │   ├── scripts/             # JXA script libraries (string constants)
│   │   │   ├── tasks.ts         # buildListTasksScriptV4, count scripts
│   │   │   ├── perspectives.ts
│   │   │   ├── recurring.ts
│   │   │   ├── reviews.ts
│   │   │   ├── analytics/       # Productivity stats, velocity, overdue
│   │   │   ├── cache/           # Startup warming scripts
│   │   │   ├── export/          # Full-database export scripts
│   │   │   ├── perspectives/    # Perspective list script
│   │   │   ├── recurring/       # Recurring task analysis
│   │   │   ├── reviews/         # Review scheduling scripts
│   │   │   ├── shared/          # Injected helpers for all scripts
│   │   │   │   ├── helpers.ts            # getUnifiedHelpers() — USE THIS
│   │   │   │   ├── bridge-helpers.ts     # getBridgeOperations()
│   │   │   │   ├── minimal-tag-bridge.ts # Tag bridge ops
│   │   │   │   └── repeat-helpers.ts     # Repetition rules
│   │   │   ├── system/          # Version/diagnostics scripts
│   │   │   └── tasks/           # Task-specific script fragments
│   │   └── utils/               # OmniFocus-layer utilities
│   │       └── script-size-monitor.ts
│   ├── contracts/               # Shared data contracts
│   │   ├── filters.ts           # TaskFilter / ProjectFilter types (SSOT)
│   │   ├── mutations.ts         # TaskCreateData, TaskUpdateData, etc.
│   │   ├── tag-options.ts       # TagQueryOptions types
│   │   └── ast/                 # AST pipeline: filter → script predicate
│   │       ├── builder.ts       # TaskFilter → FilterAST
│   │       ├── types.ts         # FilterNode union types
│   │       ├── filter-generator.ts # FilterAST → code string
│   │       ├── script-builder.ts   # Assembles complete OmniJS scripts
│   │       ├── mutation-script-builder.ts # JXA mutation scripts + sandbox guard
│   │       ├── tag-script-builder.ts      # Tag query scripts
│   │       ├── tag-mutation-script-builder.ts # Tag create/rename/delete scripts
│   │       ├── bridge-escape.ts   # Template escaping utilities
│   │       ├── validator.ts       # Filter validation
│   │       ├── index.ts
│   │       ├── emitters/
│   │       │   └── omnijs.ts      # FilterAST → OmniJS predicate strings
│   │       ├── insights/          # Analytics insight builders
│   │       └── examples/          # Contract usage examples
│   ├── cache/
│   │   ├── CacheManager.ts      # TTL cache, SHA-256 integrity
│   │   ├── CacheWarmer.ts       # Startup pre-population
│   │   └── types.ts             # CacheCategory, CacheEntry, CacheConfig
│   ├── prompts/                 # MCP prompt library
│   │   ├── index.ts             # registerPrompts()
│   │   ├── base.ts              # BasePrompt abstract class
│   │   ├── gtd/                 # GTD workflow prompts
│   │   │   ├── WeeklyReviewPrompt.ts
│   │   │   ├── InboxProcessingPrompt.ts
│   │   │   ├── GTDPrinciplesPrompt.ts
│   │   │   └── eisenhower-matrix.ts
│   │   └── reference/
│   │       └── QuickReferencePrompt.ts
│   ├── diagnostics/             # Failure log analysis, schema drift
│   │   ├── failure-log.ts
│   │   ├── failure-log-gate.ts
│   │   ├── clustering.ts
│   │   ├── ledger.ts
│   │   ├── schema-drift.ts
│   │   └── tool-schema-registry.ts
│   └── utils/                   # Cross-cutting utilities
│       ├── logger.ts            # createLogger(), createCorrelatedLogger()
│       ├── permissions.ts       # PermissionChecker (macOS automation perms)
│       ├── response-format.ts   # StandardResponseV2, createListResponseV2, etc.
│       ├── branded-types.ts     # TaskId, ProjectId branded string types
│       ├── circuit-breaker.ts   # OmniFocus connectivity circuit breaker
│       ├── cli.ts               # parseCLIArgs(), CLIConfig
│       ├── error-taxonomy.ts    # ScriptErrorType enum, categorizeError()
│       ├── error-recovery.ts    # classifyErrorWithContext()
│       ├── error-messages.ts    # User-facing error message helpers
│       ├── metrics.ts           # recordToolExecution(), ToolExecutionMetrics
│       ├── safe-io.ts           # JxaEnvelopeSchema, normalizeToEnvelope()
│       ├── sandbox-guard.ts     # assertSandboxGuardAtStartup()
│       ├── startup-timer.ts     # StartupTimer with named marks
│       ├── timezone.ts          # localToUTC()
│       └── version.ts           # getVersionInfo()
├── tests/
│   ├── unit/                    # Co-located mirror of src/ (no OmniFocus needed)
│   │   ├── tools/unified/       # Tool and compiler unit tests
│   │   ├── contracts/ast/       # AST builder and emitter tests
│   │   ├── omnifocus/scripts/   # Script builder unit tests
│   │   ├── docs/                # Path reference integrity tests (CI guard)
│   │   ├── architecture/        # Architectural constraint tests
│   │   └── diagnostics/         # Failure-log and schema-drift tests
│   ├── integration/             # Requires live OmniFocus (~4 min)
│   │   ├── tools/unified/       # End-to-end tool tests
│   │   ├── helpers/             # Integration test harness, sandbox setup
│   │   └── validation/          # Schema/contract validation tests
│   ├── scenarios/               # Multi-step workflow scenario tests
│   ├── smoke/                   # Lightweight smoke tests
│   ├── performance/             # Benchmark tests
│   ├── manual/                  # Manual test scripts (not automated)
│   ├── support/                 # Shared test utilities
│   ├── utils/                   # Test helper functions
│   └── v2-integration/          # V2 API integration tests
├── docs/
│   ├── dev/                     # Developer reference docs
│   │   ├── ARCHITECTURE.md      # Execution model and JXA patterns
│   │   ├── PATTERNS.md          # Symptom → fix lookup (START HERE)
│   │   ├── LESSONS_LEARNED.md   # Hard-won implementation insights
│   │   ├── JXA-VS-OMNIJS-PATTERNS.md # Syntax difference reference
│   │   └── SETTER-PATTERNS.md   # Property setter decision matrix
│   ├── api/                     # Tool API reference
│   ├── tools/                   # Per-tool user documentation
│   ├── user/                    # End-user guides
│   └── skills/omnifocus-assistant/ # User-facing Claude skill (SKILL.md)
├── scripts/
│   ├── ops/                     # Operational scripts
│   └── manual/                  # Manual developer scripts
├── .planning/codebase/          # GSD codebase map documents (this dir)
├── .claude/
│   ├── agents/                  # Subagent definitions
│   └── processes/               # CLAUDE-PROCESSES.dot decision trees
├── .archive/                    # Archived legacy code (not in active use)
│   ├── api-v2-legacy/
│   └── dev-historical-oct-2025/
├── eslint-rules/                # Custom ESLint rule plugins
├── prompts/                     # Standalone prompt files (outside src/)
├── CLAUDE.md                    # Developer implementation guide
├── package.json
└── tsconfig.json
```

## Directory Purposes

**`src/tools/unified/`:**
- Purpose: The four public MCP tools (`omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system` is in `src/tools/system/`)
- Contains: Tool classes, Zod schemas, compilers, utility helpers
- Key files: `OmniFocusReadTool.ts`, `OmniFocusWriteTool.ts`, `OmniFocusAnalyzeTool.ts`, `compilers/QueryCompiler.ts`

**`src/contracts/ast/`:**
- Purpose: AST pipeline — the only safe way to embed user-provided filter values into scripts
- Contains: `builder.ts` (filter → AST), `emitters/omnijs.ts` (AST → code), `script-builder.ts` (full script assembly), mutation/tag builders
- Key files: `builder.ts`, `emitters/omnijs.ts`, `script-builder.ts`, `mutation-script-builder.ts`

**`src/omnifocus/scripts/shared/`:**
- Purpose: Helper functions injected into every JXA script; must be referenced, not re-implemented
- Contains: `helpers.ts` (canonical), `bridge-helpers.ts`, `minimal-tag-bridge.ts`, `repeat-helpers.ts`
- Key files: `helpers.ts` — export `getUnifiedHelpers()` is the required entry point

**`src/omnifocus/scripts/`:**
- Purpose: JXA/OmniJS script strings organized by feature area
- Contains: Subdirs per feature (analytics, cache, export, perspectives, recurring, reviews, system, tasks, shared)
- Key files: `tasks.ts` (task list + count builders), `analytics/productivity-stats-v3.js`

**`src/cache/`:**
- Purpose: TTL in-memory cache; avoids redundant OmniFocus queries for slow-changing data
- Contains: `CacheManager.ts`, `CacheWarmer.ts`, `types.ts`
- Key files: `CacheManager.ts` (categories: tasks 5m, projects 5m, tags 10m, folders 10m, analytics 1h, reviews 3m)

**`src/diagnostics/`:**
- Purpose: Failure-log analysis, schema drift detection, tool registry for CI guards
- Contains: Analysis scripts for production failure patterns
- Key files: `failure-log-gate.ts` (controls whether failures are written), `tool-schema-registry.ts`

**`tests/unit/`:**
- Purpose: Pure TypeScript tests with no OmniFocus dependency; mirrors `src/` directory structure
- Key files: `tests/unit/docs/claude-md-paths.test.ts` (CI guard for CLAUDE.md path references)

**`tests/integration/`:**
- Purpose: End-to-end tests that require a running OmniFocus with the `__MCP_TEST_SANDBOX__` folder
- Key files: `tests/integration/helpers/` (sandbox lifecycle), `tests/integration/tools/unified/`

## Key File Locations

**Entry Points:**
- `src/index.ts`: Server bootstrap — start here for any startup sequence question
- `dist/index.js`: Compiled entry point for production/MCP config (`node dist/index.js`)

**Configuration:**
- `src/utils/cli.ts`: CLI argument definitions and `CLIConfig` type
- `src/cache/CacheManager.ts`: Cache TTL configuration object (lines 17-28)
- `src/omnifocus/OmniAutomation.ts`: Script timeout and max-size defaults

**Core Tool Logic:**
- `src/tools/base.ts`: `BaseTool` — validation, error handling, metrics, circuit breaker
- `src/tools/index.ts`: Tool registration and `CallTool` request handler
- `src/contracts/filters.ts`: `TaskFilter` type — add new filter properties here first

**Dual-Schema Locations:**
| Tool | Zod Schema | inputSchema override |
|------|------------|----------------------|
| Read | `src/tools/unified/schemas/read-schema.ts` | `OmniFocusReadTool.ts` `get inputSchema()` |
| Write | `src/tools/unified/schemas/write-schema.ts` | `OmniFocusWriteTool.ts` `get inputSchema()` |
| Analyze | `src/tools/unified/schemas/analyze-schema.ts` | `OmniFocusAnalyzeTool.ts` `get inputSchema()` |
| System | `src/tools/system/SystemTool.ts` | `SystemTool.ts` `get inputSchema()` |

**Testing:**
- `tests/unit/`: Run with `npm run test:unit` (~2s, no OmniFocus)
- `tests/integration/`: Run with `npm run test:integration` (~4 min, requires OmniFocus)

## Naming Conventions

**Files:**
- PascalCase for class files: `OmniFocusReadTool.ts`, `CacheManager.ts`, `BaseTool.ts`
- kebab-case for module files: `task-query-pipeline.ts`, `normalize-input.ts`, `response-format.ts`
- kebab-case with suffix for scripts: `productivity-stats-v3.ts`, `analyze-overdue-v3.ts`
- Version suffix (`-v3`, `-v4`, `V3`, `V4`) on scripts that have been revised; keep older versions archived in `.archive/`

**Directories:**
- lowercase hyphenated: `unified/`, `task-query/`, `contracts/`

**Exports:**
- Script constant names are SCREAMING_SNAKE_CASE: `PRODUCTIVITY_STATS_SCRIPT_V3`, `LIST_PERSPECTIVES_SCRIPT`
- Builder function names are camelCase verbs: `buildListTasksScriptV4()`, `buildCreateTaskScript()`
- Response factory functions: `createListResponseV2()`, `createErrorResponseV2()`

**Types:**
- Interfaces: PascalCase, no `I` prefix: `CompiledQuery`, `TaskFilter`, `WarmingStrategy`
- Zod schema exports: PascalCase + `Schema` suffix: `ReadSchema`, `WriteSchema`
- Branded types: PascalCase + Id suffix: `TaskId`, `ProjectId`

## Where to Add New Code

**New filter property on tasks/projects:**
1. Add to `src/contracts/filters.ts` (the type definition SSOT)
2. Add to `src/tools/unified/schemas/read-schema.ts` (Zod schema)
3. Update `OmniFocusReadTool.ts` `get inputSchema()` (MCP advertisement)
4. Add to `src/contracts/ast/builder.ts` (FILTER_DEFS registry or DATE_FILTER_DEFS array)
5. Handle in `src/tools/unified/compilers/QueryCompiler.ts` if needed
- Reference: `docs/dev/FILTER_PIPELINE.md`

**New mutation operation:**
- Implementation: `src/contracts/ast/mutation-script-builder.ts`
- Script builder call: `src/tools/unified/OmniFocusWriteTool.ts`
- Schema: `src/tools/unified/schemas/write-schema.ts`
- Update `inputSchema` override in `OmniFocusWriteTool.ts`
- Tests: `tests/unit/tools/unified/` (unit) + `tests/integration/tools/unified/` (integration)

**New analytics operation:**
- Script: `src/omnifocus/scripts/analytics/` (new file, follow `-v3` naming convention)
- Tool: `src/tools/unified/OmniFocusAnalyzeTool.ts`
- Schema: `src/tools/unified/schemas/analyze-schema.ts`
- Update `inputSchema` override in `OmniFocusAnalyzeTool.ts`

**New JXA script:**
- Add to the appropriate `src/omnifocus/scripts/<category>/` subdirectory
- Always inject `${getUnifiedHelpers()}` from `src/omnifocus/scripts/shared/helpers.ts`
- Export as a string constant (SCREAMING_SNAKE_CASE) or builder function
- Unit test the script string in `tests/unit/omnifocus/scripts/`

**New MCP prompt:**
- Extend `BasePrompt` in `src/prompts/base.ts`
- Place in `src/prompts/gtd/` (workflow) or `src/prompts/reference/` (reference)
- Register in `src/prompts/index.ts`

**New utility:**
- Cross-cutting utilities (logging, error handling, formatting): `src/utils/`
- OmniAutomation-specific utilities: `src/omnifocus/utils/`

## Special Directories

**`.archive/`:**
- Purpose: Obsolete API versions and historical docs
- Generated: No
- Committed: Yes — synced to https://github.com/kip-d/omnifocus-mcp-archive per CLAUDE.md

**`.planning/codebase/`:**
- Purpose: GSD codebase map documents consumed by `/gsd-plan-phase` and `/gsd-execute-phase`
- Generated: Yes (by `/gsd-map-codebase`)
- Committed: Yes

**`.remember/`:**
- Purpose: Autonomous agent session logs and temporary working files
- Generated: Yes
- Committed: Yes (logs subdirectory)

**`.tmp-home/`:**
- Purpose: Sandboxed home directory used during test runs (`~/.omnifocus-mcp` equivalent)
- Generated: Yes
- Committed: No

**`dist/`:**
- Purpose: TypeScript compiled output; the actual binary that runs as MCP server
- Generated: Yes (`npm run build`)
- Committed: No

**`eslint-rules/`:**
- Purpose: Custom ESLint plugins for project-specific lint rules
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-06-03*
