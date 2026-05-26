import type { Block, Scene, Variable } from '../types';

/** Get variable display name by id. Returns '' if not found. */
function varName(vars: Variable[], id: string): string {
  return vars.find(v => v.id === id)?.name ?? '';
}

/**
 * Extract all user-visible / searchable text from a single block.
 * Recursively handles nested blocks inside ConditionBlock branches.
 * All array accesses are guarded against undefined to tolerate legacy data.
 */
export function blockSearchText(block: Block, vars: Variable[]): string {
  try {
    switch (block.type) {
      case 'text':
        return block.content ?? '';

      case 'dialogue':
        return block.text ?? '';

      case 'note':
        return block.text ?? '';

      case 'choice':
        return (block.options ?? []).map(o => o.label ?? '').join(' ');

      case 'button':
        return [
          block.label ?? '',
          ...(block.actions ?? []).map(a =>
            'variableId' in a && a.variableId ? `$${varName(vars, a.variableId)}` : '',
          ),
        ].filter(Boolean).join(' ');

      case 'input-field':
        return [
          block.label ?? '',
          block.placeholder ?? '',
          block.variableId ? `$${varName(vars, block.variableId)}` : '',
        ].filter(Boolean).join(' ');

      case 'variable-set':
        return [
          block.variableId        ? `$${varName(vars, block.variableId)}`        : '',
          block.dynamicVariableId ? `$${varName(vars, block.dynamicVariableId)}` : '',
        ].filter(Boolean).join(' ');

      case 'condition':
        return (block.branches ?? []).map(branch => [
          branch.variableId ? `$${varName(vars, branch.variableId)}` : '',
          ...(branch.blocks ?? []).map(nb => blockSearchText(nb, vars)),
        ].filter(Boolean).join(' ')).join(' ');

      case 'tabs':
        return (block.tabs ?? []).map(tab => [
          tab.label,
          ...(tab.blocks ?? []).map(nb => blockSearchText(nb, vars)),
        ].filter(Boolean).join(' ')).join(' ');

      case 'image':
        return [
          block.alt ?? '',
          block.mode === 'bound' && block.variableId
            ? `$${varName(vars, block.variableId)}`
            : '',
        ].filter(Boolean).join(' ');

      // video, raw — nothing user-searchable
      default:
        return '';
    }
  } catch {
    // Never crash the UI on unexpected block shapes from legacy data
    return '';
  }
}

/**
 * Returns true if the scene matches the query string (case-insensitive).
 * Searches: scene name, scene note, and all block text content (recursively).
 */
export function sceneMatchesQuery(scene: Scene, query: string, vars: Variable[]): boolean {
  try {
    const q = query.toLowerCase().trim();
    if (!q) return true;

    if (scene.name.toLowerCase().includes(q)) return true;
    if (scene.notes?.toLowerCase().includes(q)) return true;

    for (const block of scene.blocks ?? []) {
      if (blockSearchText(block, vars).toLowerCase().includes(q)) return true;
    }

    return false;
  } catch {
    return true; // On unexpected error — show the scene rather than hide it
  }
}
