import { useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useFlatAssets } from '../../hooks/useFlatVariables';
import { useAudioBlobUrl } from '../../hooks/useAudioBlobUrl';
import type { AudioBlock } from '../../types';
import { useT } from '../../i18n';
import NumericInput from '../shared/NumericInput';

export function AudioBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: AudioBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<AudioBlock>) => void;
}) {
  const projectDir  = useProjectStore(s => s.projectDir);
  const updateBlock = useProjectStore(s => s.updateBlock);
  const update = onUpdate ?? ((p: Partial<AudioBlock>) => updateBlock(sceneId, block.id, p as never));
  const t = useT();
  const allAssets = useFlatAssets();
  const audioAssets = useMemo(() => allAssets.filter(a => a.assetType === 'audio'), [allAssets]);
  // Read local assets as `blob:` URLs (localfile:// doesn't stream audio).
  // External http(s):// URLs pass through unchanged.
  const previewSrc = useAudioBlobUrl(block.src, projectDir);

  return (
    <div className="flex flex-col gap-2">
      {/* Asset picker */}
      {audioAssets.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-20 shrink-0">{t.audioBlock.assetLabel}</label>
          <select
            className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
            value=""
            onChange={e => {
              const asset = audioAssets.find(a => a.id === e.target.value);
              if (asset) update({ src: asset.relativePath });
            }}
          >
            <option value="">{t.audioBlock.selectAsset}</option>
            {audioAssets.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Manual URL / path */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.audioBlock.urlLabel}</label>
        <input
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 min-w-0"
          placeholder={t.audioBlock.urlPlaceholder}
          value={block.src}
          onChange={e => update({ src: e.target.value })}
        />
      </div>

      {/* Trigger */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.audioBlock.triggerLabel}</label>
        <div className="flex items-center gap-3">
          {(['immediate', 'delay'] as const).map(tr => (
            <label key={tr} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                className="accent-indigo-500"
                name={`trigger-${block.id}`}
                checked={block.trigger === tr}
                onChange={() => update({ trigger: tr })}
              />
              <span className="text-xs text-slate-300">
                {tr === 'immediate' ? t.audioBlock.triggerImmediate : t.audioBlock.triggerDelay}
              </span>
            </label>
          ))}
          {block.trigger === 'delay' && (
            <div className="flex items-center gap-1">
              <NumericInput
                className="w-16 bg-slate-800 text-sm text-white rounded px-2 py-0.5 outline-none border border-slate-600 focus:border-indigo-500"
                min={0}
                step={0.5}
                float
                value={block.triggerDelay ?? 0}
                onChange={v => update({ triggerDelay: v })}
              />
              <span className="text-xs text-slate-500">{t.audioBlock.seconds}</span>
            </div>
          )}
        </div>
      </div>

      {/* On leave behavior */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.audioBlock.onLeaveLabel}</label>
        <div className="flex items-center gap-3">
          {(['stop', 'persist'] as const).map(b => (
            <label key={b} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                className="accent-indigo-500"
                name={`onleave-${block.id}`}
                checked={block.onLeave === b}
                onChange={() => update({ onLeave: b })}
              />
              <span className="text-xs text-slate-300">
                {b === 'stop' ? t.audioBlock.onLeaveStop : t.audioBlock.onLeavePersist}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Checkboxes: loop + stopOthers */}
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="accent-indigo-500"
            checked={block.loop}
            onChange={e => update({ loop: e.target.checked })}
          />
          <span className="text-xs text-slate-300">{t.audioBlock.loop}</span>
        </label>
        <div className="flex flex-col gap-0.5">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="accent-indigo-500"
              checked={block.stopOthers}
              onChange={e => update({ stopOthers: e.target.checked })}
            />
            <span className="text-xs text-slate-300">{t.audioBlock.stopOthers}</span>
          </label>
          {block.stopOthers && (
            <p className="text-xs text-slate-500 ml-5">{t.audioBlock.stopOthersHint}</p>
          )}
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.audioBlock.volumeLabel}</label>
        <input
          type="range"
          min="0"
          max="100"
          value={block.volume}
          onChange={e => update({ volume: parseInt(e.target.value) })}
          className="flex-1 accent-indigo-500"
        />
        <span className="text-xs text-slate-400 w-10 text-right">{block.volume}%</span>
      </div>


      {/* Preview — controls always visible; src fills in once bytes are loaded */}
      {block.src && (
        <audio
          src={previewSrc ?? undefined}
          controls
          className="w-full"
        />
      )}
    </div>
  );
}
