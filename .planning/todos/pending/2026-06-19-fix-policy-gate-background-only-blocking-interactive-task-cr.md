---
created: 2026-06-19T04:59:23.956Z
title: Fix POLICY_GATE_BACKGROUND_ONLY blocking interactive task creates
area: auth
files:
  - src/tools/unified/OmniFocusWriteTool.ts
  - src/tools/index.ts
---

## Problem

`omnifocus_write` create operations fail with `POLICY_GATE_BACKGROUND_ONLY` when called from interactive Claude Code
sessions. The MCP always assigns `role: agent` from the HTTP token, so the pre-dispatch gate in `tools/index.ts` blocks
creates as if they were background/scripted — regardless of whether the user is actively present. `of-create-task` (the
canonical task-creation skill) and any new agent-authored task creation are completely broken.
`sync-work-tasks-to-omnifocus` predates the gate and still works.

Observed: `whoami` returns `role: agent, roleSource: http-token` in a live interactive chat. Error response includes
`dryRun: true`, confirming write was rejected, not executed.

## Solution

Interactive Claude Code sessions (user-present chat) need a role with create permissions. Options:

1. Separate `user` or `interactive` role HTTP token — interactive sessions use a different token
2. Gate checks for interactive-session signal in the request before applying BACKGROUND_ONLY restriction
3. Per-role configurability — allow `agent` role to have create rights in interactive contexts

Note: The gate fires at TWO points (pre-dispatch in `tools/index.ts` AND WriteTool funnel). Any fix must address both.
See `dual-policy-gate-dispatch-vs-funnel.md` memory.
