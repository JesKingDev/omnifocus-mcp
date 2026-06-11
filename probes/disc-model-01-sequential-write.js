#!/usr/bin/env osascript -l JavaScript
/**
 * THROWAWAY DISCOVERY PROBE — DISC-MODEL-01
 * Gate claim: project.sequential write-back persists (toggle true → false, read back each time).
 *
 * Safety contract: UUID-suffixed name, abort-on-collision, try/finally cleanup, write-then-read-back.
 * Teardown is NON-DESTRUCTIVE — sets the probe project to Project.Status.Dropped (per plan; not a
 * hard delete). The dropped probe project name is returned so it can be manually purged if desired.
 * Run: osascript -l JavaScript probes/disc-model-01-sequential-write.js
 */
(() => {
  const app = Application('OmniFocus');
  const inner = `
    (() => {
      const ts = Date.now();
      const probeProjectName = "disc-probe-sequential-" + ts;
      const result = {
        probeProjectName: probeProjectName,
        ofVersion: app.version,
        initialWrite: false,
        readBack1: false,
        writeBack: false,
        readBack2: false,
        persisted: false,
        cleanedUp: false,
        teardown: "Project.Status.Dropped (non-destructive)"
      };
      if (flattenedProjects.find(p => p.name === probeProjectName)) {
        return JSON.stringify({ aborted: true, reason: "collision", probeProjectName: probeProjectName });
      }
      let proj = null;
      try {
        proj = new Project(probeProjectName);
        proj.sequential = true;          // SETTER-PATTERNS row 4: scalar, direct assign
        result.initialWrite = true;
        result.readBack1 = proj.sequential === true;
        proj.sequential = false;
        result.writeBack = true;
        result.readBack2 = proj.sequential === false;
        result.persisted = result.readBack1 && result.readBack2;
      } catch (e) {
        result.error = String(e).slice(0, 80);
      } finally {
        try {
          if (proj) proj.status = Project.Status.Dropped; // SETTER-PATTERNS row 3 (enum, OmniJS)
          result.cleanedUp = !!proj && proj.status === Project.Status.Dropped;
        } catch (ce) {
          result.cleanupError = String(ce).slice(0, 80);
          result.cleanedUp = false;
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
