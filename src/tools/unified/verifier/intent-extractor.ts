/**
 * intent-extractor — Wave 1A (Plan 05-02) implementation.
 *
 * Extracts:
 *   - The intent object (fields the caller intended to set) from a compiled mutation op.
 *   - The affected entity id(s) from a mutation result.
 *
 * Both functions use duck-typing and never throw — unknown shapes return empty
 * object / empty array so the verifier marks them as unverifiable rather than
 * crashing (T-05-02-02).
 */

import { localToUTC } from '../../../utils/timezone.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asRecord(val: unknown): Record<string, unknown> {
  if (val !== null && val !== undefined && typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}

function isString(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0;
}

/** Pick only keys whose values are non-null and non-undefined from an object. */
function pickNonNullish(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const val = obj[key];
    if (val !== null && val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}

// ─── extractIntent ────────────────────────────────────────────────────────────

// Verifiable date fields (D-06/D-07): the compiled op carries the agent's RAW
// date string (e.g. "2025-12-25") while read-backs return UTC ISO strings
// (e.g. "2025-12-25T17:00:00.000Z"). Rather than EXCLUDE these from verification,
// we canonicalize the intent value to UTC with the SAME localToUTC conversion
// (and default-time rules) the mutation applied, so compareDateField's ±60 s
// tolerance matches the read-back. This catches silent date-write failures at
// runtime — the core value of the verifier.
const DATE_CONTEXT: Record<string, 'due' | 'defer' | 'planned'> = {
  dueDate: 'due',
  deferDate: 'defer',
  plannedDate: 'planned',
};

// completionDate is excluded: the `complete` op lets OmniFocus stamp the
// completion time (≈ now), so there is no agent-supplied value to verify against.
const EXCLUDED_DATE_KEYS = new Set(['completionDate']);

/**
 * Canonicalize a raw intent date to the UTC ISO form the read-back will hold,
 * using the same localToUTC conversion the mutation applied (D-06/D-07).
 * Idempotent on already-UTC strings. On a malformed value (localToUTC throws),
 * returns undefined so the key is omitted rather than producing a false
 * WRITE_UNVERIFIED_MISMATCH from a raw-vs-UTC diff.
 */
function canonicalizeDate(key: string, value: unknown): string | undefined {
  const context = DATE_CONTEXT[key];
  if (context === undefined || typeof value !== 'string') return undefined;
  try {
    return localToUTC(value, context);
  } catch {
    return undefined;
  }
}

// Relational/operational fields are excluded from intent-based verification
// because they use a different vocabulary in read-backs than in mutation ops:
//   - project / projectId: mutation uses projectId; read-back uses containingProject
//   - parentTaskId: mutation directive; read-back does not expose parentTaskId as a key
//   - addTags / removeTags: operation directives; read-back uses a flat tags[] array
// These are verified end-to-end by the dedicated field-roundtrip integration tests.
const RELATIONAL_KEYS = new Set(['project', 'projectId', 'parentTaskId', 'addTags', 'removeTags', 'parentFolder']);

const TASK_CREATE_FIELDS = ['name', 'note', 'flagged', 'estimatedMinutes', 'tags', 'sequential'];

/**
 * Extract the intent object from a compiled mutation op.
 *
 * Returns only the keys the caller intended to set (D-06 — never diff
 * app-derived fields). Verifiable date fields (due/defer/planned) are
 * canonicalized to UTC via localToUTC so they match read-backs (D-06/D-07).
 * Mutation-only directives (clear*), completionDate, and relational fields are
 * excluded (see EXCLUDED_DATE_KEYS / RELATIONAL_KEYS comments above).
 *
 * Handles: task create, task update, task complete, project create, folder
 * create, batch (returns {} — batch verifier dispatches per-item).
 *
 * Returns {} for any unrecognized op class (T-05-02-02 — verifier marks as
 * unverifiable, never falsely 'verified').
 *
 * @param compiledOp - The compiled mutation object from the write tool compiler.
 * @returns A Record mapping field names to their intended values.
 */
export function extractIntent(compiledOp: unknown): Record<string, unknown> {
  try {
    const op = asRecord(compiledOp);
    const operation = op['operation'];
    const target = op['target'];

    if (operation === 'create' && target === 'task') {
      const data = asRecord(op['data']);
      const result = pickNonNullish(data, TASK_CREATE_FIELDS);
      for (const key of Object.keys(DATE_CONTEXT)) {
        const canonical = canonicalizeDate(key, data[key]);
        if (canonical !== undefined) result[key] = canonical;
      }
      return result;
    }

    if (operation === 'update') {
      const changes = asRecord(op['changes']);
      // Exclude:
      //   - clear* directive flags (clearDueDate, clearDeferDate, clearPlannedDate,
      //     clearEstimatedMinutes) — mutation-only directives, absent in read-backs.
      //   - completionDate — app-stamped, no agent-supplied value (EXCLUDED_DATE_KEYS).
      //   - relational/operational fields — different vocabulary in read-backs
      //     (see RELATIONAL_KEYS comment above).
      // Verifiable date fields (due/defer/planned) are canonicalized to UTC (D-06/D-07).
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(changes)) {
        if (key.startsWith('clear') || EXCLUDED_DATE_KEYS.has(key) || RELATIONAL_KEYS.has(key)) {
          continue;
        }
        if (key in DATE_CONTEXT) {
          const canonical = canonicalizeDate(key, val);
          if (canonical !== undefined) result[key] = canonical;
          continue;
        }
        result[key] = val;
      }
      return result;
    }

    if (operation === 'complete') {
      // task.status is not a real read-back field (tasks have completionDate, not
      // status). completionDate is app-stamped (EXCLUDED_DATE_KEYS), not agent intent.
      // Return empty so the verifier marks the op as unverifiable-by-field-diff
      // rather than producing a false mismatch.
      return {};
    }

    if (operation === 'create' && target === 'project') {
      const data = asRecord(op['data']);
      // Verifiable date fields canonicalized to UTC (D-06/D-07); completionDate and
      // relational fields excluded for the same reasons as task create.
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(data)) {
        if (EXCLUDED_DATE_KEYS.has(key) || RELATIONAL_KEYS.has(key) || val === null || val === undefined) {
          continue;
        }
        if (key in DATE_CONTEXT) {
          const canonical = canonicalizeDate(key, val);
          if (canonical !== undefined) result[key] = canonical;
          continue;
        }
        result[key] = val;
      }
      return result;
    }

    if (operation === 'create_folder' || (operation === 'create' && target === 'folder')) {
      // Folder entities are not fetchable via buildTasksByIdSetScript (task-only reader).
      // Return empty so the verifier marks the op as unverifiable rather than producing
      // a false WRITE_UNVERIFIED_MISMATCH from an empty read-back snapshot.
      return {};
    }

    if (operation === 'batch') {
      // Batch verifier dispatches per-item extractIntent from each item's individual op class
      return {};
    }

    // Unrecognized op — return empty so verifier marks as unverifiable (T-05-02-02)
    return {};
  } catch {
    return {};
  }
}

