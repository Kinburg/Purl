import { useRef } from 'react';
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
import { EmojiIcon } from '../shared/EmojiIcons';
import { CSS } from '@dnd-kit/utilities';
import { useProjectStore, deepCloneBlock } from '../../store/projectStore';
import { useFlatVariablesOf } from '../../hooks/useFlatVariables';
import { useEditorStore } from '../../store/editorStore';
import { VariablePicker } from '../shared/VariablePicker';
import { VarInsertButton } from '../shared/VarInsertButton';
import { useVariableNodes } from '../shared/VariableScope';
import { useT, blockTypeLabel } from '../../i18n';
import type {
  ConditionBlock, ConditionBranch, ConditionBranchType, ConditionOperator, Block, ArrayAccessor,
  TextBlock, DialogueBlock, ChoiceBlock, VariableSetBlock, SetObjectBlock, ImageBlock, VideoBlock, RawBlock, TableBlock, IncludeBlock, DividerBlock, SpacerBlock, ProgressBlock,
  AudioVolumeBlock, DateTimeBlock, CalloutBlock, SelectBlock, SliderBlock, DisplayObjectBlock,
  ForBlock, SaveBlock,
} from '../../types';
import { AddBlockMenu } from './AddBlockMenu';
import { TextBlockEditor } from './TextBlockEditor';
import { DialogueBlockEditor } from './DialogueBlockEditor';
import { ChoiceBlockEditor } from './ChoiceBlockEditor';
import { VariableSetBlockEditor } from './VariableSetBlockEditor';
import { SetObjectBlockEditor } from './SetObjectBlockEditor';
import { ForBlockEditor } from './ForBlockEditor';
import { ImageBlockEditor } from './ImageBlockEditor';
import { VideoBlockEditor } from './VideoBlockEditor';
import { RawBlockEditor } from './RawBlockEditor';
import { TableBlockEditor } from './TableBlockEditor';
import { IncludeBlockEditor } from './IncludeBlockEditor';
import { DividerBlockEditor } from './DividerBlockEditor';
import { SpacerBlockEditor } from './SpacerBlockEditor';
import { ProgressBlockEditor } from './ProgressBlockEditor';
import { AudioVolumeBlockEditor } from './AudioVolumeBlockEditor';
import { DateTimeBlockEditor } from './DateTimeBlockEditor';
import { CalloutBlockEditor } from './CalloutBlockEditor';
import { SelectBlockEditor } from './SelectBlockEditor';
import { SliderBlockEditor } from './SliderBlockEditor';
import { DisplayObjectBlockEditor } from './DisplayObjectBlockEditor';
import { SaveBlockEditor } from './SaveBlockEditor';
import { ArrayAccessorInput } from './ArrayAccessorInput';

/**
 * Single-line input with an adjacent VarInsertButton.
 * Extracted as a component so it can own a ref even inside a .map().
 */
function ConditionValueInput({
  value,
  placeholder,
  className,
  vars,
  variableNodes,
  onFocus,
  onChange,
}: {
  value: string;
  placeholder: string;
  className: string;
  vars: import('../../types').Variable[];
  variableNodes: import('../../types').VariableTreeNode[];
  onFocus: () => void;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        className={className}
        placeholder={placeholder}
        value={value}
        onFocus={onFocus}
        onChange={e => onChange(e.target.value)}
      />
      <VarInsertButton
        targetRef={ref}
        value={value}
        onChange={onChange}
        vars={vars}
        variableNodes={variableNodes}
      />
    </>
  );
}

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: '==', label: '==' },
  { value: '!=', label: '!=' },
  { value: '>',  label: '>'  },
  { value: '<',  label: '<'  },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
];

/** Returns only the operators valid for the given variable type and array accessor. */
function operatorsForType(
  varType: string | undefined,
  accessorKind: ArrayAccessor['kind'] = 'whole',
): { value: ConditionOperator; label: string }[] {
  if (varType === 'array') {
    if (accessorKind === 'index')  return OPERATORS.filter(op => op.value === '==' || op.value === '!=');
    if (accessorKind === 'length') return OPERATORS;  // numeric context
    // whole array: membership / emptiness checks
    return [
      { value: 'contains',  label: 'contains' },
      { value: '!contains', label: '!contains' },
      { value: 'empty',     label: 'is empty' },
      { value: '!empty',    label: 'is not empty' },
    ];
  }
  if (varType === 'boolean' || varType === 'string') {
    return OPERATORS.filter(op => op.value === '==' || op.value === '!=');
  }
  return OPERATORS;
}

