import type { Project, Scene, VariableTreeNode } from '../types';
import { parseStoryInit } from './twee/storyInitParser';
import { createBuildContext, passageBodyToBlocks } from './twee/blockBuilder';

// ─── Public surface ──────────────────────────────────────────────────────────

export class ImportError extends Error {
  constructor(message: string) { super(message); this.name = 'ImportError'; }
}

export interface ImportSummary {
  format: string;          // declared story format (SugarCube / unknown / etc.)
  sceneCount: number;
  /** Total blocks produced across all scenes. */
  blockCount: number;
  /** Breakdown by block.type (e.g. { text: 12, choice: 5, raw: 3 }). */
  blockBreakdown: Record<string, number>;
  /** Convenience: blocks of type 'raw' (everything else is "recognized"). */
  rawBlockCount: number;
  variableCount: number;
  variableTodoCount: number;
  /** Variables auto-created from passage usage that weren't declared in StoryInit. */
  variableAutoCreatedCount: number;
  customCssBytes: number;
  customScriptBytes: number;
  warnings: string[];
}

export interface ImportResult {
  project: Project;
  summary: ImportSummary;
}

// ─── Internals ───────────────────────────────────────────────────────────────

function uid(): string { return crypto.randomUUID(); }

interface RawPassage {
  name: string;
  tags: string[];
  meta: Record<string, unknown>;
  body: string;
}

function isPassageHeader(line: string): boolean {
  // Twee 3: passage headers start with `::` at column 0, followed by the name.
  // Reject `:::` and bare `::` to avoid eating empty lines.
  return line.startsWith('::') && line.length > 2 && line[2] !== ':';
}

// Header line example:
//   PassageName [tag1 tag2] {"position":"100,200","size":"100,100"}
// Tags and metadata both optional, can appear in either order.
function parsePassageHeader(line: string): { name: string; tags: string[]; meta: Record<string, unknown> } {
  let rest = line.trim();
  let tags: string[] = [];
  const meta: Record<string, unknown> = {};

  const tagRe  = /\s*\[([^\]]*)\]\s*$/;
  const metaRe = /\s*(\{[\s\S]*\})\s*$/;

  // Two passes — either order works.
  for (let i = 0; i < 2; i++) {
    const mm = metaRe.exec(rest);
    if (mm) {
      try {
        const parsed = JSON.parse(mm[1]);
        if (parsed && typeof parsed === 'object') Object.assign(meta, parsed);
      } catch { /* ignore malformed meta */ }
      rest = rest.slice(0, mm.index).trimEnd();
    }
    const mt = tagRe.exec(rest);
    if (mt) {
      tags = mt[1].split(/\s+/).filter(Boolean);
      rest = rest.slice(0, mt.index).trimEnd();
    }
  }

  return { name: rest.trim(), tags, meta };
}

function splitPassages(twee: string): RawPassage[] {
  const text  = twee.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const out: RawPassage[] = [];

  let current: RawPassage | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (current) {
      let body = bodyLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
      // Strip Twine graph-hint that Purl (and other tools) append for the
      // Twine editor to draw connections — `<<if false>>[[T1]][[T2]]<</if>>`
      // at the end of the passage body. SugarCube never runs it; on re-import
      // it would otherwise become a stray RawBlock.
      body = body.replace(/\s*<<if\s+false>>(?:\[\[[^\]\n]+\]\])+<<\/if>>\s*$/i, '');
      current.body = body;
      out.push(current);
    }
    current = null;
    bodyLines = [];
  };

  for (const line of lines) {
    if (isPassageHeader(line)) {
      flush();
      const headerStr = line.replace(/^::\s*/, '');
      const { name, tags, meta } = parsePassageHeader(headerStr);
      current = { name, tags, meta, body: '' };
    } else if (current) {
      bodyLines.push(line);
    }
  }
  flush();
  return out;
}

function countVariables(nodes: VariableTreeNode[]): number {
  let n = 0;
  const walk = (xs: VariableTreeNode[]) => {
    for (const node of xs) {
      if (node.kind === 'variable') n++;
      else walk(node.children);
    }
  };
  walk(nodes);
  return n;
}

