import './localStorageShim'; // MUST be first — persist adapter reads localStorage on import
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../store/projectStore';
import { makeProject, scene, text, ifBlock, dialogue, tabs } from './fixtures';
import {
  ROOT_CONTAINER, findBlockById, removeBlockById, insertIntoContainer,
  containerAccepts, excludedTypesFor,
} from '../utils/blockTree';
import type { Block } from '../types';

const sectionBlock = (id: string, blocks: Block[] = []): Block =>
  ({ id, type: 'section', blocks } as Block);
const forBlock = (id: string, blocks: Block[] = []): Block =>
  ({ id, type: 'for', mode: 'range', blocks } as Block);
const button = (id: string): Block =>
  ({ id, type: 'button', label: 'B', actions: [], style: {} } as Block);

// ─── Pure tree helpers ──────────────────────────────────────────────────────

describe('blockTree — findBlockById', () => {
  it('finds at root and at every nesting depth', () => {
    const tree: Block[] = [
      text('a', 'A'),
      ifBlock('c', [[text('inIf', 'X')], []]),
      tabs('t', [{ id: 'tab1', blocks: [dialogue('d', [text('inDlg', 'Y')])] }]),
      sectionBlock('sec', [forBlock('f', [text('inFor', 'Z')])]),
    ];
    expect(findBlockById(tree, 'a')?.id).toBe('a');
    expect(findBlockById(tree, 'inIf')?.id).toBe('inIf');   // condition branch
    expect(findBlockById(tree, 'inDlg')?.id).toBe('inDlg'); // tab → dialogue innerBlocks
    expect(findBlockById(tree, 'inFor')?.id).toBe('inFor'); // section → for
    expect(findBlockById(tree, 'nope')).toBeNull();
  });
});

describe('blockTree — removeBlockById', () => {
  it('removes at root and returns the SAME object (id preserved)', () => {
    const a = text('a', 'A');
    const { blocks, removed } = removeBlockById([a, text('b', 'B')], 'a');
    expect(removed).toBe(a);
    expect(blocks.map(b => b.id)).toEqual(['b']);
  });

  it('removes a deeply nested block', () => {
    const tree: Block[] = [ifBlock('c', [[text('a', 'A'), text('b', 'B')], []])];
    const { blocks, removed } = removeBlockById(tree, 'b');
    expect(removed?.id).toBe('b');
    const branch = (findBlockById(blocks, 'c') as any).branches[0];
    expect(branch.blocks.map((x: Block) => x.id)).toEqual(['a']);
  });

  it('missing id ⇒ removed null and the SAME array reference back', () => {
    const tree: Block[] = [text('a', 'A')];
    const res = removeBlockById(tree, 'nope');
    expect(res.removed).toBeNull();
    expect(res.blocks).toBe(tree);
  });

  it('removing a container returns the whole subtree with child ids intact', () => {
    const tree: Block[] = [ifBlock('c', [[text('child', 'X')], []])];
    const { removed } = removeBlockById(tree, 'c');
    expect((removed as any).branches[0].blocks[0].id).toBe('child'); // not regenerated
  });
});

describe('blockTree — insertIntoContainer', () => {
  it('inserts into a condition branch by branch id', () => {
    const tree: Block[] = [ifBlock('c', [[text('a', 'A')], []])];
    const { blocks, ok } = insertIntoContainer(tree, 'c-b0', 1, text('b', 'B'));
    expect(ok).toBe(true);
    expect((findBlockById(blocks, 'c') as any).branches[0].blocks.map((x: Block) => x.id)).toEqual(['a', 'b']);
  });

  it('inserts into a tab (tab id), dialogue/section/for (own block id)', () => {
    expect(insertIntoContainer([tabs('t', [{ id: 'tab1', blocks: [] }])], 'tab1', undefined, text('x', 'X')).ok).toBe(true);
    expect(insertIntoContainer([dialogue('d', [])], 'd', undefined, text('x', 'X')).ok).toBe(true);
    expect(insertIntoContainer([sectionBlock('sec', [])], 'sec', undefined, text('x', 'X')).ok).toBe(true);
    expect(insertIntoContainer([forBlock('f', [])], 'f', undefined, text('x', 'X')).ok).toBe(true);
  });

  it('index undefined appends; out-of-range clamps', () => {
    const { blocks } = insertIntoContainer([sectionBlock('sec', [text('a', 'A')])], 'sec', 99, text('b', 'B'));
    expect((findBlockById(blocks, 'sec') as any).blocks.map((x: Block) => x.id)).toEqual(['a', 'b']);
  });

  it('unknown container ⇒ ok:false', () => {
    expect(insertIntoContainer([text('a', 'A')], 'ghost', 0, text('b', 'B')).ok).toBe(false);
  });
});

