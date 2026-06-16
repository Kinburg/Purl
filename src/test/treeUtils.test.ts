import { describe, it, expect } from 'vitest';
import {
  flattenVariables,
  removeNode, addNode, getSiblings, ensureUniqueName, updateVarInTree, updateGroupNameInTree,
  updateChildPaths, renameGroupInAssetTree,
} from '../utils/treeUtils';
import { variable, group } from './fixtures';
import type { AssetTreeNode } from '../types';

const assetGroup = (id: string, name: string, relativePath: string, children: AssetTreeNode[]): AssetTreeNode =>
  ({ kind: 'group', id, name, relativePath, children }) as AssetTreeNode;
const asset = (id: string, name: string, relativePath: string): AssetTreeNode =>
  ({ kind: 'asset', id, name, relativePath }) as AssetTreeNode;

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

describe('removeNode', () => {
  it('removes a top-level node and leaves siblings intact', () => {
    const nodes = [variable('v1', 'gold'), variable('v2', 'silver')];
    expect(removeNode(nodes, 'v1').map(n => n.id)).toEqual(['v2']);
  });

  it('removes a nested node deep inside groups', () => {
    const nodes = [group('g1', 'chars', [variable('v2', 'name'), group('g2', 'styles', [variable('v3', 'color')])])];
    expect(flattenVariables(removeNode(nodes, 'v3')).map(v => v.id)).toEqual(['v2']);
  });

  it('removing an entire group drops its subtree', () => {
    const nodes = [variable('v1', 'gold'), group('g1', 'chars', [variable('v2', 'name')])];
    const out = removeNode(nodes, 'g1');
    expect(out.map(n => n.id)).toEqual(['v1']);
  });

  it('does not mutate the input array', () => {
    const nodes = [variable('v1', 'gold'), variable('v2', 'silver')];
    removeNode(nodes, 'v1');
    expect(nodes.map(n => n.id)).toEqual(['v1', 'v2']);
  });
});

describe('addNode', () => {
  it('appends at the root when parentId is null', () => {
    const nodes = [variable('v1', 'gold')];
    expect(addNode(nodes, null, variable('v2', 'silver')).map(n => n.id)).toEqual(['v1', 'v2']);
  });

  it('inserts into a target group by id', () => {
    const nodes = [group('g1', 'chars', [variable('v2', 'name')])];
    const out = addNode(nodes, 'g1', variable('v3', 'color'));
    expect(flattenVariables(out).map(v => v.id).sort()).toEqual(['v2', 'v3']);
  });

  it('inserts into a deeply nested group', () => {
    const nodes = [group('g1', 'chars', [group('g2', 'styles', [variable('v3', 'color')])])];
    const out = addNode(nodes, 'g2', variable('v4', 'size'));
    expect(flattenVariables(out).map(v => v.id).sort()).toEqual(['v3', 'v4']);
  });
});

describe('getSiblings', () => {
  it('returns root nodes when parentId is null', () => {
    const nodes = [variable('v1', 'gold'), variable('v2', 'silver')];
    expect(getSiblings(nodes, null).map(n => n.id)).toEqual(['v1', 'v2']);
  });

  it('returns the children of a group by id', () => {
    const nodes = [group('g1', 'chars', [variable('v2', 'name'), variable('v3', 'color')])];
    expect(getSiblings(nodes, 'g1').map(n => n.id)).toEqual(['v2', 'v3']);
  });
});

describe('ensureUniqueName', () => {
  it('returns the name unchanged when there is no conflict', () => {
    expect(ensureUniqueName('gold', [variable('v1', 'silver')])).toBe('gold');
  });

  it('appends 2 on first conflict', () => {
    expect(ensureUniqueName('gold', [variable('v1', 'gold')])).toBe('gold2');
  });

  it('skips to the next free numeric suffix', () => {
    const siblings = [variable('v1', 'gold'), variable('v2', 'gold2'), variable('v3', 'gold3')];
    expect(ensureUniqueName('gold', siblings)).toBe('gold4');
  });
});

