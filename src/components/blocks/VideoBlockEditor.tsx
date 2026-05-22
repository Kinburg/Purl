import { useEffect, useState } from 'react';
import { useProjectStore, flattenAssets } from '../../store/projectStore';
import type { VideoBlock } from '../../types';
import { toLocalFileUrl, resolveAssetPath } from '../../lib/fsApi';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { useVariableNodes } from '../shared/VariableScope';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import NumericInput from '../shared/NumericInput';
import {
  MEDIA_BLOCK_FIELD_SCHEMA,
  MEDIA_BLOCK_RAW_CSS_HELP,
  simpleBlockCascadeClasses,
} from '../../utils/styleCascade';

export function VideoBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: VideoBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<VideoBlock>) => void;
}) {
  const project     = useProjectStore(s => s.project);
  const projectDir  = useProjectStore(s => s.projectDir);
  const updateBlock = useProjectStore(s => s.updateBlock);
  const variableNodes = useVariableNodes();
  const update = onUpdate ?? ((p: Partial<VideoBlock>) => updateBlock(sceneId, block.id, p as never));
  const t = useT();
  const videoAssets = flattenAssets(project.assetNodes).filter(a => a.assetType === 'video');
  const cascadeClasses = ['tg-video', ...simpleBlockCascadeClasses(block, project.settings)].join(' ');
  const hasOverride =
    !!project.settings.defaultBlockStyles?.video?.enabled ||
    !!block.customStyle?.enabled;

  // Track only *real* load failure (MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED = 4).
  // Transient errors (decode hiccups, network blips) used to imperatively set
  // `display: none` and kill the preview forever — guard against that.
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => { setLoadFailed(false); }, [block.src]);

  /**
   * Resolve a src string to a URL suitable for <video> preview in the editor.
   * - If src starts with "assets/", it's a project-relative path → use localfile://
   * - Otherwise treat as-is (external URL, etc.)
   */
  function resolvePreviewSrc(src: string): string {
    if (src.startsWith('assets/') && projectDir) {
      return toLocalFileUrl(resolveAssetPath(projectDir, src));
    }
    return src;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Asset picker */}
      {videoAssets.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-20 shrink-0">{t.videoBlock.assetLabel}</label>
          <select
            className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
            value=""
            onChange={e => {
              const asset = videoAssets.find(a => a.id === e.target.value);
              if (asset) {
                // Store the relative path as src so export uses it directly
                update({ src: asset.relativePath });
              }
            }}
          >
            <option value="">{t.videoBlock.selectAsset}</option>
            {videoAssets.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Manual URL / path entry */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.videoBlock.urlLabel}</label>
        <input
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
          placeholder={t.videoBlock.urlPlaceholder}
          value={block.src}
          onChange={e => update({ src: e.target.value })}
        />
      </div>

      {/* Width */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.videoBlock.widthLabel}</label>
        <NumericInput
          className="w-24 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
          placeholder={t.videoBlock.widthPlaceholder}
          min={0}
          value={block.width || 0}
          onChange={v => update({ width: v })}
        />
      </div>

      {/* Playback options */}
      <div className="flex items-center gap-4">
        {[
          { key: 'controls', label: t.videoBlock.controls },
          { key: 'autoplay', label: t.videoBlock.autoplay },
          { key: 'loop',     label: t.videoBlock.loop },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="accent-indigo-500"
              checked={block[key as keyof VideoBlock] as boolean}
              onChange={e => update({ [key]: e.target.checked })}
            />
            <span className="text-xs text-slate-300">{label}</span>
          </label>
        ))}
      </div>

      {/* Preview — cascade-wrapped, mirrors export's <div class="tg-video"><video/></div>.
          `width` mirrors export's `<video width="X">` so border-radius/border-width
          render in the same proportions as the final story. No tailwind size/border
          classes — the injected cascade CSS owns the visual.

          When the source isn't set but a style override is active, show an empty
          <video> as placeholder so the user can iterate on frame styling without
          having to load a clip first. */}
      {(block.src || hasOverride) && (
        <div className={cascadeClasses}>
          {block.src && !loadFailed ? (
            <video
              key={block.src}
              src={resolvePreviewSrc(block.src)}
              controls
              width={block.width > 0 ? block.width : undefined}
              onError={e => {
                // Only treat MEDIA_ERR_SRC_NOT_SUPPORTED (4) as a real failure
                // and switch to the placeholder. Other codes (network blips,
                // decode hiccups) are transient — let the element recover.
                const err = (e.target as HTMLVideoElement).error;
                if (err && err.code === 4) setLoadFailed(true);
              }}
            />
          ) : (
            <video
              controls
              width={block.width > 0 ? block.width : 240}
              style={{ background: '#1a1a1a', minHeight: 80 }}
            />
          )}
        </div>
      )}

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
