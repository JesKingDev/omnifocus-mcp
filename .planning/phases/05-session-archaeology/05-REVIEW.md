---
phase: 05-session-archaeology
reviewed: 2026-06-16T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - .claude/skills/session-archaeology/SKILL.md
  - probes/archaeology-prefilter.js
  - src/contracts/ast/mutation-script-builder.ts
  - tests/fixtures/archaeology/sample-transcript.jsonl
  - tests/unit/contracts/ast/lineage-dedup.test.ts
  - tests/unit/contracts/ast/mutation-script-builder.test.ts
  - tests/unit/probes/archaeology-prefilter.test.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-06-16 **Depth:** standard **Files Reviewed:** 7 **Status:** issues_found

## Summary

Phase 5 ships the session-archaeology skill, the pre-filter probe, the lineage dedup backbone, and the `archaeology` tag
allowlist entry. The change to the source code proper (`mutation-script-builder.ts`) is a single allowlist line and is
correct and well-tested. The substantive logic lives in the probe and in the lineage round-trip the SKILL relies on.

No blocker-tier defects. The pre-filter probe is the highest-correctness-risk file and it contains two real recall bugs
(multi-text loss, missing-timestamp kept) plus a duplicate-lineage-block hazard that propagates into the dedup backbone.
None of these crash or leak data, but each silently degrades the feature's stated guarantees ("bias to recall", "every
approved loop becomes a real task", session-level dedup correctness). All five warnings stem from edge cases the test
suite never exercises — every fixture line lives in its own single-record session, so multi-record-per-session paths are
completely uncovered.

## Warnings

### WR-01: Assistant messages with multiple text blocks lose all but the first

**File:** `probes/archaeology-prefilter.js:58-65` (`extractText`) **Issue:** `extractText` returns on the **first**
`{type:'text'}` item it finds. Real Claude Code assistant turns routinely interleave `text → tool_use → text` (the model
narrates, calls a tool, then continues). The second and later text blocks — often where the agent states the actual
conclusion, next step, or open question — are dropped. Verified empirically: an assistant message with
`["FIRST block", tool_use, "SECOND block after tool"]` emits only `"FIRST block"`. This directly undercuts the rubric's
"bias to recall" and the guaranteed-catch floor (a `next:` or `TODO` in the trailing text never reaches the model).
**Fix:** Concatenate all text items rather than returning the first:

```js
if (Array.isArray(content)) {
  const parts = [];
  for (const item of content) {
    if (item && item.type === 'text' && typeof item.text === 'string' && item.text.trim().length > 0) {
      parts.push(item.text.trim());
    }
  }
  return parts.length > 0 ? { text: parts.join('\n\n') } : null;
}
```

### WR-02: Records with missing or unparseable timestamps bypass the 7-day window

**File:** `probes/archaeology-prefilter.js:106-111` **Issue:** The window filter only drops a line when
`typeof ts === 'string'` AND `Date.parse(ts)` succeeds AND the result is older than the cutoff. A line with no
`timestamp` field, a non-string timestamp, or an unparseable string is **kept unconditionally** regardless of age. D-02
is explicit that the 7-day content-date window is a hard boundary; a malformed-timestamp line from weeks ago would
re-surface its session on every scan and could defeat the windowing guarantee the SKILL leans on. Verified: both a
no-`timestamp` line and a `timestamp:"not-a-date"` line are retained. **Fix:** Fail closed — drop any kept line whose
timestamp cannot be validated as within the window, or at minimum decide the policy explicitly and document it:

```js
const ts = line.timestamp;
if (typeof ts !== 'string') continue;        // no usable date -> drop (fail closed)
const tsMs = Date.parse(ts);
if (isNaN(tsMs) || tsMs < cutoffMs) continue; // unparseable or stale -> drop
```

If keeping is the intended behavior, state it in the header filter rule and add a test for it; right now the behavior is
implicit and untested.

### WR-03: Duplicate lineage blocks defeat strip-before-reappend and skew dedup

**File:** `src/contracts/ast/lineage.ts:30,48` **Issue:** `LINEAGE_RE` is non-global and `composeLineageStamp` calls
`userNote.replace(LINEAGE_RE, '')` — a single replace. If a note ever carries two lineage blocks (legacy data written
before strip logic existed, a manual edit, or two stamps that raced), strip removes only the first and re-appends a
third, leaving the note with two blocks. The dedup parse helper (`lineage-dedup.test.ts:31` and the SKILL's documented
parse) uses `LINEAGE_RE.exec(note)`, which returns only the **first** match — so dedup keys on the _oldest_ session ID,
not the most recent. Verified: a two-block note strips to a still-containing-lineage string, and `.exec` returns the
first (`session-FIRST`) block. The idempotency unit test only covers the single-block case, so this hazard is invisible
to CI. **Fix:** Make the strip global so the invariant truly holds:

