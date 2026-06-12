/**
 * WriteVerifier integration test — Wave 0 scaffold.
 *
 * This test is intentionally RED in Wave 0 — the verifier is not wired into
 * executeValidated() yet. It turns GREEN after Wave 3 (Plan 05-05) wires the
 * verifier into the write tool funnel.
 *
 * Test: create a task via omnifocus_write and assert the response metadata
 * carries verification_status: "verified".
 *
 * Requirements: VERIFY-01 (independent read-back), VERIFY-02 (field-level diff),
 * VERIFY-03 (status in metadata).
 *
 * Design mirrors tests/integration/tools/unified/field-roundtrip.test.ts:
 * - Server spawned from dist/index.js
 * - MCP initialize handshake
 * - stdio JSON-RPC sendRequest helper
 * - Sandbox discipline (runScopedName, fullCleanup)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { ensureSandboxFolder, fullCleanup } from '../helpers/sandbox-manager.js';
import { runScopedName } from '../helpers/run-id.js';

describe('WriteVerifier integration: task create response includes verification_status', () => {
  let serverProcess: ChildProcess;
  let nextId = 1;

  async function sendRequest(request: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestStr = JSON.stringify(request) + '\n';
      let buffer = '';
      const timeout = setTimeout(() => reject(new Error('Request timeout after 120s')), 120000);

      const onData = (data: Buffer) => {
        buffer += data.toString();
        for (const line of buffer.split('\n')) {
          if (line.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.jsonrpc === '2.0' && 'result' in parsed) {
                clearTimeout(timeout);
                serverProcess.stdout?.off('data', onData);
                resolve(parsed.result);
                return;
              }
              if (parsed.jsonrpc === '2.0' && 'error' in parsed) {
                clearTimeout(timeout);
                serverProcess.stdout?.off('data', onData);
                reject(new Error(`MCP error: ${JSON.stringify(parsed.error)}`));
                return;
              }
            } catch {
              /* keep collecting */
            }
          }
        }
      };

      serverProcess.stdout?.on('data', onData);
      serverProcess.stdin?.write(requestStr);
    });
  }

  beforeAll(async () => {
    const serverPath = path.join(__dirname, '../../../dist/index.js');
    // AGENT role: the write-verifier's post-mutation read-back only runs for the
    // agent role — the D-12 owner guard in WriteVerifier returns 'unverified' for
    // owner (verification exists to catch agent mistakes). To get a successful
    // agent create past the Phase 2 gate, the create carries a lineage param
    // (capture-attestation bypass, D-08b); this also exercises the verifier on the
    // new capture path. agent-okay is auto-stamped and exempt from the test guard.
    serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, OMNIFOCUS_MCP_ROLE: 'agent' },
    });
    await sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'write-verifier-test', version: '1.0.0' },
      },
    });
    await ensureSandboxFolder();
  }, 60000);

  afterAll(async () => {
    serverProcess?.kill();
    const report = await fullCleanup();
    expect(report.errors, `sandbox cleanup errors (fixture leak): ${JSON.stringify(report.errors)}`).toHaveLength(0);
  }, 120000);

  it('task create response includes verification_status: "verified"', async () => {
    const VERIFY_TASK_NAME = runScopedName(`VERIFY_${Date.now()}`);

    const result = await sendRequest({
      jsonrpc: '2.0',
      id: ++nextId,
      method: 'tools/call',
      params: {
        name: 'omnifocus_write',
        arguments: {
          mutation: {
            operation: 'create',
            target: 'task',
            data: { name: VERIFY_TASK_NAME, lineage: { sessionId: 'write-verifier-session' } },
          },
        },
      },
    });

    const content = (result as { content: Array<{ text: string }> }).content;
    const parsed = JSON.parse(content[0].text) as Record<string, unknown>;
    const meta = parsed['metadata'] as Record<string, unknown>;

    // This assertion fails RED in Wave 0 — verification_status is not present yet.
    // It turns GREEN after Plan 05-05 wires WriteVerifier into executeValidated().
    expect(meta['verification_status']).toBe('verified');
  });
});
