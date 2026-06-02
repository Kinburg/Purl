import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * Debounced localStorage adapter. `JSON.stringify(project)` + `setItem` runs
 * once after `delay` ms of inactivity, instead of on every store mutation —
 * typing into a TextBlock previously triggered a sync write of the entire
 * project on each keystroke. Pending write is flushed on `beforeunload` to
 * avoid losing the last edits if the user closes the window quickly.
 */
function makeDebouncedLocalStorage(delay = 500): StateStorage {
  const pending: Map<string, string> = new Map();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    for (const [key, value] of pending) {
      try { localStorage.setItem(key, value); } catch { /* quota / private mode */ }
    }
    pending.clear();
    timer = null;
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush);
  }

  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => {
      pending.set(key, value);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    removeItem: (key) => {
      pending.delete(key);
      localStorage.removeItem(key);
    },
  };
}
import type {
  Project, ProjectSettings, Scene, SceneGroup, Block, Character, CharacterVarIds,
  Variable, VariableGroup, VariableTreeNode,
  Asset, AssetGroup, AssetTreeNode,
  ChoiceOption, ConditionBranch,
  SidebarCell, PanelStyle,
  AvatarConfig, AvatarMode,
  Watcher,
  ItemDefinition, ItemVarIds, ItemCategory,
  ContainerDefinition, ContainerVarIds, ContainerItemSlot,
  PaperdollSlot, PaperdollConfig,
} from '../types';
import { START_TAG, SYSTEM_TAGS, SYSTEM_TAG_KIND, SINGLETON_TAG_PASSAGE_NAME, type SystemTag } from '../types';

/**
 * Singleton system tags (e.g. 'sidebar' → ::StoryCaption). A singleton tag must live
 * on at most one scene at a time, and when it does, the scene's name is force-locked
 * to the canonical SugarCube passage name. This helper:
 *   1. Strips the singleton tag from every OTHER scene currently carrying it.
 *   2. If a stripped scene's name matches the canonical name (about to be claimed by
 *      the target scene), renames it with a " (former system)" suffix to avoid a
 *      name collision once the target scene takes the canonical name.
 */
function enforceSingletonSystemTags(
  scenes: Scene[],
  targetSceneId: string,
  newTags: string[],
): Scene[] {
  const singletons = newTags.filter(
    t => (SYSTEM_TAGS as readonly string[]).includes(t)
      && SYSTEM_TAG_KIND[t as SystemTag] === 'singleton'
  );
  if (singletons.length === 0) return scenes;
  const incomingCanonicalNames = singletons
    .map(t => SINGLETON_TAG_PASSAGE_NAME[t as SystemTag])
    .filter((n): n is string => !!n);
  return scenes.map(sc => {
    if (sc.id === targetSceneId) return sc;
    const filtered = sc.tags.filter(t => !singletons.includes(t));
    const tagsChanged = filtered.length !== sc.tags.length;
    const needsRename = tagsChanged && incomingCanonicalNames.includes(sc.name);
    if (!tagsChanged && !needsRename) return sc;
    return {
      ...sc,
      tags: filtered,
      name: needsRename ? `${sc.name} (former system)` : sc.name,
    };
  });
}

/**
 * If the new tags include a singleton system tag whose canonical name is defined,
 * return that canonical name (to override whatever name the caller passed).
 * Otherwise return null.
 */
function canonicalNameForTags(tags: string[]): string | null {
  for (const tag of tags) {
    if (!(SYSTEM_TAGS as readonly string[]).includes(tag)) continue;
    if (SYSTEM_TAG_KIND[tag as SystemTag] !== 'singleton') continue;
    const canon = SINGLETON_TAG_PASSAGE_NAME[tag as SystemTag];
    if (canon) return canon;
  }
  return null;
}
import { flattenVariables, flattenAssets, hasSiblingNameConflict, getVariablePath } from '../utils/treeUtils';

export { flattenVariables, flattenAssets };

// ─── Defaults ─────────────────────────────────────────────────────────────────

function uuid(): string { return crypto.randomUUID(); }
function generateIfid(): string { return uuid().toUpperCase(); }

// 50 steps is plenty for an editor workflow; 100 doubled memory for no real gain
// (each snapshot references a whole Project object — for big stories that's MBs).
const HISTORY_LIMIT = 50;

export const DEFAULT_PANEL_STYLE: PanelStyle = {
  rowGap:          2,
  borderWidth:     1,
  borderColor:     '#555555',
  showOuterBorder: false,
  showRowBorders:  false,
  showCellBorders: false,
};


export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {};

function makeDefaultProject(): Project {
  // Pre-created `sidePanel` variable group — one variable per bindable UIBar
  // setting, wired into StoryCaption.systemConfig out-of-the-box. Story code can
  // mutate any of these (`<<set $sidePanel.hidden to true>>` etc.) and the
  // sidebar reacts at runtime.
  const sp = makeSidePanelGroup();

  return {
    id: uuid(),
    title: 'New Project',
    ifid: generateIfid(),
    settings: { ...DEFAULT_PROJECT_SETTINGS },
    scenes: [
      { id: uuid(), name: 'Start', tags: ['start'], blocks: [] },
      // StoryCaption — the sidebar scene. Name matches the SugarCube special passage
      // it maps to on export. The `sidebar` system tag (singleton) is what makes it
      // route to ::StoryCaption; the name is for editor identification only.
      // systemConfig binds every UIBar wrapper setting to a $sidePanel.* variable.
      {
        id: uuid(),
        name: 'StoryCaption',
        tags: ['sidebar'],
        blocks: [],
        systemConfig: sp.systemConfig,
      },
    ],
    sceneGroups: [],
    characters: [],
    items: [],
    containers: [],
    variableNodes: [sp.group],
    assetNodes: [],
    watchers: [],
  };
}

/**
 * Build the auto-generated `sidePanel` variable group + the matching
 * `StoryCaption.systemConfig` that binds every field to one of those variables.
 * Shared by `makeDefaultProject` and the project-creation flow in ProjectSettingsModal.
 */
export function makeSidePanelGroup(): {
  group: import('../types').VariableGroup;
  systemConfig: import('../types').SidebarSceneConfig;
} {
  const mkVar = (
    name: string,
    varType: import('../types').VariableType,
    defaultValue: string,
    description: string,
  ): import('../types').Variable => ({
    kind: 'variable', id: uuid(), name, varType, defaultValue, description,
  });

  const hidden             = mkVar('hidden',             'boolean', 'false', 'Hide the UIBar entirely.');
  const width              = mkVar('width',              'number',  '17.5',  'UIBar width (units configured in scene settings, default em).');
  const position           = mkVar('position',           'string',  '"left"','UIBar side: "left" or "right".');
  const initiallyCollapsed = mkVar('initiallyCollapsed', 'boolean', 'false', 'Start with the UIBar collapsed. Read once at startup.');
  const allowCollapse      = mkVar('allowCollapse',      'boolean', 'true',  'Show the hamburger toggle that lets the player collapse the UIBar.');
  const bgColor            = mkVar('bgColor',            'string',  '""',    'UIBar background color (CSS string). Empty = inherit theme.');
  const showHistory        = mkVar('show_history',       'boolean', 'true',  'Show back/forward history navigation buttons in the UIBar.');
  const showSaves          = mkVar('show_saves',         'boolean', 'true',  'Show save/load menu in the UIBar.');

  const group: import('../types').VariableGroup = {
    kind: 'group',
    id: uuid(),
    name: 'sidePanel',
    children: [hidden, width, position, initiallyCollapsed, allowCollapse, bgColor, showHistory, showSaves],
  };

  const systemConfig: import('../types').SidebarSceneConfig = {
    kind: 'sidebar',
    hidden:             { variableId: hidden.id },
    width:              { variableId: width.id },
    position:           { variableId: position.id },
    initiallyCollapsed: { variableId: initiallyCollapsed.id },
    allowCollapse:      { variableId: allowCollapse.id },
    bgColor:            { variableId: bgColor.id },
    historyControls:    { variableId: showHistory.id },
    saveLoadMenu:       { variableId: showSaves.id },
  };

  return { group, systemConfig };
}

// ─── Generic tree helpers (shared by variable & asset trees) ──────────────────

type AnyNode = { id: string; kind: string; children?: AnyNode[] };

function removeNode<T extends AnyNode>(nodes: T[], id: string): T[] {
  return nodes
    .filter(n => n.id !== id)
    .map(n => n.children ? { ...n, children: removeNode(n.children as T[], id) } : n) as T[];
}

/** Get the children of a parent group (or root nodes if parentId is null) */
function getSiblings(nodes: VariableTreeNode[], parentId: string | null): VariableTreeNode[] {
  if (parentId === null) return nodes;
  for (const n of nodes) {
    if (n.kind === 'group') {
      if (n.id === parentId) return n.children;
      const found = getSiblings(n.children, parentId);
      if (found) return found;
    }
  }
  return [];
}

/** Ensure a unique name among siblings by appending a numeric suffix */
function ensureUniqueName(name: string, siblings: VariableTreeNode[]): string {
  if (!hasSiblingNameConflict(name, siblings)) return name;
  let i = 2;
  while (hasSiblingNameConflict(`${name}${i}`, siblings)) i++;
  return `${name}${i}`;
}

function addNode<T extends AnyNode>(nodes: T[], parentId: string | null, node: T): T[] {
  if (parentId === null) return [...nodes, node];
  return nodes.map(n => {
    if (n.kind !== 'group' || n.id !== parentId) {
      if (n.children) return { ...n, children: addNode(n.children as T[], parentId, node) };
      return n;
    }
    return { ...n, children: [...(n.children ?? []), node] };
  }) as T[];
}

// ─── Variable tree helpers ─────────────────────────────────────────────────────

function updateVarInTree(
  nodes: VariableTreeNode[],
  id: string,
  patch: Partial<Variable>,
): VariableTreeNode[] {
  return nodes.map(n => {
    if (n.kind === 'variable' && n.id === id) return { ...n, ...patch };
    if (n.kind === 'group') return { ...n, children: updateVarInTree(n.children, id, patch) };
    return n;
  });
}

// ─── Character variable helpers ────────────────────────────────────────────────

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

/**
 * Rename a group node anywhere in the variable tree.
 */
function updateGroupNameInTree(
  nodes: VariableTreeNode[],
  groupId: string,
  name: string,
): VariableTreeNode[] {
  return nodes.map(n => {
    if (n.kind === 'group' && n.id === groupId) return { ...n, name };
    if (n.kind === 'group') return { ...n, children: updateGroupNameInTree(n.children, groupId, name) };
    return n;
  });
}

interface CharVarBuildResult {
  group: VariableGroup;
  varIds: CharacterVarIds;
}

/**
 * Build the VariableGroup subtree for a newly created character.
 * Returns the root group (ready to push onto variableNodes) and the varIds map.
 */
