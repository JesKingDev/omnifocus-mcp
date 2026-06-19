#!/usr/bin/env node
/**
 * ARCHAEOLOGY PRE-FILTER PROBE — archaeology-prefilter.js
 *
 * Reduces raw Claude Code transcript JSONL to user-prose + assistant-text records,
 * applying the D-03 token-budget strip rule and the D-02 content-date window.
 *
 * Filter rule (D-03 + D-02, verified against live transcript census in 05-RESEARCH.md):
 *   1. Exclude any line where isSidechain === true (D-02 subagent exclusion).
 *   2. Keep 'user' line if message.content is a string (prose) OR the content array
 *      contains a {type:'text'} item. Drop tool_result-only user lines (87% of user volume).
 *   3. Keep 'assistant' line if its content array contains a {type:'text'} item.
 *      Emit only that text; drop tool_use/thinking items.
 *   4. Drop all other types: attachment, file-history-snapshot, system, mode,
 *      permission-mode, queue-operation, ai-title, last-prompt, bridge-session.
 *   5. After (1-4), drop any kept line whose per-message ISO timestamp is older
 *      than nowMs − 7*24*60*60*1000 (D-02 content-date window, NOT file mtime).
 *      Fail closed: a line with a missing, non-string, or unparseable timestamp
 *      has no usable content-date and is dropped (it cannot be proven in-window).
 *
 * Emit: { session_id, timestamp, role, text } records.
 *
 * Per CLAUDE.md probe convention: this is a throwaway probe, not a src/ module.
 * ESM (matching the project "type":"module" in package.json).
 * The pure filterTranscriptLines() is exported for unit tests.
 * The CLI wrapper runs only when executed as main (import.meta.url guard).
 *
 * Threat mitigations (T-05-03, T-05-04, T-05-05):
 *   T-05-03: All tool_result content is dropped before any text reaches the model.
 *   T-05-04: CLI dir resolution enumerates only ~/.claude/projects (all subdirs);
 *            no user-supplied path traversal.
 *   T-05-05: The pure function receives already-parsed objects; the CLI wrapper skips
 *            lines that fail JSON.parse rather than aborting.
 *
 * Run directly: node probes/archaeology-prefilter.js
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const STATE_DIR = path.join(os.homedir(), '.claude', 'session-archaeology');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const PENDING_FILE = path.join(STATE_DIR, 'state.json.pending');
const SCAN_OUTPUT_FILE = path.join(STATE_DIR, 'scan-output.txt');

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(file, obj) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

/** Build { sessionId: lastScannedTs } from a state object for filterTranscriptLines. */
function watermarkMapFromState(state) {
  const map = {};
  const sessions = state && state.sessions ? state.sessions : {};
  for (const [sid, entry] of Object.entries(sessions)) {
    if (entry && typeof entry.lastScannedTs === 'string') map[sid] = entry.lastScannedTs;
  }
  return map;
}

/**
 * Extract text from a user or assistant message.content value.
 * Returns null if no keep-worthy text is found.
 *
 * @param {string | Array<{type: string, text?: string}>} content
 * @param {'user' | 'assistant'} role
 * @returns {{ text: string } | null}
 */
function extractText(content, role) {
  // User: string content is direct prose
  if (role === 'user' && typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length > 0 ? { text: trimmed } : null;
  }

  // Array content: concatenate ALL {type:'text'} items, not just the first.
  // Real Claude Code assistant turns interleave text -> tool_use -> text; the
  // trailing text blocks often hold the actual conclusion, next step, or open
  // question. Returning on the first block dropped them and undercut the
  // "bias to recall" guaranteed-catch floor (WR-01). Concatenating also means
  // a leading empty/whitespace block no longer hides real content in a later
  // block (WR-04) — empty items are simply skipped.
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (item && item.type === 'text' && typeof item.text === 'string' && item.text.trim().length > 0) {
        parts.push(item.text.trim());
      }
    }
    return parts.length > 0 ? { text: parts.join('\n\n') } : null;
  }

  return null;
}

/**
 * Pure filter function — deterministic, no side effects, no Date.now().
 * Takes already-parsed JSONL objects and a reference timestamp.
 *
 * @param {object[]} lines - Parsed JSONL objects from one or more .jsonl files.
 * @param {number} nowMs - Reference timestamp in ms (Date.now() from the CLI wrapper).
 *                         The 7-day window cutoff is nowMs - SEVEN_DAYS_MS.
 * @returns {Array<{session_id: string, timestamp: string, role: string, text: string}>}
 */
