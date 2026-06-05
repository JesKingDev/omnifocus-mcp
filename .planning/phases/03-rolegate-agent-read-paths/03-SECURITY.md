---
phase: 03
slug: rolegate-agent-read-paths
status: secured
threats_total: 13
threats_closed: 13
threats_open: 0
asvs_level: 1
block_on: high
created: 2026-06-05
---

# Phase 03 — RoleGate & Agent Read Paths — Security Audit

**Audited:** 2026-06-05 **ASVS Level:** 1 **Disposition for all 13 threats:** mitigate **Result:** SECURED — 13/13
mitigations verified present in implementation

This audit verifies that each declared mitigation in the plan-time threat register is actually present in the
implemented code (register_authored_at_plan_time: true). It does not scan for net-new vulnerabilities.

## Threat Verification

| Threat ID              | Category               | Status | Evidence                                                                                                                                                                                                                                                                         |
| ---------------------- | ---------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-3-drift-enum         | Elevation of Privilege | CLOSED | `allowedOperations()` is a forward read over `AGENT_POLICY` (`src/auth/operation-policy.ts:114-136`), not an inverse of `decide()` (D-04). Parity test asserts every advertised AGENT op resolves `decide() !== 'deny'` (`tests/unit/auth/operation-policy.test.ts:294-302`).    |
| T-3-norm-mismatch      | Elevation of Privilege | CLOSED | Shared `normalizeArgsToPolicy()` at raw-args level (`src/auth/operation-policy.ts:151-172`); dispatch gate calls it (`src/tools/index.ts:111`) and the Write funnel calls the same helper (`src/tools/unified/OmniFocusWriteTool.ts:401`) — identical `(op,target)` feed (D-11). |
| T-3-gate-deny-op       | Elevation of Privilege | CLOSED | `allowedOperations` includes gate outcomes in advertised set (`operation-policy.ts:121-132`, D-05). Test asserts `tag_manage/delete → gate` present (`operation-policy.test.ts:49-53`) and tagManageActions iterated (`:301`).                                                   |
| T-3-drift              | Elevation of Privilege | CLOSED | ListTools trims from `allowedOperations(role)` (`src/tools/index.ts:59`); CallTool gate enforces via `decide()` (`src/tools/index.ts:113`) — both consume the same table (D-03). Parity test enforces no gap (`operation-policy.test.ts:294-324`).                               |
| T-3-session            | Elevation of Privilege | CLOSED | Role threaded as closure-captured `registerTools(...role)` param (`src/tools/index.ts:38-44`); handler reads closure `role`, never calls `parseRole()` (only reference is a comment at `index.ts:108`). D-10 satisfied.                                                          |
| T-3-mangle             | Tampering              | CLOSED | Gate returns structured `createErrorResponseV2` payload, never throws (`src/tools/index.ts:116-141`); test asserts `error.code === 'POLICY_DENY_DELETE'` not InternalError (`tests/unit/tools/index-rolegate.test.ts:145,163`). D-09.                                            |
| T-3-noenvelope         | Tampering              | CLOSED | Gate wraps payload in `{ content: [{ type: 'text', text: JSON.stringify(...) }] }` (`src/tools/index.ts:141`); test asserts `response.content` array present (`index-rolegate.test.ts:142-144`).                                                                                 |
| T-3-seam               | Elevation of Privilege | CLOSED | Both call sites pass role+context: stdio `src/index.ts:183` and HTTP `src/session-manager.ts:127`. No hardcoded AGENT — session role resolved via `parseRole()`/`resolveStdioIdentity()` (`session-manager.ts:48-51`). TS signature shared.                                      |
| T-3-leak               | Information Disclosure | CLOSED | AGENT whoami builds payload WITHOUT `identity` key — structural absence (`src/tools/system/SystemTool.ts:659-665`, D-13). Test asserts `data.identity === undefined` (`SystemTool-whoami.test.ts:65`). `principal`/`tokenId` in SENSITIVE_KEYS (`src/utils/logger.ts:51-52`).    |
| T-3-dual-schema        | Tampering              | CLOSED | Zod enum and inputSchema both include `whoami` (`SystemTool.ts:26,144`); test asserts both (`SystemTool-whoami.test.ts:134-141`). D-15.                                                                                                                                          |
| T-3-rolesource-invalid | Tampering              | CLOSED | `RoleSource` type is the 3-value enum, `launchd-label` explicitly absent (`src/contracts/roles.ts:52`); whoami defaults to `'fail-safe-default'` (`SystemTool.ts:657`). D-14.                                                                                                    |
| T-3-read-passthrough   | Elevation of Privilege | CLOSED | `normalizeArgsToPolicy` returns `[]` for args with no mutation field (`operation-policy.ts:153`); READ-01/02/03 tests assert read modes never fire the gate (`index-rolegate.test.ts:226-294`).                                                                                  |
| T-3-integ-regression   | Elevation of Privilege | CLOSED | OWNER spawn asserts delete/bulk_delete present in enum (`tests/integration/mcp-protocol.test.ts:255`); AGENT spawn asserts both absent (`mcp-protocol.test.ts:217-236`). Both required.                                                                                          |

