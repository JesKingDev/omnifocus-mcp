---
created: 2026-06-19T04:59:23.956Z
title: Harden session-archaeology skill to prohibit ad-hoc scripts
area: general
files:
  - .claude/skills/session-archaeology/SKILL.md
  - probes/archaeology-prefilter.js
  - .claude/settings.json
---

## Problem

During live ARCH-01 UAT of `/archaeology`, the skill generated inline Python heredoc scripts and ad-hoc bash commands to
parse transcript files instead of delegating to the established `probes/archaeology-prefilter.js` probe. It also fired
repeated permission prompts — one per batch call — because the `--commit` argument changes with each invocation and
doesn't match any allowlist pattern.

At 411 sessions over 7 days, the repeated prompts make the skill unusable without constant babysitting. The improvised
scripts bypass the design contract and the established prefilter probe built in Phase 05-02.

## Solution

1. Update `SKILL.md` to explicitly prohibit ad-hoc script generation. Add a hard constraint: the only permitted
   execution paths are:
   - `node .../probes/archaeology-prefilter.js --commit <ids>`
   - The `Read` tool for transcript files
   - MCP tools
2. Add a note in SKILL.md about the permission-prompt problem.
3. Add the probe command pattern (`node */probes/archaeology-prefilter.js`) to the project allowlist in
   `.claude/settings.json` so it doesn't prompt per invocation.
