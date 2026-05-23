import { useMemo } from 'react';
import { useProjectStore } from '../store/projectStore';
import { flattenVariables, flattenAssets } from '../utils/treeUtils';
import type { Variable, Asset, VariableTreeNode, AssetTreeNode } from '../types';

/**
 * Memoized flat-list of all variables in the project. Recomputes only when
 * `project.variableNodes` reference changes (immutable updates preserve refs
 * on unrelated mutations). Use this in editors/managers instead of calling
 * `flattenVariables(project.variableNodes)` inline — the latter walks the
 * whole tree on every render and shows up in profiles when projects grow.
 */
export function useFlatVariables(): Variable[] {
  const nodes = useProjectStore(s => s.project.variableNodes);
  return useMemo(() => flattenVariables(nodes), [nodes]);
}

/**
 * Same idea as `useFlatVariables` but for an arbitrary tree — useful when the
 * caller already has the nodes in scope (e.g. a `variableNodes` prop on a
 * nested editor). Memoizes on the provided reference.
 */
export function useFlatVariablesOf(nodes: VariableTreeNode[]): Variable[] {
  return useMemo(() => flattenVariables(nodes), [nodes]);
}

/** Memoized flat-list of all assets in the project. */
export function useFlatAssets(): Asset[] {
  const nodes = useProjectStore(s => s.project.assetNodes);
  return useMemo(() => flattenAssets(nodes), [nodes]);
}

/** Memoized flat-list for an arbitrary asset tree. */
export function useFlatAssetsOf(nodes: AssetTreeNode[]): Asset[] {
  return useMemo(() => flattenAssets(nodes), [nodes]);
}
