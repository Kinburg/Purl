import { useProjectStore, flattenVariables } from '../../store/projectStore';
import type { InputFieldBlock } from '../../types';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { ArrayAccessorInput } from './ArrayAccessorInput';
import { VariablePicker } from '../shared/VariablePicker';
import { useVariableNodes } from '../shared/VariableScope';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import {
  CONTENT_BLOCK_FIELD_SCHEMA,
  CONTENT_BLOCK_RAW_CSS_HELP,
  simpleBlockCascadeClasses,
} from '../../utils/styleCascade';

// Badge showing the variable type and which SugarCube macro will be used
function MacroBadge({ varType }: { varType: string | undefined }) {
  if (!varType) return null;
  const macro = varType === 'number' ? '<<numberbox>>' : '<<textbox>>';
  const color = varType === 'number'
    ? 'text-amber-400 border-amber-700 bg-amber-900/20'
    : 'text-sky-400 border-sky-700 bg-sky-900/20';
  return (
    <span className={`text-xs font-mono border rounded px-1.5 py-0.5 ${color}`}>
      {macro}
    </span>
  );
}

export function InputFieldBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: InputFieldBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<InputFieldBlock>) => void;
}) {
  const t = useT();
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const project      = useProjectStore(s => s.project);
  const variableNodes = useVariableNodes();
  const update = onUpdate ?? ((p: Partial<InputFieldBlock>) => updateBlock(sceneId, block.id, p));
  const variables = flattenVariables(variableNodes);
  const selectedVar = variables.find(v => v.id === block.variableId);
  const cascadeClasses = ['tg-input-field', ...simpleBlockCascadeClasses(block, project.settings)].join(' ');
  const hasOverride =
    !!project.settings.defaultBlockStyles?.['input-field']?.enabled ||
    !!block.customStyle?.enabled;

  const isNumber  = selectedVar?.varType === 'number';
  const isBoolean = selectedVar?.varType === 'boolean';
  const isArray   = selectedVar?.varType === 'array';

  return (
    <div className="flex flex-col gap-2">

      {/* Label */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-24 shrink-0">{t.inputFieldBlock.labelField}</label>
        <input
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
          placeholder={t.inputFieldBlock.labelPlaceholder}
          value={block.label}
          onFocus={saveSnapshot}
          onChange={e => update({ label: e.target.value })}
        />
      </div>

      {/* Variable selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-24 shrink-0">{t.inputFieldBlock.variableLabel}</label>
        <VariablePicker
          value={block.variableId}
          onChange={id => {
            const v = variables.find(x => x.id === id);
            const leavingArray = isArray && v?.varType !== 'array';
            update({
              variableId: id,
              placeholder: v?.defaultValue ?? '',
              ...(leavingArray ? { accessor: undefined } : {}),
            });
          }}
          nodes={variableNodes}
          placeholder={t.inputFieldBlock.selectVariable}
        />
        {variables.length === 0 && (
          <span className="text-xs text-slate-500 italic">{t.inputFieldBlock.noVariable}</span>
        )}
      </div>

      {/* Array accessor */}
      {isArray && (
        <ArrayAccessorInput
          accessor={block.accessor}
          onChange={acc => update({ accessor: acc })}
          vars={variables}
          allowLength={false}
        />
      )}

      {/* Placeholder / default value */}
      {selectedVar && !isBoolean && !isArray && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-24 shrink-0">
            {isNumber ? t.inputFieldBlock.defaultNumber : t.inputFieldBlock.defaultText}
          </label>
          <input
            type={isNumber ? 'number' : 'text'}
            className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 font-mono"
            placeholder={isNumber ? t.inputFieldBlock.defaultNumberPlaceholder : t.inputFieldBlock.defaultTextPlaceholder}
            value={block.placeholder}
            onFocus={saveSnapshot}
            onChange={e => update({ placeholder: e.target.value })}
          />
        </div>
      )}

      {/* Boolean notice */}
      {isBoolean && (
        <p className="text-xs text-amber-400/80 italic px-1">
          {t.inputFieldBlock.booleanNotSupported}
        </p>
      )}

      {/* Macro preview line */}
      {selectedVar && !isBoolean && !isArray && (
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">{t.inputFieldBlock.generated}</span>
          <MacroBadge varType={selectedVar.varType} />
          <span className="text-xs text-slate-500 font-mono">
            &quot;${selectedVar.name}&quot;
            {isNumber
              ? ` ${block.placeholder || '0'}`
              : ` "${block.placeholder || ''}"`
            }
          </span>
        </div>
      )}
      {/* Live preview — only when an override changes the look. */}
      {hasOverride && (
        <div className="mt-1 pt-1 border-t border-slate-700/40">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Preview</div>
          <div className={cascadeClasses}>
            {block.label && <div>{block.label}</div>}
            <input
              type={selectedVar?.varType === 'number' ? 'number' : 'text'}
              placeholder={block.placeholder || '...'}
              readOnly
              tabIndex={-1}
            />
          </div>
        </div>
      )}

      <details className="border border-slate-700/60 rounded bg-slate-900/30">
        <summary className="text-xs text-slate-300 px-2 py-1.5 cursor-pointer select-none hover:bg-slate-800/50">
          {t.styleOverride.sectionTitle}
        </summary>
        <div className="px-2 pb-2 pt-1">
          <StyleOverrideEditor
            value={block.customStyle}
            onChange={v => update({ customStyle: v })}
            variableNodes={variableNodes}
            allowBound={false}
            fieldsSchema={CONTENT_BLOCK_FIELD_SCHEMA}
            rawCssHelp={CONTENT_BLOCK_RAW_CSS_HELP}
          />
        </div>
      </details>

      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => update({ delay: v })}
      />
    </div>
  );
}
