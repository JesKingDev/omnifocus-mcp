# Archaeology Repo-Grouped Batching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current flat per-5-session batching in `probes/archaeology-prefilter.js` and
`session-archaeology/SKILL.md` with repo-grouped output and per-repo approval gates, so reviewing open loops from the
same project happens in a single context-efficient review.

**Architecture:** The probe gains five new pure exported functions (`extractCwdPerSession`, `deriveRepoLabel`,
`formatAge`, `groupSessionsByRepo`, `formatProbeOutput`) and a new CLI main path that calls them. The SKILL.md Step 1,
Step 5, review table, Pass 2 task-note format, and frontmatter description are all updated to match.
`filterTranscriptLines`, `maxTsPerSession`, and `mergeWatermark` are unchanged.

**Tech Stack:** Node.js ESM (existing probe), Vitest (existing test suite), TypeScript test files importing `.js` probe
exports.

## Global Constraints

- Probe file is `probes/archaeology-prefilter.js` — plain JavaScript ESM, no TypeScript. JSDoc for types.
- Test files are TypeScript (`tests/unit/probes/archaeology-prefilter.test.ts`).
- All new functions that are testable in isolation MUST be exported from the probe.
- The `.git` existence check must be injectable (passed as a function parameter) in `deriveRepoLabel` so tests don't
  touch the real filesystem.
- Existing exported functions (`filterTranscriptLines`, `maxTsPerSession`, `mergeWatermark`) are not modified — their
  existing tests must remain green throughout.
- Run `npm run test:unit` (not `npx vitest run`) to avoid sandbox false-failures.
- Never use `Date.now()` or `Math.random()` in pure functions — always pass `nowMs` from the CLI wrapper.
- The probe is `type: "module"` (ESM) — use `import`/`export`, not `require`.
- After all code tasks: update `SKILL.md` in a single commit.

---

## File Map

| File                                              | Change                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `probes/archaeology-prefilter.js`                 | Add 5 new exported pure functions; replace CLI `printGrouped` call |
| `tests/unit/probes/archaeology-prefilter.test.ts` | Add test suites for 5 new functions                                |
| `.claude/skills/session-archaeology/SKILL.md`     | Update frontmatter, Step 1, Step 5, review table, Pass 2 task note |

---

### Task 1: `extractCwdPerSession`, `deriveRepoLabel`, `formatAge` — pure utils + tests

**Files:**

- Modify: `probes/archaeology-prefilter.js` (add 3 exports after existing `mergeWatermark`)
- Modify: `tests/unit/probes/archaeology-prefilter.test.ts` (add 3 new `describe` blocks)

**Interfaces:**

- Produces:
  - `extractCwdPerSession(lines: object[]): Record<string, string>` — `{sessionId: cwd}`; first cwd seen per session
    wins; sessions with no cwd line are absent from the map.
  - `deriveRepoLabel(cwd: string, existsSyncFn: (p: string) => boolean): {name: string, label: 'Repo' | 'Unattributed'}`
    — basename + `.git` check.
  - `formatAge(timestampMs: number, nowMs: number): string` — `"today"`, `"yesterday"`, `"N days ago"`.

- [ ] **Step 1: Write the failing tests**

Add three new `describe` blocks to `tests/unit/probes/archaeology-prefilter.test.ts`:

```typescript
import {
  filterTranscriptLines,
  maxTsPerSession,
  mergeWatermark,
  extractCwdPerSession,
  deriveRepoLabel,
  formatAge,
} from '../../../probes/archaeology-prefilter.js';

// --- extractCwdPerSession ---
describe('extractCwdPerSession', () => {
  it('returns first cwd seen per session, ignores lines without cwd', () => {
    const lines = [
      { sessionId: 'aaa', type: 'queue-operation' }, // no cwd
      { sessionId: 'aaa', type: 'user', cwd: '/Users/j/projects/omnifocus-mcp' },
      { sessionId: 'aaa', type: 'assistant', cwd: '/Users/j/projects/omnifocus-mcp' },
      { sessionId: 'bbb', type: 'user', cwd: '/Users/j/projects/k8s-infra' },
      { sessionId: 'ccc', type: 'queue-operation' }, // ccc never gets cwd
    ];
    const result = extractCwdPerSession(lines);
    expect(result['aaa']).toBe('/Users/j/projects/omnifocus-mcp');
    expect(result['bbb']).toBe('/Users/j/projects/k8s-infra');
    expect(result['ccc']).toBeUndefined();
  });

  it('returns empty object when no lines have cwd', () => {
    const lines = [{ sessionId: 'x', type: 'queue-operation' }];
    expect(extractCwdPerSession(lines)).toEqual({});
  });

  it('ignores lines without sessionId', () => {
    const lines = [{ type: 'user', cwd: '/some/path' }];
    const result = extractCwdPerSession(lines);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// --- deriveRepoLabel ---
describe('deriveRepoLabel', () => {
  it('returns Repo label when cwd/.git exists', () => {
    const existsFn = (p: string) => p.endsWith('.git');
    const result = deriveRepoLabel('/Users/j/projects/omnifocus-mcp', existsFn);
    expect(result).toEqual({ name: 'omnifocus-mcp', label: 'Repo' });
  });

  it('returns Unattributed when cwd/.git does not exist', () => {
    const existsFn = (_p: string) => false;
    const result = deriveRepoLabel('/Users/j/projects/my-scratch', existsFn);
    expect(result).toEqual({ name: 'my-scratch', label: 'Unattributed' });
  });

  it('handles trailing slashes in cwd', () => {
    const existsFn = (p: string) => p.endsWith('.git');
    const result = deriveRepoLabel('/Users/j/projects/omnifocus-mcp/', existsFn);
    expect(result.name).toBe('omnifocus-mcp');
  });
});

// --- formatAge ---
describe('formatAge', () => {
  // Reference: 2026-06-18T15:00:00.000Z = 1750258800000
  const NOW = 1750258800000;

  it('returns "today" for timestamp within same calendar day', () => {
    const sameDay = new Date('2026-06-18T08:00:00.000Z').getTime();
    expect(formatAge(sameDay, NOW)).toBe('today');
  });

  it('returns "yesterday" for timestamp one calendar day ago', () => {
    const yesterday = new Date('2026-06-17T12:00:00.000Z').getTime();
    expect(formatAge(yesterday, NOW)).toBe('yesterday');
  });

  it('returns "2 days ago" for timestamp two days back', () => {
    const twoDaysAgo = new Date('2026-06-16T09:00:00.000Z').getTime();
    expect(formatAge(twoDaysAgo, NOW)).toBe('2 days ago');
  });

  it('returns "7 days ago" for the 7-day boundary', () => {
    const sevenDaysAgo = new Date('2026-06-11T15:00:00.000Z').getTime();
    expect(formatAge(sevenDaysAgo, NOW)).toBe('7 days ago');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail with "not a function" or import errors**

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep -A3 "extractCwdPerSession\|deriveRepoLabel\|formatAge"
```

