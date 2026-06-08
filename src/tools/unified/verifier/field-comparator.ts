/**
 * field-comparator — Wave 0 stub.
 *
 * Exports the function/type signatures the test suite imports against.
 * All function bodies throw 'not implemented' so tests fail RED.
 * Wave 1A (Plan 05-02) implements the per-field-type comparator registry.
 */

/**
 * The three possible outcomes of a per-field comparison:
 * - 'match'    — intent field value matches the read-back value (within tolerance).
 * - 'mismatch' — intent field value does NOT match the read-back value, OR
 *                the field is present in intent but absent from the read-back (D-08 hard fail).
 * - 'absent'   — the field was not present in the intent object (not a comparison target).
 */
export type FieldComparatorResult = 'match' | 'mismatch' | 'absent';

/**
 * Compare a single field from the mutation intent against the read-back value.
 *
 * @param _fieldName  - The name of the field to compare (e.g. 'name', 'dueDate', 'tags').
 * @param _intent     - The intent object (the mutation's declared desired state).
 * @param _readBack   - The read-back object (the entity as returned by OmniFocus after the write).
 * @returns FieldComparatorResult — 'match', 'mismatch', or 'absent'.
 *
 * Rules (D-08):
 *  - Dates compared with ±60s tolerance.
 *  - Tags compared as Set-of-names (order-insensitive).
 *  - Scalars: null/undefined/'' unified as "unset"; estimatedMinutes rounded to int;
 *    flagged/sequential coerced to bool; note trimmed.
 *  - Absent field in read-back (key present in intent but missing from read-back) = hard fail (mismatch).
 */
export function compareField(_fieldName: string, _intent: unknown, _readBack: unknown): FieldComparatorResult {
  throw new Error('compareField not implemented');
}
