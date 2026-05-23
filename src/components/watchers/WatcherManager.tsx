import { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useFlatVariables } from '../../hooks/useFlatVariables';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { useT } from '../../i18n';
import { useConfirm } from '../shared/ConfirmModal';
import { EmojiIcon } from '../shared/EmojiIcons';
import { ArrayAccessorInput } from '../blocks/ArrayAccessorInput';
import { VarValueInput } from '../blocks/VarValueInput';
import { VariablePicker } from '../shared/VariablePicker';
import type {
  Watcher, WatcherCondition, ButtonAction, VarSetAction,
  ConditionOperator, VarOperator, ArrayAccessor, Variable,
} from '../../types';

// ─── Operator helpers (mirrors ConditionBlockEditor) ─────────────────────────

const COND_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: '==', label: '==' },
  { value: '!=', label: '!=' },
  { value: '>',  label: '>'  },
  { value: '<',  label: '<'  },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
];

function condOperatorsForType(
  varType: string | undefined,
  accessorKind: ArrayAccessor['kind'] = 'whole',
): { value: ConditionOperator; label: string }[] {
  if (varType === 'array') {
    if (accessorKind === 'index')  return COND_OPERATORS.filter(op => op.value === '==' || op.value === '!=');
    if (accessorKind === 'length') return COND_OPERATORS;
    return [
      { value: 'contains',  label: 'contains' },
      { value: '!contains', label: '!contains' },
      { value: 'empty',     label: 'is empty' },
      { value: '!empty',    label: 'is not empty' },
    ];
  }
  if (varType === 'boolean' || varType === 'string') {
    return COND_OPERATORS.filter(op => op.value === '==' || op.value === '!=');
  }
  return COND_OPERATORS;
}

const ACTION_OPERATORS_NUM: { value: VarOperator; label: string }[] = [
  { value: '=',  label: '=' },
  { value: '+=', label: '+=' },
  { value: '-=', label: '-=' },
  { value: '*=', label: '*=' },
  { value: '/=', label: '/=' },
];

function actionOpsForVar(varType: string | undefined, accessorKind: ArrayAccessor['kind'] = 'whole') {
  if (varType === 'array') {
    if (accessorKind === 'index') return [{ value: '=' as VarOperator, label: '=' }];
    return [
      { value: '=' as VarOperator,      label: '=' },
      { value: 'push' as VarOperator,   label: 'push' },
      { value: 'remove' as VarOperator, label: 'remove' },
      { value: 'clear' as VarOperator,  label: 'clear' },
    ];
  }
  if (varType === 'number') return ACTION_OPERATORS_NUM;
  return [{ value: '=' as VarOperator, label: '=' }];
}

// ─── ActionRow ────────────────────────────────────────────────────────────────

