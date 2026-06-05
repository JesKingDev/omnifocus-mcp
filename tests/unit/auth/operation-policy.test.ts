import { describe, it, expect } from 'vitest';
import { decide, allowedOperations } from '../../../src/auth/operation-policy.js';
import type { PolicyOutcome, Role } from '../../../src/contracts/roles.js';
import { buildDeleteScript } from '../../../src/contracts/ast/mutation-script-builder.js';
import { buildDeleteTagScript, buildMergeTagsScript } from '../../../src/contracts/ast/tag-mutation-script-builder.js';
import { buildDeleteTaskScript } from '../../../src/omnifocus/scripts/tasks/delete-task.js';
import { buildBulkDeleteTasksScript } from '../../../src/omnifocus/scripts/tasks/delete-tasks-bulk.js';

// ---------------------------------------------------------------------------
// decide() — exhaustive D-08 policy matrix
//
// One row per cell in the canonical D-08 table (02-CONTEXT.md).
// Mandatory rows:
//   - unknown op → deny (fail-closed T-2-01)
//   - owner/delete/task → allow (OWNER full pass-through POLICY-06)
// ---------------------------------------------------------------------------

describe('decide() — D-08 policy matrix', () => {
  it.each<{ label: string; role: Role; operation: string; target: string; expected: PolicyOutcome }>([
    // -------------------------------------------------------------------------
    // AGENT — deny: hard deletes (task, project, folder)
    // -------------------------------------------------------------------------
    { label: 'agent/delete/task → deny', role: 'agent', operation: 'delete', target: 'task', expected: 'deny' },
    { label: 'agent/delete/project → deny', role: 'agent', operation: 'delete', target: 'project', expected: 'deny' },
    { label: 'agent/delete/folder → deny', role: 'agent', operation: 'delete', target: 'folder', expected: 'deny' },

    // -------------------------------------------------------------------------
    // AGENT — deny: bulk_delete (any target)
    // -------------------------------------------------------------------------
    {
      label: 'agent/bulk_delete/task → deny',
      role: 'agent',
      operation: 'bulk_delete',
      target: 'task',
      expected: 'deny',
    },
    {
      label: 'agent/bulk_delete/project → deny',
      role: 'agent',
      operation: 'bulk_delete',
      target: 'project',
      expected: 'deny',
    },

    // -------------------------------------------------------------------------
    // AGENT — gate: tag_manage destructive actions
    // -------------------------------------------------------------------------
    {
      label: 'agent/tag_manage/delete → gate',
      role: 'agent',
      operation: 'tag_manage',
      target: 'delete',
      expected: 'gate',
    },
    {
      label: 'agent/tag_manage/merge → gate',
      role: 'agent',
      operation: 'tag_manage',
      target: 'merge',
      expected: 'gate',
    },
    {
      label: 'agent/tag_manage/perspective_delete → gate (forward-declared, inert)',
      role: 'agent',
      operation: 'tag_manage',
      target: 'perspective_delete',
      expected: 'gate',
    },

    // -------------------------------------------------------------------------
    // AGENT — allow: safe operations
    // -------------------------------------------------------------------------
    {
      label: 'agent/complete/task → allow',
      role: 'agent',
      operation: 'complete',
      target: 'task',
      expected: 'allow',
    },
    {
      label: 'agent/complete/project → allow',
      role: 'agent',
      operation: 'complete',
      target: 'project',
      expected: 'allow',
    },
    { label: 'agent/drop/task → allow', role: 'agent', operation: 'drop', target: 'task', expected: 'allow' },
    { label: 'agent/drop/project → allow', role: 'agent', operation: 'drop', target: 'project', expected: 'allow' },
    { label: 'agent/create/task → allow', role: 'agent', operation: 'create', target: 'task', expected: 'allow' },
    {
      label: 'agent/create/project → allow',
      role: 'agent',
      operation: 'create',
      target: 'project',
      expected: 'allow',
    },
    { label: 'agent/update/task → allow', role: 'agent', operation: 'update', target: 'task', expected: 'allow' },
    {
      label: 'agent/update/project → allow',
      role: 'agent',
      operation: 'update',
      target: 'project',
      expected: 'allow',
    },

    // -------------------------------------------------------------------------
    // AGENT — allow: tag_manage additive/structural actions
    // -------------------------------------------------------------------------
    {
      label: 'agent/tag_manage/create → allow',
      role: 'agent',
      operation: 'tag_manage',
      target: 'create',
      expected: 'allow',
    },
    {
      label: 'agent/tag_manage/rename → allow',
      role: 'agent',
      operation: 'tag_manage',
      target: 'rename',
      expected: 'allow',
    },
    {
      label: 'agent/tag_manage/nest → allow',
      role: 'agent',
      operation: 'tag_manage',
      target: 'nest',
      expected: 'allow',
    },
    {
      label: 'agent/tag_manage/unnest → allow',
      role: 'agent',
      operation: 'tag_manage',
      target: 'unnest',
      expected: 'allow',
    },
    {
      label: 'agent/tag_manage/reparent → allow',
      role: 'agent',
      operation: 'tag_manage',
      target: 'reparent',
      expected: 'allow',
    },

    // -------------------------------------------------------------------------
    // AGENT — fail-closed: unknown operation must deny (T-2-01)
    // -------------------------------------------------------------------------
    {
      label: 'agent/unknown_op_xyz/task → deny (fail-closed)',
      role: 'agent',
      operation: 'unknown_op_xyz',
      target: 'task',
      expected: 'deny',
    },
    {
      label: 'agent/tag_manage/unknown_target → deny (fail-closed on unrecognised gate target)',
      role: 'agent',
      operation: 'tag_manage',
      target: 'unknown_target',
      expected: 'deny',
    },

    // -------------------------------------------------------------------------
    // OWNER — full pass-through: all ops → allow (POLICY-06, D-08)
    // -------------------------------------------------------------------------
    {
      label: 'owner/delete/task → allow (OWNER pass-through)',
      role: 'owner',
      operation: 'delete',
      target: 'task',
      expected: 'allow',
    },
    {
      label: 'owner/delete/project → allow (OWNER pass-through)',
      role: 'owner',
      operation: 'delete',
      target: 'project',
      expected: 'allow',
    },
    {
      label: 'owner/bulk_delete/task → allow (OWNER pass-through)',
      role: 'owner',
      operation: 'bulk_delete',
      target: 'task',
      expected: 'allow',
    },
    {
      label: 'owner/tag_manage/delete → allow (OWNER no gating)',
      role: 'owner',
      operation: 'tag_manage',
      target: 'delete',
      expected: 'allow',
    },
    {
      label: 'owner/tag_manage/merge → allow (OWNER no gating)',
      role: 'owner',
      operation: 'tag_manage',
      target: 'merge',
      expected: 'allow',
    },
    {
      label: 'owner/unknown_op_xyz/task → allow (OWNER pass-through even for unknown)',
      role: 'owner',
      operation: 'unknown_op_xyz',
      target: 'task',
      expected: 'allow',
    },
  ])('$label', ({ role, operation, target, expected }) => {
    expect(decide(role, operation, target)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// script-builder re-assertion — defense-in-depth (D-03)
//
// Confirms that assertPolicyAllow() fires as the first statement in each
// destructive/gated builder, independently of the funnel guard (POLICY-04).
//
// AGENT role → POLICY error thrown before any JXA is emitted.
// OWNER role → policy passes through; no POLICY error (other errors are OK).
// ---------------------------------------------------------------------------

describe('script-builder re-assertion — defense-in-depth (D-03)', () => {
  // -------------------------------------------------------------------------
  // AGENT — deny: buildDeleteScript throws POLICY: DENY
  // -------------------------------------------------------------------------
  it('buildDeleteScript("agent", "task", id) throws POLICY: DENY', async () => {
    await expect(buildDeleteScript('agent', 'task', 'fake-id')).rejects.toThrow(/POLICY: DENY/);
  });

  // -------------------------------------------------------------------------
  // AGENT — deny: task-delete builders throw POLICY: DENY (CR-01)
  // These are the highest-traffic destructive paths; the funnel routes here.
  // -------------------------------------------------------------------------
  it('buildDeleteTaskScript("agent", {taskId}) throws POLICY: DENY', () => {
    expect(() => buildDeleteTaskScript('agent', { taskId: 'fake-id' })).toThrow(/POLICY: DENY/);
  });

  it('buildBulkDeleteTasksScript("agent", {taskIds}) throws POLICY: DENY', () => {
    expect(() => buildBulkDeleteTasksScript('agent', { taskIds: ['a', 'b'] })).toThrow(/POLICY: DENY/);
  });

  // -------------------------------------------------------------------------
  // AGENT — gate: buildDeleteTagScript throws POLICY: GATE
  // -------------------------------------------------------------------------
  it('buildDeleteTagScript("agent", {tagName}) throws POLICY: GATE', () => {
    expect(() => buildDeleteTagScript('agent', { tagName: 'some-tag' })).toThrow(/POLICY: GATE/);
  });

  // -------------------------------------------------------------------------
  // AGENT — gate: buildMergeTagsScript throws POLICY: GATE
  // -------------------------------------------------------------------------
  it('buildMergeTagsScript("agent", {tagName, targetTag}) throws POLICY: GATE', () => {
    expect(() => buildMergeTagsScript('agent', { tagName: 'src-tag', targetTag: 'dest-tag' })).toThrow(/POLICY: GATE/);
  });

  // -------------------------------------------------------------------------
  // OWNER — pass-through: no POLICY error (other errors from JXA context are OK)
  // -------------------------------------------------------------------------
  it('buildDeleteScript("owner", "task", id) does NOT throw a POLICY error', async () => {
    // Owner passes the re-assertion; the function returns a GeneratedMutationScript.
    // In unit test mode there is no OmniFocus process, but the builder only builds
    // a script string — it does not execute JXA. So it should resolve, not throw.
    await expect(buildDeleteScript('owner', 'task', 'fake-id')).resolves.not.toThrow();
  });

  it('buildDeleteTaskScript("owner", {taskId}) does NOT throw a POLICY error', () => {
    expect(() => buildDeleteTaskScript('owner', { taskId: 'fake-id' })).not.toThrow(/POLICY:/);
  });

  it('buildBulkDeleteTasksScript("owner", {taskIds}) does NOT throw a POLICY error', () => {
    expect(() => buildBulkDeleteTasksScript('owner', { taskIds: ['a', 'b'] })).not.toThrow(/POLICY:/);
  });

  it('buildDeleteTagScript("owner", {tagName}) does NOT throw a POLICY error', () => {
    // Owner passes the re-assertion; validateTagMutation is inactive in unit test
    // mode (SANDBOX_GUARD_ENABLED is not set). Expect clean return, no POLICY error.
    expect(() => buildDeleteTagScript('owner', { tagName: 'some-tag' })).not.toThrow(/POLICY:/);
  });
});

// ---------------------------------------------------------------------------
// advertise⟺enforce parity (D-06)
//
// Structural defense against drift between the ListTools advertisement
// (allowedOperations) and the CallTool enforcement (decide()).
//
// Contract:
//   - Every op in allowedOperations('agent') must not be 'deny' when passed to decide()
//   - Every non-denied op in the policy must appear in allowedOperations('agent')
//   - OWNER allowedOperations must include delete and bulk_delete (no trimming)
// ---------------------------------------------------------------------------

describe('advertise⟺enforce parity (D-06)', () => {
  it('every AGENT-advertised op resolves to decide() !== deny', () => {
    const { operations, tagManageActions } = allowedOperations('agent');
    for (const op of operations) {
      if (op === 'tag_manage') continue; // tag_manage dispatches via target, not op alone
      expect(decide('agent', op, 'task')).not.toBe('deny');
    }
    for (const action of tagManageActions) {
      expect(decide('agent', 'tag_manage', action)).not.toBe('deny');
    }
  });

  it('every non-denied AGENT op is advertised', () => {
    const { operations } = allowedOperations('agent');
    // Known non-deny flat ops for agent (tag_manage excluded — uses per-target dispatch)
    const knownNonDenyFlatOps = ['complete', 'drop', 'create', 'update', 'batch', 'create_folder'];
    for (const op of knownNonDenyFlatOps) {
      // Verify this is indeed non-deny via decide(), then assert it is advertised
      expect(decide('agent', op, 'task')).not.toBe('deny');
      expect(operations).toContain(op);
    }
    // tag_manage itself is advertised (D-05: gated-but-advertised for the op level)
    expect(operations).toContain('tag_manage');
  });

  it('OWNER allowedOperations returns all ops including delete and bulk_delete', () => {
    const { operations } = allowedOperations('owner');
    expect(operations).toContain('delete');
    expect(operations).toContain('bulk_delete');
  });
});
