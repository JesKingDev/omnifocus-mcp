---
name: capture-live-blocker
description:
  Use when, mid live Claude Code session, the agent hits a concrete blocker, an unresolvable open
  question, or a "TODO later" it should not lose — captures that single item into the OmniFocus inbox
  in real time, with permission. Conservative: fires rarely, single-item, in the moment.
---

# Capture Live Blocker → OmniFocus Inbox

## Overview

In-the-moment capture of a single concrete blocker or unresolvable open question into the OmniFocus inbox during a live
Claude Code session. OmniFocus is canonical — this skill writes directly to it and does not depend on a vault or a batch
loop.

The skill activates on agent _noticing_, not on a user utterance. When the agent recognizes a concrete blocker
mid-session and the user is present to approve, this is the capture path. It is distinct from review tagging
(REVIEW-01/02) and from session archaeology (Phase 5 — see Out of scope).

Decisions the skill embodies:

- **D-08** — conservative named-signal trigger: explicit blocker / follow-up / "TODO later" / unresolvable open question
  only.
- **D-09** — permission reuses PERM-02 verbatim: prompt-before-create gate; the funnel owns the verdict; the agent
  renders the prompt.
- **D-10** — placement is inbox + `agent-okay` + `capture-live` marker tag + `of-mcp:lineage` stamp; `archaeology` is
  never added.
- **D-11** — reuses Phase 2's native OmniJS inbox-create path, server-side lineage stamp, and the funnel/verifier — no
  new capture mechanism.

Adds no server code. Drives `omnifocus_write` through the existing write funnel and write-verifier.

## Conservative judgment rule

Capture only when ALL of the following are true:

1. The agent has identified a **specific, concrete** item — an explicit blocker preventing forward progress, a follow-up
   the user named, a "TODO later" the user stated, or an open question unresolvable without information the session does
   not have.
2. The item is **actionable** — it could be a task in OmniFocus, not a general concern or observation.
3. The capture is **single-item** — this skill creates one task per invocation, not a batch.
4. The session is **live and interactive** — the user is present and the PERM-02 gate can fire.

**Bias to NOT capture.** When in doubt whether an item is concrete enough, do not capture it. A vague capture clutters
the inbox more than a missed one. If the item is speculative, a meta-observation, or a design question with many open
sub-questions, note it in the conversation and leave it to the user to create tasks.

The judgment rule mirrors the route skill's "bias to leave": rare, trusted, single-item, in the moment.

## Idempotency

Re-noticing the same blocker during the same session must not produce a second task. Before calling `omnifocus_write`,
recall whether this exact item was captured earlier in the session. If so, mention it ("I already captured that to the
inbox earlier this session — skipping") and skip. The server does not deduplicate; agent judgment is the only guard.

## Permission rendering (PERM-02)

The write funnel applies the `POLICY_GATE_CAPTURE_CONFIRM` gate to agent creates in interactive mode. The agent renders
the prompt; the funnel owns the verdict.

On a `POLICY_GATE_CAPTURE_CONFIRM` response from `omnifocus_write`:

1. Show the user the proposed inbox task:
   - **Name:** `<the concise blocker statement>`
   - **Note:** `<context, if any>`
   - **Tags:** `capture-live` (agent-okay stamped automatically by the server)
   - **Placement:** inbox (no project)
2. Ask: "Capture this to OmniFocus? (yes / no)"
3. If yes — re-invoke `omnifocus_write` with the same create payload, carrying `lineage.sessionId`. The lineage param is
   a self-attested agent capture (D-08b): the funnel admits the inbox create without an owner prompt or session grant.
   Do NOT try to set a session grant yourself — that endpoint is owner-only and rejects agent callers.
4. If no — acknowledge and proceed without creating the task.

If the owner has separately granted allow-all-this-session, the gate does not fire and the create proceeds immediately —
but the lineage attestation is the agent's own path and needs no owner action. Never build a second permission mechanism
— the PERM-02 funnel gate is the only consent layer.

The write-verifier fires automatically for every agent write. Do not call it explicitly.

## Tool call reference

| Goal                   | Call shape                             |
| ---------------------- | -------------------------------------- |
| Capture a live blocker | `omnifocus_write` with the shape below |

```jsonc
{
  "mutation": {
    "operation": "create",
    "target": "task",
    "data": {
      "name": "<concise blocker statement — one line>",
      "note": "<context: why this is blocking, what information is missing>",
      "tags": ["capture-live"],
      // Do NOT add: archaeology, review-output, review-capture, or any other tag.
      "lineage": { "sessionId": "<cc-session-uuid>" },
      // No "project" key → defaults to inbox (DISC-CAPTURE-01).
      // No dueDate, no deferDate — a captured blocker is undated (D-05).
    },
  },
}
```

Key server behaviors triggered by this call (verified against `OmniFocusWriteTool.ts` lineage block):

- The `lineage` param auto-appends `of-mcp:lineage` to the task note (lineage stamp).
- When `role=agent`, the funnel also auto-appends `agent-okay` to `data.tags`. The skill passes only `capture-live`; the
  funnel stamps `agent-okay` — do not pass `agent-okay` explicitly.
- No `project` key means the task lands in the inbox (DISC-CAPTURE-01).
- The write-verifier fires automatically; do not call it.

## Out of scope

- **`archaeology` tag** — that is Phase 5 (session archaeology). Live capture NEVER adds `archaeology`. A live-captured
  blocker is a forward-looking task, not a past-session artifact.
- **Routing** — a captured inbox item routes later via the Phase 3 loop (`route-inbox-to-projects` skill). This skill
  does not route, file to a project, or apply `routing-unplaced`.
- **Review tags (`review-output`, `review-capture`)** — a captured blocker is not yet review work. Those tags are for
  work the agent flags for the user's review, not for items the agent captures to remember. Do not add them.
- **Dates** — a captured blocker is intentionally undated (D-05). The agent has no authority to invent a deadline or
  defer date. Do not add `dueDate` or `deferDate`.
- **Background mode** — this skill requires a live interactive session. The PERM-02 gate cannot render a prompt in
  background mode. Do not use this skill in non-interactive contexts.
- **Batch capture** — this skill is single-item only. For batch-style capture or session archaeology, see Phase 5.

## Latency note

OmniFocus JXA/OmniJS calls can take 10+ seconds. This is normal. Do not retry on slowness alone. Wait for the response
before reporting success or failure.

## Common mistakes

| Mistake                                              | Fix                                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Assigning tags via JXA `task.addTags()`              | JXA tag assignment silently no-ops. Always use `omnifocus_write` with the `tags` field in `data`.         |
| Adding the `archaeology` tag to a live capture       | Never. `archaeology` is Phase 5 — a past-session provenance marker, not a live-capture marker.            |
| Adding a `dueDate` or `deferDate`                    | Do not invent dates. A captured blocker is undated by design (D-05).                                      |
| Skipping the PERM-02 permission prompt               | Always render the yes/no prompt on `POLICY_GATE_CAPTURE_CONFIRM`. The user's consent is required.         |
| Treating a 10+ second OmniFocus response as an error | Wait for the response. Latency of 10–30 seconds is normal for JXA/OmniJS bridge calls.                    |
| Adding `review-output` or `review-capture`           | Those tags are for review surfacing (REVIEW-01/02), not live capture. Do not add them.                    |
| Passing `agent-okay` explicitly                      | The funnel auto-stamps `agent-okay` when `role=agent` and `lineage` is present. Pass only `capture-live`. |
| Capturing a vague concern or meta-observation        | This skill is for concrete, actionable, single items only. Bias to NOT capture.                           |
