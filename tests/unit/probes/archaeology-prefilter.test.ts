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
 * Reference nowMs: 2026-06-16T12:00:00.000Z = 1750075200000
 * 7-day cutoff:    2026-06-09T12:00:00.000Z = 1749470400000
 * All KEEP lines have timestamps on 2026-06-15 (within window).
 * The out-of-window line has timestamp 2026-06-01T08:00:00.000Z = 1748764800000 (outside window).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

// Import the probe as CommonJS (it uses module.exports, not ESM)
const require = createRequire(import.meta.url);
const { filterTranscriptLines } = require('../../../probes/archaeology-prefilter.js');

// Fixed reference time: 2026-06-16T12:00:00.000Z
const REFERENCE_NOW_MS = 1750075200000;

// Load and parse fixture
const fixturePath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../../tests/fixtures/archaeology/sample-transcript.jsonl',
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
    // Passing a farFuture reference should include the out-of-window line
    // (2026-06-01T08:00:00.000Z = 1748764800000; 7d before farFuture = 2199-01-01)
    const farFuture = Date.UTC(2199, 0, 1);
    const result = filterTranscriptLines(fixtureLines, farFuture);
    const ids = result.map((r: { session_id: string }) => r.session_id);
    // The out-of-window line should now pass (it's within 7d of year 2199)
    expect(ids).toContain('session-drop-out-of-window');
  });
});
