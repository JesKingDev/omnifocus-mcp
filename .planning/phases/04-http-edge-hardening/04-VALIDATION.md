---
phase: 4
slug: http-edge-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-05
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                       |
| ---------------------- | ------------------------------------------- |
| **Framework**          | Vitest (already installed)                  |
| **Config file**        | `vitest.config.ts` at project root          |
| **Quick run command**  | `npm run test:unit`                         |
| **Full suite command** | `npm test`                                  |
| **Estimated runtime**  | ~quick: seconds; full: run it (counts vary) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** quick unit run (seconds)

---

## Per-Task Verification Map

> Requirement → behavior map seeded from research. Task IDs filled by the planner per plan/wave; each task below maps to
> one or more of these rows.

| Requirement | Wave | Behavior                                                               | Threat Ref | Secure Behavior                                  | Test Type | Automated Command                                             | File Exists    | Status     |
| ----------- | ---- | ---------------------------------------------------------------------- | ---------- | ------------------------------------------------ | --------- | ------------------------------------------------------------- | -------------- | ---------- |
| HTTP-01     | 1    | `validateTokenSet` rejects missing token                               | —          | Unauthenticated request rejected before dispatch | unit      | `npm run test:unit -- tests/unit/auth/token-registry.test.ts` | ❌ W0          | ⬜ pending |
| HTTP-01     | 1    | `validateTokenSet` rejects wrong token                                 | —          | Invalid bearer → 401                             | unit      | same                                                          | ❌ W0          | ⬜ pending |
| HTTP-01     | 1    | matches agent token → agent role                                       | —          | Agent token resolves agent role                  | unit      | same                                                          | ❌ W0          | ⬜ pending |
| HTTP-01     | 1    | matches owner token → owner role                                       | —          | Owner token resolves owner role                  | unit      | same                                                          | ❌ W0          | ⬜ pending |
| HTTP-01     | 1    | Constant-time: accumulates across ALL tokens, no early exit (D-04)     | —          | No timing leak of which/whether token matched    | unit      | same                                                          | ❌ W0          | ⬜ pending |
| HTTP-01     | 1    | Length-mismatched tokens do not throw (SHA-256 hash)                   | —          | timingSafeEqual never throws on length           | unit      | same                                                          | ❌ W0          | ⬜ pending |
| HTTP-02     | 1    | `validateCLIConfig` throws on non-loopback host in HTTP mode           | —          | Fail-closed: refuses to bind open interface      | unit      | `npm run test:unit -- tests/unit/utils/cli.test.ts`           | ⚠️ check       | ⬜ pending |
| HTTP-02     | 1    | `validateCLIConfig` passes on `127.0.0.1`                              | —          | Loopback bind allowed                            | unit      | same                                                          | ⚠️ check       | ⬜ pending |
| HTTP-03     | 1    | `validateHostOrigin` rejects unknown Host                              | —          | DNS-rebinding refused                            | unit      | `npm run test:unit -- tests/unit/http-server.test.ts`         | ❌ W0          | ⬜ pending |
| HTTP-03     | 1    | `validateHostOrigin` allows loopback hosts                             | —          | Localhost reach permitted                        | unit      | same                                                          | ❌ W0          | ⬜ pending |
| HTTP-03     | 1    | `validateHostOrigin` allows configured tailnet host                    | —          | Tailscale Serve host permitted via allowlist     | unit      | same                                                          | ❌ W0          | ⬜ pending |
| HTTP-04     | 1    | Startup asserts auth mandatory; no unauthenticated HTTP mode           | —          | Bearer required even on the tailnet              | unit      | `npm run test:unit -- tests/unit/utils/cli.test.ts`           | ⚠️ check       | ⬜ pending |
| HTTP-05     | 1    | `resolveHttpIdentity` returns `roleSource: 'http-token'` (agent entry) | —          | Per-token role, agent                            | unit      | `npm run test:unit -- tests/unit/auth/role-resolver.test.ts`  | ⚠️ stub-update | ⬜ pending |
| HTTP-05     | 1    | `resolveHttpIdentity` returns `roleSource: 'http-token'` (owner entry) | —          | Per-token role, owner                            | unit      | same                                                          | ❌ W0          | ⬜ pending |
| HTTP-05     | 1    | `buildTokenRegistry` with `MCP_AUTH_TOKEN` alias maps to agent role    | —          | Backward-compat alias (D-11)                     | unit      | `npm run test:unit -- tests/unit/auth/token-registry.test.ts` | ❌ W0          | ⬜ pending |
| HTTP-05     | 1    | Distinct-token startup assertion fires when agent == owner             | —          | Fail-closed on token collision                   | unit      | `npm run test:unit -- tests/unit/utils/cli.test.ts`           | ❌ W0          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `tests/unit/auth/token-registry.test.ts` — HTTP-01 constant-time compare, registry construction, D-04/D-05,
      `MCP_AUTH_TOKEN` alias (HTTP-05)
- [ ] `tests/unit/http-server.test.ts` — HTTP-03 Host/Origin middleware (extend if file already exists)
- [ ] Update `tests/unit/auth/role-resolver.test.ts` — the existing "Phase 4 stub contract" test asserts the
      zero-argument `resolveHttpIdentity()`; rewrite for `resolveHttpIdentity(entry: TokenEntry)`
- [ ] Verify `tests/unit/utils/cli.test.ts` exists and covers `validateCLIConfig`; add as a Wave 0 gap if missing
      (HTTP-02, HTTP-04, distinct-token assertion)

---

## Manual-Only Verifications

| Behavior                                                                            | Requirement | Why Manual                                                                                     | Test Instructions                                                                                                                                                          |
| ----------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote reach works via `tailscale serve` only (not `funnel`)                        | HTTP-04     | Requires a live tailnet + Tailscale CLI; runtime funnel-detection guard is deferred to Phase 6 | Operator: expose via `tailscale serve`, confirm reachable with a valid bearer from another tailnet node; confirm `tailscale funnel` is not used. Document in human-verify. |
| End-to-end owner-token over HTTP gets full surface incl. destructive deletes (D-03) | HTTP-05     | Live MCP round-trip over the HTTP transport                                                    | Smoke test: owner bearer → ListTools shows full surface; agent bearer → restricted surface; both produce the same allow/deny outcomes as matching stdio role               |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < quick-unit-run seconds
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
