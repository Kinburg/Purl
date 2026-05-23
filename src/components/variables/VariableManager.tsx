import { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import type { Variable, VariableGroup, VariableTreeNode, VariableType } from '../../types';
import { getVariablePath } from '../../utils/treeUtils';
import { useT } from '../../i18n';
import { useConfirm } from '../shared/ConfirmModal';
import { TYPE_DEFAULTS, TYPE_COLOR, type TreeActions } from './variableTreeShared';

// ─── Root component ───────────────────────────────────────────────────────────

export function VariableManager() {
  const t = useT();
  const project            = useProjectStore(s => s.project);
  const addVariableGroup   = useProjectStore(s => s.addVariableGroup);
  const addVariable        = useProjectStore(s => s.addVariable);
  const updateVariable     = useProjectStore(s => s.updateVariable);
  const deleteVariableNode = useProjectStore(s => s.deleteVariableNode);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingVarId, setEditingVarId] = useState<string | null>(null);

  // Inline "new group" input at root level
  const [addingRootGroup, setAddingRootGroup] = useState(false);
  const [rootGroupName, setRootGroupName] = useState('');
  const rootGroupRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (addingRootGroup) rootGroupRef.current?.focus(); }, [addingRootGroup]);

  const toggleExpand = (id: string) =>
    setExpandedIds(prev => { const s = new Set(prev); if (s.has(id)) { s.delete(id); } else { s.add(id); } return s; });

  const actions: TreeActions = {
    onAddVariable: (parentId, data) => addVariable(parentId, data),
    onAddGroup: (parentId, name) => addVariableGroup(parentId, name),
    onUpdateVariable: (id, patch) => updateVariable(id, patch),
    onDeleteNode: (id) => deleteVariableNode(id),
  };

  const confirmRootGroup = () => {
    const name = rootGroupName.trim();
    if (name) addVariableGroup(null, name);
    setAddingRootGroup(false);
    setRootGroupName('');
  };

  const handleAddRootVar = () => {
    const nodes = project.variableNodes;
    const allFlat = countVars(nodes);
    addVariable(null, { name: `var${allFlat + 1}`, varType: 'number', defaultValue: '0', description: '' });
  };

  return (
    <div className="p-2 flex flex-col gap-1">
      {/* Add toolbar */}
      <div className="flex gap-1 pb-1 border-b border-slate-800 mb-1">
        <button
          className="flex-1 text-xs text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1.5 transition-colors cursor-pointer border border-dashed border-slate-700 hover:border-indigo-600"
          onClick={handleAddRootVar}
        >
          {t.variables.addVariable}
        </button>
        <button
          className="flex-1 text-xs text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1.5 transition-colors cursor-pointer border border-dashed border-slate-700 hover:border-indigo-600"
          onClick={() => setAddingRootGroup(true)}
        >
          {t.variables.addGroup}
        </button>
      </div>

      <TreeLevel
        nodes={project.variableNodes}
        depth={0}
        expandedIds={expandedIds}
        editingVarId={editingVarId}
        onToggleExpand={toggleExpand}
        onEditVar={setEditingVarId}
        parentId={null}
        allNodes={project.variableNodes}
        pathPrefix=""
        actions={actions}
      />

      {/* Root-level "add group" inline input */}
      {addingRootGroup && (
        <input
          ref={rootGroupRef}
          className="text-xs bg-slate-800 text-white rounded px-2 py-1 outline-none border border-indigo-500 font-mono mt-1"
          placeholder={t.variables.groupNamePlaceholder}
          value={rootGroupName}
          onChange={e => setRootGroupName(e.target.value.replace(/[^a-zA-Zа-яёА-ЯЁ0-9_]/g, ''))}
          onBlur={confirmRootGroup}
          onKeyDown={e => {
            if (e.key === 'Enter') confirmRootGroup();
            if (e.key === 'Escape') { setAddingRootGroup(false); setRootGroupName(''); }
          }}
        />
      )}
    </div>
  );
}

function countVars(nodes: VariableTreeNode[]): number {
  return nodes.reduce((acc, n) => {
    if (n.kind === 'variable') return acc + 1;
    return acc + countVars(n.children);
  }, 0);
}

// ─── Tree level ───────────────────────────────────────────────────────────────

