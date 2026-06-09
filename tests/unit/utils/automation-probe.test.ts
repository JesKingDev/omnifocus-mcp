import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { probeAutomationOrExit } from '../../../src/utils/automation-probe.js';

// Mock child_process — hoisted by vitest so the probe's top-level import gets the mock
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('probeAutomationOrExit', () => {
  let mockProcess: any;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Build a mock child process: base EventEmitter + stdin/stdout/stderr EventEmitters
    mockProcess = Object.assign(new EventEmitter(), {
      stdin: { write: vi.fn(), end: vi.fn() },
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    });

    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    // Spy on process.exit and process.stderr.write to assert behaviour
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string) => {
      throw new Error(`process.exit(${_code})`);
    });
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('Test 1 (deny): exits 1 with Automation remediation when -1743 in stderr', async () => {
    const probePromise = probeAutomationOrExit();

    // Let the probe enter the Promise and attach listeners (it's synchronous now — one tick is enough)
    await Promise.resolve();

    // Simulate denial: stderr contains -1743, then close with non-zero exit
    mockProcess.stderr.emit('data', 'execution error: Not authorized to send Apple events to OmniFocus. (-1743)');
    mockProcess.emit('close', 1, null);

    // probeAutomationOrExit calls process.exit(1) which our mock converts to a throw
    await expect(probePromise).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderrCalls = stderrWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrCalls).toMatch(/Automation/);
  });

  it('Test 2 (timeout): exits 2 with timeout remediation when probe times out (SIGKILL)', async () => {
    vi.useFakeTimers();

    const probePromise = probeAutomationOrExit(5000);

    // One microtask tick to let the probe enter the Promise (no async import now)
    await Promise.resolve();

    // Advance fake clock past the timeout — triggers proc.kill('SIGKILL')
    vi.advanceTimersByTime(5001);

    // The mock process.kill('SIGKILL') doesn't auto-emit close — simulate the OS response
    mockProcess.emit('close', null, 'SIGKILL');

    await expect(probePromise).rejects.toThrow('process.exit(2)');

    expect(exitSpy).toHaveBeenCalledWith(2);
    const stderrCalls = stderrWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrCalls).toMatch(/timed out|timeout/i);
  });

  it('Test 3 (clean): resolves without calling process.exit when OmniFocus name returned', async () => {
    const probePromise = probeAutomationOrExit();

    await Promise.resolve();

    // Simulate clean response: stdout data, then clean exit
    mockProcess.stdout.emit('data', 'OmniFocus');
    mockProcess.emit('close', 0, null);

    await expect(probePromise).resolves.toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
