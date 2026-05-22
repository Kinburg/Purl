import { useProjectStore } from '../../store/projectStore';
import type { PopupBlock } from '../../types';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { useVariableNodes } from '../shared/VariableScope';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import {
  POPUP_FIELD_SCHEMA,
  POPUP_RAW_CSS_HELP,
  simpleBlockCascadeClasses,
} from '../../utils/styleCascade';

export function PopupBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: PopupBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<PopupBlock>) => void;
}) {
  const t = useT();
  const project     = useProjectStore(s => s.project);
  const updateBlock = useProjectStore(s => s.updateBlock);
  const variableNodes = useVariableNodes();
  const update = onUpdate ?? ((p: Partial<PopupBlock>) => updateBlock(sceneId, block.id, p));

  const popupScenes = project.scenes.filter(
    s => s.id !== sceneId && s.tags.includes('popup'),
  );

  // Cascade classes for the mini preview. We use the same `tg-popup-spot-*` /
  // `tg-popup-default*` classes as export, plus `id="ui-dialog"` so the rules
  // scoped to `#ui-dialog.scope` actually match in the editor too.
  const cascadeClasses = simpleBlockCascadeClasses(block, project.settings).join(' ');
  const hasOverride =
    !!project.settings.defaultBlockStyles?.popup?.enabled ||
    !!block.customStyle?.enabled;
  const targetScene = popupScenes.find(s => s.id === block.targetSceneId);
  const previewTitle = block.title?.trim() || targetScene?.name || 'Popup';

  return (
    <div className="flex flex-col gap-3">
      {/* Popup scene + title */}
      <div className="flex flex-col gap-2 bg-slate-800/50 border border-slate-700 rounded p-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-24 shrink-0">{t.popupBlock.sceneLabel}</label>
          {popupScenes.length === 0 ? (
            <span className="text-xs text-slate-500 italic">{t.popupBlock.noPopupScenes}</span>
          ) : (
            <select
              className="flex-1 bg-slate-800 text-xs text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none cursor-pointer"
              value={block.targetSceneId}
              onChange={e => update({ targetSceneId: e.target.value })}
            >
              <option value="">— select —</option>
              {popupScenes.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-24 shrink-0">{t.popupBlock.titleLabel}</label>
          <input
            className="flex-1 bg-slate-800 text-xs text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none"
            placeholder={t.popupBlock.titlePlaceholder}
            value={block.title ?? ''}
            onChange={e => update({ title: e.target.value })}
          />
        </div>
      </div>

      {/* Live preview — mini dialog mockup so the user can see the cascade
          styling applied. The `id="ui-dialog"` matches the export's runtime
          frame, so injected preview CSS (`#ui-dialog.tg-popup-*` rules) lights
          up here. Body content is intentionally a placeholder — that area is
          filled by the popup-scene's own blocks at runtime. */}
      {hasOverride && (
        <div className="mt-1 pt-1 border-t border-slate-700/40">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Preview</div>
          <div
            id="ui-dialog"
            className={cascadeClasses}
            style={{ display: 'block', position: 'static', maxWidth: '100%' }}
          >
            <div id="ui-dialog-titlebar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
              <h1 id="ui-dialog-title" style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                {previewTitle}
              </h1>
              <button id="ui-dialog-close" type="button" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'default' }}>
                ✕
              </button>
            </div>
            <div id="ui-dialog-body" style={{ minHeight: 48, padding: '12px', fontSize: '11px', opacity: 0.55, fontStyle: 'italic' }}>
              {targetScene
                ? `(content from popup-scene "${targetScene.name}")`
                : '(content from the chosen popup-scene)'}
            </div>
          </div>
        </div>
      )}

      {/* Spot-level dialog style override — applies to SugarCube #ui-dialog
          when this popup opens. Static only (bound is at project-defaults level). */}
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
            fieldsSchema={POPUP_FIELD_SCHEMA}
            rawCssHelp={POPUP_RAW_CSS_HELP}
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
