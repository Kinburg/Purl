import { Fragment, useCallback, useMemo, useState } from 'react';
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
  arrayMove,
} from '@dnd-kit/sortable';
import { BlockItem } from '../blocks/BlockItem';
import { InsertZone } from '../blocks/InsertZone';
import { VariableScopeProvider } from '../shared/VariableScope';
import { useT } from '../../i18n';
import { useProjectStore } from '../../store/projectStore';
import { paramsToVirtualNodes } from '../../utils/pluginParamScope';
import type { Block, BlockType, ConditionBlock, DialogueBlock, PluginParam } from '../../types';

/** Sentinel scene id for blocks that live outside any scene (inside a plugin body).
 *  Editors that still read `sceneId` use it only for filter predicates — this value
 *  never matches a real scene id, so filters like `s => s.id !== sceneId` keep all
 *  project scenes visible. */
const PLUGIN_SCENE_ID = '__plugin_body__';

/** Block types excluded from the plugin body picker.
 *  Plugin-in-plugin is technically supported by the exporter but excluded from the
 *  UI for now to avoid accidental recursion loops. */
const EXCLUDED_TYPES: BlockType[] = ['plugin'];

/** Recursively regenerate ids on a block and any nested blocks.
 *  Needed for duplicate/paste to keep ids unique across condition branches
 *  and dialogue inner blocks. */
function cloneBlockWithNewIds(block: Block): Block {
  const copy: Block = JSON.parse(JSON.stringify(block));
  const rewrite = (b: Block) => {
    b.id = crypto.randomUUID();
    if (b.type === 'condition') {
      for (const branch of (b as ConditionBlock).branches) {
        for (const child of branch.blocks) rewrite(child);
      }
    } else if (b.type === 'dialogue' && (b as DialogueBlock).innerBlocks?.length) {
      for (const child of (b as DialogueBlock).innerBlocks!) rewrite(child);
    }
  };
  rewrite(copy);
  return copy;
}

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  /** Plugin parameters exposed as virtual variables inside this body. */
  params: PluginParam[];
  /** Controlled collapsed state — when omitted, the editor manages its own. */
  collapsed?: Set<string>;
  onCollapsedChange?: (next: Set<string>) => void;
}

export function PluginBodyEditor({ blocks, onChange, params, collapsed: collapsedProp, onCollapsedChange }: Props) {
  const t = useT();
  const project = useProjectStore(s => s.project);
  const virtualNodes = useMemo(
    () => paramsToVirtualNodes(params, project.variableNodes),
    [params, project.variableNodes],
  );
  const [internalCollapsed, setInternalCollapsed] = useState<Set<string>>(new Set());
  const collapsed = collapsedProp ?? internalCollapsed;
  const setCollapsed = onCollapsedChange ?? setInternalCollapsed;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const toggleBlock = useCallback((blockId: string) => {
    const next = new Set(collapsed);
    if (next.has(blockId)) next.delete(blockId); else next.add(blockId);
    setCollapsed(next);
  }, [collapsed, setCollapsed]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex(b => b.id === active.id);
    const newIndex = blocks.findIndex(b => b.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onChange(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const updateAt = (index: number, patch: Partial<Block>) => {
    onChange(blocks.map((b, i) => i === index ? ({ ...b, ...patch } as Block) : b));
  };
  const deleteAt = (index: number) => {
    onChange(blocks.filter((_, i) => i !== index));
  };
  const duplicateAt = (index: number) => {
    const copy = cloneBlockWithNewIds(blocks[index]);
    const next = [...blocks];
    next.splice(index + 1, 0, copy);
    onChange(next);
  };
  const insertAt = (block: Block, insertIndex: number) => {
    const next = [...blocks];
    next.splice(insertIndex, 0, block);
    onChange(next);
  };
  const pasteAt = (block: Block, insertIndex: number) => {
    insertAt(cloneBlockWithNewIds(block), insertIndex);
  };

  if (blocks.length === 0) {
    return (
      <VariableScopeProvider nodes={virtualNodes} params={params}>
        <div className="flex flex-col gap-1">
          <div className="text-slate-600 text-xs text-center py-4 border border-dashed border-slate-700 rounded">
            {t.scene.empty}
          </div>
          <InsertZone
            sceneId={PLUGIN_SCENE_ID}
            insertIndex={0}
            isLast
            onAdd={insertAt}
            onPaste={pasteAt}
            excludeTypes={EXCLUDED_TYPES}
          />
        </div>
      </VariableScopeProvider>
    );
  }

  return (
    <VariableScopeProvider nodes={virtualNodes} params={params}>
    <div className="flex flex-col gap-0">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
          <InsertZone
            sceneId={PLUGIN_SCENE_ID}
            insertIndex={0}
            onAdd={insertAt}
            onPaste={pasteAt}
            excludeTypes={EXCLUDED_TYPES}
          />
          {blocks.map((block, i) => (
            <Fragment key={block.id}>
              <BlockItem
                block={block}
                sceneId={PLUGIN_SCENE_ID}
                collapsed={collapsed.has(block.id)}
                onToggleCollapse={() => toggleBlock(block.id)}
                onUpdate={patch => updateAt(i, patch)}
                onDelete={() => deleteAt(i)}
                onDuplicate={() => duplicateAt(i)}
              />
              <InsertZone
                sceneId={PLUGIN_SCENE_ID}
                insertIndex={i + 1}
                isLast={i === blocks.length - 1}
                onAdd={insertAt}
                onPaste={pasteAt}
                excludeTypes={EXCLUDED_TYPES}
              />
            </Fragment>
          ))}
        </SortableContext>
      </DndContext>
    </div>
    </VariableScopeProvider>
  );
}
