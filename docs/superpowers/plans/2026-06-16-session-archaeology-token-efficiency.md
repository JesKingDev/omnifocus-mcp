# Session Archaeology — Global, Token-Efficient, Resumable Scan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `session-archaeology` skill global and all-projects, with a probe-side per-session watermark so
re-runs ingest only new transcript content and a per-batch (5-session) resumable approval gate.

**Architecture:** All dedup/watermark math lives in the probe (`probes/archaeology-prefilter.js`, ESM Node) so the agent
only ever reads genuinely new records. A per-machine `~/.claude/session-archaeology/state.json` stores each session's
last-scanned timestamp; the watermark advances only after a batch is approved or reviewed-empty (`--commit`), never on
abort. The skill is installed globally via symlink from this repo (single source of truth) and invokes the probe by
absolute path.

**Tech Stack:** Node ESM, Vitest, Claude Code skills + slash commands, OmniFocus MCP
(`omnifocus_read`/`omnifocus_write`).

**Spec:** `docs/superpowers/specs/2026-06-16-session-archaeology-token-efficiency-design.md`

---

## File Structure

- `probes/archaeology-prefilter.js` (modify) — add `watermarkMap` param to `filterTranscriptLines`; add pure helpers
  `maxTsPerSession`, `mergeWatermark`; add `resolveAllProjectDirs` (already drafted), state/pending IO, newest-first
  grouping, and CLI modes (scan / `--commit` / `--reset`).
- `tests/unit/probes/archaeology-prefilter.test.ts` (modify) — add watermark-filter specs.
- `tests/unit/probes/archaeology-state.test.ts` (create) — specs for `maxTsPerSession` and `mergeWatermark`.
- `.claude/skills/session-archaeology/SKILL.md` (modify) — absolute probe path, all-projects scan,
  watermark/scan→batch→commit loop, install header.
- `.claude/commands/archaeology.md` (modify) — absolute probe path in the reminder.
- Symlinks (install step, not committed): `~/.claude/skills/session-archaeology` and `~/.claude/commands/archaeology.md`
  → repo files.

**Note on starting state:** `resolveAllProjectDirs()` was already added to the probe during brainstorming and is
uncommitted in the working tree. Task 4 builds on it. If the working tree was reset, re-add it as shown in Task 4.

---

### Task 1: Watermark filtering in `filterTranscriptLines`

**Files:**

- Modify: `probes/archaeology-prefilter.js` (function `filterTranscriptLines`)
- Test: `tests/unit/probes/archaeology-prefilter.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/probes/archaeology-prefilter.test.ts`:

```ts
describe('filterTranscriptLines — watermark', () => {
  const nowMs = Date.UTC(2026, 5, 16, 12, 0, 0, 0); // 2026-06-16T12:00:00Z
  const mkUser = (sid: string, iso: string, text: string) => ({
    type: 'user',
    sessionId: sid,
    timestamp: iso,
    message: { role: 'user', content: text },
  });

  it('drops messages at or before the session watermark, keeps newer ones', () => {
    const lines = [mkUser('S1', '2026-06-14T00:00:00Z', 'old'), mkUser('S1', '2026-06-15T00:00:00Z', 'new')];
    const out = filterTranscriptLines(lines, nowMs, { S1: '2026-06-14T12:00:00Z' });
    expect(out.map((r) => r.text)).toEqual(['new']);
  });

  it('keeps all in-window messages for a session absent from the watermark map', () => {
    const lines = [mkUser('S2', '2026-06-14T00:00:00Z', 'a'), mkUser('S2', '2026-06-15T00:00:00Z', 'b')];
    const out = filterTranscriptLines(lines, nowMs, { S1: '2026-06-15T00:00:00Z' });
    expect(out.map((r) => r.text)).toEqual(['a', 'b']);
  });

  it('boundary: a message exactly at the watermark is dropped (strictly greater)', () => {
    const lines = [mkUser('S1', '2026-06-15T00:00:00Z', 'exact')];
    const out = filterTranscriptLines(lines, nowMs, { S1: '2026-06-15T00:00:00Z' });
    expect(out).toHaveLength(0);
  });

  it('empty watermark map reproduces current behavior (no extra drops)', () => {
    const lines = [mkUser('S1', '2026-06-15T00:00:00Z', 'keep')];
    const out = filterTranscriptLines(lines, nowMs, {});
    expect(out.map((r) => r.text)).toEqual(['keep']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- archaeology-prefilter` Expected: the four new watermark specs FAIL (current signature ignores
the 3rd arg, so the "drops at/before watermark" and "boundary" specs fail).

