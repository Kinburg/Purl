import { useState, useRef } from 'react';
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
import { VariablePicker } from '../shared/VariablePicker';
import { useVariableNodes } from '../shared/VariableScope';
import type {
  TabsBlock, TabsTab, Block,
  TextBlock, DialogueBlock, ChoiceBlock, ConditionBlock, VariableSetBlock, SetObjectBlock, ForBlock,
  ImageBlock, VideoBlock, ButtonBlock, LinkBlock, MenuLinkBlock, FunctionBlock, PopupBlock,
  AudioBlock, RawBlock, TableBlock, IncludeBlock, DividerBlock, SpacerBlock, SectionBlock, ProgressBlock,
  AudioVolumeBlock, DateTimeBlock, CalloutBlock, SelectBlock, SliderBlock, DisplayObjectBlock,
  CheckboxBlock, RadioBlock, InputFieldBlock, NoteBlock, SaveBlock,
} from '../../types';
import { AddBlockMenu } from './AddBlockMenu';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import { TABS_FIELD_SCHEMA, TABS_RAW_CSS_HELP } from '../../utils/styleCascade';

// ── Inner editors ───────────────────────────────────────────────────────────
// Same pattern as ConditionBlockEditor's NestedBlockEditor — bundled subset of
// editors that make sense inside a tab. Heavier scene-level blocks (inventory,
// paperdoll, container, plugin) are intentionally excluded.
import { TextBlockEditor } from './TextBlockEditor';
import { DialogueBlockEditor } from './DialogueBlockEditor';
import { ChoiceBlockEditor } from './ChoiceBlockEditor';
import { ConditionBlockEditor } from './ConditionBlockEditor';
import { VariableSetBlockEditor } from './VariableSetBlockEditor';
import { SetObjectBlockEditor } from './SetObjectBlockEditor';
import { ForBlockEditor } from './ForBlockEditor';
import { ImageBlockEditor } from './ImageBlockEditor';
import { VideoBlockEditor } from './VideoBlockEditor';
import { ButtonBlockEditor } from './ButtonBlockEditor';
import { LinkBlockEditor } from './LinkBlockEditor';
import { MenuLinkBlockEditor } from './MenuLinkBlockEditor';
import { SpacerBlockEditor } from './SpacerBlockEditor';
import { SectionBlockEditor } from './SectionBlockEditor';
import { ProgressBlockEditor } from './ProgressBlockEditor';
import { AudioVolumeBlockEditor } from './AudioVolumeBlockEditor';
import { DateTimeBlockEditor } from './DateTimeBlockEditor';
import { CalloutBlockEditor } from './CalloutBlockEditor';
import { SelectBlockEditor } from './SelectBlockEditor';
import { SliderBlockEditor } from './SliderBlockEditor';
import { DisplayObjectBlockEditor } from './DisplayObjectBlockEditor';
import { FunctionBlockEditor } from './FunctionBlockEditor';
import { PopupBlockEditor } from './PopupBlockEditor';
import { AudioBlockEditor } from './AudioBlockEditor';
import { RawBlockEditor } from './RawBlockEditor';
import { TableBlockEditor } from './TableBlockEditor';
import { IncludeBlockEditor } from './IncludeBlockEditor';
import { DividerBlockEditor } from './DividerBlockEditor';
import { CheckboxBlockEditor } from './CheckboxBlockEditor';
import { RadioBlockEditor } from './RadioBlockEditor';
import { InputFieldBlockEditor } from './InputFieldBlockEditor';
import { NoteBlockEditor } from './NoteBlockEditor';
import { SaveBlockEditor } from './SaveBlockEditor';

// ── Nested editor switch ────────────────────────────────────────────────────

