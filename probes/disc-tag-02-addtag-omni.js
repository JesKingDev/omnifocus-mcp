#!/usr/bin/env osascript -l JavaScript
/**
 * THROWAWAY DISCOVERY PROBE — DISC-TAG-02
 * Gate claim: task.addTag(<Tag object>) in OmniJS assigns the tag and it survives read-back
 *   (SETTER-PATTERNS.md row 6 says JXA task.tags = [...] silently no-ops; OmniJS addTag() works).
 *
 * Safety contract identical to disc-tag-01: UUID names, abort-on-collision, try/finally cleanup,
 * deletes only probe-created objects, write-then-read-back, returns cleanedUp.
 * Run: osascript -l JavaScript probes/disc-tag-02-addtag-omni.js
 */
(() => {
  const app = Application('OmniFocus');
  const inner = `
    (() => {
      const ts = Date.now();
      const probeTagName = "disc-probe-tag-omni-" + ts;
      const probeTaskName = "disc-probe-task-omni-" + ts;
      const result = {
        probeTagName: probeTagName,
        ofVersion: app.version,
        addTagViaObjectWorks: false,
        readBackConfirmed: false,
        cleanedUp: false
      };
      if (flattenedTags.find(t => t.name === probeTagName) ||
          flattenedTasks.find(t => t.name === probeTaskName)) {
        return JSON.stringify({ aborted: true, reason: "collision", probeTagName: probeTagName });
      }
      let testTask = null;
      try {
        testTask = new Task(probeTaskName);
        const tag = new Tag(probeTagName, null);
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
