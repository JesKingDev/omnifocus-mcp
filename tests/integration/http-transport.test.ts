/**
 * HTTP Transport Integration Tests
 *
 * Tests the MCP Streamable HTTP transport for remote access scenarios.
 * This is the foundation for Windows -> Mac remote OmniFocus access.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { HTTPTestClient } from './helpers/http-test-client.js';
import { expectOk } from './helpers/expect-ok.js';

// Auto-enable on macOS with OmniFocus
const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

d('HTTP Transport Integration Tests', () => {
  let client: HTTPTestClient;
  // Owner token registered on the server so a dedicated owner client can run the
  // gated create test (Phase 2 gates AGENT task-creates). Must differ from the
  // default agent token the helper assigns.
  const OWNER_TOKEN = 'maintest-owner-token-cccccccccccccccccccccccc';

  beforeAll(async () => {
    console.log('🚀 Starting HTTP transport test server...');
    client = new HTTPTestClient({
      port: 3099,
      host: '127.0.0.1',
      enableCacheWarming: false, // Faster test startup
      ownerToken: OWNER_TOKEN,
    });
    await client.startServer();
    // Initialize once for all tests in this suite
    await client.initialize();
    console.log('✅ HTTP server ready and initialized');
  }, 60000); // 60s timeout for server startup

  afterAll(async () => {
    console.log('🧹 Shutting down HTTP test server...');
    await client.cleanup();
    await client.stop();
    console.log('✅ HTTP server shutdown complete');
  });

  describe('Health Endpoint', () => {
    it('should return health status', async () => {
      const health = await client.health();

      expect(health).toHaveProperty('status', 'ok');
      expect(health).toHaveProperty('version');
      expect(health).toHaveProperty('sessions');
      expect(typeof health.sessions).toBe('number');
    });
  });

  describe('Sessions Endpoint', () => {
    it('should return session statistics', async () => {
      const sessions = await client.sessions();

      expect(sessions).toHaveProperty('activeSessions');
      expect(sessions).toHaveProperty('sessionIds');
      expect(Array.isArray(sessions.sessionIds)).toBe(true);
    });
  });

  describe('MCP Protocol over HTTP', () => {
    it('should have initialized MCP connection', async () => {
      // Session was initialized in beforeAll
      expect(client.isInitialized()).toBe(true);
      expect(client.getMcpSessionId()).toBeTruthy();
    });

    it('should maintain session across requests', async () => {
      const firstSessionId = client.getMcpSessionId();
      expect(firstSessionId).toBeTruthy();

      // Subsequent request should use same session
      const tools = await client.listTools();
      const secondSessionId = client.getMcpSessionId();

      expect(secondSessionId).toBe(firstSessionId);
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('Tools Discovery over HTTP', () => {
    it('should list all available tools', async () => {
      const tools = await client.listTools();

      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBe(4); // Unified API: 4 tools

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('omnifocus_read');
      expect(toolNames).toContain('omnifocus_write');
      expect(toolNames).toContain('omnifocus_analyze');
      expect(toolNames).toContain('system');
    });
  });

  describe('Tool Execution over HTTP', () => {
    afterEach(async () => {
      await client.cleanup();
    });

    it('should execute system tool', async () => {
      const result = (await client.callTool('system', {
        operation: 'version',
      })) as { success: boolean; data: { version: string } };

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('version');
    });

    it('should query tasks via omnifocus_read', { timeout: 90000 }, async () => {
      const result = (await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          limit: 5,
        },
      })) as { success: boolean; data: { tasks: unknown[] } };

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('tasks');
      expect(Array.isArray(result.data.tasks)).toBe(true);
    });

    it('should create a task successfully', { timeout: 90000 }, async () => {
      // Phase 2 gates AGENT task-creates (the default role). This transport test
      // asserts that create works over HTTP, not the gate — so it runs as OWNER
      // via a dedicated owner-authenticated client against the same server. The
      // owner role's create→agent role distinction itself is covered by the
      // Phase 4 per-session role-parity test. The owner client cleans up its own
      // task (cleanup uses bulk_delete, which is denied for the agent role).
      const ownerClient = new HTTPTestClient({ port: 3099, host: '127.0.0.1', authToken: OWNER_TOKEN });
      try {
        await ownerClient.initialize();
        const createResult = (await ownerClient.createTestTask('HTTP Transport Test Task')) as {
          success: boolean;
          error?: unknown;
          data: { task: { taskId: string; name: string } };
        };

        expectOk(createResult, 'HTTP transport create task');
        expect(createResult.data.task.taskId).toBeTruthy();
        expect(createResult.data.task.name).toContain('HTTP Transport Test Task');
      } finally {
        await ownerClient.cleanup();
      }
    });

    it('should run analytics via omnifocus_analyze', { timeout: 90000 }, async () => {
      const result = (await client.callTool('omnifocus_analyze', {
        analysis: {
          type: 'productivity_stats',
        },
      })) as { success: boolean; data: unknown };

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
    });
  });

  describe('Error Handling over HTTP', () => {
    it('should handle invalid tool name gracefully', async () => {
      await expect(client.callTool('nonexistent_tool', {})).rejects.toThrow();
    });

    it('should handle invalid tool arguments gracefully', async () => {
      await expect(
        client.callTool('omnifocus_read', {
          query: {
            type: 'invalid_type',
          },
        }),
      ).rejects.toThrow();
    });
  });
});

d('HTTP Transport Authentication Tests', () => {
  const AUTH_TOKEN = 'test-secret-token-12345';
  const AUTH_PORT = 3088; // Use different port to avoid conflicts
  let authClient: HTTPTestClient;

  beforeAll(async () => {
    // Wait a moment to ensure previous server is fully released
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('🚀 Starting authenticated HTTP test server...');
    authClient = new HTTPTestClient({
      port: AUTH_PORT,
      host: '127.0.0.1',
      authToken: AUTH_TOKEN,
      enableCacheWarming: false,
    });
    await authClient.startServer();
    console.log('✅ Authenticated HTTP server ready');
  }, 90000); // Longer timeout

  afterAll(async () => {
    console.log('🧹 Shutting down authenticated HTTP test server...');
    await authClient.cleanup();
    await authClient.stop();
    console.log('✅ Authenticated HTTP server shutdown complete');
  });

  it('should accept requests with valid auth token', async () => {
    const health = await authClient.health();
    expect(health.status).toBe('ok');
  });

  it('should reject requests without auth token', async () => {
    // Make request without auth token to the authenticated server
    const response = await fetch(`http://127.0.0.1:${AUTH_PORT}/health`);
    expect(response.status).toBe(401);
  });

  it('should reject requests with invalid auth token', async () => {
    const response = await fetch(`http://127.0.0.1:${AUTH_PORT}/health`, {
      headers: {
        Authorization: 'Bearer wrong-token',
      },
    });
    expect(response.status).toBe(401);
  });

  it('should work with valid token for MCP operations', async () => {
    await authClient.initialize();
    const tools = await authClient.listTools();
    expect(tools.length).toBe(4);
  });
});

d('HTTP Transport Concurrent Sessions', () => {
  const CONCURRENT_PORT = 3087; // Use different port to avoid conflicts
  let serverClient: HTTPTestClient;
  let client1: HTTPTestClient;
  let client2: HTTPTestClient;

  beforeAll(async () => {
    // Wait a moment to ensure previous server is fully released
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('🚀 Starting HTTP server for concurrent session tests...');
    // Start a server using the first client
    serverClient = new HTTPTestClient({
      port: CONCURRENT_PORT,
      host: '127.0.0.1',
      enableCacheWarming: false,
    });
    await serverClient.startServer();

    // Create two additional clients that connect to the same server
    client1 = new HTTPTestClient({
      port: CONCURRENT_PORT,
      host: '127.0.0.1',
      enableCacheWarming: false,
    });
    client2 = new HTTPTestClient({
      port: CONCURRENT_PORT,
      host: '127.0.0.1',
      enableCacheWarming: false,
    });

    console.log('✅ Concurrent sessions test server ready');
  }, 60000);

  afterAll(async () => {
    console.log('🧹 Shutting down concurrent sessions test server...');
    await client1.cleanup();
    await client2.cleanup();
    await serverClient.stop();
    console.log('✅ Concurrent sessions server shutdown complete');
  });

  it('should handle two concurrent sessions', async () => {
    // Initialize both clients (they'll get different sessions)
    await client1.initialize();
    await client2.initialize();

    const session1 = client1.getMcpSessionId();
    const session2 = client2.getMcpSessionId();

    // Sessions should be different
    expect(session1).toBeTruthy();
    expect(session2).toBeTruthy();
    expect(session1).not.toBe(session2);

    // Both should be able to list tools
    const [tools1, tools2] = await Promise.all([client1.listTools(), client2.listTools()]);

    expect(tools1.length).toBe(4);
    expect(tools2.length).toBe(4);
  });

  it('should track sessions correctly', async () => {
    // Sessions should already be initialized from previous test
    // Server should show at least 2 active sessions
    const sessions = await client1.sessions();
    expect(sessions.activeSessions).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Phase 4 — HTTP edge hardening (HTTP-01..HTTP-05).
 *
 * E2E coverage for the security properties that the manual smoke test
 * (scripts/smoke-http-auth.sh) checks, so they are enforced in CI:
 *   - missing request body is rejected (400)
 *   - both agent and owner tokens authenticate (200)
 *   - per-session role parity: the agent token's omnifocus_write schema omits
 *     delete/bulk_delete; the owner token's includes them
 *   - the server fails closed when bound to a non-loopback interface
 *
 * NOTE: every /mcp request must send `Accept: application/json, text/event-stream`
 * — the MCP Streamable-HTTP transport returns 406 without it.
 */
