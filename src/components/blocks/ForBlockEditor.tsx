import { useRef } from 'react';
import { useProjectStore, deepCloneBlock } from '../../store/projectStore';
import { useFlatVariablesOf } from '../../hooks/useFlatVariables';
import { useEditorStore } from '../../store/editorStore';
import { useT } from '../../i18n';
import { useVariableNodes } from '../shared/VariableScope';
import { VarInsertButton } from '../shared/VarInsertButton';
import type { ForBlock, ForLoopMode, Block } from '../../types';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { NestedBlockList } from './NestedBlockList';

const MODES: { value: ForLoopMode; label: string; desc: string }[] = [
  { value: 'range',  label: 'range',  desc: 'for each item in collection' },
  { value: 'while',  label: 'while',  desc: 'while condition is true' },
  { value: 'cstyle', label: 'C-style', desc: 'init; condition; step' },
];

// ─── Source input — text with $ variable-picker button ──────────────────────

function SourceInput({
  value, onChange, onFocus, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const variableNodes = useVariableNodes();
  const variables = useFlatVariablesOf(variableNodes);
  return (
    <div className="flex-1 flex items-center gap-1 min-w-0">
      <input
        ref={ref}
        className="flex-1 min-w-0 bg-slate-800 text-xs text-white font-mono rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
        value={value}
        onFocus={onFocus}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <VarInsertButton
        targetRef={ref}
        value={value}
        onChange={onChange}
        vars={variables}
        variableNodes={variableNodes}
      />
    </div>
  );
}

// ─── Main editor ─────────────────────────────────────────────────────────────
// The body block list (drag, add, edit, delete, duplicate, paste) lives in the
// shared NestedBlockList; drag REORDER/MOVE is handled by SceneEditor's single
// DndContext.

export function ForBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: ForBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<ForBlock>) => void;
}) {
  const updateBlock     = useProjectStore(s => s.updateBlock);
  const saveSnapshot    = useProjectStore(s => s.saveSnapshot);
  const copyToClipboard = useEditorStore(s => s.copyToClipboard);
  const t = useT();

  const update = onUpdate ?? ((p: Partial<ForBlock>) => updateBlock(sceneId, block.id, p as never));
  const setBlocks = (blocks: Block[]) => update({ blocks });

  // ── body mutations ──────────────────────────────────────────────────────
  const addBlock = (b: Block) => setBlocks([...block.blocks, b]);
  const updateBodyBlock = (id: string, patch: Partial<Block>) =>
    setBlocks(block.blocks.map(b => b.id === id ? ({ ...b, ...patch } as Block) : b));
  const deleteBodyBlock = (id: string) => setBlocks(block.blocks.filter(b => b.id !== id));
  const duplicateBodyBlock = (id: string) => {
    const idx = block.blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    const next = [...block.blocks];
    next.splice(idx + 1, 0, deepCloneBlock(block.blocks[idx]));
    setBlocks(next);
  };
  const pasteBodyBlock = (src: Block) => setBlocks([...block.blocks, deepCloneBlock(src)]);

  // ── mode change keeps other-mode fields intact, only seeds defaults ──
  const changeMode = (mode: ForLoopMode) => {
    const patch: Partial<ForBlock> = { mode };
    if (mode === 'range' && !block.valueVar) patch.valueVar = '_item';
    if (mode === 'cstyle') {
      if (!block.initExpr)        patch.initExpr = '_i to 0';
      if (!block.cstyleCondition) patch.cstyleCondition = '_i lt 10';
      if (!block.stepExpr)        patch.stepExpr = '_i++';
    }
    update(patch);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Mode selector */}
      <div className="flex items-center gap-1 bg-slate-900/40 rounded p-1 border border-slate-700/60">
        {MODES.map(m => (
          <button
            key={m.value}
            className={`flex-1 text-xs px-2 py-1 rounded transition-colors cursor-pointer font-mono ${
              block.mode === m.value
                ? 'bg-amber-800/50 text-amber-200 border border-amber-600/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={m.desc}
            onClick={() => changeMode(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Mode-specific fields */}
      {block.mode === 'range' && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-amber-300 shrink-0 font-mono">&lt;&lt;for</span>
          <input
            className="w-20 bg-slate-800 text-xs text-white font-mono rounded px-1.5 py-1 outline-none border border-slate-600 focus:border-indigo-500"
            placeholder="_key"
            value={block.keyVar ?? ''}
            onFocus={saveSnapshot}
            onChange={e => update({ keyVar: e.target.value || undefined })}
          />
          <span className="text-xs text-slate-500 shrink-0">,</span>
          <input
            className="w-20 bg-slate-800 text-xs text-white font-mono rounded px-1.5 py-1 outline-none border border-slate-600 focus:border-indigo-500"
            placeholder="_value"
            value={block.valueVar ?? ''}
            onFocus={saveSnapshot}
            onChange={e => update({ valueVar: e.target.value })}
          />
          <span className="text-xs text-amber-300 shrink-0 font-mono">range</span>
          <SourceInput
            value={block.source ?? ''}
            onChange={v => update({ source: v })}
            onFocus={saveSnapshot}
            placeholder="$collection"
          />
          <span className="text-xs text-amber-300 shrink-0 font-mono">&gt;&gt;</span>
        </div>
      )}

      {block.mode === 'while' && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-amber-300 shrink-0 font-mono">&lt;&lt;for</span>
          <SourceInput
            value={block.whileCondition ?? ''}
            onChange={v => update({ whileCondition: v })}
            onFocus={saveSnapshot}
            placeholder="$counter < 10"
          />
          <span className="text-xs text-amber-300 shrink-0 font-mono">&gt;&gt;</span>
        </div>
      )}

      {block.mode === 'cstyle' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0 w-12 font-mono text-right">init:</span>
            <SourceInput
              value={block.initExpr ?? ''}
              onChange={v => update({ initExpr: v })}
              onFocus={saveSnapshot}
              placeholder="_i to 0"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0 w-12 font-mono text-right">cond:</span>
            <SourceInput
              value={block.cstyleCondition ?? ''}
              onChange={v => update({ cstyleCondition: v })}
              onFocus={saveSnapshot}
              placeholder="_i lt 10"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0 w-12 font-mono text-right">step:</span>
            <SourceInput
              value={block.stepExpr ?? ''}
              onChange={v => update({ stepExpr: v })}
              onFocus={saveSnapshot}
              placeholder="_i++"
            />
          </div>
        </div>
      )}

      {/* Body */}
      <div className="border border-amber-800/40 rounded p-2 flex flex-col gap-1.5 bg-slate-900/20">
        <div className="text-[10px] text-amber-300/60 uppercase tracking-wider px-1">{t.forBlock.bodyLabel}</div>
        <NestedBlockList
          sceneId={sceneId}
          containerId={block.id}
          containerKind="for"
          blocks={block.blocks}
          onAdd={addBlock}
          onUpdate={updateBodyBlock}
          onDelete={deleteBodyBlock}
          onDuplicate={duplicateBodyBlock}
          onCopy={b => copyToClipboard(b)}
          onPaste={pasteBodyBlock}
        />
      </div>

      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => update({ delay: v })}
      />
    </div>
  );
}
