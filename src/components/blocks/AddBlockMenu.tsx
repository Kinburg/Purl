import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore, DEFAULT_PANEL_STYLE } from '../../store/projectStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { usePluginStore } from '../../store/pluginStore';
import { useT } from '../../i18n';
import { BLOCK_SVG_ICONS } from './BlockIcons';
import type { Block, BlockType, PluginBlock, PluginBlockDef } from '../../types';
import { EmojiIcon } from '../shared/EmojiIcons';

/** Render a plugin's user-supplied icon emoji, falling back to the puzzle SVG. */
function PluginGlyph({ icon, size }: { icon?: string; size: number }) {
  if (icon) return <span style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>;
  return <EmojiIcon name="puzzle" size={size} />;
}

// ── Block factory ─────────────────────────────────────────────────────────────

export function makeBlock(type: BlockType): Block {
  const id = crypto.randomUUID();
  switch (type) {
    case 'text':         return { id, type, content: '' };
    case 'dialogue':     return { id, type, characterId: '', text: '', align: 'left' as const };
    case 'choice':       return { id, type, options: [] };
    case 'condition':    return { id, type, branches: [] };
    case 'variable-set': return { id, type, variableId: '', operator: '=', value: '' };
    case 'set-object':   return { id, type, variableId: '', entries: [] };
    case 'for':          return { id, type, mode: 'range' as const, valueVar: '_item', source: '', blocks: [] };
    case 'image':        return { id, type, src: '', alt: '', width: 0 };
    case 'image-gen':    return {
      id, type,
      provider: 'comfyui',
      providerUrl: '',
      workflowFile: '',
      promptMode: 'manual' as const,
      prompt: '',
      negativePrompt: '',
      seedMode: 'random' as const,
      seed: 0,
      width: 0,
      alt: '',
      src: '',
      history: [],
    };
    case 'video':        return { id, type, src: '', autoplay: false, loop: false, controls: true, width: 0 };
    case 'input-field':  return { id, type, label: '', variableId: '', placeholder: '' };
    case 'button':       return {
      id, type, label: '',
      style: { bgColor: '#3b82f6', textColor: '#ffffff', borderColor: '#2563eb', borderRadius: 4, paddingV: 6, paddingH: 14, fontSize: 10, bold: false, fullWidth: false },
      actions: [],
    };
    case 'link':         return {
      id, type, label: '', target: 'scene' as const,
      style: { bgColor: '#059669', textColor: '#ffffff', borderColor: '#047857', borderRadius: 4, paddingV: 6, paddingH: 14, fontSize: 10, bold: false, fullWidth: false },
      actions: [],
    };
    case 'raw':          return { id, type, code: '' };
    case 'note':         return { id, type, text: '' };
    case 'table':        return { id, type, rows: [], style: { ...DEFAULT_PANEL_STYLE } };
    case 'include':      return { id, type, passageName: '' };
    case 'divider':      return { id, type };
    case 'checkbox':     return { id, type, mode: 'flags' as const, options: [] };
    case 'radio':        return { id, type, variableId: '', options: [] };
    case 'function':     return {
      id, type, label: '', targetSceneId: '',
      style: { bgColor: '#7c3aed', textColor: '#ffffff', borderColor: '#6d28d9', borderRadius: 4, paddingV: 6, paddingH: 14, fontSize: 10, bold: false, fullWidth: false },
      actions: [],
    };
    case 'popup':        return { id, type, targetSceneId: '' };
    case 'audio':        return { id, type, src: '', trigger: 'immediate' as const, loop: false, onLeave: 'stop' as const, stopOthers: false, volume: 100 };
    case 'container':    return { id, type, containerId: '', charId: '' };
    case 'time-manipulation': return { id, type, variableId: '', years: 0, months: 0, days: 0, hours: 0, minutes: 0 };
    case 'paperdoll':    return { id, type, charId: '', showLabels: false };
    case 'inventory':    return { id, type, charId: '' };
    case 'plugin':       return { id, type, pluginId: '', values: {} };
  }
}

export function makePluginBlock(def: PluginBlockDef): PluginBlock {
  const values: Record<string, string> = {};
  for (const p of def.params) values[p.key] = p.default ?? '';
  return { id: crypto.randomUUID(), type: 'plugin', pluginId: def.id, values };
}

// ── Categories ────────────────────────────────────────────────────────────────

type CategoryKey = 'narrative' | 'media' | 'game' | 'interaction' | 'logic' | 'system';

