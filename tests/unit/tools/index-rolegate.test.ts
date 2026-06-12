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
import { OmniFocusWriteTool } from '../../../src/tools/unified/OmniFocusWriteTool.js';

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
// WR-01/WR-02: advertised enum ⊆ base Zod schema enum
//
// allowedOperations() includes forward-declared/inert policy entries ('drop',
// 'perspective_delete') that the write Zod schema has no literal for. Those must
// NOT leak into the ListTools-advertised enum, or the agent sees an op/action it
// can never actually call (advertise⟺validate mismatch).
// ---------------------------------------------------------------------------

describe('WR-01/WR-02: advertised write enum has no phantom (non-Zod) ops/actions', () => {
  function baseWriteEnums() {
    const base = new OmniFocusWriteTool(createMockCache()).inputSchema as {
      properties: {
        mutation: { properties: { operation: { enum: string[] }; action?: { enum: string[] } } };
      };
    };
    const props = base.properties.mutation.properties;
    return { operation: props.operation.enum, action: props.action?.enum ?? [] };
  }

  async function advertisedWriteEnums(role: 'agent' | 'owner') {
    const server = makeServer(role);
    const listHandler = server.handlers.get(ListToolsRequestSchema) as () => Promise<{
      tools: Array<{ name: string; inputSchema: unknown }>;
    }>;
    const result = await listHandler();
    const writeTool = result.tools.find((t) => t.name === 'omnifocus_write')!;
    const props = (
      writeTool.inputSchema as {
        properties: { mutation: { properties: { operation: { enum: string[] }; action?: { enum: string[] } } } };
      }
    ).properties.mutation.properties;
    return { operation: props.operation.enum, action: props.action?.enum ?? [] };
  }

  it('AGENT advertised operation enum is a subset of the base Zod enum (no phantom drop)', async () => {
    const base = baseWriteEnums();
    const adv = await advertisedWriteEnums('agent');
    for (const op of adv.operation) expect(base.operation).toContain(op);
    expect(adv.operation).not.toContain('drop');
    // sanity: real allowed ops survive the intersection
    expect(adv.operation).toContain('create');
    expect(adv.operation).toContain('complete');
  });

  it('OWNER advertised operation enum is a subset of the base Zod enum (no phantom drop)', async () => {
    const base = baseWriteEnums();
    const adv = await advertisedWriteEnums('owner');
    for (const op of adv.operation) expect(base.operation).toContain(op);
    expect(adv.operation).not.toContain('drop');
    expect(adv.operation).toContain('delete');
  });

  it('AGENT advertised action enum is a subset of the base Zod enum (no phantom perspective_delete)', async () => {
    const base = baseWriteEnums();
    const adv = await advertisedWriteEnums('agent');
    for (const action of adv.action) expect(base.action).toContain(action);
    expect(adv.action).not.toContain('perspective_delete');
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

  it('CallTool AGENT create task WITH lineage → delegated past dispatch gate (not REQUIRES_OWNER)', async () => {
    // The create gate carries funnel-level bypasses (session-grant D-02, lineage
    // capture-attestation D-08b) and a mode-aware verdict fork that the blunt
    // dispatch gate does not know about. Dispatch must delegate 'gate' CREATE
    // outcomes to the WriteTool funnel rather than short-circuit them with
    // REQUIRES_OWNER (structural gated ops like tag_manage/merge still block here).
    const execSpy = vi
      .spyOn(OmniFocusWriteTool.prototype as unknown as { execJson: () => Promise<unknown> }, 'execJson')
      .mockResolvedValue(undefined);
    try {
      const server = makeServer('agent');
      const callHandler = server.handlers.get(CallToolRequestSchema) as (req: {
        params: { name: string; arguments: unknown };
      }) => Promise<{ content: Array<{ type: string; text: string }> }>;

      let response: { content: Array<{ type: string; text: string }> } | undefined;
      try {
        response = await callHandler({
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'create',
                target: 'task',
                data: { name: 'Lineage capture (dispatch)', lineage: { sessionId: 'rolegate-test' } },
              },
            },
          },
        });
      } catch {
        // Reaching execution and throwing (rather than a dispatch denial) still
        // proves the dispatch gate delegated the create — acceptable.
        return;
      }

      if (response?.content?.[0]?.text) {
        const payload = JSON.parse(response.content[0].text) as { error?: { code: string } };
        expect(payload.error?.code).not.toBe('POLICY_GATE_REQUIRES_OWNER');
      }
    } finally {
      execSpy.mockRestore();
    }
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
//
// Core property: normalizeArgsToPolicy({ query: { ... } }) returns [] because
// args has no 'mutation' field. The dispatch gate loop is a no-op and the
// CallTool handler proceeds to tool.execute(). The tool may fail for lack of
// real OmniFocus — that is acceptable. The test asserts only that the error
// (if any) is not a policy denial.
// ---------------------------------------------------------------------------

describe('READ-01: CallTool AGENT read modes never fire policy gate', () => {
  it('CallTool AGENT omnifocus_read (countOnly query) never fires policy gate', async () => {
    const server = makeServer('agent');
    const callHandler = server.handlers.get(CallToolRequestSchema) as (req: {
      params: { name: string; arguments: unknown };
    }) => Promise<{ content: Array<{ type: string; text: string }> }>;

    let response: { content: Array<{ type: string; text: string }> } | undefined;
    try {
      response = await callHandler({
        params: {
          name: 'omnifocus_read',
          arguments: { query: { type: 'tasks', filters: { status: 'active' }, countOnly: true } },
        },
      });
    } catch {
      // An error thrown (not a structured content response) means tool execution
      // failed for non-policy reasons — acceptable; the gate did not deny.
      return;
    }

    if (response?.content?.[0]?.text) {
      const payload = JSON.parse(response.content[0].text) as { error?: { code: string } };
      expect(payload?.error?.code).not.toBe('POLICY_DENY_DELETE');
      expect(payload?.error?.code).not.toBe('POLICY_GATE_REQUIRES_OWNER');
    }
  });
});

describe('READ-02: CallTool AGENT omnifocus_read with filters.id', () => {
  it('CallTool AGENT omnifocus_read with filters.id never fires policy gate', async () => {
    const server = makeServer('agent');
    const callHandler = server.handlers.get(CallToolRequestSchema) as (req: {
      params: { name: string; arguments: unknown };
    }) => Promise<{ content: Array<{ type: string; text: string }> }>;

    let response: { content: Array<{ type: string; text: string }> } | undefined;
    try {
      response = await callHandler({
        params: {
          name: 'omnifocus_read',
          arguments: { query: { type: 'tasks', filters: { id: 'test-task-id' } } },
        },
      });
    } catch {
      return;
    }

    if (response?.content?.[0]?.text) {
      const payload = JSON.parse(response.content[0].text) as { error?: { code: string } };
      expect(payload?.error?.code).not.toBe('POLICY_DENY_DELETE');
      expect(payload?.error?.code).not.toBe('POLICY_GATE_REQUIRES_OWNER');
    }
  });
});

describe('READ-03: CallTool AGENT omnifocus_read type=perspectives', () => {
  it('CallTool AGENT omnifocus_read type=perspectives never fires policy gate', async () => {
    const server = makeServer('agent');
    const callHandler = server.handlers.get(CallToolRequestSchema) as (req: {
      params: { name: string; arguments: unknown };
    }) => Promise<{ content: Array<{ type: string; text: string }> }>;

    let response: { content: Array<{ type: string; text: string }> } | undefined;
    try {
      response = await callHandler({
        params: {
          name: 'omnifocus_read',
          arguments: { query: { type: 'perspectives' } },
        },
      });
    } catch {
      return;
    }

    if (response?.content?.[0]?.text) {
      const payload = JSON.parse(response.content[0].text) as { error?: { code: string } };
      expect(payload?.error?.code).not.toBe('POLICY_DENY_DELETE');
      expect(payload?.error?.code).not.toBe('POLICY_GATE_REQUIRES_OWNER');
    }
  });
});
