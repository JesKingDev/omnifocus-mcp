import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { expectOk } from '../../helpers/expect-ok.js';
import { runScopedName, runScopedTag } from '../../helpers/run-id.js';
import { SANDBOX_FOLDER_NAME, ensureSandboxFolder, fullCleanup } from '../../helpers/sandbox-manager.js';

// OMN-84: per-run scoped fixture names so concurrent / aborted runs cannot
// collide on the literal "__TEST__ ..." names that used to be hardcoded.
const E2E_E2E_TAG = runScopedTag('e2e');
const E2E_PLANNED_DATES_TAG = runScopedTag('planned-dates');
const E2E_PLANNED_UPDATE_TAG = runScopedTag('planned-update');
const E2E_CLEAR_PLANNED_TAG = runScopedTag('clear-planned');
const E2E_REPEATS_TAG = runScopedTag('repeats');
const E2E_WEEKLY_REPEAT_TAG = runScopedTag('weekly-repeat');
const E2E_LIMITED_REPEAT_TAG = runScopedTag('limited-repeat');

describe('Unified Tools End-to-End Integration', () => {
  let serverProcess: ChildProcess;
  let _serverReady = false;

  // Helper to send JSON-RPC request and get response
  async function sendRequest(request: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestStr = JSON.stringify(request) + '\n';
      let response = '';
      let _errorOutput = '';

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout after 120s'));
      }, 120000);

      const onData = (data: Buffer) => {
        response += data.toString();
        // Try to parse complete JSON response
        const lines = response.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.jsonrpc === '2.0' && 'result' in parsed) {
                clearTimeout(timeout);
                serverProcess.stdout?.off('data', onData);
                serverProcess.stderr?.off('data', onError);
                resolve(parsed.result);
                return;
              }
              if (parsed.jsonrpc === '2.0' && 'error' in parsed) {
                clearTimeout(timeout);
                serverProcess.stdout?.off('data', onData);
                serverProcess.stderr?.off('data', onError);
                reject(new Error(`MCP error: ${JSON.stringify(parsed.error)}`));
                return;
              }
            } catch {
              // Not valid JSON yet, continue collecting
            }
          }
        }
      };

      const onError = (data: Buffer) => {
        _errorOutput += data.toString();
      };

      serverProcess.stdout?.on('data', onData);
      serverProcess.stderr?.on('data', onError);

      // Send request
      serverProcess.stdin?.write(requestStr);
    });
  }

  beforeAll(async () => {
    // Start MCP server as OWNER. These tests exercise CRUD, field routing,
    // planned dates, and repeats — not the permission gate. The Phase 2 policy
    // flip gates AGENT task-creates (the fail-safe default), so an owner role is
    // required for these creates to execute. Gate behavior itself is covered by
    // the PERM-02 unit tests and the D-08b agent-mode integration test below.
    const serverPath = path.join(__dirname, '../../../../dist/index.js');
    serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, OMNIFOCUS_MCP_ROLE: 'owner' },
    });

    // Wait for server to be ready (send initialize)
    const initResult = await sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'test',
          version: '1.0.0',
        },
      },
    });

    expect(initResult).toBeDefined();
    _serverReady = true;
  }, 30000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  describe('omnifocus_read', () => {
    it('should query inbox tasks', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'omnifocus_read',
          arguments: {
            query: {
              type: 'tasks',
              filters: {
                project: null, // Inbox
              },
              limit: 5,
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      expect(content).toBeInstanceOf(Array);
      expect(content.length).toBeGreaterThan(0);

      // Parse the text response
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
    }, 60000);

    it('should query tasks with filters', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'omnifocus_read',
          arguments: {
            query: {
              type: 'tasks',
              filters: {
                flagged: true,
              },
              limit: 10,
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
    }, 60000);

    it('should list all projects', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'omnifocus_read',
          arguments: {
            query: {
              type: 'projects',
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
    }, 60000);

    it('should list all tags', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'omnifocus_read',
          arguments: {
            query: {
              type: 'tags',
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
    }, 60000);

    it('should return count-only for active tasks (OmniJS in-process count)', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'omnifocus_read',
          arguments: {
            query: {
              type: 'tasks',
              filters: {
                status: 'active',
              },
              countOnly: true,
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);

      // Verify success
      expect(parsed).toHaveProperty('success');
      expectOk(parsed, 'count-only active tasks');

      // Verify metadata includes count and optimization flag
      expect(parsed.metadata).toHaveProperty('total_count');
      expect(parsed.metadata).toHaveProperty('count_only', true);
      // OmniJS in-process count (OMN-57: one bridge round-trip, not per-element JXA IPC)
      expect(parsed.metadata.optimization).toMatch(/^omnijs_count/);
      expect(typeof parsed.metadata.total_count).toBe('number');

      // Verify no task data returned (just count in metadata)
      if (parsed.data?.tasks) {
        expect(parsed.data.tasks.length).toBe(0);
      }
    }, 30000);

    it('should return count-only for flagged tasks', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'omnifocus_read',
          arguments: {
            query: {
              type: 'tasks',
              filters: {
                flagged: true,
              },
              countOnly: true,
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);

      // Verify success
      expect(parsed).toHaveProperty('success');
      expectOk(parsed, 'count-only flagged tasks');

      // Verify count metadata
      expect(parsed.metadata).toHaveProperty('total_count');
      expect(parsed.metadata.count_only).toBe(true);
      expect(typeof parsed.metadata.total_count).toBe('number');
    }, 120000);

    describe('offset pagination', () => {
      it('should return different tasks when offset is applied', async () => {
        // First request: get tasks 0-4
        const firstResult = await sendRequest({
          jsonrpc: '2.0',
          id: 100,
          method: 'tools/call',
          params: {
            name: 'omnifocus_read',
            arguments: {
              query: {
                type: 'tasks',
                limit: 5,
                offset: 0,
              },
            },
          },
        });

        const firstContent = (firstResult as { content: Array<{ type: string; text: string }> }).content;
        const firstParsed = JSON.parse(firstContent[0].text);
        expectOk(firstParsed, 'paginate tasks page 1');
        const firstTaskIds = firstParsed.data?.tasks?.map((t: { id: string }) => t.id) || [];

        // Second request: get tasks 5-9
        const secondResult = await sendRequest({
          jsonrpc: '2.0',
          id: 101,
          method: 'tools/call',
          params: {
            name: 'omnifocus_read',
            arguments: {
              query: {
                type: 'tasks',
                limit: 5,
                offset: 5,
              },
            },
          },
        });

        const secondContent = (secondResult as { content: Array<{ type: string; text: string }> }).content;
        const secondParsed = JSON.parse(secondContent[0].text);
        expectOk(secondParsed, 'paginate tasks page 2');
        const secondTaskIds = secondParsed.data?.tasks?.map((t: { id: string }) => t.id) || [];

        // Verify no overlap between first and second page
        if (firstTaskIds.length > 0 && secondTaskIds.length > 0) {
          const overlap = firstTaskIds.filter((id: string) => secondTaskIds.includes(id));
          expect(overlap.length).toBe(0);
        }
      }, 120000);

      it('should include offset_applied in metadata when offset > 0', async () => {
        const result = await sendRequest({
          jsonrpc: '2.0',
          id: 102,
          method: 'tools/call',
          params: {
            name: 'omnifocus_read',
            arguments: {
              query: {
                type: 'tasks',
                limit: 5,
                offset: 10,
              },
            },
          },
        });

        const content = (result as { content: Array<{ type: string; text: string }> }).content;
        const parsed = JSON.parse(content[0].text);
        expectOk(parsed, 'offset_applied metadata');
        // The offset should be reflected in the response metadata
        expect(parsed.metadata).toHaveProperty('offset');
        expect(parsed.metadata.offset).toBe(10);
      }, 60000);
    });
  });

  describe('omnifocus_write', () => {
    let createdTaskId: string;

    it('should create a new task', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'omnifocus_write',
          arguments: {
            mutation: {
              operation: 'create',
              target: 'task',
              data: {
                name: runScopedName('E2E_Test_Task-Builder_API'),
                note: 'Created by unified builder API end-to-end test',
                flagged: true,
              },
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
      if (!parsed.success) {
        console.error('Create task failed:', JSON.stringify(parsed.error, null, 2));
      }
      expectOk(parsed, 'create task (builder API)');

      // Extract task ID for subsequent tests
      if (parsed.data?.task?.taskId) {
        createdTaskId = parsed.data.task.taskId;
      } else if (parsed.data?.taskId) {
        createdTaskId = parsed.data.taskId;
      }
      expect(createdTaskId).toBeDefined();
    }, 60000);

    it('should update the created task', async () => {
      if (!createdTaskId) {
        console.warn('Skipping update test - no task ID from create');
        return;
      }

      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'omnifocus_write',
          arguments: {
            mutation: {
              operation: 'update',
              target: 'task',
              id: createdTaskId,
              changes: {
                note: 'Updated by builder API',
                flagged: false,
              },
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
      expectOk(parsed, 'update created task');
    }, 60000);

    it('should complete the task', async () => {
      if (!createdTaskId) {
        console.warn('Skipping complete test - no task ID');
        return;
      }

      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'omnifocus_write',
          arguments: {
            mutation: {
              operation: 'complete',
              target: 'task',
              id: createdTaskId,
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
      expectOk(parsed, 'complete task');
    }, 60000);

    it('should delete the completed task', async () => {
      if (!createdTaskId) {
        console.warn('Skipping delete test - no task ID');
        return;
      }

      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'omnifocus_write',
          arguments: {
            mutation: {
              operation: 'delete',
              target: 'task',
              id: createdTaskId,
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
      expectOk(parsed, 'delete completed task');
    }, 60000);
  });

  describe('omnifocus_analyze', () => {
    it('should analyze productivity stats', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'omnifocus_analyze',
          arguments: {
            analysis: {
              type: 'productivity_stats',
              params: {
                groupBy: 'week',
              },
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
    }, 60000);

    it('should parse meeting notes', async () => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'omnifocus_analyze',
          arguments: {
            analysis: {
              type: 'parse_meeting_notes',
              params: {
                text: 'Follow up with Sarah tomorrow about the project. Call Bob on Friday.',
                extractTasks: true,
              },
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      const content = (result as { content: Array<{ type: string; text: string }> }).content;
      const responseText = content[0].text;
      const parsed = JSON.parse(responseText);
      expect(parsed).toHaveProperty('success');
    }, 60000);
  });

  describe('OmniFocus 4.7+ Features', () => {
    describe('Planned Dates', () => {
      it('should create task with planned date', async () => {
        const result = await sendRequest({
          jsonrpc: '2.0',
          id: 12,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'create',
                target: 'task',
                data: {
                  name: runScopedName('Task_with_Planned_Date'),
                  plannedDate: '2025-11-15 09:00',
                  tags: [E2E_E2E_TAG, E2E_PLANNED_DATES_TAG],
                },
              },
            },
          },
        });

        expect(result).toBeDefined();
        expect(result).toHaveProperty('content');
        const content = (result as { content: Array<{ type: string; text: string }> }).content;
        const responseText = content[0].text;
        const parsed = JSON.parse(responseText);
        expectOk(parsed, 'create task with planned date');
        expect(parsed.data?.task?.taskId).toBeDefined();
      }, 60000);

      it('should update task with new planned date', async () => {
        // Create task
        const createResult = await sendRequest({
          jsonrpc: '2.0',
          id: 13,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'create',
                target: 'task',
                data: {
                  name: runScopedName('Task_to_Update_Planned_Date'),
                  plannedDate: '2025-11-15',
                  tags: [E2E_E2E_TAG, E2E_PLANNED_UPDATE_TAG],
                },
              },
            },
          },
        });

        const createContent = (createResult as { content: Array<{ type: string; text: string }> }).content;
        const createParsed = JSON.parse(createContent[0].text);
        const taskId = createParsed.data?.task?.taskId;
        expect(taskId).toBeDefined();

        // Update planned date
        const updateResult = await sendRequest({
          jsonrpc: '2.0',
          id: 14,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'update',
                target: 'task',
                id: taskId,
                changes: {
                  plannedDate: '2025-12-01 10:30',
                },
              },
            },
          },
        });

        const updateContent = (updateResult as { content: Array<{ type: string; text: string }> }).content;
        const updateParsed = JSON.parse(updateContent[0].text);
        expectOk(updateParsed, 'update planned date');
      }, 60000);

      it('should clear planned date when set to null', async () => {
        // Create task with planned date
        const createResult = await sendRequest({
          jsonrpc: '2.0',
          id: 15,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'create',
                target: 'task',
                data: {
                  name: runScopedName('Task_to_Clear_Planned_Date'),
                  plannedDate: '2025-11-15',
                  tags: [E2E_E2E_TAG, E2E_CLEAR_PLANNED_TAG],
                },
              },
            },
          },
        });

        const createContent = (createResult as { content: Array<{ type: string; text: string }> }).content;
        const createParsed = JSON.parse(createContent[0].text);
        const taskId = createParsed.data?.task?.taskId;
        expect(taskId).toBeDefined();

        // Clear planned date
        const updateResult = await sendRequest({
          jsonrpc: '2.0',
          id: 16,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'update',
                target: 'task',
                id: taskId,
                changes: {
                  plannedDate: null,
                },
              },
            },
          },
        });

        const updateContent = (updateResult as { content: Array<{ type: string; text: string }> }).content;
        const updateParsed = JSON.parse(updateContent[0].text);
        expectOk(updateParsed, 'clear planned date');
      }, 60000);
    });

    describe('Enhanced Repeats', () => {
      it('should create task with daily repeat rule', async () => {
        const result = await sendRequest({
          jsonrpc: '2.0',
          id: 17,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'create',
                target: 'task',
                data: {
                  name: runScopedName('Daily_Standup'),
                  dueDate: '2025-11-17 09:00',
                  repetitionRule: {
                    frequency: 'daily',
                    interval: 1,
                  },
                  tags: [E2E_E2E_TAG, E2E_REPEATS_TAG],
                },
              },
            },
          },
        });

        expect(result).toBeDefined();
        const content = (result as { content: Array<{ type: string; text: string }> }).content;
        const parsed = JSON.parse(content[0].text);
        expectOk(parsed, 'create task with daily repeat');
        expect(parsed.data?.task?.taskId).toBeDefined();
      }, 60000);

      it('should create task with weekly repeat rule', async () => {
        const result = await sendRequest({
          jsonrpc: '2.0',
          id: 18,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'create',
                target: 'task',
                data: {
                  name: runScopedName('Weekly_Review'),
                  dueDate: '2025-11-17',
                  repetitionRule: {
                    frequency: 'weekly',
                    interval: 1,
                    daysOfWeek: [{ day: 'MO' }], // Monday
                  },
                  tags: [E2E_E2E_TAG, E2E_WEEKLY_REPEAT_TAG],
                },
              },
            },
          },
        });

        const content = (result as { content: Array<{ type: string; text: string }> }).content;
        const parsed = JSON.parse(content[0].text);
        expectOk(parsed, 'create task with weekly repeat');
        expect(parsed.data?.task?.taskId).toBeDefined();
      }, 60000);

      it('should create task with repeat rule and end date', async () => {
        const result = await sendRequest({
          jsonrpc: '2.0',
          id: 19,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'create',
                target: 'task',
                data: {
                  name: runScopedName('Limited_Repeat_Task'),
                  dueDate: '2025-11-17',
                  repetitionRule: {
                    frequency: 'daily',
                    interval: 2,
                    endDate: '2025-12-31',
                  },
                  tags: [E2E_E2E_TAG, E2E_LIMITED_REPEAT_TAG],
                },
              },
            },
          },
        });

        const content = (result as { content: Array<{ type: string; text: string }> }).content;
        const parsed = JSON.parse(content[0].text);
        expectOk(parsed, 'create task with limited repeat');
        expect(parsed.data?.task?.taskId).toBeDefined();
      }, 60000);
    });

    describe('Version Detection', () => {
      it('should report version information in system tool', async () => {
        const result = await sendRequest({
          jsonrpc: '2.0',
          id: 20,
          method: 'tools/call',
          params: {
            name: 'system',
            arguments: {
              operation: 'version',
            },
          },
        });

        expect(result).toBeDefined();
        const content = (result as { content: Array<{ type: string; text: string }> }).content;
        const parsed = JSON.parse(content[0].text);
        expectOk(parsed, 'system version');
        expect(parsed.metadata?.omnifocus_version).toBeDefined();
      }, 60000);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 2 D-08b: agent create with lineage stamps agent-ok tag
//
// Automated proof for D-08b: an agent-created task with a lineage param is
// stamped with the 'agent-ok' tag and has the of-mcp:lineage note block.
// Runs as the AGENT role (the fail-safe default) — this is the real production
// capture path. The lineage param is the agent's self-attestation, which both
// bypasses the create gate (capture-attestation bypass) AND triggers the
// agent-ok stamp (stamp fires only for role=agent + lineage present). Running
// as owner would bypass the gate but the stamp would never fire (role !== agent).
// ---------------------------------------------------------------------------

describe('Phase 2 D-08b — agent create with lineage stamps agent-ok tag', () => {
  let agentServerProcess: ChildProcess;

  const lineageTaskName = runScopedName('phase2-lineage-tag');

  // Helper to send JSON-RPC request to the agent-mode server
  async function sendAgentRequest(request: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestStr = JSON.stringify(request) + '\n';
      let response = '';

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout after 120s'));
      }, 120000);

      const onData = (data: Buffer) => {
        response += data.toString();
        const lines = response.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.jsonrpc === '2.0' && 'result' in parsed) {
                clearTimeout(timeout);
                agentServerProcess.stdout?.off('data', onData);
                agentServerProcess.stderr?.off('data', onError);
                resolve(parsed.result);
                return;
              }
              if (parsed.jsonrpc === '2.0' && 'error' in parsed) {
                clearTimeout(timeout);
                agentServerProcess.stdout?.off('data', onData);
                agentServerProcess.stderr?.off('data', onError);
                reject(new Error(`MCP error: ${JSON.stringify(parsed.error)}`));
                return;
              }
            } catch {
              // Not valid JSON yet, continue collecting
            }
          }
        }
      };

      const onError = (data: Buffer) => {
        void data; // suppress unused variable warning
      };

      agentServerProcess.stdout?.on('data', onData);
      agentServerProcess.stderr?.on('data', onError);
      agentServerProcess.stdin?.write(requestStr);
    });
  }

  beforeAll(async () => {
    const serverPath = path.join(__dirname, '../../../../dist/index.js');
    agentServerProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      // AGENT role: explicitly 'agent' (any non-'owner' value resolves to agent
      // via parseRole's default-deny) so an inherited OMNIFOCUS_MCP_ROLE=owner
      // cannot leak in. This exercises the real capture path (gate bypass via
      // lineage attestation + agent-ok stamp).
      env: { ...process.env, OMNIFOCUS_MCP_ROLE: 'agent' },
    });

    const initResult = await sendAgentRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-d08b', version: '1.0.0' },
      },
    });
    expect(initResult).toBeDefined();
  }, 30000);

  afterAll(() => {
    if (agentServerProcess) {
      agentServerProcess.kill();
    }
  });

  it('creates a task with lineage and reads back agent-ok tag (D-08b)', async () => {
    let createdTaskId: string | undefined;

    try {
      // (a) Create task with lineage param
      const createResult = await sendAgentRequest({
        jsonrpc: '2.0',
        id: 100,
        method: 'tools/call',
        params: {
          name: 'omnifocus_write',
          arguments: {
            mutation: {
              operation: 'create',
              target: 'task',
              data: {
                name: lineageTaskName,
                lineage: { sessionId: 'integration-test-session' },
              },
            },
          },
        },
      });

      // (b) Assert create succeeded
      const createContent = (createResult as { content: Array<{ type: string; text: string }> }).content;
      const createParsed = JSON.parse(createContent[0].text);
      expectOk(createParsed, 'create task with lineage (D-08b)');

      // (c) Extract task ID
      createdTaskId = createParsed.data?.task?.taskId ?? createParsed.data?.taskId;
      expect(createdTaskId).toBeDefined();

      // (d) Read back via the agent-ok TAG FILTER — the agentOkayPredicate path
      // Phase 2 built (D-06). This is the feature-aligned read-back: a task that
      // comes back through the agent-ok filter IS tagged agent-ok by definition,
      // which proves the capture-time stamp. We match by the run-unique task name.
      // (Read-back by `filters.ids` is intentionally avoided — the read path only
      // routes singular `filter.id`, and the by-id projections omit tags; a separate
      // pre-existing read-path gap, not part of the Phase 2 capture deliverable.)
      const readResult = await sendAgentRequest({
        jsonrpc: '2.0',
        id: 101,
        method: 'tools/call',
        params: {
          name: 'omnifocus_read',
          arguments: {
            query: {
              type: 'tasks',
              filters: { tags: { all: ['agent-ok'] } },
              fields: ['name', 'tags', 'note'],
              limit: 200,
            },
          },
        },
      });

      const readContent = (readResult as { content: Array<{ type: string; text: string }> }).content;
      const readParsed = JSON.parse(readContent[0].text);
      expectOk(readParsed, 'read back agent-ok tasks (D-08b)');

      // (e) The created task must appear among agent-ok-tagged tasks → tag stamped.
      const task = (readParsed.data?.tasks ?? []).find((t: { name?: string }) => t.name === lineageTaskName);
      expect(task, `created task "${lineageTaskName}" not found among agent-ok tasks`).toBeDefined();
      expect(task.tags).toContain('agent-ok');

      // (f) Assert the lineage sentinel is in the note → lineage stamp persisted.
      expect(task.note).toContain('of-mcp:lineage');
    } finally {
      // Self-cleaning: delete the created task
      if (createdTaskId) {
        await sendAgentRequest({
          jsonrpc: '2.0',
          id: 102,
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'delete',
                target: 'task',
                id: createdTaskId,
              },
            },
          },
        }).catch(() => {
          // Best-effort cleanup — don't fail the test if delete fails
        });
      }
    }
  }, 60000);
});