Expected: import failures or "not a function" errors. If they silently pass, something is wrong.

- [ ] **Step 3: Implement `extractCwdPerSession`, `deriveRepoLabel`, `formatAge` in the probe**

In `probes/archaeology-prefilter.js`, add after the `mergeWatermark` export (before the CLI wrapper section):

```javascript
/**
 * Scan raw JSONL line objects and return { [sessionId]: firstCwdSeen }.
 * Runs over raw lines (before filtering) because cwd appears on all
 * message types, including some that filterTranscriptLines drops.
 *
 * @param {object[]} lines - Raw parsed JSONL objects.
 * @returns {Record<string, string>}
 */
export function extractCwdPerSession(lines) {
  const result = {};
  for (const line of lines) {
    const sid = line.sessionId;
    if (!sid) continue;
    if (result[sid] !== undefined) continue; // first cwd wins
    const cwd = line.cwd;
    if (typeof cwd === 'string' && cwd.length > 0) {
      result[sid] = cwd;
    }
  }
  return result;
}

/**
 * Given a cwd path and an existsSync-equivalent function, derive the
 * human-readable repo name and label.
 *
 * @param {string} cwd - Absolute directory path from the JSONL cwd field.
 * @param {(p: string) => boolean} existsSyncFn - Injectable filesystem check.
 * @returns {{ name: string, label: 'Repo' | 'Unattributed' }}
 */
export function deriveRepoLabel(cwd, existsSyncFn) {
  const name = path.basename(cwd.replace(/\/$/, ''));
  const isRepo = existsSyncFn(path.join(cwd.replace(/\/$/, ''), '.git'));
  return { name, label: isRepo ? 'Repo' : 'Unattributed' };
}

/**
 * Return a human-readable age string for a timestamp relative to nowMs.
 * Uses calendar-day distance (UTC date comparison), not 24-hour windows.
 *
 * @param {number} timestampMs - The event time in milliseconds.
 * @param {number} nowMs - Reference "now" in milliseconds.
 * @returns {string} "today" | "yesterday" | "N days ago"
 */
export function formatAge(timestampMs, nowMs) {
  // Use UTC dates to avoid local-timezone boundary surprises.
  const nowDate = new Date(nowMs);
  const tsDate = new Date(timestampMs);
  const nowDay = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
  const tsDay = Date.UTC(tsDate.getUTCFullYear(), tsDate.getUTCMonth(), tsDate.getUTCDate());
  const diffDays = Math.round((nowDay - tsDay) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}
```