function ActionRow({
  action,
  vars,
  onChange,
  onDelete,
}: {
  action: VarSetAction;
  vars: Variable[];
  onChange: (patch: Partial<VarSetAction>) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const selVar = vars.find(v => v.id === action.variableId);
  const isArray = selVar?.varType === 'array';
  const accessorKind = action.accessor?.kind ?? 'whole';
  const availableOps = actionOpsForVar(selVar?.varType, accessorKind);

  const project = useProjectStore(s => s.project);

  return (
    <div className="flex flex-col gap-1 bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <VariablePicker
          value={action.variableId}
          onChange={id => {
            const newVar = vars.find(v => v.id === id);
            const leavingArray = isArray && newVar?.varType !== 'array';
            const arrayOpOnNonArray = leavingArray && (action.operator === 'push' || action.operator === 'remove' || action.operator === 'clear');
            onChange({
              variableId: id,
              ...(arrayOpOnNonArray ? { operator: '=' as VarOperator } : {}),
              ...(leavingArray ? { accessor: undefined } : {}),
            });
          }}
          nodes={project.variableNodes}
          placeholder={t.buttonBlock.selectVariable}
          className="flex-1 min-w-0"
        />

        <select
          className="w-16 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 focus:border-indigo-500 outline-none cursor-pointer font-mono"
          value={action.operator}
          onChange={e => onChange({ operator: e.target.value as VarOperator })}
        >
          {availableOps.map(op => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>

        {action.operator !== 'clear' && (
          <VarValueInput
            className="w-20"
            placeholder={selVar?.varType === 'string' || isArray ? 'text' : selVar?.varType === 'boolean' ? 'true' : '1'}
            value={action.value}
            onChange={v => onChange({ value: v })}
            vars={vars}
            variableNodes={project.variableNodes}
          />
        )}

        <button
          className="text-slate-600 hover:text-red-400 transition-colors text-sm cursor-pointer shrink-0"
          onClick={onDelete}
        >
          <EmojiIcon name="close" size={20} />
        </button>
      </div>

      {isArray && (
        <ArrayAccessorInput
          accessor={action.accessor}
          onChange={acc => {
            const newOps = actionOpsForVar(selVar?.varType, acc.kind);
            const opStillValid = newOps.some(op => op.value === action.operator);
            onChange({ accessor: acc, ...(!opStillValid ? { operator: '=' as VarOperator } : {}) });
          }}
          vars={vars}
          allowLength={false}
        />
      )}
    </div>
  );
}

// ─── WatcherCard ─────────────────────────────────────────────────────────────

function WatcherCard({
  watcher,
  vars,
  scenes,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
}: {
  watcher: Watcher;
  vars: Variable[];
  scenes: { id: string; name: string }[];
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<Watcher>) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const project = useProjectStore(s => s.project);

  const patchCondition = (patch: Partial<WatcherCondition>) =>
    onUpdate({ condition: { ...watcher.condition, ...patch } });

  const patchAction = (actionId: string, patch: Partial<ButtonAction>) =>
    onUpdate({ actions: watcher.actions.map(a => a.id === actionId ? { ...a, ...patch } : a) as ButtonAction[] });

  const addAction = () =>
    onUpdate({ actions: [...watcher.actions, { id: crypto.randomUUID(), variableId: '', operator: '=' as VarOperator, value: '' }] });

  const removeAction = (actionId: string) =>
    onUpdate({ actions: watcher.actions.filter(a => a.id !== actionId) });

  const condVar = vars.find(v => v.id === watcher.condition.variableId);
  const accessorKind = watcher.condition.accessor?.kind ?? 'whole';
  const condOps = condOperatorsForType(condVar?.varType, accessorKind);
  const needsValue = watcher.condition.operator !== 'empty' && watcher.condition.operator !== '!empty';
  const navigateType = watcher.navigate?.type ?? 'none';

  // Build collapsed summary
  let summary = '';
  if (condVar) {
    summary = `$${condVar.name} ${watcher.condition.operator}`;
    if (needsValue && watcher.condition.value) summary += ` ${watcher.condition.value}`;
  } else {
    summary = t.watchers.unconditionalLabel;
  }
  if (watcher.navigate?.type === 'scene' && watcher.navigate.sceneId) {
    summary += ` → ${watcher.navigate.sceneId}`;
  } else if (watcher.navigate?.type === 'back') {
    summary += ' → ←';
  }

  return (
    <div className={`rounded border overflow-hidden ${watcher.enabled ? 'border-slate-700' : 'border-slate-800 opacity-60'}`}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-800 transition-colors"
        onClick={onToggle}
      >
        {/* Enable toggle */}
        <button
          className={`text-base leading-none shrink-0 cursor-pointer transition-colors ${watcher.enabled ? 'text-amber-400' : 'text-slate-600'}`}
          title={t.watchers.enabledLabel}
          onClick={e => { e.stopPropagation(); onUpdate({ enabled: !watcher.enabled }); }}
        >
          <EmojiIcon name="bolt" size={20} />
        </button>

        <span className="flex-1 text-xs text-slate-300 truncate font-mono">
          {watcher.label
            ? <span className="text-slate-200">{watcher.label}</span>
            : summary
              ? <span className="text-slate-400">{summary}</span>
              : <span className="text-slate-600 italic">{t.watchers.defaultLabel || '...'}</span>
          }
        </span>

        <button
          className="text-slate-600 hover:text-red-400 text-xs cursor-pointer"
          onClick={e => { e.stopPropagation(); onDelete(); }}
        >
          <EmojiIcon name="trash" size={20} />
        </button>
        <span className="text-slate-500 text-xs">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="px-3 py-2 flex flex-col gap-3 border-t border-slate-700" style={{ borderLeft: '2px solid rgba(245,158,11,0.35)' }}>
          {/* Label */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-16 shrink-0">{t.buttonBlock.labelField}</label>
            <input
              className="flex-1 bg-slate-800 text-xs text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none"
              placeholder={t.watchers.labelPlaceholder}
              value={watcher.label}
              onChange={e => onUpdate({ label: e.target.value })}
            />
          </div>

          {/* Enabled */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-amber-400 cursor-pointer"
              checked={watcher.enabled}
              onChange={e => onUpdate({ enabled: e.target.checked })}
            />
            <span className="text-xs text-slate-400">{t.watchers.enabledLabel}</span>
          </label>

          {/* Condition */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.watchers.conditionSection}</span>

            <div className="flex items-center gap-1.5">
              {/* Variable */}
              <VariablePicker
                value={watcher.condition.variableId}
                onChange={id => {
                  const newVar = vars.find(v => v.id === id);
                  const leavingArray = condVar?.varType === 'array' && newVar?.varType !== 'array';
                  const newOps = condOperatorsForType(newVar?.varType);
                  const opStillValid = newOps.some(op => op.value === watcher.condition.operator);
                  patchCondition({
                    variableId: id,
                    ...(leavingArray ? { accessor: undefined } : {}),
                    ...(!opStillValid ? { operator: newOps[0].value } : {}),
                  });
                }}
                nodes={project.variableNodes}
                placeholder={t.watchers.noVariable}
                className="flex-1 min-w-0"
              />

              {/* Operator */}
              <select
                className="w-24 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 focus:border-indigo-500 outline-none cursor-pointer font-mono"
                value={watcher.condition.operator}
                onChange={e => patchCondition({ operator: e.target.value as ConditionOperator })}
              >
                {condOps.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>

              {/* Value */}
              {needsValue && (
                <VarValueInput
                  className="w-20"
                  placeholder={condVar?.varType === 'boolean' ? 'true' : condVar?.varType === 'string' ? 'text' : '0'}
                  value={watcher.condition.value}
                  onChange={v => patchCondition({ value: v })}
                  vars={vars}
                  variableNodes={project.variableNodes}
                />
              )}
            </div>

            {/* Hint when no variable selected */}
            {!condVar && (
              <p className="text-xs text-amber-500/70 italic">{t.watchers.unconditionalHint}</p>
            )}

            {/* Array accessor */}
            {condVar?.varType === 'array' && (
              <ArrayAccessorInput
                accessor={watcher.condition.accessor}
                onChange={acc => {
                  const newOps = condOperatorsForType('array', acc.kind);
                  const opStillValid = newOps.some(op => op.value === watcher.condition.operator);
                  patchCondition({
                    accessor: acc,
                    ...(!opStillValid ? { operator: newOps[0].value } : {}),
                  });
                }}
                vars={vars}
                allowLength={true}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.watchers.actionsSection}</span>
            {watcher.actions.filter((a): a is VarSetAction => a.type !== 'open-popup').map(a => (
              <ActionRow
                key={a.id}
                action={a}
                vars={vars}
                onChange={patch => patchAction(a.id, patch)}
                onDelete={() => removeAction(a.id)}
              />
            ))}
            <button
              className="text-xs text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1 text-left transition-colors cursor-pointer"
              onClick={addAction}
            >
              {t.watchers.addAction}
            </button>
          </div>

          {/* Navigate */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.watchers.navigateSection}</span>
            <div className="flex items-center gap-1.5">
              <select
                className="flex-1 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 focus:border-indigo-500 outline-none cursor-pointer"
                value={navigateType}
                onChange={e => {
                  const v = e.target.value;
                  if (v === 'none') onUpdate({ navigate: undefined });
                  else if (v === 'back') onUpdate({ navigate: { type: 'back' } });
                  else onUpdate({ navigate: { type: 'scene', sceneId: '' } });
                }}
              >
                <option value="none">{t.watchers.navigateNone}</option>
                <option value="back">{t.watchers.navigateBack}</option>
                <option value="scene">{t.watchers.navigateScene}</option>
              </select>

              {navigateType === 'scene' && (
                <select
                  className="flex-1 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 focus:border-indigo-500 outline-none cursor-pointer"
                  value={watcher.navigate?.type === 'scene' ? watcher.navigate.sceneId : ''}
                  onChange={e => onUpdate({ navigate: { type: 'scene', sceneId: e.target.value } })}
                >
                  <option value="">— scene —</option>
                  {scenes.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WatcherManager ───────────────────────────────────────────────────────────

export function WatcherManager() {
  const t = useT();
  const project        = useProjectStore(s => s.project);
  const addWatcher     = useProjectStore(s => s.addWatcher);
  const updateWatcher  = useProjectStore(s => s.updateWatcher);
  const deleteWatcher  = useProjectStore(s => s.deleteWatcher);
  const watchers = project.watchers ?? [];
  const vars = useFlatVariables();
  const scenes = project.scenes;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const prevLengthRef = useRef(watchers.length);
  const confirmDeleteWatcher = useEditorPrefsStore(s => s.confirmDeleteWatcher);
  const { ask, modal: confirmModal } = useConfirm();

  useEffect(() => {
    if (watchers.length > prevLengthRef.current && watchers.length > 0) {
      setExpandedId(watchers[watchers.length - 1].id);
    }
    prevLengthRef.current = watchers.length;
  }, [watchers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-2 flex flex-col gap-1">
      {/* Add toolbar */}
      <div className="flex gap-1 pb-1 border-b border-slate-800 mb-1">
        <button
          className="flex-1 text-xs text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1.5 transition-colors cursor-pointer border border-dashed border-slate-700 hover:border-indigo-600"
          onClick={addWatcher}
        >
          {t.watchers.add}
        </button>
      </div>

      {watchers.map(w => (
        <WatcherCard
          key={w.id}
          watcher={w}
          vars={vars}
          scenes={scenes}
          expanded={expandedId === w.id}
          onToggle={() => setExpandedId(expandedId === w.id ? null : w.id)}
          onUpdate={patch => updateWatcher(w.id, patch)}
          onDelete={() => {
            const doDelete = () => { deleteWatcher(w.id); if (expandedId === w.id) setExpandedId(null); };
            if (confirmDeleteWatcher) {
              ask({ message: t.watchers.confirmDelete(w.label), variant: 'danger' }, doDelete);
            } else {
              doDelete();
            }
          }}
        />
      ))}

      {watchers.length === 0 && (
        <p className="text-xs text-slate-600 italic px-2 py-1">{t.watchers.empty}</p>
      )}
      {confirmModal}
    </div>
  );
}
