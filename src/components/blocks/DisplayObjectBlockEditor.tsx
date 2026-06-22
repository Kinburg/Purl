import { useEffect } from 'react';
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
import { useProjectStore } from '../../store/projectStore';
import type {
  DisplayObjectBlock, DisplayField, DisplayObjectLayout, DisplayFieldRender,
  VariableTreeNode,
} from '../../types';
import { useT } from '../../i18n';
import { useVariableNodes } from '../shared/VariableScope';
import { VariablePicker } from '../shared/VariablePicker';
import NumericInput from '../shared/NumericInput';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import { DISPLAY_OBJECT_FIELD_SCHEMA, DISPLAY_OBJECT_RAW_CSS_HELP } from '../../utils/styleCascade';
import { findGroupById, reconcileFields, fieldsEqual } from '../../utils/displayObjectFields';

const LAYOUTS: DisplayObjectLayout[] = ['list', 'inline', 'table', 'cards', 'grid', 'bars'];
const RENDERS: DisplayFieldRender[]   = ['text', 'bar', 'bool', 'badge'];

const BTN     = 'px-2 py-1 rounded text-xs cursor-pointer border transition-colors';
const BTN_ON  = 'bg-indigo-600 border-indigo-500 text-white';
const BTN_OFF = 'bg-slate-800 border-slate-600 text-slate-300 hover:text-white';

type DobTranslations = ReturnType<typeof useT>['displayObjectBlock'];