export function filterTranscriptLines(lines, nowMs, watermarkMap = {}) {
  const cutoffMs = nowMs - SEVEN_DAYS_MS;
  const result = [];

  for (const line of lines) {
    // Step 1: isSidechain exclusion (D-02)
    if (line.isSidechain === true) continue;

    const type = line.type;
    const msg = line.message;
    if (!msg) continue;

    const role = msg.role;
    const content = msg.content;

    // Steps 2-4: content-shape keep rule
    let extracted = null;

    if (type === 'user' && (role === 'user' || role == null)) {
      extracted = extractText(content, 'user');
    } else if (type === 'assistant' && (role === 'assistant' || role == null)) {
      extracted = extractText(content, 'assistant');
    }
    // All other types drop through to null

    if (!extracted) continue;

    // Step 5: content-date window (D-02 — NOT file mtime). Fail closed: a line
    // with no timestamp, a non-string timestamp, or an unparseable string has
    // no usable content-date, so it cannot be proven to fall within the 7-day
    // window — drop it. The previous code kept such lines unconditionally,
    // letting a malformed-timestamp line from weeks ago re-surface its session
    // on every scan and defeat the hard window boundary D-02 relies on (WR-02).
    const ts = line.timestamp;
    if (typeof ts !== 'string') continue; // no usable date -> drop (fail closed)
    const tsMs = Date.parse(ts);
    if (isNaN(tsMs) || tsMs < cutoffMs) continue; // unparseable or stale -> drop

    // Per-session watermark (token dedup): drop messages already scanned in a
    // prior run. Strictly-greater so a message exactly at the watermark is not
    // re-emitted. Sessions absent from the map have no watermark and emit all
    // in-window messages.
    const wmIso = watermarkMap[line.sessionId];
    if (typeof wmIso === 'string') {
      const wmMs = Date.parse(wmIso);
      if (!isNaN(wmMs) && tsMs <= wmMs) continue;
    }

    result.push({
      session_id: line.sessionId || '',
      timestamp: ts || '',
      role: type === 'user' ? 'user' : 'assistant',
      text: extracted.text,
    });
  }

  return result;
}

/**
 * Open-loop signal patterns — two tiers:
 *
 * Tier 1 — park-skill markers: exact phrases emitted by the branch-memory "park"
 *   output template. High precision; no false positives in normal prose.
 *     "Parked."              — first line of every park output
 *     "picks up at"          — from "Next session picks up at:"
 *     "Next session picks up" — header variant
 *     "queued below"         — "Everything else … is queued below"
 *     "what's-next list"     — hyphenated label from park template
 *
 * Tier 2 — semantic GTD / planning language: common open-loop markers in
 *   assistant turns and user planning messages.
 *
 * Case-insensitive. Applied at message level inside filterToOpenLoopRecords.
 */
const OPEN_LOOP_RE =
  /Parked\.|picks up at|Next session picks up|queued below|what's-next list|\bTODO\b|\bFIXME\b|next:\s|\bnext up\b|need to|needs to|will need|still need|open question|open loop|follow.?up|come back to|\brevisit\b|don't forget|remember to|\bnot yet\b|\bpending\b|blocked on|in progress|haven't yet/i;

/**
 * Tier-1 subset of OPEN_LOOP_RE — high-precision park-skill markers with no
 * false positives in normal prose. Used to prefer park output over generic GTD
 * phrases when picking the best signal per session.
 */
const TIER1_RE = /Parked\.|picks up at|Next session picks up|queued below|what's-next list/i;

/**
 * Extract a context window around the first keyword match in `text`.
 * Returns 50 chars before the match start + the match + 100 chars after,
 * with leading/trailing ellipsis when the window is clipped. Falls back to
 * the first 150 chars if no match is found.
 *
 * @param {string} text
 * @param {RegExp} re - The keyword regex (no `g` flag needed).
 * @returns {string}
 */
export function extractKeywordContext(text, re) {
  const match = re.exec(text);
  if (!match) return text.slice(0, 150);
  const mStart = match.index;
  const mEnd = match.index + match[0].length;
  const start = Math.max(0, mStart - 50);
  const end = Math.min(text.length, mEnd + 100);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end) + suffix;
}

