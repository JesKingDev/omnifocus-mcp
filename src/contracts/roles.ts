/**
 * ROLE CONTRACTS
 *
 * This is the SINGLE SOURCE OF TRUTH for role and identity types.
 *
 * Used by:
 * - RoleResolver (Phase 1 — to parse env and emit a typed ResolvedContext)
 * - PolicyEngine (Phase 2 — to evaluate gate decisions by Role)
 * - MutationGate (Phase 3 — to enforce write permissions)
 * - HTTP transport layer (Phase 4 — to populate ResolvedIdentity from bearer token)
 *
 * If you need to extend these types:
 * 1. Add or modify here FIRST
 * 2. Then update all consumers (resolver, policy, gate, transport)
 */

// =============================================================================
// ROLE TYPES
// =============================================================================

/**
 * The two first-class roles in the system.
 *
 * - 'owner'  — full read/write access; may perform destructive operations
 * - 'agent'  — restricted access; destructive operations require owner approval
 */
export type Role = 'owner' | 'agent';

/**
 * How the role was determined at startup.
 *
 * - 'explicit-env'      — OMNIFOCUS_ROLE env var was set and parsed successfully
 * - 'fail-safe-default' — no env var present; system fell back to 'agent'
 * - 'http-token'        — role was extracted from a bearer token (Phase 4 HTTP transport)
 *
 * Note: 'launchd-label' is intentionally absent. The launchd path emits 'explicit-env'
 * because the label is resolved to an env var before the resolver runs (D-06).
 */
export type RoleSource = 'explicit-env' | 'fail-safe-default' | 'http-token';

// =============================================================================
// IDENTITY AND CONTEXT INTERFACES
// =============================================================================

/**
 * Transport-level identity for the calling principal.
 *
 * Populated by Phase 4 HTTP transport; fields are null in stdio mode until
 * Phase 4 is implemented. The 'principal' field is in SENSITIVE_KEYS — never
 * appears in logs raw (D-08).
 */
export interface ResolvedIdentity {
  /** Transport the request arrived on */
  transport: 'stdio' | 'http';
  /** How the role was determined */
  roleSource: RoleSource;
  /** Opaque principal identifier from the bearer token, or null for stdio */
  principal: string | null;
}

/**
 * Full resolved context passed to policy and gate layers.
 *
 * Combines the identity (who called) with the role (what they may do).
 * These are intentionally separate fields — consumers must not derive Role
 * from ResolvedIdentity fields (T-1-02).
 */
export interface ResolvedContext {
  identity: ResolvedIdentity;
  role: Role;
}