describe('updateVarInTree', () => {
  it('patches a top-level variable by id', () => {
    const nodes = [variable('v1', 'gold')];
    const out = updateVarInTree(nodes, 'v1', { defaultValue: '99' });
    expect(flattenVariables(out)[0].defaultValue).toBe('99');
  });

  it('patches a nested variable and leaves others untouched', () => {
    const nodes = [group('g1', 'chars', [variable('v2', 'name'), variable('v3', 'color')])];
    const out = updateVarInTree(nodes, 'v3', { name: 'colour' });
    const flat = flattenVariables(out);
    expect(flat.find(v => v.id === 'v3')?.name).toBe('colour');
    expect(flat.find(v => v.id === 'v2')?.name).toBe('name');
  });
});

describe('updateGroupNameInTree', () => {
  it('renames a top-level group by id', () => {
    const nodes = [group('g1', 'chars', [variable('v1', 'name')])];
    const out = updateGroupNameInTree(nodes, 'g1', 'people');
    expect(out[0].name).toBe('people');
  });

  it('renames a nested group and leaves the variable leaf untouched', () => {
    const nodes = [group('g1', 'chars', [group('g2', 'styles', [variable('v1', 'color')])])];
    const out = updateGroupNameInTree(nodes, 'g2', 'theme');
    const g1 = out[0];
    if (g1.kind !== 'group') throw new Error('expected group');
    const g2 = g1.children[0];
    expect(g2.kind === 'group' && g2.name).toBe('theme');
    expect(flattenVariables(out)[0].name).toBe('color');
  });

  it('leaves the tree unchanged when no group matches', () => {
    const nodes = [group('g1', 'chars', [variable('v1', 'name')])];
    expect(updateGroupNameInTree(nodes, 'nope', 'x')[0].name).toBe('chars');
  });
});

describe('updateChildPaths', () => {
  it('rebases relativePath prefixes across a subtree', () => {
    const nodes = [
      asset('a1', 'pic.png', 'assets/Old/pic.png'),
      assetGroup('g1', 'sub', 'assets/Old/sub', [asset('a2', 'x.png', 'assets/Old/sub/x.png')]),
    ];
    const out = updateChildPaths(nodes, 'assets/Old', 'assets/New');
    expect(out[0].relativePath).toBe('assets/New/pic.png');
    const g = out[1];
    expect(g.relativePath).toBe('assets/New/sub');
    if (g.kind === 'group') expect(g.children[0].relativePath).toBe('assets/New/sub/x.png');
  });
});

describe('renameGroupInAssetTree', () => {
  it('renames the target group and rebases its descendants', () => {
    const nodes = [assetGroup('g1', 'Old', 'assets/Old', [asset('a1', 'x.png', 'assets/Old/x.png')])];
    const out = renameGroupInAssetTree(nodes, 'g1', 'New', 'assets/Old', 'assets/New');
    const g = out[0];
    expect(g.name).toBe('New');
    expect(g.relativePath).toBe('assets/New');
    if (g.kind === 'group') expect(g.children[0].relativePath).toBe('assets/New/x.png');
  });

  it('recurses into nested groups to find the target', () => {
    const nodes = [assetGroup('root', 'Root', 'assets', [assetGroup('g2', 'Inner', 'assets/Inner', [])])];
    const out = renameGroupInAssetTree(nodes, 'g2', 'Renamed', 'assets/Inner', 'assets/Renamed');
    const root = out[0];
    if (root.kind !== 'group') throw new Error('expected group');
    expect(root.children[0].name).toBe('Renamed');
    expect(root.children[0].relativePath).toBe('assets/Renamed');
  });

  it('leaves the tree unchanged when no group id matches', () => {
    const nodes = [assetGroup('g1', 'Old', 'assets/Old', [])];
    expect(renameGroupInAssetTree(nodes, 'nope', 'X', 'a', 'b')[0].name).toBe('Old');
  });
});