- [ ] **Step 4: Run tests — all three new describe blocks pass, existing tests still green**

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep -E "✓|✗|PASS|FAIL|extractCwd|deriveRepo|formatAge"
```

Expected: all new tests PASS, zero regressions.

- [ ] **Step 5: Commit**

```bash
git add probes/archaeology-prefilter.js tests/unit/probes/archaeology-prefilter.test.ts
git commit -m "feat(archaeology): extractCwdPerSession, deriveRepoLabel, formatAge pure utils"
```

---

### Task 2: `groupSessionsByRepo` pure function + tests

**Files:**

- Modify: `probes/archaeology-prefilter.js` (add export after Task 1 additions)
- Modify: `tests/unit/probes/archaeology-prefilter.test.ts` (add describe block)

**Interfaces:**

- Consumes: `extractCwdPerSession` (T1), `deriveRepoLabel` (T1), `formatAge` (T1), `maxTsPerSession` (existing)
- Produces:

  ```
  groupSessionsByRepo(
    records: FilteredRecord[],
    cwdMap: Record<string, string>,
    sessionDirs: Record<string, string>,
    nowMs: number,
    existsSyncFn: (p: string) => boolean
  ): RepoGroup[]
  ```

  Where `RepoGroup` is:

  ```
  {
    label: 'Repo' | 'Unattributed',
    name: string,            // display name
    sessions: SessionGroup[],
    newestTimestampMs: number
  }
  ```

  And `SessionGroup` is:

  ```
  {
    sessionId: string,
    records: FilteredRecord[],
    newestTimestampMs: number,
    dateStr: string,   // YYYY-MM-DD from newestTimestampMs
    age: string        // "today" | "yesterday" | "N days ago"
  }
  ```

  Repos sorted newest-first by their `newestTimestampMs`. Sessions within each repo sorted newest-first.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/probes/archaeology-prefilter.test.ts`:

```typescript
import { ..., groupSessionsByRepo } from '../../../probes/archaeology-prefilter.js';

describe('groupSessionsByRepo', () => {
  // Two sessions from omnifocus-mcp (different ages), one from k8s-infra
  const records = [
    { session_id: 'sid-a', timestamp: '2026-06-18T10:00:00.000Z', role: 'user', text: 'hello' },
    { session_id: 'sid-a', timestamp: '2026-06-18T10:05:00.000Z', role: 'assistant', text: 'world' },
    { session_id: 'sid-b', timestamp: '2026-06-16T09:00:00.000Z', role: 'user', text: 'foo' },
    { session_id: 'sid-c', timestamp: '2026-06-17T14:00:00.000Z', role: 'user', text: 'bar' },
  ];
  const cwdMap = {
    'sid-a': '/Users/j/projects/omnifocus-mcp',
    'sid-b': '/Users/j/projects/omnifocus-mcp',
    'sid-c': '/Users/j/projects/k8s-infra',
  };
  const sessionDirs = {
    'sid-a': '-Users-j-projects-omnifocus-mcp',
    'sid-b': '-Users-j-projects-omnifocus-mcp',
    'sid-c': '-Users-j-projects-k8s-infra',
  };
  // NOW: 2026-06-18T15:00:00.000Z
  const NOW = 1750258800000;
  // existsFn: treat /Users/j/projects/... as repos (has .git)
  const existsFn = (p: string) => p.includes('/projects/') && p.endsWith('.git');

  let groups: ReturnType<typeof groupSessionsByRepo>;
  beforeEach(() => {
    groups = groupSessionsByRepo(records, cwdMap, sessionDirs, NOW, existsFn);
  });

  it('returns two repo groups', () => {
    expect(groups).toHaveLength(2);
  });

  it('orders repos newest-first (omnifocus-mcp has sid-a from today, k8s-infra from yesterday)', () => {
    expect(groups[0].name).toBe('omnifocus-mcp');
    expect(groups[1].name).toBe('k8s-infra');
  });

  it('labels both groups as Repo (have .git)', () => {
    expect(groups[0].label).toBe('Repo');
    expect(groups[1].label).toBe('Repo');
  });

  it('omnifocus-mcp group has two sessions, newest first', () => {
    const g = groups[0];
    expect(g.sessions).toHaveLength(2);
    expect(g.sessions[0].sessionId).toBe('sid-a'); // newest
    expect(g.sessions[1].sessionId).toBe('sid-b'); // older
  });

  it('session age values are correct', () => {
    expect(groups[0].sessions[0].age).toBe('today');    // sid-a
    expect(groups[0].sessions[1].age).toBe('2 days ago'); // sid-b (2026-06-16)
    expect(groups[1].sessions[0].age).toBe('yesterday'); // sid-c (2026-06-17)
  });

  it('session dateStr is YYYY-MM-DD format', () => {
    expect(groups[0].sessions[0].dateStr).toBe('2026-06-18');
    expect(groups[0].sessions[1].dateStr).toBe('2026-06-16');
  });

  it('sessions without cwd fall under Unattributed with encoded dirname', () => {
    const noCwdRecords = [
      { session_id: 'sid-orphan', timestamp: '2026-06-17T08:00:00.000Z', role: 'user', text: 'orphan' },
    ];
    const result = groupSessionsByRepo(noCwdRecords, {}, { 'sid-orphan': '-Users-j-home' }, NOW, existsFn);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Unattributed');
    expect(result[0].name).toBe('-Users-j-home');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep -A5 "groupSessionsByRepo"
```

- [ ] **Step 3: Implement `groupSessionsByRepo`**

Add to `probes/archaeology-prefilter.js` after the `formatAge` export:

