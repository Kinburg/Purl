import { lazy, memo, Suspense } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProjectStore } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { useConfirm } from '../shared/ConfirmModal';
import { useT, blockTypeLabel } from '../../i18n';
import type { Block } from '../../types';
import { EmojiIcon } from '../shared/EmojiIcons';
import { blockPalette } from '../../utils/blockPalette';
import { YarnSpinner } from '../shared/YarnArt';

// ── Eager editors ────────────────────────────────────────────────────────────
// Common, lightweight blocks bundled with the main chunk. Loading them is
// cheap and they're used in nearly every scene.
import { TextBlockEditor } from './TextBlockEditor';
import { DialogueBlockEditor } from './DialogueBlockEditor';
import { ChoiceBlockEditor } from './ChoiceBlockEditor';
import { ConditionBlockEditor } from './ConditionBlockEditor';
import { VariableSetBlockEditor } from './VariableSetBlockEditor';
import { ForBlockEditor } from './ForBlockEditor';
import { ImageBlockEditor } from './ImageBlockEditor';
import { VideoBlockEditor } from './VideoBlockEditor';
import { ButtonBlockEditor } from './ButtonBlockEditor';
import { LinkBlockEditor } from './LinkBlockEditor';
import { MenuLinkBlockEditor } from './MenuLinkBlockEditor';
import { InputFieldBlockEditor } from './InputFieldBlockEditor';
import { RawBlockEditor } from './RawBlockEditor';
import { NoteBlockEditor } from './NoteBlockEditor';
import { SaveBlockEditor } from './SaveBlockEditor';
import { DividerBlockEditor } from './DividerBlockEditor';
import { SpacerBlockEditor } from './SpacerBlockEditor';
import { SectionBlockEditor } from './SectionBlockEditor';
import { ProgressBlockEditor } from './ProgressBlockEditor';
import { AudioVolumeBlockEditor } from './AudioVolumeBlockEditor';
import { DateTimeBlockEditor } from './DateTimeBlockEditor';
import { CalloutBlockEditor } from './CalloutBlockEditor';
import { SelectBlockEditor } from './SelectBlockEditor';
import { SliderBlockEditor } from './SliderBlockEditor';
import { DisplayObjectBlockEditor } from './DisplayObjectBlockEditor';
import { IncludeBlockEditor } from './IncludeBlockEditor';
import { CheckboxBlockEditor } from './CheckboxBlockEditor';
import { RadioBlockEditor } from './RadioBlockEditor';
import { FunctionBlockEditor } from './FunctionBlockEditor';
import { PopupBlockEditor } from './PopupBlockEditor';
import { AudioBlockEditor } from './AudioBlockEditor';
import { TimeManipulationBlockEditor } from './TimeManipulationBlockEditor';
import { SetObjectBlockEditor } from './SetObjectBlockEditor';
// TableBlockEditor stays eager — it's also imported by ConditionBlockEditor,
// DialogueBlockEditor, and ForBlockEditor for inline rendering inside nested
// blocks. Lazy-loading here wouldn't actually move bytes out of the main chunk.
import { TableBlockEditor } from './TableBlockEditor';

// ── Lazy editors ─────────────────────────────────────────────────────────────
// Heavy or rarely-used. Each becomes its own chunk and is only fetched the
// first time a scene contains one. Named exports → wrapped in default-shim.
const ImageGenBlockEditor   = lazy(() => import('./ImageGenBlockEditor').then(m => ({ default: m.ImageGenBlockEditor })));
const AudioGenBlockEditor   = lazy(() => import('./AudioGenBlockEditor').then(m => ({ default: m.AudioGenBlockEditor })));
const VideoGenBlockEditor   = lazy(() => import('./VideoGenBlockEditor').then(m => ({ default: m.VideoGenBlockEditor })));
const ContainerBlockEditor  = lazy(() => import('./ContainerBlockEditor').then(m => ({ default: m.ContainerBlockEditor })));
const PaperdollBlockEditor  = lazy(() => import('./PaperdollBlockEditor').then(m => ({ default: m.PaperdollBlockEditor })));
const InventoryBlockEditor  = lazy(() => import('./InventoryBlockEditor').then(m => ({ default: m.InventoryBlockEditor })));
const PluginBlockEditor     = lazy(() => import('./PluginBlockEditor').then(m => ({ default: m.PluginBlockEditor })));
const TabsBlockEditor       = lazy(() => import('./TabsBlockEditor').then(m => ({ default: m.TabsBlockEditor })));
const QuestSetBlockEditor   = lazy(() => import('./QuestSetBlockEditor').then(m => ({ default: m.QuestSetBlockEditor })));
const ShowQuestsBlockEditor = lazy(() => import('./ShowQuestsBlockEditor').then(m => ({ default: m.ShowQuestsBlockEditor })));

