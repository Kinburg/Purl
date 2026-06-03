import type { Project, Block, BlockType, Scene, AssetTreeNode } from '../types';
import { SYSTEM_TAGS, START_TAG } from '../types';
import { extractSceneStrings } from './i18nUtils';
import { collectNavRefs } from './navTargets';
import { flattenVariables } from './treeUtils';

export interface SceneWordCount {
  id: string;
  name: string;
  words: number;
}

export interface StoryStats {
  totalWords: number;
  readingMinutes: number;       // ~200 wpm
  scenes: number;               // total scenes
  systemScenes: number;         // scenes carrying a system tag
  groups: number;
  blocks: number;               // recursive block count
  blocksByType: { type: BlockType; count: number }[]; // present types, desc by count
  choiceOptions: number;        // total choice options across all choice blocks
  navLinks: number;             // total navigation references (collectNavRefs)
  endings: number;              // non-system scenes with no outgoing navigation
  unreachable: number;          // non-system, non-start scenes not reachable from start
  branchingFactor: number;      // avg outgoing edges per story (non-system) scene
  characters: number;
  items: number;
  containers: number;
  variables: number;            // leaf variables
  watchers: number;
  plugins: number;
  assets: number;               // leaf asset files
  perScene: SceneWordCount[];   // sorted desc by words
}

const CHROME_TAGS = ['sidebar', 'title', 'menu', 'passage-header', 'passage-footer'] as const;
const isSystem = (s: Scene) => s.tags.some(t => (SYSTEM_TAGS as readonly string[]).includes(t));
const isChrome = (s: Scene) => s.tags.some(t => (CHROME_TAGS as readonly string[]).includes(t));

function countWords(s: string): number {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Visit every block recursively (descending the canonical container arms). */
function forEachBlock(blocks: Block[], cb: (b: Block) => void): void {
  for (const b of blocks) {
    cb(b);
    if (b.type === 'condition') { for (const br of b.branches) forEachBlock(br.blocks, cb); }
    else if (b.type === 'dialogue') { if (b.innerBlocks?.length) forEachBlock(b.innerBlocks, cb); }
    else if (b.type === 'tabs') { for (const tab of b.tabs) forEachBlock(tab.blocks, cb); }
    else if (b.type === 'section') { forEachBlock(b.blocks, cb); }
    else if (b.type === 'for') { forEachBlock(b.blocks, cb); }
    else if (b.type === 'table') { for (const r of b.rows) for (const c of r.cells) forEachBlock(c.blocks, cb); }
  }
}

function countAssets(nodes: AssetTreeNode[]): number {
  let n = 0;
  for (const node of nodes) {
    if (node.kind === 'asset') n++;
    else n += countAssets(node.children);
  }
  return n;
}

/**
 * Pure, locale-agnostic project metrics for the Stats panel. Reuses the same
 * walkers the rest of the app trusts: `extractSceneStrings` (word coverage =
 * translator coverage), `collectNavRefs` (navigation), `flattenVariables`.
 */
export function computeStats(project: Project, pluginCount = 0): StoryStats {
  const scenes = project.scenes;
  const idSet = new Set(scenes.map(s => s.id));

  // ── Words per scene ────────────────────────────────────────────────────────
  let totalWords = 0;
  const perScene: SceneWordCount[] = scenes.map(s => {
    const words = Object.values(extractSceneStrings(s)).reduce((sum, str) => sum + countWords(str), 0);
    totalWords += words;
    return { id: s.id, name: s.name, words };
  }).sort((a, b) => b.words - a.words);

  // ── Blocks (recursive) + choices ─────────────────────────────────────────
  let blocks = 0;
  let choiceOptions = 0;
  const typeTally = new Map<BlockType, number>();
  for (const s of scenes) {
    forEachBlock(s.blocks, b => {
      blocks++;
      typeTally.set(b.type, (typeTally.get(b.type) ?? 0) + 1);
      if (b.type === 'choice') choiceOptions += b.options.length;
    });
  }
  const blocksByType = [...typeTally.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // ── Navigation graph (existing-scene targets) ──────────────────────────────
  const outByScene = new Map<string, string[]>();
  let navLinks = 0;
  for (const s of scenes) {
    const refs = collectNavRefs(s.blocks);
    navLinks += refs.length;
    const targets = refs
      .filter(r => !(r.kind === 'include' && r.targetId.startsWith('param:')) && idSet.has(r.targetId))
      .map(r => r.targetId);
    outByScene.set(s.id, targets);
  }

  // ── Reachability (BFS from start) ───────────────────────────────────────────
  const starts = scenes.filter(s => s.tags.includes(START_TAG));
  let unreachable = 0;
  if (starts.length > 0) {
    const reach = new Set<string>(starts.map(s => s.id));
    const queue = [...reach];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const t of outByScene.get(cur) ?? []) {
        if (!reach.has(t)) { reach.add(t); queue.push(t); }
      }
    }
    for (const s of scenes) {
      if (!reach.has(s.id) && !isChrome(s) && !s.tags.includes(START_TAG)) unreachable++;
    }
  }

  // ── Endings + branching (over story / non-system scenes) ────────────────────
  const storyScenes = scenes.filter(s => !isSystem(s));
  let endings = 0;
  let totalEdges = 0;
  for (const s of storyScenes) {
    const out = outByScene.get(s.id) ?? [];
    totalEdges += out.length;
    if (out.length === 0) endings++;
  }
  const branchingFactor = storyScenes.length ? totalEdges / storyScenes.length : 0;

  return {
    totalWords,
    readingMinutes: Math.ceil(totalWords / 200),
    scenes: scenes.length,
    systemScenes: scenes.filter(isSystem).length,
    groups: project.sceneGroups.length,
    blocks,
    blocksByType,
    choiceOptions,
    navLinks,
    endings,
    unreachable,
    branchingFactor,
    characters: project.characters.length,
    items: project.items.length,
    containers: project.containers.length,
    variables: flattenVariables(project.variableNodes).length,
    watchers: (project.watchers ?? []).length,
    plugins: pluginCount,
    assets: countAssets(project.assetNodes),
    perScene,
  };
}
