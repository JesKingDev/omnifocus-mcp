/**
 * field-comparator unit tests — Wave 0 scaffold.
 *
 * All test cases fail RED because compareField() throws 'not implemented'.
 * Wave 1A (Plan 05-02) implements the per-field-type comparator; tests turn GREEN.
 *
 * Coverage (D-05, D-08):
 *   Date comparator  — exact match, within ±60s, outside ±60s, absent in read-back
 *   Tag comparator   — same set diff order, subset, extra tag, absent key
 *   Scalar comparator — null/undefined/'' unset unification, estimatedMinutes rounding,
 *                       flagged string coercion, note trim
 *   Absent-field hard fail (D-08 critical) — intent key present, readBack key missing → mismatch
 */

import { describe, it, expect } from 'vitest';
import {
  compareField,
  type FieldComparatorResult,
} from '../../../../../src/tools/unified/verifier/field-comparator.js';

// Ensure the type export is accessible (compile-time check)
type _TypeCheck = FieldComparatorResult; // used only for type validation

// ─── Date comparator ─────────────────────────────────────────────────────────

describe('date comparator', () => {
  const BASE_DATE = '2026-12-25T17:00:00.000Z';
  const BASE_MS = new Date(BASE_DATE).getTime();

  it('exact match passes', () => {
    const intent = { dueDate: BASE_DATE };
    const readBack = { dueDate: BASE_DATE };
    expect(compareField('dueDate', intent, readBack)).toBe('match');
  });

  it('within 60s passes (OmniFocus second-level rounding tolerance)', () => {
    const intentDate = BASE_DATE;
    const readBackDate = new Date(BASE_MS + 30_000).toISOString(); // +30s within tolerance
    const intent = { dueDate: intentDate };
    const readBack = { dueDate: readBackDate };
    expect(compareField('dueDate', intent, readBack)).toBe('match');
  });

  it('outside 60s fails (wrong hour/day must be caught)', () => {
    const intentDate = BASE_DATE;
    const readBackDate = new Date(BASE_MS + 120_000).toISOString(); // +120s outside tolerance
    const intent = { dueDate: intentDate };
    const readBack = { dueDate: readBackDate };
    expect(compareField('dueDate', intent, readBack)).toBe('mismatch');
  });

  it('intent does not have dueDate key → absent (not a comparison target)', () => {
    const intent = { name: 'Task' }; // no dueDate key
    const readBack = { name: 'Task', dueDate: BASE_DATE };
    expect(compareField('dueDate', intent, readBack)).toBe('absent');
  });

  it('D-08 absent-field hard fail: intent has dueDate, readBack missing dueDate → mismatch', () => {
    const intent = { dueDate: BASE_DATE }; // intent says set dueDate
    const readBack = { name: 'Task' }; // readBack missing the dueDate key
    expect(compareField('dueDate', intent, readBack)).toBe('mismatch');
  });
});

// ─── Tag comparator ──────────────────────────────────────────────────────────

describe('tag comparator', () => {
  it('same set, different order passes (order is not meaningful)', () => {
    const intent = { tags: ['work', 'urgent'] };
    const readBack = { tags: ['urgent', 'work'] };
    expect(compareField('tags', intent, readBack)).toBe('match');
  });

  it('subset fails (missing tag is a real omission)', () => {
    const intent = { tags: ['work', 'urgent'] };
    const readBack = { tags: ['work'] }; // 'urgent' missing
    expect(compareField('tags', intent, readBack)).toBe('mismatch');
  });

  it('extra tag in readBack fails (OmniFocus added an unexpected tag)', () => {
    const intent = { tags: ['work'] };
    const readBack = { tags: ['work', 'extra-tag'] };
    expect(compareField('tags', intent, readBack)).toBe('mismatch');
  });

  it('D-08 absent-field hard fail: intent has tags, readBack missing tags key → mismatch', () => {
    const intent = { tags: ['work'] }; // intent set tags
    const readBack = { name: 'Task' }; // readBack has no tags key at all
    expect(compareField('tags', intent, readBack)).toBe('mismatch');
  });
});

// ─── Scalar comparator ───────────────────────────────────────────────────────

describe('scalar comparator', () => {
  it('null, undefined, and empty string all unify as "unset" and match each other', () => {
    // Intent has null deferDate; readBack has undefined — both are "unset"
    const intentNull = { deferDate: null };
    const readBackUndef = { deferDate: undefined };
    expect(compareField('deferDate', intentNull, readBackUndef)).toBe('match');
  });

  it('estimatedMinutes 60.9 rounds to 61 for comparison', () => {
    const intent = { estimatedMinutes: 60.9 };
    const readBack = { estimatedMinutes: 61 }; // OmniFocus stores as integer
    expect(compareField('estimatedMinutes', intent, readBack)).toBe('match');
  });

  it('flagged: "true" (string from MCP bridge coercion) coerces to true and matches boolean true', () => {
    const intent = { flagged: 'true' as unknown as boolean }; // MCP bridge may send string
    const readBack = { flagged: true };
    expect(compareField('flagged', intent, readBack)).toBe('match');
  });

  it('note trailing whitespace trimmed before compare', () => {
    const intent = { note: 'Buy organic milk  ' }; // trailing spaces in intent
    const readBack = { note: 'Buy organic milk' }; // OmniFocus may trim on store
    expect(compareField('note', intent, readBack)).toBe('match');
  });
});

// ─── Absent-field hard fail (critical D-08) ──────────────────────────────────

describe('D-08 absent-field hard fail (critical — catches JXA silent-no-op class)', () => {
  it('intent { flagged: true }, readBack with no flagged key → mismatch (never undefined==undefined)', () => {
    // This is the JXA-tag-assign / silent-no-op pattern:
    // The write claimed success, but the field is simply absent from the read-back.
    // MUST be mismatch — not absent (absent means intent had no flagged key), not match.
    const intent = { flagged: true };
    const readBack = { name: 'Task', dueDate: '2026-12-25T17:00:00.000Z' }; // no 'flagged' key
    const result = compareField('flagged', intent, readBack);
    expect(result).toBe('mismatch');
    expect(result).not.toBe('absent'); // 'absent' would mean intent had no flagged key
  });

  it('intent { tags: ["work"] }, readBack with no tags key → mismatch', () => {
    const intent = { tags: ['work'] };
    const readBack = { name: 'Task' }; // tags key entirely missing
    expect(compareField('tags', intent, readBack)).toBe('mismatch');
  });

  it('readBack key present but value is undefined → mismatch (treated as absent)', () => {
    // Key exists but value is explicitly undefined — still a write failure.
    const intent = { flagged: true };
    const readBack = { flagged: undefined };
    expect(compareField('flagged', intent, readBack)).toBe('mismatch');
  });
});