import { usePluginStore } from '../../store/pluginStore';

// ── Editor registry ──────────────────────────────────────────────────────────
// `as never` keeps each editor's narrow block-type prop intact at the call
// site without forcing a discriminated union here.
type AnyEditor = React.ComponentType<{
  block: Block;
  sceneId: string;
  onUpdate?: (patch: Partial<Block>) => void;
}>;
const BLOCK_EDITORS: Record<Block['type'], AnyEditor> = {
  'text':              TextBlockEditor             as never,
  'dialogue':          DialogueBlockEditor         as never,
  'choice':            ChoiceBlockEditor           as never,
  'condition':         ConditionBlockEditor        as never,
  'variable-set':      VariableSetBlockEditor      as never,
  'set-object':        SetObjectBlockEditor        as never,
  'for':               ForBlockEditor              as never,
  'image':             ImageBlockEditor            as never,
  'image-gen':         ImageGenBlockEditor         as never,
  'video':             VideoBlockEditor            as never,
  'button':            ButtonBlockEditor           as never,
  'link':              LinkBlockEditor             as never,
  'menu-link':         MenuLinkBlockEditor         as never,
  'input-field':       InputFieldBlockEditor       as never,
  'raw':               RawBlockEditor              as never,
  'note':              NoteBlockEditor             as never,
  'save':              SaveBlockEditor             as never,
  'spacer':            SpacerBlockEditor           as never,
  'section':           SectionBlockEditor          as never,
  'progress':          ProgressBlockEditor         as never,
  'audio-volume':      AudioVolumeBlockEditor       as never,
  'date-time':         DateTimeBlockEditor          as never,
  'callout':           CalloutBlockEditor           as never,
  'select':            SelectBlockEditor            as never,
  'slider':            SliderBlockEditor            as never,
  'display-object':    DisplayObjectBlockEditor     as never,
  'table':             TableBlockEditor            as never,
  'include':           IncludeBlockEditor          as never,
  'divider':           DividerBlockEditor          as never,
  'checkbox':          CheckboxBlockEditor         as never,
  'radio':             RadioBlockEditor            as never,
  'function':          FunctionBlockEditor         as never,
  'popup':             PopupBlockEditor            as never,
  'audio':             AudioBlockEditor            as never,
  'audio-gen':         AudioGenBlockEditor         as never,
  'video-gen':         VideoGenBlockEditor         as never,
  'container':         ContainerBlockEditor        as never,
  'time-manipulation': TimeManipulationBlockEditor as never,
  'paperdoll':         PaperdollBlockEditor        as never,
  'inventory':         InventoryBlockEditor        as never,
  'tabs':              TabsBlockEditor             as never,
  'quest-set':         QuestSetBlockEditor         as never,
  'quest-show':        ShowQuestsBlockEditor       as never,
  'plugin':            PluginBlockEditor           as never,
};

function BlockEditorFallback() {
  const knit = useEditorPrefsStore(s => s.knitTheme);
  return (
    <div className="flex items-center gap-2 text-slate-500 text-xs italic py-2">
      {knit && <YarnSpinner className="w-4 h-4" />}
      Loading editor…
    </div>
  );
}

// Per-block card colours are derived from the block's category — see blockPalette().

/** Convert "#rrggbb" → "rgba(r,g,b,a)". Returns the input unchanged if it's not a 6-digit hex. */
function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface Props {
  block: Block;
  sceneId: string;
  collapsed?: boolean;
  /** Receives the block id so callers can pass a STABLE handler (e.g. a useCallback
   *  `toggleBlock`) instead of a per-block inline arrow — the latter changes identity
   *  every render and defeats this component's React.memo for every block. */
  onToggleCollapse?: (blockId: string) => void;
  /** Override handlers for blocks living outside a scene (e.g. plugin body), where the
   *  projectStore fallbacks don't apply. All receive the block id so callers can pass
   *  STABLE refs (see onToggleCollapse) instead of per-block inline arrows. */
  onUpdate?: (blockId: string, patch: Partial<Block>) => void;
  onDelete?: (blockId: string) => void;
  onDuplicate?: (blockId: string) => void;
}