// ---------------------------------------------------------------------------
// Phase 4 LIVE-01 — live-capture inbox create with capture-live + agent-ok + lineage
//
// Automated proof for LIVE-01: an agent-role live capture using the
// capture-live-blocker skill shape lands in the inbox with:
//   a. tags ⊇ [agent-ok, capture-live] — funnel auto-stamp + skill marker
//   b. note contains 'of-mcp:lineage' — lineage stamp persisted
//   c. tags does NOT contain 'archaeology' — D-08/D-10 live capture is distinct from Phase 5
//   d. project is null / absent — inbox-only (DISC-CAPTURE-01 / D-10)
//
// Extends the D-08b agent-create-with-lineage harness: same OMNIFOCUS_MCP_ROLE=agent
// spawn and agent-ok-tag-filter read-back. The only addition is tags:['capture-live']
// in the create call, and the Phase 4 assertions on the read-back.
//
// capture-live passes FUNCTIONAL_TAG_ALLOWLIST after Plan 04-01 Task 1 registered it.
// The task name uses runScopedName('phase4-live-capture') for collision-freedom.
// Self-clean: finally block deletes the created task via omnifocus_write delete.
// ---------------------------------------------------------------------------

describe('Phase 4 LIVE-01 — live capture stamps capture-live + agent-ok + lineage, no archaeology', () => {
  let agentServerProcess: ChildProcess;
  let nextId = 400;

  const liveTaskName = runScopedName('phase4-live-capture');

  // sendRequest filtered by JSON-RPC id — prevents response bleed on shared stdio pipe
  // (lesson from 04-01: unfiltered onData can pick up buffered responses from earlier calls)
  async function sendRequest(request: { id: number } & Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = request.id;
      const requestStr = JSON.stringify(request) + '\n';
      let response = '';

      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout after 120s (id=${requestId})`));
      }, 120000);

      const onData = (data: Buffer) => {
        response += data.toString();
        for (const line of response.split('\n')) {
          if (line.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.id !== requestId) continue; // filter by id — avoid bleed
              if (parsed.jsonrpc === '2.0' && 'result' in parsed) {
                clearTimeout(timeout);
                agentServerProcess.stdout?.off('data', onData);
                resolve(parsed.result);
                return;
              }
              if (parsed.jsonrpc === '2.0' && 'error' in parsed) {
                clearTimeout(timeout);
                agentServerProcess.stdout?.off('data', onData);
                reject(new Error(`MCP error: ${JSON.stringify(parsed.error)}`));
                return;
              }
            } catch {
              /* keep collecting */
            }
          }
        }
      };

      agentServerProcess.stdout?.on('data', onData);
      agentServerProcess.stdin?.write(requestStr);
    });
  }

  async function callTool(name: string, args: unknown): Promise<any> {
    const result = await sendRequest({
      jsonrpc: '2.0',
      id: ++nextId,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    const content = (result as { content: Array<{ text: string }> }).content;
    return JSON.parse(content[0].text);
  }

  beforeAll(async () => {
    const serverPath = path.join(__dirname, '../../../../dist/index.js');
    // AGENT role — the real live-capture path the capture-live-blocker skill runs under.
    // Explicit 'agent' prevents an inherited OMNIFOCUS_MCP_ROLE=owner from leaking in.
    agentServerProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, OMNIFOCUS_MCP_ROLE: 'agent' },
    });

    const initResult = await sendRequest({
      jsonrpc: '2.0',
      id: ++nextId,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-phase4-live-capture', version: '1.0.0' },
      },
    });
    expect(initResult).toBeDefined();
  }, 30000);

  afterAll(() => {
    agentServerProcess?.kill();
  });

  it('live capture: tags ⊇ [capture-live, agent-ok], note has lineage, no archaeology, inbox placement (LIVE-01)', async () => {
    let createdTaskId: string | undefined;

    try {
      // (a) Create inbox task with capture-live marker + lineage — the skill shape from LIVE-01.
      //     No project key → inbox (DISC-CAPTURE-01). No dueDate/deferDate (D-05).
      //     The funnel auto-stamps agent-ok when role=agent + lineage present (D-10).
      const createRes = await callTool('omnifocus_write', {
        mutation: {
          operation: 'create',
          target: 'task',
          data: {
            name: liveTaskName,
            tags: ['capture-live'], // live-capture marker only; agent-ok auto-stamped by funnel
            lineage: { sessionId: 'integration-test-session' },
            // No project key → inbox
            // No dueDate / deferDate (D-05)
          },
        },
      });

      // (b) Assert create succeeded
      expectOk(createRes, 'create live-capture task (LIVE-01)');
      createdTaskId = createRes.data?.task?.taskId ?? createRes.data?.taskId;
      expect(createdTaskId).toBeDefined();

      // (c) Read back via the agent-ok tag filter (same pattern as D-08b).
      //     A task returned by this filter IS tagged agent-ok — proves the funnel stamp.
      //     Added 'project' to fields so inbox placement is directly assertable (DISC-CAPTURE-01).
      const readRes = await callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: { tags: { all: ['agent-ok'] } },
          fields: ['name', 'tags', 'note', 'project'],
          limit: 200,
        },
      });
      expectOk(readRes, 'read back agent-ok tasks (LIVE-01)');

      // (d) Locate by run-unique name
      const task = (readRes.data?.tasks ?? []).find((t: { name?: string }) => t.name === liveTaskName);
      expect(task, `live-capture task "${liveTaskName}" not found among agent-ok tasks`).toBeDefined();

      // (e) Tags: funnel auto-stamp + skill marker
      expect(task.tags).toContain('agent-ok'); // funnel auto-stamped (role=agent + lineage)
      expect(task.tags).toContain('capture-live'); // live-capture marker applied

      // (f) Lineage stamp: of-mcp:lineage sentinel must appear in the note
      expect(task.note).toContain('of-mcp:lineage');

      // (g) No archaeology tag — D-08/D-10: live capture stays distinct from Phase 5 archaeology
      expect(task.tags).not.toContain('archaeology');

      // (h) Inbox placement: no project key was passed, so the task MUST land in the inbox.
      //     The read projection requests 'project' (fields above), so the field is in the response
      //     shape. Assert unconditionally: a project-placed task surfaces a truthy project name, an
      //     inbox task surfaces null (or the key is absent → undefined). Both null and undefined are
      //     falsy, so this is the strongest placement assertion that holds across both read-path
      //     shapes — it can no longer be skipped (DISC-CAPTURE-01 create-path contract).
      expect(task.project, 'live-capture task must land in inbox (no project key passed)').toBeFalsy();
    } finally {
      // Self-clean: delete the created task so no orphan remains in the live inbox.
      // Agent role CAN delete in this context because the write funnel allows it.
      if (createdTaskId) {
        await callTool('omnifocus_write', {
          mutation: {
            operation: 'delete',
            target: 'task',
            id: createdTaskId,
          },
        }).catch(() => {
          // Best-effort cleanup — do not fail the test if delete fails
        });
      }
    }
  }, 60000);
});

// ---------------------------------------------------------------------------
// Phase 3 Routing — write operations (ROUTE-01, ROUTE-03, ROUTE-04)
//
// Proves the three server-side write paths the route-inbox-to-projects skill
// (Plan 03-02) drives, all through the AGENT role + write funnel:
//   A. ROUTE-01 — file a task to an existing project via update+project
//      (moveTasks dispatch). D-11: native moveTasks, no custom mover.
//   B. ROUTE-04 — apply the durable routing-unplaced marker tag via
//      update+addTags (OmniJS addTag bridge; JXA addTags silently no-ops).
//      D-12: marker on left items. The tag passes the test-mode sandbox guard
//      only because FUNCTIONAL_TAG_ALLOWLIST gained 'routing-unplaced' (Plan
//      03-01 Task 1).
//   C. ROUTE-03 — create a project for the infer branch via create/project.
//
// Role discipline (mirrors D-08b): tasks are created with a lineage param so
// the agent-create gate's capture-attestation bypass fires (agent task-create
// is gated; project-create and update are 'allow' for agent). Agent cannot
// delete (policy: deny), so fixture teardown runs through fullCleanup() — the
// osascript sandbox sweep — not server-side deletes. A residue assertion fails
// loud on fixture leak (OMN-46 discipline).
// ---------------------------------------------------------------------------

describe('Phase 3 Routing — write operations', () => {
  let agentServerProcess: ChildProcess;
  let nextId = 200;

  async function sendAgentRequest(request: unknown): Promise<any> {
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
                agentServerProcess.stdout?.off('data', onData);
                resolve(parsed.result);
                return;
              }
              if (parsed.jsonrpc === '2.0' && 'error' in parsed) {
                clearTimeout(timeout);
                agentServerProcess.stdout?.off('data', onData);
                reject(new Error(`MCP error: ${JSON.stringify(parsed.error)}`));
                return;
              }
            } catch {
              /* keep collecting */
            }
          }
        }
      };
      agentServerProcess.stdout?.on('data', onData);
      agentServerProcess.stdin?.write(requestStr);
    });
  }

  // tools/call → parsed StandardResponseV2.
  async function callTool(name: string, args: unknown): Promise<any> {
    const result = await sendAgentRequest({
      jsonrpc: '2.0',
      id: ++nextId,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    const content = (result as { content: Array<{ text: string }> }).content;
    return JSON.parse(content[0].text);
  }

  function extractId(res: any): string {
    const d = res.data ?? {};
    const id = d.task?.id ?? d.task?.taskId ?? d.taskId ?? d.project?.id ?? d.project?.projectId ?? d.projectId ?? d.id;
    expect(id, `created entity id (response: ${JSON.stringify(d).slice(0, 300)})`).toBeTruthy();
    return id as string;
  }

  // Agent task-create: lineage param triggers the capture-attestation bypass.
  async function createAgentTask(data: Record<string, unknown>): Promise<string> {
    const res = await callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'task',
        data: { lineage: { sessionId: 'integration-test-routing' }, ...data },
      },
    });
    expectOk(res, `agent create task (${JSON.stringify(data).slice(0, 120)})`);
    return extractId(res);
  }

  beforeAll(async () => {
    const serverPath = path.join(__dirname, '../../../../dist/index.js');
    // AGENT role — the real routing path the skill runs under. Explicit 'agent'
    // so an inherited OMNIFOCUS_MCP_ROLE=owner cannot leak in.
    agentServerProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, OMNIFOCUS_MCP_ROLE: 'agent' },
    });
    await sendAgentRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-phase3-routing', version: '1.0.0' },
      },
    });
    await ensureSandboxFolder();
  }, 60000);

  afterAll(async () => {
    agentServerProcess?.kill();
    // Agent role cannot delete (policy: deny); fullCleanup sweeps the sandbox
    // via osascript (no server). Assert no residue OUTSIDE try/catch so a real
    // fixture leak fails the suite loud (OMN-46).
    const report = await fullCleanup();
    expect(report.errors, `sandbox cleanup errors (fixture leak): ${JSON.stringify(report.errors)}`).toHaveLength(0);
  }, 120000);

  describe('ROUTE-01 — file task to existing project via update+project', () => {
    it('files an agent inbox task into a sandbox project (moveTasks dispatch)', async () => {
      const projectName = runScopedName('route01-target-project');
      const projRes = await callTool('omnifocus_write', {
        mutation: { operation: 'create', target: 'project', data: { name: projectName, folder: SANDBOX_FOLDER_NAME } },
      });
      expectOk(projRes, 'create ROUTE-01 target project');
      const projectId = extractId(projRes);

      const taskId = await createAgentTask({ name: runScopedName('route01-inbox-item') });

      // File it: update + project. The write-verifier fires automatically; a
      // 'failed' verification would surface as success:false → expectOk throws.
      const fileRes = await callTool('omnifocus_write', {
        mutation: { operation: 'update', target: 'task', id: taskId, changes: { project: projectId } },
      });
      expectOk(fileRes, 'file task to project (ROUTE-01)');

      // Independent read-back: the task's projectId must be the target project.
      const readRes = await callTool('omnifocus_read', {
        query: { type: 'tasks', filters: { id: taskId }, fields: ['id', 'projectId'] },
      });
      expectOk(readRes, 'read back filed task (ROUTE-01)');
      const task = (readRes.data?.tasks ?? readRes.data?.items ?? []).find((t: any) => t.id === taskId);
      expect(task, `filed task ${taskId} not found on read-back`).toBeDefined();
      expect(task.projectId).toBe(projectId);
    }, 120000);
  });

  describe('ROUTE-04 — apply routing-unplaced marker tag via update+addTags', () => {
    it('marks a left inbox item and reads it back through the tag filter (bridge, not JXA)', async () => {
      const taskName = runScopedName('route04-left-item');
      const taskId = await createAgentTask({ name: taskName });

      const tagRes = await callTool('omnifocus_write', {
        mutation: { operation: 'update', target: 'task', id: taskId, changes: { addTags: ['routing-unplaced'] } },
      });
      expectOk(tagRes, 'apply routing-unplaced marker (ROUTE-04)');

      // Tag-filtered read-back proves the tag PERSISTED (not silently no-op'd
      // via JXA). A task returned by the routing-unplaced filter carries it.
      const readRes = await callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: { tags: { all: ['routing-unplaced'] } },
          fields: ['name', 'tags'],
          limit: 200,
        },
      });
      expectOk(readRes, 'read back routing-unplaced tasks (ROUTE-04)');
      const task = (readRes.data?.tasks ?? readRes.data?.items ?? []).find((t: any) => t.name === taskName);
      expect(task, `task "${taskName}" not found among routing-unplaced tasks → tag did not persist`).toBeDefined();
      expect(task.tags).toContain('routing-unplaced');
    }, 120000);
  });

  describe('ROUTE-03 — create project for infer branch via create/project', () => {
    it('creates a sandbox project and reads it back by name', async () => {
      const projectName = runScopedName('route03-infer-project');
      const createRes = await callTool('omnifocus_write', {
        mutation: { operation: 'create', target: 'project', data: { name: projectName, folder: SANDBOX_FOLDER_NAME } },
      });
      expectOk(createRes, 'create infer-branch project (ROUTE-03)');
      const projectId = extractId(createRes);

      // Independent read-back scoped to the sandbox folder, found by id.
      const readRes = await callTool('omnifocus_read', {
        query: { type: 'projects', filters: { folder: SANDBOX_FOLDER_NAME }, fields: ['id', 'name'] },
      });
      expectOk(readRes, 'read back infer-branch project (ROUTE-03)');
      const project = (readRes.data?.projects ?? readRes.data?.items ?? []).find((p: any) => p.id === projectId);
      expect(project, `created project ${projectId} not found on read-back`).toBeDefined();
      expect(project.name).toBe(projectName);
      // Cleanup handled by fullCleanup() in afterAll (agent cannot delete).
    }, 120000);
  });
});
