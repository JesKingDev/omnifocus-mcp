---
id: 2026-06-18-183402-archaeology-skill-invents-scripts
type: bug
title: 'session-archaeology skill invents ad-hoc scripts instead of using established probe'
status: new
severity: major
reporter: agent
source_repo: /Users/jessicaking/projects/omnifocus-mcp
source_session: ?
created: 2026-06-18
gsd_ref: ''
---

## What

During a live ARCH-01 UAT run, the `session-archaeology` skill generated inline Python heredoc scripts and ad-hoc bash
commands to parse transcript files, rather than delegating to the established `probes/archaeology-prefilter.js` probe.
It also fired repeated permission prompts — one per batch call — because the `--commit` argument changes with each
invocation and doesn't match any allowlist pattern.

## Why it matters

The skill is supposed to use a defined, approved protocol (the prefilter probe + Read tool + MCP tools). Improvised
scripts require per-invocation permission approval, create noise in the session, and bypass the established design
contract. At 411 sessions in 7 days, the repeated prompts make the skill unusable without constant babysitting.

## Context

Observed during the first live run of `/archaeology` on branch `05-archaeology-token-efficient-scan`. The prefilter
probe (`probes/archaeology-prefilter.js`) exists and was built in Phase 05-02 specifically to avoid this pattern. The
skill's SKILL.md instructions are apparently not constraining Claude tightly enough to stay within the probe-only path.

## Suggested fix

Update `SKILL.md` to explicitly prohibit ad-hoc script generation. Add a hard constraint: the only permitted execution
paths are (1) `node .../probes/archaeology-prefilter.js --commit <ids>`, (2) the `Read` tool for transcript files, and
(3) MCP tools. Also add a note about the permission-prompt problem and suggest adding the probe command pattern to the
project allowlist.
