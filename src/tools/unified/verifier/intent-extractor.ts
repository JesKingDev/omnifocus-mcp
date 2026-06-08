/**
 * intent-extractor — Wave 0 stub.
 *
 * Exports the function signatures the test suite imports against.
 * All function bodies throw 'not implemented' so tests fail RED.
 * Wave 1B (Plan 05-04) implements the production logic.
 */

/**
 * Extract the intent object from a compiled mutation op.
 *
 * The intent is the normalized set of fields the caller intended to set.
 * Only keys present in the returned object are diffed against the read-back
 * (D-06 — never diff app-derived fields like id, modified-date, computed status).
 *
 * @param _compiledOp - The compiled mutation object from the write tool compiler.
 * @returns A Record mapping field names to their intended values.
 */
export function extractIntent(_compiledOp: unknown): Record<string, unknown> {
  throw new Error('extractIntent not implemented');
}

/**
 * Extract the affected entity id(s) from a mutation result.
 *
 * Handles the three result shapes:
 *  - Single task/project create: metadata.created_id
 *  - Single task update/complete: compiled.taskId
 *  - Batch: data.results id list + tempIdMapping resolution
 *
 * @param _mutationResult - The raw result returned by the mutation handler.
 * @returns Array of entity ids affected by the mutation (stable primaryKey strings).
 */
export function extractAffectedIds(_mutationResult: unknown): string[] {
  throw new Error('extractAffectedIds not implemented');
}
