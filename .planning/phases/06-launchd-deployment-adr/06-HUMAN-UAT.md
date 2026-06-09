---
status: partial
phase: 06-launchd-deployment-adr
source: [06-04-PLAN.md, deploy/launchd/RUNBOOK.md]
started: 2026-06-09
updated: 2026-06-09
---

## Current Test

[awaiting on-host verification — operator deferred S4/S5/S6 and the ADR 001 back-reference by explicit risk-accepted decision on 2026-06-09]

## Tests

### 1. S4 — Developer-ID node in-place overwrite survival
expected: Re-copy a different Developer-ID node version to `~/.local/libexec/of-mcp-node`, `launchctl kickstart -k gui/$(id -u)/com.kip-d.omnifocus-mcp` → grant survives, clean start, no `-1743`, no re-prompt.
result: [pending — deferred, verify on first real node upgrade]

### 2. S5 — no restart loop on denial
expected: Revoke the Automation grant (System Settings → Privacy & Security → Automation), kickstart → exactly ONE `exit(1)` with remediation in `server.err`, agent stays down (no rapid respawn under `KeepAlive=Crashed-only`). NOTE: under launchd there is no re-grant prompt; re-grant manually then kickstart.
result: [pending — deferred]

### 3. S6 — end-to-end write round-trip under launchctl
expected: With the LaunchAgent running, `omnifocus_write` create a task then `omnifocus_read` read it back → task exists with written fields, NO interactive prompt (DEPLOY-01 success criterion 1's verified end-to-end write).
result: [pending — deferred]

### 4. ADR 001 vault back-reference (DEPLOY-04)
expected: ADR 001 in the JessOS Obsidian vault carries `Superseded by ADR 005 — omnifocus-mcp repo, docs/adr/ADR-005-deployment-posture.md`. ADR-005 already carries the forward reference.
result: [pending — deferred; ADR 001 not located as a discrete file in the vault]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

None failed. All four items are operator-deferred verification debt (risk-accepted 2026-06-09), not failures. S0–S3 of the host spike passed clean under launchctl; the software (probe, ADR-005, plist, Makefile, runbook) is complete and the full unit suite (2375 tests) passes. Close these by running spikes S4–S6 per `deploy/launchd/RUNBOOK.md` on the host and adding the vault back-reference when ADR 001 surfaces.
