import { useProjectStore } from '../../store/projectStore';
import type { TimeManipulationBlock } from '../../types';
import { useT } from '../../i18n';
import { VariablePicker } from '../shared/VariablePicker';
import { useVariableNodes } from '../shared/VariableScope';
import NumericInput from '../shared/NumericInput';

export function TimeManipulationBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: TimeManipulationBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<TimeManipulationBlock>) => void;
}) {
  const t = useT();
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const variableNodes = useVariableNodes();
  const update = onUpdate ?? ((p: Partial<TimeManipulationBlock>) => updateBlock(sceneId, block.id, p as never));

  const fields = [
    { id: 'years',   label: t.timeManipulationBlock.years },
    { id: 'months',  label: t.timeManipulationBlock.months },
    { id: 'days',    label: t.timeManipulationBlock.days },
    { id: 'hours',   label: t.timeManipulationBlock.hours },
    { id: 'minutes', label: t.timeManipulationBlock.minutes },
  ] as const;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.timeManipulationBlock.variableLabel}</label>
        <VariablePicker
          value={block.variableId}
          onChange={id => update({ variableId: id })}
          nodes={variableNodes}
          filter={v => v.varType === 'datetime'}
        />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {fields.map(f => (
          <div key={f.id} className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase text-center truncate" title={f.label}>{f.label}</label>
            <NumericInput
              className="bg-slate-800 text-sm text-white rounded px-1 py-1 outline-none border border-slate-600 focus:border-indigo-500 text-center"
              value={block[f.id] || 0}
              onFocus={saveSnapshot}
              onChange={v => update({ [f.id]: v })}
            />
          </div>
        ))}
      </div>

    </div>
  );
}
