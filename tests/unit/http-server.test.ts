import { describe, it, expect } from 'vitest';
import { buildAllowedHostSet, isHostAllowed } from '../../src/http-server.js';

// ---------------------------------------------------------------------------
// http-server.test.ts — Wave 0 contract for DNS-rebinding Host/Origin validation
//
// These tests FAIL (RED) on Wave 0 because buildAllowedHostSet and isHostAllowed
// are not yet exported from src/http-server.ts. The import will error with
// "does not provide an export named" or the functions will be undefined.
//
// Testability approach: The plan specifies that validateHostOrigin logic will
// live on HttpServerManager as a private method. To keep these unit tests
// independent of a live HTTP server, the Wave 1 implementation must extract
// the pure host-validation logic into standalone exported functions:
//   - buildAllowedHostSet(port: number, allowedHosts: string[]): Set<string>
//   - isHostAllowed(hostHeader: string | undefined, allowedSet: Set<string>): boolean
//
// This is the planned export shape that Wave 1 must honour. If Wave 1 chooses
// a different shape, these tests must be adjusted to match — the key requirement
// is that all behaviors below are unit-testable without a live HTTP server.
//
// Covers: HTTP-03 (DNS-rebinding protection), D-14 (external middleware),
// D-15 (loopback always allowed + MCP_ALLOWED_HOSTS entries).
// ---------------------------------------------------------------------------

describe('buildAllowedHostSet — constructs allowlist for DNS-rebinding protection (HTTP-03)', () => {
  it('always includes localhost and 127.0.0.1 regardless of allowedHosts input (D-15)', () => {
    const set = buildAllowedHostSet(3000, []);
    expect(set.has('localhost')).toBe(true);
    expect(set.has('127.0.0.1')).toBe(true);
  });

  it('includes port-suffixed loopback entries for the configured port (D-15)', () => {
    const set = buildAllowedHostSet(3000, []);
    expect(set.has('localhost:3000')).toBe(true);
    expect(set.has('127.0.0.1:3000')).toBe(true);
  });

  it('includes MCP_ALLOWED_HOSTS entries when provided (D-15)', () => {
    const set = buildAllowedHostSet(3000, ['my-mac.tail.ts.net']);
    expect(set.has('my-mac.tail.ts.net')).toBe(true);
  });

  it('empty allowedHosts → only loopback entries in set', () => {
    const set = buildAllowedHostSet(3000, []);
    // Should have exactly 4 entries: localhost, 127.0.0.1, localhost:3000, 127.0.0.1:3000
    expect(set.size).toBe(4);
  });
});

describe('isHostAllowed — Host header validation (HTTP-03)', () => {
  // Helper: build a standard allowset for port 3000, no extra hosts
  function loopbackSet(): Set<string> {
    return buildAllowedHostSet(3000, []);
  }

  it('returns true for Host: localhost (D-15)', () => {
    expect(isHostAllowed('localhost', loopbackSet())).toBe(true);
  });

  it('returns true for Host: 127.0.0.1 (D-15)', () => {
    expect(isHostAllowed('127.0.0.1', loopbackSet())).toBe(true);
  });

  it('returns true for Host: 127.0.0.1:3000 (D-15)', () => {
    expect(isHostAllowed('127.0.0.1:3000', loopbackSet())).toBe(true);
  });

  it('returns false for unknown Host — e.g. evil.attacker.com (HTTP-03)', () => {
    expect(isHostAllowed('evil.attacker.com', loopbackSet())).toBe(false);
  });

  it('returns true for MCP_ALLOWED_HOSTS entry present in set (D-15)', () => {
    const set = buildAllowedHostSet(3000, ['my-mac.tail.ts.net']);
    expect(isHostAllowed('my-mac.tail.ts.net', set)).toBe(true);
  });

  it('returns false when Host header is undefined (no Host header sent) (HTTP-03)', () => {
    // A missing Host header should fail closed — deny the request
    expect(isHostAllowed(undefined, loopbackSet())).toBe(false);
  });
});
