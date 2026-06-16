import type { VariableTreeNode, VariableGroup, QuestDefinition, QuestCategory, QuestVarIds } from '../../types';
import { uuid } from '../ids';
import { charToVarPrefix } from './characterVars';

const QUESTS_ROOT_GROUP_NAME = 'quests';

export function findOrCreateQuestsRootGroup(variableNodes: VariableTreeNode[]): {
  nodes: VariableTreeNode[];
  rootGroupId: string;
} {
  const existing = variableNodes.find(
    n => n.kind === 'group' && n.name === QUESTS_ROOT_GROUP_NAME,
  ) as VariableGroup | undefined;
  if (existing) return { nodes: variableNodes, rootGroupId: existing.id };
  const rootGroup: VariableGroup = { kind: 'group', id: uuid(), name: QUESTS_ROOT_GROUP_NAME, children: [] };
  return { nodes: [...variableNodes, rootGroup], rootGroupId: rootGroup.id };
}

/** A valid, unique SugarCube identifier for a quest/step varName among `taken`. */
export function uniqueQuestVarName(name: string, taken: string[]): string {
  const base = charToVarPrefix(name) || 'quest';
  let varName = base;
  let i = 2;
  while (taken.includes(varName)) { varName = `${base}_${i}`; i++; }
  return varName;
}

export interface QuestVarBuildResult {
  questGroup: VariableGroup;
  varIds: QuestVarIds;
}

/** Build the VariableGroup subtree for a quest (name/description/state/category + steps). */
export function buildQuestVarNodes(
  quest: QuestDefinition,
  rootGroupId: string,
  categories: QuestCategory[],
): QuestVarBuildResult {
  const categoryName = categories.find(c => c.id === quest.categoryId)?.name ?? '';
  const nameVarId = uuid(), descVarId = uuid(), stateVarId = uuid(), categoryVarId = uuid(), groupId = uuid();

  const children: VariableTreeNode[] = [
    { kind: 'variable', id: nameVarId,     name: 'name',        varType: 'string', defaultValue: quest.name,              description: 'Quest name' },
    { kind: 'variable', id: descVarId,     name: 'description', varType: 'string', defaultValue: quest.description ?? '', description: '' },
    { kind: 'variable', id: stateVarId,    name: 'state',       varType: 'string', defaultValue: quest.initialState,      description: 'Quest state: hidden|active|done|failed' },
    { kind: 'variable', id: categoryVarId, name: 'category',    varType: 'string', defaultValue: categoryName,            description: '' },
  ];

  let stepsGroupId: string | undefined;
  const stepVarIds: Record<string, { groupId: string; nameVarId: string; descVarId: string; stateVarId: string }> = {};
  if (quest.composite && quest.steps.length > 0) {
    stepsGroupId = uuid();
    const stepGroups: VariableGroup[] = quest.steps.map(st => {
      const sg = uuid(), sn = uuid(), sd = uuid(), ss = uuid();
      stepVarIds[st.id] = { groupId: sg, nameVarId: sn, descVarId: sd, stateVarId: ss };
      return {
        kind: 'group', id: sg, name: st.varName, children: [
          { kind: 'variable', id: sn, name: 'name',        varType: 'string', defaultValue: st.name,              description: '' },
          { kind: 'variable', id: sd, name: 'description', varType: 'string', defaultValue: st.description ?? '', description: '' },
          { kind: 'variable', id: ss, name: 'state',       varType: 'string', defaultValue: st.initialState,      description: '' },
        ],
      };
    });
    children.push({ kind: 'group', id: stepsGroupId, name: 'steps', children: stepGroups });
  }

  const questGroup: VariableGroup = { kind: 'group', id: groupId, name: quest.varName, children };
  return {
    questGroup,
    varIds: {
      questsRootGroupId: rootGroupId, groupId, nameVarId, descVarId, stateVarId, categoryVarId,
      stepsGroupId, stepVarIds: quest.composite ? stepVarIds : undefined,
    },
  };
}
