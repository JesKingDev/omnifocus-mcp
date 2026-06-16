/**
 * Lineage round-trip + dedup-skip spec (D-07, LINE-01)
 *
 * Tests the dedup backbone used by Phase 5 session archaeology.
 *
 * D-07 Open Q1 resolution: the dedup Set is built from the UNION of active-task
 * notes and completed-task notes. Completed tasks remain in the dedup Set because
 * only *deleted* tasks would re-surface; *completed* loops are already handled and
 * must not be re-created. Including completed tasks is the self-healing invariant:
 * a session that has been fully worked stays suppressed on every future scan.
 *
 * The dedup read the skill performs:
 *   { query: { type:"tasks", filters:{ tags:{ all:["archaeology"] } }, details:true } }
 * `details:true` is mandatory — without it the note truncates to 200 chars, dropping
 * the end-of-note lineage block (OmniFocusReadTool.ts line 128).
 */

import { describe, it, expect } from 'vitest';
import { LINEAGE_RE, composeLineageStamp } from '../../../../src/contracts/ast/lineage.js';

// ---------------------------------------------------------------------------
// In-test pure helper — mirrors the exact parse the skill performs on the
// dedup read result. Parses each task note via LINEAGE_RE, slices the JSON
// payload out of the matched comment, JSON.parses it, and collects .session.
// ---------------------------------------------------------------------------
function buildExtractedSessionSet(notes: string[]): Set<string> {
  const ids = new Set<string>();
  for (const note of notes) {
    const match = LINEAGE_RE.exec(note);
    if (!match) continue;
    // The matched block is: \n\n<!-- of-mcp:lineage\n{json}\n-->
    // Strip the surrounding comment markers to get the raw JSON line.
    const block = match[0];
    const jsonLine = block.replace(/^\n\n<!-- of-mcp:lineage\n/, '').replace(/\n-->$/, '');
    try {
      const payload = JSON.parse(jsonLine) as { session?: string };
      if (payload.session) ids.add(payload.session);
    } catch {
      // malformed — skip
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------
function makeNoteWithLineage(sessionId: string, userText = 'Task note'): string {
  return composeLineageStamp(userText, { sessionId });
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

describe('LINEAGE_RE / composeLineageStamp — round-trip', () => {
  it('embeds session ID and LINEAGE_RE matches the block', () => {
    const note = composeLineageStamp('My task note', { sessionId: 'session-abc-123' });
    const match = LINEAGE_RE.exec(note);
    expect(match).not.toBeNull();
    const payload = JSON.parse(match![0].replace(/^\n\n<!-- of-mcp:lineage\n/, '').replace(/\n-->$/, '')) as {
      session: string;
    };
    expect(payload.session).toBe('session-abc-123');
  });

  it('round-trips the session ID through JSON.parse(.session)', () => {
    const sessionId = 'S1-round-trip-test';
    const note = composeLineageStamp('Some note', { sessionId });
    const match = LINEAGE_RE.exec(note);
    expect(match).not.toBeNull();
    const json = match![0].replace(/^\n\n<!-- of-mcp:lineage\n/, '').replace(/\n-->$/, '');
    const payload = JSON.parse(json) as { session: string };
    expect(payload.session).toBe(sessionId);
  });
});

describe('composeLineageStamp — idempotency (strip-before-reappend)', () => {
  it('stamping a note twice yields exactly one LINEAGE_RE match', () => {
    const sessionId = 'idempotency-test';
    const oncestamped = composeLineageStamp('Base note', { sessionId });
    const twicestamped = composeLineageStamp(oncestamped, { sessionId });

    // Count matches by consuming all globally
    const global = new RegExp(LINEAGE_RE.source, 'gs');
    const matches = twicestamped.match(global);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('collapses a note that already carries TWO lineage blocks to exactly one (WR-03)', () => {
    // Seed a malformed note that already contains two lineage blocks (legacy
    // data, manual edit, or two racing stamps). The strip-before-reappend
    // invariant must remove ALL existing blocks, not just the first.
    const blockFor = (session: string) =>
      `\n\n<!-- of-mcp:lineage\n${JSON.stringify({ v: 1, agent: 'claude-code', session, created_at: '2026-06-15T12:00:00.000Z' })}\n-->`;
    const twoBlockNote = `Base note${blockFor('session-FIRST')}${blockFor('session-SECOND')}`;

    // Sanity: the seeded note genuinely has two blocks.
    const globalRe = new RegExp(LINEAGE_RE.source, 'gs');
    expect(twoBlockNote.match(globalRe)!.length).toBe(2);

    const restamped = composeLineageStamp(twoBlockNote, { sessionId: 'session-LATEST' });

    // After re-stamping there must be exactly one block left.
    const afterRe = new RegExp(LINEAGE_RE.source, 'gs');
    const matches = restamped.match(afterRe);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);

    // And the surviving block keys on the most recent session, not the oldest.
    const sessionMatch = LINEAGE_RE.exec(restamped);
    const json = sessionMatch![0].replace(/^\n\n<!-- of-mcp:lineage\n/, '').replace(/\n-->$/, '');
    const payload = JSON.parse(json) as { session: string };
    expect(payload.session).toBe('session-LATEST');
  });
});

describe('buildExtractedSessionSet — dedup mechanics', () => {
  it('excludes a transcript whose session_id is present in the dedup Set', () => {
    const sessionInSet = 'S-already-extracted';
    const sessionNotInSet = 'S-new-unseen';

    const notes = [makeNoteWithLineage(sessionInSet)];
    const dedup = buildExtractedSessionSet(notes);

    expect(dedup.has(sessionInSet)).toBe(true);
    expect(dedup.has(sessionNotInSet)).toBe(false);
  });

  it('retains a transcript whose session_id is absent from the dedup Set', () => {
    const existingSession = 'S-existing';
    const newSession = 'S-new';

    const notes = [makeNoteWithLineage(existingSession)];
    const dedup = buildExtractedSessionSet(notes);

    // The new session is NOT in the dedup set — it should be retained (processed)
    expect(dedup.has(newSession)).toBe(false);
  });

  it('collects multiple session IDs from multiple notes', () => {
    const s1 = 'S-multi-1';
    const s2 = 'S-multi-2';
    const notes = [makeNoteWithLineage(s1), makeNoteWithLineage(s2)];
    const dedup = buildExtractedSessionSet(notes);
    expect(dedup.has(s1)).toBe(true);
    expect(dedup.has(s2)).toBe(true);
    expect(dedup.size).toBe(2);
  });

  it('skips notes without a lineage block', () => {
    const notes = ['Plain task note with no lineage stamp'];
    const dedup = buildExtractedSessionSet(notes);
    expect(dedup.size).toBe(0);
  });
});

describe('buildExtractedSessionSet — completed-task inclusion (D-07 Open Q1 resolution)', () => {
  it('includes a session ID present only in the completed-task list', () => {
    const completedSession = 'S-completed-only';
    const activeSession = 'S-active';

    const activeNotes = [makeNoteWithLineage(activeSession)];
    const completedNotes = [makeNoteWithLineage(completedSession)];

    // Union: merge both note arrays into a single dedup set
    const dedup = buildExtractedSessionSet([...activeNotes, ...completedNotes]);

    // A session present only in the completed list is still in the dedup Set
    expect(dedup.has(completedSession)).toBe(true);
    // Its transcript is therefore excluded (handled loops stay handled)
  });

  it('the dedup Set union excludes already-extracted sessions from either list', () => {
    const completedSession = 'S-done';
    const activeSession = 'S-active-2';
    const newSession = 'S-unseen';

    const dedup = buildExtractedSessionSet([makeNoteWithLineage(activeSession), makeNoteWithLineage(completedSession)]);

    expect(dedup.has(activeSession)).toBe(true);
    expect(dedup.has(completedSession)).toBe(true);
    expect(dedup.has(newSession)).toBe(false);
  });
});
