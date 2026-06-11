#!/usr/bin/env osascript -l JavaScript
/**
 * THROWAWAY DISCOVERY PROBE — DISC-CAPTURE-01
 * Gate claims (two): (1) new Task(name) + task.note round-trip persists (LINE-01 gate);
 *                    (2) the inbox collection reflects a newly-created task immediately (CAP-01 gate).
 * The note value is a probe-generated session-ID string, not user data.
 *
 * Safety contract: UUID-suffixed name, abort-on-collision, try/finally cleanup (deleteObject),
 * write-then-read-back, returns cleanedUp.
 * Run: osascript -l JavaScript probes/disc-capture-01-inbox-note-roundtrip.js
 */
(() => {
  const app = Application('OmniFocus');
  const inner = `
    (() => {
      const ts = Date.now();
      const probeTaskName = "disc-probe-note-" + ts;
      const sessionId = "SESSION:disc-probe-" + ts;
      const result = {
        probeTaskName: probeTaskName,
        ofVersion: app.version,
        taskCreated: false,
        noteWritten: false,
        noteReadBack: "",
        notePersisted: false,
        inboxReflectsImmediately: false,
        cleanedUp: false
      };
      if (inbox.find(t => t.name === probeTaskName) ||
          flattenedTasks.find(t => t.name === probeTaskName)) {
        return JSON.stringify({ aborted: true, reason: "collision", probeTaskName: probeTaskName });
      }
      let task = null;
      try {
        task = new Task(probeTaskName); // defaults to inbox
        result.taskCreated = true;
        task.note = sessionId;          // SETTER-PATTERNS row 4: scalar string, direct assign
        result.noteWritten = true;
        result.noteReadBack = task.note;
        result.notePersisted = task.note === sessionId;
        result.inboxReflectsImmediately =
          task.inInbox === true && !!inbox.find(t => t.name === probeTaskName);
      } catch (e) {
        result.error = String(e).slice(0, 80);
      } finally {
        try {
          if (task) deleteObject(task);
          result.cleanedUp = !flattenedTasks.find(t => t.name === probeTaskName) &&
                             !inbox.find(t => t.name === probeTaskName);
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