function byteLength(s: string): number {
  // Browser-safe UTF-8 byte length (no Buffer in renderer).
  return new TextEncoder().encode(s).length;
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export function importFromTweeSource(text: string): ImportResult {
  const warnings: string[] = [];
  const passages = splitPassages(text);

  if (passages.length === 0) {
    throw new ImportError('No passages found — does not look like a Twee file.');
  }

  // ── StoryData: format check + ifid + start passage name ───────────────────
  const storyDataPassage = passages.find(p => p.name === 'StoryData');
  let format = 'unknown';
  let ifid: string | undefined;
  let startName: string | undefined;
  if (storyDataPassage) {
    try {
      const data = JSON.parse(storyDataPassage.body.trim());
      if (data && typeof data === 'object') {
        if (typeof data.format === 'string') format = data.format;
        if (typeof data.ifid   === 'string') ifid   = data.ifid;
        if (typeof data.start  === 'string') startName = data.start;
      }
    } catch {
      warnings.push('Couldn\'t parse StoryData JSON — using defaults.');
    }
  }
  if (format !== 'unknown' && format !== 'SugarCube') {
    throw new ImportError(
      `Format "${format}" is not supported. Only SugarCube projects can be imported right now.`,
    );
  }

  // ── StoryTitle ────────────────────────────────────────────────────────────
  const titlePassage = passages.find(p => p.name === 'StoryTitle');
  const title = titlePassage ? titlePassage.body.trim() || 'Imported Story' : 'Imported Story';

  // ── StoryInit → variables ─────────────────────────────────────────────────
  let variableNodes: VariableTreeNode[] = [];
  let variableTodoCount = 0;
  const storyInit = passages.find(p => p.name === 'StoryInit');
  if (storyInit) {
    const r = parseStoryInit(storyInit.body);
    variableNodes = r.nodes;
    variableTodoCount = r.unparsedCount;
    warnings.push(...r.warnings);
  }

  // ── CSS / JS passages aggregate into project.customCss / customScript ────
  const cssChunks: string[] = [];
  const jsChunks:  string[] = [];

  // ── Scenes (Phase 2: token-driven block recognition) ──────────────────────
  const SYSTEM_NAMES = new Set([
    'StoryTitle', 'StoryData', 'StoryInit',
    'StoryStylesheet', 'StoryScript', 'StoryCaption',
  ]);
  const scenes: Scene[] = [];
  let startSceneId: string | null = null;

  const ctx = createBuildContext(variableNodes);
  const variableCountBeforeBuild = countVariables(variableNodes);

  for (const p of passages) {
    // Strip system passages that we've consumed above
    if (p.name === 'StoryTitle' || p.name === 'StoryData' || p.name === 'StoryInit') continue;

    // Stylesheet passages: by tag or by reserved name
    if (p.tags.includes('stylesheet') || p.name === 'StoryStylesheet') {
      if (p.body.trim()) cssChunks.push(p.body);
      continue;
    }
    // Script passages: by tag or by reserved name
    if (p.tags.includes('script') || p.name === 'StoryScript') {
      if (p.body.trim()) jsChunks.push(p.body);
      continue;
    }

    const sceneId = uid();
    const blocks = passageBodyToBlocks(p.body, ctx);

    // Preserve foreign tags except the system names we already consumed.
    const tags = p.tags.filter(t => !SYSTEM_NAMES.has(t));

    const scene: Scene = { id: sceneId, name: p.name, tags, blocks };

    const pos = p.meta.position;
    if (typeof pos === 'string') {
      const [xStr, yStr] = pos.split(',');
      const x = parseFloat(xStr), y = parseFloat(yStr);
      if (Number.isFinite(x) && Number.isFinite(y)) scene.graphPosition = { x, y };
    }

    scenes.push(scene);
    if (startName && p.name === startName && !startSceneId) startSceneId = sceneId;
  }

  // Recognizers may have appended auto-created variables to ctx.variableNodes
  // and emitted warnings. Pull them back into the outer state.
  variableNodes = ctx.variableNodes;
  warnings.push(...ctx.warnings);

  if (scenes.length === 0) {
    throw new ImportError('No content passages found.');
  }

  // Mark the start scene with the editor-only 'start' tag.
  const startScene = startSceneId
    ? scenes.find(s => s.id === startSceneId)
    : scenes[0];
  if (startScene && !startScene.tags.includes('start')) {
    startScene.tags = [...startScene.tags, 'start'];
  }

  const customCss    = cssChunks.join('\n\n').trim();
  const customScript = jsChunks.join('\n\n').trim();

  // processText() gotcha — runs in isolated context, <<set>> side effects don't persist.
  const PROCESS_TEXT_RE = /Story\.get\s*\([^)]*\)\s*\.processText\s*\(/;
  const seenInScenes = new Set<string>();
  for (const p of passages) {
    if (p.name === 'StoryTitle' || p.name === 'StoryData' || p.name === 'StoryInit') continue;
    if (p.tags.includes('stylesheet') || p.name === 'StoryStylesheet') continue;
    if (p.tags.includes('script') || p.name === 'StoryScript') continue;
    if (PROCESS_TEXT_RE.test(p.body)) seenInScenes.add(p.name);
  }
  if (seenInScenes.size > 0) {
    const list = [...seenInScenes].slice(0, 5).join(', ');
    const more = seenInScenes.size > 5 ? ` (and ${seenInScenes.size - 5} more)` : '';
    warnings.push(
      `Detected Story.get(...).processText() in scenes: ${list}${more}. ` +
      `SugarCube runs processText() in an isolated context, so <<set>> side effects ` +
      `won't persist. Consider switching to <<include "Name">>.`,
    );
  }
  if (customScript && PROCESS_TEXT_RE.test(customScript)) {
    warnings.push('Custom JS uses Story.get(...).processText() — same isolated-context gotcha applies.');
  }

  const project: Project = {
    id: uid(),
    title,
    ifid: ifid ?? uid().toUpperCase(),
    settings: { historyControls: true, saveLoadMenu: true },
    scenes,
    sceneGroups: [],
    characters: [],
    items: [],
    containers: [],
    variableNodes,
    assetNodes: [],
    sidebarPanel: { tabs: [], liveUpdate: false },
    watchers: [],
    customCss,
    customScript,
  };

  const blockBreakdown: Record<string, number> = {};
  let blockCount = 0;
  let rawBlockCount = 0;
  for (const s of scenes) {
    for (const b of s.blocks) {
      blockBreakdown[b.type] = (blockBreakdown[b.type] ?? 0) + 1;
      blockCount++;
      if (b.type === 'raw') rawBlockCount++;
    }
  }

  const variableCountAfter = countVariables(variableNodes);
  const variableAutoCreatedCount = Math.max(0, variableCountAfter - variableCountBeforeBuild);

  const summary: ImportSummary = {
    format,
    sceneCount: scenes.length,
    blockCount,
    blockBreakdown,
    rawBlockCount,
    variableCount: variableCountAfter,
    variableTodoCount,
    variableAutoCreatedCount,
    customCssBytes: byteLength(customCss),
    customScriptBytes: byteLength(customScript),
    warnings,
  };

  return { project, summary };
}
