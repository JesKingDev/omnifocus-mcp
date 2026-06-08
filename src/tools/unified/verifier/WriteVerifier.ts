// FOLDER_CREATE_ID_FINDING (Wave 0 inspection — informs Plan 05-04):
// buildCreateFolderScript returns result.data.folder.folderId (stable id.primaryKey via OmniJS bridge) — verify candidate.

import { type StandardResponseV2, type StandardMetadataV2 } from '../../../utils/response-format.js';

/**
 * WriteVerifier — Wave 0 stub.
 *
 * Exported class signature the test suite imports against.
 * All method bodies throw 'not implemented' so tests fail RED.
 * Wave 1B (Plan 05-04) implements the production logic.
 */
export class WriteVerifier {
  constructor(private readonly _execJson: (script: string) => Promise<unknown>) {}

  /**
   * Verify that a mutation result matches the declared intent by issuing an
   * independent post-mutation read-back round-trip.
   *
   * @param _mutationResult - The raw result returned by the mutation handler.
   * @param _intent - The normalized intent object (keys = fields the caller intended to set).
   * @param _compiledOp - The compiled mutation object from the write tool compiler.
   * @param _role - The resolved role ('agent' | 'owner').
   * @returns A StandardResponseV2-shaped object with verification_status in metadata.
   */
  async verify(_mutationResult: unknown, _intent: unknown, _compiledOp: unknown, _role: string): Promise<unknown> {
    void this._execJson; // stub: satisfies noUnusedLocals; implementation in Wave 1B
    throw new Error('WriteVerifier.verify not implemented');
  }
}

// Re-export types used by test files so they can be imported from this module.
export type { StandardResponseV2, StandardMetadataV2 };