/** Exported so SectionBlockEditor reuses the exact same nested-block editor switch. */
export function InnerBlockEditor({
  block, sceneId, onUpdate,
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
    case 'condition':    return <ConditionBlockEditor    block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ConditionBlock>) => void} />;
    case 'variable-set': return <VariableSetBlockEditor  block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<VariableSetBlock>) => void} />;
    case 'set-object':   return <SetObjectBlockEditor    block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SetObjectBlock>) => void} />;
    case 'for':          return <ForBlockEditor          block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ForBlock>) => void} />;
    case 'image':        return <ImageBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ImageBlock>) => void} />;
    case 'video':        return <VideoBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<VideoBlock>) => void} />;
    case 'button':       return <ButtonBlockEditor       block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ButtonBlock>) => void} />;
    case 'link':         return <LinkBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<LinkBlock>) => void} />;
    case 'menu-link':    return <MenuLinkBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<MenuLinkBlock>) => void} />;
    case 'function':     return <FunctionBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<FunctionBlock>) => void} />;
    case 'popup':        return <PopupBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<PopupBlock>) => void} />;
    case 'audio':        return <AudioBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<AudioBlock>) => void} />;
    case 'raw':          return <RawBlockEditor          block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<RawBlock>) => void} />;
    case 'table':        return <TableBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<TableBlock>) => void} />;
    case 'include':      return <IncludeBlockEditor      block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<IncludeBlock>) => void} />;
    case 'divider':      return <DividerBlockEditor      block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<DividerBlock>) => void} />;
    case 'spacer':       return <SpacerBlockEditor       block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SpacerBlock>) => void} />;
    case 'section':      return <SectionBlockEditor      block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SectionBlock>) => void} />;
    case 'progress':     return <ProgressBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ProgressBlock>) => void} />;
    case 'audio-volume': return <AudioVolumeBlockEditor   block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<AudioVolumeBlock>) => void} />;
    case 'date-time':    return <DateTimeBlockEditor      block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<DateTimeBlock>) => void} />;
    case 'callout':      return <CalloutBlockEditor       block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<CalloutBlock>) => void} />;
    case 'save':         return <SaveBlockEditor          block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SaveBlock>) => void} />;
    case 'select':       return <SelectBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SelectBlock>) => void} />;
    case 'slider':       return <SliderBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SliderBlock>) => void} />;
    case 'display-object': return <DisplayObjectBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<DisplayObjectBlock>) => void} />;
    case 'checkbox':     return <CheckboxBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<CheckboxBlock>) => void} />;
    case 'radio':        return <RadioBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<RadioBlock>) => void} />;
    case 'input-field':  return <InputFieldBlockEditor   block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<InputFieldBlock>) => void} />;
    case 'note':         return <NoteBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<NoteBlock>) => void} />;
    // Recursive: nested TabsBlock inside a tab renders a full TabsBlockEditor in
    // local-mode (mutations bubble up via onUpdate to the parent's store action).
    case 'tabs':         return <TabsBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<TabsBlock>) => void} />;
    default:             return <span className="text-xs text-slate-500">{t.block.unsupportedNested}</span>;
  }
}

// ── Sortable wrapper for a tab's nested block ───────────────────────────────

function SortableInnerBlock({
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
  const reorderBlocksInTab   = useProjectStore(s => s.reorderBlocksInTab);
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

  const handleDragEnd = (event: DragEndEvent) => {
    if (!activeTab) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = activeTab.blocks.findIndex(nb => nb.id === active.id);
    const newIdx = activeTab.blocks.findIndex(nb => nb.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(activeTab.blocks, oldIdx, newIdx);
    if (isLocal) {
      patch({ tabs: block.tabs.map(tb => tb.id === activeTab.id ? { ...tb, blocks: reordered } : tb) });
    } else {
      reorderBlocksInTab(sceneId, block.id, activeTab.id, reordered);
    }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={activeTab.blocks.map(nb => nb.id)} strategy={verticalListSortingStrategy}>
              {activeTab.blocks.length === 0 && (
                <p className="text-xs text-slate-600 italic py-2">{t.tabsBlock.emptyTab}</p>
              )}
              {activeTab.blocks.map(nb => (
                <SortableInnerBlock
                  key={nb.id}
                  block={nb}
                  sceneId={sceneId}
                  onUpdate={p => handleUpdateNested(nb.id, p)}
                  onCopy={() => handleCopyNested(nb)}
                  onDuplicate={() => handleDuplicateNested(nb.id)}
                  onDelete={() => handleDeleteNested(nb.id)}
                />
              ))}
            </SortableContext>
          </DndContext>

          <AddBlockMenu sceneId={sceneId} onAdd={handleAddBlock} />
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
