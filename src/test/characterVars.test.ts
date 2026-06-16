import { describe, it, expect } from 'vitest';
import { charToVarPrefix, buildCharVarNodes, pregenCharVarIds } from '../store/factories/characterVars';
import { flattenVariables } from '../utils/treeUtils';
import type { CharacterVarIds } from '../types';

describe('charToVarPrefix', () => {
  it('lowercases and underscores spaces', () => {
    expect(charToVarPrefix('John Doe')).toBe('john_doe');
  });

  it('transliterates Cyrillic to Latin', () => {
    expect(charToVarPrefix('Дима')).toBe('dima');
    expect(charToVarPrefix('Поля')).toBe('polya');
  });

  it('strips leading digits and non-ASCII punctuation', () => {
    expect(charToVarPrefix('123 Foo!')).toBe('foo');
  });

  it('collapses repeated underscores and trims edges', () => {
    expect(charToVarPrefix('  a   b  ')).toBe('a_b');
  });

  it('falls back to "char" when nothing usable remains', () => {
    expect(charToVarPrefix('!!!')).toBe('char');
  });
});

describe('buildCharVarNodes', () => {
  const colors = { bgColor: '#111', borderColor: '#222', nameColor: '#333', textColor: '#444' };

  // Deterministic ids so the structure can be asserted without random uuids.
  const ids: CharacterVarIds = {
    groupId: 'G', stylesGroupId: 'S', nameVarId: 'N',
    bgColorVarId: 'BG', borderColorVarId: 'BD', nameColorVarId: 'NC', textColorVarId: 'TC',
    avatarVarId: 'AV', llmDescrVarId: 'LD', llmTemperatureVarId: 'LT',
    inventoryVarId: 'INV', moneyVarId: 'MON',
  };

  it('builds a group named after varName with the expected leaves', () => {
    const { group, varIds } = buildCharVarNodes('John', 'john', colors, ids);
    expect(group.id).toBe('G');
    expect(group.name).toBe('john');
    expect(varIds).toEqual(ids);

    // Top-level children: name, styles group, inventory, money.
    const topNames = group.children.map(n => n.name);
    expect(topNames).toEqual(['name', 'styles', 'inventory', 'money']);

    const styles = group.children.find(n => n.kind === 'group');
    expect(styles && styles.kind === 'group' && styles.children.map(c => c.name)).toEqual([
      'bgColor', 'borderColor', 'nameColor', 'textColor', 'avatar', 'llm_descr', 'llm_temperature',
    ]);
  });

  it('seeds the name variable default with the character name and colors into styles', () => {
    const { group } = buildCharVarNodes('John', 'john', colors, ids);
    const flat = flattenVariables([group]);
    expect(flat.find(v => v.id === 'N')?.defaultValue).toBe('John');
    expect(flat.find(v => v.id === 'BG')?.defaultValue).toBe('#111');
    expect(flat.find(v => v.id === 'INV')?.defaultValue).toBe('[]');
    expect(flat.find(v => v.id === 'MON')?.defaultValue).toBe('0');
  });

  it('uses a static avatar src as the avatar default', () => {
    const { group } = buildCharVarNodes(
      'John', 'john',
      { ...colors, avatarConfig: { mode: 'static', src: 'a.png' } as never },
      ids,
    );
    expect(flattenVariables([group]).find(v => v.id === 'AV')?.defaultValue).toBe('a.png');
  });

  it('appends pendingNodes to the group children', () => {
    const extra = { kind: 'variable', id: 'X', name: 'extra', varType: 'number', defaultValue: '0', description: '' } as const;
    const { group } = buildCharVarNodes('John', 'john', colors, ids, [extra]);
    expect(group.children.map(n => n.name)).toContain('extra');
  });

  it('generates fresh ids when no pregen ids are supplied', () => {
    const { varIds } = buildCharVarNodes('John', 'john', colors);
    const all = Object.values(varIds);
    expect(new Set(all).size).toBe(all.length); // all unique
    expect(varIds.groupId).not.toBe('G');
  });
});

describe('pregenCharVarIds', () => {
  it('returns a full, unique set of ids', () => {
    const a = pregenCharVarIds();
    const vals = Object.values(a);
    expect(vals).toHaveLength(12);
    expect(new Set(vals).size).toBe(12);
  });
});
