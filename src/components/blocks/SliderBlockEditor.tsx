import { useProjectStore } from '../../store/projectStore';
import type { SliderBlock } from '../../types';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { VariablePicker } from '../shared/VariablePicker';
import { useVariableNodes } from '../shared/VariableScope';
import NumericInput from '../shared/NumericInput';

const INP = 'w-20 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 font-mono';

export function SliderBlockEditor({
  block, sceneId, onUpdate,
}: {
  block: SliderBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<SliderBlock>) => void;
}) {
  const t = useT();
  const sb = t.sliderBlock;
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const variableNodes = useVariableNodes();
  const update = onUpdate ?? ((p: Partial<SliderBlock>) => updateBlock(sceneId, block.id, p));

  return (
    <div className="flex flex-col gap-2.5">
      {/* Label */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{sb.labelField}</label>
        <input
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none"
          placeholder={sb.labelPlaceholder}
          value={block.label ?? ''}
          onFocus={saveSnapshot}
          onChange={e => update({ label: e.target.value })}
        />
      </div>

      {/* Variable */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{sb.variableLabel}</label>
        <VariablePicker
          value={block.variableId}
          onChange={id => update({ variableId: id })}
          nodes={variableNodes}
          placeholder={sb.selectVariable}
          filterType="number"
          className="flex-1 min-w-0"
        />
      </div>

      {/* Range params */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">{sb.min}</span>
          <NumericInput className={INP} value={block.min} onFocus={saveSnapshot} onChange={v => update({ min: v })} />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">{sb.max}</span>
          <NumericInput className={INP} value={block.max} onFocus={saveSnapshot} onChange={v => update({ max: v })} />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">{sb.step}</span>
          <NumericInput className={INP} min={0} value={block.step} onFocus={saveSnapshot} onChange={v => update({ step: v })} />
        </label>
      </div>

      {/* Show value */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" className="accent-indigo-500 cursor-pointer" checked={!!block.showValue}
          onChange={e => update({ showValue: e.target.checked })} />
        <span className="text-xs text-slate-300">{sb.showValue}</span>
      </label>

      {/* Live preview (disabled, illustrative) */}
      <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700 rounded px-2 py-1.5">
        {block.label && <span className="text-xs text-slate-400 shrink-0">{block.label}</span>}
        <input
          type="range"
          min={block.min} max={block.max} step={block.step || 1}
          defaultValue={block.min}
          disabled
          className="flex-1 accent-indigo-500 cursor-default opacity-70"
        />
        {block.showValue && <span className="text-xs text-slate-400 font-mono shrink-0">{block.min}</span>}
      </div>

      <BlockEffectsPanel delay={block.delay} onDelayChange={v => update({ delay: v })} />
    </div>
  );
}
