import { describe, it, expect } from 'vitest';
import { parseRole, resolveStdioIdentity, resolveHttpIdentity } from '../../../src/auth/role-resolver.js';
import type { ResolvedIdentity } from '../../../src/contracts/roles.js';
import type { TokenEntry } from '../../../src/auth/token-registry.js';

// ---------------------------------------------------------------------------
// parseRole — default-deny parse matrix
//
// Covers all 14 input classes from 01-VALIDATION.md section
// "Parse Input Classes". Each class is its own table row so a failure names
// the exact class that regressed.
// ---------------------------------------------------------------------------

describe('parseRole — default-deny parse matrix', () => {
  it.each<{ label: string; env: Record<string, string | undefined>; expected: 'owner' | 'agent' }>([
    // The ONE input class that must resolve to OWNER
    { label: 'exact match: owner', env: { OMNIFOCUS_MCP_ROLE: 'owner' }, expected: 'owner' },

    // All remaining 13 classes must resolve to AGENT (fail-safe)
    { label: 'wrong case — all caps: OWNER', env: { OMNIFOCUS_MCP_ROLE: 'OWNER' }, expected: 'agent' },
    { label: 'wrong case — title: Owner', env: { OMNIFOCUS_MCP_ROLE: 'Owner' }, expected: 'agent' },
    { label: 'wrong case — mixed: owNer', env: { OMNIFOCUS_MCP_ROLE: 'owNer' }, expected: 'agent' },
    { label: 'explicit agent: agent', env: { OMNIFOCUS_MCP_ROLE: 'agent' }, expected: 'agent' },
    {
      label: 'explicit agent — all caps: AGENT',
      env: { OMNIFOCUS_MCP_ROLE: 'AGENT' },
      expected: 'agent',
    },
    { label: 'empty string', env: { OMNIFOCUS_MCP_ROLE: '' }, expected: 'agent' },
    { label: 'whitespace only: "   "', env: { OMNIFOCUS_MCP_ROLE: '   ' }, expected: 'agent' },
    {
      label: 'leading/trailing whitespace: " owner "',
      env: { OMNIFOCUS_MCP_ROLE: ' owner ' },
      expected: 'agent',
    },
    { label: 'typo: ownerr', env: { OMNIFOCUS_MCP_ROLE: 'ownerr' }, expected: 'agent' },
    { label: 'typo: ownr', env: { OMNIFOCUS_MCP_ROLE: 'ownr' }, expected: 'agent' },
    { label: 'garbage string: garbage123', env: { OMNIFOCUS_MCP_ROLE: 'garbage123' }, expected: 'agent' },
    { label: 'numeric string: "1"', env: { OMNIFOCUS_MCP_ROLE: '1' }, expected: 'agent' },
    { label: 'unset (undefined)', env: {}, expected: 'agent' },
  ])('$label → $expected', ({ env, expected }) => {
    expect(parseRole(env)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// resolveStdioIdentity
//
// Verifies identity/authz separation (ROLE-03): the function returns a
// ResolvedIdentity, which is a distinct value from a Role string. The two
// steps are independently callable with different return type shapes.
// ---------------------------------------------------------------------------

describe('resolveStdioIdentity', () => {
  it('returns transport=stdio and roleSource=explicit-env when OMNIFOCUS_MCP_ROLE=owner', () => {
    const identity: ResolvedIdentity = resolveStdioIdentity({ OMNIFOCUS_MCP_ROLE: 'owner' });
    expect(identity.transport).toBe('stdio');
    expect(identity.roleSource).toBe('explicit-env');
    expect(identity.principal).toBeNull();
  });

  it('returns roleSource=explicit-env for any non-empty OMNIFOCUS_MCP_ROLE value (e.g. garbage)', () => {
    // roleSource tracks "was env var set?" not "is the role valid?"
    const identity = resolveStdioIdentity({ OMNIFOCUS_MCP_ROLE: 'garbage123' });
    expect(identity.roleSource).toBe('explicit-env');
  });

  it('returns roleSource=fail-safe-default when OMNIFOCUS_MCP_ROLE is unset', () => {
    const identity = resolveStdioIdentity({});
    expect(identity.transport).toBe('stdio');
    expect(identity.roleSource).toBe('fail-safe-default');
    expect(identity.principal).toBeNull();
  });

  it('returns roleSource=fail-safe-default when OMNIFOCUS_MCP_ROLE is empty string', () => {
    const identity = resolveStdioIdentity({ OMNIFOCUS_MCP_ROLE: '' });
    expect(identity.roleSource).toBe('fail-safe-default');
  });

  it('returns a ResolvedIdentity object — distinct from a Role string (ROLE-03 identity/authz separation)', () => {
    const identity = resolveStdioIdentity({ OMNIFOCUS_MCP_ROLE: 'owner' });
    const role = parseRole({ OMNIFOCUS_MCP_ROLE: 'owner' });

    // They are different values — identity is an object, role is a string
    expect(typeof identity).toBe('object');
    expect(typeof role).toBe('string');

    // Identity has the correct shape — it is NOT a Role
    expect(identity).toHaveProperty('transport');
    expect(identity).toHaveProperty('roleSource');
    expect(identity).toHaveProperty('principal');

    // The role string is not a ResolvedIdentity — consumers cannot derive
    // one from the other (T-1-02)
    expect(role).not.toHaveProperty('transport');
  });
});

// ---------------------------------------------------------------------------
// resolveHttpIdentity — Phase 4 implementation
//
// Verifies the filled implementation: resolveHttpIdentity now accepts a
// TokenEntry (resolved from the bearer token) and returns a ResolvedIdentity
// with roleSource='http-token' and the entry's principal. The old zero-argument
// stub form is gone; these tests will be RED on Wave 0 because the source
// still has the stub signature and src/auth/token-registry.js does not exist.
// ---------------------------------------------------------------------------

describe('resolveHttpIdentity — Phase 4 implementation', () => {
  it('returns transport=http, roleSource=http-token, principal from agent TokenEntry (HTTP-05)', () => {
    const entry: TokenEntry = { role: 'agent', principal: 'http-agent' };
    const identity: ResolvedIdentity = resolveHttpIdentity(entry);
    expect(identity).toStrictEqual({
      transport: 'http',
      roleSource: 'http-token',
      principal: 'http-agent',
    });
  });

  it('returns roleSource=http-token, principal=http-owner for owner TokenEntry (HTTP-05)', () => {
    const entry: TokenEntry = { role: 'owner', principal: 'http-owner' };
    const identity = resolveHttpIdentity(entry);
    expect(identity.roleSource).toBe('http-token');
    expect(identity.principal).toBe('http-owner');
  });
});