/**
 * Tail-truncate a message text to MAX_MSG_CHARS. Kept as a utility export for
 * callers that need the old tail-preserving behaviour (e.g. --no-keyword-filter
 * debug mode in future). The main scan path now uses extractKeywordContext.
 *
 * @param {string} text
 * @returns {string}
 */
const MAX_MSG_CHARS = 200;
export function truncateMessageText(text) {
  if (text.length <= MAX_MSG_CHARS) return text;
  const dropped = text.length - MAX_MSG_CHARS;
  return `[… +${dropped} chars] ` + text.slice(-MAX_MSG_CHARS);
}

/**
 * Structural artifact patterns — records whose text matches these are noise,
 * not open loops, and should be excluded BEFORE the keyword filter runs.
 *
 * - "Base directory for this skill:" — Claude Code skill file injection header.
 *   Every /archaeology (or any skill) invocation injects the full SKILL.md as a
 *   user message; SKILL.md contains dozens of keywords ("need to", "TODO", etc.)
 *   in its own instructions, making every skill session a false positive.
 * - "<command-message>" — Claude Code slash-command invocation XML injected as
 *   a user message; contains no user-authored open-loop content.
 */
const STRUCTURAL_NOISE_RE = /Base directory for this skill:|<command-message>/;

/**
 * Returns true if the given text contains an open-loop signal keyword.
 * Pure function — no I/O, no Date.now().
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasOpenLoopSignal(text) {
  return OPEN_LOOP_RE.test(text);
}

/**
 * Two-level open-loop filter — returns ONE representative signal record per
 * qualifying session (signal manifest mode):
 *
 * Level 1 (session gate) — discard every session where NO message matches
 *   OPEN_LOOP_RE. Typical scans have >80% sessions with no open-loop content;
 *   this eliminates them entirely, preserving repo-grouped structure.
 *
 * Level 2 (best-signal selection) — within qualifying sessions, pick the single
 *   best signal record: Tier-1 park markers win over generic GTD phrases. Within
 *   the same tier, the first encountered record wins. The selected record's text
 *   is replaced with a keyword context snippet (50 chars before + 100 after the
 *   first match) rather than a tail-truncated full message, so the output stays
 *   compact: ~150 chars per session vs 200+ chars per record under the old format.
 *
 * Net effect: ~N sessions (not ~N×k records) feed into groupSessionsByRepo, making
 * probe output fit inline in a single Bash response (~6KB for 40 sessions).
 * Pass --no-keyword-filter to skip this step for debugging.
 *
 * @param {Array<{session_id: string, timestamp: string, role: string, text: string}>} records
 * @returns {Array<{session_id: string, timestamp: string, role: string, text: string}>}
 */
export function filterToOpenLoopRecords(records) {
  // Strip structural artifacts before keyword matching so skill file injections
  // and command invocations don't pollute the signal set.
  const meaningful = records.filter((rec) => !STRUCTURAL_NOISE_RE.test(rec.text));

  // Level 1: find qualifying sessions.
  const qualifyingSessions = new Set();
  for (const rec of meaningful) {
    if (hasOpenLoopSignal(rec.text)) qualifyingSessions.add(rec.session_id);
  }

  // Level 2: pick best signal per qualifying session (Tier-1 > Tier-2 > first).
  // sessionBest maps session_id → { rec, isTier1 }.
  const sessionBest = new Map();
  for (const rec of meaningful) {
    if (!qualifyingSessions.has(rec.session_id) || !hasOpenLoopSignal(rec.text)) continue;
    const isTier1 = TIER1_RE.test(rec.text);
    const existing = sessionBest.get(rec.session_id);
    if (!existing || (isTier1 && !existing.isTier1)) {
      sessionBest.set(rec.session_id, { rec, isTier1 });
    }
  }

  // Emit one record per session with context-extracted text.
  return [...sessionBest.values()].map(({ rec }) => ({
    ...rec,
    text: extractKeywordContext(rec.text, OPEN_LOOP_RE),
  }));
}

/**
 * Given filtered records, return { sessionId: maxIsoTimestamp } — the newest
 * message timestamp seen per session this run. Used to advance the watermark.
 */
