import type { VariableTreeNode, VariableGroup, Variable, AssetTreeNode, AssetGroup, ItemVarIds, ItemCategory } from '../../types';
import { uuid } from '../ids';

const ITEMS_ROOT_GROUP_NAME = 'items';
const ITEMS_ASSET_FOLDER_NAME = 'Items';
const ITEMS_ASSET_FOLDER_PATH = 'assets/Items';

/**
 * Find the root 'items' VariableGroup or create it if absent.
 * Returns updated variableNodes + the root group id.
 */
export function findOrCreateItemsRootGroup(variableNodes: VariableTreeNode[]): {
  nodes: VariableTreeNode[];
  rootGroupId: string;
} {
  const existing = variableNodes.find(
    n => n.kind === 'group' && n.name === ITEMS_ROOT_GROUP_NAME,
  ) as VariableGroup | undefined;
  if (existing) return { nodes: variableNodes, rootGroupId: existing.id };
  const rootGroup: VariableGroup = { kind: 'group', id: uuid(), name: ITEMS_ROOT_GROUP_NAME, children: [] };
  return { nodes: [...variableNodes, rootGroup], rootGroupId: rootGroup.id };
}

/**
 * Find the 'assets/Items' AssetGroup or create it if absent.
 * Returns updated assetNodes + the folder id.
 */
export function findOrCreateItemsAssetFolder(assetNodes: AssetTreeNode[]): {
  nodes: AssetTreeNode[];
  folderId: string;
} {
  const existing = assetNodes.find(
    n => n.kind === 'group' && (n as AssetGroup).name === ITEMS_ASSET_FOLDER_NAME,
  ) as AssetGroup | undefined;
  if (existing) return { nodes: assetNodes, folderId: existing.id };
  const folder: AssetGroup = {
    kind: 'group', id: uuid(),
    name: ITEMS_ASSET_FOLDER_NAME,
    relativePath: ITEMS_ASSET_FOLDER_PATH,
    children: [],
  };
  return { nodes: [...assetNodes, folder], folderId: folder.id };
}

export interface ItemVarBuildResult {
  itemGroup: VariableGroup;
  varIds: ItemVarIds;
}

/**
 * Build the VariableGroup subtree for a newly created item.
 * Places the group under the root 'items' group (via rootGroupId).
 */
export function buildItemVarNodes(
  item: { name: string; varName: string; category: ItemCategory; stackable: boolean; targetSlot?: string; iconSrc?: string; description?: string },
  rootGroupId: string,
): ItemVarBuildResult {
  const nameVarId      = uuid();
  const iconVarId      = uuid();
  const priceVarId     = uuid();
  const descVarId      = uuid();
  const stackableVarId = uuid();
  const slotVarId      = item.category === 'wearable' ? uuid() : undefined;
  const groupId        = uuid();

  const children: Variable[] = [
    {
      kind: 'variable', id: nameVarId,
      name: 'name', varType: 'string',
      defaultValue: item.name,
      description: `Display name for item "${item.name}"`,
    },
    {
      kind: 'variable', id: iconVarId,
      name: 'icon', varType: 'string',
      defaultValue: item.iconSrc ?? '',
      description: `Icon path for item "${item.name}"`,
    },
    {
      kind: 'variable', id: priceVarId,
      name: 'price', varType: 'number',
      defaultValue: '0',
      description: `Price of item "${item.name}"`,
    },
    {
      kind: 'variable', id: descVarId,
      name: 'description', varType: 'string',
      defaultValue: item.description ?? '',
      description: `Description of item "${item.name}"`,
    },
    {
      kind: 'variable', id: stackableVarId,
      name: 'stackable', varType: 'boolean',
      defaultValue: item.stackable ? 'true' : 'false',
      description: '',
    },
  ];

  if (slotVarId) {
    children.push({
      kind: 'variable', id: slotVarId,
      name: 'slot', varType: 'string',
      defaultValue: (item.targetSlot ?? '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      description: `Paperdoll slot for item "${item.name}"`,
    });
  }

  const itemGroup: VariableGroup = { kind: 'group', id: groupId, name: item.varName, children };
  return {
    itemGroup,
    varIds: { itemsRootGroupId: rootGroupId, groupId, nameVarId, iconVarId, priceVarId, descVarId, stackableVarId, slotVarId },
  };
}
