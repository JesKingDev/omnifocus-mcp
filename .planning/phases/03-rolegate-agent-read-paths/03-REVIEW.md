---
phase: 03-rolegate-agent-read-paths
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/auth/operation-policy.ts
  - src/index.ts
  - src/session-manager.ts
  - src/tools/index.ts
  - src/tools/system/SystemTool.ts
  - src/tools/unified/OmniFocusWriteTool.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-06-05 **Depth:** standard **Files Reviewed:** 6 **Status:** issues_found

## Summary

This is a security-critical authorization phase. The core authorization machinery is **sound**: the dispatch gate
(`src/tools/index.ts` lines 106-144) is universal with no `if (name === 'omnifocus_write')` special-case (D-08
satisfied), reads the closure-captured `role` rather than re-calling `parseRole()` (D-10 satisfied), and returns a
structured `createErrorResponseV2` payload wrapped in the MCP content envelope rather than throwing `McpError` (D-09 /
Pitfall 2 satisfied). Fail-safe defaults hold: `registerTools(role = 'agent')`, `normalizeArgsToPolicy` fail-closes
unknown shapes to `'deny'` via the empty-string target, and `getWhoami` defaults `role` to `'agent'` when `_context` is
absent. The `normalizeArgsToPolicy` helper flattens single / batch / `bulk_delete` / `tag_manage` shapes, and I traced
the batch sub-operation set (create/update/complete/delete only — no nested batch/bulk_delete/tag_manage) to confirm no
gate-bypass through nesting. The `whoami` AGENT path structurally omits `identity`/`principal` (D-13/D-15). The
`withCorrelation` override in `SystemTool` correctly threads both `_context` and `correlationId`, and I verified the
other three tools all use the standard `constructor(cache)` signature, so none of them break under the base
`withCorrelation`.

**No Critical (authorization-bypass) findings.** The agent cannot reach a denied or gated operation through ListTools
advertisement or the CallTool gate. The issues found are an **advertise⟺enforce parity defect** (phantom
operations/actions leak into the advertised enum that the Zod schema rejects), a normalization fragility, and minor
quality items.

## Structural Findings (fallow)

No `<structural_findings>` block was provided with this review. No cross-module structural substrate to reconcile.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Advertised AGENT/OWNER `operation` enum includes phantom `drop` op the Zod schema rejects

**File:** `src/auth/operation-policy.ts:114-136` (consumed at `src/tools/index.ts:59`,
`src/tools/unified/OmniFocusWriteTool.ts:320-360`)

