/**
 * Policy guard unit tests for OmniFocusWriteTool.executeValidated().
 *
 * Covers:
 *   - batch-parity — OMN-119 lesson: single / batch / bulk_delete all produce POLICY_DENY_DELETE
 *   - Gate tests: tag_manage delete/merge → POLICY_GATE_REQUIRES_OWNER with dryRun + ownerCommand
 *   - OWNER pass-through: delete and gated tag ops are NOT blocked for owner role
 *   - Allow-path: complete and tag_manage/create are not blocked for agent role
 *
 * The policy guard returns before any JXA/OmniFocus calls, so no OmniFocus process is needed.
 * decide() and createErrorResponseV2 are pure/synchronous — no mocks needed for the guard tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OmniFocusWriteTool } from '../../../src/tools/unified/OmniFocusWriteTool.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';

function createMockCache(): CacheManager {
  return {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
    invalidateForTaskChange: vi.fn(),
    invalidateProject: vi.fn(),
    invalidateTag: vi.fn(),
    invalidateTaskQueries: vi.fn(),
    clear: vi.fn(),
  } as unknown as CacheManager;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTool(): OmniFocusWriteTool {
  const cache = createMockCache();
  const tool = new OmniFocusWriteTool(cache);
  // Mock execJson so no JXA dispatch happens — policy guard fires before any execJson call
  vi.spyOn(tool as unknown as Record<string, unknown>, 'execJson').mockResolvedValue(undefined);
  return tool;
}

async function callExecute(tool: OmniFocusWriteTool, mutation: unknown): Promise<Record<string, unknown>> {
  const result = await tool.execute({ mutation } as Parameters<typeof tool.execute>[0]);
  return result as Record<string, unknown>;
}

// ─── batch-parity — OMN-119 lesson ──────────────────────────────────────────
//
// The same destructive operation must be denied with the same code regardless
// of whether it arrives as a single delete, inside a batch payload, or as a
// bulk_delete list. This is the OMN-119 class of bug: batch-parity.

describe('batch-parity — OMN-119 lesson', () => {
  let tool: OmniFocusWriteTool;
  const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];

  beforeEach(() => {
    // Run as agent (fail-safe default — no env var set)
    delete process.env['OMNIFOCUS_MCP_ROLE'];
    tool = makeTool();
  });

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env['OMNIFOCUS_MCP_ROLE'];
    } else {
      process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
    }
  });

  it('single delete task → POLICY_DENY_DELETE', async () => {
    const result = await callExecute(tool, {
      operation: 'delete',
      target: 'task',
      id: 'fake-task-id-001',
    });

    expect((result.error as Record<string, unknown>).code).toBe('POLICY_DENY_DELETE');
  });

  it('batch [delete task] → POLICY_DENY_DELETE', async () => {
    const result = await callExecute(tool, {
      operation: 'batch',
      operations: [{ operation: 'delete', target: 'task', id: 'fake-task-id-001' }],
    });

    expect((result.error as Record<string, unknown>).code).toBe('POLICY_DENY_DELETE');
  });

  it('bulk_delete task → POLICY_DENY_DELETE', async () => {
    const result = await callExecute(tool, {
      operation: 'bulk_delete',
      target: 'task',
      ids: ['fake-task-id-001'],
    });

    expect((result.error as Record<string, unknown>).code).toBe('POLICY_DENY_DELETE');
  });
});

// ─── Gate tests ─────────────────────────────────────────────────────────────

describe('gate: tag_manage structural operations (agent role)', () => {
  let tool: OmniFocusWriteTool;
  const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];

  beforeEach(() => {
    delete process.env['OMNIFOCUS_MCP_ROLE']; // agent role (fail-safe default)
    tool = makeTool();
  });

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env['OMNIFOCUS_MCP_ROLE'];
    } else {
      process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
    }
  });

  it('tag_manage delete → POLICY_GATE_REQUIRES_OWNER', async () => {
    const result = await callExecute(tool, {
      operation: 'tag_manage',
      action: 'delete',
      tagName: 'some-tag',
    });

    expect((result.error as Record<string, unknown>).code).toBe('POLICY_GATE_REQUIRES_OWNER');
  });

  it('tag_manage merge → POLICY_GATE_REQUIRES_OWNER', async () => {
    const result = await callExecute(tool, {
      operation: 'tag_manage',
      action: 'merge',
      tagName: 'src-tag',
      targetTag: 'dest-tag',
    });

    expect((result.error as Record<string, unknown>).code).toBe('POLICY_GATE_REQUIRES_OWNER');
  });

  it('gate response details contain dryRun: true', async () => {
    const result = await callExecute(tool, {
      operation: 'tag_manage',
      action: 'delete',
      tagName: 'some-tag',
    });

    const details = (result.error as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.dryRun).toBe(true);
  });

  it('gate response details contain ownerCommand (non-null)', async () => {
    const result = await callExecute(tool, {
      operation: 'tag_manage',
      action: 'delete',
      tagName: 'some-tag',
    });

    const details = (result.error as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.ownerCommand).toBeTruthy();
  });
});

// ─── OWNER pass-through ──────────────────────────────────────────────────────

describe('OWNER role pass-through', () => {
  let tool: OmniFocusWriteTool;
  const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];

  beforeEach(() => {
    process.env['OMNIFOCUS_MCP_ROLE'] = 'owner';
    tool = makeTool();
    // Mock execJson for owner tests — the guard passes, so JXA would be called
    vi.spyOn(tool as unknown as Record<string, unknown>, 'execJson').mockResolvedValue({
      ok: true,
      v: '3',
      data: { id: 'fake-id', name: 'Task', taskId: 'fake-id' },
    });
  });

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env['OMNIFOCUS_MCP_ROLE'];
    } else {
      process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
    }
  });

  it('owner + delete task → no POLICY_DENY_DELETE error', async () => {
    const result = await callExecute(tool, {
      operation: 'delete',
      target: 'task',
      id: 'fake-task-id-001',
    });

    // Result should not be a policy denial — either success or a different error
    const errorCode = (result.error as Record<string, unknown> | undefined)?.code;
    expect(errorCode).not.toBe('POLICY_DENY_DELETE');
  });

  it('owner + tag_manage delete → no POLICY_GATE_REQUIRES_OWNER error', async () => {
    const result = await callExecute(tool, {
      operation: 'tag_manage',
      action: 'delete',
      tagName: 'some-tag',
    });

    const errorCode = (result.error as Record<string, unknown> | undefined)?.code;
    expect(errorCode).not.toBe('POLICY_GATE_REQUIRES_OWNER');
  });
});

// ─── Allow-path tests ────────────────────────────────────────────────────────

describe('allow-path: non-destructive agent operations', () => {
  let tool: OmniFocusWriteTool;
  const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];

  beforeEach(() => {
    delete process.env['OMNIFOCUS_MCP_ROLE']; // agent role
    tool = makeTool();
    // Mock execJson for allow-path tests — guard passes so JXA would be called
    vi.spyOn(tool as unknown as Record<string, unknown>, 'execJson').mockResolvedValue({
      ok: true,
      v: '3',
      data: { id: 'fake-id', name: 'Task', taskId: 'fake-id' },
    });
  });

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env['OMNIFOCUS_MCP_ROLE'];
    } else {
      process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
    }
  });

  it('agent + complete task → no policy error', async () => {
    const result = await callExecute(tool, {
      operation: 'complete',
      target: 'task',
      id: 'fake-task-id-001',
    });

    const errorCode = (result.error as Record<string, unknown> | undefined)?.code;
    expect(errorCode).not.toBe('POLICY_DENY_DELETE');
    expect(errorCode).not.toBe('POLICY_GATE_REQUIRES_OWNER');
  });

  it('agent + tag_manage create → no policy error', async () => {
    const result = await callExecute(tool, {
      operation: 'tag_manage',
      action: 'create',
      tagName: 'new-tag',
    });

    const errorCode = (result.error as Record<string, unknown> | undefined)?.code;
    expect(errorCode).not.toBe('POLICY_DENY_DELETE');
    expect(errorCode).not.toBe('POLICY_GATE_REQUIRES_OWNER');
  });
});
