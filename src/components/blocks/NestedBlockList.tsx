// ─── Shared nested block list (drag-to-nest aware) ─────────────────────────────
//
// One reusable list for every block CONTAINER (condition branch / tab / section /
// for-body / dialogue bubble). It renders:
//   • a SortableContext bound to the AMBIENT scene DndContext (SceneEditor owns the
//     single context — this component never creates its own),
//   • a droppable wrapper so even an EMPTY container accepts a drop,
//   • each nested block with a drag handle + copy/dup/delete + its InnerBlockEditor,
//   • the AddBlockMenu (excludeTypes derived from the container kind) + paste button.
//
// Drag REORDER and cross-container MOVE are NOT handled here — SceneEditor's central
// onDragEnd resolves the drop and calls projectStore.moveBlockToContainer by id.
// The callbacks below cover the non-drag operations (add / edit / delete / dup / paste),
// letting each container keep its own store-vs-local wiring + snapshot semantics.

import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import type { Block } from '../../types';
import {
  type ContainerKind, type BlockDragData, type ContainerDropData,
  excludedTypesFor, containerDropId,
} from '../../utils/blockTree';
import { useT, blockTypeLabel } from '../../i18n';
import { useEditorStore } from '../../store/editorStore';
import { EmojiIcon } from '../shared/EmojiIcons';
import { AddBlockMenu } from './AddBlockMenu';
import { InnerBlockEditor } from './InnerBlockEditor';

type NestedKind = Exclude<ContainerKind, 'scene'>;

function SortableNested({
  block, sceneId, containerId, containerKind, index,
  onUpdate, onCopy, onDuplicate, onDelete,
}: {
  block: Block;
  sceneId: string;
  containerId: string;
  containerKind: ContainerKind;
  index: number;
  onUpdate: (patch: Partial<Block>) => void;
  onCopy?: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const data: BlockDragData = { type: 'block', containerId, containerKind, index, blockType: block.type };
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: block.id, data });
  // No sortable reorder transform in the scene tree — a shifting (tall) block "runs
  // away" from the pointer, blocking drag-to-nest. List stays static; DragOverlay +
  // container highlight show the drop target instead.
  const style = { opacity: isDragging ? 0.4 : 1 };

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
          {onCopy && (
            <button className="text-slate-600 hover:text-slate-300 text-xs cursor-pointer px-0.5 transition-colors" title={t.block.copy} onClick={onCopy}>
              <EmojiIcon name="clipboard" size={20} />
            </button>
          )}
          {onDuplicate && (
            <button className="text-slate-600 hover:text-indigo-400 text-xs cursor-pointer px-0.5 transition-colors" title={t.block.duplicate} onClick={onDuplicate}>⧉</button>
          )}
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

export function NestedBlockList({
  sceneId, containerId, containerKind, blocks,
  onAdd, onUpdate, onDelete, onDuplicate, onCopy, onPaste,
  emptyLabel,
}: {
  sceneId: string;
  containerId: string;
  containerKind: NestedKind;
  blocks: Block[];
  onAdd: (block: Block) => void;
  onUpdate: (id: string, patch: Partial<Block>) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onCopy?: (block: Block) => void;
  onPaste?: (block: Block) => void;
  emptyLabel?: string;
}) {
  const t = useT();
  const clipboardBlock = useEditorStore(s => s.clipboardBlock);
  const dropData: ContainerDropData = { type: 'container', containerId, containerKind };
  const { setNodeRef, isOver } = useDroppable({ id: containerDropId(containerId), data: dropData });

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-1.5 rounded transition-colors ${blocks.length > 0 && isOver ? 'ring-1 ring-inset ring-indigo-500/50 bg-indigo-500/5' : ''}`}
      >
        {blocks.length === 0 ? (
          // Roomy dashed drop zone — an empty container is otherwise a tiny target.
          <div
            className={`flex items-center justify-center text-center text-xs rounded border border-dashed px-2 py-3 select-none transition-colors ${
              isOver
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                : 'border-slate-700/70 text-slate-600'
            }`}
          >
            {isOver ? t.block.dropHere : (emptyLabel ?? t.block.dropZone)}
          </div>
        ) : (
          <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            {blocks.map((b, i) => (
              <SortableNested
                key={b.id}
                block={b}
                sceneId={sceneId}
                containerId={containerId}
                containerKind={containerKind}
                index={i}
                onUpdate={patch => onUpdate(b.id, patch)}
                onCopy={onCopy ? () => onCopy(b) : undefined}
                onDuplicate={onDuplicate ? () => onDuplicate(b.id) : undefined}
                onDelete={() => onDelete(b.id)}
              />
            ))}
          </SortableContext>
        )}
      </div>

      <AddBlockMenu
        sceneId={sceneId}
        excludeTypes={excludedTypesFor(containerKind)}
        onAdd={onAdd}
      />

      {onPaste && clipboardBlock && (
        <button
          className="text-xs text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/50 rounded px-2 py-1 transition-colors cursor-pointer text-left border border-dashed border-indigo-800/50"
          title={t.block.paste(blockTypeLabel(t, clipboardBlock.type))}
          onClick={() => onPaste(clipboardBlock)}
        >
          {t.block.paste(blockTypeLabel(t, clipboardBlock.type))}
        </button>
      )}
    </div>
  );
}