```javascript
/**
 * Group filtered records by repo, ordered newest-repo-first,
 * sessions newest-first within each repo.
 *
 * @param {Array<{session_id: string, timestamp: string, role: string, text: string}>} records
 * @param {Record<string, string>} cwdMap - { sessionId: cwdPath } from extractCwdPerSession
 * @param {Record<string, string>} sessionDirs - { sessionId: encodedDirname } fallback
 * @param {number} nowMs
 * @param {(p: string) => boolean} existsSyncFn
 * @returns {Array<{label: 'Repo'|'Unattributed', name: string, sessions: object[], newestTimestampMs: number}>}
 */
export function groupSessionsByRepo(records, cwdMap, sessionDirs, nowMs, existsSyncFn) {
  // Build per-session record groups and determine newest timestamp per session.
  const bySession = new Map();
  for (const rec of records) {
    const sid = rec.session_id;
    if (!sid) continue;
    if (!bySession.has(sid)) bySession.set(sid, { records: [], newestTimestampMs: 0 });
    const entry = bySession.get(sid);
    entry.records.push(rec);
    const tsMs = Date.parse(rec.timestamp);
    if (!isNaN(tsMs) && tsMs > entry.newestTimestampMs) entry.newestTimestampMs = tsMs;
  }

  // Map each session to a repo key (prefer cwd, fall back to encoded dirname).
  const repoMap = new Map(); // repoKey → { label, name, sessions[], newestTimestampMs }
  for (const [sid, session] of bySession.entries()) {
    const cwd = cwdMap[sid];
    let label, name;
    if (cwd) {
      const derived = deriveRepoLabel(cwd, existsSyncFn);
      label = derived.label;
      name = derived.name;
    } else {
      label = 'Unattributed';
      name = sessionDirs[sid] || sid;
    }
    const repoKey = `${label}:${name}`;

    if (!repoMap.has(repoKey)) {
      repoMap.set(repoKey, { label, name, sessions: [], newestTimestampMs: 0 });
    }
    const repo = repoMap.get(repoKey);

    // Compute date string and age for this session.
    const tsMs = session.newestTimestampMs;
    const dateStr = new Date(tsMs).toISOString().slice(0, 10);
    const age = formatAge(tsMs, nowMs);

    repo.sessions.push({ sessionId: sid, records: session.records, newestTimestampMs: tsMs, dateStr, age });
    if (tsMs > repo.newestTimestampMs) repo.newestTimestampMs = tsMs;
  }

  // Sort repos newest-first; sessions within each repo newest-first.
  const groups = [...repoMap.values()].sort((a, b) => b.newestTimestampMs - a.newestTimestampMs);
  for (const group of groups) {
    group.sessions.sort((a, b) => b.newestTimestampMs - a.newestTimestampMs);
  }
  return groups;
}
```

- [ ] **Step 4: Run tests — new suite passes, no regressions**

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep -E "✓|✗|PASS|FAIL|groupSessions"
```

- [ ] **Step 5: Commit**

```bash
git add probes/archaeology-prefilter.js tests/unit/probes/archaeology-prefilter.test.ts
git commit -m "feat(archaeology): groupSessionsByRepo pure function"
```

---

### Task 3: `formatProbeOutput` pure function + tests

**Files:**

- Modify: `probes/archaeology-prefilter.js` (add export after Task 2)
- Modify: `tests/unit/probes/archaeology-prefilter.test.ts` (add describe block)

**Interfaces:**

- Consumes: `groupSessionsByRepo` output (T2)
- Produces:

  ```
  formatProbeOutput(
    repoGroups: RepoGroup[],
    totalRecords: number,
    totalSessions: number,
    totalDirs: number
  ): string
  ```

  String matches the spec format exactly (see Task 3 step 1 for the spec).

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/probes/archaeology-prefilter.test.ts`:

```typescript
import { ..., formatProbeOutput } from '../../../probes/archaeology-prefilter.js';

describe('formatProbeOutput', () => {
  const groups = [
    {
      label: 'Repo' as const,
      name: 'omnifocus-mcp',
      newestTimestampMs: 1750258800000,
      sessions: [
        {
          sessionId: 'abc123def456-full-uuid',
          newestTimestampMs: 1750258800000,
          dateStr: '2026-06-18',
          age: 'today',
          records: [
            { session_id: 'abc123def456-full-uuid', timestamp: '2026-06-18T10:00:00.000Z', role: 'user', text: 'hi there' },
          ],
        },
      ],
    },
  ];

  it('contains the repo header line', () => {
    const out = formatProbeOutput(groups, 1, 1, 3);
    expect(out).toContain('=== Repo: omnifocus-mcp ===');
  });

  it('contains the session header with uuid, date, and age', () => {
    const out = formatProbeOutput(groups, 1, 1, 3);
    expect(out).toContain('--- Session: abc123def456-full-uuid | 2026-06-18 (today) ---');
  });

  it('contains message lines with timestamp, role, text', () => {
    const out = formatProbeOutput(groups, 1, 1, 3);
    expect(out).toContain('[2026-06-18T10:00:00.000Z] user: hi there');
  });

  it('contains the summary line with correct repo count', () => {
    const out = formatProbeOutput(groups, 1, 1, 3);
    expect(out).toContain('--- 1 new records across 1 session(s) in 1 repo(s) from 3 project dir(s) ---');
  });

  it('uses Unattributed prefix for unattributed groups', () => {
    const unattributed = [{
      label: 'Unattributed' as const,
      name: '-Users-j-home',
      newestTimestampMs: 1750000000000,
      sessions: [],
    }];
    const out = formatProbeOutput(unattributed, 0, 0, 1);
    expect(out).toContain('=== Unattributed: -Users-j-home ===');
  });

  it('excludes unattributed groups from the Repo count in summary', () => {
    const mixedGroups = [
      { label: 'Repo' as const, name: 'myrepo', newestTimestampMs: 0, sessions: [] },
      { label: 'Unattributed' as const, name: '-Users-j-x', newestTimestampMs: 0, sessions: [] },
    ];
    const out = formatProbeOutput(mixedGroups, 0, 0, 2);
    expect(out).toContain('in 1 repo(s)');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep -A5 "formatProbeOutput"
```

