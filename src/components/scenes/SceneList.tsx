import { useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProjectStore, flattenVariables } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { sceneMatchesQuery } from '../../utils/searchUtils';
import { useT } from '../../i18n';
import { SYSTEM_TAGS, SYSTEM_TAG_COLORS, START_TAG, START_TAG_COLOR } from '../../types';
import type { Scene, SceneGroup, SystemTag } from '../../types';
import { useConfirm } from '../shared/ConfirmModal';
import { SceneModal } from './SceneModal';
import { SceneGroupModal } from './SceneGroupModal';

import { EmojiIcon } from '../shared/EmojiIcons';
// ─── Shared scene row content ─────────────────────────────────────────────────

type SceneRowProps = {
  scene: Scene;
  isActive: boolean;
  dragHandle: React.ReactNode;
  canDelete: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

function SceneItemRow({
  scene, isActive, dragHandle, canDelete,
  onSelect, onEdit, onDuplicate, onDelete,
}: SceneRowProps) {
  const t = useT();
  const hasNote = !!scene.notes;

  const systemTag = scene.tags.find(tag =>
    (SYSTEM_TAGS as readonly string[]).includes(tag),
  ) as SystemTag | undefined;
  const isStart = scene.tags.includes(START_TAG);
  const dotColor = systemTag ? SYSTEM_TAG_COLORS[systemTag] : isStart ? START_TAG_COLOR : null;

  return (
    <div
      className={`scene-row group flex items-center rounded px-2 py-1.5 cursor-pointer transition-colors ${
        isActive ? 'bg-indigo-700/40 text-white' : 'hover:bg-slate-800 text-slate-300'
      }`}
      onClick={onSelect}
      onDoubleClick={e => { e.stopPropagation(); onEdit(); }}
    >
      {dragHandle}

      {dotColor && (
        <span className="w-2 h-2 rounded-full shrink-0 mr-1.5" style={{ background: dotColor }} />
      )}

      <span className="flex-1 text-xs truncate">{scene.name}</span>

      <button
        className={`text-xs px-0.5 cursor-pointer transition-all ${
          hasNote
            ? 'text-amber-400 hover:text-amber-300'
            : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-amber-300'
        }`}
        title={hasNote ? `${t.scene.note}: ${scene.notes}` : t.scene.note}
        onClick={e => { e.stopPropagation(); onEdit(); }}
      >
        <EmojiIcon name="note" size={20} />
      </button>

      <button
        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-300 text-xs px-0.5 transition-opacity cursor-pointer"
        title={t.scene.duplicate}
        onClick={e => { e.stopPropagation(); onDuplicate(); }}
      >
        ⧉
      </button>

      {canDelete && (
        <button
          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 text-xs px-0.5 transition-opacity cursor-pointer"
          title={t.scene.delete}
          onClick={e => { e.stopPropagation(); onDelete(); }}
        >
          <EmojiIcon name="trash" size={20} />
        </button>
      )}
    </div>
  );
}

// ─── Sortable scene item ──────────────────────────────────────────────────────

function SortableSceneItem(props: Omit<SceneRowProps, 'dragHandle'>) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.scene.id,
    data: { groupId: props.scene.groupId ?? null },
  });

  const dragHandle = (
    <span
      {...listeners}
      {...attributes}
      className="drag-handle text-slate-600 hover:text-slate-400 text-xs mr-1.5 select-none shrink-0 cursor-grab active:cursor-grabbing"
      title={t.scene.drag}
      onClick={e => e.stopPropagation()}
    >
      ⠿
    </span>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      <SceneItemRow {...props} dragHandle={dragHandle} />
    </div>
  );
}

// ─── Plain scene item (no DnD, used in filtered view) ────────────────────────

function PlainSceneItem(props: Omit<SceneRowProps, 'dragHandle'>) {
  const dragHandle = (
    <span className="text-slate-800 text-xs mr-1.5 select-none shrink-0">⠿</span>
  );
  return (
    <div>
      <SceneItemRow {...props} dragHandle={dragHandle} />
    </div>
  );
}

// ─── Droppable container (for empty groups) ───────────────────────────────────