/** Whether the given operator requires a value input */
function operatorNeedsValue(op: ConditionOperator): boolean {
  return op !== 'empty' && op !== '!empty';
}

/** Simplified block renderer for nested blocks (no further nesting) */
function NestedBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: Block;
  sceneId: string;
  onUpdate: (patch: Partial<Block>) => void;
}) {
  const t = useT();

  switch (block.type) {
    case 'text':         return <TextBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<TextBlock>) => void} />;
    case 'dialogue':     return <DialogueBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<DialogueBlock>) => void} />;
    case 'choice':       return <ChoiceBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ChoiceBlock>) => void} />;
    case 'variable-set': return <VariableSetBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<VariableSetBlock>) => void} />;
    case 'set-object':   return <SetObjectBlockEditor   block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SetObjectBlock>) => void} />;
    case 'for':          return <ForBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ForBlock>) => void} />;
    case 'image':        return <ImageBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ImageBlock>) => void} />;
    case 'video':        return <VideoBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<VideoBlock>) => void} />;
    case 'raw':          return <RawBlockEditor   block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<RawBlock>) => void} />;
    case 'table':        return <TableBlockEditor   block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<TableBlock>) => void} />;
    case 'include':      return <IncludeBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<IncludeBlock>) => void} />;
    case 'divider':      return <DividerBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<DividerBlock>) => void} />;
    case 'spacer':       return <SpacerBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SpacerBlock>) => void} />;
    case 'progress':     return <ProgressBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ProgressBlock>) => void} />;
    case 'audio-volume': return <AudioVolumeBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<AudioVolumeBlock>) => void} />;
    case 'date-time':    return <DateTimeBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<DateTimeBlock>) => void} />;
    case 'callout':      return <CalloutBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<CalloutBlock>) => void} />;
    case 'save':         return <SaveBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SaveBlock>) => void} />;
    case 'select':       return <SelectBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SelectBlock>) => void} />;
    case 'slider':       return <SliderBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SliderBlock>) => void} />;
    case 'display-object': return <DisplayObjectBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<DisplayObjectBlock>) => void} />;
    // Recursive: a ConditionBlock nested inside a branch renders the full
    // ConditionBlockEditor in local-mode — all mutations route up through the
    // parent's `onUpdate` chain, so the store sees a single patch at the top.
    case 'condition':    return <ConditionBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ConditionBlock>) => void} />;
    default:             return <span className="text-xs text-slate-500">{t.block.unsupportedNested}</span>;
  }
}

