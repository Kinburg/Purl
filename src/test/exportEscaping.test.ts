import { describe, it, expect } from 'vitest';
import { exportToTwee, defaultValueLiteral, buildObjectLiteral } from '../utils/exportToTwee';
import { makeProject, scene, choice, text } from './fixtures';
import { START_TAG } from '../types';
import type { Block, Variable, VariableTreeNode } from '../types';

// A leaf node usable both as a VariableTreeNode and (structurally) a Variable.
function strVar(id: string, name: string, defaultValue = ''): VariableTreeNode {
  return { kind: 'variable', id, name, varType: 'string', defaultValue, description: '' };
}

describe('exportToTwee — string-literal escaping (scStr)', () => {
  // ── Exported value-literal helpers ────────────────────────────────────────
  it('defaultValueLiteral escapes quotes, backslashes and newlines in string vars', () => {
    // The leaf VariableTreeNode is structurally a Variable for this helper.
    const v = strVar('v', 'x', 'He said "hi"\nand \\ slash') as unknown as Variable;
    const out = defaultValueLiteral(v);
    // Must be a valid JS string literal — round-trips through JSON.parse.
    expect(JSON.parse(out)).toBe('He said "hi"\nand \\ slash');
  });

  it('buildObjectLiteral JSON-quotes keys that are not valid identifiers', () => {
    const grp = {
      kind: 'group', id: 'g', name: 'items',
      children: [strVar('k', 'Tailored Suit', 'x')],
    } as VariableTreeNode;
    const out = buildObjectLiteral(grp as never, [grp]);
    expect(out).toContain('"Tailored Suit":');
  });

  // ── End-to-end: user free-text flowing into generated SugarCube ────────────
  const target = scene('s2', 'Other', [text('t2', 'ok')]);

  it('choice label with a quote produces an escaped <<link>> (not broken markup)', () => {
    const proj = makeProject([
      scene('s1', 'Start', [choice('c', [{ label: 'Say "yes"', target: 's2' }])], [START_TAG]),
      target,
    ]);
    const twee = exportToTwee(proj);
    expect(twee).toContain('<<link "Say \\"yes\\"" "Other">>');
    expect(twee).not.toContain('"Say "yes""'); // the unescaped form would break the macro
  });

  it('string condition value with a quote is escaped inside <<if>>', () => {
    const cond = {
      id: 'cnd', type: 'condition',
      branches: [{ id: 'b0', branchType: 'if', variableId: 'sv', operator: 'eq', value: 'a"b', blocks: [text('x', 'ok')] }],
    } as Block;
    const proj = makeProject(
      [scene('s1', 'Start', [cond], [START_TAG])],
      { variableNodes: [strVar('sv', 'who')] },
    );
    const twee = exportToTwee(proj);
    expect(twee).toContain('"a\\"b"');
    expect(twee).not.toContain('eq "a"b"');
  });

  it('string variable-set value with a quote is escaped inside <<set>>', () => {
    const vset = { id: 'vs', type: 'variable-set', variableId: 'sv', value: 'x"y', operator: '=', valueMode: 'manual' } as Block;
    const proj = makeProject(
      [scene('s1', 'Start', [vset], [START_TAG])],
      { variableNodes: [strVar('sv', 'who')] },
    );
    const twee = exportToTwee(proj);
    expect(twee).toContain('"x\\"y"');
    expect(twee).not.toContain('to "x"y"');
  });

  it('popup title with a quote is escaped inside Dialog.setup', () => {
    const popup = { id: 'pp', type: 'popup', targetSceneId: 's2', title: 'Chapter "2"' } as Block;
    const proj = makeProject([
      scene('s1', 'Start', [popup], [START_TAG]),
      target,
    ]);
    const twee = exportToTwee(proj);
    expect(twee).toContain('Dialog.setup("Chapter \\"2\\"")');
  });
});
