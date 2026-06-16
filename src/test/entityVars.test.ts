import { describe, it, expect } from 'vitest';
import { findOrCreateItemsRootGroup, buildItemVarNodes } from '../store/factories/itemVars';
import { findOrCreateQuestsRootGroup, uniqueQuestVarName, buildQuestVarNodes } from '../store/factories/questVars';
import { findOrCreateContainersRootGroup, buildContainerItemsLiteral, buildContainerVarNodes } from '../store/factories/containerVars';
import { flattenVariables } from '../utils/treeUtils';
import { group } from './fixtures';
import type { QuestDefinition, QuestCategory } from '../types';

describe('findOrCreate*RootGroup', () => {
  it('creates the items root group when absent', () => {
    const { nodes, rootGroupId } = findOrCreateItemsRootGroup([]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('items');
    expect(nodes[0].id).toBe(rootGroupId);
  });

  it('reuses an existing items root group (no duplicate)', () => {
    const existing = [group('root', 'items', [])];
    const { nodes, rootGroupId } = findOrCreateItemsRootGroup(existing);
    expect(nodes).toHaveLength(1);
    expect(rootGroupId).toBe('root');
  });

  it('creates quests and containers root groups by name', () => {
    expect(findOrCreateQuestsRootGroup([]).nodes[0].name).toBe('quests');
    expect(findOrCreateContainersRootGroup([]).nodes[0].name).toBe('containers');
  });
});

describe('buildItemVarNodes', () => {
  const base = { name: 'Sword', varName: 'sword', stackable: false, description: 'A blade', iconSrc: 'i.png' };

  it('builds five leaves for a non-wearable item', () => {
    const { itemGroup, varIds } = buildItemVarNodes({ ...base, category: 'consumable' }, 'ROOT');
    expect(itemGroup.name).toBe('sword');
    expect(itemGroup.children.map(c => c.name)).toEqual(['name', 'icon', 'price', 'description', 'stackable']);
    expect(varIds.slotVarId).toBeUndefined();
    expect(varIds.itemsRootGroupId).toBe('ROOT');
    const flat = flattenVariables([itemGroup]);
    expect(flat.find(v => v.name === 'name')?.defaultValue).toBe('Sword');
    expect(flat.find(v => v.name === 'stackable')?.defaultValue).toBe('false');
    expect(flat.find(v => v.name === 'icon')?.defaultValue).toBe('i.png');
  });

  it('adds a sanitized slot leaf for a wearable item', () => {
    const { itemGroup, varIds } = buildItemVarNodes({ ...base, category: 'wearable', targetSlot: 'Left Hand!' }, 'ROOT');
    expect(itemGroup.children.map(c => c.name)).toContain('slot');
    expect(varIds.slotVarId).toBeDefined();
    const slot = flattenVariables([itemGroup]).find(v => v.name === 'slot');
    expect(slot?.defaultValue).toBe('left_hand'); // lowercased, spaces→_, punctuation stripped
  });

  it('marks stackable true when requested', () => {
    const { itemGroup } = buildItemVarNodes({ ...base, category: 'consumable', stackable: true }, 'ROOT');
    expect(flattenVariables([itemGroup]).find(v => v.name === 'stackable')?.defaultValue).toBe('true');
  });
});

describe('uniqueQuestVarName', () => {
  it('returns the transliterated base when free', () => {
    expect(uniqueQuestVarName('Find Sword', [])).toBe('find_sword');
  });

  it('suffixes _2, _3 on collision', () => {
    expect(uniqueQuestVarName('Find Sword', ['find_sword'])).toBe('find_sword_2');
    expect(uniqueQuestVarName('Find Sword', ['find_sword', 'find_sword_2'])).toBe('find_sword_3');
  });
});

describe('buildQuestVarNodes', () => {
  const categories = [{ id: 'c1', name: 'Main' }] as QuestCategory[];

  it('builds a flat quest group (no steps) for a non-composite quest', () => {
    const quest = {
      id: 'q1', name: 'Rescue', varName: 'rescue', description: 'd',
      categoryId: 'c1', initialState: 'active', composite: false, steps: [],
    } as QuestDefinition;
    const { questGroup, varIds } = buildQuestVarNodes(quest, 'QROOT', categories);
    expect(questGroup.children.map(c => c.name)).toEqual(['name', 'description', 'state', 'category']);
    expect(flattenVariables([questGroup]).find(v => v.name === 'category')?.defaultValue).toBe('Main');
    expect(varIds.stepsGroupId).toBeUndefined();
    expect(varIds.stepVarIds).toBeUndefined();
  });

  it('adds a steps group for a composite quest', () => {
    const quest = {
      id: 'q1', name: 'Rescue', varName: 'rescue', description: '',
      categoryId: 'c1', initialState: 'active', composite: true,
      steps: [{ id: 's1', name: 'Step 1', varName: 'step1', description: '', initialState: 'hidden' }],
    } as QuestDefinition;
    const { questGroup, varIds } = buildQuestVarNodes(quest, 'QROOT', categories);
    const steps = questGroup.children.find(c => c.name === 'steps');
    expect(steps && steps.kind === 'group').toBe(true);
    expect(varIds.stepsGroupId).toBeDefined();
    expect(varIds.stepVarIds && varIds.stepVarIds['s1']).toBeDefined();
  });
});

describe('buildContainerItemsLiteral', () => {
  it('returns [] for no slots', () => {
    expect(buildContainerItemsLiteral([])).toBe('[]');
  });

  it('emits item + qty for a slot without price', () => {
    expect(buildContainerItemsLiteral([{ itemVarName: 'sword', quantity: 2 }])).toBe('[{item:"sword",qty:2}]');
  });

  it('includes price when present and joins multiple slots', () => {
    const out = buildContainerItemsLiteral([
      { itemVarName: 'sword', quantity: 1, price: 10 },
      { itemVarName: 'shield', quantity: 3 },
    ]);
    expect(out).toBe('[{item:"sword",qty:1,price:10},{item:"shield",qty:3}]');
  });
});

describe('buildContainerVarNodes', () => {
  it('builds a single items var seeded from the initial-items literal', () => {
    const { containerGroup, varIds } = buildContainerVarNodes(
      { varName: 'chest', initialItems: [{ itemVarName: 'gold', quantity: 5 }] },
      'CROOT',
    );
    expect(containerGroup.name).toBe('chest');
    expect(containerGroup.children).toHaveLength(1);
    const items = flattenVariables([containerGroup])[0];
    expect(items.name).toBe('items');
    expect(items.defaultValue).toBe('[{item:"gold",qty:5}]');
    expect(varIds.containersRootGroupId).toBe('CROOT');
  });
});
