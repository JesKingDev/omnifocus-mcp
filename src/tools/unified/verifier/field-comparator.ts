/**
 * field-comparator — per-field-type comparator registry (D-05, D-08).
 *
 * Implements Wave 1A (Plan 05-02).
 *
 * Each comparator receives the full intent object and readBack object, and the
 * field name to compare. It returns:
 *   'match'    — intent field value matches the read-back value (within tolerance).
 *   'mismatch' — intent field value does NOT match the read-back value, OR
 *                the field is present in intent but absent from the read-back (D-08 hard fail).
 *   'absent'   — the field was not present in the intent object (not a comparison target).
 */

import { normalizeBooleanInput } from '../../../utils/response-format.js';

/**
 * The three possible outcomes of a per-field comparison:
 * - 'match'    — intent field value matches the read-back value (within tolerance).
 * - 'mismatch' — intent field value does NOT match the read-back value, OR
 *                the field is present in intent but absent from the read-back (D-08 hard fail).
 * - 'absent'   — the field was not present in the intent object (not a comparison target).
 */
export type FieldComparatorResult = 'match' | 'mismatch' | 'absent';

type ComparatorFn = (
  fieldName: string,
  intentObj: Record<string, unknown>,
  readBackObj: Record<string, unknown>,
) => FieldComparatorResult;

/** D-08: true if key is absent from the object (vs. present-but-undefined) */
function isKeyAbsent(obj: Record<string, unknown>, key: string): boolean {
  return !Object.prototype.hasOwnProperty.call(obj, key);
}

/** D-08: true if key is absent OR value is undefined */
function isAbsentOrUndefined(obj: Record<string, unknown>, key: string): boolean {
  return isKeyAbsent(obj, key) || obj[key] === undefined;
}

// ─── Date comparator ─────────────────────────────────────────────────────────

const DATE_TOLERANCE_MS = 60_000;

function compareDateField(
  fieldName: string,
  intentObj: Record<string, unknown>,
  readBackObj: Record<string, unknown>,
): FieldComparatorResult {
  // If intent has no value for this field, it's not a comparison target
  if (isKeyAbsent(intentObj, fieldName) || intentObj[fieldName] === undefined) {
    return 'absent';
  }

  const intentVal = intentObj[fieldName];

  // Intent is null/undefined/falsy → intent says "unset"
  if (intentVal === null || intentVal === '') {
    // Both sides are "unset" → match
    const readBackVal = readBackObj[fieldName];
    if (readBackVal === null || readBackVal === undefined || readBackVal === '') {
      return 'match';
    }
    return 'mismatch';
  }

  // Intent has a value — check if readBack key is absent or undefined (D-08 hard fail)
  if (isAbsentOrUndefined(readBackObj, fieldName)) {
    return 'mismatch';
  }

  const readBackVal = readBackObj[fieldName];

  // readBack is null — explicitly cleared
  if (readBackVal === null) {
    return 'mismatch';
  }

  // Both are date strings — compare as epoch-ms with tolerance
  const intentMs = new Date(String(intentVal)).getTime();
  const readBackMs = new Date(String(readBackVal)).getTime();

  if (isNaN(intentMs) || isNaN(readBackMs)) {
    return 'mismatch';
  }

  return Math.abs(intentMs - readBackMs) <= DATE_TOLERANCE_MS ? 'match' : 'mismatch';
}

// ─── Tag comparator ──────────────────────────────────────────────────────────

function compareTagField(
  fieldName: string,
  intentObj: Record<string, unknown>,
  readBackObj: Record<string, unknown>,
): FieldComparatorResult {
  if (isKeyAbsent(intentObj, fieldName)) {
    return 'absent';
  }

  const intentTags = intentObj[fieldName];

  // D-08: intent has tags key but readBack is missing it
  if (isKeyAbsent(readBackObj, fieldName)) {
    return 'mismatch';
  }

  const readBackTags = readBackObj[fieldName];

  if (!Array.isArray(intentTags) || !Array.isArray(readBackTags)) {
    // Degenerate — fall back to strict equality
    return intentTags === readBackTags ? 'match' : 'mismatch';
  }

  const intentSet = new Set((intentTags as unknown[]).map((t) => String(t).toLowerCase()));
  const readSet = new Set((readBackTags as unknown[]).map((t) => String(t).toLowerCase()));

  if (intentSet.size !== readSet.size) {
    return 'mismatch';
  }

  for (const tag of intentSet) {
    if (!readSet.has(tag)) {
      return 'mismatch';
    }
  }

  return 'match';
}

// ─── Scalar comparator ───────────────────────────────────────────────────────

function isUnset(val: unknown): boolean {
  return val === null || val === undefined || val === '';
}