## Code Review Cross-Reference (03-REVIEW.md)

The review found 0 critical / 0 authorization-bypass findings. The 3 warnings were assessed against the threat register:

- **WR-01 / WR-02 (advertise⟺enforce parity defect):** The advertised `operation`/`action` enums include
  forward-declared/inert entries (`drop`, `perspective_delete`) that the Zod schema rejects. This is an
  advertise-vs-validate inconsistency, NOT an authorization weakening. Both phantom entries are non-destructive
  (`drop → allow` maps to an `update`; `perspective_delete → gate` has no executable write op). The server-side gate and
  Zod validation both still fail-close. **No threat in the register is reopened** — T-3-drift / T-3-drift-enum concern
  advertise-vs-_enforce_ drift (advertised op resolving to a real deny), and no advertised op resolves to deny. The
  phantom-op leak is a usability/spec-hygiene gap. Logged below as an informational follow-up, not a BLOCKER under
  `block_on: high`.
- **WR-03 (`normalizeArgsToPolicy` throws on malformed non-array `operations`):** Confirmed at
  `src/auth/operation-policy.ts:159` — the `?? []` guards only null/undefined, so a non-array `operations` payload
  throws a TypeError that the SDK coerces to `McpError InternalError`. The gate fails **open-to-error, not
  open-to-execute** — no operation reaches `tool.execute()`. T-3-mangle (POLICY*DENY payload integrity) is about
  \_denied* ops producing the correct structured code; a malformed batch is a robustness/DoS-shaped gap, not an
  authorization bypass. Not a BLOCKER. Logged below.

## Unregistered Flags

None. No net-new attack surface beyond the registered threats; WR-01/02/03 map to existing concerns
(advertise-vs-enforce hygiene, normalization robustness) and are tracked as informational follow-ups below.

## Informational Follow-Ups (non-blocking)

These do not reopen any registered threat and do not block the phase under `block_on: high`. Both were resolved in a
post-audit hardening pass:

1. **Advertised-enum vs Zod-literal parity (WR-01/WR-02).** ✅ RESOLVED (commit `16e3b8d`). `getRoleAwareSchema` now
   intersects the role-allowed set with the base inputSchema enum, so the advertised `operation`/`action` enums never
   include the phantom `drop` / `perspective_delete` entries. A regression test asserts the advertised enum is a subset
   of the base Zod enum.
2. **Defensive type-check in `normalizeArgsToPolicy` (WR-03).** ✅ RESOLVED (commit `fb67fd3`). `mutation['operations']`
   is now guarded with `Array.isArray(...)` (malformed batch emits a single deny-forcing item), and non-string
   sub-`operation`/`target` are coerced so they fail-close through `decide()` to `deny` rather than throwing
   InternalError. Malformed-batch regression tests added.

## Verdict

All 13 declared mitigations are present and guarded by tests. No authorization bypass. Phase 03 is **SECURED** for ship
under ASVS L1 / `block_on: high`.
