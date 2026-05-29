import { useProjectStore } from '../../store/projectStore';
import type { AudioVolumeBlock } from '../../types';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';

export function AudioVolumeBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: AudioVolumeBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<AudioVolumeBlock>) => void;
}) {
  const t = useT();
  const updateBlock = useProjectStore(s => s.updateBlock);
  const update = onUpdate ?? ((p: Partial<AudioVolumeBlock>) => updateBlock(sceneId, block.id, p));

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="accent-indigo-500 cursor-pointer"
          checked={block.showMuteButton}
          onChange={e => update({ showMuteButton: e.target.checked })}
        />
        <span className="text-xs text-slate-300">{t.cellModal.audioVolumeMuteButton}</span>
      </label>

      {/* Static preview of the rendered control */}
      <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700 rounded px-2 py-1.5">
        {block.showMuteButton && (
          <svg viewBox="0 0 24 24" width="16" height="16" className="text-slate-300 shrink-0" fill="none">
            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
            <path d="M16 9a4 4 0 010 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={70}
          disabled
          className="flex-1 accent-indigo-500 cursor-default opacity-70"
        />
      </div>

      <BlockEffectsPanel delay={block.delay} onDelayChange={v => update({ delay: v })} />
    </div>
  );
}
