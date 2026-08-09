// ─── Recursive block-tree operations (scene-wide, addressed by id) ─────────────
//
// A scene's blocks form a tree: six block types hold nested Block[] arrays —
//   condition → branches[].blocks   (container id = branch.id)
//   tabs      → tabs[].blocks        (container id = tab.id)
//   table     → rows[].cells[].blocks(container id = cell.id)
//   dialogue  → innerBlocks          (container id = the dialogue block's own id)
//   section   → blocks               (container id = the section block's own id)
//   for       → blocks               (container id = the for block's own id)
//
// These helpers find / remove / insert blocks anywhere in that tree by id. They
// mirror the read-only walkers in storyStats.ts / navTargets.ts, but return NEW
// immutable trees (unchanged sub-arrays keep their reference so callers can dedup).
//
// Used by the drag-to-nest feature: a single scene-level DndContext moves a block
// from one container to another via projectStore.moveBlockToContainer, which is
// built on removeBlockById + insertIntoContainer.

import type { Block, BlockType } from '../types';

/** Sentinel container id for the scene's top-level `scene.blocks` array. */
export const ROOT_CONTAINER = '__scene_root__';

// ─── Container kinds & nesting rules ────────────────────────────────────────────
//
// A drag source/target carries its ContainerKind so the drop handler and the store
// can decide what may nest where. Single source of truth for both the AddBlockMenu
// `excludeTypes` and drop validation (drag must not let a block into a container its
// editor can't render, nor into one the design forbids).

export type ContainerKind = 'scene' | 'branch' | 'tab' | 'dialogue' | 'section' | 'for';

// Every block type is nestable — the shared InnerBlockEditor renders them all and
// the export supports any block inside any container. The only per-container limits
// left are editorial: `note` is meaningless inside control-flow (branch/for), and a
// dialogue bubble refuses a few structural blocks (its historical policy).

/** Extra types a dialogue bubble refuses (keeps the current DialogueBlock policy). */
const DIALOGUE_EXCLUDE: BlockType[] = ['dialogue', 'condition', 'choice', 'button', 'input-field'];

/** Block types NOT allowed inside a nested container of the given kind (for AddBlockMenu excludeTypes). */
export function excludedTypesFor(kind: Exclude<ContainerKind, 'scene'>): BlockType[] {
  if (kind === 'branch' || kind === 'for') return ['note'];
  if (kind === 'dialogue') return [...DIALOGUE_EXCLUDE];
  return []; // tab, section — anything goes
}

/** Whether a block of `type` may be dropped into a container of `kind`. Scene root accepts everything. */
export function containerAccepts(kind: ContainerKind, type: BlockType): boolean {
  if (kind === 'scene') return true;
  return !excludedTypesFor(kind).includes(type);
}

// ─── Drag-and-drop payloads (shared by SceneEditor + NestedBlockList) ────────────

/** dnd-kit `data` attached to a sortable block inside any container. */
export interface BlockDragData {
  type: 'block';
  containerId: string;
  containerKind: ContainerKind;
  index: number;
  /** The dragged block's own type — lets collision detection reject invalid targets live. */
  blockType: BlockType;
}
/** dnd-kit `data` attached to a container's droppable region (empty-space / append target). */
export interface ContainerDropData {
  type: 'container';
  containerId: string;
  containerKind: ContainerKind;
}
/** DOM id for a container's droppable region. Kept distinct from block ids so a
 *  dialogue/section/for block (whose container id equals its own block id) doesn't
 *  register two droppables under the same id. */
export const containerDropId = (containerId: string) => `drop:${containerId}`;

/**
 * All droppable ids that live INSIDE `block`'s own subtree — every descendant block
 * (sortable-item ids) plus every nested container's drop-region id. Collision
 * detection skips these while dragging `block` so it can't be dropped into itself
 * or any of its own descendants (the store would no-op anyway; this suppresses the
 * misleading highlight). Excludes `block`'s own item id (handled separately).
 */