export function DisplayObjectBlockEditor({
  block, sceneId, onUpdate,
}: {
  block: DisplayObjectBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<DisplayObjectBlock>) => void;
}) {
  const t = useT();
  const dob = t.displayObjectBlock;
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const variableNodes = useVariableNodes();
  const patch = onUpdate ?? ((p: Partial<DisplayObjectBlock>) => updateBlock(sceneId, block.id, p));

  const autoSyncing = !!block.autoSync && block.source === 'group' && !!block.groupId;

  // Auto-sync effect — when on, reconcile fields with the group on every change
  // to the variable tree or the group selection. The equality check stops loops.
   
  useEffect(() => {
    if (!autoSyncing) return;
    const group = findGroupById(variableNodes, block.groupId!);
    if (!group) return;
    const next = reconcileFields(block.fields, group);
    if (!fieldsEqual(next, block.fields)) {
      patch({ fields: next });
    }
    // `patch` deliberately omitted: the effect tracks data changes, not the per-render
    // callback identity; the fieldsEqual guard above prevents update loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncing, block.groupId, block.fields, variableNodes]);

  const patchField = (id: string, p: Partial<DisplayField>) =>
    patch({ fields: block.fields.map(f => f.id === id ? { ...f, ...p } : f) });
  const addField = () =>
    patch({ fields: [...block.fields, { id: crypto.randomUUID(), variableId: '', render: 'text' as const }] });
  const removeField = (id: string) =>
    patch({ fields: block.fields.filter(f => f.id !== id) });

  /** Replace `fields` with auto-generated entries for every leaf variable in the
   *  picked group. One-shot — used when autoSync is off. */
  const loadFromGroup = () => {
    if (!block.groupId) return;
    const group = findGroupById(variableNodes, block.groupId);
    if (!group) return;
    saveSnapshot();
    // Same shape as reconcileFields([], group) — every leaf becomes a default field.
    patch({ fields: reconcileFields([], group) });
  };

  // dnd-kit sensors — same activation distance as Section/Tabs.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = block.fields.findIndex(f => f.id === active.id);
    const newIdx = block.fields.findIndex(f => f.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    saveSnapshot();
    patch({ fields: arrayMove(block.fields, oldIdx, newIdx) });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Source */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-24 shrink-0">{dob.sourceLabel}</label>
        <button className={`${BTN} ${block.source === 'group' ? BTN_ON : BTN_OFF}`}
          onClick={() => patch({ source: 'group' })}>{dob.sourceGroup}</button>
        <button className={`${BTN} ${block.source === 'manual' ? BTN_ON : BTN_OFF}`}
          onClick={() => patch({ source: 'manual' })}>{dob.sourceManual}</button>
      </div>

      {/* Group picker + load button + auto-sync toggle */}
      {block.source === 'group' && (
        <>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-24 shrink-0">{dob.groupLabel}</label>
            <VariablePicker
              value={block.groupId ?? ''}
              onChange={id => patch({ groupId: id })}
              nodes={variableNodes}
              placeholder={dob.selectGroup}
              allowGroups
              className="flex-1 min-w-0"
            />
            {!block.autoSync && (
              <button
                className="px-2 py-1 rounded text-xs bg-indigo-700 hover:bg-indigo-600 text-white cursor-pointer disabled:opacity-50 shrink-0"
                disabled={!block.groupId}
                onClick={loadFromGroup}
                title={dob.loadFieldsHint}
              >
                {dob.loadFields}
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer pl-[100px]" title={dob.autoSyncHint}>
            <input
              type="checkbox"
              className="accent-indigo-500 cursor-pointer"
              checked={!!block.autoSync}
              onChange={e => patch({ autoSync: e.target.checked })}
            />
            <span className="text-xs text-slate-300">{dob.autoSync}</span>
          </label>
        </>
      )}

      {/* Layout */}
      <div className="flex items-start gap-2">
        <label className="text-xs text-slate-400 w-24 shrink-0 pt-1">{dob.layoutLabel}</label>
        <div className="flex flex-wrap gap-1">
          {LAYOUTS.map(l => (
            <button key={l}
              className={`${BTN} ${block.layout === l ? BTN_ON : BTN_OFF}`}
              onClick={() => patch({ layout: l })}>
              {dob.layouts[l]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid columns */}
      {block.layout === 'grid' && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-24 shrink-0">{dob.columns}</label>
          <NumericInput
            value={block.columns ?? 2} min={1} max={6}
            className="w-20 text-xs bg-slate-800 text-white rounded px-2 py-1 border border-slate-600 outline-none font-mono"
            onFocus={saveSnapshot}
            onChange={v => patch({ columns: v })}
          />
        </div>
      )}

      {/* Live */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" className="accent-indigo-500 cursor-pointer"
          checked={!!block.live} onChange={e => patch({ live: e.target.checked })} />
        <span className="text-xs text-slate-300">{dob.live}</span>
      </label>

      {/* Fields */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{dob.fieldsTitle}</span>
          {!autoSyncing && (
            <button className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer" onClick={addField}>
              {dob.addField}
            </button>
          )}
        </div>

        {autoSyncing && block.fields.length > 0 && (
          <div className="text-[10px] text-slate-500 italic px-1 leading-snug">{dob.autoSyncNotice}</div>
        )}

        {block.fields.length === 0 && (
          <div className="text-xs text-slate-500 italic px-1">{dob.noFields}</div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={block.fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-1.5">
              {block.fields.map(f => (
                <SortableFieldRow
                  key={f.id}
                  field={f}
                  variableNodes={variableNodes}
                  onPatch={p => patchField(f.id, p)}
                  onDelete={() => removeField(f.id)}
                  allowDelete={!autoSyncing}
                  dob={dob}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Cascade override (spot layer; static-only) */}
      <details className="border border-slate-700/60 rounded bg-slate-900/30">
        <summary className="text-xs text-slate-300 px-2 py-1.5 cursor-pointer select-none hover:bg-slate-800/50">
          {t.styleOverride.sectionTitle}
        </summary>
        <div className="px-2 pb-2 pt-1">
          <StyleOverrideEditor
            value={block.customStyle}
            onChange={v => patch({ customStyle: v })}
            variableNodes={variableNodes}
            allowBound={false}
            fieldsSchema={DISPLAY_OBJECT_FIELD_SCHEMA}
            rawCssHelp={DISPLAY_OBJECT_RAW_CSS_HELP}
          />
        </div>
      </details>

      <BlockEffectsPanel delay={block.delay} onDelayChange={v => patch({ delay: v })} />
    </div>
  );
}

function SortableFieldRow({
  field, variableNodes, onPatch, onDelete, allowDelete, dob,
}: {
  field: DisplayField;
  variableNodes: VariableTreeNode[];
  onPatch: (p: Partial<DisplayField>) => void;
  onDelete: () => void;
  allowDelete: boolean;
  dob: DobTranslations;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col gap-1 bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          {...listeners}
          {...attributes}
          className="drag-handle text-slate-600 hover:text-slate-400 text-xs select-none cursor-grab active:cursor-grabbing shrink-0"
          title={dob.dragField}
        >⠿</span>
        <VariablePicker
          value={field.variableId}
          onChange={id => onPatch({ variableId: id })}
          nodes={variableNodes}
          placeholder={dob.selectField}
          className="flex-1 min-w-[120px]"
        />
        <input
          className="flex-1 min-w-[100px] bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 focus:border-indigo-500 outline-none"
          placeholder={dob.fieldLabelPlaceholder}
          value={field.label ?? ''}
          onChange={e => onPatch({ label: e.target.value })}
        />
        <select
          className="bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 cursor-pointer outline-none"
          value={field.render ?? 'text'}
          onChange={e => onPatch({ render: e.target.value as DisplayFieldRender })}
        >
          {RENDERS.map(r => <option key={r} value={r}>{dob.renders[r]}</option>)}
        </select>
        {allowDelete && (
          <button
            className="text-slate-600 hover:text-red-400 text-sm cursor-pointer shrink-0"
            title={dob.deleteField}
            onClick={onDelete}
          >✕</button>
        )}
      </div>

      {field.render === 'bar' && (
        <div className="flex items-center gap-1.5 flex-wrap pl-1">
          <span className="text-[10px] text-slate-500 uppercase">{dob.barMax}</span>
          <input
            type="number"
            className="w-16 bg-slate-800 text-xs text-white rounded px-1.5 py-0.5 border border-slate-600 outline-none font-mono disabled:opacity-50"
            placeholder="100"
            value={field.maxValue ?? ''}
            onChange={e => onPatch({ maxValue: e.target.value === '' ? undefined : Number(e.target.value) })}
            disabled={!!field.maxVariableId}
          />
          <span className="text-[10px] text-slate-600">{dob.barMaxOr}</span>
          <VariablePicker
            value={field.maxVariableId ?? ''}
            onChange={id => onPatch({ maxVariableId: id || undefined })}
            nodes={variableNodes}
            placeholder={dob.barMaxVar}
            filterType="number"
            className="flex-1 min-w-[80px]"
          />
        </div>
      )}
    </div>
  );
}