function BlockItemImpl({ block, sceneId, collapsed, onToggleCollapse, onUpdate, onDelete, onDuplicate }: Props) {
  // Selector pattern — Zustand caches stable action refs, so this hook does
  // NOT re-render BlockItem on every project change (the old `useProjectStore()`
  // without selector was subscribing to the entire store).
  const deleteBlock     = useProjectStore(s => s.deleteBlock);
  const duplicateBlock  = useProjectStore(s => s.duplicateBlock);
  const copyToClipboard = useEditorStore(s => s.copyToClipboard);
  const confirmDeleteBlock = useEditorPrefsStore(s => s.confirmDeleteBlock);
  const { ask, modal: confirmModal } = useConfirm();
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  // For plugin blocks, pull the custom color from the plugin definition (if any).
  const pluginDef = usePluginStore((s) =>
    block.type === 'plugin' ? s.plugins.find((p) => p.id === block.pluginId) : undefined,
  );

  const style: React.CSSProperties = {
    // Translate only (NOT CSS.Transform, which also applies dnd-kit's scaleX/scaleY) —
    // otherwise dragging a short block past a much taller neighbour stretches the ghost.
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  // Tint the whole block with the plugin's color (soft alpha overlay).
  if (pluginDef?.color) {
    style.backgroundColor = hexWithAlpha(pluginDef.color, 0.18);
    style.borderColor = hexWithAlpha(pluginDef.color, 0.6);
  }

  const pal = blockPalette(block.type);
  const label = pluginDef?.name ?? blockTypeLabel(t, block.type);

  return (
    <>
    <div
      ref={setNodeRef}
      style={{ ...style, borderLeftColor: pal.accent, borderLeftWidth: '3px', background: pal.fill, '--block-accent': pal.accent } as React.CSSProperties}
      className="block-cord rounded border border-slate-700 overflow-hidden"
    >
      {/* Block header */}
      <div className="block-header flex items-center justify-between px-3 py-1.5 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span
            {...listeners}
            {...attributes}
            className="drag-handle text-slate-500 hover:text-slate-300 text-sm select-none cursor-grab active:cursor-grabbing"
            title={t.block.drag}
          >
            ⠿
          </span>
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="text-slate-600 hover:text-slate-300 text-sm transition-colors cursor-pointer"
            title={collapsed ? t.block.expand : t.block.collapse}
            onClick={() => onToggleCollapse?.(block.id)}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          <button
            className="text-slate-600 hover:text-slate-300 text-sm transition-colors cursor-pointer"
            title={t.block.copy}
            onClick={() => copyToClipboard(block)}
          >
            <EmojiIcon name="clipboard" size={20} />
          </button>
          <button
            className="text-slate-600 hover:text-indigo-400 text-sm transition-colors cursor-pointer"
            title={t.block.duplicate}
            onClick={() => onDuplicate ? onDuplicate(block.id) : duplicateBlock(sceneId, block.id)}
          >
            ⧉
          </button>
          <button
            className="text-slate-600 hover:text-red-400 text-sm transition-colors cursor-pointer"
            title={t.block.delete}
            onClick={() => {
              const doDelete = () => onDelete ? onDelete(block.id) : deleteBlock(sceneId, block.id);
              if (confirmDeleteBlock) {
                ask({ message: `${t.block.delete}?`, variant: 'danger' }, doDelete);
              } else {
                doDelete();
              }
            }}
          >
            <EmojiIcon name="close" size={20} />
          </button>
        </div>
      </div>

      {/* Block body */}
      {!collapsed && <div className="block-body p-3">
        {(() => {
          const Editor = BLOCK_EDITORS[block.type];
          if (!Editor) return <div className="text-red-400 text-xs">Unknown block type: {block.type}</div>;
          return (
            <Suspense fallback={<BlockEditorFallback />}>
              <Editor block={block} sceneId={sceneId} onUpdate={(onUpdate ? (p: Partial<Block>) => onUpdate(block.id, p) : undefined) as never} />
            </Suspense>
          );
        })()}
      </div>}
    </div>
    {confirmModal}
    </>
  );
}

/**
 * React.memo prevents re-render when the block prop and callbacks are stable.
 * Zustand's immutable updates preserve refs of unchanged blocks, so typing
 * into block A doesn't re-create block B's props → BlockItem B doesn't re-render.
 */
export const BlockItem = memo(BlockItemImpl);
