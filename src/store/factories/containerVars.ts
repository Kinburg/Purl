import type { VariableTreeNode, VariableGroup, Variable, ContainerItemSlot, ContainerVarIds } from '../../types';
import { uuid } from '../ids';

const CONTAINERS_ROOT_GROUP_NAME = 'containers';

/**
 * Find the root 'containers' VariableGroup or create it if absent.
 * Returns updated variableNodes + the root group id.
 */
export function findOrCreateContainersRootGroup(variableNodes: VariableTreeNode[]): {
  nodes: VariableTreeNode[];
  rootGroupId: string;
} {
  const existing = variableNodes.find(
    n => n.kind === 'group' && n.name === CONTAINERS_ROOT_GROUP_NAME,
  ) as VariableGroup | undefined;
  if (existing) return { nodes: variableNodes, rootGroupId: existing.id };
  const rootGroup: VariableGroup = { kind: 'group', id: uuid(), name: CONTAINERS_ROOT_GROUP_NAME, children: [] };
  return { nodes: [...variableNodes, rootGroup], rootGroupId: rootGroup.id };
}

/** Build the JS array literal for a container's initial items */
export function buildContainerItemsLiteral(slots: ContainerItemSlot[]): string {
  if (slots.length === 0) return '[]';
  const entries = slots.map(s => {
    const parts = [`item:"${s.itemVarName}",qty:${s.quantity}`];
    if (s.price !== undefined) parts.push(`price:${s.price}`);
    return `{${parts.join(',')}}`;
  });
  return `[${entries.join(',')}]`;
}

export interface ContainerVarBuildResult {
  containerGroup: VariableGroup;
  varIds: ContainerVarIds;
}

/**
 * Build the VariableGroup subtree for a newly created container.
 * Places the group under the root 'containers' group (via rootGroupId).
 */
export function buildContainerVarNodes(
  container: { varName: string; initialItems: ContainerItemSlot[] },
  rootGroupId: string,
): ContainerVarBuildResult {
  const itemsVarId = uuid();
  const groupId    = uuid();

  const itemsVar: Variable = {
    kind: 'variable', id: itemsVarId,
    name: 'items',
    varType: 'array',
    defaultValue: buildContainerItemsLiteral(container.initialItems),
    description: `Stock for container "${container.varName}"`,
  };

  const containerGroup: VariableGroup = {
    kind: 'group', id: groupId,
    name: container.varName,
    children: [itemsVar],
  };

  return {
    containerGroup,
    varIds: { containersRootGroupId: rootGroupId, groupId, itemsVarId },
  };
}
