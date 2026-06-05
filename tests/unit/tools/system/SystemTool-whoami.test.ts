/**
 * Whoami operation tests for src/tools/system/SystemTool.ts.
 *
 * Covers:
 *   - D-12/D-13: whoami AGENT payload omits identity field entirely (D-15)
 *   - D-12/D-13: whoami OWNER payload returns full identity block
 *   - D-15: dual-schema parity — SystemToolSchema Zod enum and inputSchema getter both enumerate whoami
 */

import { describe, it, expect, vi } from 'vitest';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { SystemTool, SystemToolSchema } from '../../../../src/tools/system/SystemTool.js';
import type { ResolvedContext } from '../../../../src/contracts/roles.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

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

const agentContext: ResolvedContext = {
  role: 'agent',
  identity: {
    transport: 'stdio',
    roleSource: 'fail-safe-default',
    principal: null,
  },
};

const ownerContext: ResolvedContext = {
  role: 'owner',
  identity: {
    transport: 'stdio',
    roleSource: 'explicit-env',
    principal: null,
  },
};

// ---------------------------------------------------------------------------
// D-12/D-13: whoami AGENT — identity field omitted (D-15)
// ---------------------------------------------------------------------------

describe('whoami AGENT: role-scoped redaction (D-13/D-15)', () => {
  it('whoami AGENT: returns role and roleSource, omits identity field entirely (D-15)', async () => {
    const tool = new SystemTool(createMockCache(), agentContext);
    const result = await tool.execute({ operation: 'whoami' });
    const data = (result as { data: Record<string, unknown> }).data;

    expect(data.role).toBe('agent');
    expect(data.roleSource).toBeDefined();
    // roleSource must be one of the three valid RoleSource values
    expect(['fail-safe-default', 'explicit-env', 'http-token']).toContain(data.roleSource);
    // D-15: identity field must be structurally absent — not null, not undefined-valued key
    expect(data.identity).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// D-12/D-13: whoami OWNER — full identity block
// ---------------------------------------------------------------------------

describe('whoami OWNER: full identity block returned', () => {
  it('whoami OWNER: returns role and identity{transport, roleSource, principal}, principal is null', async () => {
    const tool = new SystemTool(createMockCache(), ownerContext);
    const result = await tool.execute({ operation: 'whoami' });
    const data = (result as { data: Record<string, unknown> }).data;

    expect(data.role).toBe('owner');
    expect(data.identity).toBeDefined();

    const identity = data.identity as Record<string, unknown>;
    expect(identity.transport).toBe('stdio');
    expect(identity.roleSource).toBe('explicit-env');
    // principal is null until Phase 4
    expect(identity.principal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D-15: dual-schema parity for whoami
// ---------------------------------------------------------------------------

describe('dual-schema parity: whoami enumerated in both Zod and inputSchema (D-15)', () => {
  it('dual-schema: SystemToolSchema Zod enum and inputSchema getter both enumerate whoami (D-15)', () => {
    const tool = new SystemTool(createMockCache());

    // inputSchema getter must include whoami
    const inputSchema = tool.inputSchema as {
      properties: { operation: { enum: string[] } };
    };
    expect(inputSchema.properties.operation.enum).toContain('whoami');

    // Zod schema must accept whoami without throwing
    const parsed = SystemToolSchema.safeParse({ operation: 'whoami' });
    expect(parsed.success).toBe(true);
  });
});