const BLOCK_CATEGORIES: { key: CategoryKey; types: BlockType[] }[] = [
  { key: 'narrative',   types: ['text', 'dialogue', 'divider'] },
  { key: 'media',       types: ['image', 'image-gen', 'video', 'audio'] },
  { key: 'game',        types: ['paperdoll', 'inventory', 'container', 'table'] },
  { key: 'interaction', types: ['choice', 'button', 'link', 'input-field', 'checkbox', 'radio', 'popup'] },
  { key: 'logic',       types: ['condition', 'for', 'variable-set', 'set-object', 'time-manipulation', 'function'] },
  { key: 'system',      types: ['raw', 'include', 'note'] },
];

const CAT_COLORS: Record<string, { color: string; bg: string; ring: string }> = {
  narrative:   { color: '#818cf8', bg: 'rgba(99,102,241,0.14)',  ring: 'rgba(99,102,241,0.5)'  },
  media:       { color: '#2dd4bf', bg: 'rgba(45,212,191,0.14)',  ring: 'rgba(45,212,191,0.5)'  },
  game:        { color: '#fb923c', bg: 'rgba(251,146,60,0.14)',  ring: 'rgba(251,146,60,0.5)'  },
  interaction: { color: '#34d399', bg: 'rgba(16,185,129,0.14)',  ring: 'rgba(16,185,129,0.5)'  },
  logic:       { color: '#a78bfa', bg: 'rgba(167,139,250,0.14)', ring: 'rgba(167,139,250,0.5)' },
  system:      { color: '#94a3b8', bg: 'rgba(100,116,139,0.14)', ring: 'rgba(100,116,139,0.5)' },
  plugins:     { color: '#c084fc', bg: 'rgba(168,85,247,0.14)',  ring: 'rgba(168,85,247,0.5)'  },
};

// ── Entry types ───────────────────────────────────────────────────────────────

interface BlockEntry {
  kind: 'block';
  type: BlockType;
  label: string;
  desc: string;
  category: string;
}
interface PluginEntry {
  kind: 'plugin';
  def: PluginBlockDef;
}
type Entry = BlockEntry | PluginEntry;

function entryId(e: Entry) {
  return e.kind === 'block' ? e.type : `plugin:${e.def.id}`;
}

// ── Selection ─────────────────────────────────────────────────────────────────

type SelectionItem = Entry;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildBlockEntries(t: ReturnType<typeof useT>): BlockEntry[] {
  const make = (type: BlockType, label: string, desc: string, category: string): BlockEntry =>
    ({ kind: 'block', type, label, desc, category });
  return [
    make('text',              t.addBlock.text.label,             t.addBlock.text.desc,             'narrative'),
    make('dialogue',          t.addBlock.dialogue.label,         t.addBlock.dialogue.desc,         'narrative'),
    make('divider',           t.addBlock.divider.label,          t.addBlock.divider.desc,          'narrative'),
    make('image',             t.addBlock.image.label,            t.addBlock.image.desc,            'media'),
    make('image-gen',         t.addBlock.imageGen.label,         t.addBlock.imageGen.desc,         'media'),
    make('video',             t.addBlock.video.label,            t.addBlock.video.desc,            'media'),
    make('audio',             t.addBlock.audio.label,            t.addBlock.audio.desc,            'media'),
    make('paperdoll',         t.addBlock.paperdoll.label,        t.addBlock.paperdoll.desc,        'game'),
    make('inventory',         t.addBlock.inventory.label,        t.addBlock.inventory.desc,        'game'),
    make('container',         t.addBlock.container.label,        t.addBlock.container.desc,        'game'),
    make('table',             t.addBlock.table.label,            t.addBlock.table.desc,            'game'),
    make('choice',            t.addBlock.choice.label,           t.addBlock.choice.desc,           'interaction'),
    make('button',            t.addBlock.button.label,           t.addBlock.button.desc,           'interaction'),
    make('link',              t.addBlock.link.label,             t.addBlock.link.desc,             'interaction'),
    make('input-field',       t.addBlock.inputField.label,       t.addBlock.inputField.desc,       'interaction'),
    make('checkbox',          t.addBlock.checkbox.label,         t.addBlock.checkbox.desc,         'interaction'),
    make('radio',             t.addBlock.radio.label,            t.addBlock.radio.desc,            'interaction'),
    make('popup',             t.addBlock.popup.label,            t.addBlock.popup.desc,            'interaction'),
    make('condition',         t.addBlock.condition.label,        t.addBlock.condition.desc,        'logic'),
    make('variable-set',      t.addBlock.variableSet.label,      t.addBlock.variableSet.desc,      'logic'),
    make('time-manipulation', t.addBlock.timeManipulation.label, t.addBlock.timeManipulation.desc, 'logic'),
    make('function',          t.addBlock.function.label,         t.addBlock.function.desc,         'logic'),
    make('raw',               t.addBlock.raw.label,              t.addBlock.raw.desc,              'system'),
    make('include',           t.addBlock.include.label,          t.addBlock.include.desc,          'system'),
    make('note',              t.addBlock.note.label,             t.addBlock.note.desc,             'system'),
  ];
}