function DroppableContainer({ id, children, className }: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ''} ${isOver ? 'ring-1 ring-inset ring-indigo-500/40 rounded' : ''}`}
    >
      {children}
    </div>
  );
}

// ─── Group header ─────────────────────────────────────────────────────────────

function SceneGroupHeader({ group, onEdit, onDelete, onToggle }: {
  group: SceneGroup;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const t = useT();
  const hasNote = !!group.notes;

  return (
    <div
      className="scene-row group flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-slate-800/60 rounded transition-colors select-none"
      onClick={onToggle}
    >
      <span className="text-slate-500 text-xs w-3 shrink-0">
        {group.collapsed ? '▸' : '▾'}
      </span>
      <span className="flex-1 text-xs font-medium text-slate-300 truncate">{group.name}</span>

      <button
        className={`text-xs px-0.5 cursor-pointer transition-all ${
          hasNote
            ? 'text-amber-400 hover:text-amber-300'
            : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-amber-300'
        }`}
        title={hasNote ? `${t.scene.note}: ${group.notes}` : t.scene.note}
        onClick={e => { e.stopPropagation(); onEdit(); }}
      >
        <EmojiIcon name="note" size={20} />
      </button>

      <button
        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-300 text-xs px-0.5 cursor-pointer transition-opacity"
        title={t.scene.groupEditTitle}
        onClick={e => { e.stopPropagation(); onEdit(); }}
      >
        <EmojiIcon name="cog" size={20} />
      </button>

      <button
        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 text-xs px-0.5 cursor-pointer transition-opacity"
        title={t.scene.delete}
        onClick={e => { e.stopPropagation(); onDelete(); }}
      >
        <EmojiIcon name="trash" size={20} />
      </button>
    </div>
  );
}

// ─── Modal state types ────────────────────────────────────────────────────────

type SceneModalState =
  | { mode: 'create' }
  | { mode: 'edit'; scene: Scene }
  | null;

type GroupModalState =
  | { mode: 'create' }
  | { mode: 'edit'; group: SceneGroup }
  | null;

// ─── Main SceneList ───────────────────────────────────────────────────────────

export function SceneList() {
  const {
    project,
    activeSceneId,
    setActiveScene,
    addSceneWithData,
    deleteScene,
    updateSceneSettings,
    duplicateScene,
    reorderGroupScenes,
    moveSceneToGroup,
    addSceneGroup,
    updateSceneGroup,
    deleteSceneGroup,
    deleteSceneGroupWithScenes,
  } = useProjectStore();
  const t = useT();

  const searchQuery = useEditorStore(s => s.searchQuery);
  const setSearchQuery = useEditorStore(s => s.setSearchQuery);
  const {
    confirmDeleteScene,
    confirmDeleteGroup,
    deleteGroupWithScenes,
  } = useEditorPrefsStore();

  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<'or' | 'and'>('or');
  const [sceneModal, setSceneModal] = useState<SceneModalState>(null);
  const [groupModal, setGroupModal] = useState<GroupModalState>(null);
  const { ask, modal: confirmModal } = useConfirm();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const variables = useMemo(
    () => flattenVariables(project.variableNodes ?? []),
    [project.variableNodes],
  );

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const sc of project.scenes) for (const tag of sc.tags) if (tag !== START_TAG) tags.add(tag);
    return [...tags].sort();
  }, [project.scenes]);

  const toggleTag = (tag: string) => {
    setActiveTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  };

  const isFiltering = activeTags.size > 0 || searchQuery.trim() !== '';

  const visibleScenes = useMemo(() => {
    let scenes = project.scenes;
    if (activeTags.size > 0) {
      scenes = scenes.filter(sc =>
        filterMode === 'or'
          ? sc.tags.some(tag => activeTags.has(tag))
          : [...activeTags].every(tag => sc.tags.includes(tag)),
      );
    }
    if (searchQuery.trim()) {
      scenes = scenes.filter(sc => sceneMatchesQuery(sc, searchQuery, variables));
    }
    return scenes;
  }, [project.scenes, activeTags, filterMode, searchQuery, variables]);

  // ── DnD ──────────────────────────────────────────────────────────────────────

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeScene = project.scenes.find(s => s.id === active.id);
    if (!activeScene) return;

    const activeGroupId = activeScene.groupId ?? null;
    const overId = String(over.id);

    // Dropped onto another scene
    const overScene = project.scenes.find(s => s.id === overId);
    if (overScene) {
      const overGroupId = overScene.groupId ?? null;
      if (activeGroupId === overGroupId) {
        // Same container — reorder
        const groupScenes = project.scenes.filter(s => (s.groupId ?? null) === activeGroupId);
        const oldIdx = groupScenes.findIndex(s => s.id === active.id);
        const newIdx = groupScenes.findIndex(s => s.id === overId);
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          reorderGroupScenes(arrayMove(groupScenes, oldIdx, newIdx));
        }
      } else {
        // Different container — move
        moveSceneToGroup(String(active.id), overGroupId, overId);
      }
      return;
    }

    // Dropped onto a group container or ungrouped container
    const targetGroupId = overId === '__ungrouped__' ? null
      : project.sceneGroups.find(g => g.id === overId) ? overId
      : null;

    if (targetGroupId !== activeGroupId) {
      moveSceneToGroup(String(active.id), targetGroupId, null);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const takenSceneNames = (excludeId?: string) =>
    project.scenes.filter(s => s.id !== excludeId).map(s => s.name);

  const takenGroupNames = (excludeId?: string) =>
    project.sceneGroups.filter(g => g.id !== excludeId).map(g => g.name);

  const itemCallbacks = (scene: Scene) => ({
    isActive:    scene.id === activeSceneId,
    canDelete:   project.scenes.length > 1 && !scene.tags.includes(START_TAG),
    onSelect:    () => setActiveScene(scene.id),
    onEdit:      () => setSceneModal({ mode: 'edit', scene }),
    onDuplicate: () => duplicateScene(scene.id),
    onDelete:    () => {
      if (confirmDeleteScene) {
        ask({ message: t.scene.confirmDelete(scene.name), variant: 'danger' }, () => deleteScene(scene.id));
      } else {
        deleteScene(scene.id);
      }
    },
  });

  const defaultSceneName = () => {
    const base = 'Scene';
    const existing = project.scenes.map(s => s.name);
    let name = base; let i = project.scenes.length + 1;
    while (existing.includes(name)) { name = `${base} ${i}`; i++; }
    return name;
  };

  // Scenes grouped by groupId
  const ungroupedScenes = project.scenes.filter(s => !s.groupId);
  const scenesInGroup = (groupId: string) => project.scenes.filter(s => s.groupId === groupId);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-2 flex flex-col gap-0.5">

      {/* Toolbar */}
      <div className="flex gap-1 pb-1 border-b border-slate-800 mb-1">
        <button
          className="flex-1 text-xs text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1.5 transition-colors cursor-pointer border border-dashed border-slate-700 hover:border-indigo-600"
          onClick={() => setSceneModal({ mode: 'create' })}
        >
          {t.scene.add}
        </button>
        <button
          className="flex-1 text-xs text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1.5 transition-colors cursor-pointer border border-dashed border-slate-700 hover:border-indigo-600"
          onClick={() => setGroupModal({ mode: 'create' })}
        >
          {t.scene.addGroup}
        </button>
      </div>

      {/* Tag filter strip */}
      {allTags.length > 0 && (
        <div className="mb-0.5">
          <div className="flex flex-wrap gap-1 items-center pb-1">
            {allTags.map(tag => (
              <button
                key={tag}
                className={`text-xs rounded px-1.5 py-0.5 transition-colors cursor-pointer ${
                  activeTags.has(tag)
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
            {activeTags.size > 0 && (
              <div className="ml-auto flex items-center rounded overflow-hidden border border-slate-600 text-xs shrink-0">
                <button
                  className={`px-1.5 py-0.5 cursor-pointer transition-colors ${filterMode === 'or' ? 'bg-indigo-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  onClick={() => setFilterMode('or')}
                >OR</button>
                <button
                  className={`px-1.5 py-0.5 cursor-pointer transition-colors ${filterMode === 'and' ? 'bg-indigo-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  onClick={() => setFilterMode('and')}
                >AND</button>
              </div>
            )}
          </div>
          <div className="h-px bg-slate-700/60" />
        </div>
      )}

      {/* Search */}
      <div className="relative mb-1">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none select-none">
          <EmojiIcon name="search" size={20} />
        </span>
        <input
          className="w-full bg-slate-800 text-white text-xs pl-7 pr-6 py-1.5 rounded border border-slate-600 outline-none focus:border-indigo-500 placeholder-slate-500 transition-colors"
          placeholder={t.header.searchPlaceholder}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 cursor-pointer text-sm leading-none"
            onClick={() => setSearchQuery('')}
            title={t.header.clearSearch}
          >
            <EmojiIcon name="close" size={20} />
          </button>
        )}
      </div>

      {/* ── Filtered flat view ── */}
      {isFiltering ? (
        <div className="flex flex-col gap-0.5">
          {visibleScenes.length === 0 ? (
            <div className="text-center py-4 px-2">
              <p className="text-xs text-slate-500">{t.scene.filterNoScenes}</p>
              {filterMode === 'and' && activeTags.size > 1 && (
                <button
                  className="mt-1.5 text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
                  onClick={() => setFilterMode('or')}
                >→ OR</button>
              )}
            </div>
          ) : (
            visibleScenes.map(scene => (
              <PlainSceneItem key={scene.id} scene={scene} {...itemCallbacks(scene)} />
            ))
          )}
        </div>
      ) : (
        /* ── Normal grouped view with DnD ── */
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>

          {/* Ungrouped scenes */}
          {ungroupedScenes.length > 0 && (
            <SortableContext
              items={ungroupedScenes.map(s => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <DroppableContainer id="__ungrouped__" className="flex flex-col gap-0.5 mb-1">
                {ungroupedScenes.map(scene => (
                  <SortableSceneItem key={scene.id} scene={scene} {...itemCallbacks(scene)} />
                ))}
              </DroppableContainer>
            </SortableContext>
          )}

          {/* Groups */}
          {project.sceneGroups.map(group => {
            const groupScenes = scenesInGroup(group.id);
            return (
              <div key={group.id} className="mb-1">
                <SceneGroupHeader
                  group={group}
                  onToggle={() => updateSceneGroup(group.id, { collapsed: !group.collapsed })}
                  onEdit={() => setGroupModal({ mode: 'edit', group })}
                  onDelete={() => {
                    // Block deletion if group contains the start scene and mode is "delete with scenes"
                    if (deleteGroupWithScenes) {
                      const hasStart = groupScenes.some(sc => sc.tags.includes(START_TAG));
                      if (hasStart) {
                        ask({ message: t.scene.groupCannotDeleteStart, confirmLabel: 'OK', variant: 'default' }, () => {});
                        return;
                      }
                    }
                    const doDelete = () => deleteGroupWithScenes
                      ? deleteSceneGroupWithScenes(group.id)
                      : deleteSceneGroup(group.id);
                    if (confirmDeleteGroup) {
                      ask({ message: t.scene.groupConfirmDelete(group.name), variant: 'danger' }, doDelete);
                    } else {
                      doDelete();
                    }
                  }}
                />
                {!group.collapsed && (
                  <SortableContext
                    items={groupScenes.map(s => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <DroppableContainer
                      id={group.id}
                      className="flex flex-col gap-0.5 pl-3 min-h-[28px]"
                    >
                      {groupScenes.map(scene => (
                        <SortableSceneItem key={scene.id} scene={scene} {...itemCallbacks(scene)} />
                      ))}
                      {groupScenes.length === 0 && (
                        <div className="text-xs text-slate-600 italic px-2 py-1">
                          {t.scene.groupUngrouped}
                        </div>
                      )}
                    </DroppableContainer>
                  </SortableContext>
                )}
              </div>
            );
          })}
        </DndContext>
      )}

      {/* ── Modals ── */}
      {sceneModal && (
        <SceneModal
          mode={sceneModal.mode}
          initial={sceneModal.mode === 'create'
            ? { name: defaultSceneName(), tags: [], notes: undefined }
            : { name: sceneModal.scene.name, tags: sceneModal.scene.tags, notes: sceneModal.scene.notes, background: sceneModal.scene.background }
          }
          takenNames={sceneModal.mode === 'create'
            ? takenSceneNames()
            : takenSceneNames(sceneModal.scene.id)
          }
          sceneId={sceneModal.mode === 'edit' ? sceneModal.scene.id : undefined}
          onSave={data => {
            if (sceneModal.mode === 'create') addSceneWithData(data);
            else updateSceneSettings(sceneModal.scene.id, data);
          }}
          onClose={() => setSceneModal(null)}
        />
      )}

      {groupModal && (
        <SceneGroupModal
          mode={groupModal.mode}
          initial={groupModal.mode === 'create'
            ? { name: '', notes: undefined }
            : { name: groupModal.group.name, notes: groupModal.group.notes }
          }
          takenNames={groupModal.mode === 'create'
            ? takenGroupNames()
            : takenGroupNames(groupModal.group.id)
          }
          onSave={data => {
            if (groupModal.mode === 'create') addSceneGroup(data);
            else updateSceneGroup(groupModal.group.id, data);
          }}
          onClose={() => setGroupModal(null)}
        />
      )}

      {confirmModal}
    </div>
  );
}