**Issue:** `allowedOperations(role)` enumerates the keys of `AGENT_POLICY`, which contains `drop: 'allow'`
(operation-policy.ts:48) as a deliberately forward-declared/inert entry. There is **no `drop` literal in the write Zod
schema** — the `MutationSchema` discriminated union only accepts
`create, create_folder, update, complete, delete, batch, bulk_delete, tag_manage` (confirmed in `write-schema.ts`).
Because `getRoleAwareSchema` trims the advertised `operation` enum to `allowedOps` (the `allowedOperations` result),
**both the AGENT and OWNER advertised schemas advertise `drop`** — an operation a client can never validly call, since
server-side Zod validation rejects it. This is precisely the advertise⟺enforce mismatch D-06 is meant to forbid ("shown
but denied is a finding"). The existing D-06 parity test (`tests/unit/auth/operation-policy.test.ts:294-324`) only
checks `allowedOperations ⟺ decide()`; it never checks the advertised enum against the Zod literals, so this leak passes
CI green.

**Fix:** Constrain the enumerator to operations that have a real schema literal, or filter the advertised enum in
`getRoleAwareSchema` against the base enum. Minimal approach — intersect with the base advertised operation enum in
`getRoleAwareSchema`:

```typescript
// src/tools/unified/OmniFocusWriteTool.ts getRoleAwareSchema, before assigning the enum
const baseOpEnum = (base.properties.mutation.properties['operation'] as { enum: string[] }).enum;
const trimmedOps = allowedOps.filter((op) => baseOpEnum.includes(op));
mutationProps['operation'] = { type: 'string', enum: trimmedOps };
```

And extend the D-06 parity test to assert every advertised op/action is a valid Zod literal.

### WR-02: Advertised `tag_manage.action` enum includes phantom `perspective_delete` action

**File:** `src/auth/operation-policy.ts:124-134` (consumed at `src/tools/unified/OmniFocusWriteTool.ts:344-349`)

**Issue:** Same defect class as WR-01 for the tag-action subtable. `AGENT_POLICY.tag_manage` contains
`perspective_delete: 'gate'` (operation-policy.ts:64) as a forward-declared/inert entry. `allowedOperations` pushes
every non-deny target into `tagManageActions`, so `perspective_delete` is included. `getRoleAwareSchema`
(OmniFocusWriteTool.ts:344-349) trims the advertised `action` enum to `allowedTagActions`, advertising
`perspective_delete`. The Zod `TagActionSchema` (write-schema.ts:251-259) has **no `perspective_delete` literal** —
`create, rename, delete, merge, nest, unnest, reparent` only. The agent (and owner) is advertised a tag action the
server rejects. Note the dispatch gate would also resolve `decide('agent','tag_manage','perspective_delete')` to
`'gate'`, so a client that tried it would get a `POLICY_GATE_REQUIRES_OWNER` response rather than a clean schema error —
confusing, and another advertise⟺enforce inconsistency.

**Fix:** Filter `tagManageActions` against the base `action` enum in `getRoleAwareSchema`, mirroring the WR-01 fix, and
add the action-level assertion to the D-06 parity test. Alternatively, exclude forward-declared/inert entries from
`allowedOperations` until their Zod literal exists, but the parity test must then guard against re-introduction.

### WR-03: `normalizeArgsToPolicy` trusts unvalidated raw `args` shapes — non-array `operations` throws

**File:** `src/auth/operation-policy.ts:151-172`

**Issue:** The dispatch gate calls `normalizeArgsToPolicy` on **raw, pre-Zod MCP `args`** (index.ts:111). For a `batch`
mutation the helper does `(mutation['operations'] as Array<Record<string, unknown>>) ?? []` then `.map(...)`. The
`?? []` only guards `null`/`undefined`. If a malicious or malformed AGENT request sends
`{ mutation: { operation: 'batch', operations: "x" } }` (a string, or a number, or an object), the cast is a lie and
`.map` throws a `TypeError`. That exception propagates out of the `CallToolRequestSchema` handler (the gate block is not
wrapped in try/catch — only the later `executionPromise` is), where the SDK coerces it to `McpError InternalError`. The
gate fails **open-to-error**, not open-to-execute, so it is not an authorization bypass — but a denied/garbage payload
produces an opaque `InternalError` instead of the intended structured policy response, and it is a robustness gap on the
most security-sensitive path.

**Fix:** Defensively check the type before mapping:

```typescript
if (op === 'batch') {
  const raw = mutation['operations'];
  const operations = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  return operations.map((sub) => ({
    operation: typeof sub?.['operation'] === 'string' ? (sub['operation'] as string) : '',
    target: (sub?.['target'] as string | undefined) ?? 'task',
  }));
}
```

An empty/garbage `operation: ''` then fail-closes through `decide()` to `'deny'`, which is the correct posture. Also
guard `sub` being non-object inside `.map`.

## Info

### IN-01: `whoami` response omits timer metadata that every other system op includes

**File:** `src/tools/system/SystemTool.ts:655-684`

**Issue:** `getWhoami` calls `createSuccessResponseV2(..., { operation: 'whoami' })` with no
`OperationTimerV2().toMetadata()`, unlike `version`/`diagnostics`/`metrics`/`cache` which all spread timer metadata.
`createSuccessResponseV2` fills `timestamp`/`from_cache`/`optimization` defaults so this does not crash, but the
response is inconsistent (no `execution_time`/`query_time_ms`). Low impact since `whoami` is trivially fast.

**Fix:** Add `const timer = new OperationTimerV2();` and spread `...timer.toMetadata()` into both the AGENT and OWNER
metadata objects for parity with sibling ops.

### IN-02: `getRoleAwareSchema` ignores its `role` parameter (`void role`)

**File:** `src/tools/unified/OmniFocusWriteTool.ts:320-322`

**Issue:** The method takes `role: Role` but immediately does `void role;` — the trimming is driven entirely by the
pre-computed `allowedOps`/`allowedTagActions` arrays. The parameter is dead. This is intentional per the comment, but a
dead parameter invites future callers to pass an inconsistent `role` that silently has no effect (e.g.
`getRoleAwareSchema('owner', agentOps, agentTagActions)` would emit an agent-trimmed schema labeled owner). Mild
footgun.

**Fix:** Either drop the `role` parameter from the signature (and the `index.ts:64` type) since the enums are
authoritative, or add a debug assertion that the passed enums match `allowedOperations(role)`.

### IN-03: Comment in `OmniFocusWriteTool` claims normalization equivalence that the phantom-op leak partially undermines

**File:** `src/tools/unified/OmniFocusWriteTool.ts:397-401`

**Issue:** The funnel comment asserts `normalizeArgsToPolicy` is "equivalent to the inline compiled-mutation path
because the compiler's operation discriminator mirrors args.mutation.operation exactly." This is true for the
_enforcement_ path (both feed `decide()`), but the advertise-side enumerator (WR-01/WR-02) breaks the broader "one
table, no drift" promise the comment leans on. Worth a note so the next reader does not treat the parity claim as fully
closed once WR-01/WR-02 are fixed.

**Fix:** No code change required; tighten the comment to scope the equivalence claim to the enforcement path, and
reference the advertised-enum parity test once WR-01/WR-02 land.

---

_Reviewed: 2026-06-05_ _Reviewer: Claude (gsd-code-reviewer)_ _Depth: standard_
