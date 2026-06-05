/**
 * RoleGate integration tests for registerTools() in src/tools/index.ts.
 *
 * Wave 2: Activated — tests the role param, ListTools trim, and CallTool pre-dispatch gate.
 *
 * Covers:
 *   - GATE-01: ListTools AGENT vs OWNER operation enum trimming
 *   - GATE-02: CallTool pre-dispatch gate — deny and gate outcomes
 *   - READ-01/02/03: Read ops pass through the gate without policy fire (Plan 04)
 *
 * Analog: tests/unit/tools/write-tool-policy-guard.test.ts (mock cache + role env pattern)
 * Pattern: tests/unit/tools/index-tools-registration.test.ts (FakeServer + handler capture)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { registerTools } from '../../../src/tools/index.js';

// ---------------------------------------------------------------------------
// FakeServer — captures handlers without needing a real MCP Server instance
// ---------------------------------------------------------------------------

class FakeServer {
  handlers = new Map<unknown, (...args: unknown[]) => unknown>();
  setRequestHandler(schema: unknown, handler: (...args: unknown[]) => unknown) {
    this.handlers.set(schema, handler);
  }
}

// ---------------------------------------------------------------------------
// Mock helpers (copied from write-tool-policy-guard.test.ts)
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

// ---------------------------------------------------------------------------
// Role control — env-var pattern matching write-tool-policy-guard.test.ts
// ---------------------------------------------------------------------------

const originalRole = process.env['OMNIFOCUS_MCP_ROLE'];

beforeEach(() => {
  delete process.env['OMNIFOCUS_MCP_ROLE']; // agent (fail-safe default)
});

afterEach(() => {
  if (originalRole === undefined) delete process.env['OMNIFOCUS_MCP_ROLE'];
  else process.env['OMNIFOCUS_MCP_ROLE'] = originalRole;
});

// ---------------------------------------------------------------------------
// Helper: build a FakeServer with registerTools wired for a given role
// ---------------------------------------------------------------------------

function makeServer(role: 'agent' | 'owner' = 'agent'): FakeServer {
  const server = new FakeServer() as unknown as Parameters<typeof registerTools>[0];
  const cache = createMockCache();
  registerTools(server, cache, undefined, role);
  return server as unknown as FakeServer;
}

// ---------------------------------------------------------------------------
// GATE-01: ListTools operation enum trimming
// ---------------------------------------------------------------------------

describe('GATE-01: ListTools AGENT — operation enum trimmed', () => {
  it('ListTools AGENT — operation enum trimmed: delete and bulk_delete absent, create present', async () => {
    const server = makeServer('agent');
    const listHandler = server.handlers.get(ListToolsRequestSchema) as () => Promise<{
      tools: Array<{ name: string; inputSchema: unknown }>;
    }>;
    expect(listHandler).toBeTypeOf('function');

    const result = await listHandler();
    const writeTool = result.tools.find((t) => t.name === 'omnifocus_write');
    expect(writeTool).toBeDefined();

    const opEnum = (
      writeTool!.inputSchema as {
        properties: { mutation: { properties: { operation: { enum: string[] } } } };
      }
    ).properties.mutation.properties.operation.enum;

    expect(opEnum).not.toContain('delete');
    expect(opEnum).not.toContain('bulk_delete');
    expect(opEnum).toContain('create');
    expect(opEnum).toContain('complete');
  });

  it('ListTools OWNER — operation enum contains full surface including delete and bulk_delete', async () => {
    const server = makeServer('owner');
    const listHandler = server.handlers.get(ListToolsRequestSchema) as () => Promise<{
      tools: Array<{ name: string; inputSchema: unknown }>;
    }>;

    const result = await listHandler();
    const writeTool = result.tools.find((t) => t.name === 'omnifocus_write');
    expect(writeTool).toBeDefined();

    const opEnum = (
      writeTool!.inputSchema as {
        properties: { mutation: { properties: { operation: { enum: string[] } } } };
      }
    ).properties.mutation.properties.operation.enum;

    expect(opEnum).toContain('delete');
    expect(opEnum).toContain('bulk_delete');
    expect(opEnum).toContain('create');
  });
});

// ---------------------------------------------------------------------------
// GATE-02: CallTool pre-dispatch gate
// ---------------------------------------------------------------------------

describe('GATE-02: CallTool pre-dispatch policy gate', () => {
  it('CallTool AGENT delete → POLICY_DENY_DELETE at dispatch (not InternalError)', async () => {
    const server = makeServer('agent');
    const callHandler = server.handlers.get(CallToolRequestSchema) as (req: {
      params: { name: string; arguments: unknown };
    }) => Promise<{ content: Array<{ type: string; text: string }> }>;

    const response = await callHandler({
      params: {
        name: 'omnifocus_write',
        arguments: { mutation: { operation: 'delete', target: 'task', id: 'fake-id' } },
      },
    });

    expect(response).toHaveProperty('content');
    expect(Array.isArray(response.content)).toBe(true);
    const payload = JSON.parse(response.content[0].text) as { error: { code: string } };
    expect(payload.error.code).toBe('POLICY_DENY_DELETE');
  });

  it('CallTool AGENT bulk_delete → POLICY_DENY_DELETE at dispatch', async () => {
    const server = makeServer('agent');
    const callHandler = server.handlers.get(CallToolRequestSchema) as (req: {
      params: { name: string; arguments: unknown };
    }) => Promise<{ content: Array<{ type: string; text: string }> }>;

    const response = await callHandler({
      params: {
        name: 'omnifocus_write',
        arguments: { mutation: { operation: 'bulk_delete', target: 'task', ids: ['id1'] } },
      },
    });

    expect(response).toHaveProperty('content');
    const payload = JSON.parse(response.content[0].text) as { error: { code: string } };
    expect(payload.error.code).toBe('POLICY_DENY_DELETE');
  });

  it('CallTool AGENT tag_manage/merge → POLICY_GATE_REQUIRES_OWNER at dispatch', async () => {
    const server = makeServer('agent');
    const callHandler = server.handlers.get(CallToolRequestSchema) as (req: {
      params: { name: string; arguments: unknown };
    }) => Promise<{ content: Array<{ type: string; text: string }> }>;

    const response = await callHandler({
      params: {
        name: 'omnifocus_write',
        arguments: { mutation: { operation: 'tag_manage', action: 'merge', tagName: 'a', targetTag: 'b' } },
      },
    });

    expect(response).toHaveProperty('content');
    const payload = JSON.parse(response.content[0].text) as { error: { code: string } };
    expect(payload.error.code).toBe('POLICY_GATE_REQUIRES_OWNER');
  });

  it('CallTool OWNER delete passes dispatch — no POLICY_DENY_DELETE in response', async () => {
    // Set env var so the Write tool's Phase 2 funnel also sees owner role.
    // The dispatch gate uses the closure-captured 'owner' role from registerTools.
    // The Write tool's funnel still calls parseRole() from env (Phase 4 deferred item — D-10).
    process.env['OMNIFOCUS_MCP_ROLE'] = 'owner';
    const server = makeServer('owner');
    const callHandler = server.handlers.get(CallToolRequestSchema) as (req: {
      params: { name: string; arguments: unknown };
    }) => Promise<{ content: Array<{ type: string; text: string }> }>;

    // Owner passes the gate; the tool may error for other reasons (no real OmniFocus)
    let response: { content: Array<{ type: string; text: string }> };
    try {
      response = await callHandler({
        params: {
          name: 'omnifocus_write',
          arguments: { mutation: { operation: 'delete', target: 'task', id: 'fake-id' } },
        },
      });
    } catch {
      // An error thrown here (McpError or other) is acceptable — the gate didn't deny
      return;
    }

    if (response.content?.[0]?.text) {
      const payload = JSON.parse(response.content[0].text) as { error?: { code: string } };
      // Must NOT be a policy denial — any other error code is acceptable
      expect((payload.error as Record<string, unknown> | undefined)?.code).not.toBe('POLICY_DENY_DELETE');
    }
  });
});

// ---------------------------------------------------------------------------
// READ-01/02/03: Read ops pass through gate without policy fire (Plan 04)
// ---------------------------------------------------------------------------

describe('READ-01: CallTool AGENT read modes never fire policy gate', () => {
  it.todo('CallTool AGENT omnifocus_read (today/overdue/flagged) never fires policy gate');
});

describe('READ-02: CallTool AGENT omnifocus_read with filters.id', () => {
  it.todo('CallTool AGENT omnifocus_read with filters.id succeeds');
});

describe('READ-03: CallTool AGENT omnifocus_read type=perspectives', () => {
  it.todo('CallTool AGENT omnifocus_read type=perspectives succeeds');
});