- [ ] **Step 3: Add the `watermarkMap` parameter and check**

In `probes/archaeology-prefilter.js`, change the signature and add the watermark check. Replace:

```js
export function filterTranscriptLines(lines, nowMs) {
  const cutoffMs = nowMs - SEVEN_DAYS_MS;
  const result = [];
```

with:

```js
export function filterTranscriptLines(lines, nowMs, watermarkMap = {}) {
  const cutoffMs = nowMs - SEVEN_DAYS_MS;
  const result = [];
```

Then, immediately after the existing window check (the line `if (isNaN(tsMs) || tsMs < cutoffMs) continue;`), add:

```js
    // Per-session watermark (D-01..D-07 token dedup): drop messages already
    // scanned in a prior run. Strictly-greater so a message exactly at the
    // watermark is not re-emitted. Sessions absent from the map have no
    // watermark and emit all in-window messages.
    const wmIso = watermarkMap[line.sessionId];
    if (typeof wmIso === 'string') {
      const wmMs = Date.parse(wmIso);
      if (!isNaN(wmMs) && tsMs <= wmMs) continue;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- archaeology-prefilter` Expected: PASS (new watermark specs + all pre-existing prefilter specs
green).

- [ ] **Step 5: Commit**

```bash
git add probes/archaeology-prefilter.js tests/unit/probes/archaeology-prefilter.test.ts
git commit -m "feat(05): watermark param in filterTranscriptLines (probe-side dedup)"
```

---

### Task 2: `maxTsPerSession` helper

**Files:**

- Modify: `probes/archaeology-prefilter.js`
- Test: `tests/unit/probes/archaeology-state.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/probes/archaeology-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { maxTsPerSession, mergeWatermark } from '../../../probes/archaeology-prefilter.js';

describe('maxTsPerSession', () => {
  it('returns the latest ISO timestamp per session', () => {
    const records = [
      { session_id: 'S1', timestamp: '2026-06-14T00:00:00Z', role: 'user', text: 'a' },
      { session_id: 'S1', timestamp: '2026-06-15T09:30:00Z', role: 'user', text: 'b' },
      { session_id: 'S2', timestamp: '2026-06-13T00:00:00Z', role: 'user', text: 'c' },
    ];
    expect(maxTsPerSession(records)).toEqual({
      S1: '2026-06-15T09:30:00Z',
      S2: '2026-06-13T00:00:00Z',
    });
  });

  it('returns an empty object for no records', () => {
    expect(maxTsPerSession([])).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- archaeology-state` Expected: FAIL — `maxTsPerSession` is not exported.

- [ ] **Step 3: Implement `maxTsPerSession`**

In `probes/archaeology-prefilter.js`, after `filterTranscriptLines`, add:

```js
/**
 * Given filtered records, return { sessionId: maxIsoTimestamp } — the newest
 * message timestamp seen per session this run. Used to advance the watermark.
 */
export function maxTsPerSession(records) {
  const out = {};
  for (const rec of records) {
    const sid = rec.session_id;
    if (!sid) continue;
    const cur = out[sid];
    if (cur === undefined || Date.parse(rec.timestamp) > Date.parse(cur)) {
      out[sid] = rec.timestamp;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- archaeology-state` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add probes/archaeology-prefilter.js tests/unit/probes/archaeology-state.test.ts
