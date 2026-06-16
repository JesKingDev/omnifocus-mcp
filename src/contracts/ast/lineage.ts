/**
 * Lineage stamp composition for agent-created tasks (LINE-01, D-09, D-10).
 *
 * Every task created by the agent embeds a structured provenance block in its
 * note field. The sentinel format is an HTML comment so OmniFocus displays the
 * note body cleanly and Phase 5 archaeology can extract the metadata.
 *
 * Canonical format (D-09):
 *
 *   <existing user note text>
 *
 *   <!-- of-mcp:lineage
 *   {"v":1,"agent":"claude-code","session":"<uuid>","created_at":"<iso8601>"}
 *   -->
 *
 * Strip-before-reappend invariant (D-10):
 *   On update, composeLineageStamp() strips any existing lineage block before
 *   re-appending. This keeps the note idempotent — calling the function twice
 *   with the same input produces the same output (no duplicate blocks).
 *
 * Phase 5 parse regex:
 *   LINEAGE_RE matches the full stamp (blank-line prefix + comment). Use it
 *   to extract the JSON payload from a note string during session archaeology.
 */

/**
 * Matches the canonical lineage stamp block including its blank-line prefix.
 * The 's' (dotAll) flag is required so `.*?` matches newlines inside the JSON payload.
 */
export const LINEAGE_RE: RegExp = /\n\n<!-- of-mcp:lineage\n.*?\n-->/s;

/**
 * Composes the final note string by appending a lineage stamp block.
 *
 * @param userNote - The original note text (may already contain a lineage block).
 * @param lineage  - Provenance fields to embed in the JSON payload.
 *   - `sessionId`  The originating Claude Code session ID (required).
 *   - `agent`      Agent identifier; defaults to `"claude-code"`.
 *   - `createdAt`  ISO-8601 timestamp; defaults to server time.
 * @returns The base note (stripped of any prior lineage block) with the new
 *          lineage stamp appended.
 */
export function composeLineageStamp(
  userNote: string | undefined,
  lineage: { sessionId: string; agent?: string; createdAt?: string },
): string {
  // Strip any existing lineage block (D-10 strip-before-reappend invariant).
  // Use a global+dotAll variant so that a note carrying *multiple* lineage
  // blocks (legacy data, manual edits, or two stamps that raced) has ALL of
  // them removed before re-appending — a single replace would leave the
  // second block behind and produce a two-block note (WR-03).
  const STRIP_RE = new RegExp(LINEAGE_RE.source, 'gs');
  const base = (userNote ?? '').replace(STRIP_RE, '').trimEnd();

  const payload = JSON.stringify({
    v: 1,
    agent: lineage.agent ?? 'claude-code',
    session: lineage.sessionId,
    created_at: lineage.createdAt ?? new Date().toISOString(),
  });

  const stamp = `\n\n<!-- of-mcp:lineage\n${payload}\n-->`;
  return base + stamp;
}
