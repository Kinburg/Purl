import { useState, useRef } from 'react';
import { useProjectStore, DEFAULT_PANEL_STYLE, redistributeWidths } from '../../store/projectStore';
import { useFlatVariablesOf } from '../../hooks/useFlatVariables';
import { useT } from '../../i18n';
import type {
  TableBlock, SidebarRow, SidebarCell, CellContent, PanelStyle,
  CellText, CellVariable, CellProgress, CellImageStatic, CellImageBound, CellRaw,
  CellButton, CellList, CellAudioVolume, CellImageGen, CellImageFromVar, CellDateTime,
  ButtonAction, ButtonStyle, VarOperator,
  Variable, AssetTreeNode,
} from '../../types';
import { EmojiIcon } from '../shared/EmojiIcons';
import { ImageMappingEditor, ImageAssetPicker } from '../shared/ImageMappingEditor';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { VariablePicker } from '../shared/VariablePicker';
import { CellImageGenEditor } from '../shared/CellImageGenEditor';
import NumericInput from '../shared/NumericInput';
import { CellImageBoundGenModal } from '../shared/CellImageBoundGenModal';
import { DateTimeCellEditor } from '../shared/DateTimeCellEditor';
import { InventoryPopupShortcut } from './InventoryPopupShortcut';
import { useVariableNodes, usePluginParams } from '../shared/VariableScope';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDefaultContent(type: CellContent['type']): CellContent {
  switch (type) {
    case 'text':           return { type: 'text', value: '' } as CellText;
    case 'variable':       return { type: 'variable', variableId: '', prefix: '', suffix: '' } as CellVariable;
    case 'progress':       return { type: 'progress', variableId: '', maxValue: 100, color: '#4ade80', emptyColor: '#333333', textColor: '', colorRange: null, showText: false } as CellProgress;
    case 'image-static':   return { type: 'image-static', src: '', objectFit: 'cover' } as CellImageStatic;
    case 'image-bound':    return { type: 'image-bound', variableId: '', mapping: [], defaultSrc: '', objectFit: 'cover' } as CellImageBound;
    case 'image-gen':      return { type: 'image-gen', promptMode: 'manual', prompt: '', seedMode: 'random', workflowFile: '', alt: '', src: '', width: 0 } as CellImageGen;
    case 'image-from-var': return { type: 'image-from-var', variableId: '', objectFit: 'cover' } as CellImageFromVar;
    case 'raw':            return { type: 'raw', code: '' } as CellRaw;
    case 'include':        return { type: 'include', passageName: '' };
    case 'button':         return { type: 'button', label: '', style: { bgColor: '#3b82f6', textColor: '#ffffff', borderColor: '#2563eb', borderRadius: 4, paddingV: 4, paddingH: 10, fontSize: 9, bold: false, fullWidth: false }, actions: [] };
    case 'list':           return { type: 'list', variableId: '', separator: ', ', emptyText: '', prefix: '', suffix: '' };
    case 'audio-volume':   return { type: 'audio-volume', showMuteButton: true } as CellAudioVolume;
    case 'date-time':      return { type: 'date-time', variableId: '', format: 'DD.MM.YYYY HH:mm', prefix: '', suffix: '' } as CellDateTime;
    case 'paperdoll':      return { type: 'paperdoll', charId: '', showLabels: false };
  }
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function TableBlockEditor({
  block, sceneId, onUpdate,
}: {
  block: TableBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<TableBlock>) => void;
}) {
  const t = useT();
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const project      = useProjectStore(s => s.project);
  const variableNodes = useVariableNodes();
  const vars = useFlatVariablesOf(variableNodes);
  const assetNodes = project.assetNodes;

  const update = onUpdate ?? ((p: Partial<TableBlock>) => updateBlock(sceneId, block.id, p as never));
  const updateRows = (rows: SidebarRow[]) => update({ rows });
  const updateStyle = (patch: Partial<PanelStyle>) => update({ style: { ...block.style, ...patch } });

  const addRow = () => {
    saveSnapshot();
    const newRow: SidebarRow = {
      id: crypto.randomUUID(),
      height: 60,
      cells: [{ id: crypto.randomUUID(), width: 100, content: { type: 'text', value: '' } as CellText }],
    };
    updateRows([...block.rows, newRow]);
  };

  const deleteRow = (rowId: string) => {
    saveSnapshot();
    updateRows(block.rows.filter(r => r.id !== rowId));
  };

  const updateRowHeight = (rowId: string, height: number) =>
    updateRows(block.rows.map(r => r.id === rowId ? { ...r, height } : r));

  const addCell = (rowId: string) => {
    saveSnapshot();
    updateRows(block.rows.map(r => {
      if (r.id !== rowId) return r;
      const newCell: SidebarCell = {
        id: crypto.randomUUID(), width: 50,
        content: { type: 'text', value: '' } as CellText,
      };
      return { ...r, cells: redistributeWidths([...r.cells, newCell]) };
    }));
  };

  const deleteCell = (rowId: string, cellId: string) => {
    saveSnapshot();
    updateRows(block.rows.map(r => {
      if (r.id !== rowId) return r;
      return { ...r, cells: redistributeWidths(r.cells.filter(c => c.id !== cellId)) };
    }));
  };

  // Called by DragDivider: direct left/right width assignment
  const patchCellWidths = (rowId: string, cellId: string, w: number, buddyId: string, buddyW: number) =>
    updateRows(block.rows.map(r => {
      if (r.id !== rowId) return r;
      return {
        ...r, cells: r.cells.map(c =>
          c.id === cellId ? { ...c, width: w }
          : c.id === buddyId ? { ...c, width: buddyW }
          : c
        ),
      };
    }));

  // Called by width % input: auto-balance buddy cell
  const setCellWidth = (rowId: string, cellId: string, newW: number) =>
    updateRows(block.rows.map(r => {
      if (r.id !== rowId) return r;
      const idx = r.cells.findIndex(c => c.id === cellId);
      if (idx < 0) return r;
      const diff = newW - r.cells[idx].width;
      const buddyIdx = idx === r.cells.length - 1 ? r.cells.length - 2 : r.cells.length - 1;
      return {
        ...r, cells: r.cells.map((c, i) => {
          if (i === idx) return { ...c, width: newW };
          if (i === buddyIdx && buddyIdx >= 0 && diff !== 0) return { ...c, width: Math.max(1, c.width - diff) };
          return c;
        }),
      };
    }));

  const equalizeRow = (rowId: string) =>
    updateRows(block.rows.map(r =>
      r.id !== rowId ? r : { ...r, cells: redistributeWidths(r.cells) }
    ));

  const updateCellContent = (rowId: string, cellId: string, content: CellContent) =>
    updateRows(block.rows.map(r => {
      if (r.id !== rowId) return r;
      return { ...r, cells: r.cells.map(c => c.id === cellId ? { ...c, content } : c) };
    }));

  const style = block.style ?? DEFAULT_PANEL_STYLE;

  return (
    <div className="flex flex-col gap-3">
      <TStyleEditor style={style} onChange={updateStyle} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.rowsEditor.sectionTitle}</span>
        </div>

        {block.rows.length === 0 && (
          <p className="text-xs text-slate-600 italic">{t.rowsEditor.noRows}</p>
        )}

        {block.rows.map((row, rowIdx) => (
          <div key={row.id} className="border border-slate-700 rounded overflow-hidden">
            {/* Row header */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 border-b border-slate-700 flex-wrap">
              <span className="text-xs text-slate-500">{t.rowsEditor.rowLabel(rowIdx + 1)}</span>
              <label className="flex items-center gap-1 ml-auto">
                <span className="text-xs text-slate-500">{t.rowsEditor.heightLabel}</span>
                <TNumInput value={row.height} min={16} max={400}
                  onChange={h => updateRowHeight(row.id, h)} suffix="px" className="w-16" />
              </label>
              <button className="text-slate-600 hover:text-red-400 text-xs cursor-pointer"
                onClick={() => { if (confirm(t.rowsEditor.confirmDeleteRow)) deleteRow(row.id); }}><EmojiIcon name="close" size={20} /></button>
            </div>

            {/* Cells preview + controls */}
            <div className="p-2 flex flex-col gap-1.5">
              {/* Preview row with drag handles */}
              <div className="flex" style={{ height: Math.max(40, row.height) }}>
                {row.cells.flatMap((cell, idx) => [
                  idx > 0 ? (
                    <TDragDivider
                      key={`div-${row.cells[idx - 1].id}`}
                      leftCell={row.cells[idx - 1]}
                      rightCell={cell}
                      onDrag={(lw, rw) => patchCellWidths(row.id, row.cells[idx - 1].id, lw, cell.id, rw)}
                    />
                  ) : null,
                  <TCellEditor
                    key={cell.id}
                    cell={cell}
                    vars={vars}
                    assetNodes={assetNodes}
                    sceneId={sceneId}
                    onUpdateContent={content => updateCellContent(row.id, cell.id, content)}
                    onDelete={() => deleteCell(row.id, cell.id)}
                  />,
                ]).filter(Boolean)}
                {row.cells.length === 0 && (
                  <span className="text-xs text-slate-600 italic self-center px-2">{t.rowsEditor.noCells}</span>
                )}
              </div>

              {/* Width bar */}
              {row.cells.length > 0 && (
                <TCellWidthBar
                  cells={row.cells}
                  onWidthChange={(cellId, w) => setCellWidth(row.id, cellId, w)}
                  onEqualize={() => equalizeRow(row.id)}
                />
              )}

              <button
                className="text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded px-2 py-1 transition-colors cursor-pointer self-start"
                onClick={() => addCell(row.id)}
              >
                {t.rowsEditor.addCell}
              </button>
            </div>
          </div>
        ))}
        <button
            className="text-xs text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1 transition-colors cursor-pointer"
            onClick={addRow}
        >
          {t.rowsEditor.addRow}
        </button>
      </div>
      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => update({ delay: v })}
      />
    </div>
  );
}

