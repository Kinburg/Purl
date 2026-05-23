import { useRef } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProjectStore, deepCloneBlock } from '../../store/projectStore';
import { useFlatVariablesOf } from '../../hooks/useFlatVariables';
import { useEditorStore } from '../../store/editorStore';
import { useT, blockTypeLabel } from '../../i18n';
import { useVariableNodes } from '../shared/VariableScope';
import { VarInsertButton } from '../shared/VarInsertButton';
import { EmojiIcon } from '../shared/EmojiIcons';
import type {
  ForBlock, ForLoopMode, Block, ConditionBlock, TextBlock, DialogueBlock,
  ChoiceBlock, VariableSetBlock, SetObjectBlock, ImageBlock, VideoBlock,
  RawBlock, TableBlock, IncludeBlock, DividerBlock,
} from '../../types';
import { AddBlockMenu } from './AddBlockMenu';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { TextBlockEditor } from './TextBlockEditor';
import { DialogueBlockEditor } from './DialogueBlockEditor';
import { ChoiceBlockEditor } from './ChoiceBlockEditor';
import { VariableSetBlockEditor } from './VariableSetBlockEditor';
import { SetObjectBlockEditor } from './SetObjectBlockEditor';
import { ImageBlockEditor } from './ImageBlockEditor';
import { VideoBlockEditor } from './VideoBlockEditor';
import { RawBlockEditor } from './RawBlockEditor';
import { TableBlockEditor } from './TableBlockEditor';
import { IncludeBlockEditor } from './IncludeBlockEditor';
import { DividerBlockEditor } from './DividerBlockEditor';
import { ConditionBlockEditor } from './ConditionBlockEditor';

const MODES: { value: ForLoopMode; label: string; desc: string }[] = [
  { value: 'range',  label: 'range',  desc: 'for each item in collection' },
  { value: 'while',  label: 'while',  desc: 'while condition is true' },
  { value: 'cstyle', label: 'C-style', desc: 'init; condition; step' },
];

function uid(): string { return crypto.randomUUID(); }

// ─── Body block dispatcher (recursive — supports nested condition / for) ────

function NestedBody({
  block,
  sceneId,
  onUpdate,
}: {
  block: Block;
  sceneId: string;
  onUpdate: (patch: Partial<Block>) => void;
}) {
  const t = useT();
  switch (block.type) {
    case 'text':         return <TextBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<TextBlock>) => void} />;
    case 'dialogue':     return <DialogueBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<DialogueBlock>) => void} />;
    case 'choice':       return <ChoiceBlockEditor       block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ChoiceBlock>) => void} />;
    case 'variable-set': return <VariableSetBlockEditor  block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<VariableSetBlock>) => void} />;
    case 'set-object':   return <SetObjectBlockEditor    block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SetObjectBlock>) => void} />;
    case 'image':        return <ImageBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ImageBlock>) => void} />;
    case 'video':        return <VideoBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<VideoBlock>) => void} />;
    case 'raw':          return <RawBlockEditor          block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<RawBlock>) => void} />;
    case 'table':        return <TableBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<TableBlock>) => void} />;
    case 'include':      return <IncludeBlockEditor      block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<IncludeBlock>) => void} />;
    case 'divider':      return <DividerBlockEditor      block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<DividerBlock>) => void} />;
    case 'condition':    return <ConditionBlockEditor    block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ConditionBlock>) => void} />;
    case 'for':          return <ForBlockEditor          block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ForBlock>) => void} />;
    default:             return <span className="text-xs text-slate-500">{t.block.unsupportedNested}</span>;
  }
}

// ─── Sortable wrapper around a body block ────────────────────────────────────

