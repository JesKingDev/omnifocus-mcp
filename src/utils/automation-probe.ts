import { spawn } from 'node:child_process';
import { createLogger } from './logger.js';

const logger = createLogger('AutomationProbe');

/**
 * Fail-fast Automation-permission probe.
 *
 * Runs at server startup before any MCP transport binds. Exits the process
 * with a loud remediation message if the OmniFocus Automation grant is missing
 * or if the probe times out (possible suppressed TCC consent dialog).
 *
 * Exit codes:
 *   1 — Automation denied (-1743 / not allowed / non-zero exit)
 *   2 — Probe timed out (SIGKILL after timeoutMs)
 *   clean return — grant is present; caller proceeds to bind transports
 */
export async function probeAutomationOrExit(timeoutMs = 5000): Promise<void> {
  logger.debug('Running Automation permission probe…');

  const result = await new Promise<{ code: number | null; signal: string | null; err: string }>((resolve) => {
    const proc = spawn('osascript', ['-l', 'JavaScript', '-e', 'Application("OmniFocus").name()']);
    let err = '';

    proc.stderr.on('data', (d: Buffer) => (err += d.toString()));

    // D-04: hard timeout — kill the child and exit(2) rather than hang
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);

    proc.on('close', (code: number | null, signal: string | null) => {
      clearTimeout(timer);
      resolve({ code, signal, err });
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ code: 1, signal: null, err: 'spawn failed' });
    });
  });

  if (result.signal === 'SIGKILL') {
    // Timeout path — possible suppressed TCC consent dialog under launchd
    process.stderr.write(
      'OmniFocus Automation probe timed out (possible suppressed consent dialog). ' +
        'Open System Settings → Privacy & Security → Automation, enable OmniFocus, then restart the LaunchAgent.\n',
    );
    process.exit(2);
  }

  if (result.code !== 0 || result.err.includes('-1743') || result.err.includes('not allowed')) {
    // Denial path — grant missing or revoked (-1743 is the host-verified denial code)
    process.stderr.write(
      'OmniFocus Automation permission is not granted. ' +
        'Open System Settings → Privacy & Security → Automation, enable OmniFocus for this process, ' +
        'then restart the LaunchAgent.\n',
    );
    process.exit(1);
  }

  // Clean exit — grant is present; caller proceeds to bind transports
  logger.debug('Automation permission probe passed.');
}
