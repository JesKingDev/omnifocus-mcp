# OmniFocus Feedback Channel + Globalize Task Skills — Implementation Plan

> **For agentic workers:** This is markdown/skill authoring + filesystem symlinks (no code, no unit tests in v1). Steps
> use checkbox (`- [ ]`) syntax. Verification is manual per task.

**Goal:** Build the `/of-feedback` channel (capture → `.feedback/` store → `/of-feedback-review` triage into GSD) and
globalize the remaining task skills (Piece A).

**Architecture:** Repo-local `.feedback/` store; global capture via an `omnifocus-feedback` skill + `/of-feedback`
command (symlinked into `~/.claude/`, write entries by absolute path from a strict template); in-repo
`/of-feedback-review` triage; light self-report pointers in CLAUDE.md + the five task skills. Piece A symlinks
`capture-live-blocker`, `route-inbox-to-projects`, `surface-work-for-review` into `~/.claude/skills/` after auditing
them for cwd-relative assumptions.

**Spec:** `docs/superpowers/specs/2026-06-17-of-feedback-channel-design.md`

**Note:** commit signing is disabled locally this session (`commit.gpgsign=false`); commits proceed unsigned.

---

### Task 1: Scaffold `.feedback/` store

**Files:**

- Create: `.feedback/README.md`, `.feedback/inbox/.gitkeep`, `.feedback/archive/.gitkeep`

- [ ] Create `.feedback/inbox/.gitkeep` and `.feedback/archive/.gitkeep` (empty files, so the dirs are tracked).
- [ ] Create `.feedback/README.md` documenting: purpose, the entry frontmatter schema (id, type, title, status,
      severity, reporter, source_repo, source_session, created, gsd_ref), the body sections (What / Why it matters /
      Context / Suggested fix), the lifecycle (new → accepted|rejected|duplicate → archive/), and the flow (capture via
      `/of-feedback` or `omnifocus-feedback` skill; triage via `/of-feedback-review`). Include one filled example entry.
- [ ] Verify: `ls -R .feedback` shows `README.md`, `inbox/.gitkeep`, `archive/.gitkeep`.
- [ ] Commit: `feat: scaffold .feedback/ store + schema (of-feedback channel)`

---

### Task 2: `omnifocus-feedback` skill (capture writer)

**Files:**

- Create: `.claude/skills/omnifocus-feedback/SKILL.md`

- [ ] Write the skill. Frontmatter `name: omnifocus-feedback`; description triggers on (a) Jess explicitly reporting a
      bug/feature about the OmniFocus-MCP/JessOS tooling, AND (b) an agent encountering a bug/limitation/gap in that
      tooling mid-task. Make the description distinctive (OmniFocus-scoped) — do NOT trigger on generic "feedback".
- [ ] Body procedure: (1) resolve the store path against the absolute repo root
      `$HOME/projects/omnifocus-mcp/.feedback/inbox/` (create `inbox/` if missing; if the repo root is absent, report
      and stop). (2) Infer `type` (bug|feature|friction|idea), a one-line `title`, optional `severity` for bugs. (3)
      Generate id = `date +%Y-%m-%d-%H%M%S` + `-` + kebab slug of the title. (4) Fill `reporter: agent` (or `jess` when
      invoked by her), `source_repo` = current repo path, `source_session` = session id or `?`, `created` =
      `date +%Y-%m-%d`. (5) Write `.feedback/inbox/<id>.md` from the template with all required frontmatter fields + the
      four body sections. (6) Keep it ABSTRACTIVE — summarize; never paste raw transcript/secret content. (7) Confirm to
      the user with the entry path; do NOT commit (capture is write-only).
- [ ] Include the exact frontmatter template block in the skill so entries are consistent.
- [ ] Verify: read the skill back; confirm description is OmniFocus-scoped and the template lists every schema field.
- [ ] Commit: `feat: omnifocus-feedback skill (global tooling-feedback capture)`

---

### Task 3: `/of-feedback` command

**Files:**

- Create: `.claude/commands/of-feedback.md`

- [ ] Write the command. Frontmatter `description:` one line. Body: invoke the `omnifocus-feedback` skill with
      `reporter: jess`, passing the user's freeform `$ARGUMENTS` as the feedback text; the skill handles inference +
      writing. Note the entry is written, not committed (triage commits later).
- [ ] Verify: read back; confirm it delegates to the skill and sets reporter jess.
- [ ] Commit: `feat: /of-feedback command (Jess capture entry point)`

---

### Task 4: `/of-feedback-review` triage command

**Files:**

- Create: `.claude/commands/of-feedback-review.md`