d('HTTP Transport Phase 4 Hardening', () => {
  const AGENT_TOKEN = 'phase4-agent-token-aaaaaaaaaaaaaaaaaaaaaaaa';
  const OWNER_TOKEN = 'phase4-owner-token-bbbbbbbbbbbbbbbbbbbbbbbb';
  const PORT = 3086; // distinct from other suites
  const ACCEPT = 'application/json, text/event-stream';
  const INIT_BODY = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'phase4-test', version: '1.0.0' },
    },
  });

  let server: HTTPTestClient; // owns the server process; connects as the agent
  let ownerClient: HTTPTestClient; // connects to the same server as the owner

  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    server = new HTTPTestClient({
      port: PORT,
      host: '127.0.0.1',
      authToken: AGENT_TOKEN,
      ownerToken: OWNER_TOKEN,
      enableCacheWarming: false,
    });
    await server.startServer();
    ownerClient = new HTTPTestClient({ port: PORT, host: '127.0.0.1', authToken: OWNER_TOKEN });
  }, 90000);

  afterAll(async () => {
    await server.stop();
  });

  it('rejects an authenticated POST with no body (400)', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        Accept: ACCEPT,
        'Content-Type': 'application/json',
      },
    });
    expect(res.status).toBe(400);
  });

  it('accepts both the agent and owner tokens (200)', async () => {
    for (const token of [AGENT_TOKEN, OWNER_TOKEN]) {
      const res = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: ACCEPT,
          'Content-Type': 'application/json',
        },
        body: INIT_BODY,
      });
      expect(res.status).toBe(200);
    }
  });

  it('applies per-session role: agent write schema omits delete; owner includes it', async () => {
    // Extract the top-level operation enum from omnifocus_write's advertised schema.
    const operationEnum = (tools: Array<{ name: string; inputSchema?: unknown }>): string[] => {
      const write = tools.find((t) => t.name === 'omnifocus_write');
      const found: string[] = [];
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
          node.forEach(walk);
        } else if (node && typeof node === 'object') {
          const obj = node as Record<string, unknown>;
          const en = obj.enum;
          if (Array.isArray(en) && en.includes('create') && en.includes('tag_manage')) {
            found.push(...(en as string[]));
          }
          Object.values(obj).forEach(walk);
        }
      };
      walk(write?.inputSchema);
      return found;
    };

    await server.initialize(); // agent session
    const agentOps = operationEnum(await server.listToolsRaw());
    await ownerClient.initialize(); // owner session
    const ownerOps = operationEnum(await ownerClient.listToolsRaw());

    expect(agentOps).toContain('create');
    expect(agentOps).not.toContain('delete');
    expect(agentOps).not.toContain('bulk_delete');

    expect(ownerOps).toContain('delete');
    expect(ownerOps).toContain('bulk_delete');
  });

  it('fails closed when bound to a non-loopback interface (0.0.0.0)', async () => {
    const exitCode = await new Promise<number | null>((resolve) => {
      const proc = spawn('node', ['./dist/index.js', '--http', '--port', String(PORT + 50), '--host', '0.0.0.0'], {
        env: { ...process.env, MCP_AGENT_TOKEN: AGENT_TOKEN },
        stdio: 'ignore',
      });
      proc.on('exit', (code) => resolve(code));
    });
    expect(exitCode).not.toBe(0);
  }, 30000);

  // Regression: CR-01 — a session is bound to the token that created it. Reusing an
  // owner's session ID with a different (agent) token must NOT inherit owner privileges.
  it('rejects reuse of a session by a different token (no privilege escalation)', async () => {
    const initRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OWNER_TOKEN}`,
        Accept: ACCEPT,
        'Content-Type': 'application/json',
      },
      body: INIT_BODY,
    });
    const ownerSid = initRes.headers.get('mcp-session-id');
    expect(ownerSid).toBeTruthy();

    const hijack = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        Accept: ACCEPT,
        'Content-Type': 'application/json',
        'Mcp-Session-Id': ownerSid as string,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list' }),
    });
    expect(hijack.status).toBe(403);
  });

  // Regression: CR-02 — /sessions leaks live session IDs (the secret CR-01 needs).
  // It must be restricted to the owner role.
  it('restricts /sessions to the owner role', async () => {
    const agentRes = await fetch(`http://127.0.0.1:${PORT}/sessions`, {
      headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
    });
    expect(agentRes.status).toBe(403);

    const ownerRes = await fetch(`http://127.0.0.1:${PORT}/sessions`, {
      headers: { Authorization: `Bearer ${OWNER_TOKEN}` },
    });
    expect(ownerRes.status).toBe(200);
  });
});
