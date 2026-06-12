#!/usr/bin/env osascript -l JavaScript
/**
 * THROWAWAY DISCOVERY PROBE — DISC-PERSP-02 (READ-ONLY)
 * Gate claim: Perspective.Custom.all enumerates user custom perspectives; is a "JessOS" perspective present?
 *
 * Read-only: no writes, no cleanup. Returns ONLY sanitized fields — never a names array.
 * Run: osascript -l JavaScript probes/disc-persp-02-custom-all-enumerate.js
 */
(() => {
  const app = Application('OmniFocus');
  const inner = `
    (() => {
      const all = Perspective.Custom.all;
      let jessos = null;
      for (let i = 0; i < all.length; i++) {
        if (String(all[i].name).toLowerCase().indexOf("jessos") !== -1) { jessos = all[i]; break; }
      }
      return JSON.stringify({
        customPerspectiveCount: all.length,
        jessosFound: jessos !== null,
        jessosIdentifier: jessos ? jessos.identifier : null,
        ofVersion: app.version
      });
    })()
  `;
  try {
    return app.evaluateJavascript(inner);
  } catch (e) {
    return JSON.stringify({ error: 'outer: ' + e.message });
  }
})();