// ── Block tile ────────────────────────────────────────────────────────────────

function BlockTile({
  entry, catColor, selOrder, highlighted,
  onToggle, onHighlight,
}: {
  entry: BlockEntry;
  catColor: { color: string; bg: string; ring: string };
  selOrder: number | null;
  highlighted: boolean;
  onToggle: () => void;
  onHighlight: () => void;
}) {
  const isSelected = selOrder !== null;

  return (
    <button
      className="relative flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg text-center cursor-pointer transition-all select-none"
      style={{
        background: highlighted ? catColor.bg : isSelected ? `${catColor.bg}` : 'rgba(255,255,255,0.03)',
        outline: highlighted ? `2px solid ${catColor.ring}` : isSelected ? `1.5px solid ${catColor.color}` : '1.5px solid transparent',
      }}
      onMouseEnter={onHighlight}
      onClick={onToggle}
    >
      {/* Selection badge */}
      {isSelected && (
        <span
          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
          style={{ background: catColor.color }}
        >
          {selOrder}
        </span>
      )}

      {/* Icon */}
      <span className="w-8 h-8 flex items-center justify-center" style={{ color: catColor.color }}>
        {BLOCK_SVG_ICONS[entry.type]({ className: 'w-full h-full' })}
      </span>

      {/* Label */}
      <span className="text-[11px] text-slate-200 leading-tight font-medium line-clamp-2">{entry.label}</span>
    </button>
  );
}

// ── Plugin tile ───────────────────────────────────────────────────────────────

