import type { Variable, VariableGroup, CharacterVarIds, AvatarConfig } from '../../types';
import { uuid } from '../ids';

// ─── Character name → variable prefix ───────────────────────────────────────────

/**
 * Cyrillic → Latin transliteration table (Russian + common letters).
 * SugarCube variables must be ASCII-only identifiers.
 */
const CYRILLIC_MAP: Record<string, string> = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh',
  'з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
  'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
  'ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
};

function transliterate(s: string): string {
  return s.split('').map(c => CYRILLIC_MAP[c] ?? c).join('');
}

/**
 * Sanitize a character name into a valid SugarCube variable prefix.
 * Cyrillic is transliterated to Latin first; spaces → underscore;
 * strips non-ASCII and leading digits/underscores.
 * Examples: "John Doe" → "john_doe", "Дима" → "dima", "Поля" → "polya"
 */
export function charToVarPrefix(name: string): string {
  const s = transliterate(name.trim().toLowerCase())
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')   // keep only ASCII letters, digits, underscores
    .replace(/_+/g, '_')
    .replace(/^[\d_]+/, '')        // strip leading digits / underscores
    .replace(/_+$/g, '');
  return s || 'char';
}

/**
 * Pre-generate all variable IDs for a new character before it is saved.
 * Pass the result to addCharacter() so that avatar bindings set during
 * creation resolve to the correct variables after saving.
 */
export function pregenCharVarIds(): CharacterVarIds {
  return {
    groupId: crypto.randomUUID(),
    stylesGroupId: crypto.randomUUID(),
    nameVarId: crypto.randomUUID(),
    bgColorVarId: crypto.randomUUID(),
    borderColorVarId: crypto.randomUUID(),
    nameColorVarId: crypto.randomUUID(),
    textColorVarId: crypto.randomUUID(),
    avatarVarId: crypto.randomUUID(),
    llmDescrVarId: crypto.randomUUID(),
    llmTemperatureVarId: crypto.randomUUID(),
    inventoryVarId: crypto.randomUUID(),
    moneyVarId: crypto.randomUUID(),
  };
}

export interface CharVarBuildResult {
  group: VariableGroup;
  varIds: CharacterVarIds;
}

/**
 * Build the VariableGroup subtree for a newly created character.
 * Returns the root group (ready to push onto variableNodes) and the varIds map.
 */
export function buildCharVarNodes(
  charName: string,
  varName: string,
  colors: { bgColor: string; borderColor: string; nameColor: string; textColor: string; avatarConfig?: AvatarConfig; llm_descr?: string; llm_temperature?: number },
  pregenIds?: CharacterVarIds,
  pendingNodes?: VariableGroup['children'],
): CharVarBuildResult {
  const nameVarId            = pregenIds?.nameVarId ?? uuid();
  const bgColorVarId         = pregenIds?.bgColorVarId ?? uuid();
  const borderColorVarId     = pregenIds?.borderColorVarId ?? uuid();
  const nameColorVarId       = pregenIds?.nameColorVarId ?? uuid();
  const textColorVarId       = pregenIds?.textColorVarId ?? uuid();
  const avatarVarId          = pregenIds?.avatarVarId ?? uuid();
  const llmDescrVarId        = pregenIds?.llmDescrVarId ?? uuid();
  const llmTemperatureVarId  = pregenIds?.llmTemperatureVarId ?? uuid();
  const inventoryVarId       = pregenIds?.inventoryVarId ?? uuid();
  const moneyVarId           = pregenIds?.moneyVarId ?? uuid();
  const stylesGroupId        = pregenIds?.stylesGroupId ?? uuid();
  const groupId              = pregenIds?.groupId ?? uuid();

  const nameVar: Variable = {
    kind: 'variable', id: nameVarId,
    name: 'name',
    varType: 'string',
    defaultValue: charName,
    description: `Character name "${charName}"`,
  };

  const bgColorVar: Variable = {
    kind: 'variable', id: bgColorVarId,
    name: 'bgColor',
    varType: 'string',
    defaultValue: colors.bgColor,
    description: 'Dialogue background color',
  };

  const borderColorVar: Variable = {
    kind: 'variable', id: borderColorVarId,
    name: 'borderColor',
    varType: 'string',
    defaultValue: colors.borderColor,
    description: 'Dialogue border color',
  };

  const nameColorVar: Variable = {
    kind: 'variable', id: nameColorVarId,
    name: 'nameColor',
    varType: 'string',
    defaultValue: colors.nameColor,
    description: 'Character name color',
  };

  const textColorVar: Variable = {
    kind: 'variable', id: textColorVarId,
    name: 'textColor',
    varType: 'string',
    defaultValue: colors.textColor,
    description: 'Dialogue text color',
  };

  const avatarVar: Variable = {
    kind: 'variable', id: avatarVarId,
    name: 'avatar',
    varType: 'string',
    defaultValue: colors.avatarConfig?.mode === 'static' ? (colors.avatarConfig.src ?? '') : '',
    description: `Avatar URL for character "${charName}" (empty = hidden)`,
  };

  const llmDescrVar: Variable = {
    kind: 'variable', id: llmDescrVarId,
    name: 'llm_descr',
    varType: 'string',
    defaultValue: colors.llm_descr ?? '',
    description: `LLM personality description for "${charName}"`,
  };

  const llmTemperatureVar: Variable = {
    kind: 'variable', id: llmTemperatureVarId,
    name: 'llm_temperature',
    varType: 'number',
    defaultValue: colors.llm_temperature !== undefined ? String(colors.llm_temperature) : '',
    description: `LLM temperature for "${charName}" (empty = use global)`,
  };

  const inventoryVar: Variable = {
    kind: 'variable', id: inventoryVarId,
    name: 'inventory',
    varType: 'array',
    defaultValue: '[]',
    description: `Inventory for character "${charName}"`,
  };

  const moneyVar: Variable = {
    kind: 'variable', id: moneyVarId,
    name: 'money',
    varType: 'number',
    defaultValue: '0',
    description: `Money for character "${charName}"`,
  };

  const stylesGroup: VariableGroup = {
    kind: 'group', id: stylesGroupId,
    name: 'styles',
    children: [bgColorVar, borderColorVar, nameColorVar, textColorVar, avatarVar, llmDescrVar, llmTemperatureVar],
  };

  const group: VariableGroup = {
    kind: 'group', id: groupId,
    name: varName,
    children: [nameVar, stylesGroup, inventoryVar, moneyVar, ...(pendingNodes ?? [])],
  };

  return {
    group,
    varIds: { groupId, stylesGroupId, nameVarId, bgColorVarId, borderColorVarId, nameColorVarId, textColorVarId, avatarVarId, llmDescrVarId, llmTemperatureVarId, inventoryVarId, moneyVarId },
  };
}
