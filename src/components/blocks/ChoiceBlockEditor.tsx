import { useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { ChoiceBlock, ChoiceOption, ConditionOperator, Variable, VariableTreeNode } from '../../types';
import { SYSTEM_TAGS } from '../../types';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { VarInsertButton } from '../shared/VarInsertButton';
import { VariablePicker } from '../shared/VariablePicker';
import { useVariableNodes, usePluginParams } from '../shared/VariableScope';
import { flattenVariables } from '../../utils/treeUtils';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import {
  CHOICE_FIELD_SCHEMA,
  CHOICE_RAW_CSS_HELP,
  simpleBlockCascadeClasses,
} from '../../utils/styleCascade';

// ─── Operators ────────────────────────────────────────────────────────────────

const CHOICE_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: '==', label: '==' },
  { value: '!=', label: '!=' },
  { value: '>',  label: '>'  },
  { value: '<',  label: '<'  },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
];

function operatorsForType(varType?: string): { value: ConditionOperator; label: string }[] {
  if (varType === 'array') {
    return [
      { value: 'contains',  label: 'contains' },
      { value: '!contains', label: '!contains' },
      { value: 'empty',     label: 'is empty' },
      { value: '!empty',    label: 'is not empty' },
    ];
  }
  if (varType === 'boolean' || varType === 'string') {
    return CHOICE_OPERATORS.filter(op => op.value === '==' || op.value === '!=');
  }
  return CHOICE_OPERATORS;
}

function operatorNeedsValue(op: ConditionOperator): boolean {
  return op !== 'empty' && op !== '!empty';
}

// ─── Option label input ───────────────────────────────────────────────────────

