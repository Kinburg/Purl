import { useRef, useState, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { usePluginStore } from '../../store/pluginStore';
import { useEditorStore } from '../../store/editorStore';
import { useT } from '../../i18n';
import { flattenVariables, getVariablePath } from '../../utils/treeUtils';
import { VariablePicker, PickerTree } from '../shared/VariablePicker';
import { useVariableNodes } from '../shared/VariableScope';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { isParamId } from '../../utils/pluginParamScope';
import { EmojiIcon } from '../shared/EmojiIcons';
function PluginGlyph({ icon, size }: { icon?: string; size: number }) {
  if (icon) return <span style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>;
  return <EmojiIcon name="puzzle" size={size} />;
}
import { getNodePath } from '../../utils/treeUtils';
import type { PluginBlock, PluginParam, Variable, VariableTreeNode } from '../../types';

export function PluginBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: PluginBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<PluginBlock>) => void;
}) {
  const updateBlock      = useProjectStore(s => s.updateBlock);
  const saveSnapshot     = useProjectStore(s => s.saveSnapshot);
  const project          = useProjectStore(s => s.project);
  const plugins          = usePluginStore(s => s.plugins);
  const openPluginEditor = useEditorStore(s => s.openPluginEditor);
  const t = useT();
  const variableNodes = useVariableNodes();
  const update = onUpdate ?? ((p: Partial<PluginBlock>) => updateBlock(sceneId, block.id, p as never));

  const def = plugins.find((p) => p.id === block.pluginId);

  if (!def) {
    return (
      <div className="flex flex-col gap-1">
        <div className="text-xs text-red-400 italic">
          {t.pluginBlock.notFound.replace('{id}', block.pluginId)}
        </div>
        <BlockEffectsPanel delay={block.delay} onDelayChange={(v) => update({ delay: v })} />
      </div>
    );
  }

  const setValue = (key: string, val: string) => {
    saveSnapshot();
    update({ values: { ...block.values, [key]: val } });
  };

  const getValue = (param: PluginParam): string =>
    block.values[param.key] ?? param.default ?? '';

  return (
    <div className="flex flex-col gap-2">
      {/* Plugin identity header */}
      <div
        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border-l-4 bg-slate-800/60"
        style={{ borderLeftColor: def.color }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="leading-none shrink-0"><PluginGlyph icon={def.icon} size={16} /></span>
          <div className="min-w-0">
            <div className="text-xs font-medium text-white truncate">{def.name}</div>
            {def.description && (
              <div className="text-[10px] text-slate-400 truncate">{def.description}</div>
            )}
          </div>
        </div>
        <button
          className="text-[10px] text-slate-400 hover:text-indigo-400 cursor-pointer shrink-0"
          title={t.pluginBlock.editPluginTooltip}
          onClick={() => openPluginEditor(def.id)}
        >
          <span className="inline-flex items-center gap-1"><EmojiIcon name="pencil" size={20} /> {t.pluginBlock.editPlugin}</span>
        </button>
      </div>

      {/* Params form */}
      {def.params.length === 0 ? (
        <div className="text-xs text-slate-500 italic">{t.pluginBlock.noParams}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {def.params.map((param) => (
            <ParamInput
              key={param.key}
              param={param}
              value={getValue(param)}
              onChange={(v) => setValue(param.key, v)}
              projectVariableNodes={variableNodes}
              scenes={project.scenes.filter((s) => s.id !== sceneId)}
            />
          ))}
        </div>
      )}

      <BlockEffectsPanel delay={block.delay} onDelayChange={(v) => update({ delay: v })} />
    </div>
  );
}

// ─── ParamInput ───────────────────────────────────────────────────────────────

function ParamInput({
  param,
  value,
  onChange,
  projectVariableNodes,
  scenes,
}: {
  param: PluginParam;
  value: string;
  onChange: (v: string) => void;
  projectVariableNodes: VariableTreeNode[];
  scenes: { id: string; name: string }[];
}) {
  const inputCls =
    'bg-slate-800 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 outline-none focus:border-indigo-500';
  const labelCls = 'text-xs text-slate-400 shrink-0 min-w-[80px]';

  // ── bool ──
  if (param.kind === 'bool') {
    return (
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
          className="accent-indigo-500 cursor-pointer"
        />
        <span className="text-xs text-slate-400">{param.label || param.key}</span>
      </label>
    );
  }

  // ── variable / array / datetime — picks a typed variable from the tree ──
  if (param.kind === 'array' || param.kind === 'datetime') {
    const filterType = param.kind === 'array' ? 'array'
      : param.kind === 'datetime' ? 'datetime'
      : undefined;
    const vars = flattenVariables(projectVariableNodes);
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className={labelCls}>{param.label || param.key}</span>
        <VariablePicker
          value={findVarIdByPath(value, vars, projectVariableNodes)}
          onChange={(id) => {
            const ref = varIdToRef(id, vars, projectVariableNodes);
            onChange(ref);
          }}
          nodes={projectVariableNodes}
          filterType={filterType}
          className="flex-1 min-w-0"
        />
      </div>
    );
  }

  // ── object — picks a variable group (double-click) ──
  if (param.kind === 'object') {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className={labelCls}>{param.label || param.key}</span>
        <VariablePicker
          value={findGroupIdByPath(value, projectVariableNodes)}
          onChange={(id) => {
            const path = getNodePath(id, projectVariableNodes);
            onChange(path ? `$${path}` : '');
          }}
          nodes={projectVariableNodes}
          allowGroups
          className="flex-1 min-w-0"
        />
      </div>
    );
  }

  // ── scene ──
  if (param.kind === 'scene') {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className={labelCls}>{param.label || param.key}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} flex-1 min-w-0 cursor-pointer`}
        >
          <option value="">—</option>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
    );
  }

  // ── number ──
  if (param.kind === 'number') {
    return (
      <TextParamInput
        label={param.label || param.key}
        value={value}
        onChange={onChange}
        nodes={projectVariableNodes}
        placeholder={param.default ?? '0'}
        inputCls={inputCls}
        labelCls={labelCls}
        narrow
      />
    );
  }

  // ── text (default) ──
  return (
    <TextParamInput
      label={param.label || param.key}
      value={value}
      onChange={onChange}
      nodes={projectVariableNodes}
      placeholder={param.default ?? ''}
      inputCls={inputCls}
      labelCls={labelCls}
    />
  );
}

// ─── TextParamInput ───────────────────────────────────────────────────────────
// Text (or number-literal) input with a small $-button that inserts a variable
// reference at the cursor position — mixing literal text and variable refs freely.

function TextParamInput({
  label, value, onChange, nodes, placeholder, inputCls, labelCls, narrow,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  nodes: VariableTreeNode[];
  placeholder: string;
  inputCls: string;
  labelCls: string;
  narrow?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const insertAtCursor = (text: string) => {
    const el = inputRef.current;
    if (el) {
      const start = el.selectionStart ?? value.length;
      const end   = el.selectionEnd   ?? value.length;
      const next  = value.slice(0, start) + text + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + text.length;
        el.focus();
      });
    } else {
      onChange(value + text);
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={labelCls}>{label}</span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} ${narrow ? 'w-28' : 'flex-1 min-w-0'}`}
      />
      <ParamVarInsertBtn nodes={nodes} onInsert={insertAtCursor} />
    </div>
  );
}

