/**
 * extractIntent — date canonicalization (D-06, D-07).
 *
 * The compiled op carries the agent's RAW date string (e.g. "2026-12-25");
 * read-backs return UTC ISO ("2026-12-25T17:00:00.000Z"). D-06/D-07 require
 * the intent date be compared in canonical local→UTC form, using the same
 * localToUTC conversion (and default-time rules) the mutation applies — NOT
 * excluded from verification. These tests assert the date keys survive intent
 * extraction in canonicalized form so compareDateField can match the read-back.
 */

import { describe, it, expect } from 'vitest';
import { extractIntent } from '../../../../../src/tools/unified/verifier/intent-extractor.js';
import { localToUTC } from '../../../../../src/utils/timezone.js';

describe('extractIntent — date canonicalization (D-06/D-07)', () => {
  it('task create: raw dueDate is canonicalized to UTC (matches mutation conversion)', () => {
    const op = { operation: 'create', target: 'task', data: { name: 'X', dueDate: '2026-12-25' } };
    const intent = extractIntent(op);
    expect(intent.dueDate).toBe(localToUTC('2026-12-25', 'due'));
  });

  it('task create: raw deferDate canonicalized with defer default-time', () => {
    const op = { operation: 'create', target: 'task', data: { name: 'X', deferDate: '2026-12-25' } };
    const intent = extractIntent(op);
    expect(intent.deferDate).toBe(localToUTC('2026-12-25', 'defer'));
  });

  it('task update: raw plannedDate canonicalized to UTC', () => {
    const op = { operation: 'update', changes: { plannedDate: '2026-12-25' } };
    const intent = extractIntent(op);
    expect(intent.plannedDate).toBe(localToUTC('2026-12-25', 'planned'));
  });

  it('task create: an already-UTC dueDate is left intact (idempotent)', () => {
    const utc = localToUTC('2026-12-25', 'due');
    const op = { operation: 'create', target: 'task', data: { name: 'X', dueDate: utc } };
    const intent = extractIntent(op);
    expect(intent.dueDate).toBe(utc);
  });

  it('task create: dueDate with explicit time canonicalized via that time', () => {
    const op = { operation: 'create', target: 'task', data: { name: 'X', dueDate: '2026-12-25 14:30' } };
    const intent = extractIntent(op);
    expect(intent.dueDate).toBe(localToUTC('2026-12-25 14:30', 'due'));
  });
});
