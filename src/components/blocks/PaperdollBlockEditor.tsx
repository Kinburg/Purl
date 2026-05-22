import { useProjectStore } from '../../store/projectStore';
import type { PaperdollBlock } from '../../types';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';

export function PaperdollBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: PaperdollBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<PaperdollBlock>) => void;
}) {
  const project     = useProjectStore(s => s.project);
  const updateBlock = useProjectStore(s => s.updateBlock);
  const update = onUpdate ?? ((p: Partial<PaperdollBlock>) => updateBlock(sceneId, block.id, p as never));
  const t = useT();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-28 shrink-0">{t.cellModal.paperdollCharLabel}:</label>
        <select
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
          value={block.charId}
          onChange={e => update({ charId: e.target.value })}
        >
          <option value="">{t.cellModal.paperdollNoChar}</option>
          {project.characters.map(ch => (
            <option key={ch.id} value={ch.id}>
              {ch.name}{ch.paperdoll ? ` (${ch.paperdoll.slots.length})` : ''}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={block.showLabels ?? false}
          onChange={e => update({ showLabels: e.target.checked })}
          className="accent-indigo-500"
        />
        {t.cellModal.paperdollShowLabels}
      </label>
      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => update({ delay: v })}
      />
    </div>
  );
}
