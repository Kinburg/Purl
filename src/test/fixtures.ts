import type { Project, Scene, Block, VariableTreeNode } from '../types';

/** Minimal valid Project around a set of scenes. */
export function makeProject(scenes: Scene[], extra: Partial<Project> = {}): Project {
  return {
    id: 'proj',
    title: 'Test Story',
    ifid: 'TEST-IFID',
    settings: {},
    scenes,
    sceneGroups: [],
    characters: [],
    items: [],
    containers: [],
    variableNodes: [],
    assetNodes: [],
    watchers: [],
    ...extra,
  };
}

export function scene(id: string, name: string, blocks: Block[] = [], tags: string[] = []): Scene {
  return { id, name, tags, blocks };
}

// ── Block factories (only fields the units-under-test read; cast past the rest) ──

export function text(id: string, content: string): Block {
  return { id, type: 'text', content } as Block;
}

export function choice(id: string, opts: Array<{ label?: string; target?: string }>): Block {
  return {
    id,
    type: 'choice',
    options: opts.map((o, i) => ({
      id: `${id}-o${i}`,
      label: o.label ?? 'Go',
      targetSceneId: o.target ?? '',
      condition: '',
    })),
  } as Block;
}

/** Scene link; pass `null` target for a "back" link (no static destination). */
export function link(id: string, target: string | null, label = 'Link'): Block {
  return (target === null
    ? { id, type: 'link', label, target: 'back', actions: [], style: {} }
    : { id, type: 'link', label, target: 'scene', targetSceneId: target, actions: [], style: {} }) as Block;
}

export function ifBlock(id: string, branchBlocks: Block[][]): Block {
  return {
    id,
    type: 'condition',
    branches: branchBlocks.map((blocks, i) => ({
      id: `${id}-b${i}`,
      branchType: i === 0 ? 'if' : 'else',
      variableId: '',
      operator: '==',
      value: '',
      blocks,
    })),
  } as Block;
}

/** Dialogue block with optional inner blocks (the nested block container). */
export function dialogue(id: string, innerBlocks: Block[] = [], characterId = 'c1'): Block {
  return { id, type: 'dialogue', characterId, text: 'hi', innerBlocks } as Block;
}

/** Tabs block; each tab gets an id, label, and its own block container. */
export function tabs(id: string, tabList: Array<{ id: string; label?: string; blocks?: Block[] }>): Block {
  return {
    id,
    type: 'tabs',
    tabs: tabList.map(t => ({ id: t.id, label: t.label ?? 'Tab', blocks: t.blocks ?? [] })),
  } as Block;
}

export function variable(id: string, name: string): VariableTreeNode {
  return { kind: 'variable', id, name, varType: 'number', defaultValue: '0', description: '' };
}

export function group(id: string, name: string, children: VariableTreeNode[]): VariableTreeNode {
  return { kind: 'group', id, name, children };
}
