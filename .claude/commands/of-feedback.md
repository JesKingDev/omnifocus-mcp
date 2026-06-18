---
description:
  Log a bug/feature/friction about the OmniFocus-MCP / JessOS task tooling into the omnifocus-mcp .feedback/ store
---

Invoke the `omnifocus-feedback` skill via the Skill tool and follow it exactly, with `reporter: jess`.

The user's feedback text is in `$ARGUMENTS` — pass it to the skill as the report. The skill infers
`type`/`title`/`severity`, fills the metadata, and writes one entry to
`$HOME/projects/omnifocus-mcp/.feedback/inbox/<id>.md`.

Capture is write-only: write the entry and confirm its path. Do NOT commit — triage (`/of-feedback-review`, run in an
omnifocus-mcp session) commits later.
