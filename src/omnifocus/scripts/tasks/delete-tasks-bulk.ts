import { getUnifiedHelpers } from '../shared/helpers.js';
import { decide } from '../../../auth/operation-policy.js';
import type { Role } from '../../../contracts/roles.js';

/**
 * Optimized bulk delete script using OmniJS bridge with O(1) lookups
 *
 * PERFORMANCE FIX (November 2025):
 * - OLD approach: O(n) iteration through flattenedTasks = 60+ second timeout with 2000 tasks
 * - NEW approach: O(1) lookup using Task.byIdentifier() per ID in single OmniJS bridge call
 * - Performance: ~1000x faster (sub-second vs 60+ seconds)
 *
 * Accepts array of task IDs and deletes them all using OmniJS bridge
 */

export interface BulkDeleteTasksParams {
  taskIds: string[];
}

/**
 * @param role   Caller role from parseRole(). Re-asserts policy before emitting JXA (D-03).
 *               Script-builder defense-in-depth layer mirroring assertPolicyAllow in
 *               mutation-script-builder.ts. The funnel guard is the primary; both call decide().
 * @param params The task IDs to delete.
 */
export function buildBulkDeleteTasksScript(role: Role, params: BulkDeleteTasksParams): string {
  // Policy re-assertion (defense-in-depth, D-03) — before any script emission.
  const outcome = decide(role, 'bulk_delete', 'task');
  if (outcome !== 'allow') {
    throw new Error(`POLICY: ${outcome.toUpperCase()} bulk_delete/task for role '${role}'`);
  }

  const serialized = JSON.stringify({ taskIds: params.taskIds });

  return `
  ${getUnifiedHelpers()}

  (() => {
    const app = Application('OmniFocus');
    const __params = ${serialized};
    const taskIds = __params.taskIds;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return JSON.stringify({
        success: true,
        deleted: [],
        errors: [],
        message: 'No task IDs provided'
      });
    }

    try {
      // Use OmniJS bridge for O(1) lookups via Task.byIdentifier()
      // This is MUCH faster than iterating through flattenedTasks
      const deleteScript = '(' +
        '(() => {' +
          'const ids = ' + JSON.stringify(taskIds) + ';' +
          'const deleted = [];' +
          'const errors = [];' +
          '' +
          'for (const id of ids) {' +
            'try {' +
              'const task = Task.byIdentifier(id);' +
              'if (!task) {' +
                'errors.push({ taskId: id, error: "Task not found" });' +
                'continue;' +
              '}' +
              'const taskName = task.name;' +
              'deleteObject(task);' +
              'deleted.push({ id: id, name: taskName });' +
            '} catch (e) {' +
              'errors.push({ taskId: id, error: String(e) });' +
            '}' +
          '}' +
          '' +
          'return JSON.stringify({' +
            'success: true,' +
            'deleted: deleted,' +
            'errors: errors,' +
            'message: "Deleted " + deleted.length + " of " + ids.length + " tasks"' +
          '});' +
        '})()' +
      ')';

      const result = app.evaluateJavascript(deleteScript);
      return result;

    } catch (error) {
      return formatError(error, 'bulk_delete_tasks');
    }
  })();
`;
}