export function collectDescendantDropIds(block: Block): Set<string> {
  const ids = new Set<string>();
  const walkArray = (blocks: Block[]) => { for (const b of blocks) { ids.add(b.id); walk(b); } };
  const walk = (b: Block) => {
    switch (b.type) {
      case 'condition': for (const br of b.branches) { ids.add(containerDropId(br.id)); walkArray(br.blocks); } break;
      case 'tabs':      for (const tb of b.tabs)     { ids.add(containerDropId(tb.id)); walkArray(tb.blocks); } break;
      case 'table':     for (const row of b.rows) for (const cell of row.cells) { ids.add(containerDropId(cell.id)); walkArray(cell.blocks); } break;
      case 'dialogue':  ids.add(containerDropId(b.id)); if (b.innerBlocks) walkArray(b.innerBlocks); break;
      case 'section':
      case 'for':       ids.add(containerDropId(b.id)); walkArray(b.blocks); break;
    }
  };
  walk(block);
  return ids;
}

/** Recursively find a block by id anywhere in the tree. */
export function findBlockById(blocks: Block[], id: string): Block | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    const found = findInChildren(b, id);
    if (found) return found;
  }
  return null;
}

function findInChildren(b: Block, id: string): Block | null {
  switch (b.type) {
    case 'condition':
      for (const br of b.branches) { const f = findBlockById(br.blocks, id); if (f) return f; }
      return null;
    case 'tabs':
      for (const tb of b.tabs) { const f = findBlockById(tb.blocks, id); if (f) return f; }
      return null;
    case 'table':
      for (const row of b.rows) for (const cell of row.cells) { const f = findBlockById(cell.blocks, id); if (f) return f; }
      return null;
    case 'dialogue':
      return b.innerBlocks ? findBlockById(b.innerBlocks, id) : null;
    case 'section':
    case 'for':
      return findBlockById(b.blocks, id);
    default:
      return null;
  }
}

// ─── Remove by id (returns the removed block, identity preserved for MOVE) ──────

/**
 * Return a new tree with the block `id` removed from wherever it lives, plus the
 * removed block itself. The removed object is returned AS-IS (id and children
 * preserved) — for a MOVE, re-insert it directly; do NOT deepCloneBlock (that
 * regenerates ids and is only for copy/duplicate).
 * Unchanged sub-arrays keep their reference (`removed === null` ⇒ same tree back).
 */
export function removeBlockById(blocks: Block[], id: string): { blocks: Block[]; removed: Block | null } {
  const holder: { removed: Block | null } = { removed: null };
  const next = removeFromArray(blocks, id, holder);
  return { blocks: next, removed: holder.removed };
}

function removeFromArray(blocks: Block[], id: string, holder: { removed: Block | null }): Block[] {
  let changed = false;
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.id === id) { holder.removed = b; changed = true; continue; }
    const nb = removeFromBlock(b, id, holder);
    if (nb !== b) changed = true;
    out.push(nb);
  }
  return changed ? out : blocks;
}

function removeFromBlock(b: Block, id: string, holder: { removed: Block | null }): Block {
  switch (b.type) {
    case 'condition': {
      let changed = false;
      const branches = b.branches.map(br => {
        const blocks = removeFromArray(br.blocks, id, holder);
        if (blocks !== br.blocks) { changed = true; return { ...br, blocks }; }
        return br;
      });
      return changed ? { ...b, branches } : b;
    }
    case 'tabs': {
      let changed = false;
      const tabs = b.tabs.map(tb => {
        const blocks = removeFromArray(tb.blocks, id, holder);
        if (blocks !== tb.blocks) { changed = true; return { ...tb, blocks }; }
        return tb;
      });
      return changed ? { ...b, tabs } : b;
    }
    case 'table': {
      let changed = false;
      const rows = b.rows.map(row => {
        let rowChanged = false;
        const cells = row.cells.map(cell => {
          const blocks = removeFromArray(cell.blocks, id, holder);
          if (blocks !== cell.blocks) { rowChanged = true; return { ...cell, blocks }; }
          return cell;
        });
        if (rowChanged) { changed = true; return { ...row, cells }; }
        return row;
      });
      return changed ? { ...b, rows } : b;
    }
    case 'dialogue': {
      if (!b.innerBlocks) return b;
      const innerBlocks = removeFromArray(b.innerBlocks, id, holder);
      return innerBlocks !== b.innerBlocks ? { ...b, innerBlocks } : b;
    }
    case 'section':
    case 'for': {
      const blocks = removeFromArray(b.blocks, id, holder);
      return blocks !== b.blocks ? { ...b, blocks } : b;
    }
    default:
      return b;
  }
}

