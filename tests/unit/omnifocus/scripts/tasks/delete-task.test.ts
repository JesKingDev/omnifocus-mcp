import { describe, it, expect } from 'vitest';
import { buildDeleteTaskScript } from '../../../../../src/omnifocus/scripts/tasks/delete-task';

describe('buildDeleteTaskScript', () => {
  it('serializes taskId into the script body', () => {
    const script = buildDeleteTaskScript('owner', { taskId: 'abc-123' });
    expect(script).toContain('"taskId":"abc-123"');
  });

  it('emits a JXA IIFE that calls evaluateJavascript with the Task.byIdentifier lookup', () => {
    const script = buildDeleteTaskScript('owner', { taskId: 'x' });
    expect(script).toMatch(/Application\('OmniFocus'\)/);
    expect(script).toContain('Task.byIdentifier(targetId)');
    expect(script).toContain('deleteObject(task)');
    expect(script).toContain('app.evaluateJavascript(deleteScript)');
    expect(script).toContain("formatError(error, 'delete_task')");
  });

  it('escapes taskId values with quotes safely via JSON.stringify', () => {
    const script = buildDeleteTaskScript('owner', { taskId: 'has"quote' });
    expect(script).toContain('"taskId":"has\\"quote"');
  });
});
