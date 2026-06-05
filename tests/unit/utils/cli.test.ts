import { describe, it, expect } from 'vitest';
import { validateCLIConfig } from '../../../src/utils/cli.js';
import type { CLIConfig } from '../../../src/utils/cli.js';

// ---------------------------------------------------------------------------
// cli.test.ts — Wave 0 contract for validateCLIConfig HTTP assertions
//
// These tests FAIL (RED) on Wave 0 because the new assertions (loopback bind,
// mandatory agent token, distinct tokens, non-blank owner token) do not yet
// exist in validateCLIConfig. The existing port/host-empty checks pass; the
// new HTTP-mode-specific checks fail because the implementation is absent.
//
// Covers: HTTP-02 (loopback bind), HTTP-04 (mandatory agent token), HTTP-05
// (distinct tokens, non-blank owner token). Pitfall 5: stdio mode must not
// trigger HTTP assertions.
//
// Decision references: D-06 (distinct tokens), D-07 (mandatory token),
// D-13 (loopback-only bind).
// ---------------------------------------------------------------------------

describe('validateCLIConfig — HTTP mode assertions', () => {
  // Base config for HTTP mode tests: valid loopback bind + agent token present.
  // Each variant uses spread syntax to override a single field.
  const base: CLIConfig = {
    httpMode: true,
    port: 3000,
    host: '127.0.0.1',
    agentToken: 'a'.repeat(64),
  };

  it('does not throw for a valid HTTP config with loopback host and agentToken (HTTP-02)', () => {
    expect(() => validateCLIConfig(base)).not.toThrow();
  });

  it('throws on non-loopback host in HTTP mode — message matches /loopback/ (D-13, HTTP-02)', () => {
    // '0.0.0.0' is the old default — must be rejected by the new assertion
    expect(() => validateCLIConfig({ ...base, host: '0.0.0.0' })).toThrow(/loopback/);
  });

  it('throws on external host in HTTP mode — message matches /loopback/ (D-13, HTTP-02)', () => {
    // sonarjs/no-hardcoded-ip: IP is a test fixture for an obviously invalid bind address, not real infrastructure
    // eslint-disable-next-line sonarjs/no-hardcoded-ip
    expect(() => validateCLIConfig({ ...base, host: '192.168.1.100' })).toThrow(/loopback/);
  });

  it('throws when agentToken absent in HTTP mode — message matches /MCP_AGENT_TOKEN/ (D-07, HTTP-04)', () => {
    expect(() => validateCLIConfig({ ...base, agentToken: undefined })).toThrow(/MCP_AGENT_TOKEN/);
  });

  it('throws when agentToken equals ownerToken — message matches /different/ (D-06, HTTP-05)', () => {
    // Same token for both roles is a privilege escalation risk
    expect(() => validateCLIConfig({ ...base, ownerToken: base.agentToken })).toThrow(/different/);
  });

  it('throws when ownerToken is blank/whitespace — message matches /empty/ (D-06, HTTP-05)', () => {
    // A blank ownerToken bypasses auth — startup must reject it
    expect(() => validateCLIConfig({ ...base, ownerToken: '   ' })).toThrow(/empty/);
  });

  it('does not apply HTTP assertions in stdio mode — Pitfall 5 guard', () => {
    // stdio mode with open bind and no tokens must NOT throw
    // (validates that new assertions are gated inside if (config.httpMode))
    expect(() =>
      validateCLIConfig({
        httpMode: false,
        port: 3000,
        host: '0.0.0.0',
      }),
    ).not.toThrow();
  });
});