- [ ] **Step 3: Implement `formatProbeOutput`**

Add to `probes/archaeology-prefilter.js` after `groupSessionsByRepo`:

```javascript
/**
 * Format grouped repo sessions into the human-readable probe output string.
 *
 * @param {Array<{label: 'Repo'|'Unattributed', name: string, sessions: object[]}>} repoGroups
 * @param {number} totalRecords - Total filtered record count this scan.
 * @param {number} totalSessions - Total session count (sum of sessions across all repos).
 * @param {number} totalDirs - Number of project dirs scanned.
 * @returns {string}
 */
export function formatProbeOutput(repoGroups, totalRecords, totalSessions, totalDirs) {
  const parts = [];

  for (const group of repoGroups) {
    const prefix = group.label === 'Repo' ? 'Repo' : 'Unattributed';
    parts.push(`\n=== ${prefix}: ${group.name} ===\n`);
    for (const session of group.sessions) {
      parts.push(`  --- Session: ${session.sessionId} | ${session.dateStr} (${session.age}) ---`);
      for (const rec of session.records) {
        parts.push(`  [${rec.timestamp}] ${rec.role}: ${rec.text}`);
      }
      parts.push('');
    }
  }

  const repoCount = repoGroups.filter((g) => g.label === 'Repo').length;
  const summaryLine = `\n--- ${totalRecords} new records across ${totalSessions} session(s) in ${repoCount} repo(s) from ${totalDirs} project dir(s) ---\n`;
  parts.push(summaryLine);

  return parts.join('\n');
}
```

- [ ] **Step 4: Run tests — all new tests pass, no regressions**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: all tests pass, count is higher than before (the new describe blocks added ~11 assertions).

- [ ] **Step 5: Commit**

```bash
git add probes/archaeology-prefilter.js tests/unit/probes/archaeology-prefilter.test.ts
git commit -m "feat(archaeology): formatProbeOutput pure function"
```

---

### Task 4: Wire CLI — replace `printGrouped` with new repo-grouped pipeline

**Files:**

- Modify: `probes/archaeology-prefilter.js` (CLI main block only — the section under the `if (process.argv[1] === ...)`
  guard)

**Interfaces:**

- Consumes: `extractCwdPerSession` (T1), `groupSessionsByRepo` (T2), `formatProbeOutput` (T3), all existing exported
  functions.
- No new exports — this is the CLI entry point.

No new unit tests (CLI I/O path is not unit-testable without a subprocess harness). Manual smoke verification below.

- [ ] **Step 1: Locate the existing scan mode block (do not touch `--reset` or `--commit` branches)**

In `probes/archaeology-prefilter.js`, find the scan-mode block starting at:

```javascript
// Default: scan mode (all projects, watermark-filtered, newest-first)
const nowMs = Date.now();
```

This block ends at the closing `}` of the `if (process.argv[1] === ...)` guard. Only this section changes.

- [ ] **Step 2: Replace the scan-mode block**

Current block to replace (starting from the comment `// Default: scan mode` through `}`):

```javascript
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
const sessionDirs = {};
for (const dir of dirs) {
  const lines = readJsonlDir(dir);
  const base = path.basename(dir);
  for (const l of lines) {
    if (l.sessionId && !sessionDirs[l.sessionId]) sessionDirs[l.sessionId] = base;
  }
  allLines.push(...lines);
}

const filtered = filterTranscriptLines(allLines, nowMs, watermarkMap);
const pending = maxTsPerSession(filtered);
try {
  writeJsonFile(PENDING_FILE, pending);
} catch (err) {
  console.error(`Failed to write pending watermark at ${PENDING_FILE}: ${err.message}`);
  process.exit(1);
}

const sessionCount = Object.keys(pending).length;
const groupedOutput = printGrouped(filtered, sessionDirs);
const summaryLine = `\n--- ${filtered.length} new records across ${sessionCount} session(s) from ${dirs.length} project dir(s) ---`;
const fullOutput = groupedOutput + '\n' + summaryLine + '\n';

process.stdout.write(fullOutput);

try {
  fs.writeFileSync(SCAN_OUTPUT_FILE, fullOutput);
} catch (err) {
  process.stderr.write(`Warning: could not write scan output to ${SCAN_OUTPUT_FILE}: ${err.message}\n`);
}
```

Replace with:

