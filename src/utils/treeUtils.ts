import type { Variable, VariableType, VariableTreeNode, VariableGroup, Asset, AssetTreeNode } from '../types';

export function flattenVariables(nodes: VariableTreeNode[]): Variable[] {
  const result: Variable[] = [];
  for (const n of nodes) {
    if (n.kind === 'variable') result.push(n);
    else result.push(...flattenVariables(n.children));
  }
  return result;
}

/** Returns the dot-path for a variable by its id, e.g. "chars.developer.name" or "gold" */
export function getVariablePath(id: string, nodes: VariableTreeNode[], prefix: string[] = []): string {
  for (const n of nodes) {
    if (n.kind === 'variable' && n.id === id) return [...prefix, n.name].join('.');
    if (n.kind === 'group') {
      const found = getVariablePath(id, n.children, [...prefix, n.name]);
      if (found) return found;
    }
  }
  return '';
}

/** Returns the dot-path for ANY node (variable or group) by its id.
 *  Used when groups are selectable (object-kind params). */
export function getNodePath(id: string, nodes: VariableTreeNode[], prefix: string[] = []): string {
  for (const n of nodes) {
    const myPath = [...prefix, n.name].join('.');
    if (n.id === id) return myPath;
    if (n.kind === 'group') {
      const found = getNodePath(id, n.children, [...prefix, n.name]);
      if (found) return found;
    }
  }
  return '';
}

/** Checks if a group (or its nested sub-groups) contains at least one variable leaf */
export function hasLeafVariables(group: VariableGroup, filterType?: VariableType): boolean {
  return group.children.some(n =>
    (n.kind === 'variable' && (!filterType || n.varType === filterType)) ||
    (n.kind === 'group' && hasLeafVariables(n, filterType))
  );
}

/** Checks if a name collides with any sibling node (variable or group) */
function hasSiblingNameConflict(
  name: string,
  siblings: VariableTreeNode[],
  excludeId?: string
): boolean {
  return siblings.some(n => n.name === name && n.id !== excludeId);
}

// ─── Generic tree mutation helpers (shared by variable & asset trees) ─────────

/** Minimal shape shared by variable and asset tree nodes. */
export type AnyNode = { id: string; kind: string; children?: AnyNode[] };

/** Remove a node (and its subtree) by id, anywhere in the tree. */
export function removeNode<T extends AnyNode>(nodes: T[], id: string): T[] {
  return nodes
    .filter(n => n.id !== id)
    .map(n => n.children ? { ...n, children: removeNode(n.children as T[], id) } : n) as T[];
}

/** Insert a node under a parent group (or at the root when parentId is null). */
export function addNode<T extends AnyNode>(nodes: T[], parentId: string | null, node: T): T[] {
  if (parentId === null) return [...nodes, node];
  return nodes.map(n => {
    if (n.kind !== 'group' || n.id !== parentId) {
      if (n.children) return { ...n, children: addNode(n.children as T[], parentId, node) };
      return n;
    }
    return { ...n, children: [...(n.children ?? []), node] };
  }) as T[];
}

/** Get the children of a parent group (or root nodes if parentId is null) */
export function getSiblings(nodes: VariableTreeNode[], parentId: string | null): VariableTreeNode[] {
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
export function ensureUniqueName(name: string, siblings: VariableTreeNode[]): string {
  if (!hasSiblingNameConflict(name, siblings)) return name;
  let i = 2;
  while (hasSiblingNameConflict(`${name}${i}`, siblings)) i++;
  return `${name}${i}`;
}

/** Patch a variable leaf by id, anywhere in the variable tree. */
export function updateVarInTree(
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

/** Rename a group node by id, anywhere in the variable tree. */
export function updateGroupNameInTree(
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

export function flattenAssets(nodes: AssetTreeNode[]): Asset[] {
  const result: Asset[] = [];
  for (const n of nodes) {
    if (n.kind === 'asset') result.push(n);
    else result.push(...flattenAssets(n.children));
  }
  return result;
}

/** Rebase the relativePath of every node in a subtree from oldPrefix → newPrefix. */
export function updateChildPaths(
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

/** Rename an asset group by id and rebase its subtree's relative paths. */
export function renameGroupInAssetTree(
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