function compareScalarField(
  fieldName: string,
  intentObj: Record<string, unknown>,
  readBackObj: Record<string, unknown>,
): FieldComparatorResult {
  if (isKeyAbsent(intentObj, fieldName)) {
    return 'absent';
  }

  const intentVal = intentObj[fieldName];

  // D-08: if intent has a non-null value but readBack key is absent or explicitly undefined → mismatch
  if (!isUnset(intentVal) && isAbsentOrUndefined(readBackObj, fieldName)) {
    return 'mismatch';
  }

  const readBackVal = isKeyAbsent(readBackObj, fieldName) ? undefined : readBackObj[fieldName];

  // Boolean fields: flagged, sequential
  if (fieldName === 'flagged' || fieldName === 'sequential') {
    const intentBool = normalizeBooleanInput(intentVal as string | boolean | null | undefined);
    const readBackBool = normalizeBooleanInput(readBackVal as string | boolean | null | undefined);

    if (intentBool === null && readBackBool === null) return 'match';
    if (intentBool === null || readBackBool === null) return 'mismatch';
    return intentBool === readBackBool ? 'match' : 'mismatch';
  }

  // estimatedMinutes: round to integer before compare
  if (fieldName === 'estimatedMinutes') {
    if (isUnset(intentVal) && isUnset(readBackVal)) return 'match';
    if (isUnset(intentVal) || isUnset(readBackVal)) return 'mismatch';
    const intentRounded = Math.round(Number(intentVal));
    const readBackRounded = Math.round(Number(readBackVal));
    return intentRounded === readBackRounded ? 'match' : 'mismatch';
  }

  // note: trim before compare
  if (fieldName === 'note') {
    const intentNorm = isUnset(intentVal) ? null : String(intentVal).trim();
    const readBackNorm = isUnset(readBackVal) ? null : String(readBackVal).trim();
    if (intentNorm === null && readBackNorm === null) return 'match';
    if (intentNorm === null || readBackNorm === null) {
      // Normalize '' to null too
      const i2 = intentNorm === '' ? null : intentNorm;
      const r2 = readBackNorm === '' ? null : readBackNorm;
      return i2 === r2 ? 'match' : 'mismatch';
    }
    return intentNorm === readBackNorm ? 'match' : 'mismatch';
  }

  // String fields: name and generic strings — unify unset (null/undefined/'')
  if (isUnset(intentVal) && isUnset(readBackVal)) return 'match';
  if (isUnset(intentVal) || isUnset(readBackVal)) return 'mismatch';

  return String(intentVal).trim() === String(readBackVal).trim() ? 'match' : 'mismatch';
}

// ─── Typed-class comparator (reviewInterval) ─────────────────────────────────

function compareTypedClassField(
  fieldName: string,
  intentObj: Record<string, unknown>,
  readBackObj: Record<string, unknown>,
): FieldComparatorResult {
  if (isKeyAbsent(intentObj, fieldName)) {
    return 'absent';
  }

  const intentVal = intentObj[fieldName];

  if (intentVal === null || intentVal === undefined) {
    const readBackVal = readBackObj[fieldName];
    if (readBackVal === null || readBackVal === undefined) return 'match';
    return 'mismatch';
  }

  if (isAbsentOrUndefined(readBackObj, fieldName)) {
    return 'mismatch';
  }

  const readBackVal = readBackObj[fieldName];

  // JSON-structure comparison: serialize both and compare
  try {
    return JSON.stringify(intentVal) === JSON.stringify(readBackVal) ? 'match' : 'mismatch';
  } catch {
    return 'mismatch';
  }
}

// ─── Unknown field fallback ───────────────────────────────────────────────────

function compareUnknownField(
  fieldName: string,
  intentObj: Record<string, unknown>,
  readBackObj: Record<string, unknown>,
): FieldComparatorResult {
  if (isKeyAbsent(intentObj, fieldName)) {
    return 'absent';
  }

  const intentVal = intentObj[fieldName];

  if (intentVal !== null && intentVal !== undefined && isAbsentOrUndefined(readBackObj, fieldName)) {
    return 'mismatch';
  }

  const readBackVal = isKeyAbsent(readBackObj, fieldName) ? undefined : readBackObj[fieldName];

  return intentVal === readBackVal ? 'match' : 'mismatch';
}

// ─── Registry ────────────────────────────────────────────────────────────────

const DATE_FIELDS = new Set(['dueDate', 'deferDate', 'plannedDate', 'completionDate']);
const TAG_FIELDS = new Set(['tags']);
const SCALAR_FIELDS = new Set(['name', 'note', 'flagged', 'sequential', 'estimatedMinutes']);
const TYPED_CLASS_FIELDS = new Set(['reviewInterval']);

function dispatchComparator(fieldName: string): ComparatorFn {
  if (DATE_FIELDS.has(fieldName)) return compareDateField;
  if (TAG_FIELDS.has(fieldName)) return compareTagField;
  if (SCALAR_FIELDS.has(fieldName)) return compareScalarField;
  if (TYPED_CLASS_FIELDS.has(fieldName)) return compareTypedClassField;
  return compareUnknownField;
}

/**
 * Compare a single field from the mutation intent against the read-back value.
 *
 * @param fieldName  - The name of the field to compare (e.g. 'name', 'dueDate', 'tags').
 * @param intent     - The intent object (the mutation's declared desired state).
 * @param readBack   - The read-back object (the entity as returned by OmniFocus after the write).
 * @returns FieldComparatorResult — 'match', 'mismatch', or 'absent'.
 *
 * Rules (D-08):
 *  - Dates compared with ±60s tolerance (60_000 ms).
 *  - Tags compared as Set-of-names (order-insensitive).
 *  - Scalars: null/undefined/'' unified as "unset"; estimatedMinutes rounded to int;
 *    flagged/sequential coerced to bool; note trimmed.
 *  - Absent field in read-back (key present in intent but missing from read-back) = hard fail (mismatch).
 */
export function compareField(fieldName: string, intent: unknown, readBack: unknown): FieldComparatorResult {
  const intentObj = (intent ?? {}) as Record<string, unknown>;
  const readBackObj = (readBack ?? {}) as Record<string, unknown>;
  const comparator = dispatchComparator(fieldName);
  return comparator(fieldName, intentObj, readBackObj);
}
