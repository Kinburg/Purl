import { describe, it, expect } from 'vitest';
import { exportToTwee } from '../utils/exportToTwee';
import { importFromTweeSource } from '../utils/importFromTwee';
import { collectNavRefs } from '../utils/navTargets';
import { makeProject, scene, choice, text } from './fixtures';
import { START_TAG } from '../types';
import type { QuestDefinition, Block } from '../types';

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

describe('quest blocks export', () => {
  const quest: QuestDefinition = {
    id: 'q1', name: 'Main', varName: 'mainQuest', initialState: 'active',
    composite: true, ordered: true, autoCompleteParent: true,
    steps: [
      { id: 's1', name: 'Talk', varName: 'talk', initialState: 'active' },
      { id: 's2', name: 'Fight', varName: 'fight', initialState: 'hidden' },
    ],
  };
  const setBlock = { id: 'b1', type: 'quest-set', questId: 'q1', stepStates: [{ stepId: 's1', state: 'done' }] } as Block;
  const showBlock = { id: 'b2', type: 'quest-show', showSteps: true } as Block;

  const twee = () => exportToTwee(makeProject(
    [scene('sc1', 'Start', [setBlock, showBlock], [START_TAG])],
    { quests: [quest] },
  ));

  it('Set Quest State emits the step set + normalize call', () => {
    const t = twee();
    expect(t).toContain('$quests.mainQuest.steps.talk.state to "done"');
    expect(t).toContain('_tgQuestNormalize');
  });

  it('Show Quests emits the quest-log markup reading $quests', () => {
    const t = twee();
    expect(t).toContain('tg-quests');
    expect(t).toContain('$quests.mainQuest.name');
  });

  it('composite quest emits the normalize runtime config', () => {
    expect(twee()).toContain('window._tgQuests');
  });
});