/** Sortable wrapper for a nested block with drag handle, copy, duplicate, delete */
function SortableNestedBlock({
  block,
  sceneId,
  onUpdate,
  onDuplicate,
  onCopy,
  onDelete,
}: {
  block: Block;
  sceneId: string;
  onUpdate: (patch: Partial<Block>) => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded border border-slate-700 bg-slate-800/50 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 bg-slate-800/80 border-b border-slate-700">
        <div className="flex items-center gap-1.5">
          <span
            {...listeners}
            {...attributes}
            className="drag-handle text-slate-600 hover:text-slate-400 text-xs select-none cursor-grab active:cursor-grabbing"
            title={t.block.drag}
          >
            ⠿
          </span>
          <span className="text-xs text-slate-400 uppercase tracking-wider">
            {blockTypeLabel(t, block.type)}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            className="text-slate-600 hover:text-slate-300 text-xs cursor-pointer px-0.5 transition-colors"
            title={t.block.copy}
            onClick={onCopy}
          >
            <EmojiIcon name="clipboard" size={20} />
          </button>
          <button
            className="text-slate-600 hover:text-indigo-400 text-xs cursor-pointer px-0.5 transition-colors"
            title={t.block.duplicate}
            onClick={onDuplicate}
          >
            ⧉
          </button>
          <button
            className="text-slate-600 hover:text-red-400 text-xs cursor-pointer px-0.5 transition-colors"
            title={t.block.delete}
            onClick={onDelete}
          >
            <EmojiIcon name="close" size={20} />
          </button>
        </div>
      </div>
      <div className="p-2">
        <NestedBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

export function ConditionBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: ConditionBlock;
  sceneId: string;
  /** When provided (e.g. inside a plugin body), all branch/nested mutations are routed
   *  through this callback instead of projectStore, so the editor works on any parent
   *  state container. */
  onUpdate?: (patch: Partial<ConditionBlock>) => void;
}) {
  // Selector pattern — stable action refs, no full-store subscription.
  const addConditionBranch    = useProjectStore(s => s.addConditionBranch);
  const updateConditionBranch = useProjectStore(s => s.updateConditionBranch);
  const deleteConditionBranch = useProjectStore(s => s.deleteConditionBranch);
  const addNestedBlock        = useProjectStore(s => s.addNestedBlock);
  const updateNestedBlock     = useProjectStore(s => s.updateNestedBlock);
  const deleteNestedBlock     = useProjectStore(s => s.deleteNestedBlock);
  const duplicateNestedBlock  = useProjectStore(s => s.duplicateNestedBlock);
  const pasteToNested         = useProjectStore(s => s.pasteToNested);
  const reorderNestedBlocks   = useProjectStore(s => s.reorderNestedBlocks);
  const saveSnapshot          = useProjectStore(s => s.saveSnapshot);
  const clipboardBlock        = useEditorStore(s => s.clipboardBlock);
  const copyToClipboard       = useEditorStore(s => s.copyToClipboard);
  const t = useT();
  const variableNodes = useVariableNodes();
  const variables = useFlatVariablesOf(variableNodes);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const hasElse = block.branches.some(b => b.branchType === 'else');
  const isLocal = !!onUpdate;

  const setBranches = (branches: ConditionBranch[]) => onUpdate!({ branches });

  // ── Unified branch/nested operations — use onUpdate when provided, else store ──
  const doAddBranch = () => {
    if (!isLocal) return addConditionBranch(sceneId, block.id);
    if (hasElse) return;
    const isFirst = block.branches.length === 0;
    setBranches([
      ...block.branches,
      {
        id: crypto.randomUUID(),
        branchType: isFirst ? 'if' : 'elseif',
        variableId: '', operator: '==', value: '', blocks: [],
      },
    ]);
  };

  const doUpdateBranch = (branchId: string, patch: Partial<ConditionBranch>) => {
    if (!isLocal) return updateConditionBranch(sceneId, block.id, branchId, patch);
    setBranches(block.branches.map(br => br.id === branchId ? { ...br, ...patch } : br));
  };

  const doDeleteBranch = (branchId: string) => {
    if (!isLocal) return deleteConditionBranch(sceneId, block.id, branchId);
    setBranches(block.branches.filter(br => br.id !== branchId));
  };

  const doAddNested = (branchId: string, nb: Block) => {
    if (!isLocal) return addNestedBlock(sceneId, block.id, branchId, nb);
    setBranches(block.branches.map(br => br.id === branchId ? { ...br, blocks: [...br.blocks, nb] } : br));
  };

  const doUpdateNested = (branchId: string, nbId: string, patch: Partial<Block>) => {
    if (!isLocal) return updateNestedBlock(sceneId, block.id, branchId, nbId, patch);
    setBranches(block.branches.map(br =>
      br.id !== branchId ? br : { ...br, blocks: br.blocks.map(b => b.id === nbId ? ({ ...b, ...patch } as Block) : b) }
    ));
  };

  const doDeleteNested = (branchId: string, nbId: string) => {
    if (!isLocal) return deleteNestedBlock(sceneId, block.id, branchId, nbId);
    setBranches(block.branches.map(br => br.id !== branchId ? br : { ...br, blocks: br.blocks.filter(b => b.id !== nbId) }));
  };

  const doDuplicateNested = (branchId: string, nbId: string) => {
    if (!isLocal) return duplicateNestedBlock(sceneId, block.id, branchId, nbId);
    setBranches(block.branches.map(br => {
      if (br.id !== branchId) return br;
      const idx = br.blocks.findIndex(b => b.id === nbId);
      if (idx === -1) return br;
      const blocks = [...br.blocks];
      blocks.splice(idx + 1, 0, deepCloneBlock(br.blocks[idx]));
      return { ...br, blocks };
    }));
  };

  const doPasteNested = (branchId: string, src: Block) => {
    if (!isLocal) return pasteToNested(sceneId, block.id, branchId, src);
    setBranches(block.branches.map(br =>
      br.id === branchId ? { ...br, blocks: [...br.blocks, deepCloneBlock(src)] } : br
    ));
  };

  const doReorderNested = (branchId: string, blocks: Block[]) => {
    if (!isLocal) return reorderNestedBlocks(sceneId, block.id, branchId, blocks);
    setBranches(block.branches.map(br => br.id === branchId ? { ...br, blocks } : br));
  };

  const addElseBranch = () => {
    if (isLocal) {
      setBranches([
        ...block.branches,
        {
          id: crypto.randomUUID(),
          branchType: 'else',
          variableId: '', operator: '==', value: '', blocks: [],
        },
      ]);
      return;
    }
    addConditionBranch(sceneId, block.id);
    setTimeout(() => {
      const state = useProjectStore.getState();
      const currentBlock = state.project.scenes
        .find(s => s.id === sceneId)?.blocks
        .find(b => b.id === block.id);
      if (currentBlock?.type === 'condition') {
        const last = currentBlock.branches[currentBlock.branches.length - 1];
        if (last && last.branchType !== 'else') {
          state.updateConditionBranch(sceneId, block.id, last.id, { branchType: 'else' });
        }
      }
    }, 0);
  };

  const handleNestedDragEnd = (event: DragEndEvent, branchId: string, branchBlocks: Block[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = branchBlocks.findIndex(b => b.id === active.id);
    const newIndex = branchBlocks.findIndex(b => b.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      doReorderNested(branchId, arrayMove(branchBlocks, oldIndex, newIndex));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {block.branches.map((branch, idx) => (
        <div key={branch.id} className="border border-amber-800/40 rounded overflow-hidden">
          {/* Branch header */}
          <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 bg-amber-950/30 border-b border-amber-800/30">
            <select
              className="bg-slate-800 text-xs text-amber-300 rounded px-1.5 py-0.5 outline-none border border-slate-600 cursor-pointer font-mono"
              value={branch.branchType}
              onChange={e =>
                doUpdateBranch(branch.id, {
                  branchType: e.target.value as ConditionBranchType,
                })
              }
            >
              {idx === 0 ? (
                <option value="if">{'<<if>>'}</option>
              ) : (
                <>
                  <option value="elseif">{'<<elseif>>'}</option>
                  <option value="else">{'<<else>>'}</option>
                </>
              )}
            </select>

            {branch.branchType !== 'else' && branch.rawExpression !== undefined && (
              <>
                <input
                  className="flex-1 min-w-0 bg-slate-800 text-xs text-white font-mono rounded px-2 py-1 outline-none border border-amber-700/60 focus:border-amber-500"
                  placeholder={t.condition.rawExpressionPlaceholder}
                  value={branch.rawExpression}
                  onFocus={saveSnapshot}
                  onChange={e => doUpdateBranch(branch.id, { rawExpression: e.target.value })}
                />
                <button
                  title={t.condition.toStructured}
                  className="text-xs rounded px-1.5 py-0.5 border cursor-pointer font-mono shrink-0 transition-colors bg-amber-800/50 text-amber-300 border-amber-600 hover:bg-amber-700/50"
                  onClick={() => doUpdateBranch(branch.id, { rawExpression: undefined })}
                >
                  raw
                </button>
              </>
            )}

            {branch.branchType !== 'else' && branch.rawExpression === undefined && (() => {
              const branchVar = variables.find(v => v.id === branch.variableId);
              const isArray   = branchVar?.varType === 'array';
              const accessorKind = branch.accessor?.kind ?? 'whole';
              const availableOps = operatorsForType(branchVar?.varType, accessorKind);
              // Range mode only for: plain numeric vars, or array.length accessor
              const isNumericContext = (!isArray && (branchVar?.varType === 'number' || branchVar?.varType === undefined))
                || (isArray && accessorKind === 'length');
              const rangeMode = branch.rangeMode && isNumericContext;
              const showValue = !rangeMode && operatorNeedsValue(branch.operator);
              const seedRaw = (): string => {
                if (!branchVar) return '';
                const varName = `$${branchVar.name}`;
                if (rangeMode) return `${varName} >= ${branch.rangeMin ?? '0'} && ${varName} <= ${branch.rangeMax ?? '0'}`;
                if (!showValue) return `${varName} ${branch.operator}`;
                const isStringy = branchVar.varType === 'string' || branchVar.varType === 'datetime';
                const looksLikeRef = /^[_$][A-Za-z_$][\w$.]*$/.test(branch.value);
                const looksLikeLit = /^-?\d+(\.\d+)?$/.test(branch.value) || branch.value === 'true' || branch.value === 'false';
                const val = isStringy && !looksLikeRef && !looksLikeLit
                  ? `"${branch.value}"`
                  : branch.value;
                return `${varName} ${branch.operator} ${val}`;
              };
              return (
              <>
                {/* Variable selector */}
                <VariablePicker
                  value={branch.variableId}
                  onChange={id => {
                    const newVar = variables.find(v => v.id === id);
                    const newAccessorKind = newVar?.varType === 'array' ? (branch.accessor?.kind ?? 'whole') : 'whole';
                    const newOps = operatorsForType(newVar?.varType, newAccessorKind);
                    const opStillValid = newOps.some(op => op.value === branch.operator);
                    const newIsNumeric = newVar?.varType === 'number' || newVar?.varType === undefined;
                    doUpdateBranch(branch.id, {
                      variableId: id,
                      ...(!opStillValid ? { operator: newOps[0].value } : {}),
                      ...(!newIsNumeric && newVar?.varType !== 'array' ? { rangeMode: false, accessor: undefined } : {}),
                    });
                  }}
                  nodes={variableNodes}
                  placeholder={t.condition.varPlaceholder}
                  className="flex-1 min-w-0"
                />

                {/* Array accessor — shown as a full-width second row when var is array */}
                {isArray && (
                  <div className="w-full">
                    <ArrayAccessorInput
                      accessor={branch.accessor}
                      onChange={acc => {
                        const newOps = operatorsForType('array', acc.kind);
                        const opStillValid = newOps.some(op => op.value === branch.operator);
                        doUpdateBranch(branch.id, {
                          accessor: acc,
                          ...(!opStillValid ? { operator: newOps[0].value, rangeMode: false } : {}),
                        });
                      }}
                      vars={variables}
                      allowLength
                    />
                  </div>
                )}

                {/* Range mode toggle — only for numeric context */}
                {isNumericContext && (
                  <button
                    title={t.condition.rangeToggle}
                    className={`text-xs rounded px-1.5 py-0.5 border cursor-pointer font-mono shrink-0 transition-colors ${
                      rangeMode
                        ? 'bg-amber-800/50 text-amber-300 border-amber-600'
                        : 'bg-slate-800 text-slate-500 border-slate-600 hover:text-slate-300'
                    }`}
                    onClick={() =>
                      doUpdateBranch(branch.id, { rangeMode: !branch.rangeMode })
                    }
                  >
                    a≤x≤b
                  </button>
                )}

                {/* Raw mode toggle — escape hatch for compound or, expression LHS, etc. */}
                <button
                  title={t.condition.toRaw}
                  className="text-xs rounded px-1.5 py-0.5 border cursor-pointer font-mono shrink-0 transition-colors bg-slate-800 text-slate-500 border-slate-600 hover:text-slate-300"
                  onClick={() => doUpdateBranch(branch.id, { rawExpression: seedRaw() })}
                >
                  raw
                </button>

                {rangeMode ? (
                  <>
                    <ConditionValueInput
                      className="w-14 bg-slate-800 text-xs text-white rounded px-1.5 py-0.5 outline-none border border-slate-600 font-mono"
                      placeholder={t.condition.rangeMinPlaceholder}
                      value={branch.rangeMin ?? ''}
                      vars={variables}
                      variableNodes={variableNodes}
                      onFocus={saveSnapshot}
                      onChange={v => doUpdateBranch(branch.id, { rangeMin: v })}
                    />
                    <span className="text-xs text-slate-500 shrink-0">≤ x ≤</span>
                    <ConditionValueInput
                      className="w-14 bg-slate-800 text-xs text-white rounded px-1.5 py-0.5 outline-none border border-slate-600 font-mono"
                      placeholder={t.condition.rangeMaxPlaceholder}
                      value={branch.rangeMax ?? ''}
                      vars={variables}
                      variableNodes={variableNodes}
                      onFocus={saveSnapshot}
                      onChange={v => doUpdateBranch(branch.id, { rangeMax: v })}
                    />
                  </>
                ) : (
                  <>
                    {/* Operator selector */}
                    <select
                      className="bg-slate-800 text-xs text-white rounded px-1.5 py-0.5 outline-none border border-slate-600 cursor-pointer font-mono"
                      value={branch.operator}
                      onChange={e =>
                        doUpdateBranch(branch.id, {
                          operator: e.target.value as ConditionOperator,
                        })
                      }
                    >
                      {availableOps.map(op => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>

                    {/* Value input + var insert — hidden for empty/!empty */}
                    {showValue && (
                      <ConditionValueInput
                        className="w-16 bg-slate-800 text-xs text-white rounded px-1.5 py-0.5 outline-none border border-slate-600 font-mono"
                        placeholder={t.condition.valuePlaceholder}
                        value={branch.value}
                        vars={variables}
                        variableNodes={variableNodes}
                        onFocus={saveSnapshot}
                        onChange={v => doUpdateBranch(branch.id, { value: v })}
                      />
                    )}
                  </>
                )}
              </>
              );
            })()}

            <button
              className="ml-auto text-slate-600 hover:text-red-400 text-xs cursor-pointer shrink-0"
              onClick={() => doDeleteBranch(branch.id)}
            >
              <EmojiIcon name="close" size={20} />
            </button>
          </div>

          {/* Nested blocks */}
          <div className="p-2 flex flex-col gap-1.5 bg-slate-900/20">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleNestedDragEnd(e, branch.id, branch.blocks)}
            >
              <SortableContext
                items={branch.blocks.map(nb => nb.id)}
                strategy={verticalListSortingStrategy}
              >
                {branch.blocks.map(nb => (
                  <SortableNestedBlock
                    key={nb.id}
                    block={nb}
                    sceneId={sceneId}
                    onUpdate={(patch) => doUpdateNested(branch.id, nb.id, patch)}
                    onDuplicate={() => doDuplicateNested(branch.id, nb.id)}
                    onCopy={() => copyToClipboard(nb)}
                    onDelete={() => doDeleteNested(branch.id, nb.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>

            <AddBlockMenu
              sceneId={sceneId}
              excludeTypes={['note']}
              onAdd={(nb) => doAddNested(branch.id, nb)}
            />

            {clipboardBlock && (
              <button
                className="text-xs text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/50 rounded px-2 py-1 transition-colors cursor-pointer text-left border border-dashed border-indigo-800/50"
                title={t.block.paste(blockTypeLabel(t, clipboardBlock.type))}
                onClick={() => doPasteNested(branch.id, clipboardBlock)}
              >
                {t.block.paste(blockTypeLabel(t, clipboardBlock.type))}
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="flex gap-2 flex-wrap">
        {!hasElse && (
          <button
            className="text-xs text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded px-2 py-1 transition-colors cursor-pointer"
            onClick={doAddBranch}
          >
            {t.condition.addBranch}
          </button>
        )}
        {block.branches.length > 0 && !hasElse && (
          <button
            className="text-xs text-slate-400 hover:text-slate-300 hover:bg-slate-800 rounded px-2 py-1 transition-colors cursor-pointer"
            onClick={addElseBranch}
          >
            {t.condition.addElse}
          </button>
        )}
        {block.branches.length === 0 && (
          <span className="text-xs text-slate-600 italic px-2">{t.condition.noBranches}</span>
        )}
      </div>
    </div>
  );
}
