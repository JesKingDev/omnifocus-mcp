#!/usr/bin/env osascript -l JavaScript
/**
 * THROWAWAY DISCOVERY PROBE — DISC-PERSP-01
 * Gate claim: does perspective.archivedFilterRules accept a write and round-trip in-session?
 *
 * Target: Option A — the disposable "disc-probe-test-perspective" only (never a real perspective).
 * Method: back up current archivedFilterRules → write the SAME value back (no-op write, proves the
 *   API accepts the call) → read back in-session → restore the original. try/finally guarantees restore.
 * LIMITATION: writing the same value back does NOT prove rule mutation; cross-restart persistence is
 *   explicitly unverified and is resolved at the Plan 04 manual write→quit→reopen→read cycle.
 * Run: osascript -l JavaScript probes/disc-persp-01-filter-rules-persist.js
 */
(() => {
  const app = Application('OmniFocus');
  const inner = `
    (() => {
      const TARGET = "disc-probe-test-perspective";
      const all = Perspective.Custom.all;
      let p = null;
      for (let i = 0; i < all.length; i++) { if (all[i].name === TARGET) { p = all[i]; break; } }
      if (!p) {
        return JSON.stringify({ aborted: true, reason: "test-perspective-not-found", target: TARGET });
      }
      const result = {
        perspectiveName: TARGET,
        perspectiveIdentifier: p.identifier,
        writeAccepted: false,
        immediateReadBackMatch: false,
        originalRestored: false,
        restartPersistenceStatus: "unverified — in-session write confirmed; cross-restart requires manual OF restart",
        ofVersion: app.version
      };
      // Capture backup BEFORE any write.
      const backup = p.archivedFilterRules;
      const backupStr = JSON.stringify(backup);
      try {
        // No-op write: assign the same value back.
        p.archivedFilterRules = backup;
        result.writeAccepted = true;
        // Immediate in-session read-back.
        const readBackStr = JSON.stringify(p.archivedFilterRules);
        result.immediateReadBackMatch = readBackStr === backupStr;
      } catch (e) {
        result.error = String(e).slice(0, 100);
      } finally {
        try {
          p.archivedFilterRules = backup; // restore original
          result.originalRestored = JSON.stringify(p.archivedFilterRules) === backupStr;
        } catch (re) {
          result.restoreError = String(re).slice(0, 100);
          result.originalRestored = false;
        }
      }
      return JSON.stringify(result);
    })()
  `;
  try {
    return app.evaluateJavascript(inner);
  } catch (e) {
    return JSON.stringify({ error: 'outer: ' + e.message });
  }
})();