- [ ] Write the command (in-repo triage). Body procedure: (1) list `.feedback/inbox/*.md` with `status: new`,
      newest-first (skip `.gitkeep`). If none, report "No new feedback." and stop. (2) For each entry: show a compact
      summary (id, type, severity, title, source_repo, the What/Why). Ask in plain text:
      `accept / reject / duplicate / skip`. (3) On **accept**: create a GSD backlog item via `/gsd-capture` (or append
      to the GSD backlog) carrying the entry's title + body; set the entry `status: accepted` and `gsd_ref` to the
      backlog item/issue; move the file to `.feedback/archive/`. Then offer "also open a GitHub issue on
      kip-d/omnifocus-mcp?" — only if yes, create it via `gh` and append the URL to `gsd_ref`. (4) On
      **reject**/**duplicate**: set `status` accordingly, move to `.feedback/archive/`. (5) On **skip**: leave in inbox.
      (6) After all entries: commit the triage (`git add .feedback && git commit`) and offer to push.
- [ ] Verify: read back; confirm accept path writes to GSD backlog + sets gsd_ref, and the GitHub issue is opt-in per
      item.
- [ ] Commit: `feat: /of-feedback-review triage command (feedback → GSD backlog)`

---

### Task 5: Self-report pointers + session-start surfacing

**Files:**

- Modify: `CLAUDE.md` (repo root)
- Modify: `.claude/skills/capture-live-blocker/SKILL.md`, `.claude/skills/route-inbox-to-projects/SKILL.md`,
  `.claude/skills/session-archaeology/SKILL.md`, `.claude/skills/surface-work-for-review/SKILL.md`,
  `.claude/skills/sync-work-tasks-to-omnifocus/SKILL.md`

- [ ] Add to repo `CLAUDE.md` a short subsection: (a) **Feedback** — "If you hit a bug or limitation in this tooling,
      log it with the `omnifocus-feedback` skill (`/of-feedback`)." (b) **Surfacing** — "At session start, count
      `.feedback/inbox/*.md` with `status: new`; if > 0, mention the count and suggest `/of-feedback-review`." Keep it
      tight (a few lines), consistent with CLAUDE.md's terse style and stable-anchor rules (no line numbers/counts).
- [ ] Add the single self-report line — "If you hit a bug or limitation in this tooling, log it with the
      `omnifocus-feedback` skill (`/of-feedback`)." — once to each of the five task skills (a natural spot: near the
      top/overview or a "Common mistakes"/"Notes" area). Don't duplicate if already present.
- [ ] Verify: `grep -rl "omnifocus-feedback" CLAUDE.md .claude/skills/` lists CLAUDE.md + all five skills.
- [ ] Commit: `feat: self-report pointers + feedback surfacing across task skills`

---

### Task 6: Piece A — audit + globalize task skills, and install feedback globally

**Files:** skill edits only if an audit finds cwd-relative paths; otherwise filesystem symlinks only.

- [ ] Audit each of `capture-live-blocker`, `route-inbox-to-projects`, `surface-work-for-review` SKILL.md for
      cwd-relative assumptions: any `node probes/...`/`./...`/repo-relative path, or "run from repo root" language.
      (`grep -nE "probes/|\\./|repo root|cwd" .claude/skills/<skill>/SKILL.md`.) For any found, convert to an absolute
      path (`$HOME/projects/omnifocus-mcp/...`) the same way `session-archaeology` was fixed, so the skill runs from any
      cwd. Vault greps that already use absolute `~/vaults/...` paths are fine.
- [ ] If any skill was edited, commit: `fix: make <skill> cwd-independent for global use`.
- [ ] Create global symlinks (single source of truth = repo):
  ```bash
  for s in capture-live-blocker route-inbox-to-projects surface-work-for-review omnifocus-feedback; do
    ln -sfn "$HOME/projects/omnifocus-mcp/.claude/skills/$s" "$HOME/.claude/skills/$s"
  done
  ln -sfn "$HOME/projects/omnifocus-mcp/.claude/commands/of-feedback.md" "$HOME/.claude/commands/of-feedback.md"
  ```
- [ ] Confirm already-global skills resolve: `ls -l "$HOME/.claude/skills/session-archaeology"` and
      `"$HOME/.claude/skills/sync-work-tasks-to-omnifocus"` (the latter is a real dir, not a symlink — that's fine; just
      confirm it exists).
- [ ] Verify each new symlink resolves to a `SKILL.md`:
      `for s in capture-live-blocker route-inbox-to-projects surface-work-for-review omnifocus-feedback; do test -f "$HOME/.claude/skills/$s/SKILL.md" && echo "$s ok"; done`
      and `test -f "$HOME/.claude/commands/of-feedback.md" && echo "of-feedback cmd ok"`.
- [ ] Note: `/of-feedback-review` is intentionally NOT symlinked (triage runs in-repo).
- [ ] Commit (if any skill edits occurred in this task; symlinks are outside git): covered above.

---

### Task 7: Manual end-to-end verification (human)

- [ ] From a BRAND-NEW session OUTSIDE the repo, run `/of-feedback test entry from outside repo` → confirm a well-formed
      `.feedback/inbox/<id>.md` appears in omnifocus-mcp with valid frontmatter (`reporter: jess`, correct
      `source_repo`).
- [ ] Confirm the `omnifocus-feedback` skill is discoverable in that fresh session (and the three globalized skills
      appear).
- [ ] In an omnifocus-mcp session, run `/of-feedback-review` → accept the test entry → confirm it creates a GSD backlog
      item, sets `gsd_ref`, and moves the file to `.feedback/archive/`.
- [ ] Delete the test backlog item if undesired.

---

## Self-Review

**Spec coverage:** Store (Task 1) · capture skill + command (Tasks 2–3) · triage (Task 4) · self-report pointers +
surfacing (Task 5) · Piece A globalize + feedback install (Task 6) · manual verification (Task 7). All spec decisions
1–7 + Bundled Piece A are covered.

**Placeholder scan:** `<id>`, `<skill>` are legitimate templates filled at runtime; no TBD/TODO.

**Consistency:** Names `omnifocus-feedback` / `/of-feedback` / `/of-feedback-review` and the `.feedback/inbox|archive/`
paths match the spec throughout. Capture is write-only; triage commits — consistent across Tasks 2, 4, 6.
