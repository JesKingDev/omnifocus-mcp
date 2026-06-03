<!-- refreshed: 2026-06-03 -->
# Architecture

**Analysis Date:** 2026-06-03

## System Overview

```text
┌────────────────────────────────────────────────────────────────────────┐
│                         MCP Client (Claude Desktop / HTTP)              │
│                         stdio transport  |  StreamableHTTP transport    │
└────────────────┬───────────────────────────────────────┬───────────────┘
                 │ JSON-RPC (MCP protocol)                │
                 ▼                                         ▼
┌────────────────────────────────┐   ┌────────────────────────────────────┐
│      StdioServerTransport      │   │        HttpServerManager           │
│  `src/index.ts` runStdioServer │   │  `src/http-server.ts`              │
└──────────────┬─────────────────┘   │  SessionManager `src/session-      │
               │                     │  manager.ts` (per-session Server)  │
               ▼                     └──────────────┬─────────────────────┘
┌────────────────────────────────────────────────────▼──────────────────┐
│                        MCP Server (`Server` from SDK)                  │
│                  `registerTools()` + `registerPrompts()`               │
│                  `src/tools/index.ts`  `src/prompts/index.ts`          │
└───────────┬─────────────────────────────────────────────┬─────────────┘
            │ CallTool dispatch                            │ GetPrompt
            ▼                                             ▼
┌───────────────────────────────────────┐   ┌──────────────────────────────┐
│        Unified Tool Layer             │   │        Prompt Layer           │
│  OmniFocusReadTool    (omnifocus_read)│   │  GTDPrinciplesPrompt         │
│  OmniFocusWriteTool   (omnifocus_write│   │  WeeklyReviewPrompt          │
│  OmniFocusAnalyzeTool (omnifocus_anal)│   │  InboxProcessingPrompt       │
│  SystemTool           (system)        │   │  EisenhowerMatrixPrompt      │
│  `src/tools/unified/`                 │   │  QuickReferencePrompt        │
│  `src/tools/system/`                  │   │  `src/prompts/`              │
└──┬──────────────────────┬─────────────┘   └──────────────────────────────┘
   │ BaseTool              │
   │ `src/tools/base.ts`   │ schema validation (Zod) + input normalization
   ▼                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Compiler / Pipeline Layer                            │
│  QueryCompiler    `src/tools/unified/compilers/QueryCompiler.ts`         │
│  MutationCompiler `src/tools/unified/compilers/MutationCompiler.ts`      │
│  AnalysisCompiler `src/tools/unified/compilers/AnalysisCompiler.ts`      │
│  task-query-pipeline `src/tools/tasks/task-query-pipeline.ts`            │
└──────────┬───────────────────────────────────────────────────────────────┘
           │ CompiledQuery / CompiledMutation → script builder
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       AST / Script Builder Layer                         │
│  AST builder  `src/contracts/ast/builder.ts`  (TaskFilter → FilterAST)  │
│  OmniJS emitter `src/contracts/ast/emitters/omnijs.ts`                  │
│  script-builder `src/contracts/ast/script-builder.ts`                   │
│  mutation-script-builder `src/contracts/ast/mutation-script-builder.ts` │
│  tag-script-builder  `src/contracts/ast/tag-script-builder.ts`          │
│  tag-mutation-script-builder `src/contracts/ast/tag-mutation-script-    │
│     builder.ts`                                                          │
└──────────┬───────────────────────────────────────────────────────────────┘
           │ JXA script strings
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Cache Layer (pre-check)                                │
│  CacheManager `src/cache/CacheManager.ts`  (TTL, SHA-256 checksum)      │
│  CacheWarmer  `src/cache/CacheWarmer.ts`   (startup pre-population)     │
│  Categories: tasks(5m) | projects(5m) | tags(10m) | analytics(1h) |    │
│              folders(10m) | reviews(3m)                                  │
│  NOTE: tasks are NOT cached in the read path — always fresh.            │
└──────────┬───────────────────────────────────────────────────────────────┘
           │ cache miss → execute
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      OmniAutomation Layer                                │
│  OmniAutomation `src/omnifocus/OmniAutomation.ts`                       │
│  execute() → spawn `osascript -l JavaScript` via child_process           │
│  executeJson() → typed ScriptResult<T> with envelope parsing             │
│  executeTyped() → JxaEnvelopeSchema (ok/data/error shape)               │
│  Script size guard: 523KB empirical JXA limit (75% safety margin)       │
└──────────┬───────────────────────────────────────────────────────────────┘
           │ osascript via stdin/stdout
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    JXA Script (outer context)                            │
│  Application('OmniFocus') — method-call syntax: task.name()             │
│  `src/omnifocus/scripts/` — scripts organized by category               │
│  Shared helpers injected: `getUnifiedHelpers()` from                    │
│    `src/omnifocus/scripts/shared/helpers.ts`                            │
│                         │                                                │
│     (bridge required)   │ app.evaluateJavascript(omniJsScript)          │
│                         ▼                                                │
│              OmniJS inner context                                        │
│              property-access syntax: task.name (no parens)              │
│              Bridge helpers: `src/omnifocus/scripts/shared/             │
│                bridge-helpers.ts`                                        │
│              Used for: tag assignment, repetition rules,                │
│                        task movement, bulk ops (>100)                   │
└──────────────────────────────────────────────────────────────────────────┘
           │ JSON string output
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     OmniFocus.app (macOS)                                │
│                     Database reads and writes                            │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `src/index.ts` | Entry point, startup, transport selection | `src/index.ts` |
| `StdioServerTransport` | Primary MCP transport (Claude Desktop) | `src/index.ts` |
| `HttpServerManager` | Optional HTTP/SSE transport mode | `src/http-server.ts` |
| `SessionManager` | Per-session MCP Server instances (HTTP mode) | `src/session-manager.ts` |
| `registerTools` | Wires tools to MCP server handlers | `src/tools/index.ts` |
| `BaseTool` | Zod validation, metrics, error taxonomy, circuit breaker | `src/tools/base.ts` |
| `OmniFocusReadTool` | Query tasks/projects/tags/perspectives/folders | `src/tools/unified/OmniFocusReadTool.ts` |
| `OmniFocusWriteTool` | Create/update/complete/delete mutations | `src/tools/unified/OmniFocusWriteTool.ts` |
| `OmniFocusAnalyzeTool` | Analytics, velocity, overdue, patterns, reviews | `src/tools/unified/OmniFocusAnalyzeTool.ts` |
| `SystemTool` | Version, diagnostics, metrics | `src/tools/system/SystemTool.ts` |
| `QueryCompiler` | ReadInput → CompiledQuery (filter normalization) | `src/tools/unified/compilers/QueryCompiler.ts` |
| `MutationCompiler` | WriteInput → CompiledMutation | `src/tools/unified/compilers/MutationCompiler.ts` |
| `AnalysisCompiler` | AnalyzeInput → CompiledAnalysis | `src/tools/unified/compilers/AnalysisCompiler.ts` |
| AST builder | TaskFilter → FilterAST nodes | `src/contracts/ast/builder.ts` |
| OmniJS emitter | FilterAST → JavaScript predicate strings | `src/contracts/ast/emitters/omnijs.ts` |
| `script-builder` | Assembles complete OmniJS scripts with filter predicates | `src/contracts/ast/script-builder.ts` |
| `mutation-script-builder` | Generates JXA mutation scripts, sandbox guard | `src/contracts/ast/mutation-script-builder.ts` |
| `OmniAutomation` | Spawns `osascript`, tracks pending ops, size guard | `src/omnifocus/OmniAutomation.ts` |
| `CacheManager` | TTL in-memory cache with SHA-256 integrity checks | `src/cache/CacheManager.ts` |
| `CacheWarmer` | Pre-populates cache categories at startup | `src/cache/CacheWarmer.ts` |
| Shared JXA helpers | `getUnifiedHelpers()` injected into all scripts | `src/omnifocus/scripts/shared/helpers.ts` |
| Filter contracts | Single source of truth for all filter property types | `src/contracts/filters.ts` |
| Input normalizer | Bounded leniency for 7-8B local model envelope repair | `src/tools/normalization/normalize-input.ts` |
| `PermissionChecker` | Validates macOS OmniFocus automation permissions | `src/utils/permissions.ts` |

## Pattern Overview

**Overall:** Layered MCP server with JXA/OmniJS dual-context execution

**Key Characteristics:**
- Four unified tools with discriminated-union Zod schemas; each tool has a separate hand-crafted `inputSchema` for MCP advertisement
- All OmniFocus access is synchronous from the server's perspective — each tool call spawns `osascript` as a child process and awaits completion
- Script generation (AST → predicate → script string) happens fully in TypeScript before execution; no user input is ever string-concatenated into scripts
- Cache is populated at startup and used only for projects/tags/analytics/perspectives; task queries bypass the cache and always hit OmniFocus directly
- Two transport modes: stdio (default, Claude Desktop) and HTTP with per-session `Server` instances (`--http` CLI flag)

## Layers

**MCP Protocol Layer:**
- Purpose: Speaks MCP JSON-RPC, routes `tools/call` and `prompts/get` requests
- Location: `src/index.ts`, `src/http-server.ts`, `src/session-manager.ts`
- Contains: Server instantiation, transport setup, graceful shutdown, pending-op tracking
- Depends on: `@modelcontextprotocol/sdk`
- Used by: External MCP clients (Claude Desktop, Claude.ai, custom HTTP clients)

**Tool Layer:**
- Purpose: Validates input, dispatches to compilers, formats responses
- Location: `src/tools/unified/`, `src/tools/system/`
- Contains: `BaseTool` base class, four concrete tool classes, compilers, schemas, utils
- Depends on: Cache layer, OmniAutomation, AST layer, contracts
- Used by: MCP protocol layer via `registerTools()`

**AST / Script Builder Layer:**
- Purpose: Converts typed filter contracts into executable JXA/OmniJS script strings
- Location: `src/contracts/ast/`
- Contains: AST builder, OmniJS emitter, script builder, mutation builders, tag builders
- Depends on: `src/contracts/filters.ts` (filter type definitions)
- Used by: Tool layer (compilers and tool implementations)

**Cache Layer:**
- Purpose: TTL-based in-memory cache to avoid redundant OmniFocus queries
- Location: `src/cache/`
- Contains: `CacheManager`, `CacheWarmer`, `types.ts`
- Depends on: `OmniAutomation` (for warming), `OmniFocusReadTool` (for warming tasks)
- Used by: All tools that can serve from cache (projects, tags, analytics, perspectives)

**OmniAutomation Layer:**
- Purpose: Spawns `osascript` child process, writes script to stdin, reads JSON from stdout
- Location: `src/omnifocus/OmniAutomation.ts`
- Contains: `execute()`, `executeJson()`, `executeTyped()`, size guard, pending-op tracking
- Depends on: `node:child_process`
- Used by: `BaseTool.execJson()`, `CacheWarmer`, direct script callers

**Script Library:**
- Purpose: Stores pre-written JXA and OmniJS script templates organized by category
- Location: `src/omnifocus/scripts/`
- Contains: tasks, analytics, export, perspectives, recurring, reviews, system, cache, shared helpers
- Depends on: Nothing (pure string constants + helper injection functions)
- Used by: Tool layer and cache warmer

## Data Flow

### Primary Read Request Path

1. MCP client sends `tools/call` for `omnifocus_read` (`src/tools/index.ts`)
2. `registerTools` handler generates `correlationId`, finds `OmniFocusReadTool` (`src/tools/index.ts:71`)
3. `BaseTool.execute()` validates args via `parseWithNormalization(this.schema, args)` (`src/tools/base.ts:234`)
4. `OmniFocusReadTool.executeValidated()` creates `QueryCompiler` and calls `compile(input)` (`src/tools/unified/OmniFocusReadTool.ts`)
5. `QueryCompiler.compile()` normalizes filters via `normalizeFilter()` and returns `CompiledQuery` (`src/tools/unified/compilers/QueryCompiler.ts`)
6. Read tool checks cache (`CacheManager.get(category, key)`) — cache miss for tasks, possible hit for projects/tags
7. AST builder converts `TaskFilter` → `FilterAST` (`src/contracts/ast/builder.ts`)
8. OmniJS emitter converts `FilterAST` → JavaScript predicate string (`src/contracts/ast/emitters/omnijs.ts`)
9. `script-builder` assembles complete script string with helpers injected (`src/contracts/ast/script-builder.ts`)
10. `BaseTool.execJson()` calls `OmniAutomation.executeJson(script)` (`src/tools/base.ts:582`)
11. `OmniAutomation.executeInternal()` spawns `osascript -l JavaScript`, writes script to stdin (`src/omnifocus/OmniAutomation.ts:136`)
12. Script executes in JXA context; bridge ops (`app.evaluateJavascript()`) run inner OmniJS if needed
13. stdout JSON parsed, validated against `JxaEnvelopeSchema` (`src/utils/safe-io.ts`)
14. `ScriptResult<T>` returned up the stack; response formatted as `StandardResponseV2` (`src/utils/response-format.ts`)
15. `{ content: [{ type: 'text', text: JSON.stringify(result) }] }` returned to MCP client

### Mutation Request Path

1. `omnifocus_write` call arrives; `MutationCompiler.compile()` converts `WriteInput` → `CompiledMutation`
2. `mutation-script-builder` generates JXA script; sandbox guard validates test-mode constraints (`src/contracts/ast/mutation-script-builder.ts`)
3. For tag assignments: OmniJS bridge script is embedded via `app.evaluateJavascript()` using `tag-mutation-script-builder.ts`
4. `OmniAutomation.execute()` spawns osascript; result parsed and returned as `StandardResponseV2`

### Cache Warm Path (startup)

1. `CacheWarmer.warmCache()` called before transport connects (`src/index.ts:129`)
2. Executes dedicated warm scripts: `WARM_TASK_CACHES_SCRIPT`, `WARM_PROJECTS_CACHE_SCRIPT`
3. Results stored via `CacheManager.set(category, key, data)` with TTL and SHA-256 checksum
4. Subsequent requests for projects/tags/perspectives serve from cache until TTL expiry

**State Management:**
- No persistent in-process state beyond the TTL cache (which is warm at startup and refreshed by expiry)
- Pending operations tracked in a `Set<Promise<unknown>>` at the server level to prevent premature exit
- Circuit breaker state (`src/utils/circuit-breaker.ts`) is per-`BaseTool` instance; resets on success

## Key Abstractions

**`ScriptResult<T>` (discriminated union):**
- Purpose: Type-safe success/error envelope for all OmniAutomation results
- Examples: `src/omnifocus/script-result-types.ts`
- Pattern: `{ success: true; data: T }` | `{ success: false; error: string; context?: string }`

**`StandardResponseV2`:**
- Purpose: Uniform MCP response envelope for all tool results
- Examples: `src/utils/response-format.ts`
- Pattern: `createListResponseV2()`, `createErrorResponseV2()`, `createSuccessResponseV2()`

**`FilterAST` (typed tree):**
- Purpose: Intermediate representation between `TaskFilter` and script-embedded predicates
- Examples: `src/contracts/ast/types.ts`
- Pattern: `AndNode | OrNode | NotNode | ComparisonNode | ExistsNode | LiteralNode`

**`CompiledQuery`:**
- Purpose: Strongly-typed intermediate between raw tool input and script builder calls
- Examples: `src/tools/unified/compilers/QueryCompiler.ts`
- Pattern: `{ type, mode, filters, fields, sort, limit, countOnly, ... }`

**`BaseTool<TSchema, TResponse>`:**
- Purpose: Abstract base providing validation, metrics, circuit breaker, error taxonomy, logging, withCorrelation()
- Examples: `src/tools/base.ts`
- Pattern: Subclasses implement `name`, `description`, `schema`, `inputSchema`, `executeValidated()`

## Entry Points

**stdio server (primary):**
- Location: `src/index.ts` → `runServer()` → `runStdioServer()`
- Triggers: `node dist/index.js` (no flags), Claude Desktop subprocess
- Responsibilities: Sandbox guard, cache warm, permissions check, tool + prompt registration, graceful exit on stdin close

**HTTP server (secondary):**
- Location: `src/index.ts` → `runServer()` → `runHttpServer()`
- Triggers: `node dist/index.js --http [--port N] [--host H] [--auth-token T]`
- Responsibilities: Same warm/permissions sequence, then `HttpServerManager` + `SessionManager`; each session gets its own `Server` instance

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop. All OmniFocus access is serialized through child-process spawns — no concurrent `osascript` processes during cache warming (warming completes before transport connects)
- **Global state:** `globalPendingOperations` (module-level `Set`) in `src/omnifocus/OmniAutomation.ts`; set once at startup via `setPendingOperationsTracker()`. `cachedSandboxFolderId` (module-level `string | null`) in `src/contracts/ast/mutation-script-builder.ts`
- **Script size limits:** JXA direct: 523KB empirical limit (75% safety margin used). OmniJS bridge: 261KB. Scripts are size-checked before spawn
- **macOS only:** `osascript` is macOS-specific. CI/Linux skips cache warming and integration tests
- **Dual schema invariant:** Every tool class must override `get inputSchema()` with a hand-crafted JSON Schema. `BaseTool.inputSchema` throws if not overridden. When the Zod schema changes, the `inputSchema` override MUST be updated in the same commit

## Anti-Patterns

### String-concatenating user input into scripts

**What happens:** Embedding user-provided values directly: `` `task.name = "${userInput}"` ``
**Why it's wrong:** JXA injection attack; arbitrary code runs in OmniFocus context
**Do this instead:** Use `formatBridgeScript(template, params)` with `$PLACEHOLDER$` tokens, or use `escapeTemplateString()` from `src/contracts/ast/bridge-escape.ts`

### Calling `whose()` or `where()` in JXA

**What happens:** `app.defaultDocument().flattenedTasks.whose({ completed: false })()`
**Why it's wrong:** 25+ second execution time on databases with 1000+ tasks; effectively unusable
**Do this instead:** Direct iteration with early-exit conditions using the AST-generated predicate

### Using `task.name` (property access) inside JXA outer context

**What happens:** Returning `undefined` or a function object instead of the task name
**Why it's wrong:** JXA requires method-call syntax: `task.name()`. Property access works only inside `app.evaluateJavascript()` (OmniJS inner context)
**Do this instead:** Use `task.name()` in JXA outer scripts; use `task.name` in OmniJS bridge scripts

### Skipping `getUnifiedHelpers()` in new JXA scripts

**What happens:** Scripts that omit helper injection and re-implement `safeGet`, `safeGetDate`, etc.
**Why it's wrong:** Divergent error-handling behavior; helpers contain battle-tested edge-case fixes
**Do this instead:** Always start script bodies with `${getUnifiedHelpers()}` from `src/omnifocus/scripts/shared/helpers.ts`

### Modifying only the Zod schema without updating `inputSchema`

**What happens:** New field added to Zod schema but not the hand-crafted `inputSchema` override
**Why it's wrong:** MCP clients (Claude Desktop) never learn about the new field; it remains invisible to LLM tool-selection
**Do this instead:** Update both schemas in the same change. The `inputSchema` getter is in each tool file (e.g., `src/tools/unified/OmniFocusReadTool.ts`)

## Error Handling

**Strategy:** Categorized error taxonomy with per-severity responses; circuit breaker for OmniFocus connectivity

**Patterns:**
- All tool errors are caught in `BaseTool.execute()` → `handleExecuteError()` and returned as `StandardResponseV2` (never thrown to MCP transport) except `McpError` which propagates
- `ZodError` → `McpError(InvalidParams)` with validation details; never crashes server
- OmniAutomation failures → `ScriptResult { success: false }` → `handleErrorV2()` → categorized response
- Circuit breaker (`src/utils/circuit-breaker.ts`): opens after 3 consecutive OmniFocus connectivity failures; auto-resets after 30s
- Failure log written to `~/.omnifocus-mcp/tool-failures/failures-YYYY-MM-DD.jsonl` (suppressed in test mode)
- `uncaughtException` and `unhandledRejection` handlers at process level log and continue; server does not exit

## Cross-Cutting Concerns

**Logging:** Structured JSON via `createLogger(name)` from `src/utils/logger.ts`; correlation IDs propagated through `withCorrelation()` on tool instances; log level controlled by `LOG_LEVEL` env var

**Validation:** Zod schemas are authoritative for server-side validation. Input normalization (`src/tools/normalization/normalize-input.ts`) provides bounded repair for malformed envelopes from local 7-8B models before re-validating against the strict Zod schema

**Authentication:** HTTP mode supports optional Bearer token (`--auth-token`) checked in `HttpServerManager`. Stdio mode has no auth (process isolation via macOS subprocess)

**Sandbox guard:** Mutations in test mode (`NODE_ENV=test` + `SANDBOX_GUARD_ENABLED=true`) are validated to target only the `__MCP_TEST_SANDBOX__` folder. Hard-checked at startup via `assertSandboxGuardAtStartup()` in `src/utils/sandbox-guard.ts`

---

*Architecture analysis: 2026-06-03*
