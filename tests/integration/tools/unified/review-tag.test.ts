/**
 * Phase 4 REVIEW-01/02 — review-tag round-trip.
 *
 * Proves the review-loop surfacing writes round-trip against live OmniFocus:
 *
 *   Case 1 (REVIEW-01 active / review-capture, D-04):
 *     One update sets flagged=true + plannedDate=today + addTags:['review-capture']
 *     on an active sandbox task. An independent read-back asserts all three
 *     fields persisted.
 *
 *   Case 2 (REVIEW-01 completed / review-output, Discretion #2):
 *     Create a task, complete it, then update addTags:['review-output']. Read-back
 *     asserts the tag persisted. No future plannedDate is written on a completed
 *     task (Discretion #2: completed work gets the tag only, not flag+date).
 *
 * Design choices:
 *   - Uses the owner role (same as field-roundtrip.test.ts) — review tags are
 *     owner-applied marks, not agent live-capture path (04-02 covers that).
 *   - Reuses existing helpers verbatim: expectOk, assertFieldPersisted,
 *     sandbox-manager, run-id. No new conftest or fixtures.
 *   - No clear* operations (OMN-55 flake, Pitfall 2 — Phase 4 relies on native
 *     completion for lifecycle).
 *
 * Not a CI unit gate: mutates the real OmniFocus DB. Runs under
 * `npm run test:integration`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { expectOk } from '../../helpers/expect-ok.js';
import { assertFieldPersisted } from '../../helpers/assert-field-persisted.js';
import { SANDBOX_FOLDER_NAME, ensureSandboxFolder, fullCleanup } from '../../helpers/sandbox-manager.js';
import { runScopedName } from '../../helpers/run-id.js';

// Today's date in YYYY-MM-DD — the plannedDate value for the active review case.
// We avoid a fixed future datetime here because plannedDate=today is the meaningful
// signal (surfaces in OmniFocus "Today" perspective), not a distant test date.
const TODAY_DATE = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const TODAY_EPOCH = new Date(TODAY_DATE).getTime();

const TS = Date.now();

describe('Phase 4 REVIEW-01/02 — review-tag round-trip', () => {
  let serverProcess: ChildProcess;
  let nextId = 1;
  const createdTaskIds: string[] = [];

  async function sendRequest(request: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestStr = JSON.stringify(request) + '\n';
      let response = '';
      const timeout = setTimeout(() => reject(new Error('Request timeout after 120s')), 120000);

      const onData = (data: Buffer) => {
        response += data.toString();
        for (const line of response.split('\n')) {
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

  // assertFieldPersisted ClientLike adapter: tools/call → parsed StandardResponseV2.
  const client = {
    callTool: async (name: string, args: unknown) => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: ++nextId,
        method: 'tools/call',
        params: { name, arguments: args },
      });
      const content = (result as { content: Array<{ text: string }> }).content;
      return JSON.parse(content[0].text);
    },
  };

  function extractId(res: any): string {
    const d = res.data ?? {};
    const id = d.task?.id ?? d.task?.taskId ?? d.taskId ?? d.id;
    expect(id, `created entity id (response: ${JSON.stringify(d).slice(0, 300)})`).toBeTruthy();
    return id as string;
  }

  async function createTask(name: string, data: Record<string, unknown> = {}): Promise<string> {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'create', target: 'task', data: { name, ...data } },
    });
    expectOk(res, `create task ${name}`);
    const id = extractId(res);
    createdTaskIds.push(id);
    return id;
  }

  async function updateTask(id: string, changes: Record<string, unknown>): Promise<void> {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'update', target: 'task', id, changes },
    });
    expectOk(res, `update task ${id} (${JSON.stringify(changes).slice(0, 120)})`);
  }

  async function completeTask(id: string): Promise<void> {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'complete', target: 'task', id },
    });
    expectOk(res, `complete task ${id}`);
  }

  const taskQuery = (id: string, fields: string[], completed = false) => ({
    query: {
      type: 'tasks',
      filters: completed ? { id, status: 'completed' } : { id },
      fields: ['id', ...fields],
    },
  });

  const findTask = (r: any, id: string): any => (r.data?.tasks ?? r.data?.items ?? []).find((t: any) => t.id === id);

  beforeAll(async () => {
    const serverPath = path.join(__dirname, '../../../../dist/index.js');
    // OWNER role: review tags are owner-applied marks. The agent live-capture
    // path (LIVE-01) is exercised separately in 04-02 with an agent-role server.
    serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, OMNIFOCUS_MCP_ROLE: 'owner' },
    });
    await sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
    });
    await ensureSandboxFolder();
  }, 60000);

  afterAll(async () => {
    for (const id of createdTaskIds) {
      try {
        await client.callTool('omnifocus_write', { mutation: { operation: 'delete', target: 'task', id } });
      } catch {
        /* best-effort */
      }
    }
    serverProcess?.kill();
    // OMN-46 fixture-leak guard: fullCleanup sweeps the whole sandbox.
    const report = await fullCleanup();
    expect(report.errors, `sandbox cleanup errors (fixture leak): ${JSON.stringify(report.errors)}`).toHaveLength(0);
  }, 120000);

  // ── Case 1: REVIEW-01 active task — flag + plannedDate + review-capture ────

  it('REVIEW-01 (active/review-capture): one update sets flagged=true + plannedDate=today + review-capture; all three read back', async () => {
    const taskName = runScopedName(`review-capture-active-${TS}`);
    // Create an active sandbox task (folder places it in the sandbox, not inbox)
    const id = await createTask(taskName, { folder: SANDBOX_FOLDER_NAME });

    // One update: set all three review-surfacing fields together (D-04)
    await updateTask(id, {
      flagged: true,
      plannedDate: TODAY_DATE,
      addTags: ['review-capture'],
    });

    // Independent read-back: flagged
    await assertFieldPersisted(client, {
      readTool: 'omnifocus_read',
      readParams: taskQuery(id, ['flagged']),
      extract: (r) => findTask(r, id)?.flagged,
      expected: true,
      context: 'review-capture task.flagged',
    });

    // Independent read-back: plannedDate (epoch comparison, ±60s tolerance baked into
    // assertFieldPersisted via deepEqual on epoch — we compare epochs to avoid TZ issues)
    await assertFieldPersisted(client, {
      readTool: 'omnifocus_read',
      readParams: taskQuery(id, ['plannedDate']),
      extract: (r) => {
        const val = findTask(r, id)?.plannedDate;
        return val ? Math.round(new Date(val).getTime() / 60000) * 60000 : val;
      },
      expected: Math.round(TODAY_EPOCH / 60000) * 60000,
      context: 'review-capture task.plannedDate',
    });

    // Independent read-back: tags contains review-capture
    await assertFieldPersisted(client, {
      readTool: 'omnifocus_read',
      readParams: taskQuery(id, ['tags']),
      extract: (r) => {
        const tags: string[] = findTask(r, id)?.tags ?? [];
        return tags.includes('review-capture');
      },
      expected: true,
      context: 'review-capture task.tags includes review-capture',
    });
  }, 120000);

  // ── Case 2: REVIEW-01 completed task — review-output tag only ─────────────

  it('REVIEW-01 (completed/review-output, Discretion #2): complete task, apply review-output, tag reads back; no future plannedDate', async () => {
    const taskName = runScopedName(`review-output-completed-${TS}`);
    const id = await createTask(taskName, { folder: SANDBOX_FOLDER_NAME });

    // Complete the task via the native complete path
    await completeTask(id);

    // Apply review-output tag ONLY — no flag, no plannedDate (Discretion #2)
    await updateTask(id, {
      addTags: ['review-output'],
    });

    // Read back completed tasks — need status: 'completed' filter to see them
    await assertFieldPersisted(client, {
      readTool: 'omnifocus_read',
      readParams: taskQuery(id, ['tags'], true),
      extract: (r) => {
        const tags: string[] = findTask(r, id)?.tags ?? [];
        return tags.includes('review-output');
      },
      expected: true,
      context: 'review-output task.tags includes review-output',
    });

    // Assert no plannedDate was written (Discretion #2: completed work gets tag only)
    await assertFieldPersisted(client, {
      readTool: 'omnifocus_read',
      readParams: taskQuery(id, ['plannedDate'], true),
      extract: (r) => findTask(r, id)?.plannedDate ?? null,
      expected: null,
      context: 'review-output task.plannedDate is null (no date on completed work)',
    });
  }, 120000);
});
