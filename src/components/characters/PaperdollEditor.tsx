import { useState, type ReactNode } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { VariablePicker } from '../shared/VariablePicker';
import { ImageMappingEditor, ImageAssetPicker } from '../shared/ImageMappingEditor';
import { INPUT_CLS } from '../shared/ModalShell';
import { EmojiIcon } from '../shared/EmojiIcons';
import NumericInput from '../shared/NumericInput';
import { useT } from '../../i18n';
import { AvatarGenModal } from './AvatarGenModal';
import type {
  Character, AvatarConfig, AssetTreeNode, VariableTreeNode,
  ItemDefinition, PaperdollConfig, PaperdollSlot, SlotPlaceholderConfig,
} from '../../types';

function emptyPaperdoll(): PaperdollConfig {
  return { gridCols: 3, gridRows: 4, cellSize: 64, slots: [] };
}

function placeholderToAvatarConfig(ph: SlotPlaceholderConfig): AvatarConfig {
  return { mode: ph.mode, src: ph.src, variableId: ph.variableId, mapping: ph.mapping, defaultSrc: ph.defaultSrc, genSettings: ph.genSettings };
}

function avatarConfigToPlaceholder(cfg: AvatarConfig, ph: SlotPlaceholderConfig): SlotPlaceholderConfig {
  return { ...ph, mode: cfg.mode as 'static' | 'bound', src: cfg.src, variableId: cfg.variableId, mapping: cfg.mapping, defaultSrc: cfg.defaultSrc, genSettings: cfg.genSettings };
}

// ─── Paperdoll (grid + slot detail side-by-side) ───────────────────────────

