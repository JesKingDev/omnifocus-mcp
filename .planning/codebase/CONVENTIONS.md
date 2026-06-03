# Coding Conventions

**Analysis Date:** 2026-06-03

## Naming Patterns

**Files:**
- kebab-case for all source files: `cache-manager.ts`, `error-taxonomy.ts`, `normalize-input.ts`
- PascalCase only for class-centric modules: `OmniFocusReadTool.ts`, `CacheManager.ts`, `BaseTool.ts`
- Test files mirror source path with `.test.ts` suffix: `src/tools/unified/OmniFocusReadTool.ts` → `tests/unit/tools/unified/OmniFocusReadTool.test.ts`
- Schema files named `*-schema.ts` or `*-schemas.ts`: `read-schema.ts`, `write-schema.ts`, `analyze-schema.ts`
- Script builder files named `*-script-builder.ts` or `script-builder.ts`

**Functions:**
- camelCase for functions and methods: `buildAST`, `parseWithNormalization`, `createScriptSuccess`
- Factory/constructor helpers prefixed with `create`: `createMockCache`, `createErrorResponseV2`, `createScriptSuccess`
- Boolean predicates prefixed with `is` or `has`: `isScriptSuccess`, `isScriptError`, `isLegacyScriptError`, `isValidDateValue`
- Builder functions prefixed with `build`: `buildAST`, `buildListTasksScriptV4`, `buildFilteredTasksScript`
- Response format helpers follow `create*ResponseV2` pattern: `createSuccessResponseV2`, `createTaskResponseV2`, `createListResponseV2`, `createErrorResponseV2`, `createAnalyticsResponseV2`

**Variables:**
- camelCase: `execJsonSpy`, `mockCache`, `sandboxManager`
- Constants in SCREAMING_SNAKE_CASE: `SANDBOX_FOLDER_NAME`, `TEST_TAG_PREFIX`, `NOTE_TRUNCATE_LENGTH`, `DEFAULT_FIELDS`
- Underscore prefix for intentionally unused variables (ESLint rule): `_script`, `_schema`

**Types and Interfaces:**
- PascalCase for interfaces and types: `ScriptResult`, `CategorizedScriptError`, `MCPResponse`, `MockTask`
- Discriminated union members use `success: true | false` flag
- Zod schemas named with `Schema` suffix: `ReadSchema`, `WriteSchema`, `TaskFilterSchema`
- Zod inferred types extracted with `z.infer<typeof FooSchema>` aliased as `FooInput`
- Enums use PascalCase enum name and SCREAMING_SNAKE_CASE members: `ScriptErrorType.PERMISSION_DENIED`

**Metadata keys:**
- Response metadata objects MUST use `snake_case` keys — enforced by the custom ESLint rule `metadata-snake-case` in `eslint-rules/index.js`. Violations are caught at lint time.
- Data objects (not metadata) may use camelCase keys.

## Code Style

**Formatting:**
- Prettier 3.x via `.prettierrc.json`
- Single quotes, semicolons, trailing commas (all), 120-char print width, 2-space indent, LF line endings, `arrowParens: always`

**Linting:**
- ESLint 9 with `@typescript-eslint/recommended` + `recommended-requiring-type-checking`
- Key enforced rules:
  - `@typescript-eslint/no-explicit-any`: error (no `any` in source)
  - `@typescript-eslint/consistent-type-imports`: error (use `import type` for type-only imports)
  - `@typescript-eslint/consistent-type-exports`: error
  - `@typescript-eslint/no-floating-promises`: error
  - `@typescript-eslint/no-misused-promises`: error
  - `@typescript-eslint/require-await`: error
  - `no-console` warns on `console.log` but allows `warn`, `error`, `info`, `debug`
  - `no-trailing-spaces`, `eol-last`, `max-len: 120` (warn)
  - Test files relax `no-unused-vars` and `no-non-null-assertion`
- Custom ESLint plugin at `eslint-rules/index.js` with project-specific rules: `metadata-snake-case`, `use-standard-response`, `monitored-identifiers-live`
- Pre-commit (husky): runs `lint-staged` on staged files only (fast path)
- Pre-push: runs `typecheck` + `lint` + `test:unit`
- CI threshold: lint errors must stay ≤ 50 (post-cleanup target)