function buildCharVarNodes(
  charName: string,
  varName: string,
  colors: { bgColor: string; borderColor: string; nameColor: string; textColor: string; avatarConfig?: AvatarConfig; llm_descr?: string; llm_temperature?: number },
  pregenIds?: CharacterVarIds,
  pendingNodes?: VariableTreeNode[],
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

// ─── Item helpers ─────────────────────────────────────────────────────────────

const ITEMS_ROOT_GROUP_NAME = 'items';
const ITEMS_ASSET_FOLDER_NAME = 'Items';
const ITEMS_ASSET_FOLDER_PATH = 'assets/Items';

/**
 * Find the root 'items' VariableGroup or create it if absent.
 * Returns updated variableNodes + the root group id.
 */
function findOrCreateItemsRootGroup(variableNodes: VariableTreeNode[]): {
  nodes: VariableTreeNode[];
  rootGroupId: string;
} {
  const existing = variableNodes.find(
    n => n.kind === 'group' && n.name === ITEMS_ROOT_GROUP_NAME,
  ) as VariableGroup | undefined;
  if (existing) return { nodes: variableNodes, rootGroupId: existing.id };
  const rootGroup: VariableGroup = { kind: 'group', id: uuid(), name: ITEMS_ROOT_GROUP_NAME, children: [] };
  return { nodes: [...variableNodes, rootGroup], rootGroupId: rootGroup.id };
}

/**
 * Find the 'assets/Items' AssetGroup or create it if absent.
 * Returns updated assetNodes + the folder id.
 */
function findOrCreateItemsAssetFolder(assetNodes: AssetTreeNode[]): {
  nodes: AssetTreeNode[];
  folderId: string;
} {
  const existing = assetNodes.find(
    n => n.kind === 'group' && (n as AssetGroup).name === ITEMS_ASSET_FOLDER_NAME,
  ) as AssetGroup | undefined;
  if (existing) return { nodes: assetNodes, folderId: existing.id };
  const folder: AssetGroup = {
    kind: 'group', id: uuid(),
    name: ITEMS_ASSET_FOLDER_NAME,
    relativePath: ITEMS_ASSET_FOLDER_PATH,
    children: [],
  };
  return { nodes: [...assetNodes, folder], folderId: folder.id };
}

interface ItemVarBuildResult {
  itemGroup: VariableGroup;
  varIds: ItemVarIds;
}

/**
 * Build the VariableGroup subtree for a newly created item.
 * Places the group under the root 'items' group (via rootGroupId).
 */
function buildItemVarNodes(
  item: { name: string; varName: string; category: ItemCategory; stackable: boolean; targetSlot?: string; iconSrc?: string; description?: string },
  rootGroupId: string,
): ItemVarBuildResult {
  const nameVarId      = uuid();
  const iconVarId      = uuid();
  const priceVarId     = uuid();
  const descVarId      = uuid();
  const stackableVarId = uuid();
  const slotVarId      = item.category === 'wearable' ? uuid() : undefined;
  const groupId        = uuid();

  const children: Variable[] = [
    {
      kind: 'variable', id: nameVarId,
      name: 'name', varType: 'string',
      defaultValue: item.name,
      description: `Display name for item "${item.name}"`,
    },
    {
      kind: 'variable', id: iconVarId,
      name: 'icon', varType: 'string',
      defaultValue: item.iconSrc ?? '',
      description: `Icon path for item "${item.name}"`,
    },
    {
      kind: 'variable', id: priceVarId,
      name: 'price', varType: 'number',
      defaultValue: '0',
      description: `Price of item "${item.name}"`,
    },
    {
      kind: 'variable', id: descVarId,
      name: 'description', varType: 'string',
      defaultValue: item.description ?? '',
      description: `Description of item "${item.name}"`,
    },
    {
      kind: 'variable', id: stackableVarId,
      name: 'stackable', varType: 'boolean',
      defaultValue: item.stackable ? 'true' : 'false',
      description: '',
    },
  ];

  if (slotVarId) {
    children.push({
      kind: 'variable', id: slotVarId,
      name: 'slot', varType: 'string',
      defaultValue: (item.targetSlot ?? '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      description: `Paperdoll slot for item "${item.name}"`,
    });
  }

  const itemGroup: VariableGroup = { kind: 'group', id: groupId, name: item.varName, children };
  return {
    itemGroup,
    varIds: { itemsRootGroupId: rootGroupId, groupId, nameVarId, iconVarId, priceVarId, descVarId, stackableVarId, slotVarId },
  };
}

// ─── Container helpers ────────────────────────────────────────────────────────

const CONTAINERS_ROOT_GROUP_NAME = 'containers';

/**
 * Find the root 'containers' VariableGroup or create it if absent.
 * Returns updated variableNodes + the root group id.
 */
function findOrCreateContainersRootGroup(variableNodes: VariableTreeNode[]): {
  nodes: VariableTreeNode[];
  rootGroupId: string;
} {
  const existing = variableNodes.find(
    n => n.kind === 'group' && n.name === CONTAINERS_ROOT_GROUP_NAME,
  ) as VariableGroup | undefined;
  if (existing) return { nodes: variableNodes, rootGroupId: existing.id };
  const rootGroup: VariableGroup = { kind: 'group', id: uuid(), name: CONTAINERS_ROOT_GROUP_NAME, children: [] };
  return { nodes: [...variableNodes, rootGroup], rootGroupId: rootGroup.id };
}

/** Build the JS array literal for a container's initial items */
function buildContainerItemsLiteral(slots: ContainerItemSlot[]): string {
  if (slots.length === 0) return '[]';
  const entries = slots.map(s => {
    const parts = [`item:"${s.itemVarName}",qty:${s.quantity}`];
    if (s.price !== undefined) parts.push(`price:${s.price}`);
    return `{${parts.join(',')}}`;
  });
  return `[${entries.join(',')}]`;
}

interface ContainerVarBuildResult {
  containerGroup: VariableGroup;
  varIds: ContainerVarIds;
}

/**
 * Build the VariableGroup subtree for a newly created container.
 * Places the group under the root 'containers' group (via rootGroupId).
 */
function buildContainerVarNodes(
  container: { varName: string; initialItems: ContainerItemSlot[] },
  rootGroupId: string,
): ContainerVarBuildResult {
  const itemsVarId = uuid();
  const groupId    = uuid();

  const itemsVar: Variable = {
    kind: 'variable', id: itemsVarId,
    name: 'items',
    varType: 'array',
    defaultValue: buildContainerItemsLiteral(container.initialItems),
    description: `Stock for container "${container.varName}"`,
  };

  const containerGroup: VariableGroup = {
    kind: 'group', id: groupId,
    name: container.varName,
    children: [itemsVar],
  };

  return {
    containerGroup,
    varIds: { containersRootGroupId: rootGroupId, groupId, itemsVarId },
  };
}

// ─── Asset tree helpers ────────────────────────────────────────────────────────

function updateChildPaths(
  nodes: AssetTreeNode[],
  oldPrefix: string,
  newPrefix: string,
): AssetTreeNode[] {
  return nodes.map(n => {
    const rel = newPrefix + n.relativePath.slice(oldPrefix.length);
    if (n.kind === 'asset') return { ...n, relativePath: rel };
    return { ...n, relativePath: rel, children: updateChildPaths(n.children, oldPrefix, newPrefix) };
  });
}

function renameGroupInAssetTree(
  nodes: AssetTreeNode[], id: string, name: string, oldRel: string, newRel: string,
): AssetTreeNode[] {
  return nodes.map(n => {
    if (n.id === id && n.kind === 'group') {
      return { ...n, name, relativePath: newRel, children: updateChildPaths(n.children, oldRel, newRel) };
    }
    if (n.kind === 'group') {
      return { ...n, children: renameGroupInAssetTree(n.children, id, name, oldRel, newRel) };
    }
    return n;
  });
}

// ─── Block deep-clone ─────────────────────────────────────────────────────────

/** Recursively clone a block, assigning fresh UUIDs to every block and branch. */
export function deepCloneBlock(block: Block): Block {
  const newId = uuid();
  if (block.type === 'condition') {
    return {
      ...block,
      id: newId,
      branches: block.branches.map(br => ({
        ...br,
        id: uuid(),
        blocks: br.blocks.map(nb => deepCloneBlock(nb)),
      })),
    };
  }
  if (block.type === 'table') {
    // Cells hold nested block-lists; regenerate row/cell ids and deep-clone
    // their blocks so a duplicated table shares no ids with the original.
    return {
      ...block,
      id: newId,
      rows: block.rows.map(r => ({
        ...r,
        id: uuid(),
        cells: r.cells.map(c => ({ ...c, id: uuid(), blocks: c.blocks.map(deepCloneBlock) })),
      })),
    };
  }
  return { ...block, id: newId };
}

// ─── Project migration ────────────────────────────────────────────────────────

/**
 * Fix character variable names that were created with Cyrillic prefixes
 * (before transliteration was introduced). Runs idempotently.
 */
function migrateCharacterVarNames(p: Project): Project {
  let variableNodes = p.variableNodes;
  let changed = false;
  for (const char of p.characters) {
    if (!char.varIds) continue;
    const { varIds } = char;
    const correctPrefix = charToVarPrefix(char.name);
    const allVars = flattenVariables(variableNodes);
    const nameVar = allVars.find(v => v.id === varIds.nameVarId);
    if (!nameVar) continue;
    if (nameVar.name === `${correctPrefix}_name`) continue; // already correct
    // Rename all 4 variable identifiers to use the ASCII prefix
    variableNodes = updateVarInTree(variableNodes, varIds.nameVarId,        { name: `${correctPrefix}_name` });
    variableNodes = updateVarInTree(variableNodes, varIds.bgColorVarId,     { name: `${correctPrefix}_bgColor` });
    variableNodes = updateVarInTree(variableNodes, varIds.borderColorVarId, { name: `${correctPrefix}_borderColor` });
    variableNodes = updateVarInTree(variableNodes, varIds.nameColorVarId,   { name: `${correctPrefix}_nameColor` });
    changed = true;
  }
  return changed ? { ...p, variableNodes } : p;
}

/**
 * Add $prefix_avatar variable to characters that were created before it existed.
 * Runs idempotently (skips if avatarVarId already present).
 */
function migrateCharacterAvatarVar(p: Project): Project {
  let variableNodes = p.variableNodes;
  let characters = p.characters;
  let changed = false;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    // Skip if no varIds at all, or if avatarVarId already exists
    if (!char.varIds || char.varIds.avatarVarId) continue;

    const prefix = charToVarPrefix(char.name);
    const avatarVarId = uuid();

    const avatarVar: Variable = {
      kind: 'variable', id: avatarVarId,
      name: `${prefix}_avatar`,
      varType: 'string',
      defaultValue: char.avatarUrl || '',
      description: `Avatar URL for character "${char.name}" (empty = hidden)`,
    };

    // Append to the styles sub-group
    variableNodes = addNode(
      variableNodes as AnyNode[],
      char.varIds.stylesGroupId,
      avatarVar as AnyNode,
    ) as VariableTreeNode[];

    const updatedVarIds: CharacterVarIds = { ...char.varIds, avatarVarId };
    characters = characters.map((c, idx) => idx === i ? { ...c, varIds: updatedVarIds } : c);
    changed = true;
  }

  return changed ? { ...p, variableNodes, characters } : p;
}

/**
 * Add $prefix_textColor variable to characters that were created before it existed.
 * Runs idempotently (skips if textColorVarId already present).
 */
function migrateCharacterTextColorVar(p: Project): Project {
  let variableNodes = p.variableNodes;
  let characters = p.characters;
  let changed = false;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    if (!char.varIds || char.varIds.textColorVarId) continue;

    const prefix = charToVarPrefix(char.name);
    const textColorVarId = uuid();

    const textColorVar: Variable = {
      kind: 'variable', id: textColorVarId,
      name: `${prefix}_textColor`,
      varType: 'string',
      defaultValue: char.textColor ?? '#e2e8f0',
      description: 'Dialogue text color',
    };

    variableNodes = addNode(
      variableNodes as AnyNode[],
      char.varIds.stylesGroupId,
      textColorVar as AnyNode,
    ) as VariableTreeNode[];

    const updatedVarIds: CharacterVarIds = { ...char.varIds, textColorVarId };
    characters = characters.map((c, idx) => idx === i ? { ...c, varIds: updatedVarIds } : c);
    changed = true;
  }

  return changed ? { ...p, variableNodes, characters } : p;
}

/**
 * Add $prefix_llm_descr variable to characters that were created before it existed.
 * Runs idempotently (skips if llmDescrVarId already present).
 */
function migrateCharacterLlmDescrVar(p: Project): Project {
  let variableNodes = p.variableNodes;
  let characters = p.characters;
  let changed = false;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    if (!char.varIds || char.varIds.llmDescrVarId) continue;

    const prefix = charToVarPrefix(char.name);
    const llmDescrVarId = uuid();

    const llmDescrVar: Variable = {
      kind: 'variable', id: llmDescrVarId,
      name: `${prefix}_llm_descr`,
      varType: 'string',
      defaultValue: char.llm_descr ?? '',
      description: `LLM personality description for "${char.name}"`,
    };

    variableNodes = addNode(
      variableNodes as AnyNode[],
      char.varIds.stylesGroupId,
      llmDescrVar as AnyNode,
    ) as VariableTreeNode[];

    const updatedVarIds: CharacterVarIds = { ...char.varIds, llmDescrVarId };
    characters = characters.map((c, idx) => idx === i ? { ...c, varIds: updatedVarIds } : c);
    changed = true;
  }

  return changed ? { ...p, variableNodes, characters } : p;
}

/**
 * Add $prefix_llm_temperature variable to characters that were created before it existed.
 * Runs idempotently (skips if llmTemperatureVarId already present).
 */
function migrateCharacterLlmTemperatureVar(p: Project): Project {
  let variableNodes = p.variableNodes;
  let characters = p.characters;
  let changed = false;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    if (!char.varIds || char.varIds.llmTemperatureVarId) continue;

    const prefix = charToVarPrefix(char.name);
    const llmTemperatureVarId = uuid();

    const llmTemperatureVar: Variable = {
      kind: 'variable', id: llmTemperatureVarId,
      name: `${prefix}_llm_temperature`,
      varType: 'number',
      defaultValue: char.llm_temperature !== undefined ? String(char.llm_temperature) : '',
      description: `LLM temperature for "${char.name}" (empty = use global)`,
    };

    variableNodes = addNode(
      variableNodes as AnyNode[],
      char.varIds.stylesGroupId,
      llmTemperatureVar as AnyNode,
    ) as VariableTreeNode[];

    const updatedVarIds: CharacterVarIds = { ...char.varIds, llmTemperatureVarId };
    characters = characters.map((c, idx) => idx === i ? { ...c, varIds: updatedVarIds } : c);
    changed = true;
  }

  return changed ? { ...p, variableNodes, characters } : p;
}

/**
 * Add inventory array variable to characters that were created before it existed.
 * Runs idempotently (skips if inventoryVarId already present).
 */