```js
const STRIP_RE = new RegExp(LINEAGE_RE.source, 'gs');
const base = (userNote ?? '').replace(STRIP_RE, '').trimEnd();
```

And add an idempotency test that seeds a note already carrying two blocks and asserts the result has exactly one.

### WR-04: Probe drops empty-trimmed text silently, with no guaranteed-catch floor on whitespace-only intents

**File:** `probes/archaeology-prefilter.js:54-55,61` **Issue:** Both the user-string path and the array-text path
require `text.trim().length > 0` to keep a record. That is reasonable for whitespace, but combined with WR-01
(first-text-only) it means an assistant turn whose first text item is whitespace/empty and whose real content is in a
later text block is dropped entirely. The two bugs compound. Independently, there is no test asserting the trim/empty
behavior, so a future refactor could flip it unnoticed. **Fix:** Adopt the WR-01 concatenation fix (which makes the
first item no longer decisive) and add a test for an assistant message whose first text item is empty and a later one
carries content.

### WR-05: `printGrouped` truncates emitted text to 200 chars in CLI output

**File:** `probes/archaeology-prefilter.js:219` **Issue:** The CLI prints `rec.text.slice(0, 200)`. The SKILL tells the
agent to read the probe's stdout and apply the detection rubric to it. A 200-char truncation can cut off the exact
`TODO`, `blocker`, `next:`, or unanswered question the guaranteed-catch floor is supposed to surface — the loop lives
past character 200 in a longer turn. The pure `filterTranscriptLines` returns full text, but the consumer documented in
the SKILL is the CLI, which truncates. **Fix:** Print full text (or a much larger cap), or emit machine-readable JSON
the skill parses rather than human-truncated lines:

```js
console.log(`[${rec.timestamp}] ${rec.role}: ${rec.text}`);
```

If truncation is intentional for console readability, the SKILL must instruct the agent to consume a non-truncated
output mode, not the default console print.

## Info

### IN-01: Test fixture never exercises multi-record-per-session grouping

**File:** `tests/fixtures/archaeology/sample-transcript.jsonl:1-13` **Issue:** Every line uses a distinct `sessionId`.
`printGrouped` and the "records grouped by session" contract the SKILL advertises are therefore never tested with more
than one record per session, and ordering-within-session is unverified. This is why WR-01/WR-02 slipped through.
**Fix:** Add a fixture session with multiple kept records (interleaved user/assistant, one with multiple text blocks)
and assert grouping + order.

### IN-02: Pre-filter probe is `.js`, not covered by the TS-only rule — verify intent

**File:** `probes/archaeology-prefilter.js:1` **Issue:** CLAUDE.md permits `.js` under `probes/` only for
`osascript`/JXA probe scripts that cannot run compiled TypeScript. This probe is plain Node ESM doing filesystem +
filtering — it does not need raw `osascript` execution, so the stated exception ("osascript executes raw JXA and cannot
run compiled TypeScript") does not strictly apply. It is reasonable as a throwaway, but the justification in the header
cites the probe convention loosely. **Fix:** Either move the pure logic into a `src/` TS module (the unit test already
imports the function directly) and keep a thin `.js` CLI shim, or note explicitly in the header why TS compilation is
not used here.

### IN-03: SKILL hardcodes the lineage regex inline, risking drift from source

**File:** `.claude/skills/session-archaeology/SKILL.md:72` **Issue:** The SKILL embeds `LINEAGE_RE` as a literal
(`/\n\n<!-- of-mcp:lineage\n.*?\n-->/s`) and the dedup test embeds the strip-comment-markers logic by hand. Both
duplicate `src/contracts/ast/lineage.ts`. If the canonical format changes, three places must change in lockstep with no
guard. This is the same class as the version-pin rule in CLAUDE.md. **Fix:** Have the SKILL reference the exported
`LINEAGE_RE` / `composeLineageStamp` by name and grep target rather than restating the pattern; keep the literal only in
`lineage.ts`.

### IN-04: `extractText` JSDoc type omits the missing-`role` (null) case the code handles

**File:** `probes/archaeology-prefilter.js:97-101` **Issue:** The dispatch accepts `role == null` for both user and
assistant lines (correct — real CC transcripts sometimes omit `message.role`), but the `extractText` JSDoc declares
`role: 'user' | 'assistant'` and the header filter rule does not mention the null-role allowance. The behavior is good;
the docs understate it. **Fix:** Document the `role == null` fallback in the filter-rule header comment so the next
reader knows it is intentional, not an oversight.

---

_Reviewed: 2026-06-16_ _Reviewer: Claude (gsd-code-reviewer)_ _Depth: standard_
