import { useProjectStore } from '../../store/projectStore';
import type { SelectBlock, SelectOption } from '../../types';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { VariablePicker } from '../shared/VariablePicker';
import { useVariableNodes } from '../shared/VariableScope';

export function SelectBlockEditor({
  block, sceneId, onUpdate,
}: {
  block: SelectBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<SelectBlock>) => void;
}) {
  const t = useT();
  const sb = t.selectBlock;
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const variableNodes = useVariableNodes();
  const patch = onUpdate ?? ((p: Partial<SelectBlock>) => updateBlock(sceneId, block.id, p));

  const patchOption = (id: string, p: Partial<SelectOption>) =>
    patch({ options: block.options.map(o => o.id === id ? { ...o, ...p } : o) });
  const addOption = () =>
    patch({ options: [...block.options, { id: crypto.randomUUID(), label: '', value: '' }] });
  const removeOption = (id: string) =>
    patch({ options: block.options.filter(o => o.id !== id) });

  return (
    <div className="flex flex-col gap-3">
      {/* Label */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-24 shrink-0">{sb.labelField}</label>
        <input
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none"
          placeholder={sb.labelPlaceholder}
          value={block.label ?? ''}
          onFocus={saveSnapshot}
          onChange={e => patch({ label: e.target.value })}
        />
      </div>

      {/* Variable */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-24 shrink-0">{sb.variableLabel}</label>
        <VariablePicker
          value={block.variableId}
          onChange={id => patch({ variableId: id })}
          nodes={variableNodes}
          placeholder={sb.selectVariable}
          filterType="string"
        />
      </div>

      {/* Options */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{sb.optionsTitle}</span>
          <button className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer" onClick={addOption}>
            {sb.addOption}
          </button>
        </div>

        {block.options.length === 0 && (
          <div className="text-xs text-slate-500 italic px-1">{sb.noOptions}</div>
        )}

        {block.options.map(opt => (
          <div key={opt.id} className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5">
            <input
              className="flex-1 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 focus:border-indigo-500 outline-none"
              placeholder={sb.optionLabelPlaceholder}
              value={opt.label}
              onFocus={saveSnapshot}
              onChange={e => patchOption(opt.id, { label: e.target.value })}
            />
            <input
              className="w-28 bg-slate-800 text-xs text-white rounded px-1.5 py-1 border border-slate-600 focus:border-indigo-500 outline-none font-mono"
              placeholder={sb.optionValuePlaceholder}
              value={opt.value}
              onFocus={saveSnapshot}
              onChange={e => patchOption(opt.id, { value: e.target.value })}
            />
            <button
              className="text-slate-600 hover:text-red-400 transition-colors text-sm cursor-pointer shrink-0"
              title={sb.deleteOption}
              onClick={() => removeOption(opt.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <BlockEffectsPanel delay={block.delay} onDelayChange={v => patch({ delay: v })} />
    </div>
  );
}
