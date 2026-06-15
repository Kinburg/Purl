import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
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
import { toast } from 'sonner';
import { useConfirm } from '../shared/ConfirmModal';
import { YarnBall } from '../shared/YarnArt';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { extractSceneStrings, translateSceneBlocks } from '../../utils/i18nUtils';
import { translateString } from '../../utils/llm';
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
  const llmEnabled = useEditorPrefsStore(s => s.llmEnabled);
  const knitTheme  = useEditorPrefsStore(s => s.knitTheme);
  const [translating, setTranslating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { ask, modal } = useConfirm();
  // Count of non-empty translatable strings in the active scene (drives button visibility).
  const translatableCount = useMemo(
    () => (scene ? Object.values(extractSceneStrings(scene)).filter(v => v.trim()).length : 0),
    [scene],
  );

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
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500 text-sm">
        {knitTheme && <YarnBall className="w-12 h-12 text-slate-600" />}
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

  // Translate every text/dialogue/label in the scene into the project's story language.
  // In-place: applied atomically via reorderBlocks (single undo step). Cancel → nothing applied.
  const runTranslateScene = async () => {
    if (!scene) return;
    const map = extractSceneStrings(scene);
    const entries = Object.entries(map).filter(([, v]) => v.trim().length > 0);
    const total = entries.length;
    if (total === 0) { toast.info(t.scene.translateSceneEmpty); return; }

    const prefs = useEditorPrefsStore.getState();
    const project = useProjectStore.getState().project;
    const language = project.settings.storyLanguage || 'English';

    let urlOrApiKey = prefs.llmUrl;
    let model = prefs.llmGeminiModel;
    if (prefs.llmProvider === 'gemini') {
      urlOrApiKey = prefs.llmGeminiApiKey;
    } else if (prefs.llmProvider === 'openai') {
      urlOrApiKey = prefs.llmOpenaiUrl;
      model = prefs.llmOpenaiModel;
    }
    const apiKey = prefs.llmProvider === 'openai' ? prefs.llmOpenaiApiKey : undefined;
    const params = { maxTokens: prefs.llmMaxTokens, temperature: prefs.llmTemperature, filterThought: prefs.llmFilterThought };

    const controller = new AbortController();
    abortRef.current = controller;
    setTranslating(true);
    const toastId = toast.loading(t.scene.translating(0, total));

    const out: Record<string, string> = {};
    try {
      for (let i = 0; i < entries.length; i++) {
        const [key, value] = entries[i];
        const result = await translateString(
          prefs.llmProvider, urlOrApiKey, model, prefs.llmSystemPrompt,
          project, scene, value, language, params, controller.signal, apiKey,
        );
        out[key] = result.trim() || value;
        toast.loading(t.scene.translating(i + 1, total), { id: toastId });
      }
      reorderBlocks(scene.id, translateSceneBlocks(scene.blocks, out));
      toast.success(t.scene.translateDone(total), { id: toastId });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.dismiss(toastId);
      } else {
        toast.error(t.scene.translateFailed, { id: toastId });
      }
    } finally {
      setTranslating(false);
      abortRef.current = null;
    }
  };

  const handleTranslateClick = () => {
    if (translating) { abortRef.current?.abort(); return; }
    ask(t.scene.translateSceneConfirm, runTranslateScene);
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
      {modal}

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
          {llmEnabled && translatableCount > 0 && (
            <button
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border transition-colors cursor-pointer shrink-0 ml-1 ${
                translating
                  ? 'text-sky-300 bg-sky-900/40 border-sky-700'
                  : 'text-slate-300 bg-slate-700/50 hover:bg-slate-700 hover:text-white border-slate-600/60 hover:border-slate-500'
              }`}
              title={translating ? t.scene.stopTranslate : t.scene.translateScene}
              onClick={handleTranslateClick}
            >
              {translating ? (
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
                </svg>
              )}
              <span>{translating ? t.scene.stopTranslate : t.scene.translateScene}</span>
            </button>
          )}
        </div>
      </div>

      {/* System-passage hint — these SugarCube passages render only specific content. */}
      {(scene.tags.includes('menu') || scene.tags.includes('title')) && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-[11px] text-amber-200/90 flex items-start gap-2 shrink-0">
          <span className="shrink-0 mt-px">ⓘ</span>
          <span>{scene.tags.includes('menu') ? t.scene.menuSceneHint : t.scene.titleSceneHint}</span>
        </div>
      )}

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
                        onToggleCollapse={toggleBlock}
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
                <div className="text-slate-600 text-sm text-center py-8 flex flex-col items-center gap-2.5">
                  {knitTheme && <YarnBall className="w-10 h-10 text-slate-700" />}
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