// ─── Insert into a container by id ──────────────────────────────────────────────

/**
 * Insert `toInsert` into the container identified by `containerId` at `index`
 * (undefined ⇒ append). `containerId` matches a branch.id / tab.id / cell.id, OR
 * the own id of a dialogue / section / for block. Returns `ok: false` if no such
 * container exists in the tree — the caller treats that as a no-op (this is also
 * how the cycle-guard works: after removing a moved subtree, a target container
 * that lived inside it is gone, so the whole move aborts).
 *
 * The scene ROOT (`ROOT_CONTAINER`) is NOT handled here — the store splices it
 * into `scene.blocks` directly.
 */
export function insertIntoContainer(
  blocks: Block[],
  containerId: string,
  index: number | undefined,
  toInsert: Block,
): { blocks: Block[]; ok: boolean } {
  const holder = { ok: false };
  const next = insertInArray(blocks, containerId, index, toInsert, holder);
  return { blocks: next, ok: holder.ok };
}

function spliceInto(arr: Block[], index: number | undefined, toInsert: Block): Block[] {
  const at = index === undefined ? arr.length : Math.max(0, Math.min(index, arr.length));
  const next = [...arr];
  next.splice(at, 0, toInsert);
  return next;
}

function insertInArray(
  blocks: Block[],
  containerId: string,
  index: number | undefined,
  toInsert: Block,
  holder: { ok: boolean },
): Block[] {
  let changed = false;
  const out = blocks.map(b => {
    const nb = insertInBlock(b, containerId, index, toInsert, holder);
    if (nb !== b) changed = true;
    return nb;
  });
  return changed ? out : blocks;
}

function insertInBlock(
  b: Block,
  containerId: string,
  index: number | undefined,
  toInsert: Block,
  holder: { ok: boolean },
): Block {
  switch (b.type) {
    case 'dialogue': {
      if (b.id === containerId) {
        holder.ok = true;
        return { ...b, innerBlocks: spliceInto(b.innerBlocks ?? [], index, toInsert) };
      }
      if (!b.innerBlocks) return b;
      const innerBlocks = insertInArray(b.innerBlocks, containerId, index, toInsert, holder);
      return innerBlocks !== b.innerBlocks ? { ...b, innerBlocks } : b;
    }
    case 'section':
    case 'for': {
      if (b.id === containerId) {
        holder.ok = true;
        return { ...b, blocks: spliceInto(b.blocks, index, toInsert) };
      }
      const blocks = insertInArray(b.blocks, containerId, index, toInsert, holder);
      return blocks !== b.blocks ? { ...b, blocks } : b;
    }
    case 'condition': {
      let changed = false;
      const branches = b.branches.map(br => {
        if (br.id === containerId) {
          holder.ok = true; changed = true;
          return { ...br, blocks: spliceInto(br.blocks, index, toInsert) };
        }
        const blocks = insertInArray(br.blocks, containerId, index, toInsert, holder);
        if (blocks !== br.blocks) { changed = true; return { ...br, blocks }; }
        return br;
      });
      return changed ? { ...b, branches } : b;
    }
    case 'tabs': {
      let changed = false;
      const tabs = b.tabs.map(tb => {
        if (tb.id === containerId) {
          holder.ok = true; changed = true;
          return { ...tb, blocks: spliceInto(tb.blocks, index, toInsert) };
        }
        const blocks = insertInArray(tb.blocks, containerId, index, toInsert, holder);
        if (blocks !== tb.blocks) { changed = true; return { ...tb, blocks }; }
        return tb;
      });
      return changed ? { ...b, tabs } : b;
    }
    case 'table': {
      let changed = false;
      const rows = b.rows.map(row => {
        let rowChanged = false;
        const cells = row.cells.map(cell => {
          if (cell.id === containerId) {
            holder.ok = true; rowChanged = true;
            return { ...cell, blocks: spliceInto(cell.blocks, index, toInsert) };
          }
          const blocks = insertInArray(cell.blocks, containerId, index, toInsert, holder);
          if (blocks !== cell.blocks) { rowChanged = true; return { ...cell, blocks }; }
          return cell;
        });
        if (rowChanged) { changed = true; return { ...row, cells }; }
        return row;
      });
      return changed ? { ...b, rows } : b;
    }
    default:
      return b;
  }
}