// ─── extractAffectedIds ────────────────────────────────────────────────────────

/**
 * Extract the affected entity id(s) from a mutation result.
 *
 * Duck-types the result shape to cover:
 *   - Single task create: metadata.created_id
 *   - Single task update: metadata.updated_id
 *   - Single task complete: metadata.completed_id
 *   - Project create: data.project.id
 *   - Batch: data.tempIdMapping values + ids from data.results items
 *
 * Returns [] for any shape that yields no ids. Never throws.
 *
 * @param mutationResult - The raw result returned by the mutation handler.
 * @returns Array of entity ids affected by the mutation (stable primaryKey strings).
 */
export function extractAffectedIds(mutationResult: unknown): string[] {
  try {
    const result = asRecord(mutationResult);
    const metadata = asRecord(result['metadata']);
    const data = asRecord(result['data']);

    const ids: string[] = [];

    // Single task create
    if (isString(metadata['created_id'])) {
      ids.push(metadata['created_id']);
    }

    // Single task update
    if (ids.length === 0 && isString(metadata['updated_id'])) {
      ids.push(metadata['updated_id']);
    }

    // Single task complete
    if (ids.length === 0 && isString(metadata['completed_id'])) {
      ids.push(metadata['completed_id']);
    }

    // Project create: data.project.id
    const project = asRecord(data['project']);
    if (isString(project['id'])) {
      if (!ids.includes(project['id'])) ids.push(project['id']);
    }

    // Folder create: data.folder.folderId or data.folder.id
    const folder = asRecord(data['folder']);
    const folderId = folder['folderId'] ?? folder['id'];
    if (isString(folderId)) {
      if (!ids.includes(folderId)) ids.push(folderId);
    }

    // Batch: collect from tempIdMapping values + data.results item ids
    const tempIdMapping = asRecord(data['tempIdMapping']);
    for (const realId of Object.values(tempIdMapping)) {
      if (isString(realId) && !ids.includes(realId)) {
        ids.push(realId);
      }
    }

    const results = Array.isArray(data['results']) ? (data['results'] as unknown[]) : [];
    for (const item of results) {
      const itemRec = asRecord(item);
      const itemId = itemRec['id'];
      if (isString(itemId) && !ids.includes(itemId)) {
        ids.push(itemId);
      }
    }

    return ids;
  } catch {
    return [];
  }
}
