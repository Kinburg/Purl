import type { Block, ButtonAction } from '../types';

/**
 * The kind of navigation a block performs. Drives scene-graph edge styling and
 * (later) story-validator messages.
 *  - choice      — a ChoiceBlock option (`<<goto>>`)
 *  - link        — a LinkBlock targeting a scene
 *  - menu-link   — a MenuLinkBlock targeting a scene
 *  - function    — a FunctionBlock calling a `func` scene (`<<include>>` side-effect)
 *  - popup       — a PopupBlock auto-opening a `popup` scene as a Dialog
 *  - open-popup  — an OpenPopupAction (on button/link/function/menu-link) opening a popup
 *  - include     — an IncludeBlock embedding a passage
 */
export type NavKind =
  | 'choice'
  | 'link'
  | 'menu-link'
  | 'function'
  | 'popup'
  | 'open-popup'
  | 'include';

/** One navigation reference discovered inside a scene's block tree. */
export interface NavRef {
  /** Scene id (for `include`, the passage id) this navigation points at. */
  targetId: string;
  kind: NavKind;
  /** Human label for the edge (choice option text, button label, popup title, …). May be empty. */
  label: string;
  /** Id of the block / option / action that produced this ref — unique per occurrence. */
  viaId: string;
}

export interface CollectNavOptions {
  /** Resolve a plugin id to its definition so plugin bodies are walked too. Optional. */
  getPluginDef?: (pluginId: string) => { blocks: Block[] } | undefined;
}

/** Extract open-popup navigation from a block's action list. */
function actionRefs(actions: ButtonAction[] | undefined): NavRef[] {
  const refs: NavRef[] = [];
  for (const a of actions ?? []) {
    if (a.type === 'open-popup' && a.targetSceneId) {
      refs.push({ targetId: a.targetSceneId, kind: 'open-popup', label: a.title?.trim() ?? '', viaId: a.id });
    }
  }
  return refs;
}

/**
 * Recursively collect every scene-to-scene navigation reference inside `blocks`.
 *
 * This is the SUPERSET counterpart to exportToTwee's `collectSceneTargets`: it
 * also reports popup / open-popup / include, returns ids (not names) tagged with
 * a `kind` + label, and does NOT dedupe (the graph shows every link as its own
 * edge, like it already does for each choice option). Both the scene graph and
 * the story validator consume this single source of truth.
 *
 * Walker descends the canonical container arms — condition branches,
 * dialogue.innerBlocks, tabs, section, for, table cells, and (optionally) plugin
 * bodies — exactly like every other recursive block walker in the codebase.
 */
export function collectNavRefs(blocks: Block[], opts: CollectNavOptions = {}): NavRef[] {
  const refs: NavRef[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'choice':
        for (const opt of b.options) {
          if (opt.targetSceneId) refs.push({ targetId: opt.targetSceneId, kind: 'choice', label: opt.label, viaId: opt.id });
        }
        break;
      case 'link':
        if (b.target === 'scene' && b.targetSceneId) refs.push({ targetId: b.targetSceneId, kind: 'link', label: b.label, viaId: b.id });
        refs.push(...actionRefs(b.actions));
        break;
      case 'menu-link':
        if (b.target === 'scene' && b.targetSceneId) refs.push({ targetId: b.targetSceneId, kind: 'menu-link', label: b.label, viaId: b.id });
        refs.push(...actionRefs(b.actions));
        break;
      case 'function':
        if (b.targetSceneId) refs.push({ targetId: b.targetSceneId, kind: 'function', label: b.label, viaId: b.id });
        refs.push(...actionRefs(b.actions));
        break;
      case 'button':
        refs.push(...actionRefs(b.actions));
        break;
      case 'popup':
        if (b.targetSceneId) refs.push({ targetId: b.targetSceneId, kind: 'popup', label: b.title?.trim() ?? '', viaId: b.id });
        break;
      case 'include':
        if (b.passageName) refs.push({ targetId: b.passageName, kind: 'include', label: '', viaId: b.id });
        break;
      case 'condition':
        for (const branch of b.branches) refs.push(...collectNavRefs(branch.blocks, opts));
        break;
      case 'dialogue':
        if (b.innerBlocks?.length) refs.push(...collectNavRefs(b.innerBlocks, opts));
        break;
      case 'tabs':
        for (const tab of b.tabs) refs.push(...collectNavRefs(tab.blocks, opts));
        break;
      case 'section':
        refs.push(...collectNavRefs(b.blocks, opts));
        break;
      case 'for':
        refs.push(...collectNavRefs(b.blocks, opts));
        break;
      case 'table':
        for (const row of b.rows) for (const cell of row.cells) refs.push(...collectNavRefs(cell.blocks, opts));
        break;
      case 'plugin': {
        const def = opts.getPluginDef?.(b.pluginId);
        if (def) refs.push(...collectNavRefs(def.blocks, opts));
        break;
      }
    }
  }
  return refs;
}
