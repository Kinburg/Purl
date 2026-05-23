import { useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useFlatVariablesOf } from '../../hooks/useFlatVariables';
import type { VariableSetBlock, VarOperator, RandomConfig, VarValueMode, StringBoundEntry } from '../../types';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { ArrayAccessorInput } from './ArrayAccessorInput';
import { VariablePicker } from '../shared/VariablePicker';
import { VarInsertButton } from '../shared/VarInsertButton';
import { useVariableNodes } from '../shared/VariableScope';
import NumericInput from '../shared/NumericInput';

/** Default RandomConfig strictly matching the variable type */
function defaultRandomConfig(varType: string): RandomConfig {
  switch (varType) {
    case 'number':  return { kind: 'number', min: 0, max: 100 };
    case 'boolean': return { kind: 'boolean' };
    default:        return { kind: 'string', length: 8 };
  }
}

/** Preview snippet for random mode */
function randomPreview(varName: string, cfg: RandomConfig, operator: VarOperator): string {
  switch (cfg.kind) {
    case 'number': {
      const expr = `random(${cfg.min}, ${cfg.max})`;
      return operator === '='
        ? `<<set $${varName} to ${expr}>>`
        : `<<set $${varName} ${operator} ${expr}>>`;
    }
    case 'boolean':
      return `<<set $${varName} to either(true, false)>>`;
    case 'string':
      return `<<set $${varName} to Array(${cfg.length}).fill(0).map(()=>"abcdefghijklmnopqrstuvwxyz0123456789".charAt(random(0,35))).join("")>>`;
  }
}