describe('blockTree — nesting rules', () => {
  it('every block type nests (Game/Quest/media/plugin included)', () => {
    expect(containerAccepts('scene', 'inventory')).toBe(true);
    expect(containerAccepts('branch', 'inventory')).toBe(true);   // Game
    expect(containerAccepts('branch', 'quest-set')).toBe(true);   // Quest
    expect(containerAccepts('tab', 'plugin')).toBe(true);
    expect(containerAccepts('for', 'image-gen')).toBe(true);
  });
  it('branch/for reject note; tab/section allow it', () => {
    expect(containerAccepts('branch', 'note')).toBe(false);
    expect(containerAccepts('for', 'note')).toBe(false);
    expect(containerAccepts('tab', 'note')).toBe(true);
    expect(containerAccepts('section', 'note')).toBe(true);
  });
  it('dialogue keeps its stricter policy', () => {
    for (const t of ['dialogue', 'condition', 'choice', 'button', 'input-field'] as const) {
      expect(containerAccepts('dialogue', t)).toBe(false);
    }
    expect(containerAccepts('dialogue', 'text')).toBe(true);
    expect(excludedTypesFor('dialogue')).toContain('button');
  });
});

// ─── Store action: moveBlockToContainer ─────────────────────────────────────

const store = () => useProjectStore.getState();
const SID = 's1';
const blocks = (): Block[] => store().project.scenes.find(s => s.id === SID)!.blocks;
const byId = (id: string): any => findBlockById(blocks(), id);
const load = (bs: Block[]) => store().loadProject(makeProject([scene(SID, 'Start', bs, ['start'])]));

beforeEach(() => store().resetProject());

describe('moveBlockToContainer', () => {
  it('moves a root block into an IF branch (id preserved) as one undo step', () => {
    load([text('a', 'A'), ifBlock('c', [[], []])]);
    expect(store().canUndo).toBe(false);
    store().moveBlockToContainer(SID, 'a', { containerId: 'c-b0', kind: 'branch' });
    expect(blocks().map(b => b.id)).toEqual(['c']);              // left the root
    expect(byId('c').branches[0].blocks.map((x: Block) => x.id)).toEqual(['a']); // arrived, id kept
    expect(store().canUndo).toBe(true);
  });

  it('moves a nested block back out to the scene root', () => {
    load([ifBlock('c', [[text('a', 'A')], []])]);
    store().moveBlockToContainer(SID, 'a', { containerId: ROOT_CONTAINER, kind: 'scene', index: 0 });
    expect(blocks().map(b => b.id)).toEqual(['a', 'c']);
    expect(byId('c').branches[0].blocks).toEqual([]);
  });

  it('root reorder via move honors the final index (splice semantics)', () => {
    load([text('a', 'A'), text('b', 'B'), text('c', 'C')]);
    store().moveBlockToContainer(SID, 'a', { containerId: ROOT_CONTAINER, kind: 'scene', index: 2 });
    expect(blocks().map(b => b.id)).toEqual(['b', 'c', 'a']); // a removed → [b,c] → insert at 2
  });

  it('drops into an empty branch (append)', () => {
    load([text('a', 'A'), ifBlock('c', [[], []])]);
    store().moveBlockToContainer(SID, 'a', { containerId: 'c-b1', kind: 'branch' });
    expect(byId('c').branches[1].blocks.map((x: Block) => x.id)).toEqual(['a']);
  });

  it('moves a whole container subtree into a tab, ids intact', () => {
    load([ifBlock('c', [[text('child', 'X')], []]), tabs('t', [{ id: 'tab1', blocks: [] }])]);
    store().moveBlockToContainer(SID, 'c', { containerId: 'tab1', kind: 'tab' });
    expect(blocks().map(b => b.id)).toEqual(['t']);
    const moved = byId('c');
    expect(moved.branches[0].blocks[0].id).toBe('child'); // not deep-cloned
  });

  it('cycle guard: dropping a container into its own descendant is a no-op', () => {
    load([ifBlock('c', [[text('x', 'X')], []])]);
    const before = store().project;
    store().moveBlockToContainer(SID, 'c', { containerId: 'c-b0', kind: 'branch' });
    expect(store().project).toBe(before); // untouched
    expect(store().canUndo).toBe(false);
  });

  it('rejects a type the target refuses (button → dialogue)', () => {
    load([button('btn'), dialogue('d', [])]);
    const before = store().project;
    store().moveBlockToContainer(SID, 'btn', { containerId: 'd', kind: 'dialogue' });
    expect(store().project).toBe(before);
  });

  it('missing block id is a silent no-op', () => {
    load([text('a', 'A')]);
    const before = store().project;
    store().moveBlockToContainer(SID, 'ghost', { containerId: ROOT_CONTAINER, kind: 'scene' });
    expect(store().project).toBe(before);
  });

  it('undo restores the exact pre-move project reference', () => {
    load([text('a', 'A'), ifBlock('c', [[], []])]);
    const before = store().project;
    store().moveBlockToContainer(SID, 'a', { containerId: 'c-b0', kind: 'branch' });
    expect(store().project).not.toBe(before);
    store().undo();
    expect(store().project).toBe(before);
  });
});
