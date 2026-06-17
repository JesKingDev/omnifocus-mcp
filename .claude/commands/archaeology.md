---
description: Scan the last 7 days of Claude Code transcripts for unresolved open loops (session archaeology)
---

Invoke the `session-archaeology` skill via the Skill tool and follow it exactly.

Do NOT answer from this conversation's context. The skill's Pass 1 mandates running
`node probes/archaeology-prefilter.js` over the last 7 days of transcripts as the first action — that probe output is
the only source of past-session knowledge. Run it before presenting any results.
