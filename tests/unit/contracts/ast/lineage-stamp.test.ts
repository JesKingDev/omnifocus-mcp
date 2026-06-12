import { describe, it, expect } from 'vitest';
import { composeLineageStamp } from '../../../../src/contracts/ast/lineage.js';

// ---------------------------------------------------------------------------
// LINE-01: lineage stamp composition + idempotency
//
// Tests the composeLineageStamp() helper that appends the of-mcp:lineage
// block to a task note. Production code lives in src/contracts/ast/lineage.ts
// (Wave 3). These tests are RED until that file is created.
//
// D-09 canonical format:
//   <existing user note text>
//
//   <!-- of-mcp:lineage
//   {"v":1,"agent":"claude-code","session":"<uuid>","created_at":"<iso8601>"}
//   -->
// ---------------------------------------------------------------------------

describe('composeLineageStamp — LINE-01 stamp composition + idempotency', () => {
  it('appends lineage block after existing note with blank-line separator', () => {
    const result = composeLineageStamp('My note', { sessionId: 'sess-123' });

    expect(result).toContain('\n\n<!-- of-mcp:lineage\n');
    expect(result).toMatch(/^My note/);

    const jsonMatch = result.match(/<!-- of-mcp:lineage\n(.*?)\n-->/s);
    expect(jsonMatch).not.toBeNull();
    const payload = JSON.parse(jsonMatch![1]);
    expect(payload.v).toBe(1);
    expect(payload.agent).toBe('claude-code');
    expect(payload.session).toBe('sess-123');
    expect(payload.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('strips existing lineage block before re-appending (idempotent)', () => {
    const first = composeLineageStamp('My note', { sessionId: 'sess-123' });
    const second = composeLineageStamp('My note', { sessionId: 'sess-123' });

    expect(second).toBe(first);

    // No duplicate blocks
    const blockCount = (second.match(/<!-- of-mcp:lineage/g) ?? []).length;
    expect(blockCount).toBe(1);
  });

  it('works with no user note (undefined)', () => {
    const result = composeLineageStamp(undefined, { sessionId: 'sess-456' });

    expect(result).toMatch(/^\n\n<!-- of-mcp:lineage\n/);
    expect(result).toContain('of-mcp:lineage');
  });

  it('respects caller-supplied agent and createdAt overrides', () => {
    const result = composeLineageStamp('Override test', {
      sessionId: 'sess-789',
      agent: 'test-agent',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const jsonMatch = result.match(/<!-- of-mcp:lineage\n(.*?)\n-->/s);
    expect(jsonMatch).not.toBeNull();
    const payload = JSON.parse(jsonMatch![1]);
    expect(payload.agent).toBe('test-agent');
    expect(payload.created_at).toBe('2026-01-01T00:00:00.000Z');
  });
});
