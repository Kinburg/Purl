import { useProjectStore } from '../../store/projectStore';
import type { RadioBlock, RadioOption } from '../../types';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { VariablePicker } from '../shared/VariablePicker';
import { useVariableNodes } from '../shared/VariableScope';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import {
  CONTENT_BLOCK_FIELD_SCHEMA,
  CONTENT_BLOCK_RAW_CSS_HELP,
  simpleBlockCascadeClasses,
} from '../../utils/styleCascade';

export function RadioBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: RadioBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<RadioBlock>) => void;
}) {
  const t = useT();
  const { updateBlock, saveSnapshot, project } = useProjectStore();
  const variableNodes = useVariableNodes();
  const patch = onUpdate ?? ((p: Partial<RadioBlock>) => updateBlock(sceneId, block.id, p));
  const cascadeClasses = ['tg-radio', ...simpleBlockCascadeClasses(block, project.settings)].join(' ');
  const hasOverride =
    !!project.settings.defaultBlockStyles?.radio?.enabled ||
    !!block.customStyle?.enabled;

  const patchOption = (optId: string, p: Partial<RadioOption>) =>
    patch({ options: block.options.map(o => o.id === optId ? { ...o, ...p } : o) });

  const addOption = () =>
    patch({
      options: [
        ...block.options,
        { id: crypto.randomUUID(), label: '', value: '' },
      ],
    });

  const removeOption = (optId: string) =>
    patch({ options: block.options.filter(o => o.id !== optId) });

  return (
    <div className="flex flex-col gap-3">

      {/* Group label */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-24 shrink-0">{t.radioBlock.labelField}</label>
        <input
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none"
          placeholder={t.radioBlock.labelPlaceholder}
          value={block.label ?? ''}
          onFocus={saveSnapshot}
          onChange={e => patch({ label: e.target.value })}
        />
      </div>

      {/* Variable selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-24 shrink-0">{t.radioBlock.variableLabel}</label>
        <VariablePicker
          value={block.variableId}
          onChange={id => patch({ variableId: id })}
          nodes={variableNodes}
          placeholder={t.radioBlock.selectVariable}
          filterType="string"
        />
      </div>

      {/* Options */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Options</span>
          <button
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
            onClick={addOption}
          >
            {t.radioBlock.addOption}
          </button>
        </div>

        {block.options.length === 0 && (
          <div className="text-xs text-slate-500 italic px-1">{t.radioBlock.noOptions}</div>
        )}

        {block.options.map(opt => (
          <div key={opt.id} className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5">
            {/* Radio label */}
            <input
              className="flex-1 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 focus:border-indigo-500 outline-none"
              placeholder={t.radioBlock.optionLabelPlaceholder}
              value={opt.label}
              onFocus={saveSnapshot}
              onChange={e => patchOption(opt.id, { label: e.target.value })}
            />

            {/* Value */}
            <input
              className="w-28 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 focus:border-indigo-500 outline-none font-mono"
              placeholder={t.radioBlock.optionValuePlaceholder}
              value={opt.value}
              onFocus={saveSnapshot}
              onChange={e => patchOption(opt.id, { value: e.target.value })}
            />

            <button
              className="text-slate-600 hover:text-red-400 transition-colors text-sm cursor-pointer shrink-0"
              title={t.radioBlock.deleteOption}
              onClick={() => removeOption(opt.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Live preview — only when an override changes the look. */}
      {hasOverride && block.options.length > 0 && (
        <div className="mt-1 pt-1 border-t border-slate-700/40">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Preview</div>
          <div className={cascadeClasses}>
            {block.label && <div>{block.label}</div>}
            {block.options.slice(0, 3).map((opt, i) => (
              <div key={opt.id}>
                <input type="radio" name={`prv_${block.id}`} id={`prv_${block.id}_${i}`} defaultChecked={i === 0} />
                {' '}
                <label htmlFor={`prv_${block.id}_${i}`}>{opt.label}</label>
              </div>
            ))}
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
            onChange={v => patch({ customStyle: v })}
            variableNodes={variableNodes}
            allowBound={false}
            fieldsSchema={CONTENT_BLOCK_FIELD_SCHEMA}
            rawCssHelp={CONTENT_BLOCK_RAW_CSS_HELP}
          />
        </div>
      </details>

      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => patch({ delay: v })}
      />
    </div>
  );
}
