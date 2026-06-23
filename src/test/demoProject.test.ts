import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { buildDemoProject } from './demoProject';
import { exportToTwee } from '../utils/exportToTwee';
import { validateProject } from '../utils/validateProject';
import type { Block, BlockType } from '../types';

/** Every block type the demo intends to cover (all blocks except AI-gen + plugin). */
const EXPECTED_TYPES: BlockType[] = [
  'text', 'dialogue', 'callout',
  'image', 'video', 'audio', 'audio-volume',
  'paperdoll', 'inventory', 'container',
  'quest-set', 'quest-show',
  'progress', 'date-time', 'display-object', 'variable-set', 'set-object', 'time-manipulation',
  'choice', 'button', 'link', 'menu-link', 'input-field', 'checkbox', 'radio', 'select', 'slider', 'popup', 'function',
  'condition', 'for',
  'divider', 'spacer', 'tabs', 'section', 'table', 'include',
  'raw', 'note', 'save',
];

/** Recursively collect every block type used anywhere in the project. */
function collectTypes(blocks: Block[], acc: Set<BlockType>): void {
  for (const b of blocks) {
    acc.add(b.type);
    if (b.type === 'condition') b.branches.forEach(br => collectTypes(br.blocks, acc));
    else if (b.type === 'dialogue' && b.innerBlocks?.length) collectTypes(b.innerBlocks, acc);
    else if (b.type === 'tabs') b.tabs.forEach(t => collectTypes(t.blocks, acc));
    else if (b.type === 'section') collectTypes(b.blocks, acc);
    else if (b.type === 'for') collectTypes(b.blocks, acc);
    else if (b.type === 'table') b.rows.forEach(r => r.cells.forEach(c => collectTypes(c.blocks, acc)));
  }
}

describe('demo project — The Clockwork Heart', () => {
  const project = buildDemoProject();

  it('covers every targeted block type', () => {
    const used = new Set<BlockType>();
    project.scenes.forEach(s => collectTypes(s.blocks, used));
    const missing = EXPECTED_TYPES.filter(t => !used.has(t));
    expect(missing, `missing block types: ${missing.join(', ')}`).toEqual([]);
  });

  it('validates with zero errors and zero warnings', () => {
    const issues = validateProject(project);
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    // Surface anything non-info for debugging.
    if (errors.length || warnings.length) {
      console.log('validation:', JSON.stringify([...errors, ...warnings], null, 2));
    }
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('exports to .twee without throwing and includes key passages', () => {
    const twee = exportToTwee(project);
    expect(typeof twee).toBe('string');
    expect(twee).toContain('::StoryTitle');
    expect(twee).toContain('::StoryInit');
    expect(twee).toContain('::Start');
    expect(twee).toContain('::TownSquare');
    expect(twee).toContain('::StoryCaption'); // sidebar
    expect(twee).toContain('::StoryMenu');    // menu
    // quest runtime + container + paperdoll plumbing present
    expect(twee).toContain('_tgQuestNormalize');
  });

  it('exports with no unresolved references (no ??? markers)', () => {
    const twee = exportToTwee(project);
    // The exporter emits `$???` for a variableId that resolves to no path and
    // `"???"` for an unresolved scene target — either means a broken reference.
    expect(twee).not.toContain('???');
  });

  it('writes the .purl + .twee to resources/sample-project', () => {
    const dir = join(process.cwd(), 'resources', 'sample-project');
    mkdirSync(dir, { recursive: true });
    const purl = join(dir, 'the-clockwork-heart.purl');
    writeFileSync(purl, JSON.stringify(project, null, 2), 'utf8');
    writeFileSync(join(dir, 'the-clockwork-heart.twee'), exportToTwee(project), 'utf8');
    expect(dirname(purl)).toContain('sample-project');
  });
});
