import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

// Mock child_process — must be top-level so vitest hoists it
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock logger so it doesn't try to write to the filesystem in tests
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

  beforeEach(async () => {
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
      // Prevent actual process exit during tests
      throw new Error(`process.exit(${_code})`);
    });
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('Test 1 (deny): exits 1 with Automation remediation when -1743 in stderr', async () => {
    // Import fresh each test to avoid module-level state
    const { probeAutomationOrExit } = await import('../../../src/utils/automation-probe.js');

    const probePromise = probeAutomationOrExit();
    // Let the probe settle (spawn, setTimeout setup)
    await new Promise((resolve) => setImmediate(resolve));

    // Simulate denial: stderr contains -1743, close with exit code 1
    mockProcess.stderr.emit('data', 'execution error: Not authorized to send Apple events to OmniFocus. (-1743)');
    mockProcess.emit('close', 1, null);

    // probeAutomationOrExit calls process.exit(1) which throws in tests
    await expect(probePromise).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderrCalls = stderrWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrCalls).toMatch(/Automation/);
  });

  it('Test 2 (timeout): exits 2 with timeout remediation when probe times out (SIGKILL)', async () => {
    vi.useFakeTimers();

    const { probeAutomationOrExit } = await import('../../../src/utils/automation-probe.js');

    const probePromise = probeAutomationOrExit(5000);
    // Let the probe settle
    await new Promise((resolve) => setImmediate(resolve));

    // Advance fake clock past the timeout to trigger proc.kill('SIGKILL')
    vi.advanceTimersByTime(5001);

    // Simulate SIGKILL close
    mockProcess.emit('close', null, 'SIGKILL');

    await expect(probePromise).rejects.toThrow('process.exit(2)');

    expect(exitSpy).toHaveBeenCalledWith(2);
    const stderrCalls = stderrWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrCalls).toMatch(/timed out|timeout/i);
  });

  it('Test 3 (clean): resolves without calling process.exit when OmniFocus name returned', async () => {
    const { probeAutomationOrExit } = await import('../../../src/utils/automation-probe.js');

    const probePromise = probeAutomationOrExit();
    await new Promise((resolve) => setImmediate(resolve));

    // Simulate clean response: stdout emits the app name, clean exit code 0
    mockProcess.stdout.emit('data', 'OmniFocus');
    mockProcess.emit('close', 0, null);

    // Should resolve cleanly (no exit)
    await expect(probePromise).resolves.toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
