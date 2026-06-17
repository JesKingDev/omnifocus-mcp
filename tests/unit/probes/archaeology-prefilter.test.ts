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

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { filterTranscriptLines } from '../../../probes/archaeology-prefilter.js';

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