export function maxTsPerSession(records) {
  const out = {};
  for (const rec of records) {
    const sid = rec.session_id;
    if (!sid) continue;
    const cur = out[sid];
    if (cur === undefined || Date.parse(rec.timestamp) > Date.parse(cur)) {
      out[sid] = rec.timestamp;
    }
  }
  return out;
}

/**
 * Pure merge: return a new state object with lastScannedTs updated for each
 * sessionId in `sessionIds` that has an entry in `pending`. Does not mutate
 * inputs. State shape: { version, sessions: { [sid]: { lastScannedTs } } }.
 */
export function mergeWatermark(state, pending, sessionIds) {
  const sessions = { ...(state && state.sessions ? state.sessions : {}) };
  for (const sid of sessionIds) {
    const ts = pending ? pending[sid] : undefined;
    if (typeof ts === 'string') {
      sessions[sid] = { ...(sessions[sid] || {}), lastScannedTs: ts };
    }
  }
  return { version: 1, ...(state || {}), sessions };
}

/**
 * Scan raw JSONL line objects and return { [sessionId]: firstCwdSeen }.
 * Runs over raw lines (before filtering) because cwd appears on all
 * message types, including some that filterTranscriptLines drops.
 *
 * @param {object[]} lines - Raw parsed JSONL objects.
 * @returns {Record<string, string>}
 */
export function extractCwdPerSession(lines) {
  const result = {};
  for (const line of lines) {
    const sid = line.sessionId;
    if (!sid) continue;
    if (result[sid] !== undefined) continue; // first cwd wins
    const cwd = line.cwd;
    if (typeof cwd === 'string' && cwd.length > 0) {
      result[sid] = cwd;
    }
  }
  return result;
}

/**
 * Given a cwd path and an existsSync-equivalent function, derive the
 * human-readable repo name and label.
 *
 * @param {string} cwd - Absolute directory path from the JSONL cwd field.
 * @param {(p: string) => boolean} existsSyncFn - Injectable filesystem check.
 * @returns {{ name: string, label: 'Repo' | 'Unattributed' }}
 */
export function deriveRepoLabel(cwd, existsSyncFn) {
  const name = path.basename(cwd.replace(/\/$/, ''));
  const isRepo = existsSyncFn(path.join(cwd.replace(/\/$/, ''), '.git'));
  return { name, label: isRepo ? 'Repo' : 'Unattributed' };
}

/**
 * Return a human-readable age string for a timestamp relative to nowMs.
 * Uses calendar-day distance (UTC date comparison), not 24-hour windows.
 *
 * @param {number} timestampMs - The event time in milliseconds.
 * @param {number} nowMs - Reference "now" in milliseconds.
 * @returns {string} "today" | "yesterday" | "N days ago"
 */
