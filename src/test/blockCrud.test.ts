import './localStorageShim'; // MUST be first — persist adapter reads localStorage on import
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../store/projectStore';
import { makeProject, scene, text, ifBlock, dialogue, tabs } from './fixtures';
import type { Block } from '../types';

// Characterization tests: lock the CURRENT behavior of all 4 block-CRUD families
// (scene / condition-branch / dialogue-inner / tabs-nested) and the cross-cutting
// quirks (snapshot asymmetry, clone-vs-as-is insert, idx+1 duplicate placement,
// insertIndex semantics, replaceBlock variableNodes side-effect, type-guard no-ops)
// BEFORE the BlockPath generalization, so the refactor is provably behavior-preserving.

const store = () => useProjectStore.getState();
const SID = 's1';

beforeEach(() => store().resetProject());

const blocks = (): Block[] => store().project.scenes.find(s => s.id === SID)!.blocks;
const byId = (id: string): any => blocks().find(b => b.id === id);
const load = (bs: Block[]) => store().loadProject(makeProject([scene(SID, 'Start', bs, ['start'])]));

describe('scene top-level block CRUD', () => {
  it('addBlock appends without insertIndex and inserts the SAME object (no clone)', () => {
    load([text('a', 'A')]);
    const b = text('b', 'B');
    store().addBlock(SID, b);
    expect(blocks().map(x => x.id)).toEqual(['a', 'b']);
    expect(blocks()[1]).toBe(b); // inserted by reference, not cloned
  });

  it('addBlock with insertIndex 0 inserts at head', () => {
    load([text('a', 'A')]);
    store().addBlock(SID, text('b', 'B'), 0);
    expect(blocks().map(x => x.id)).toEqual(['b', 'a']);
  });

  it('updateBlock shallow-merges patch and does NOT take a snapshot (not undoable)', () => {
    load([text('a', 'A')]);
    expect(store().canUndo).toBe(false);
    store().updateBlock(SID, 'a', { content: 'A2' } as Partial<Block>);
    expect(byId('a').content).toBe('A2');
    expect(store().canUndo).toBe(false); // no snapshot for high-frequency edits
  });

  it('deleteBlock removes by id and DOES take a snapshot', () => {
    load([text('a', 'A'), text('b', 'B')]);
    store().deleteBlock(SID, 'a');
    expect(blocks().map(x => x.id)).toEqual(['b']);
    expect(store().canUndo).toBe(true);
  });

  it('deleteBlock on a missing id is a silent no-op', () => {
    load([text('a', 'A')]);
    store().deleteBlock(SID, 'nope');
    expect(blocks().map(x => x.id)).toEqual(['a']);
  });

  it('reorderBlocks replaces the array wholesale', () => {
    load([text('a', 'A'), text('b', 'B')]);
    store().reorderBlocks(SID, [byId('b'), byId('a')]);
    expect(blocks().map(x => x.id)).toEqual(['b', 'a']);
  });

  it('duplicateBlock places a fresh-id clone immediately after the source', () => {
    load([text('a', 'A'), text('b', 'B')]);
    store().duplicateBlock(SID, 'a');
    const ids = blocks().map(x => x.id);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe('a');
    expect(ids[1]).not.toBe('a'); // fresh uuid
    expect(ids[2]).toBe('b');
    expect(blocks()[1].content).toBe('A'); // value preserved
  });

  it('pasteToScene inserts a CLONE (fresh id) — unlike addBlock', () => {
    load([text('a', 'A')]);
    const clip = text('a', 'A'); // same id as existing on purpose
    store().pasteToScene(SID, clip);
    expect(blocks()).toHaveLength(2);
    expect(blocks()[1].id).not.toBe('a'); // cloned with a new id
    expect(blocks()[1]).not.toBe(clip);
  });

  it('replaceBlock swaps one block for N and replaces variableNodes only when provided', () => {
    load([text('a', 'A'), text('b', 'B')]);
    store().replaceBlock(SID, 'a', [text('x', 'X'), text('y', 'Y')]);
    expect(blocks().map(z => z.id)).toEqual(['x', 'y', 'b']);
    expect(store().project.variableNodes).toEqual([]); // omitted → unchanged

    store().replaceBlock(SID, 'x', [text('z', 'Z')], [
      { kind: 'variable', id: 'v', name: 'gold', varType: 'number', defaultValue: '0', description: '' },
    ]);
    expect(store().project.variableNodes).toHaveLength(1); // provided → replaced
  });
});

