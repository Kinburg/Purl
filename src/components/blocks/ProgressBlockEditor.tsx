import { useProjectStore } from '../../store/projectStore';
import type { ProgressBlock } from '../../types';
import { useT } from '../../i18n';
import { useVariableNodes } from '../shared/VariableScope';
import { VariablePicker } from '../shared/VariablePicker';
import NumericInput from '../shared/NumericInput';
import { BlockEffectsPanel } from './BlockEffectsPanel';

const INP = 'flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 font-mono';
const SWATCH = 'w-10 h-8 rounded cursor-pointer bg-transparent border border-slate-600';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-slate-400 w-28 shrink-0">{label}</label>
      {children}
    </div>
  );
}

export function ProgressBlockEditor({
  block, sceneId, onUpdate,
}: {
  block: ProgressBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<ProgressBlock>) => void;
}) {
  const t = useT();
  const cm = t.cellModal;
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const variableNodes = useVariableNodes();
  const update = onUpdate ?? ((p: Partial<ProgressBlock>) => updateBlock(sceneId, block.id, p));

  const previewColor = block.colorRange?.from ?? block.color;

  return (
    <div className="flex flex-col gap-2.5">
      <Row label={t.progressBlock.variableLabel}>
        <VariablePicker
          value={block.variableId}
          onChange={id => update({ variableId: id })}
          nodes={variableNodes}
          filterType="number"
          className="flex-1 min-w-0"
        />
      </Row>

      <Row label={cm.maximum}>
        <NumericInput
          min={1}
          className="w-24 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 font-mono"
          value={block.maxValue}
          onFocus={saveSnapshot}
          onChange={v => update({ maxValue: v })}
        />
      </Row>

      <Row label={t.progressBlock.heightLabel}>
        <NumericInput
          min={2} max={200}
          className="w-24 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 font-mono"
          value={block.height ?? 16}
          onFocus={saveSnapshot}
          onChange={v => update({ height: v })}
        />
        <span className="text-xs text-slate-500">px</span>
      </Row>

      {/* Colour range toggle */}
      <Row label={cm.colorRange}>
        <input type="checkbox" className="accent-indigo-500 cursor-pointer"
          checked={!!block.colorRange}
          onChange={e => update({ colorRange: e.target.checked ? { from: block.color, to: block.color } : null })} />
        <span className="text-xs text-slate-500 ml-1">{block.colorRange ? '0% → 100%' : cm.colorRangeOff}</span>
      </Row>

      {block.colorRange ? (
        <>
          <Row label={cm.colorAt0}>
            <input type="color" className={SWATCH}
              value={block.colorRange.from} onChange={e => update({ colorRange: { ...block.colorRange!, from: e.target.value } })} />
            <input className={`${INP} ml-2`}
              value={block.colorRange.from} onChange={e => update({ colorRange: { ...block.colorRange!, from: e.target.value } })} />
          </Row>
          <Row label={cm.colorAt100}>
            <input type="color" className={SWATCH}
              value={block.colorRange.to} onChange={e => update({ colorRange: { ...block.colorRange!, to: e.target.value } })} />
            <input className={`${INP} ml-2`}
              value={block.colorRange.to} onChange={e => update({ colorRange: { ...block.colorRange!, to: e.target.value } })} />
          </Row>
        </>
      ) : (
        <Row label={cm.fillColor}>
          <input type="color" className={SWATCH}
            value={block.color} onChange={e => update({ color: e.target.value })} />
          <input className={`${INP} ml-2`}
            value={block.color} onChange={e => update({ color: e.target.value })} />
        </Row>
      )}

      <Row label={cm.barBgColor}>
        <input type="color" className={SWATCH}
          value={block.emptyColor ?? '#333333'} onChange={e => update({ emptyColor: e.target.value })} />
        <input className={`${INP} ml-2`}
          value={block.emptyColor ?? '#333333'} onChange={e => update({ emptyColor: e.target.value })} />
      </Row>

      <Row label={cm.textColor}>
        <input type="checkbox" className="accent-indigo-500 cursor-pointer"
          checked={!!block.textColor}
          onChange={e => update({ textColor: e.target.checked ? '#ffffff' : '' })} />
        {block.textColor ? (
          <>
            <input type="color" className="w-8 h-7 rounded cursor-pointer bg-transparent border border-slate-600 ml-1"
              value={block.textColor} onChange={e => update({ textColor: e.target.value })} />
            <input className={INP}
              value={block.textColor} onChange={e => update({ textColor: e.target.value })} />
          </>
        ) : (
          <span className="text-xs text-slate-500 italic ml-1">{cm.inherited}</span>
        )}
      </Row>

      <Row label={cm.vertical}>
        <input type="checkbox" className="accent-indigo-500 cursor-pointer"
          checked={!!block.vertical} onChange={e => update({ vertical: e.target.checked })} />
      </Row>

      <Row label={cm.showNumbers}>
        <input type="checkbox" className="accent-indigo-500 cursor-pointer"
          checked={block.showText} onChange={e => update({ showText: e.target.checked })} />
      </Row>

      {/* Live preview */}
      <div className="mt-1">
        <div className="text-[10px] text-slate-500 mb-1">{t.progressBlock.preview}</div>
        {block.vertical ? (
          <div className="rounded overflow-hidden flex flex-col-reverse mx-auto" style={{ background: block.emptyColor ?? '#333', height: Math.min(block.height ?? 16, 80), width: 24 }}>
            <div className="w-full" style={{ height: '60%', background: previewColor }} />
          </div>
        ) : (
          <div className="w-full rounded overflow-hidden" style={{ background: block.emptyColor ?? '#333', height: block.height ?? 16 }}>
            <div className="h-full" style={{ width: '60%', background: previewColor }} />
          </div>
        )}
      </div>

      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => update({ delay: v })}
      />
    </div>
  );
}
