import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProjectStore } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { useConfirm } from '../shared/ConfirmModal';
import { useT, blockTypeLabel } from '../../i18n';
import type { Block } from '../../types';
import { EmojiIcon } from '../shared/EmojiIcons';
import { TextBlockEditor } from './TextBlockEditor';
import { DialogueBlockEditor } from './DialogueBlockEditor';
import { ChoiceBlockEditor } from './ChoiceBlockEditor';
import { ConditionBlockEditor } from './ConditionBlockEditor';
import { VariableSetBlockEditor } from './VariableSetBlockEditor';
import { SetObjectBlockEditor } from './SetObjectBlockEditor';
import { ForBlockEditor } from './ForBlockEditor';
import { ImageBlockEditor } from './ImageBlockEditor';
import { ImageGenBlockEditor } from './ImageGenBlockEditor';
import { VideoBlockEditor } from './VideoBlockEditor';
import { ButtonBlockEditor } from './ButtonBlockEditor';
import { LinkBlockEditor } from './LinkBlockEditor';
import { InputFieldBlockEditor } from './InputFieldBlockEditor';
import { RawBlockEditor } from './RawBlockEditor';
import { NoteBlockEditor } from './NoteBlockEditor';
import { TableBlockEditor } from './TableBlockEditor';
import { DividerBlockEditor } from './DividerBlockEditor';
import { IncludeBlockEditor } from './IncludeBlockEditor';
import { CheckboxBlockEditor } from './CheckboxBlockEditor';
import { RadioBlockEditor } from './RadioBlockEditor';
import { FunctionBlockEditor } from './FunctionBlockEditor';
import { PopupBlockEditor } from './PopupBlockEditor';
import { AudioBlockEditor } from './AudioBlockEditor';
import { ContainerBlockEditor } from './ContainerBlockEditor';
import { TimeManipulationBlockEditor } from './TimeManipulationBlockEditor';
import { PaperdollBlockEditor } from './PaperdollBlockEditor';
import { InventoryBlockEditor } from './InventoryBlockEditor';
import { PluginBlockEditor } from './PluginBlockEditor';
import { usePluginStore } from '../../store/pluginStore';

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
        {block.type === 'text'              && <TextBlockEditor             block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'dialogue'          && <DialogueBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'choice'            && <ChoiceBlockEditor           block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'condition'         && <ConditionBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'variable-set'      && <VariableSetBlockEditor      block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'set-object'        && <SetObjectBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'for'               && <ForBlockEditor              block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'image'             && <ImageBlockEditor            block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'image-gen'         && <ImageGenBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'video'             && <VideoBlockEditor            block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'button'            && <ButtonBlockEditor           block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'link'              && <LinkBlockEditor             block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'input-field'       && <InputFieldBlockEditor       block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'raw'               && <RawBlockEditor              block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'note'              && <NoteBlockEditor             block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'table'             && <TableBlockEditor            block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'include'           && <IncludeBlockEditor          block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'divider'           && <DividerBlockEditor          block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'checkbox'          && <CheckboxBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'radio'             && <RadioBlockEditor            block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'function'          && <FunctionBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'popup'             && <PopupBlockEditor            block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'audio'             && <AudioBlockEditor            block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'container'         && <ContainerBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'time-manipulation' && <TimeManipulationBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'paperdoll'         && <PaperdollBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'inventory'         && <InventoryBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
        {block.type === 'plugin'            && <PluginBlockEditor            block={block} sceneId={sceneId} onUpdate={onUpdate as never} />}
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
