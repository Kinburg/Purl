import { describe, it, expect } from 'vitest';
import { exportToTwee } from '../utils/exportToTwee';
import { importFromTweeSource } from '../utils/importFromTwee';
import { collectNavRefs } from '../utils/navTargets';
import { makeProject, scene, choice, text } from './fixtures';
import { START_TAG } from '../types';

function build() {
  return makeProject([
    scene('s1', 'Start', [text('intro', 'Welcome to the test.'), choice('c', [{ label: 'Begin', target: 's2' }])], [START_TAG]),
    scene('s2', 'Other', [text('t2', 'The other scene.')]),
  ]);
}

describe('exportToTwee', () => {
  it('produces a string with a passage header per scene', () => {
    const twee = exportToTwee(build());
    expect(typeof twee).toBe('string');
    expect(twee).toContain('::Start');
    expect(twee).toContain('::Other');
  });
});

describe('twee round-trip (export → import)', () => {
  it('preserves scene names', () => {
    const { project } = importFromTweeSource(exportToTwee(build()));
    const names = project.scenes.map(s => s.name);
    expect(names).toContain('Start');
    expect(names).toContain('Other');
  });

  it('preserves navigation from Start → Other', () => {
    const { project } = importFromTweeSource(exportToTwee(build()));
    const start = project.scenes.find(s => s.name === 'Start');
    expect(start).toBeDefined();
    // Fresh import stores nav targets by scene NAME (migrateSceneLinks resolves
    // name → id only on store load, which this direct call bypasses). Resolve
    // either way so the test asserts navigation, not the id/name representation.
    const idToName = new Map(project.scenes.map(s => [s.id, s.name]));
    const targets = collectNavRefs(start!.blocks).map(r => idToName.get(r.targetId) ?? r.targetId);
    expect(targets).toContain('Other');
  });
});
