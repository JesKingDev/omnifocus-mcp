---
id: 2026-06-19-002910-agent-role-blocks-creates-in-interactive-sessions
type: bug
title: 'POLICY_GATE_BACKGROUND_ONLY blocks task creates in interactive Claude Code sessions'
status: new
severity: major
reporter: agent
source_repo: /Users/jessicaking/vaults/jess-os
source_session: ?
created: 2026-06-19
gsd_ref: ''
---

## What

When Claude Code is running interactively (user actively present in chat), `omnifocus_write` create operations fail with
`POLICY_GATE_BACKGROUND_ONLY`. The MCP assigns role `agent` from the HTTP token regardless of whether the session is
interactive or automated, so all creates are gated as if they were background/scripted.

## Why it matters

Any skill that needs to create new OmniFocus tasks from an interactive Claude Code session is broken. The new
`of-create-task` skill — the canonical task-creation path for the JessOS agent system — cannot write tasks. The
`sync-work-tasks-to-omnifocus` skill pre-dates the gate and its creates still work, but all new agent-authored task
creation is blocked.

## Context

Observed during testing of the `of-create-task` skill. `whoami` confirms `role: agent` from `roleSource: http-token`.
The session was a live interactive Claude Code chat, not a scheduled or background invocation. The error response
includes `dryRun: true` in the preview details, confirming the write was rejected rather than executed.

## Suggested fix

Interactive Claude Code sessions (user-present chat) should connect with a role that has create permissions — either a
separate `user` or `interactive` role token, or the gate should check for an interactive-session signal. As a fallback,
the gate could be configurable per-role so `agent` has create rights in interactive contexts.
