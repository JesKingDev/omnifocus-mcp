/**
 * Operation Policy — Phase 2 authorization seam (POLICY-01 through POLICY-07).
 *
 * This module is the SINGLE SOURCE OF TRUTH for the (role, operation, target) →
 * outcome decision. Both enforcement layers call this one function:
 *   1. Funnel guard — OmniFocusWriteTool.executeValidated (Plan 02)
 *   2. Script-builder re-assertion — mutation-script-builder.ts, tag-mutation-script-builder.ts (Plan 03)
 *
 * Anti-patterns explicitly absent (D-07, T-2-01):
 *   - No state-dependent carve-outs (e.g. no "completed tasks may be deleted" check)
 *   - No async lookups
 *   - No || 'allow' fallback — unknown ops fail closed
 *   - No per-target overrides for OWNER — OWNER always returns 'allow' unconditionally
 */

import type { PolicyOutcome, Role } from '../contracts/roles.js';

// =============================================================================
// POLICY TABLE
// =============================================================================

/**
 * D-08 canonical table for the AGENT role (OWNER always passes through).
 *
 * Outer key: operation string (matches write tool operation enum)
 * Inner key (for tag_manage): target string (matches tag action enum)
 * Value: PolicyOutcome
 *
 * Any (operation, target) pair absent from this table resolves to 'deny'
 * for the AGENT role — fail-closed per T-2-01.
 */
const AGENT_POLICY: Record<string, PolicyOutcome | Record<string, PolicyOutcome>> = {
  // -------------------------------------------------------------------------
  // Deny: hard deletes — no carve-outs, no state checks (D-07)
  // -------------------------------------------------------------------------
  delete: 'deny',
  bulk_delete: 'deny',

  // -------------------------------------------------------------------------
  // Allow: recoverable / non-destructive ops
  // -------------------------------------------------------------------------
  complete: 'allow',
  // Forward-declared/unreachable (WR-04): the write schema has no 'drop'
  // operation literal — dropping a task is an 'update' with status 'dropped',
  // covered by the 'update' entry below. This entry is inert with respect to
  // the funnel today, kept (like tag_manage's perspective_delete) so a future
  // first-class 'drop' op resolves to 'allow' rather than fail-closed deny.
  drop: 'allow',
  create: 'allow',
  update: 'allow',
  batch: 'allow',
  create_folder: 'allow',

  // -------------------------------------------------------------------------
  // tag_manage: per-target classification (D-08)
  // Gate targets: delete, merge, perspective_delete (forward-declared/inert)
  // Allow targets: additive/structural ops
  // Any unrecognised target → fail-closed 'deny'
  // -------------------------------------------------------------------------
  tag_manage: {
    // gated (dry-run + owner approval required)
    delete: 'gate',
    merge: 'gate',
    perspective_delete: 'gate',

    // allowed (additive/structural)
    create: 'allow',
    rename: 'allow',
    nest: 'allow',
    unnest: 'allow',
    reparent: 'allow',
  },
};

// =============================================================================
// DECISION FUNCTION
// =============================================================================

/**
 * Returns the policy outcome for a (role, operation, target) triple.
 *
 * Fail-closed contract (T-2-01, D-07):
 *   - OWNER role always returns 'allow' — no gating, no deny (POLICY-06, D-08)
 *   - AGENT + known op with target-level table: looks up target; missing → 'deny'
 *   - AGENT + known op with flat outcome: returns that outcome directly
 *   - AGENT + any unrecognised operation: returns 'deny'
 *
 * Pure, synchronous, no side effects.
 *
 * @param role      The resolved caller role from parseRole() (Phase 1)
 * @param operation The operation string from the compiled mutation
 * @param target    Optional target string (required for tag_manage disambiguation)
 */
export function decide(role: Role, operation: string, target?: string): PolicyOutcome {
  // OWNER always passes through — no gating, no deny (POLICY-06)
  if (role === 'owner') {
    return 'allow';
  }

  // AGENT: look up the operation in the policy table
  const entry = AGENT_POLICY[operation];

  // Operation not in table → fail-closed deny
  if (entry === undefined) {
    return 'deny';
  }

  // Flat outcome (string): applies regardless of target
  if (typeof entry === 'string') {
    return entry;
  }

  // Per-target table: look up the target
  const targetOutcome = entry[target ?? ''];

  // Target not in table → fail-closed deny (unknown target on a gated op group)
  if (targetOutcome === undefined) {
    return 'deny';
  }

  return targetOutcome;
}