**TypeScript:**
- Strict mode: `strict: true`, `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `useUnknownInCatchVariables`
- Target ES2022, module `NodeNext`, `moduleResolution: NodeNext`
- **Hard rule: TypeScript only — never create `.js` files in `src/`**
- All imports use explicit `.js` extension in specifiers (ESM/NodeNext requirement): `import { Foo } from './foo.js'`
- `import type` is required for type-only imports (ESLint enforces this)

## Import Organization

**Order:**
1. Node built-ins: `import { join } from 'path'`, `import { tmpdir } from 'node:os'`
2. Third-party packages: `import { z } from 'zod'`, `import { McpError } from '@modelcontextprotocol/sdk/types.js'`
3. Internal source imports (relative or `src/*` alias)

**Path conventions:**
- Relative imports within `src/` use relative paths with `.js` extension
- The `src/*` path alias is available in `tsconfig.json` but rarely used; relative paths dominate
- Tests import from `src/` using relative `../../../src/` paths, not path aliases

**Blank line after imports:**
- ESLint `padding-line-between-statements` rule requires a blank line after the last import group before the first non-import statement

## Dual-Schema Sync Requirement

Each unified tool class has **two schemas that must stay in sync**:
1. **Zod schema** in `src/tools/unified/schemas/` — server-side validation (full, recursive)
2. **`inputSchema` getter** in the tool class — hand-crafted JSON Schema advertised to MCP clients

`BaseTool.inputSchema` throws if a subclass does not override it. When changing a Zod schema (adding/removing/renaming fields, changing enums, adding operations), the `inputSchema` getter in the same tool file **must also be updated**.

Tool files:
- `src/tools/unified/OmniFocusReadTool.ts` — `get inputSchema()`
- `src/tools/unified/OmniFocusWriteTool.ts` — `get inputSchema()`
- `src/tools/unified/OmniFocusAnalyzeTool.ts` — `get inputSchema()`
- `src/tools/system/SystemTool.ts` — `get inputSchema()`

## Error Handling

**Patterns:**
- Errors in scripts are wrapped in `ScriptResult` discriminated union (`ScriptSuccess | ScriptError`) from `src/omnifocus/script-result-types.ts`. Use `isScriptSuccess()` / `isScriptError()` type guards — never check raw `.success` property directly.
- Higher-level errors use `CategorizedScriptError` from `src/utils/error-taxonomy.ts`, which includes `errorType: ScriptErrorType`, `actionable`, `recovery_suggestions`, and `related_documentation`.
- MCP protocol errors use `McpError` from `@modelcontextprotocol/sdk/types.js`.
- Back-compat parsing of older OmniJS response envelopes goes through `isLegacyScriptError` / `getLegacyErrorMessage` in `src/tools/base.ts` — do not spread this logic to call sites.
- `useUnknownInCatchVariables: true` is enforced — catch variables are `unknown`, not `Error`. Always narrow with type guards before accessing `.message`.
- Zod validation errors from `parseWithNormalization` preserve the original `ZodError` on failure (`result.error`); do not swallow them.

## Logging

**Framework:** Custom `createLogger(namespace)` from `src/utils/logger.ts`

**Patterns:**
- Obtain a logger via `createLogger('component-name')` at module level
- Log levels: `debug`, `info`, `warn`, `error`
- `console.log` is forbidden (ESLint warn); use the structured logger
- Logger automatically redacts sensitive keys (e.g., `name`, `note`) from arg objects at non-debug levels
- Log level controlled by `LOG_LEVEL` environment variable

## Comments

**When to comment:**
- Module-level JSDoc on non-obvious modules and exported functions
- Inline comments for non-obvious logic, workarounds, and OmniJS/JXA behavioral quirks
- Ticket references in comments when a block exists because of a specific bug: `// OMN-43: ...`, `// OMN-84: per-run sentinel tag...`
- No JSDoc on trivial getters/setters

**Pattern for OmniJS behavioral notes:**
- JXA vs OmniJS property access differences are documented inline with short comments: `// JXA: task.name() | OmniJS: task.name`

## Function Design

**Size:** Functions are kept focused; complex pipeline steps are split into named helpers (e.g., `augmentFilterForMode`, `parseTasks`, `sortTasks` in `src/tools/tasks/task-query-pipeline.ts`)

**Parameters:** Constructor injection for dependencies (`CacheManager` passed to tool constructors, not imported as singletons)

**Return Values:**
- All tool `execute()` methods return the `StandardResponseV2` shape (from `src/utils/response-format.ts`)
- Script execution returns `ScriptResult<T>` discriminated union
- Factory helpers return plain typed objects or `ScriptResult`

## Module Design

**Exports:** Named exports throughout — no default exports in `src/`

**Barrel files:** `src/tools/index.ts` registers tools; `src/utils/` modules export individual utilities. No deep barrel chains.

**Class pattern:**
- Abstract `BaseTool` in `src/tools/base.ts` provides `execute()` with validation, logging, metrics, and circuit-breaker; subclasses implement `executeValidated(args)`
- Subclasses override `get inputSchema()` to advertise MCP-visible schema (required, throws if missing)

---

*Convention analysis: 2026-06-03*
