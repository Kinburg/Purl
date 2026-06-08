import { useState, useRef, useEffect, useCallback } from 'react';
import type { ImageBoundMapping, Asset, AssetTreeNode, AssetGroup } from '../../types';
import { useT } from '../../i18n';

import { EmojiIcon } from './EmojiIcons';
// ─── Asset tree helpers ───────────────────────────────────────────────────────

function hasImageAssets(nodes: AssetTreeNode[]): boolean {
  return nodes.some(n =>
    n.kind === 'asset' ? n.assetType === 'image' : hasImageAssets(n.children)
  );
}

function imageGroupMatchesFilter(group: AssetGroup, text: string): boolean {
  if (group.name.toLowerCase().includes(text)) return true;
  return group.children.some(n => {
    if (n.kind === 'asset') {
      return n.assetType === 'image' &&
        (n.name.toLowerCase().includes(text) || n.relativePath.toLowerCase().includes(text));
    }
    return imageGroupMatchesFilter(n, text);
  });
}

// ─── Asset tree renderer ──────────────────────────────────────────────────────

function AssetPickerTree({
  nodes, depth, expanded, onToggleGroup, onSelect, selectedPath, filterText,
}: {
  nodes: AssetTreeNode[];
  depth: number;
  expanded: Set<string>;
  onToggleGroup: (id: string) => void;
  onSelect: (path: string) => void;
  selectedPath: string;
  filterText: string;
}) {
  return (
    <>
      {nodes.map(node => {
        if (node.kind === 'group') {
          if (!hasImageAssets(node.children)) return null;
          if (filterText && !imageGroupMatchesFilter(node, filterText)) return null;
          const isExp = expanded.has(node.id) || !!filterText;
          return (
            <div key={node.id}>
              <div
                className="flex items-center gap-1 cursor-pointer hover:bg-slate-800 transition-colors"
                style={{ paddingLeft: depth * 12 + 8 }}
                onClick={() => onToggleGroup(node.id)}
              >
                <span className="text-slate-500 text-xs w-3 shrink-0">{isExp ? '▾' : '▸'}</span>
                <span className="text-amber-400/70 text-xs shrink-0 inline-flex"><EmojiIcon name="folder" size={20} /></span>
                <span className="text-xs text-slate-400 truncate py-0.5">{node.name}</span>
              </div>
              {isExp && (
                <AssetPickerTree
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggleGroup={onToggleGroup}
                  onSelect={onSelect}
                  selectedPath={selectedPath}
                  filterText={filterText}
                />
              )}
            </div>
          );
        }

        // Leaf — only images
        if (node.assetType !== 'image') return null;
        if (
          filterText &&
          !node.name.toLowerCase().includes(filterText) &&
          !node.relativePath.toLowerCase().includes(filterText)
        ) return null;

        const isSelected = node.relativePath === selectedPath;
        return (
          <div
            key={node.id}
            className={`flex items-center gap-1.5 cursor-pointer transition-colors ${
              isSelected ? 'bg-indigo-600/30 text-white' : 'hover:bg-slate-800 text-slate-300'
            }`}
            style={{ paddingLeft: depth * 12 + 8 }}
            onClick={() => onSelect(node.relativePath)}
          >
            <span className="text-slate-500 text-xs shrink-0 w-3 inline-flex"><EmojiIcon name="image" size={20} /></span>
            <span className="text-xs font-mono truncate flex-1 py-0.5">{node.name}</span>
            {isSelected && <span className="text-xs text-indigo-400 pr-1 inline-flex"><EmojiIcon name="check" size={20} /></span>}
          </div>
        );
      })}
    </>
  );
}

// ─── Shared image asset picker ────────────────────────────────────────────────
// Tree-based picker (folder hierarchy) + manual path/URL input.

