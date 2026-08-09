import { useState, useRef } from 'react';
import { useProjectStore, deepCloneBlock } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useT } from '../../i18n';
import { VariablePicker } from '../shared/VariablePicker';
import { useVariableNodes } from '../shared/VariableScope';
import type { TabsBlock, TabsTab, Block } from '../../types';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import { TABS_FIELD_SCHEMA, TABS_RAW_CSS_HELP } from '../../utils/styleCascade';
import { NestedBlockList } from './NestedBlockList';

// The nested block list (drag / add / edit / delete / duplicate) lives in the shared
// NestedBlockList; drag REORDER/MOVE is handled by SceneEditor's single DndContext.
// `InnerBlockEditor` (the shared nested-editor switch) lives in ./InnerBlockEditor.

// ── Main editor ─────────────────────────────────────────────────────────────

export function TabsBlockEditor({
  block, sceneId, onUpdate,
}: {
  block: TabsBlock;
  sceneId: string;
  /** When provided (e.g. nested inside another tabs block or condition branch), all
   *  mutations are routed through this callback instead of projectStore actions. */
  onUpdate?: (patch: Partial<TabsBlock>) => void;
}) {
  const t = useT();
  const variableNodes = useVariableNodes();
  const isLocal = !!onUpdate;

  // Store actions — only used when not in local-mode
  const addTab               = useProjectStore(s => s.addTab);
  const removeTab            = useProjectStore(s => s.removeTab);
  const renameTab            = useProjectStore(s => s.renameTab);
  const reorderTabs          = useProjectStore(s => s.reorderTabs);
  const addBlockToTab        = useProjectStore(s => s.addBlockToTab);
  const updateBlockInTab     = useProjectStore(s => s.updateBlockInTab);
  const deleteBlockFromTab   = useProjectStore(s => s.deleteBlockFromTab);
  const duplicateBlockInTab  = useProjectStore(s => s.duplicateBlockInTab);
  const saveSnapshot         = useProjectStore(s => s.saveSnapshot);
  const copyToClipboard      = useEditorStore(s => s.copyToClipboard);

  const [activeTabId, setActiveTabId] = useState<string>(block.tabs[0]?.id ?? '');
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  const patch = (p: Partial<TabsBlock>) => onUpdate?.(p);

  // ── Tab CRUD ──────────────────────────────────────────────────────────────

  const handleAddTab = () => {
    const newTab: TabsTab = { id: crypto.randomUUID(), label: `Tab ${block.tabs.length + 1}`, blocks: [] };
    if (isLocal) {
      patch({ tabs: [...block.tabs, newTab] });
    } else {
      addTab(sceneId, block.id, newTab.label);
    }
    // focus the new tab in the editor after store sync
    setTimeout(() => {
      const t2 = useProjectStore.getState().project.scenes
        .flatMap(s => s.blocks).find(b => b.id === block.id);
      if (t2 && t2.type === 'tabs') {
        const last = t2.tabs[t2.tabs.length - 1];
        if (last) setActiveTabId(last.id);
      } else if (isLocal) {
        setActiveTabId(newTab.id);
      }
    }, 0);
  };

  const handleRenameTab = (tabId: string, label: string) => {
    if (isLocal) patch({ tabs: block.tabs.map(tb => tb.id === tabId ? { ...tb, label } : tb) });
    else renameTab(sceneId, block.id, tabId, label);
  };

  const handleRemoveTab = (tabId: string) => {
    if (block.tabs.length === 1) return; // keep at least one tab
    if (isLocal) patch({ tabs: block.tabs.filter(tb => tb.id !== tabId) });
    else removeTab(sceneId, block.id, tabId);
    if (activeTabId === tabId) {
      const remaining = block.tabs.filter(tb => tb.id !== tabId);
      setActiveTabId(remaining[0]?.id ?? '');
    }
  };

  const handleMoveTab = (tabId: string, dir: -1 | 1) => {
    const idx = block.tabs.findIndex(tb => tb.id === tabId);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= block.tabs.length) return;
    const newTabs = [...block.tabs];
    [newTabs[idx], newTabs[next]] = [newTabs[next], newTabs[idx]];
    if (isLocal) patch({ tabs: newTabs });
    else reorderTabs(sceneId, block.id, newTabs);
  };

  // ── Nested block CRUD ─────────────────────────────────────────────────────

  const activeTab = block.tabs.find(tb => tb.id === activeTabId) ?? block.tabs[0];

  const handleAddBlock = (newBlock: Block) => {
    if (!activeTab) return;
    if (isLocal) {
      patch({ tabs: block.tabs.map(tb => tb.id === activeTab.id ? { ...tb, blocks: [...tb.blocks, newBlock] } : tb) });
    } else {
      addBlockToTab(sceneId, block.id, activeTab.id, newBlock);
    }
  };

  const handleUpdateNested = (nbId: string, p: Partial<Block>) => {
    if (!activeTab) return;
    if (isLocal) {
      patch({ tabs: block.tabs.map(tb => tb.id === activeTab.id
        ? { ...tb, blocks: tb.blocks.map(nb => nb.id === nbId ? { ...nb, ...p } as Block : nb) }
        : tb) });
    } else {
      updateBlockInTab(sceneId, block.id, activeTab.id, nbId, p);
    }
  };

  const handleDeleteNested = (nbId: string) => {
    if (!activeTab) return;
    if (isLocal) {
      patch({ tabs: block.tabs.map(tb => tb.id === activeTab.id ? { ...tb, blocks: tb.blocks.filter(nb => nb.id !== nbId) } : tb) });
    } else {
      deleteBlockFromTab(sceneId, block.id, activeTab.id, nbId);
    }
  };

  const handleDuplicateNested = (nbId: string) => {
    if (!activeTab) return;
    const idx = activeTab.blocks.findIndex(nb => nb.id === nbId);
    if (idx < 0) return;
    if (isLocal) {
      const dup = deepCloneBlock(activeTab.blocks[idx]);
      const newBlocks = [...activeTab.blocks];
      newBlocks.splice(idx + 1, 0, dup);
      patch({ tabs: block.tabs.map(tb => tb.id === activeTab.id ? { ...tb, blocks: newBlocks } : tb) });
    } else {
      duplicateBlockInTab(sceneId, block.id, activeTab.id, nbId);
    }
  };

  const handleCopyNested = (nb: Block) => {
    copyToClipboard(deepCloneBlock(nb));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2">
      {/* Tab bar */}
      <div className="flex items-center gap-1 flex-wrap border-b border-slate-700 pb-1">
        {block.tabs.map((tb, idx) => {
          const isActive = tb.id === activeTab?.id;
          const isRenaming = renamingTabId === tb.id;
          return (
            <div
              key={tb.id}
              className={`group/tab relative flex items-center gap-1 px-2.5 py-1 rounded-t cursor-pointer text-xs transition-colors ${
                isActive ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              onClick={() => !isRenaming && setActiveTabId(tb.id)}
              onDoubleClick={e => { e.stopPropagation(); setRenamingTabId(tb.id); setTimeout(() => labelRef.current?.focus(), 0); }}
            >
              {isRenaming ? (
                <input
                  ref={labelRef}
                  autoFocus
                  className="bg-slate-900 text-xs px-1 py-0 outline-none border border-indigo-500 rounded w-24"
                  value={tb.label}
                  onChange={e => handleRenameTab(tb.id, e.target.value)}
                  onBlur={() => { saveSnapshot(); setRenamingTabId(null); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === 'Escape') { saveSnapshot(); setRenamingTabId(null); }
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="select-none">{tb.label || '(unnamed)'}</span>
              )}
              {isActive && !isRenaming && (
                <div className="flex items-center opacity-0 group-hover/tab:opacity-100 transition-opacity gap-0.5">
                  <button
                    className="text-slate-500 hover:text-slate-200 text-[10px] leading-none px-1 cursor-pointer"
                    title={t.tabsBlock.moveLeft}
                    disabled={idx === 0}
                    onClick={e => { e.stopPropagation(); handleMoveTab(tb.id, -1); }}
                  >◀</button>
                  <button
                    className="text-slate-500 hover:text-slate-200 text-[10px] leading-none px-1 cursor-pointer"
                    title={t.tabsBlock.moveRight}
                    disabled={idx === block.tabs.length - 1}
                    onClick={e => { e.stopPropagation(); handleMoveTab(tb.id, 1); }}
                  >▶</button>
                  <button
                    className="text-slate-500 hover:text-red-400 text-[10px] leading-none px-1 cursor-pointer"
                    title={t.block.delete}
                    disabled={block.tabs.length === 1}
                    onClick={e => { e.stopPropagation(); handleRemoveTab(tb.id); }}
                  >×</button>
                </div>
              )}
            </div>
          );
        })}
        <button
          className="text-xs text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1 transition-colors cursor-pointer"
          onClick={handleAddTab}
        >{t.tabsBlock.addTab}</button>
      </div>

      {/* Tab body — nested block list */}
      {activeTab && (
        <div className="flex flex-col gap-2 pl-1">
          <NestedBlockList
            sceneId={sceneId}
            containerId={activeTab.id}
            containerKind="tab"
            blocks={activeTab.blocks}
            onAdd={handleAddBlock}
            onUpdate={handleUpdateNested}
            onDelete={handleDeleteNested}
            onDuplicate={handleDuplicateNested}
            onCopy={handleCopyNested}
            emptyLabel={t.tabsBlock.emptyTab}
          />
        </div>
      )}

      {/* Settings: default tab + bind variable */}
      <div className="flex flex-wrap items-center gap-3 mt-1 pt-2 border-t border-slate-700/50">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">{t.tabsBlock.defaultTab}</span>
          <select
            className="bg-slate-800 text-xs text-white rounded px-1.5 py-0.5 outline-none border border-slate-600 cursor-pointer"
            value={block.defaultTabIndex ?? 0}
            onChange={e => {
              const v = parseInt(e.target.value, 10);
              if (isLocal) patch({ defaultTabIndex: v });
              else useProjectStore.getState().updateBlock(sceneId, block.id, { defaultTabIndex: v } as Partial<Block>);
            }}
          >
            {block.tabs.map((tb, i) => <option key={tb.id} value={i}>{i}: {tb.label}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">{t.tabsBlock.bindVariable}</span>
          <VariablePicker
            value={block.controlVariableId ?? ''}
            onChange={id => {
              const v = id || undefined;
              if (isLocal) patch({ controlVariableId: v });
              else useProjectStore.getState().updateBlock(sceneId, block.id, { controlVariableId: v } as Partial<Block>);
            }}
            nodes={variableNodes}
            filterType="number"
            placeholder={t.tabsBlock.autoVarPlaceholder}
            className="bg-slate-800 text-xs text-white rounded px-1.5 py-0.5 outline-none border border-slate-600 cursor-pointer"
          />
        </div>
      </div>

      {/* Spot-level style override (static only — bound is at project-defaults level) */}
      <details className="border border-slate-700/60 rounded bg-slate-900/30">
        <summary className="text-xs text-slate-300 px-2 py-1.5 cursor-pointer select-none hover:bg-slate-800/50">
          {t.styleOverride.sectionTitle}
        </summary>
        <div className="px-2 pb-2 pt-1">
          <StyleOverrideEditor
            value={block.customStyle}
            onChange={v => {
              if (isLocal) patch({ customStyle: v });
              else useProjectStore.getState().updateBlock(sceneId, block.id, { customStyle: v } as Partial<Block>);
            }}
            variableNodes={variableNodes}
            allowBound={false}
            fieldsSchema={TABS_FIELD_SCHEMA}
            rawCssHelp={TABS_RAW_CSS_HELP}
          />
        </div>
      </details>

      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={d => {
          if (isLocal) patch({ delay: d });
          else useProjectStore.getState().updateBlock(sceneId, block.id, { delay: d } as Partial<Block>);
        }}
      />
    </div>
  );
}