```javascript
// Default: scan mode (all projects, watermark-filtered, repo-grouped, newest-first)
const nowMs = Date.now();
const dirs = resolveAllProjectDirs();
if (dirs.length === 0) {
  console.error(`No project dirs found under ${path.join(os.homedir(), '.claude', 'projects')}`);
  process.exit(1);
}

const state = readJsonFile(STATE_FILE, { version: 1, sessions: {} });
const watermarkMap = watermarkMapFromState(state);

const allLines = [];
const sessionDirs = {};
for (const dir of dirs) {
  const lines = readJsonlDir(dir);
  const base = path.basename(dir);
  for (const l of lines) {
    if (l.sessionId && !sessionDirs[l.sessionId]) sessionDirs[l.sessionId] = base;
  }
  allLines.push(...lines);
}

// Extract cwd mapping from raw lines BEFORE filtering (cwd appears on all
// message types, including types that filterTranscriptLines drops).
const cwdMap = extractCwdPerSession(allLines);

const filtered = filterTranscriptLines(allLines, nowMs, watermarkMap);
const pending = maxTsPerSession(filtered);
try {
  writeJsonFile(PENDING_FILE, pending);
} catch (err) {
  console.error(`Failed to write pending watermark at ${PENDING_FILE}: ${err.message}`);
  process.exit(1);
}

const repoGroups = groupSessionsByRepo(filtered, cwdMap, sessionDirs, nowMs, fs.existsSync);
const totalSessions = repoGroups.reduce((n, g) => n + g.sessions.length, 0);
const fullOutput = formatProbeOutput(repoGroups, filtered.length, totalSessions, dirs.length);

process.stdout.write(fullOutput);

try {
  fs.writeFileSync(SCAN_OUTPUT_FILE, fullOutput);
} catch (err) {
  process.stderr.write(`Warning: could not write scan output to ${SCAN_OUTPUT_FILE}: ${err.message}\n`);
}
```

Note: `printGrouped` is no longer called. You may remove the `printGrouped` function entirely (it is not exported and
has no unit tests). If you prefer to keep it for reference during review, leave it and remove in a follow-up.

- [ ] **Step 3: Run unit tests to confirm nothing broke**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: all tests pass (same count as after Task 3).

- [ ] **Step 4: Manual smoke test — run the probe, verify new output format**

```bash
node /Users/jessicaking/projects/omnifocus-mcp/probes/archaeology-prefilter.js | head -40
```

Expected output starts with something like:

```
=== Repo: omnifocus-mcp ===

  --- Session: <uuid> | 2026-06-18 (today) ---
  [2026-06-18T...] user: ...
```

Check:

- At least one `=== Repo: <name> ===` header
- Session headers have `| YYYY-MM-DD (age)` format
- Summary line ends with `in N repo(s) from D project dir(s)`

If `scan-output.txt` is written, verify it matches:

```bash
head -20 ~/.claude/session-archaeology/scan-output.txt
```

- [ ] **Step 5: Commit**

```bash
git add probes/archaeology-prefilter.js
git commit -m "feat(archaeology): wire CLI to repo-grouped output format"
```

---

### Task 5: SKILL.md updates

**Files:**

- Modify: `.claude/skills/session-archaeology/SKILL.md`

No tests (skill file is prose). Changes are all text; none touch the probe's logic.

- [ ] **Step 1: Update frontmatter `description` field**

Find:

```yaml
description:
  Use ONLY when Jess explicitly uses the word "archaeology" — e.g. "archaeology", "session archaeology", "run
  archaeology", "archaeology scan", "dig up open loops (archaeology)". The trigger word is deliberately distinctive so it
  never collides with conversational phrases. Do NOT trigger on generic phrasing like "scan my sessions", "find open
  loops", or "what did I forget" — those collide with other skills (e.g. remember) and must NOT route here unless the
  word "archaeology" is present. Scans the last 7 days of active Claude Code transcripts for unresolved open loops via the
  pre-filter probe, presents resumable per-batch (5-session) summarize-then-approve gates, and on approval creates
  archaeology-tagged OmniFocus tasks in the right project (or inbox fallback). Deterministic alias: Jess can also type
  the slash invocation `/session-archaeology`.
```

Replace with:

```yaml
description:
  Use ONLY when Jess explicitly uses the word "archaeology" — e.g. "archaeology", "session archaeology", "run
  archaeology", "archaeology scan", "dig up open loops (archaeology)". The trigger word is deliberately distinctive so it
  never collides with conversational phrases. Do NOT trigger on generic phrasing like "scan my sessions", "find open
  loops", or "what did I forget" — those collide with other skills (e.g. remember) and must NOT route here unless the
  word "archaeology" is present. Scans the last 7 days of active Claude Code transcripts for unresolved open loops via the
  pre-filter probe, presents resumable repo-grouped summarize-then-approve gates (one per repo, newest-repo-first), and
  on approval creates archaeology-tagged OmniFocus tasks in the right project (or inbox fallback). Deterministic alias:
  Jess can also type the slash invocation `/session-archaeology`.
```

- [ ] **Step 2: Update D-06 reference in the key design decisions list**

Find the line:

```
- **D-06 per-batch gate** — one merged table (session + loops + proposed placement) per batch of 5 sessions; one
  `yes / edit / abort` per batch (revises the original single-gate D-06 for the all-projects scope so a large scan stays
  digestible and resumable); routing proposal computed inline without chaining `route-inbox-to-projects`.
```

Replace with:

