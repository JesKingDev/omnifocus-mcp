/**
 * Role Resolver — Phase 1 identity seam (ROLE-01, ROLE-02, ROLE-03).
 *
 * This module is the SINGLE enforcement point for fail-safe AGENT default.
 * It provides two separately callable steps per ROLE-03 / D-08:
 *
 *   1. Identity step — resolveStdioIdentity() / resolveHttpIdentity()
 *      Returns { transport, roleSource, principal } — who is connected and
 *      how the role was determined, without revealing the role itself.
 *
 *   2. Authorization step — parseRole()
 *      Returns 'owner' | 'agent' — what the caller may do.
 *
 * Consumers of role must call parseRole() independently of identity. The two
 * functions intentionally have different return types so they cannot be
 * conflated (T-1-02).
 *
 * Phase 4 fills resolveHttpIdentity() with token→role/principal lookup.
 * The caller passes a pre-validated TokenEntry; this function constructs
 * the ResolvedIdentity with roleSource='http-token' and the entry's principal.
 *
 * Anti-patterns explicitly absent (D-01, T-1-01):
 *   - No .toLowerCase() or .toUpperCase()
 *   - No .trim()
 *   - No truthy check (if env.OMNIFOCUS_MCP_ROLE)
 *   - No || 'owner' fallback
 * Only the exact literal 'owner' resolves to OWNER.
 */

import type { Role, RoleSource, ResolvedIdentity } from '../contracts/roles.js';
import type { TokenEntry } from './token-registry.js';

/**
 * Parses OMNIFOCUS_MCP_ROLE with default-deny semantics (ROLE-02, D-01).
 *
 * Returns 'owner' if and only if env.OMNIFOCUS_MCP_ROLE === 'owner' (exact
 * equality, no case-fold, no trim). Returns 'agent' for every other value
 * including undefined, empty string, wrong case, whitespace, typos, and
 * garbage values.
 *
 * @param env Optional env override for tests. Defaults to process.env.
 */
export function parseRole(env: Record<string, string | undefined> = process.env): Role {
  return env.OMNIFOCUS_MCP_ROLE === 'owner' ? 'owner' : 'agent';
}

/**
 * Resolves identity for a stdio connection (ROLE-03, D-05).
 *
 * roleSource is 'explicit-env' when OMNIFOCUS_MCP_ROLE is defined and
 * non-empty (regardless of value), and 'fail-safe-default' otherwise.
 * principal is always null for stdio — populated by Phase 4 HTTP transport.
 *
 * @param env Optional env override for tests. Defaults to process.env.
 */
export function resolveStdioIdentity(env: Record<string, string | undefined> = process.env): ResolvedIdentity {
  const isExplicit = env.OMNIFOCUS_MCP_ROLE !== undefined && env.OMNIFOCUS_MCP_ROLE !== '';
  const roleSource: RoleSource = isExplicit ? 'explicit-env' : 'fail-safe-default';
  return {
    transport: 'stdio',
    roleSource,
    principal: null,
  };
}

/**
 * Resolves an HTTP connection's identity from a pre-validated TokenEntry (D-10, T-1-04).
 *
 * The caller (http-server.ts) has already validated the bearer token via
 * validateTokenSet; this function constructs the ResolvedIdentity with the
 * correct roleSource and principal. roleSource is always 'http-token' —
 * the bearer token is the authoritative source of identity on the HTTP path.
 * principal is sourced directly from the resolved TokenEntry (D-10).
 *
 * @param entry  The TokenEntry returned by validateTokenSet for the request's bearer token.
 */
export function resolveHttpIdentity(entry: TokenEntry): ResolvedIdentity {
  return {
    transport: 'http',
    roleSource: 'http-token',
    principal: entry.principal,
  };
}