function migrateCharacterInventoryVar(p: Project): Project {
  let variableNodes = p.variableNodes;
  let characters = p.characters;
  let changed = false;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    if (!char.varIds || char.varIds.inventoryVarId) continue;

    const inventoryVarId = uuid();

    const inventoryVar: Variable = {
      kind: 'variable', id: inventoryVarId,
      name: 'inventory',
      varType: 'array',
      defaultValue: '[]',
      description: `Inventory for character "${char.name}"`,
    };

    variableNodes = addNode(
      variableNodes as AnyNode[],
      char.varIds.groupId,
      inventoryVar as AnyNode,
    ) as VariableTreeNode[];

    const updatedVarIds: CharacterVarIds = { ...char.varIds, inventoryVarId };
    characters = characters.map((c, idx) => idx === i ? { ...c, varIds: updatedVarIds, initialInventory: c.initialInventory ?? [] } : c);
    changed = true;
  }

  return changed ? { ...p, variableNodes, characters } : p;
}

/**
 * Add money number variable to characters that were created before it existed.
 * Runs idempotently (skips if moneyVarId already present).
 */
function migrateCharacterMoneyVar(p: Project): Project {
  let variableNodes = p.variableNodes;
  let characters = p.characters;
  let changed = false;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    if (!char.varIds || char.varIds.moneyVarId) continue;

    const moneyVarId = uuid();

    const moneyVar: Variable = {
      kind: 'variable', id: moneyVarId,
      name: 'money',
      varType: 'number',
      defaultValue: '0',
      description: `Money for character "${char.name}"`,
    };

    variableNodes = addNode(
      variableNodes as AnyNode[],
      char.varIds.groupId,
      moneyVar as AnyNode,
    ) as VariableTreeNode[];

    const updatedVarIds: CharacterVarIds = { ...char.varIds, moneyVarId };
    characters = characters.map((c, idx) => idx === i ? { ...c, varIds: updatedVarIds } : c);
    changed = true;
  }

  return changed ? { ...p, variableNodes, characters } : p;
}

// ─── Paperdoll helpers ────────────────────────────────────────────────────────

/**
 * Find or create the 'equipment' VariableGroup under a character's group.
 * Returns updated tree + the equipment group id.
 */
function findOrCreateCharEquipmentGroup(
  variableNodes: VariableTreeNode[],
  charGroupId: string,
  existingEquipmentGroupId?: string,
): { nodes: VariableTreeNode[]; equipmentGroupId: string } {
  if (existingEquipmentGroupId) {
    return { nodes: variableNodes, equipmentGroupId: existingEquipmentGroupId };
  }
  const equipmentGroupId = uuid();
  const equipmentGroup: VariableGroup = {
    kind: 'group', id: equipmentGroupId,
    name: 'equipment',
    children: [],
  };
  const nodes = addNode(
    variableNodes as AnyNode[],
    charGroupId,
    equipmentGroup as AnyNode,
  ) as VariableTreeNode[];
  return { nodes, equipmentGroupId };
}

/**
 * Add avatarConfig to characters created before AvatarConfig was introduced.
 * Converts legacy avatarUrl → avatarConfig { mode: 'static', src: avatarUrl }.
 * Runs idempotently (skips characters that already have avatarConfig).
 */
function migrateCharacterAvatarConfig(p: Project): Project {
  const needsMigration = p.characters.some(c => !c.avatarConfig);
  if (!needsMigration) return p;
  const characters = p.characters.map(c => {
    if (c.avatarConfig) return c;
    return {
      ...c,
      avatarConfig: {
        mode: 'static' as AvatarMode,
        src: c.avatarUrl ?? '',
        variableId: '',
        mapping: [],
        defaultSrc: '',
      } satisfies AvatarConfig,
    };
  });
  return { ...p, characters };
}

/**
 * Convert all targetSceneId / navigate.sceneId values from scene names to scene UUIDs.
 * Runs once per project load; already-migrated projects (values are UUIDs) are unaffected
 * because a UUID will never match a scene name in the nameToId map.
 */
function migrateSceneLinks(p: Project): Project {
  const nameToId = new Map(p.scenes.map(s => [s.name, s.id]));
  const idSet = new Set(p.scenes.map(s => s.id));
  const resolve = (v: string | undefined): string => {
    if (!v) return v ?? '';
    if (idSet.has(v)) return v; // already an ID
    return nameToId.get(v) ?? v; // resolve name → ID, or keep as-is
  };

  const migrateActions = (actions: any[]) => {
    for (const a of actions) {
      if (a.type === 'open-popup' && a.targetSceneId) {
        a.targetSceneId = resolve(a.targetSceneId);
      }
    }
  };

  const migrateNav = (nav: any) => {
    if (nav?.type === 'scene' && nav.sceneId) {
      nav.sceneId = resolve(nav.sceneId);
    }
  };

  const migrateBlocks = (blocks: any[]) => {
    for (const b of blocks) {
      if (b.type === 'choice') {
        for (const opt of b.options ?? []) {
          if (opt.targetSceneId) opt.targetSceneId = resolve(opt.targetSceneId);
        }
      } else if (b.type === 'link') {
        if (b.targetSceneId) b.targetSceneId = resolve(b.targetSceneId);
        if (b.actions) migrateActions(b.actions);
      } else if (b.type === 'menu-link') {
        if (b.targetSceneId) b.targetSceneId = resolve(b.targetSceneId);
        if (b.actions) migrateActions(b.actions);
      } else if (b.type === 'function') {
        if (b.targetSceneId) b.targetSceneId = resolve(b.targetSceneId);
        if (b.actions) migrateActions(b.actions);
      } else if (b.type === 'popup') {
        if (b.targetSceneId) b.targetSceneId = resolve(b.targetSceneId);
      } else if (b.type === 'button') {
        if (b.actions) migrateActions(b.actions);
      } else if (b.type === 'condition') {
        for (const branch of b.branches ?? []) {
          migrateBlocks(branch.blocks ?? []);
        }
      } else if (b.type === 'include') {
        if (b.passageName) b.passageName = resolve(b.passageName);
      } else if (b.type === 'dialogue' && b.innerBlocks?.length) {
        migrateBlocks(b.innerBlocks);
      } else if (b.type === 'tabs') {
        for (const tab of b.tabs ?? []) {
          migrateBlocks(tab.blocks ?? []);
        }
      } else if (b.type === 'section') {
        migrateBlocks(b.blocks ?? []);
      } else if (b.type === 'table') {
        for (const row of b.rows ?? []) {
          for (const cell of row.cells ?? []) {
            migrateBlocks(cell.blocks ?? []);
          }
        }
      }
    }
  };

  for (const scene of p.scenes) {
    migrateBlocks(scene.blocks);
  }

  // Watchers
  for (const w of p.watchers ?? []) {
    if (w.actions) migrateActions(w.actions);
    migrateNav(w.navigate);
  }

  return p;
}

/**
 * P2 migration: a legacy table-cell `CellContent` widget → the equivalent
 * standalone block(s). Runtime output is preserved; the structured editors for
 * `variable` / `list` / `image-from-var` are intentionally lossy (they become a
 * TextBlock/RawBlock with embedded SugarCube markup — runtime-equivalent).
 */
function cellContentToBlocks(content: any, nodes: VariableTreeNode[]): Block[] {
  if (!content || typeof content !== 'object') return [];
  const pathOf = (vid: string): string => (vid ? (getVariablePath(vid, nodes) || '???') : '???');

  switch (content.type) {
    case 'text':
      return [{ id: uuid(), type: 'text', content: content.value ?? '' } as Block];

    case 'variable': {
      const sv = `$${pathOf(content.variableId)}`;
      return [{ id: uuid(), type: 'text', content: `${content.prefix ?? ''}<<print ${sv}>>${content.suffix ?? ''}` } as Block];
    }

    case 'progress':
      return [{
        id: uuid(), type: 'progress',
        variableId: content.variableId ?? '',
        maxValue: content.maxValue ?? 100,
        color: content.color ?? '#4ade80',
        emptyColor: content.emptyColor ?? '#333333',
        textColor: content.textColor ?? '',
        colorRange: content.colorRange ?? null,
        showText: content.showText ?? false,
        vertical: content.vertical,
        height: 16,
      } as Block];

    case 'image-static':
      return [{ id: uuid(), type: 'image', mode: 'static', src: content.src ?? '', alt: '', width: 0 } as Block];

    case 'image-bound':
      return [{
        id: uuid(), type: 'image', mode: 'bound',
        src: '', alt: '', width: 0,
        variableId: content.variableId ?? '',
        mapping: content.mapping ?? [],
        defaultSrc: content.defaultSrc ?? '',
        genSettings: content.genSettings,
      } as Block];

    case 'image-gen':
      return [{
        id: uuid(), type: 'image-gen',
        provider: 'comfyui',
        workflowFile: content.workflowFile ?? '',
        promptMode: content.promptMode ?? 'manual',
        llmPromptMode: content.llmPromptMode,
        prompt: content.prompt ?? '',
        negativePrompt: content.negativePrompt,
        styleHints: content.styleHints,
        seedMode: content.seedMode ?? 'random',
        seed: content.seed,
        genWidth: content.genWidth,
        genHeight: content.genHeight,
        width: content.width ?? 0,
        alt: content.alt ?? '',
        src: content.src ?? '',
        approvedHistoryId: content.approvedHistoryId,
        lastApprovedDir: content.lastApprovedDir,
        history: content.history,
      } as Block];

    case 'image-from-var': {
      const sv = `$${pathOf(content.variableId)}`;
      return [{ id: uuid(), type: 'raw', code: `<<if ${sv}>><img @src="${sv}" style="max-width:100%;display:block"><</if>>` } as Block];
    }

    case 'raw':
      return [{ id: uuid(), type: 'raw', code: content.code ?? '' } as Block];

    case 'include':
      return [{ id: uuid(), type: 'include', passageName: content.passageName ?? '' } as Block];

    case 'button': {
      const nav = content.navigate;
      if (nav?.type === 'scene' || nav?.type === 'back') {
        return [{
          id: uuid(), type: 'link',
          label: content.label ?? '',
          target: nav.type === 'back' ? 'back' : 'scene',
          targetSceneId: nav.type === 'scene' ? nav.sceneId : undefined,
          actions: content.actions ?? [],
          style: content.style,
        } as Block];
      }
      // No navigation → a plain action button.
      return [{
        id: uuid(), type: 'button',
        label: content.label ?? '',
        style: content.style,
        actions: content.actions ?? [],
      } as Block];
    }

    case 'list': {
      const sv = `$${pathOf(content.variableId)}`;
      const sep = (content.separator || ', ').replace(/"/g, '\\"');
      const inner = `${content.prefix ?? ''}<<print ${sv}.join("${sep}")>>${content.suffix ?? ''}`;
      const code = content.emptyText
        ? `<<if ${sv}.length gt 0>>${inner}<<else>>${content.emptyText}<</if>>`
        : inner;
      return [{ id: uuid(), type: 'text', content: code } as Block];
    }

    case 'audio-volume':
      return [{ id: uuid(), type: 'audio-volume', showMuteButton: content.showMuteButton ?? true } as Block];

    case 'date-time':
      return [{
        id: uuid(), type: 'date-time',
        variableId: content.variableId ?? '',
        displayMode: content.displayMode,
        format: content.format ?? 'DD.MM.YYYY HH:mm',
        prefix: content.prefix,
        suffix: content.suffix,
      } as Block];

    case 'paperdoll':
      return [{ id: uuid(), type: 'paperdoll', charId: content.charId ?? '', showLabels: content.showLabels ?? false } as Block];

    default:
      return [];
  }
}

/**
 * P2 migration: walk every scene's blocks; for each TableBlock cell that still
 * carries the legacy single `content` widget, convert it to `blocks: Block[]`.
 * Idempotent — cells already holding `blocks` are left as-is. Recurses through
 * all container blocks (incl. nested tables inside cells).
 */
function migrateTableCellsToBlocks(p: any): any {
  const nodes: VariableTreeNode[] = p.variableNodes ?? [];
  const walk = (blocks: any[]) => {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks) {
      if (!b || typeof b !== 'object') continue;
      switch (b.type) {
        case 'table':
          for (const row of b.rows ?? []) {
            for (const cell of row.cells ?? []) {
              if (cell && !Array.isArray(cell.blocks)) {
                cell.blocks = cell.content ? cellContentToBlocks(cell.content, nodes) : [];
                delete cell.content;
              }
              walk(cell.blocks);
            }
          }
          break;
        case 'condition':
          for (const br of b.branches ?? []) walk(br.blocks ?? []);
          break;
        case 'dialogue':
          if (b.innerBlocks) walk(b.innerBlocks);
          break;
        case 'tabs':
          for (const tab of b.tabs ?? []) walk(tab.blocks ?? []);
          break;
        case 'section':
          walk(b.blocks ?? []);
          break;
      }
    }
  };
  for (const scene of p.scenes ?? []) walk(scene.blocks ?? []);
  return p;
}