// ─── ParamVarInsertBtn ────────────────────────────────────────────────────────
// Small $ button that opens a floating variable picker and inserts the selected
// variable ref at the cursor position of the associated input.
// For plugin-body param nodes (id `param:key`), inserts `_key`; for project
// variables, inserts `$path`.

function ParamVarInsertBtn({
  nodes,
  onInsert,
}: {
  nodes: VariableTreeNode[];
  onInsert: (text: string) => void;
}) {
  const [open, setOpen]       = useState(false);
  const [filter, setFilter]   = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pos, setPos]         = useState<{ top: number; left: number } | null>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const openDrop = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 2, left: Math.min(rect.left, window.innerWidth - 224) });
    }
    setOpen(true);
    setFilter('');
    setExpanded(new Set());
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => filterRef.current?.focus(), 0);
  }, [open]);

  const handleSelect = (id: string) => {
    let text: string;
    if (isParamId(id)) {
      // virtual plugin param → temp var
      text = `_${id.slice('param:'.length)}`;
    } else {
      const path = getVariablePath(id, nodes) ?? nodes.flatMap(n => n.kind === 'variable' ? [n] : []).find(v => v.id === id)?.name ?? '';
      text = `$${path}`;
    }
    onInsert(text);
    setOpen(false);
  };

  const toggleGroup = (id: string) =>
    setExpanded(prev => { const s = new Set(prev);
      if (s.has(id)) {
        s.delete(id);
      } else {
        s.add(id);
      }
      return s; });

  if (nodes.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title="Insert variable"
        onClick={() => open ? setOpen(false) : openDrop()}
        className="shrink-0 px-1.5 py-0.5 text-xs font-mono text-slate-500 hover:text-indigo-400 bg-slate-800 border border-slate-600 hover:border-indigo-500 rounded cursor-pointer transition-colors leading-none"
      >
        $
      </button>

      {open && pos && (
        <div
          ref={dropRef}
          className="fixed z-[10000] bg-slate-900 border border-slate-600 rounded shadow-xl flex flex-col"
          style={{ top: pos.top, left: pos.left, width: 220, maxHeight: 260 }}
        >
          <input
            ref={filterRef}
            className="text-xs bg-slate-800 text-white px-2 py-1 outline-none border-b border-slate-700 rounded-t"
            placeholder="Filter..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
          />
          <div className="overflow-y-auto flex-1 py-1">
            <PickerTree
              nodes={nodes}
              depth={0}
              expanded={expanded}
              onToggleGroup={toggleGroup}
              onSelect={handleSelect}
              selectedId=""
              filterText={filter.toLowerCase()}
              allNodes={nodes}
            />
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Convert a stored ref string (`$path` or `_key`) to a variable id for VariablePicker. */
function findVarIdByPath(value: string, vars: Variable[], nodes: VariableTreeNode[]): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.startsWith('_')) {
    const key = trimmed.slice(1);
    return vars.find((v) => v.name === key && isParamId(v.id))?.id ?? '';
  }
  const path = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;
  return vars.find((v) => getVariablePath(v.id, nodes) === path)?.id ?? '';
}

/** Convert a variable id to a SC ref string (`$path` or `_key` for param nodes). */
function varIdToRef(id: string, vars: Variable[], nodes: VariableTreeNode[]): string {
  if (!id) return '';
  if (isParamId(id)) return `_${id.slice('param:'.length)}`;
  const found = vars.find((v) => v.id === id);
  if (!found) return '';
  const path = getVariablePath(found.id, nodes) || found.name;
  return `$${path}`;
}

/** Find a group node id by its `$path` value (for object-kind params). */
function findGroupIdByPath(value: string, nodes: VariableTreeNode[]): string {
  if (!value) return '';
  const path = value.trim().startsWith('$') ? value.trim().slice(1) : value.trim();
  return findGroupByPath(path, nodes);
}

function findGroupByPath(path: string, nodes: VariableTreeNode[], prefix = ''): string {
  for (const n of nodes) {
    const myPath = prefix ? `${prefix}.${n.name}` : n.name;
    if (myPath === path) return n.id;
    if (n.kind === 'group') {
      const found = findGroupByPath(path, n.children, myPath);
      if (found) return found;
    }
  }
  return '';
}
