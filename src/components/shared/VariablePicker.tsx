import { useState, useRef, useEffect, useCallback } from 'react';
import type { Variable, VariableTreeNode, VariableType, VariableGroup } from '../../types';
import { getVariablePath, getNodePath, hasLeafVariables } from '../../utils/treeUtils';
import { isParamId } from '../../utils/pluginParamScope';

import { EmojiIcon } from './EmojiIcons';
export interface VariablePickerProps {
  value: string;                // currently selected variableId or groupId
  onChange: (id: string) => void;
  nodes: VariableTreeNode[];    // project.variableNodes
  placeholder?: string;
  filterType?: VariableType;    // optional: only show variables of this type
  filter?: (v: Variable) => boolean; // optional: custom filter function
  className?: string;
  allowGroups?: boolean;        // if true, double-clicking a group selects it
}

export function VariablePicker({ value, onChange, nodes, placeholder, filterType, filter: customFilter, className, allowGroups }: VariablePickerProps) {
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  // Resolve selected node's display path (works for both variables and groups)
  const selectedPath = value ? (getVariablePath(value, nodes) || getNodePath(value, nodes)) : '';

  const openPanel = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const maxH = Math.max(spaceBelow, spaceAbove, 120);
      const top = spaceBelow >= Math.min(maxH, 240) ? rect.bottom + 2 : rect.top - Math.min(maxH, 240) - 2;
      setPos({ top, left: Math.min(rect.left, window.innerWidth - 220), maxHeight: Math.min(maxH, 320) });
    }
    setOpen(true);
    setFilterText('');
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Focus filter input when panel opens
  useEffect(() => { if (open) setTimeout(() => filterInputRef.current?.focus(), 0); }, [open]);

  const toggleGroup = (id: string) => {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const filterLower = filterText.toLowerCase();

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className || "flex-1 min-w-0 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer text-left truncate"}
        onClick={() => open ? setOpen(false) : openPanel()}
      >
        {selectedPath
          ? <span className="font-mono">{isParamId(value) ? '_' : '$'}{selectedPath}</span>
          : <span className="text-slate-500">{placeholder || 'Select variable...'}</span>
        }
      </button>

      {open && pos && (
        <div
          ref={panelRef}
          className="fixed z-[9999] bg-slate-900 border border-slate-600 rounded shadow-xl flex flex-col"
          style={{ top: pos.top, left: pos.left, width: 220, maxHeight: pos.maxHeight }}
        >
          {/* Filter */}
          <input
            ref={filterInputRef}
            className="text-xs bg-slate-800 text-white px-2 py-1 outline-none border-b border-slate-700 rounded-t"
            placeholder="Filter..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
          />

          {/* Tree */}
          <div className="overflow-y-auto flex-1 py-1">
            <PickerTree
              nodes={nodes}
              depth={0}
              expanded={expanded}
              onToggleGroup={toggleGroup}
              onSelect={handleSelect}
              selectedId={value}
              filterType={filterType}
              filter={customFilter}
              filterText={filterLower}
              allNodes={nodes}
              allowGroups={allowGroups}
            />
          </div>
        </div>
      )}
    </>
  );
}

// ─── Reusable tree renderer ──────────────────────────────────────────────────

export function PickerTree({
  nodes, depth, expanded, onToggleGroup, onSelect, selectedId, filterType, filter, filterText, allNodes, allowGroups,
}: {
  nodes: VariableTreeNode[];
  depth: number;
  expanded: Set<string>;
  onToggleGroup: (id: string) => void;
  onSelect: (id: string) => void;
  selectedId: string;
  filterType?: VariableType;
  filter?: (v: Variable) => boolean;
  filterText: string;
  allNodes: VariableTreeNode[];
  allowGroups?: boolean;
}) {
  return (
    <>
      {nodes.map(node => {
        if (node.kind === 'group') {
          // Skip groups with no matching leaf variables
          if (!hasLeafVariables(node, filterType)) return null;
          if (filterText && !groupMatchesFilter(node, filterText, filterType, filter)) return null;

          const isExp = expanded.has(node.id) || !!filterText;
          const isGroupSelected = allowGroups && node.id === selectedId;
          return (
            <div key={node.id}>
              <div
                className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer transition-colors ${isGroupSelected ? 'bg-indigo-600/30 text-white' : 'hover:bg-slate-800'}`}
                style={{ paddingLeft: depth * 12 + 8 }}
                onClick={() => onToggleGroup(node.id)}
                onDoubleClick={allowGroups ? () => onSelect(node.id) : undefined}
                title={allowGroups ? 'Double-click to select' : undefined}
              >
                <span className="text-slate-500 text-xs w-3 shrink-0">{isExp ? '▾' : '▸'}</span>
                <span className={`text-xs font-mono shrink-0 ${isGroupSelected ? 'text-orange-300' : 'text-orange-400/60'}`}>{'{}'}</span>
                <span className={`text-xs truncate ${isGroupSelected ? 'text-white' : 'text-slate-400'}`}>{node.name}</span>
                {allowGroups && <span className="text-[10px] text-slate-600 ml-1 shrink-0">⤶</span>}
                {isGroupSelected && <span className="text-xs text-indigo-400 ml-auto shrink-0 inline-flex"><EmojiIcon name="check" size={20} /></span>}
              </div>
              {isExp && (
                <PickerTree
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggleGroup={onToggleGroup}
                  onSelect={onSelect}
                  selectedId={selectedId}
                  filterType={filterType}
                  filter={filter}
                  filterText={filterText}
                  allNodes={allNodes}
                  allowGroups={allowGroups}
                />
              )}
            </div>
          );
        }

        // Variable leaf
        if (filterType && node.varType !== filterType) return null;
        if (filter && !filter(node)) return null;
        
        const path = getVariablePath(node.id, allNodes) || node.name;
        if (filterText && !path.toLowerCase().includes(filterText) && !node.name.toLowerCase().includes(filterText)) return null;

        const isSelected = node.id === selectedId;
        return (
          <div
            key={node.id}
            className={`flex items-center gap-1.5 px-2 py-0.5 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-600/30 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
            style={{ paddingLeft: depth * 12 + 8 }}
            onClick={() => onSelect(node.id)}
          >
            <span className={`text-xs font-mono w-3 shrink-0 ${typeColor(node.varType)}`}>{node.varType[0].toUpperCase()}</span>
            <span className="text-xs font-mono truncate flex-1">{node.name}</span>
            {isSelected && <span className="text-xs text-indigo-400 inline-flex"><EmojiIcon name="check" size={20} /></span>}
          </div>
        );
      })}
    </>
  );
}

function typeColor(t: VariableType): string {
  switch (t) {
    case 'number': return 'text-sky-400';
    case 'string': return 'text-emerald-400';
    case 'boolean': return 'text-amber-400';
    case 'array': return 'text-violet-400';
    case 'datetime': return 'text-pink-400';
    default: return 'text-slate-400';
  }
}

/** Check if any leaf variable in this group matches the filter text */
function groupMatchesFilter(group: VariableGroup, filterText: string, filterType?: VariableType, filter?: (v: Variable) => boolean): boolean {
  return group.children.some(n => {
    if (n.kind === 'variable') {
      if (filterType && n.varType !== filterType) return false;
      if (filter && !filter(n)) return false;
      return n.name.toLowerCase().includes(filterText);
    }
    if (n.kind === 'group') return groupMatchesFilter(n, filterText, filterType, filter);
    return false;
  });
}