export function formatAge(timestampMs, nowMs) {
  // Use UTC dates to avoid local-timezone boundary surprises.
  const nowDate = new Date(nowMs);
  const tsDate = new Date(timestampMs);
  const nowDay = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
  const tsDay = Date.UTC(tsDate.getUTCFullYear(), tsDate.getUTCMonth(), tsDate.getUTCDate());
  const diffDays = Math.round((nowDay - tsDay) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}

/**
 * Group filtered records by repo, ordered newest-repo-first,
 * sessions newest-first within each repo.
 *
 * @param {Array<{session_id: string, timestamp: string, role: string, text: string}>} records
 * @param {Record<string, string>} cwdMap - { sessionId: cwdPath } from extractCwdPerSession
 * @param {Record<string, string>} sessionDirs - { sessionId: encodedDirname } fallback
 * @param {number} nowMs
 * @param {(p: string) => boolean} existsSyncFn
 * @returns {Array<{label: 'Repo'|'Unattributed', name: string, sessions: object[], newestTimestampMs: number}>}
 */
export function groupSessionsByRepo(records, cwdMap, sessionDirs, nowMs, existsSyncFn) {
  // Build per-session record groups and determine newest timestamp per session.
  const bySession = new Map();
  for (const rec of records) {
    const sid = rec.session_id;
    if (!sid) continue;
    if (!bySession.has(sid)) bySession.set(sid, { records: [], newestTimestampMs: 0 });
    const entry = bySession.get(sid);
    entry.records.push(rec);
    const tsMs = Date.parse(rec.timestamp);
    if (!isNaN(tsMs) && tsMs > entry.newestTimestampMs) entry.newestTimestampMs = tsMs;
  }

  // Map each session to a repo key (prefer cwd, fall back to encoded dirname).
  const repoMap = new Map(); // repoKey → { label, name, sessions[], newestTimestampMs }
  for (const [sid, session] of bySession.entries()) {
    const cwd = cwdMap[sid];
    let label, name;
    if (cwd) {
      const derived = deriveRepoLabel(cwd, existsSyncFn);
      label = derived.label;
      name = derived.name;
    } else {
      label = 'Unattributed';
      name = sessionDirs[sid] || sid;
    }
    const repoKey = `${label}:${name}`;

    if (!repoMap.has(repoKey)) {
      repoMap.set(repoKey, { label, name, sessions: [], newestTimestampMs: 0 });
    }
    const repo = repoMap.get(repoKey);

    // Compute date string and age for this session.
    const tsMs = session.newestTimestampMs;
    const dateStr = new Date(tsMs).toISOString().slice(0, 10);
    const age = formatAge(tsMs, nowMs);

    repo.sessions.push({ sessionId: sid, records: session.records, newestTimestampMs: tsMs, dateStr, age });
    if (tsMs > repo.newestTimestampMs) repo.newestTimestampMs = tsMs;
  }

  // Sort repos newest-first; sessions within each repo newest-first.
  const groups = [...repoMap.values()].sort((a, b) => b.newestTimestampMs - a.newestTimestampMs);
  for (const group of groups) {
    group.sessions.sort((a, b) => b.newestTimestampMs - a.newestTimestampMs);
  }
  return groups;
}

/**
 * Format grouped repo sessions into the human-readable probe output string.
 *
 * @param {Array<{label: 'Repo'|'Unattributed', name: string, sessions: object[]}>} repoGroups
 * @param {number} totalRecords - Total filtered record count this scan.
 * @param {number} totalSessions - Total session count (sum of sessions across all repos).
 * @param {number} totalDirs - Number of project dirs scanned.
 * @returns {string}
 */
export function formatProbeOutput(repoGroups, totalRecords, totalSessions, totalDirs) {
  const parts = [];

  for (const group of repoGroups) {
    const prefix = group.label === 'Repo' ? 'Repo' : 'Unattributed';
    parts.push(`=== ${prefix}: ${group.name} ===`);
    for (const session of group.sessions) {
      const snippet = session.records[0]?.text ?? '';
      parts.push(`  ${session.sessionId} | ${session.dateStr} (${session.age}) | ${snippet}`);
    }
    parts.push('');
  }

  const repoCount = repoGroups.filter((g) => g.label === 'Repo').length;
  const summaryLine = `--- ${totalRecords} signal(s) across ${totalSessions} session(s) in ${repoCount} repo(s) from ${totalDirs} project dir(s) ---`;
  parts.push(summaryLine);

  return parts.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI wrapper — only runs when invoked directly (not when imported).
// Resolves all project transcript dirs, streams .jsonl files, prints filtered
// records grouped by session (newest-first). The skill invokes this inline.
// ---------------------------------------------------------------------------

/**
 * Resolve ALL Claude Code project transcript directories under ~/.claude/projects.
 * Default mode for the global session-archaeology skill: open loops live across
 * every repo Jess works in, not just the cwd she happens to launch from.
 * Still scoped to ~/.claude/projects (no traversal outside the user's own
 * transcript store) — T-05-04 intent preserved at the projects-base boundary.
 */
function resolveAllProjectDirs() {
  const projectsBase = path.join(os.homedir(), '.claude', 'projects');
  const dirs = [];
  try {
    const entries = fs.readdirSync(projectsBase, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(projectsBase, entry.name);
      try {
        if (fs.statSync(full).isDirectory()) dirs.push(full);
      } catch {
        // unreadable / dangling symlink — skip
      }
    }
  } catch {
    // projectsBase unreadable — return empty
  }
  return dirs;
}

/**
 * Stream-read all .jsonl files in a directory, parse each line,
 * skip malformed lines (T-05-05), return array of parsed objects.
 */
function readJsonlDir(dirPath) {
  const lines = [];
  let files = [];
  try {
    files = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(dirPath, f));
  } catch {
    return lines;
  }

  for (const file of files) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        lines.push(JSON.parse(trimmed));
      } catch {
        // T-05-05: skip malformed lines, do not abort
      }
    }
  }
  return lines;
}