function migrateProject(raw: any): Project {
  let p = { ...raw };

  // variables: Variable[] → variableNodes: VariableTreeNode[]
  if ('variables' in p && !('variableNodes' in p)) {
    p.variableNodes = (p.variables as any[]).map(v => ({ kind: 'variable', ...v }));
    delete p.variables;
  }
  if (!p.variableNodes) p.variableNodes = [];

  // assets: Asset[] → assetNodes: AssetTreeNode[]
  if ('assets' in p && !('assetNodes' in p)) {
    delete p.assets;
  }
  if (!p.assetNodes) p.assetNodes = [];

  // Legacy `sidebarPanel` field — silently dropped (replaced by sidebar-tagged scene).
  if ('sidebarPanel' in p) delete p.sidebarPanel;
  // Legacy `headerImageSrc` / `headerRowId` settings — also dropped (user now puts
  // ImageBlock directly into the StoryCaption scene).
  if (p.settings) {
    delete p.settings.headerImageSrc;
    delete p.settings.headerRowId;
  }

  // Fix Cyrillic variable names created before transliteration was added
  p = migrateCharacterVarNames(p as Project);
  // Add $prefix_avatar variable to characters that predate this feature
  p = migrateCharacterAvatarVar(p as Project);
  // Add avatarConfig to characters that predate this feature
  p = migrateCharacterAvatarConfig(p as Project);
  // Add $prefix_textColor variable to characters that predate this feature
  p = migrateCharacterTextColorVar(p as Project);
  // Add $prefix_llm_descr variable to characters that predate this feature
  p = migrateCharacterLlmDescrVar(p as Project);
  p = migrateCharacterLlmTemperatureVar(p as Project);
  // Add inventory array variable to characters that predate this feature
  p = migrateCharacterInventoryVar(p as Project);
  // Add money number variable to characters that predate this feature
  p = migrateCharacterMoneyVar(p as Project);
  // Ensure every character has initialInventory
  p.characters = (p.characters as any[]).map((c: any) => ({
    ...c,
    initialInventory: c.initialInventory ?? [],
    // paperdoll is optional — no default needed, undefined = feature not used
  }));

  if (!p.watchers) p.watchers = [];
  if (!p.sceneGroups) p.sceneGroups = [];
  if (!p.items) p.items = [];
  if (!p.containers) p.containers = [];
  // Ensure every item has a valid iconConfig (guard against incomplete saved data)
  p.items = (p.items as any[]).map((item: any) => ({
    ...item,
    iconConfig: item.iconConfig ?? { mode: 'static', src: '' },
    customProps: item.customProps ?? [],
  }));
  if (!p.settings) p.settings = { ...DEFAULT_PROJECT_SETTINGS };

  // Custom CSS / JS preserved from imports (or hand-edited). Empty string when absent.
  if (typeof p.customCss !== 'string') p.customCss = '';
  if (typeof p.customScript !== 'string') p.customScript = '';

  // Migrate `ProjectSettings.historyControls` / `saveLoadMenu` → sidebar scene's systemConfig.
  // The settings used to be project-wide; they're conceptually UIBar-wrapper settings, so
  // they belong on the sidebar-tagged scene's systemConfig (per per-scene-config decision).
  // Defaults `true` → no migration needed (absent on systemConfig means default behavior).
  if (p.settings && (p.settings.historyControls === false || p.settings.saveLoadMenu === false)) {
    const sb = p.scenes?.find((s: any) => s.tags?.includes('sidebar'));
    if (sb) {
      const sc = sb.systemConfig && sb.systemConfig.kind === 'sidebar'
        ? sb.systemConfig
        : { kind: 'sidebar' };
      if (p.settings.historyControls === false && sc.historyControls === undefined) {
        sc.historyControls = false;
      }
      if (p.settings.saveLoadMenu === false && sc.saveLoadMenu === undefined) {
        sc.saveLoadMenu = false;
      }
      sb.systemConfig = sc;
    }
    // Always clear the old fields so they don't drift out of sync
    delete p.settings.historyControls;
    delete p.settings.saveLoadMenu;
  } else if (p.settings) {
    // Even when both were true (defaults), just drop the now-unused fields
    delete p.settings.historyControls;
    delete p.settings.saveLoadMenu;
  }

  // Migrate `ProjectSettings.titleColor` / `titleFont` → title scene's systemConfig.
  // The title color/font used to be project-wide; they're now per-scene since title is a
  // system tag (singleton, maps to ::StoryDisplayTitle). When either was set, create or
  // update a title-tagged scene to carry those visual settings; the display title body
  // falls back to the plain project title when the scene's blocks are empty.
  if (p.settings && (p.settings.titleColor || p.settings.titleFont)) {
    let titleScene = p.scenes?.find((s: any) => s.tags?.includes('title'));
    if (!titleScene) {
      titleScene = {
        id: uuid(),
        name: 'StoryDisplayTitle',
        tags: ['title'],
        blocks: [],
      };
      p.scenes = [...(p.scenes ?? []), titleScene];
    }
    const sc = titleScene.systemConfig && titleScene.systemConfig.kind === 'title'
      ? titleScene.systemConfig
      : { kind: 'title' };
    if (p.settings.titleColor && sc.textColor === undefined) sc.textColor = p.settings.titleColor;
    if (p.settings.titleFont  && sc.font      === undefined) sc.font      = p.settings.titleFont;
    titleScene.systemConfig = sc;
  }
  if (p.settings) {
    delete p.settings.titleColor;
    delete p.settings.titleFont;
  }

  // Migrate legacy `ProjectSettings.sidebarColor` → sidebar scene's systemConfig.bgColor.
  // Both used to set the UIBar background; the per-scene config is now the single source.
  if (p.settings && p.settings.sidebarColor) {
    const sb = p.scenes?.find((s: any) => s.tags?.includes('sidebar'));
    if (sb) {
      const sc = sb.systemConfig && sb.systemConfig.kind === 'sidebar'
        ? sb.systemConfig
        : { kind: 'sidebar' };
      if (sc.bgColor === undefined || sc.bgColor === '') sc.bgColor = p.settings.sidebarColor;
      sb.systemConfig = sc;
    }
  }
  if (p.settings) delete p.settings.sidebarColor;

  // Canonical name of the title scene changed 'StoryTitle' → 'StoryDisplayTitle' (it
  // exports as ::StoryDisplayTitle, not the plain ::StoryTitle). Rename any title-tagged
  // scene still carrying the old canonical name so the editor label matches the passage.
  if (Array.isArray(p.scenes)) {
    for (const sc of p.scenes) {
      if (sc?.tags?.includes('title') && sc.name === 'StoryTitle') sc.name = 'StoryDisplayTitle';
    }
  }

  // P2: convert legacy table cells (single CellContent) → cells holding Block[].
  // Must run BEFORE migrateSceneLinks so the link/button blocks it produces get
  // their scene-name refs resolved to IDs by that pass.
  p = migrateTableCellsToBlocks(p);

  // Migrate targetSceneId / navigate.sceneId from scene NAMES → scene IDs
  p = migrateSceneLinks(p as Project);

  return p as Project;
}

function findAssetNodeById(nodes: AssetTreeNode[], id: string): AssetTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.kind === 'group') { const f = findAssetNodeById(n.children, id); if (f) return f; }
  }
  return null;
}

// ─── Store shape ──────────────────────────────────────────────────────────────

type SidebarTabId = 'scenes' | 'characters' | 'variables' | 'assets' | 'watchers' | 'items' | 'containers' | 'plugins' | 'validate';

interface ProjectState {
  project: Project;
  activeSceneId: string | null;
  activeSidebarTab: SidebarTabId;
  sidebarWidth: number;
  projectDir: string | null;

  setProjectDir: (dir: string | null) => void;
  setProjectTitle: (title: string) => void;
  updateProjectMeta: (patch: Partial<Pick<Project, 'title' | 'author' | 'description' | 'lore' | 'settings'>>) => void;
  loadProject: (project: Project, dir?: string) => void;
  resetProject: () => void;
  setSidebarTab: (tab: SidebarTabId) => void;
  setSidebarWidth: (width: number) => void;
  fixVariableNames: () => void;

  // History / undo / redo
  _history: Project[];
  _future: Project[];
  canUndo: boolean;
  canRedo: boolean;
  saveSnapshot: () => void;
  undo: () => void;
  redo: () => void;

  // Scenes
  setActiveScene: (id: string) => void;
  addScene: () => void;
  addSceneWithData: (data: { name: string; tags: string[]; notes?: string }) => void;
  /** Find or create a popup scene containing an InventoryBlock for the given character. Returns sceneId. */
  findOrCreateInventoryPopup: (charId: string) => string;
  deleteScene: (id: string) => void;
  renameScene: (id: string, name: string) => void;
  updateSceneNote: (id: string, notes: string | undefined) => void;
  updateSceneGraphPosition: (id: string, x: number, y: number) => void;
  updateSceneTags: (id: string, tags: string[]) => void;
  updateSceneSettings: (id: string, data: { name: string; tags: string[]; notes?: string; background?: import('../types').SceneBackground; systemConfig?: import('../types').SystemSceneConfig }) => void;
  /** Patch `systemConfig` of a scene with a singleton system tag (e.g. sidebar settings). */
  updateSceneSystemConfig: (id: string, patch: Partial<import('../types').SystemSceneConfig>) => void;
  reorderScenes: (scenes: Scene[]) => void;
  duplicateScene: (sceneId: string) => void;
  makeStartScene: (sceneId: string) => void;

  // Scene groups
  addSceneGroup: (data: { name: string; notes?: string }) => void;
  updateSceneGroup: (id: string, patch: Partial<SceneGroup>) => void;
  deleteSceneGroup: (id: string) => void;
  deleteSceneGroupWithScenes: (id: string) => void;
  moveSceneToGroup: (sceneId: string, groupId: string | null, overId: string | null) => void;
  reorderGroupScenes: (reorderedScenes: Scene[]) => void;

  // Blocks
  addBlock: (sceneId: string, block: Block, insertIndex?: number) => void;
  updateBlock: (sceneId: string, blockId: string, patch: Partial<Block>) => void;
  /** Replace a top-level block with zero or more new blocks (and optionally set
   *  a fresh variableNodes tree — used by the "Re-recognize raw block" action). */
  replaceBlock: (sceneId: string, blockId: string, newBlocks: Block[], newVariableNodes?: VariableTreeNode[]) => void;
  deleteBlock: (sceneId: string, blockId: string) => void;
  reorderBlocks: (sceneId: string, blocks: Block[]) => void;
  duplicateBlock: (sceneId: string, blockId: string) => void;
  pasteToScene: (sceneId: string, block: Block, insertIndex?: number) => void;

  // Nested blocks (condition branches)
  addNestedBlock: (sceneId: string, blockId: string, branchId: string, block: Block) => void;
  updateNestedBlock: (sceneId: string, blockId: string, branchId: string, nestedBlockId: string, patch: Partial<Block>) => void;
  deleteNestedBlock: (sceneId: string, blockId: string, branchId: string, nestedBlockId: string) => void;
  reorderNestedBlocks: (sceneId: string, conditionBlockId: string, branchId: string, blocks: Block[]) => void;
  duplicateNestedBlock: (sceneId: string, conditionBlockId: string, branchId: string, nestedBlockId: string) => void;
  pasteToNested: (sceneId: string, conditionBlockId: string, branchId: string, block: Block) => void;

  // Dialogue inner blocks
  addDialogueInnerBlock: (sceneId: string, dialogueBlockId: string, block: Block) => void;
  updateDialogueInnerBlock: (sceneId: string, dialogueBlockId: string, innerBlockId: string, patch: Partial<Block>) => void;
  deleteDialogueInnerBlock: (sceneId: string, dialogueBlockId: string, innerBlockId: string) => void;
  reorderDialogueInnerBlocks: (sceneId: string, dialogueBlockId: string, blocks: Block[]) => void;

  // TabsBlock — tab CRUD
  addTab: (sceneId: string, tabsBlockId: string, label: string) => void;
  removeTab: (sceneId: string, tabsBlockId: string, tabId: string) => void;
  renameTab: (sceneId: string, tabsBlockId: string, tabId: string, label: string) => void;
  reorderTabs: (sceneId: string, tabsBlockId: string, tabs: { id: string; label: string; blocks: Block[] }[]) => void;
  // TabsBlock — nested block CRUD (inside a tab)
  addBlockToTab: (sceneId: string, tabsBlockId: string, tabId: string, block: Block) => void;
  updateBlockInTab: (sceneId: string, tabsBlockId: string, tabId: string, blockId: string, patch: Partial<Block>) => void;
  deleteBlockFromTab: (sceneId: string, tabsBlockId: string, tabId: string, blockId: string) => void;
  reorderBlocksInTab: (sceneId: string, tabsBlockId: string, tabId: string, blocks: Block[]) => void;
  duplicateBlockInTab: (sceneId: string, tabsBlockId: string, tabId: string, blockId: string) => void;

  // Choice options
  addChoiceOption: (sceneId: string, blockId: string) => void;
  updateChoiceOption: (sceneId: string, blockId: string, optionId: string, patch: Partial<ChoiceOption>) => void;
  deleteChoiceOption: (sceneId: string, blockId: string, optionId: string) => void;

