/**
 * Pure helpers for DisplayObjectBlock field-list management. Extracted from the
 * editor so they're trivially unit-testable and reusable (e.g., a future
 * "import all fields" toolbar action).
 */
import type { DisplayField, Variable, VariableGroup, VariableTreeNode } from '../types';

/** Locate a VariableGroup node anywhere in the tree by id. */
export function findGroupById(nodes: VariableTreeNode[], id: string): VariableGroup | null {
  for (const n of nodes) {
    if (n.kind === 'group') {
      if (n.id === id) return n;
      const f = findGroupById(n.children, id);
      if (f) return f;
    }
  }
  return null;
}

/**
 * Default DisplayField for a freshly-discovered group leaf — picks a sensible
 * renderer by varType (boolean→bool, number→bar with max 100, else text).
 */
function generateFieldFor(v: Variable): DisplayField {
  return {
    id: crypto.randomUUID(),
    variableId: v.id,
    label: v.name,
    render: v.varType === 'boolean' ? 'bool'
          : v.varType === 'number'  ? 'bar'
          :                            'text',
    ...(v.varType === 'number' ? { maxValue: 100 } : {}),
  };
}

/**
 * Reconcile `current` fields against a group's direct leaves:
 *  - keep fields whose variable still exists (preserves user label/render/max
 *    AND keeps their current order — so drag-reorder survives re-sync),
 *  - drop fields whose variable was removed from the group,
 *  - append a default DisplayField for every leaf not yet represented.
 */
export function reconcileFields(current: DisplayField[], group: VariableGroup): DisplayField[] {
  const leaves = group.children.filter((c): c is Variable => c.kind === 'variable');
  const leafIds = new Set(leaves.map(v => v.id));
  const kept = current.filter(f => leafIds.has(f.variableId));
  const keptIds = new Set(kept.map(f => f.variableId));
  const added = leaves.filter(v => !keptIds.has(v.id)).map(generateFieldFor);
  return [...kept, ...added];
}

/** Shallow-deep compare for DisplayField[] — gates the auto-sync patch so the
 *  effect doesn't loop. Compares every user-visible field (id, variableId,
 *  label, render, maxValue, maxVariableId). */
export function fieldsEqual(a: DisplayField[], b: DisplayField[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.id !== y.id || x.variableId !== y.variableId
        || (x.label ?? '') !== (y.label ?? '')
        || (x.render ?? 'text') !== (y.render ?? 'text')
        || x.maxValue !== y.maxValue
        || x.maxVariableId !== y.maxVariableId) return false;
  }
  return true;
}
