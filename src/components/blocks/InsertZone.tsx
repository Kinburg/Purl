import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useT, blockTypeLabel } from '../../i18n';
import { AddBlockMenu } from './AddBlockMenu';
import type { Block } from '../../types';
import { EmojiIcon } from '../shared/EmojiIcons';

interface Props {
  sceneId: string;
  insertIndex: number;
  /** Last zone — always visible, replaces the bottom "Add block" button */
  isLast?: boolean;
  /** Override add handler — bypasses projectStore when provided (used by plugin body editor). */
  onAdd?: (block: Block, insertIndex: number) => void;
  /** Override paste handler — bypasses projectStore when provided. */
  onPaste?: (block: Block, insertIndex: number) => void;
  /** Restrict block types shown in the menu (forwarded to AddBlockMenu). */
  excludeTypes?: import('../../types').BlockType[];
}

export function InsertZone({ sceneId, insertIndex, isLast, onAdd, onPaste, excludeTypes }: Props) {
  const addBlock       = useProjectStore(s => s.addBlock);
  const pasteToScene   = useProjectStore(s => s.pasteToScene);
  const clipboardBlock = useEditorStore(s => s.clipboardBlock);
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleAdd = (block: Block) => {
    if (onAdd) onAdd(block, insertIndex);
    else addBlock(sceneId, block, insertIndex);
    setMenuOpen(false);
  };

  const handlePaste = () => {
    if (!clipboardBlock) return;
    if (onPaste) onPaste(clipboardBlock, insertIndex);
    else pasteToScene(sceneId, clipboardBlock, insertIndex);
  };

  // ── Expanded (block picker open) ────────────────────────────────────────────
  if (menuOpen) {
    return (
      <div className={isLast ? 'mt-1' : 'my-1'}>
        <AddBlockMenu
          sceneId={sceneId}
          onAdd={handleAdd}
          excludeTypes={excludeTypes}
          initialOpen
          onClose={() => setMenuOpen(false)}
        />
      </div>
    );
  }

  // ── Last zone — always visible, styled like the old bottom button ────────────
  if (isLast) {
    return (
      <div className="flex flex-col gap-1 mt-1">
        <button
          className="w-full py-1.5 border border-dashed border-slate-700 hover:border-indigo-500 text-slate-500 hover:text-indigo-400 rounded text-xs transition-colors cursor-pointer"
          onClick={() => setMenuOpen(true)}
        >
          {t.addBlock.trigger}
        </button>
        {clipboardBlock && (
          <button
            className="text-xs text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/50 rounded px-2 py-1 transition-colors cursor-pointer text-left border border-dashed border-indigo-800/50"
            title={t.block.paste(blockTypeLabel(t, clipboardBlock.type))}
            onClick={handlePaste}
          >
            {t.block.paste(blockTypeLabel(t, clipboardBlock.type))}
          </button>
        )}
      </div>
    );
  }

  // ── Regular zone — hover-only, appears between blocks ────────────────────────
  return (
    <div className="group relative h-5 flex items-center">
      {/* Horizontal line */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
      {/* Buttons */}
      <div className="relative flex items-center gap-1 mx-auto opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="text-xs text-slate-500 hover:text-indigo-400 bg-slate-900 border border-slate-700 hover:border-indigo-500 rounded px-1.5 leading-5 cursor-pointer transition-colors"
          title={t.addBlock.trigger}
          onClick={() => setMenuOpen(true)}
        >
          +
        </button>
        {clipboardBlock && (
          <button
            className="text-xs text-slate-500 hover:text-amber-400 bg-slate-900 border border-slate-700 hover:border-amber-600 rounded px-1.5 leading-5 cursor-pointer transition-colors"
            title={t.block.paste(blockTypeLabel(t, clipboardBlock.type))}
            onClick={handlePaste}
          >
            <EmojiIcon name="clipboard" size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