```
- **D-06 per-repo gate** — one merged table (session + loops + proposed placement) per repo, newest-repo-first; one
  `AskUserQuestion` per repo so a large scan stays digestible and resumable by natural project context; routing proposal
  computed inline without chaining `route-inbox-to-projects`.
```

- [ ] **Step 3: Update Step 1 probe output description**

Find:

```
Run the pre-filter probe (scan mode) by absolute path. It enumerates ALL `~/.claude/projects/*` transcript dirs, reads
each session's `.jsonl`, applies the D-03 strip rule and the D-02 7-day content-date window, AND drops any message at or
before that session's stored watermark (`~/.claude/session-archaeology/state.json`). It emits only NEW records, grouped
by session, newest-first, and writes a `pending` watermark for this run. The trailing summary line reports how many new
records and sessions were found. If it reports zero sessions, there is nothing new since the last run — say so and stop.
```

Replace with:

```
Run the pre-filter probe (scan mode) by absolute path. It enumerates ALL `~/.claude/projects/*` transcript dirs, reads
each session's `.jsonl`, applies the D-03 strip rule and the D-02 7-day content-date window, AND drops any message at or
before that session's stored watermark (`~/.claude/session-archaeology/state.json`). It emits only NEW records, **grouped
by repo** (newest-repo-first, sessions newest-first within each repo), and writes a `pending` watermark for this run.

Output format:

```

=== Repo: <repo-name> ===

--- Session: <uuid> | YYYY-MM-DD (age) --- [timestamp] role: text ...

=== Unattributed: <encoded-dirname> === ...

--- N new records across S session(s) in R repo(s) from D project dir(s) ---

```

The trailing summary line reports total records, sessions, repos, and project dirs. If it reports zero sessions, there
is nothing new since the last run — say so and stop.
```

Note: the opening ` ```  ` fence after "Output format:" continues inside the SKILL.md prose — write it as a literal
fenced block in the markdown.

- [ ] **Step 4: Update Step 5 (per-repo gate) — replace the entire step**

Find the entire Step 5 section (from `**Step 5: Process in batches of 5 sessions, newest-first (resumable gate)**`
through the closing table and paragraph before `### Pass 2`):

````markdown
**Step 5: Process in batches of 5 sessions, newest-first (resumable gate)**

Group the new sessions (probe output is already newest-first) into batches of **5**. For EACH batch, in order:

1. Read the active project list ONCE for the whole run (Step 4) and reuse it for every batch and session — do NOT
   re-read it per session (OmniFocus queries take 10+ seconds). Then, for each session in the batch, detect loops
   (Step 3) and compute placement against that already-loaded project list (Step 4 ladder) + the OF lineage dedup
   backstop.
2. Show ONE merged table for this batch (session rows + per-loop placement rows, as below). Include a per-placement
   count and a batch task total.
3. Present an `AskUserQuestion` approval gate with the question "Approve this batch?" and two options:
   - **Approve** (first/default — recommended): create the approved loops (Pass 2), THEN commit this batch's watermark:
     ```
     node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js" --commit <sid1>,<sid2>,...
     ```
     Use the FULL session UUIDs from the `=== Session: <uuid> [<project>] ===` probe output headers — never the
     shortened prefix shown in the table (a prefix is absent from the pending watermark and `--commit` will reject it).
     Pass the session IDs of EVERY session in this batch (including sessions that yielded no loops — "reviewed-empty"
     still advances their watermark so they don't re-surface).
   - **Abort**: stop the entire run. Do NOT commit this batch. Report what was done so far. Uncommitted batches
     re-surface next run.

   The built-in **Other** option covers row-level edits: apply the user's corrections (drop/trim loops, override
   placement, remove a session row), re-show the batch table, and present the gate again.

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

Replace the entire Step 5 with:

````markdown
**Step 5: Process one repo at a time, newest-repo-first (resumable gate)**

The probe output is already grouped by repo. Process each repo section in order (newest repo first). For EACH repo:

1. Read the active project list ONCE for the whole run (Step 4) and reuse it for all repos and sessions — do NOT re-read
   it per repo or per session (OmniFocus queries take 10+ seconds). Then, for each session in this repo's section,
   detect loops (Step 3) and compute placement against that project list (Step 4 ladder) + the OF lineage dedup
   backstop.
2. Show ONE merged table for this repo (session rows + per-loop placement rows, as below). Include the repo name,
   session ages, a per-placement count, and the total task count for this repo.
3. Present an `AskUserQuestion` approval gate with the question `"Approve all loops from **<repo>**?"` and two options:
   - **Approve** (first/default — recommended): create the approved loops (Pass 2), THEN commit this repo's sessions'
     watermarks:
     ```
     node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js" --commit <sid1>,<sid2>,...
     ```
     Use the FULL session UUIDs from the `--- Session: <uuid> | ...` probe output headers — never the shortened prefix
     shown in the table. Pass the session IDs of EVERY session in this repo section (including sessions that yielded no
     loops — "reviewed-empty" still advances their watermark so they don't re-surface).
   - **Abort**: stop the entire run. Do NOT commit this repo. Report what was done so far. Uncommitted repos re-surface
     next run.

   The built-in **Other** option covers row-level edits: apply corrections (drop/trim loops, override placement, remove
   a session row), re-show the repo table, and present the gate again.

4. Continue to the next repo until all repos are processed.

Session-level rows (per repo):

| Session               | Repo          | Age     | What it was about             | Open loops? | Count |
| --------------------- | ------------- | ------- | ----------------------------- | ----------- | ----- |
| `<session_id_prefix>` | `<repo-name>` | `<age>` | `<ai-title or agent summary>` | yes / no    | N     |

Per-loop rows (per repo, for sessions with loops):

| Loop                             | Proposed placement                                                |
| -------------------------------- | ----------------------------------------------------------------- |
| `<abstractive loop description>` | MATCH: `<project>` / INFER+CREATE: `<project>` / Inbox (fallback) |

If the probe returned zero new sessions, report "Nothing new since the last run." and stop.
````

- [ ] **Step 5: Update Pass 2 task note format**

Find:

```jsonc
      "note": "<context: originating session, what was left unresolved, relevant detail>",
```

Replace with:

```jsonc
      "note": "<context: what was left unresolved, relevant detail>\n\nRepo: <repo-name>\nSession: <YYYY-MM-DD> (<age>)",
```

And update the surrounding prose note that explains the note format. Find the paragraph after the `omnifocus_write` JSON
block that says:

```
Key server behaviors triggered (verified against `OmniFocusWriteTool.ts`):
```

Just before that paragraph, insert:

```markdown
The task note format is:
```

<context: what was left unresolved, relevant detail>

Repo: <repo-name> Session: <YYYY-MM-DD> (<age>)

<!-- of-mcp:lineage ... -->

```

The `Repo:` and `Session:` lines come from the probe output's repo group and session header. The lineage block is appended automatically by the server's `lineage` param.
```

- [ ] **Step 6: Update the Tool call reference table probe description**

Find:

```markdown
| Pre-filter + group by session | `node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js"` (scan; absolute
path) — emits NEW `{ session_id, timestamp, role, text }` records grouped by session, newest-first |
```

Replace with:

```markdown
| Pre-filter + group by repo | `node "$HOME/projects/omnifocus-mcp/probes/archaeology-prefilter.js"` (scan; absolute
path) — emits NEW records grouped by repo (newest-repo-first, sessions newest-first within each repo), with session age
in headers |
```

- [ ] **Step 7: Update Common mistakes table — remove stale "per 5 sessions" row, add per-repo row**

In the Common mistakes table, find the row:

```
| Applying a second approval gate                        | There is exactly one gate per batch (Step 5). Do not add a second "Are you sure?" after `yes`.                                                                                     |
```

Replace with:

```
| Applying a second approval gate                        | There is exactly one gate per repo (Step 5). Do not add a second "Are you sure?" after approving a repo.                                                                          |
```

- [ ] **Step 8: Run unit tests one final time to confirm no probe changes snuck in**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: all tests still pass.

- [ ] **Step 9: Commit**

```bash
git add .claude/skills/session-archaeology/SKILL.md
git commit -m "feat(archaeology): SKILL.md repo-grouped gates, updated Step 1/5/Pass2/tables"
```

---

## Self-Review

### Spec coverage check

| Spec requirement                                                            | Task                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------- | --- |
| Probe groups by repo, repo newest-first, sessions newest-first within repo  | T2, T4                                               |
| Repo name from `basename(cwd)`, `.git` check for Repo vs Unattributed label | T1                                                   |
| Fallback to raw encoded dirname when no cwd available                       | T2                                                   |
| Session header: `--- Session: <uuid>                                        | YYYY-MM-DD (age) ---`                                | T3  |
| Age buckets: today / yesterday / N days ago                                 | T1                                                   |
| Summary line includes repo count: `in R repo(s)`                            | T3                                                   |
| `scan-output.txt` receives same grouped output                              | T4                                                   |
| SKILL.md Step 1: updated probe output description                           | T5                                                   |
| SKILL.md Step 5: one repo per gate, "Approve all loops from **\<repo\>**?"  | T5                                                   |
| Review table: Repo + Age columns on session rows                            | T5                                                   |
| Pass 2 task note: `Repo: <name>` + `Session: <date> (<age>)`                | T5                                                   |
| Frontmatter description updated (no "per-batch (5-session)")                | T5                                                   |
| No defer/due date set on tasks                                              | not changed — existing Pass 2 has no date; confirmed |
| Unattributed sessions grouped under raw encoded dirname                     | T2, T3                                               |

All spec requirements are covered.

### No placeholders

All code blocks in the plan contain complete implementations. No "TODO" or "add appropriate handling" phrases.

### Type consistency

- `groupSessionsByRepo` returns objects with `{ label, name, sessions, newestTimestampMs }`.
- `formatProbeOutput` consumes `repoGroups` with the same shape.
- `session` objects inside groups have `{ sessionId, records, newestTimestampMs, dateStr, age }`.
- `deriveRepoLabel` is called inside `groupSessionsByRepo` — same signature as defined in T1.
- `formatAge` is called inside `groupSessionsByRepo` — same `(timestampMs, nowMs)` signature as T1.
- `extractCwdPerSession` is called in the CLI wrapper (T4) — takes raw `allLines`, returns `Record<string, string>`.
