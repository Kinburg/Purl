import { useRef } from 'react';
import { useProjectStore, deepCloneBlock } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useT } from '../../i18n';
import { VarInsertButton } from '../shared/VarInsertButton';
import { useFlatVariablesOf } from '../../hooks/useFlatVariables';
import { useVariableNodes } from '../shared/VariableScope';
import type { SectionBlock, Block } from '../../types';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { NestedBlockList } from './NestedBlockList';

// The nested-block list (drag, add, edit, delete, duplicate) lives in the shared
// NestedBlockList; drag REORDER/MOVE is handled by SceneEditor's single DndContext.

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
      <div className="pl-2 border-l-2 border-slate-700/60">
        <NestedBlockList
          sceneId={sceneId}
          containerId={block.id}
          containerKind="section"
          blocks={block.blocks}
          onAdd={handleAdd}
          onUpdate={handleUpdateNested}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onCopy={handleCopy}
          emptyLabel={sb.empty}
        />
      </div>

      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => update({ delay: v })}
      />
    </div>
  );
}
