/* eslint-disable react-refresh/only-export-components -- context module: the provider and its hooks share private contexts and live together by design */
import { createContext, useContext, type ReactNode } from 'react';
import type { VariableTreeNode, PluginParam } from '../../types';
import { useProjectStore } from '../../store/projectStore';

/**
 * Scope override for variable-picker-enabled block editors.
 *
 * When set (via VariableScopeProvider), block editors rendered inside should
 * treat the provided tree as the *entire* set of available variables instead
 * of the project-wide variableNodes. Used by the plugin body editor so blocks
 * can only target plugin parameters, not global state.
 */
const VariableScopeContext = createContext<VariableTreeNode[] | null>(null);

/**
 * Plugin params available in the current scope. Empty array when not inside
 * a plugin body. Used by block editors to expose param-specific behaviour
 * (e.g. LinkBlock can navigate to a `scene`-kind param instead of a fixed scene).
 */
const PluginParamScopeContext = createContext<PluginParam[]>([]);

export function VariableScopeProvider({
  nodes,
  params,
  children,
}: {
  nodes: VariableTreeNode[];
  /** Plugin params to expose to descendant editors. */
  params?: PluginParam[];
  children: ReactNode;
}) {
  return (
    <VariableScopeContext.Provider value={nodes}>
      <PluginParamScopeContext.Provider value={params ?? []}>
        {children}
      </PluginParamScopeContext.Provider>
    </VariableScopeContext.Provider>
  );
}

/** Returns the plugin params available in the current scope (empty outside a plugin body). */
export function usePluginParams(): PluginParam[] {
  return useContext(PluginParamScopeContext);
}

/**
 * Returns the effective variable tree for the current editor location:
 * the scope override if set, otherwise the project-wide variableNodes.
 */
export function useVariableNodes(): VariableTreeNode[] {
  const scope = useContext(VariableScopeContext);
  const projectNodes = useProjectStore((s) => s.project.variableNodes);
  return scope ?? projectNodes;
}
