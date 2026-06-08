/**
 * WriteVerifier unit tests — Wave 0 scaffold.
 *
 * All test cases fail RED because WriteVerifier.verify() throws 'not implemented'.
 * Wave 1B (Plan 05-04) implements the production logic; these tests turn GREEN.
 *
 * Coverage:
 *   VERIFY-01  — verifier issues independent execJson spawn (called twice per mutation)
 *   D-12       — owner role reports 'unverified', not 'skipped'
 *   D-01/D-02  — proven mismatch returns WRITE_UNVERIFIED_MISMATCH error envelope
 *   D-04       — read-back failure returns VERIFY_READBACK_FAILED error envelope
 *   VERIFY-03  — success response carries verification_status: 'verified'
 *   D-11       — dry-run returns 'skipped' + logger audit
 *   OMN-119    — single and batch ops both produce verification_status: 'verified' (parity)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WriteVerifier } from '../../../../../src/tools/unified/verifier/WriteVerifier.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMutationSuccess(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    success: true,
    data: { task: { id: 'task-abc', name: 'Buy milk', flagged: true }, operation: 'create' },
    metadata: {
      operation: 'create',
      timestamp: new Date().toISOString(),
      from_cache: false,
      created_id: 'task-abc',
    },
    ...overrides,
  };
}

function makeIntent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: 'Buy milk', flagged: true, ...overrides };
}

function makeCompiledOp(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operation: 'create',
    target: 'task',
    data: { name: 'Buy milk', flagged: true },
    ...overrides,
  };
}

function makeReadBackMatch(): Record<string, unknown> {
  return {
    ok: true,
    v: '3',
    data: {
      tasks: [{ id: 'task-abc', name: 'Buy milk', flagged: true }],
    },
  };
}

function makeReadBackMismatch(): Record<string, unknown> {
  return {
    ok: true,
    v: '3',
    data: {
      tasks: [{ id: 'task-abc', name: 'Buy milk', flagged: false }],
    },
  };
}

// ─── VERIFY-01: independent spawn ───────────────────────────────────────────

describe('VERIFY-01: verifier issues independent execJson spawn', () => {
  const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env['OMNIFOCUS_MCP_ROLE'];
    } else {
      process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
    }
  });

  it('execJson is called for the read-back (independent spawn, agent role)', async () => {
    delete process.env['OMNIFOCUS_MCP_ROLE'];

    const execJsonSpy = vi.fn().mockResolvedValueOnce(makeReadBackMatch());
    const verifier = new WriteVerifier(execJsonSpy);

    await verifier.verify(makeMutationSuccess(), makeIntent(), makeCompiledOp(), 'agent');

    // Verifier must issue an independent read-back spawn — execJson called at least once.
    expect(execJsonSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── D-12: owner role → unverified, not skipped ─────────────────────────────

describe('D-12: owner role reports unverified (not skipped)', () => {
  const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env['OMNIFOCUS_MCP_ROLE'];
    } else {
      process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
    }
  });

  it('owner role mutation produces verification_status: unverified (not skipped)', async () => {
    process.env['OMNIFOCUS_MCP_ROLE'] = 'owner';

    const execJsonSpy = vi.fn();
    const verifier = new WriteVerifier(execJsonSpy);
    const result = (await verifier.verify(makeMutationSuccess(), makeIntent(), makeCompiledOp(), 'owner')) as Record<
      string,
      unknown
    >;

    const meta = result.metadata as Record<string, unknown>;
    expect(meta['verification_status']).toBe('unverified');
    expect(meta['verification_status']).not.toBe('skipped');
  });

  it('owner role does not invoke execJson for read-back (no verification attempt)', async () => {
    process.env['OMNIFOCUS_MCP_ROLE'] = 'owner';

    const execJsonSpy = vi.fn();
    const verifier = new WriteVerifier(execJsonSpy);

    await verifier.verify(makeMutationSuccess(), makeIntent(), makeCompiledOp(), 'owner');

    expect(execJsonSpy).not.toHaveBeenCalled();
  });
});

// ─── D-01/D-02: proven mismatch → WRITE_UNVERIFIED_MISMATCH ─────────────────

describe('D-01/D-02: proven mismatch returns WRITE_UNVERIFIED_MISMATCH error envelope', () => {
  const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];

  beforeEach(() => {
    delete process.env['OMNIFOCUS_MCP_ROLE'];
  });

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env['OMNIFOCUS_MCP_ROLE'];
    } else {
      process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
    }
  });

  it('read-back field mismatch returns success: false with WRITE_UNVERIFIED_MISMATCH code', async () => {
    const execJsonSpy = vi.fn().mockResolvedValueOnce(makeReadBackMismatch());
    const verifier = new WriteVerifier(execJsonSpy);

    const result = (await verifier.verify(makeMutationSuccess(), makeIntent(), makeCompiledOp(), 'agent')) as Record<
      string,
      unknown
    >;

    expect(result['success']).toBe(false);
    const error = result['error'] as Record<string, unknown>;
    expect(error['code']).toBe('WRITE_UNVERIFIED_MISMATCH');
  });

  it('mismatch result is never a success-shaped envelope', async () => {
    const execJsonSpy = vi.fn().mockResolvedValueOnce(makeReadBackMismatch());
    const verifier = new WriteVerifier(execJsonSpy);

    const result = (await verifier.verify(makeMutationSuccess(), makeIntent(), makeCompiledOp(), 'agent')) as Record<
      string,
      unknown
    >;

    expect(result['success']).toBe(false);
    expect(result['error']).toBeTruthy();
  });
});

// ─── D-04: read-back failure → VERIFY_READBACK_FAILED ───────────────────────

describe('D-04: read-back failure returns VERIFY_READBACK_FAILED error envelope', () => {
  const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];

  beforeEach(() => {
    delete process.env['OMNIFOCUS_MCP_ROLE'];
  });

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env['OMNIFOCUS_MCP_ROLE'];
    } else {
      process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
    }
  });

  it('execJson rejection in read-back returns VERIFY_READBACK_FAILED code', async () => {
    const execJsonSpy = vi.fn().mockRejectedValueOnce(new Error('osascript timeout'));
    const verifier = new WriteVerifier(execJsonSpy);

    const result = (await verifier.verify(makeMutationSuccess(), makeIntent(), makeCompiledOp(), 'agent')) as Record<
      string,
      unknown
    >;

    expect(result['success']).toBe(false);
    const error = result['error'] as Record<string, unknown>;
    expect(error['code']).toBe('VERIFY_READBACK_FAILED');
  });
});

// ─── VERIFY-03: success path → verified ─────────────────────────────────────

describe('VERIFY-03: success response carries verification_status: verified', () => {
  const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];

  beforeEach(() => {
    delete process.env['OMNIFOCUS_MCP_ROLE'];
  });

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env['OMNIFOCUS_MCP_ROLE'];
    } else {
      process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
    }
  });

  it('matching read-back produces metadata.verification_status: verified', async () => {
    const execJsonSpy = vi.fn().mockResolvedValueOnce(makeReadBackMatch());
    const verifier = new WriteVerifier(execJsonSpy);

    const result = (await verifier.verify(makeMutationSuccess(), makeIntent(), makeCompiledOp(), 'agent')) as Record<
      string,
      unknown
    >;

    expect(result['success']).toBe(true);
    const meta = result['metadata'] as Record<string, unknown>;
    expect(meta['verification_status']).toBe('verified');
  });
});

// ─── D-11: dry-run → skipped + logger audit ─────────────────────────────────

describe('D-11: dry-run produces verification_status: skipped + audit log', () => {
  const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];

  beforeEach(() => {
    delete process.env['OMNIFOCUS_MCP_ROLE'];
  });

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env['OMNIFOCUS_MCP_ROLE'];
    } else {
      process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
    }
  });

  it('dryRun: true in compiledOp produces verification_status: skipped', async () => {
    const execJsonSpy = vi.fn();
    const verifier = new WriteVerifier(execJsonSpy);
    const dryRunOp = makeCompiledOp({ dryRun: true });

    const result = (await verifier.verify(makeMutationSuccess(), makeIntent(), dryRunOp, 'agent')) as Record<
      string,
      unknown
    >;

    const meta = result['metadata'] as Record<string, unknown>;
    expect(meta['verification_status']).toBe('skipped');
  });

  it('dry-run does not invoke execJson for read-back', async () => {
    const execJsonSpy = vi.fn();
    const verifier = new WriteVerifier(execJsonSpy);
    const dryRunOp = makeCompiledOp({ dryRun: true });

    await verifier.verify(makeMutationSuccess(), makeIntent(), dryRunOp, 'agent');

    // No read-back spawn for dry-run — the write never happened.
    expect(execJsonSpy).not.toHaveBeenCalled();
  });
});

// ─── OMN-119: batch parity ───────────────────────────────────────────────────

describe('OMN-119/D-10: batch-parity — single and batch both produce verification_status: verified', () => {
  const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];

  beforeEach(() => {
    delete process.env['OMNIFOCUS_MCP_ROLE'];
  });

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env['OMNIFOCUS_MCP_ROLE'];
    } else {
      process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
    }
  });

  it('single task create → verification_status: verified', async () => {
    const execJsonSpy = vi.fn().mockResolvedValueOnce(makeReadBackMatch());
    const verifier = new WriteVerifier(execJsonSpy);

    const result = (await verifier.verify(makeMutationSuccess(), makeIntent(), makeCompiledOp(), 'agent')) as Record<
      string,
      unknown
    >;

    const meta = result['metadata'] as Record<string, unknown>;
    expect(meta['verification_status']).toBe('verified');
  });

  it('batch [task create] → produces verification_status: verified for each item', async () => {
    const batchMutationResult = {
      success: true,
      data: {
        operation: 'batch',
        summary: { created: 1, updated: 0, completed: 0, deleted: 0, errors: 0 },
        results: [{ success: true, data: { task: { id: 'task-abc', name: 'Buy milk' } } }],
      },
      metadata: {
        operation: 'batch',
        timestamp: new Date().toISOString(),
        from_cache: false,
      },
    };

    const batchCompiledOp = {
      operation: 'batch',
      operations: [{ operation: 'create', target: 'task', data: { name: 'Buy milk' } }],
    };

    const execJsonSpy = vi.fn().mockResolvedValueOnce(makeReadBackMatch());
    const verifier = new WriteVerifier(execJsonSpy);

    const result = (await verifier.verify(batchMutationResult, makeIntent(), batchCompiledOp, 'agent')) as Record<
      string,
      unknown
    >;

    const meta = result['metadata'] as Record<string, unknown>;
    expect(meta['verification_status']).toBe('verified');
  });
});
