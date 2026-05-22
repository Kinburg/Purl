import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import type { IncludeBlock } from '../../types';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { usePluginParams, useVariableNodes } from '../shared/VariableScope';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import { CONTENT_BLOCK_FIELD_SCHEMA, CONTENT_BLOCK_RAW_CSS_HELP } from '../../utils/styleCascade';

export function IncludeBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: IncludeBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<IncludeBlock>) => void;
}) {
  const { updateBlock, saveSnapshot, project } = useProjectStore();
  const t = useT();
  const pluginParams = usePluginParams();
  const sceneParams = pluginParams.filter(p => p.kind === 'scene');
  const variableNodes = useVariableNodes();
  const update = onUpdate ?? ((p: Partial<IncludeBlock>) => updateBlock(sceneId, block.id, p as never));

  const inputCls = 'bg-slate-800 text-slate-200 text-xs rounded px-2 py-0.5 border border-slate-600 outline-none focus:border-indigo-500';

  const availableScenes = project.scenes.filter(s => s.id !== sceneId);

  return (
    <div className="flex flex-col gap-2">

      {/* ── Passage name ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 shrink-0">{t.includeBlock.passageLabel}</span>
        <select
          className={`flex-1 ${inputCls} cursor-pointer`}
          value={block.passageName}
          onChange={e => update({ passageName: e.target.value })}
        >
          <option value="">— select —</option>
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
                {availableScenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            </>
          ) : (
            availableScenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
          )}
        </select>
      </div>

      {/* ── Wrapper styling ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">

        {/* Max width */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">{t.includeBlock.maxWidthLabel}</span>
          <input
            type="number"
            min={0}
            step={10}
            value={block.maxWidth ?? 0}
            onFocus={saveSnapshot}
            onChange={e => update({ maxWidth: Math.max(0, parseInt(e.target.value) || 0) })}
            className={`w-16 ${inputCls}`}
          />
          <span className="text-xs text-slate-500">{t.includeBlock.maxWidthSuffix}</span>
        </div>

        {/* Border toggle */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={block.bordered ?? false}
            onChange={e => update({ bordered: e.target.checked })}
            className="accent-indigo-500 cursor-pointer"
          />
          <span className="text-xs text-slate-400">{t.includeBlock.borderedLabel}</span>
        </label>

        {block.bordered && (
          <>
            {/* Border color */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">{t.includeBlock.borderColorLabel}</span>
              <input
                type="color"
                value={block.borderColor ?? '#555555'}
                onFocus={saveSnapshot}
                onChange={e => update({ borderColor: e.target.value })}
                className="w-7 h-6 rounded cursor-pointer bg-transparent border border-slate-600 p-0.5"
              />
            </div>
            {/* Border width */}
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                step={1}
                value={block.borderWidth ?? 1}
                onFocus={saveSnapshot}
                onChange={e => update({ borderWidth: Math.max(1, parseInt(e.target.value) || 1) })}
                className={`w-12 ${inputCls}`}
              />
              <span className="text-xs text-slate-500">{t.includeBlock.thicknessSuffix}</span>
            </div>
            {/* Border radius */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500">r:</span>
              <input
                type="number"
                min={0}
                step={1}
                value={block.borderRadius ?? 0}
                onFocus={saveSnapshot}
                onChange={e => update({ borderRadius: Math.max(0, parseInt(e.target.value) || 0) })}
                className={`w-12 ${inputCls}`}
              />
              <span className="text-xs text-slate-500">{t.includeBlock.radiusSuffix}</span>
            </div>
          </>
        )}

        {/* Padding */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">{t.includeBlock.paddingLabel}</span>
          <input
            type="number"
            min={0}
            step={2}
            value={block.padding ?? 0}
            onFocus={saveSnapshot}
            onChange={e => update({ padding: Math.max(0, parseInt(e.target.value) || 0) })}
            className={`w-12 ${inputCls}`}
          />
          <span className="text-xs text-slate-500">{t.includeBlock.paddingSuffix}</span>
        </div>

        {/* Background color */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!block.bgColor}
            onChange={e => update({ bgColor: e.target.checked ? '#1e293b' : undefined })}
            className="accent-indigo-500 cursor-pointer"
          />
          <span className="text-xs text-slate-400">{t.includeBlock.bgColorLabel}</span>
        </label>
        {block.bgColor && (
          <input
            type="color"
            value={block.bgColor}
            onFocus={saveSnapshot}
            onChange={e => update({ bgColor: e.target.value })}
            className="w-7 h-6 rounded cursor-pointer bg-transparent border border-slate-600 p-0.5"
          />
        )}
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