  // Condition branches
  addConditionBranch: (sceneId: string, blockId: string) => void;
  updateConditionBranch: (sceneId: string, blockId: string, branchId: string, patch: Partial<ConditionBranch>) => void;
  deleteConditionBranch: (sceneId: string, blockId: string, branchId: string) => void;

  // Characters
  addCharacter: (char: Omit<Character, 'id'>, pregenIds?: CharacterVarIds, pendingNodes?: VariableTreeNode[]) => string;
  updateCharacter: (id: string, patch: Partial<Character>) => void;
  deleteCharacter: (id: string) => void;

  // Paperdoll
  setPaperdollConfig: (charId: string, config: PaperdollConfig | undefined) => void;
  addPaperdollSlot: (charId: string, slot: Omit<PaperdollSlot, 'id'>) => void;
  updatePaperdollSlot: (charId: string, slotId: string, patch: Partial<Omit<PaperdollSlot, 'id'>>) => void;
  deletePaperdollSlot: (charId: string, slotId: string) => void;

  // Items
  addItem: (item: Omit<ItemDefinition, 'id' | 'varIds'>) => string;
  updateItem: (id: string, patch: Partial<Omit<ItemDefinition, 'id' | 'varIds'>>) => void;
  deleteItem: (id: string) => void;

  // Containers
  addContainer: (data: Omit<ContainerDefinition, 'id' | 'varIds'>) => string;
  updateContainer: (id: string, patch: Partial<Omit<ContainerDefinition, 'id' | 'varIds'>>) => void;
  deleteContainer: (id: string) => void;

  // Watchers
  addWatcher: () => void;
  updateWatcher: (id: string, patch: Partial<Watcher>) => void;
  deleteWatcher: (id: string) => void;

  // Variable tree
  addVariableGroup: (parentId: string | null, name: string) => void;
  addVariable: (parentId: string | null, v: Omit<Variable, 'id' | 'kind'>) => void;
  updateVariable: (id: string, patch: Partial<Variable>) => void;
  deleteVariableNode: (id: string) => void;

  // Asset tree
  addAssetGroup: (parentGroupId: string | null, name: string, relativePath: string) => void;
  renameAssetGroup: (id: string, name: string, newRelativePath: string) => void;
  addAsset: (parentGroupId: string | null, a: Omit<Asset, 'id' | 'kind'>) => void;
  deleteAssetNode: (id: string) => void;
  /** Replace assetNodes wholesale (used by filesystem sync, no undo snapshot) */
  syncAssets: (nodes: AssetTreeNode[]) => void;

}

// ─── Panel helpers ────────────────────────────────────────────────────────────

/**
 * Distributes 100% width equally among cells, fixing rounding on the first cell.
 * Preserves the relative proportions of cells that already have non-zero widths.
 * For new cells (width=0) — just divide equally.
 */
export function redistributeWidths(cells: SidebarCell[]): SidebarCell[] {
  if (cells.length === 0) return cells;
  const equal = Math.floor(100 / cells.length);
  const remainder = 100 - equal * cells.length;
  return cells.map((c, i) => ({ ...c, width: equal + (i === 0 ? remainder : 0) }));
}

// ─── Inner updaters ───────────────────────────────────────────────────────────

function updateScene(project: Project, sceneId: string, updater: (s: Scene) => Scene): Project {
  return { ...project, scenes: project.scenes.map(s => s.id === sceneId ? updater(s) : s) };
}

