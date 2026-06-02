import type { Project, Block, Scene } from '../types';
import { SYSTEM_TAGS, START_TAG } from '../types';
import { collectNavRefs } from './navTargets';

/**
 * Story validator ("Doctor"). A pure, locale-agnostic pass over a Project that
 * reports structural / navigational problems. Messages are NOT built here — each
 * issue carries a machine `code` + resolved params, and the UI localizes it (so
 * this stays testable and translation-free).
 *
 * NB on a non-problem: scene rename can't break links — `targetSceneId` stores a
 * stable UUID (see migrateSceneLinks / buildGraphData), so references re-resolve
 * by id. We therefore do NOT check "broken by rename"; `dangling-target` only
 * fires when a referenced scene was actually deleted.
 */

export type IssueSeverity = 'error' | 'warning' | 'info';

export type ValidationCode =
  | 'no-start'          // no scene tagged `start`
  | 'multiple-start'    // more than one `start` scene
  | 'duplicate-name'    // two scenes share a name (SugarCube passages must be unique)
  | 'dangling-target'   // a nav link points at a scene that doesn't exist
  | 'unreachable'       // scene can't be reached from start via any navigation
  | 'dead-end'          // scene has no way out (no nav, no back) — possibly an unfinished ending
  | 'empty-scene'       // scene has no blocks
  | 'choice-no-target'  // a choice option has no target scene
  | 'choice-no-label'   // a choice option has no label
  | 'empty-branch';     // an IF branch has no blocks

export interface ValidationIssue {
  /** Stable-ish React key. */
  key: string;
  severity: IssueSeverity;
  code: ValidationCode;
  /** Scene to navigate to when the issue row is clicked. */
  sceneId?: string;
  /** Scene name, resolved here so the UI needn't look it up. */
  sceneName?: string;
  /** Secondary label some messages use (link label, joined names, duplicated name…). */
  detail?: string;
  /** Numeric param some messages use (e.g. how many scenes share a name). */
  count?: number;
}

// Chrome system passages (sidebar/title/menu/header/footer) are always-present
// presentation, reached by SugarCube specially — never via story navigation. They
// are exempt from unreachable / dead-end / empty-scene checks. (func + popup are
// real nav destinations and ARE checked for reachability.)
const CHROME_TAGS = ['sidebar', 'title', 'menu', 'passage-header', 'passage-footer'] as const;

const isSystem = (s: Scene) => s.tags.some(t => (SYSTEM_TAGS as readonly string[]).includes(t));
const isChrome = (s: Scene) => s.tags.some(t => (CHROME_TAGS as readonly string[]).includes(t));

/** True if these blocks contain any "leave the passage" control (back / restart). */
function hasBackExit(blocks: Block[]): boolean {
  for (const b of blocks) {
    if ((b.type === 'link' || b.type === 'menu-link') && b.target === 'back') return true;
    if (b.type === 'menu-link' && b.target === 'restart') return true;
    if (b.type === 'condition') { if (b.branches.some(br => hasBackExit(br.blocks))) return true; }
    else if (b.type === 'dialogue' && b.innerBlocks?.length) { if (hasBackExit(b.innerBlocks)) return true; }
    else if (b.type === 'tabs') { if (b.tabs.some(t => hasBackExit(t.blocks))) return true; }
    else if (b.type === 'section') { if (hasBackExit(b.blocks)) return true; }
    else if (b.type === 'for') { if (hasBackExit(b.blocks)) return true; }
    else if (b.type === 'table') { if (b.rows.some(r => r.cells.some(c => hasBackExit(c.blocks)))) return true; }
  }
  return false;
}

type StructuralCode = 'choice-no-target' | 'choice-no-label' | 'empty-branch';

