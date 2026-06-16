import type {
  Project, Block, CharacterVarIds,
  Variable, VariableTreeNode,
  AvatarConfig, AvatarMode,
} from '../types';
import { uuid } from './ids';
import { charToVarPrefix } from './factories/characterVars';
import { addNode, updateVarInTree, flattenVariables, getVariablePath, type AnyNode } from '../utils/treeUtils';
import { DEFAULT_PROJECT_SETTINGS } from './defaults';

// ─── Project migration ────────────────────────────────────────────────────────

/**
 * Fix character variable names that were created with Cyrillic prefixes
 * (before transliteration was introduced). Runs idempotently.
 */
export function migrateCharacterVarNames(p: Project): Project {
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
export function migrateCharacterAvatarVar(p: Project): Project {
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
export function migrateCharacterTextColorVar(p: Project): Project {
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
export function migrateCharacterLlmDescrVar(p: Project): Project {
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
export function migrateCharacterLlmTemperatureVar(p: Project): Project {
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

/**
 * Add avatarConfig to characters created before AvatarConfig was introduced.
 * Converts legacy avatarUrl → avatarConfig { mode: 'static', src: avatarUrl }.
 * Runs idempotently (skips characters that already have avatarConfig).
 */
export function migrateCharacterAvatarConfig(p: Project): Project {
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

/**
 * Structural guard for an untrusted parsed `.purl` file before it is trusted as a
 * Project. A file can be valid JSON yet structurally wrong (hand-edited, truncated,
 * or simply the wrong file). We require the load-bearing shape — a plain object with
 * a `scenes` array; `migrateProject()` backfills everything else. Use this at the
 * file-open boundary to reject garbage with a clear error instead of silently
 * replacing the open project. Mirrors `pluginStore.normalizePluginDef`.
 */
export function isProjectFile(raw: unknown): raw is Project {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw)
    && Array.isArray((raw as { scenes?: unknown }).scenes);
}

export function migrateProject(raw: any): Project {
  // Defensive coercion: a corrupt/hand-edited file or stale localStorage may be valid
  // JSON but structurally wrong. Coerce the load-bearing collections to safe defaults
  // so the migrate*/map pipeline below can't throw deep with a confusing stack. This
  // keeps onRehydrateStorage (app boot) robust; the Header open flow additionally
  // rejects non-Project files up front via isProjectFile(). Note: variableNodes /
  // assetNodes are intentionally NOT defaulted here — the legacy `variables`→
  // `variableNodes` rename below keys on their absence.
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  let p: any = { ...src };
  if (!Array.isArray(p.scenes)) p.scenes = [];
  if (!Array.isArray(p.characters)) p.characters = [];
  if (!Array.isArray(p.sceneGroups)) p.sceneGroups = [];
  if (!Array.isArray(p.items)) p.items = [];
  if (!Array.isArray(p.containers)) p.containers = [];
  if (!Array.isArray(p.watchers)) p.watchers = [];
  if (p.settings == null || typeof p.settings !== 'object') p.settings = {};
  if (typeof p.title !== 'string') p.title = 'Untitled';

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
  if (!p.quests) p.quests = [];
  if (!p.questCategories) p.questCategories = [];
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