function PluginTile({
  entry, selOrder, highlighted,
  onToggle, onHighlight,
}: {
  entry: PluginEntry;
  selOrder: number | null;
  highlighted: boolean;
  onToggle: () => void;
  onHighlight: () => void;
}) {
  const { def } = entry;
  const c = CAT_COLORS.plugins;
  const color = def.color || c.color;
  const isSelected = selOrder !== null;

  return (
    <button
      className="relative flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg text-center cursor-pointer transition-all select-none"
      style={{
        background: highlighted ? `${color}22` : isSelected ? `${color}18` : 'rgba(255,255,255,0.03)',
        outline: highlighted ? `2px solid ${color}80` : isSelected ? `1.5px solid ${color}` : '1.5px solid transparent',
      }}
      onMouseEnter={onHighlight}
      onClick={onToggle}
    >
      {isSelected && (
        <span
          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
          style={{ background: color }}
        >
          {selOrder}
        </span>
      )}
      <span className="leading-none"><PluginGlyph icon={def.icon} size={24} /></span>
      <span className="text-[11px] text-slate-200 leading-tight font-medium line-clamp-2">{def.name}</span>
    </button>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  highlighted, selection, catColor,
}: {
  highlighted: Entry | null;
  selection: SelectionItem[];
  catColor: (e: Entry) => { color: string; bg: string; ring: string };
}) {
  if (!highlighted) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs text-center px-4">
        <span className="text-3xl mb-2 opacity-30">↖</span>
        Hover over a block to see details
      </div>
    );
  }

  const isBlock = highlighted.kind === 'block';
  const c = catColor(highlighted);
  const label = isBlock ? highlighted.label : highlighted.def.name;
  const desc = isBlock ? highlighted.desc : (highlighted.def.description || '');

  return (
    <div className="flex flex-col h-full">
      {/* Block preview */}
      <div className="p-4 flex flex-col items-center gap-3 border-b border-slate-700">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center"
          style={{ background: isBlock ? c.bg : `${(highlighted as PluginEntry).def.color || c.color}22` }}
        >
          {isBlock
            ? <span className="w-9 h-9" style={{ color: c.color, display: 'flex' }}>
                {BLOCK_SVG_ICONS[(highlighted as BlockEntry).type]({ className: 'w-full h-full' })}
              </span>
            : <span className="leading-none"><PluginGlyph icon={(highlighted as PluginEntry).def.icon} size={30} /></span>
          }
        </div>
        <div className="text-center">
          <div className="text-sm font-semibold text-white mb-1">{label}</div>
          <div className="text-[11px] text-slate-400 leading-relaxed">{desc}</div>
        </div>
      </div>

      {/* Selection queue */}
      {selection.length > 0 && (
        <div className="p-3 flex-1 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Queue ({selection.length})</div>
          <ol className="flex flex-col gap-1">
            {selection.map((item, i) => {
              const c2 = catColor(item);
              const lbl = item.kind === 'block' ? item.label : item.def.name;
              return (
                <li key={entryId(item)} className="flex items-center gap-2 text-[11px] text-slate-300">
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ background: item.kind === 'block' ? c2.color : (item.def.color || c2.color) }}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate">{lbl}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  sceneId: string;
  onAdd?: (block: Block) => void;
  excludeTypes?: BlockType[];
  initialOpen?: boolean;
  onClose?: () => void;
}

export function AddBlockMenu({ sceneId, onAdd, excludeTypes = [], initialOpen, onClose }: Props) {
  const { addBlock } = useProjectStore();
  const { recentBlockTypes, trackRecentBlock } = useEditorPrefsStore();
  const plugins = usePluginStore((s) => s.plugins);
  const t = useT();

  const [open, setOpen] = useState(initialOpen ?? false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('content');
  const [highlighted, setHighlighted] = useState<Entry | null>(null);
  const [selection, setSelection] = useState<SelectionItem[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setSearch('');
    setSelection([]);
    setHighlighted(null);
    setActiveCategory('content');
    onClose?.();
  };

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const excluded = new Set(excludeTypes);
  const allBlockEntries = buildBlockEntries(t).filter((e) => !excluded.has(e.type));

  // ── Categories with counts ─────────────────────────────────────────────────
  const cats = [
    ...BLOCK_CATEGORIES.map((c) => ({
      key: c.key,
      label: t.addBlock.categories[c.key as keyof typeof t.addBlock.categories],
      count: c.types.filter((type) => !excluded.has(type)).length,
      color: CAT_COLORS[c.key],
    })),
    ...(plugins.length > 0
      ? [{ key: 'plugins', label: t.addBlock.categories.plugins, count: plugins.length, color: CAT_COLORS.plugins }]
      : []),
  ];

  // ── Recent (top-level, not a category) ────────────────────────────────────
  const recentEntries: BlockEntry[] = recentBlockTypes
    .filter((type) => !excluded.has(type))
    .map((type) => allBlockEntries.find((e) => e.type === type))
    .filter(Boolean) as BlockEntry[];

  // ── Entries for current category / search ─────────────────────────────────
  const q = search.trim().toLowerCase();

  const visibleEntries: Entry[] = q
    ? [
        ...allBlockEntries.filter(
          (e) => e.label.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q),
        ),
        ...(activeCategory === 'plugins' || !activeCategory
          ? plugins
              .filter((d) => d.name.toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q))
              .map((def): PluginEntry => ({ kind: 'plugin', def }))
          : []),
      ]
    : activeCategory === 'plugins'
    ? plugins.map((def): PluginEntry => ({ kind: 'plugin', def }))
    : activeCategory === 'recent'
    ? recentEntries
    : allBlockEntries.filter((e) => e.category === activeCategory);

  // ── Selection helpers ──────────────────────────────────────────────────────
  const selectionIds = new Set(selection.map(entryId));

  const toggleEntry = (entry: Entry) => {
    const id = entryId(entry);
    setHighlighted(entry);
    setSelection((prev) =>
      selectionIds.has(id) ? prev.filter((s) => entryId(s) !== id) : [...prev, entry],
    );
  };

  // ── Commit ────────────────────────────────────────────────────────────────
  const commit = () => {
    const toAdd = selection.length > 0 ? selection : highlighted ? [highlighted] : [];
    // When onAdd inserts at a fixed index each time, later calls push earlier ones down.
    // Reversing ensures the first selected block ends up at the top of the inserted group.
    const ordered = onAdd ? [...toAdd].reverse() : toAdd;
    for (const item of ordered) {
      if (item.kind === 'block') {
        const block = makeBlock(item.type);
        trackRecentBlock(item.type);
        if (onAdd) onAdd(block); else addBlock(sceneId, block);
      } else {
        const block = makePluginBlock(item.def);
        if (onAdd) onAdd(block); else addBlock(sceneId, block);
      }
    }
    close();
  };

  const canAdd = selection.length > 0 || highlighted !== null;
  const addLabel = selection.length > 1 ? `Add ${selection.length} blocks` : 'Add block';

  const getCatColor = (e: Entry) => {
    if (e.kind === 'plugin') return CAT_COLORS.plugins;
    return CAT_COLORS[e.category] ?? CAT_COLORS.system;
  };

  // ── Trigger button (closed state) ─────────────────────────────────────────
  if (!open) {
    return (
      <div className="mt-1">
        <button
          className="w-full py-1.5 border border-dashed border-slate-700 hover:border-indigo-500 text-slate-500 hover:text-indigo-400 rounded text-xs transition-colors cursor-pointer"
          onClick={() => setOpen(true)}
        >
          {t.addBlock.trigger}
        </button>
      </div>
    );
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

      {/* Panel */}
      <div
        className="relative z-10 flex flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden"
        style={{ width: 740, height: 500 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-700/60 flex-shrink-0">
          <input
            ref={searchRef}
            type="text"
            className="w-full px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
            placeholder={t.addBlock.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* 3-column body */}
        <div className="flex flex-1 min-h-0">
          {/* Left: categories */}
          <div className="w-36 flex-shrink-0 border-r border-slate-700/60 flex flex-col py-2 overflow-y-auto">
            {/* Recent */}
            {recentEntries.length > 0 && !q && (
              <button
                className="flex items-center justify-between px-3 py-1.5 text-xs transition-colors cursor-pointer rounded-sm mx-1"
                style={
                  activeCategory === 'recent'
                    ? { background: 'rgba(255,255,255,0.08)', color: '#e2e8f0' }
                    : { color: '#64748b' }
                }
                onClick={() => setActiveCategory('recent')}
              >
                <span className="font-medium">{t.addBlock.recent}</span>
                <span className="text-[10px]">{recentEntries.length}</span>
              </button>
            )}

            {/* Divider */}
            {recentEntries.length > 0 && !q && <div className="mx-3 my-1 border-t border-slate-700/60" />}

            {cats.map((cat) => (
              <button
                key={cat.key}
                className="flex items-center gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer rounded-sm mx-1"
                style={
                  activeCategory === cat.key && !q
                    ? { background: `${cat.color.color}18`, color: cat.color.color }
                    : { color: '#64748b' }
                }
                onClick={() => { setActiveCategory(cat.key); setSearch(''); }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: cat.color.color }}
                />
                <span className="font-medium truncate">{cat.label}</span>
                <span className="text-[10px] ml-auto flex-shrink-0">{cat.count}</span>
              </button>
            ))}
          </div>

          {/* Center: block grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {visibleEntries.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-600 text-xs">
                No blocks found
              </div>
            ) : (
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {visibleEntries.map((entry) => {
                  const id = entryId(entry);
                  const order = selection.findIndex((s) => entryId(s) === id);
                  const c = getCatColor(entry);
                  return entry.kind === 'block' ? (
                    <BlockTile
                      key={id}
                      entry={entry}
                      catColor={c}
                      selOrder={order >= 0 ? order + 1 : null}
                      highlighted={highlighted ? entryId(highlighted) === id : false}
                      onToggle={() => toggleEntry(entry)}
                      onHighlight={() => setHighlighted(entry)}
                    />
                  ) : (
                    <PluginTile
                      key={id}
                      entry={entry}
                      selOrder={order >= 0 ? order + 1 : null}
                      highlighted={highlighted ? entryId(highlighted) === id : false}
                      onToggle={() => toggleEntry(entry)}
                      onHighlight={() => setHighlighted(entry)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: details */}
          <div className="w-48 flex-shrink-0 border-l border-slate-700/60 overflow-y-auto">
            <DetailPanel
              highlighted={highlighted}
              selection={selection}
              catColor={getCatColor}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/60 flex-shrink-0 bg-slate-900">
          <button
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            onClick={close}
          >
            {t.addBlock.cancel}
          </button>
          <button
            disabled={!canAdd}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-default"
            style={canAdd ? { background: '#6366f1', color: '#fff' } : { background: '#334155', color: '#94a3b8' }}
            onClick={commit}
          >
            {addLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Keep the trigger area visible */}
      <div className="mt-1">
        <button
          className="w-full py-1.5 border border-dashed border-indigo-500 text-indigo-400 rounded text-xs cursor-pointer"
          onClick={close}
        >
          {t.addBlock.trigger}
        </button>
      </div>
      {createPortal(modal, document.body)}
    </>
  );
}