describe('condition-branch nested block CRUD', () => {
  // ifBlock('c', [[if-blocks], [else-blocks]]) → branches c-b0 (if), c-b1 (else)
  const branchBlocks = (branchId: string): Block[] =>
    byId('c').branches.find((br: any) => br.id === branchId).blocks;

  it('addNestedBlock appends (uncloned) to the target branch', () => {
    load([ifBlock('c', [[text('a', 'A')], []])]);
    const b = text('b', 'B');
    store().addNestedBlock(SID, 'c', 'c-b0', b);
    expect(branchBlocks('c-b0').map(x => x.id)).toEqual(['a', 'b']);
    expect(branchBlocks('c-b0')[1]).toBe(b);
  });

  it('updateNestedBlock merges patch and does NOT snapshot', () => {
    load([ifBlock('c', [[text('a', 'A')], []])]);
    store().updateNestedBlock(SID, 'c', 'c-b0', 'a', { content: 'A2' } as Partial<Block>);
    expect(branchBlocks('c-b0')[0].content).toBe('A2');
    expect(store().canUndo).toBe(false);
  });

  it('deleteNestedBlock removes from the branch', () => {
    load([ifBlock('c', [[text('a', 'A'), text('b', 'B')], []])]);
    store().deleteNestedBlock(SID, 'c', 'c-b0', 'a');
    expect(branchBlocks('c-b0').map(x => x.id)).toEqual(['b']);
  });

  it('reorderNestedBlocks replaces the branch array wholesale', () => {
    load([ifBlock('c', [[text('a', 'A'), text('b', 'B')], []])]);
    store().reorderNestedBlocks(SID, 'c', 'c-b0', [branchBlocks('c-b0')[1], branchBlocks('c-b0')[0]]);
    expect(branchBlocks('c-b0').map(x => x.id)).toEqual(['b', 'a']);
  });

  it('duplicateNestedBlock clones at idx+1; pasteToNested appends a clone', () => {
    load([ifBlock('c', [[text('a', 'A'), text('b', 'B')], []])]);
    store().duplicateNestedBlock(SID, 'c', 'c-b0', 'a');
    let ids = branchBlocks('c-b0').map(x => x.id);
    expect(ids[0]).toBe('a');
    expect(ids[1]).not.toBe('a');
    expect(ids[2]).toBe('b');

    store().pasteToNested(SID, 'c', 'c-b0', text('p', 'P'));
    ids = branchBlocks('c-b0').map(x => x.id);
    expect(ids).toHaveLength(4);
    expect(ids[3]).not.toBe('p'); // appended as a clone with a new id
  });

  it('addNestedBlock on a non-condition block is a silent no-op (type guard)', () => {
    load([text('t', 'T')]);
    store().addNestedBlock(SID, 't', 'whatever', text('b', 'B'));
    expect(blocks().map(x => x.id)).toEqual(['t']); // unchanged
  });
});

describe('dialogue inner-block CRUD', () => {
  const inner = (): Block[] => byId('d').innerBlocks ?? [];

  it('addDialogueInnerBlock appends, even when innerBlocks was undefined', () => {
    load([{ id: 'd', type: 'dialogue', characterId: 'c1', text: 'hi' } as Block]); // no innerBlocks field
    store().addDialogueInnerBlock(SID, 'd', text('a', 'A'));
    expect(inner().map(x => x.id)).toEqual(['a']);
  });

  it('updateDialogueInnerBlock merges and does NOT snapshot; delete + reorder work', () => {
    load([dialogue('d', [text('a', 'A'), text('b', 'B')])]);
    store().updateDialogueInnerBlock(SID, 'd', 'a', { content: 'A2' } as Partial<Block>);
    expect(inner()[0].content).toBe('A2');
    expect(store().canUndo).toBe(false);

    store().reorderDialogueInnerBlocks(SID, 'd', [inner()[1], inner()[0]]);
    expect(inner().map(x => x.id)).toEqual(['b', 'a']);

    store().deleteDialogueInnerBlock(SID, 'd', 'b');
    expect(inner().map(x => x.id)).toEqual(['a']);
  });
});

describe('tabs nested block CRUD', () => {
  const tabBlocks = (tabId: string): Block[] =>
    byId('t').tabs.find((tb: any) => tb.id === tabId).blocks;

  it('updateBlockInTab merges and does NOT snapshot (checked in isolation)', () => {
    load([tabs('t', [{ id: 'tab1', blocks: [text('a', 'A')] }])]);
    expect(store().canUndo).toBe(false);
    store().updateBlockInTab(SID, 't', 'tab1', 'a', { content: 'A2' } as Partial<Block>);
    expect(tabBlocks('tab1')[0].content).toBe('A2');
    expect(store().canUndo).toBe(false); // update* never snapshots
  });

  it('addBlockToTab / delete / reorder / duplicate', () => {
    load([tabs('t', [{ id: 'tab1', blocks: [text('a', 'A')] }, { id: 'tab2' }])]);

    store().addBlockToTab(SID, 't', 'tab1', text('b', 'B'));
    expect(tabBlocks('tab1').map(x => x.id)).toEqual(['a', 'b']);

    store().reorderBlocksInTab(SID, 't', 'tab1', [tabBlocks('tab1')[1], tabBlocks('tab1')[0]]);
    expect(tabBlocks('tab1').map(x => x.id)).toEqual(['b', 'a']);

    store().duplicateBlockInTab(SID, 't', 'tab1', 'b');
    const ids = tabBlocks('tab1').map(x => x.id);
    expect(ids[0]).toBe('b');
    expect(ids[1]).not.toBe('b'); // clone at idx+1
    expect(ids[2]).toBe('a');

    store().deleteBlockFromTab(SID, 't', 'tab1', 'a');
    expect(tabBlocks('tab1').map(x => x.id)).not.toContain('a');
  });
});

