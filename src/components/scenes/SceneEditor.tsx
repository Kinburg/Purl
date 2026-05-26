import { Fragment, useCallback, useState } from 'react';
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
import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import { BlockItem } from '../blocks/BlockItem';
import { InsertZone } from '../blocks/InsertZone';
import { SceneModal } from './SceneModal';
import { SYSTEM_TAGS, SYSTEM_TAG_COLORS, START_TAG, START_TAG_COLOR } from '../../types';
import type { Block, SystemTag } from '../../types';

import { EmojiIcon } from '../shared/EmojiIcons';
export function SceneEditor() {
  // Subscribe to the active scene via a derived selector: re-renders only when
  // the active scene's reference actually changes (immutable updates preserve
  // refs for unrelated scenes, so typing in another scene won't trigger this).
  const scene            = useProjectStore(s => s.project.scenes.find(sc => sc.id === s.activeSceneId));
  const projectScenes    = useProjectStore(s => s.project.scenes);
  const reorderBlocks    = useProjectStore(s => s.reorderBlocks);
  const updateSceneSettings = useProjectStore(s => s.updateSceneSettings);
  const t = useT();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());

  const toggleBlock = useCallback((blockId: string) => {
    setCollapsedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId); else next.add(blockId);
      return next;
    });
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  if (!scene) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
        {t.scene.selectPrompt}
      </div>
    );
  }

  const allCollapsed = scene.blocks.length > 0 && scene.blocks.every((b: Block) => collapsedBlocks.has(b.id));

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsedBlocks(new Set());
    } else {
      setCollapsedBlocks(new Set(scene.blocks.map((b: Block) => b.id)));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = scene.blocks.findIndex((b: Block) => b.id === active.id);
    const newIndex = scene.blocks.findIndex((b: Block) => b.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderBlocks(scene.id, arrayMove(scene.blocks, oldIndex, newIndex));
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {settingsOpen && (
        <SceneModal
          mode="edit"
          initial={{ name: scene.name, tags: scene.tags, notes: scene.notes, background: scene.background, systemConfig: scene.systemConfig }}
          takenNames={projectScenes.filter(s => s.id !== scene.id).map(s => s.name)}
          sceneId={scene.id}
          onSave={data => updateSceneSettings(scene.id, data)}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Scene header */}
      <div className="scene-header px-4 bg-slate-800/50 border-b border-slate-700 flex items-center gap-3 shrink-0 h-9">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{t.scene.label}</span>
          <span className="text-sm font-semibold text-white">{scene.name}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-xs text-slate-400 shrink-0">{t.scene.tags}</span>
          <div className="flex flex-wrap gap-1 min-w-0">
            {scene.tags.length > 0
              ? scene.tags.map(tag => {
                  const isSystem = (SYSTEM_TAGS as readonly string[]).includes(tag);
                  const isStart = tag === START_TAG;
                  const color = isStart ? START_TAG_COLOR : isSystem ? SYSTEM_TAG_COLORS[tag as SystemTag] : undefined;
                  return (
                    <span
                      key={tag}
                      className="inline-block rounded px-1.5 py-0.5 text-xs"
                      style={color
                        ? { background: color + '33', border: `1px solid ${color}`, color: color }
                        : { background: 'rgb(51 65 85)', color: 'rgb(203 213 225)' }
                      }
                    >
                      {tag}
                    </span>
                  );
                })
              : <span className="text-slate-600 italic text-xs">{t.scene.noTags}</span>
            }
          </div>
          <button
            className="text-slate-500 hover:text-indigo-300 transition-colors cursor-pointer text-sm shrink-0 ml-1"
            title={t.scene.editTagsTitle}
            onClick={() => setSettingsOpen(true)}
          >
            <EmojiIcon name="cog" size={20} />
          </button>
          {scene.blocks.length > 0 && (
            <button
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-slate-300 bg-slate-700/50 hover:bg-slate-700 hover:text-white border border-slate-600/60 hover:border-slate-500 transition-colors cursor-pointer shrink-0 ml-1"
              title={allCollapsed ? t.scene.expandAll : t.scene.collapseAll}
              onClick={toggleAll}
            >
              {allCollapsed ? (
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m7 15 5 5 5-5"/>
                  <path d="m7 9 5-5 5 5"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m7 20 5-5 5 5"/>
                  <path d="m7 4 5 5 5-5"/>
                </svg>
              )}
              <span>{allCollapsed ? t.scene.expandAll : t.scene.collapseAll}</span>
            </button>
          )}
        </div>
      </div>

      {/* Blocks */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <div className="absolute inset-0 overflow-y-auto">
          <div className="blocks-container px-4 py-3 flex flex-col gap-0">
            {scene.blocks.length > 0 ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={scene.blocks.map((b: Block) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <InsertZone sceneId={scene.id} insertIndex={0} />
                  {scene.blocks.map((block: Block, i: number) => (
                    <Fragment key={block.id}>
                      <BlockItem
                        block={block}
                        sceneId={scene.id}
                        collapsed={collapsedBlocks.has(block.id)}
                        onToggleCollapse={() => toggleBlock(block.id)}
                      />
                      <InsertZone
                        sceneId={scene.id}
                        insertIndex={i + 1}
                        isLast={i === scene.blocks.length - 1}
                      />
                    </Fragment>
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              <>
                <div className="text-slate-600 text-sm text-center py-8">
                  {t.scene.empty}
                </div>
                <InsertZone sceneId={scene.id} insertIndex={0} isLast />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
