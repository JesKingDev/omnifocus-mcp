#!/usr/bin/env osascript -l JavaScript
/**
 * THROWAWAY DISCOVERY PROBE — DISC-TAG-01
 * Gate claim: does task.addTag(<string>) auto-create an absent Tag, or is a Tag object required?
 *
 * Safety contract (Plan 01-02 probe discipline / threat T-02-*):
 *   - UUID-suffixed object names; ABORT on name collision (never touch user objects)
 *   - try/finally cleanup runs even on exception
 *   - deletes only objects this probe created (matched by the unique probe name)
 *   - write-then-read-back; returns cleanedUp boolean
 * OmniJS-first: all logic runs inside evaluateJavascript (property access, no parens).
 * Run: osascript -l JavaScript probes/disc-tag-01-auto-create.js
 */
(() => {
  const app = Application('OmniFocus');
  const inner = `
    (() => {
      const ts = Date.now();
      const probeTagName = "disc-probe-tag-autocreate-" + ts;
      const probeTaskName = "disc-probe-task-tagac-" + ts;
      const result = {
        probeTagName: probeTagName,
        ofVersion: app.version,
        tagAutoCreateFromString: false,
        addTagViaObjectWorks: false,
        readBackConfirmed: false,
        cleanedUp: false
      };
      // Abort on collision — do not modify objects the probe did not create.
      if (flattenedTags.find(t => t.name === probeTagName) ||
          flattenedTasks.find(t => t.name === probeTaskName)) {
        return JSON.stringify({ aborted: true, reason: "collision", probeTagName: probeTagName });
      }
      let testTask = null;
      try {
        testTask = new Task(probeTaskName); // lands in inbox
        // Attempt 1 — pass a raw string to addTag: does OF auto-create the tag?
        try {
          testTask.addTag(probeTagName);
          result.tagAutoCreateFromString = !!flattenedTags.find(t => t.name === probeTagName);
        } catch (e) {
          result.tagAutoCreateFromString = false;
          result.stringPathError = String(e).slice(0, 60);
        }
        // Attempt 2 — canonical object path: find-or-create Tag, then addTag(tagObject).
        let tag = flattenedTags.find(t => t.name === probeTagName);
        if (!tag) tag = new Tag(probeTagName, null);
        testTask.addTag(tag);
        const names = testTask.tags.map(t => t.name);
        result.addTagViaObjectWorks = names.indexOf(probeTagName) !== -1;
        result.readBackConfirmed = result.addTagViaObjectWorks;
      } catch (e) {
        result.error = String(e).slice(0, 80);
      } finally {
        try {
          if (testTask) deleteObject(testTask);
          const leftoverTag = flattenedTags.find(t => t.name === probeTagName);
          if (leftoverTag) deleteObject(leftoverTag);
          result.cleanedUp = !flattenedTasks.find(t => t.name === probeTaskName) &&
                             !flattenedTags.find(t => t.name === probeTagName);
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