/** Walk a scene's block tree reporting per-block structural problems. */
function walkStructural(blocks: Block[], push: (code: StructuralCode) => void): void {
  for (const b of blocks) {
    if (b.type === 'choice') {
      for (const opt of b.options) {
        if (!opt.targetSceneId) push('choice-no-target');
        if (!opt.label.trim()) push('choice-no-label');
      }
    } else if (b.type === 'condition') {
      for (const br of b.branches) {
        if (br.blocks.length === 0) push('empty-branch');
        walkStructural(br.blocks, push);
      }
    } else if (b.type === 'dialogue' && b.innerBlocks?.length) {
      walkStructural(b.innerBlocks, push);
    } else if (b.type === 'tabs') {
      for (const t of b.tabs) walkStructural(t.blocks, push);
    } else if (b.type === 'section') {
      walkStructural(b.blocks, push);
    } else if (b.type === 'for') {
      walkStructural(b.blocks, push);
    } else if (b.type === 'table') {
      for (const r of b.rows) for (const c of r.cells) walkStructural(c.blocks, push);
    }
  }
}

export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let seq = 0;
  const add = (
    severity: IssueSeverity,
    code: ValidationCode,
    sceneId?: string,
    sceneName?: string,
    detail?: string,
    count?: number,
  ) => {
    issues.push({ key: `${code}:${sceneId ?? ''}:${seq++}`, severity, code, sceneId, sceneName, detail, count });
  };

  const scenes = project.scenes;
  const idSet = new Set(scenes.map(s => s.id));

  // ── 1. start scene(s) ──────────────────────────────────────────────────────
  const starts = scenes.filter(s => s.tags.includes(START_TAG));
  if (starts.length === 0) add('error', 'no-start');
  else if (starts.length > 1)
    add('warning', 'multiple-start', starts[0].id, starts[0].name, starts.map(s => s.name).join(', '), starts.length);

  // ── 2. duplicate scene names (passages must be unique) ──────────────────────
  const byName = new Map<string, Scene[]>();
  for (const s of scenes) {
    const list = byName.get(s.name) ?? [];
    list.push(s);
    byName.set(s.name, list);
  }
  for (const list of byName.values()) {
    if (list.length > 1) for (const s of list) add('error', 'duplicate-name', s.id, s.name, s.name, list.length);
  }

  // ── 3. outbound edges + dangling targets + structural problems + empty scenes ─
  const outByScene = new Map<string, string[]>();
  for (const s of scenes) {
    const targets: string[] = [];
    for (const r of collectNavRefs(s.blocks)) {
      // include of a plugin-param passage (`param:foo`) is resolved at runtime — not a scene id.
      if (r.kind === 'include' && r.targetId.startsWith('param:')) continue;
      if (idSet.has(r.targetId)) targets.push(r.targetId);
      else add('error', 'dangling-target', s.id, s.name, r.label || undefined);
    }
    outByScene.set(s.id, targets);

    walkStructural(s.blocks, code => add(code === 'empty-branch' ? 'info' : 'warning', code, s.id, s.name));

    if (s.blocks.length === 0 && !isSystem(s)) add('info', 'empty-scene', s.id, s.name);
  }

  // ── 4. reachability from start (transitive BFS) ─────────────────────────────
  if (starts.length > 0) {
    const reachable = new Set<string>(starts.map(s => s.id));
    const queue = [...reachable];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const t of outByScene.get(cur) ?? []) {
        if (!reachable.has(t)) { reachable.add(t); queue.push(t); }
      }
    }
    for (const s of scenes) {
      if (reachable.has(s.id) || isChrome(s) || s.tags.includes(START_TAG)) continue;
      add('warning', 'unreachable', s.id, s.name);
    }
  }

  // ── 5. dead ends (no way out — info, often an unfinished ending) ─────────────
  for (const s of scenes) {
    if (isSystem(s)) continue;
    const out = outByScene.get(s.id) ?? [];
    if (out.length === 0 && !hasBackExit(s.blocks)) add('info', 'dead-end', s.id, s.name);
  }

  return issues;
}

/** Severity → sort weight (errors first). */
export const SEVERITY_ORDER: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
