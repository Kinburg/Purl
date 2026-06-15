import './localStorageShim'; // MUST be first — store's persist adapter reads localStorage on import
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore, isProjectFile } from '../store/projectStore';
import { makeProject, scene } from './fixtures';

const store = () => useProjectStore.getState();

beforeEach(() => {
  store().resetProject(); // clean baseline: default project, empty history
});

describe('isProjectFile — load-boundary guard', () => {
  it('accepts a plain object with a scenes array', () => {
    expect(isProjectFile({ scenes: [] })).toBe(true);
    expect(isProjectFile(makeProject([scene('s', 'Start', [])]))).toBe(true);
  });

  it('rejects non-objects, arrays, and shapes without a scenes array', () => {
    expect(isProjectFile(null)).toBe(false);
    expect(isProjectFile('{}')).toBe(false);
    expect(isProjectFile(42)).toBe(false);
    expect(isProjectFile([])).toBe(false);
    expect(isProjectFile({ title: 'x' })).toBe(false);     // no scenes
    expect(isProjectFile({ scenes: 'nope' })).toBe(false); // scenes not an array
  });
});

describe('loadProject — defensive migration', () => {
  it('coerces a partial project file without throwing and backfills collections', () => {
    expect(() => store().loadProject({ scenes: [], title: 'Partial' } as never)).not.toThrow();
    const p = store().project;
    expect(p.title).toBe('Partial');
    expect(p.characters).toEqual([]);
    expect(p.items).toEqual([]);
    expect(p.containers).toEqual([]);
    expect(p.watchers).toEqual([]);
    expect(p.variableNodes).toEqual([]);
  });

  it('migrates legacy `variables` → `variableNodes` and is idempotent', () => {
    const legacy = {
      scenes: [{ id: 's', name: 'Start', tags: ['start'], blocks: [] }],
      title: 'Legacy',
      variables: [{ id: 'v', name: 'gold', varType: 'number', defaultValue: '0', description: '' }],
    };
    store().loadProject(legacy as never);
    const once = structuredClone(store().project);
    expect(once.variableNodes).toHaveLength(1);
    expect((once as { variables?: unknown }).variables).toBeUndefined();

    // migrate(migrate(x)) must deep-equal migrate(x) — re-loading an already-migrated
    // project must be a no-op, or every reopen silently drifts the saved file.
    store().loadProject(structuredClone(once) as never);
    expect(store().project).toEqual(once);
  });
});

describe('undo / redo', () => {
  it('round-trips a structural edit and toggles canUndo/canRedo', () => {
    store().loadProject(makeProject([scene('s1', 'Start', [], ['start'])]));
    const before = store().project;
    expect(store().canUndo).toBe(false);

    store().addScene();
    expect(store().project.scenes).toHaveLength(2);
    expect(store().canUndo).toBe(true);

    store().undo();
    // Structural sharing: undo restores the exact previous object reference.
    expect(store().project).toBe(before);
    expect(store().project.scenes).toHaveLength(1);
    expect(store().canRedo).toBe(true);

    store().redo();
    expect(store().project.scenes).toHaveLength(2);
    expect(store().canRedo).toBe(false);
  });

  it('saveSnapshot dedupes by reference (no snapshot when project is unchanged)', () => {
    store().loadProject(makeProject([scene('s1', 'Start', [])]));
    store().saveSnapshot();
    store().saveSnapshot(); // project ref unchanged → second call is a no-op
    expect(store().canUndo).toBe(true);
    store().undo();
    expect(store().canUndo).toBe(false); // exactly one snapshot existed
  });
});
