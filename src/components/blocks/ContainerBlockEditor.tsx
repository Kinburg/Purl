import { useProjectStore } from '../../store/projectStore';
import type { ContainerBlock } from '../../types';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';

import { EmojiIcon } from '../shared/EmojiIcons';
interface Props {
  block: ContainerBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<ContainerBlock>) => void;
}

export function ContainerBlockEditor({ block, sceneId, onUpdate }: Props) {
  const t = useT();
  const project     = useProjectStore(s => s.project);
  const updateBlock = useProjectStore(s => s.updateBlock);
  const update = onUpdate ?? ((p: Partial<ContainerBlock>) => updateBlock(sceneId, block.id, p as never));

  const containers = project.containers ?? [];
  const hero = project.characters.find(c => c.isHero);

  const selectedContainer = containers.find(c => c.id === block.containerId);

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      {/* Container picker */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.containers.blockContainerLabel}:</label>
        <select
          className="flex-1 min-w-0 bg-slate-700 text-xs text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
          value={block.containerId}
          onChange={e => update({ containerId: e.target.value })}
        >
          <option value="">{t.containers.blockNoContainer}</option>
          {containers.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Hero info line */}
      {hero ? (
        <div className="text-[10px] text-slate-400 bg-slate-900/50 rounded px-2 py-1">
          Character: <span className="text-amber-400 inline-flex items-center gap-1"><EmojiIcon name="star" size={20} /> {hero.name}</span> ({t.characters.isHero})
        </div>
      ) : (
        <div className="text-[10px] text-amber-500 bg-slate-900/50 rounded px-2 py-1">
          <span className="inline-flex items-center gap-1"><EmojiIcon name="warning" size={20} /> No main hero set</span>
        </div>
      )}

      {/* Optional title */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.containers.blockTitleLabel}:</label>
        <input
          className="flex-1 min-w-0 bg-slate-700 text-xs text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 placeholder-slate-500"
          placeholder={selectedContainer?.name ?? ''}
          value={block.title ?? ''}
          onChange={e => update({ title: e.target.value || undefined })}
        />
      </div>

      {/* Preview hint */}
      {selectedContainer && (
        <div className="text-[10px] text-slate-500 bg-slate-900/50 rounded px-2 py-1 font-mono">
          {`<<tgContainer "${selectedContainer.varName}">>`}
        </div>
      )}

      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={d => update({ delay: d })}
      />
    </div>
  );
}
