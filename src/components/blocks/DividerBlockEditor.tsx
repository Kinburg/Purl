import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import type { DividerBlock } from '../../types';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { useVariableNodes } from '../shared/VariableScope';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import NumericInput from '../shared/NumericInput';
import {
  DIVIDER_FIELD_SCHEMA,
  DIVIDER_RAW_CSS_HELP,
  simpleBlockCascadeClasses,
} from '../../utils/styleCascade';

export function DividerBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: DividerBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<DividerBlock>) => void;
}) {
  const { updateBlock, saveSnapshot, project } = useProjectStore();
  const t = useT();
  const variableNodes = useVariableNodes();
  const update = onUpdate ?? ((p: Partial<DividerBlock>) => updateBlock(sceneId, block.id, p as never));

  const color     = block.color     ?? '#555555';
  const thickness = block.thickness ?? 1;
  const marginV   = block.marginV   ?? 8;

  // Cascade classes — when project defaults / spot override is active, they
  // automatically style the preview <hr> via the globally-injected preview CSS.
  const cascadeClasses = ['tg-divider', ...simpleBlockCascadeClasses(block, project.settings)].join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      {/* Preview — mirrors the exported <hr>: Std comes from inline CSS vars
          (matching `.tg-divider` base rule), Common/Spot from cascade classes. */}
      <hr
        className={cascadeClasses}
        style={{
          // Inline CSS variables (read by the .tg-divider base rule)
          ['--tg-div-color' as any]: color,
          ['--tg-div-thickness' as any]: `${thickness}px`,
          ['--tg-div-margin' as any]: `${marginV}px`,
        }}
      />

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">{t.dividerBlock.colorLabel}</span>
          <input
            type="color"
            value={color}
            onFocus={saveSnapshot}
            onChange={e => update({ color: e.target.value })}
            className="w-7 h-6 rounded cursor-pointer bg-transparent border border-slate-600 p-0.5"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">{t.dividerBlock.thicknessLabel}</span>
          <NumericInput
            min={1}
            step={1}
            value={thickness}
            onFocus={saveSnapshot}
            onChange={v => update({ thickness: v })}
            className="w-14 bg-slate-800 text-slate-200 text-xs rounded px-2 py-0.5 border border-slate-600 outline-none focus:border-indigo-500"
          />
          <span className="text-xs text-slate-500">{t.dividerBlock.thicknessSuffix}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">{t.dividerBlock.marginLabel}</span>
          <NumericInput
            min={0}
            step={1}
            value={marginV}
            onFocus={saveSnapshot}
            onChange={v => update({ marginV: v })}
            className="w-14 bg-slate-800 text-slate-200 text-xs rounded px-2 py-0.5 border border-slate-600 outline-none focus:border-indigo-500"
          />
          <span className="text-xs text-slate-500">{t.dividerBlock.marginSuffix}</span>
        </div>
      </div>

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
            fieldsSchema={DIVIDER_FIELD_SCHEMA}
            rawCssHelp={DIVIDER_RAW_CSS_HELP}
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
