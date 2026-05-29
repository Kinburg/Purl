import { useRef } from 'react';
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
import { useProjectStore, deepCloneBlock } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useT, blockTypeLabel } from '../../i18n';
import { EmojiIcon } from '../shared/EmojiIcons';
import { VarInsertButton } from '../shared/VarInsertButton';
import { useFlatVariablesOf } from '../../hooks/useFlatVariables';
import { useVariableNodes } from '../shared/VariableScope';
import type { SectionBlock, Block } from '../../types';
import { AddBlockMenu } from './AddBlockMenu';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { InnerBlockEditor } from './TabsBlockEditor';

// ── Sortable wrapper for a nested block ─────────────────────────────────────

function SortableSectionBlock({
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

// ── Main editor ─────────────────────────────────────────────────────────────

export function SectionBlockEditor({
  block, sceneId, onUpdate,
}: {
  block: SectionBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<SectionBlock>) => void;
}) {
  const t = useT();
  const sb = t.sectionBlock;
  const updateBlock    = useProjectStore(s => s.updateBlock);
  const saveSnapshot   = useProjectStore(s => s.saveSnapshot);
  const copyToClipboard = useEditorStore(s => s.copyToClipboard);
  const variableNodes  = useVariableNodes();
  const variables      = useFlatVariablesOf(variableNodes);
  const update = onUpdate ?? ((p: Partial<SectionBlock>) => updateBlock(sceneId, block.id, p));
  const titleRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const setBlocks = (blocks: Block[]) => update({ blocks });

  const handleAdd = (nb: Block) => { saveSnapshot(); setBlocks([...block.blocks, nb]); };
  const handleUpdateNested = (id: string, p: Partial<Block>) =>
    setBlocks(block.blocks.map(b => b.id === id ? { ...b, ...p } as Block : b));
  const handleDelete = (id: string) => { saveSnapshot(); setBlocks(block.blocks.filter(b => b.id !== id)); };
  const handleDuplicate = (id: string) => {
    const idx = block.blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    saveSnapshot();
    const dup = deepCloneBlock(block.blocks[idx]);
    const next = [...block.blocks];
    next.splice(idx + 1, 0, dup);
    setBlocks(next);
  };
  const handleCopy = (b: Block) => copyToClipboard(deepCloneBlock(b));
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = block.blocks.findIndex(b => b.id === active.id);
    const newIdx = block.blocks.findIndex(b => b.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    saveSnapshot();
    setBlocks(arrayMove(block.blocks, oldIdx, newIdx));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Title + collapsible */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{sb.titleLabel}</label>
        <input
          ref={titleRef}
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none"
          placeholder={sb.titlePlaceholder}
          value={block.title ?? ''}
          onFocus={saveSnapshot}
          onChange={e => update({ title: e.target.value })}
        />
        <VarInsertButton
          targetRef={titleRef}
          value={block.title ?? ''}
          onChange={title => update({ title })}
          vars={variables}
          variableNodes={variableNodes}
        />
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={!!block.collapsible}
            onChange={e => update({ collapsible: e.target.checked || undefined })}
            className="accent-indigo-500" />
          <span className="text-xs text-slate-300">{sb.collapsible}</span>
        </label>
        {block.collapsible && (
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={!!block.defaultCollapsed}
              onChange={e => update({ defaultCollapsed: e.target.checked || undefined })}
              className="accent-indigo-500" />
            <span className="text-xs text-slate-300">{sb.startCollapsed}</span>
          </label>
        )}
      </div>

      {/* Nested block list */}
      <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-slate-700/60">
        {block.blocks.length === 0 && (
          <div className="text-xs text-slate-500 italic px-1">{sb.empty}</div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={block.blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-1.5">
              {block.blocks.map(b => (
                <SortableSectionBlock
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

      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => update({ delay: v })}
      />
    </div>
  );
}