export function ImageAssetPicker({
  assetNodes,
  value,
  onChange,
  placeholder = 'assets/img.png',
}: {
  assetNodes: AssetTreeNode[];
  value: string;
  onChange: (src: string) => void;
  placeholder?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);

  const hasImages = hasImageAssets(assetNodes);
  const displayName = value ? value.split('/').pop()! : '';

  const openPanel = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const maxH = Math.max(spaceBelow, spaceAbove, 120);
      // Open downward when there's room; otherwise anchor the panel's BOTTOM just
      // above the trigger so it hugs the button (no detached gap / overlap above).
      const openUp = spaceBelow < Math.min(maxH, 240);
      const w = Math.max(rect.width, 220);
      setPos({
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 2 }
          : { top: rect.bottom + 2 }),
        left: Math.min(rect.left, window.innerWidth - w - 4),
        width: w,
        maxHeight: Math.min(openUp ? spaceAbove : spaceBelow, 320),
      });
    }
    setOpen(true);
    setFilter('');
  }, []);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => filterRef.current?.focus(), 0);
  }, [open]);

  const toggleGroup = (id: string) => {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const filterLower = filter.toLowerCase();

  return (
    <div className="flex-1 flex flex-col gap-1 min-w-0">
      {hasImages ? (
        <>
          <button
            ref={btnRef}
            type="button"
            className="w-full bg-slate-800 text-xs rounded px-1.5 py-0.5 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer text-left truncate"
            onClick={() => open ? setOpen(false) : openPanel()}
          >
            {displayName
              ? <span className="font-mono text-white">{displayName}</span>
              : <span className="text-slate-500">{t.imageMappingEditor.selectAsset}</span>
            }
          </button>

          {open && pos && (
            <div
              ref={panelRef}
              className="fixed z-[9999] bg-slate-900 border border-slate-600 rounded shadow-xl flex flex-col"
              style={{ ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }), left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            >
              <input
                ref={filterRef}
                className="text-xs bg-slate-800 text-white px-2 py-1 outline-none border-b border-slate-700 rounded-t"
                placeholder="Filter…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
              />
              <div className="overflow-y-auto flex-1 py-1">
                <AssetPickerTree
                  nodes={assetNodes}
                  depth={0}
                  expanded={expanded}
                  onToggleGroup={toggleGroup}
                  onSelect={path => { onChange(path); setOpen(false); }}
                  selectedPath={value}
                  filterText={filterLower}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        // No image assets yet — fall back to a free-text path field so a value
        // can still be entered (e.g. before the asset is imported).
        <input
          className="w-full bg-slate-800 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 focus:border-indigo-500 font-mono"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

// ─── Mapping entry row ────────────────────────────────────────────────────────

function MappingEntry({
  m, assetNodes, onChange, onDelete,
}: {
  m: ImageBoundMapping;
  assetNodes: AssetTreeNode[];
  onChange: (patch: Partial<ImageBoundMapping>) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const mt = m.matchType ?? 'exact';
  const isEmpty = !m.src;

  return (
    <div className={`flex flex-col gap-1 border rounded p-1.5 ${isEmpty ? 'border-red-500/40' : 'border-slate-700/60'}`}>
      <div className="flex items-center gap-1">
        <select
          className="flex-1 bg-slate-800 text-xs text-white rounded px-1.5 py-0.5 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
          value={mt}
          onChange={e => onChange({ matchType: e.target.value as 'exact' | 'range' })}
        >
          <option value="exact">{t.imageMappingEditor.matchExact}</option>
          <option value="range">{t.imageMappingEditor.matchRange}</option>
        </select>
        <button
          className="text-slate-600 hover:text-red-400 text-xs cursor-pointer shrink-0 ml-1"
          onClick={onDelete}
        ><EmojiIcon name="close" size={20} /></button>
      </div>

      {mt === 'exact' && (
        <div className="flex gap-1 items-center">
          <span className="text-xs text-slate-500 shrink-0 w-10">{t.imageMappingEditor.valueLabel}</span>
          <input
            className="flex-1 bg-slate-800 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 font-mono"
            placeholder="100"
            value={m.value}
            onChange={e => onChange({ value: e.target.value })}
          />
        </div>
      )}

      {mt === 'range' && (
        <div className="grid grid-cols-2 gap-1">
          <div className="flex gap-1 items-center">
            <span className="text-xs text-slate-500 shrink-0 w-6">{t.imageMappingEditor.fromLabel}</span>
            <input
              className="flex-1 min-w-0 bg-slate-800 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 font-mono"
              placeholder="0"
              value={m.rangeMin ?? ''}
              onChange={e => onChange({ rangeMin: e.target.value })}
            />
          </div>
          <div className="flex gap-1 items-center">
            <span className="text-xs text-slate-500 shrink-0">{t.imageMappingEditor.toLabel}</span>
            <input
              className="flex-1 min-w-0 bg-slate-800 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 font-mono"
              placeholder="20"
              value={m.rangeMax ?? ''}
              onChange={e => onChange({ rangeMax: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="flex gap-1 items-start">
        <span className="text-xs text-slate-500 shrink-0 pt-1.5 w-10">{t.imageMappingEditor.fileLabel}</span>
        <ImageAssetPicker assetNodes={assetNodes} value={m.src} onChange={src => onChange({ src })} />
      </div>
    </div>
  );
}

// ─── Generator helpers ────────────────────────────────────────────────────────

function generateRangeSlots(min: number, max: number, count: number): ImageBoundMapping[] {
  const step = (max - min) / count;
  return Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    matchType: 'range' as const,
    value: '',
    rangeMin: String(Math.round(min + i * step)),
    rangeMax: i === count - 1
      ? String(max)
      : String(Math.round(min + (i + 1) * step) - 1),
    src: '',
  }));
}

function generateExactSlots(valuesStr: string): ImageBoundMapping[] {
  return valuesStr
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .map(value => ({
      id: crypto.randomUUID(),
      matchType: 'exact' as const,
      value,
      rangeMin: '',
      rangeMax: '',
      src: '',
    }));
}

// ─── Generator panel ──────────────────────────────────────────────────────────

function GeneratorPanel({
  onReplace, onAppend,
}: {
  onReplace: (slots: ImageBoundMapping[]) => void;
  onAppend: (slots: ImageBoundMapping[]) => void;
}) {
  const t = useT();
  const [rangeMin, setRangeMin] = useState('0');
  const [rangeMax, setRangeMax] = useState('100');
  const [count, setCount] = useState('10');
  const [exactValues, setExactValues] = useState('');

  const minN = parseFloat(rangeMin);
  const maxN = parseFloat(rangeMax);
  const countN = parseInt(count, 10);
  const rangeValid = !isNaN(minN) && !isNaN(maxN) && !isNaN(countN)
    && minN < maxN && countN >= 1 && countN <= 100;
  const step = rangeValid ? (maxN - minN) / countN : null;

  const exactSlots = exactValues.split(',').map(v => v.trim()).filter(Boolean);
  const exactValid = exactSlots.length > 0;

  const inputCls = 'bg-slate-800 text-xs text-white rounded px-1.5 py-0.5 outline-none border border-slate-600 focus:border-indigo-500 font-mono';
  const btnPrimary = 'text-xs px-2 py-0.5 rounded bg-indigo-700 hover:bg-indigo-600 text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
  const btnSecondary = 'text-xs px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

  return (
    <div className="flex flex-col gap-2 border border-slate-600/50 rounded p-2 bg-slate-900/40">

      {/* ── Range generator ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-slate-400 font-medium">{t.imageMappingEditor.genByRange}</span>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex gap-1 items-center">
            <span className="text-xs text-slate-500 shrink-0">{t.imageMappingEditor.genMin}</span>
            <input type="number" className={`w-14 ${inputCls}`} value={rangeMin} onChange={e => setRangeMin(e.target.value)} />
          </div>
          <div className="flex gap-1 items-center">
            <span className="text-xs text-slate-500 shrink-0">{t.imageMappingEditor.genMax}</span>
            <input type="number" className={`w-14 ${inputCls}`} value={rangeMax} onChange={e => setRangeMax(e.target.value)} />
          </div>
          <div className="flex gap-1 items-center">
            <span className="text-xs text-slate-500 shrink-0">{t.imageMappingEditor.genCount}</span>
            <input type="number" min={1} max={100} className={`w-12 ${inputCls}`} value={count} onChange={e => setCount(e.target.value)} />
          </div>
        </div>
        {rangeValid && step !== null && (
          <span className="text-xs text-slate-500 italic">
            {t.imageMappingEditor.genStepPreview(step, countN)}
          </span>
        )}
        <div className="flex gap-1">
          <button
            className={btnPrimary}
            disabled={!rangeValid}
            onClick={() => rangeValid && onReplace(generateRangeSlots(minN, maxN, countN))}
          >{t.imageMappingEditor.genReplace}</button>
          <button
            className={btnSecondary}
            disabled={!rangeValid}
            onClick={() => rangeValid && onAppend(generateRangeSlots(minN, maxN, countN))}
          >{t.imageMappingEditor.genAppend}</button>
        </div>
      </div>

      <div className="border-t border-slate-700/60" />

      {/* ── Exact values generator ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-slate-400 font-medium">{t.imageMappingEditor.genByValues}</span>
        <input
          className={`w-full ${inputCls}`}
          placeholder={t.imageMappingEditor.genValuesPlaceholder}
          value={exactValues}
          onChange={e => setExactValues(e.target.value)}
        />
        {exactValid && (
          <span className="text-xs text-slate-500 italic">
            {t.imageMappingEditor.genValuesPreview(exactSlots.length)}
          </span>
        )}
        <div className="flex gap-1">
          <button
            className={btnPrimary}
            disabled={!exactValid}
            onClick={() => onReplace(generateExactSlots(exactValues))}
          >{t.imageMappingEditor.genReplace}</button>
          <button
            className={btnSecondary}
            disabled={!exactValid}
            onClick={() => onAppend(generateExactSlots(exactValues))}
          >{t.imageMappingEditor.genAppend}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ImageMappingEditor({
  mapping,
  onChange,
  defaultSrc,
  onDefaultSrcChange,
  assetNodes,
  hideDefault = false,
}: {
  mapping: ImageBoundMapping[];
  onChange: (mapping: ImageBoundMapping[]) => void;
  defaultSrc: string;
  onDefaultSrcChange: (src: string) => void;
  assetNodes: AssetTreeNode[];
  /** When true, skip rendering the «Default (no match)» picker (parent renders it elsewhere). */
  hideDefault?: boolean;
}) {
  const t = useT();
  const [showGenerator, setShowGenerator] = useState(false);

  const addOne = () => onChange([...mapping, {
    id: crypto.randomUUID(),
    matchType: 'exact',
    value: '',
    rangeMin: '',
    rangeMax: '',
    src: '',
  }]);

  const patch = (i: number, p: Partial<ImageBoundMapping>) =>
    onChange(mapping.map((m, j) => j === i ? { ...m, ...p } : m));

  const remove = (i: number) => onChange(mapping.filter((_, j) => j !== i));

  const emptyCount = mapping.filter(m => !m.src).length;

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">{t.imageMappingEditor.mappingsLabel}</span>
          {emptyCount > 0 && (
            <span className="text-xs text-red-400/70">({t.imageMappingEditor.emptySlots(emptyCount)})</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className={`text-xs cursor-pointer px-1.5 py-0.5 rounded transition-colors ${
              showGenerator
                ? 'bg-indigo-700 text-white'
                : 'text-slate-400 hover:text-indigo-300 border border-slate-600 hover:border-indigo-500'
            }`}
            onClick={() => setShowGenerator(v => !v)}
          >
            {t.imageMappingEditor.generateBtn}
          </button>
          <button
            className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
            onClick={addOne}
          >
            {t.imageMappingEditor.addOne}
          </button>
        </div>
      </div>

      {/* Generator panel */}
      {showGenerator && (
        <GeneratorPanel
          onReplace={slots => { onChange(slots); setShowGenerator(false); }}
          onAppend={slots => onChange([...mapping, ...slots])}
        />
      )}

      {/* Mapping list */}
      {mapping.length === 0 && !showGenerator && (
        <p className="text-xs text-slate-600 italic">{t.imageMappingEditor.noMappings}</p>
      )}
      {mapping.map((m, i) => (
        <MappingEntry
          key={m.id ?? i}
          m={m}
          assetNodes={assetNodes}
          onChange={p => patch(i, p)}
          onDelete={() => remove(i)}
        />
      ))}

      {/* Default / fallback */}
      {!hideDefault && (
        <div className="flex flex-col gap-1 mt-0.5">
          <span className="text-xs text-slate-400">{t.imageMappingEditor.defaultLabel}</span>
          <ImageAssetPicker assetNodes={assetNodes} value={defaultSrc} onChange={onDefaultSrcChange} />
        </div>
      )}
    </div>
  );
}

// Keep Asset re-exported for any callers that import it from here
export type { Asset };
