import { describe, it, expect } from 'vitest';
import { maxTsPerSession } from '../../../probes/archaeology-prefilter.js';

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
