/**
 * Whoami operation tests for src/tools/system/SystemTool.ts.
 *
 * Wave 0: stub file — all tests are pending (it.todo vitest markers).
 * Wave 3 implementors activate these once the whoami op is wired with role-aware
 * redaction (D-13/D-15).
 *
 * Covers:
 *   - D-12/D-13: whoami AGENT payload omits identity field entirely (D-15)
 *   - D-12/D-13: whoami OWNER payload returns full identity block
 *   - D-15: dual-schema parity — SystemToolSchema Zod enum and inputSchema getter both enumerate whoami
 *
 * Analog: tests/unit/tools/write-tool-policy-guard.test.ts (mock cache + role env pattern)
 */

import { describe, it, vi } from 'vitest';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

// Imports activated at Wave 3 — kept as comments so implementors know what to add
// import { SystemTool } from '../../../../src/tools/system/SystemTool.js';

// ---------------------------------------------------------------------------
// Mock helpers (copied from write-tool-policy-guard.test.ts — Wave 3 ready)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// Role control — env-var pattern matching write-tool-policy-guard.test.ts
// (activated at Wave 3; kept here so implementors don't need to restructure)
// const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];
// beforeEach(() => { delete process.env['OMNIFOCUS_MCP_ROLE']; }); // agent
// afterEach(() => {
//   if (originalRole === undefined) delete process.env['OMNIFOCUS_MCP_ROLE'];
//   else process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
// });

// ---------------------------------------------------------------------------
// D-12/D-13: whoami AGENT — identity field omitted (D-15)
// ---------------------------------------------------------------------------

describe('whoami AGENT: role-scoped redaction (D-13/D-15)', () => {
  it.todo('whoami AGENT: returns role and roleSource, omits identity field entirely (D-15)');
});

// ---------------------------------------------------------------------------
// D-12/D-13: whoami OWNER — full identity block
// ---------------------------------------------------------------------------

describe('whoami OWNER: full identity block returned', () => {
  it.todo('whoami OWNER: returns role and identity{transport, roleSource, principal}, principal is null');
});

// ---------------------------------------------------------------------------
// D-15: dual-schema parity for whoami
// ---------------------------------------------------------------------------

describe('dual-schema parity: whoami enumerated in both Zod and inputSchema (D-15)', () => {
  it.todo('dual-schema: SystemToolSchema Zod enum and inputSchema getter both enumerate whoami (D-15)');
});
