# Security Audit — Phase 05: Write-Verifier

**Audited:** 2026-06-08 **Disposition:** SECURED **Threats closed:** 16/16 **ASVS level:** default **Threat register:**
authored at plan time (`register_authored_at_plan_time: true`) — verified, not re-scanned.

Implementation files are read-only. This audit confirms each declared mitigation is present in code; it does not
introduce new threats or patch implementation.

---

## Threat Verification

| Threat ID  | Category               | Disposition | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ---------------------- | ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-05-01-SC | Tampering              | accept      | CLOSED | No package.json / package-lock.json change across the entire phase (`git log 74bd029..HEAD -- package.json package-lock.json` empty). Pure TS stubs — accepted-risk justification holds.                                                                                                                                                                                           |
| T-05-02-01 | Tampering              | mitigate    | CLOSED | `field-comparator.ts` → `isKeyAbsent` uses `Object.prototype.hasOwnProperty.call(obj, key)`; `isAbsentOrUndefined` returns `'mismatch'` (hard fail) when intent has a non-null value but read-back key is absent/undefined. Applied across compareDateField, compareScalarField, compareTagField, compareTypedClassField, compareUnknownField.                                     |
| T-05-02-02 | Tampering              | mitigate    | CLOSED | `intent-extractor.ts` → `extractIntent` returns `{}` for unrecognized op (and on any throw). `WriteVerifier.verify` iterates `Object.keys(intentObj)` — zero keys → no mismatch path → marked `unverified` (no affected ids) rather than falsely `verified`.                                                                                                                       |
| T-05-02-03 | Information Disclosure | accept      | CLOSED | Error codes `WRITE_UNVERIFIED_MISMATCH` / `VERIFY_READBACK_FAILED` are non-sensitive internal op codes (`response-format.ts`). No PII/security context. Justification holds.                                                                                                                                                                                                       |
| T-05-03-01 | Tampering              | mitigate    | CLOSED | `read-schema.ts` → `ids: z.array(z.string()).min(1).max(200).optional()`. Bounded per D-16.                                                                                                                                                                                                                                                                                        |
| T-05-03-02 | Tampering              | mitigate    | CLOSED | `script-builder.ts` → `buildTasksByIdSetScript` uses `const idsJson = JSON.stringify(ids)` interpolated as a JSON literal (`const targetIds = ${idsJson}`). No raw string interpolation of ids.                                                                                                                                                                                    |
| T-05-03-03 | Information Disclosure | mitigate    | CLOSED | `WriteVerifier` calls injected `execJson` directly; constructor takes `(execJson, logger)`; no import of CacheManager or OmniFocusReadTool.                                                                                                                                                                                                                                        |
| T-05-04-01 | Tampering              | mitigate    | CLOSED | `WriteVerifier.verify` sets `'skipped'` only under `op['dryRun'] === true`. No other path assigns `'skipped'`. Unit test `D-11: dry-run produces verification_status: skipped` asserts `toBe('skipped')` + audit log.                                                                                                                                                              |
| T-05-04-02 | Elevation of Privilege | mitigate    | CLOSED | Owner guard (`role !== 'agent'`) sets `'unverified'`, never `'skipped'`. Unit tests assert `toBe('unverified')` AND `not.toBe('skipped')`, plus a separate test that owner path does not invoke `execJson`.                                                                                                                                                                        |
| T-05-04-03 | Information Disclosure | mitigate    | CLOSED | Same as T-05-03-03 — injected `execJson`, no cache layer.                                                                                                                                                                                                                                                                                                                          |
| T-05-04-04 | Tampering              | mitigate    | CLOSED | `VERIFY_READBACK_CHUNK_SIZE = 200` aligned with Zod max; `chunkArray(ids, VERIFY_READBACK_CHUNK_SIZE)` loops sub-spawns, one `buildTasksByIdSetScript` per chunk — keeps each script under the OmniJS 261KB ceiling.                                                                                                                                                               |
| T-05-04-05 | Repudiation            | mitigate    | CLOSED | `WRITE_UNVERIFIED_MISMATCH` envelope details include `{ mismatchedFields, intentSnapshot: intentObj, readBackSnapshot: firstReadBackTask }`. Full audit trail.                                                                                                                                                                                                                     |
| T-05-05-01 | Tampering              | mitigate    | CLOSED | All non-denied mutation return paths route through `this.verifier.verify`: tag_manage (468), create_folder (474), project (500), task-op dispatch (530), batch (1654). `bulk_delete` is the only bypass and is denied for the agent role by the policy guard loop (`decide(...) === 'deny'` → POLICY_DENY_DELETE) before reaching `handleBulkDelete`. See accepted residual below. |
| T-05-05-02 | Tampering              | mitigate    | CLOSED | Closed-skip set is the single `op['dryRun'] === true` branch; any new op class lacking `dryRun` falls through to the agent verification path by default. Unit test `D-11` guards the single skip path.                                                                                                                                                                             |
| T-05-05-03 | Information Disclosure | mitigate    | CLOSED | `new WriteVerifier(this.execJson.bind(this), this.logger)` — injected from the write tool's own `execJson` → `OmniAutomation.executeJson` → fresh `osascript` spawn. Never cached.                                                                                                                                                                                                 |
| T-05-05-04 | Repudiation            | mitigate    | CLOSED | Mismatch returns `createErrorResponseV2(... WRITE_UNVERIFIED_MISMATCH ...)` which sets `success: false`. Unit tests assert `result['success'] === false` and `error['code'] === 'WRITE_UNVERIFIED_MISMATCH'`. Distinct from `VERIFY_READBACK_FAILED`.                                                                                                                              |

---

## Unregistered Flags

None. SUMMARY 05-05 `## Threat Flags` declares "None — only wires an existing internal component; no new network
endpoints, auth paths, or trust boundaries introduced." SUMMARY 05-01 through 05-04 carry no `## Threat Flags` section
(no new attack surface declared). No unmapped attack surface found.

---

## Accepted Residual

**Owner-role `bulk_delete` does not stamp `verification_status`** (D-12 nominally wants `'unverified'` for unverified
owner ops). The `bulk_delete` branch routes to `handleBulkDelete` with no `verifier.verify` call, so no status is
injected at all. Assessment:

- The agent role can never reach this path — the policy guard denies `bulk_delete` (POLICY_DENY_DELETE) before the
  branch.
- VERIFY-01/02/03 mandate verification for the agent role only; owner ops sit outside the mandate (D-12).
- T-05-04-02 / T-05-05-01 are about the agent verifier bypass and the owner skipped-vs-unverified distinction on the
  _verified_ paths; neither requires owner `bulk_delete` to carry a status.

Non-blocking. Consistent with the phase verifier's judgment (05-VERIFICATION.md "Notable Observations"). Recorded here
as a known accepted gap, not an open threat.

---

_Audited: 2026-06-08 — gsd-security-auditor_
