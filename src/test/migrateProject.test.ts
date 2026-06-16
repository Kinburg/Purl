import { describe, it, expect } from 'vitest';
import { migrateProject, isProjectFile } from '../store/migrateProject';

describe('migrateProject — backfill', () => {
  it('backfills missing collections and settings on a partial project', () => {
    const p = migrateProject({ scenes: [], title: 'P' });
    expect(p.characters).toEqual([]);
    expect(p.items).toEqual([]);
    expect(p.containers).toEqual([]);
    expect(p.watchers).toEqual([]);
    expect(p.variableNodes).toEqual([]);
    expect(p.assetNodes).toEqual([]);
    expect(p.settings).toEqual({});
  });

  it('coerces garbage input to a safe project without throwing', () => {
    expect(() => migrateProject(null)).not.toThrow();
    expect(() => migrateProject('nope')).not.toThrow();
    expect(() => migrateProject(42)).not.toThrow();
    expect(migrateProject(undefined).scenes).toEqual([]);
  });
});

describe('migrateProject — legacy field migration', () => {
  it('renames legacy `variables` → `variableNodes` and drops the old key', () => {
    const p = migrateProject({
      scenes: [{ id: 's', name: 'Start', tags: ['start'], blocks: [] }],
      variables: [{ id: 'v', name: 'gold', varType: 'number', defaultValue: '0', description: '' }],
    });
    expect(p.variableNodes).toHaveLength(1);
    expect((p as { variables?: unknown }).variables).toBeUndefined();
  });

  it('renames a title scene from legacy StoryTitle → StoryDisplayTitle', () => {
    const p = migrateProject({
      scenes: [{ id: 't', name: 'StoryTitle', tags: ['title'], blocks: [] }],
    });
    expect(p.scenes.find(s => s.tags.includes('title'))?.name).toBe('StoryDisplayTitle');
  });
});

describe('migrateProject — idempotency', () => {
  it('migrate(migrate(x)) deep-equals migrate(x)', () => {
    const once = migrateProject({
      scenes: [{ id: 's', name: 'Start', tags: ['start'], blocks: [] }],
      title: 'Story',
      variables: [{ id: 'v', name: 'gold', varType: 'number', defaultValue: '0', description: '' }],
    });
    const twice = migrateProject(structuredClone(once));
    expect(twice).toEqual(once);
  });
});

describe('isProjectFile (re-exported through the migrateProject module)', () => {
  it('accepts a plain object with a scenes array, rejects everything else', () => {
    expect(isProjectFile({ scenes: [] })).toBe(true);
    expect(isProjectFile({})).toBe(false);
    expect(isProjectFile(null)).toBe(false);
    expect(isProjectFile([])).toBe(false);
  });
});
