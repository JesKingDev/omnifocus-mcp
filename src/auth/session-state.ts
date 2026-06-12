/**
 * stdio mode: single-session process — module-level grant state (Pitfall 2, RESEARCH.md).
 *
 * The HTTP path stores the "allow all this session" grant in SessionConfig (per-session
 * object in SessionManager). The stdio path has no SessionConfig — each process is a
 * single connection. This module provides the equivalent module-level singleton for stdio.
 *
 * Grant is owner-only settable (D-02, T-02-02). The grant persists for the lifetime of
 * the process (i.e. the session). resetSessionGrant() is provided for test cleanup only.
 */

import type { Role } from '../contracts/roles.js';

let _allowAllThisSession = false;

/**
 * Returns true if the owner has granted session-wide agent create permission (D-02, PERM-02).
 */
export function isAllowedAllThisSession(): boolean {
  return _allowAllThisSession;
}

/**
 * Sets the session-wide grant. Throws if the caller's role is not 'owner' (D-02, T-02-02).
 *
 * Anti-pattern explicitly absent: agent-supplied call args must never reach this function.
 * Only owner-authenticated code paths may call setAllowAllThisSession.
 *
 * @param role The resolved caller role — must be 'owner'
 */
export function setAllowAllThisSession(role: Role): void {
  if (role !== 'owner') {
    throw new Error('Only owner-authenticated callers may set session grant (D-02)');
  }
  _allowAllThisSession = true;
}

/**
 * Resets the session grant to false. For test cleanup only — do not call in production code.
 */
export function resetSessionGrant(): void {
  _allowAllThisSession = false;
}