// Guard: only execute CLI logic when run directly as main
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // --no-keyword-filter bypasses open-loop pre-filtering (for debugging / full-output mode).
  // Recognised in scan mode only; ignored alongside --reset / --commit.
  const noKeywordFilter = process.argv.includes('--no-keyword-filter');
  // Mode is argv[2] (--reset, --commit, --no-keyword-filter → scan, or absent → scan).
  const arg = process.argv[2];

  if (arg === '--reset') {
    writeJsonFile(STATE_FILE, { version: 1, sessions: {} });
    try {
      fs.unlinkSync(PENDING_FILE);
    } catch {
      // pending file may not exist — fine
    }
    console.log(`Reset watermark state at ${STATE_FILE}`);
    process.exit(0);
  }

  if (arg === '--commit') {
    const ids = (process.argv[3] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      console.error('--commit requires a comma-separated list of session IDs');
      process.exit(1);
    }
    const state = readJsonFile(STATE_FILE, { version: 1, sessions: {} });
    const pending = readJsonFile(PENDING_FILE, null);
    if (!pending || typeof pending !== 'object') {
      console.error(`No pending watermark at ${PENDING_FILE}. Run a scan before --commit.`);
      process.exit(1);
    }
    const missing = ids.filter((sid) => typeof pending[sid] !== 'string');
    if (missing.length) {
      console.error(`Sessions absent from pending (re-run the scan?): ${missing.join(', ')}`);
      process.exit(1);
    }
    const next = mergeWatermark(state, pending, ids);
    writeJsonFile(STATE_FILE, next);
    console.log(`Committed watermark for ${ids.length} session(s).`);
    process.exit(0);
  }

  // Default: scan mode (all projects, watermark-filtered, repo-grouped, newest-first)
  const nowMs = Date.now();
  const dirs = resolveAllProjectDirs();
  if (dirs.length === 0) {
    console.error(`No project dirs found under ${path.join(os.homedir(), '.claude', 'projects')}`);
    process.exit(1);
  }

  const state = readJsonFile(STATE_FILE, { version: 1, sessions: {} });
  const watermarkMap = watermarkMapFromState(state);

  const allLines = [];
  const sessionDirs = {};
  for (const dir of dirs) {
    const lines = readJsonlDir(dir);
    const base = path.basename(dir);
    for (const l of lines) {
      if (l.sessionId && !sessionDirs[l.sessionId]) sessionDirs[l.sessionId] = base;
    }
    allLines.push(...lines);
  }

  // Extract cwd mapping from raw lines BEFORE filtering (cwd appears on all
  // message types, including types that filterTranscriptLines drops).
  const cwdMap = extractCwdPerSession(allLines);

  const filtered = filterTranscriptLines(allLines, nowMs, watermarkMap);

  // Watermark advances from the full filtered set so sessions with no open-loop
  // signal still get their watermark committed on --commit (they are "seen and
  // clean", not "unseen"). Only the output is narrowed by the keyword filter.
  const pending = maxTsPerSession(filtered);
  try {
    writeJsonFile(PENDING_FILE, pending);
  } catch (err) {
    console.error(`Failed to write pending watermark at ${PENDING_FILE}: ${err.message}`);
    process.exit(1);
  }

  // Apply keyword pre-filter unless bypassed. Reduces output from full transcript
  // prose to signal-bearing messages only (park markers + GTD language).
  const signalFiltered = noKeywordFilter ? filtered : filterToOpenLoopRecords(filtered);

  const repoGroups = groupSessionsByRepo(signalFiltered, cwdMap, sessionDirs, nowMs, fs.existsSync);
  const totalSessions = repoGroups.reduce((n, g) => n + g.sessions.length, 0);
  const fullOutput = formatProbeOutput(repoGroups, signalFiltered.length, totalSessions, dirs.length);

  process.stdout.write(fullOutput);

  try {
    fs.writeFileSync(SCAN_OUTPUT_FILE, fullOutput);
  } catch (err) {
    process.stderr.write(`Warning: could not write scan output to ${SCAN_OUTPUT_FILE}: ${err.message}\n`);
  }
}