export function TreeLevel({
  nodes, depth, expandedIds, editingVarId, onToggleExpand, onEditVar, parentId, allNodes, pathPrefix, actions, showAddAtRoot,
}: {
  nodes: VariableTreeNode[];
  depth: number;
  expandedIds: Set<string>;
  editingVarId: string | null;
  onToggleExpand: (id: string) => void;
  onEditVar: (id: string | null) => void;
  parentId: string | null;
  allNodes: VariableTreeNode[];
  pathPrefix: string;
  actions: TreeActions;
  /** Show add buttons even at depth 0 (used by character modal) */
  showAddAtRoot?: boolean;
}) {
  const t = useT();
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName]     = useState('');
  const groupInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (addingGroup) groupInputRef.current?.focus(); }, [addingGroup]);

  const confirmGroup = () => {
    const name = groupName.trim();
    if (name) actions.onAddGroup(parentId, name);
    setAddingGroup(false);
    setGroupName('');
  };

  const showAddButtons = depth > 0 || showAddAtRoot;

  if (nodes.length === 0 && depth === 0 && !showAddAtRoot) {
    return <p className="text-xs text-slate-600 italic px-2 py-1">{t.variables.empty}</p>;
  }

  return (
    <>
      {nodes.map(node => {
        if (node.kind === 'group') {
          const gPath = pathPrefix ? `${pathPrefix}.${node.name}` : node.name;
          return (
            <GroupNode
              key={node.id}
              group={node}
              depth={depth}
              expanded={expandedIds.has(node.id)}
              expandedIds={expandedIds}
              editingVarId={editingVarId}
              onToggleExpand={onToggleExpand}
              onEditVar={onEditVar}
              groupPath={gPath}
              allNodes={allNodes}
              actions={actions}
            />
          );
        }
        return (
          <VariableNode
            key={node.id}
            variable={node}
            depth={depth}
            expanded={editingVarId === node.id}
            onToggle={() => onEditVar(editingVarId === node.id ? null : node.id)}
            allNodes={allNodes}
            actions={actions}
          />
        );
      })}

      {/* Inline group/variable add */}
      {showAddButtons && (
        addingGroup ? (
          <input
            ref={groupInputRef}
            className="text-xs bg-slate-800 text-white rounded px-2 py-1 outline-none border border-indigo-500 font-mono"
            style={{ marginLeft: depth * 12 + 4 }}
            placeholder={t.variables.groupNamePlaceholder}
            value={groupName}
            onChange={e => setGroupName(e.target.value.replace(/[^a-zA-Zа-яёА-ЯЁ0-9_]/g, ''))}
            onBlur={confirmGroup}
            onKeyDown={e => {
              if (e.key === 'Enter') confirmGroup();
              if (e.key === 'Escape') { setAddingGroup(false); setGroupName(''); }
            }}
          />
        ) : (
          <div className="flex gap-1 flex-wrap" style={{ paddingLeft: depth * 12 + 4 }}>
            <button
              className="text-xs text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1 transition-colors cursor-pointer"
              onClick={() => {
                const allFlat = countVars(nodes);
                actions.onAddVariable(parentId, { name: `var${allFlat + 1}`, varType: 'number', defaultValue: '0', description: '' });
              }}
            >
              {t.variables.addVariable}
            </button>
            <button
              className="text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded px-2 py-1 transition-colors cursor-pointer"
              onClick={() => setAddingGroup(true)}
            >
              {t.variables.addGroup}
            </button>
          </div>
        )
      )}
    </>
  );
}

// ─── Group node ───────────────────────────────────────────────────────────────

function GroupNode({
  group, depth, expanded, expandedIds, editingVarId, onToggleExpand, onEditVar, groupPath, allNodes, actions,
}: {
  group: VariableGroup;
  depth: number;
  expanded: boolean;
  expandedIds: Set<string>;
  editingVarId: string | null;
  onToggleExpand: (id: string) => void;
  onEditVar: (id: string | null) => void;
  groupPath: string;
  allNodes: VariableTreeNode[];
  actions: TreeActions;
}) {
  const t = useT();
  const confirmDeleteVariable = useEditorPrefsStore(s => s.confirmDeleteVariable);
  const { ask, modal: confirmModal } = useConfirm();

  return (
    <div>
      <div
        className="flex items-center gap-1 rounded px-2 py-1 cursor-pointer hover:bg-slate-800 transition-colors group/grp"
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={() => onToggleExpand(group.id)}
      >
        <span className="text-slate-500 text-xs w-3 shrink-0">{expanded ? '▾' : '▸'}</span>
        <span className="text-orange-400/60 text-xs font-mono shrink-0">{'{}'}</span>
        <span className="text-xs text-slate-300 font-medium flex-1 truncate">{group.name}</span>
        <span className="text-xs text-slate-600 font-mono truncate opacity-0 group-hover/grp:opacity-100 transition-opacity">${groupPath}</span>
        <button
          className="text-slate-700 hover:text-red-400 text-xs cursor-pointer opacity-0 group-hover/grp:opacity-100 transition-opacity"
          onClick={e => {
            e.stopPropagation();
            if (confirmDeleteVariable) {
              ask({ message: t.variables.confirmDeleteGroup(group.name), variant: 'danger' }, () => actions.onDeleteNode(group.id));
            } else {
              actions.onDeleteNode(group.id);
            }
          }}
        >
          ✕
        </button>
      </div>
      {expanded && (
        <div>
          <TreeLevel
            nodes={group.children}
            depth={depth + 1}
            expandedIds={expandedIds}
            editingVarId={editingVarId}
            onToggleExpand={onToggleExpand}
            onEditVar={onEditVar}
            parentId={group.id}
            allNodes={allNodes}
            pathPrefix={groupPath}
            actions={actions}
          />
        </div>
      )}
      {confirmModal}
    </div>
  );
}

