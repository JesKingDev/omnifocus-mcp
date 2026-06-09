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
export async function probeAutomationOrExit(_timeoutMs = 5000): Promise<void> {
  logger.debug('Running Automation permission probe…');
  throw new Error('not implemented');
}
