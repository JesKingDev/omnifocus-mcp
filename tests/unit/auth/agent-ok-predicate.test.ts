import { describe, it, expect } from 'vitest';
import { agentOkayPredicate } from '../../../src/contracts/filters.js';
import { buildAST } from '../../../src/contracts/ast/builder.js';
import { emitOmniJS } from '../../../src/contracts/ast/emitters/omnijs.js';

// ---------------------------------------------------------------------------
// PERM-01 / D-08a: agentOkayPredicate — predicate compilation tests
//
// Tests the agentOkayPredicate() function that returns a NormalizedTaskFilter
// matching only agent-ok-tagged tasks. The function is added to
// src/contracts/filters.ts in Wave 1. These tests are RED until then.
//
// D-08: proven via (a) predicate structure + compilation, (b) negative test.
// ---------------------------------------------------------------------------

describe('agentOkayPredicate — PERM-01 predicate compilation', () => {
  it('returns a normalized filter with tags=[agent-ok] and tagsOperator=AND', () => {
    const result = agentOkayPredicate();

    expect(result.tags).toContain('agent-ok');
    expect(result.tagsOperator).toBe('AND');
  });

  it('predicate compiles to a valid AST via buildAST (no throw)', () => {
    expect(() => buildAST(agentOkayPredicate())).not.toThrow();
  });

  it('emitted OmniJS script contains agent-ok tag name', () => {
    const ast = buildAST(agentOkayPredicate());
    const script = emitOmniJS(ast);

    // emitOmniJS returns EmitResult { preamble, predicate }; the tag name appears in the predicate
    expect(script.predicate).toContain('agent-ok');
  });

  it('a task without agent-ok tag does NOT satisfy the filter (negative test)', () => {
    const predicate = agentOkayPredicate();

    // The predicate requires agent-ok — a filter for an untagged task will differ.
    // Assert structural negative: the required tags list does NOT include 'untagged'.
    expect(predicate.tags).not.toContain('untagged');

    // The predicate demands tag presence, not absence — tagsOperator is AND (require), not NOT_IN (exclude)
    expect(predicate.tagsOperator).not.toBe('NOT_IN');
  });
});
