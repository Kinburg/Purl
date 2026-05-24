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
import { InputFieldBlockEditor } from './InputFieldBlockEditor';
import { RawBlockEditor } from './RawBlockEditor';
import { NoteBlockEditor } from './NoteBlockEditor';
import { DividerBlockEditor } from './DividerBlockEditor';
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
const ContainerBlockEditor  = lazy(() => import('./ContainerBlockEditor').then(m => ({ default: m.ContainerBlockEditor })));
const PaperdollBlockEditor  = lazy(() => import('./PaperdollBlockEditor').then(m => ({ default: m.PaperdollBlockEditor })));
const InventoryBlockEditor  = lazy(() => import('./InventoryBlockEditor').then(m => ({ default: m.InventoryBlockEditor })));
const PluginBlockEditor     = lazy(() => import('./PluginBlockEditor').then(m => ({ default: m.PluginBlockEditor })));

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
  'input-field':       InputFieldBlockEditor       as never,
  'raw':               RawBlockEditor              as never,
  'note':              NoteBlockEditor             as never,
  'table':             TableBlockEditor            as never,
  'include':           IncludeBlockEditor          as never,
  'divider':           DividerBlockEditor          as never,
  'checkbox':          CheckboxBlockEditor         as never,
  'radio':             RadioBlockEditor            as never,
  'function':          FunctionBlockEditor         as never,
  'popup':             PopupBlockEditor            as never,
  'audio':             AudioBlockEditor            as never,
  'audio-gen':         AudioGenBlockEditor         as never,
  'container':         ContainerBlockEditor        as never,
  'time-manipulation': TimeManipulationBlockEditor as never,
  'paperdoll':         PaperdollBlockEditor        as never,
  'inventory':         InventoryBlockEditor        as never,
  'plugin':            PluginBlockEditor           as never,
};

function BlockEditorFallback() {
  return <div className="text-slate-500 text-xs italic py-2">Loading editor…</div>;
}

const BLOCK_COLORS: Record<Block['type'], string> = {
  'text':              'bg-slate-700',
  'dialogue':          'bg-indigo-900/40',
  'choice':            'bg-emerald-900/40',
  'condition':         'bg-amber-900/40',
  'variable-set':      'bg-purple-900/40',
  'set-object':        'bg-purple-900/40',
  'for':               'bg-amber-900/40',
  'button':            'bg-blue-900/40',
  'link':              'bg-emerald-900/40',
  'input-field':       'bg-teal-900/40',
  'image':             'bg-pink-900/40',
  'image-gen':         'bg-fuchsia-900/30',
  'video':             'bg-red-900/40',
  'raw':               'bg-zinc-700/60',
  'note':              'bg-amber-950/60',
  'table':             'bg-cyan-900/40',
  'include':           'bg-sky-900/40',
  'divider':           'bg-slate-700/40',
  'checkbox':          'bg-violet-900/40',
  'radio':             'bg-fuchsia-900/40',
  'function':          'bg-purple-900/40',
  'popup':             'bg-blue-900/40',
  'audio':             'bg-amber-900/40',
  'audio-gen':         'bg-amber-800/30',
  'container':         'bg-teal-900/40',
  'time-manipulation': 'bg-indigo-950/50',
  'paperdoll':         'bg-violet-900/40',
  'inventory':         'bg-teal-900/40',
  'plugin':            'bg-indigo-900/40',
};

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
  onToggleCollapse?: () => void;
  /** Override patch handler (used when block lives outside a scene, e.g. plugin body). */
  onUpdate?: (patch: Partial<Block>) => void;
  /** Override delete handler — bypasses projectStore when provided. */
  onDelete?: () => void;
  /** Override duplicate handler — bypasses projectStore when provided. */
  onDuplicate?: () => void;
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
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  // Tint the whole block with the plugin's color (soft alpha overlay).
  if (pluginDef?.color) {
    style.backgroundColor = hexWithAlpha(pluginDef.color, 0.18);
    style.borderColor = hexWithAlpha(pluginDef.color, 0.6);
  }

  const color = pluginDef ? '' : BLOCK_COLORS[block.type];
  const label = pluginDef?.name ?? blockTypeLabel(t, block.type);
  const border = pluginDef ? '' : (block.type === 'note' ? 'border-amber-800/50' : 'border-slate-700');

  return (
    <>
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded border ${border} ${color} overflow-hidden`}
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
            onClick={onToggleCollapse}
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
            onClick={() => onDuplicate ? onDuplicate() : duplicateBlock(sceneId, block.id)}
          >
            ⧉
          </button>
          <button
            className="text-slate-600 hover:text-red-400 text-sm transition-colors cursor-pointer"
            title={t.block.delete}
            onClick={() => {
              const doDelete = () => onDelete ? onDelete() : deleteBlock(sceneId, block.id);
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
              <Editor block={block} sceneId={sceneId} onUpdate={onUpdate as never} />
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