function updateBlockInScene(scene: Scene, blockId: string, updater: (b: Block) => Block): Scene {
  return { ...scene, blocks: scene.blocks.map(b => b.id === blockId ? updater(b) : b) };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => {
      const defaultProject = makeDefaultProject();
      return {
        project: defaultProject,
        activeSceneId: defaultProject.scenes[0].id,
        activeSidebarTab: 'scenes',
        sidebarWidth: 340,
        projectDir: null,
        _history: [],
        _future: [],
        canUndo: false,
        canRedo: false,

        setProjectDir: (dir) => set({ projectDir: dir }),

        setProjectTitle: (title) => {
          get().saveSnapshot();
          set(s => ({ project: { ...s.project, title } }));
        },

        updateProjectMeta: (patch) => {
          get().saveSnapshot();
          set(s => ({ project: { ...s.project, ...patch } }));
        },

        loadProject: (rawProject, dir) => {
          const project = migrateProject(rawProject);
          set({
            project,
            activeSceneId: project.scenes[0]?.id ?? null,
            ...(dir !== undefined ? { projectDir: dir } : {}),
            _history: [], _future: [], canUndo: false, canRedo: false,
          });
        },

        resetProject: () => {
          const p = makeDefaultProject();
          set({ project: p, activeSceneId: p.scenes[0].id, projectDir: null, _history: [], _future: [], canUndo: false, canRedo: false });
        },

        setSidebarTab: (tab) => set({ activeSidebarTab: tab }),
        setSidebarWidth: (width) => set({ sidebarWidth: Math.max(220, Math.min(600, width)) }),

        // Run migration via set() so it's reactive + persisted.
        // Called once on app mount to handle HMR / warm-reload scenarios
        // where onRehydrateStorage doesn't re-run.
        fixVariableNames: () =>
          set(s => {
            const step1 = migrateCharacterVarNames(s.project);
            const step2 = migrateCharacterAvatarVar(step1);
            const step3 = migrateCharacterAvatarConfig(step2);
            const step4 = migrateCharacterTextColorVar(step3);
            const step5 = migrateCharacterLlmDescrVar(step4);
            const step6 = migrateCharacterLlmTemperatureVar(step5);
            return step6 === s.project ? s : { project: step6 };
          }),

        // ── History / Undo / Redo ────────────────────────────────────────────

        saveSnapshot: () => {
          const s = get();
          // Skip if project hasn't changed since the last snapshot
          const last = s._history[s._history.length - 1];
          if (last === s.project) return;
          const history = [...s._history, s.project];
          if (history.length > HISTORY_LIMIT) history.shift();
          set({ _history: history, _future: [], canUndo: true, canRedo: false });
        },

        undo: () => {
          const s = get();
          if (s._history.length === 0) return;
          const previous = s._history[s._history.length - 1];
          const newHistory = s._history.slice(0, -1);
          set({
            project: previous,
            _history: newHistory,
            _future: [s.project, ...s._future],
            canUndo: newHistory.length > 0,
            canRedo: true,
          });
        },

        redo: () => {
          const s = get();
          if (s._future.length === 0) return;
          const next = s._future[0];
          const newFuture = s._future.slice(1);
          set({
            project: next,
            _history: [...s._history, s.project],
            _future: newFuture,
            canUndo: true,
            canRedo: newFuture.length > 0,
          });
        },

        // ── Scenes ──────────────────────────────────────────────────────────

        setActiveScene: (id) => set({ activeSceneId: id }),

        addScene: () => {
          get().saveSnapshot();
          const id = uuid();
          const name = `Scene ${get().project.scenes.length + 1}`;
          const scene: Scene = { id, name, tags: [], blocks: [] };
          set(s => ({
            project: { ...s.project, scenes: [...s.project.scenes, scene] },
            activeSceneId: id,
          }));
        },

        addSceneWithData: ({ name, tags, notes }) => {
          get().saveSnapshot();
          const id = uuid();
          set(s => {
            // Singleton system tag handling: force-rename to canonical name and
            // strip the tag from any other scene that had it (mirrors updateSceneSettings).
            const forcedName = canonicalNameForTags(tags);
            const finalName = forcedName ?? name;
            // Pre-fill the title scene with one TextBlock holding the current project
            // title, so users see an immediately editable starting point rather than a
            // blank canvas. StoryMenu is intentionally NOT pre-filled: SugarCube's
            // built-in `#menu-core` already shows Saves/Restart, so duplicating them in
            // `::StoryMenu` (`#menu-story`) would render two identical sets of buttons.
            // sidebar/menu/passage-header/passage-footer start empty.
            const initialBlocks: Block[] = [];
            if (tags.includes('title')) {
              initialBlocks.push({ id: uuid(), type: 'text', content: s.project.title });
            }
            const scene: Scene = { id, name: finalName, tags, blocks: initialBlocks, notes: notes || undefined };
            // Initialize systemConfig for sidebar tag so the new scene's UIBar
            // settings are wired to the existing $sidePanel.* variables (if any).
            if (tags.includes('sidebar')) {
              const vars = flattenVariables(s.project.variableNodes);
              const findVar = (leafName: string) => vars.find(v =>
                getVariablePath(v.id, s.project.variableNodes) === `sidePanel.${leafName}`
              );
              const ids = {
                hidden:             findVar('hidden')?.id,
                width:              findVar('width')?.id,
                position:           findVar('position')?.id,
                initiallyCollapsed: findVar('initiallyCollapsed')?.id,
                allowCollapse:      findVar('allowCollapse')?.id,
                bgColor:            findVar('bgColor')?.id,
                show_history:       findVar('show_history')?.id,
                show_saves:         findVar('show_saves')?.id,
              };
              const allFound = Object.values(ids).every(v => v != null);
              if (allFound) {
                scene.systemConfig = {
                  kind: 'sidebar',
                  hidden:             { variableId: ids.hidden! },
                  width:              { variableId: ids.width! },
                  position:           { variableId: ids.position! },
                  initiallyCollapsed: { variableId: ids.initiallyCollapsed! },
                  allowCollapse:      { variableId: ids.allowCollapse! },
                  bgColor:            { variableId: ids.bgColor! },
                  historyControls:    { variableId: ids.show_history! },
                  saveLoadMenu:       { variableId: ids.show_saves! },
                };
              }
            }
            const enforcedScenes = enforceSingletonSystemTags(s.project.scenes, id, tags);
            return {
              project: { ...s.project, scenes: [...enforcedScenes, scene] },
              activeSceneId: id,
            };
          });
        },

        findOrCreateInventoryPopup: (charId) => {
          const state = get();
          // 1. Reuse an existing popup scene that already has an inventory block for this character.
          const existing = state.project.scenes.find(sc =>
            sc.tags.includes('popup') &&
            sc.blocks.some(b => b.type === 'inventory' && (b as { charId?: string }).charId === charId)
          );
          if (existing) return existing.id;

          // 2. Otherwise create a new popup scene with an InventoryBlock inside.
          get().saveSnapshot();
          const char = state.project.characters.find(c => c.id === charId);
          const baseName = char ? `Inventory: ${char.name}` : 'Inventory';
          // Ensure unique scene name
          const existingNames = new Set(state.project.scenes.map(s => s.name));
          let sceneName = baseName;
          let i = 2;
          while (existingNames.has(sceneName)) sceneName = `${baseName} ${i++}`;

          const sceneId = uuid();
          const block: Block = { id: uuid(), type: 'inventory', charId };
          const scene: Scene = {
            id: sceneId, name: sceneName, tags: ['popup'],
            blocks: [block],
          };
          set(s => ({ project: { ...s.project, scenes: [...s.project.scenes, scene] } }));
          return sceneId;
        },

        deleteScene: (id) => {
          get().saveSnapshot();
          set(s => {
            const scenes = s.project.scenes.filter(sc => sc.id !== id);
            const activeSceneId = s.activeSceneId === id ? (scenes[0]?.id ?? null) : s.activeSceneId;
            return { project: { ...s.project, scenes }, activeSceneId };
          });
        },

        renameScene: (id, name) => {
          get().saveSnapshot();
          set(s => ({ project: updateScene(s.project, id, sc => ({ ...sc, name })) }));
        },

        updateSceneNote: (id, notes) => {
          get().saveSnapshot();
          set(s => ({ project: updateScene(s.project, id, sc => ({ ...sc, notes })) }));
        },

        // No undo snapshot — graph position is a cosmetic UI preference
        updateSceneGraphPosition: (id, x, y) => {
          set(s => ({ project: updateScene(s.project, id, sc => ({ ...sc, graphPosition: { x, y } })) }));
        },

        updateSceneTags: (id, tags) => {
          get().saveSnapshot();
          // Protect start tag: preserve it if scene had it, strip it if scene didn't
          set(s => {
            const scene = s.project.scenes.find(sc => sc.id === id);
            if (!scene) return s;
            const hadStart = scene.tags.includes(START_TAG);
            const safeTags = hadStart
              ? (tags.includes(START_TAG) ? tags : [START_TAG, ...tags])
              : tags.filter(t => t !== START_TAG);
            const enforcedScenes = enforceSingletonSystemTags(s.project.scenes, id, safeTags);
            const forcedName = canonicalNameForTags(safeTags);  // force-rename if singleton system tag claims a canonical name
            const finalScenes = enforcedScenes.map(sc =>
              sc.id === id ? { ...sc, tags: safeTags, name: forcedName ?? sc.name } : sc
            );
            return { project: { ...s.project, scenes: finalScenes } };
          });
        },

        updateSceneSettings: (id, { name, tags, notes, background, systemConfig }) => {
          get().saveSnapshot();
          // Protect start tag: preserve it if scene had it, strip it if scene didn't
          set(s => {
            const scene = s.project.scenes.find(sc => sc.id === id);
            if (!scene) return s;
            const hadStart = scene.tags.includes(START_TAG);
            const safeTags = hadStart
              ? (tags.includes(START_TAG) ? tags : [START_TAG, ...tags])
              : tags.filter(t => t !== START_TAG);
            const enforcedScenes = enforceSingletonSystemTags(s.project.scenes, id, safeTags);
            const forcedName = canonicalNameForTags(safeTags);  // override caller-provided name when singleton system tag claims a canonical name
            const finalScenes = enforcedScenes.map(sc =>
              sc.id === id ? {
                ...sc,
                name: forcedName ?? name,
                tags: safeTags,
                notes: notes || undefined,
                background: background || undefined,
                // Only carry systemConfig if scene has a singleton system tag — otherwise clear it
                systemConfig: safeTags.some(t => (SYSTEM_TAGS as readonly string[]).includes(t) && SYSTEM_TAG_KIND[t as SystemTag] === 'singleton')
                  ? (systemConfig ?? sc.systemConfig)
                  : undefined,
              } : sc
            );
            return { project: { ...s.project, scenes: finalScenes } };
          });
        },

        updateSceneSystemConfig: (id, patch) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, id, sc => {
              if (!sc.systemConfig) {
                // First write — require kind to be inferable from tags (sidebar tag → kind 'sidebar')
                if (sc.tags.includes('sidebar')) {
                  return { ...sc, systemConfig: { kind: 'sidebar', ...patch } as import('../types').SystemSceneConfig };
                }
                return sc;
              }
              return { ...sc, systemConfig: { ...sc.systemConfig, ...patch } as import('../types').SystemSceneConfig };
            }),
          }));
        },

        reorderScenes: (scenes) => {
          get().saveSnapshot();
          set(s => ({ project: { ...s.project, scenes } }));
        },

        duplicateScene: (sceneId) => {
          get().saveSnapshot();
          set(s => {
            const original = s.project.scenes.find(sc => sc.id === sceneId);
            if (!original) return s;
            const clone: Scene = {
              ...original,
              id: uuid(),
              name: `${original.name} (copy)`,
              tags: original.tags.filter(t => t !== START_TAG),
              blocks: original.blocks.map(deepCloneBlock),
            };
            const idx = s.project.scenes.findIndex(sc => sc.id === sceneId);
            const scenes = [...s.project.scenes];
            scenes.splice(idx + 1, 0, clone);
            return {
              project: { ...s.project, scenes },
              activeSceneId: clone.id,
            };
          });
        },

        makeStartScene: (sceneId) => {
          get().saveSnapshot();
          set(s => ({
            project: {
              ...s.project,
              scenes: s.project.scenes.map(sc => {
                const hasStart = sc.tags.includes(START_TAG);
                if (sc.id === sceneId && !hasStart) return { ...sc, tags: [START_TAG, ...sc.tags] };
                if (sc.id !== sceneId && hasStart) return { ...sc, tags: sc.tags.filter(t => t !== START_TAG) };
                return sc;
              }),
            },
          }));
        },

        // ── Scene groups ─────────────────────────────────────────────────────

        addSceneGroup: ({ name, notes }) => {
          get().saveSnapshot();
          const id = uuid();
          set(s => ({
            project: { ...s.project, sceneGroups: [...s.project.sceneGroups, { id, name, notes }] },
          }));
        },

        updateSceneGroup: (id, patch) => {
          set(s => ({
            project: {
              ...s.project,
              sceneGroups: s.project.sceneGroups.map(g => g.id === id ? { ...g, ...patch } : g),
            },
          }));
        },

        deleteSceneGroup: (id) => {
          get().saveSnapshot();
          set(s => ({
            project: {
              ...s.project,
              sceneGroups: s.project.sceneGroups.filter(g => g.id !== id),
              scenes: s.project.scenes.map(sc =>
                sc.groupId === id ? { ...sc, groupId: undefined } : sc,
              ),
            },
          }));
        },

        deleteSceneGroupWithScenes: (id) => {
          // Prevent deletion if the group contains the start scene
          const hasStart = get().project.scenes.some(sc => sc.groupId === id && sc.tags.includes(START_TAG));
          if (hasStart) return;
          get().saveSnapshot();
          set(s => {
            const remaining = s.project.scenes.filter(sc => sc.groupId !== id);
            const activeSceneId = remaining.some(sc => sc.id === s.activeSceneId)
              ? s.activeSceneId
              : (remaining[0]?.id ?? null);
            return {
              project: {
                ...s.project,
                sceneGroups: s.project.sceneGroups.filter(g => g.id !== id),
                scenes: remaining,
              },
              activeSceneId,
            };
          });
        },

        moveSceneToGroup: (sceneId, groupId, overId) => {
          get().saveSnapshot();
          set(s => {
            const scenes = [...s.project.scenes];
            const idx = scenes.findIndex(sc => sc.id === sceneId);
            if (idx === -1) return s;

            const movedScene: Scene = { ...scenes[idx] };
            if (groupId) movedScene.groupId = groupId;
            else delete movedScene.groupId;

            scenes.splice(idx, 1);

            if (overId) {
              const overIdx = scenes.findIndex(sc => sc.id === overId);
              if (overIdx !== -1) {
                scenes.splice(overIdx + 1, 0, movedScene);
                return { project: { ...s.project, scenes } };
              }
            }

            // Append after the last scene in the target group (or ungrouped block)
            let insertAt = -1;
            for (let i = scenes.length - 1; i >= 0; i--) {
              const scGroupId = scenes[i].groupId ?? null;
              if (scGroupId === groupId) { insertAt = i + 1; break; }
            }
            if (insertAt === -1) scenes.push(movedScene);
            else scenes.splice(insertAt, 0, movedScene);

            return { project: { ...s.project, scenes } };
          });
        },

        reorderGroupScenes: (reorderedScenes) => {
          get().saveSnapshot();
          set(s => {
            if (reorderedScenes.length === 0) return s;
            const groupId = reorderedScenes[0].groupId ?? null;
            const allScenes = s.project.scenes;

            // Collect the positions of scenes belonging to this group
            const positions: number[] = [];
            allScenes.forEach((sc, i) => {
              if ((sc.groupId ?? null) === groupId) positions.push(i);
            });

            const newScenes = [...allScenes];
            reorderedScenes.forEach((sc, i) => { newScenes[positions[i]] = sc; });
            return { project: { ...s.project, scenes: newScenes } };
          });
        },

        // ── Blocks ──────────────────────────────────────────────────────────

        addBlock: (sceneId, block, insertIndex) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc => {
              const blocks = [...sc.blocks];
              if (insertIndex !== undefined) blocks.splice(insertIndex, 0, block);
              else blocks.push(block);
              return { ...sc, blocks };
            }),
          }));
        },

        updateBlock: (sceneId, blockId, patch) =>
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, blockId, b => ({ ...b, ...patch } as Block))
            ),
          })),

        replaceBlock: (sceneId, blockId, newBlocks, newVariableNodes) => {
          get().saveSnapshot();
          set(s => {
            const proj = updateScene(s.project, sceneId, sc => {
              const idx = sc.blocks.findIndex(b => b.id === blockId);
              if (idx < 0) return sc;
              const blocks = [...sc.blocks.slice(0, idx), ...newBlocks, ...sc.blocks.slice(idx + 1)];
              return { ...sc, blocks };
            });
            return {
              project: newVariableNodes !== undefined
                ? { ...proj, variableNodes: newVariableNodes }
                : proj,
            };
          });
        },

        deleteBlock: (sceneId, blockId) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc => ({
              ...sc, blocks: sc.blocks.filter(b => b.id !== blockId),
            })),
          }));
        },

        reorderBlocks: (sceneId, blocks) => {
          get().saveSnapshot();
          set(s => ({ project: updateScene(s.project, sceneId, sc => ({ ...sc, blocks })) }));
        },

        duplicateBlock: (sceneId, blockId) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc => {
              const idx = sc.blocks.findIndex(b => b.id === blockId);
              if (idx === -1) return sc;
              const blocks = [...sc.blocks];
              blocks.splice(idx + 1, 0, deepCloneBlock(sc.blocks[idx]));
              return { ...sc, blocks };
            }),
          }));
        },

        pasteToScene: (sceneId, block, insertIndex) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc => {
              const cloned = deepCloneBlock(block);
              const blocks = [...sc.blocks];
              if (insertIndex !== undefined) blocks.splice(insertIndex, 0, cloned);
              else blocks.push(cloned);
              return { ...sc, blocks };
            }),
          }));
        },

        // ── Nested blocks ─────────────────────────────────────────────────────

        addNestedBlock: (sceneId, blockId, branchId, block) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, blockId, b => {
                if (b.type !== 'condition') return b;
                return {
                  ...b,
                  branches: b.branches.map(br =>
                    br.id === branchId ? { ...br, blocks: [...br.blocks, block] } : br
                  ),
                };
              })
            ),
          }));
        },

        updateNestedBlock: (sceneId, blockId, branchId, nestedBlockId, patch) =>
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, blockId, b => {
                if (b.type !== 'condition') return b;
                return {
                  ...b,
                  branches: b.branches.map(br =>
                    br.id === branchId
                      ? { ...br, blocks: br.blocks.map(nb => nb.id === nestedBlockId ? { ...nb, ...patch } as Block : nb) }
                      : br
                  ),
                };
              })
            ),
          })),

        deleteNestedBlock: (sceneId, blockId, branchId, nestedBlockId) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, blockId, b => {
                if (b.type !== 'condition') return b;
                return {
                  ...b,
                  branches: b.branches.map(br =>
                    br.id === branchId
                      ? { ...br, blocks: br.blocks.filter(nb => nb.id !== nestedBlockId) }
                      : br
                  ),
                };
              })
            ),
          }));
        },

        reorderNestedBlocks: (sceneId, conditionBlockId, branchId, blocks) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, conditionBlockId, b => {
                if (b.type !== 'condition') return b;
                return {
                  ...b,
                  branches: b.branches.map(br =>
                    br.id === branchId ? { ...br, blocks } : br
                  ),
                };
              })
            ),
          }));
        },

        duplicateNestedBlock: (sceneId, conditionBlockId, branchId, nestedBlockId) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, conditionBlockId, b => {
                if (b.type !== 'condition') return b;
                return {
                  ...b,
                  branches: b.branches.map(br => {
                    if (br.id !== branchId) return br;
                    const idx = br.blocks.findIndex(nb => nb.id === nestedBlockId);
                    if (idx === -1) return br;
                    const blocks = [...br.blocks];
                    blocks.splice(idx + 1, 0, deepCloneBlock(br.blocks[idx]));
                    return { ...br, blocks };
                  }),
                };
              })
            ),
          }));
        },

        pasteToNested: (sceneId, conditionBlockId, branchId, block) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, conditionBlockId, b => {
                if (b.type !== 'condition') return b;
                return {
                  ...b,
                  branches: b.branches.map(br =>
                    br.id === branchId
                      ? { ...br, blocks: [...br.blocks, deepCloneBlock(block)] }
                      : br
                  ),
                };
              })
            ),
          }));
        },

        // ── Dialogue inner blocks ─────────────────────────────────────────────

        addDialogueInnerBlock: (sceneId, dialogueBlockId, block) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, dialogueBlockId, b => {
                if (b.type !== 'dialogue') return b;
                return { ...b, innerBlocks: [...(b.innerBlocks ?? []), block] };
              })
            ),
          }));
        },

        updateDialogueInnerBlock: (sceneId, dialogueBlockId, innerBlockId, patch) =>
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, dialogueBlockId, b => {
                if (b.type !== 'dialogue') return b;
                return {
                  ...b,
                  innerBlocks: (b.innerBlocks ?? []).map(ib =>
                    ib.id === innerBlockId ? { ...ib, ...patch } as Block : ib
                  ),
                };
              })
            ),
          })),

        deleteDialogueInnerBlock: (sceneId, dialogueBlockId, innerBlockId) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, dialogueBlockId, b => {
                if (b.type !== 'dialogue') return b;
                return { ...b, innerBlocks: (b.innerBlocks ?? []).filter(ib => ib.id !== innerBlockId) };
              })
            ),
          }));
        },

        reorderDialogueInnerBlocks: (sceneId, dialogueBlockId, blocks) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, dialogueBlockId, b => {
                if (b.type !== 'dialogue') return b;
                return { ...b, innerBlocks: blocks };
              })
            ),
          }));
        },

        // ── TabsBlock: tab CRUD ──────────────────────────────────────────────

        addTab: (sceneId, tabsBlockId, label) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, tabsBlockId, b => {
                if (b.type !== 'tabs') return b;
                return { ...b, tabs: [...b.tabs, { id: uuid(), label, blocks: [] }] };
              })
            ),
          }));
        },

        removeTab: (sceneId, tabsBlockId, tabId) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, tabsBlockId, b => {
                if (b.type !== 'tabs') return b;
                return { ...b, tabs: b.tabs.filter(t => t.id !== tabId) };
              })
            ),
          }));
        },

        renameTab: (sceneId, tabsBlockId, tabId, label) =>
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, tabsBlockId, b => {
                if (b.type !== 'tabs') return b;
                return { ...b, tabs: b.tabs.map(t => t.id === tabId ? { ...t, label } : t) };
              })
            ),
          })),

        reorderTabs: (sceneId, tabsBlockId, tabs) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, tabsBlockId, b => {
                if (b.type !== 'tabs') return b;
                return { ...b, tabs };
              })
            ),
          }));
        },

        // ── TabsBlock: nested block CRUD (inside a specific tab) ─────────────

        addBlockToTab: (sceneId, tabsBlockId, tabId, block) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, tabsBlockId, b => {
                if (b.type !== 'tabs') return b;
                return {
                  ...b,
                  tabs: b.tabs.map(t =>
                    t.id === tabId ? { ...t, blocks: [...t.blocks, block] } : t
                  ),
                };
              })
            ),
          }));
        },

        updateBlockInTab: (sceneId, tabsBlockId, tabId, blockId, patch) =>
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, tabsBlockId, b => {
                if (b.type !== 'tabs') return b;
                return {
                  ...b,
                  tabs: b.tabs.map(t =>
                    t.id === tabId
                      ? { ...t, blocks: t.blocks.map(nb => nb.id === blockId ? { ...nb, ...patch } as Block : nb) }
                      : t
                  ),
                };
              })
            ),
          })),

        deleteBlockFromTab: (sceneId, tabsBlockId, tabId, blockId) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, tabsBlockId, b => {
                if (b.type !== 'tabs') return b;
                return {
                  ...b,
                  tabs: b.tabs.map(t =>
                    t.id === tabId
                      ? { ...t, blocks: t.blocks.filter(nb => nb.id !== blockId) }
                      : t
                  ),
                };
              })
            ),
          }));
        },

        reorderBlocksInTab: (sceneId, tabsBlockId, tabId, blocks) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, tabsBlockId, b => {
                if (b.type !== 'tabs') return b;
                return {
                  ...b,
                  tabs: b.tabs.map(t => t.id === tabId ? { ...t, blocks } : t),
                };
              })
            ),
          }));
        },

        duplicateBlockInTab: (sceneId, tabsBlockId, tabId, blockId) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, tabsBlockId, b => {
                if (b.type !== 'tabs') return b;
                return {
                  ...b,
                  tabs: b.tabs.map(t => {
                    if (t.id !== tabId) return t;
                    const idx = t.blocks.findIndex(nb => nb.id === blockId);
                    if (idx === -1) return t;
                    const blocks = [...t.blocks];
                    blocks.splice(idx + 1, 0, deepCloneBlock(t.blocks[idx]));
                    return { ...t, blocks };
                  }),
                };
              })
            ),
          }));
        },

        // ── Choice options ────────────────────────────────────────────────────

        addChoiceOption: (sceneId, blockId) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, blockId, b => {
                if (b.type !== 'choice') return b;
                const opt: ChoiceOption = { id: uuid(), label: 'Option', targetSceneId: '', condition: '' };
                return { ...b, options: [...b.options, opt] };
              })
            ),
          }));
        },

        updateChoiceOption: (sceneId, blockId, optionId, patch) =>
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, blockId, b => {
                if (b.type !== 'choice') return b;
                return { ...b, options: b.options.map(o => o.id === optionId ? { ...o, ...patch } : o) };
              })
            ),
          })),

        deleteChoiceOption: (sceneId, blockId, optionId) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, blockId, b => {
                if (b.type !== 'choice') return b;
                return { ...b, options: b.options.filter(o => o.id !== optionId) };
              })
            ),
          }));
        },

        // ── Condition branches ─────────────────────────────────────────────────

        addConditionBranch: (sceneId, blockId) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, blockId, b => {
                if (b.type !== 'condition') return b;
                const hasElse = b.branches.some(br => br.branchType === 'else');
                if (hasElse) return b;
                const isFirst = b.branches.length === 0;
                const branch: ConditionBranch = {
                  id: uuid(), branchType: isFirst ? 'if' : 'elseif',
                  variableId: '', operator: '==', value: '', blocks: [],
                };
                return { ...b, branches: [...b.branches, branch] };
              })
            ),
          }));
        },

        updateConditionBranch: (sceneId, blockId, branchId, patch) =>
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, blockId, b => {
                if (b.type !== 'condition') return b;
                return { ...b, branches: b.branches.map(br => br.id === branchId ? { ...br, ...patch } : br) };
              })
            ),
          })),

        deleteConditionBranch: (sceneId, blockId, branchId) => {
          get().saveSnapshot();
          set(s => ({
            project: updateScene(s.project, sceneId, sc =>
              updateBlockInScene(sc, blockId, b => {
                if (b.type !== 'condition') return b;
                return { ...b, branches: b.branches.filter(br => br.id !== branchId) };
              })
            ),
          }));
        },

        // ── Characters ────────────────────────────────────────────────────────

        addCharacter: (char, pregenIds, pendingNodes) => {
          get().saveSnapshot();
          const charId = uuid();
          set(s => {
            const { group, varIds } = buildCharVarNodes(char.name, char.varName || charToVarPrefix(char.name), {
              bgColor: char.bgColor,
              borderColor: char.borderColor,
              nameColor: char.nameColor,
              textColor: char.textColor ?? '#e2e8f0',
              avatarConfig: char.avatarConfig,
              llm_descr: char.llm_descr,
              llm_temperature: char.llm_temperature,
            }, pregenIds, pendingNodes);
            let finalGroup = group;
            let finalVarIds = varIds;

            // If the character has paperdoll slots, create the equipment VariableGroup + slot vars
            if (char.paperdoll?.slots?.length) {
              const equipmentGroupId = uuid();
              const slotVars = char.paperdoll.slots.map(sl => ({
                kind: 'variable' as const,
                id: uuid(),
                name: sl.id,
                varType: 'string' as const,
                defaultValue: '',
                description: `Paperdoll slot "${sl.label}" for character "${char.name}"`,
              }));
              const equipmentGroup: VariableGroup = {
                kind: 'group', id: equipmentGroupId,
                name: 'equipment',
                children: slotVars,
              };
              finalGroup = { ...group, children: [...group.children, equipmentGroup] };
              finalVarIds = { ...varIds, equipmentGroupId };
            }

            const character: Character = { ...char, id: charId, varIds: finalVarIds };
            return {
              project: {
                ...s.project,
                characters: [...s.project.characters, character],
                variableNodes: [...s.project.variableNodes, finalGroup],
              },
            };
          });
          return charId;
        },

        updateCharacter: (id, patch) =>
          set(s => {
            const oldChar = s.project.characters.find(c => c.id === id);
            if (!oldChar) return s;

            // If setting isHero = true, clear it from all other characters first
            let characters = s.project.characters;
            if (patch.isHero === true) {
              characters = characters.map(c => c.id === id ? c : { ...c, isHero: false });
            }

            const updatedChar: Character = { ...oldChar, ...patch };
            let variableNodes = s.project.variableNodes;

            if (oldChar.varIds) {
              const { varIds } = oldChar;

              // Display name changed → update name var's defaultValue + descriptions
              if (patch.name !== undefined && patch.name !== oldChar.name) {
                variableNodes = updateVarInTree(variableNodes, varIds.nameVarId, {
                  defaultValue: patch.name,
                  description: `Character name "${patch.name}"`,
                });
                if (varIds.avatarVarId) {
                  variableNodes = updateVarInTree(variableNodes, varIds.avatarVarId, {
                    description: `Avatar URL for character "${patch.name}" (empty = hidden)`,
                  });
                }
                if (varIds.llmDescrVarId) {
                  variableNodes = updateVarInTree(variableNodes, varIds.llmDescrVarId, {
                    description: `LLM personality description for "${patch.name}"`,
                  });
                }
              }

              // Variable name changed → rename group
              if (patch.varName !== undefined) {
                const oldVarName = oldChar.varName || charToVarPrefix(oldChar.name);
                if (patch.varName !== oldVarName) {
                  variableNodes = updateGroupNameInTree(variableNodes, varIds.groupId, patch.varName);
                }
              }

              // Color changes → sync defaultValues
              if (patch.bgColor !== undefined) {
                variableNodes = updateVarInTree(variableNodes, varIds.bgColorVarId, { defaultValue: patch.bgColor });
              }
              if (patch.borderColor !== undefined) {
                variableNodes = updateVarInTree(variableNodes, varIds.borderColorVarId, { defaultValue: patch.borderColor });
              }
              if (patch.nameColor !== undefined) {
                variableNodes = updateVarInTree(variableNodes, varIds.nameColorVarId, { defaultValue: patch.nameColor });
              }
              if (patch.textColor !== undefined && varIds.textColorVarId) {
                variableNodes = updateVarInTree(variableNodes, varIds.textColorVarId, { defaultValue: patch.textColor });
              }
              // Avatar config change → sync $prefix_avatar defaultValue (static src only)
              if (patch.avatarConfig !== undefined && varIds.avatarVarId) {
                const defaultValue = patch.avatarConfig.mode === 'static' ? patch.avatarConfig.src : '';
                variableNodes = updateVarInTree(variableNodes, varIds.avatarVarId, { defaultValue });
              }
              // LLM description change → sync $prefix_llm_descr defaultValue
              if (patch.llm_descr !== undefined && varIds.llmDescrVarId) {
                variableNodes = updateVarInTree(variableNodes, varIds.llmDescrVarId, { defaultValue: patch.llm_descr });
              }
              // LLM temperature change → sync $prefix_llm_temperature defaultValue
              if (patch.llm_temperature !== undefined && varIds.llmTemperatureVarId) {
                variableNodes = updateVarInTree(variableNodes, varIds.llmTemperatureVarId, { defaultValue: String(patch.llm_temperature) });
              }
            }

            return {
              project: {
                ...s.project,
                characters: characters.map(c => c.id === id ? updatedChar : c),
                variableNodes,
              },
            };
          }),

        deleteCharacter: (id) => {
          get().saveSnapshot();
          set(s => {
            const char = s.project.characters.find(c => c.id === id);
            const variableNodes = char?.varIds
              ? removeNode(s.project.variableNodes as AnyNode[], char.varIds.groupId) as VariableTreeNode[]
              : s.project.variableNodes;
            return {
              project: {
                ...s.project,
                characters: s.project.characters.filter(c => c.id !== id),
                variableNodes,
              },
            };
          });
        },

        // ── Paperdoll ─────────────────────────────────────────────────────────

        setPaperdollConfig: (charId, config) =>
          set(s => ({
            project: {
              ...s.project,
              characters: s.project.characters.map(c =>
                c.id === charId ? { ...c, paperdoll: config } : c,
              ),
            },
          })),

        addPaperdollSlot: (charId, slotData) => {
          get().saveSnapshot();
          set(s => {
            const char = s.project.characters.find(c => c.id === charId);
            if (!char?.varIds) return s;

            // Derive a clean variable-friendly ID from the label
            const base = (slotData.label || 'slot')
              .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            const safeBase = /^[a-z]/.test(base) ? base || 'slot' : 'slot';
            const existing = char.paperdoll?.slots ?? [];
            let slotId = safeBase;
            let n = 2;
            while (existing.some(s => s.id === slotId)) { slotId = `${safeBase}${n++}`; }

            const slot: PaperdollSlot = { ...slotData, id: slotId };

            // Find or create equipment VariableGroup under this character's group
            const { nodes: varNodes, equipmentGroupId } = findOrCreateCharEquipmentGroup(
              s.project.variableNodes,
              char.varIds.groupId,
              char.varIds.equipmentGroupId,
            );

            // Add a string variable for this slot (default = "" = nothing equipped)
            const slotVar: Variable = {
              kind: 'variable', id: uuid(),
              name: slotId,
              varType: 'string',
              defaultValue: '',
              description: `Paperdoll slot "${slot.label}" for character "${char.name}"`,
            };
            const finalNodes = addNode(varNodes as AnyNode[], equipmentGroupId, slotVar as AnyNode) as VariableTreeNode[];

            const updatedPaperdoll: PaperdollConfig = {
              gridCols: char.paperdoll?.gridCols ?? 3,
              gridRows: char.paperdoll?.gridRows ?? 4,
              cellSize: char.paperdoll?.cellSize ?? 64,
              slots: [...(char.paperdoll?.slots ?? []), slot],
            };
            const updatedVarIds: typeof char.varIds = { ...char.varIds, equipmentGroupId };

            return {
              project: {
                ...s.project,
                variableNodes: finalNodes,
                characters: s.project.characters.map(c =>
                  c.id === charId
                    ? { ...c, paperdoll: updatedPaperdoll, varIds: updatedVarIds }
                    : c,
                ),
              },
            };
          });
        },

        updatePaperdollSlot: (charId, slotId, patch) =>
          set(s => ({
            project: {
              ...s.project,
              characters: s.project.characters.map(c => {
                if (c.id !== charId || !c.paperdoll) return c;
                return {
                  ...c,
                  paperdoll: {
                    ...c.paperdoll,
                    slots: c.paperdoll.slots.map(sl =>
                      sl.id === slotId ? { ...sl, ...patch } : sl,
                    ),
                  },
                };
              }),
            },
          })),

        deletePaperdollSlot: (charId, slotId) => {
          get().saveSnapshot();
          set(s => {
            const char = s.project.characters.find(c => c.id === charId);
            if (!char?.paperdoll) return s;

            // Remove the slot variable from the equipment group
            // The variable name equals slotId, find it by name inside the equipment group
            let variableNodes = s.project.variableNodes;
            if (char.varIds?.equipmentGroupId) {
              // Find the variable node with name === slotId inside the equipment group
              const findVarId = (nodes: VariableTreeNode[], groupId: string, varName: string): string | null => {
                for (const n of nodes) {
                  if (n.kind === 'group' && n.id === groupId) {
                    const v = n.children.find(ch => ch.kind === 'variable' && ch.name === varName);
                    return v ? v.id : null;
                  }
                  if (n.kind === 'group') {
                    const found = findVarId(n.children, groupId, varName);
                    if (found) return found;
                  }
                }
                return null;
              };
              const varId = findVarId(variableNodes, char.varIds.equipmentGroupId, slotId);
              if (varId) {
                variableNodes = removeNode(variableNodes as AnyNode[], varId) as VariableTreeNode[];
              }
            }

            const updatedPaperdoll: PaperdollConfig = {
              ...char.paperdoll,
              slots: char.paperdoll.slots.filter(sl => sl.id !== slotId),
            };

            return {
              project: {
                ...s.project,
                variableNodes,
                characters: s.project.characters.map(c =>
                  c.id === charId ? { ...c, paperdoll: updatedPaperdoll } : c,
                ),
              },
            };
          });
        },

        // ── Items ─────────────────────────────────────────────────────────────

        addItem: (itemData) => {
          get().saveSnapshot();
          const itemId = uuid();
          set(s => {
            // Find or create 'items' root VariableGroup
            const { nodes: varNodes1, rootGroupId } = findOrCreateItemsRootGroup(s.project.variableNodes);
            // Build item variable subtree
            const { itemGroup, varIds } = buildItemVarNodes(
              { ...itemData, iconSrc: itemData.iconConfig.src },
              rootGroupId,
            );
            // Add custom props as variables inside the item group
            let finalItemGroup = itemGroup;
            if (itemData.customProps.length > 0) {
              const propVars: Variable[] = itemData.customProps.map(p => ({
                kind: 'variable' as const,
                id: p.id || uuid(),
                name: p.name,
                varType: p.varType as 'number' | 'string' | 'boolean',
                defaultValue: p.defaultValue,
                description: '',
              }));
              finalItemGroup = { ...itemGroup, children: [...itemGroup.children, ...propVars] };
            }
            // Insert item group under root
            const varNodes2 = addNode(varNodes1 as AnyNode[], rootGroupId, finalItemGroup as AnyNode) as VariableTreeNode[];
            // Find or create assets/Items folder
            const { nodes: assetNodes } = findOrCreateItemsAssetFolder(s.project.assetNodes);
            // Create [func] scene for consumable use-effects
            let scenes = s.project.scenes;
            let useFuncSceneId: string | undefined;
            if (itemData.category === 'consumable') {
              useFuncSceneId = uuid();
              const funcScene: Scene = {
                id: useFuncSceneId,
                name: `tg_use_${itemData.varName}`,
                tags: ['func'],
                blocks: [],
              };
              scenes = [...scenes, funcScene];
            }
            const item: ItemDefinition = { ...itemData, id: itemId, varIds, useFuncSceneId };
            return {
              project: {
                ...s.project,
                items: [...(s.project.items ?? []), item],
                variableNodes: varNodes2,
                assetNodes,
                scenes,
              },
            };
          });
          return itemId;
        },

        updateItem: (id, patch) => {
          get().saveSnapshot();
          set(s => {
            const item = (s.project.items ?? []).find(it => it.id === id);
            if (!item) return s;
            const updatedItem: ItemDefinition = { ...item, ...patch };
            let variableNodes = s.project.variableNodes;
            if (item.varIds) {
              const { varIds } = item;
              // Sync name variable
              if (patch.name !== undefined && patch.name !== item.name) {
                variableNodes = updateVarInTree(variableNodes, varIds.nameVarId, {
                  defaultValue: patch.name,
                  description: `Display name for item "${patch.name}"`,
                });
              }
              // Sync description variable
              if (patch.description !== undefined && varIds.descVarId) {
                variableNodes = updateVarInTree(variableNodes, varIds.descVarId, {
                  defaultValue: patch.description,
                });
              }
              // Sync icon variable
              if (patch.iconConfig !== undefined) {
                variableNodes = updateVarInTree(variableNodes, varIds.iconVarId, {
                  defaultValue: patch.iconConfig.src,
                });
              }
              // Sync stackable variable
              if (patch.stackable !== undefined) {
                variableNodes = updateVarInTree(variableNodes, varIds.stackableVarId, {
                  defaultValue: patch.stackable ? 'true' : 'false',
                });
              }
              // Sync slot variable (wearable only) — normalize to match slot IDs (lowercase_underscore)
              if (patch.targetSlot !== undefined && varIds.slotVarId) {
                variableNodes = updateVarInTree(variableNodes, varIds.slotVarId, {
                  defaultValue: (patch.targetSlot || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
                });
              }
            }
            return {
              project: {
                ...s.project,
                items: (s.project.items ?? []).map(it => it.id === id ? updatedItem : it),
                variableNodes,
              },
            };
          });
        },

        deleteItem: (id) => {
          get().saveSnapshot();
          set(s => {
            const item = (s.project.items ?? []).find(it => it.id === id);
            // Remove item's variable group
            const variableNodes = item?.varIds
              ? removeNode(s.project.variableNodes as AnyNode[], item.varIds.groupId) as VariableTreeNode[]
              : s.project.variableNodes;
            // Remove consumable func-scene
            const scenes = item?.useFuncSceneId
              ? s.project.scenes.filter(sc => sc.id !== item.useFuncSceneId)
              : s.project.scenes;
            return {
              project: {
                ...s.project,
                items: (s.project.items ?? []).filter(it => it.id !== id),
                variableNodes,
                scenes,
              },
            };
          });
        },

        // ── Containers ────────────────────────────────────────────────────────

        addContainer: (data) => {
          get().saveSnapshot();
          const containerId = uuid();
          set(s => {
            const { nodes: varNodes1, rootGroupId } = findOrCreateContainersRootGroup(s.project.variableNodes);
            const { containerGroup, varIds } = buildContainerVarNodes(data, rootGroupId);
            const varNodes2 = addNode(varNodes1 as AnyNode[], rootGroupId, containerGroup as AnyNode) as VariableTreeNode[];
            const container: ContainerDefinition = { ...data, id: containerId, varIds };
            return {
              project: {
                ...s.project,
                containers: [...(s.project.containers ?? []), container],
                variableNodes: varNodes2,
              },
            };
          });
          return containerId;
        },

        updateContainer: (id, patch) => {
          get().saveSnapshot();
          set(s => {
            const container = (s.project.containers ?? []).find(c => c.id === id);
            if (!container) return s;
            const updated: ContainerDefinition = { ...container, ...patch };
            let variableNodes = s.project.variableNodes;
            // If initialItems changed, update the items variable's defaultValue
            if (patch.initialItems !== undefined && container.varIds) {
              variableNodes = updateVarInTree(variableNodes, container.varIds.itemsVarId, {
                defaultValue: buildContainerItemsLiteral(patch.initialItems),
              });
            }
            return {
              project: {
                ...s.project,
                containers: (s.project.containers ?? []).map(c => c.id === id ? updated : c),
                variableNodes,
              },
            };
          });
        },

        deleteContainer: (id) => {
          get().saveSnapshot();
          set(s => {
            const container = (s.project.containers ?? []).find(c => c.id === id);
            const variableNodes = container?.varIds
              ? removeNode(s.project.variableNodes as AnyNode[], container.varIds.groupId) as VariableTreeNode[]
              : s.project.variableNodes;
            return {
              project: {
                ...s.project,
                containers: (s.project.containers ?? []).filter(c => c.id !== id),
                variableNodes,
              },
            };
          });
        },

        // ── Watchers ───────────────────────────────────────────────────────────

        addWatcher: () => {
          get().saveSnapshot();
          const w: Watcher = {
            id: uuid(),
            label: '',
            enabled: true,
            condition: { variableId: '', operator: '==', value: '' },
            actions: [],
          };
          set(s => ({ project: { ...s.project, watchers: [...(s.project.watchers ?? []), w] } }));
        },

        updateWatcher: (id, patch) => {
          get().saveSnapshot();
          set(s => ({
            project: {
              ...s.project,
              watchers: (s.project.watchers ?? []).map(w => w.id === id ? { ...w, ...patch } : w),
            },
          }));
        },

        deleteWatcher: (id) => {
          get().saveSnapshot();
          set(s => ({
            project: {
              ...s.project,
              watchers: (s.project.watchers ?? []).filter(w => w.id !== id),
            },
          }));
        },

        // ── Variable tree ──────────────────────────────────────────────────────

        addVariableGroup: (parentId, name) => {
          get().saveSnapshot();
          const siblings = getSiblings(get().project.variableNodes, parentId);
          const safeName = ensureUniqueName(name, siblings);
          const group: VariableGroup = { kind: 'group', id: uuid(), name: safeName, children: [] };
          set(s => ({
            project: {
              ...s.project,
              variableNodes: addNode(s.project.variableNodes as AnyNode[], parentId, group as AnyNode) as VariableTreeNode[],
            },
          }));
        },

        addVariable: (parentId, v) => {
          get().saveSnapshot();
          const siblings = getSiblings(get().project.variableNodes, parentId);
          const safeName = ensureUniqueName(v.name, siblings);
          const variable: Variable = { kind: 'variable', id: uuid(), ...v, name: safeName };
          set(s => ({
            project: {
              ...s.project,
              variableNodes: addNode(s.project.variableNodes as AnyNode[], parentId, variable as AnyNode) as VariableTreeNode[],
            },
          }));
        },

        updateVariable: (id, patch) =>
          set(s => ({
            project: {
              ...s.project,
              variableNodes: updateVarInTree(s.project.variableNodes, id, patch),
            },
          })),

        deleteVariableNode: (id) => {
          get().saveSnapshot();
          set(s => ({
            project: {
              ...s.project,
              variableNodes: removeNode(s.project.variableNodes as AnyNode[], id) as VariableTreeNode[],
            },
          }));
        },

        // ── Asset tree ────────────────────────────────────────────────────────

        addAssetGroup: (parentGroupId, name, relativePath) => {
          get().saveSnapshot();
          const group: AssetGroup = { kind: 'group', id: uuid(), name, relativePath, children: [] };
          set(s => ({
            project: {
              ...s.project,
              assetNodes: addNode(s.project.assetNodes as AnyNode[], parentGroupId, group as AnyNode) as AssetTreeNode[],
            },
          }));
        },

        renameAssetGroup: (id, name, newRelativePath) =>
          set(s => {
            const node = findAssetNodeById(s.project.assetNodes, id);
            if (!node || node.kind !== 'group') return s;
            return {
              project: {
                ...s.project,
                assetNodes: renameGroupInAssetTree(s.project.assetNodes, id, name, node.relativePath, newRelativePath),
              },
            };
          }),

        addAsset: (parentGroupId, a) => {
          get().saveSnapshot();
          const asset: Asset = { kind: 'asset', id: uuid(), ...a };
          set(s => ({
            project: {
              ...s.project,
              assetNodes: addNode(s.project.assetNodes as AnyNode[], parentGroupId, asset as AnyNode) as AssetTreeNode[],
            },
          }));
        },

        deleteAssetNode: (id) => {
          get().saveSnapshot();
          set(s => ({
            project: {
              ...s.project,
              assetNodes: removeNode(s.project.assetNodes as AnyNode[], id) as AssetTreeNode[],
            },
          }));
        },

        syncAssets: (nodes) =>
          set(s => ({ project: { ...s.project, assetNodes: nodes } })),

      };
    },
    {
      name: 'purl-project',
      storage: createJSONStorage(() => makeDebouncedLocalStorage(500)),
      partialize: (state) => ({
        project: state.project,
        activeSceneId: state.activeSceneId,
        activeSidebarTab: state.activeSidebarTab,
        sidebarWidth: state.sidebarWidth,
        projectDir: state.projectDir,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.project) {
          state.project = migrateProject(state.project);
        }
        // Migrate retired sidebar tabs (the 🗂️ panel tab was removed when sidebar-as-scene shipped)
        if (state && (state.activeSidebarTab as string) === 'panel') {
          state.activeSidebarTab = 'scenes';
        }
      },
    }
  )
);

if (typeof window !== 'undefined') {
  (window as unknown as { __store: typeof useProjectStore }).__store = useProjectStore;
}