export function VariableSetBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: VariableSetBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<VariableSetBlock>) => void;
}) {
  const t = useT();
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const variableNodes = useVariableNodes();
  const update = onUpdate ?? ((p: Partial<VariableSetBlock>) => updateBlock(sceneId, block.id, p as never));
  const variables   = useFlatVariablesOf(variableNodes);
  const selectedVar = variables.find(v => v.id === block.variableId);
  const exprInputRef    = useRef<HTMLInputElement>(null);
  const manualValueRef  = useRef<HTMLInputElement>(null);

  const OPERATORS: { value: VarOperator; label: string }[] = [
    { value: '=',  label: t.variableSetBlock.opAssign },
    { value: '+=', label: t.variableSetBlock.opAdd },
    { value: '-=', label: t.variableSetBlock.opSubtract },
    { value: '*=', label: t.variableSetBlock.opMultiply },
    { value: '/=', label: t.variableSetBlock.opDivide },
  ];

  const ARRAY_OPS_WHOLE: { value: VarOperator; label: string }[] = [
    { value: '=',      label: t.variableSetBlock.opAssign },
    { value: 'push',   label: t.variableSetBlock.opPush },
    { value: 'remove', label: t.variableSetBlock.opRemove },
    { value: 'clear',  label: t.variableSetBlock.opClear },
  ];

  const ARRAY_OPS_INDEX: { value: VarOperator; label: string }[] = [
    { value: '=', label: t.variableSetBlock.opAssign },
  ];

  // Backward compat: old saves used randomize boolean
  const rawMode: VarValueMode = block.valueMode ?? (block.randomize ? 'random' : 'manual');
  const isNumber  = selectedVar?.varType === 'number';
  const isString  = selectedVar?.varType === 'string';
  const isArray   = selectedVar?.varType === 'array';
  const accessorKind = block.accessor?.kind ?? 'whole';

  // Normalize: if the stored mode is incompatible with the current variable type, display as 'manual'.
  const effectiveMode: VarValueMode =
    (rawMode === 'expression' && !isNumber) ? 'manual' :
    (rawMode === 'dynamic'    && !isString) ? 'manual' :
    isArray ? 'manual' :   // array always manual
    rawMode;

  // Always enforce the correct random config kind for the current variable type.
  const expectedKind = isNumber ? 'number' : selectedVar?.varType === 'boolean' ? 'boolean' : 'string';
  const cfg: RandomConfig | undefined = selectedVar && !isArray
    ? (block.randomConfig?.kind === expectedKind ? block.randomConfig : defaultRandomConfig(selectedVar.varType))
    : undefined;

  // ── Mode options per variable type ─────────────────────────────────────────
  const modeOptions: [VarValueMode, string][] = isArray
    ? [] // array type: no mode selector (always manual)
    : isNumber
    ? [['manual', t.variableSetBlock.modeManual], ['random', t.variableSetBlock.modeRandom], ['expression', t.variableSetBlock.modeExpression]]
    : isString
    ? [['manual', t.variableSetBlock.modeManual], ['random', t.variableSetBlock.modeRandom], ['dynamic', t.variableSetBlock.modeDynamic]]
    : /* boolean */
      [['manual', t.variableSetBlock.modeManual], ['random', t.variableSetBlock.modeRandom]];

  // ── Available operators based on type + accessor ────────────────────────────
  const availableOperators = isArray
    ? (accessorKind === 'index' ? ARRAY_OPS_INDEX : ARRAY_OPS_WHOLE)
    : (isNumber ? OPERATORS : OPERATORS.filter(op => op.value === '='));

  // ── Mode switch ─────────────────────────────────────────────────────────────
  const setMode = (mode: VarValueMode) => {
    if (mode === 'random' && selectedVar) {
      update({
        valueMode: 'random',
        randomize: true,
        // For numbers, keep current operator (e.g. $hp -= random(10, 15))
        // For string/boolean, only = makes sense
        ...(selectedVar.varType !== 'number' ? { operator: '=' as VarOperator } : {}),
        // Always reset to the correct kind — prevents stale config bugs
        randomConfig: defaultRandomConfig(selectedVar.varType),
      });
    } else if (mode === 'expression') {
      update({ valueMode: 'expression', randomize: false });
    } else if (mode === 'dynamic') {
      update({ valueMode: 'dynamic', randomize: false });
    } else {
      update({ valueMode: 'manual', randomize: false });
    }
  };

  const updateCfg = (patch: Partial<RandomConfig>) => {
    if (!cfg) return;
    update({ randomConfig: { ...cfg, ...patch } as RandomConfig });
  };

  // ── Expression mode: insert $varname at cursor ──────────────────────────────
  const insertVar = (varName: string) => {
    const input = exprInputRef.current;
    const token = `$${varName}`;
    if (!input) {
      update({ expression: (block.expression ?? '') + token });
      return;
    }
    const start = input.selectionStart ?? 0;
    const end   = input.selectionEnd   ?? 0;
    const next  = (block.expression ?? '').slice(0, start) + token + (block.expression ?? '').slice(end);
    update({ expression: next });
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + token.length;
      input.setSelectionRange(pos, pos);
    });
  };

  // ── Dynamic mode mapping helpers ────────────────────────────────────────────
  const dynMapping = block.dynamicMapping ?? [];

  const addDynEntry = () => update({
    dynamicMapping: [...dynMapping, {
      id: crypto.randomUUID(),
      matchType: 'exact',
      value: '', rangeMin: '', rangeMax: '',
      result: '',
    } satisfies StringBoundEntry],
  });

  const patchDynEntry = (i: number, patch: Partial<StringBoundEntry>) =>
    update({ dynamicMapping: dynMapping.map((m, j) => j === i ? { ...m, ...patch } : m) });

  const removeDynEntry = (i: number) =>
    update({ dynamicMapping: dynMapping.filter((_, j) => j !== i) });

  // ── Preview ─────────────────────────────────────────────────────────────────
  let preview: string | null = null;
  if (selectedVar && block.variableId) {
    const op = block.operator === '=' ? 'to' : block.operator;
    if (effectiveMode === 'expression' && block.expression) {
      preview = `<<set $${selectedVar.name} ${op} ${block.expression}>>`;
    } else if (effectiveMode === 'random' && cfg) {
      preview = randomPreview(selectedVar.name, cfg, block.operator);
    } else if (effectiveMode === 'manual' && block.value) {
      const val = selectedVar.varType === 'string' ? `"${block.value}"` : block.value;
      preview = `<<set $${selectedVar.name} ${op} ${val}>>`;
    } else if (effectiveMode === 'dynamic' && dynMapping.length > 0) {
      const cv = variables.find(v => v.id === block.dynamicVariableId);
      const cvName = cv ? `$${cv.name}` : '$???';
      const first = dynMapping[0];
      const cond  = (first.matchType ?? 'exact') === 'range'
        ? `${cvName} >= ${first.rangeMin ?? '0'} && ${cvName} <= ${first.rangeMax ?? '0'}`
        : `${cvName} eq ${cv?.varType === 'string' ? `"${first.value}"` : first.value}`;
      const more  = dynMapping.length > 1 ? `…` : '';
      preview = `<<if ${cond}>><<set $${selectedVar.name} to "${first.result}">>${more}<</if>>`;
    }
  }

  const numberVars = variables.filter(v => v.varType === 'number');

  return (
    <div className="flex flex-col gap-2">

      {/* ── Variable selector ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.variableSetBlock.variableLabel}</label>
        <VariablePicker
          value={block.variableId}
          onChange={newVarId => {
            const newVar   = variables.find(v => v.id === newVarId);
            const switchingToArray   = newVar?.varType === 'array';
            const switchingFromArray = selectedVar?.varType === 'array';
            // Reset mode when switching to an incompatible variable type
            const needsReset =
              (rawMode === 'expression' && newVar?.varType !== 'number') ||
              (rawMode === 'dynamic'    && newVar?.varType !== 'string') ||
              switchingToArray || switchingFromArray;
            // Reset operator: for non-number non-array, only '=' is valid
            const needsOperatorReset = newVar?.varType !== 'number' && newVar?.varType !== 'array' && block.operator !== '=';
            // Reset array-only operators when leaving array type
            const arrayOpOnNonArray = switchingFromArray && !switchingToArray && (block.operator === 'push' || block.operator === 'remove' || block.operator === 'clear');
            update({
              variableId: newVarId,
              ...(needsReset ? { valueMode: 'manual', randomize: false } : {}),
              ...((needsOperatorReset || arrayOpOnNonArray) ? { operator: '=' as VarOperator } : {}),
              ...(switchingFromArray ? { accessor: undefined } : {}),
            });
          }}
          nodes={variableNodes}
          placeholder={t.variableSetBlock.selectVariable}
        />
        {variables.length === 0 && (
          <span className="text-xs text-slate-500 italic">{t.variableSetBlock.noVariables}</span>
        )}
      </div>

      {/* ── Array accessor ────────────────────────────────────────────────── */}
      {isArray && (
        <ArrayAccessorInput
          accessor={block.accessor}
          onChange={acc => {
            // Reset operator if current op is not valid for new accessor kind
            const newOps = acc.kind === 'index' ? ARRAY_OPS_INDEX : ARRAY_OPS_WHOLE;
            const opStillValid = newOps.some(op => op.value === block.operator);
            update({
              accessor: acc,
              ...(!opStillValid ? { operator: newOps[0].value as VarOperator } : {}),
            });
          }}
          vars={variables}
          allowLength={false}
        />
      )}

      {/* ── Operator — hidden for dynamic mode (always =) ─────────────────── */}
      {selectedVar && effectiveMode !== 'dynamic' && (effectiveMode !== 'random' || cfg?.kind === 'number') && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-20 shrink-0">{t.variableSetBlock.operationLabel}</label>
          <select
            className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
            value={block.operator}
            onChange={e => update({ operator: e.target.value as VarOperator })}
          >
            {availableOperators.map(op => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Mode selector — pills for all variable types ───────────────────── */}
      {selectedVar && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-20 shrink-0">{t.variableSetBlock.valueLabel}</label>
          <div className="flex gap-1">
            {modeOptions.map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setMode(mode)}
                className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
                  effectiveMode === mode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Manual value input — hidden when operator is 'clear' ─────────── */}
      {effectiveMode === 'manual' && block.operator !== 'clear' && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-20 shrink-0" />
          <input
            ref={manualValueRef}
            className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 font-mono"
            placeholder={
              isArray                            ? t.variableSetBlock.textPlaceholder :
              selectedVar?.varType === 'string'  ? t.variableSetBlock.textPlaceholder :
              selectedVar?.varType === 'boolean' ? 'true / false' : '0'
            }
            value={block.value}
            onFocus={saveSnapshot}
            onChange={e => update({ value: e.target.value })}
          />
          <VarInsertButton
            targetRef={manualValueRef}
            value={block.value}
            onChange={v => update({ value: v })}
            vars={variables}
            variableNodes={variableNodes}
          />
        </div>
      )}

      {/* ── Expression mode (numbers) — text input + $var chips ───────────── */}
      {effectiveMode === 'expression' && (
        <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-indigo-800/50">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-20 shrink-0">{t.variableSetBlock.expressionLabel}</label>
            <input
              ref={exprInputRef}
              className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 font-mono"
              placeholder="$maxHp, $str + 5, ..."
              value={block.expression ?? ''}
              onFocus={saveSnapshot}
              onChange={e => update({ expression: e.target.value })}
            />
          </div>
          {numberVars.length > 0 && (
            <div className="flex flex-wrap gap-1 pl-[88px]">
              {numberVars.map(v => (
                <button
                  key={v.id}
                  onClick={() => insertVar(v.name)}
                  title={t.variableSetBlock.insertVarTitle(v.name)}
                  className="px-1.5 py-0.5 text-xs rounded bg-slate-700 text-indigo-300 hover:bg-slate-600 font-mono cursor-pointer transition-colors"
                >
                  ${v.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Dynamic mode (strings) — variable + mapping ───────────────────── */}
      {effectiveMode === 'dynamic' && (
        <div className="flex flex-col gap-2 pl-2 border-l-2 border-indigo-800/50">

          {/* Controlling variable */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-20 shrink-0">{t.variableSetBlock.controlVariable}</label>
            <VariablePicker
              value={block.dynamicVariableId ?? ''}
              onChange={id => update({ dynamicVariableId: id })}
              nodes={variableNodes}
              placeholder={t.variableSetBlock.selectControlVariable}
            />
          </div>

          {/* Mapping list */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{t.variableSetBlock.mappingsLabel}</span>
              <button
                className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
                onClick={addDynEntry}
              >
                {t.variableSetBlock.addMapping}
              </button>
            </div>

            {dynMapping.length === 0 && (
              <p className="text-xs text-slate-600 italic">{t.variableSetBlock.noMappings}</p>
            )}

            {dynMapping.map((m, i) => {
              const mt = m.matchType ?? 'exact';
              return (
                <div key={m.id ?? i} className="flex flex-col gap-1.5 border border-slate-700/60 rounded p-1.5">

                  {/* Match type + delete */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-500 shrink-0">{t.variableSetBlock.matchMode}</span>
                    <select
                      className="flex-1 bg-slate-800 text-xs text-white rounded px-1.5 py-0.5 outline-none border border-slate-600 cursor-pointer"
                      value={mt}
                      onChange={e => patchDynEntry(i, { matchType: e.target.value as 'exact' | 'range' })}
                    >
                      <option value="exact">{t.variableSetBlock.matchExact}</option>
                      <option value="range">{t.variableSetBlock.matchRange}</option>
                    </select>
                    <button
                      className="text-slate-600 hover:text-red-400 text-xs cursor-pointer shrink-0 ml-1"
                      onClick={() => removeDynEntry(i)}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Exact value */}
                  {mt === 'exact' && (
                    <div className="flex gap-1 items-center">
                      <span className="text-xs text-slate-500 shrink-0 w-12">{t.variableSetBlock.exactValueLabel}</span>
                      <input
                        className="flex-1 bg-slate-800 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 font-mono"
                        placeholder="0"
                        value={m.value}
                        onFocus={saveSnapshot}
                        onChange={e => patchDynEntry(i, { value: e.target.value })}
                      />
                    </div>
                  )}

                  {/* Range */}
                  {mt === 'range' && (
                    <div className="grid grid-cols-2 gap-1">
                      <div className="flex gap-1 items-center">
                        <span className="text-xs text-slate-500 shrink-0 w-12">{t.variableSetBlock.fromLabel}</span>
                        <input
                          className="flex-1 min-w-0 bg-slate-800 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 font-mono"
                          placeholder="0"
                          value={m.rangeMin ?? ''}
                          onFocus={saveSnapshot}
                          onChange={e => patchDynEntry(i, { rangeMin: e.target.value })}
                        />
                      </div>
                      <div className="flex gap-1 items-center">
                        <span className="text-xs text-slate-500 shrink-0">{t.variableSetBlock.toLabel}</span>
                        <input
                          className="flex-1 min-w-0 bg-slate-800 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 font-mono"
                          placeholder="100"
                          value={m.rangeMax ?? ''}
                          onFocus={saveSnapshot}
                          onChange={e => patchDynEntry(i, { rangeMax: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Result string */}
                  <div className="flex gap-1 items-center">
                    <span className="text-xs text-slate-500 shrink-0 w-12">{t.variableSetBlock.resultLabel}</span>
                    <input
                      className="flex-1 bg-slate-800 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 font-mono"
                      placeholder={t.variableSetBlock.textPlaceholder}
                      value={m.result}
                      onFocus={saveSnapshot}
                      onChange={e => patchDynEntry(i, { result: e.target.value })}
                    />
                  </div>
                </div>
              );
            })}

            {/* Default / fallback */}
            <div className="flex gap-1 items-center mt-0.5">
              <span className="text-xs text-slate-400 shrink-0 w-20">{t.variableSetBlock.defaultLabel}</span>
              <input
                className="flex-1 bg-slate-800 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 font-mono"
                placeholder={t.variableSetBlock.textPlaceholder}
                value={block.dynamicDefault ?? ''}
                onFocus={saveSnapshot}
                onChange={e => update({ dynamicDefault: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Random config — number range or string length ─────────────────── */}
      {/* (not shown for boolean — pills are self-explanatory) */}
      {effectiveMode === 'random' && cfg && cfg.kind !== 'boolean' && (
        <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-indigo-800/50">
          {cfg.kind === 'number' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 w-20 shrink-0">{t.variableSetBlock.randomRange}</label>
              <NumericInput
                className="w-20 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 font-mono"
                placeholder={t.variableSetBlock.fromLabel}
                value={cfg.min}
                onFocus={saveSnapshot}
                onChange={v => updateCfg({ min: v })}
              />
              <span className="text-xs text-slate-500">—</span>
              <NumericInput
                className="w-20 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 font-mono"
                placeholder={t.variableSetBlock.toLabel}
                value={cfg.max}
                onFocus={saveSnapshot}
                onChange={v => updateCfg({ max: v })}
              />
            </div>
          )}
          {cfg.kind === 'string' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 w-20 shrink-0">{t.variableSetBlock.randomLength}</label>
              <NumericInput
                min={1}
                max={256}
                className="w-20 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 font-mono"
                value={cfg.length}
                onFocus={saveSnapshot}
                onChange={v => updateCfg({ length: v })}
              />
              <span className="text-xs text-slate-500">{t.variableSetBlock.randomLengthSuffix}</span>
            </div>
          )}
        </div>
      )}

      {/* ── SugarCube preview ─────────────────────────────────────────────── */}
      {preview && (
        <div className="text-xs text-slate-500 font-mono bg-slate-800/60 px-2 py-1 rounded break-all">
          {preview}
        </div>
      )}
      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => update({ delay: v })}
      />
    </div>
  );
}
