// FOLDER_CREATE_ID_FINDING (Wave 0 inspection — informs Plan 05-04):
// buildCreateFolderScript returns result.data.folder.folderId (stable id.primaryKey via OmniJS bridge) — verify candidate.

import {
  createErrorResponseV2,
  WRITE_UNVERIFIED_MISMATCH,
  VERIFY_READBACK_FAILED,
  type StandardMetadataV2,
} from '../../../utils/response-format.js';
import { compareField } from './field-comparator.js';
import { extractIntent, extractAffectedIds } from './intent-extractor.js';
import { buildTasksByIdSetScript } from '../../../contracts/ast/script-builder.js';
import { createLogger, type Logger } from '../../../utils/logger.js';

/** Chunk size aligned with Zod max 200 in read-schema.ts (D-16, T-05-04-04). */
const VERIFY_READBACK_CHUNK_SIZE = 200;

/** Helper: cast an unknown value to a Record for duck-typing. */
function asRecord(val: unknown): Record<string, unknown> {
  if (val !== null && val !== undefined && typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}

/** Split an array into chunks of at most `size` elements. */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Extract task ids from a batch mutation result's nested results array.
 * Handles: data.results[i].data.task.id, data.results[i].id, and
 * data.results[i].data.project.id.
 */
function extractIdsFromBatchResults(data: Record<string, unknown>): string[] {
  const results = Array.isArray(data['results']) ? (data['results'] as unknown[]) : [];
  const ids: string[] = [];
  for (const item of results) {
    const itemRec = asRecord(item);
    // Try direct id (uncommon but possible)
    const directId = itemRec['id'];
    if (typeof directId === 'string' && directId.length > 0 && !ids.includes(directId)) {
      ids.push(directId);
      continue;
    }
    // Try nested data.task.id
    const itemData = asRecord(itemRec['data']);
    const taskObj = asRecord(itemData['task']);
    const taskId = taskObj['id'];
    if (typeof taskId === 'string' && taskId.length > 0 && !ids.includes(taskId)) {
      ids.push(taskId);
      continue;
    }
    // Try nested data.project.id
    const projectObj = asRecord(itemData['project']);
    const projectId = projectObj['id'];
    if (typeof projectId === 'string' && projectId.length > 0 && !ids.includes(projectId)) {
      ids.push(projectId);
    }
  }
  return ids;
}

/**
 * WriteVerifier — Wave 1B (Plan 05-04) implementation.
 *
 * Orchestrates the post-mutation read-back round-trip:
 *   role check → skip check → id collection → batched osascript spawn (injected execJson)
 *   → per-field diff → status injection or error replacement.
 *
 * execJson is injected at construction — never imports OmniFocusReadTool or CacheManager.
 */
export class WriteVerifier {
  private readonly logger: Logger;

  constructor(
    private readonly execJson: (script: string) => Promise<unknown>,
    logger?: Logger,
  ) {
    this.logger = logger ?? createLogger('WriteVerifier');
  }

  /**
   * Verify that a mutation result matches the declared intent by issuing an
   * independent post-mutation read-back round-trip.
   *
   * @param mutationResult - The raw result returned by the mutation handler.
   * @param intent - The normalized intent object (keys = fields the caller intended to set).
   * @param compiledOp - The compiled mutation object from the write tool compiler.
   * @param role - The resolved role ('agent' | 'owner').
   * @returns A StandardResponseV2-shaped object with verification_status in metadata.
   */
  async verify(mutationResult: unknown, intent: unknown, compiledOp: unknown, role: string): Promise<unknown> {
    const result = asRecord(mutationResult);

    // Step 1 — Guard on failed mutation: never verify a mutation that already failed.
    if (result['success'] === false) {
      return mutationResult;
    }

    // Extract originalMetadata for passing through to error responses.
    const originalMetadata = asRecord(result['metadata']) as unknown as Partial<StandardMetadataV2>;

    // Step 2 — Owner guard (D-12): owner role → unverified, not skipped.
    if (role !== 'agent') {
      this.logger.debug('owner role — verification skipped');
      const meta = (mutationResult as { metadata?: Record<string, unknown> }).metadata;
      if (meta) {
        meta['verification_status'] = 'unverified';
      }
      return mutationResult;
    }

    // Step 3 — Dry-run / closed-skip guard (D-11).
    const op = asRecord(compiledOp);
    if (op['dryRun'] === true) {
      this.logger.info('verification skipped', { reason: 'dryRun', op });
      const meta = (mutationResult as { metadata?: Record<string, unknown> }).metadata;
      if (meta) {
        meta['verification_status'] = 'skipped';
      }
      return mutationResult;
    }

    // tag_manage path (D-09): relationship-shaped read-back via tag-list query.
    if (op['operation'] === 'tag_manage') {
      return this.verifyTagManage(mutationResult, op, originalMetadata);
    }

    // Step 4 — Collect affected ids.
    let ids = extractAffectedIds(mutationResult);

    // For batch ops, also collect from nested data.results items (batch handler stores ids there).
    if (ids.length === 0 && op['operation'] === 'batch') {
      const data = asRecord(result['data']);
      ids = extractIdsFromBatchResults(data);
    }

    if (ids.length === 0) {
      this.logger.warn('verification skipped — no affected ids found', { op: op['operation'] });
      const meta = (mutationResult as { metadata?: Record<string, unknown> }).metadata;
      if (meta) {
        meta['verification_status'] = 'unverified';
      }
      return mutationResult;
    }

    // Step 5 — Batched read-back (D-13, D-16): chunk ids at VERIFY_READBACK_CHUNK_SIZE.
    let allReadBackTasks: Record<string, unknown>[] = [];
    try {
      const chunks = chunkArray(ids, VERIFY_READBACK_CHUNK_SIZE);
      for (const chunk of chunks) {
        const generated = buildTasksByIdSetScript(chunk);
        const raw = await this.execJson(generated.script);
        const rawRec = asRecord(raw);

        // The script returns { tasks: [...] } wrapped in the OmniJS bridge envelope.
        // The execJson result may be the envelope directly or a parsed inner object.
        const tasks = this.extractTasksFromReadBack(rawRec);
        allReadBackTasks = allReadBackTasks.concat(tasks);
      }
    } catch (err) {
      return createErrorResponseV2(
        'omnifocus_write',
        VERIFY_READBACK_FAILED,
        'Post-mutation read-back could not complete — write result is indeterminate.',
        'Retrying may be safe — the verification failure was in the read, not the write.',
        { cause: String(err) },
        originalMetadata,
      );
    }

    // Step 6 — Per-field diff.
    // Use the provided intent object if it has keys; fall back to extractIntent(compiledOp).
    const extractedIntent = extractIntent(compiledOp);
    const intentObj =
      intent !== null && intent !== undefined && typeof intent === 'object' && Object.keys(intent).length > 0
        ? (intent as Record<string, unknown>)
        : extractedIntent;
    const firstReadBackTask = allReadBackTasks[0] ?? {};

    const mismatchedFields: string[] = [];
    for (const key of Object.keys(intentObj)) {
      const cmp = compareField(key, intentObj, firstReadBackTask);
      if (cmp === 'mismatch' || cmp === 'absent') {
        mismatchedFields.push(key);
      }
    }

    if (mismatchedFields.length > 0) {
      return createErrorResponseV2(
        'omnifocus_write',
        WRITE_UNVERIFIED_MISMATCH,
        `Write claimed success but read-back proves field(s) did not persist: ${mismatchedFields.join(', ')}`,
        'Do NOT retry blindly — the write did not persist. Re-read the entity state before retrying.',
        { mismatchedFields, intentSnapshot: intentObj, readBackSnapshot: firstReadBackTask },
        originalMetadata,
      );
    }

    // Step 7 — Verified: inject verification_status into mutation result metadata.
    const meta = (mutationResult as { metadata?: Record<string, unknown> }).metadata;
    if (meta) {
      meta['verification_status'] = 'verified';
    }
    return mutationResult;
  }

  /**
   * Tag-manage path (D-09): relationship-shaped read-back.
   * Tags have no numeric id in the agent API — verified via tag-list/hierarchy query.
   */
  private async verifyTagManage(
    mutationResult: unknown,
    op: Record<string, unknown>,
    originalMetadata: Partial<StandardMetadataV2>,
  ): Promise<unknown> {
    const action = op['action'] as string;
    const tagName = op['tagName'] as string;
    const newName = op['newName'] as string | undefined;
    const parentTagName = op['parentTagName'] as string | undefined;

    try {
      // Build a tag-list read script inline (no external build fn required for tags).
      const tagListScript = this.buildTagListScript();
      const raw = await this.execJson(tagListScript);
      const rawRec = asRecord(raw);
      const tags = this.extractTagsFromReadBack(rawRec);
      const tagNames = tags.map((t) => {
        const tr = asRecord(t);
        return String(tr['name'] ?? '').toLowerCase();
      });

      let verified = false;

      if (action === 'create') {
        verified = tagNames.includes(tagName.toLowerCase());
      } else if (action === 'rename') {
        const newNameLower = (newName ?? '').toLowerCase();
        verified = tagNames.includes(newNameLower) && !tagNames.includes(tagName.toLowerCase());
      } else if (action === 'nest' || action === 'reparent') {
        // Check that tagName's parent equals parentTagName in the hierarchy.
        verified = this.verifyTagParent(tags, tagName, parentTagName ?? '');
      } else {
        // Unknown tag_manage action — cannot verify, mark unverified.
        const meta = (mutationResult as { metadata?: Record<string, unknown> }).metadata;
        if (meta) {
          meta['verification_status'] = 'unverified';
        }
        return mutationResult;
      }

      if (!verified) {
        return createErrorResponseV2(
          'omnifocus_write',
          WRITE_UNVERIFIED_MISMATCH,
          `tag_manage ${action} verification failed: expected state not found in tag list read-back.`,
          'Do NOT retry blindly — re-read tag state before retrying.',
          { action, tagName, newName, parentTagName },
          originalMetadata,
        );
      }

      const meta = (mutationResult as { metadata?: Record<string, unknown> }).metadata;
      if (meta) {
        meta['verification_status'] = 'verified';
      }
      return mutationResult;
    } catch (err) {
      return createErrorResponseV2(
        'omnifocus_write',
        VERIFY_READBACK_FAILED,
        'Post-mutation tag read-back could not complete — write result is indeterminate.',
        'Retrying may be safe — the verification failure was in the read, not the write.',
        { cause: String(err) },
        originalMetadata,
      );
    }
  }

  /** Build an OmniJS script that returns all tags as a flat list with id, name, parent. */
  private buildTagListScript(): string {
    return `
(() => {
  const app = Application('OmniFocus');
  try {
    const omniJs = \`
      (() => {
        const tags = flattenedTags;
        const result = [];
        for (const tag of tags) {
          result.push({
            name: tag.name,
            parent: tag.parent ? tag.parent.name : null
          });
        }
        return JSON.stringify({ tags: result });
      })()
    \`;
    return app.evaluateJavascript(omniJs);
  } catch (e) {
    return JSON.stringify({ error: true, message: e.message || String(e) });
  }
})()
`.trim();
  }

  /** Verify that `tagName`'s parent equals `parentTagName` in the tag list. */
  private verifyTagParent(tags: Record<string, unknown>[], tagName: string, parentTagName: string): boolean {
    for (const t of tags) {
      const tr = asRecord(t);
      if (String(tr['name'] ?? '').toLowerCase() === tagName.toLowerCase()) {
        const parent = tr['parent'];
        if (parent === null || parent === undefined || parent === '') {
          return parentTagName === '';
        }
        return String(parent).toLowerCase() === parentTagName.toLowerCase();
      }
    }
    return false;
  }

  /**
   * Extract tasks from the read-back result returned by execJson.
   *
   * buildTasksByIdSetScript returns JSON-stringified { tasks: [...] } from OmniJS.
   * execJson parses it so the result shape is: { ok: true, v: '3', data: { tasks: [...] } }
   * OR the inner { tasks: [...] } if already unwrapped.
   */
  private extractTasksFromReadBack(raw: Record<string, unknown>): Record<string, unknown>[] {
    // Shape 1: { ok: true, v: '3', data: { tasks: [...] } }
    const data = asRecord(raw['data']);
    if (Array.isArray(data['tasks'])) {
      return (data['tasks'] as unknown[]).map(asRecord);
    }

    // Shape 2: { tasks: [...] } directly
    if (Array.isArray(raw['tasks'])) {
      return (raw['tasks'] as unknown[]).map(asRecord);
    }

    return [];
  }

  /** Extract tags from the tag-list read-back result. */
  private extractTagsFromReadBack(raw: Record<string, unknown>): Record<string, unknown>[] {
    // Shape 1: { ok: true, v: '3', data: { tags: [...] } }
    const data = asRecord(raw['data']);
    if (Array.isArray(data['tags'])) {
      return (data['tags'] as unknown[]).map(asRecord);
    }

    // Shape 2: { tags: [...] } directly
    if (Array.isArray(raw['tags'])) {
      return (raw['tags'] as unknown[]).map(asRecord);
    }

    return [];
  }
}

// Re-export types used by test files so they can be imported from this module.
export type { StandardResponseV2, StandardMetadataV2 } from '../../../utils/response-format.js';