function SortableBody({
  block, sceneId, onUpdate, onDuplicate, onCopy, onDelete,
}: {
  block: Block;
  sceneId: string;
  onUpdate: (patch: Partial<Block>) => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

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
        <NestedBody block={block} sceneId={sceneId} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

// ─── Source input — text with $ variable-picker button ──────────────────────

function SourceInput({
  value, onChange, onFocus, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const variableNodes = useVariableNodes();
  const variables = useFlatVariablesOf(variableNodes);
  return (
    <div className="flex-1 flex items-center gap-1 min-w-0">
      <input
        ref={ref}
        className="flex-1 min-w-0 bg-slate-800 text-xs text-white font-mono rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
        value={value}
        onFocus={onFocus}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <VarInsertButton
        targetRef={ref}
        value={value}
        onChange={onChange}
        vars={variables}
        variableNodes={variableNodes}
      />
    </div>
  );
}

// ─── Main editor ─────────────────────────────────────────────────────────────

export function ForBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: ForBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<ForBlock>) => void;
}) {
  const updateBlock     = useProjectStore(s => s.updateBlock);
  const saveSnapshot    = useProjectStore(s => s.saveSnapshot);
  const clipboardBlock  = useEditorStore(s => s.clipboardBlock);
  const copyToClipboard = useEditorStore(s => s.copyToClipboard);
  const t = useT();

  const update = onUpdate ?? ((p: Partial<ForBlock>) => updateBlock(sceneId, block.id, p as never));
  const setBlocks = (blocks: Block[]) => update({ blocks });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── body mutations ──────────────────────────────────────────────────────
  const addBlock = (b: Block) => setBlocks([...block.blocks, b]);
  const updateBodyBlock = (id: string, patch: Partial<Block>) =>
    setBlocks(block.blocks.map(b => b.id === id ? ({ ...b, ...patch } as Block) : b));
  const deleteBodyBlock = (id: string) => setBlocks(block.blocks.filter(b => b.id !== id));
  const duplicateBodyBlock = (id: string) => {
    const idx = block.blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    const next = [...block.blocks];
    next.splice(idx + 1, 0, deepCloneBlock(block.blocks[idx]));
    setBlocks(next);
  };
  const pasteBodyBlock = (src: Block) => setBlocks([...block.blocks, deepCloneBlock(src)]);
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = block.blocks.findIndex(b => b.id === active.id);
    const newIdx = block.blocks.findIndex(b => b.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    setBlocks(arrayMove(block.blocks, oldIdx, newIdx));
  };

  // ── mode change keeps other-mode fields intact, only seeds defaults ──
  // Switching range → while → range should restore the original key/value/source,
  // so we never clobber the previous mode's data. Inactive fields cost nothing
  // — the export only reads the active mode's fields.
  const changeMode = (mode: ForLoopMode) => {
    const patch: Partial<ForBlock> = { mode };
    if (mode === 'range' && !block.valueVar) patch.valueVar = '_item';
    if (mode === 'cstyle') {
      if (!block.initExpr)        patch.initExpr = '_i to 0';
      if (!block.cstyleCondition) patch.cstyleCondition = '_i lt 10';
      if (!block.stepExpr)        patch.stepExpr = '_i++';
    }
    update(patch);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Mode selector */}
      <div className="flex items-center gap-1 bg-slate-900/40 rounded p-1 border border-slate-700/60">
        {MODES.map(m => (
          <button
            key={m.value}
            className={`flex-1 text-xs px-2 py-1 rounded transition-colors cursor-pointer font-mono ${
              block.mode === m.value
                ? 'bg-amber-800/50 text-amber-200 border border-amber-600/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={m.desc}
            onClick={() => changeMode(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Mode-specific fields */}
      {block.mode === 'range' && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-amber-300 shrink-0 font-mono">&lt;&lt;for</span>
          <input
            className="w-20 bg-slate-800 text-xs text-white font-mono rounded px-1.5 py-1 outline-none border border-slate-600 focus:border-indigo-500"
            placeholder="_key"
            value={block.keyVar ?? ''}
            onFocus={saveSnapshot}
            onChange={e => update({ keyVar: e.target.value || undefined })}
          />
          <span className="text-xs text-slate-500 shrink-0">,</span>
          <input
            className="w-20 bg-slate-800 text-xs text-white font-mono rounded px-1.5 py-1 outline-none border border-slate-600 focus:border-indigo-500"
            placeholder="_value"
            value={block.valueVar ?? ''}
            onFocus={saveSnapshot}
            onChange={e => update({ valueVar: e.target.value })}
          />
          <span className="text-xs text-amber-300 shrink-0 font-mono">range</span>
          <SourceInput
            value={block.source ?? ''}
            onChange={v => update({ source: v })}
            onFocus={saveSnapshot}
            placeholder="$collection"
          />
          <span className="text-xs text-amber-300 shrink-0 font-mono">&gt;&gt;</span>
        </div>
      )}

      {block.mode === 'while' && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-amber-300 shrink-0 font-mono">&lt;&lt;for</span>
          <SourceInput
            value={block.whileCondition ?? ''}
            onChange={v => update({ whileCondition: v })}
            onFocus={saveSnapshot}
            placeholder="$counter < 10"
          />
          <span className="text-xs text-amber-300 shrink-0 font-mono">&gt;&gt;</span>
        </div>
      )}

      {block.mode === 'cstyle' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0 w-12 font-mono text-right">init:</span>
            <SourceInput
              value={block.initExpr ?? ''}
              onChange={v => update({ initExpr: v })}
              onFocus={saveSnapshot}
              placeholder="_i to 0"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0 w-12 font-mono text-right">cond:</span>
            <SourceInput
              value={block.cstyleCondition ?? ''}
              onChange={v => update({ cstyleCondition: v })}
              onFocus={saveSnapshot}
              placeholder="_i lt 10"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0 w-12 font-mono text-right">step:</span>
            <SourceInput
              value={block.stepExpr ?? ''}
              onChange={v => update({ stepExpr: v })}
              onFocus={saveSnapshot}
              placeholder="_i++"
            />
          </div>
        </div>
      )}

      {/* Body */}
      <div className="border border-amber-800/40 rounded p-2 flex flex-col gap-1.5 bg-slate-900/20">
        <div className="text-[10px] text-amber-300/60 uppercase tracking-wider px-1">{t.forBlock.bodyLabel}</div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={block.blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            {block.blocks.map(b => (
              <SortableBody
                key={b.id}
                block={b}
                sceneId={sceneId}
                onUpdate={(patch) => updateBodyBlock(b.id, patch)}
                onDuplicate={() => duplicateBodyBlock(b.id)}
                onCopy={() => copyToClipboard(b)}
                onDelete={() => deleteBodyBlock(b.id)}
              />
            ))}
          </SortableContext>
        </DndContext>

        <AddBlockMenu
          sceneId={sceneId}
          excludeTypes={['note']}
          onAdd={addBlock}
        />

        {clipboardBlock && (
          <button
            className="text-xs text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/50 rounded px-2 py-1 transition-colors cursor-pointer text-left border border-dashed border-indigo-800/50"
            title={t.block.paste(blockTypeLabel(t, clipboardBlock.type))}
            onClick={() => pasteBodyBlock(clipboardBlock)}
          >
            {t.block.paste(blockTypeLabel(t, clipboardBlock.type))}
          </button>
        )}
      </div>

      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => update({ delay: v })}
      />
    </div>
  );
}

// Unused but satisfies the import for `uid` if needed elsewhere later.
export const _internal = { uid };
