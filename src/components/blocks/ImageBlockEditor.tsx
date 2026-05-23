import { useProjectStore } from '../../store/projectStore';
import type { ImageBlock } from '../../types';
import { toLocalFileUrl, resolveAssetPath } from '../../lib/fsApi';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { VariablePicker } from '../shared/VariablePicker';
import { useVariableNodes } from '../shared/VariableScope';
import { ImageMappingEditor, ImageAssetPicker } from '../shared/ImageMappingEditor';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import NumericInput from '../shared/NumericInput';
import {
  MEDIA_BLOCK_FIELD_SCHEMA,
  MEDIA_BLOCK_RAW_CSS_HELP,
  simpleBlockCascadeClasses,
} from '../../utils/styleCascade';

// ─── Main editor ──────────────────────────────────────────────────────────────

export function ImageBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: ImageBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<ImageBlock>) => void;
}) {
  const project     = useProjectStore(s => s.project);
  const projectDir  = useProjectStore(s => s.projectDir);
  const updateBlock = useProjectStore(s => s.updateBlock);
  const variableNodes = useVariableNodes();
  const update = onUpdate ?? ((p: Partial<ImageBlock>) => updateBlock(sceneId, block.id, p as never));
  const t = useT();
  const mode    = block.mode ?? 'static';
  const mapping = block.mapping ?? [];
  const cascadeClasses = ['tg-image', ...simpleBlockCascadeClasses(block, project.settings)].join(' ');

  function resolvePreviewSrc(src: string): string {
    if (src.startsWith('assets/') && projectDir) {
      return toLocalFileUrl(resolveAssetPath(projectDir, src));
    }
    return src;
  }


  return (
    <div className="flex flex-col gap-2">

      {/* ── Mode selector ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.imageBlock.modeLabel}</label>
        <div className="flex gap-1">
          {([
            ['static', t.imageBlock.modeStatic],
            ['bound',  t.imageBlock.modeBound],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => update({ mode: m })}
              className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
                mode === m
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Static mode ───────────────────────────────────────────────────── */}
      {mode === 'static' && (
        <>
          <div className="flex items-start gap-2">
            <label className="text-xs text-slate-400 w-20 shrink-0 pt-1">{t.imageBlock.urlLabel}</label>
            <ImageAssetPicker
              assetNodes={project.assetNodes}
              value={block.src}
              onChange={src => update({ src })}
              placeholder={t.imageBlock.urlPlaceholder}
            />
          </div>

          {block.src && (
            /* Cascade-wrapped preview — `width` mirrors export's `<img width="X">`
               so border-radius and border-width render in the same proportions
               as the final story. No tailwind size/border classes here — the
               injected cascade CSS owns the visual. */
            <div className={cascadeClasses}>
              <img
                src={resolvePreviewSrc(block.src)}
                alt={block.alt || 'preview'}
                width={block.width > 0 ? block.width : undefined}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
        </>
      )}

      {/* ── Bound mode ────────────────────────────────────────────────────── */}
      {mode === 'bound' && (
        <div className="flex flex-col gap-2 pl-2 border-l-2 border-indigo-800/50">

          {/* Variable selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-20 shrink-0">{t.imageBlock.variableLabel}</label>
            <VariablePicker
              value={block.variableId ?? ''}
              onChange={id => update({ variableId: id })}
              nodes={variableNodes}
              placeholder={t.imageBlock.selectVariable}
            />
          </div>

          <ImageMappingEditor
            mapping={mapping}
            onChange={mapping => update({ mapping })}
            defaultSrc={block.defaultSrc ?? ''}
            onDefaultSrcChange={defaultSrc => update({ defaultSrc })}
            assetNodes={project.assetNodes}
          />
        </div>
      )}

      {/* ── Shared fields (both modes) ─────────────────────────────────────── */}

      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.imageBlock.altLabel}</label>
        <input
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
          placeholder={t.imageBlock.altPlaceholder}
          value={block.alt}
          onChange={e => update({ alt: e.target.value })}
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.imageBlock.widthLabel}</label>
        <NumericInput
          className="w-24 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
          placeholder={t.imageBlock.widthPlaceholder}
          min={0}
          value={block.width || 0}
          onChange={v => update({ width: v })}
        />
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
            fieldsSchema={MEDIA_BLOCK_FIELD_SCHEMA}
            rawCssHelp={MEDIA_BLOCK_RAW_CSS_HELP}
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