/** Isolated so each option gets its own ref (avoids reading refs during render). */
function OptionLabelInput({
  value,
  placeholder,
  vars,
  variableNodes,
  onFocus,
  onChange,
}: {
  value: string;
  placeholder: string;
  vars: Variable[];
  variableNodes?: VariableTreeNode[];
  onFocus: () => void;
  onChange: (label: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        className="flex-1 bg-slate-700 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
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

// ─── Structured condition builder ─────────────────────────────────────────────

/** Full variable-picker + operator + value condition UI for a choice option. */
function ChoiceConditionBuilder({
  opt,
  vars,
  variableNodes,
  condLabel,
  onFocus,
  onUpdate,
}: {
  opt: ChoiceOption;
  vars: Variable[];
  variableNodes: VariableTreeNode[];
  condLabel: string;
  onFocus: () => void;
  onUpdate: (patch: Partial<ChoiceOption>) => void;
}) {
  const valueRef    = useRef<HTMLInputElement>(null);
  const rangeMinRef = useRef<HTMLInputElement>(null);
  const rangeMaxRef = useRef<HTMLInputElement>(null);

  const condVar        = vars.find(v => v.id === opt.conditionVariableId);
  const isNumeric      = condVar?.varType === 'number';
  const rangeMode      = !!opt.conditionRangeMode && isNumeric;
  const availableOps   = operatorsForType(condVar?.varType);
  const currentOp      = (opt.conditionOperator ?? '==') as ConditionOperator;
  const showValue      = !rangeMode && operatorNeedsValue(currentOp);

  const baseInputCls = 'bg-slate-700 text-xs text-slate-300 rounded px-1.5 py-0.5 outline-none border border-slate-600 font-mono focus:border-indigo-500';
  const inputCls     = `w-16 ${baseInputCls}`;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-xs text-slate-400 w-16 shrink-0">{condLabel}</label>

      {/* Variable picker */}
      <VariablePicker
        value={opt.conditionVariableId ?? ''}
        onChange={id => {
          const newVar = vars.find(v => v.id === id);
          const newOps = operatorsForType(newVar?.varType);
          const opStillValid = newOps.some(op => op.value === opt.conditionOperator);
          onUpdate({
            conditionVariableId: id,
            ...(!opStillValid ? { conditionOperator: newOps[0].value as ConditionOperator } : {}),
            // reset range mode when switching to a non-numeric variable
            ...(newVar?.varType !== 'number' ? { conditionRangeMode: false } : {}),
          });
        }}
        nodes={variableNodes}
        placeholder="— variable —"
        className="flex-1 min-w-0"
      />

      {opt.conditionVariableId && (
        <>
          {/* Range toggle — only for numeric variables */}
          {isNumeric && (
            <button
              title="Range (a ≤ x ≤ b)"
              className={`text-xs rounded px-1.5 py-0.5 border cursor-pointer font-mono shrink-0 transition-colors ${
                rangeMode
                  ? 'bg-amber-800/50 text-amber-300 border-amber-600'
                  : 'bg-slate-700 text-slate-500 border-slate-600 hover:text-slate-300'
              }`}
              onClick={() => onUpdate({ conditionRangeMode: !opt.conditionRangeMode })}
            >
              a≤x≤b
            </button>
          )}

          {rangeMode ? (
            /* ── Range mode: min ≤ x ≤ max ── */
            <>
              <input
                ref={rangeMinRef}
                className={inputCls}
                placeholder="min"
                value={opt.conditionRangeMin ?? ''}
                onFocus={onFocus}
                onChange={e => onUpdate({ conditionRangeMin: e.target.value })}
              />
              <VarInsertButton
                targetRef={rangeMinRef}
                value={opt.conditionRangeMin ?? ''}
                onChange={v => onUpdate({ conditionRangeMin: v })}
                vars={vars}
                variableNodes={variableNodes}
              />
              <span className="text-xs text-slate-500 shrink-0">≤ x ≤</span>
              <input
                ref={rangeMaxRef}
                className={inputCls}
                placeholder="max"
                value={opt.conditionRangeMax ?? ''}
                onFocus={onFocus}
                onChange={e => onUpdate({ conditionRangeMax: e.target.value })}
              />
              <VarInsertButton
                targetRef={rangeMaxRef}
                value={opt.conditionRangeMax ?? ''}
                onChange={v => onUpdate({ conditionRangeMax: v })}
                vars={vars}
                variableNodes={variableNodes}
              />
            </>
          ) : (
            /* ── Normal mode: operator + value ── */
            <>
              <select
                className="bg-slate-700 text-xs text-white rounded px-1.5 py-0.5 outline-none border border-slate-600 font-mono cursor-pointer"
                value={currentOp}
                onChange={e => onUpdate({ conditionOperator: e.target.value as ConditionOperator })}
              >
                {availableOps.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>

              {showValue && (
                <>
                  <input
                    ref={valueRef}
                    className={`w-20 ${baseInputCls}`}
                    placeholder="value"
                    value={opt.conditionValue ?? ''}
                    onFocus={onFocus}
                    onChange={e => onUpdate({ conditionValue: e.target.value })}
                  />
                  <VarInsertButton
                    targetRef={valueRef}
                    value={opt.conditionValue ?? ''}
                    onChange={v => onUpdate({ conditionValue: v })}
                    vars={vars}
                    variableNodes={variableNodes}
                  />
                </>
              )}
            </>
          )}

          {/* Clear condition */}
          <button
            className="text-slate-600 hover:text-red-400 text-xs cursor-pointer transition-colors shrink-0"
            title="Clear condition"
            onClick={() => onUpdate({
              conditionVariableId: '', conditionOperator: undefined,
              conditionValue: '', conditionRangeMode: false,
              conditionRangeMin: '', conditionRangeMax: '',
            })}
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export function ChoiceBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: ChoiceBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<ChoiceBlock>) => void;
}) {
  const { project, addChoiceOption, updateChoiceOption, deleteChoiceOption, saveSnapshot, updateBlock } = useProjectStore();
  const variableNodes = useVariableNodes();
  const pluginParams = usePluginParams();
  const sceneParams = pluginParams.filter(p => p.kind === 'scene');
  const scenes = project.scenes.filter(s => !s.tags.some(tag => (SYSTEM_TAGS as readonly string[]).includes(tag)));
  const t = useT();
  const vars = flattenVariables(variableNodes);
  const cascadeClasses = ['tg-choice', ...simpleBlockCascadeClasses(block, project.settings)].join(' ');
  const hasOverride =
    !!project.settings.defaultBlockStyles?.choice?.enabled ||
    !!block.customStyle?.enabled;
  const previewOptions = block.options.length > 0
    ? block.options.slice(0, 3)
    : [
        { id: 'prv1', label: t.choiceBlock.defaultOption + ' 1', targetSceneId: '', condition: '' },
        { id: 'prv2', label: t.choiceBlock.defaultOption + ' 2', targetSceneId: '', condition: '' },
      ];

  const handleAddOption = onUpdate
    ? () => {
        const opt: ChoiceOption = { id: crypto.randomUUID(), label: t.choiceBlock.defaultOption, targetSceneId: '', condition: '' };
        onUpdate({ options: [...block.options, opt] });
      }
    : () => addChoiceOption(sceneId, block.id);

  const handleUpdateOption = onUpdate
    ? (optId: string, patch: Partial<ChoiceOption>) =>
        onUpdate({ options: block.options.map(o => o.id === optId ? { ...o, ...patch } : o) })
    : (optId: string, patch: Partial<ChoiceOption>) =>
        updateChoiceOption(sceneId, block.id, optId, patch);

  const handleDeleteOption = onUpdate
    ? (optId: string) => onUpdate({ options: block.options.filter(o => o.id !== optId) })
    : (optId: string) => deleteChoiceOption(sceneId, block.id, optId);

  return (
    <div className="flex flex-col gap-2">
      {block.options.length === 0 && (
        <p className="text-xs text-slate-500 italic">{t.choiceBlock.empty}</p>
      )}

      {block.options.map((opt, idx) => (
        <div key={opt.id} className="flex flex-col gap-1.5 bg-slate-800/60 rounded p-2 border border-slate-700">
          {/* Label row */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 shrink-0">#{idx + 1}</span>
            <OptionLabelInput
              value={opt.label}
              placeholder={t.choiceBlock.optionPlaceholder}
              vars={vars}
              variableNodes={variableNodes}
              onFocus={saveSnapshot}
              onChange={label => handleUpdateOption(opt.id, { label })}
            />
            <button
              className="text-slate-600 hover:text-red-400 text-xs cursor-pointer transition-colors"
              title={t.choiceBlock.deleteOption}
              onClick={() => handleDeleteOption(opt.id)}
            >
              ✕
            </button>
          </div>

          {/* Target scene */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-16 shrink-0">{t.choiceBlock.targetScene}</label>
            <select
              className="flex-1 bg-slate-700 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
              value={opt.targetSceneId}
              onChange={e => handleUpdateOption(opt.id, { targetSceneId: e.target.value })}
            >
              <option value="">{t.choiceBlock.noScene}</option>
              {sceneParams.length > 0 ? (
                <>
                  <optgroup label="— params —">
                    {sceneParams.map(p => (
                      <option key={p.key} value={`param:${p.key}`}>
                        _{p.key}{p.label ? ` (${p.label})` : ''}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="— scenes —">
                    {scenes.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                  </optgroup>
                </>
              ) : (
                scenes.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)
              )}
            </select>
          </div>

          {/* Structured condition builder */}
          <ChoiceConditionBuilder
            opt={opt}
            vars={vars}
            variableNodes={variableNodes}
            condLabel={t.choiceBlock.conditionLabel}
            onFocus={saveSnapshot}
            onUpdate={patch => handleUpdateOption(opt.id, patch)}
          />
        </div>
      ))}

      <button
        className="text-xs text-emerald-400 hover:text-emerald-300 hover:bg-slate-800 rounded px-2 py-1 text-left transition-colors cursor-pointer"
        onClick={handleAddOption}
      >
        {t.choiceBlock.addOption}
      </button>

      {/* Live preview — cascade-wrapped sample options. Only shown when an
          override is active; otherwise the option rows above are the visual. */}
      {hasOverride && (
        <div className="mt-1 pt-1 border-t border-slate-700/40">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Preview</div>
          <div className={cascadeClasses}>
            {previewOptions.map(opt => (
              <a
                key={opt.id}
                href="#"
                onClick={e => e.preventDefault()}
                style={{ cursor: 'default', userSelect: 'none', textDecoration: 'none' }}
              >
                {opt.label}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Spot-level style override (static only — bound is at project-defaults level) */}
      <details className="border border-slate-700/60 rounded bg-slate-900/30">
        <summary className="text-xs text-slate-300 px-2 py-1.5 cursor-pointer select-none hover:bg-slate-800/50">
          {t.styleOverride.sectionTitle}
        </summary>
        <div className="px-2 pb-2 pt-1">
          <StyleOverrideEditor
            value={block.customStyle}
            onChange={v => onUpdate ? onUpdate({ customStyle: v }) : updateBlock(sceneId, block.id, { customStyle: v } as never)}
            variableNodes={variableNodes}
            allowBound={false}
            fieldsSchema={CHOICE_FIELD_SCHEMA}
            rawCssHelp={CHOICE_RAW_CSS_HELP}
          />
        </div>
      </details>

      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => onUpdate ? onUpdate({ delay: v }) : updateBlock(sceneId, block.id, { delay: v } as never)}
      />
    </div>
  );
}