describe('cross-cutting: undo restores the exact pre-mutation project reference', () => {
  it('a snapshot-taking mutation is undoable to the previous reference', () => {
    load([text('a', 'A')]);
    const before = store().project;
    store().addBlock(SID, text('b', 'B'));
    expect(store().project).not.toBe(before);
    store().undo();
    expect(store().project).toBe(before); // structural sharing — exact reference
  });
});

// Contract edge cases surfaced by the adversarial completeness critic — these were
// behaviorally equivalent old↔new but unasserted; lock them so the contract is explicit.
describe('contract edge cases', () => {
  it('no-op replaceBlock/duplicateBlock preserves the scene OBJECT identity (still snapshots)', () => {
    load([text('a', 'A')]);
    const sc0 = store().project.scenes[0];
    store().replaceBlock(SID, 'MISSING', [text('x', 'X')]);
    expect(store().project.scenes[0]).toBe(sc0); // container identity preserved on no-op
    expect(store().canUndo).toBe(true);          // snapshot still taken

    store().resetProject();
    load([text('a', 'A')]);
    const sc1 = store().project.scenes[0];
    store().duplicateBlock(SID, 'MISSING');
    expect(store().project.scenes[0]).toBe(sc1);
  });

  it('addBlock insertIndex obeys Array.splice for middle / out-of-range / negative', () => {
    load([text('a', 'A'), text('b', 'B'), text('c', 'C')]);
    store().addBlock(SID, text('m', 'M'), 1);
    expect(blocks().map(x => x.id)).toEqual(['a', 'm', 'b', 'c']);
    store().addBlock(SID, text('hi', 'HI'), 99); // out of range → appends
    expect(blocks()[blocks().length - 1].id).toBe('hi');
    store().addBlock(SID, text('neg', 'N'), -1); // negative → inserts before last (splice)
    const ids = blocks().map(x => x.id);
    expect(ids[ids.length - 2]).toBe('neg');
  });

  it('replaceBlock with an empty array deletes the target in place', () => {
    load([text('a', 'A'), text('b', 'B')]);
    store().replaceBlock(SID, 'a', []);
    expect(blocks().map(x => x.id)).toEqual(['b']);
  });

  it('replaceBlock distinguishes newVariableNodes=[] (replaces) from undefined (leaves)', () => {
    store().loadProject(makeProject([scene(SID, 'Start', [text('a', 'A')], ['start'])], {
      variableNodes: [{ kind: 'variable', id: 'v', name: 'gold', varType: 'number', defaultValue: '0', description: '' }],
    }));
    store().replaceBlock(SID, 'a', [text('x', 'X')]); // omitted → variableNodes unchanged
    expect(store().project.variableNodes).toHaveLength(1);
    store().replaceBlock(SID, 'x', [text('y', 'Y')], []); // [] !== undefined → replaces with empty
    expect(store().project.variableNodes).toEqual([]);
  });

  it('type guards make wrong-family actions on the wrong block a silent no-op', () => {
    load([text('t', 'T'), ifBlock('c', [[text('a', 'A')], []])]);
    store().addDialogueInnerBlock(SID, 'c', text('x', 'X')); // condition block, not dialogue
    expect((byId('c') as any).innerBlocks).toBeUndefined();
    store().addBlockToTab(SID, 't', 'tab', text('x', 'X'));   // text block, not tabs
    expect((byId('t') as any).tabs).toBeUndefined();
    store().reorderNestedBlocks(SID, 't', 'b', [text('z', 'Z')]); // text block, not condition
    expect(byId('t').type).toBe('text');
  });

  it('duplicateBlock deep-clones a condition block: nested branch + inner ids all regenerate', () => {
    load([ifBlock('c', [[text('a', 'A')], []])]);
    store().duplicateBlock(SID, 'c');
    const clone: any = blocks()[1];
    expect(clone.id).not.toBe('c');
    expect(clone.branches[0].id).not.toBe('c-b0');         // branch id regenerated
    expect(clone.branches[0].blocks[0].id).not.toBe('a');  // nested block id regenerated
    expect(clone.branches[0].blocks[0].content).toBe('A'); // value preserved
  });
});
