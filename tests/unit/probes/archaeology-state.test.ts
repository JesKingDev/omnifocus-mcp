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
