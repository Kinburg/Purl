import { useState, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProjectStore, DEFAULT_PANEL_STYLE, redistributeWidths, deepCloneBlock } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useT, blockTypeLabel } from '../../i18n';
import type { TableBlock, SidebarRow, SidebarCell, PanelStyle, Block } from '../../types';
import { EmojiIcon } from '../shared/EmojiIcons';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { AddBlockMenu } from './AddBlockMenu';
import { InnerBlockEditor } from './InnerBlockEditor';
import NumericInput from '../shared/NumericInput';

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

  const update = onUpdate ?? ((p: Partial<TableBlock>) => updateBlock(sceneId, block.id, p as never));
  const updateRows = (rows: SidebarRow[]) => update({ rows });
  const updateStyle = (patch: Partial<PanelStyle>) => update({ style: { ...block.style, ...patch } });

  const addRow = () => {
    saveSnapshot();
    const newRow: SidebarRow = {
      id: crypto.randomUUID(),
      height: 60,
      cells: [{ id: crypto.randomUUID(), width: 100, blocks: [] }],
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
      const newCell: SidebarCell = { id: crypto.randomUUID(), width: 50, blocks: [] };
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

  const updateCellBlocks = (rowId: string, cellId: string, blocks: Block[]) =>
    updateRows(block.rows.map(r => {
      if (r.id !== rowId) return r;
      return { ...r, cells: r.cells.map(c => c.id === cellId ? { ...c, blocks } : c) };
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
              <div className="flex" style={{ minHeight: Math.max(40, Math.min(row.height, 120)) }}>
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
                    sceneId={sceneId}
                    onUpdateBlocks={blocks => updateCellBlocks(row.id, cell.id, blocks)}
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

// ─── Cell editor (preview chip stack + modal block-list) ────────────────────────

function TCellEditor({
  cell, sceneId, onUpdateBlocks, onDelete,
}: {
  cell: SidebarCell;
  sceneId: string;
  onUpdateBlocks: (blocks: Block[]) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  return (
    <div
      className="relative flex flex-col border border-slate-600 rounded bg-slate-800/40 overflow-hidden cursor-pointer group/cell"
      style={{ flex: cell.width, minWidth: 0 }}
      onClick={() => setEditing(true)}
    >
      <TCellPreview cell={cell} />
      <div className="absolute inset-0 bg-slate-900/85 opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-center justify-center gap-1.5 px-1.5">
        <span className="text-xs text-slate-400 truncate min-w-0">
          {cell.blocks.length > 0 ? t.rowsEditor.cellBlockCount(cell.blocks.length) : t.rowsEditor.cellEmpty}
        </span>
        <button className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer shrink-0 hover:bg-slate-700 rounded px-1 py-0.5"
          title={t.rowsEditor.editTitle}
          onClick={e => { e.stopPropagation(); setEditing(true); }}><EmojiIcon name="pencil" size={20} /></button>
        <button className="text-xs text-red-500 hover:text-red-400 cursor-pointer shrink-0 hover:bg-slate-700 rounded px-1 py-0.5"
          title={t.rowsEditor.deleteTitle}
          onClick={e => { e.stopPropagation(); onDelete(); }}><EmojiIcon name="close" size={20} /></button>
      </div>
      {editing && (
        <TCellEditModal
          cell={cell}
          sceneId={sceneId}
          onUpdateBlocks={onUpdateBlocks}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ─── Cell preview — block-type chips ────────────────────────────────────────────

function TCellPreview({ cell }: { cell: SidebarCell }) {
  const t = useT();
  if (cell.blocks.length === 0) {
    return (
      <span className="text-xs text-slate-600 italic p-1.5 flex-1">{t.rowsEditor.cellEmpty}</span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1 p-1.5 content-start flex-1 overflow-hidden">
      {cell.blocks.map(b => (
        <span key={b.id} className="text-[10px] leading-tight px-1.5 py-0.5 rounded bg-slate-700/70 text-slate-300 truncate max-w-full">
          {blockTypeLabel(t, b.type)}
        </span>
      ))}
    </div>
  );
}

// ─── Cell edit modal — nested block list ────────────────────────────────────────

function TCellEditModal({
  cell, sceneId, onUpdateBlocks, onClose,
}: {
  cell: SidebarCell;
  sceneId: string;
  onUpdateBlocks: (blocks: Block[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const saveSnapshot    = useProjectStore(s => s.saveSnapshot);
  const copyToClipboard = useEditorStore(s => s.copyToClipboard);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const blocks = cell.blocks;
  const handleAdd = (nb: Block) => { saveSnapshot(); onUpdateBlocks([...blocks, nb]); };
  const handleUpdateNested = (id: string, p: Partial<Block>) =>
    onUpdateBlocks(blocks.map(b => b.id === id ? { ...b, ...p } as Block : b));
  const handleDelete = (id: string) => { saveSnapshot(); onUpdateBlocks(blocks.filter(b => b.id !== id)); };
  const handleDuplicate = (id: string) => {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    saveSnapshot();
    const next = [...blocks];
    next.splice(idx + 1, 0, deepCloneBlock(blocks[idx]));
    onUpdateBlocks(next);
  };
  const handleCopy = (b: Block) => copyToClipboard(deepCloneBlock(b));
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = blocks.findIndex(b => b.id === active.id);
    const newIdx = blocks.findIndex(b => b.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    saveSnapshot();
    onUpdateBlocks(arrayMove(blocks, oldIdx, newIdx));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-[30rem] max-h-[85vh] overflow-y-auto p-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{t.cellModal.title}</span>
          <button className="text-slate-500 hover:text-white text-xs cursor-pointer" onClick={onClose}><EmojiIcon name="close" size={20} /></button>
        </div>

        <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-slate-700/60">
          {blocks.length === 0 && (
            <div className="text-xs text-slate-500 italic px-1">{t.sectionBlock.empty}</div>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1.5">
                {blocks.map(b => (
                  <SortableCellBlock
                    key={b.id}
                    block={b}
                    sceneId={sceneId}
                    onUpdate={p => handleUpdateNested(b.id, p)}
                    onCopy={() => handleCopy(b)}
                    onDuplicate={() => handleDuplicate(b.id)}
                    onDelete={() => handleDelete(b.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <AddBlockMenu sceneId={sceneId} onAdd={handleAdd} />
        </div>

        <button className="mt-1 px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium cursor-pointer self-end"
          onClick={onClose}>{t.cellModal.done}</button>
      </div>
    </div>
  );
}

// ── Sortable wrapper for a nested block (mirrors SectionBlockEditor) ───────────

function SortableCellBlock({
  block, sceneId, onUpdate, onCopy, onDuplicate, onDelete,
}: {
  block: Block;
  sceneId: string;
  onUpdate: (patch: Partial<Block>) => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="rounded border border-slate-700 bg-slate-800/50 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 bg-slate-800/80 border-b border-slate-700">
        <div className="flex items-center gap-1.5">
          <span
            {...listeners}
            {...attributes}
            className="drag-handle text-slate-600 hover:text-slate-400 text-xs select-none cursor-grab active:cursor-grabbing"
            title={t.block.drag}
          >⠿</span>
          <span className="text-xs text-slate-400 uppercase tracking-wider">{blockTypeLabel(t, block.type)}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button className="text-slate-600 hover:text-slate-300 text-xs cursor-pointer px-0.5 transition-colors" title={t.block.copy} onClick={onCopy}>
            <EmojiIcon name="clipboard" size={20} />
          </button>
          <button className="text-slate-600 hover:text-indigo-400 text-xs cursor-pointer px-0.5 transition-colors" title={t.block.duplicate} onClick={onDuplicate}>⧉</button>
          <button className="text-slate-600 hover:text-red-400 text-xs cursor-pointer px-0.5 transition-colors" title={t.block.delete} onClick={onDelete}>
            <EmojiIcon name="close" size={20} />
          </button>
        </div>
      </div>
      <div className="p-2">
        <InnerBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

// ─── Reusable sub-components ──────────────────────────────────────────────────

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
