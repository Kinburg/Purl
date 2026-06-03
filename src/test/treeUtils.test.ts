import { describe, it, expect } from 'vitest';
import { flattenVariables } from '../utils/treeUtils';
import { variable, group } from './fixtures';

describe('flattenVariables', () => {
  it('returns top-level variables', () => {
    const flat = flattenVariables([variable('v1', 'gold')]);
    expect(flat.map(v => v.id)).toEqual(['v1']);
  });

  it('descends into nested groups', () => {
    const nodes = [
      variable('v1', 'gold'),
      group('g1', 'chars', [variable('v2', 'name'), group('g2', 'styles', [variable('v3', 'color')])]),
    ];
    const flat = flattenVariables(nodes);
    expect(flat.map(v => v.id).sort()).toEqual(['v1', 'v2', 'v3']);
  });

  it('returns nothing for an empty tree', () => {
    expect(flattenVariables([])).toHaveLength(0);
  });
});