// ─── Style editor ─────────────────────────────────────────────────────────────

function TStyleEditor({
  style, onChange,
}: {
  style: PanelStyle;
  onChange: (patch: Partial<PanelStyle>) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-700 rounded overflow-hidden">
      <button
        className="flex items-center gap-2 w-full px-3 py-2 bg-slate-800/60 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
        onClick={() => setOpen(v => !v)}
      >
        <span className="text-slate-500">{open ? '▼' : '▶'}</span>
        {t.tableStyle.title}
      </button>
      {open && (
        <div className="px-3 py-3 flex flex-col gap-3 bg-slate-900/40">
          <div className="flex items-center gap-4 flex-wrap">
            <TSField label={t.tableStyle.rowGap}>
              <TNumInput value={style.rowGap} min={0} max={40}
                onChange={v => onChange({ rowGap: v })} suffix="px" />
            </TSField>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-slate-500 font-medium">{t.tableStyle.borders}</span>
            <div className="flex flex-wrap gap-3">
              <TCheckField label={t.tableStyle.outerBorder}   checked={style.showOuterBorder} onChange={v => onChange({ showOuterBorder: v })} />
              <TCheckField label={t.tableStyle.betweenRows}   checked={style.showRowBorders}  onChange={v => onChange({ showRowBorders: v })} />
              <TCheckField label={t.tableStyle.betweenCells}  checked={style.showCellBorders} onChange={v => onChange({ showCellBorders: v })} />
            </div>
          </div>
          {(style.showOuterBorder || style.showRowBorders || style.showCellBorders) && (
            <div className="flex items-center gap-4 flex-wrap">
              <TSField label={t.tableStyle.thickness}>
                <TNumInput value={style.borderWidth} min={1} max={8}
                  onChange={v => onChange({ borderWidth: v })} suffix="px" />
              </TSField>
              <TSField label={t.tableStyle.borderColor}>
                <div className="flex items-center gap-1.5">
                  <input type="color"
                    className="w-8 h-7 rounded cursor-pointer bg-transparent border border-slate-600"
                    value={style.borderColor}
                    onChange={e => onChange({ borderColor: e.target.value })} />
                  <input
                    className="w-24 bg-slate-800 text-xs text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 font-mono"
                    value={style.borderColor}
                    onChange={e => onChange({ borderColor: e.target.value })} />
                </div>
              </TSField>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Drag divider ─────────────────────────────────────────────────────────────

function TDragDivider({
  leftCell, rightCell, onDrag,
}: {
  leftCell: SidebarCell;
  rightCell: SidebarCell;
  onDrag: (leftW: number, rightW: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startLeftW = leftCell.width;
    const combined = startLeftW + rightCell.width;
    const containerEl = ref.current?.parentElement;
    if (!containerEl) return;
    const containerW = containerEl.clientWidth;

    const onMove = (me: MouseEvent) => {
      const dPct = ((me.clientX - startX) / containerW) * 100;
      const newLeft = Math.max(5, Math.min(combined - 5, Math.round(startLeftW + dPct)));
      onDrag(newLeft, combined - newLeft);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      style={{
        width: 4, flexShrink: 0, cursor: 'col-resize',
        background: 'rgba(99,102,241,0.15)', borderRadius: 2,
        alignSelf: 'stretch', transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.45)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
    />
  );
}

// ─── Cell width bar ───────────────────────────────────────────────────────────

function TCellWidthBar({
  cells, onWidthChange, onEqualize,
}: {
  cells: SidebarCell[];
  onWidthChange: (cellId: string, w: number) => void;
  onEqualize: () => void;
}) {
  const t = useT();
  const total = cells.reduce((s, c) => s + c.width, 0);
  const offBy = total - 100;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        {cells.map(cell => (
          <div key={cell.id} style={{ flex: cell.width, minWidth: 0 }} className="flex items-center gap-0.5 min-w-0">
            <NumericInput
              min={1} max={99}
              className="w-full text-xs bg-slate-800 text-white rounded px-1.5 py-0.5 outline-none border border-slate-700 focus:border-indigo-500 font-mono text-center"
              value={cell.width}
              onChange={v => onWidthChange(cell.id, v)}
            />
            <span className="text-xs text-slate-600 shrink-0">%</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className={`text-xs font-mono ${offBy === 0 ? 'text-slate-600' : 'text-amber-400'}`}>
          Σ {total}%{offBy !== 0 && ` (${offBy > 0 ? '+' : ''}${offBy})`}
        </span>
        <button
          className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer hover:bg-slate-800 rounded px-1.5 py-0.5 transition-colors"
          title={t.rowsEditor.equalWidthTitle}
          onClick={onEqualize}
        >{t.rowsEditor.equalWidth}</button>
      </div>
    </div>
  );
}

// ─── Cell editor ──────────────────────────────────────────────────────────────

function TCellEditor({
  cell, vars, assetNodes, sceneId, onUpdateContent, onDelete,
}: {
  cell: SidebarCell;
  vars: Variable[];
  assetNodes: AssetTreeNode[];
  sceneId: string;
  onUpdateContent: (c: CellContent) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  return (
    <div
      className="relative flex flex-col border border-slate-600 rounded bg-slate-800/40 overflow-hidden cursor-pointer group/cell"
      style={{ flex: cell.width, minWidth: 0, overflow: 'hidden' }}
      onClick={() => setEditing(true)}
    >
      <TCellPreview cell={cell} vars={vars} />
      <div className="absolute inset-0 bg-slate-900/85 opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-center justify-center gap-1.5 px-1.5">
        <span className="text-xs text-slate-400 truncate min-w-0">{cellTypeLabelFromT(t, cell.content.type)}</span>
        <button className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer shrink-0 hover:bg-slate-700 rounded px-1 py-0.5"
          title={t.rowsEditor.editTitle}
          onClick={e => { e.stopPropagation(); setEditing(true); }}><EmojiIcon name="pencil" size={20} /></button>
        <button className="text-xs text-red-500 hover:text-red-400 cursor-pointer shrink-0 hover:bg-slate-700 rounded px-1 py-0.5"
          title={t.rowsEditor.deleteTitle}
          onClick={e => { e.stopPropagation(); onDelete(); }}><EmojiIcon name="close" size={20} /></button>
      </div>
      {editing && (
        <TCellEditModal
          cell={cell} vars={vars} assetNodes={assetNodes}
          sceneId={sceneId}
          onUpdateContent={onUpdateContent}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ─── Cell type label helper ────────────────────────────────────────────────────

function cellTypeLabelFromT(t: ReturnType<typeof useT>, type: CellContent['type']): string {
  const m: Record<CellContent['type'], string> = {
    text:             t.cellModal.typeText,
    variable:         t.cellModal.typeVariable,
    progress:         t.cellModal.typeProgress,
    'image-static':   t.cellModal.typeImageStatic,
    'image-bound':    t.cellModal.typeImageBoundShort,
    'image-gen':      t.cellModal.typeImageGenShort,
    'image-from-var': t.cellModal.typeImageFromVarShort,
    raw:              t.cellModal.typeRaw,
    include:          t.cellModal.typeInclude,
    button:           t.cellModal.typeButton,
    list:             t.cellModal.typeList,
    'audio-volume':   t.cellModal.typeAudioVolume,
    'date-time':      t.cellModal.typeDateTime,
    paperdoll:        t.cellModal.typePaperdoll,
  };
  return m[type];
}

// ─── Cell preview ─────────────────────────────────────────────────────────────

function TCellPreview({ cell, vars }: { cell: SidebarCell; vars: Variable[] }) {
  const t = useT();
  const c = cell.content;
  const v = 'variableId' in c ? vars.find(x => x.id === c.variableId) : undefined;
  if (c.type === 'text') return (
    <span className="text-xs text-slate-300 p-1 truncate flex-1">
      {c.value || <em className="text-slate-600">{t.rowsEditor.cellTextPlaceholder}</em>}
    </span>
  );
  if (c.type === 'variable') return (
    <span className="text-xs text-sky-300 p-1 font-mono truncate flex-1">
      {c.prefix}{v ? `$${v.name}` : '?'}{c.suffix}
    </span>
  );
  if (c.type === 'progress') {
    const previewColor = c.colorRange?.from ?? c.color;
    if (c.vertical) return (
      <div className="flex-1 p-1 flex justify-center items-stretch">
        <div className="flex-1 rounded overflow-hidden flex flex-col-reverse" style={{ background: c.emptyColor ?? '#333' }}>
          <div className="w-full rounded" style={{ height: '60%', background: previewColor }} />
        </div>
      </div>
    );
    return (
      <div className="flex-1 p-1 flex items-center">
        <div className="w-full h-2 rounded overflow-hidden" style={{ background: c.emptyColor ?? '#333' }}>
          <div className="h-full rounded" style={{ width: '60%', background: previewColor }} />
        </div>
      </div>
    );
  }
  if (c.type === 'image-static') {
    const filename = c.src ? c.src.split('/').pop()! : '';
    return (
      <div className="flex-1 flex items-center gap-1 p-1 min-w-0">
        <span className="text-slate-400 shrink-0 inline-flex"><EmojiIcon name="image" size={20} /></span>
        <span className="text-xs text-slate-300 font-mono truncate flex-1">
          {filename || <em className="text-slate-600 not-italic">—</em>}
        </span>
      </div>
    );
  }
  if (c.type === 'image-bound') return (
    <div className="flex-1 flex items-center gap-1 p-1 min-w-0">
      <span className="text-slate-400 shrink-0 inline-flex"><EmojiIcon name="image" size={20} /></span>
      <span className="text-xs text-sky-300 font-mono truncate flex-1">{v ? `$${v.name}` : '?'}</span>
      {c.mapping.length > 0 && <span className="text-xs text-slate-500 shrink-0">×{c.mapping.length}</span>}
    </div>
  );
  if (c.type === 'image-gen') {
    const filename = c.src ? c.src.split('/').pop()! : '';
    return (
      <div className="flex-1 flex items-center gap-1 p-1 min-w-0">
        <span className="text-slate-400 shrink-0 inline-flex gap-0.5"><EmojiIcon name="image" size={20} /><EmojiIcon name="sparkle" size={20} /></span>
        <span className="text-xs text-slate-300 truncate flex-1">
          {filename || c.prompt || <em className="text-slate-600 not-italic">—</em>}
        </span>
      </div>
    );
  }
  if (c.type === 'image-from-var') return (
    <div className="flex-1 flex items-center gap-1 p-1 min-w-0">
      <span className="text-slate-400 shrink-0 inline-flex"><EmojiIcon name="image" size={20} /></span>
      <span className="text-xs text-sky-300 font-mono truncate flex-1">{v ? `$${v.name}` : '?'}</span>
    </div>
  );
  if (c.type === 'raw') return (
    <span className="text-xs text-zinc-400 font-mono p-1 truncate flex-1">
      {c.code || <em className="text-slate-600 not-italic">{t.rowsEditor.cellCodePlaceholder}</em>}
    </span>
  );
  if (c.type === 'button') return (
    <div className="flex-1 p-1 flex items-center justify-center">
      <span
        className="text-xs truncate"
        style={{
          background: c.style.bgColor, color: c.style.textColor,
          border: `1px solid ${c.style.borderColor}`,
          borderRadius: `${c.style.borderRadius}px`,
          padding: `2px 6px`,
          fontWeight: c.style.bold ? 'bold' : 'normal',
        }}
      >
        {c.label || <em className="opacity-50">btn</em>}
      </span>
    </div>
  );
  if (c.type === 'list') {
    const v = vars.find(x => x.id === c.variableId);
    return (
      <span className="text-xs text-violet-300 p-1 font-mono truncate flex-1">
        [{v ? `$${v.name}` : '?'}]
      </span>
    );
  }
  if (c.type === 'date-time') return (
    <span className="text-xs text-orange-300 p-1 font-mono truncate flex-1">
      {c.prefix}{v ? `$${v.name}` : '?'}{c.suffix}
      <span className="text-[10px] text-slate-500 ml-1">({c.format})</span>
    </span>
  );
  if (c.type === 'paperdoll') return (
    <span className="text-xs text-violet-300 p-1 truncate flex-1">
      <span className="inline-flex align-middle"><EmojiIcon name="puzzle" size={20} /></span> {c.charId || <em className="text-slate-600 not-italic">—</em>}
    </span>
  );
  return null;
}

// ─── Cell edit modal ──────────────────────────────────────────────────────────

function TCellEditModal({
  cell, vars, assetNodes, sceneId, onUpdateContent, onClose,
}: {
  cell: SidebarCell;
  vars: Variable[];
  assetNodes: AssetTreeNode[];
  sceneId: string;
  onUpdateContent: (c: CellContent) => void;
  onClose: () => void;
}) {
  const t = useT();
  const project = useProjectStore(s => s.project);
  const variableNodes = useVariableNodes();
  const c = cell.content;
  const [genModalOpen, setGenModalOpen] = useState(false);

  const CELL_TYPES: { value: CellContent['type']; label: string }[] = [
    { value: 'text',           label: t.cellModal.typeText },
    { value: 'variable',       label: t.cellModal.typeVariable },
    { value: 'progress',       label: t.cellModal.typeProgress },
    { value: 'image-static',   label: t.cellModal.typeImageStatic },
    { value: 'image-bound',    label: t.cellModal.typeImageBound },
    { value: 'image-gen',      label: t.cellModal.typeImageGen },
    { value: 'image-from-var', label: t.cellModal.typeImageFromVar },
    { value: 'raw',            label: t.cellModal.typeRaw },
    { value: 'include',        label: t.cellModal.typeInclude },
    { value: 'button',         label: t.cellModal.typeButton },
    { value: 'list',           label: t.cellModal.typeList },
    { value: 'date-time',      label: t.cellModal.typeDateTime },
    { value: 'paperdoll',      label: t.cellModal.typePaperdoll },
  ];

  const changeType = (type: CellContent['type']) => {
    if (type !== c.type) onUpdateContent(makeDefaultContent(type));
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={e => e.stopPropagation()}>
      <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-96 max-h-[80vh] overflow-y-auto p-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{t.cellModal.title}</span>
          <button className="text-slate-500 hover:text-white text-xs cursor-pointer" onClick={onClose}><EmojiIcon name="close" size={20} /></button>
        </div>

        <TMField label={t.cellModal.contentType}>
          <select
            className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
            value={c.type}
            onChange={e => changeType(e.target.value as CellContent['type'])}
          >
            {CELL_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
          </select>
        </TMField>

        {c.type === 'text' && (
          <TMField label={t.cellModal.typeText}>
            <input className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
              value={c.value} onChange={e => onUpdateContent({ ...c, value: e.target.value })} />
          </TMField>
        )}

        {c.type === 'variable' && (
          <>
            <TVarSelect value={c.variableId} onChange={v => onUpdateContent({ ...c, variableId: v })} />
            <TMField label={t.cellModal.prefix}>
              <input className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600"
                value={c.prefix} onChange={e => onUpdateContent({ ...c, prefix: e.target.value })} />
            </TMField>
            <TMField label={t.cellModal.suffix}>
              <input className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600"
                value={c.suffix} onChange={e => onUpdateContent({ ...c, suffix: e.target.value })} />
            </TMField>
          </>
        )}

        {c.type === 'progress' && (
          <>
            <TVarSelect value={c.variableId} onChange={v => onUpdateContent({ ...c, variableId: v })} />
            <TMField label={t.cellModal.maximum}>
              <NumericInput min={1}
                className="w-24 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 font-mono"
                value={c.maxValue} onChange={v => onUpdateContent({ ...c, maxValue: v })} />
            </TMField>
            {/* Colour range toggle */}
            <TMField label={t.cellModal.colorRange}>
              <input type="checkbox" className="accent-indigo-500 cursor-pointer"
                checked={!!c.colorRange}
                onChange={e => onUpdateContent({ ...c, colorRange: e.target.checked ? { from: c.color, to: c.color } : null })} />
              <span className="text-xs text-slate-500 ml-1">{c.colorRange ? '0% → 100%' : t.cellModal.colorRangeOff}</span>
            </TMField>
            {/* Fill colour(s) */}
            {c.colorRange ? (
              <>
                <TMField label={t.cellModal.colorAt0}>
                  <input type="color" className="w-10 h-8 rounded cursor-pointer bg-transparent border border-slate-600"
                    value={c.colorRange.from} onChange={e => onUpdateContent({ ...c, colorRange: { ...c.colorRange!, from: e.target.value } })} />
                  <input className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 font-mono ml-2"
                    value={c.colorRange.from} onChange={e => onUpdateContent({ ...c, colorRange: { ...c.colorRange!, from: e.target.value } })} />
                </TMField>
                <TMField label={t.cellModal.colorAt100}>
                  <input type="color" className="w-10 h-8 rounded cursor-pointer bg-transparent border border-slate-600"
                    value={c.colorRange.to} onChange={e => onUpdateContent({ ...c, colorRange: { ...c.colorRange!, to: e.target.value } })} />
                  <input className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 font-mono ml-2"
                    value={c.colorRange.to} onChange={e => onUpdateContent({ ...c, colorRange: { ...c.colorRange!, to: e.target.value } })} />
                </TMField>
              </>
            ) : (
              <TMField label={t.cellModal.fillColor}>
                <input type="color" className="w-10 h-8 rounded cursor-pointer bg-transparent border border-slate-600"
                  value={c.color} onChange={e => onUpdateContent({ ...c, color: e.target.value })} />
                <input className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 font-mono ml-2"
                  value={c.color} onChange={e => onUpdateContent({ ...c, color: e.target.value })} />
              </TMField>
            )}
            {/* Empty-portion colour */}
            <TMField label={t.cellModal.barBgColor}>
              <input type="color" className="w-10 h-8 rounded cursor-pointer bg-transparent border border-slate-600"
                value={c.emptyColor ?? '#333333'} onChange={e => onUpdateContent({ ...c, emptyColor: e.target.value })} />
              <input className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 font-mono ml-2"
                value={c.emptyColor ?? '#333333'} onChange={e => onUpdateContent({ ...c, emptyColor: e.target.value })} />
            </TMField>
            {/* Text colour */}
            <TMField label={t.cellModal.textColor}>
              <input type="checkbox" className="accent-indigo-500 cursor-pointer"
                checked={!!c.textColor}
                onChange={e => onUpdateContent({ ...c, textColor: e.target.checked ? '#ffffff' : '' })} />
              {c.textColor ? (
                <>
                  <input type="color" className="w-8 h-7 rounded cursor-pointer bg-transparent border border-slate-600 ml-1"
                    value={c.textColor} onChange={e => onUpdateContent({ ...c, textColor: e.target.value })} />
                  <input className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 font-mono"
                    value={c.textColor} onChange={e => onUpdateContent({ ...c, textColor: e.target.value })} />
                </>
              ) : (
                <span className="text-xs text-slate-500 italic ml-1">{t.cellModal.inherited}</span>
              )}
            </TMField>
            <TMField label={t.cellModal.vertical}>
              <input type="checkbox" className="accent-indigo-500 cursor-pointer"
                checked={!!c.vertical} onChange={e => onUpdateContent({ ...c, vertical: e.target.checked })} />
            </TMField>
            <TMField label={t.cellModal.showNumbers}>
              <input type="checkbox" className="accent-indigo-500 cursor-pointer"
                checked={c.showText} onChange={e => onUpdateContent({ ...c, showText: e.target.checked })} />
            </TMField>
          </>
        )}

        {c.type === 'image-static' && (
          <>
            <TMField label={t.cellModal.imageLabel}>
              <ImageAssetPicker assetNodes={assetNodes} value={c.src} onChange={src => onUpdateContent({ ...c, src })} />
            </TMField>
            <TObjectFitSelect value={c.objectFit} onChange={v => onUpdateContent({ ...c, objectFit: v })} />
          </>
        )}

        {c.type === 'image-bound' && (
          <>
            <TVarSelect value={c.variableId} onChange={v => onUpdateContent({ ...c, variableId: v })} />
            <TObjectFitSelect value={c.objectFit} onChange={v => onUpdateContent({ ...c, objectFit: v })} />
            <ImageMappingEditor
              mapping={c.mapping}
              onChange={mapping => onUpdateContent({ ...c, mapping })}
              defaultSrc={c.defaultSrc}
              onDefaultSrcChange={defaultSrc => onUpdateContent({ ...c, defaultSrc })}
              assetNodes={assetNodes}
              hideDefault
            />
            <button
              type="button"
              className="self-start px-3 py-1.5 text-xs rounded bg-indigo-700 hover:bg-indigo-600 text-white cursor-pointer transition-colors"
              onClick={() => setGenModalOpen(true)}
            >{t.cellModal.openImageBoundGen}</button>
          </>
        )}

        {c.type === 'image-gen' && (
          <CellImageGenEditor
            content={c}
            cellId={cell.id}
            sceneId={sceneId}
            onUpdate={patch => onUpdateContent({ ...c, ...patch })}
          />
        )}

        {c.type === 'image-from-var' && (
          <>
            <TVarSelect value={c.variableId} onChange={v => onUpdateContent({ ...c, variableId: v })} />
            <TObjectFitSelect value={c.objectFit} onChange={v => onUpdateContent({ ...c, objectFit: v })} />
          </>
        )}

        {c.type === 'raw' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">{t.cellModal.rawCodeLabel}</label>
            <textarea
              className="w-full min-h-[100px] bg-slate-800 text-xs text-white font-mono rounded px-2 py-1.5 outline-none border border-slate-600 focus:border-indigo-500 resize-y leading-relaxed"
              placeholder={"<<set $x to 1>>\n..."}
              value={c.code} onChange={e => onUpdateContent({ ...c, code: e.target.value })} spellCheck={false} />
          </div>
        )}

        {c.type === 'button' && (
          <TCellButtonEditor c={c} vars={vars} onUpdateContent={onUpdateContent} />
        )}

        {c.type === 'list' && (
          <>
            <TMField label={t.cellModal.listVariableLabel}>
              <select
                className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
                value={c.variableId}
                onChange={e => onUpdateContent({ ...(c as CellList), variableId: e.target.value })}
              >
                <option value="">— select —</option>
                {vars.filter(v => v.varType === 'array').map(v => (
                  <option key={v.id} value={v.id}>${v.name}</option>
                ))}
              </select>
            </TMField>
            <TMField label={t.cellModal.listSeparatorLabel}>
              <input
                className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 font-mono"
                value={(c as CellList).separator}
                onChange={e => onUpdateContent({ ...(c as CellList), separator: e.target.value })}
              />
            </TMField>
            <TMField label={t.cellModal.listEmptyTextLabel}>
              <input
                className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600"
                value={(c as CellList).emptyText}
                onChange={e => onUpdateContent({ ...(c as CellList), emptyText: e.target.value })}
              />
            </TMField>
            <TMField label={t.cellModal.listPrefixLabel}>
              <input
                className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600"
                value={(c as CellList).prefix}
                onChange={e => onUpdateContent({ ...(c as CellList), prefix: e.target.value })}
              />
            </TMField>
            <TMField label={t.cellModal.listSuffixLabel}>
              <input
                className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600"
                value={(c as CellList).suffix}
                onChange={e => onUpdateContent({ ...(c as CellList), suffix: e.target.value })}
              />
            </TMField>
          </>
        )}

        {c.type === 'date-time' && (
          <DateTimeCellEditor
            c={c as CellDateTime}
            nodes={variableNodes}
            onChange={patch => onUpdateContent({ ...(c as CellDateTime), ...patch })}
            Field={TMField}
          />
        )}

        {c.type === 'paperdoll' && (
          <>
            <TMField label={t.cellModal.paperdollCharLabel}>
              <select
                className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
                value={c.charId}
                onChange={e => onUpdateContent({ ...c, charId: e.target.value })}
              >
                <option value="">{t.cellModal.paperdollNoChar}</option>
                {project.characters.map(ch => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}{ch.paperdoll ? ` (${ch.paperdoll.slots.length})` : ''}
                  </option>
                ))}
              </select>
            </TMField>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
              <input type="checkbox" checked={c.showLabels ?? false}
                onChange={e => onUpdateContent({ ...c, showLabels: e.target.checked })} />
              {t.cellModal.paperdollShowLabels}
            </label>
          </>
        )}

        <button className="mt-2 px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium cursor-pointer self-end"
          onClick={onClose}>{t.cellModal.done}</button>
      </div>
    </div>

    {genModalOpen && c.type === 'image-bound' && (
      <CellImageBoundGenModal
        cell={c}
        cellId={cell.id}
        variableId={c.variableId}
        sceneId={sceneId}
        onSave={updated => onUpdateContent(updated)}
        onClose={() => setGenModalOpen(false)}
      />
    )}
    </>
  );
}

// ─── Reusable sub-components ──────────────────────────────────────────────────

function TMField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-slate-400 w-28 shrink-0">{label}:</label>
      <div className="flex-1 flex items-center gap-1">{children}</div>
    </div>
  );
}

function TSField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-slate-400 shrink-0">{label}:</label>
      {children}
    </div>
  );
}

function TNumInput({
  value, min, max, onChange, suffix, className = 'w-16',
}: {
  value: number; min: number; max: number;
  onChange: (v: number) => void; suffix?: string; className?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <NumericInput
        min={min} max={max}
        className={`${className} text-xs bg-slate-800 text-white rounded px-1.5 py-0.5 outline-none border border-slate-600 focus:border-indigo-500 font-mono`}
        value={value}
        onChange={onChange}
      />
      {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
    </div>
  );
}

function TCheckField({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer group">
      <input type="checkbox" className="accent-indigo-500 cursor-pointer"
        checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">{label}</span>
    </label>
  );
}

function TVarSelect({ value, onChange }: {
  value: string; onChange: (id: string) => void;
}) {
  const t = useT();
  const variableNodes = useVariableNodes();
  return (
    <TMField label={t.cellModal.typeVariable}>
      <VariablePicker
        value={value}
        onChange={onChange}
        nodes={variableNodes}
        placeholder={t.cellModal.selectVariable}
        className="flex-1"
      />
    </TMField>
  );
}

function TObjectFitSelect({ value, onChange }: {
  value: 'cover' | 'contain'; onChange: (v: 'cover' | 'contain') => void;
}) {
  const t = useT();
  return (
    <TMField label={t.cellModal.objectFit}>
      <select className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 cursor-pointer"
        value={value} onChange={e => onChange(e.target.value as 'cover' | 'contain')}>
        <option value="cover">{t.cellModal.fitCover}</option>
        <option value="contain">{t.cellModal.fitContain}</option>
      </select>
    </TMField>
  );
}

// ─── Cell button editor ───────────────────────────────────────────────────────

const T_OPERATORS: { value: VarOperator; label: string }[] = [
  { value: '=',  label: '=' },
  { value: '+=', label: '+=' },
  { value: '-=', label: '-=' },
  { value: '*=', label: '*=' },
  { value: '/=', label: '/=' },
];

function TCellButtonEditor({
  c, vars, onUpdateContent,
}: {
  c: CellButton;
  vars: Variable[];
  onUpdateContent: (content: CellContent) => void;
}) {
  const t = useT();
  const project = useProjectStore(s => s.project);
  const variableNodes = useVariableNodes();
  const pluginParams = usePluginParams();
  const sceneParams = pluginParams.filter(p => p.kind === 'scene');
  const scenes = project.scenes;

  const patchStyle = (patch: Partial<ButtonStyle>) =>
    onUpdateContent({ ...c, style: { ...c.style, ...patch } });

  const patchAction = (actionId: string, patch: Partial<ButtonAction>) =>
    onUpdateContent({ ...c, actions: c.actions.map(a => a.id === actionId ? { ...a, ...patch } : a) as ButtonAction[] });

  const addAction = () =>
    onUpdateContent({ ...c, actions: [...c.actions, { id: crypto.randomUUID(), variableId: '', operator: '=' as VarOperator, value: '' }] });

  const removeAction = (id: string) =>
    onUpdateContent({ ...c, actions: c.actions.filter(a => a.id !== id) });

  const navType = c.navigate?.type ?? 'none';

  const handleNavTypeChange = (type: string) => {
    if (type === 'none') onUpdateContent({ ...c, navigate: undefined });
    else if (type === 'back') onUpdateContent({ ...c, navigate: { type: 'back' } });
    else onUpdateContent({ ...c, navigate: { type: 'scene', sceneId: '' } });
  };

  return (
    <>
      {/* Label */}
      <TMField label={t.cellModal.buttonLabelField}>
        <input
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
          value={c.label}
          onChange={e => onUpdateContent({ ...c, label: e.target.value })}
        />
      </TMField>

      {/* Style */}
      <div className="flex flex-col gap-2 border border-slate-700 rounded p-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.buttonBlock.styleTitle}</span>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">{t.buttonBlock.bgLabel}</span>
            <input type="color" value={c.style.bgColor} onChange={e => patchStyle({ bgColor: e.target.value })}
              className="w-7 h-7 rounded cursor-pointer border border-slate-600 bg-transparent p-0.5" />
            <input type="text" value={c.style.bgColor} onChange={e => patchStyle({ bgColor: e.target.value })}
              className="w-20 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 outline-none font-mono" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">{t.buttonBlock.textColorLabel}</span>
            <input type="color" value={c.style.textColor} onChange={e => patchStyle({ textColor: e.target.value })}
              className="w-7 h-7 rounded cursor-pointer border border-slate-600 bg-transparent p-0.5" />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">{t.buttonBlock.radiusLabel}</span>
            <TNumInput value={c.style.borderRadius} min={0} max={50} onChange={v => patchStyle({ borderRadius: v })} suffix="px" />
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={c.style.bold} onChange={e => patchStyle({ bold: e.target.checked })} className="accent-indigo-500" />
            <span className="text-xs text-slate-300">{t.buttonBlock.bold}</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={c.style.fullWidth} onChange={e => patchStyle({ fullWidth: e.target.checked })} className="accent-indigo-500" />
            <span className="text-xs text-slate-300">{t.buttonBlock.fullWidth}</span>
          </label>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-2 border border-slate-700 rounded p-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.cellModal.buttonNavigateTitle}</span>
        <select
          className="w-full bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
          value={navType}
          onChange={e => handleNavTypeChange(e.target.value)}
        >
          <option value="none">{t.cellModal.buttonTargetNone}</option>
          <option value="scene">{t.cellModal.buttonTargetScene}</option>
          <option value="back">{t.cellModal.buttonTargetBack}</option>
        </select>

        {navType === 'scene' && (
          <TMField label={t.cellModal.buttonSceneLabel}>
            <select
              className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
              value={c.navigate?.type === 'scene' ? c.navigate.sceneId : ''}
              onChange={e => onUpdateContent({ ...c, navigate: { type: 'scene', sceneId: e.target.value } })}
            >
              <option value="">{t.linkBlock.noScene}</option>
              {sceneParams.length > 0 ? (
                <>
                  <optgroup label="— params —">
                    {sceneParams.map(p => (
                      <option key={p.key} value={`param:${p.key}`}>_{p.key}{p.label ? ` (${p.label})` : ''}</option>
                    ))}
                  </optgroup>
                  <optgroup label="— scenes —">
                    {scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                </>
              ) : (
                scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
              )}
            </select>
          </TMField>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.buttonBlock.actionsTitle}</span>
          <button className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer" onClick={addAction}>
            {t.buttonBlock.addAction}
          </button>
        </div>
        {c.actions.length === 0 && (
          <span className="text-xs text-slate-500 italic">{t.buttonBlock.noActions}</span>
        )}
        {c.actions.map(a => {
          if (a.type === 'open-popup') {
            const popupScenes = project.scenes.filter(s => s.tags.includes('popup'));
            return (
              <div key={a.id} className="flex flex-col gap-1 bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <select
                    className="w-24 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 outline-none cursor-pointer"
                    value="open-popup"
                    onChange={e => {
                      if (e.target.value === 'set-variable') {
                        patchAction(a.id, { type: undefined, variableId: '', operator: '=' as VarOperator, value: '' } as Partial<ButtonAction>);
                      }
                    }}
                  >
                    <option value="set-variable">{t.actionType.setVariable}</option>
                    <option value="open-popup">{t.actionType.openPopup}</option>
                  </select>
                  {popupScenes.length === 0 && sceneParams.length === 0 ? (
                    <span className="flex-1 text-xs text-slate-500 italic">{t.actionType.noPopupScenes}</span>
                  ) : (
                    <select
                      className="flex-1 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 outline-none cursor-pointer"
                      value={a.targetSceneId}
                      onChange={e => patchAction(a.id, { targetSceneId: e.target.value } as Partial<ButtonAction>)}
                    >
                      <option value="">— select —</option>
                      {sceneParams.length > 0 ? (
                        <>
                          <optgroup label="— params —">
                            {sceneParams.map(p => (
                              <option key={p.key} value={`param:${p.key}`}>_{p.key}{p.label ? ` (${p.label})` : ''}</option>
                            ))}
                          </optgroup>
                          <optgroup label="— popups —">
                            {popupScenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </optgroup>
                        </>
                      ) : (
                        popupScenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                      )}
                    </select>
                  )}
                  <InventoryPopupShortcut onResolved={sceneId => patchAction(a.id, { targetSceneId: sceneId } as Partial<ButtonAction>)} />
                  <button className="text-slate-600 hover:text-red-400 transition-colors text-sm cursor-pointer shrink-0"
                    onClick={() => removeAction(a.id)}><EmojiIcon name="close" size={20} /></button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 w-24 shrink-0">{t.actionType.popupTitle}</span>
                  <input
                    className="flex-1 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 outline-none"
                    placeholder={t.actionType.popupTitlePlaceholder}
                    value={a.title ?? ''}
                    onChange={e => patchAction(a.id, { title: e.target.value } as Partial<ButtonAction>)}
                  />
                </div>
              </div>
            );
          }
          const selVar = vars.find(v => v.id === a.variableId);
          return (
            <div key={a.id} className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5">
              <select
                className="w-24 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 outline-none cursor-pointer"
                value="set-variable"
                onChange={e => {
                  if (e.target.value === 'open-popup') {
                    patchAction(a.id, { type: 'open-popup', variableId: undefined, operator: undefined, value: undefined, accessor: undefined, targetSceneId: '', title: '' } as unknown as Partial<ButtonAction>);
                  }
                }}
              >
                <option value="set-variable">{t.actionType.setVariable}</option>
                <option value="open-popup">{t.actionType.openPopup}</option>
              </select>
              <VariablePicker
                value={a.variableId}
                onChange={id => patchAction(a.id, { variableId: id })}
                nodes={variableNodes}
                placeholder={t.buttonBlock.selectVariable}
                className="flex-1 min-w-0"
              />
              <select
                className="w-14 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 focus:border-indigo-500 outline-none cursor-pointer font-mono"
                value={a.operator}
                onChange={e => patchAction(a.id, { operator: e.target.value as VarOperator })}
              >
                {T_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
              </select>
              <input
                className="w-20 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 focus:border-indigo-500 outline-none font-mono"
                placeholder={selVar?.varType === 'string' ? t.buttonBlock.textPlaceholder : selVar?.varType === 'boolean' ? 'true' : '1'}
                value={a.value}
                onChange={e => patchAction(a.id, { value: e.target.value })}
              />
              <button className="text-slate-600 hover:text-red-400 transition-colors text-sm cursor-pointer shrink-0"
                onClick={() => removeAction(a.id)}><EmojiIcon name="close" size={20} /></button>
            </div>
          );
        })}
      </div>
    </>
  );
}

