import { describe, it, expect } from 'vitest';
import { decide } from '../../../src/auth/operation-policy.js';
import type { PolicyOutcome , Role } from '../../../src/contracts/roles.js';

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