git commit -m "feat(05): maxTsPerSession helper for watermark advance"
```

---

### Task 3: `mergeWatermark` helper

**Files:**

- Modify: `probes/archaeology-prefilter.js`
- Test: `tests/unit/probes/archaeology-state.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/probes/archaeology-state.test.ts`:

```ts
describe('mergeWatermark', () => {
  const base = () => ({ version: 1, sessions: { S1: { lastScannedTs: '2026-06-10T00:00:00Z' } } });

  it('merges only the named sessions from pending into state', () => {
    const state = base();
    const pending = { S1: '2026-06-15T00:00:00Z', S2: '2026-06-15T00:00:00Z' };
    const next = mergeWatermark(state, pending, ['S2']);
    expect(next.sessions.S1.lastScannedTs).toBe('2026-06-10T00:00:00Z'); // untouched
    expect(next.sessions.S2.lastScannedTs).toBe('2026-06-15T00:00:00Z'); // added
  });

  it('updates an existing session when named', () => {
    const next = mergeWatermark(base(), { S1: '2026-06-16T00:00:00Z' }, ['S1']);
    expect(next.sessions.S1.lastScannedTs).toBe('2026-06-16T00:00:00Z');
  });

  it('ignores named sessions missing from pending', () => {
    const next = mergeWatermark(base(), {}, ['S9']);
    expect(next.sessions.S9).toBeUndefined();
  });

  it('does not mutate the input state', () => {
    const state = base();
    mergeWatermark(state, { S1: '2026-06-16T00:00:00Z' }, ['S1']);
    expect(state.sessions.S1.lastScannedTs).toBe('2026-06-10T00:00:00Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- archaeology-state` Expected: FAIL — `mergeWatermark` is not exported.

- [ ] **Step 3: Implement `mergeWatermark`**

In `probes/archaeology-prefilter.js`, after `maxTsPerSession`, add:

```js
/**
 * Pure merge: return a new state object with lastScannedTs updated for each
 * sessionId in `sessionIds` that has an entry in `pending`. Does not mutate
 * inputs. State shape: { version, sessions: { [sid]: { lastScannedTs } } }.
 */
export function mergeWatermark(state, pending, sessionIds) {
  const sessions = { ...(state && state.sessions ? state.sessions : {}) };
  for (const sid of sessionIds) {
    const ts = pending ? pending[sid] : undefined;
    if (typeof ts === 'string') {
      sessions[sid] = { ...(sessions[sid] || {}), lastScannedTs: ts };
    }
  }
  return { version: 1, ...(state || {}), sessions };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- archaeology-state` Expected: PASS (both describe blocks).

- [ ] **Step 5: Commit**

```bash
git add probes/archaeology-prefilter.js tests/unit/probes/archaeology-state.test.ts
git commit -m "feat(05): mergeWatermark pure helper for per-batch commit"
```

---

### Task 4: All-projects resolution, state IO, newest-first scan mode

**Files:**

- Modify: `probes/archaeology-prefilter.js` (top-of-file constants, `resolveAllProjectDirs`, state IO, `printGrouped`
  ordering, CLI main scan branch)

- [ ] **Step 1: Ensure `resolveAllProjectDirs` exists**

Confirm `probes/archaeology-prefilter.js` contains this function (added during brainstorming). If absent, add it next to
`resolveActiveDirs`:

```js
/**
 * Resolve ALL Claude Code project transcript directories under ~/.claude/projects.
 * Default mode for the global session-archaeology skill: open loops live across
 * every repo Jess works in, not just the cwd she happens to launch from.
 * Scoped to ~/.claude/projects (no traversal outside the user's own store).
 */
function resolveAllProjectDirs() {
  const projectsBase = path.join(os.homedir(), '.claude', 'projects');
  const dirs = [];
  try {
    const entries = fs.readdirSync(projectsBase, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        dirs.push(path.join(projectsBase, entry.name));
      }
    }
  } catch {
    // projectsBase unreadable — return empty
  }
  return dirs;
}
```

- [ ] **Step 2: Add state path constants and IO helpers**

After the `SEVEN_DAYS_MS` constant near the top, add:

```js
const STATE_DIR = path.join(os.homedir(), '.claude', 'session-archaeology');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const PENDING_FILE = path.join(STATE_DIR, 'state.json.pending');

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(file, obj) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

/** Build { sessionId: lastScannedTs } from a state object for filterTranscriptLines. */
function watermarkMapFromState(state) {
  const map = {};
  const sessions = state && state.sessions ? state.sessions : {};
  for (const [sid, entry] of Object.entries(sessions)) {
    if (entry && typeof entry.lastScannedTs === 'string') map[sid] = entry.lastScannedTs;
  }
  return map;
}
```

- [ ] **Step 3: Make `printGrouped` order sessions newest-first**

Replace the body of `printGrouped` with a version that sorts sessions by their newest record timestamp, descending:

```js
function printGrouped(records) {
  const bySession = new Map();
  for (const rec of records) {
    if (!bySession.has(rec.session_id)) bySession.set(rec.session_id, []);
    bySession.get(rec.session_id).push(rec);
  }

  // Newest-first: recent sessions can supersede earlier ones, so resolve current
  // truth first (matches batch order in the skill).
  const ordered = [...bySession.entries()].sort((a, b) => {
    const maxA = Math.max(...a[1].map((r) => Date.parse(r.timestamp)));
    const maxB = Math.max(...b[1].map((r) => Date.parse(r.timestamp)));
    return maxB - maxA;
  });

  for (const [sessionId, sessionRecords] of ordered) {
    console.log(`\n=== Session: ${sessionId} ===`);
    for (const rec of sessionRecords) {
      console.log(`[${rec.timestamp}] ${rec.role}: ${rec.text}`);
    }
  }
}
```

- [ ] **Step 4: Rewrite the CLI main branch for scan + modes**

Replace the entire `if (process.argv[1] === fileURLToPath(import.meta.url)) { ... }` block with:

```js
// Guard: only execute CLI logic when run directly as main
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];

  if (arg === '--reset') {
    writeJsonFile(STATE_FILE, { version: 1, sessions: {} });
    console.log(`Reset watermark state at ${STATE_FILE}`);
    process.exit(0);
  }

  if (arg === '--commit') {
    const ids = (process.argv[3] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      console.error('--commit requires a comma-separated list of session IDs');
      process.exit(1);
    }
    const state = readJsonFile(STATE_FILE, { version: 1, sessions: {} });
    const pending = readJsonFile(PENDING_FILE, {});
    const next = mergeWatermark(state, pending, ids);
    writeJsonFile(STATE_FILE, next);
    console.log(`Committed watermark for ${ids.length} session(s).`);
    process.exit(0);
  }

  // Default: scan mode (all projects, watermark-filtered, newest-first)
  const nowMs = Date.now();
  const dirs = resolveAllProjectDirs();
  if (dirs.length === 0) {
    console.error(`No project dirs found under ${path.join(os.homedir(), '.claude', 'projects')}`);
    process.exit(1);
  }

  const state = readJsonFile(STATE_FILE, { version: 1, sessions: {} });
  const watermarkMap = watermarkMapFromState(state);

  const allLines = [];
  for (const dir of dirs) allLines.push(...readJsonlDir(dir));

  const filtered = filterTranscriptLines(allLines, nowMs, watermarkMap);
  const pending = maxTsPerSession(filtered);
  writeJsonFile(PENDING_FILE, pending);

  printGrouped(filtered);

  const sessionCount = Object.keys(pending).length;
  console.log(
    `\n--- ${filtered.length} new records across ${sessionCount} session(s) from ${dirs.length} project dir(s) ---`,
  );
}
```

- [ ] **Step 5: Manual verification (scan + commit + re-scan)**

```bash
# 1. Fresh state — full scan emits many sessions:
node probes/archaeology-prefilter.js --reset
node probes/archaeology-prefilter.js | tail -3   # note the session count, e.g. "across N session(s)"

# 2. Commit the watermark for one session id seen above (replace SID):
node probes/archaeology-prefilter.js --commit SID
node probes/archaeology-prefilter.js | tail -3   # session count should drop by ~1

# 3. Confirm state file written:
cat ~/.claude/session-archaeology/state.json
```

Expected: scan lists sessions newest-first with a trailing summary; after `--commit SID`, that session no longer appears
(its messages are at/before the watermark) and `state.json` contains its `lastScannedTs`.

- [ ] **Step 6: Run the full unit suite (no regressions)**

Run: `npm run test:unit` Expected: PASS (no source under `src/` changed; probe specs green).

- [ ] **Step 7: Commit**

```bash
git add probes/archaeology-prefilter.js
git commit -m "feat(05): all-projects scan, per-machine watermark state, newest-first, commit/reset modes"
```

---

### Task 5: Rewrite the skill for absolute-path probe, scan→batch→commit loop

**Files:**

- Modify: `.claude/skills/session-archaeology/SKILL.md`
- Modify: `.claude/commands/archaeology.md`

- [ ] **Step 1: Add an install/run header to the skill**

In `SKILL.md`, immediately after the `# Session Archaeology` H1, insert:

````markdown
## Install (one-time, global)

This skill is global via symlink from the omnifocus-mcp repo (single source of truth):

```bash
ln -sfn "$HOME/projects/omnifocus-mcp/.claude/skills/session-archaeology" "$HOME/.claude/skills/session-archaeology"
mkdir -p "$HOME/.claude/commands"
ln -sfn "$HOME/projects/omnifocus-mcp/.claude/commands/archaeology.md" "$HOME/.claude/commands/archaeology.md"
```
````

The probe is invoked by absolute path so the skill works from any cwd:
`$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js`.

```

- [ ] **Step 2: Replace Pass 1 Step 1 (probe invocation) for absolute path + scan mode**

In `SKILL.md`, replace the Step 1 fenced command:

```

node probes/archaeology-prefilter.js

```

with:

```

node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js"

````

And replace the Step 1 prose paragraph that begins "Run the pre-filter probe from the repo root." with:

```markdown
Run the pre-filter probe (scan mode) by absolute path. It enumerates ALL
`~/.claude/projects/*` transcript dirs, reads each session's `.jsonl`, applies the
D-03 strip rule and the D-02 7-day content-date window, AND drops any message at or
before that session's stored watermark (`~/.claude/session-archaeology/state.json`).
It emits only NEW records, grouped by session, newest-first, and writes a `pending`
watermark for this run. The trailing summary line reports how many new records and
sessions were found. If it reports zero sessions, there is nothing new since the last
run — say so and stop.
````

- [ ] **Step 3: Replace Pass 1 Step 5 + Step 6 (single gate) with the batch loop**

Replace the "**Step 5: Show ONE merged table (D-06)**" and "**Step 6: ONE gate (D-04, D-04a)**" sections with:

````markdown
**Step 5: Process in batches of 5 sessions, newest-first (resumable gate)**

Group the new sessions (probe output is already newest-first) into batches of **5**. For EACH batch, in order:

1. For each session in the batch, run Steps 2–4 (dedup-check candidates against the OF lineage backstop, detect loops,
   compute placement).
2. Show ONE merged table for this batch (session rows + per-loop placement rows, as below). Include a per-placement
   count and a batch task total.
3. Ask, in plain text (NOT `AskUserQuestion`): `Approve this batch? (yes / edit / abort)`
   - **abort** — stop the entire run. Do NOT commit this batch. Report what was done so far. Uncommitted batches
     re-surface next run.
   - **edit** — apply row-level corrections (drop/trim loops, override placement, remove a session row), re-show the
     batch table, ask again.
   - **yes** — create the approved loops (Pass 2), THEN commit this batch's watermark:
     ```
     node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js" --commit <sid1>,<sid2>,...
     ```
     Pass the session IDs of EVERY session in this batch (including sessions that yielded no loops — "reviewed-empty"
     still advances their watermark so they don't re-surface).
4. Continue to the next batch until all batches are processed.

Session-level rows (per batch):

| Session               | What it was about             | Open loops? | Count |
| --------------------- | ----------------------------- | ----------- | ----- |
| `<session_id_prefix>` | `<ai-title or agent summary>` | yes / no    | N     |

Per-loop rows (per batch, for sessions with loops):

| Loop                             | Proposed placement                                                |
| -------------------------------- | ----------------------------------------------------------------- |
| `<abstractive loop description>` | MATCH: `<project>` / INFER+CREATE: `<project>` / Inbox (fallback) |

If the probe returned zero new sessions, report "Nothing new since the last run." and stop.
````

- [ ] **Step 4: Update the tool-call reference + a Common-mistakes row**

In the "Tool call reference" table, replace the pre-filter row's call shape with:

```
`node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js"` (scan; absolute path) — emits NEW `{ session_id, timestamp, role, text }` records grouped by session, newest-first
```

Add a row below it:

```
| Commit a batch's watermark (after `yes`/reviewed-empty) | `node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js" --commit <sid,sid,…>` |
```

Add a Common-mistakes row:

```
| Committing the watermark on abort, or before tasks are created | Only `--commit` a batch AFTER `yes` (tasks created) or reviewed-empty. Never on abort/stop — uncommitted batches must re-surface. |
```

- [ ] **Step 5: Update the `/archaeology` command probe path**

In `.claude/commands/archaeology.md`, replace `node probes/archaeology-prefilter.js` with
`node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js"`.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/session-archaeology/SKILL.md .claude/commands/archaeology.md
git commit -m "feat(05): skill drives all-projects scan + per-batch resumable commit gate"
```

---

### Task 6: Global symlink install + end-to-end verification

**Files:** none committed (creates symlinks in `~/.claude/`)

- [ ] **Step 1: Create the global symlinks**

```bash
ln -sfn "$HOME/projects/omnifocus-mcp/.claude/skills/session-archaeology" "$HOME/.claude/skills/session-archaeology"
mkdir -p "$HOME/.claude/commands"
ln -sfn "$HOME/projects/omnifocus-mcp/.claude/commands/archaeology.md" "$HOME/.claude/commands/archaeology.md"
```

- [ ] **Step 2: Verify the symlinks resolve**

```bash
ls -l "$HOME/.claude/skills/session-archaeology" "$HOME/.claude/commands/archaeology.md"
test -f "$HOME/.claude/skills/session-archaeology/SKILL.md" && echo "skill resolves"
```

Expected: both are symlinks pointing into the repo; `SKILL.md` resolves through the link.

- [ ] **Step 3: Manual end-to-end (human, fresh session)**

In a BRAND-NEW Claude Code session started OUTSIDE this repo, type `/archaeology`. Expected: the skill loads, runs the
probe by absolute path across all projects, presents the first batch of 5 (newest-first), and a `yes` creates tasks +
advances the watermark. Re-running surfaces only newer content. (This is UAT Test 1 re-verification — record the result
in `05-HUMAN-UAT.md`.)

- [ ] **Step 4: Reset demo state if used during testing**

```bash
node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js" --reset   # optional: clear test watermark
```

---

## Self-Review

**Spec coverage:**

- Watermark dedup (Decision 1) → Task 1.
- Full-read (Decision 2) → preserved; no triage task added (correct).
- All-projects (Decision 3) → Task 4 Step 1/4.
- Global symlink install (Decision 4) → Task 5 Step 1, Task 6.
- Per-batch gate, 5, newest-first (Decision 5) → Task 4 Step 3 (ordering), Task 5 Step 3 (loop).
- Watermark advances only on resolved batch (Decision 6) → Task 5 Step 3, Common-mistakes row.
- OF lineage backstop (Decision 7) → Task 5 Step 3 item 1 (kept).
- State file shape → Task 4 Step 2.
- Probe modes scan/`--commit`/`--reset` → Task 4 Step 4.
- Testing (pure fns) → Tasks 1–3; CLI dir-resolution integration-only → Task 4 Step 5 (manual).

**Placeholder scan:** No TBD/TODO; all code shown; the only `<sid>` placeholders are runtime values the agent fills from
probe output (legitimate).

**Type consistency:** `filterTranscriptLines(lines, nowMs, watermarkMap)`, `maxTsPerSession(records)→{sid:iso}`,
`mergeWatermark(state, pending, sessionIds)→state`, state shape `{version, sessions:{[sid]:{lastScannedTs}}}`, pending
shape `{[sid]:iso}` — consistent across Tasks 1–5.
