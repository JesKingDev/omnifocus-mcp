import { describe, it, expect } from 'vitest';
import { buildTokenRegistry, validateTokenSet } from '../../../src/auth/token-registry.js';
import type { TokenEntry } from '../../../src/auth/token-registry.js';

// ---------------------------------------------------------------------------
// token-registry.test.ts — Wave 0 contract (ALL tests RED until Wave 1 ships)
//
// These tests fail at import time on Wave 0 because src/auth/token-registry.ts
// does not exist yet. The import error is the correct RED signal.
//
// Covers: HTTP-01 (constant-time auth), HTTP-05 (registry construction + role
// resolution). Decision references: D-04 (accumulate-then-branch), D-05
// (fail-closed null), D-09 (env vars), D-10 (principal labels), D-11 (alias).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// validateTokenSet — token set validation matrix
//
// Uses it.each to cover all input classes in one table. Each row is an
// independent test case with a label for precise failure identification.
// ---------------------------------------------------------------------------

const AGENT_TOKEN = 'a'.repeat(64); // fixed-length hex-like strings for clarity
const OWNER_TOKEN = 'b'.repeat(64);
const WRONG_TOKEN = 'c'.repeat(64);
const SHORT_TOKEN = 'x'.repeat(16); // different length to test SHA-256 normalization

function buildTwoEntryRegistry(): ReadonlyMap<string, TokenEntry> {
  return new Map<string, TokenEntry>([
    [AGENT_TOKEN, { role: 'agent', principal: 'http-agent' }],
    [OWNER_TOKEN, { role: 'owner', principal: 'http-owner' }],
  ]);
}

describe('validateTokenSet — token set validation matrix', () => {
  it.each<{ label: string; candidate: string; registry: ReadonlyMap<string, TokenEntry>; expected: TokenEntry | null }>(
    [
      {
        label: 'empty candidate string → null (HTTP-01)',
        candidate: '',
        registry: new Map([[AGENT_TOKEN, { role: 'agent', principal: 'http-agent' }]]),
        expected: null,
      },
      {
        label: 'wrong token → null (HTTP-01)',
        candidate: WRONG_TOKEN,
        registry: new Map([[AGENT_TOKEN, { role: 'agent', principal: 'http-agent' }]]),
        expected: null,
      },
      {
        label: 'matching agent token → agent entry (HTTP-01)',
        candidate: AGENT_TOKEN,
        registry: new Map([[AGENT_TOKEN, { role: 'agent', principal: 'http-agent' }]]),
        expected: { role: 'agent', principal: 'http-agent' },
      },
      {
        label: 'matching owner token → owner entry (HTTP-01, HTTP-05)',
        candidate: OWNER_TOKEN,
        registry: new Map([[OWNER_TOKEN, { role: 'owner', principal: 'http-owner' }]]),
        expected: { role: 'owner', principal: 'http-owner' },
      },
      {
        label: 'empty registry → null (HTTP-01)',
        candidate: AGENT_TOKEN,
        registry: new Map(),
        expected: null,
      },
    ],
  )('$label', ({ candidate, registry, expected }) => {
    const result = validateTokenSet(candidate, registry);
    expect(result).toStrictEqual(expected);
  });

  it('length-mismatched candidate does not throw — SHA-256 hash normalization (HTTP-01)', () => {
    // SHORT_TOKEN has length 16, AGENT_TOKEN has length 64.
    // Without SHA-256 normalization timingSafeEqual would throw RangeError.
    // This test confirms hashing collapses both to equal-length buffers.
    const registry = new Map<string, TokenEntry>([[AGENT_TOKEN, { role: 'agent', principal: 'http-agent' }]]);
    expect(() => validateTokenSet(SHORT_TOKEN, registry)).not.toThrow();
    // A mismatched-length token must not match
    expect(validateTokenSet(SHORT_TOKEN, registry)).toBeNull();
  });

  it('two-token registry: both entries reachable — no early exit (D-04, HTTP-01)', () => {
    // D-04 requires the implementation to accumulate across ALL tokens, not return on first match.
    // This test proves both entries are reachable by calling validateTokenSet twice —
    // once with the agent token and once with the owner token — and asserting the correct
    // entry is returned for each.
    //
    // Note: A true constant-time audit would require a timing harness (e.g. perf_hooks
    // sampling across thousands of requests). That level of instrumentation is out of scope
    // for unit tests. This test only proves correctness (both entries are reachable), not
    // timing guarantees.
    const registry = buildTwoEntryRegistry();

    const agentResult = validateTokenSet(AGENT_TOKEN, registry);
    expect(agentResult).not.toBeNull();
    expect(agentResult!.role).toBe('agent');

    const ownerResult = validateTokenSet(OWNER_TOKEN, registry);
    expect(ownerResult).not.toBeNull();
    expect(ownerResult!.role).toBe('owner');
  });
});

// ---------------------------------------------------------------------------
// buildTokenRegistry — registry construction from env vars
//
// Uses individual it() calls (not it.each) because each case tests a distinct
// construction scenario, not an input class matrix.
// ---------------------------------------------------------------------------

describe('buildTokenRegistry — registry construction from env vars (HTTP-05)', () => {
  it('MCP_AGENT_TOKEN set → single-entry map with role=agent (HTTP-05)', () => {
    const registry = buildTokenRegistry({ MCP_AGENT_TOKEN: AGENT_TOKEN });
    expect(registry.size).toBe(1);
    expect(registry.get(AGENT_TOKEN)).toStrictEqual({ role: 'agent', principal: 'http-agent' });
  });

  it('MCP_OWNER_TOKEN set → map includes owner entry (HTTP-05)', () => {
    const registry = buildTokenRegistry({ MCP_OWNER_TOKEN: OWNER_TOKEN });
    expect(registry.size).toBe(1);
    expect(registry.get(OWNER_TOKEN)).toStrictEqual({ role: 'owner', principal: 'http-owner' });
  });

  it('MCP_AUTH_TOKEN alias without MCP_AGENT_TOKEN → maps to agent role (HTTP-05 D-11)', () => {
    // D-11 backward-compat: MCP_AUTH_TOKEN treated as MCP_AGENT_TOKEN alias when MCP_AGENT_TOKEN absent.
    const registry = buildTokenRegistry({ MCP_AUTH_TOKEN: AGENT_TOKEN });
    expect(registry.size).toBe(1);
    expect(registry.get(AGENT_TOKEN)).toStrictEqual({ role: 'agent', principal: 'http-agent' });
  });

  it('both MCP_AGENT_TOKEN and MCP_OWNER_TOKEN → two-entry map (HTTP-05)', () => {
    const registry = buildTokenRegistry({ MCP_AGENT_TOKEN: AGENT_TOKEN, MCP_OWNER_TOKEN: OWNER_TOKEN });
    expect(registry.size).toBe(2);
    expect(registry.get(AGENT_TOKEN)).toStrictEqual({ role: 'agent', principal: 'http-agent' });
    expect(registry.get(OWNER_TOKEN)).toStrictEqual({ role: 'owner', principal: 'http-owner' });
  });

  it('neither MCP_AGENT_TOKEN nor MCP_OWNER_TOKEN → empty map', () => {
    const registry = buildTokenRegistry({});
    expect(registry.size).toBe(0);
  });
});
