/**
 * Token Registry — Phase 4 HTTP authentication layer (HTTP-01, HTTP-05).
 *
 * This module is the SINGLE source of truth for bearer-token → role/principal
 * mapping. It implements constant-time token validation (D-04) and the
 * env-based token registry (D-09, D-10, D-11).
 *
 * Design decisions implemented here:
 *   D-04 — Constant-time, no-early-exit compare across the whole token set.
 *           Validate the presented bearer against every configured token using
 *           timingSafeEqual, accumulate results, and branch once at the end.
 *   D-05 — Fail-closed on unknown/missing token. No match returns null; the
 *           caller (http-server.ts) issues HTTP 401. No default role on miss.
 *   D-09 — Env-based registry: MCP_AGENT_TOKEN → agent, MCP_OWNER_TOKEN → owner.
 *   D-10 — Principal labels: agent-token → 'http-agent', owner-token → 'http-owner'.
 *   D-11 — MCP_AUTH_TOKEN alias: when MCP_AGENT_TOKEN is absent, fall back to
 *           MCP_AUTH_TOKEN for backward compatibility.
 *
 * Anti-patterns explicitly absent (enforced by design):
 *   1. Early return on first match — timing oracle risk; accumulate-then-branch only.
 *   2. === compare for token equality — timing oracle; use timingSafeEqual only.
 *   3. timingSafeEqual without hash normalization — throws RangeError on length
 *      mismatch; SHA-256 collapses all inputs to 32 bytes before comparison.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { Role, Mode } from '../contracts/roles.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A resolved token entry — the role and principal associated with a configured
 * bearer token. Returned by validateTokenSet when a match is found.
 */
export interface TokenEntry {
  role: Role;
  principal: string;
  /** Per-token mode override. When set, requests using this token run in this
   *  mode regardless of the OMNIFOCUS_MCP_INTERACTIVE process env var. Used by
   *  MCP_INTERACTIVE_TOKEN to mark interactive Claude Code sessions as 'interactive'
   *  without requiring a separate process or env var change. */
  mode?: Mode;
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

/**
 * Hashes a token string to a fixed-32-byte SHA-256 Buffer.
 *
 * Called only from validateTokenSet. Hashing every token to the same fixed
 * length before comparison ensures timingSafeEqual never throws RangeError
 * (D-04, Pitfall 1 — length mismatch).
 */
function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Validates a candidate bearer token against every entry in the registry
 * using constant-time comparison (D-04).
 *
 * Returns null immediately if the candidate is falsy or the registry is empty
 * (fast-path guard before hashing). Otherwise hashes both sides to SHA-256,
 * accumulates match results across ALL registry entries without early exit,
 * and branches once at the end.
 *
 * Returns the matched TokenEntry on success, or null on no match (D-05).
 *
 * @param candidate  The raw bearer token from the Authorization header.
 * @param registry   The immutable token registry built by buildTokenRegistry.
 */
export function validateTokenSet(candidate: string, registry: ReadonlyMap<string, TokenEntry>): TokenEntry | null {
  if (!candidate || registry.size === 0) return null;

  const candidateHash = tokenHash(candidate);
  let matched: TokenEntry | null = null;
  let anyMatch = false;

  for (const [configuredToken, entry] of registry) {
    const configuredHash = tokenHash(configuredToken);
    // Both hashes are 32 bytes (SHA-256) — timingSafeEqual never throws (D-04, Pitfall 1)
    const isMatch = timingSafeEqual(candidateHash, configuredHash);
    // Accumulate — no early exit (D-04, Pitfall 2)
    if (isMatch && !anyMatch) {
      anyMatch = true;
      matched = entry;
    }
  }

  return anyMatch ? matched : null; // D-05: null on no match, never a default role
}

/**
 * Builds the token → role registry from environment variables (D-09).
 *
 * Reads MCP_AGENT_TOKEN and MCP_OWNER_TOKEN from the provided env object.
 * If MCP_AGENT_TOKEN is absent, falls back to MCP_AUTH_TOKEN for backward
 * compatibility (D-11). Each present token is mapped to its fixed principal
 * label (D-10).
 *
 * Uses separate if-blocks for agent and owner (not collapsed) so the alias
 * logic and the two token paths remain independently readable.
 *
 * @param env  Env override for tests. Callers pass a synthetic env; defaults
 *             are not applied here — the caller passes what it needs.
 */
export function buildTokenRegistry(env: Record<string, string | undefined>): Map<string, TokenEntry> {
  const registry = new Map<string, TokenEntry>();

  const agentToken = env.MCP_AGENT_TOKEN ?? env.MCP_AUTH_TOKEN; // D-11 backward-compat alias
  if (agentToken) {
    registry.set(agentToken, { role: 'agent', principal: 'http-agent' });
  }

  const ownerToken = env.MCP_OWNER_TOKEN;
  if (ownerToken) {
    registry.set(ownerToken, { role: 'owner', principal: 'http-owner' });
  }

  // MCP_INTERACTIVE_TOKEN: agent role that marks requests as interactive mode.
  // Use this token in Claude Desktop / interactive Claude Code sessions so that
  // task creates go through POLICY_GATE_CAPTURE_CONFIRM rather than
  // POLICY_GATE_BACKGROUND_ONLY (D-09, PERM-02).
  const interactiveToken = env.MCP_INTERACTIVE_TOKEN;
  if (interactiveToken) {
    registry.set(interactiveToken, { role: 'agent', principal: 'http-interactive', mode: 'interactive' });
  }

  return registry;
}