// ─── Variable node ────────────────────────────────────────────────────────────

function VariableNode({
  variable: v, depth, expanded, onToggle, allNodes, actions,
}: {
  variable: Variable;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  allNodes: VariableTreeNode[];
  actions: TreeActions;
}) {
  const t = useT();
  const confirmDeleteVariable = useEditorPrefsStore(s => s.confirmDeleteVariable);
  const { ask, modal: confirmModal } = useConfirm();
  const upd = (patch: Partial<Variable>) => actions.onUpdateVariable(v.id, patch);

  return (
    <div className="rounded border border-slate-700/60 overflow-hidden" style={{ marginLeft: depth * 12 }}>
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-800 transition-colors group/var"
        onClick={onToggle}
      >
        <span className={`text-xs font-mono font-bold ${TYPE_COLOR[v.varType]} w-3 shrink-0`}>
          {v.varType[0].toUpperCase()}
        </span>
        <span className="flex-1 text-xs text-white font-mono truncate">${getVariablePath(v.id, allNodes) || v.name}</span>
        <span className="text-xs text-slate-500 font-mono truncate max-w-[50px]">{v.defaultValue || '…'}</span>
        <button
          className="text-slate-700 hover:text-red-400 text-xs cursor-pointer opacity-0 group-hover/var:opacity-100 transition-opacity"
          onClick={e => {
            e.stopPropagation();
            if (confirmDeleteVariable) {
              ask({ message: t.variables.confirmDeleteVar(v.name), variant: 'danger' }, () => actions.onDeleteNode(v.id));
            } else {
              actions.onDeleteNode(v.id);
            }
          }}
        >
          ✕
        </button>
        <span className="text-slate-500 text-xs">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 py-2 flex flex-col gap-2 border-t border-slate-700 bg-slate-800/30">
          <Field label={t.variables.fieldName}>
            <input
              className="flex-1 min-w-0 bg-slate-800 text-xs text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 font-mono"
              value={v.name}
              onChange={e => upd({ name: e.target.value.replace(/[^a-zA-Zа-яёА-ЯЁ0-9_]/g, '') })}
              placeholder="varName"
            />
            <span className="text-xs text-slate-500 font-mono ml-1">($)</span>
          </Field>

          <Field label={t.variables.fieldType}>
            <select
              className="flex-1 min-w-0 bg-slate-800 text-xs text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
              value={v.varType}
              onChange={e => {
                const varType = e.target.value as VariableType;
                upd({ varType, defaultValue: TYPE_DEFAULTS[varType] });
              }}
            >
              <option value="number">{t.variables.typeNumber}</option>
              <option value="string">{t.variables.typeString}</option>
              <option value="boolean">{t.variables.typeBoolean}</option>
              <option value="array">{t.variables.typeArray}</option>
              <option value="datetime">{t.variables.typeDateTime}</option>
            </select>
          </Field>

          <Field label={t.variables.fieldDefault}>
            {v.varType === 'boolean' ? (
              <select
                className="flex-1 min-w-0 bg-slate-800 text-xs text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
                value={v.defaultValue}
                onChange={e => upd({ defaultValue: e.target.value })}
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            ) : (
              <input
                className="flex-1 min-w-0 bg-slate-800 text-xs text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 font-mono"
                value={v.defaultValue}
                placeholder={
                  v.varType === 'number'   ? t.variables.defaultPlaceholderNumber :
                  v.varType === 'array'    ? '[]' :
                  v.varType === 'datetime' ? '2024-01-01T12:00' :
                  t.variables.defaultPlaceholderText
                }
                onChange={e => upd({ defaultValue: e.target.value })}
              />
            )}
          </Field>

          <Field label={t.variables.fieldDescription}>
            <input
              className="flex-1 min-w-0 bg-slate-800 text-xs text-slate-300 rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
              value={v.description}
              placeholder={t.variables.descriptionPlaceholder}
              onChange={e => upd({ description: e.target.value })}
            />
          </Field>

          <div className="text-xs text-slate-500 font-mono bg-slate-800/60 px-2 py-1 rounded break-all">
            {'<<set $' + (getVariablePath(v.id, allNodes) || v.name) + ' to ' + (v.varType === 'string' || v.varType === 'datetime' ? `"${v.defaultValue}"` : v.defaultValue || (v.varType === 'array' ? '[]' : v.defaultValue)) + '>>'}
          </div>
        </div>
      )}
      {confirmModal}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-slate-400 w-20 shrink-0">{label}:</label>
      <div className="flex-1 min-w-0 flex items-center gap-1">{children}</div>
    </div>
  );
}
