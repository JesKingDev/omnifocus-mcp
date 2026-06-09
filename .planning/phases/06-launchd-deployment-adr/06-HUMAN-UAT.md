---
status: partial
phase: 06-launchd-deployment-adr
source: [06-04-PLAN.md, deploy/launchd/RUNBOOK.md]
started: 2026-06-09
updated: 2026-06-09
---

## Current Test

[awaiting on-host verification — operator deferred S4/S5/S6 and the ADR 001 back-reference by explicit risk-accepted
decision on 2026-06-09]

## Tests

### 1. S4 — Developer-ID node in-place overwrite survival

expected: Re-copy a different Developer-ID node version to `~/.local/libexec/of-mcp-node`,
`launchctl kickstart -k gui/$(id -u)/com.kip-d.omnifocus-mcp` → grant survives, clean start, no `-1743`, no re-prompt.
result: [pending — deferred, verify on first real node upgrade]

### 2. S5 — no restart loop on denial

expected: Revoke the Automation grant (System Settings → Privacy & Security → Automation), kickstart → exactly ONE
`exit(1)` with remediation in `server.err`, agent stays down (no rapid respawn under `KeepAlive=Crashed-only`). NOTE:
under launchd there is no re-grant prompt; re-grant manually then kickstart. result: [pending — deferred]

### 3. S6 — end-to-end write round-trip under launchctl

expected: With the LaunchAgent running, `omnifocus_write` create a task then `omnifocus_read` read it back → task exists
with written fields, NO interactive prompt (DEPLOY-01 success criterion 1's verified end-to-end write). result: [pending
— deferred]

### 4. ADR 001 vault back-reference (DEPLOY-04)

expected: ADR 001 in the JessOS Obsidian vault carries
`Superseded by ADR 005 — omnifocus-mcp repo, docs/adr/ADR-005-deployment-posture.md`. ADR-005 already carries the
forward reference. result: [PASS — 2026-06-09 milestone-audit doc-sync. ADR 001 IS in the vault at
`03-resources/decisions/001-obsidian-tasks-plugin.md` (the earlier "not located" note was a false negative). It carries
`status: superseded` and `superseded_by: "[[005-deployment-posture]]"`; ADR-005 carries
`supersedes: "[[001-obsidian-tasks-plugin]]"`. Bidirectional supersede link confirmed present.]

## Summary

total: 4 passed: 1 issues: 0 pending: 3 skipped: 0 blocked: 0

## Gaps

None failed. Item 4 (ADR 001 vault back-reference) PASSED on the 2026-06-09 doc-sync — the link was already present
bidirectionally. The remaining three items (S4/S5/S6 host spikes) are operator-deferred verification debt (risk-accepted
2026-06-09), not failures. S0–S3 of the host spike passed clean under launchctl; the software (probe, ADR-005, plist,
Makefile, runbook) is complete and the full unit suite (2375 tests) passes. Close the rest by running spikes S4–S6 per
`deploy/launchd/RUNBOOK.md` on the host (first real node upgrade is the natural trigger for S4).
