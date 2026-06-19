/**
 * Noise-strip spec for the archaeology pre-filter probe (D-03, D-02 windowing).
 *
 * The fixture transcript has 13 lines covering every filter decision branch:
 *   KEEP (3 lines):
 *     - session-keep-prose:          user line, string content (prose)
 *     - session-keep-text-array:     user line, content array containing a {type:'text'} item
 *     - session-keep-assistant-text: assistant line with a {type:'text'} item
 *
 *   DROP (10 lines):
 *     - session-drop-tool-result:     user with only {type:'tool_result'} in content array
 *     - session-drop-assistant-no-text: assistant with only tool_use + thinking (no text)
 *     - session-drop-attachment:      type='attachment'
 *     - session-drop-file-history:    type='file-history-snapshot'
 *     - session-drop-system:          type='system'
 *     - session-drop-mode:            type='mode'
 *     - session-drop-queue-op:        type='queue-operation'
 *     - session-drop-ai-title:        type='ai-title'
 *     - session-drop-sidechain:       isSidechain:true (D-02 exclusion)
 *     - session-drop-out-of-window:   timestamp 2026-06-01 (>7 days before reference)
 *
 * Reference nowMs: 2026-06-16T12:00:00.000Z = 1781611200000
 * 7-day cutoff:    2026-06-09T12:00:00.000Z = 1781006400000
 * All KEEP lines have timestamps on 2026-06-15 (within window).
 * The out-of-window line has timestamp 2026-06-01T08:00:00.000Z = 1748764800000 (outside window).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  filterTranscriptLines,
  extractCwdPerSession,
  deriveRepoLabel,
  formatAge,
  groupSessionsByRepo,
  formatProbeOutput,
  hasOpenLoopSignal,
  filterToOpenLoopRecords,
  truncateMessageText,
} from '../../../probes/archaeology-prefilter.js';

// Fixed reference time: 2026-06-16T12:00:00.000Z
const REFERENCE_NOW_MS = 1781611200000;

// Load and parse fixture
const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/archaeology/sample-transcript.jsonl',
);
const fixtureLines = fs
  .readFileSync(fixturePath, 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));

describe('filterTranscriptLines', () => {
  it('returns exactly the three KEEP records', () => {
    const result = filterTranscriptLines(fixtureLines, REFERENCE_NOW_MS);
    expect(result).toHaveLength(3);
  });

  it('every returned record has shape { session_id, timestamp, role, text } with non-empty text', () => {
    const result = filterTranscriptLines(fixtureLines, REFERENCE_NOW_MS);
    for (const rec of result) {
      expect(rec).toHaveProperty('session_id');
      expect(rec).toHaveProperty('timestamp');
      expect(rec).toHaveProperty('role');
      expect(rec).toHaveProperty('text');
      expect(typeof rec.text).toBe('string');
      expect(rec.text.length).toBeGreaterThan(0);
    }
  });

  it('keeps the user string-content prose line (session-keep-prose)', () => {
    const result = filterTranscriptLines(fixtureLines, REFERENCE_NOW_MS);
    const ids = result.map((r: { session_id: string }) => r.session_id);
    expect(ids).toContain('session-keep-prose');
  });

  it('keeps the user text-array line (session-keep-text-array)', () => {
    const result = filterTranscriptLines(fixtureLines, REFERENCE_NOW_MS);
    const ids = result.map((r: { session_id: string }) => r.session_id);
    expect(ids).toContain('session-keep-text-array');
  });

  it('keeps the assistant text line (session-keep-assistant-text)', () => {
    const result = filterTranscriptLines(fixtureLines, REFERENCE_NOW_MS);
    const ids = result.map((r: { session_id: string }) => r.session_id);
    expect(ids).toContain('session-keep-assistant-text');
  });

  it('drops the user tool_result-only line (session-drop-tool-result)', () => {
    const result = filterTranscriptLines(fixtureLines, REFERENCE_NOW_MS);
    const ids = result.map((r: { session_id: string }) => r.session_id);
    expect(ids).not.toContain('session-drop-tool-result');
  });

  it('drops the assistant no-text line (session-drop-assistant-no-text)', () => {
    const result = filterTranscriptLines(fixtureLines, REFERENCE_NOW_MS);
    const ids = result.map((r: { session_id: string }) => r.session_id);
    expect(ids).not.toContain('session-drop-assistant-no-text');
  });

  it('drops all noise-type lines (attachment, file-history-snapshot, system, mode, queue-operation, ai-title)', () => {
    const result = filterTranscriptLines(fixtureLines, REFERENCE_NOW_MS);
    const ids = result.map((r: { session_id: string }) => r.session_id);
    expect(ids).not.toContain('session-drop-attachment');
    expect(ids).not.toContain('session-drop-file-history');
    expect(ids).not.toContain('session-drop-system');
    expect(ids).not.toContain('session-drop-mode');
    expect(ids).not.toContain('session-drop-queue-op');
    expect(ids).not.toContain('session-drop-ai-title');
  });

  it('drops the isSidechain:true prose line (session-drop-sidechain)', () => {
    const result = filterTranscriptLines(fixtureLines, REFERENCE_NOW_MS);
    const ids = result.map((r: { session_id: string }) => r.session_id);
    expect(ids).not.toContain('session-drop-sidechain');
  });

  it('drops the out-of-window line (session-drop-out-of-window)', () => {
    const result = filterTranscriptLines(fixtureLines, REFERENCE_NOW_MS);
    const ids = result.map((r: { session_id: string }) => r.session_id);
    expect(ids).not.toContain('session-drop-out-of-window');
  });

  it('the probe function is pure: nowMs controls the window, not Date.now()', () => {
    // The out-of-window line has timestamp 2026-06-01T08:00:00.000Z.
    // Use a nowMs of 2026-06-07T12:00:00.000Z (6 days after) so the line is within 7d.
    // This proves nowMs is the window anchor, not Date.now() inside the function.
    const earlyNowMs = Date.UTC(2026, 5, 7, 12, 0, 0, 0); // 2026-06-07T12:00:00.000Z
    const result = filterTranscriptLines(fixtureLines, earlyNowMs);
    const ids = result.map((r: { session_id: string }) => r.session_id);
    // The out-of-window line (2026-06-01) is now within the 7-day window of 2026-06-07
    expect(ids).toContain('session-drop-out-of-window');
  });
});

// An in-window timestamp for synthetic lines (2026-06-15, within the 7-day window).
const IN_WINDOW_TS = '2026-06-15T10:00:00.000Z';

describe('extractText — multi-text-block concatenation (WR-01)', () => {
  it('concatenates all assistant text blocks when interleaved with tool_use', () => {
    const lines = [
      {
        type: 'assistant',
        sessionId: 'session-multi-text',
        timestamp: IN_WINDOW_TS,
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'FIRST block' },
            { type: 'tool_use', name: 'Read', input: {} },
            { type: 'text', text: 'SECOND block after tool' },
          ],
        },
      },
    ];
    const result = filterTranscriptLines(lines, REFERENCE_NOW_MS);
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain('FIRST block');
    expect(result[0].text).toContain('SECOND block after tool');
  });
});

describe('extractText — leading empty text block does not hide later content (WR-04)', () => {
  it('keeps content from a later block when the first text block is whitespace/empty', () => {
    const lines = [
      {
        type: 'assistant',
        sessionId: 'session-empty-first',
        timestamp: IN_WINDOW_TS,
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: '   ' },
            { type: 'tool_use', name: 'Bash', input: {} },
            { type: 'text', text: 'next: ship the dedup fix' },
          ],
        },
      },
    ];
    const result = filterTranscriptLines(lines, REFERENCE_NOW_MS);
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain('next: ship the dedup fix');
  });

  it('drops a message whose only text blocks are all whitespace/empty', () => {
    const lines = [
      {
        type: 'assistant',
        sessionId: 'session-all-empty',
        timestamp: IN_WINDOW_TS,
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: '   ' },
          ],
        },
      },
    ];
    const result = filterTranscriptLines(lines, REFERENCE_NOW_MS);
    expect(result).toHaveLength(0);
  });
});

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

describe('filterTranscriptLines — timestamp window fails closed (WR-02)', () => {
  it('drops a line with no timestamp field', () => {
    const lines = [
      {
        type: 'user',
        sessionId: 'session-no-timestamp',
        // no timestamp field
        message: { role: 'user', content: 'A prose message with no timestamp' },
      },
    ];
    const result = filterTranscriptLines(lines, REFERENCE_NOW_MS);
    expect(result).toHaveLength(0);
  });

  it('drops a line whose timestamp is an unparseable string', () => {
    const lines = [
      {
        type: 'user',
        sessionId: 'session-bad-timestamp',
        timestamp: 'not-a-date',
        message: { role: 'user', content: 'A prose message with a garbage timestamp' },
      },
    ];
    const result = filterTranscriptLines(lines, REFERENCE_NOW_MS);
    expect(result).toHaveLength(0);
  });

  it('drops a line whose timestamp is a non-string value', () => {
    const lines = [
      {
        type: 'user',
        sessionId: 'session-numeric-timestamp',
        timestamp: 1781611200000,
        message: { role: 'user', content: 'A prose message with a numeric timestamp' },
      },
    ];
    const result = filterTranscriptLines(lines, REFERENCE_NOW_MS);
    expect(result).toHaveLength(0);
  });

  it('still keeps a line with a valid in-window timestamp', () => {
    const lines = [
      {
        type: 'user',
        sessionId: 'session-valid-timestamp',
        timestamp: IN_WINDOW_TS,
        message: { role: 'user', content: 'A prose message with a valid timestamp' },
      },
    ];
    const result = filterTranscriptLines(lines, REFERENCE_NOW_MS);
    expect(result).toHaveLength(1);
    expect(result[0].session_id).toBe('session-valid-timestamp');
  });
});

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
  // Reference: 2026-06-18T15:00:00.000Z = 1781794800000
  const NOW = 1781794800000;

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

// --- groupSessionsByRepo ---
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
  // NOW: 2026-06-18T15:00:00.000Z = 1781794800000
  const NOW = 1781794800000;
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
    expect(groups[0].sessions[0].age).toBe('today'); // sid-a
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

// --- formatProbeOutput ---
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
            {
              session_id: 'abc123def456-full-uuid',
              timestamp: '2026-06-18T10:00:00.000Z',
              role: 'user',
              text: 'hi there',
            },
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
    const unattributed = [
      {
        label: 'Unattributed' as const,
        name: '-Users-j-home',
        newestTimestampMs: 1750000000000,
        sessions: [],
      },
    ];
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

// --- hasOpenLoopSignal ---
describe('hasOpenLoopSignal', () => {
  // Tier-1: park-skill markers
  it('matches "Parked." from branch-memory park output', () => {
    expect(hasOpenLoopSignal('Parked. Next session picks up at:')).toBe(true);
  });

  it('matches "picks up at" from park template', () => {
    expect(hasOpenLoopSignal('Next session picks up at:\n  1. Clone the repo')).toBe(true);
  });

  it('matches "queued below" from park template', () => {
    expect(hasOpenLoopSignal('Everything else (NR dashboards) is queued below those two.')).toBe(true);
  });

  it('matches "what\'s-next list" from park template', () => {
    expect(hasOpenLoopSignal("in the what's-next list")).toBe(true);
  });

  // Tier-2: GTD / planning language
  it('matches TODO (word boundary, case-insensitive)', () => {
    expect(hasOpenLoopSignal('Add a TODO here')).toBe(true);
    expect(hasOpenLoopSignal('todo: fix this')).toBe(true);
  });

  it('does not match TODO inside a URL or compound word', () => {
    // \bTODO\b should not match "TODOLIST" (no word boundary after)
    expect(hasOpenLoopSignal('See TODOLIST.md for details')).toBe(false);
  });

  it('matches "need to"', () => {
    expect(hasOpenLoopSignal('We need to finish the migration')).toBe(true);
  });

  it('matches "follow up"', () => {
    expect(hasOpenLoopSignal('Follow up with the infra team')).toBe(true);
  });

  it('matches "follow-up" (hyphenated)', () => {
    expect(hasOpenLoopSignal('A follow-up is required')).toBe(true);
  });

  it('matches "open question"', () => {
    expect(hasOpenLoopSignal('Open question: should we use SQLite here?')).toBe(true);
  });

  it('matches "come back to"', () => {
    expect(hasOpenLoopSignal('Come back to the auth refactor next sprint')).toBe(true);
  });

  it('matches "not yet"', () => {
    expect(hasOpenLoopSignal('Not yet implemented — see ROADMAP.md')).toBe(true);
  });

  it('does not match ordinary prose with no open-loop signal', () => {
    expect(hasOpenLoopSignal('The test passed and the build is green.')).toBe(false);
    expect(hasOpenLoopSignal('Here is the summary of what was done.')).toBe(false);
  });
});

// --- filterToOpenLoopRecords ---
describe('filterToOpenLoopRecords', () => {
  const ts = '2026-06-18T10:00:00.000Z';
  const mkRec = (session_id: string, text: string, role = 'assistant') => ({
    session_id,
    timestamp: ts,
    role,
    text,
  });

  it('returns empty array when no records match', () => {
    const records = [mkRec('s1', 'The refactor is complete.'), mkRec('s1', 'Tests pass.')];
    expect(filterToOpenLoopRecords(records)).toHaveLength(0);
  });

  it('session gate: discards a session with no signal even if other sessions qualify', () => {
    const records = [
      mkRec('s-clean', 'Everything is done.'),
      mkRec('s-signal', 'Parked. Next session picks up at: write the tests.'),
    ];
    const result = filterToOpenLoopRecords(records);
    expect(result.every((r) => r.session_id === 's-signal')).toBe(true);
    expect(result.some((r) => r.session_id === 's-clean')).toBe(false);
  });

  it('message filter: within a qualifying session, discards messages without a signal', () => {
    const records = [
      mkRec('s1', 'Here is an explanation of the architecture.'), // no signal
      mkRec('s1', 'need to revisit the error handling'), // signal
      mkRec('s1', 'The PR is merged.'), // no signal
    ];
    const result = filterToOpenLoopRecords(records);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('need to revisit the error handling');
  });

  it('keeps all signal-bearing messages across multiple sessions', () => {
    const records = [
      mkRec('sA', 'Parked. picks up at: step 1'),
      mkRec('sA', 'Clean message in same session'),
      mkRec('sB', 'TODO: add the dedup check'),
      mkRec('sC', 'Everything is done.'), // no signal — whole session excluded
    ];
    const result = filterToOpenLoopRecords(records);
    const ids = result.map((r) => r.session_id);
    expect(ids).toContain('sA');
    expect(ids).toContain('sB');
    expect(ids).not.toContain('sC');
    expect(result).toHaveLength(2); // only the signal messages, not "Clean message"
  });

  it('preserves session_id, timestamp, role, text shape on results', () => {
    const records = [mkRec('s1', 'TODO: check this', 'user')];
    const result = filterToOpenLoopRecords(records);
    expect(result[0]).toMatchObject({ session_id: 's1', timestamp: ts, role: 'user' });
    expect(result[0].text).toContain('TODO: check this');
  });

  it('excludes skill injection records (Base directory for this skill:) even if they contain keywords', () => {
    const skillInjection =
      'Base directory for this skill: /Users/j/.claude/skills/session-archaeology\n# Session Archaeology\nYou need to TODO run the probe.';
    const real = mkRec('s2', 'Parked. picks up at: write the filter tests.');
    const records = [mkRec('s1', skillInjection), real];
    const result = filterToOpenLoopRecords(records);
    expect(result.every((r) => r.session_id === 's2')).toBe(true);
  });

  it('excludes command invocation records (<command-message>) even if they contain keywords', () => {
    const cmdRecord = mkRec('s1', '<command-message>archaeology</command-message>\nneed to run TODO');
    const real = mkRec('s2', 'TODO: fix the parser');
    const records = [cmdRecord, real];
    const result = filterToOpenLoopRecords(records);
    expect(result.every((r) => r.session_id === 's2')).toBe(true);
  });

  it('tail-truncates long signal messages to MAX_MSG_CHARS (200)', () => {
    const longPrefix = 'x'.repeat(1000);
    const tail = ' TODO: fix this before merging';
    const records = [mkRec('s1', longPrefix + tail)];
    const result = filterToOpenLoopRecords(records);
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain('TODO: fix this before merging');
    expect(result[0].text.length).toBeLessThanOrEqual(220); // 200 chars + prefix label
    expect(result[0].text).toMatch(/^\[… \+\d+ chars\]/);
  });
});

// --- truncateMessageText ---
describe('truncateMessageText', () => {
  it('returns text unchanged when at or below 200 chars', () => {
    const short = 'a'.repeat(200);
    expect(truncateMessageText(short)).toBe(short);
  });

  it('truncates text longer than 200 chars keeping the tail', () => {
    const tail = 'TAIL';
    const long = 'x'.repeat(1000) + tail;
    const result = truncateMessageText(long);
    expect(result.endsWith(tail)).toBe(true);
    expect(result).toMatch(/^\[… \+\d+ chars\] /);
  });

  it('reports the correct dropped character count in the prefix', () => {
    const long = 'x'.repeat(300);
    const result = truncateMessageText(long);
    // dropped = 300 - 200 = 100
    expect(result).toMatch(/^\[… \+100 chars\]/);
  });
});