export function PaperdollEditor({
  mode, charId, liveChar,
  localConfig, onLocalChange,
  items, charNodes, charName, charLlmDescr, charVarName,
  addPaperdollSlot, updatePaperdollSlot, deletePaperdollSlot, setPaperdollConfig,
}: {
  mode: 'create' | 'edit';
  charId?: string;
  liveChar?: Character;
  localConfig: PaperdollConfig | undefined;
  onLocalChange: (c: PaperdollConfig | undefined) => void;
  items: ItemDefinition[];
  charNodes: VariableTreeNode[];
  charName: string; charLlmDescr?: string; charVarName: string;
  addPaperdollSlot: (charId: string, slot: Omit<PaperdollSlot, 'id'>) => void;
  updatePaperdollSlot: (charId: string, slotId: string, patch: Partial<Omit<PaperdollSlot, 'id'>>) => void;
  deletePaperdollSlot: (charId: string, slotId: string) => void;
  setPaperdollConfig: (charId: string, config: PaperdollConfig | undefined) => void;
}) {
  const t = useT();
  const project = useProjectStore(s => s.project);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [genModalOpen, setGenModalOpen] = useState(false);

  const config = mode === 'edit' ? liveChar?.paperdoll : localConfig;
  const slots  = config?.slots ?? [];
  const selectedSlot = slots.find(s => s.id === selectedSlotId) ?? null;

  const [pendingSelectPos, setPendingSelectPos] = useState<{ row: number; col: number } | null>(null);
  if (pendingSelectPos) {
    const found = slots.find(s => s.row === pendingSelectPos.row && s.col === pendingSelectPos.col);
    if (found) { setSelectedSlotId(found.id); setPendingSelectPos(null); }
  }

  const handleAddSlotAt = (row: number, col: number) => {
    const label = `Slot ${row}:${col}`;
    const slotData: Omit<PaperdollSlot, 'id'> = { label, row, col };
    if (mode === 'edit' && charId) {
      addPaperdollSlot(charId, slotData);
      setPendingSelectPos({ row, col });
    } else {
      const cur = localConfig ?? emptyPaperdoll();
      const base = `slot_${row}_${col}`;
      let id = base; let n = 2;
      while (cur.slots.some(s => s.id === id)) { id = `${base}_${n++}`; }
      onLocalChange({ ...cur, slots: [...cur.slots, { ...slotData, id }] });
      setSelectedSlotId(id);
    }
  };

  const handleDeleteSlot = (slotId: string) => {
    if (mode === 'edit' && charId) deletePaperdollSlot(charId, slotId);
    else {
      const cur = localConfig ?? emptyPaperdoll();
      onLocalChange({ ...cur, slots: cur.slots.filter(s => s.id !== slotId) });
    }
    setSelectedSlotId(null);
  };

  const handleUpdateSlot = (slotId: string, patch: Partial<Omit<PaperdollSlot, 'id'>>) => {
    if (mode === 'edit' && charId) updatePaperdollSlot(charId, slotId, patch);
    else {
      const cur = localConfig ?? emptyPaperdoll();
      onLocalChange({ ...cur, slots: cur.slots.map(s => s.id === slotId ? { ...s, ...patch } : s) });
    }
  };

  const handleMoveSlot = (draggedId: string, toRow: number, toCol: number) => {
    const cur = config ?? emptyPaperdoll();
    const target  = cur.slots.find(s => s.row === toRow && s.col === toCol);
    const dragged = cur.slots.find(s => s.id === draggedId);
    if (!dragged) return;

    const updated: PaperdollSlot[] = target
      ? cur.slots.map(s => {
          if (s.id === draggedId)  return { ...s, row: target.row, col: target.col };
          if (s.id === target.id)  return { ...s, row: dragged.row, col: dragged.col };
          return s;
        })
      : cur.slots.map(s => s.id === draggedId ? { ...s, row: toRow, col: toCol } : s);

    if (mode === 'edit' && charId) {
      updated.forEach(s => {
        const orig = cur.slots.find(o => o.id === s.id);
        if (orig && (orig.row !== s.row || orig.col !== s.col)) {
          updatePaperdollSlot(charId, s.id, { row: s.row, col: s.col });
        }
      });
    } else {
      onLocalChange({ ...cur, slots: updated });
    }
  };

  const handleGridChange = (patch: Partial<Pick<PaperdollConfig, 'gridCols' | 'gridRows' | 'cellSize'>>) => {
    const cur = config ?? emptyPaperdoll();
    const next: PaperdollConfig = { ...cur, ...patch };
    if (mode === 'edit' && charId) setPaperdollConfig(charId, next);
    else onLocalChange(next);
  };

  const genSlot = genModalOpen ? selectedSlot : null;
  const genPh: SlotPlaceholderConfig | null = genSlot
    ? (genSlot.placeholder ?? { mode: 'static', src: genSlot.placeholderIcon ?? '', variableId: '', mapping: [], defaultSrc: '' })
    : null;

  return (
    <div className="flex gap-4">
      {/* Grid + grid config */}
      <div className="shrink-0 flex flex-col gap-3">
        <PaperdollGrid
          config={config}
          selectedSlotId={selectedSlotId}
          onSelectSlot={setSelectedSlotId}
          onAddSlotAt={handleAddSlotAt}
          onMoveSlot={handleMoveSlot}
        />
        <div className="flex flex-col gap-1.5">
          {([
            { key: 'gridCols' as const, label: t.characters.paperdollGridCols, def: 3 },
            { key: 'gridRows' as const, label: t.characters.paperdollGridRows, def: 4 },
            { key: 'cellSize' as const, label: t.characters.paperdollCellSize, def: 64 },
          ]).map(({ key, label, def }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-14">{label}</span>
              <NumericInput
                min={1}
                className="w-14 bg-slate-700 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 focus:border-indigo-500"
                value={config?.[key] ?? def}
                onChange={v => handleGridChange({ [key]: v })}
              />
            </div>
          ))}
        </div>
        {slots.length > 0 && (
          <p className="text-[10px] text-slate-500">
            {slots.length} slot{slots.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Slot detail */}
      <div className="flex-1 min-w-0 rounded border border-slate-700 bg-slate-800/40 p-3">
        {selectedSlot ? (
          <>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2.5">
              Slot — <span className="text-slate-300 normal-case">{selectedSlot.label}</span>
            </p>
            <SlotDetail
              slot={selectedSlot}
              items={items}
              charNodes={charNodes}
              assetNodes={project.assetNodes}
              onUpdate={patch => handleUpdateSlot(selectedSlot.id, patch)}
              onDelete={() => handleDeleteSlot(selectedSlot.id)}
              onGenerate={() => setGenModalOpen(true)}
            />
          </>
        ) : (
          <div className="h-full min-h-[260px] flex flex-col items-center justify-center gap-2 text-slate-600">
            <span className="text-3xl inline-flex"><EmojiIcon name="hamburger" size={20} /></span>
            <p className="text-xs text-center max-w-[220px]">
              {(t.characters as any).paperdollEmptyHint ?? 'Click a slot to edit it, or an empty cell to add one.'}
            </p>
          </div>
        )}
      </div>

      {/* Gen modal */}
      {genSlot && genPh && (
        <AvatarGenModal
          cfg={placeholderToAvatarConfig(genPh)}
          charVarName={`${charVarName || 'char'}_${genSlot.id}`}
          charName={charName}
          charLlmDescr={charLlmDescr}
          assetSubfolder={`paperdoll/${charVarName || 'char'}`}
          modalTitle={genSlot.label}
          slotLabelStatic={genSlot.label}
          slotLabelDefault={genSlot.label}
          entityKind="paperdoll-slot"
          onSave={updatedCfg => {
            handleUpdateSlot(genSlot.id, { placeholder: avatarConfigToPlaceholder(updatedCfg, genPh) });
            setGenModalOpen(false);
          }}
          onClose={() => setGenModalOpen(false)}
        />
      )}
    </div>
  );
}

function PaperdollGrid({
  config, selectedSlotId, onSelectSlot, onAddSlotAt, onMoveSlot,
}: {
  config: PaperdollConfig | undefined;
  selectedSlotId: string | null;
  onSelectSlot: (id: string) => void;
  onAddSlotAt: (row: number, col: number) => void;
  onMoveSlot: (draggedId: string, toRow: number, toCol: number) => void;
}) {
  const cfg = config ?? emptyPaperdoll();
  const { gridCols, gridRows, slots } = cfg;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, slotId: string) => { setDraggingId(slotId); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver  = (e: React.DragEvent, key: string) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverKey(key); };
  const handleDrop      = (e: React.DragEvent, row: number, col: number) => {
    e.preventDefault();
    setDragOverKey(null);
    if (!draggingId) return;
    const self = slots.find(s => s.id === draggingId);
    if (self && self.row === row && self.col === col) return;
    onMoveSlot(draggingId, row, col);
    setDraggingId(null);
  };
  const handleDragEnd = () => { setDraggingId(null); setDragOverKey(null); };

  return (
    <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${gridCols}, 2.5rem)` }}>
      {Array.from({ length: gridRows }, (_, r) =>
        Array.from({ length: gridCols }, (_, c) => {
          const row = r + 1, col = c + 1, key = `${row}_${col}`;
          const slot = slots.find(s => s.row === row && s.col === col);
          const selected = slot ? slot.id === selectedSlotId : false;
          const isDragging = slot ? slot.id === draggingId : false;
          const isOver = dragOverKey === key && draggingId !== null;

          if (slot) {
            return (
              <button
                key={key} type="button" title={slot.label} draggable
                onClick={() => !isDragging && onSelectSlot(slot.id)}
                onDragStart={e => handleDragStart(e, slot.id)}
                onDragEnd={handleDragEnd}
                onDragOver={e => handleDragOver(e, key)}
                onDrop={e => handleDrop(e, row, col)}
                className={`w-10 h-10 rounded flex items-center justify-center text-[9px] text-center leading-tight p-0.5 border transition-colors cursor-grab active:cursor-grabbing select-none ${
                  isDragging
                    ? 'opacity-40 border-dashed border-indigo-500 bg-indigo-900/30'
                    : isOver
                      ? 'bg-indigo-500/40 border-indigo-400 text-white scale-105'
                      : selected
                        ? 'bg-indigo-600 border-indigo-400 text-white'
                        : 'bg-indigo-900/50 border-indigo-600/50 text-indigo-300 hover:bg-indigo-700/60 hover:border-indigo-400'
                }`}
              >
                <span className="truncate w-full text-center">{slot.label}</span>
              </button>
            );
          }

          return (
            <button
              key={key} type="button"
              title={draggingId ? `Move here (${row}:${col})` : `Add slot at ${row}:${col}`}
              onClick={() => !draggingId && onAddSlotAt(row, col)}
              onDragOver={e => handleDragOver(e, key)}
              onDrop={e => handleDrop(e, row, col)}
              onDragLeave={() => setDragOverKey(null)}
              className={`w-10 h-10 rounded flex items-center justify-center border transition-colors cursor-pointer text-base ${
                isOver
                  ? 'border-indigo-500 bg-indigo-900/40 text-indigo-400'
                  : 'border-dashed border-slate-700 text-slate-700 hover:border-indigo-600 hover:text-indigo-500'
              }`}
            >
              {isOver ? '↓' : '+'}
            </button>
          );
        })
      )}
    </div>
  );
}

function SlotDetail({
  slot, items, charNodes, assetNodes, onUpdate, onDelete, onGenerate,
}: {
  slot: PaperdollSlot;
  items: ItemDefinition[];
  charNodes: VariableTreeNode[];
  assetNodes: AssetTreeNode[];
  onUpdate: (patch: Partial<Omit<PaperdollSlot, 'id'>>) => void;
  onDelete: () => void;
  onGenerate: () => void;
}) {
  const t = useT();
  const ph: SlotPlaceholderConfig = slot.placeholder ?? {
    mode: 'static', src: slot.placeholderIcon ?? '', variableId: '', mapping: [], defaultSrc: '',
  };
  const setPh = (patch: Partial<SlotPlaceholderConfig>) =>
    onUpdate({ placeholder: { ...ph, ...patch } });

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* Label */}
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <label className="text-[10px] text-slate-500">Label</label>
        <input
          type="text"
          placeholder={t.characters.paperdollSlotLabel}
          className={INPUT_CLS}
          value={slot.label}
          onChange={e => onUpdate({ label: e.target.value })}
        />
      </div>

      {/* Position row/col */}
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <label className="text-[10px] text-slate-500">Position</label>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{t.characters.paperdollRowLabel}</span>
          <NumericInput
            min={1}
            className={INPUT_CLS + ' w-14'}
            value={slot.row}
            onChange={v => onUpdate({ row: v })}
          />
          <span className="text-[10px] text-slate-500">{t.characters.paperdollColLabel}</span>
          <NumericInput
            min={1}
            className={INPUT_CLS + ' w-14'}
            value={slot.col}
            onChange={v => onUpdate({ col: v })}
          />
        </div>
      </div>

      {/* ID */}
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <label className="text-[10px] text-slate-500">ID</label>
        <code className="text-[10px] text-slate-500 font-mono">{slot.id}</code>
      </div>

      <div className="h-px bg-slate-700/70" />

      {/* Default item */}
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <label className="text-[10px] text-slate-500">{t.characters.paperdollDefaultItem}</label>
        <select
          className={INPUT_CLS + ' cursor-pointer'}
          value={slot.defaultItemVarName ?? ''}
          onChange={e => onUpdate({ defaultItemVarName: e.target.value || undefined })}
        >
          <option value="">{t.characters.paperdollDefaultItemNone}</option>
          {items.filter(i => {
            if (i.category !== 'wearable') return false;
            const norm = (s: string) => (s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            return norm(i.targetSlot ?? '') === slot.id ||
              (i.targetSlot ?? '').toLowerCase() === (slot.label ?? '').toLowerCase();
          }).map(it => (
            <option key={it.id} value={it.varName}>{it.name}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 cursor-pointer ml-[72px]">
        <input type="checkbox" className="accent-indigo-500"
          checked={slot.clickable ?? false}
          onChange={e => onUpdate({ clickable: e.target.checked })}
        />
        <span className="text-xs text-slate-400">{t.characters.paperdollSlotClickable}</span>
      </label>

      <div className="h-px bg-slate-700/70" />

      {/* Placeholder */}
      <div className="grid grid-cols-[64px_1fr] items-start gap-2">
        <label className="text-[10px] text-slate-500 pt-1">{t.characters.paperdollPlaceholderIcon}</label>
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex gap-1.5 flex-wrap">
            <ModeBtnSmall active={ph.mode === 'static'} onClick={() => setPh({ mode: 'static' })}>
              {t.characters.paperdollPlaceholderStatic}
            </ModeBtnSmall>
            <ModeBtnSmall active={ph.mode === 'bound'}  onClick={() => setPh({ mode: 'bound' })}>
              {t.characters.paperdollPlaceholderBound}
            </ModeBtnSmall>
            <button
              type="button"
              onClick={onGenerate}
              className="text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer bg-slate-700 border-slate-600 text-slate-300 hover:text-indigo-200 hover:border-indigo-500 flex items-center gap-1"
            >
              <EmojiIcon name="sparkle" size={10} /> {t.avatarGen?.generateBtn ?? 'Generate'}
            </button>
          </div>

          {ph.mode === 'static' && (
            <ImageAssetPicker
              assetNodes={assetNodes}
              value={ph.src}
              onChange={src => setPh({ src })}
            />
          )}
          {ph.mode === 'bound' && (
            <div className="flex flex-col gap-1.5">
              <VariablePicker
                value={ph.variableId}
                onChange={variableId => setPh({ variableId })}
                nodes={charNodes}
                placeholder={t.characters.paperdollPlaceholderSelectVar}
              />
              <ImageMappingEditor
                mapping={ph.mapping}
                onChange={mapping => setPh({ mapping })}
                defaultSrc={ph.defaultSrc}
                onDefaultSrcChange={defaultSrc => setPh({ defaultSrc })}
                assetNodes={assetNodes}
                hideDefault
              />
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-slate-700/70" />

      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-slate-500 hover:text-red-400 transition-colors cursor-pointer text-left self-start"
      >
        <span className="inline-flex items-center gap-1"><EmojiIcon name="close" size={20} /> {(t.characters as any).paperdollDeleteSlot ?? 'Delete slot'}</span>
      </button>
    </div>
  );
}

function ModeBtnSmall({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
        active ? 'bg-indigo-600 border-indigo-500 text-white'
               : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
