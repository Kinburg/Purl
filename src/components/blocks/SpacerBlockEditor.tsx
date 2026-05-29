import { useProjectStore } from '../../store/projectStore';
import type { SpacerBlock } from '../../types';
import { useT } from '../../i18n';
import NumericInput from '../shared/NumericInput';

export function SpacerBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: SpacerBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<SpacerBlock>) => void;
}) {
  const t = useT();
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const update = onUpdate ?? ((p: Partial<SpacerBlock>) => updateBlock(sceneId, block.id, p));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-24 shrink-0">{t.spacerBlock.heightLabel}</label>
        <NumericInput
          value={block.size}
          min={0}
          max={500}
          onFocus={saveSnapshot}
          onChange={v => update({ size: v })}
          className="w-24 bg-slate-800 text-xs text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none text-right"
        />
        <span className="text-xs text-slate-500">px</span>
      </div>
      {/* Live preview of the gap */}
      <div className="bg-slate-800/40 border border-dashed border-slate-700 rounded overflow-hidden">
        <div style={{ height: Math.min(block.size, 200) }} className="bg-indigo-500/10" />
      </div>
    </div>
  );
}
