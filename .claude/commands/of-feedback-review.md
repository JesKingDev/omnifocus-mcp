---
description: Triage new OmniFocus-tooling feedback entries (.feedback/inbox/) into the GSD backlog
---

Triage the open feedback entries in this repo's `.feedback/inbox/`. Run this from an omnifocus-mcp session (the store +
GSD backlog live here). One entry at a time, plain-text decisions, commit at the end.

## Procedure

**Step 1 — Gather.** List `.feedback/inbox/*.md` with frontmatter `status: new` (ignore `.gitkeep`). Order newest-first
by `id` (the id is timestamp-prefixed). If none, report "No new feedback to triage." and stop.

**Step 2 — Per entry, present a compact summary** and ask one plain-text question (NOT AskUserQuestion):

```
[<type>/<severity>] <title>
  from: <source_repo>   reporter: <reporter>   id: <id>
  What: <the What paragraph>
  Why:  <the Why it matters paragraph>

Decision? (accept / reject / duplicate / skip)
```

**Step 3 — Apply the decision.**

- **accept** — Promote into GSD:
  1. Create a backlog item via the repo's GSD capture path: run `/gsd-capture` with the entry's `title` + body
     (What/Why/Context/Suggested fix), or append a backlog entry under `.planning/` if that's where backlog lives.
     Capture the resulting backlog reference (path or id).
  2. In the entry file, set `status: accepted` and `gsd_ref: <backlog reference>`.
  3. Move the file from `.feedback/inbox/` to `.feedback/archive/`.
  4. Then ask: "Also open a GitHub issue on kip-d/omnifocus-mcp for this?" — only on **yes**, create it with
     `gh issue create --repo kip-d/omnifocus-mcp` (title + body), and append the issue URL to `gsd_ref`.
- **reject** — set `status: rejected`, move the file to `.feedback/archive/`.
- **duplicate** — set `status: duplicate` (note the dup id in the body if known), move to `.feedback/archive/`.
- **skip** — leave the file in `.feedback/inbox/` untouched.

**Step 4 — Commit.** After all entries are handled, `git add .feedback` and commit
(`chore: triage of-feedback — N accepted, M rejected, K duplicate`). Offer to `git push`.

## Notes

- Accepted feedback flows into the existing GSD backlog — this command is the front door that feeds it.
- Keep entries abstractive; never paste raw transcript/secret content into a GSD item or GitHub issue.
- GitHub issue creation is opt-in per item (avoids cluttering the tracker with raw/duplicate items).
